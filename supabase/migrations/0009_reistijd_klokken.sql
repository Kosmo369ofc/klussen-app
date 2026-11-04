-- Startscherm met klokken: reistijd en werk apart. Je klokt reistijd bij vertrek,
-- werk bij de klant, en na de klant weer reistijd. Elk stuk wordt een regel in werkuren.
-- Uitvoeren in de SQL-editor van Supabase, na 0008_medewerker_wijzigen.sql.

-- Soort van een urenregel: werk of reistijd.
alter table werkuren add column soort text not null default 'werk' check (soort in ('werk', 'reis'));

-- Wat er nu loopt: werk of reistijd.
alter table ingeklokt add column soort text not null default 'werk' check (soort in ('werk', 'reis'));

-- Stopt wat er nu loopt en zet het in werkuren (ook gebruikt bij "Dag klaar").
-- Vergeten te stoppen? Dan stopt de regel om 23:59 op de dag van starten.
create or replace function uitklokken() returns werkuren language plpgsql as $$
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
  insert into werkuren (medewerker_id, datum, begintijd, eindtijd, pauze_minuten, klant_id, soort)
  values (k.medewerker_id, start::date, b, e, least(p, 600), k.klant_id, k.soort)
  returning * into r;
  return r;
end;
$$;

-- Wisselen tussen reistijd en werk: stopt wat er loopt en start meteen het volgende.
create function klok_wissel(nieuwe_soort text, klant uuid default null) returns void language plpgsql as $$
begin
  if exists (select 1 from ingeklokt where medewerker_id = huidige_medewerker()) then
    perform uitklokken();
  end if;
  insert into ingeklokt (soort, klant_id) values (nieuwe_soort, klant);
end;
$$;

notify pgrst, 'reload schema';
