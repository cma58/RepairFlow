# PHIXAR eerste beheerder — activatieprotocol

Status: **voorbereid, NIET geactiveerd**.

- Neon Auth subject: `6b437408-ac72-4edf-9cbb-f499bd7a69fa`.
- PHIXAR organisatie: `b7c7eeac-d1cc-42a3-bd09-d25a2280f474`.
- Filiaal: `cd8c7cb9-66c1-40d5-b049-fa324d99607a`.
- `rf_staff.role = 'owner'`; `rf_staff.active = false`.
- Neon Auth: e-mailverificatie vereist, publieke registratie uitgeschakeld.
- De gekoppelde eigenaar is nog **niet bevoegd** om dossiers te openen. Geen client-side omweg.

## Activering pas na verificatie
1. Laat de gebruiker bevestigen dat hij/zij controle heeft over het opgegeven postvak. Deel nooit wachtwoorden of verificatiecodes via chat.
2. Implementeer een HTTPS login met Neon Auth, en een geverifieerde server-side sessie. Vertrouw geen emailadres, rol of organization-id uit browserinput.
3. Bevestig de e-mail via Neon Auth en valideer de echte `sub` van de sessie tegen `rf_staff.identity_subject`.
4. Autoriseer alle requests met `rf_staff.active=true`, organisatie/filiaal en een tenant-scoped database policy. **Niet** enkel een verborgen menu.
5. Pas daarna, na expliciete eigenaarstoestemming en geslaagde autorisatietests, `active=true` zetten.
6. Bewijs met tests: geen sessie → 401; ongeverifieerd → 403; inactieve eigenaar → 403; ander filiaal/tenant → 403; geactiveerde eigenaar → alleen eigen data.
7. Geen bestaande lokale dossiers automatisch naar Neon uploaden. Maak eerst back-ups en voer migratie dry-run uit.

## Controlequeries (alleen lezen)
```sql
SELECT identity_subject, role, active
FROM rf_staff
WHERE organization_id = 'b7c7eeac-d1cc-42a3-bd09-d25a2280f474'
  AND identity_subject = '6b437408-ac72-4edf-9cbb-f499bd7a69fa';
```

## Veiligheidsregels
- Geen productiegegevens via ongeauthenticeerde API-routes.
- Geen Neon database credentials of server secrets in `app-v3.js` of HTML.
- RLS blijft fail-closed tot policies zijn geverifieerd.
- Verificatiemail is geen bewijs dat de medewerker bevoegd is; organisatiekoppeling en actieve rol moeten afzonderlijk kloppen.
