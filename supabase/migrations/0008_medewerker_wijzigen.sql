-- Medewerkers wijzigen door de beheerder: naam en e-mailadres aanpassen, en
-- iemand die zijn wachtwoord kwijt is een tijdelijk wachtwoord geven.
-- Een wachtwoord zelf kan niemand inzien: het wordt alleen versleuteld bewaard.

-- Naam en e-mailadres wijzigen. Heeft de medewerker al eens ingelogd, dan
-- verandert ook het e-mailadres waarmee hij inlogt. Zijn wachtwoord en al zijn
-- uren en bezoeken blijven gewoon bewaard.
create or replace function medewerker_wijzigen(m_id uuid, nieuwe_naam text, nieuw_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m medewerkers;
  e text := lower(trim(nieuw_email));
begin
  if not is_beheerder() then
    raise exception 'Alleen een beheerder mag medewerkers wijzigen' using errcode = '42501';
  end if;
  select * into m from medewerkers where id = m_id;
  if not found then
    raise exception 'Medewerker niet gevonden';
  end if;
  if length(trim(coalesce(nieuwe_naam, ''))) = 0 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Naam of e-mailadres klopt niet' using errcode = '22023';
  end if;
  if exists (select 1 from medewerkers where lower(email) = e and id <> m_id) then
    raise exception 'Dit e-mailadres staat er al in' using errcode = '23505';
  end if;

  if m.user_id is not null and lower(m.email) <> e then
    if exists (select 1 from auth.users where lower(email) = e and id <> m.user_id) then
      raise exception 'Met dit e-mailadres is al een ander account gemaakt' using errcode = '23505';
    end if;
    update auth.users set email = e, updated_at = now() where id = m.user_id;
    update auth.identities
      set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(e)), updated_at = now()
      where user_id = m.user_id and provider = 'email';
  end if;

  update medewerkers set naam = trim(nieuwe_naam), email = e where id = m_id;
end
$$;

-- Tijdelijk wachtwoord geven. De medewerker moet daarna bij het inloggen
-- meteen zelf een nieuw wachtwoord kiezen.
create or replace function tijdelijk_wachtwoord(m_id uuid, wachtwoord text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  u uuid;
begin
  if not is_beheerder() then
    raise exception 'Alleen een beheerder mag wachtwoorden geven' using errcode = '42501';
  end if;
  if length(coalesce(wachtwoord, '')) < 8 then
    raise exception 'Kies een wachtwoord van minstens 8 tekens' using errcode = '22023';
  end if;
  select user_id into u from medewerkers where id = m_id;
  if u is null then
    raise exception 'Deze medewerker heeft nog nooit ingelogd' using errcode = 'P0002';
  end if;
  update auth.users
    set encrypted_password = crypt(wachtwoord, gen_salt('bf')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"wachtwoord_ingesteld": false}'::jsonb,
        updated_at = now()
    where id = u;
end
$$;

revoke execute on function medewerker_wijzigen(uuid, text, text) from public, anon;
revoke execute on function tijdelijk_wachtwoord(uuid, text) from public, anon;
grant execute on function medewerker_wijzigen(uuid, text, text) to authenticated;
grant execute on function tijdelijk_wachtwoord(uuid, text) to authenticated;

notify pgrst, 'reload schema';
