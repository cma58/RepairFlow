-- Additive SaaS foundation. Apply only to an isolated branch after review.
-- No login/activation rights are granted by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS rf_platform_owners (
 bootstrap_slot boolean NOT NULL DEFAULT true UNIQUE CHECK(bootstrap_slot),
 identity_subject text PRIMARY KEY CHECK (length(trim(identity_subject)) BETWEEN 1 AND 255),
 active boolean NOT NULL DEFAULT false,
 provisioned_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 activation_reference text,
 CHECK (NOT active OR (activated_at IS NOT NULL AND length(trim(activation_reference))>=10))
);
CREATE UNIQUE INDEX IF NOT EXISTS rf_only_one_active_platform_owner ON rf_platform_owners(active) WHERE active;
CREATE TABLE IF NOT EXISTS rf_organization_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 applicant_subject text NOT NULL CHECK(length(trim(applicant_subject)) BETWEEN 1 AND 255),
 proposed_name text NOT NULL CHECK(length(trim(proposed_name)) BETWEEN 2 AND 150),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 organization_id uuid REFERENCES rf_organizations(id),
 reviewed_by text REFERENCES rf_platform_owners(identity_subject),
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 CHECK((status='pending' AND reviewed_at IS NULL AND organization_id IS NULL) OR
       (status<>'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND length(trim(review_reason))>=10)),
 CHECK(status<>'approved' OR organization_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS rf_organization_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 identity_subject text NOT NULL CHECK(length(trim(identity_subject)) BETWEEN 1 AND 255),
 base_role text NOT NULL CHECK(base_role IN ('owner','manager','technician','sales')),
 active boolean NOT NULL DEFAULT false,
 invited_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 UNIQUE(organization_id,identity_subject),UNIQUE(organization_id,id),
 CHECK(NOT active OR activated_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS rf_branch_memberships (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(organization_id,branch_id,membership_id),
 FOREIGN KEY(organization_id,branch_id) REFERENCES rf_branches(organization_id,id),
 FOREIGN KEY(organization_id,membership_id) REFERENCES rf_organization_memberships(organization_id,id)
);
CREATE TABLE IF NOT EXISTS rf_platform_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_subject text NOT NULL,
 action text NOT NULL,
 target_organization_id uuid,
 purpose text NOT NULL CHECK(length(trim(purpose))>=10),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rf_platform_owners','rf_organization_applications','rf_organization_memberships','rf_branch_memberships','rf_platform_audit'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
-- Neon default privileges may grant SELECT to the login role on new tables.
REVOKE ALL ON rf_platform_owners,rf_organization_applications,rf_organization_memberships,rf_branch_memberships,rf_platform_audit FROM rf_runtime_login,rf_runtime,PUBLIC;
-- No grants/policies for rf_runtime or rf_runtime_login: default deny.
-- Platform-owner activation and scoped management require a separate reviewed
-- MFA and administrative transaction boundary; never infer rights from rf_staff.
COMMIT;
