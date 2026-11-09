-- Additive dynamic-context gate on the isolated branch; default disabled in API.
BEGIN;
GRANT SELECT ON rf_organization_memberships,rf_branch_memberships TO rf_runtime_login;
CREATE POLICY rf_membership_self_read ON rf_organization_memberships FOR SELECT TO rf_runtime_login
 USING (active AND identity_subject=current_setting('app.subject',true)
 AND organization_id::text=current_setting('app.organization_id',true));
CREATE POLICY rf_branch_membership_self_read ON rf_branch_memberships FOR SELECT TO rf_runtime_login
 USING (active AND organization_id::text=current_setting('app.organization_id',true)
 AND branch_id::text=current_setting('app.branch_id',true)
 AND EXISTS(SELECT 1 FROM rf_organization_memberships m WHERE m.id=membership_id AND m.organization_id=rf_branch_memberships.organization_id AND m.identity_subject=current_setting('app.subject',true) AND m.active));
-- The actor may work at a second branch while their legacy staff record still
-- points at the original branch. Expose only that same actor after membership.
CREATE POLICY rf_staff_dynamic_actor_read ON rf_staff FOR SELECT TO rf_runtime_login
 USING (active AND identity_subject=current_setting('app.subject',true)
 AND organization_id::text=current_setting('app.organization_id',true)
 AND EXISTS(SELECT 1 FROM rf_organization_memberships m JOIN rf_branch_memberships b
 ON b.organization_id=m.organization_id AND b.membership_id=m.id AND b.active
 WHERE m.organization_id=rf_staff.organization_id AND m.identity_subject=rf_staff.identity_subject AND m.active
 AND b.branch_id::text=current_setting('app.branch_id',true)));
CREATE OR REPLACE FUNCTION public.rf_staff_scope(p_org uuid,p_branch uuid,p_manager_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT current_setting('app.organization_id',true)=p_org::text
  AND nullif(current_setting('app.branch_id',true),'') IS NOT NULL
  AND (p_branch IS NULL OR current_setting('app.branch_id',true)=p_branch::text)
  AND (
   EXISTS(SELECT 1 FROM public.rf_staff s WHERE s.organization_id=p_org AND s.identity_subject=current_setting('app.subject',true)
    AND s.active AND s.branch_id::text=current_setting('app.branch_id',true)
    AND (NOT p_manager_only OR s.role IN ('owner','manager')))
   OR EXISTS(SELECT 1 FROM public.rf_organization_memberships m JOIN public.rf_branch_memberships b
     ON b.organization_id=m.organization_id AND b.membership_id=m.id AND b.active
     WHERE m.organization_id=p_org AND m.identity_subject=current_setting('app.subject',true) AND m.active
     AND b.branch_id::text=current_setting('app.branch_id',true)
     AND (NOT p_manager_only OR m.base_role IN ('owner','manager'))
     AND EXISTS(SELECT 1 FROM public.rf_staff s WHERE s.organization_id=m.organization_id AND s.identity_subject=m.identity_subject AND s.active))
  );
$$;
COMMIT;
