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
