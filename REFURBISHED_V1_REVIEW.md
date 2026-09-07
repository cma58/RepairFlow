# RepairFlow — Refurbished voorraad V1 review

## Huidige situatie
De bestaande Refurbished-pagina is alleen een presentatie-placeholder: KPI's voor voorraad/kost/verkoopwaarde/marge en één voorbeeldtoestel. Er is nog geen eigen persistente refurbished lifecycle-module.

## Review 1 — Product/UX
### Sterk
- Refurbished heeft een eigen hoofdnavigatie.
- De vier KPI's geven onmiddellijk commerciële context.
- De lifecycle kan logisch aansluiten op Reparaties, Klanten, Verkopen en Garantie.

### Ontbreekt
- Zoek/filter/sorteren en kaarten/tabel.
- Duidelijke voorraadstatus en volgende actie.
- Snel toestel toevoegen/scannen/openen.
- Volledig toesteldossier met tabs.
- Mobiel/balie-vriendelijke workflow.

## Review 2 — Architectuur/data
### Nodige kernentiteit
REF-ID, shop/tenant later, device type, merk, model, opslag, kleur, IMEI1/IMEI2/serial, bron, leverancier/verkoper, inkoopdatum, inkoopprijs, accessoires, conditie bij inkoop, batterij, grade, locatie, status, kostenregels, QC, verkoopprijs, reservering/verkoopkoppeling, klant/sale-id, garantie, audit.

### Regels
- IMEI/serial uniek binnen tenant.
- Geldstromen als aparte regels, niet één overschrijfbaar totaal.
- Totale kost = inkoop + onderdelen + arbeid/interne kosten + overige refurbkosten.
- Marge = verkoopprijs - totale kost; margepercentage apart berekenen.
- Historie/audit nooit stil overschrijven.
- Verkoop verandert status en koppelt sale/customer, maar wist refurbhistorie niet.
- Retour/garantie moet naar oorspronkelijke verkoop/refurb terugwijzen.

## Review 3 — Refurbished-business
### Lifecycle
Ingekocht → Inspectie → Te herstellen → In refurb → QC → Verkoopklaar → Gereserveerd → Verkocht. Daarnaast: Afgekeurd / Onderdelen-donor / Retour-garantie.

### Inkoop
- Bron: particulier, leverancier, trade-in/inruil, veiling, eigen retour.
- Verkoper/leverancier + referentie.
- IMEI/serial verplicht waar toestel dit heeft.
- Inkoopprijs en datum.
- Identiteits-/bewijsvelden alleen later toevoegen na juridische/privacycontrole; niet onnodig in demo verzamelen.
- Foto's/conditie/accessoires bij ontvangst.

### Inspectie/refurb
- Scherm, behuizing, camera, audio, laden, connectiviteit, biometrie, knoppen, batterij, vocht/zichtbare schade.
- Reparatie-/onderdelenregels met kost.
- Batterijconditie en eventueel cycli waar beschikbaar.
- Grade A/B/C met configureerbare criteria.
- QC moet voltooid zijn vóór Verkoopklaar.

### Voorraad/verkoop
- Locatie/bak.
- Gewenste verkoopprijs, minimale prijs optioneel.
- Kost, verwachte marge en gerealiseerde marge.
- Alleen Verkoopklaar/Gereserveerd mag naar verkoop.
- Verkoop koppelt klant, verkooprecord, betaalstatus, garantie.

## V1 schermontwerp
### Hoofdscherm
KPI's: Voorraad, totale kostwaarde, verwachte verkoopwaarde, verwachte marge, verkoopklaar, aandacht vereist.

Zoeken op REF-ID, IMEI, serial, merk/model, leverancier. Filters status/grade/type/locatie. Kaarten/tabel toggle.

### Toesteldossier tabs
Overzicht | Inkoop | Inspectie | Kosten & onderdelen | QC | Foto's | Verkoop | Garantie | Documenten | Audit

### Sticky quick panel
REF-ID, model, IMEI/serial, status, grade, locatie, totale kost, verkoopprijs, marge, volgende actie.

## 10/10 acceptatieflow
1. Nieuw toestel inkopen.
2. Uniek REF-ID genereren.
3. Dubbele IMEI/serial blokkeren.
4. Inkoopgegevens + bron registreren.
5. Inspectie vastleggen.
6. Kosten/onderdelen toevoegen en totalen direct herberekenen.
7. Status gecontroleerd door lifecycle laten lopen.
8. QC volledig uitvoeren; Verkoopklaar blokkeren zolang QC incompleet is.
9. Grade, batterij, locatie en verkoopprijs zichtbaar in dossier en overzicht.
10. Zoek/filter werkt op operationele velden.
11. Verkoopactie alleen vanuit geldige status.
12. Klant/verkoop/garantie kunnen zonder dubbele data worden gekoppeld.
13. Retour/garantie behoudt oorspronkelijke historie.
14. Audit toont belangrijke wijzigingen met actor/tijd/oud/nieuw.
15. Archive/donor/afkeur vernietigt geen historie.
16. KPI's worden uit echte demo-data berekend, niet hardcoded.
17. Geen zwart-op-zwart of onleesbare overlaycomponenten.
18. Refresh behoudt demo-data via lokale persistentie; backendmigratie kan later opslag vervangen zonder UX/businesslogica te herschrijven.

## Uitvoeringsbesluit
Bouw Refurbished als eigen laag na Klanten V2.1. Laat Reparaties en Klanten stabiel. Gebruik lokale persistentie voor de demo, maar houd REF-records en relaties genormaliseerd zodat PostgreSQL/Supabase later rechtstreeks kan overnemen.
