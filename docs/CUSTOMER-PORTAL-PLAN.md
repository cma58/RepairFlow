# PHIXAR klantenzone en iPad-portaal — ontwikkelbatch (niet gepubliceerd)

## Doel
Een klant scant de QR-code op zijn PHIXAR-ontvangstbewijs en raadpleegt veilig de actuele status van zijn eigen reparatie. Een winkel-iPad biedt een afzonderlijke begeleide klantmodus. **Niet live of productierijp.**

## Vastgestelde huidige toestand
- Reparaties en klanten bestaan uitsluitend in de lokale browseropslag van de winkel; een andere telefoon of iPad kan deze gegevens niet ophalen.
- De huidige QR-code bevat uitsluitend het ticketnummer, zonder verificatie. Dit is bewust geen publieke trackinglink.
- De app heeft nog geen backend, gedeelde database, gebruikersauthenticatie of servergestuurde toegangscontrole.
- Een QR-link zonder server en autorisatie mag niet worden voorgesteld als een werkend klantportaal.

## Architectuur die nodig is voor echte werking
1. Centrale database met winkels, reparaties, klanten, statusgebeurtenissen, klanttoegangen en sessies; alle gegevens per winkel gescheiden.
2. Server-API voor publiek statusoverzicht, met expliciete allowlist: ticketreferentie, publiek getoonde status, bijgewerkt-op, volgende stap en optionele winkelcontactgegevens. Geen IMEI, adres, interne diagnose, kostprijzen, andere klantgegevens of notities.
3. Bij intake genereert de server een cryptografisch willekeurige, onvoorspelbare toegangscode (minstens 128 bits), slaat uitsluitend de hash op, en maakt een URL zoals `https://<bevestigd-domein>/volg/<token>`. Het ticketnummer is **geen** toegangscode.
4. Token kan worden ingetrokken en opnieuw uitgegeven. Gebruik HTTPS, beperkte toegang, rate limiting, minimale logs, bewaartermijnen en een duidelijke privacyverklaring.
5. Gevoelige acties (offerte goedkeuren, persoonsgegevens aanpassen, betaling, dossierdocumenten bekijken) vereisen aanvullende verificatie en afzonderlijke autorisatie. Alleen een QR-token volstaat daarvoor niet.
6. Bij verlies van ontvangstbewijs kan personeel de toegang na identiteitscontrole opnieuw uitgeven. Geen klantdossiers doorzoekbaar op alleen telefoonnummer of ticketnummer.
7. Server is leidend voor status; winkelapparaten synchroniseren via geauthenticeerde API. Nooit lokale browseropslag naar publiek toegankelijke endpoints kopiëren.

## iPad kioskmodus
- Startscherm: PHIXAR, scan QR / voer referentie in, taalkeuze NL/FR/EN, privacyknop.
- QR-scanner vereist cameratoestemming en een ondersteunde browser; bied altijd een toegankelijk handmatig alternatief.
- Referentie alleen geeft **geen** toegang tot persoonlijke gegevens; extra verificatie of QR-token is vereist.
- Na succesvolle toegang: alleen beperkte statuskaart; knoppen voor terug, hulp vragen en uitloggen.
- Kiosksessie: korte server-side levensduur, automatische afsluiting bij inactiviteit, wissen van zichtbare klantgegevens bij afsluiten, geen browsergeschiedenis met tokens, geen lokaal opgeslagen klantgegevens.
- iPad kiosk heeft aparte rol en rechten; geen toegang tot kassabeheer of andere klantdossiers.
- iPad Guided Access / beheerde kioskconfiguratie is aanvullend, geen vervanging van serverautorisatie.

## Print- en QR-regels
- Zolang backend ontbreekt blijft QR uitsluitend het ticketnummer bevatten; document zegt expliciet dat online status niet beschikbaar is.
- Na backendrelease QR vervangen door serveruitgegeven tokenlink; bestaande tickets zonder token blijven geldig voor personeel, maar krijgen niet automatisch publieke toegang.
- Bon en etiket mogen elk dezelfde QR tonen: één op het ontvangstbewijs voor klant, één op het toestel voor personeel. Niet twee identieke codes op één document.
- Printtests: A4, 60×40 mm label, iOS Safari, Android Chrome, PDF, QR-scan bij verkleining, contrast en fysieke printer.

## Acceptatiecriteria vóór livegang
- Klant A kan nooit status of persoonsgegevens van klant B zien, ook niet door ticketnummers te wijzigen.
- Onbekend, vervallen of ingetrokken token geeft geen informatie prijs.
- Reparatiestatus in portaal verandert na update door winkel op een tweede apparaat.
- Browser refresh, netwerkverlies en opnieuw aanmelden zijn gecontroleerd.
- Kiosk toont na uitloggen/inactiviteit geen vorige klantinformatie.
- Documenten printen zonder blanco pagina's; QR-code is met echte camera getest.
- Integratietests, autorisatietests, mobiele browsertests en AVG/privacycontrole zijn afgerond.

## Publicatiebeleid
Werk op featurebranch; geen merge naar main en geen Vercel-publicatie vóór expliciete gezamenlijke vrijgave. Bundel wijzigingen, voer controles uit, publiceer daarna één keer.

## B2B-herstellingen en externe herstelpartners — bevestigde werkwijze
- Een andere herstelzaak heeft twee vestigingen en meerdere medewerkers. Toestellen worden door een medewerker naar de broer van de zaak gebracht, door hem hersteld en teruggebracht.
- De gebruiker herstelt soms ook toestellen voor deze zaak: een medewerker brengt toestel én vervangonderdeel, de gebruiker herstelt, verwittigt telefonisch of per bericht en de medewerker haalt het toestel op.
- **Beide herstellers gebruiken voor deze opdrachten geen onderdelen uit eigen voorraad.** De opdrachtgever levert de onderdelen.
- Onderscheid in het gegevensmodel: opdrachtgevende onderneming, aanleverende vestiging, uitvoerende hersteller, huidige bewaarder, meegeleverd onderdeel, overdrachtsgeschiedenis, contactpersoon en afhaalbevestiging.
- Voor B2B-werk met meegeleverd onderdeel: `part_source=customer_supplied`, `inventory_deduction=false`, `part_purchase_cost=0` voor de uitvoerende hersteller. Een meegeleverd onderdeel is geen gratis onderdeel uit eigen voorraad en mag niet als eigen verkoop worden geboekt.
- Registreer arbeidsvergoeding los van onderdelen. Extra kosten uitsluitend als expliciet toegevoegd; factuur- en betaalafspraken zijn nog niet bevestigd.
- Overdrachtsmomenten: aangenomen, overgedragen aan hersteller, in behandeling, klaar, opdrachtgever verwittigd, teruggebracht/afgehaald. Bewaar wie, wanneer en via welk kanaal.
- Externe hersteller heeft in fase 1 geen eigen account nodig; een bevoegde medewerker registreert de status.
- Belangrijk voor multi-tenant ontwerp: een externe hersteller mag niet impliciet toegang krijgen tot alle klanten van de opdrachtgevende zaak. Later uitsluitend expliciet gedeelde werkopdrachten.
