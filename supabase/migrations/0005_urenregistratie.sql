-- Urenregistratie: per medewerker per dag hoe laat begonnen, gestopt en hoeveel
-- pauze. Dit staat los van de uren bij de klantbeurten.
-- Uitvoeren in de SQL-editor van Supabase, na 0004_contractperiode.sql.

create table werkuren (
  -- De telefoon maakt het id zelf aan, zodat opnieuw versturen nooit dubbel geeft.
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references medewerkers (id) default huidige_medewerker(),
  datum date not null default current_date,
  begintijd time not null,
  eindtijd time not null,
  pauze_minuten int not null default 0 check (pauze_minuten between 0 and 600),
  uren numeric(5, 2) generated always as (
    round((extract(epoch from (eindtijd - begintijd)) / 3600 - pauze_minuten / 60.0)::numeric, 2)
  ) stored,
  opmerking text,
  -- Na goedkeuren kan de medewerker de regel niet meer wijzigen.
  goedgekeurd boolean not null default false,
  aangemaakt_op timestamptz not null default now(),
  check (eindtijd > begintijd),
  check (extract(epoch from (eindtijd - begintijd)) / 60 > pauze_minuten)
);
create index on werkuren (medewerker_id, datum desc);
create index on werkuren (datum desc);

alter table werkuren enable row level security;

-- Een medewerker ziet alleen zijn eigen uren, de beheerder ziet alles.
create policy "eigen uren lezen" on werkuren for select
  using (medewerker_id = huidige_medewerker() or is_beheerder());
create policy "eigen uren invoeren" on werkuren for insert
  with check (is_beheerder() or (medewerker_id = huidige_medewerker() and not goedgekeurd));
create policy "eigen uren wijzigen" on werkuren for update
  using (is_beheerder() or (medewerker_id = huidige_medewerker() and not goedgekeurd))
  with check (is_beheerder() or (medewerker_id = huidige_medewerker() and not goedgekeurd));
create policy "eigen uren verwijderen" on werkuren for delete
  using (is_beheerder() or (medewerker_id = huidige_medewerker() and not goedgekeurd));
