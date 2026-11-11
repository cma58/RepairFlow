# PHIXAR P0 — Security recovery, WebAuthn en browser-E2E

Datum: 2026-11-10. Uitgevoerd door Claude (Opus 5.5) in een geïsoleerde cloudwerkomgeving. Uitsluitend synthetische gegevens; geen productie, geen Neon-/Vercel-account, geen secrets gebruikt of gewijzigd.

**Kernuitkomst.** Er bestaat nu één reproduceerbaar commando (`npm run test:security`) dat zonder externe toegang in ~22 s **49/49** tests uitvoert: echte PostgreSQL 16 met alle migraties, echte `api/`-entrypoints, echte Chrome met CDP-virtuele WebAuthn-authenticators. Daarbij zijn **vier echte fouten** gevonden en hersteld (F1–F4), waarvan F4 elke geldige uitnodigingsacceptatie onmogelijk maakte. **Niet alle P0-acceptatiecriteria zijn gehaald**: de echte Neon Auth-provider is niet end-to-end bewezen en beheeracties blijven bewust fail-closed tot jij een factorbeleid kiest (zie §15–18).

---

## 1. Beginstatus van de repository

| Item | Waarde |
| --- | --- |
| Repository | `cma58/RepairFlow` (publiek, gelezen via anonieme git-proxy) |
| Package manager | npm (`package-lock.json`), Node 22, CommonJS + ESM-entrypoints in `api/` |
| Architectuur | Statische frontend + 12 Vercel-functies (Hobby-limiet 12), Neon Postgres met RLS, Neon Auth (Better Auth, beheerd) |
| Tests bij start | `npm test`: **190/190 PASS** (unit/integratie met query-spies). `npm run test:e2e`: **0 PASS / 1 SKIP** |
| Browserautomatisering | **Geen.** Geen Playwright-config, geen browserdependency, geen lokale server, geen lokale database |
| CI | `tests.yml` (npm test + `node --check`), `customer-portal-tests.yml` |
| Gelezen documentatie | `ERP-STATUS.md`, `docs/NEON-AUTH-MFA-CAPABILITY-AUDIT.md` (staat in `docs/`, niet in de root), `docs/PHIXAR-MASTER-FUNCTIONAL-VISION.md`, `docs/PHIXAR-DASHBOARD-DESIGN-BRIEF.md`, `docs/PHIXAR-POS-VISION.md`, `docs/LOGIN-TEST-AND-SESSION-GATE.md`, `docs/NEON-AUTH-INTEGRATION.md`, `docs/PHIXAR-LEGACY-CLOUD-GAP-20261108.md`, `docs/PHIXAR-CLOUD-MIGRATION-REVIEW-20261108.md`, workflows |

## 2. Branch en uitgangscommit

- Uitgangsbranch: `feature/customer-portal-ipad-batch-20261107` @ `d8cf2e53c98be2b171dc4c79448dbdeb77ea6b17` (ongewijzigd gelaten).
- Werkbranch: `test/p0-webauthn-browser-e2e-recovery` (lokaal aangemaakt vanaf die HEAD).
- **Push/draft-PR: BLOCKED** — de sessie kreeg geen schrijfrechten op GitHub (zie §16). Alle commits zijn als git-bundle en patchreeks aangeleverd.

## 3. Waarom ChatGPT Work vastliep (oorzaakanalyse)

| Mogelijke oorzaak | Oordeel | Onderbouwing |
| --- | --- | --- |
| 1. Applicatiecode | **Deels** | (a) Ontwerpkeuze: CHECK `rf_webauthn_no_unproven_factor` maakt elke beheeractie per constructie onmogelijk — positieve tests *kunnen* niet slagen. (b) Latente fout F4 zou een positieve uitnodigingstest altijd laten falen (503). |
| 2. Testconfiguratie | **Ja, hoofdoorzaak** | De enige E2E (`tests/e2e/cloud-workflow.e2e.js`) draait uitsluitend tegen een echte Vercel-preview met een echte sessiecookie in `PHIXAR_E2E_SESSION_COOKIE`. Er was geen lokale harness. |
| 3. Neon Auth-integratie | Nee (niet defect bevonden) | De servercode verwerkt providerantwoorden correct; echte provider niet getest (BLOCKED). |
| 4. WebAuthn-implementatie | Nee | Werkt met echte cryptografie in echte Chrome. Wel twee hiaten (F2, F3). |
| 5. Browserautomatisering | **Ja** | Bestond niet in de repository. |
| 6. Testaccounts/fixtures | **Ja** | Geen synthetische loginroute; magic link vereist een mailbox. |
| 7. Omgevingsvariabelen | **Ja** | `PHIXAR_E2E_SESSION_COOKIE`, `REPAIRFLOW_WEBAUTHN_RP_ID` op de preview ontbraken (503 gedocumenteerd). |
| 8. Uitvoeringsomgeving | **Ja** | Zonder mailbox/providertoegang geen echte sessie. |
| 9. Combinatie | **Ja — 2+5+6+7+8, versterkt door 1** | |

## 4. Gevonden fouten (gereproduceerd vóór herstel)

| ID | Ernst | Fout | Reproductie |
| --- | --- | --- | --- |
| **F1** | Middel | `/api/auth/me` negeerde app-sessie-intrekking (`rf_session_denials`) | Echte browser: na "alle sessies intrekken" gaf `/api/workspace` 403, maar `/api/auth/me` nog `{authenticated:true, role:'manager'}` |
| **F2** | **Hoog** | Een tweede verse primaire sessie kon een **eigen** sleutel registreren zonder bezit van de bestaande sleutel te bewijzen | Echte browser: gestolen verse sessie registreerde eigen authenticator → 2 credentials. Zodra een factorbeleid actief wordt, is dit een volledige MFA-bypass |
| **F3** | Laag | Dubbele credential-ID (23505) rolde de transactie terug → verbruikte challenge werd weer bruikbaar | Unit-reproductie (query-spy) |
| **F4** | **Hoog (functioneel)** | `rf_accept_member_invitation` faalt bij **elke geldige** acceptatie: SQLSTATE 42702 (`organization_id` dubbelzinnig met OUT-kolom) → HTTP 503 | Echte PostgreSQL 16: `column reference "organization_id" is ambiguous … line 19`. Eerdere Neon-proeven raakten alleen de negatieve paden die eerder stoppen |

Tijdens het testen ook gecontroleerd en **correct** bevonden (geen fout): rate limit 5 challenges/sessie/15 min (429), clone-detectie via signature counter, eenmalige challenges onder race, RLS-isolatie van credentials/grants/challenges, CHECK op `independent_factor`, 12-uurslimiet, tenantcontext uit server-config.

## 5. Onderliggende oorzaken

- **F1**: `api/staff-session.js` riep `requireCurrentSession` niet aan in de niet-dynamische modus; alleen `withWorkspace` deed dat.
- **F2**: `begin()` eiste voor registratie alleen een primaire sessie < 5 min; geen bezitsbewijs van een bestaande factor en geen serialisatie per subject.
- **F3**: `INSERT` zonder savepoint; de `catch` gooide 23505 door naar een volledige `ROLLBACK`.
- **F4**: PL/pgSQL-variabelenconflict tussen `RETURNS TABLE(organization_id, branch_id)` en ongekwalificeerde kolomnamen.

## 6. Uitgevoerde correcties

| Commit | Correctie |
| --- | --- |
| `5c20fa0` | Test-harness + veilige dependency-forwarding in `api/*` (alleen met `Symbol.for('phixar.isolated-test-deps')`; productie `handler(req,res)` ongewijzigd, niet te forceren vanuit HTTP/JSON) |
| `55fe3c3` | **F1**: cookie-sessies in `/api/auth/me` doorlopen `requireCurrentSession` vóór rolresolutie |
| `626d82f` | **F2/F3**: extra sleutel vereist live grant van een bestaande, niet-ingetrokken sleutel in dezelfde sessie/tenant (403 `step_up_required`), opnieuw gecontroleerd bij `finish` onder `pg_advisory_xact_lock` per subject; savepoint rond de insert; DB-fouten blijven 503, bibliotheekfouten blijven geauditeerde weigeringen; UI-melding in `security.html` |
| `73a4645` | **F4**: additieve migratie `012-invitation-accept-fix.sql` (`CREATE OR REPLACE`, volledig gekwalificeerd; signatuur, rechten en semantiek gelijk; geen data gewijzigd) |
| `63e002e` | Security-integratie- en browser-E2E-suite, CI-workflow |
| `069ff9a` | ERP-regressie in echte browser via de bestaande phase21-runner |

Geen authenticatiecontrole uitgeschakeld, geen beveiligingseis verlaagd, Neon Auth niet vervangen, dynamische context blijft standaard uit.

## 7. Gewijzigde bestanden

Productiecode: `api/staff-session.js`, `api/security.js`, `api/workspace.js`, `api/contexts.js`, `api/auth/me.js`, `api/auth/session.js`, `api/auth/logout.js`, `lib/webauthn-step-up.js`, `lib/webauthn-handler.js`, `lib/test-deps.js` (nieuw), `security.html`, `db/migrations/012-invitation-accept-fix.sql` (nieuw).
Tests/infra: `tests/harness/{postgres,synthetic-neon-auth,app-server,browser}.js`, `tests/integration/security-db.integration.js`, `tests/e2e/security.browser.js`, `tests/e2e/erp-regression.browser.js`, `tests/webauthn-enrollment-guard.test.js`, `tests/staff-session-revocation.test.js`, `tests/test-deps.test.js`, `tests/auth-boundary.test.js` (regex accepteert doorgegeven deps; delegatie-eis aangescherpt), `.github/workflows/security-e2e.yml`, `.gitignore`, `package.json` (+devDeps `playwright-core@1.63.0`, `pg@8.23.1`, script `test:security`).
Vercel-functies: nog steeds **12** (geen nieuw bestand in `api/`).

## 8. Nieuwe tests

- **Unit (7)**: F1, F2 (zonder/met grant, race), F3, bibliotheekfout-code, test-deps-marker. Bewezen dat 5 ervan **falen op de oude code**.
- **Integratie echte PostgreSQL (12)**: migraties, runtime-rol zonder BYPASSRLS, RLS lezen/schrijven per tenant, credential-isolatie, CHECK `independent_factor`, binding grants/challenges, append-only audit, SQL-beheerfuncties fail-closed, geen directe schrijfpaden, contextdiscovery na intrekking, F4-regressie.
- **Browser security (32)**: scenario A–D, zie §10.
- **Browser ERP-regressie (5)**: bestaande runner `tests/e2e/repair-phase21.html` ongewijzigd (8 scenario’s + herlaadcontrole + installatie/annulering), kassa/voorraad/dagafsluiting, rollen.

## 9. Testcommando’s en werkelijke resultaten

Omgeving: Linux x64, Node v22.23.4, PostgreSQL 16.15, Google Chrome for Testing 153.0.8010.12 (headless), playwright-core 1.63.0, @simplewebauthn/server 14.1.0 / browser 14.0.0.

```bash
npm ci
npm test                 # unit/integratie met spies
npm run test:security    # echte PostgreSQL + echte Chrome (integratie + alle *.browser.js)
npm run test:e2e         # bestaande opt-in test tegen echte Vercel-preview
```

| Categorie | Status | Commando / bewijs | Aantallen |
| --- | --- | --- | --- |
| Typecheck | **NOT RUN** | Geen TypeScript/type-checkconfig in de repo | – |
| Lint | **NOT RUN** | Geen linterconfig in de repo. Wel CI-equivalente syntaxcontrole `node --check`: **PASS** | 118 bestanden |
| Unit tests | **PASS** | `npm test` | 197/197, 0 skip |
| Integratietests (echte PG) | **PASS** | `npm run test:security` | 12/12 |
| Build | **PASS (lokaal) / NOT RUN (Vercel)** | Geen buildstap; alle 12 entrypoints laden als module. Geen Vercel-build/deploy uitgevoerd (niet toegestaan/geen toegang) | 12/12 |
| Browser-E2E lokaal | **PASS** | `npm run test:security` | 37/37 (32 security + 5 ERP) |
| Browser-E2E tegen echte preview + echte Neon Auth | **BLOCKED** | Geen providertoegang/testaccounts/sessie | – |
| WebAuthn registratie + verificatie | **PASS** | A3, A4, A7 — echte crypto, **virtuele** authenticator | – |
| Negatieve MFA-tests | **PASS** | A2, A2b, A3b, A5, A5b, A5c, A5r, A6, A8 | – |
| Sessiebeveiliging | **PASS** | Strikt: C2/C8, C9. Positieve intrekking: **POLICY-SIMULATED** (C1–C7) | – |
| Uitnodigingen | **PASS (POLICY-SIMULATED)** | B1–B8; strikt: uitgifte fail-closed. E-mailbezorging: NOT RUN | – |
| Tenantisolatie | **PASS** | D2–D7b + integratie RLS | – |
| Regressietests ERP | **PASS** | 197 unit + R1–R5 in echte browser | – |
| Bestaande opt-in deployment-E2E | **NOT RUN** | `npm run test:e2e` → 0 pass / 1 skipped (geen sessiecookie) | telt niet als geslaagd |
| Nieuwe GitHub Actions-workflow | **NOT RUN** | Niet gepusht (BLOCKED) | – |

Stabiliteit: `npm run test:security` 5× na elkaar 100% geslaagd. Ontbrekende PostgreSQL ⇒ exit 1 (0 pass, 12 fail, 32 cancelled, **0 skipped**) — niets wordt stil overgeslagen.

## 10. Browser-E2E-bewijs

Echte Chrome per `BrowserContext` = onafhankelijk profiel (eigen cookiejar, opslag en authenticator). Alle aanvragen lopen via `fetch` vanuit de echte pagina met de HttpOnly-cookie; de UI-stappen klikken op de echte knoppen van `security.html` en `accept-invitation.html`. TLS: tijdelijk zelfondertekend certificaat dat Chrome via een SPKI-pin als geldig accepteert (secure context; geen globale TLS-bypass).

Artefacten na elke run in `test-results/security-e2e/`: Playwright-traces per browsersessie (28 zips in de laatste run), screenshots (`A3-registration-ui.png`, `A7-step-up-required-ui.png`, `B3-invitation-accepted-ui.png`, `R1-phase21-runner.png`) en `evidence.json` (32 controles: 19 `strict`, 13 `policy-simulated`). CI uploadt deze als artifact `security-e2e-evidence`.

**Wat is gesubstitueerd en dus niet bewezen**: (1) Neon Auth-provider → synthetische `/get-session` en `/sign-out` met dezelfde responsvorm; (2) Neon-netwerkdriver → `pg`-Pool naar lokale PostgreSQL als `rf_runtime_login`; (3) Vercel-runtime → lokale HTTPS-server die dezelfde entrypoints aanroept. Magic-link-aanvraag en callback zijn bewust **niet** gemount.

**POLICY-SIMULATED** betekent: in een **aparte** testdatabase wordt de CHECK verwijderd en wordt een grant pas als onafhankelijk gemarkeerd **nadat** een echte WebAuthn-verificatie in diezelfde sessie slaagde. Dit test de downstream-poorten (intrekking, uitnodigingen), **niet** dat de huidige factor onafhankelijk is. De strikte database houdt de gecommitte policy intact.

## 11. WebAuthn-bewijs

| Controle | Resultaat |
| --- | --- |
| Server-side challenge, 3 min geldig, eenmalig | PASS (A4, A5, A5c) |
| Gelijktijdige 3× indiening van één assertion | Precies één 200, twee 400 (A5) |
| Binding gebruiker en sessie | Replay in andere sessie/andere gebruiker → 400 (A5b) |
| RP ID / origin | Gepind op serverconfig; externe origin → 403 (bestaande unit) |
| Cryptografische verificatie | Echte SimpleWebAuthn-verificatie van echte Chrome-handtekeningen (Chrome koos Ed25519; 42-byte COSE-sleutel) |
| Opslag | Alleen publieke sleutel, counter, transports; geen private-/secret-kolommen (A3) |
| Counter / kloon | Lagere counter dan opgeslagen → geweigerd (A8; ook onbedoeld bevestigd bij A7) |
| Rate limit | 6e challenge in 15 min → 429 (A5r) |
| Tweede factor verplicht | Beheeracties na alleen primaire login → 403 (A2) |
| Vóór/na MFA | Strikt: ook na echte WebAuthn 403 (A6, by design). Policy-simulated: 200, en na verlopen grant weer 403 (A7p, A8p) |
| Extra sleutel registreren | Alleen na step-up met bestaande sleutel (A7, F2) |

## 12. Neon Auth-integratiestatus — **BLOCKED / niet bewezen**

Bewezen: RepairFlow's verwerking van de providerrespons (`verifySession`: sessie-ID, createdAt, expiresAt, 12-uurslimiet, cookieparsing, sign-out). Niet bewezen: echte Better Auth-sessies, magic-link-flow, echte cookie-namen/-attributen van de provider, providerbrede intrekking (`revokeUserSession(s)`), echte mailboxverificatie. Neon Auth heeft volgens de eerdere audit geen beheerde MFA; de app-eigen WebAuthn-laag blijft de juiste architectuur.

## 13. Sessiebeveiligingsstatus

- Bewezen (strikt): >12 u oude sessie 401, provider-verlopen sessie 401, uitgelogde sessie 401, intrekking via de route fail-closed.
- Bewezen (policy-simulated): twee onafhankelijke contexten van dezelfde gebruiker hebben aparte sessies; één sessie intrekken weigert die sessie op workspace GET/POST, `/api/auth/me` (F1) en securityroutes, terwijl de andere blijft werken; "alle sessies" weigert bestaande sessies en laat een nieuwe login toe; MFA-status is niet overdraagbaar naar een andere sessie of na uitloggen; tenant-overschrijdende intrekking geweigerd.
- Niet bewezen: providerbrede intrekking; bearer-JWT-pad van `/api/auth/me` kent geen sessie-ID en negeert dus app-intrekking (laag risico: workspace accepteert alleen cookies).

## 14. Tenantisolatiestatus

Bewezen met twee volledig gescheiden synthetische tenants en vier rollen: lezen/schrijven blijft binnen de servertenant; vervalste tenant-ID in body/query genegeerd (rij landt in A); eigenaar van B geweigerd op A; verkoper geweigerd op de brede werkruimte; gemanipuleerde contextheader geweigerd zolang dynamische context uit staat; RLS weigert directe cross-tenant insert (42501). Dynamische context is **alleen op een geïsoleerde testinstantie** getest (vreemde en niet-toegewezen context 403; discovery toont enkel eigen contexten). **De productievlag blijft uit.**

## 15. Resterende blokkades

1. **Factorbeleid (jouw beslissing)**: zolang de CHECK `independent_factor=false` afdwingt, kan geen enkele beheeractie (uitnodigen, intrekken) in productie werken.
2. Echte Neon Auth-E2E (provider, magic link/e-mail+wachtwoord, providerintrekking).
3. Geen herstel-/intrekkingsflow voor verloren of gestolen sleutels (bestaat nog niet).
4. Eerste sleutelregistratie vereist alleen een primaire sessie < 5 min (geen goedkeuring door een andere beheerder).
5. Migratie 012 is nog niet op de geïsoleerde Neon-branch toegepast.
6. Push/draft-PR niet uitgevoerd (geen schrijfrechten in deze sessie).

## 16. Nog benodigde externe toegang

- **GitHub-schrijfrechten** voor deze sessie, óf jij pusht de aangeleverde bundle (commando’s in de oplevering).
- Voor echte provider-E2E op een **geïsoleerde** omgeving: Neon-branch met Neon Auth, twee synthetische testgebruikers met e-mail+wachtwoord (de branch heeft e-mail/wachtwoord aan, dus geen mailbox nodig), als GitHub-secrets; een Vercel-preview met `REPAIRFLOW_WEBAUTHN_RP_ID`; runtime- en owner-URL van die branch (owner alleen om 012 toe te passen). Nooit productiecredentials.

## 17. Beveiligingsrisico’s

| Risico | Ernst | Status |
| --- | --- | --- |
| F2 MFA-bypass via extra sleutel | Hoog | Hersteld en bewezen |
| F4 uitnodigingen onbruikbaar | Hoog (functioneel) | Hersteld (012), op Neon nog toe te passen |
| Eerste enrollment zonder goedkeuring | Middel | Open — ontwerpbeslissing |
| Geen herstel/intrekking van sleutels | Middel | Open — bouwen vóór policy-activering |
| Grant niet per specifieke actie (5 min voor alle beheeracties) | Middel | Open |
| Rate limit alleen per sessie, niet per subject/IP | Laag–middel | Open |
| Bearer-pad `/api/auth/me` zonder app-intrekking | Laag | Open, gedocumenteerd |
| E-mailenumeratie via `request-link` (`account_not_invited`) | Laag | Open |
| `db-health` verwacht exact 15 `rf_`-tabellen (verouderd) | Laag | Buiten scope, genoteerd |

## 18. Advies voor de volgende fase

1. **Beslis het factorbeleid** (vereist jouw akkoord): (a) elke user-verified WebAuthn-sleutel geldt als tweede factor (gangbaar, phishingbestendig), of (b) alleen hardware-sleutels via `attestationType:'direct'` + AAGUID-allowlist/FIDO MDS en `backed_up=false`. Daarna een additieve migratie die `independent_factor` alleen toestaat voor credentials die aan dat beleid voldoen — niet de CHECK simpelweg verwijderen.
2. Bouw vóór activering: sleutelbeheer (lijst/intrekken), herstelprocedure met onafhankelijke identiteitscontrole, en goedgekeurde eerste enrollment.
3. Pas 012 toe op de geïsoleerde Neon-branch; draai daarna de bestaande negatieve Neon-proeven + één positieve acceptatie.
4. Voeg een opt-in provider-E2E toe met twee synthetische e-mail+wachtwoordaccounts op een preview; dezelfde scenario’s A–D.
5. Bind grants aan actie (bijv. `purpose`-kolom) en voeg rate limiting per subject/IP toe.
6. Dynamische context pas inschakelen na stap 4 met echte lidmaatschappen.

Geen merge, deployment of productiewijziging uitgevoerd.

## 19. Onafhankelijke overdrachtscontrole door ChatGPT Work (2026-11-10)

Dit is een aanvulling op het oorspronkelijke rapport; de historische opmerkingen hierboven over ontbrekende GitHub-schrijftoegang, niet uitgevoerde CI en niet toegepaste migratie 012 beschrijven de situatie **vóór** deze overdracht.

- De incrementele bundle is lokaal met `git bundle verify` gecontroleerd en de zeven commits zijn geanalyseerd. Een afzonderlijke `git am`-replay van de mbox gaf dezelfde eindboom `bf7fdb146c621cc3293ce5ca0b38433581eef31a`; `git diff --check` was schoon.
- De shell kon niet met GitHub authenticeren voor een integrale Git-push. De zeven logische commits zijn daarom via de GitHub-koppeling opnieuw aangemaakt op uitsluitend `test/p0-webauthn-browser-e2e-recovery`. De oorspronkelijke commit-SHA's en auteursmetadata zijn **niet** behouden; de gepubliceerde boom na de zevende commit `c866fdd9310bc31ea7092a7a55c5ea827ddc8cc1` is byte-identiek met de bundle-eindboom. De featurebranch bleef op `d8cf2e53c98be2b171dc4c79448dbdeb77ea6b17`.
- Lokaal: `npm ci` en `npm test` geslaagd (197/197, nul skips); syntax en diffcontrole geslaagd. `npm run test:security` kon lokaal niet slagen omdat PostgreSQL-binaries ontbreken (0 pass, 12 fail, 37 cancelled). Dit is geen geslaagde lokale securityrun.
- GitHub Actions-run [42750745270](https://github.com/cma58/RepairFlow/actions/runs/42750745270) op de gepubliceerde boom: 197/197 unit en 49/49 security-, PostgreSQL- en browsercontroles geslaagd, nul failures en nul skips. Het [artifact](https://github.com/cma58/RepairFlow/actions/runs/42750745270/artifacts/13732843564) bevat 33 bestanden, waaronder traces, schermafbeeldingen en `evidence.json` (19 strict, 13 policy-simulated browsercontroles).
- Migratie 012 is uitsluitend op geïsoleerde Neon-branch `br-purple-king-ban17e74` toegepast. De positieve acceptatietest liep in GitHub Actions tegen tijdelijke PostgreSQL; de echte Neon Auth-providerketen blijft onbewezen.
- [Draft PR #28](https://github.com/cma58/RepairFlow/pull/28) richt zich op de bestaande featurebranch. Geen merge, productie-deploy of echte accountmigratie uitgevoerd. De P0-blokkades in §15 blijven gelden, behalve de inmiddels uitgevoerde GitHub-publicatie en testbranchmigratie.
