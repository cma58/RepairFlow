-- Additive, fail-closed WebAuthn state. Apply only on an isolated branch first.
BEGIN;
CREATE TABLE rf_webauthn_credentials (
 credential_id text PRIMARY KEY CHECK(length(credential_id) BETWEEN 16 AND 1024),
 identity_subject text NOT NULL CHECK(length(identity_subject) BETWEEN 1 AND 255),
 public_key bytea NOT NULL CHECK(octet_length(public_key) BETWEEN 32 AND 4096),
 sign_count bigint NOT NULL DEFAULT 0 CHECK(sign_count>=0),
 device_type text NOT NULL CHECK(device_type IN ('singleDevice','multiDevice')),
 backed_up boolean NOT NULL,
 transports jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX rf_webauthn_credentials_subject ON rf_webauthn_credentials(identity_subject) WHERE revoked_at IS NULL;
CREATE TABLE rf_webauthn_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_subject text NOT NULL,
 session_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 challenge_hash text NOT NULL UNIQUE,
 ceremony text NOT NULL CHECK(ceremony IN ('registration','authentication')),
 origin text NOT NULL,
 rp_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '3 minutes'),
 consumed_at timestamptz
);
CREATE INDEX rf_webauthn_challenges_rate ON rf_webauthn_challenges(identity_subject,session_id,created_at);
CREATE TABLE rf_webauthn_grants (
 identity_subject text NOT NULL,
 session_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 credential_id text NOT NULL REFERENCES rf_webauthn_credentials(credential_id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '5 minutes'),
 independent_factor boolean NOT NULL DEFAULT false,
 PRIMARY KEY(identity_subject,session_id,organization_id)
);
-- No grant produced by this migration is independent: attestation and second-factor
-- provenance must be proven separately. A client cannot set this value.
ALTER TABLE rf_webauthn_grants ADD CONSTRAINT rf_webauthn_no_unproven_factor CHECK (NOT independent_factor);
CREATE TABLE rf_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_subject text NOT NULL,
 session_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES rf_organizations(id),
 action text NOT NULL CHECK(length(action) BETWEEN 3 AND 80),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rf_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rf_security_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rf_security_events FROM PUBLIC,rf_runtime,rf_runtime_login;
GRANT INSERT ON rf_security_events TO rf_runtime_login;
CREATE POLICY rf_security_events_append ON rf_security_events FOR INSERT TO rf_runtime_login
 WITH CHECK(identity_subject=current_setting('app.subject',true)
 AND session_id::text=current_setting('app.session_id',true)
 AND organization_id::text=current_setting('app.organization_id',true));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rf_webauthn_credentials','rf_webauthn_challenges','rf_webauthn_grants'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,rf_runtime,rf_runtime_login',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO rf_runtime_login',t);
 END LOOP;
END $$;
CREATE POLICY rf_webauthn_credentials_self ON rf_webauthn_credentials FOR ALL TO rf_runtime_login
 USING(identity_subject=current_setting('app.subject',true))
 WITH CHECK(identity_subject=current_setting('app.subject',true));
CREATE POLICY rf_webauthn_challenges_self ON rf_webauthn_challenges FOR ALL TO rf_runtime_login
 USING(identity_subject=current_setting('app.subject',true)
 AND session_id::text=current_setting('app.session_id',true)
 AND organization_id::text=current_setting('app.organization_id',true))
 WITH CHECK(identity_subject=current_setting('app.subject',true)
 AND session_id::text=current_setting('app.session_id',true)
 AND organization_id::text=current_setting('app.organization_id',true));
CREATE POLICY rf_webauthn_grants_self ON rf_webauthn_grants FOR ALL TO rf_runtime_login
 USING(identity_subject=current_setting('app.subject',true)
 AND session_id::text=current_setting('app.session_id',true)
 AND organization_id::text=current_setting('app.organization_id',true))
 WITH CHECK(identity_subject=current_setting('app.subject',true)
 AND session_id::text=current_setting('app.session_id',true)
 AND organization_id::text=current_setting('app.organization_id',true));
COMMIT;
