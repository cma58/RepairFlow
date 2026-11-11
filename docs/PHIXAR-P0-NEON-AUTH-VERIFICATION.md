# PHIXAR P0 — Fase 3: verificatie op Neon, migratie 013 en echte provider-E2E

Datum: 2026-11-10. Branch `test/p0-webauthn-browser-e2e-recovery`, draft PR #28 (doel `feature/customer-portal-ipad-batch-20261107`). Geen merge, geen deploy, geen wijziging aan productie. Dit rapport vult `PHIXAR-P0-SECURITY-E2E-RECOVERY.md` (fase 1) en `PHIXAR-P0-NEON-AUTH-MFA-PHASE2.md` (fase 2) aan.

**Kernuitkomst.** Migratie 013 staat nu aantoonbaar op de geïsoleerde Neon-testbranch en is daar met de echte runtime-rol getest: 20 van 20 ongeautoriseerde handelingen geweigerd en de volledige positieve keten geslaagd. De echte Neon Auth-provider-E2E is voorbereid tot op één stap: de GitHub-secrets kon ik in deze sessie niet zetten. **P0 blijft daarom open.**

---

## 1. Uitgangssituatie

| Item | Waarde |
| --- | --- |
| Start-HEAD | `cdc57e8` (PR #28 draft, CI groen: 209 unit, 65 security) |
| GitHub | Push en PR-commentaar werken. Secrets, environments en workflow-dispatch zijn via de sessieproxy **niet** bereikbaar |
| Neon | **Nu beschikbaar** via de Neon-koppeling (organisatie beheerd via Vercel) |
| Vercel | Gekoppeld account toont **geen** RepairFlow-project; preview niet controleerbaar |
| Shell-netwerk | Alleen GitHub en pakketregisters; Neon Auth en Vercel onbereikbaar vanuit de shell |

## 2. Neon-omgeving (zonder secrets)

| Item | Waarde |
| --- | --- |
| Project | `repairflow-db` (`shy-block-99675829`), regio aws-eu-central-1, PostgreSQL **18.6** |
| Testbranch | `test/phixar-auth-rls-20261108` (`br-purple-king-ban17e74`), niet-standaard, aangemaakt via console op 2026-11-08 |
| Productiebranch | `main` (`br-wandering-surf-baxktvf5`), door Vercel gemarkeerd als productie. **Niet gewijzigd**; alleen één catalogusvraag gelezen |
| Database / rol | `neondb`, eigenaar `neondb_owner` (BYPASSRLS, geen superuser); runtime `rf_runtime_login` (NOBYPASSRLS) |
| Neon Auth | Better Auth, eigen endpoint per branch; e-mail/wachtwoord aan, registratie uit, magic link aan, localhost uit |
| Data | Vier organisaties, alle test/synthetisch; 8 testklanten zonder e-mailadres; twee echte beheerdersaccounts (niet gebruikt) |

Andere branches (`preview/...`) zijn door Vercel aangemaakt en niet aangeraakt.

## 3. Migratie 013 op Neon

**Vooraf vastgesteld (alleen-lezen):** 001–012 aanwezig, 013 volledig afwezig (oude CHECK actief, geen trigger, geen 013-kolommen), geen actieve runtime-verbindingen.

**Herstelmogelijkheid:**
- Een snapshot van een niet-rootbranch staat Neon niet toe (`not allowed to snapshot non-root branch`).
- Herstelpunt voor point-in-time-herstel: `2026-11-10T04:32:24Z`, LSN `0/227D690` (bewaartermijn 6 uur).
- Daarna: `db/rollback/013-mfa-factor-policy.rollback.sql`. Lokaal bewezen dat het exact de toestand van 001–012 herstelt en dat 013 daarna opnieuw toepasbaar is.

**Uitvoering:** de 76 statements van het gecommitte bestand in één transactie, alleen op `br-purple-king-ban17e74`. Alle 76 geslaagd.

**Bewijs dat Neon gelijk is aan de repo** (`db/verify/013-fingerprint.sql`, dezelfde query op Neon en op een lokale database uit de repo):

| Onderdeel | Aantal | Neon = repo |
| --- | --- | --- |
| Kolommen | 70 | ja (`3caa5f58…`) |
| Constraints | 35 | ja (`f3e0b56d…`) |
| Kolomrechten | 79 | ja (`6fc5dd39…`) |
| Policies | 5 | ja (`c95bbce5…`) |
| RLS + FORCE | 6 tabellen | ja (`84a0515e…`) |
| Tabelrechten | 5 | ja (`6afa3f03…`) |
| Trigger | 1 | ja (`f318d8d7…`) |
| Functies van 013 | 20 | ja, per functie vergeleken |

**Drift van vóór deze fase:** `rf_accept_member_invitation` (012) en `rf_available_contexts` (008) verschillen op Neon van de repo door één weggelaten commentaarregel en één puntkomma. De logica is gelijk; niet aangepast.

**Bestaande data na migratie:** klanten 8, medewerkers 11, reparaties 17, auth-gebruikers 2 (+1 synthetische testgebruiker), ongewijzigd. De ene bestaande testsleutel is nu *pending* (fail-closed).

## 4. Autorisatietests tegen de gemigreerde Neon-database

Uitgevoerd als `rf_runtime_login` met de context van de synthetische eigenaar `test-owner-phixar` in organisatie `PHIXAR isolation test`.

**Negatief — 20/20 geweigerd (SQLSTATE 42501):**
- direct schrijven of wijzigen van grants;
- bootstrapcodes lezen;
- goedkeuringen of beleid schrijven;
- sleutel deblokkeren of intrekking ongedaan maken;
- challenge hergebruiken of van doel veranderen;
- interne functies `rf_consume_step_up` en `rf_security_audit` aanroepen;
- sessie intrekken, uitnodigen, beleid wijzigen en sleutel goedkeuren zonder step-up;
- klant in een andere tenant aanmaken (RLS);
- sessie-intrekking vervalsen;
- eigen rol verhogen;
- auditlog lezen;
- bootstrapcode inwisselen zonder bezitsbewijs van de sleutel.

Zonder tenantcontext ziet de runtime 0 klanten; met context alleen de 5 van de eigen tenant en 0 van andere.

**Positieve keten — geslaagd, daarna volledig teruggedraaid:**

| Stap | Resultaat |
| --- | --- |
| Pending sleutel, doel `session.revoke` | niet onafhankelijk; intrekken geweigerd |
| Assertion zonder UV | geweigerd |
| Verkeerde bootstrapcode | niet geactiveerd |
| Juiste code met al verbruikt bezitsbewijs | geweigerd |
| Juiste code + vers bezitsbewijs | geactiveerd (`active/bootstrap`) |
| Goedgekeurde sleutel, verkeerd doel | intrekken geweigerd |
| Goedgekeurde sleutel, juist doel | intrekken toegestaan |
| Tweede gebruik van dezelfde step-up | geweigerd |
| Zelfgoedkeuring zonder step-up | geweigerd |
| Sleutel blokkeren | gelukt; sessie daarna geweigerd |

Achtergebleven: één ongeldig gemaakte, ongebruikte bootstrapcode-rij en de synthetische auth-gebruiker. Geen sleutels, grants, goedkeuringen of intrekkingen.

**Beperking:** dit bewijst de databaselaag op Neon. De cryptografische WebAuthn-controle zelf loopt in de applicatie en is op Neon niet end-to-end gedraaid (geen preview-toegang); die is bewezen in de browsersuite tegen lokale PostgreSQL 16.

## 5. Echte Neon Auth-provider-E2E — BLOCKED

**Klaar:**
- Synthetische gebruiker `phixar-e2e-provider@example.com` op de testbranch, geverifieerd, **zonder enige rol** in PHIXAR. Er staat een willekeurig wachtwoord op dat niemand kent; de eigenaar genereert zelf een nieuw wachtwoord, zet het als secret en laat alleen de hash op de testbranch opslaan (het wachtwoord komt nooit in chat, logs of repo).
- Suite `tests/provider/neon-auth.provider.js` (10 controles): login, cookieattributen, acceptatie door `verifySession`, twee sessies, vervaltijd, intrekking van één sessie, uitloggen, providerbrede intrekking, nieuwe login, vervalste tokens, fout wachtwoord en gesloten registratie, en optioneel de echte handlers tegen de echte database.
- Workflow `neon-auth-provider-e2e.yml` start nu bij elke push naar deze branch. Handmatig starten werkt pas als het bestand op de standaardbranch staat; dat was een fout in de instructies van fase 2.

**Blokkade:** vijf repository-secrets ontbreken en zijn via deze sessie niet te zetten. Zonder secrets faalt de run als BLOCKED (exit 1, 0 pass, 10 cancelled, 0 skipped). De check op PR #28 blijft dus rood tot de secrets er staan; dat is bedoeld.

**Nog onzeker tot de eerste echte run:** de endpointnamen (`/sign-in/email`, `/list-sessions`, `/revoke-session`, `/revoke-sessions`, `/sign-out`) volgen Better Auth en zijn niet tegen Neon bevestigd. Het wachtwoord is rechtstreeks als scrypt-hash in `neon_auth.account` gezet; als Neon een ander hashformaat gebruikt, faalt P1 en moet het wachtwoord via de provider worden gezet.

Niet automatisch testbaar: geforceerd verlopen providersessies en de magic-link-mailbox.

## 6. MFA-beleid en gestolen sessie (review)

Bevestigd in code, lokale browsersuite en op Neon: UV verplicht; origin en RP ID vastgepind; challenge gebonden aan gebruiker, sessie, tenant en doel; step-up eenmalig en 5 minuten geldig; `UV=true` alleen geeft nooit onafhankelijkheid (pending sleutel blijft `independent=false`); replay en gekloonde sleutel geweigerd.

**Bootstrap- en herstelcode:** 130 bit willekeur, alleen SHA-256-hash opgeslagen, alleen aan te maken met de owner-rol, 15 minuten (maximaal 30), eenmalig, ongeldig na 5 fouten, gebonden aan tenant en persoon, en alleen inwisselbaar met vers bezitsbewijs van de nieuwe sleutel.

**Gestolen primaire sessie — wat een aanvaller kan:**

| Handeling | Mogelijk? |
| --- | --- |
| Beheeracties (uitnodigen, sessies intrekken, sleutels goedkeuren) | Nee |
| Eigen sleutel activeren | Nee, zonder code of goedkeuring |
| Gewone ERP-handelingen binnen de rol van het slachtoffer | **Ja** — MFA beschermt alleen beheeracties |
| Maximaal 3 pending sleutels aanmaken | Ja (overlast) |
| Sleutels van het slachtoffer **blokkeren** (login ≤ 10 min oud) | Ja — de eigenaar is dan buitengesloten van beheeracties tot herstel |
| Pogingen op een lopende bootstrapcode opbranden | Ja (code wordt ongeldig; operator maakt een nieuwe) |

Het blokkeerscenario is een bewuste afweging: de noodknop moet werken als de sleutel weg is. Het geeft geen rechten en is herstelbaar via een andere eigenaar of een operator-herstelcode. Aanbevolen aanvullingen, nog niet gebouwd:
1. melding per e-mail bij blokkeren en bij een nieuwe pending sleutel (vereist een eigen e-mailprovider);
2. een tweede eigenaar of een offline bewaarde herstelprocedure, zodat één persoon niet het enige herstelpad is;
3. rate limiting per account en IP.

## 7. Onafhankelijke securityreview

| Onderwerp | Bevinding |
| --- | --- |
| Privilege-escalatie | Geen pad gevonden; 20 negatieve tests op Neon, 26 DB-bewijzen lokaal |
| Cross-tenant | RLS op Neon bevestigd; goedkeuringen per tenant |
| Sessiefixatie / -intrekking | Sessies komen van de provider; app-intrekking bewezen; providerintrekking BLOCKED |
| WebAuthn-replay / klonen | Bewezen in browsersuite |
| Bootstrap/herstel | Zie §6; race bewezen: één code vanuit twee sessies activeert precies één sleutel |
| Racecondities | Nieuw: vijf parallelle beheeracties op één step-up → precies één geslaagd |
| SQL-injectie | Alleen geparametriseerde queries in de beveiligingsmodules |
| CSRF | Origin-controle, JSON-content-type, SameSite-cookie |
| XSS | Geen `innerHTML` in `security.html`, `login.html`, `accept-invitation.html` |
| **Clickjacking (F5, nieuw)** | `vercel.json` had geen framing-headers. **Hersteld:** `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`, `nosniff`, `Referrer-Policy`; regressietest toegevoegd. Op een echte preview nog NOT RUN |
| Cookiebeveiliging | Uitlogcookie HttpOnly/Secure/SameSite; providercookies te bewijzen in §5 |
| Logging | Geen logging van tokens of codes in `api/` en `lib/`; operatorscript toont de code één keer |
| Testdependency-injectie | Alleen met Symbol-markering; test bewijst dat HTTP-invoer en een ongemarkeerd argument genegeerd worden |
| Database-ownerrechten | Functies draaien als `neondb_owner`; de guard-trigger geldt ook voor die rol |
| Vercel-runtime | 12 functies (limiet 12); preview niet controleerbaar |

## 8. Echte passkeys

**NOT RUN.** In deze omgeving is geen fysiek toestel of platform-authenticator beschikbaar. De virtuele authenticators bewijzen de serverlogica, niet het gedrag van echte toestellen (iCloud-sleutelhanger, Android, YubiKey). Dit vraagt een handmatige proef op een preview.

## 9. Testresultaten

| Categorie | Status | Aantallen |
| --- | --- | --- |
| Unit (`npm test`) | PASS | 211/211, 0 skip |
| DB-integratie lokaal | PASS | 26/26 (12 fase 1, 14 MFA-beleid incl. 2 race-tests) |
| Browser security (strikt) | PASS | 36/36 |
| Browser ERP-regressie | PASS | 5/5 (phase21-runner met 8 scenario's, kassa, rollen) |
| `npm run test:security` totaal | PASS | 67/67, 0 skip |
| Migratie 013 op Neon | PASS | 76/76 statements; vingerafdruk gelijk |
| Autorisatie op Neon | PASS | 20/20 negatief; positieve keten geslaagd |
| Rollback 013 (lokaal) | PASS | herstelt 001–012 exact; herapply slaagt |
| Echte provider (`npm run test:provider`) | **BLOCKED** | 0 pass, 10 cancelled |
| WebAuthn-ceremonie tegen Neon-database | NOT RUN | geen preview-toegang |
| Vercel-preview / headers live | NOT RUN | project niet zichtbaar |
| Echte passkeys / fysieke sleutels | NOT RUN | geen hardware |
| POLICY-SIMULATED | 0 tests | – |

ERP-regressie dekt klanten, reparaties en diagnoses, IMEI-validatie, voorraad en reserveringen, kassa, betalingen, dagafsluiting, rechten, uitnodigingen, tenantisolatie en auditlog (unit + echte browser).

GitHub Actions op de definitieve commit: zie de reactie op PR #28 en `ERP-STATUS.md`.

## 10. Productiegereedheid per criterium

| Criterium | Status |
| --- | --- |
| Server-side MFA-afdwinging | PASS (lokaal, CI en databaselaag op Neon) |
| Eerste sleutel niet via primaire login alleen | PASS |
| Sleutelbeheer, blokkeren, herstel | PASS (virtueel) |
| Migratie 013 op geïsoleerde Neon-branch | PASS |
| Tenantisolatie op Neon (RLS) | PASS |
| App-sessie-intrekking | PASS |
| Echte providerlogin en providerbrede intrekking | **BLOCKED** |
| Volledige keten op een preview met Neon | NOT RUN |
| Echte passkeys | NOT RUN |
| Migraties 009–013 op productie | Niet uitgevoerd (vereist jouw besluit) |
| **P0 volledig geverifieerd** | **Nee** |

## 11. Vervolgstappen

1. Genereer lokaal een wachtwoord voor de synthetische gebruiker, zet de vijf repository-secrets, laat de hash op de testbranch opslaan en herstart de workflow (commando's in de oplevering van deze fase). Pas daarna telt §5.
2. Geef de Vercel-koppeling toegang tot het RepairFlow-project, of deel de preview-URL van deze branch, voor de keten browser → Vercel → Neon en de headercontrole.
3. Handmatige proef met een echte passkey en een FIDO2-sleutel op die preview.
4. Beslis over e-mailmeldingen en een tweede herstelpad (§6).
5. Pas daarna: review van PR #28 en een apart besluit over productie (migraties 009–013 staan niet op `main`).

## 12. Cloud fase 4 — onafhankelijke nacontrole (2026-11-10)

Dit gedeelte actualiseert de historische toegangs- en Vercelclaims hierboven. Start-HEAD `10b6eb3696df9d57edc26fb7bf85e83339bab5df`, draft PR #28 tegen de featurebranch. De Neon-branch `br-purple-king-ban17e74` bestaat, is niet de default en heeft migratie 013 (`rf_webauthn_approvals`, bootstrapcodes en blokkeerfunctie aanwezig; de oude fail-closed CHECK afwezig). Bestaande gebruikers en klantrecords zijn niet gewijzigd in deze fase.

**Vercel gevonden:** project `repair-flow` (`prj_ILFwXmbKJoh6xnGNNSHH55VtW57T`) in team `aminechtaiti-3069s-projects`. De testbranch heeft een READY-preview op de start-HEAD, maar die deployment is van vóór de nieuwe branchconfiguratie. De productiealias `repair-flow-theta.vercel.app` is geen testbewijs. Acht variabelen zijn uitsluitend voor `preview` plus Git-branch `test/p0-webauthn-browser-e2e-recovery` ingesteld: de geïsoleerde Neon Auth-URL, een beperkte `rf_runtime_login`-verbinding naar precies de testbranch, de synthetische organisatie/vestiging, de vaste preview-alias als app-origin en WebAuthn RP ID, en een branchspecifieke `DATABASE_URL` zodat `db-health` de gedeelde productie/preview-integratievariabele niet gebruikt. De nieuwe alias is alleen op de geïsoleerde Neon Auth-branch als vertrouwd domein toegevoegd. De bestaande algemene Vercel-variabelen met doel `preview,production` zijn niet gewijzigd. Een nieuwe deployment en de werkelijke resolutie van alle variabelen moeten nog worden gecontroleerd vóór muterende preview-E2E.

**Provider en GitHub:** Neon Managed Better Auth op die branch heeft e-mail/wachtwoord aan, publieke registratie uit en e-mailverificatie verplicht. De eerdere synthetische account heeft een rechtstreeks geplaatste, niet door de provider gevalideerde hash; deze wordt niet als werkende provideridentiteit beschouwd en het wachtwoord is onbekend. De connector kan testgebruikers zonder wachtwoord maken maar biedt geen ondersteunde wachtwoordzetter. GitHub-connector en niet-aangemelde cloudbrowser bieden geen schrijfpunt voor Actions-secrets. De workflow is nu expliciet aan environment `neon-auth-e2e` gekoppeld, maar de benodigde environment-secrets zijn nog niet gezet. De provider-suite blijft **BLOCKED**, geen mock-PASS. Er zijn vijf basiswaarden en vier aanvullende waarden nodig voor de P7-app/databaseketen; die laatste mag niet stilzwijgend als optioneel succes worden gerapporteerd.

**Beveiligingsreview en code:** de provider-suite weigert vóór enige login of mutatie een URL buiten de beoordeelde Auth-endpoint, een runtime-database buiten de testbranch, het productiealias als trusted origin en een ander account dan de synthetische testidentiteit. De lokale echte-handlerproef vertrouwt het tijdelijke testcertificaat expliciet in plaats van TLS-controle uit te schakelen. Een regressietest dekt de doelcontrole. Dit bewijst geen echte providerlogin. De sleutelblokkering blijft een herstelbare denial-of-service als een aanvaller een recent ingelogde primaire sessie bezit: de sleutel wordt geblokkeerd en alle ondernemingssessies eindigen, zonder een onafhankelijke factor. De huidige audit, recente-login-eis en operatorherstel zijn aanwezig; er is nog geen onafhankelijke bevestiging, account-/IP-limiet of meldkanaal. Een veilige aanvullende controle moet worden ontworpen en getest vóór P0-vrijgave; de noodknop is niet verzwakt om tests groen te krijgen.

| Controle in deze fase | Status | Bewijs / grens |
| --- | --- | --- |
| `npm test` op start-HEAD | PASS | 211/211, 0 skips |
| `npm test` na doelcontrole | PASS | 212/212, 0 skips |
| `npm run test:security` lokaal | BLOCKED | PostgreSQL `initdb/pg_ctl` ontbreken; lokale fout is geen PASS |
| `npm run test:provider` lokaal | BLOCKED | Vereiste credentials ontbreken; 0 pass, 10 cancelled, 0 skipped |
| CI op start-HEAD | PASS voor unit/security; FAIL voor provider | GitHub-runs 42758120794, 42758120953, 42758116433 |
| Migratie 013 op geïsoleerde Neon-branch | PASS (herbevestigd, catalogus) | Geen nieuwe migratie of productiehandeling |
| Bestaande preview op start-HEAD | PASS voor READY-status; NOT RUN voor volledige keten | Branchdeployment `dpl_HSzYeH7zAuTjRG2prFNFsSt9FaX7` gebruikt nog oude configuratie |
| Echte providerlogin, twee browserprofielen en providerintrekking | BLOCKED | Geen officiële wachtwoordregistratie en geen veilige environment-secrets |
| Fysieke passkey | NOT RUN | Fysiek apparaat en geïsoleerde werkende preview nodig |

**Volgende stap:** maak via een officieel Neon Auth-pad een nieuwe synthetische wachtwoordidentiteit of stel via de provider zelf een wachtwoord in, zet het uitsluitend in het GitHub-environment, en configureer de vier P7-testwaarden met een beperkte databaseverbinding. Controleer daarna de nieuwe previewdeployment op commit en resourcebinding voordat er browsermutaties plaatsvinden. Geen P0-vrijgave, merge of productiepublicatie.

## 13. Fase-4-nacontrole op de testbranch

- Het Vercel-project is bevestigd in team `aminechtaiti-3069s-projects` als `repair-flow` (`prj_ILFwXmbKJoh6xnGNNSHH55VtW57T`). De branchdeployment op commit `54e6f5b84c1c2a85694afa4dd30228f46b85bbdf` is READY (`dpl_FarkNHezZ8zZb4ZYeYve4rMunzZQ`, previewdoel, niet productie). Acht omgevingsvariabelen zijn met metadata als exclusief `preview` plus de P0-testbranch bevestigd; hun versleutelde waarden zijn via deze connector niet onafhankelijk te vergelijken. De preview is daarom niet voor een muterende E2E gebruikt.
- Een anonieme, alleen-lezen previewcontrole gaf op `/api/auth/me` HTTP 503 en op `/api/auth/status` `loginEnabled:false` en `canAccessCustomerData:false`. De headers bevatten `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN` en `nosniff`. Dit bewijst een gesloten loginpoort en live headers, niet de providerketen of een ingelogde sessie.
- De providerworkflow gebruikt nu expliciet GitHub-environment `neon-auth-e2e`. GitHub-connector biedt geen environment-/secretbeheer; de cloudbrowser is op GitHub afgemeld. De verplichte negen testwaarden zijn niet gezet. `npm run test:provider` is lokaal en in Actions **BLOCKED** (0 pass, 10 cancelled, 0 skipped), geen mock-PASS. De suite weigert nu vóór de eerste login een andere Auth-URL, previeworigin, databasehost, synthetische organisatie/vestiging of rol dan `none`. P7 met echte handlers en database is verplicht, geen optioneel succes.
- De synthetische Neon Auth-gebruiker heeft nog geen via de provider bewezen wachtwoord. De branchconfiguratie heeft publieke sign-up uit en e-mailverificatie aan. De connector kan gebruikers aanmaken maar biedt geen ondersteunde wachtwoordzetter; rechtstreeks een hash in `neon_auth.account` vervangen wordt niet herhaald. De Better Auth-endpointnamen zijn in officiële documentatie gevonden, maar de werkelijk gehoste Neon-versie is zonder een geldige synthetische aanmelding niet end-to-end bevestigd.
- De additieve migratie 014 beperkt sleutelblokkering wanneer meerdere goedgekeurde sleutels bestaan: een `credential.manage`-step-up met een andere sleutel is dan verplicht. De bestaande noodroute voor de enige sleutel blijft herstelbaar maar kwetsbaar voor een beschikbaarheidsaanval met een gestolen, verse primaire sessie; rate limiting, waarschuwingen en onafhankelijke bevestiging ontbreken nog. Nacontrole op de geïsoleerde Neon-branch bevestigde de nieuwe transactielock en step-up-functie in `rf_block_own_credential`; de 8 testklanten en 17 reparaties zijn behouden. Dit is een cataloguscontrole, geen provider-E2E.
- `npm test`: **PASS** 212/212, geen skips. GitHub Actions op commit `54e6f5b`: **PASS** 212/212 unit en 68/68 security/database/browser, nul skips. Lokaal `npm run test:security`: **BLOCKED** wegens ontbrekende PostgreSQL-binaries. De echte provider, fysieke passkey en de volledige browser → Vercel → Neon-keten zijn **BLOCKED/NOT RUN**; P0 is niet productiegereed.

De opt-in providersuite bevat nu ook `P3-browser`: twee echte, afzonderlijke Chrome BrowserContexts melden dezelfde synthetische gebruiker rechtstreeks op het geïsoleerde Neon Auth-endpoint aan en moeten verschillende provider-sessie-ID's plus afzonderlijke veilige HttpOnly-cookieopslag bewijzen. Deze proef gebruikt geen synthetische providerrespons. Hij is **BLOCKED**, samen met de overige providertests, tot een officieel ingestelde testidentiteit en environment-secrets beschikbaar zijn. Het bewijst na uitvoering nog niet de Vercel-keten; die vergt een aparte previewproef.

## 14. Fase 5 — officiële testaccountactivatie en credential-loze providerproef (2026-11-11)

Start-HEAD `0c62a79` (8 commits van fase 4 opgehaald, niets herschreven). Geen merge, deploy of productiewijziging.

**Toegang in deze sessie:** GitHub push, PR-commentaar, workflow-reruns en joblogs werken; Actions-secrets, environments en artefacten zijn via de sessieproxy **geweigerd** (HTTP 403). Neon-koppeling werkt (project `shy-block-99675829`). De Vercel-koppeling van deze sessie ziet het project `repair-flow` niet (403/404). Claude in Chrome was niet verbonden. De shell bereikt Neon Auth en Vercel niet; GitHub Actions-runners wel.

**Testaccount (officieel):**
- Het oude account `phixar-e2e-provider@example.com` (rechtstreeks geplaatste hash, 0 sessies, geen rol) is met toestemming van de eigenaar via de Neon-API verwijderd.
- Nieuw synthetisch account `amine.chtaiti+phixar-e2e@gmail.com` via de Neon-API aangemaakt op uitsluitend `br-purple-king-ban17e74`: geen wachtwoord, nog niet geverifieerd, geen staff-rij of lidmaatschap. De doelcontrole (`tests/provider/isolated-target.js`) pint nu dit adres.
- Het wachtwoord kan officieel alleen via e-mail worden gezet (Neon: reset-link of Email OTP). `scripts/provider-e2e-setup.js` doet dat op de computer van de eigenaar: OTP aanvragen, zelf gegenereerd wachtwoord via `/email-otp/reset-password`, eventueel e-mailverificatie-OTP, echte login + afmelden, en daarna de negen secrets via `gh` (stdin, nooit als argument of in beeld) in environment `neon-auth-e2e`. Het script weigert elk ander Auth-, preview- of databasedoel en de owner-rol (unit-test).

**Echte provider zonder credentials (nieuwe job `provider-public`, GitHub Actions):**

| Controle | Resultaat tegen de gehoste Neon Auth |
| --- | --- |
| U1 endpoint bereikbaar | PASS — `/ok` 200 |
| U2 geen sessie zonder of met vervalste cookie | PASS — `/get-session` 200 `null`; `verifySession` weigert |
| U3 onbekende gebruiker | PASS — 401 `INVALID_EMAIL_OR_PASSWORD`, geen cookie |
| U4 publieke registratie | PASS — 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED` |
| U5 sessiebeheer bestaat en vereist sessie | PASS — `/list-sessions`, `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions` 401; `/sign-out` 200 zonder cookie |
| U6 officiële reset-endpoints bestaan | PASS — Email-OTP-endpoints 400 bij lege invoer (geen e-mail verstuurd); `/request-password-reset` 400; `/forget-password` 404; `/reference` 200 |
| V1–V3 live preview anoniem | **BLOCKED** — Vercel Deployment Protection antwoordt 401 aan de runner. Optioneel repository-secret `PHIXAR_E2E_VERCEL_BYPASS` (Vercel *Protection Bypass for Automation*) wordt ondersteund |

Hiermee zijn de endpointnamen die de geauthenticeerde suite gebruikt tegen de echte gehoste versie bevestigd. Een geslaagde login, echte sessie-intrekking, twee profielen met echte sessies en P7 blijven **BLOCKED** tot de eigenaar het setupscript heeft gedraaid.

**Overige controles:** lokaal `npm test` 214/214 en `npm run test:security` 68/68 (PostgreSQL 16, Chrome 153), 0 skips. Migratie 014 op Neon is identiek aan de repo (hash `0bf8916c8c` voor `rf_block_own_credential`); de 013-vingerafdruk is ongewijzigd.

| Criterium | Status |
| --- | --- |
| Testaccount officieel aangemaakt (zonder rol) | PASS |
| Wachtwoord via officieel resetproces | BLOCKED — vereist het setupscript bij de eigenaar (mailbox + GitHub-secrets) |
| Echte provider: weigeringen, registratie dicht, endpoints | PASS (CI) |
| Echte login, twee profielen, uitloggen, intrekking één/alle sessies, nieuwe login, P7 | BLOCKED |
| Browser → Vercel → Neon-keten | BLOCKED — Vercel-bescherming en geen Vercel-toegang in deze sessie |
| Echte passkeys | NOT RUN |
| **P0 volledig geverifieerd** | **Nee** |

## 15. Fase 6 — mobiele testprocedure zonder computer (2026-11-11)

Zelfde branch en draft PR #28, HEAD `5b17d2e`. Geen nieuwe branch of PR, geen merge, geen productiewijziging, geen beveiliging uitgeschakeld.

**Wat er is gebouwd**
- `/test-account` (mobiele pagina) met `POST /api/auth/session` (zelfde Vercel-functie, dus nog steeds 12 functies). De poort opent alleen op de Vercel-preview van deze branch (`VERCEL_ENV=preview` + Git-branch) en alleen als Neon Auth-URL, app-origin, synthetische organisatie/vestiging, vaste enkele tenant (`REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED` niet `true`), runtimerol `rf_runtime_login` en de databasehost van de geïsoleerde branch overeenkomen. Faalt één controle, dan antwoordt de preview `503 {failedCheck}` met alleen de naam van de controle. Op elke andere deployment blijft `POST` exact `405` zoals voorheen.
- Uitsluitend officiële Neon Auth-flows: wachtwoord instellen/herstellen met e-mailcode (`/forget-password/email-otp` → `/email-otp/reset-password`), e-mailverificatie met code, e-mail/wachtwoord-login, sessielijst en `revoke-other-sessions`; afmelden via de bestaande `/api/auth/logout`.
- Wachtwoord en codes gaan alleen in een JSON-body browser → Vercel-functie → Neon Auth (HTTPS). Ze worden niet gelogd, opgeslagen, teruggegeven of in een URL gezet. Providertokens en IP-adressen bereiken de browser niet; de browser krijgt alleen een host-only cookie `HttpOnly; Secure; SameSite=Lax; Max-Age=43200`. Formulieren posten bij uitgevallen JavaScript naar de API (415), nooit via GET.
- Testidentiteit: het door de eigenaar bevestigde account, vastgepind op Neon Auth-gebruikers-ID `f91abfab-…` en de SHA-256 van het genormaliseerde adres. De repository is openbaar; het adres staat daarom niet leesbaar in nieuwe code. Andere adressen worden geweigerd vóór enig providerverzoek; een login die naar een andere identiteit leidt, wordt bij de provider weer afgemeld.
- Rechten: de identiteit heeft alleen nog een actieve rol `manager` in "PHIXAR isolation test" (`1111…`), met `exports.read` geweigerd. Zijn manager-lidmaatschappen in de synthetische organisaties `3333…` en `5555…` zijn op de geïsoleerde branch op `active=false` gezet (omkeerbaar, geen verwijdering). De rij `owner` in de branchkopie van de productieorganisatie stond al inactief. Geen eigenaarsrechten.
- CI vraagt nu alleen `PHIXAR_E2E_USER_EMAIL` en `PHIXAR_E2E_USER_PASSWORD` (environment `neon-auth-e2e`) plus optioneel `PHIXAR_E2E_VERCEL_BYPASS`; doel, tenant en rol zijn vastgepind. Geen database-URL meer nodig. P7 test nu de echte previewketen (login via de preview, `/api/auth/me`, `/api/workspace`, sessies, afmelden); P8 stuurt `/test-account` op de live preview aan in Chromium met Galaxy S24-emulatie. Het computerscript `scripts/provider-e2e-setup.js` is verwijderd.

**Resultaten**

| Controle | Resultaat |
| --- | --- |
| Unit (`npm test`), lokaal en CI op `5b17d2e` | PASS 227/227 (14 nieuwe tests voor poort, isolatie, foutafhandeling, cookie en logging) |
| Security/browser (`npm run test:security`), lokaal en CI | PASS 77/77, 0 skip (9 nieuwe M-scenario's) |
| M1–M9 mobiele pagina in Chromium met **Galaxy S24-emulatie** en **synthetische** provider | PASS — omgevingscontrole, wachtwoord via e-mailcode, foute code, HttpOnly-cookie, rol manager, werkruimte, twee onafhankelijke sessies, afmelden en "andere sessies afmelden", reset beëindigt sessies, onbevestigd adres, geen geheimen in URL's. Geen echt toestel, geen echte provider |
| U1–U6 echte Neon Auth zonder credentials (CI) | PASS 6/6 |
| V1–V4 live preview (incl. nieuwe poortcontrole V4) | **BLOCKED** — Vercel Deployment Protection (401); geen bypass-secret |
| P1–P8 echte login, sessies, previewketen, browser op preview | **BLOCKED** — `PHIXAR_E2E_USER_EMAIL`/`PASSWORD` ontbreken (0 pass, 12 cancelled); P7/P8 vragen ook de bypass |
| Previewdeployment `5b17d2e` | PASS voor buildstatus (Vercel → GitHub: success). Inhoud en poort niet zelf opvraagbaar: Vercel-koppeling ziet het project niet, runner krijgt 401 |
| Mobiele login op echte Samsung | **NOT RUN** — vereist de eigenaar op zijn telefoon |
| Passkey met gebruikersverificatie op echte Samsung | **NOT RUN** — vereist de eigenaar |

**Eenmalige handelingen van de eigenaar (telefoon)**
1. Open `https://repair-flow-git-test-p0-weba-6c78f5-aminechtaiti-3069s-projects.vercel.app/test-account` en meld je aan bij Vercel als daarom gevraagd wordt (Deployment Protection blijft aan). Alle regels in stap 1 moeten ✓ tonen.
2. Stap 3 op de pagina: code per e-mail, zelf een wachtwoord van minstens 12 tekens kiezen. Daarna stap 2: aanmelden. Verwacht: rol `manager`.
3. Voor CI: GitHub → repository → Settings → Environments → `neon-auth-e2e` → twee environment-secrets `PHIXAR_E2E_USER_EMAIL` en `PHIXAR_E2E_USER_PASSWORD`; daarna de laatste run van "RepairFlow real Neon Auth provider E2E" opnieuw starten. Let op: P5 meldt alle sessies van het testaccount af, ook op de telefoon.
4. Optioneel, voor P7/P8 en V1–V4: Vercel → repair-flow → Settings → Deployment Protection → Protection Bypass for Automation, en de waarde als repository-secret `PHIXAR_E2E_VERCEL_BYPASS`. Dit is een projectbrede sleutel: wis het klembord na het plakken.

**Passkeytest (los van de e-mailcode):** op `/security` een sleutel registreren met vingerafdruk of pincode. Een eerste sleutel blijft *in afwachting*; activering vergt een eenmalige operatorcode buiten het e-mailkanaal (`scripts/mfa-bootstrap-code.js`, owner-rol, 15 minuten). Server-side kan daarna zonder geheimen worden gecontroleerd: `user_verified`, `device_type`, `backed_up`, AAGUID en de beveiligingsgebeurtenissen.

| Criterium | Status |
| --- | --- |
| Mobiele, veilige setupprocedure zonder computer | PASS (code, tests, deployment gebouwd) |
| Isolatiecontroles behouden en uitgebreid | PASS (unit + browser) |
| Mobiele login werkt op de echte preview | **Niet bewezen** — wacht op de eigenaar |
| Echte provider-E2E en browser → Vercel → Neon | BLOCKED |
| Echte passkey op Samsung | NOT RUN |
| **P0 volledig geverifieerd** | **Nee** |

**Bevinding van de eigenaar op de telefoon (2026-11-11, 09:36):** de pagina was bereikbaar (Vercel-aanmelding gelukt) en alle isolatiecontroles slaagden behalve `database_url`. Oorzaak: de Neon–Vercel-integratie maakt per preview een eigen Neon-branch `preview/test/p0-webauthn-browser-e2e-recovery` (`br-sparkling-rain-ba3624ey`, gekopieerd van `main` op 2026-11-08) en injecteert die als `DATABASE_URL`. Die waarde overschrijft de branchspecifieke variabele. Alleen het anonieme `/api/db-health` las die variabele. De poort blokkeerde dus terecht.

**Herstel (commit `7a8826a`):** `/api/db-health` gebruikt nu bij voorkeur de beperkte, geïsoleerde runtimeverbinding (`rf_runtime_login`). De poortcontrole kijkt naar de database die elk codepad werkelijk opent (`health_database`). Een vreemde `DATABASE_URL` van de integratie blijft zichtbaar als waarschuwing "door geen enkele code geopend", zonder waarde. Een brontest legt vast dat geen andere code in `api/` of `lib/` `DATABASE_URL` leest. De integratievariabele bestaat nog in de functieomgeving; uitzetten van automatische previewbranches in de Neon–Vercel-integratie is een optionele opschoning voor de eigenaar. CI op `7a8826a`: unit 228/228, security/browser 77/77, provider-public 6 PASS en 4 BLOCKED, provider-e2e BLOCKED. Een nieuwe proef op de telefoon is nodig; mobiele login is nog niet bewezen.
