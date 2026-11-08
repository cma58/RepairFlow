# PHIXAR — visuele dashboardreferenties (eigenaar, 2026-11-08)

**STATUS: ontwerpbrief, geen goedgekeurde code en geen toestemming om productie of main te wijzigen.**

De eigenaar heeft drie concrete beeldreferenties geselecteerd. De drie originele PNG-bestanden zijn aangeleverd in het aparte pakket `PHIXAR-dashboard-referenties.zip`. **De beelden zijn nog niet in deze repository opgenomen.** Work moet ze eerst toevoegen onder `docs/design-references/` en de daadwerkelijke beeldbestanden bekijken alvorens een definitief dashboard te ontwerpen. Beschrijvingen hieronder vervangen de PNG's niet.

| Bestand uit pakket | Betekenis |
| --- | --- |
| `concept-1-clean.png` | Heldere leesbaarheid, overzichtelijke actieknoppen, rustige kaarten |
| `concept-2-top-navigation.png` | **Hoofdstructuur: horizontale navigatie bovenaan, volle breedte**, planning en activiteiten |
| `concept-3-dark-pro.png` | **Visuele stijl: premium donker**, compact reparatieoverzicht, professionele turquoise accenten |

## Bindende ontwerpkeuzes
1. **Horizontale hoofdnavigatie** (concept 2); geen permanente linkerzijbalk op desktop.
2. **Light en Dark Mode** van dezelfde componenten; zichtbare schakelaar; centrale CSS-tokens; printweergave licht.
3. Combineer de duidelijke leesbaarheid van concept 1, de layout van concept 2 en de premium donkere stijl van concept 3.
4. Bouw een **echte HTML/CSS/JS-codepreview** en toets die visueel aan de drie PNG's. Geen AI-afbeelding presenteren als gegarandeerd realiseerbare UI.
5. Gebruik op desktop de breedte voor KPI's, snelle acties, reparatiepipeline en recente activiteiten; op tablet/mobiel responsieve, aanraakvriendelijke navigatie.
6. Fictieve gegevens uitsluitend in test-/previewomgeving, nooit als echte omzet/voorraad tonen.
7. **Behoud `v07.html`, bestaande dossiers, functionaliteiten en alle eigenaar-afspraken**. `workspace.html` is niet automatisch het goedgekeurde einddashboard.
8. Lees `docs/PHIXAR-MASTER-FUNCTIONAL-VISION.md` en `docs/PHIXAR-POS-VISION.md` volledig, plus de legacy/cloud-gapdocumentatie.
9. Maak screenshots van werkende code in licht/donker op desktop/iPad en laat eigenaar beoordelen vóór vervangen van de productie-startpagina.
10. Geen merge naar main, productiepublicatie of gegevensmigratie zonder toestemming.

## Verificatie
Als de drie PNG's nog niet aanwezig zijn in `docs/design-references/`, **stop met visuele implementatie en vraag om het ZIP-pakket**. Verzin de referenties niet.


## Aanvullende eigenaarfeedback — 2026-11-08

**Deze vier verbeteringen zijn voorwaarden voor de volgende ontwerpbeoordeling.**
Vastgelegd als ontwerpvereisten; hiermee is geen implementatie, functionele test of definitieve goedkeuring aangetoond.

### 1. Grotere leesbaarheid
- Labels, dossiergegevens en statussen moeten op desktop bij 100% browserzoom direct leesbaar zijn.
- Ontwerprichtlijn: hoofdtekst en dossiergegevens circa 16 px; ondersteunende labels en statusbadges minimaal 14 px. Vergroot rijhoogte en witruimte waar nodig; geen afgekapt essentieel dossiergegeven.
- Statussen gebruiken duidelijke tekst met voldoende contrast, aangevuld met kleur of icoon. Kleur alleen is onvoldoende.
- Controleer licht en donker op desktop en iPad met realistische lange klantnamen, modellen en dossiernummers.

### 2. Meer ruimte en minder handelingen voor de kassa
- Geef productzoeken/scannen, winkelmand, totaal en betalen de meeste ruimte in de kassamodule; houd secundaire statistieken ondergeschikt.
- Houd totaal en primaire betaalactie zichtbaar tijdens een normale verkoop. Vermijd onnodige modals en dubbele invoer.
- Maak een directe kassatoegang beschikbaar vanuit iedere module en betaling vanuit een reparatiedossier, met overname van klant, dossier en openstaand saldo.
- Behoud gecombineerde verkoop van reparatie, product en refurbished, plus voorschotten en gesplitste betalingen.
- Toets met twee concrete routes: eenvoudig product scannen → betaalmethode kiezen → verkoop bevestigen; dossier openen → afrekenen met reeds verrekend voorschot. Noteer het werkelijke aantal handelingen en verwijder vermijdbare stappen.
- Een korte verkooproute mag bestaande betaal-, voorraad- en rechtencontroles niet overslaan.

### 3. Eén directe zoekfunctie vanuit iedere module
- Een vaste globale zoekbalk in de bovenste navigatie doorzoekt klanten, IMEI's, reparatienummers en producten zonder eerst een andere module te openen.
- Ondersteun toetsenbordbediening en een zichtbare sneltoets, bijvoorbeeld Ctrl/Cmd+K; focus niet stelen tijdens gewone invoer of scannersessies.
- Toon gegroepeerde resultaten met herkenbare identificatie en directe toegang tot het juiste dossier of product. Geef exacte IMEI- en reparatienummermatches voorrang.
- Behoud de lopende winkelmand en niet-opgeslagen invoer bij zoeken en wisselen van context.
- Maak laden, geen resultaten en fouten duidelijk. Meet reactiesnelheid met representatieve testgegevens voordat de zoekfunctie als snel wordt goedgekeurd.
- Zoek uitsluitend binnen de gegevens en vestigingen waarvoor de medewerker rechten heeft.

### 4. Prioriteiten onmiddellijk zichtbaar
- Toon bovenaan een vaste prioriteitenzone met **Dringende reparaties**, **Wachtende klanten** en **Afhalingen**, met aantallen en directe acties.
- Geef per item een concrete reden: gemarkeerd urgent of afgesproken termijn verstreken; wachtduur van een klant; gereed voor afhaling met gereeddatum.
- Houd een klant die aan de balie wacht zichtbaar als aparte situatie ten opzichte van een dossier dat op klantantwoord wacht.
- Sorteer binnen elke groep op relevante urgentie of wachttijd. Gebruik tekst, contrast en iconen naast kleur; decoratieve effecten mogen aandacht niet afleiden.
- Leid wachttijden en urgentie af uit geregistreerde gegevens. Ontbrekende gegevens zichtbaar maken; geen verzonnen prioriteiten of aantallen.
- Bestaande afhaal- en herinneringsafspraken blijven van toepassing; deze ontwerpaanpassing introduceert geen nieuwe automatische statusovergangen.

### Vereiste beoordeling van de volgende preview
- Werkende licht/donker-preview op desktop en iPad, met bovenstaande vier punten aantoonbaar zichtbaar.
- Beoordeel de globale zoekfunctie vanuit iedere module en de twee beschreven kassascenario's.
- Maak onderscheid tussen visueel getoond, interactief werkend en werkelijk gekoppeld aan de backend.
- De eigenaar beoordeelt de verbeterde preview vóór definitieve ontwerpgoedkeuring.
