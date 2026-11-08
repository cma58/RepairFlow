# RepairFlow cloudsync — veilige migratie (2026-11-07)

## Huidige situatie
- Reparaties worden opgeslagen in browser-localStorage onder `rf07v3`; voorraad onder `rfInventoryV3`.
- Dit zijn **geen** gesynchroniseerde gegevens. Gebruik op een ander toestel geeft niet automatisch dezelfde dossiers.
- Neon heeft `rf_repairs`, `rf_customers` en andere `rf_*` tabellen, maar nog geen geautoriseerde productieroute voor schrijfacties.
- RLS is standaard gesloten. Geen rechtstreekse browserverbinding naar Neon; geen publieke synchronisatie-endpoints zonder server-side autorisatie.

## Stap 0 — gegevensbehoud
- Handmatige download via **Reparaties → Back-up downloaden**. Bevat persoonsgegevens en mogelijk toestelcodes; lokaal en beveiligd bewaren.
- Exporteer op **elk** apparaat dat eigen lokale dossiers bevat vóór migratie.
- Geen automatische import/overschrijving van bestaande gegevens.
- Eerst inventarisatie van unieke tickets, dubbele referenties, betalingen en verschillen tussen apparaten.

## Implementatievolgorde
1. Server-side authenticatie en roltoegang, PHIXAR organisatie- en filiaalafbakening, sessiebeveiliging, en tenant-scoped RLS-policies.
2. Versiebeheerde server-API met validatie voor klanten, reparaties, betalingen en auditregels. Geen databasecredentials in client JavaScript.
3. Migratie in **dry-run**: lokale `rf07v3` lezen, veldmapping tonen, conflicten en aantallen vergelijken; geen productiegegevens wijzigen.
4. Idempotente import met stabiele bron-ID's en `organization_id`; financiële transacties append-only met unieke referenties.
5. Alleen na bevestiging: cloud als bron van waarheid, browser-cache voor offline gebruik, expliciete pending-sync status, conflictafhandeling.
6. Tests: twee apparaten, netwerkverlies, dubbele betalingen, oude dossiers, herstel na opslagfout, autorisatie tussen organisaties.

## Veldmapping (voorlopig)
- Lokale reparatiesleutel → `rf_repairs.reference` (bewaar originele referentie).
- `name`, `phone`, `email` → `rf_customers` (eerst deduplicatie).
- `device`, `serial`, `customerStatementOriginal`, `status` → reparatiegegevens.
- `payments`, `audit`, `quotes`, `parts` vereisen afzonderlijke, volledig gevalideerde mappings; geen stille weglating.
- `unlock` en andere geheime toestelgegevens **niet** zonder afzonderlijk beveiligingsontwerp naar cloud kopiëren.

## Acceptatiecriteria
- Geen enkel bestaand dossier of betaling verdwijnt.
- Dubbele import veroorzaakt geen dubbele betalingen.
- Een gebruiker ziet alleen gegevens van zijn geautoriseerde organisatie/filiaal.
- Cloudsync is uitgeschakeld totdat autorisatie en migratietests slagen.

## Operationele aanvulling — 2026-11-08

De afgeschermde featurepreview heeft nu een geautoriseerde `/api/workspace` met tenantgebonden RLS en een aparte synthetische dataset. De productie-RLS, echte eigenaaractivatie en migratie zijn **niet** uitgevoerd. De featurebranch toont op `/` de cloudwinkel; het oude `v07.html` blijft bereikbaar voor bestaande browserdossiers. Dit is nog geen gedeeld productie-ERP.

### Voorbereiding per bronapparaat
1. Inventariseer alle browsers/profielen/origins die ooit PHIXAR-data hebben opgeslagen. Een export op één toestel is geen back-up van andere toestellen. Sluit de lokale werkdag af en leg het tijdstip van de momentopname vast.
2. Bewaar de ruwe waarden met sleutelnaam en origin, zonder ze te wijzigen. Minimaal inspecteren: `rf07v3`, `rfCustomersV1`, `rfInventoryV3`, `rfRefurbV1`, `rfPosProductsV1`, `rfPosSalesV1`, `rfPosStockMovementsV1`, plus betaal-, offerte-, dossier- en auditwaarden die bij inventarisatie worden aangetroffen. Een lege of ontbrekende sleutel is een afzonderlijke toestand van onleesbare JSON.
3. Maak twee versleutelde kopieën op gescheiden locaties, noteer SHA-256 per origineel exportbestand, controleer de checksums na teruglezen, en test een herstel in een **afzonderlijk browserprofiel**. Beperk toegang wegens klantgegevens en eventuele toestelcodes.
4. Vergelijk aantallen en identifiers per module en apparaat. Rapporteer dubbele klanten, IMEI's, tickets, betalingen, afwijkende statussen, ontbrekende verwijzingen, beschadigde records en onbekende velden. Geen automatische deduplicatie of veldverlies.

### Dry-run en omschakelgrens
Voor een lokale, strikt read-only structuurcontrole van een bestaande export: `node scripts/preflight-legacy-backup.js /pad/naar/repairflow-backup.json`. Het programma geeft een SHA-256, aantallen en een lijst fouten/waarschuwingen zonder persoonsgegevens of recordwaarden uit te schrijven. Het ondersteunt de volledige POS-browserexport en de beperktere reparatie-export. `readyForImport` blijft bewust `false`: schema/velden, historiek, betrokken apparaten, originele bestanden, toestemming en herstel zijn nog niet gevalideerd. Voer de bronbestanden niet in op een publieke website.

1. Parse kopieën in een geïsoleerde databasebranch. Maak een expliciet mappingrapport van elk veld naar een cloudkolom of een bewaarplichtig restveld. Behandel toestelcodes apart; schrijf ze niet als gewone tekst naar Neon of logs.
2. Gebruik stabiele bronidentiteit `(apparaat, origin, sleutel, record-id)` en import-idempotentie. Maak een conflictlijst voor menselijke beoordeling; importeer nooit betalingen door bedragen op te tellen wanneer de oorspronkelijke transactie-identiteit onduidelijk is.
3. Controleer aantallen, bedragen in centen, voorraadstanden, referenties, herstelbaarheid en roltoegang vóór en na de proefimport. Herhaal de proefimport; er mag geen tweede verkoop, betaling of voorraadmutatie bijkomen. Test twee onafhankelijke apparaten en onderbroken imports.
4. Maak vlak vóór een eventuele productieomschakeling zowel een gevalideerde Neon-back-up/restore-punt als nieuwe bronexports per apparaat. Productie-import en activering zijn afzonderlijke, expliciet goed te keuren stappen.
5. Bij fout: stop schrijfacties, bewaar foutlog en bronexports, herstel Neon vanuit het vooraf geteste herstelpunt of draai een **specifiek geïdentificeerde importbatch** terug via gecontroleerde compensaties. Geen bulkverwijdering of overschrijving van lokale sleutels. Heropen de oude lokale route uitsluitend met uitleg over welke gegevensbron op dat moment gezaghebbend is.
