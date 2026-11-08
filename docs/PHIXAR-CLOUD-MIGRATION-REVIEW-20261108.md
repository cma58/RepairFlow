# PHIXAR — defectcontrole en veilige cloudvolgorde (2026-11-08)

Status: ontwikkelbranch; geen merge, deployment, schemawijziging of import uitgevoerd. `PHIXAR-MASTER-FUNCTIONAL-VISION.md` en `PHIXAR-POS-VISION.md` bepalen het beoogde gedrag. `ERP-STATUS.md` beschrijft de huidige implementatie, niet de acceptatiecriteria.

## Bevindingen en correcties

| Onderdeel | Bevinding | Correctie / grens |
| --- | --- | --- |
| CI | Magic-link-test zocht `localStorage` ook in een commentaar; split-betalingstest verwachtte door dubbele escape een letterlijke backslash. | Test kijkt naar uitvoerbare regels; betalingstest controleert de echte €300/€388 en €0 open saldo. Server-side callback, cookiecontrole en overige beveiligingsasserties blijven intact. |
| Lokale kassa | Corrupte JSON voor verkoop, voorraad of journaal werd bij mutatie als lege lijst gelezen en kon worden overschreven. | Checkout, artikelinvoer en voorraadmutatie stoppen bij onleesbare/ongeldige arrayopslag. Ruwe data blijven staan voor herstel. |
| IMEI | Bestaand POS-IMEI gebruikte in één vergelijking een foutieve whitespace-regex. Corrupt refurbished-bestand kon de kruiscontrole passeren. | Normalisatie gecorrigeerd; corrupt refurbished-bestand blokkeert nieuwe IMEI-registratie. |
| Refurbished | Ongeldige eigen opslag werd bij laden als lege lijst gebruikt; eerste bewerking kon records overschrijven. Corrupte POS-lijst kon de kruiscontrole passeren. | Geen automatische lege overschrijving; mutaties geblokkeerd bij corrupte eigen data of oncontroleerbare POS-IMEI-lijst. |
| Reparatieonderdelen | Een corrupt POS-voorraadjournaal kon door de gedeelde onderdeelmutatie worden vervangen. | Mutatie weigert ongeldige producten- of journaaldata zonder te schrijven. |

## Nader te behandelen vóór cloudgebruik

- Klanten: `ensureCustomers()` kan een corrupt `rfCustomersV1` als leeg behandelen en vervolgens vanuit reparaties nieuwe klanten opslaan. Klantsamenvoeging wijzigt reparatielinks zonder transactionele rollback of gegarandeerde herlinking van kassaverkopen. Deze paden vereisen afzonderlijke migratie- en browserintegratietests.
- Reparaties: `rf07v3` en legacy voorraad worden bij leesfouten ook naar lege in-memory objecten teruggebracht. De lokale opslag heeft geen atomische transacties tussen dossiers, klanten, voorraad en betalingen.
- Refurbished: statusmodel, optionele QC, garanties en verkoop zijn nog niet gekoppeld aan één servertransactie met POS en voorraad. De UI gebruikt nog A/B/C-grades terwijl de mastervisie Nieuwstaat/Goed/Gebruikt/Beschadigd bevestigt; dit is een productverschil, geen veilige automatische dataconversie.
- Kassa: de browsercheckout blijft retail-only en heeft één betaalmethode; de server-side `lib/pos-checkout.js` is niet op een geautoriseerde publieke route aangesloten. Gecombineerde reparatie/refurbishedregels, voorschotten, split tender, retouren en autorisatie zijn niet als end-to-end cloudflow geïmplementeerd. Handmatig geregistreerd is niet hetzelfde als bank/provider bevestigd.
- Klantportaal: publieke statusroute blijft bewust 503. Mag pas open na tokens, rate limiting, privacyprojectie, tenantautorisatie en revocatie/expiratietests.
- SQL: bestaande 15 `rf_*`-tabellen zijn volgens `ERP-STATUS.md` in Neon aanwezig met ENABLE/FORCE RLS en zonder policies. Het repositoryschema is geen bewijs dat de live database identiek is; controleer schema en privileges read-only opnieuw vóór wijzigingen.

## Migratievolgorde en gates

1. **Inventaris en herstel:** maak op elk gebruikt apparaat een versleuteld exportbestand, controleer checksum, aantallen, onbekende sleutels, ticket/IMEI-conflicten, betalingsreferenties en JSON-vorm. Bewaar de originele exports ongewijzigd. Test restore in een geïsoleerde omgeving. Geen reset of automatische upload.
2. **Identiteit en toegang:** server verifieert medewerkeridentiteit en bepaalt organisatie, vestiging, rol en afzonderlijke rechten zelf. Scheid migratie- en runtime-databasegebruikers. Test RLS onder de echte runtimegebruiker voor eigenaar, medewerker, andere vestiging, andere tenant, ontbrekende en ingetrokken toegang. Laat routes gesloten bij configuratie- of autorisatiefout.
3. **Datamodel en transacties:** versiebeheer voor schema; stabiele bron-ID's en idempotency keys; server-side transacties voor klant/intake, offerte/reservering, installatie, gecombineerde checkout, splitbetaling, voorraadbeweging en audit. Leg fysieke voorraad, reservering, ontvangstregistratie en geverifieerde settlement afzonderlijk vast. Geen dubbele afboeking bij retries.
4. **Proefimport:** dry-run met kopieën, veldmapping en rapport per module, inclusief oude reparaties, klanten, refurbished, legacy onderdelen, POS, voorschotten en audit. Geen onbekende velden stil weggooien. Geheimen zoals toestelcodes apart behandelen; minimale persoonsgegevens, bewaartermijnen en toegang toetsen.
5. **Schaduwvalidatie:** read-only vergelijking per bron en per totaal; twee tenants, twee vestigingen, twee browsers, gelijktijdige checkout, offline resend en rollback/restore testen. Elke afwijking blokkeert omschakeling.
6. **Vercel-preview:** pas na groene CI en autorisatie/RLS-tests een afgeschermde preview met synthetische gegevens. Gescheiden omgevingsvariabelen, geen databasegeheimen in clientcode. Productie-uitrol en gegevensimport vragen afzonderlijke uitdrukkelijke toestemming.

## Open productbesluiten

Volg de nieuwste mastervisie: blokkering van fictief fysiek restocken na annulering van een gemonteerd onderdeel; waarschuwings- en verlengingsmoment van de iPad-timer; financiële behandeling van geïnstalleerde maar onbetaalde delen; exacte korting/prijsafwijkingsbasis en belastingregels. Ontwerp deze niet stilzwijgend in migratiecode.
