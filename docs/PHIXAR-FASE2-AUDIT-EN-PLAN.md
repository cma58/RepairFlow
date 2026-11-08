# PHIXAR masterplan fase 2 — audit en uitvoeringsplan

Datum: 2026-11-08. Scope: `feature/customer-portal-ipad-batch-20261107`. Ontwerp v2 is goedgekeurd; productie, main en echte migratie blijven uitgesloten.

## Auditbasis en bewijs

Broncode: `index.html`, `workspace.html`, `workspace-shell.*`, `workspace.js`, `api/workspace.js`, `lib/workspace-{session,operations}.js`, authenticatie, SQL/migraties, legacy `v07.html` met gekoppelde scripts en bestaande tests. Functionele basis: dashboardbrief, mastervisie, POS-visie, ERP-status, cloudsync-/legacy-gap-/login-/Neon-documenten. Oudere documenten bevatten historische toestanden; onderstaande actuele controle vervangt die niet stilzwijgend maar duidt de afwijkingen.

- Nulmeting: **116/116 bestaande tests geslaagd**. Het zijn hoofdzakelijk unit-, mocktransactie- en broncontracttests; geen bewijs van volledige PostgreSQL/browser-E2E-dekking.
- Remote branch bij start: `17f4692`. Lokale, nog niet gepushte previewcommit `ac329dc` behouden en verenigd met de remote documentatie; geen reset of verlies van werk.
- Vercel: preview `dpl_Fbokp9CJ7UXrEyR8gLuxbkEW7r8x` voor `17f4692` is READY. Dit bewijst deployment, niet dat alle winkelprocessen werken.
- Neon read-only cataloguscontrole op **uitsluitend** `test/phixar-auth-rls-20261108` (`br-purple-king-ban17e74`): 20 `rf_*`-tabellen met ENABLE+FORCE RLS; 17 hebben policies, 3 blijven gesloten (`rf_customer_access`, locaties en transfers). Oude claim '15 tabellen/0 policies' geldt niet voor deze operationele testbranch.
- Branchspecifieke Vercel-previewconfiguratie bestaat voor runtimeverbinding, rol, tenant, vestiging en Auth; geheimwaarden niet uitgelezen. De runtimeverbinding wordt in de API gecontroleerd op rol en BYPASSRLS.

## Modulematrix bij start

Geen volledige module is al voor dagelijks multiwinkelgebruik geaccepteerd. 'Werkt' hieronder betekent begrensde geïmplementeerde functie met bestaande tests/historisch testbewijs, niet productiecertificering.

| Module | Werkt binnen bestaande cloudscope | Gedeeltelijk / demonstratie | Ontbreekt en legacyverschil |
| --- | --- | --- | --- |
| Dashboard | Cloudstartpagina met dezelfde operationele formulieren als `/workspace` | Goedgekeurd dashboard is losstaande fictieve preview; oude cloudshell heeft zijbalk | Integratie, volledige server-KPI's, globale zoekfunctie, light/dark, echte prioriteitsdata |
| Klanten | Particulier/zakelijk, contact, BTW-opgave, verplicht zakelijk facturatieadres, klant → reparatie | Laatste 100 klanten, geen volledige zoekfunctie | Bevestigde deduplicatie, merge, uitgebreide historie en import van lokale klantrelaties |
| Reparaties | Intakebasis, klantlink, diagnose/statusovergangen, exact handmatig offerteakkoord, onderdelenreservering, QC, betaalde/gratis afhaling | Geen aparte diagnoseprijs; offerte alleen charge-veld plus notitie; prompts in plaats van dossierformulieren | IMEI naast serial, conditiefoto's, toebehoren, aanvullende offertes, voorschotten, onherstelbaar/heropenen, garantie, reminders, 90-dagenbeheer |
| iPad / klantportaal | Beschermde interne werkruimte; publieke statusfunctie heeft privacy-unit-tests | Publieke route blijft gesloten; statische schermen zijn geen live intake | Gedeelde tijdelijke intake, claim/lock, ontvangstbewijs, beveiligde foto's, timer en notificaties |
| Kassa | Gemengd mandje, hele centen, cash/card/ontvangen transfer, split tender, idempotentie, voorraad en audit in transactie | Betalingen zijn administratief geregistreerd; prijzen server-authoritatief; lokale clouddraft | Voorschotledger, klantlink verkoop, kortingen/overrides, diensten zonder fysieke voorraad, retour/refund/creditnota, BTW-classificatie |
| Kassadag | Dagafsluiting, methode-overzicht, managercorrectie met reden | Geen expliciete opening/kastelling; open dag mag niet worden verzonnen | Openingsgeld, kasuitgaven, telling/verschillen, retourreconciliatie |
| Onderdelen/voorraad | Ontvangst, fysieke/beschikbare voorraad, reserveren/vrijgeven, verbruik bij afhaling/checkout | Geen geïnstalleerd-maar-onbetaald model; laatste 100 artikelen | Leveranciers/inkoopprijzen, minimum, bestellingen/deelleveringen, foutieve levering/quarantaine, telling/goedkeuring |
| Refurbished | Geldige unieke IMEI, registratie, beoordeling/herbeoordeling met audit, gemengde verkoop | Beperkt statusmodel tegenover uitgebreide lokale module | Inkoop, kosten, conditie, inspectie/QC, serial, reservering, garantie/retour, volledige apparaathistorie |
| Documenten/fiscaal | Tenantgebonden reparatie-/verkoopoverzicht en afdrukken | Expliciet niet-fiscaal; geen bankbevestiging | Bedrijfsidentiteit, gevalideerde BTW/margeregeling, factuurnummers, facturen, creditnota, Peppol |
| Beveiliging | Geverifieerde sessie, actieve medewerker, transactionele tenantcontext, beperkte runtime, default-deny | Workspace is alleen owner/manager; eerdere managerbrowserproef, echte owner apart niet bewezen | Instelbare medewerkerrechten, organisatiebrede owner-RLS, onafhankelijke sessies/apparaten, revocatie-E2E |
| Back-up/migratie | Read-only exportvoorcontrole met checksum en conflictdetectie | `readyForImport=false`, geen cloudimport | Volledige veldmapping, herhaalbare proefimport, versleutelde back-up en aantoonbare restore |

## Concrete risico's uit broncontrole

1. **P0 — browsercontext:** clouddrafts gebruiken vaste sleutels zonder tenant-/vestigings-/medewerkercontext; bij sessieverlies blijven eerder geladen lijsten zichtbaar. Bestaande sleutels behouden, maar niet automatisch naar een nieuwe context overnemen. Bij 401/403 gevoelige weergave en afdruk wissen; mutaties blokkeren tot herautorisatie.
2. **P0 — schijnvolledigheid:** lijsten hebben LIMIT 100. Geen volledige omzet, aantallen of globale zoekresultaten afleiden uit deze afgeknotte arrays. Serveraggregaties en afzonderlijk geautoriseerd zoeken zijn vereist.
3. **P0 — transactiedekking:** bestaande mocks bewijzen SQL-aanroepen maar niet alle locks/races/rollback onder echte PostgreSQL. Bestaande tests behouden en gerichte integratie-/browserproeven toevoegen.
4. **P0 — fysieke voorraad:** annuleren maakt reserveringen vrij, maar geïnstalleerde onderdelen worden nog niet apart vastgelegd. Geen fictief restocken toevoegen. Zie eerder vastgelegde fysieke-voorraadconflicten.
5. **P0 — toegang:** API laat sales/technician bewust niet binnen; deze beperking niet wegnemen met alleen verborgen knoppen of brede RLS.
6. **P1 — herhaalverzoeken:** sommige status/goedkeuringsacties hebben geen generieke request-ledger. Conflicten bij herhaling niet als geslaagde actie voorstellen.
7. **P1 — schema:** prioriteit, wachtrij, minimumvoorraad en herinneringstijdstippen ontbreken. Toon onbekend/niet beschikbaar, geen fictieve cijfers.

## Geprioriteerde uitvoering en afhankelijkheden

| Prioriteit | Werkpakket | Afhankelijkheid / harde acceptatie |
| --- | --- | --- |
| P0-A | Bestaande sessiegrens behouden; drafts per context; verlies van rechten wist scherm/afdruk | Tests voor contextwisseling, 401/403 en onzekere aanvragen; geen legacywijziging |
| P0-B | Goedgekeurde horizontale frontend op bestaande cloud-API; echte aggregaties, volledige globale zoekfunctie, operationele snelacties | Geen voorbeelddata; geen nieuwe parallelle ERP; moduleflows/mandje behouden |
| P0-C | Reparatieledger: diagnose, gescheiden voorschotten, aanvullende offerte/akkoord, installatie, QC/afhaling, heropenen met reden | Versiebeheerde migratie op testbranch; centen/retry/rollback en traceerbaarheid |
| P0-D | Retour/refund/correctie/discount, expliciete kassadagopening/telling, verkeerd geleverd onderdeel | Originele transactie blijft, toestemming/drempels server-side, voorraadstatus correct |
| P0-E | Owner en instelbare medewerkersrechten, tenant-/branch-isolatie onder runtime | Twee ondernemingen, twee vestigingen, twee onafhankelijke sessies en ingetrokken toegang; geen brede policies |
| P0-F | Fiscale documentketen en back-up/restore + migratieproef | Actuele Belgische primaire bronnen; ontbrekende bedrijfs-/fiscale keuzes vragen vóór definitieve facturatie |
| P1-A | iPad-intake, claim/lock, foto's/objectopslag, notificaties/reminders 3/7/14 en 90-dagenbeheer | P0-identiteit, intakeledger, bewaarbeleid, job-idempotentie |
| P1-B | Volledige inkoop/leveranciers, minimum, telling, refurbhistoriek/garantie | P0-voorraad en retourledger |
| P1-C | Gepagineerde modulelijsten, serverrapporten, uniforme dossiermodals | Zoekfunctie buiten eerste pagina werkt al; geen totalen op afgeknotte lijsten |
| P2 | Prestatieoptimalisatie, scan-/printerhardware, extra dashboards en rolloutgereedschap | Alleen na betrouwbaar dagelijks kernproces |

Alle onderdelen die nodig blijken voor dagelijks winkelgebruik worden releaseblokkerend, ook als hun bouwvolgorde P1 is. Prioriteit is werkvolgorde, geen toestemming om vereisten weg te laten.

## Releasevoorwaarden (nog open)

- [ ] Geen bekende kritieke fouten; P0-werkpakketten aantoonbaar geslaagd.
- [ ] Volledige reparatie-, gecombineerde verkoop-, retour-, kassadag- en voorraadsituaties met opslag en herladen gecontroleerd.
- [ ] Echte rol-/tenant-/vestigingisolatie, twee gebruikers en gelijktijdige transacties getest.
- [ ] Desktop/iPad/smartphone en netwerkverlies/herstel getest, met onderscheid tussen gesimuleerde breedte en fysiek apparaat.
- [ ] Documenten/BTW/margeregeling/Peppol beoordeeld; niet-fiscaal blijft expliciet gemarkeerd tot die tijd.
- [ ] Back-up teruggelezen en restore geoefend; legacyveld-/bedragvergelijking en herhaalde proefimport geslaagd.
- [ ] Goedgekeurd ontwerp behouden; noodzakelijke afwijkingen benoemd.
- [ ] Expliciete eigenaarstoestemming vóór main, productie of echte migratie.

## Eerstvolgende technische werkzaamheden

Implementeer P0-A/P0-B op de bestaande workspace: behoud alle form- en transactiehandlers, vervang alleen de shell en voeg geautoriseerde serverprojecties toe. Leg nieuwe hiaten expliciet vast in plaats van decoratieve functies als werkend voor te stellen.
