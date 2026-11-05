-- Klanten verwijderen en per klant kiezen of hij in het klokmenu staat.

-- 1. Kiesbaar bij klokken: de beheerder zet dit per klant aan of uit.
--    Staat het uit, dan staat de klant niet in het keuzemenu bij uren klokken.
alter table klanten
  add column if not exists kiesbaar_bij_klokken boolean not null default true;

-- 2. Klant helemaal verwijderen, alleen voor de beheerder.
--    Bezoeken (met uren, gedane werkzaamheden en foto-regels) gaan mee weg,
--    net als werkzaamheden en contractgegevens. Geklokte uren blijven
--    bewaard, alleen zonder klant.
create or replace function klant_verwijderen(klant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_beheerder() then
    raise exception 'Alleen de beheerder mag klanten verwijderen';
  end if;
  delete from bezoeken where klant_id = klant;
  delete from klanten where id = klant;
end;
$$;

revoke all on function klant_verwijderen(uuid) from public, anon;
grant execute on function klant_verwijderen(uuid) to authenticated;
