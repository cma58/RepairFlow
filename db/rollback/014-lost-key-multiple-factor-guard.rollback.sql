-- Rollback 014: restore the exact 013 lost-key function and grants.
-- No credential, session or audit rows are changed.
CREATE OR REPLACE FUNCTION public.rf_block_own_credential(p_fingerprint text,p_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict error
DECLARE v_ctx record;v_staff uuid;v_credential text;
BEGIN
 SELECT * INTO v_ctx FROM public.rf_security_context();
 v_staff:=public.rf_staff_in_context(ARRAY['owner','manager']);
 IF v_ctx.o_created<now()-interval '10 minutes' OR length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN
  RAISE EXCEPTION 'RECENT_LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_credentials c SET blocked_at=now(),block_reason=p_reason WHERE c.identity_subject=v_ctx.o_subject
  AND c.revoked_at IS NULL AND c.blocked_at IS NULL AND public.rf_credential_fingerprint(c.credential_id)=upper(p_fingerprint)
  RETURNING c.credential_id INTO v_credential;
 IF v_credential IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.rf_webauthn_approvals a SET revoked_at=now(),revoked_by_subject=v_ctx.o_subject,revoke_reason='blocked: '||p_reason
  WHERE a.credential_id=v_credential AND a.revoked_at IS NULL;
 PERFORM public.rf_security_audit('webauthn.blocked',jsonb_build_object('fingerprint',upper(p_fingerprint),'reason',p_reason));
 INSERT INTO public.rf_session_denials(organization_id,identity_subject,session_id,actor_id,reason)
 VALUES(v_ctx.o_org,v_ctx.o_subject,NULL,v_staff,'security key blocked: '||p_reason);
 RETURN 1;
END $$;
REVOKE ALL ON FUNCTION public.rf_block_own_credential(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_block_own_credential(text,text) TO rf_runtime_login;

