-- RepairFlow / PHIXAR POS extension v0.2 (DRAFT; NOT APPLIED)
-- Apply AFTER db/schema-v0.1.sql. No live data is changed by committing this file.
BEGIN;
CREATE TABLE rf_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 sku text NOT NULL,
 name text NOT NULL,
 kind text NOT NULL DEFAULT 'accessory' CHECK(kind IN ('accessory','device','part','service','other')),
 imei text,
 unit_price_cents bigint NOT NULL DEFAULT 0 CHECK(unit_price_cents>=0),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,sku)
);
-- An IMEI may be absent for non-serialized products; only active serials are unique.
CREATE UNIQUE INDEX rf_products_active_imei_idx
 ON rf_products(organization_id,regexp_replace(upper(imei),'[^A-Z0-9]','','g'))
 WHERE imei IS NOT NULL AND active=true;
CREATE TABLE rf_stock_balances (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 product_id uuid NOT NULL,
 quantity integer NOT NULL DEFAULT 0 CHECK(quantity>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,branch_id,product_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES rf_products(organization_id,id)
);
CREATE TABLE rf_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 reference text NOT NULL,
 sold_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided','refunded')),
 subtotal_cents bigint NOT NULL CHECK(subtotal_cents>=0),
 total_cents bigint NOT NULL CHECK(total_cents>=0),
 recorded_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,reference),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,recorded_by) REFERENCES rf_staff(organization_id,id)
);
CREATE TABLE rf_sale_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 product_id uuid,
 description text NOT NULL,
 sku_snapshot text,
 quantity integer NOT NULL CHECK(quantity>0),
 unit_price_cents bigint NOT NULL CHECK(unit_price_cents>=0),
 line_total_cents bigint NOT NULL CHECK(line_total_cents>=0),
 FOREIGN KEY(organization_id,sale_id) REFERENCES rf_sales(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES rf_products(organization_id,id)
);
CREATE TABLE rf_stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 product_id uuid NOT NULL,
 sale_id uuid,
 quantity_delta integer NOT NULL CHECK(quantity_delta<>0),
 reason text NOT NULL CHECK(reason IN ('purchase','sale','return','adjustment','transfer_in','transfer_out')),
 recorded_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES rf_products(organization_id,id),
 FOREIGN KEY(organization_id,sale_id) REFERENCES rf_sales(organization_id,id),
 FOREIGN KEY(organization_id,recorded_by) REFERENCES rf_staff(organization_id,id)
);
CREATE TABLE rf_sale_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 method text NOT NULL CHECK(method IN ('cash','card','transfer','other')),
 payment_state text NOT NULL CHECK(payment_state IN ('recorded','confirmed','reversed')),
 provider_reference text,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,sale_id) REFERENCES rf_sales(organization_id,id),
 CHECK(payment_state<>'confirmed' OR method<>'card' OR provider_reference IS NOT NULL)
);
CREATE INDEX rf_sales_branch_date_idx ON rf_sales(organization_id,branch_id,sold_at DESC);
CREATE INDEX rf_stock_movements_product_idx ON rf_stock_movements(organization_id,branch_id,product_id,created_at DESC);
-- Security default: runtime roles receive NO access until policies are reviewed.
ALTER TABLE rf_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_products FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_stock_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_sales FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_sale_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_sale_payments FORCE ROW LEVEL SECURITY;
COMMIT;
