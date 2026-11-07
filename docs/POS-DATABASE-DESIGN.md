# PHIXAR POS-database en transactieregels — concept

**Niet uitgevoerd; uitsluitend featurebranch.** `db/schema-v0.2-pos.sql` bouwt voort op v0.1 en beschrijft de eerste kassa-entiteiten.

## Minimale garanties
- Eén verkoop bevat meerdere verkoopregels en geregistreerde betalingen. Productprijs en omschrijving worden als snapshot op de verkoopregel bewaard.
- Geldbedragen als gehele eurocenten; geen JavaScript floating-point berekening in de database.
- Voorraad per vestiging, met append-only voorraadmutaties en afzonderlijke actuele voorraadbalans.
- Een checkout moet één database-transactie zijn: voorraadrijen vergrendelen, voorraad controleren, verkoop en regels opslaan, voorraadmutaties en saldo's schrijven, daarna commit. Bij fout volledige rollback.
- De client mag geen betalingsbevestiging van een kaartprovider simuleren. `recorded` betekent administratief geregistreerd; `confirmed` vereist bewijs van betaalprovider waar van toepassing.
- Klant- en POS-data van verschillende ondernemingen zijn gescheiden met `organization_id` en samengestelde foreign keys. RLS staat aan zonder toegangsbeleid: standaard geweigerd.
- Voordat productie mogelijk is: authenticated staff API, expliciete autorisatie per organisatie en vestiging, RLS-beleid, idempotency keys voor checkout, voorraadconcurrentietests, BTW-/factuurontwerp, back-ups en gecontroleerde migratie.

## Bestaande lokale data
- POS-producten: `rfPosProductsV1`.
- Verkopen: `rfPosSalesV1`.
- Voorraadmutaties: `rfPosStockMovementsV1`.
- Winkelmand: `rfPosCartV1` blijft een concept/draft en wordt niet automatisch als verkoop geïmporteerd.
- Exacte velden en relaties moeten aan de hand van echte testexport gecontroleerd worden; geen stille migratie.

## Nog open
Refurbished voorraad, IMEI-relaties over modules heen, kortingen, BTW-tarieven, retouren, kassasluitingen, betaalproviderintegratie en boekhoudexport vereisen aanvullende uitwerking. De huidige tabellen mogen niet als fiscale conformiteitsgarantie worden beschouwd.
