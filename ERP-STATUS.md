# RepairFlow — ERP/kassa implementatiestatus

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
