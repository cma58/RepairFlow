-- Rollback 015: remove the console variant of the operator bootstrap procedure.
-- Codes already issued stay as rows (hash only) and keep their normal expiry/redemption
-- rules; scripts/mfa-bootstrap-code.js remains the operator procedure.
DROP FUNCTION IF EXISTS public.rf_operator_issue_bootstrap_code(uuid,text,text,text,integer);
