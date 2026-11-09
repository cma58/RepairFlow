# PHIXAR fase 2.1 — implementatie en verificatie

Uitgangspunt: branch-head 16be051; bestaande 129 tests groen. Bestaande cloudapp en goedgekeurde shell behouden.

| Prioriteit | Onderdeel | Stand |
|---|---|---|
| P0 | Additieve dossieropslag, IMEI, diagnoseprijs | Implementatie en synthetische DB-proef geslaagd |
| P0 | Offertepauze en expliciet akkoord | Betaalde browser/API- en DB-proeven geslaagd |
| P0 | Voorschotten, correcties, restsaldo | Append-only ledger; geïntegreerd met checkout en kassadag |
| P0 | Versies en veilige retries | Row locks, verwachte versie, idempotente request-ID; browser/API-proef geslaagd (één sessie) |
| P0 | Heropenen met reden/historiek | Geannuleerd/Afgekeurd/Niet herstelbaar ondersteund |
| P0 | Voorraadreservering bij akkoord | Gepland onderdeel en akkoord atomair; eenmalige afboeking bij checkout/afhaling |
| P0 vervolg | Retour/refund, afgesloten kassacorrecties, fijnmazige rechten | Nog releaseblokkerend; niet als gereed markeren |
| P1 | Portalbewijs voor offerteakkoord, intakefoto’s, herinneringen | Nog uitwerken |
| P2 | Verdere operationele optimalisaties | Na P0-verificatie |

Migratie 003 maakt nieuwe ledgers append-only voor de runtime, met FORCE RLS en tenant/vestiging-FK’s. Bestaande status-check blijft intact: nieuwe afsluitredenen staan in outcome en worden door de API gepresenteerd. Reopen wist geen historiek of betalingen. Financiële correctie verwijst naar oorspronkelijke ontvangst, bewaart beide en is geen providerrefund.

Diagnoseprijs is onderdeel van de afgesproken totaalsom; een reeds ontvangen diagnosebetaling wordt eenmaal afgetrokken. Afwijzing initiële offerte rekent uitsluitend de vastgelegde diagnoseprijs. Afwijzing aanvullende offerte behoudt de eerder goedgekeurde prijs en pauzeert tot een medewerker de oorspronkelijke scope hervat.

Browserrunner: /tests/e2e/repair-phase21.html; uitsluitend handmatig starten in vastgecodeerde synthetische 555/666-context. Geen sessietokens uitgelezen. Acht server-/databaseworkflows, aparte herlaadcontrole. CLI-E2E blijft opt-in met eigen testsessie.

## Verificatie 9 november 2026
155 lokale tests groen. Betaalde scenario’s en bestaande kosteloze flow via normale preview-API uitgevoerd; eindstanden, quote-besluiten, betalingen en voorraad onafhankelijk in PostgreSQL gecontroleerd. Zie ERP-STATUS.md voor exacte bedragen, fixturemarkers, bewijsgrenzen en commits. Node opt-in E2E blijft 1 skip wegens ontbrekende shell-testsessie; twee onafhankelijke logins en fysieke netwerk-/iPad-proef blijven open.

Installatie-P0 uitgevoerd in 418e034: expliciete installatie onder dossierlock en exact akkoord, alleen werkelijk gereserveerde onderdelen, idempotente command, auditnotitie. Verbruik blijft behouden bij annuleren/heropenen; extra proef geslaagd op echte testdatabase. Geen nieuwe migratie nodig: bestaande consumed-status en voorraadledger hergebruikt. Installatie bevestigt alle huidige reserveringen samen; selectie van afzonderlijke deelinstallaties is nog niet beschikbaar.
