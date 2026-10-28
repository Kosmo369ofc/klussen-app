-- Basis van de klussen-app: klanten, werkzaamheden, medewerkers en bezoeken.
-- Uitvoeren in de SQL-editor van Supabase (of met `supabase db push`).

-- Medewerkers ----------------------------------------------------------------
-- De beheerder voegt een medewerker toe met e-mailadres. Bij de eerste keer
-- inloggen wordt user_id gekoppeld (zie trigger onderaan).
create table medewerkers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  naam text not null,
  email text not null unique,
  rol text not null default 'medewerker' check (rol in ('beheerder', 'medewerker')),
  actief boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);

create or replace function huidige_medewerker() returns uuid
language sql stable security definer set search_path = public as $$
  select id from medewerkers where user_id = auth.uid() and actief
$$;

create or replace function is_beheerder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from medewerkers where user_id = auth.uid() and actief and rol = 'beheerder'
  )
$$;

-- Klanten --------------------------------------------------------------------
create table klanten (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  adres text,
  telefoon text,
  contractvorm text not null default 'per_beurt' check (contractvorm in ('vast_contract', 'per_beurt')),
  notities text,
  actief boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);

-- Contracturen staan apart, zodat alleen de beheerder ze kan lezen.
create table contracten (
  klant_id uuid primary key references klanten (id) on delete cascade,
  uren numeric(7, 2) not null check (uren >= 0),
  periode text not null default 'maand' check (periode in ('maand', 'jaar'))
);

-- Werkzaamheden die per klant zijn toegewezen.
create table werkzaamheden (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references klanten (id) on delete cascade,
  omschrijving text not null,
  frequentie text not null default 'elke_beurt'
    check (frequentie in ('elke_beurt', 'maandelijks', 'per_seizoen', 'jaarlijks')),
  volgorde int not null default 0,
  actief boolean not null default true
);
create index on werkzaamheden (klant_id);

-- Bezoeken -------------------------------------------------------------------
create table bezoeken (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references klanten (id) on delete restrict,
  datum date not null default current_date,
  opmerkingen text,
  gefactureerd boolean not null default false,
  aangemaakt_door uuid not null references medewerkers (id) default huidige_medewerker(),
  aangemaakt_op timestamptz not null default now()
);
create index on bezoeken (klant_id, datum desc);

-- Wie er bij een bezoek was en hoeveel uur.
create table bezoek_uren (
  bezoek_id uuid not null references bezoeken (id) on delete cascade,
  medewerker_id uuid not null references medewerkers (id),
  uren numeric(5, 2) not null check (uren >= 0 and uren <= 24),
  primary key (bezoek_id, medewerker_id)
);

-- Wat er gedaan is: een toegewezen werkzaamheid, of los extra werk.
create table bezoekregels (
  id uuid primary key default gen_random_uuid(),
  bezoek_id uuid not null references bezoeken (id) on delete cascade,
  werkzaamheid_id uuid references werkzaamheden (id) on delete set null,
  omschrijving text not null,
  check (werkzaamheid_id is not null or length(trim(omschrijving)) > 0)
);
create index on bezoekregels (bezoek_id);

-- Foto's staan in de storage-bucket 'fotos'; hier alleen het pad.
create table bezoek_fotos (
  id uuid primary key default gen_random_uuid(),
  bezoek_id uuid not null references bezoeken (id) on delete cascade,
  pad text not null
);

-- Een bezoek mag door de maker worden aangepast zolang het niet gefactureerd is.
create or replace function mag_bezoek_wijzigen(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_beheerder() or exists (
    select 1 from bezoeken
    where id = b and aangemaakt_door = huidige_medewerker() and not gefactureerd
  )
$$;

-- Rechten (row level security) ----------------------------------------------
alter table medewerkers enable row level security;
alter table klanten enable row level security;
alter table contracten enable row level security;
alter table werkzaamheden enable row level security;
alter table bezoeken enable row level security;
alter table bezoek_uren enable row level security;
alter table bezoekregels enable row level security;
alter table bezoek_fotos enable row level security;

create policy "medewerkers lezen" on medewerkers for select
  using (huidige_medewerker() is not null);
create policy "beheerder beheert medewerkers" on medewerkers for all
  using (is_beheerder()) with check (is_beheerder());

create policy "klanten lezen" on klanten for select
  using (huidige_medewerker() is not null);
create policy "beheerder beheert klanten" on klanten for all
  using (is_beheerder()) with check (is_beheerder());

create policy "beheerder beheert contracten" on contracten for all
  using (is_beheerder()) with check (is_beheerder());

create policy "werkzaamheden lezen" on werkzaamheden for select
  using (huidige_medewerker() is not null);
create policy "beheerder beheert werkzaamheden" on werkzaamheden for all
  using (is_beheerder()) with check (is_beheerder());

create policy "bezoeken lezen" on bezoeken for select
  using (huidige_medewerker() is not null);
create policy "bezoek invoeren" on bezoeken for insert
  with check (aangemaakt_door = huidige_medewerker() and (not gefactureerd or is_beheerder()));
create policy "bezoek wijzigen" on bezoeken for update
  using (mag_bezoek_wijzigen(id))
  with check (is_beheerder() or (aangemaakt_door = huidige_medewerker() and not gefactureerd));
create policy "bezoek verwijderen" on bezoeken for delete
  using (mag_bezoek_wijzigen(id));

create policy "uren lezen" on bezoek_uren for select
  using (huidige_medewerker() is not null);
create policy "uren schrijven" on bezoek_uren for all
  using (mag_bezoek_wijzigen(bezoek_id)) with check (mag_bezoek_wijzigen(bezoek_id));

create policy "regels lezen" on bezoekregels for select
  using (huidige_medewerker() is not null);
create policy "regels schrijven" on bezoekregels for all
  using (mag_bezoek_wijzigen(bezoek_id)) with check (mag_bezoek_wijzigen(bezoek_id));

create policy "fotos lezen" on bezoek_fotos for select
  using (huidige_medewerker() is not null);
create policy "fotos schrijven" on bezoek_fotos for all
  using (mag_bezoek_wijzigen(bezoek_id)) with check (mag_bezoek_wijzigen(bezoek_id));

-- Storage voor foto's ---------------------------------------------------------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
  on conflict (id) do nothing;

create policy "fotos bekijken" on storage.objects for select
  using (bucket_id = 'fotos' and huidige_medewerker() is not null);
create policy "fotos uploaden" on storage.objects for insert
  with check (bucket_id = 'fotos' and huidige_medewerker() is not null);

-- Koppel een nieuw account aan de medewerker met hetzelfde e-mailadres -------
create or replace function koppel_medewerker() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update medewerkers set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end
$$;

create trigger koppel_medewerker_na_aanmelden
  after insert on auth.users
  for each row execute function koppel_medewerker();

-- Een bezoek met uren en regels in één keer opslaan ---------------------------
-- De telefoon maakt het id zelf aan, zodat een bezoek dat offline is bewaard
-- en later opnieuw wordt verstuurd nooit dubbel in de database komt.
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

  insert into bezoekregels (bezoek_id, werkzaamheid_id, omschrijving)
  select b_id, nullif(r ->> 'werkzaamheid_id', '')::uuid, coalesce(r ->> 'omschrijving', '')
  from jsonb_array_elements(coalesce(bezoek -> 'regels', '[]')) r;

  return b_id;
end
$$;

-- Voor wie al een account had voordat de beheerder hem toevoegde: de app roept
-- dit aan na het inloggen.
create or replace function koppel_eigen_account() returns void
language sql security definer set search_path = public as $$
  update medewerkers set user_id = auth.uid()
  where user_id is null and lower(email) = lower(auth.jwt() ->> 'email')
$$;
