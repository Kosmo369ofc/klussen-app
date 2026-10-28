-- Wensen na de eerste test: vrije intervallen, contactpersoon, prijsafspraken,
-- contractbestanden, facturatiedatum en overzichten van de laatste beurt.
-- Uitvoeren in de SQL-editor van Supabase, na 0001_basis.sql.

-- Contactpersoon bij het telefoonnummer -------------------------------------
alter table klanten add column contactpersoon text;

-- Vrije intervallen per werkzaamheid -----------------------------------------
-- Leeg interval betekent: elke beurt. Anders bijv. elke 2 weken of elke 3 maanden.
alter table werkzaamheden
  add column interval_aantal int check (interval_aantal is null or interval_aantal between 1 and 99),
  add column interval_eenheid text check (interval_eenheid in ('week', 'maand', 'jaar'));

update werkzaamheden set interval_aantal = 1, interval_eenheid = 'maand' where frequentie = 'maandelijks';
update werkzaamheden set interval_aantal = 3, interval_eenheid = 'maand' where frequentie = 'per_seizoen';
update werkzaamheden set interval_aantal = 1, interval_eenheid = 'jaar' where frequentie = 'jaarlijks';

alter table werkzaamheden drop column frequentie;
alter table werkzaamheden add constraint interval_compleet
  check ((interval_aantal is null) = (interval_eenheid is null));

-- Prijsafspraken en contractgegevens (alleen voor de beheerder) -------------
-- De tabel contracten wordt de plek voor alle afspraken over geld, ook bij
-- klanten die per beurt betalen.
alter table contracten alter column uren drop not null;
alter table contracten
  add column uurtarief numeric(8, 2) check (uurtarief >= 0),
  add column prijs_per_beurt numeric(8, 2) check (prijs_per_beurt >= 0),
  add column contractbedrag numeric(10, 2) check (contractbedrag >= 0),
  add column startdatum date,
  add column einddatum date,
  add column prijsafspraak text,
  add column bestand_pad text,
  add column bestand_naam text;

-- Contractbestanden staan in een eigen, afgeschermde bucket.
insert into storage.buckets (id, name, public) values ('contracten', 'contracten', false)
  on conflict (id) do nothing;

create policy "contracten bekijken" on storage.objects for select
  using (bucket_id = 'contracten' and is_beheerder());
create policy "contracten uploaden" on storage.objects for insert
  with check (bucket_id = 'contracten' and is_beheerder());
create policy "contracten vervangen" on storage.objects for update
  using (bucket_id = 'contracten' and is_beheerder());
create policy "contracten verwijderen" on storage.objects for delete
  using (bucket_id = 'contracten' and is_beheerder());

-- Wanneer een bezoek is gefactureerd --------------------------------------
alter table bezoeken add column gefactureerd_op timestamptz;
update bezoeken set gefactureerd_op = aangemaakt_op where gefactureerd;

create or replace function zet_gefactureerd_op() returns trigger
language plpgsql as $$
begin
  if new.gefactureerd and not coalesce(old.gefactureerd, false) then
    new.gefactureerd_op := now();
  elsif not new.gefactureerd then
    new.gefactureerd_op := null;
  end if;
  return new;
end
$$;

create trigger bezoek_gefactureerd_op
  before insert or update of gefactureerd on bezoeken
  for each row execute function zet_gefactureerd_op();

-- Foto's mag de maker van een bezoek ook weer weghalen ----------------------
create policy "fotos verwijderen" on storage.objects for delete
  using (bucket_id = 'fotos' and huidige_medewerker() is not null);

-- Overzichten van de laatste beurt -------------------------------------------
-- security_invoker: de rechten van wie het overzicht opvraagt gelden.
create view klant_laatste_beurt with (security_invoker = true) as
  select k.id as klant_id, max(b.datum) as laatste_datum, count(b.id)::int as aantal_bezoeken
  from klanten k
  left join bezoeken b on b.klant_id = k.id
  group by k.id;

create view werkzaamheid_laatst_gedaan with (security_invoker = true) as
  select w.id as werkzaamheid_id, w.klant_id, max(b.datum) as laatste_datum
  from werkzaamheden w
  left join bezoekregels r on r.werkzaamheid_id = w.id
  left join bezoeken b on b.id = r.bezoek_id
  group by w.id;

grant select on klant_laatste_beurt, werkzaamheid_laatst_gedaan to authenticated;
