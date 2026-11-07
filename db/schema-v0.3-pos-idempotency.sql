-- Apply only after schema-v0.2-pos.sql, after backup and review.
-- Server-side POS checkout idempotency key.
BEGIN;
ALTER TABLE rf_sales ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX rf_sales_request_id_unique
 ON rf_sales(organization_id,request_id) WHERE request_id IS NOT NULL;
COMMIT;
