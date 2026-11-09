# ERP SaaS-platform — masterspecificatie

Status: bindende richting, technische basis in uitvoering. Bron: eigenaarsprompt “ERP SAAS-PLATFORM — DEFINITIEF MASTERPLAN” §0–11 van 9 november 2026, plus bestaande PHIXAR-visies. De zes voorafgaande keuzeformulieren en hun letterlijke 72 antwoordregels zijn niet aanwezig in de repository; de 72 onderstaande toetsbare besluiten zijn een uitsplitsing van de aangeleverde mastertekst, geen verzonnen reconstructie van die formulieren.

## Architectuur en grenzen

Neon Auth levert de platformidentiteit. `rf_organization_memberships` koppelt een subject aan een onderneming; `rf_branch_memberships` beperkt de vestigingen. De actieve werkcontext is een geverifieerde serverkeuze en wordt op iedere transactie opnieuw vergeleken met beide actieve lidmaatschappen. Een platformeigenaar is een aparte, niet door `rf_staff.role` geërfde bevoegdheid. Bestaande `rf_staff` en de huidige eenwinkelroute blijven tijdens migratie bestaan; geen automatische backfill of ID-wijziging.

De nieuwe migratie 004 is additief en fail-closed: aanvraag-, lidmaatschaps-, eigenaar- en audittabellen hebben FORCE RLS zonder runtimegrants. De enige platformeigenaarregel wordt eerst inactief voorbereid in een gecontroleerde beheertransactie; activatie vergt afzonderlijke eigenaarstoestemming én aantoonbare sterke authenticatie. Er is nog geen platformbeheerders-API of auditloze impersonatie.

## 72 toetsbare besluiten

| ID | Bron § | Keuze / veilige technische uitwerking | Stand |
|---|---|---|---|
| S01 | 1/2 | PHIXAR is de eerste winkelnaam; platformnaam blijft intern neutraal | Voorbereid |
| S02 | 1/2 | Eén centrale SaaS voor onafhankelijke ondernemingen | Voorbereid |
| S03 | 1/2 | Meerdere vestigingen per onderneming | Voorbereid |
| S04 | 1/2 | Eén identiteit kan bij meerdere ondernemingen horen | Voorbereid |
| S05 | 1/2 | Eén identiteit kan meerdere vestigingen bedienen | Voorbereid |
| S06 | 1/2 | Zelfde eigenaar van twee bedrijven deelt geen data automatisch | Gepland |
| S07 | 1/2 | Klanten en reparaties worden binnen de onderneming gedeeld, met werkcontextautorisatie | Gepland |
| S08 | 1/2 | Voorraadtransfers zijn vestigingsgebonden en auditbaar | Gepland |
| S09 | 3 | PLATFORM_OWNER is gescheiden van winkelrollen | Voorbereid |
| S10 | 3 | Alleen platformeigenaar activeert definitief een onderneming | Gepland |
| S11 | 3 | Platformeigenaar beoordeelt aanvragen | Gepland |
| S12 | 3 | Platformeigenaar beheert vestigingen en nodigt beheerders uit | Gepland |
| S13 | 3 | Platformeigenaar beheert abonnementen en instellingen | Gepland |
| S14 | 3 | Onderzoek van gebruikers en incidenten is doelgebonden | Gepland |
| S15 | 3 | Eerste account heeft een eenmalige gecontroleerde bootstrap zonder hardcoded geheim | Voorbereid |
| S16 | 3 | Afwezigheid verleent niemand automatisch platformrechten | Voorbereid |
| S17 | 4 | E-mailadres en wachtwoord via bestaande identiteitsprovider | Gepland |
| S18 | 4 | Passkey optioneel na provideronderzoek | Gepland |
| S19 | 4 | Wachtwoordherstel via provider | Gepland |
| S20 | 4 | 2FA verplicht voor platform- en winkelbeheerders | Gepland |
| S21 | 4 | Uitnodiging vereist gecontroleerde activatie | Gepland |
| S22 | 4 | Volledige sessie maximaal twaalf uur | Gepland |
| S23 | 4 | Vertrouwd winkelapparaat kan lokale PIN-ontgrendeling krijgen, geen cloudwachtwoord | Gepland |
| S24 | 4 | Actieve sessies moeten onmiddellijk intrekbaar zijn | Gepland |
| S25 | 5 | Basisrollen platformeigenaar/ondernemingseigenaar/manager/technieker/verkoper | Gepland |
| S26 | 5 | Rechten per onderneming, vestiging, module en handeling | Gepland |
| S27 | 5 | Klanten en reparaties lezen/wijzigen gescheiden | Gepland |
| S28 | 5 | Offertes, prijzen en kortingen afzonderlijk bevoegd | Gepland |
| S29 | 5 | Betalen, terugbetaling aanvragen en goedkeuren gescheiden | Gepland |
| S30 | 5 | Kassadag, voorraad en refurbished afzonderlijk bevoegd | Gepland |
| S31 | 5 | Rapporten, marge, export, uitnodiging, blokkering en instellingen afzonderlijk bevoegd | Gepland |
| S32 | 5 | Niemand verhoogt eigen rechten of delegeert méér dan eigen bevoegdheid | Gepland |
| S33 | 5/6 | Elke onderneming kiest eigen kortings- en prijsgrenzen; PHIXAR 5% of €10, laagste grens | Gepland |
| S34 | 5/6 | Goedkeuring op afstand bindt handeling, bedrag, reden en vervaltijd | Voorbereid |
| S35 | 5/6 | Nieuwe onderneming begint als aanvraag | Gepland |
| S36 | 5/6 | Drie configureerbare abonnementsformules | Gepland |
| S37 | 5/6 | Basisbedrag per onderneming plus vestigingstoeslag | Gepland |
| S38 | 5/6 | Maandelijks of jaarlijks, veertien dagen proef | Gepland |
| S39 | 5/6 | Configureerbare korting en testprijs zonder vastgestelde bedragen | Gepland |
| S40 | 5/6 | Wanbetaling leidt via waarschuwing/herstelperiode tot alleen-lezen met exportrecht | Gepland |
| S41 | 6/7 | Upgrade/downgrade/opzegging/heractivatie gecontroleerd | Gepland |
| S42 | 6/7 | Eigendomsoverdracht vereist juridische bevoegdheid en datatoets | Gepland |
| S43 | 6/7 | Platformtoegang vereist sterke authenticatie en doelgebonden audit | Gepland |
| S44 | 6/7 | Noodtoegang is herkenbaar, tijdelijk en nooit auditloos | Gepland |
| S45 | 6/7 | Algemene klantgegevens binnen onderneming breed leesbaar, gevoelige bijlagen apart | Gepland |
| S46 | 6/7 | Audit van financiën, rechten, dossiers, inzage, exports, support en herstel | Gepland |
| S47 | 6/7 | Privacyverzoeken en bewaartermijnen gecontroleerd; geen automatische verwijdering bij wanbetaling | Gepland |
| S48 | 6/7 | Marketing en verwerkingsrollen worden juridisch getoetst | Gepland |
| S49 | 8 | Centrale versleutelde back-up met herstelproef | Gepland |
| S50 | 8 | Ondernemingsexport zonder gedeelde databaseblootstelling | Gepland |
| S51 | 8 | Geautoriseerde herstelverzoeken per onderneming | Gepland |
| S52 | 8 | Offline intake als tijdelijk concept | Gepland |
| S53 | 8 | Offline reparatienotities als tijdelijk concept | Gepland |
| S54 | 8 | Offline synchronisatie vereist apparaatbinding en conflictbehandeling | Gepland |
| S55 | 8 | Geen offline definitieve betaling of transfer zonder veilige transactiearchitectuur | Gepland |
| S56 | 8 | Netwerkverlies bij betaling blijft onzeker tot statuscontrole, met idempotente serverretry | Gepland |
| S57 | 9 | Aanmelden, herstel, uitnodiging, PIN en medewerkerwissel | Gepland |
| S58 | 9 | Platformdashboard gescheiden van winkelomgeving | Gepland |
| S59 | 9 | Aanvragen, ondernemingen en vestigingen | Gepland |
| S60 | 9 | Abonnementen en proefperiodes | Gepland |
| S61 | 9 | Medewerkers, rollen en rechtenmatrix | Gepland |
| S62 | 9 | Goedkeuringen en actieve sessies/apparaten | Gepland |
| S63 | 9 | Beveiliging, audit en privacyverzoeken | Gepland |
| S64 | 9 | Export, back-up, herstel, support en noodtoegang in bestaande visuele taal | Gepland |
| S65 | 10/11 | Synthetische meerdere ondernemingen en vestigingen | Gepland |
| S66 | 10/11 | Twee onafhankelijke browsersessies en waar mogelijk apparaten | Gepland |
| S67 | 10/11 | Cross-tenant en eigenrechtverhoging negatief testen | Gepland |
| S68 | 10/11 | 2FA, passkey, PIN, sessie-intrekking testen | Gepland |
| S69 | 10/11 | Aanvragen, activatie, uitnodiging en read-only/export testen | Gepland |
| S70 | 10/11 | Remote refunds, support, privacy en incidenten testen | Gepland |
| S71 | 10/11 | Back-upherstel, offline synchronisatie en software rollback testen | Gepland |
| S72 | 10/11 | Geen overgeslagen test als geslaagd; geen main/productie/echte migratie zonder toestemming | Gepland |

## Conflicten en niet ingevulde keuzes

- Auditloze noodtoegang en onzichtbare impersonatie worden niet geïmplementeerd. De veilige variant vergt sterke authenticatie, beperkt doel en onveranderbare audit.
- “Handmatig afmelden” kan samengaan met maximaal twaalf uur; gevoelige handelingen vragen opnieuw verificatie. Bescherming tegen sessiediefstal en apparaatverlies blijft ontwerpvoorwaarde.
- Bestaande vaste PHIXAR-tenant in Vercel is geen multi-tenant contextwissel. Het omzetten van API-routes vereist eerst serverautorisatie, nieuwe RLS-proeven en twee echte gebruikerssessies.
- Abonnementsbedragen, platformmerk en definitieve juridische rollen zijn open; geen bedragen of merkwijziging in code.
- Passkey, 2FA en PIN worden pas actief na gecontroleerde provider- en cryptografische integratie; geen tweede wachtwoorddatabase.
- De bestaande magic-linklogin gebruikt voorlopig een branchgebonden serverallowlist zonder adressen in broncode. Een echte uitnodigingstabel, providercontrole en rate limiting zijn P0; de allowlist is geen schaalbare eindtoestand.

## Prioriteiten

### P0 contextstap, 2026-11-09

`005-dynamic-context.sql` maakt een geverifieerde ondernemings- en vestigingskeuze mogelijk via actieve lidmaatschappen, met een afzonderlijke RLS-regel voor de eigen medewerkeridentiteit wanneer deze bij een tweede vestiging werkt. De API accepteert de contextheader uitsluitend met `REPAIRFLOW_DYNAMIC_CONTEXT_ENABLED=true`, valideert de selectie opnieuw binnen dezelfde transactie en negeert tenant-ID's uit de body/query als autorisatie. De bestaande PHIXAR-route blijft standaard op de vaste configuratie. Er is nog geen contextkeuzescherm of persistente sessiecontext; de schakelaar blijft uit in de preview totdat alle huidige accounts gecontroleerd zijn gemigreerd.

Een expliciete servermatrix bevat elf rechtgebieden en een actiegebonden controle voor dynamische contexten. Omdat de huidige GET-projectie ook financiële velden bevat, kunnen technieker en verkoper deze nog niet veilig lezen; een afgeslankte projectie is vereist. Individuele rechten, uitnodigingen, manager-MFA en sessie-intrekking zijn niet af; een actief lidmaatschap bewijst op zichzelf geen tweede factor. De bestaande legacy-winkelroute behoudt de huidige owner/manager-grens. P0-A en P0-C blijven gedeeltelijk.

### P0 accountmigratie en contextkeuze, 2026-11-09

`legacy-membership-migration.js` heeft een dry run en een expliciete apply binnen een door een beheerder beheerde transactie. De input is één organisatie-ID. Alleen actieve `rf_staff`-records met een geldige, bestaande vestiging worden gekoppeld op exact `identity_subject` en organisatie; rol en vestiging worden overgenomen, zonder e-mailadres of platformrechten. Een bestaand afwijkend of ingetrokken lidmaatschap is een conflict, nooit een reden om opnieuw te activeren. Nieuwe koppelingen worden per medewerker geaudit met operator en reden. Er is geen automatische migratie in de deployment. Inactieve PHIXAR-accounts blijven inactief en bestaande Auth-sessies blijven bij Neon Auth.

`006-context-discovery.sql` geeft uitsluitend de actieve eigen lidmaatschappen en vestigingen terug via een beperkte serverfunctie. `/api/contexts` vereist de bestaande geverifieerde cookie, leest via de beperkte runtime en is standaard uit. De contextkeuze staat in de PHIXAR-header; de gekozen IDs zijn alleen selectie-input en worden voor elke winkelrequest opnieuw geautoriseerd. Zoek- en documentverzoeken gebruiken dezelfde context. Een contextwissel blokkeert bij onzekere betalings- of dossierretry, wist de zichtbare vorige werkruimte en herlaadt; lokale concepten zijn per organisatie/vestiging/medewerker gescheiden.

Als de dynamische schakelaar aan staat, moet ook de standaardcontext een actief lidmaatschap hebben. Dit sluit een omweg via de oude vaste PHIXAR-route. De schakelaar blijft uit tot alle bevoegde bestaande accounts zijn gemigreerd en onafhankelijke browser- en providersessies zijn getest. `007-member-rights.sql` voegt vestigingsgebonden allow/deny-overrides toe met FORCE RLS en uitsluitend SELECT voor de winkelruntime. Individuele uitzonderingen worden per request gelezen; schrijfbeheer en remote goedkeuring wachten op een MFA-beveiligde beheergrens. De brede GET-projectie beperkt technieker/verkoper nog steeds.

Zelf afmelden loopt via de reeds gebruikte Neon Auth-provider en verwijdert de browsercookie uitsluitend na een geslaagde providerrespons. Dit is geen bewijs van beheerdersintrekking van alle sessies: die procedure vereist een afzonderlijk geautoriseerde beheeractie en provider-E2E. Uitnodigingen en MFA worden niet als actief gemarkeerd zolang de branchprovider geen geverifieerde verplichte tweede factor en veilige acceptatieflow heeft. Passkeys en apparaat-PIN krijgen geen tijdelijke wachtwoordomweg.

De login-entree gebruikt bij een toekomstige geactiveerde dynamische modus de actieve contextlijst en vereist niet langer een medewerkerrecord in de vaste PHIXAR-onderneming. Zonder geverifieerd actief lidmaatschap blijft de toegang geweigerd. Deze route verleent zelf geen nieuwe rechten; elke winkel-API controleert opnieuw de concrete context en handeling.

### P0 sessie- en uitnodigingsgrens, 2026-11-09

De bestaande Neon Auth-sessie is de enige aanmeldidentiteit. De API vereist nu een provider-sessie-ID, `createdAt` en `expiresAt`; sessies ouder dan twaalf uur worden geweigerd, ongeacht de langere providervervaldatum. De doorgestuurde browsercookie heeft eveneens maximaal twaalf uur. Dit beëindigt oudere previewsessies; nieuwe aanmelding is nodig. Migratie 008 bewaart vestigingsonafhankelijke maar ondernemingsgebonden intrekkingen van één sessie of alle vóór een tijdstip bestaande sessies. De winkelruntime kan uitsluitend eigen intrekkingen lezen; SQL-beheeracties blijven gescheiden. De contextlijst filtert ingetrokken ondernemingssessies en andere ondernemingen blijven toegankelijk. Dit is een app-autorisatieweigering; het verwijdert de onderliggende Neon Auth-sessie niet. Er is nog geen MFA-beveiligd beheer-API voor intrekking of apparaatbeheer.

De herhaalbare legacy-migratie verifieert sinds deze stap exact het `identity_subject` tegen `neon_auth.user.id` en slaat ontbrekende of geblokkeerde providergebruikers over. Geen koppeling via e-mail, geen automatische platformrol. De providerconfig toont e-mail/wachtwoord, e-mailverificatie en magic link, maar geen aantoonbare sessieclaim die een afgeronde tweede factor bewijst. In de geïsoleerde `neon_auth`-tabellen ontbreekt een zichtbare tweede-factortabel. Daarom kunnen uitnodigingsuitgifte, beheermutaties en platformbeheer niet als MFA-afgedwongen worden vrijgegeven. Compatibele route: een door Neon ondersteunde MFA-methode die een server-verifieerbare sessieclaim of step-up-bewijs oplevert; als dat niet beschikbaar is, een gecontroleerde vervanging van de bestaande identiteitprovider door één MFA-capabele provider met ondertekende authenticatieniveauclaims. Geen parallel wachtwoordsysteem of op e-mail gebaseerde rechtenverlening.

### P0 providerbesluit na officiële capaciteitsaudit, 2026-11-09

De [officiële Neon-roadmap](https://neon.com/docs/auth/roadmap) vermeldt MFA voor Managed Better Auth als nog niet ondersteund. De bestaande primaire Neon Auth-identiteit blijft daarom behouden; de gekozen aanvulling is een serververifieerbare WebAuthn-step-up, exact aan dezelfde provider-subject- en sessie-ID gekoppeld. Dit vervangt geen bestaande accounts of sessies. Enrollment, herstel, challenge, replaypreventie, kort geldende actiegebonden grants en FORCE RLS zijn eerst te implementeren en met echte synthetische identiteiten te testen. Admin-acties blijven tot die tijd geweigerd. De provider Admin-plugin heeft wel sessie-API's maar vereist een aparte provider-adminrol; die wordt niet op basis van onze winkelrollen uitgedeeld. Zie `docs/NEON-AUTH-MFA-CAPABILITY-AUDIT.md` voor acht controlepunten, bewijs en testgates. De eerdere mogelijke route van volledige providervervanging is geen gekozen implementatie.

| Prioriteit | Uitvoering | Vrijgavebewijs |
|---|---|---|
| P0-A | Auth- en RLS-grens, alleen-lezen contextdiscovery, nieuwe actieve lidmaatschappen | Twee afzonderlijke sessies, meerdere tenants/vestigingen en negatieve API/RLS-tests |
| P0-B | Gecontroleerde bootstrap, eigenaarbevoegdheid, aanvraag/activatie, uitnodiging | Eenmalige testbootstrap, MFA en geen zelfpromotie; echte activatie pas na toestemming |
| P0-C | Rechtenmatrix, intrekking, remote goedkeuring, audit en read-only | Concurrentie-, sessie- en roltesten |
| P0-D | Providergebaseerd aanmeldscherm, 2FA en herstel; eerst bestaande magic link intact | Echte browser- en providerproeven |
| P1 | Abonnementen, overdracht, privacy, export, herstel | Juridische toets, herstelproef en audit |
| P2 | Passkey/PIN, gecontroleerde offline concepten, verdere UI | Apparaatproeven en conflictresolutie |

## Auditnulmeting

155/155 tests aan het begin. Bestaande cloudwerkruimte, kassa, voorraad en reparatieledger werken in een geïsoleerde tenant; legacy v07 blijft apart. De huidige API kiest organisatie en vestiging uitsluitend uit preview-omgevingsvariabelen. `rf_staff` heeft een unieke subjectkoppeling per onderneming en één `branch_id`; voor meerdere vestigingen zijn nieuwe lidmaatschappen nodig. `rf_staff_scope` controleert subject, actieve medewerker en vestiging maar werkt nog niet als dynamische contextdiscovery. PHIXAR-branding en URL blijven intact. 004 bevat nog geen runtimegrant en is niet op productie toegepast.

Nacontrole: Neon-grants uit standaardprivileges zijn expliciet ingetrokken in 004. De winkelruntime heeft nul tabelrechten op de vijf platformtabellen; FORCE RLS blijft daarnaast actief.
