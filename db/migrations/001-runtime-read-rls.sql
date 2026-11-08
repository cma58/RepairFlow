-- Apply first to an isolated Neon branch. Read-only runtime role; all writes
-- remain default-deny until transactional endpoints and audits are reviewed.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rf_runtime') THEN
  CREATE ROLE rf_runtime NOLOGIN;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.rf_staff_scope(p_org uuid,p_branch uuid,p_manager_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT current_setting('app.organization_id',true)=p_org::text
  AND nullif(current_setting('app.branch_id',true),'') IS NOT NULL
  AND (p_branch IS NULL OR current_setting('app.branch_id',true)=p_branch::text)
  AND EXISTS (
   SELECT 1 FROM public.rf_staff s
   WHERE s.organization_id=p_org AND s.identity_subject=current_setting('app.subject',true)
    AND s.active AND s.branch_id::text=current_setting('app.branch_id',true)
    AND (NOT p_manager_only OR s.role IN ('owner','manager'))
  );
$$;
REVOKE ALL ON FUNCTION public.rf_staff_scope(uuid,uuid,boolean) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rf_runtime;
GRANT EXECUTE ON FUNCTION public.rf_staff_scope(uuid,uuid,boolean) TO rf_runtime;
GRANT SELECT ON public.rf_staff,public.rf_organizations,public.rf_branches,
 public.rf_customers,public.rf_repairs,public.rf_products,public.rf_stock_balances,
 public.rf_sales TO rf_runtime;
CREATE POLICY rf_staff_self_read ON public.rf_staff FOR SELECT TO rf_runtime USING (
 identity_subject=current_setting('app.subject',true)
 AND public.rf_staff_scope(organization_id,branch_id,false)
);
CREATE POLICY rf_organizations_read ON public.rf_organizations FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(id,NULL,false));
CREATE POLICY rf_branches_read ON public.rf_branches FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(organization_id,id,false));
CREATE POLICY rf_customers_manager_read ON public.rf_customers FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(organization_id,NULL,true));
CREATE POLICY rf_repairs_read ON public.rf_repairs FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(organization_id,branch_id,false));
CREATE POLICY rf_products_read ON public.rf_products FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(organization_id,NULL,false));
CREATE POLICY rf_stock_balances_read ON public.rf_stock_balances FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(organization_id,branch_id,false));
CREATE POLICY rf_sales_read ON public.rf_sales FOR SELECT TO rf_runtime
 USING (public.rf_staff_scope(organization_id,branch_id,false));
COMMIT;
