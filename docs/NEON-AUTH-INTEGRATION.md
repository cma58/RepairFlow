# Neon Auth / RepairFlow — beveiligde aansluiting (2026-11-07)

## Gecontroleerd in Neon
- Project: `repairflow-db`, branch `main`, database `neondb`.
- Neon Auth is geprovisioneerd (Better Auth).
- Issuer/base URL: `https://ep-rough-cake-ba03t8v8.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth`
- JWKS URL: `https://ep-rough-cake-ba03t8v8.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth/.well-known/jwks.json`
- Op dit moment zijn **registratie zonder uitnodiging ingeschakeld**, **e-mailverificatie niet vereist** en **localhost toegestaan**. Deze instellingen moeten vóór publiek gebruik worden verhard.
- De juiste JWT `aud` claim en het feitelijke tokenuitgiftepad moeten met een testaccount worden bevestigd. Veronderstel niet dat elk Better Auth sessietoken een JWT is.

## Serverroute
- `GET /api/staff-session` vereist een cryptografisch geverifieerde Bearer JWT, gecontroleerde issuer/audience, én een actieve `rf_staff`-rij.
- Zonder `REPAIRFLOW_RUNTIME_DATABASE_URL`, `REPAIRFLOW_ORGANIZATION_ID` en `REPAIRFLOW_BRANCH_ID` blijft de route op 503 (geen toegang).
- Alleen een aparte **beperkte** runtime-rol mag aan de runtime URL gekoppeld worden. **Nooit** `DATABASE_URL` met database-eigenaar voor medewerkersrequests gebruiken.
- De 15 RepairFlow-tabellen hebben FORCE RLS en nog geen policies. Deze endpoint zal daarom nog niet succesvol een medewerker vinden met een beperkte rol.
- De bestaande Vercel-variabelen `DATABASE_URL` en Neon Auth URL mogen niet als bewijs van volledige login-activatie worden beschouwd.

## Volgorde vóór livegang
1. Neon Auth-signup en e-mailverificatie veilig configureren, trusted origins beperken.
2. Verifieer echte JWT-claims en sessiestroom met een geautoriseerde PHIXAR-testmedewerker.
3. PHIXAR-organisatie, vestiging en medewerker bewust aanmaken na identiteitscontrole; niet op basis van ongeverifieerde e-mail.
4. Runtime database role zonder BYPASSRLS en minimale grants instellen; tenant- en branch-RLS policies en tests voor kruislingse toegang uitvoeren.
5. Alleen de runtime database URL als geheim toevoegen in Vercel; de organisatie- en vestigings-ID's configureren.
6. Pas daarna echte browserlogin en synchronisatie activeren. Lokale browserdata eerst veilig exporteren.

Geen productie-uitrol uitgevoerd.


## Live configuratie uitgevoerd op 2026-11-07
- Neon Auth `main`: `disable_sign_up=true`, `require_email_verification=true`, `send_verification_email_on_sign_in=true`, `revoke_sessions_on_password_reset=true`, `allow_localhost=false`.
- Trusted redirect origin: `https://repair-flow-theta.vercel.app`.
- Database rol `repairflow_runtime_reader` aangemaakt als `read_only` voor `neondb.public`. Verifieerd: `rolbypassrls=false`, `rolsuper=false`. Query onder die rol geeft 0 zichtbare organisaties; geen policies aanwezig.
- De aangemaakte rol heeft een eigen credential; **niet** in GitHub, logs of browser opgeslagen. Nog niet aan Vercel gekoppeld.
- De applicatie gebruikt deze rol nog niet. `/api/staff-session` blijft fail-closed omdat `REPAIRFLOW_RUNTIME_DATABASE_URL` en tenant-/vestigingsinstellingen ontbreken.
- Bestaande auth-gebruikers kunnen door verplichte e-mailverificatie opnieuw verificatie nodig hebben; nieuwe self-signup is bewust geblokkeerd.


## PHIXAR bootstrap bevestigd (2026-11-07)
- `rf_organizations`: PHIXAR — `b7c7eeac-d1cc-42a3-bd09-d25a2280f474`
- `rf_branches`: PHIXAR Gent — `cd8c7cb9-66c1-40d5-b049-fa324d99607a`
- Vestiging: Brusselsesteenweg 103, 9050 Gent.
- `neon_auth.user` bevat 0 gebruikers; `rf_staff` bevat 0 medewerkers. Er is bewust geen nep-eigenaar aangemaakt.
- Na bootstrap gecontroleerd met `repairflow_runtime_reader`: 0 zichtbare organisaties. RLS blijft fail-closed.
- Configuratiewaarden voor toekomstige veilige serverruntime: `REPAIRFLOW_ORGANIZATION_ID=b7c7eeac-d1cc-42a3-bd09-d25a2280f474` en `REPAIRFLOW_BRANCH_ID=cd8c7cb9-66c1-40d5-b049-fa324d99607a`. Dit zijn niet-geheime identifiers, **geen authenticatie**.
- Eerst echte geverifieerde Neon Auth-gebruiker, JWT-claims en veilige RLS-policies testen; geen runtime toegang of POS-API openen.
