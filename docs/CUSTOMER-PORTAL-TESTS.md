# Testmatrix klantenzone (voorbereiding)

| Scenario | Verwacht resultaat |
| --- | --- |
| Scan bestaande QR (huidige versie) | Alleen ticketnummer, **geen** werkende klantlogin |
| Onbekend ticket | Geen dossierinformatie |
| Token van klant A voor ticket B | Toegang geweigerd |
| Token aangepast met één teken | Toegang geweigerd |
| Verlopen of ingetrokken token | Toegang geweigerd |
| Klantstatus na wijziging op winkel-pc | Nieuwe status op telefoon/iPad na serverrefresh |
| QR zonder cameratoestemming | Begrijpelijke melding en veilig alternatief |
| Kiosk 1 minuut inactief (duur nog te kiezen) | Klantsessie sluit, gegevens verdwijnen |
| Kiosk volgende klant | Geen gegevens van vorige klant |
| Offerte akkoord zonder extra verificatie | Geweigerd |
| Bon afdrukken Android Chrome | Geen blanco print; QR scanbaar |
| Label afdrukken 60×40 mm | QR scanbaar; geen afgesneden tekst |
| PDF afdrukken iOS Safari | Correct A4 met PHIXAR-identiteit |
| Backend onbereikbaar | Geen oude of verzonnen status; duidelijke fout |

**Status:** testgevallen opgesteld; geen van deze end-to-end tests is uitgevoerd. Backend en portaal moeten nog worden gebouwd.
