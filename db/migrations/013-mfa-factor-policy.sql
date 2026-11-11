-- PHIXAR P0 phase 2 — owner-approved MFA policy "option A" (verified passkeys and
-- FIDO2 security keys; hardware keys not required). Additive and data-preserving.
--
-- A WebAuthn grant is an INDEPENDENT second factor only when the DATABASE can prove:
--  1. user verification (UV) was required and reported for the assertion;
--  2. the grant comes from a consumed authentication challenge of the same subject,
--     session and tenant, with a declared purpose, and is single-use;
--  3. the credential belongs to the subject and is neither revoked nor blocked;
--  4. the credential holds an ACTIVE APPROVAL for this tenant, obtained through an
--     enrollment path that does not rely on the primary (Neon Auth) session alone:
--       bootstrap  – one-time out-of-band operator code (owner DB role only),
--       admin      – another owner with an independent step-up + fingerprint check,
--       step_up    – step-up with an already approved key of the same subject;
--  5. the tenant's synced-passkey policy is satisfied.
-- The former row CHECK (NOT independent_factor) is replaced IN THIS TRANSACTION by a
-- stricter row CHECK plus a guard trigger, and the runtime loses every direct write
-- path to grants. Existing credentials stay unapproved (pending): fail-closed.
BEGIN;

-- 1. Credential provenance and lifecycle (column-level write privileges below).
ALTER TABLE rf_webauthn_credentials
 ADD COLUMN aaguid uuid,
 ADD COLUMN attestation_format text CHECK(attestation_format IS NULL OR length(attestation_format) BETWEEN 1 AND 32),
 ADD COLUMN user_verified boolean NOT NULL DEFAULT false,
 ADD COLUMN backed_up_last boolean,
 ADD COLUMN blocked_at timestamptz,
 ADD COLUMN block_reason text CHECK(block_reason IS NULL OR length(block_reason) BETWEEN 3 AND 500);

CREATE FUNCTION public.rf_credential_fingerprint(p_credential text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT upper(substr(encode(sha256(convert_to(p_credential,'UTF8')),'hex'),1,4)||'-'||substr(encode(sha256(convert_to(p_credential,'UTF8')),'hex'),5,4));
$$;
GRANT EXECUTE ON FUNCTION public.rf_credential_fingerprint(text) TO rf_runtime_login;

-- 2. Per-tenant approvals. Runtime may read its own; only definer functions write.
CREATE TABLE rf_webauthn_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 credential_id text NOT NULL REFERENCES rf_webauthn_credentials(credential_id),
 identity_subject text NOT NULL,
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 method text NOT NULL CHECK(method IN ('bootstrap','admin','step_up')),
 approved_by_subject text NOT NULL,
 approved_by_staff uuid,
 reference uuid,
 approved_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by_subject text,
 revoke_reason text,
 CHECK(method<>'admin' OR (approved_by_staff IS NOT NULL AND approved_by_subject<>identity_subject)),
 CHECK(revoked_at IS NULL OR (revoked_by_subject IS NOT NULL AND length(trim(coalesce(revoke_reason,'')))>=3))
);
CREATE UNIQUE INDEX rf_webauthn_approvals_active ON rf_webauthn_approvals(credential_id,organization_id) WHERE revoked_at IS NULL;
ALTER TABLE rf_webauthn_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_webauthn_approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_webauthn_approvals FROM PUBLIC,rf_runtime,rf_runtime_login;
GRANT SELECT ON rf_webauthn_approvals TO rf_runtime_login;
CREATE POLICY rf_webauthn_approvals_self ON rf_webauthn_approvals FOR SELECT TO rf_runtime_login
 USING(identity_subject=current_setting('app.subject',true) AND organization_id::text=current_setting('app.organization_id',true));

-- 3. One-time out-of-band bootstrap / recovery codes. Created only with the owner
-- role (scripts/mfa-bootstrap-code.js). The runtime has NO privileges at all.
CREATE TABLE rf_mfa_bootstrap_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 identity_subject text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('bootstrap','recovery')),
 code_hash text NOT NULL UNIQUE CHECK(code_hash ~ '^[0-9a-f]{64}$'),
 created_by text NOT NULL CHECK(length(trim(created_by)) BETWEEN 3 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 failed_attempts int NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),
 used_at timestamptz,
 used_session uuid,
 used_credential text,
 invalidated_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes')
);
ALTER TABLE rf_mfa_bootstrap_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_mfa_bootstrap_codes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_mfa_bootstrap_codes FROM PUBLIC,rf_runtime,rf_runtime_login;

-- 4. Tenant MFA policy. Option A: synced passkeys allowed by default.
CREATE TABLE rf_organization_security_policy (
 organization_id uuid PRIMARY KEY REFERENCES rf_organizations(id),
 allow_synced_passkeys boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by_subject text
);
ALTER TABLE rf_organization_security_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_organization_security_policy FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_organization_security_policy FROM PUBLIC,rf_runtime,rf_runtime_login;
GRANT SELECT ON rf_organization_security_policy TO rf_runtime_login;
CREATE POLICY rf_organization_security_policy_read ON rf_organization_security_policy FOR SELECT TO rf_runtime_login
 USING(organization_id::text=current_setting('app.organization_id',true));

-- 5. Challenges carry a declared purpose; a challenge yields at most one grant.
ALTER TABLE rf_webauthn_challenges
 ADD COLUMN purpose text NOT NULL DEFAULT 'credential.activate'
  CHECK(purpose IN ('credential.activate','credential.manage','credential.approve','session.revoke','invitation.manage','policy.manage')),
 ADD COLUMN grant_issued_at timestamptz;

-- 6. Grants: purpose-bound, single-use, UV-proven, challenge-linked.
ALTER TABLE rf_webauthn_grants
 ADD COLUMN purpose text CHECK(purpose IS NULL OR purpose IN ('credential.activate','credential.manage','credential.approve','session.revoke','invitation.manage','policy.manage')),
 ADD COLUMN consumed_at timestamptz,
 ADD COLUMN user_verified boolean NOT NULL DEFAULT false,
 ADD COLUMN backed_up boolean,
 ADD COLUMN challenge_id uuid REFERENCES rf_webauthn_challenges(id);
ALTER TABLE rf_webauthn_grants ADD CONSTRAINT rf_webauthn_independent_requires_proof
 CHECK(NOT independent_factor OR (user_verified AND purpose IS NOT NULL AND purpose<>'credential.activate' AND challenge_id IS NOT NULL AND backed_up IS NOT NULL));

CREATE FUNCTION public.rf_webauthn_grant_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_allow_synced boolean;
BEGIN
 IF NOT NEW.independent_factor THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rf_webauthn_credentials c WHERE c.credential_id=NEW.credential_id
   AND c.identity_subject=NEW.identity_subject AND c.revoked_at IS NULL AND c.blocked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=NEW.credential_id
   AND a.identity_subject=NEW.identity_subject AND a.organization_id=NEW.organization_id AND a.revoked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.rf_webauthn_challenges ch WHERE ch.id=NEW.challenge_id
   AND ch.identity_subject=NEW.identity_subject AND ch.session_id=NEW.session_id AND ch.organization_id=NEW.organization_id
   AND ch.ceremony='authentication' AND ch.consumed_at IS NOT NULL AND ch.purpose=NEW.purpose)
 THEN RAISE EXCEPTION 'INDEPENDENT_FACTOR_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT p.allow_synced_passkeys INTO v_allow_synced FROM public.rf_organization_security_policy p WHERE p.organization_id=NEW.organization_id;
 IF NEW.backed_up AND NOT coalesce(v_allow_synced,true) THEN
  RAISE EXCEPTION 'INDEPENDENT_FACTOR_UNPROVEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rf_webauthn_grant_guard() FROM PUBLIC;
CREATE TRIGGER rf_webauthn_grants_independence BEFORE INSERT OR UPDATE ON rf_webauthn_grants
 FOR EACH ROW EXECUTE FUNCTION public.rf_webauthn_grant_guard();
-- Replaced (same transaction) by rf_webauthn_independent_requires_proof + guard trigger.
ALTER TABLE rf_webauthn_grants DROP CONSTRAINT rf_webauthn_no_unproven_factor;
UPDATE rf_webauthn_grants g SET consumed_at=now() WHERE g.consumed_at IS NULL; -- pre-013 grants carry no proof

-- 7. Column-level runtime privileges: no self-unblock, no grant forging, no challenge reuse.
REVOKE INSERT,UPDATE ON rf_webauthn_grants FROM rf_runtime_login;
REVOKE INSERT,UPDATE ON rf_webauthn_credentials FROM rf_runtime_login;
GRANT INSERT(credential_id,identity_subject,public_key,sign_count,device_type,backed_up,transports,aaguid,attestation_format,user_verified)
 ON rf_webauthn_credentials TO rf_runtime_login;
GRANT UPDATE(sign_count,last_used_at,backed_up_last) ON rf_webauthn_credentials TO rf_runtime_login;
REVOKE INSERT,UPDATE ON rf_webauthn_challenges FROM rf_runtime_login;
GRANT INSERT(identity_subject,session_id,organization_id,challenge_hash,ceremony,origin,rp_id,purpose) ON rf_webauthn_challenges TO rf_runtime_login;
GRANT UPDATE(consumed_at) ON rf_webauthn_challenges TO rf_runtime_login;

-- Shared session context check for all definer functions below.
CREATE FUNCTION public.rf_security_context(OUT o_subject text,OUT o_session uuid,OUT o_org uuid,OUT o_created timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
BEGIN
 o_subject:=nullif(current_setting('app.subject',true),'');
 o_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 o_org:=nullif(current_setting('app.organization_id',true),'')::uuid;
 o_created:=nullif(current_setting('app.session_created_at',true),'')::timestamptz;
 IF o_subject IS NULL OR o_session IS NULL OR o_org IS NULL OR o_created IS NULL OR EXISTS(
  SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=o_org AND d.identity_subject=o_subject
  AND (d.session_id=o_session OR (d.session_id IS NULL AND d.revoked_at>=o_created)))
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.rf_security_context() FROM PUBLIC;

-- 8. The ONLY way to create a grant: after the app verified the assertion and
-- consumed the challenge in this transaction. Independence is computed here.
CREATE FUNCTION public.rf_record_webauthn_assertion(p_challenge uuid,p_credential text,p_user_verified boolean,p_backed_up boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_purpose text;v_independent boolean;v_allow boolean;v_expires timestamptz;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 SELECT ch.purpose INTO v_purpose FROM public.rf_webauthn_challenges ch WHERE ch.id=p_challenge
  AND ch.identity_subject=v_ctx.o_subject AND ch.session_id=v_ctx.o_session AND ch.organization_id=v_ctx.o_org
  AND ch.ceremony='authentication' AND ch.consumed_at IS NOT NULL AND ch.consumed_at>now()-interval '60 seconds'
  AND ch.grant_issued_at IS NULL FOR UPDATE;
 IF v_purpose IS NULL OR p_user_verified IS NOT TRUE OR p_backed_up IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.rf_webauthn_credentials c WHERE c.credential_id=p_credential AND c.identity_subject=v_ctx.o_subject
  AND c.revoked_at IS NULL AND c.blocked_at IS NULL)
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_challenges ch SET grant_issued_at=now() WHERE ch.id=p_challenge;
 SELECT p.allow_synced_passkeys INTO v_allow FROM public.rf_organization_security_policy p WHERE p.organization_id=v_ctx.o_org;
 v_independent:=v_purpose<>'credential.activate' AND (coalesce(v_allow,true) OR NOT p_backed_up) AND EXISTS(
  SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=p_credential AND a.identity_subject=v_ctx.o_subject
  AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL);
 v_expires:=now()+interval '5 minutes';
 INSERT INTO public.rf_webauthn_grants AS g(identity_subject,session_id,organization_id,credential_id,verified_at,expires_at,independent_factor,purpose,consumed_at,user_verified,backed_up,challenge_id)
 VALUES(v_ctx.o_subject,v_ctx.o_session,v_ctx.o_org,p_credential,now(),v_expires,v_independent,v_purpose,NULL,true,p_backed_up,p_challenge)
 ON CONFLICT(identity_subject,session_id,organization_id) DO UPDATE SET credential_id=EXCLUDED.credential_id,verified_at=EXCLUDED.verified_at,
  expires_at=EXCLUDED.expires_at,independent_factor=EXCLUDED.independent_factor,purpose=EXCLUDED.purpose,consumed_at=NULL,
  user_verified=EXCLUDED.user_verified,backed_up=EXCLUDED.backed_up,challenge_id=EXCLUDED.challenge_id;
 INSERT INTO public.rf_security_events AS e(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_ctx.o_subject,v_ctx.o_session,v_ctx.o_org,'webauthn.verified',jsonb_build_object('purpose',v_purpose,'independentFactor',v_independent,'backedUp',p_backed_up,
  'fingerprint',public.rf_credential_fingerprint(p_credential)));
 RETURN jsonb_build_object('independentFactor',v_independent,'purpose',v_purpose,'expiresAt',v_expires);
END $$;
REVOKE ALL ON FUNCTION public.rf_record_webauthn_assertion(uuid,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_record_webauthn_assertion(uuid,text,boolean,boolean) TO rf_runtime_login;

-- 9. Atomic single-use step-up consumption for a declared purpose (internal).
CREATE FUNCTION public.rf_consume_step_up(p_purpose text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_credential text;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 UPDATE public.rf_webauthn_grants g SET consumed_at=now()
 WHERE g.identity_subject=v_ctx.o_subject AND g.session_id=v_ctx.o_session AND g.organization_id=v_ctx.o_org
  AND g.independent_factor AND g.purpose=p_purpose AND g.consumed_at IS NULL AND g.expires_at>now()
  AND EXISTS(SELECT 1 FROM public.rf_webauthn_credentials c WHERE c.credential_id=g.credential_id AND c.revoked_at IS NULL AND c.blocked_at IS NULL)
  AND EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=g.credential_id AND a.organization_id=g.organization_id AND a.revoked_at IS NULL)
 RETURNING g.credential_id INTO v_credential;
 IF v_credential IS NULL THEN RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN v_credential;
END $$;
REVOKE ALL ON FUNCTION public.rf_consume_step_up(text) FROM PUBLIC;

CREATE FUNCTION public.rf_staff_in_context(p_roles text[]) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_staff uuid;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 SELECT s.id INTO v_staff FROM public.rf_staff s WHERE s.organization_id=v_ctx.o_org AND s.identity_subject=v_ctx.o_subject
  AND s.active AND s.role=ANY(p_roles) LIMIT 1;
 IF v_staff IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN v_staff;
END $$;
REVOKE ALL ON FUNCTION public.rf_staff_in_context(text[]) FROM PUBLIC;

CREATE FUNCTION public.rf_security_audit(p_action text,p_detail jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO public.rf_security_events(identity_subject,session_id,organization_id,action,detail)
 SELECT c.o_subject,c.o_session,c.o_org,p_action,p_detail FROM public.rf_security_context() c;
$$;
REVOKE ALL ON FUNCTION public.rf_security_audit(text,jsonb) FROM PUBLIC;

-- 10. Bootstrap / recovery redemption: proof of possession of the NEW key in this
-- session (credential.activate grant) + out-of-band one-time code.
CREATE FUNCTION public.rf_redeem_mfa_bootstrap(p_code_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_staff uuid;v_grant record;v_code record;v_approval uuid;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 v_staff:=public.rf_staff_in_context(ARRAY['owner','manager']);
 IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT g.credential_id,g.challenge_id INTO v_grant FROM public.rf_webauthn_grants g
  WHERE g.identity_subject=v_ctx.o_subject AND g.session_id=v_ctx.o_session AND g.organization_id=v_ctx.o_org
  AND g.purpose='credential.activate' AND g.user_verified AND g.consumed_at IS NULL AND g.expires_at>now() FOR UPDATE;
 IF v_grant.credential_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.rf_webauthn_credentials c WHERE c.credential_id=v_grant.credential_id
   AND c.identity_subject=v_ctx.o_subject AND c.revoked_at IS NULL AND c.blocked_at IS NULL)
  OR EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=v_grant.credential_id AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'STEP_UP_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_grants g SET consumed_at=now() WHERE g.identity_subject=v_ctx.o_subject AND g.session_id=v_ctx.o_session AND g.organization_id=v_ctx.o_org;
 SELECT b.id,b.purpose INTO v_code FROM public.rf_mfa_bootstrap_codes b WHERE b.organization_id=v_ctx.o_org AND b.identity_subject=v_ctx.o_subject
  AND b.code_hash=p_code_hash AND b.used_at IS NULL AND b.invalidated_at IS NULL AND b.expires_at>now() AND b.failed_attempts<5 FOR UPDATE;
 IF v_code.id IS NULL THEN
  UPDATE public.rf_mfa_bootstrap_codes b SET failed_attempts=b.failed_attempts+1,
   invalidated_at=CASE WHEN b.failed_attempts+1>=5 THEN now() ELSE b.invalidated_at END
  WHERE b.organization_id=v_ctx.o_org AND b.identity_subject=v_ctx.o_subject AND b.used_at IS NULL AND b.invalidated_at IS NULL AND b.expires_at>now();
  PERFORM public.rf_security_audit('mfa.bootstrap.rejected',jsonb_build_object('fingerprint',public.rf_credential_fingerprint(v_grant.credential_id)));
  RETURN jsonb_build_object('activated',false);
 END IF;
 UPDATE public.rf_mfa_bootstrap_codes b SET used_at=now(),used_session=v_ctx.o_session,used_credential=v_grant.credential_id WHERE b.id=v_code.id;
 INSERT INTO public.rf_webauthn_approvals AS a(credential_id,identity_subject,organization_id,method,approved_by_subject,approved_by_staff,reference)
 VALUES(v_grant.credential_id,v_ctx.o_subject,v_ctx.o_org,'bootstrap','operator:'||v_code.id::text,NULL,v_code.id) RETURNING a.id INTO v_approval;
 PERFORM public.rf_security_audit('mfa.bootstrap.redeemed',jsonb_build_object('codeId',v_code.id,'purpose',v_code.purpose,'approvalId',v_approval,
  'fingerprint',public.rf_credential_fingerprint(v_grant.credential_id)));
 RETURN jsonb_build_object('activated',true,'approvalId',v_approval,'fingerprint',public.rf_credential_fingerprint(v_grant.credential_id));
END $$;
REVOKE ALL ON FUNCTION public.rf_redeem_mfa_bootstrap(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_redeem_mfa_bootstrap(text) TO rf_runtime_login;

-- 11. Additional own key after step-up with an approved key (consumes credential.manage).
CREATE FUNCTION public.rf_approve_own_credential_by_step_up(p_credential text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_by text;v_id uuid;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 PERFORM public.rf_staff_in_context(ARRAY['owner','manager']);
 v_by:=public.rf_consume_step_up('credential.manage');
 IF v_by=p_credential OR NOT EXISTS(SELECT 1 FROM public.rf_webauthn_credentials c WHERE c.credential_id=p_credential AND c.identity_subject=v_ctx.o_subject
   AND c.revoked_at IS NULL AND c.blocked_at IS NULL AND c.created_at>now()-interval '10 minutes')
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_webauthn_approvals AS a(credential_id,identity_subject,organization_id,method,approved_by_subject,approved_by_staff,reference)
 VALUES(p_credential,v_ctx.o_subject,v_ctx.o_org,'step_up',v_ctx.o_subject,NULL,NULL) RETURNING a.id INTO v_id;
 PERFORM public.rf_security_audit('webauthn.approved',jsonb_build_object('method','step_up','approvalId',v_id,
  'fingerprint',public.rf_credential_fingerprint(p_credential),'byFingerprint',public.rf_credential_fingerprint(v_by)));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.rf_approve_own_credential_by_step_up(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_approve_own_credential_by_step_up(text) TO rf_runtime_login;

-- 12. Owner approves ANOTHER member's pending key after in-person fingerprint check.
CREATE FUNCTION public.rf_approve_member_credential(p_target_staff uuid,p_fingerprint text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_actor uuid;v_target text;v_credential text;v_matches int;v_id uuid;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 v_actor:=public.rf_staff_in_context(ARRAY['owner']);
 IF p_fingerprint IS NULL OR upper(p_fingerprint) !~ '^[0-9A-F]{4}-[0-9A-F]{4}$' THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT s.identity_subject INTO v_target FROM public.rf_staff s WHERE s.organization_id=v_ctx.o_org AND s.id=p_target_staff
  AND s.active AND s.role IN ('owner','manager');
 IF v_target IS NULL OR v_target=v_ctx.o_subject THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT count(*),min(c.credential_id) INTO v_matches,v_credential FROM public.rf_webauthn_credentials c
  WHERE c.identity_subject=v_target AND c.revoked_at IS NULL AND c.blocked_at IS NULL
  AND public.rf_credential_fingerprint(c.credential_id)=upper(p_fingerprint)
  AND NOT EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=c.credential_id AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL);
 IF v_matches<>1 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('credential.approve');
 INSERT INTO public.rf_webauthn_approvals AS a(credential_id,identity_subject,organization_id,method,approved_by_subject,approved_by_staff)
 VALUES(v_credential,v_target,v_ctx.o_org,'admin',v_ctx.o_subject,v_actor) RETURNING a.id INTO v_id;
 PERFORM public.rf_security_audit('webauthn.approved',jsonb_build_object('method','admin','approvalId',v_id,'targetStaff',p_target_staff,'fingerprint',upper(p_fingerprint)));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.rf_approve_member_credential(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_approve_member_credential(uuid,text) TO rf_runtime_login;

-- 13. Owner removes the approval of a member key in THIS tenant (lost/compromised).
CREATE FUNCTION public.rf_revoke_member_credential(p_target_staff uuid,p_fingerprint text,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_target text;v_n integer;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 PERFORM public.rf_staff_in_context(ARRAY['owner']);
 IF length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT s.identity_subject INTO v_target FROM public.rf_staff s WHERE s.organization_id=v_ctx.o_org AND s.id=p_target_staff;
 IF v_target IS NULL OR v_target=v_ctx.o_subject THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('credential.approve');
 UPDATE public.rf_webauthn_approvals a SET revoked_at=now(),revoked_by_subject=v_ctx.o_subject,revoke_reason=p_reason
 WHERE a.identity_subject=v_target AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL
  AND public.rf_credential_fingerprint(a.credential_id)=upper(p_fingerprint);
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_security_audit('webauthn.approval_revoked',jsonb_build_object('targetStaff',p_target_staff,'fingerprint',upper(p_fingerprint),'reason',p_reason));
 RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.rf_revoke_member_credential(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_revoke_member_credential(uuid,text,text) TO rf_runtime_login;

-- 14. Own key: deliberate removal requires step-up with an approved key.
CREATE FUNCTION public.rf_revoke_own_credential(p_fingerprint text,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_credential text;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 PERFORM public.rf_staff_in_context(ARRAY['owner','manager']);
 IF length(trim(coalesce(p_reason,'')))<3 OR length(p_reason)>500 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('credential.manage');
 UPDATE public.rf_webauthn_credentials c SET revoked_at=now() WHERE c.identity_subject=v_ctx.o_subject AND c.revoked_at IS NULL
  AND public.rf_credential_fingerprint(c.credential_id)=upper(p_fingerprint) RETURNING c.credential_id INTO v_credential;
 IF v_credential IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_approvals a SET revoked_at=now(),revoked_by_subject=v_ctx.o_subject,revoke_reason=p_reason
  WHERE a.credential_id=v_credential AND a.revoked_at IS NULL;
 PERFORM public.rf_security_audit('webauthn.revoked',jsonb_build_object('fingerprint',upper(p_fingerprint),'reason',p_reason));
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.rf_revoke_own_credential(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_revoke_own_credential(text,text) TO rf_runtime_login;

-- 15. Lost/stolen key "panic button": only REDUCES access. Requires a primary login
-- of at most 10 minutes; blocks the key everywhere, removes all its approvals and
-- ends every session of this subject in the tenant (including the current one).
CREATE FUNCTION public.rf_block_own_credential(p_fingerprint text,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_staff uuid;v_credential text;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 v_staff:=public.rf_staff_in_context(ARRAY['owner','manager']);
 IF v_ctx.o_created<now()-interval '10 minutes' OR length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN
  RAISE EXCEPTION 'RECENT_LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_credentials c SET blocked_at=now(),block_reason=p_reason WHERE c.identity_subject=v_ctx.o_subject
  AND c.revoked_at IS NULL AND c.blocked_at IS NULL AND public.rf_credential_fingerprint(c.credential_id)=upper(p_fingerprint)
  RETURNING c.credential_id INTO v_credential;
 IF v_credential IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_approvals a SET revoked_at=now(),revoked_by_subject=v_ctx.o_subject,revoke_reason='blocked: '||p_reason
  WHERE a.credential_id=v_credential AND a.revoked_at IS NULL;
 PERFORM public.rf_security_audit('webauthn.blocked',jsonb_build_object('fingerprint',upper(p_fingerprint),'reason',p_reason));
 INSERT INTO public.rf_session_denials(organization_id,identity_subject,session_id,actor_id,reason)
 VALUES(v_ctx.o_org,v_ctx.o_subject,NULL,v_staff,'security key blocked: '||p_reason);
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.rf_block_own_credential(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_block_own_credential(text,text) TO rf_runtime_login;

-- 16. Read models (no step-up required; owners see member keys of their tenant only).
CREATE FUNCTION public.rf_own_security_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 PERFORM public.rf_staff_in_context(ARRAY['owner','manager']);
 RETURN jsonb_build_object(
  'allowSyncedPasskeys',coalesce((SELECT p.allow_synced_passkeys FROM public.rf_organization_security_policy p WHERE p.organization_id=v_ctx.o_org),true),
  'credentials',coalesce((SELECT jsonb_agg(jsonb_build_object('fingerprint',public.rf_credential_fingerprint(c.credential_id),
    'deviceType',c.device_type,'synced',(c.device_type='multiDevice' OR c.backed_up OR coalesce(c.backed_up_last,false)),'createdAt',c.created_at,'lastUsedAt',c.last_used_at,
    'state',CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked' WHEN c.blocked_at IS NOT NULL THEN 'blocked'
     WHEN EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=c.credential_id AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL) THEN 'active'
     ELSE 'pending' END,
    'approvalMethod',(SELECT a.method FROM public.rf_webauthn_approvals a WHERE a.credential_id=c.credential_id AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL))
    ORDER BY c.created_at) FROM public.rf_webauthn_credentials c WHERE c.identity_subject=v_ctx.o_subject),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.rf_own_security_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_own_security_status() TO rf_runtime_login;

CREATE FUNCTION public.rf_member_security_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 PERFORM public.rf_staff_in_context(ARRAY['owner']);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('staffId',s.id,'name',s.display_name,'role',s.role,
  'credentials',coalesce((SELECT jsonb_agg(jsonb_build_object('fingerprint',public.rf_credential_fingerprint(c.credential_id),'deviceType',c.device_type,
    'synced',(c.device_type='multiDevice' OR c.backed_up),'createdAt',c.created_at,
    'state',CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked' WHEN c.blocked_at IS NOT NULL THEN 'blocked'
     WHEN EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a WHERE a.credential_id=c.credential_id AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL) THEN 'active'
     ELSE 'pending' END) ORDER BY c.created_at)
   FROM public.rf_webauthn_credentials c WHERE c.identity_subject=s.identity_subject),'[]'::jsonb)) ORDER BY s.display_name)
  FROM public.rf_staff s WHERE s.organization_id=v_ctx.o_org AND s.active AND s.role IN ('owner','manager')),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.rf_member_security_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_member_security_overview() TO rf_runtime_login;

CREATE FUNCTION public.rf_set_security_policy(p_allow_synced boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 PERFORM public.rf_staff_in_context(ARRAY['owner']);
 IF p_allow_synced IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('policy.manage');
 INSERT INTO public.rf_organization_security_policy AS p(organization_id,allow_synced_passkeys,updated_at,updated_by_subject)
 VALUES(v_ctx.o_org,p_allow_synced,now(),v_ctx.o_subject)
 ON CONFLICT(organization_id) DO UPDATE SET allow_synced_passkeys=EXCLUDED.allow_synced_passkeys,updated_at=now(),updated_by_subject=EXCLUDED.updated_by_subject;
 PERFORM public.rf_security_audit('mfa.policy.updated',jsonb_build_object('allowSyncedPasskeys',p_allow_synced));
 RETURN p_allow_synced;
END $$;
REVOKE ALL ON FUNCTION public.rf_set_security_policy(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_set_security_policy(boolean) TO rf_runtime_login;

-- 17. Existing management functions: same checks, but now an independent,
-- purpose-bound, SINGLE-USE step-up is consumed atomically.
CREATE OR REPLACE FUNCTION public.rf_revoke_member_session(p_target_staff uuid,p_session uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_actor uuid;v_target text;v_id uuid;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 IF length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_actor:=public.rf_staff_in_context(ARRAY['owner']);
 SELECT s.identity_subject INTO v_target FROM public.rf_staff s WHERE s.organization_id=v_ctx.o_org AND s.id=p_target_staff AND s.active LIMIT 1;
 IF v_target IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('session.revoke');
 INSERT INTO public.rf_session_denials AS d(organization_id,identity_subject,session_id,actor_id,reason)
 VALUES(v_ctx.o_org,v_target,p_session,v_actor,p_reason) RETURNING d.id INTO v_id;
 PERFORM public.rf_security_audit('session.revoked',jsonb_build_object('targetStaff',p_target_staff,'targetSession',p_session,'denialId',v_id));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rf_issue_member_invitation(p_branch uuid,p_email text,p_role text,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_actor uuid;v_id uuid;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 IF p_email IS NULL OR p_email<>lower(trim(p_email)) OR length(p_email) NOT BETWEEN 3 AND 254 OR
    p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' OR p_role NOT IN ('manager','technician','sales') OR
    p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_actor:=public.rf_staff_in_context(ARRAY['owner']);
 IF NOT EXISTS(SELECT 1 FROM public.rf_branches b WHERE b.organization_id=v_ctx.o_org AND b.id=p_branch) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('invitation.manage');
 INSERT INTO public.rf_member_invitations AS i(organization_id,branch_id,email,role,token_hash,invited_by)
 VALUES(v_ctx.o_org,p_branch,p_email,p_role,p_hash,v_actor) RETURNING i.id INTO v_id;
 PERFORM public.rf_security_audit('invitation.issued',jsonb_build_object('id',v_id,'branch',p_branch,'role',p_role));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rf_revoke_member_invitation(p_id uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_staff_in_context(ARRAY['owner']);
 IF NOT EXISTS(SELECT 1 FROM public.rf_member_invitations i WHERE i.id=p_id AND i.organization_id=v_ctx.o_org AND i.accepted_at IS NULL AND i.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM public.rf_consume_step_up('invitation.manage');
 UPDATE public.rf_member_invitations i SET revoked_at=now() WHERE i.id=p_id AND i.organization_id=v_ctx.o_org AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
 PERFORM public.rf_security_audit('invitation.revoked',jsonb_build_object('id',p_id,'reason',p_reason));
 RETURN true;
END $$;
COMMIT;
