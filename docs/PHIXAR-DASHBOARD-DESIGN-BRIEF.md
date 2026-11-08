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
