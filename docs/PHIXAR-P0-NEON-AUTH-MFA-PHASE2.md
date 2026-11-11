# PHIXAR P0 — Fase 2: MFA-beleid, passkeys, sleutelbeheer en verificatie

Datum: 2026-11-10. Branch `test/p0-webauthn-browser-e2e-recovery`, draft PR #28 (doel `feature/customer-portal-ipad-batch-20261107`, ongewijzigd). Geen merge, deploy of productiehandeling. Uitsluitend synthetische gegevens.

**Kernuitkomst.** Het eigenaarsbesluit *optie A* is geïmplementeerd als een door de **database** afgedwongen factorbeleid. Beheeracties werken nu **strikt** (zonder gesimuleerd beleid) en uitsluitend na een onafhankelijke, doelgebonden en eenmalige step-up. De eerste sleutel kan niet via een verse primaire login alleen actief worden. Sleutelbeheer, blokkeren bij verlies en herstel zijn gebouwd. Lokaal en in GitHub Actions: **209/209 unit** en **65/65 security/DB/browser**, 0 overgeslagen. **Nog niet bewezen:** de echte Neon Auth-provider (suite klaar, BLOCKED zonder secrets) en migratie 013 op de geïsoleerde Neon-branch (geen Neon-toegang in deze sessie).

> **Bijgewerkt in fase 3 (2026-11-10)** — zie `docs/PHIXAR-P0-NEON-AUTH-VERIFICATION.md`.
> - Migratie 013 is inmiddels toegepast en geverifieerd op de geïsoleerde Neon-testbranch (was hier BLOCKED).
> - De provider-workflow start nu bij een push naar deze branch en gebruikt repository-secrets. De hieronder in §16 stap 3 beschreven `gh workflow run` en de environment `neon-auth-e2e` werken **niet** zolang het workflowbestand niet op de standaardbranch staat.
> - De echte provider-E2E en echte passkeys zijn nog steeds niet uitgevoerd.

---

## 1. Uitgangssituatie en actuele commit

| Item | Waarde |
| --- | --- |
| Start-HEAD | `fcb053e76c5bdbac2e4de6d4b99ab885d77d4b07` (draft PR #28, CI groen) |
| Uitgangsresultaten | 197 unit, 49 security/browser; positieve beheerpaden alleen POLICY-SIMULATED |
| Toegang deze sessie | GitHub push + PR via REST: **ja**. Neon: **geen tool en geen netwerkroute**. Vercel: gekoppeld account bevat het RepairFlow-project **niet**. Shell bereikt alleen GitHub en pakketregisters |
| Commits fase 2 | `85edbca` beleid/server, `bb24cfb` UI, `a301b81` strikte browser-E2E, `3da185e` provider-E2E, plus deze documentatiecommit |

## 2. Uitgevoerde wijzigingen

- **Migratie 013** `db/migrations/013-mfa-factor-policy.sql` (additief, data behouden).
- **Server**:
  - `lib/webauthn-step-up.js` (doel per ceremonie, pending/goedgekeurde enrollment, grants alleen via DB-functie, UV verplicht bij registratie en verificatie);
  - `lib/webauthn-handler.js`;
  - nieuw `lib/security-transaction.js` en `lib/credential-management.js`;
  - `lib/management-session.js` en `lib/member-invitations.js`: doelgebonden step-up;
  - `api/security.js`: nieuwe acties in dezelfde functie, dus nog steeds **12** Vercel-functies.
- **Operatorprocedure**: `scripts/mfa-bootstrap-code.js`.
- **UI**: `security.html` met status, registratie, activatie, step-up per handeling, intrekken/blokkeren, eigenaarspaneel en beleid.
- **Tests**:
  - 7 nieuwe unit (`tests/credential-management.test.js`) en herschreven enrollment/step-up-unittests;
  - 12 nieuwe DB-bewijzen (`tests/integration/mfa-policy.integration.js`);
  - 36 strikte browserscenario's (`tests/e2e/security.browser.js`);
  - opt-in echte provider-suite (`tests/provider/`, `npm run test:provider`, workflow `neon-auth-provider-e2e.yml`).

## 3. MFA- en factorbeleid (optie A)

Toegestaan: passkeys (Touch ID/Face ID/Windows Hello/Android, ook gesynchroniseerd) en FIDO2-sleutels. Geen beperking meer tot `cross-platform`. User verification is **verplicht**. `UV=true` alleen maakt een sleutel niet onafhankelijk.

Een grant is **onafhankelijk** alleen als de database dit allemaal kan aantonen:

1. De app heeft de assertion cryptografisch geverifieerd met UV, origin, RP ID, challenge en counter. Daarna roept ze `rf_record_webauthn_assertion` aan, het **enige** schrijfpad naar grants.
2. De challenge is van hetzelfde subject, dezelfde sessie en tenant, van het type `authentication`, verbruikt, levert maximaal één grant op, met een vooraf verklaard **doel**:
   - `session.revoke`
   - `invitation.manage`
   - `credential.manage`
   - `credential.approve`
   - `policy.manage`
3. De sleutel hoort bij het subject en is niet ingetrokken of geblokkeerd.
4. De sleutel heeft een **actieve goedkeuring voor deze tenant**, verkregen via een pad dat niet alleen op de primaire Neon-sessie steunt (§4).
5. Het tenantbeleid voor gesynchroniseerde passkeys is gerespecteerd. Standaard volgens optie A staan ze aan. De eigenaar kan ze uitzetten (met step-up). Dan telt een `backedUp`-assertion niet als onafhankelijk.

Daarnaast geldt:

- Step-ups zijn **eenmalig** en verlopen na 5 minuten. Ze worden atomisch verbruikt door de beheerfunctie zelf (`rf_consume_step_up`), dus één bevestiging is precies één handeling.
- De oude CHECK `NOT independent_factor` is in dezelfde transactie vervangen door een **strengere** row-CHECK (UV, doel ≠ `credential.activate`, challenge en backup-vlag verplicht) plus een guard-trigger die regels 3–5 opnieuw controleert. Die trigger geldt ook voor de owner-rol.
- Vertrouwensgrens: de database kan een WebAuthn-handtekening niet zelf verifiëren. Een gecompromitteerde runtime kan wel een assertion “claimen”, maar alleen voor een **goedgekeurde** sleutel van het **eigen** subject in de **eigen** sessie, en eenmalig. Een eigen sleutel goedkeuren, ontblokken of een grant direct schrijven kan ze niet.

## 4. Eerste enrollment en herstel

| Pad | Wanneer | Waarborgen |
| --- | --- | --- |
| **Bootstrap (operator)** | Eerste beheerder, geen andere eigenaar | Code alleen aanmaakbaar met de owner-DB-rol (`scripts/mfa-bootstrap-code.js`), 130 bit, alleen als SHA-256-hash opgeslagen, 15 min geldig (CHECK ≤ 30), eenmalig, ongeldig na 5 fouten, gebonden aan tenant en subject. Inwisselen vereist een verse `credential.activate`-verificatie met **de nieuwe sleutel** in dezelfde sessie. Volledig geaudit. Script weigert zonder actieve eigenaar/manager, geverifieerd e-mailadres of als er al een goedgekeurde sleutel is |
| **Goedkeuring door eigenaar** | Medewerker (manager) of tweede eigenaar | Andere eigenaar met eigen onafhankelijke step-up (`credential.approve`), **vingerafdruk** van de sleutel persoonlijk vergeleken, geen zelfgoedkeuring, alleen binnen de eigen tenant |
| **Step-up met goedgekeurde sleutel** | Extra/back-upsleutel | Verbruikt `credential.manage` en keurt de nieuwe sleutel atomisch goed (finding F2 blijft gedekt) |

- **Gestolen primaire sessie:** kan maximaal een *pending* sleutel registreren. Zonder out-of-band code of goedkeuring wordt die nooit actief. De code van de eigenaar activeert alleen de sleutel die in díe sessie is bewezen. Een pending aanvallerssleutel blokkeert de eigenaar niet. Hoogstens 3 pending sleutels per subject.
- **Verlies of diefstal:** “Blokkeren” kan zonder sleutel, maar vereist een login van ≤ 10 minuten oud. Het blokkeert de sleutel overal, trekt de goedkeuringen in en **beëindigt alle sessies** van die persoon in de tenant.
- **Herstel:** daarna een nieuwe sleutel registreren, die blijft *pending*, en vervolgens een nieuwe goedkeuring door een eigenaar of, als die er niet is, een operator-*herstelcode*. E-mail of een bestaande sessie alleen is nooit genoeg.

## 5. Databasewijzigingen (migratie 013)

**Nieuwe kolommen en tabellen:**
- Credential-kolommen: `aaguid`, `attestation_format`, `user_verified`, `backed_up_last`, `blocked_at`, `block_reason`.
- Tabellen: `rf_webauthn_approvals` (per tenant), `rf_mfa_bootstrap_codes` (runtime heeft **geen** rechten), `rf_organization_security_policy`.
- `purpose` en `grant_issued_at` op challenges; `purpose`, `consumed_at`, `user_verified`, `backed_up` en `challenge_id` op grants.

**Rechten:**
- Kolomrechten voor de runtime: credentials alleen INSERT van publieke velden en UPDATE van counter/gebruik; challenges alleen UPDATE `consumed_at`.
- Grants: geen INSERT/UPDATE meer.

**Functies:**
- Definer-functies `rf_record_webauthn_assertion`, `rf_consume_step_up` (intern), `rf_redeem_mfa_bootstrap`, `rf_approve_own_credential_by_step_up`, `rf_approve_member_credential`, `rf_revoke_member_credential`, `rf_revoke_own_credential`, `rf_block_own_credential`, `rf_own_security_status`, `rf_member_security_overview`, `rf_set_security_policy`.
- `rf_revoke_member_session`, `rf_issue_member_invitation` en `rf_revoke_member_invitation` zijn vervangen: dezelfde controles, nu met doelgebonden verbruik.

**Gevolg voor bestaande data:** bestaande sleutels blijven **pending** (fail-closed) en bestaande grants zijn als verbruikt gemarkeerd.

## 6. Testomgeving

Ongewijzigde aanpak uit fase 1:
- tijdelijke PostgreSQL 16 met **alle** 16 schema-/migratiebestanden;
- echte `rf_runtime_login` (NOBYPASSRLS);
- echte `api/`-entrypoints;
- echte Chrome 153 met CDP-virtuele authenticators: USB-sleutel, sleutel zonder UV-vermogen en gesynchroniseerde passkey (`defaultBackupEligibility/State`).

De Neon Auth-respons is **synthetisch** (dus geen provider-E2E). Kopieën van een sleutel krijgen altijd de hoogste counter, zodat de klonendetectie actief blijft.

Commando's: `npm test`, `npm run test:security`, `npm run test:provider` (opt-in).

## 7. Exacte testresultaten

| Categorie | Status | Bewijs |
| --- | --- | --- |
| Unit | **PASS** 209/209, 0 skip | lokaal en Actions-run 42754435122 (`a301b81`) |
| DB-integratie fase 1 | **PASS** 12/12 | `security-db.integration.js` |
| DB-integratie MFA-beleid | **PASS** 12/12 | `mfa-policy.integration.js` |
| Browser security (strikt) | **PASS** 36/36 | `security.browser.js`, screenshots + traces + `evidence.json` (36× `strict`, 0× policy-simulated) |
| Browser ERP-regressie | **PASS** 5/5 | bestaande phase21-runner (8 scenario's), kassa, rollen |
| `test:security` totaal | **PASS** 65/65, 0 skip/cancel | lokaal en Actions-run 42754434917 (artifact `security-e2e-evidence`) |
| Echte Neon Auth-provider | **BLOCKED** | `npm run test:provider` → exit 1, 0 pass, 7 cancelled, 0 skipped: secrets ontbreken |
| Migratie 013 op geïsoleerde Neon-branch | **BLOCKED** | geen Neon-toegang |
| Vercel-preview met fase-2-code | **NOT RUN** | project niet in het gekoppelde Vercel-account |
| Fysieke sleutel / echte platform-passkey | **NOT RUN** | alleen virtuele authenticators |
| Typecheck / lint | **NOT RUN** | geen configuratie in de repo; `node --check` alle bestanden **PASS** |
| POLICY-SIMULATED | **0 tests** | volledig vervangen door strikte paden |

## 8. Echte Neon Auth-E2E

Status: **BLOCKED** (voorbereid, niet uitgevoerd, nooit als PASS gerapporteerd).

De suite `tests/provider/neon-auth.provider.js` werkt met een synthetische gebruiker met e-mail/wachtwoord op een geïsoleerde branch. Ze controleert:
- cookieattributen (Secure, HttpOnly, SameSite, Path);
- acceptatie door `verifySession`, met UUID-sessie-ID en verse `createdAt`;
- twee onafhankelijke sessies;
- uitloggen van één sessie, en dat de oude cookie niet herbruikbaar is;
- providerbrede `revoke-sessions` en een nieuwe login daarna;
- vervalste en gemanipuleerde tokens;
- optioneel de echte handlers tegen de echte geïsoleerde database (harness `realEnv`, niets gesubstitueerd).

Ze draait alleen via `workflow_dispatch` in GitHub-environment `neon-auth-e2e`. Niet automatisch getest: verlopen providersessies (niet te forceren zonder providerbeheer) en de magic-link-mailbox. De endpointnamen volgen Better Auth (`/sign-in/email`, `/sign-out`, `/revoke-sessions`) en zijn nog niet tegen Neon bevestigd.

## 9. WebAuthn-beveiliging (strikt bewezen)

- Ongeldige, vervalste en verlopen challenges geweigerd.
- Replay geweigerd; 3 gelijktijdige indieningen leveren er precies 1 op.
- Rate limit: 6e challenge geeft 429.
- Binding aan sessie en gebruiker.
- Pending sleutel is nooit onafhankelijk.
- Bootstrap activeert alleen de bewezen sleutel en is eenmalig.
- Juiste/verkeerde doel, eenmalig gebruik en verlopen step-up gecontroleerd.
- Extra sleutel alleen na step-up.
- **Ontbrekende UV** bij registratie en verificatie server-side geweigerd, ook na downgrade door de client.
- Ingetrokken sleutel: een geforceerde handtekening wordt geweigerd.
- Gekloonde sleutel (lagere counter) geweigerd.
- Gesynchroniseerde passkey niet onafhankelijk zolang het beleid ze uitsluit; een apparaatgebonden sleutel wel.

## 10. Sessiebeheer

Twee onafhankelijke profielen: twee sessies. Strikt bewezen:
- één sessie intrekken: die sessie geweigerd, de andere werkt;
- alle sessies intrekken, daarna een nieuwe login;
- uitgelogde cookie geweigerd, ook als die in een **ander profiel** opnieuw wordt gebruikt;
- verlopen sessie en sessie ouder dan 12 uur geweigerd;
- MFA niet overdraagbaar en eindigt bij uitloggen;
- blokkeren van een sleutel beëindigt alle sessies.

Providerbrede intrekking: zie §8 (BLOCKED).

## 11. Uitnodigingen (strikt)

- Verkoper, manager (ook mét step-up) en eigenaar zonder step-up kunnen niet uitgeven; de rol `owner` is niet uit te nodigen.
- Een geldige uitnodiging is 48 uur geldig, het token wordt alleen gehasht opgeslagen en staat in het URL-fragment.
- Een verkeerde of ongeverifieerde mailbox wordt geweigerd.
- Acceptatie via de echte pagina in de echte database, met **alleen** de rol technician; hergebruik geweigerd.
- Verlopen en ingetrokken uitnodigingen geweigerd. Intrekken vereist een **nieuwe** step-up.
- Uitnodigen of intrekken over tenants heen wordt geweigerd.

## 12. Tenantisolatie

Strikt bewezen:
- RLS voor lezen en schrijven;
- een gemanipuleerde tenant-ID wordt genegeerd;
- vreemde tenant en lagere rol geweigerd;
- contextheader geweigerd zolang dynamische context uit staat;
- goedkeuringen gelden per tenant;
- het eigenaarsoverzicht toont alleen de eigen tenant; sleutels van een andere tenant zijn niet te beheren;
- de runtime kan geen codes lezen of goedkeuringen schrijven.

Dynamische context is alleen op een geïsoleerde testinstantie getest; **de productievlag blijft uit**.

## 13. ERP-regressie

**PASS**:
- 209 unit-tests: klanten, reparaties, diagnose/offerte, voorraad, kassa, betalingen, afhaling, dagafsluiting, rollen, klantenportaal;
- bestaande phase21-runner (8 scenario's, herladen, installatie) in echte Chrome tegen echte PostgreSQL;
- kassa met splitbetaling, kaartreferentie en verkoop na afsluiting geweigerd;
- verkoper en anonieme gebruiker geweigerd.

## 14. Openstaande risico's

| Risico | Ernst | Status |
| --- | --- | --- |
| Echte provider niet E2E bewezen | Hoog (bewijs) | BLOCKED, suite klaar |
| Migratie 013 niet op Neon toegepast; bestaande sleutels daar *pending* | Hoog (functioneel) | BLOCKED, stappen in §16 |
| Gestolen verse sessie kan sleutels **blokkeren** of 3 pending sleutels aanmaken (DoS, geen escalatie) | Middel | Bewuste afweging: de paniekknop kan geen sleutel vereisen. Herstel via eigenaar of operator |
| Runtime is vertrouwensgrens voor de handtekeningcontrole | Middel | Beperkt door DB-guards (§3) |
| Gesynchroniseerde passkeys delen de cloudaccount-risico's | Middel | Optie A; eigenaar kan uitzetten; status toont het type |
| Geen bevestiging met echte platform-passkeys/fysieke sleutels | Middel | NOT RUN |
| Rate limit per sessie, niet per IP | Laag–middel | Open |
| Bearer-pad `/api/auth/me` zonder app-intrekking | Laag | Open (uit fase 1) |
| E-mailenumeratie via `request-link` | Laag | Open (uit fase 1) |

## 15. Status per acceptatiecriterium

| Criterium | Status |
| --- | --- |
| Relevante tests uitgevoerd | **PASS** |
| WebAuthn-controles slagen | **PASS** (virtueel; fysiek NOT RUN) |
| Server-side MFA-afdwinging bewezen | **PASS** (lokaal en CI, strikt) |
| Eerste enrollment niet via primaire login alleen | **PASS** |
| Sleutelbeheer en veilig herstel | **PASS** |
| Sessies veilig intrekbaar (app) | **PASS** |
| Providerbrede sessie-intrekking | **BLOCKED** |
| Uitnodigingen werken correct | **PASS** |
| Tenantisolatie bewezen (lokale PostgreSQL) | **PASS**; op Neon **NOT RUN** |
| Browser-E2E reproduceerbaar | **PASS** (lokaal en Actions) |
| Regressietests | **PASS** |
| Echte Neon Auth-E2E | **BLOCKED** |
| Geen onopgeloste kritieke beveiligingsproblemen in code | **PASS** binnen de geteste scope; open punten in §14 |
| Volledig P0 geverifieerd | **Nee**: echte provider en Neon-migratie ontbreken |

## 16. Vervolgacties (in volgorde)

1. **Migratie 013 op de geïsoleerde branch** (owner-URL, nooit productie):
   ```bash
   psql "$ISOLATED_NEON_OWNER_URL" -v ON_ERROR_STOP=1 -f db/migrations/013-mfa-factor-policy.sql
   ```
2. **Eerste sleutel activeren**: registreer op `/security`, vraag een code aan en activeer.
   ```bash
   REPAIRFLOW_OWNER_DATABASE_URL="$ISOLATED_NEON_OWNER_URL" node scripts/mfa-bootstrap-code.js \
     --organization <org-uuid> --subject <neon-auth-user-uuid> --operator "Amine, in persoon"
   ```
3. **Provider-E2E activeren**: maak een synthetische gebruiker (e-mail/wachtwoord) op de geïsoleerde branch en zet de secrets.
   ```bash
   gh api -X PUT repos/cma58/RepairFlow/environments/neon-auth-e2e
   for s in PHIXAR_E2E_ENVIRONMENT PHIXAR_E2E_NEON_AUTH_URL PHIXAR_E2E_TRUSTED_ORIGIN PHIXAR_E2E_USER_EMAIL PHIXAR_E2E_USER_PASSWORD; do gh secret set "$s" --env neon-auth-e2e --repo cma58/RepairFlow; done
   gh workflow run neon-auth-provider-e2e.yml --ref test/p0-webauthn-browser-e2e-recovery --repo cma58/RepairFlow
   ```
   Optioneel daarnaast `PHIXAR_E2E_RUNTIME_DATABASE_URL`, `PHIXAR_E2E_ORGANIZATION_ID`, `PHIXAR_E2E_BRANCH_ID` en `PHIXAR_E2E_EXPECTED_ROLE`.
4. Een Vercel-preview van deze branch met `REPAIRFLOW_WEBAUTHN_RP_ID`, en een handmatige proef met een echte passkey (iPhone/Android) en een FIDO2-sleutel.
5. Daarna pas: review van PR #28 en besluit over merge naar de featurebranch. Dynamische context blijft uit tot een echte provider-E2E met echte lidmaatschappen bestaat.
