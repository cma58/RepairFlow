# Login test & veilige sessie-afhandeling — PHIXAR

Datum: 2026-11-07. De zaakvoerder test momenteel op afstand de e-maillink. **Wijzig de live loginpagina niet tijdens de test.**

## Wat de huidige loginpagina wel doet
- Prefill van het uitgenodigde adres.
- `POST /sign-in/magic-link` naar Neon Auth met `callbackURL`.
- Toont generieke succes-/foutmelding.
- Het e-mailadresfilter in de browser is **alleen UX**; het is geen autorisatiebeveiliging.

## Wat nog niet bewezen is
- Of Neon Auth de mail daadwerkelijk bezorgt.
- Of de callback URL, cookies en de daadwerkelijke sessie correct werken op de productie-origin.
- Of de callback na klikken een sessie bevat.
- Of de sessie via een serverroute naar `rf_staff` gemapt kan worden.
- De huidige `login.html` behandelt queryparameters alleen visueel en valideert geen sessie. Een statusbericht betekent **niet** dat de gebruiker geauthenticeerd is.

## Benodigde server-side implementatie
1. Gebruik de gedocumenteerde Neon Auth/Better Auth sessieverificatie op een serverroute (bijvoorbeeld `/api/me`), niet alleen `GET` in de browser.
2. Verifieer de sessie en `emailVerified`; gebruik uitsluitend de gevalideerde subject-ID.
3. Zoek `rf_staff.identity_subject` binnen de juiste PHIXAR-organisatie; vereis `active=true`.
4. Geef uitsluitend minimale profielinformatie terug; zonder geldige sessie 401, zonder actieve rol 403.
5. Geen databasewachtwoord of beheertoken in frontendcode.
6. Pas na goedgekeurde tests de owner-activatie uitvoeren, met expliciete bevestiging van bevoegde gebruiker.
7. De legacy app met localStorage mag niet als bewijs van gesynchroniseerde serverauth worden gepresenteerd.

## Testprotocol op afstand
Vraag de gebruiker uitsluitend te melden:
- Is er een e-mail aangekomen? (ja/nee, eventueel spam)
- Wat is de zichtbare melding na openen van de link?
- Welk apparaat/browser gebruikt hij?
- Géén wachtwoorden, OTP's, magische links, cookies of screenshots waarop tokens staan delen.

## Fouten voorkomen
- Magic link 10 minuten geldig; na verloop een nieuwe aanvragen.
- Callback kan een fragment of querytoken bevatten; verwijder niet voortijdig gegevens die de auth-bibliotheek nodig heeft.
- Controleer dat auth provider het productie-origin vertrouwt.
- Geen handmatige `active=true` op basis van enkel e-mailontvangst.
