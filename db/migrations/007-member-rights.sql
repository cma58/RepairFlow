-- Individual branch rights; only reviewed administrative transactions may write.
BEGIN;
CREATE TABLE rf_member_rights (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 right_code text NOT NULL CHECK(right_code IN ('customers.write','repairs.write','sales.write','discounts.write','refunds.approve','cash.close','inventory.write','financial.read','employees.manage','exports.read','settings.manage')),
 decision text NOT NULL CHECK(decision IN ('allow','deny')),
 changed_at timestamptz NOT NULL DEFAULT now(),
 changed_by uuid,
 PRIMARY KEY(organization_id,branch_id,membership_id,right_code),
 FOREIGN KEY(organization_id,branch_id,membership_id) REFERENCES rf_branch_memberships(organization_id,branch_id,membership_id),
 FOREIGN KEY(organization_id,changed_by) REFERENCES rf_staff(organization_id,id)
);
ALTER TABLE rf_member_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_member_rights FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_member_rights FROM PUBLIC,rf_runtime,rf_runtime_login;
GRANT SELECT ON rf_member_rights TO rf_runtime_login;
CREATE POLICY rf_member_rights_self ON rf_member_rights FOR SELECT TO rf_runtime_login
 USING(organization_id::text=current_setting('app.organization_id',true)
 AND branch_id::text=current_setting('app.branch_id',true)
 AND EXISTS(SELECT 1 FROM rf_organization_memberships m JOIN rf_branch_memberships b
  ON b.organization_id=m.organization_id AND b.membership_id=m.id AND b.branch_id=rf_member_rights.branch_id AND b.active
  WHERE m.organization_id=rf_member_rights.organization_id AND m.id=rf_member_rights.membership_id
  AND m.identity_subject=current_setting('app.subject',true) AND m.active));
COMMIT;
