-- An already protected account with another usable key must prove possession
-- of that other key before blocking one. A sole lost key can still be reported
-- after a fresh primary login and recovered via an independently issued code.
-- This preserves the original emergency path while limiting stolen-session DoS.
CREATE OR REPLACE FUNCTION public.rf_block_own_credential(p_fingerprint text,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_staff uuid;v_credential text;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 v_staff:=public.rf_staff_in_context(ARRAY['owner','manager']);
 IF v_ctx.o_created<now()-interval '10 minutes' OR length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN
  RAISE EXCEPTION 'RECENT_LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_fingerprint IS NULL OR upper(p_fingerprint) !~ '^[0-9A-F]{4}-[0-9A-F]{4}$' THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rf_webauthn_block:'||v_ctx.o_subject,0));
 SELECT c.credential_id INTO v_credential FROM public.rf_webauthn_credentials c
  WHERE c.identity_subject=v_ctx.o_subject AND c.revoked_at IS NULL AND c.blocked_at IS NULL
   AND public.rf_credential_fingerprint(c.credential_id)=upper(p_fingerprint) FOR UPDATE;
 IF v_credential IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.rf_webauthn_approvals a JOIN public.rf_webauthn_credentials c ON c.credential_id=a.credential_id
  WHERE a.identity_subject=v_ctx.o_subject AND a.organization_id=v_ctx.o_org AND a.revoked_at IS NULL
   AND c.identity_subject=v_ctx.o_subject AND c.credential_id<>v_credential AND c.revoked_at IS NULL AND c.blocked_at IS NULL)
 THEN PERFORM public.rf_consume_step_up('credential.manage'); END IF;
 UPDATE public.rf_webauthn_credentials c SET blocked_at=now(),block_reason=p_reason WHERE c.credential_id=v_credential;
 UPDATE public.rf_webauthn_approvals a SET revoked_at=now(),revoked_by_subject=v_ctx.o_subject,revoke_reason='blocked: '||p_reason
  WHERE a.credential_id=v_credential AND a.revoked_at IS NULL;
 PERFORM public.rf_security_audit('webauthn.blocked',jsonb_build_object('fingerprint',upper(p_fingerprint),'reason',p_reason));
 INSERT INTO public.rf_session_denials(organization_id,identity_subject,session_id,actor_id,reason)
 VALUES(v_ctx.o_org,v_ctx.o_subject,NULL,v_staff,'security key blocked: '||p_reason);
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.rf_block_own_credential(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_block_own_credential(text,text) TO rf_runtime_login;
