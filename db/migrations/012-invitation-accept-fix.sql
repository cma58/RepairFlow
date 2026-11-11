-- Additive, non-destructive fix for migration 011.
-- Defect (found by the P0 browser E2E against real PostgreSQL 16): inside the
-- RETURNS TABLE(organization_id uuid,branch_id uuid) function, unqualified
-- column references such as "WHERE organization_id=..." are ambiguous with the
-- PL/pgSQL OUT variables. Every VALID acceptance therefore failed with SQLSTATE
-- 42702 (surfaced as HTTP 503); only invalid/negative paths returned earlier.
-- This replaces the function body with fully qualified references. Signature,
-- privileges, checks and semantics are unchanged. No data is modified.
BEGIN;
CREATE OR REPLACE FUNCTION public.rf_accept_member_invitation(p_hash text)
RETURNS TABLE(organization_id uuid,branch_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_subject text;v_session uuid;v_user record;v_inv public.rf_member_invitations%ROWTYPE;v_member uuid;v_staff uuid;
BEGIN
 v_subject:=nullif(current_setting('app.subject',true),'');
 v_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 IF v_subject IS NULL OR v_session IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT u.id,u.email,u.name,u."emailVerified",u.banned INTO v_user FROM neon_auth."user" u WHERE u.id::text=v_subject;
 IF NOT FOUND OR v_user."emailVerified" IS NOT TRUE OR v_user.banned IS TRUE THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT i.* INTO v_inv FROM public.rf_member_invitations i WHERE i.token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL OR v_inv.expires_at<=now() OR
    v_inv.email<>lower(v_user.email) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rf_staff s WHERE s.id=v_inv.invited_by AND s.organization_id=v_inv.organization_id AND s.active AND s.role='owner') OR
 EXISTS(SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=v_inv.organization_id AND d.identity_subject=v_subject
 AND (d.session_id=v_session OR (d.session_id IS NULL AND d.revoked_at>=nullif(current_setting('app.session_created_at',true),'')::timestamptz)))
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- Conflicting or deactivated records must never be reactivated by an invite.
 SELECT s.id INTO v_staff FROM public.rf_staff s WHERE s.organization_id=v_inv.organization_id AND s.identity_subject=v_subject;
 IF v_staff IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rf_staff s WHERE s.id=v_staff AND s.active AND s.role=v_inv.role) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF v_staff IS NULL THEN
  INSERT INTO public.rf_staff AS s(organization_id,branch_id,identity_subject,display_name,role,active)
  VALUES(v_inv.organization_id,v_inv.branch_id,v_subject,coalesce(nullif(trim(v_user.name),''),v_user.email),v_inv.role,true)
  RETURNING s.id INTO v_staff;
 END IF;
 SELECT m.id INTO v_member FROM public.rf_organization_memberships m WHERE m.organization_id=v_inv.organization_id AND m.identity_subject=v_subject;
 IF v_member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rf_organization_memberships m WHERE m.id=v_member AND m.active AND m.base_role=v_inv.role) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF v_member IS NULL THEN
  INSERT INTO public.rf_organization_memberships AS m(organization_id,identity_subject,base_role,active,activated_at)
  VALUES(v_inv.organization_id,v_subject,v_inv.role,true,now()) RETURNING m.id INTO v_member;
 END IF;
 IF EXISTS(SELECT 1 FROM public.rf_branch_memberships b WHERE b.organization_id=v_inv.organization_id AND b.membership_id=v_member AND b.branch_id=v_inv.branch_id) THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_branch_memberships AS b(organization_id,branch_id,membership_id,active)
 VALUES(v_inv.organization_id,v_inv.branch_id,v_member,true);
 UPDATE public.rf_member_invitations i SET accepted_at=now(),accepted_subject=v_subject WHERE i.id=v_inv.id;
 INSERT INTO public.rf_security_events AS e(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_subject,v_session,v_inv.organization_id,'invitation.accepted',jsonb_build_object('id',v_inv.id,'branch',v_inv.branch_id,'role',v_inv.role));
 organization_id:=v_inv.organization_id;branch_id:=v_inv.branch_id;RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.rf_accept_member_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_accept_member_invitation(text) TO rf_runtime_login;
COMMIT;
