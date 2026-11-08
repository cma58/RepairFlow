# PHIXAR — bestaande winkelmodules tegenover cloudwerkruimte

Functionele bron: `PHIXAR-MASTER-FUNCTIONAL-VISION.md` en `PHIXAR-POS-VISION.md`. Codecontrole op `app-v3.js`, `app-customers-v1.js`, `app-refurb-v1.js`, `repairflow-erp-pos.js` en de tenantgebonden `workspace`-API. Dit is een **implementatieverschil**, geen importbesluit.

| Dagelijkse functie | Bestaande browserroute | Beveiligde cloudroute | Resterende blokkade |
| --- | --- | --- | --- |
| Klant | Lokale dossiers, zoeken, historie en samenvoegen | Registratie particulier/zakelijk, lijst en directe reparatiestart | Serverzoekfunctie, deduplicatie met bevestiging, transactionele samenvoeging en klantverkoopkoppeling ontbreken. |
| Reparatie | Uitgebreide intake, dossier, status, foto's/onderdelen, lokale betalingen | Klantkoppeling, basistoestel, diagnose, handmatig akkoord, reservering, QC, afhaling en afdrukoverzicht | Conditiefoto's, accessoires, werkuren, aanvullende offerte, voorschot/saldo, installatiemoment, garantie en reminders ontbreken. |
| Onderdelen | Lokale voorraad en journaal | Transactionele ontvangst, reservering, afboeking bij checkout/afhaling en audit | Beschadigd/verkeerd geleverd, tellingen, inkoopkosten, reeds geïnstalleerde onderdelen en to-order-lijst ontbreken. |
| Refurbished | Inkoop, inspectie, kosten, batterij/grade, QC, verkoop en garantie-retour | Unieke geldige IMEI, beoordeling met audit, verkoop in gemengd mandje | Inkoopprijs, inspectiegegevens, kosten, QC-bewijs, retour en herbeoordeling na retour ontbreken. |
| Kassa | Lokale retailverkoop en bewijs | Gemengde reparatie/product/refurb-verkoop, centen, split geregistreerde betalingen, idempotentie en afdrukbaar niet-fiscaal overzicht | Voorschotten, klantkoppeling, BTW-classificatie, providerverificatie, retour/terugbetaling en creditnota ontbreken. |
| Kassadag | Lokale rapporten | Gesloten dag, tenderoverzicht en managercorrectie met reden | Retouren/refunds in dagtotalen en onafhankelijke reconciliatie ontbreken. |
| Toegang | Browseropslag per apparaat | Actieve manager/eigenaar via sessie en tenant-RLS in testbranch | Echte eigenaarlogin apart en fijnmazige medewerkerrechten ontbreken. |

## Migratiegrens

`v07.html` en zijn lokale sleutels blijven bestaan. Het startscherm op de featurebranch gebruikt uitsluitend cloudgegevens en probeert lokale records niet automatisch te lezen, samen te voegen of te verwijderen. De ruwe export, veldmapping, conflictbeoordeling, proefimport, hersteltest en expliciete productiegoedkeuring staan in `CLOUD-SYNC-MIGRATION-20261107.md`. Tot die gates zijn geslaagd, mogen oude lokale dossiers niet als reeds gedeelde cloudgegevens worden gepresenteerd.

## Volgende P0-implementatievolgorde

1. Server-side klantidentiteit en transactionele importmapping voor alle oude referenties, betalingen en auditrecords, met dry-run op kopieën.
2. Reparatievoorschot, aanvullende offerte en fysiek geïnstalleerde onderdelen onderscheiden van financiële afsluiting.
3. Retourbeleid, terugbetaling/creditnota en dagreconciliatie eerst als goedgekeurde regels vastleggen; geen automatische restitutie of restock bij annulering.
4. Per lijn BTW-behandeling inclusief refurbished margeregeling, bevestigde bedrijfsidentiteit en wettelijk correcte B2B-uitvoer; tot dan alleen duidelijk gemarkeerde niet-fiscale overzichten.
5. Echte eigenaar- en medewerkerlogin, aparte sessies/apparaten, offline/herhaalproeven en import/restore vóór enige productieomschakeling.
