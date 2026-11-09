-- Pending invitations never convey access. All activation uses an exact Neon
-- Auth subject with a verified mailbox; no matching solely by email.
BEGIN;
CREATE TABLE rf_member_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
 role text NOT NULL CHECK(role IN ('manager','technician','sales')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 invited_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '48 hours'),
 accepted_at timestamptz,
 accepted_subject text,
 revoked_at timestamptz,
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,invited_by) REFERENCES rf_staff(organization_id,id),
 CHECK (accepted_at IS NULL OR (accepted_subject IS NOT NULL AND revoked_at IS NULL))
);
CREATE INDEX rf_member_invitations_pending ON rf_member_invitations(organization_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE rf_member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_member_invitations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_member_invitations FROM PUBLIC,rf_runtime,rf_runtime_login;
-- The definer checks an attested, independent step-up. This is impossible to
-- satisfy in migration 009, so invitations cannot be issued yet.
CREATE FUNCTION public.rf_issue_member_invitation(p_branch uuid,p_email text,p_role text,p_hash text)
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
CREATE OR REPLACE FUNCTION public.rf_accept_member_invitation(p_hash text)
RETURNS TABLE(organization_id uuid,branch_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_subject text;v_session uuid;v_user record;v_inv public.rf_member_invitations%ROWTYPE;v_member uuid;v_staff uuid;
BEGIN
 v_subject:=nullif(current_setting('app.subject',true),'');
 v_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 IF v_subject IS NULL OR v_session IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT u.id,u.email,u.name,u."emailVerified",u.banned INTO v_user FROM neon_auth."user" u WHERE u.id::text=v_subject;
 IF NOT FOUND OR v_user."emailVerified" IS NOT TRUE OR v_user.banned IS TRUE THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_inv FROM public.rf_member_invitations i WHERE i.token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at<=now() OR
    v_inv.email<>lower(v_user.email) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rf_staff s WHERE s.id=v_inv.invited_by AND s.organization_id=v_inv.organization_id AND s.active AND s.role='owner') OR
 EXISTS(SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=v_inv.organization_id AND d.identity_subject=v_subject
 AND (d.session_id=v_session OR (d.session_id IS NULL AND d.revoked_at>=nullif(current_setting('app.session_created_at',true),'')::timestamptz)))
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- Conflicting or deactivated records must never be reactivated by an invite.
 SELECT id INTO v_staff FROM public.rf_staff WHERE organization_id=v_inv.organization_id AND identity_subject=v_subject;
 IF v_staff IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rf_staff WHERE id=v_staff AND active AND role=v_inv.role) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF v_staff IS NULL THEN
  INSERT INTO public.rf_staff(organization_id,branch_id,identity_subject,display_name,role,active)
  VALUES(v_inv.organization_id,v_inv.branch_id,v_subject,coalesce(nullif(trim(v_user.name),''),v_user.email),v_inv.role,true)
  RETURNING id INTO v_staff;
 END IF;
 SELECT id INTO v_member FROM public.rf_organization_memberships m WHERE m.organization_id=v_inv.organization_id AND m.identity_subject=v_subject;
 IF v_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rf_organization_memberships m WHERE m.id=v_member AND m.active AND m.base_role=v_inv.role) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF v_member IS NULL THEN
  INSERT INTO public.rf_organization_memberships(organization_id,identity_subject,base_role,active,activated_at)
  VALUES(v_inv.organization_id,v_subject,v_inv.role,true,now()) RETURNING id INTO v_member;
 END IF;
 IF EXISTS(SELECT 1 FROM public.rf_branch_memberships b WHERE b.organization_id=v_inv.organization_id AND b.membership_id=v_member AND b.branch_id=v_inv.branch_id) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_branch_memberships(organization_id,branch_id,membership_id,active)
 VALUES(v_inv.organization_id,v_inv.branch_id,v_member,true);
 UPDATE public.rf_member_invitations SET accepted_at=now(),accepted_subject=v_subject WHERE id=v_inv.id;
 INSERT INTO public.rf_security_events(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_subject,v_session,v_inv.organization_id,'invitation.accepted',jsonb_build_object('id',v_inv.id,'branch',v_inv.branch_id,'role',v_inv.role));
 organization_id:=v_inv.organization_id;branch_id:=v_inv.branch_id;RETURN NEXT;
END $$;
CREATE FUNCTION public.rf_revoke_member_invitation(p_id uuid,p_reason text)
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
CREATE FUNCTION public.rf_pending_login_invitation(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p_email IS NOT NULL AND length(p_email) BETWEEN 3 AND 254 AND
 EXISTS(SELECT 1 FROM public.rf_member_invitations i WHERE i.email=lower(trim(p_email))
  AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now());
$$;
REVOKE ALL ON FUNCTION public.rf_issue_member_invitation(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rf_accept_member_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rf_revoke_member_invitation(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rf_pending_login_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_issue_member_invitation(uuid,text,text,text),public.rf_accept_member_invitation(text),public.rf_revoke_member_invitation(uuid,text),public.rf_pending_login_invitation(text) TO rf_runtime_login;
COMMIT;
