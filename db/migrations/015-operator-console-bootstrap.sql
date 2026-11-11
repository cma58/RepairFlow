-- 015: Operator bootstrap/recovery code issued from the database console.
--
-- Same procedure, checks and storage as scripts/mfa-bootstrap-code.js, for an operator
-- who has no computer: the holder of the database OWNER role runs ONE statement in the
-- Neon console SQL editor (authenticated with the Neon/Vercel account, independent of
-- the PHIXAR session). The code is generated inside the database with the server's
-- CSPRNG (gen_random_uuid), returned ONCE in that console result and stored only as
-- its SHA-256 hash. It never passes through the application, chat, e-mail or a URL.
-- Redemption is unchanged (rf_redeem_mfa_bootstrap): fresh UV assertion with the NEW
-- key in the same session + the code, within the validity window, single use,
-- 5 failures invalidate.
--
-- SECURITY INVOKER and no grants: the runtime role (rf_runtime_login) can neither call
-- it nor touch rf_mfa_bootstrap_codes. Additive only; no existing object is changed.
CREATE FUNCTION public.rf_operator_issue_bootstrap_code(p_organization uuid,p_subject text,p_operator text,
 p_purpose text DEFAULT 'bootstrap',p_minutes integer DEFAULT 15)
RETURNS TABLE(eenmalige_code text,geldig_tot timestamptz,code_id uuid,rol text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE
 v_alphabet constant text:='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
 v_role text;v_count int;v_hex text;v_bits bit(130);v_code text:='';v_id uuid;v_expires timestamptz;v_i int;
BEGIN
 IF p_organization IS NULL OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 255 THEN
  RAISE EXCEPTION 'organization and subject are required' USING ERRCODE='22023'; END IF;
 IF p_purpose IS NULL OR p_purpose NOT IN ('bootstrap','recovery') THEN
  RAISE EXCEPTION 'purpose must be bootstrap or recovery' USING ERRCODE='22023'; END IF;
 IF p_operator IS NULL OR length(trim(p_operator)) < 3 OR length(p_operator) > 120 THEN
  RAISE EXCEPTION 'operator must name who verified the identity' USING ERRCODE='22023'; END IF;
 IF p_minutes IS NULL OR p_minutes < 1 OR p_minutes > 30 THEN
  RAISE EXCEPTION 'minutes must be between 1 and 30' USING ERRCODE='22023'; END IF;
 SELECT count(*),min(s.role) INTO v_count,v_role FROM public.rf_staff s
  WHERE s.organization_id=p_organization AND s.identity_subject=p_subject AND s.active AND s.role IN ('owner','manager');
 IF v_count<>1 THEN RAISE EXCEPTION 'subject is not an active owner/manager of this organization' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM neon_auth."user" u WHERE u.id::text=p_subject AND u."emailVerified" IS TRUE AND u.banned IS NOT TRUE) THEN
  RAISE EXCEPTION 'Neon Auth user is missing, unverified or banned' USING ERRCODE='42501'; END IF;
 IF p_purpose='bootstrap' AND EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a JOIN public.rf_webauthn_credentials c ON c.credential_id=a.credential_id
   WHERE a.identity_subject=p_subject AND a.organization_id=p_organization AND a.revoked_at IS NULL AND c.revoked_at IS NULL AND c.blocked_at IS NULL) THEN
  RAISE EXCEPTION 'subject already has an approved key; use step-up or purpose recovery after blocking lost keys' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_mfa_bootstrap_codes b SET invalidated_at=now()
  WHERE b.organization_id=p_organization AND b.identity_subject=p_subject AND b.used_at IS NULL AND b.invalidated_at IS NULL;
 -- 130 random bits: 12 + 15 + 8 random hex digits from three v4 UUIDs (the fixed
 -- version digit 13 and variant digit 17 are never used) = 140 bits, first 130 kept;
 -- 26 symbols of 5 bits from the same alphabet as lib/credential-management.js.
 v_hex:=substr(replace(gen_random_uuid()::text,'-',''),1,12)||substr(replace(gen_random_uuid()::text,'-',''),18,15)
      ||substr(replace(gen_random_uuid()::text,'-',''),18,8);
 v_bits:=('x'||v_hex)::bit(140)::bit(130);
 FOR v_i IN 0..25 LOOP
  v_code:=v_code||substr(v_alphabet,substring(v_bits FROM v_i*5+1 FOR 5)::integer+1,1);
 END LOOP;
 INSERT INTO public.rf_mfa_bootstrap_codes AS b(organization_id,identity_subject,purpose,code_hash,created_by,expires_at)
 VALUES(p_organization,p_subject,p_purpose,encode(sha256(convert_to(v_code,'UTF8')),'hex'),trim(p_operator),now()+make_interval(mins=>p_minutes))
 RETURNING b.id,b.expires_at INTO v_id,v_expires;
 eenmalige_code:=substr(v_code,1,5)||'-'||substr(v_code,6,5)||'-'||substr(v_code,11,5)||'-'||substr(v_code,16,5)||'-'||substr(v_code,21,5)||'-'||substr(v_code,26,1);
 geldig_tot:=v_expires;code_id:=v_id;rol:=v_role;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.rf_operator_issue_bootstrap_code(uuid,text,text,text,integer) FROM PUBLIC;
