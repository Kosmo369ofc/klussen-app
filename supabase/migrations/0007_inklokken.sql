-- In- en uitklokken: aan het begin van de dag inklokken, aan het eind uitklokken.
-- Bij uitklokken komt er vanzelf een regel in werkuren met de begin- en eindtijd.
-- Uitvoeren in de SQL-editor van Supabase, na 0006_uren_per_klant.sql.

-- Wie nu aan het werk is. Hooguit één regel per medewerker.
create table ingeklokt (
  medewerker_id uuid primary key references medewerkers (id) on delete cascade default huidige_medewerker(),
  -- De tijd komt van de server, niet van de telefoon.
  gestart_op timestamptz not null default now(),
  klant_id uuid references klanten (id) on delete set null,
  -- Gevuld zolang de medewerker pauze heeft.
  pauze_sinds timestamptz,
  pauze_minuten int not null default 0 check (pauze_minuten >= 0)
);

alter table ingeklokt enable row level security;

create policy "eigen klok lezen" on ingeklokt for select
  using (medewerker_id = huidige_medewerker() or is_beheerder());
create policy "zelf inklokken" on ingeklokt for insert
  with check (medewerker_id = huidige_medewerker());
create policy "eigen klok wijzigen" on ingeklokt for update
  using (medewerker_id = huidige_medewerker())
  with check (medewerker_id = huidige_medewerker());
create policy "eigen klok stoppen" on ingeklokt for delete
  using (medewerker_id = huidige_medewerker() or is_beheerder());

-- Pauze beginnen of weer verder werken.
create function pauze_wisselen() returns void language sql as $$
  update ingeklokt set
    pauze_minuten = pauze_minuten + coalesce(round(extract(epoch from now() - pauze_sinds) / 60)::int, 0),
    pauze_sinds = case when pauze_sinds is null then now() end
  where medewerker_id = huidige_medewerker();
$$;

-- Uitklokken: zet de gewerkte tijd in werkuren en stopt de klok.
-- Vergeten uit te klokken? Dan stopt de regel om 23:59 op de dag van inklokken.
create function uitklokken() returns werkuren language plpgsql as $$
declare
  k ingeklokt;
  r werkuren;
  start timestamp;
  eind timestamp := now() at time zone 'Europe/Amsterdam';
  b time;
  e time;
  p int;
begin
  select * into k from ingeklokt where medewerker_id = huidige_medewerker() for update;
  if not found then
    raise exception 'Je bent niet ingeklokt';
  end if;
  start := k.gestart_op at time zone 'Europe/Amsterdam';
  p := k.pauze_minuten + coalesce(round(extract(epoch from now() - k.pauze_sinds) / 60)::int, 0);
  b := date_trunc('minute', start)::time;
  e := case when eind::date > start::date then time '23:59' else date_trunc('minute', eind)::time end;
  if extract(epoch from (e - b)) / 60 <= p then
    p := 0;
  end if;
  delete from ingeklokt where medewerker_id = k.medewerker_id;
  -- Korter dan een minuut: niets opslaan.
  if e <= b then
    return null;
  end if;
  insert into werkuren (medewerker_id, datum, begintijd, eindtijd, pauze_minuten, klant_id)
  values (k.medewerker_id, start::date, b, e, least(p, 600), k.klant_id)
  returning * into r;
  return r;
end;
$$;

notify pgrst, 'reload schema';
