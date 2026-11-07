# PHIXAR centrale database — migratieplan

**Status: ontwerp en SQL-bestand op featurebranch; niet uitgevoerd op een database.**

## Huidige browsergegevens
- Reparaties: `rf07v3` (legacy fallback `rf07v2`), zie `app-v3.js`.
- Voorraad legacy: `rfInventoryV3`.
- Klanten: `rfCustomersV1`, zie `app-customers-v1.js`.
- POS: `rfPosProductsV1`, `rfPosSalesV1`, `rfPosCartV1`, `rfPosStockMovementsV1`.
- Bedrijfsinstellingen: `rfBusinessSettingsV1`.
- Er bestaan mogelijk extra module-specifieke sleutels; vóór migratie volledig inventariseren.
- Geen automatische browseropslagreset, geen stille upload en geen import zonder toestemming.

## Veilig implementeren
1. Kies Europese database-regio, configureer database-back-ups en test herstelprocedure. Controleer contract, AVG en verwerkersafspraken.
2. Kies auth-provider voor medewerkers. Server valideert sessie en bepaalt tenant/rol zelf; accepteer geen ongecontroleerde `organization_id` uit een verzoek.
3. Maak afzonderlijke migratie- en runtime-rollen. SQL-schema `db/schema-v0.1.sql` heeft RLS **zonder policies** (deny-by-default); nog niet direct bruikbaar voor de app.
4. Ontwerp RLS-policies op basis van gevalideerde medewerkeridentiteit, organisatie en vestigingsrechten; test tenant-isolatie met twee testbedrijven.
5. Bouw server-API met inputvalidatie, transactiebeheer, auditlogging, autorisatie en paginering. Geen directe databasegegevens of geheimen in browsercode.
6. Maak expliciete eenmalige export/import met preview, recordtelling, ID-mapping, duplicaatcontrole en rollback. Bewaar origineel tot na validatie.
7. Publiceer pas na tests voor reparatie-intake, status, klantrelaties, POS-voorraadtransacties en herstel van back-up.
8. Publieke status-API gebruikt uitsluitend token-hashlookup met vervaldatum/intrekking en vaste allowlist; interne locatie blijft volledig afgeschermd.

## Nog niet gemodelleerd
Kassa-producten, verkopen, betalingen, voorraadbewegingen, refurbished, facturen en garanties vereisen een apart gedetailleerd schema. Dit SQL-bestand is alleen een veilige basis voor organisatie, vestiging, personeel, klant, reparatie en tracking; het is **geen volledige ERP-database**.

## Controlelijst vóór implementatie
- [ ] Databaseprovider en regio bevestigd
- [ ] Auth-provider en sessiemodel bevestigd
- [ ] RLS policies + least-privilege runtime rollen
- [ ] Migratie mapping en proefimport op demo-data
- [ ] Back-up en restore test
- [ ] Cross-tenant autorisatietest
- [ ] Browser-/mobiele E2E-tests
- [ ] Gebruiker geeft akkoord voor livegang
