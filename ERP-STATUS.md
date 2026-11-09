# RepairFlow — ERP/kassa implementatiestatus

## Dashboardontwerp ter beoordeling (2026-11-08)
- Afzonderlijke `dashboard-preview.html` met horizontale hoofdnavigatie, centrale licht/donkertokens, KPI's, snelle acties, reparatiepipeline, planning en activiteiten. Gebaseerd op de drie werkelijk bekeken PNG's in `docs/design-references/`; die zijn bytegelijk aan het aangeleverde ZIP-pakket.
- Alleen fictieve gegevens in geheugen, geen API- of browseropslagtoegang. De winkelentree, legacy/cloudfunctionaliteiten en gegevens zijn ongewijzigd. Dit is geen productievervanging en geen afgerond operationeel dashboard.
- `npm test`: 116/116; JS-syntax geslaagd. Browsercontroles voor thema, modulewisseling, zoeken, dossier/saldo en voorbeeldklantformulier. Responsieve iframecontroles op 1024/768/390 pixels; geen fysieke iPad/Safari- of printvalidatie. Screenshots en volledige grenzen: `docs/PHIXAR-DASHBOARD-PREVIEW-REVIEW.md`.
- Geen merge, productiedeployment of migratie. Ontwerpbeoordeling door eigenaar staat open vóór aansluiting/vervanging van de startpagina.

## Nu daadwerkelijk geïmplementeerd
- Bestaande reparatie-intake, diagnose, offerte, eindcontrole en afhaling (legacy engine).
- Bestaande klant- en refurbishedmodules blijven behouden.
- Nieuwe kassamodule `repairflow-erp-pos.js`: producten, unieke SKU/IMEI-controle, aantallen, voorraad, winkelmand, lokale verkoopregistratie, betaalmethode, verkoopbewijs, verkoopgeschiedenis, CSV en browserback-up.
- Geen demo-verkopen of fictieve KPI's in de nieuwe kassa, voorraad-, betalings-, bewijs- en kassarapportschermen.
- Alle nieuwe gegevens worden in de huidige browser opgeslagen: `rfPosProductsV1`, `rfPosSalesV1`, `rfPosCartV1`.

## Belangrijke beperkingen (geen productieclaim)
1. Geen serverdatabase, accounts, rollen, auditvaste transacties of synchronisatie tussen apparaten.
2. Geen echte SumUp-/Bancontact-koppeling. De medewerker bevestigt handmatig dat betaling extern is ontvangen.
3. Verkoopbewijs is **geen** conforme Belgische btw-factuur. Wettelijke facturatie, Peppol, btw- en margeregeling vereisen afzonderlijke implementatie en validatie.
4. Kassaproducten en reparatieonderdelen zijn **nog twee afzonderlijke voorraden**. De nieuwe kassamodule wijzigt bewust niet de legacy `rfInventoryV3`-voorraad.
5. Refurbished-verkopen en reparatiebetalingen zitten nog niet in het kassarapport.
6. Geen retouren, creditnota's, inkooporders, leveranciersadministratie of boekhoudexport.
7. Browseropslag is niet geschikt als enige bewaarplaats voor echte winkelgegevens. Regelmatige back-ups zijn noodzakelijk; import/herstel nog niet gerealiseerd.
8. JavaScript is syntactisch gevalideerd; end-to-end browser-, mobiel- en integratietests zijn nog vereist.

## Verplichte tests voor productiegebruik
- Nieuw artikel, dubbele SKU, dubbele IMEI, nul/negatieve prijs en voorraad.
- Winkelmand en voorraadlimieten; prijswijziging vóór afrekenen; meerdere verkopen en nummering.
- Betaling bevestigen/annuleren, browser sluiten/heropenen, CSV-export en afdrukken.
- Opslaglimiet en gedeeltelijk mislukte schrijfactie; herstel vanuit back-up.
- Intake → diagnose → offerte → akkoord → herstelling → QC → betaling → afhaling.
- Refurbished-verkoop en reparatievoorraad koppelen; Belgische btw-facturatie controleren.
- Mobiel en desktop op echte toestellen; toegankelijkheid en toetsenbordbediening.

## Aanbevolen vervolgfases
1. Echte gedeelde database + migratie/backup/restore.
2. Uniform product-/voorraadmodel voor reparaties, refurbished en POS.
3. Betalingsintegratie met provider-webhooks en reconciliatie.
4. Belgische facturatie, Peppol, creditnota's en boekhoudexport.
5. Rollen/rechten, logging, retouren, garantie en leveranciers.
6. Geautomatiseerde end-to-end tests, monitoring en releaseproces.

## Integratiefase: gedeeld overzicht en back-upcontrole
- Nieuw bestand `repairflow-erp-bridge.js` leest reparaties, klanten, refurbished, kassaproducten en kassaverkopen zonder de originele records te herschrijven.
- Het scherm **Boekhouding** toont voorlopig een **bedrijfsoverzicht** met afzonderlijk benoemde bronnen en een expliciete waarschuwing dat dit geen officiële boekhouding is.
- Onder **Instellingen** is een niet-destructieve bestandscontrole toegevoegd voor JSON-back-ups uit de bestaande exportfunctie. Herstellen/importeren is bewust nog niet ingeschakeld.
- Er is **nog geen echte gedeelde database of gedeelde voorraad**. Het overzicht is de eerste veilige integratielaag, niet de definitieve datamigratie.
- JavaScript-syntax gecontroleerd; volledige browser-/integratietests blijven vereist.

## Demo-data definitief opruimen (november 2026)
- Gebruiker heeft bevestigd dat alle huidige registraties demo zijn en de app nog niet operationeel is gebruikt.
- `repairflow-demo-reset.js` verwijdert eenmalig vóór initialisatie de bekende demo-datasets voor reparaties, onderdelen, klanten, refurbished, kassaproducten, verkopen en winkelmandje. Instellingen blijven behouden.
- Resetmarkering `rfDemoDatasetReset20261106` voorkomt dat nieuwe gegevens bij volgende bezoeken opnieuw worden gewist. Let op: per browser/opslagprofiel geldt een eigen markering; andere apparaten hebben hun eigen opslag.
- POS-verkoop kan voortaan aan een bestaande klant-ID uit de klantenmodule worden gekoppeld. Er worden geen nieuwe dubbele klantrecords aangemaakt bij de verkoop.
- Geen serverdatabase of veilige transactiemigratie; voor echte ingebruikname blijven E2E-tests en beveiliging vereist.

## Voorraadbewegingen (volgende bouwfase)
- Kassaproducten krijgen een lokaal voorraadjournaal `rfPosStockMovementsV1` met datum, artikel-ID, mutatie, nieuwe voorraadstand, reden en eventuele kassareferentie.
- Beginvoorraad, handmatige +1/-1-correcties en kassaverkopen worden gelogd; negatieve handmatige voorraad wordt geblokkeerd.
- Bij schrijffouten wordt een herstelpoging gedaan met de oorspronkelijke browsergegevens. Dit is **geen** transactionele serverdatabase: crash, gelijktijdige tabbladen en volle browseropslag blijven risico's.
- Reparatieonderdelen en refurbished toestellen zijn nog **niet** opgenomen in dit journaal. Eén fysieke voorraad over alle modules is dus nog niet gerealiseerd.
- JavaScript syntax gecontroleerd; browsertest en kassatransactietest nog noodzakelijk.

## Gedeelde onderdelenvoorraad (volgende fase)
- Reparatiedossiers kiezen nieuwe onderdelen uit dezelfde `rfPosProductsV1`-catalogus als de kassa; bestaande `rfInventoryV3`-gegevens blijven alleen voor legacy dossiers behouden.
- Reparatie-reserveringen verlagen de beschikbare kassavoorraad en schrijven een beweging naar `rfPosStockMovementsV1` met reparatieticket.
- Onvoldoende voorraad wordt als `ordered` in het dossier gezet; de medewerker moet de levering eerst handmatig inboeken in Voorraad voordat `received` voorraad kan reserveren.
- Verwijderen van een ongebruikt gereserveerd onderdeel boekt voorraad terug. Een als `used` gemarkeerd onderdeel kan niet via de gewone verwijderknop worden teruggeboekt.
- **Nog niet af:** refurbished is niet geïntegreerd; er is geen leveranciersbestelling, centraal transactiebeheer of echte synchronisatie. Browser-/E2E-tests en foutscenario's moeten nog worden uitgevoerd.

## Gecombineerd bedrijfsrapport (november 2026)
- Bedrijfsoverzicht leest nu **apart** kassaverkopen (`rfPosSalesV1`), refurbished verkopen (`rfRefurbV1` met `sale`) en bevestigde reparatiebetalingen (`rf07v3.payments`).
- Toont per bron bedragen en een gezamenlijke lijst met bron en referentie; CSV-export beschikbaar. Geen verkooprecord wordt automatisch in een andere module gekopieerd.
- **Niet verwarren met omzet:** reparatiebetalingen kunnen voorschotten bevatten; refurbished module registreert verkoop maar bevestigt geen betaalprovider. Het totaal is uitsluitend een operationeel overzicht van registraties.
- Refurbished voorraad is nog niet gedeeld met de kassa. Geen btw-aangifte, formele facturatie of serverdatabase.
- JavaScript-syntax gecontroleerd; end-to-end tests in echte browser nog nodig.

## Demo-interface en gegevens opgeschoond
- Alle hardcoded voorbeeld-KPI's, fictieve tabellen, voorbeeldtoestellen en demonstratieknoppen uit `index.html` verwijderd. Functionele modules vullen hun eigen scherm in; anders verschijnt een lege status.
- Destructieve knop **Demo resetten** en handler verwijderd. Niet-geïmplementeerde garantie-, medewerker- en algemene auditnavigatie verborgen (dossier-audit blijft beschikbaar).
- Fictieve KBO-opzoekresultaten en terugkerende voorbeeldklant verwijderd. De bedrijfskiosk heeft geen werkende KBO-koppeling; het btw-nummer wordt alleen handmatig ingevuld.
- Fake SumUp-kaartbevestiging verwijderd: kaartbetalingen kunnen niet als bevestigd worden gemarkeerd via een gesimuleerde terminal. Overschrijving en andere handmatige ontvangsten vragen expliciete bevestiging.
- Op verzoek éénmalige schone start met nieuwe resetmarkering, inclusief kassavoorraadjournaal. **Alle momenteel lokaal opgeslagen registraties uit deze bekende datasleutels worden bij de eerste laadbeurt van deze versie gewist.** Daarna worden nieuwe registraties niet automatisch gewist. Instellingen blijven behouden.
- Bestaande interne CSS-klassenaam `demo-card` is uitsluitend presentatiecode en bevat geen demodata.
- Geen echte browser-/E2E-test uitgevoerd; niet productiegeschikt zonder verdere controle.

## Betrouwbaardere reparatieflow
- Na nieuwe intake verschijnt nu een gewone bevestiging op hetzelfde scherm, geen claim over een melding naar een medewerkerstelefoon.
- Nieuwe ticket- en betaalreferenties gebruiken het actuele jaar, niet langer hardcoded 2026.
- Bij het registreren van een reparatiebetaling wordt **geen factuur meer aangemaakt of geclaimd**: een ontvangstregistratie is niet hetzelfde als een Belgische rechtsgeldige factuur.
- Betalingsregistratie controleert geldige bedragen, onbekende tickets en probeert een mislukte browseropslag terug te draaien.
- Standaard audit-actor is `Medewerker` in plaats van een vaste persoonsnaam. Echte gebruikersaccounts/actoridentiteit ontbreken nog.
- JS-syntax gecontroleerd, geen browser- of betaalproviderintegratietests uitgevoerd.

## Handmatige klantbeslissingen en fotobevestiging
- De knop in het Track & Trace-overzicht claimt geen automatische online klantgoedkeuring meer. Een medewerker moet nu expliciet het contactkanaal en een bewijsnotitie registreren voordat een offerte als goedgekeurd of geweigerd wordt opgeslagen.
- Offertebeslissingen leggen datum, kanaal, toelichting en registrerende rol vast. Bij akkoord vanuit `Wachten op klant` wordt de bestaande statusovergang gebruikt.
- Intakefoto-bevestiging vraagt eveneens om een kanaal en bewijsnotitie; de auditlog zegt nu expliciet dat dit **handmatig geregistreerd** is, niet dat een klant digitaal heeft getekend.
- Dit is **geen** verifieerbare elektronische handtekening of klantauthenticatie. Een klantportaal met eigen toegangscontrole en echte notificaties ontbreekt nog.
- JavaScript-syntax gecontroleerd; browser-/E2E-tests en audit op alle oude klantbevestigingspaden blijven noodzakelijk.

## Veiligheidscorrecties voor winkelgegevens
- Het eerdere destructieve demo-reset-script wordt **niet meer automatisch geladen**. De eenmalige reset is al uitgerold; een browser die later voor het eerst opent, mag niet alsnog nieuwe echte gegevens wissen. Het script blijft historisch in de repository, maar is niet actief.
- Reparatieticket bij kiosk-intake gebruikt nu het actuele jaar. Een offerte probeert alleen een statusovergang naar `Wachten op klant` als die volgens de transitieregels toegestaan is.
- De kassa bewaart nu ook een snapshot van winkelmand en draft bij checkout; bij opslagfouten probeert ze voorraad, journaal, verkoop, draft en interne cartstatus te herstellen.
- **Nog steeds risico:** localStorage heeft geen ACID-transacties of serverback-up; een mislukte rollback bij volle/uitgeschakelde opslag blijft mogelijk. Echte end-to-end tests ontbreken.

## Cross-module IMEI-bescherming
- Bij het toevoegen van een kassaproduct met IMEI wordt gecontroleerd of dat IMEI al bij een actief refurbished toestel bestaat. Bij refurbished inkoop wordt omgekeerd de actieve kassavoorraad gecontroleerd.
- IMEI-vergelijking normaliseert hoofdletters, spaties en streepjes. In de kassacatalogus geldt dezelfde normalisatie voor dubbele IMEI's.
- Dit voorkomt veel voorkomende dubbele invoer, maar is **geen centrale voorraadtransactie**: lokale browseropslag en niet-atomische controles blijven beperkingen. Historisch verkochte/afgekeurde refurbished toestellen blokkeren geen nieuwe actieve POS-invoer.
- JavaScript-syntax gecontroleerd; volledige browsertests en multi-device-synchronisatie ontbreken.

## Echte QR-codes op reparatiedossier en printbon
- Het eerdere schaakbord was geen QR-code. Vervangen door echte lokaal gegenereerde QR-codes via de meegeleverde MIT-gelicentieerde QRCode.js (`vendor/qrcode.min.js` en licentiebestand).
- QR-code bevat **uitsluitend het reparatieticketnummer**, geen klantgegevens, tracking-token of niet-bestaande publieke link. Scan toont het ticketnummer; een publiek klantportaal werkt nog niet.
- QR zichtbaar in de statuspreview, op de toestelsticker en op het ontvangstbewijs. Bij ontbrekende bibliotheek verschijnt een leesbare foutmelding.
- Geen externe QR-service, dus ticketgegevens worden niet naar een QR-provider verstuurd. JS-syntax gecontroleerd, nog geen browser-, print- of fysieke scantest uitgevoerd.

## Professionele printlayouts (ticket en ontvangstbewijs)
- Toestellabel vernieuwd met merk/model, dossiernummer, klant, IMEI/serienummer indien aanwezig, opslaglocatie, status, datum en echte QR met dossiernummer. Print-CSS begrenst het label op 60 × 40 mm.
- Ontvangstbewijs vernieuwd met herkenbare kop, dossierstatus, klant- en toestelgegevens, gemelde klacht, offertebedrag indien aanwezig, reeds ontvangen bedrag en scanbare dossier-QR.
- Ontvangstbewijs wordt **niet** als factuur of definitief garantiebewijs voorgesteld. Online klantstatus is nog niet actief.
- Printlayout en preview zijn responsief. JavaScript-syntax gecontroleerd; fysieke labelprinter, PDF-paginering en QR-scans moeten nog in een echte browser getest worden.

## PHIXAR-documentidentiteit
- Toestellabel, ontvangstbewijs en generieke reparatiedocumentpreview tonen PHIXAR als winkelnaam. Ontvangstbewijs vermeldt Brusselsesteenweg 103, 9050 Gent; juridische naam Gihana, Marcelin; BTW BE 0805.990.222.
- De ondernemer heeft aangegeven dat dit het huidige winkeladres is, maar de aangeleverde KBO-screenshot toont nog Stapelplein 5. De ondernemer moet de KBO-registratie bijwerken; deze documenten zijn geen wettelijk gevalideerde facturen.
- Telefoon/e-mail van de winkel zijn nog onbekend en worden niet verzonnen. Het RepairFlow-softwaremerk blijft behouden in de applicatie zelf.
- JavaScript-syntax gecontroleerd; browser- en printtests nog niet uitgevoerd.

## PHIXAR-website-afstemming (2026-11-07)
- Op basis van aangeleverde screenshots: slogan REVIVE · REPAIR · RESTORE, donkerzwart/groene website-identiteit, www.phixar.be en herstel-/accessoiresfocus verwerkt in ontvangstbewijs en toestelsticker.
- Op scherm krijgt het document een donkere groene previewachtergrond; het eigenlijke papier blijft wit voor leesbaarheid en inktbesparing.
- Geen websiteclaims over reparatieaantallen, succespercentage, beoordelingen, garanties of doorlooptijd overgenomen: die zijn niet geverifieerd. De website toont op screenshots een ontbrekend logo en placeholdercontactadres; dit wordt niet in de kassadocumenten gekopieerd.
- Geen origineel logo-bestand beschikbaar: typografische PHIXAR-woordmerkbenadering blijft gebruikt. JS-syntax gecontroleerd; echte print-/browsertests nog uit te voeren.

## PHIXAR-bedrijfsinstellingen (2026-11-07)
- Instellingenpagina bevat nu een formulier voor handelsnaam, juridische naam, BTW, winkeladres, telefoon, e-mail en website.
- Reparatie-ontvangstbewijs, sticker en generieke reparatiedocumenten lezen bij openen de opgeslagen bedrijfsgegevens uit rfBusinessSettingsV1, met standaardwaarden als fallback.
- Wijzigingen blijven uitsluitend in de lokale browseropslag en synchroniseren niet met andere apparaten. Geen automatische logo-upload of wettelijke factuurvalidatie.
- Bestaande lokale klant- en reparatiegegevens blijven ongemoeid. JavaScript-syntax gecontroleerd; nog geen browser-/printtest.


## PHIXAR klantportaal — ontwikkelbranch, niet live (2026-11-07)
- Toegevoegd: `klant/index.html`, `kiosk/index.html`, `customer-portal.css`, `customer-portal.js`. Beide schermen geven expliciet aan dat online toegang nog niet geactiveerd is.
- Publieke `api/customer-status.js` weigert toegang met HTTP 503 totdat veilige databasekoppeling, rollen en rate limiting zijn gerealiseerd.
- PostgreSQL-conceptschema in `db/schema-v0.1.sql`; nog niet uitgevoerd of gekoppeld.
- `lib/customer-status.js`: cryptografische 256-bit toegangscode, SHA-256 digest en strikte publieke statusprojectie zonder IMEI, locatie, hersteller of interne notities.
- `lib/customer-status-repository.js`: geparameteriseerde SQL voor geldige, niet-ingetrokken toegang. Nog niet aan de publieke API gekoppeld; runtime-RLS-rollen en throttling ontbreken.
- `tests/customer-status.test.js`: Node-testgevallen voor toegangscode, scheiding van gegevens en SQL. JavaScript-syntax gecontroleerd; tests zijn nog niet in CI uitgevoerd.
- PHIXAR is eerste testklant; multi-bedrijf is architecturale voorbereiding. Geen merge, deployment, gegevensmigratie of live database uitgevoerd.


## PHIXAR veilige migratievoorbereiding (2026-11-07)
- `lib/backup-preflight.js`: analyseert bestaande `RepairFlow-browser-backup` v1 zonder gegevens te wijzigen, telt bekende modules, detecteert kapotte JSON en extra modules. Geeft geen persoonsgegevens terug.
- `tests/backup-preflight.test.js`: tests voor tellingen, privacy, ongeldig formaat en ontbrekende mapping.
- GitHub Actions workflow uitgebreid om preflighttests mee te draaien.
- `lib/customer-status-handler.js`: testbare, fail-closed HTTP-laag; **niet aangesloten op publieke route** wegens ontbrekende centrale database en rate limiting.
- Geen echte import, databaseverbinding, login, merge of deploy. Huidige PHIXAR-browsergegevens blijven ongewijzigd.


## PHIXAR kassa-betrouwbaarheid (featurebranch)
- `repairflow-erp-pos.js`: `checkoutInProgress` blokkeert herhaalde checkout-aanroepen binnen één browsercontext.
- Verkoopopslag en afdrukvoorbeeld zijn nu gescheiden: fouten in het renderen van het bewijs veroorzaken geen rollback van reeds opgeslagen verkopen.
- **Beperking:** localStorage is geen echte database-transactie; cross-tab en cross-device races zijn hiermee niet opgelost. Hiervoor blijft een centrale transactionele backend noodzakelijk.
- Syntaxcheck uitgevoerd; nog geen bevestigde browser-E2E-test of deployment.


## Neon integratiecontrole (2026-11-07)
- Neon project `repairflow-db` (Frankfurt), gekoppeld aan Vercel `repair-flow`; 15 `public.rf_*` tabellen geïnstalleerd en alle 15 met ENABLE+FORCE RLS.
- Live schema van `rf_sales`, `rf_products`, `rf_stock_balances`, `rf_staff` vergeleken met de POS-code; `rf_sales.request_id` bestaat.
- Nog **0 RLS policies** op de 15 tabellen; er is **geen geautoriseerde gebruikersroute**. De database is bewust niet vrijgegeven voor POS/klantportaal.
- `api/db-health.js` is een read-only verbindingsprobe; status blijft HTTP 503 (`schema_installed_access_disabled`) tot gebruikersauthenticatie en tenantbeleid veilig zijn aangesloten. Dit is geen 'ready' endpoint.
- Vercel previewdeployment blijft door gratis API-deploymentlimiet (402) geblokkeerd; geen productie-uitrol.
- Bestaande browserdata blijft lokaal; er is geen automatische migratie uitgevoerd.

## P0-herstel en scope eerste winkelversie (2026-11-08, featurebranch)
- Reparatie- en legacy voorraadgegevens worden bij corrupte JSON niet langer als lege nieuwe data weggeschreven. Automatisch opslaan bij het laden is verwijderd. Lokale reparatieschrijfacties proberen beide sleutels terug te zetten bij een gedeeltelijke fout.
- Klantsamenvoeging houdt toestellen en auditregels, koppelt reparaties, POS-verkopen en refurbished-verkopen om, en probeert alle betrokken lokale sleutels bij een schrijffout te herstellen. Een geopend refurbished-scherm krijgt de nieuwe klantkoppeling in geheugen.
- `npm test`: 79 tests geslaagd na deze fase; syntaxcontrole geslaagd. Echte browser-/apparaatintegratie blijft een afzonderlijke gate.
- `api/auth/me.js` gebruikt nu dezelfde streng geverifieerde medewerkersgrens als `api/staff-session.js` en kan niet meer met de algemene database-eigenaarverbinding medewerkers opzoeken. Magic-link-cookie naar actieve medewerkersautorisatie is nog niet gekoppeld; login blijft terecht gesloten.
- Vercel-preview van commit `6c15ddb` was READY, maar `/api/auth/me` gaf HTTP 500 door `require('jose')` van een ESM-pakket in de serverruntime. Hersteld met dynamische import in `lib/neon-auth-identity.js`. Preview van commit `4766abb` is READY; dezelfde route geeft nu gecontroleerd 503 (`Medewerkersportaal nog niet geactiveerd`). Beide GitHub Actions-workflows zijn groen. De beschermde preview-UI is nog niet interactief in een browser getest.
- Lokale POS-regelbedragen en checkout-totaal worden nu in hele eurocenten berekend; prijzen met meer dan twee decimalen worden geweigerd. Een beschadigd winkelmandje wordt niet meer als leeg opgeslagen. Dit blijft een lokale enkelvoudige retailkassa, zonder servertransactie of gecombineerde splitbetaling.
- **P0 open:** browseropslag is niet transactioneel of multi-user; veilig server-side toegangsbeleid/RLS, migratie en herstelde login moeten voor gedeeld dagelijks gebruik aantoonbaar werken.
- **P1 open:** gecombineerde POS-winkelmand, echte split tender, kassadagafsluiting/correcties, volledige refurbished/POS-koppeling en autorisatie van gevoelige acties. De bestaande schermen zijn geen bewijs van een werkende end-to-end winkelversie.
- Klantportaal, automatische herinneringen en verdere rapportage blijven latere fases zolang P0/P1 open zijn. Geen productieclaim.

## Verificatie na P0-betaalcorrectie (2026-11-08, featurebranch)
- Reparatiebetalingen valideren nu hele eurocenten en het resterende saldo, zodat fracties van centen en herhaalde betalingen worden geweigerd. Een directe registratie met de niet gekoppelde SumUp-methode wordt geweigerd; handmatig bevestigde ontvangsten krijgen een expliciete verificatiebron in het betaalrecord. Dit bewijst geen externe settlement.
- `npm test`: 81/81 geslaagd; alle JavaScript-bestanden slagen voor `node --check`. GitHub Actions-runs `42440027302` en `42440027340` voor commit `713e7d8` geslaagd.
- Afgeschermde Vercel-preview [featurecommit 713e7d8](https://repair-flow-5mbywscni-aminechtaiti-3069s-projects.vercel.app) staat op READY; `/` antwoordde HTTP 200, `/api/auth/me` bleef terecht HTTP 503. De interactieve browserflow is door Vercel-aanmeldbescherming nog niet end-to-end geverifieerd. Productie is niet bijgewerkt.
- Read-only Neon-controle: 15 `public.rf_*`-tabellen met ENABLE/FORCE RLS, 0 policies; `neon_auth.user` bevat 2 gebruikers en `rf_staff` 2 inactieve owner-rijen voor één organisatie en vestiging. De eerdere aanname dat er geen gebruikers bestonden was verouderd. Geen medewerker geactiveerd of databasegegeven gewijzigd.
- **Blokkeert dagelijks gedeeld gebruik:** geldige magic-link-sessie wordt nog niet veilig aan actieve server-side medewerkerrechten gekoppeld; RLS-beleid en transacties voor de gecombineerde kassa ontbreken. Geen productiepublicatie of echte datamigratie uitgevoerd.

## Fase 2 — auth en RLS in isolatie (2026-11-08)
- Nieuwe Neon-testbranch `test/phixar-auth-rls-20261108` (`br-purple-king-ban17e74`), afgeleid van main. Alleen op die branch is `db/migrations/001-runtime-read-rls.sql` toegepast en zijn synthetische testrecords gemaakt. De bestaande twee echte staffrijen zijn niet geactiveerd.
- De branch-specifieke Neon Auth-URL komt uit expliciete serverconfiguratie of Vercels `DATABASE_NEON_AUTH_BASE_URL`; de callback-origin uit expliciete configuratie of het door Vercel ingestelde `VERCEL_URL`. De Vercel-projectinstelling bevat de Auth-variabelenaam, maar de concrete runtimewaarde per preview is nog niet bewezen. Vaste productie-Auth-verwijzingen in de preview-login en publieke rewrite zijn verwijderd. De callback accepteert alleen een server-gecontroleerde cookie waarvan de tweede sessiecontrole dezelfde subject-ID bevestigt. Dit is een implementatie en mocktest, **geen bewezen echte mail-link-uitwisseling**.
- `api/staff-session.js` accepteert een door Neon gecontroleerde HttpOnly-sessie of een streng geverifieerde JWT van exact dezelfde Auth-branch en bepaalt rol en vestiging via een beperkte databaseverbinding. Elke staffquery draait na `SET LOCAL` van subject, organisatie en vestiging binnen een transactie. Verbindingen als database-eigenaar worden geweigerd.
- De geïsoleerde `rf_runtime`-rol heeft uitsluitend SELECT op acht tabellen en acht tenantgebonden RLS-policies; andere tabellen blijven standaard gesloten. Test met synthetische eigenaar en beheerder: elk één eigen staffrij, klant en reparatie; verkoopmedewerker ziet geen klantgegevens; inactieve, onbekende, andere vestiging en andere organisatie zien nul rijen. INSERT-recht op klanten is afwezig. `rf_runtime` is nog NOLOGIN; er is geen runtimewachtwoord of previewomgeving gekoppeld.
- `npm test`: 90/90 geslaagd en syntaxcontrole voor alle JS-bestanden geslaagd. De daadwerkelijke login, volledige rolrechten, alle 15 tabellen, cloudschrijfacties en browsertest blijven P0. Loginvlaggen blijven uit, productie-Neon heeft nog nul policies en productiegegevens zijn niet gemigreerd.

## Geïsoleerde cloudwerkruimte (2026-11-08, featurebranch)
- Manager-magic-link is in de beschermde featurepreview in een echte browser geverifieerd; `/api/auth/me` gaf `authenticated:true, role:manager`. Herladen behoudt de melding na de reparatie van de sessiecontrole (`ffd2609`). Een afzonderlijke echte eigenaarlogin is nog niet bevestigd.
- Alleen op Neon-testbranch `test/phixar-auth-rls-20261108` is `db/migrations/002-operational-workspace.sql` toegepast. De beperkte `rf_runtime_login`-verbinding gebruikt voor elke API-aanvraag een transactie met tenant- en vestigingscontext. De manager kan registreren; de synthetische sales-identiteit ziet geen klanten, refurbished of verkoopregels. Productiedatabase en bestaande browserdata zijn niet gemigreerd of gewijzigd.
- Featurepreview `5f3462d` bevat een aparte `/workspace` voor testgegevens. Een echte browserroute werkte: synthetische klant, reparatie, voorraadontvangst en onderdeelverbruik, QC, gecombineerd mandje met reparatie/accessoire/refurbished, €60 contant plus €100 kaart **administratief geregistreerd**, bewijs, afhaling en kassadag €160. Een onbetaalde afhaling werd geweigerd. Een tweede tab las dezelfde databasegegevens. Een afgekeurd refurbished toestel kon opnieuw beschikbaar worden gezet met behoud van auditregistratie.
- Kaartterminalreferentie in de synthetische test is geen providerbevestiging. Bon is geen fiscale factuur. Dagcorrectie met reden en managerrol is als afzonderlijke boeking getest. Nieuwe `request_id`-sleutels en voorraadrijlocks beschermen transacties; het browserconcept bewaart onzekere aanvragen voor expliciete herhaling.
- Na de browsertest is de foutafhandeling voor definitieve 4xx-reacties en onzekere netwerkuitkomsten, het kasoverzicht met betaalmethoden/correcties, en IMEI-controle verbeterd. Deze vervolgaanpassingen vergen een nieuwe preview- en browserverificatie vóór enige verdere claim.
- Preview `198ccda` is READY. De browser toont na herladen €160 geregistreerde verkopen, €60 contant, €100 kaart en €−1 afzonderlijke correctie. Een kassaverkoop na dagafsluiting kreeg een definitieve conflictrespons; de winkelmand kon daarna worden behouden en leeggemaakt. Synthetische owner-RLS leest de tenantgegevens, maar een echte owner-mail-link is nog niet getest. Daarna toegevoegd: zakelijke klantvelden en correctiegrens tegen een negatieve kassadag; test/previewvalidatie daarvoor volgt afzonderlijk.
- Preview `07807b0` is READY; een zakelijke testklant met contactpersoon, bedrijfsnaam, BTW-nummer en verplicht facturatieadres is via de browser opgeslagen en na opnieuw ophalen zichtbaar. De automatische tests en syntaxcontrole blijven groen. QC-actie krijgt nu een expliciete testgeslaagd-registratie of reden van mislukte test; ook hiervoor is een afzonderlijke previewcontrole vereist.
- Preview `4e7ed26` is READY; de browser heeft `Test geslaagd` → `Klaar` → kosteloze afhaling geverifieerd. Voor betaalde nieuwe reparaties is vervolgens een harde servergrens toegevoegd: uitvoering vereist een handmatig vastgelegd offerteakkoord met kanaal, bewijsnotitie, actor, tijdstip en exacte afgesproken prijs. Dit is nog geen digitaal door de klant geverifieerd akkoord. Onderdelenreservering bij akkoord ontbreekt nog.
- Preview `643b8f6` is READY; de browser bevestigde diagnose → wachten op klant → handmatig akkoord → in reparatie voor een betaalde test, met directe uitvoering vooraf verborgen.
- Commit `f00189d` en afgeschermde preview `dpl_6WBVu4EkBZCGy4wJ82pyCosxv5fr` zijn READY; GitHub Actions-run `42494363951` slaagde. `rf_part_reservations` is uitsluitend op de geïsoleerde Neon-branch toegevoegd. De browser toonde voor een synthetische betaalde reparatie fysiek 1/beschikbaar 0 na reservering, en fysiek 1/beschikbaar 1 na annulering met reden. Voor een nieuwe gratis reparatie toonde hij fysiek 1/beschikbaar 0 na reservering, gevolgd door fysiek 0/beschikbaar 0 na QC en afhaling. `npm test`: 110/110 geslaagd en syntaxcontrole geslaagd. Betaalde checkout met reservering is geautomatiseerd getest, nog niet opnieuw in de browser omdat de synthetische kassadag reeds afgesloten is.
- **Blokkerend voor dagelijks gebruik:** bestaande `v07`-modules blijven lokale browsermodules; formeel klantakkoord, fotobewijs, btw/facturen, betaalproviderverificatie, retour/reversal, eigenaarlogin, twee onafhankelijke apparaten en mobiel/iPad zijn niet volledig end-to-end getest of gebouwd. Productie blijft onaangeroerd.

## Eén beveiligde winkelentree in featurepreview (2026-11-08)
- De featurebranch serveert op `/` nu de bestaande winkelindeling als navigatie voor klanten, reparaties, voorraad, refurbished, kassa en kassadag, met uitsluitend `/api/workspace` als gegevensbron. Het statische `index.html` had voorrang op een Vercel-rewrite; die fout werd in de echte browser gevonden en hersteld door het startdocument zelf te vervangen. Het oude `v07.html` en zijn browsergegevens blijven onaangeroerd, zonder automatische samenvoeging.
- Een aparte synchronisatie in `workspace.js` herlaadt de gedeelde servergegevens na mutaties, bij heractiveren van het tabblad en periodiek tijdens zichtbaarheid. De browser bevestigde de managerrol en zag een nieuwe synthetische klant in twee tabbladen van dezelfde sessie. Onafhankelijke browsers/apparaten zijn hiermee niet bewezen.
- GitHub Actions voor `4e4002d` zijn groen (runs `42495602709`, `42495602703`); Vercel-featurepreview `dpl_HutZtLwLjkXf7gFMZcEmSSJkL7Rr` is READY. `npm test`: 111/111; syntaxcontrole geslaagd. Geen productie-uitrol.
- De oude `v07`-modules zijn niet intern herschreven of geïmporteerd; de nieuwe cloudschermen dekken nog niet hun volledige dossier- en kassafunctionaliteit. Retouren, btw-documenten, eigenaarlogin, betaalde reserveringscheckout in een nieuwe browserkassadag en onafhankelijke apparaatproeven blijven open. Het ERP is nog niet klaar voor dagelijkse winkelwerking.
- Vervolgcommit `5a2078a` (featurepreview `dpl_2ibQVoyoEQTyRvfCnC5nmZdfFQ8T`, READY) verbindt de cloudschermen ook in de balieworkflow: een klant direct selecteren voor een reparatie, van reparatie naar onderdeelreservering of kassa, en reeds betaalde reparaties niet opnieuw als open kassaregel aanbieden. De API levert hiervoor de betaalde som per reparatie. Managerbrowsertest bevestigde klantselectie en de kassamodule vanuit de startpagina; geen afrekening uitgevoerd op de al gesloten synthetische kassadag. CI groen en 111/111 lokale tests slagen.

## Afgeschermde betaalde checkoutproef (lopend, 2026-11-08)
- In dezelfde geïsoleerde Neon-testbranch is uitsluitend voor de browsertest een tweede synthetische organisatie/vestiging toegevoegd (`33333333-3333-4333-8333-333333333333` / `44444444-4444-4444-8444-444444444444`). De branch-specifieke Vercel-preview wijst tijdelijk naar deze lege winkel; na de proef worden de oorspronkelijke synthetische IDs hersteld. Geen productieomgeving of echte klantgegevens gewijzigd.
- Browserproef op deze lege synthetische vestiging: klant → betaalde reparatie €50 → handmatig offerteakkoord met 1 gereserveerd scherm → QC → gecombineerd mandje met accessoire €10 en refurbished €100 → €60 cash en €100 kaart als **administratief geregistreerd** → fysieke scherm- en accessoirevoorraad 0, refurbished `sold`, reparatie afgehaald → kassadag €160 gesloten. Ongeldige IMEI afgewezen. Dit bevestigt geen provider-settlement of fiscale factuur.
- De eerste dagcorrectie kreeg 503: `FOR UPDATE` op `rf_cash_days` vereiste een UPDATE-recht dat de beperkte runtime-rol terecht niet heeft. Commit `deda68d` gebruikt een transactiegebonden advisory lock per kassadag met gewone SELECT. `npm test` 111/111, syntax groen; echte managerpreview bevestigde daarna de afzonderlijke correctie €−1 op de afgesloten dag. Geen extra databasegrant gegeven.
- De branch-specifieke previewinstellingen zijn teruggezet op de oorspronkelijke synthetische organisatie `11111111-1111-4111-8111-111111111111` en vestiging `22222222-2222-4222-8222-222222222222`. Productiegegevens en echte klantdata bleven onaangeroerd.

## P0-verificatie en documenten (2026-11-08)
- In de tweede, geïsoleerde synthetische vestiging is de betaalde end-to-end browserflow bevestigd: klant, reparatie €50, offerteakkoord en schermreservering, QC, gecombineerd mandje met accessoire €10 en refurbished €100, €60 cash + €100 kaart administratief geregistreerd, voorraad en refurbished status, afhaling en afsluiting op €160. Geen providerbevestiging of productiegegevens. Ongeldige IMEI afgewezen.
- De eerste correctie op de afgesloten dag faalde echt met HTTP 503. Oorzaak: `SELECT ... FOR UPDATE` vereiste UPDATE-privilege op `rf_cash_days`. De beperkte rol behield zijn rechten; correcties zijn nu per dag in een transactie geserialiseerd via advisory lock. Browser herhaalde correctie en toonde €−1 naast de gesloten €160. Previewinstellingen zijn teruggezet op de oorspronkelijke synthetische tenant; de tweede tenantklant is daar niet zichtbaar.
- Afdrukbare, tenantgebonden reparatie- en verkoopoverzichten toegevoegd. Browsertest bevestigde de gegevens, statusgeschiedenis, drie verkoopregels, splitbetalingen en expliciete niet-fiscale aanduiding. Deze overzichten bevatten geen gevalideerde Belgische BTW-classificatie of volledige bedrijfsidentiteit en zijn geen fiscale factuur. `npm test` 113/113 en syntaxcontrole geslaagd. De volledige oude v07-functionaliteit en veilige productie-import blijven open; zie `docs/PHIXAR-LEGACY-CLOUD-GAP-20261108.md`.
- Read-only importvoorcontrole toegevoegd (`scripts/preflight-legacy-backup.js`): SHA-256, structuur, aantallen en dubbele identifiers/IMEI; geen recordwaarden in rapport, geen serverwrite of automatische migratie. De volledige POS-export en beperkte reparatie-export worden onderscheiden. Test met synthetische fixtures; `npm test` 116/116 en syntaxcontrole geslaagd. `readyForImport` blijft altijd `false` tot handmatig gecontroleerde mapping, kopieën en herstelproef.

## Masterplan fase 2 — auditnulmeting (2026-11-08)
- Eigenaar autoriseert zelfstandig werk op de featurebranch en geïsoleerde testomgeving; main, productie en echte migratie blijven uitgesloten.
- Audit en afhankelijkheden/P0-P1-P2/releasegates: `docs/PHIXAR-FASE2-AUDIT-EN-PLAN.md`. Geen volledige module al productiegereed verklaard.
- Bestaande regressies: 116/116 groen. Neon-testbranch read-only geïnspecteerd: 20 tabellen met ENABLE/FORCE RLS, waarvan 17 met policies. Branchspecifieke Vercelconfiguratie bestaat; preview `17f4692` READY. Geen geheimwaarden uitgelezen.
- Nieuwe P0-bevindingen: ongescopeerde browserdrafts, eerder geladen gegevens blijven zichtbaar na sessieverlies, LIMIT-100-lijsten zijn geen volledige KPI-/zoekbron. Eerst herstel hiervan en dashboardintegratie op bestaande API; geen tweede ERP.

## Masterplan fase 2 — eerste dashboardintegratie (2026-11-08)
- Goedgekeurd v2-ontwerp wordt de horizontale frontend van `index.html` en `workspace.html`, met light/dark, dezelfde bestaande cloudformulieren, gecombineerde kassa en server-side transactiehandlers. `v07.html` en lokale winkelgegevens blijven behouden.
- `lib/workspace-read-model.js`: geautoriseerde globale zoekfunctie buiten de LIMIT-100-lijsten, exacte identifiermatches eerst, letterlijke wildcardbehandeling, begrensde resultaten per groep, volledige serveraggregaties, oudste open dossiers per status en een minimale activiteitenprojectie. Nog geen reparatie-IMEI-veld, refurbished-serial, urgente vlag of iPad-wachtrij in dit schema; UI presenteert die gaten expliciet.
- Clouddrafts zijn voortaan gescheiden per onderneming, vestiging en medewerker. Oude ongescopeerde keys blijven onaangeroerd en worden niet automatisch herhaald. Bij 401/403 worden schermgegevens, formulierinhoud en afdrukinhoud gewist; bij netwerkfalen worden gegevens als verouderd gemarkeerd en schrijfacties geblokkeerd.
- 127/127 automatische tests slagen (116 behouden + 11 nieuw), inclusief echte HTTP-grens met SQL-spy. `npm run test:e2e`: één opt-in echte deploymenttest voorbereid maar **overgeslagen**, omdat geen testsessiecookie in de shell is ingesteld. Geen geslaagde volledige E2E-suite claimen.
- Acht nieuwe zoek-/dashboardqueries zijn tegen de echte geïsoleerde Neon-testbranch uitgevoerd als `rf_runtime_login`; alle slagen. Dezelfde runtimeproef ziet nul reparaties van de andere synthetische tenant en vestiging. Een eerste poging met `SET ROLE` vanaf de beheerverbindingsrol werd door PostgreSQL geweigerd; vervolgens rechtstreeks als bestaande beperkte runtime verbonden, zonder rechten uit te breiden.
- Vervolg: afgeschermde Vercel-browsercontrole van de gekoppelde frontend; echte owner/medewerker, retouren, fiscale documenten, diagnose/voorschotten, iPad-intake en backup/restore blijven releaseblokkerend zoals in het auditplan.

## Fase 2 — gekoppelde browserproef en afdrukherstel (2026-11-08)
- Remote commits: `0e051f5` (audit/plan) en `ca5678b` (dashboardintegratie). Directe Git-push was niet geauthenticeerd; dezelfde gecontroleerde tekstbestanden zijn vervolgens via de GitHub-verbinding met een verwachte branch-head gepubliceerd, zonder force of wijziging van main. Lokale ongepubliceerde previewgeschiedenis blijft in een checkpoint bewaard.
- Vercel featurepreview `dpl_Ah54LDfggNnitgex1axMGpQkQrMF` is READY. GitHub Actions-runs `42525978073` en `42525977961` zijn geslaagd voor `ca5678b`.
- Echte browser met bestaande manager-sessie op de synthetische organisatie `11111111-1111-4111-8111-111111111111` en vestiging `22222222-2222-4222-8222-222222222222`: nieuwe synthetische klant → gekoppelde kosteloze reparatie → diagnose → in reparatie → kwaliteitscontrole → test geslaagd → afgehaald. Na herladen vond de globale serverzoekfunctie vanuit Instellingen het serienummer terug met status Afgehaald. Geen echte klant-/betaalgegevens gebruikt; synthetische auditgeschiedenis blijft behouden.
- Tijdens controle hersteld: een voorbereid afdrukdocument bleef door zijn hidden-attribuut onzichtbaar. Het document wordt nu zichtbaar gemaakt voor controle en afdrukken; bij context-/toegangsverlies wordt ook de zichtbaarheid gewist. Regressietest toegevoegd. Ontbrekend merk wordt leesbaar aangeduid en de vestigingsnaam komt uit de geautoriseerde serverprojectie.
- 128/128 lokale automatische tests slagen. De opt-in sessiegebonden HTTP-E2E-run blijft niet uitgevoerd vanuit de shell; de hierboven beschreven browserproef is afzonderlijk werkelijk uitgevoerd. Nieuwe betaalde checkout, retour/refund, fijnmazige medewerkersrechten, fysieke iPad/smartphone, netwerkonderbreking en complete restore zijn nog niet opnieuw bewezen.
- Eerstvolgende P0: reparatie-uitbreiding (diagnoseprijs, IMEI, aanvullende offerte, voorschotten en heropenen), voorafgegaan door gerichte migratie-/ledgerontwerpen en regressies. Urgentie, intakewachtrij en minimumvoorraad blijven onbekend in de huidige UI tot echte opslag en transacties bestaan.
- Nacontrole `b6d47de`: beide GitHub Actions geslaagd (`42526344596`, `42526344561`), Vercel `dpl_ND7r5LABpycoN4Ry3QUvGDvNZj1x` READY. De echte browser toont het herstelde reparatiedocument met klantlink, serienummer, status Afgehaald en alle vijf statusovergangen.
- Daarbij vastgesteld: datum/tijd in documenten en activiteiten volgden de tijdzone van de testbrowser. Gecentraliseerd op `Europe/Brussels`, inclusief winter-/zomertijdtest; 129/129 automatische tests groen. Desktopnavigatie past vanaf 1360 px weer op één rij om kassaruimte te behouden. Geen wijziging aan bedragen, betalingen of schema.


## Afronding audit en eerste integratiestap — 2026-11-08
- Functionele code gecontroleerd tot `71bb701`; opt-in E2E-hostguard gecorrigeerd in `aec2ad3`. 129/129 automatische regressies en 75 JavaScript-syntaxcontroles slagen. Beide Actions voor `aec2ad3` zijn groen (`42526651118`, `42526651122`); afgeschermde Vercel-preview `dpl_8Gym8fQxUP6Eed7KEzdhNgEG2QL6` is READY.
- Echte browsercontrole aanvullend: alle negen navigatiemodules openen, light/dark werkt met de bestaande cloudgegevens, desktop heeft geen horizontale pagina-overloop. Belgische tijd is zichtbaar in activiteiten. Dit is geen fysieke iPad-/smartphoneproef.
- Zonder app-sessie toont een afzonderlijke preview-origin Geen toegang, geen klant-/reparatiegegevens en geblokkeerde invoer. Er is geen login of rechtenverruiming uitgevoerd voor die controle.
- Synthetische kassaproef op de al afgesloten dag: artikel €10 + contant invullen → server weigert met conflict; winkelmand blijft behouden, onzekere aanvraag wordt na de definitieve fout opgeheven, beschikbare voorraad blijft 1 en de verkooplijst blijft bij de bestaande verkoop. Daarna uitsluitend het eigen nieuwe testmandje leeggemaakt. De generieke conflicttekst kan nog concreter worden gemaakt; een geslaagde nieuwe betaalde checkout is hiermee niet bewezen.
- Deze fase is een afgeronde audit met eerste veilige frontendintegratie, geen afronding van het volledige masterplan. Gebrek aan urgente vlag, intakewachtrij, voorschotledger, fiscale documenten, retouren, fijnmazige medewerkersrechten en geteste restore blijft releaseblokkerend. Productie/main/echte migratie zijn niet gewijzigd.


## Fase 2.1 — reparatieledger in verificatie (2026-11-08)
- Additieve migratie 003 uitsluitend op geïsoleerde Neon-testbranch toegepast: dubbele IMEI/serienummer, diagnoseprijs, versienummer, aanvullende offertes/beslissingen, append-only betalingen/correcties en idempotente opdrachten. Geen historische gegevens verwijderd.
- Dossierdialoog binnen de bestaande PHIXAR-shell; expliciete akkoordregistratie, betaalhistoriek/restsaldo en heropenreden. Server vereist exacte dossier-versie en blokkeert betaald werk tijdens open offerte. Kaartregistratie blijft administratief, nooit extern bevestigd.
- 153/153 lokale tests geslaagd (129 behouden, 24 nieuwe). Echte betaalde browser-/databaseverificatie is nog in uitvoering; geen vrijgaveclaim.
- Tijdelijke previewcontext: uitsluitend synthetische onderneming 55555555… / vestiging 66666666… op bestaande geïsoleerde testdatabase. Geen productie/main/echte migratie.
- Resterende grenzen: twee onafhankelijke medewerkersessies, fysieke iPad, echte netwerkonderbreking en fiscale terugbetaling na afhaling nog niet bewezen.


## Fase 2.1 — cloudverificatie en installatie-P0 (2026-11-09)

### Opgeleverd
- GitHub `f0b48293e9e45ecea4f359217cbc26d62841afcb`: dubbele IMEI/serienummer, diagnoseprijs per dossier, aanvullende offertes met werkpauze en expliciet medewerker-geregistreerd klantbesluit, voorschotten/deelbetalingen/restsaldo, append-only correcties, heropenreden en versie-/retrybescherming. Bestaande 129 tests behouden.
- GitHub `418e03421e29b9c19f4b86a5ccb00d101a9cb851`: eerstvolgende voorraad-P0 uitgevoerd. Installatie verbruikt werkelijk gereserveerde onderdelen vóór annulering. Verbruikt blijft verbruikt bij annuleren/heropenen; checkout/afhaling verbruikt deze reserveringen niet opnieuw. Bestaande nog niet geïnstalleerde reserveringen worden bij annulering vrijgegeven. Geen fictieve terugboeking.
- Geen nieuwe frontendstijl. Dossierdialoog gebruikt dezelfde PHIXAR-thema’s. Desktop dark/light gecontroleerd; dashboard en dossier op 1024px iframe gecontroleerd (inhoudsbreedte 1007px, scrollbreedte 1007px; dialoog 975px, eigen scrollbreedte gelijk aan clientbreedte). Dit is geen fysieke iPad-proef.

### Aantoonbare synthetische cloudproeven
- Vaste geïsoleerde tenant 55555555…/vestiging 66666666…, run `b3fb8fd4`: alle acht scenario’s hebben opgeslagen records; de runner voert ze sequentieel met assertions uit. Na sessiehervatting zijn eindstanden onafhankelijk met SQL en de normale dossier-UI gecontroleerd. De oorspronkelijke runner-tab en zijn laatste rapport waren niet meer beschikbaar; daarom vormen SQL en heropende dossiers het blijvende bewijs, geen bewaard volledig browsertranscript.
- Reparatie €150: losse ontvangst €50 + kassaverkoop €100, afgehaald, saldo nul. Herhalen van beide request-ID’s maakte geen tweede boeking.
- Diagnoseprijs €25: ontvangst €25; meerwerk expliciet geaccepteerd tot €180; eindafrekening €155; afgehaald, saldo nul. Initiële diagnoseprijs blijft apart herkenbaar en wordt niet dubbel gerekend.
- Aanvullende offerte €190 geweigerd: besluit `declined`, oorspronkelijk totaal en ontvangen afrekening €150, saldo nul. Geen automatische hervatting of extra kosten; oorspronkelijke scope wordt expliciet hervat.
- Afgekeurd dossier: heropend met reden, nieuwe offerte €90 geaccepteerd, ontvangsten +€10/−€5/+€85. Correctie verwijst naar oorspronkelijke betaling en heeft reden. Afgehaald, netto €90, saldo nul; oude gebeurtenissen behouden.
- Gereserveerd onderdeel: één ontvangst +1, één verbruik −1, fysieke voorraad nul, geen actieve reservering; €50+€100 betaald, afgehaald.
- Parallelle HTTP-aanvragen met dezelfde dossier-versie: één identifierwijziging en één command opgeslagen, versie 1. Later is ditzelfde synthetische dossier via het gewone formulier voorzien van twee geldige test-IMEI’s; versie 2 en beide waarden blijven na browserherladen zichtbaar. Deze latere handmatige proef is geen tweede race.
- Gesimuleerd responsverlies na servercommit: herhalen van exact dezelfde opgeslagen opdracht resulteert in één command, één status-event, versie 1. Echte fysieke offline-onderbreking nog niet bewezen.
- Eerder overgeslagen kosteloze workflow is via browser/API uitgevoerd: afgehaald, vijf status-events, versie 5, saldo nul. De afzonderlijke Node-run `npm run test:e2e` blijft expliciet SKIP (0 pass, 1 skipped), omdat `PHIXAR_E2E_SESSION_COOKIE` niet in de shell staat. Geen sessiecookies uit de browser geëxtraheerd.
- Extra browserproef run `a18e076f`: installatie → annulering → heropening GESLAAGD zichtbaar. DB: status Diagnose, versie 8, reservering consumed, fysieke voorraad 0, precies twee voorraadmutaties (+1/−1), één repair.install-audit.

### Beveiliging, tests en beperkingen
- 155/155 automatische tests groen (129 oorspronkelijke +26 nieuwe), 79 JavaScriptbestanden syntax gecontroleerd; geen mislukte lokale tests. De eerste browserstart werd terecht geweigerd door een verkeerde synthetische fixture-identiteit; fixture gekoppeld aan de bestaande geverifieerde testmanager, zonder productieaccount te activeren.
- Echte beperkte DB-rol `rf_runtime_login`: juiste scope zag 8 dossiers/6 losse betalingen bij de controle; vreemde tenant 0/0, verkeerde vestiging 0/0. Nieuwe ledgers hebben SELECT/INSERT, geen UPDATE/DELETE. FORCE RLS en samengestelde sleutels actief.
- Vercel `dpl_85eeWR4vA5szqa29cEU7oBr2Jc87` READY voor 418e034; Vercel commitstatus success. GitHub-tool voor workflowruns filtert alleen PR-runs en retourneerde leeg: geen nieuwe Actions-succesclaim zonder afzonderlijke verificatie.
- Authenticated concurrency gebruikt één sessie met gelijktijdige aanvragen; unit-test gebruikt twee actor-ID’s. Twee onafhankelijke geverifieerde medewerkerslogins blijven releaseblokkerend. Sales/technician blijven bewust geweigerd tot afzonderlijke rechten correct zijn ontworpen.
- Klantbesluit is een controleerbare medewerkerregistratie met kanaal en notitie, geen geauthenticeerde portalhandtekening. Kaartontvangsten blijven administratief geregistreerd, geen providerbevestiging.
- Correcties van losse ontvangsten zijn begrensd en traceerbaar. Refund/creditnota na afhaling, fiscale BTW/Peppol, volledige kassadagopening/telling, fijnmazige rechten, echte offlineproef en herstelproef blijven P0. Deze fase is niet productiegereed verklaard.
- Previewvariabelen teruggezet naar oorspronkelijke synthetische 111…/222…-context voor de volgende deployment; testrecords 555… blijven behouden. Migratie 003 uitsluitend op bestaande geïsoleerde testbranch. Main, productie, legacybestand en echte gegevens niet gewijzigd.
- Eerstvolgende technische werkzaamheden: formele retour/refund-ledger en voorraadcontrole voor verkeerd geleverde onderdelen; twee onafhankelijke sessies en herstelproef; daarna fiscale documentketen onder actuele Belgische verificatie.

## SaaS-platform P0 — eerste veilige fundering (2026-11-09)
- De huidige 155 tests zijn opnieuw uitgevoerd en geslaagd. Audit: één Neon Auth provider, maar `REPAIRFLOW_ORGANIZATION_ID`/`BRANCH_ID` bepalen nog één vaste winkelcontext; `rf_staff` koppelt één vestiging per rol. De magic-linklogin gebruikte twee hardcoded adressen; die zijn nu in een branchgebonden serverallowlist geplaatst. Een echte uitnodigingsflow blijft P0. Nog geen echte platformeigenaar, dynamische tenantkeuze, rechtenmatrix, abonnements- of apparaatbeheer.
- Nieuwe `docs/ERP-SAAS-PLATFORM-MASTER-SPECIFICATION.md`: 72 toetsbare besluiten, architectuur, veiligheidsconflict rond auditloze noodtoegang, open juridische/providerbesluiten en P0/P1/P2-volgorde. De oorspronkelijke zes antwoordformulieren zijn niet in de repo; de traceerbare uitsplitsing komt uit het huidige eigenaarsprompt.
- Additieve migratie 004 op uitsluitend de bestaande geïsoleerde Neon-testbranch: platformeigenaar (default inactive, uniek bootstrap-slot), aanvragen, ondernemings- en vestigingslidmaatschappen, append-only bedoelde platformaudit. Vijf tabellen FORCE RLS, geen grants/policies aan winkelruntime. Controle: 0 nieuwe eigenaars/leden, 17 bestaande reparaties en 8 klanten intact. Geen testgebruiker geactiveerd.
- `prepareInactiveOwner` is uitsluitend een beheervoorbereiding binnen een door de caller beheerde transactie; verifieert subject/referentie, weigert tweede voorbereiding en schrijft audit. Het verleent geen actieve bevoegdheid. 159/159 automatische tests groen. Geen nieuwe browser-E2E of tweede onafhankelijk ingelogde sessie bewezen in deze stap. De loginallowlist is alleen op de ontwikkelpreview geconfigureerd; zonder configuratie weigert de server elke aanvraag.
- Eerstvolgende implementatie: een veilig, server-geautoriseerd contextkeuzepad met actieve membershipcontrole en negatieve tenant/vestigingstests; providerondersteuning voor MFA en uitnodiging vaststellen. Pas daarna winkel-API's geleidelijk van vaste variabelen loskoppelen, zonder oude gegevens automatisch te kopiëren. Echte platformaccountactivatie en productie vereisen de expliciete toestemming van de eigenaar.

- Nacontrole nieuw schema: Neon-defaultprivileges gaven `rf_runtime_login` onbedoeld SELECT op vijf nieuwe tabellen. Geen RLS-policy gaf rijen vrij. Migratie 004 trekt deze privileges nu expliciet in; geïsoleerde database toont nul runtimegrants op die tabellen.

## SaaS P0 vervolg — dynamische context in gecontroleerde voorbereiding (2026-11-09)
- Begincontrole: huidige ontwikkelbranch en 001–004 nagekeken; 159/159 tests opnieuw groen. Bestaande PHIXAR-winkel-API gebruikt nog standaard de omgevingscontext. Geen main-/productiehandeling.
- Additieve migratie 005 uitsluitend op de geïsoleerde Neon-testbranch toegepast. Zelfleesbeleid voor actieve ondernemings- en vestigingslidmaatschappen; RLS-staff-scope accepteert ook een geverifieerd lidmaatschap. Een aanvullende RLS-regel laat alleen het eigen oude medewerkerrecord zien bij een tweede vestiging. Bestaande tabellen/rijen zijn niet gewist. Testfixture: één synthetische actor in drie synthetische ondernemingen, met een extra tweede vestiging; geen echt account geactiveerd.
- Nieuwe opt-in contextheader wordt alleen na geldige Neon Auth-sessie en server-side actieve lidmaatschappen gebruikt. URL/body-tenant-ID's zijn geen autorisatie. Standaard uitgeschakeld en PHIXAR valt terug op de bestaande vaste context. Een elfdelige serverrechtenmatrix beperkt de dynamische acties; manager kan geen beheercorrectie of terugbetaling goedkeuren. Technieker/verkoper kunnen de huidige samengestelde GET-projectie niet lezen vanwege financiële velden.
- Geïsoleerde DB-rolproeven: synthetische geautoriseerde actor zag drie toegestane ondernemingscontexten en tweede vestiging; een andere actor zonder lidmaatschap zag in de vreemde onderneming 0 klanten en 0 lidmaatschappen, `rf_staff_scope=false`. De tweede vestiging liet na de RLS-correctie de eigen actor zien. HTTP-grenstest weigert vervalste contextheader vóór zoekoperaties. `npm test`: 164/164 geslaagd, 0 overgeslagen; dit is geen echte browser-E2E of raceproef voor lidmaatschapsintrekking.
- Open P0-blokkades: previewflag blijft uit; echte contextkeuze en volledige per-moduleprojecties, bestaande accounts veilig naar lidmaatschappen overzetten, individuele rechten en delegatie, vervangende uitnodigingsflow, 2FA, sessie-intrekking, platformbeheerschermen en twee onafhankelijke browsersessies. Echte platformeigenaaractivatie vraagt afzonderlijke eigenaarstoestemming. Geen productieclaim.
- Negatieve DB-schrijftest met een bestaande synthetische actor zonder lidmaatschap in onderneming 333…: `INSERT rf_customers` kreeg SQLSTATE 42501 van RLS; controle achteraf bevestigde 0 verboden rijen. De nieuwe previewdeployment voor `b5a4a261` is READY; de opt-in schakelaar is niet aangezet, zodat deze preview de nieuwe multi-tenant route nog niet functioneel bewijst.
