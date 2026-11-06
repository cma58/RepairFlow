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
