-- ROLLBACK for migration 013 (MFA factor policy). TEST BRANCHES ONLY.
-- DESTRUCTIVE: removes approvals, bootstrap codes, tenant MFA policy and the
-- 013 columns. Never run automatically and never on production without an
-- explicit owner decision. After rollback every management action is impossible
-- again (the original CHECK NOT independent_factor is restored): fail-closed.
-- Preferred recovery on Neon is point-in-time restore of the test branch; this
-- script exists for when the restore window (6 h) has passed.
BEGIN;
DELETE FROM rf_webauthn_grants; -- grants are short-lived (5 min); required to restore the old CHECK
DROP TRIGGER rf_webauthn_grants_independence ON rf_webauthn_grants;
CREATE OR REPLACE FUNCTION public.rf_revoke_member_session(
 p_target_staff uuid,p_session uuid,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_subject text;v_org uuid;v_session uuid;v_actor uuid;v_target text;v_id uuid;
BEGIN
 v_subject:=nullif(current_setting('app.subject',true),'');
 v_org:=nullif(current_setting('app.organization_id',true),'')::uuid;
 v_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 IF v_subject IS NULL OR v_org IS NULL OR v_session IS NULL OR
    length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT s.id INTO v_actor FROM public.rf_staff s WHERE s.organization_id=v_org
  AND s.identity_subject=v_subject AND s.active AND s.role='owner' LIMIT 1;
 IF v_actor IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.rf_webauthn_grants g WHERE g.identity_subject=v_subject AND
   g.organization_id=v_org AND g.session_id=v_session AND g.independent_factor AND g.expires_at>now()
 ) OR EXISTS(
   SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=v_org AND d.identity_subject=v_subject
   AND (d.session_id=v_session OR (d.session_id IS NULL AND d.revoked_at >=
      nullif(current_setting('app.session_created_at',true),'')::timestamptz))
 ) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT s.identity_subject INTO v_target FROM public.rf_staff s
 WHERE s.organization_id=v_org AND s.id=p_target_staff AND s.active LIMIT 1;
 IF v_target IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_session_denials(organization_id,identity_subject,session_id,actor_id,reason)
 VALUES(v_org,v_target,p_session,v_actor,p_reason) RETURNING id INTO v_id;
 INSERT INTO public.rf_security_events(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_subject,v_session,v_org,'session.revoked',jsonb_build_object('targetStaff',p_target_staff,'targetSession',p_session,'denialId',v_id));
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.rf_issue_member_invitation(p_branch uuid,p_email text,p_role text,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_org uuid;v_subject text;v_session uuid;v_actor uuid;v_id uuid;
BEGIN
 v_org:=nullif(current_setting('app.organization_id',true),'')::uuid;
 v_subject:=nullif(current_setting('app.subject',true),'');
 v_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 IF v_org IS NULL OR v_subject IS NULL OR v_session IS NULL OR
    p_email IS NULL OR p_email<>lower(trim(p_email)) OR length(p_email) NOT BETWEEN 3 AND 254 OR
    p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' OR p_role NOT IN ('manager','technician','sales') OR
    p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT id INTO v_actor FROM public.rf_staff WHERE organization_id=v_org AND identity_subject=v_subject AND active AND role='owner' LIMIT 1;
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.rf_branches WHERE organization_id=v_org AND id=p_branch) OR
 NOT EXISTS(SELECT 1 FROM public.rf_webauthn_grants g WHERE g.identity_subject=v_subject AND g.session_id=v_session
  AND g.organization_id=v_org AND g.independent_factor AND g.expires_at>now()) OR
 EXISTS(SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=v_org AND d.identity_subject=v_subject
  AND (d.session_id=v_session OR (d.session_id IS NULL AND d.revoked_at>=nullif(current_setting('app.session_created_at',true),'')::timestamptz)))
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_member_invitations(organization_id,branch_id,email,role,token_hash,invited_by)
 VALUES(v_org,p_branch,p_email,p_role,p_hash,v_actor) RETURNING id INTO v_id;
 INSERT INTO public.rf_security_events(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_subject,v_session,v_org,'invitation.issued',jsonb_build_object('id',v_id,'branch',p_branch,'role',p_role));
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.rf_revoke_member_invitation(p_id uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_org uuid;v_subject text;v_session uuid;v_actor uuid;
BEGIN
 v_org:=nullif(current_setting('app.organization_id',true),'')::uuid;
 v_subject:=nullif(current_setting('app.subject',true),'');
 v_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 IF v_org IS NULL OR v_subject IS NULL OR v_session IS NULL OR length(trim(coalesce(p_reason,'')))<10 THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT id INTO v_actor FROM public.rf_staff WHERE organization_id=v_org AND identity_subject=v_subject AND active AND role='owner' LIMIT 1;
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.rf_webauthn_grants g WHERE g.identity_subject=v_subject AND g.session_id=v_session
 AND g.organization_id=v_org AND g.independent_factor AND g.expires_at>now()) OR
 EXISTS(SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=v_org AND d.identity_subject=v_subject
 AND (d.session_id=v_session OR (d.session_id IS NULL AND d.revoked_at>=nullif(current_setting('app.session_created_at',true),'')::timestamptz)))
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_member_invitations SET revoked_at=now() WHERE id=p_id AND organization_id=v_org AND accepted_at IS NULL AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_security_events(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_subject,v_session,v_org,'invitation.revoked',jsonb_build_object('id',p_id,'reason',p_reason));
 RETURN true;
END $$;
DROP FUNCTION public.rf_set_security_policy(boolean), public.rf_member_security_overview(), public.rf_own_security_status(),
 public.rf_block_own_credential(text,text), public.rf_revoke_own_credential(text,text), public.rf_revoke_member_credential(uuid,text,text),
 public.rf_approve_member_credential(uuid,text), public.rf_approve_own_credential_by_step_up(text), public.rf_redeem_mfa_bootstrap(text),
 public.rf_security_audit(text,jsonb), public.rf_staff_in_context(text[]), public.rf_consume_step_up(text),
 public.rf_record_webauthn_assertion(uuid,text,boolean,boolean), public.rf_security_context(), public.rf_webauthn_grant_guard();
ALTER TABLE rf_webauthn_grants DROP CONSTRAINT rf_webauthn_independent_requires_proof,
 DROP COLUMN purpose, DROP COLUMN consumed_at, DROP COLUMN user_verified, DROP COLUMN backed_up, DROP COLUMN challenge_id;
ALTER TABLE rf_webauthn_grants ADD CONSTRAINT rf_webauthn_no_unproven_factor CHECK (NOT independent_factor);
ALTER TABLE rf_webauthn_challenges DROP COLUMN purpose, DROP COLUMN grant_issued_at;
DROP TABLE rf_organization_security_policy, rf_mfa_bootstrap_codes, rf_webauthn_approvals;
DROP FUNCTION public.rf_credential_fingerprint(text);
ALTER TABLE rf_webauthn_credentials DROP COLUMN aaguid, DROP COLUMN attestation_format, DROP COLUMN user_verified,
 DROP COLUMN backed_up_last, DROP COLUMN blocked_at, DROP COLUMN block_reason;
REVOKE ALL ON rf_webauthn_credentials, rf_webauthn_challenges, rf_webauthn_grants FROM rf_runtime_login;
GRANT SELECT,INSERT,UPDATE ON rf_webauthn_credentials, rf_webauthn_challenges, rf_webauthn_grants TO rf_runtime_login;
COMMIT;
