-- Scoped app access revocation; provider sessions remain owned by Neon Auth.
BEGIN;
CREATE TABLE rf_session_denials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 identity_subject text NOT NULL,
 session_id uuid,
 revoked_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason))>=10),
 FOREIGN KEY(organization_id,actor_id) REFERENCES rf_staff(organization_id,id)
);
CREATE INDEX rf_session_denials_lookup ON rf_session_denials(organization_id,identity_subject,session_id,revoked_at);
ALTER TABLE rf_session_denials ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_session_denials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_session_denials FROM PUBLIC,rf_runtime,rf_runtime_login;
GRANT SELECT ON rf_session_denials TO rf_runtime_login;
CREATE POLICY rf_session_denials_self ON rf_session_denials FOR SELECT TO rf_runtime_login
 USING(organization_id::text=current_setting('app.organization_id',true)
 AND identity_subject=current_setting('app.subject',true));
CREATE OR REPLACE FUNCTION public.rf_available_contexts()
RETURNS TABLE(organization_id uuid,organization_name text,branch_id uuid,branch_name text,base_role text,actor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT m.organization_id,o.name,b.branch_id,v.name,m.base_role,s.id
 FROM public.rf_organization_memberships m
 JOIN public.rf_branch_memberships b ON b.organization_id=m.organization_id AND b.membership_id=m.id AND b.active
 JOIN public.rf_organizations o ON o.id=m.organization_id
 JOIN public.rf_branches v ON v.organization_id=b.organization_id AND v.id=b.branch_id
 JOIN public.rf_staff s ON s.organization_id=m.organization_id AND s.identity_subject=m.identity_subject AND s.active
 WHERE m.active AND m.identity_subject=current_setting('app.subject',true)
 AND nullif(current_setting('app.session_id',true),'') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.rf_session_denials d
  WHERE d.organization_id=m.organization_id AND d.identity_subject=m.identity_subject
  AND (d.session_id::text=current_setting('app.session_id',true)
   OR (d.session_id IS NULL AND d.revoked_at>=nullif(current_setting('app.session_created_at',true),'')::timestamptz)))
 ORDER BY o.name,v.name;
$$;
COMMIT;
