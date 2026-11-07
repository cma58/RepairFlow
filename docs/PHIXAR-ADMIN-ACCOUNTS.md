# PHIXAR admin accounts — 2026-11-07

Twee afzonderlijke Neon Auth identiteiten, beide aan PHIXAR gekoppeld en voorlopig inactive (fail-closed):
- PHIXAR eigenaar: Gihanamarcelin@hotmail.com; subject `6b437408-ac72-4edf-9cbb-f499bd7a69fa`; rf_staff role `owner`, active `false`.
- RepairFlow beheerder: amine.chtaiti@gmail.com; subject `f91abfab-2bdb-4e7b-ac67-cca276b472b6`; rf_staff role `owner`, active `false`.

Organisatie `b7c7eeac-d1cc-42a3-bd09-d25a2280f474`; vestiging `cd8c7cb9-66c1-40d5-b049-fa324d99607a`.

**Geen van beide accounts kan al inloggen in een geautoriseerde RepairFlow-sessie.** Neon Auth magic link staat aan, maar callback/sessie-validatie en server-side rolhandhaving zijn nog niet geïmplementeerd en getest. Frontend e-mailfilter in `login.html` is uitsluitend UX, geen beveiliging.

Voor beide accounts: sessie op server valideren, verified subject matchen, active status checken, RLS met tenant scoping testen, daarna pas activeren. Volledige beheerrechten gelden binnen geautoriseerde PHIXAR-organisatie, niet automatisch in andere klantorganisaties. Privileged acties loggen.
