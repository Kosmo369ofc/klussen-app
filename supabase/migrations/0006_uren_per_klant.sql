-- Urenregistratie: bij elke urenregel kan de medewerker kiezen voor welke
-- klant hij heeft gewerkt, zodat de beheerder dat kan factureren.
-- Uitvoeren in de SQL-editor van Supabase, na 0005_urenregistratie.sql.

alter table werkuren
  add column klant_id uuid references klanten (id) on delete set null;
create index on werkuren (klant_id, datum desc);

-- Laat de app de nieuwe kolom meteen zien.
notify pgrst, 'reload schema';
