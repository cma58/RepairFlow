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
