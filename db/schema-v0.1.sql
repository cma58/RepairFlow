-- RepairFlow / PHIXAR — PostgreSQL schema v0.1 (DRAFT; NOT DEPLOYED)
-- Requires PostgreSQL 15+ and pgcrypto. Apply only after review, backup and auth design.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE rf_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 150),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rf_branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 name text NOT NULL,
 address text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,id)
);
CREATE TABLE rf_staff (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid,
 identity_subject text NOT NULL,
 display_name text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','manager','technician','sales')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,identity_subject),
 UNIQUE (organization_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id)
);
CREATE TABLE rf_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 display_name text NOT NULL,
 email text,
 phone text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE TABLE rf_repairs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 branch_id uuid NOT NULL,
 customer_id uuid,
 reference text NOT NULL,
 device_brand text,
 device_model text,
 device_serial text,
 complaint text,
 status text NOT NULL DEFAULT 'Binnengebracht' CHECK (status IN
 ('Binnengebracht','Diagnose','Wachten op klant','Wachten op onderdeel','In reparatie','Kwaliteitscontrole','Klaar','Afgehaald','Geannuleerd')),
 internal_notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,reference),
 UNIQUE (organization_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,customer_id) REFERENCES rf_customers(organization_id,id)
);
CREATE TABLE rf_repair_locations (
 organization_id uuid NOT NULL,
 repair_id uuid PRIMARY KEY,
 location_type text NOT NULL CHECK(location_type IN ('branch','repairer','transit')),
 branch_id uuid,
 assigned_staff_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,assigned_staff_id) REFERENCES rf_staff(organization_id,id),
 CHECK ((location_type='branch' AND branch_id IS NOT NULL) OR (location_type <> 'branch'))
);
CREATE TABLE rf_repair_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 repair_id uuid NOT NULL,
 from_location text,
 to_location text NOT NULL,
 handed_over_by uuid,
 received_by uuid,
 note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id),
 FOREIGN KEY(organization_id,handed_over_by) REFERENCES rf_staff(organization_id,id),
 FOREIGN KEY(organization_id,received_by) REFERENCES rf_staff(organization_id,id)
);
CREATE TABLE rf_repair_status_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 repair_id uuid NOT NULL,
 from_status text,
 to_status text NOT NULL,
 changed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id),
 FOREIGN KEY(organization_id,changed_by) REFERENCES rf_staff(organization_id,id)
);
-- Store only SHA-256 token digests; raw tokens must never be stored or logged.
CREATE TABLE rf_customer_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 repair_id uuid NOT NULL,
 token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 last_used_at timestamptz,
 FOREIGN KEY(organization_id,repair_id) REFERENCES rf_repairs(organization_id,id),
 CHECK(expires_at>created_at)
);
CREATE INDEX rf_repairs_branch_status_idx ON rf_repairs(organization_id,branch_id,status);
CREATE INDEX rf_repairs_customer_idx ON rf_repairs(organization_id,customer_id);
CREATE INDEX rf_transfers_repair_idx ON rf_repair_transfers(organization_id,repair_id,created_at DESC);
CREATE INDEX rf_access_repair_idx ON rf_customer_access(organization_id,repair_id);
-- RLS: defense in depth. Default deny to runtime roles until authenticated
-- tenant context and database roles/policies are deliberately configured.
ALTER TABLE rf_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_repair_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_repair_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_repair_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_customer_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_branches FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_repairs FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_repair_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_repair_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_repair_status_events FORCE ROW LEVEL SECURITY;
ALTER TABLE rf_customer_access FORCE ROW LEVEL SECURITY;
-- No policies or public grants are installed in this draft: all runtime access denied.
-- Use a separate migration owner for schema changes; never use that role in the web API.
COMMIT;
