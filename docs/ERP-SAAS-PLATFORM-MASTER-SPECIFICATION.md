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
- De bestaande login bevat nog twee hardcoded uitnodigingsadressen en een magic-linkformulier. Verwijderen vereist een werkende uitnodigingsroute en providercontrole; dit is P0 en géén schaalbare eindtoestand.

## Prioriteiten

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
