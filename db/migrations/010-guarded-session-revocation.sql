-- App-scoped revocation only. Never treats this as provider-wide sign-out.
BEGIN;
CREATE OR REPLACE FUNCTION public.rf_revoke_member_session(
 p_target_staff uuid,p_session uuid,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_subject text;v_org uuid;v_session uuid;v_actor uuid;v_target text;v_id uuid;
BEGIN
 v_subject:=nullif(current_setting('app.subject',true),'');
 v_org:=nullif(current_setting('app.organization_id',true),'')::uuid;
 v_session:=nullif(current_setting('app.session_id',true),'')::uuid;
 IF v_subject IS NULL OR v_org IS NULL OR v_session IS NULL OR
    length(trim(coalesce(p_reason,'')))<10 OR length(p_reason)>500 THEN
  RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT s.id INTO v_actor FROM public.rf_staff s WHERE s.organization_id=v_org
  AND s.identity_subject=v_subject AND s.active AND s.role='owner' LIMIT 1;
 IF v_actor IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.rf_webauthn_grants g WHERE g.identity_subject=v_subject AND
   g.organization_id=v_org AND g.session_id=v_session AND g.independent_factor AND g.expires_at>now()
 ) OR EXISTS(
   SELECT 1 FROM public.rf_session_denials d WHERE d.organization_id=v_org AND d.identity_subject=v_subject
   AND (d.session_id=v_session OR (d.session_id IS NULL AND d.revoked_at >=
      nullif(current_setting('app.session_created_at',true),'')::timestamptz))
 ) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT s.identity_subject INTO v_target FROM public.rf_staff s
 WHERE s.organization_id=v_org AND s.id=p_target_staff AND s.active LIMIT 1;
 IF v_target IS NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.rf_session_denials(organization_id,identity_subject,session_id,actor_id,reason)
 VALUES(v_org,v_target,p_session,v_actor,p_reason) RETURNING id INTO v_id;
 INSERT INTO public.rf_security_events(identity_subject,session_id,organization_id,action,detail)
 VALUES(v_subject,v_session,v_org,'session.revoked',jsonb_build_object('targetStaff',p_target_staff,'targetSession',p_session,'denialId',v_id));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.rf_revoke_member_session(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rf_revoke_member_session(uuid,uuid,text) TO rf_runtime_login;
COMMIT;
