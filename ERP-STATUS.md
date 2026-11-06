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
