-- Additive migration for the isolated PHIXAR test branch only. Apply after 001.
-- Runtime SQL must set app.subject, app.organization_id and app.branch_id
-- transaction-locally after verifying a Neon Auth session and active staff row.
BEGIN;
ALTER TABLE rf_customers ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE rf_customers ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'individual' CHECK(customer_type IN ('individual','business'));
ALTER TABLE rf_customers ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE rf_customers ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE rf_customers ADD COLUMN IF NOT EXISTS billing_address text;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS charge_cents bigint NOT NULL DEFAULT 0 CHECK(charge_cents>=0);
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS quote_approved_at timestamptz;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS quote_approved_by uuid;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS quote_approval_method text;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS quote_approval_note text;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS quote_approved_charge_cents bigint;
ALTER TABLE rf_repairs ADD CONSTRAINT rf_quote_approval_staff_fk FOREIGN KEY(organization_id,quote_approved_by) REFERENCES rf_staff(organization_id,id);
ALTER TABLE rf_products ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE rf_stock_movements ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE rf_stock_movements ADD COLUMN IF NOT EXISTS repair_id uuid;
ALTER TABLE rf_sale_lines ADD COLUMN IF NOT EXISTS repair_id uuid;
ALTER TABLE rf_sale_lines ADD COLUMN IF NOT EXISTS refurbished_id uuid;
ALTER TABLE rf_sales ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE rf_stock_movements ADD CONSTRAINT rf_stock_repair_fk FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id);
ALTER TABLE rf_sale_lines ADD CONSTRAINT rf_sale_repair_fk FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id);
CREATE UNIQUE INDEX rf_customers_request_unique ON rf_customers(organization_id,request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX rf_repairs_request_unique ON rf_repairs(organization_id,request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX rf_products_request_unique ON rf_products(organization_id,request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX rf_movements_request_unique ON rf_stock_movements(organization_id,request_id) WHERE request_id IS NOT NULL;

CREATE TABLE rf_refurbished (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 request_id uuid NOT NULL,
 imei text NOT NULL CHECK(length(imei) BETWEEN 8 AND 32),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 200),
 price_cents bigint NOT NULL CHECK(price_cents>=0),
 status text NOT NULL DEFAULT 'inspection' CHECK(status IN ('inspection','rejected','available','sold')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id)
);
CREATE UNIQUE INDEX rf_refurb_imei_unique ON rf_refurbished(organization_id,regexp_replace(upper(imei),'[^A-Z0-9]','','g'));
CREATE TABLE rf_part_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 repair_id uuid NOT NULL,
 product_id uuid NOT NULL,
 request_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','consumed','released')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES rf_products(organization_id,id)
);
CREATE INDEX rf_part_reservations_stock_idx ON rf_part_reservations(organization_id,branch_id,product_id) WHERE status='reserved';
ALTER TABLE rf_sale_lines ADD CONSTRAINT rf_sale_refurb_fk FOREIGN KEY(organization_id,refurbished_id) REFERENCES rf_refurbished(organization_id,id);
ALTER TABLE rf_sale_lines ADD CONSTRAINT rf_line_one_source CHECK(num_nonnulls(product_id,repair_id,refurbished_id)=1);
CREATE TABLE rf_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 action text NOT NULL,
 entity_id uuid NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES rf_staff(organization_id,id)
);
CREATE TABLE rf_cash_days (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 business_date date NOT NULL,
 total_cents bigint NOT NULL CHECK(total_cents>=0),
 closed_by uuid NOT NULL,
 closed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,branch_id,business_date),
 UNIQUE(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,closed_by) REFERENCES rf_staff(organization_id,id)
);
CREATE TABLE rf_cash_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 day_id uuid NOT NULL,
 request_id uuid NOT NULL,
 delta_cents bigint NOT NULL CHECK(delta_cents<>0),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 approved_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,day_id) REFERENCES rf_cash_days(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,approved_by) REFERENCES rf_staff(organization_id,id)
);
ALTER TABLE rf_refurbished ENABLE ROW LEVEL SECURITY; ALTER TABLE rf_refurbished FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_part_reservations ENABLE ROW LEVEL SECURITY; ALTER TABLE rf_part_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_activity ENABLE ROW LEVEL SECURITY; ALTER TABLE rf_activity FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_cash_days ENABLE ROW LEVEL SECURITY; ALTER TABLE rf_cash_days FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_cash_corrections ENABLE ROW LEVEL SECURITY; ALTER TABLE rf_cash_corrections FORCE ROW LEVEL SECURITY;

GRANT SELECT,INSERT ON rf_customers,rf_repairs,rf_products,rf_sales,rf_sale_lines,rf_sale_payments,rf_stock_movements,rf_refurbished,rf_repair_status_events,rf_activity,rf_cash_days,rf_cash_corrections TO rf_runtime;
GRANT SELECT,INSERT,UPDATE ON rf_part_reservations TO rf_runtime;
GRANT SELECT,UPDATE ON rf_stock_balances,rf_repairs,rf_refurbished TO rf_runtime;
GRANT INSERT ON rf_stock_balances TO rf_runtime;
CREATE POLICY rf_customers_manager_insert ON rf_customers FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,NULL,true));
CREATE POLICY rf_repairs_manager_insert ON rf_repairs FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_repairs_manager_update ON rf_repairs FOR UPDATE TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true)) WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_products_manager_insert ON rf_products FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,NULL,true));
CREATE POLICY rf_stock_balances_manager_insert ON rf_stock_balances FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_stock_balances_manager_update ON rf_stock_balances FOR UPDATE TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true)) WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_sales_manager_insert ON rf_sales FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_sale_lines_manager_read ON rf_sale_lines FOR SELECT TO rf_runtime USING(EXISTS(SELECT 1 FROM rf_sales s WHERE s.id=rf_sale_lines.sale_id AND s.organization_id=rf_sale_lines.organization_id AND public.rf_staff_scope(s.organization_id,s.branch_id,true)));
CREATE POLICY rf_sale_lines_manager_insert ON rf_sale_lines FOR INSERT TO rf_runtime WITH CHECK(EXISTS(SELECT 1 FROM rf_sales s WHERE s.id=rf_sale_lines.sale_id AND s.organization_id=rf_sale_lines.organization_id AND public.rf_staff_scope(s.organization_id,s.branch_id,true)));
CREATE POLICY rf_payments_manager_read ON rf_sale_payments FOR SELECT TO rf_runtime USING(EXISTS(SELECT 1 FROM rf_sales s WHERE s.id=rf_sale_payments.sale_id AND s.organization_id=rf_sale_payments.organization_id AND public.rf_staff_scope(s.organization_id,s.branch_id,true)));
CREATE POLICY rf_payments_manager_insert ON rf_sale_payments FOR INSERT TO rf_runtime WITH CHECK(EXISTS(SELECT 1 FROM rf_sales s WHERE s.id=rf_sale_payments.sale_id AND s.organization_id=rf_sale_payments.organization_id AND public.rf_staff_scope(s.organization_id,s.branch_id,true)));
CREATE POLICY rf_movements_manager_read ON rf_stock_movements FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_movements_manager_insert ON rf_stock_movements FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_refurb_manager_read ON rf_refurbished FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_refurb_manager_insert ON rf_refurbished FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_refurb_manager_update ON rf_refurbished FOR UPDATE TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true)) WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_reservations_manager_read ON rf_part_reservations FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_reservations_manager_insert ON rf_part_reservations FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_reservations_manager_update ON rf_part_reservations FOR UPDATE TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true)) WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_repair_events_manager_read ON rf_repair_status_events FOR SELECT TO rf_runtime USING(EXISTS(SELECT 1 FROM rf_repairs r WHERE r.id=rf_repair_status_events.repair_id AND r.organization_id=rf_repair_status_events.organization_id AND public.rf_staff_scope(r.organization_id,r.branch_id,true)));
CREATE POLICY rf_repair_events_manager_insert ON rf_repair_status_events FOR INSERT TO rf_runtime WITH CHECK(EXISTS(SELECT 1 FROM rf_repairs r WHERE r.id=rf_repair_status_events.repair_id AND r.organization_id=rf_repair_status_events.organization_id AND public.rf_staff_scope(r.organization_id,r.branch_id,true)));
CREATE POLICY rf_activity_manager_read ON rf_activity FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_activity_manager_insert ON rf_activity FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_cash_days_manager_read ON rf_cash_days FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_cash_days_manager_insert ON rf_cash_days FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_cash_corrections_manager_read ON rf_cash_corrections FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true));
CREATE POLICY rf_cash_corrections_manager_insert ON rf_cash_corrections FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true));
COMMIT;
