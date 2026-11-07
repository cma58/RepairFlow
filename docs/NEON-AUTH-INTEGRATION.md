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
