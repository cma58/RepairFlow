-- Additive, read-only context discovery. Apply only to isolated branch first.
BEGIN;
CREATE FUNCTION public.rf_available_contexts()
RETURNS TABLE(organization_id uuid,organization_name text,branch_id uuid,branch_name text,base_role text,actor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT m.organization_id,o.name,b.branch_id,v.name,m.base_role,s.id
 FROM public.rf_organization_memberships m
 JOIN public.rf_branch_memberships b ON b.organization_id=m.organization_id AND b.membership_id=m.id AND b.active
 JOIN public.rf_organizations o ON o.id=m.organization_id
 JOIN public.rf_branches v ON v.organization_id=b.organization_id AND v.id=b.branch_id
 JOIN public.rf_staff s ON s.organization_id=m.organization_id AND s.identity_subject=m.identity_subject AND s.active
 WHERE m.active AND m.identity_subject=current_setting('app.subject',true)
 ORDER BY o.name,v.name;
$$;
REVOKE ALL ON FUNCTION public.rf_available_contexts() FROM PUBLIC,rf_runtime;
GRANT EXECUTE ON FUNCTION public.rf_available_contexts() TO rf_runtime_login;
COMMIT;
