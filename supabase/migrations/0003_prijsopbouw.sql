-- Tweede ronde wensen: hoe vaak, uren en prijs per werkzaamheid, prijs per
-- eenheid (bijvoorbeeld m³ groenafval) en betaling in termijnen.

-- Werkzaamheden: "2 keer per maand", "alleen als het nodig is" en een eenheid
-- waarin de medewerker invult hoeveel het was (bijvoorbeeld m³).
alter table werkzaamheden
  add column keer smallint not null default 1 check (keer between 1 and 31),
  add column wanneer_nodig boolean not null default false,
  add column meeteenheid text;
alter table werkzaamheden add constraint schema_klopt check (
  (keer = 1 or interval_aantal is not null) and not (wanneer_nodig and interval_aantal is not null)
);

-- Prijs per werkzaamheid. Een aparte tabel, zodat alleen de beheerder de
-- bedragen ziet; medewerkers zien wel de werkzaamheden zelf.
create table werkzaamheid_prijzen (
  werkzaamheid_id uuid primary key references werkzaamheden (id) on delete cascade,
  prijs_type text not null default 'inbegrepen'
    check (prijs_type in ('inbegrepen', 'per_keer', 'per_uur', 'per_eenheid')),
  bedrag numeric(10, 2) check (bedrag >= 0),
  uren_per_keer numeric(5, 2) check (uren_per_keer >= 0),
  verwachte_hoeveelheid numeric(8, 2) check (verwachte_hoeveelheid >= 0)
);
alter table werkzaamheid_prijzen enable row level security;
create policy "beheerder beheert prijzen" on werkzaamheid_prijzen for all
  using (is_beheerder()) with check (is_beheerder());

-- Hoeveel er gedaan is, bij werk met een eenheid.
alter table bezoekregels add column hoeveelheid numeric(8, 2) check (hoeveelheid >= 0);

-- Per klant: hoe vaak we komen, hoeveel uur een beurt duurt en in hoeveel
-- termijnen per jaar er gefactureerd wordt.
alter table contracten
  add column beurten_keer smallint check (beurten_keer between 1 and 31),
  add column beurten_aantal smallint check (beurten_aantal between 1 and 99),
  add column beurten_eenheid text check (beurten_eenheid in ('week', 'maand', 'jaar')),
  add column uren_per_beurt numeric(5, 2) check (uren_per_beurt >= 0),
  add column termijnen smallint not null default 1 check (termijnen in (1, 2, 3, 4, 6, 12));

-- Bezoek opslaan, nu met hoeveelheid per regel.
create or replace function bezoek_opslaan(bezoek jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  b_id uuid := (bezoek ->> 'id')::uuid;
begin
  if exists (select 1 from bezoeken where id = b_id) then
    return b_id;
  end if;

  insert into bezoeken (id, klant_id, datum, opmerkingen)
  values (
    b_id,
    (bezoek ->> 'klant_id')::uuid,
    coalesce((bezoek ->> 'datum')::date, current_date),
    nullif(trim(bezoek ->> 'opmerkingen'), '')
  );

  insert into bezoek_uren (bezoek_id, medewerker_id, uren)
  select b_id, (u ->> 'medewerker_id')::uuid, (u ->> 'uren')::numeric
  from jsonb_array_elements(coalesce(bezoek -> 'uren', '[]')) u;

  insert into bezoekregels (bezoek_id, werkzaamheid_id, omschrijving, hoeveelheid)
  select b_id, nullif(r ->> 'werkzaamheid_id', '')::uuid, coalesce(r ->> 'omschrijving', ''),
    nullif(r ->> 'hoeveelheid', '')::numeric
  from jsonb_array_elements(coalesce(bezoek -> 'regels', '[]')) r;

  return b_id;
end
$$;

grant select, insert, update, delete on werkzaamheid_prijzen to authenticated;
