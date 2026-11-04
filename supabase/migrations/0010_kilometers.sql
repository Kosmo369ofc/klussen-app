-- Kilometers per dag: de kilometerstand van de bus bij begin en eind van de dag
-- (op het startscherm), of achteraf alleen het aantal gereden km (in het weekoverzicht).
-- Uitvoeren in de SQL-editor van Supabase, na 0009_reistijd_klokken.sql.

create table dagkilometers (
  medewerker_id uuid not null references medewerkers (id) on delete cascade default huidige_medewerker(),
  datum date not null default current_date,
  beginstand int check (beginstand >= 0),
  eindstand int check (eindstand >= 0),
  -- Gereden km. Vult de app in uit de standen, of de medewerker typt het zelf.
  km int check (km between 0 and 5000),
  primary key (medewerker_id, datum),
  check (eindstand is null or beginstand is null or eindstand >= beginstand)
);

alter table dagkilometers enable row level security;

-- Net als bij de uren: ieder zijn eigen kilometers, de beheerder ziet alles.
create policy "eigen km lezen" on dagkilometers for select
  using (medewerker_id = huidige_medewerker() or is_beheerder());
create policy "eigen km invoeren" on dagkilometers for insert
  with check (medewerker_id = huidige_medewerker() or is_beheerder());
create policy "eigen km wijzigen" on dagkilometers for update
  using (medewerker_id = huidige_medewerker() or is_beheerder())
  with check (medewerker_id = huidige_medewerker() or is_beheerder());
create policy "eigen km verwijderen" on dagkilometers for delete
  using (medewerker_id = huidige_medewerker() or is_beheerder());

notify pgrst, 'reload schema';
