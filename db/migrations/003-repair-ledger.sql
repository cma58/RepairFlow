-- PHIXAR phase 2.1. Apply only to the isolated test branch first.
-- Additive: no historical repair, quote, sale, payment or stock row is removed.
BEGIN;
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0 CHECK(version>=0);
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS imei1 text CHECK(imei1 IS NULL OR imei1 ~ '^[0-9]{15}$');
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS imei2 text CHECK(imei2 IS NULL OR imei2 ~ '^[0-9]{15}$');
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS diagnosis_fee_cents bigint NOT NULL DEFAULT 0 CHECK(diagnosis_fee_cents>=0);
-- Outcome is separate from the existing operational lifecycle status.
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS outcome text CHECK(outcome IN ('Afgekeurd','Niet herstelbaar','Niet hersteld'));
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS parts_finalized boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS rf_repairs_org_branch_id_idx ON rf_repairs(organization_id,branch_id,id);
CREATE TABLE IF NOT EXISTS rf_repair_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,branch_id uuid NOT NULL,repair_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('initial','supplement')),base_charge_cents bigint NOT NULL CHECK(base_charge_cents>=0),
 proposed_total_cents bigint NOT NULL CHECK(proposed_total_cents>=0),scope text NOT NULL CHECK(length(trim(scope))>=5),
 part_product_id uuid,part_quantity integer CHECK(part_quantity BETWEEN 1 AND 999),
 CHECK((part_product_id IS NULL AND part_quantity IS NULL) OR (part_product_id IS NOT NULL AND part_quantity IS NOT NULL)),
 FOREIGN KEY(organization_id,part_product_id) REFERENCES rf_products(organization_id,id),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),UNIQUE(organization_id,repair_id,id),
 FOREIGN KEY(organization_id,branch_id,repair_id) REFERENCES rf_repairs(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES rf_staff(organization_id,id));
ALTER TABLE rf_repair_quotes ADD COLUMN IF NOT EXISTS part_product_id uuid;
ALTER TABLE rf_repair_quotes ADD COLUMN IF NOT EXISTS part_quantity integer;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rf_quotes_planned_part_fk') THEN
  ALTER TABLE rf_repair_quotes ADD CONSTRAINT rf_quotes_planned_part_fk FOREIGN KEY(organization_id,part_product_id) REFERENCES rf_products(organization_id,id);
  ALTER TABLE rf_repair_quotes ADD CONSTRAINT rf_quotes_planned_part_check CHECK((part_product_id IS NULL AND part_quantity IS NULL) OR (part_product_id IS NOT NULL AND part_quantity IS NOT NULL AND part_quantity BETWEEN 1 AND 999));
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rf_quotes_part_pair_required') THEN
 ALTER TABLE rf_repair_quotes ADD CONSTRAINT rf_quotes_part_pair_required CHECK ((part_product_id IS NULL AND part_quantity IS NULL) OR (part_product_id IS NOT NULL AND part_quantity IS NOT NULL AND part_quantity BETWEEN 1 AND 999));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS rf_repair_quote_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,branch_id uuid NOT NULL,repair_id uuid NOT NULL,quote_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('accepted','declined')),method text NOT NULL CHECK(method IN ('oral','email','portal')),
 note text NOT NULL CHECK(length(trim(note))>=10),recorded_by uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,quote_id),
 FOREIGN KEY(organization_id,repair_id,quote_id) REFERENCES rf_repair_quotes(organization_id,repair_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,recorded_by) REFERENCES rf_staff(organization_id,id));
ALTER TABLE rf_repairs ADD COLUMN IF NOT EXISTS open_quote_id uuid;
CREATE TABLE IF NOT EXISTS rf_repair_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,branch_id uuid NOT NULL,repair_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents<>0),kind text NOT NULL CHECK(kind IN ('deposit','partial','correction')),
 method text NOT NULL CHECK(method IN ('cash','card','transfer')),payment_state text NOT NULL DEFAULT 'recorded' CHECK(payment_state='recorded'),
 reference text,corrects_payment_id uuid,reason text,recorded_by uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),UNIQUE(organization_id,repair_id,id),
 CHECK((kind='correction' AND amount_cents<0 AND corrects_payment_id IS NOT NULL AND length(trim(reason))>=5) OR (kind<>'correction' AND amount_cents>0 AND corrects_payment_id IS NULL)),
 FOREIGN KEY(organization_id,branch_id,repair_id) REFERENCES rf_repairs(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,repair_id,corrects_payment_id) REFERENCES rf_repair_payments(organization_id,repair_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,recorded_by) REFERENCES rf_staff(organization_id,id));
CREATE TABLE IF NOT EXISTS rf_repair_commands(
 organization_id uuid NOT NULL,branch_id uuid NOT NULL,request_id uuid NOT NULL,repair_id uuid NOT NULL,command text NOT NULL,
 request_hash text NOT NULL,result jsonb NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(organization_id,branch_id,repair_id) REFERENCES rf_repairs(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES rf_staff(organization_id,id));
CREATE INDEX IF NOT EXISTS rf_repair_payments_scope_idx ON rf_repair_payments(organization_id,branch_id,repair_id,recorded_at);
CREATE INDEX IF NOT EXISTS rf_repair_quotes_scope_idx ON rf_repair_quotes(organization_id,branch_id,repair_id,created_at);
CREATE INDEX IF NOT EXISTS rf_repairs_imei1_idx ON rf_repairs(organization_id,branch_id,imei1) WHERE imei1 IS NOT NULL;
CREATE INDEX IF NOT EXISTS rf_repairs_imei2_idx ON rf_repairs(organization_id,branch_id,imei2) WHERE imei2 IS NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rf_repairs_open_quote_fk') THEN
  ALTER TABLE rf_repairs ADD CONSTRAINT rf_repairs_open_quote_fk FOREIGN KEY(organization_id,id,open_quote_id) REFERENCES rf_repair_quotes(organization_id,repair_id,id);
 END IF;
END $$;
-- Append-only ledgers: runtime has SELECT/INSERT, never UPDATE/DELETE.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rf_repair_quotes','rf_repair_quote_decisions','rf_repair_payments','rf_repair_commands'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO rf_runtime',t);
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_read') THEN
   EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO rf_runtime USING(public.rf_staff_scope(organization_id,branch_id,true))',t||'_read',t);
   EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO rf_runtime WITH CHECK(public.rf_staff_scope(organization_id,branch_id,true))',t||'_insert',t);
  END IF;
 END LOOP;
END $$;
COMMIT;
