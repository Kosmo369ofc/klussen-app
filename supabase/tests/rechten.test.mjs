import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'fs'

// Test de database-opzet en de rechten zonder Supabase, met een nagebootst
// auth-schema. Draai met: npm run test:db

let mislukt = 0
const db = new PGlite({ extensions: { pgcrypto } })
const q = (s, p) => db.query(s, p)
await db.exec(`
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('test.email', true)) $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial, bucket_id text, name text);
alter table storage.objects enable row level security;
create role authenticated;
`)
await db.exec(fs.readFileSync(new URL('../migrations/0001_basis.sql', import.meta.url), 'utf8'))
await db.exec(`grant usage on schema public, auth, storage to authenticated;
grant all on storage.objects to authenticated; grant usage on sequence storage.objects_id_seq to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;`)

const baas = '00000000-0000-0000-0000-000000000001'
const jan = '00000000-0000-0000-0000-000000000002'
const vreemd = '00000000-0000-0000-0000-000000000003'
// Eerste beheerder: zoals in de README, vóór het eerste inloggen.
await q(`insert into medewerkers (naam, email, rol) values ('Baas', 'baas@x.nl', 'beheerder'), ('Jan', 'jan@x.nl', 'medewerker')`)
await q(`insert into auth.users values ($1, 'Baas@x.nl'), ($2, 'vreemd@x.nl')`, [baas, vreemd])
await q(`insert into auth.users values ($1, 'jan@x.nl')`, [jan])

async function als(uid, email, fn) {
  await db.exec(`set test.uid = '${uid}'; set test.email = '${email}'; set role authenticated;`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const ok = (label, v) => { if (!v) mislukt++; console.log(v ? 'OK  ' : 'FOUT', label) }
const fout = async (label, fn) => { try { await fn(); mislukt++; console.log('FOUT', label, '(geen fout)') } catch (e) { console.log('OK  ', label, '->', e.message) } }

ok('accounts gekoppeld', (await q(`select count(*)::int n from medewerkers where user_id is not null`)).rows[0].n === 2)

const klant = await als(baas, 'baas@x.nl', async () => {
  const k = (await q(`insert into klanten (naam, contractvorm) values ('Fam. de Vries', 'vast_contract') returning id`)).rows[0].id
  await q(`insert into contracten values ($1, 8, 'maand')`, [k])
  await q(`insert into werkzaamheden (klant_id, omschrijving) values ($1, 'Gras maaien')`, [k])
  return k
})
ok('beheerder maakt klant', !!klant)

await als(jan, 'jan@x.nl', async () => {
  ok('jan ziet klant', (await q('select * from klanten')).rows.length === 1)
  ok('jan ziet geen contracten', (await q('select * from contracten')).rows.length === 0)
  await fout('jan mag geen klant maken', () => q(`insert into klanten (naam) values ('x')`))
  const mid = (await q(`select huidige_medewerker() id`)).rows[0].id
  const id = '11111111-1111-1111-1111-111111111111'
  const bezoek = { id, klant_id: klant, datum: '2026-10-28', opmerkingen: ' ', uren: [{ medewerker_id: mid, uren: 2.5 }], regels: [{ werkzaamheid_id: null, omschrijving: 'Bladblazen' }] }
  await q(`select bezoek_opslaan($1)`, [bezoek])
  await q(`select bezoek_opslaan($1)`, [bezoek]) // opnieuw: mag niet dubbel
  ok('bezoek één keer', (await q('select count(*)::int n from bezoeken')).rows[0].n === 1)
  ok('uren en regel', (await q('select count(*)::int n from bezoek_uren')).rows[0].n === 1 && (await q('select count(*)::int n from bezoekregels')).rows[0].n === 1)
  await q(`update bezoeken set opmerkingen = 'nat gras' where id = $1`, [id])
  ok('jan wijzigt eigen bezoek', (await q('select opmerkingen from bezoeken')).rows[0].opmerkingen === 'nat gras')
  await fout('jan kan niet zelf factureren', () => q(`update bezoeken set gefactureerd = true where id = $1`, [id]))
})
ok('nog niet gefactureerd', !(await q('select gefactureerd from bezoeken')).rows[0].gefactureerd)
await als(baas, 'baas@x.nl', () => q(`update bezoeken set gefactureerd = true`))
await als(jan, 'jan@x.nl', async () => {
  await q(`update bezoeken set opmerkingen = 'later' `)
  ok('jan kan gefactureerd bezoek niet wijzigen', (await q('select opmerkingen from bezoeken')).rows[0].opmerkingen === 'nat gras')
})
await als(vreemd, 'vreemd@x.nl', async () => {
  ok('onbekend account ziet niets', (await q('select * from klanten')).rows.length === 0)
  await fout('onbekend account kan geen bezoek opslaan', () => q(`select bezoek_opslaan($1)`, [{ id: '22222222-2222-2222-2222-222222222222', klant_id: klant, uren: [], regels: [] }]))
})

// Iemand die al een account had voordat de beheerder hem toevoegde.
await q(`insert into medewerkers (naam, email) values ('Vreemd', 'vreemd@x.nl')`)
await als(vreemd, 'vreemd@x.nl', async () => {
  await q('select koppel_eigen_account()')
  ok('later toegevoegd account wordt gekoppeld', (await q('select huidige_medewerker() id')).rows[0].id !== null)
})

// Migratie 0002: bestaande gegevens moeten meegaan.
await q(`insert into werkzaamheden (klant_id, omschrijving, frequentie) values ($1, 'Haag knippen', 'per_seizoen')`, [klant])
await db.exec(fs.readFileSync(new URL('../migrations/0002_wensen.sql', import.meta.url), 'utf8'))
await db.exec(`grant all on all tables in schema public to authenticated;`)
const haag = (await q(`select interval_aantal, interval_eenheid from werkzaamheden where omschrijving = 'Haag knippen'`)).rows[0]
ok('per seizoen wordt elke 3 maanden', haag.interval_aantal === 3 && haag.interval_eenheid === 'maand')
const gras = (await q(`select interval_aantal from werkzaamheden where omschrijving = 'Gras maaien'`)).rows[0]
ok('elke beurt blijft zonder interval', gras.interval_aantal === null)
ok('oud gefactureerd bezoek krijgt datum', (await q('select gefactureerd_op from bezoeken')).rows[0].gefactureerd_op !== null)

await als(baas, 'baas@x.nl', async () => {
  await q(`update contracten set uurtarief = 45, prijsafspraak = 'groenafval apart' where klant_id = $1`, [klant])
  await q(`update klanten set contactpersoon = 'Mevr. de Vries' where id = $1`, [klant])
  await fout('interval zonder eenheid mag niet', () => q(`insert into werkzaamheden (klant_id, omschrijving, interval_aantal) values ($1, 'x', 2)`, [klant]))
  await q(`update bezoeken set gefactureerd = false`)
  ok('terugzetten wist factuurdatum', (await q('select gefactureerd_op from bezoeken')).rows[0].gefactureerd_op === null)
  await q(`update bezoeken set gefactureerd = true`)
  ok('factureren zet datum', (await q('select gefactureerd_op from bezoeken')).rows[0].gefactureerd_op !== null)
  ok('beheerder ziet laatste beurt', (await q('select laatste_datum from klant_laatste_beurt')).rows[0].laatste_datum !== null)
})
await als(jan, 'jan@x.nl', async () => {
  ok('jan ziet geen prijsafspraken', (await q('select * from contracten')).rows.length === 0)
  ok('jan ziet laatste beurt', (await q('select laatste_datum from klant_laatste_beurt')).rows[0].laatste_datum !== null)
  ok('jan ziet wanneer werk laatst gedaan is', (await q('select * from werkzaamheid_laatst_gedaan')).rows.length === 2)
  await fout('jan kan geen contractbestand uploaden', () => q(`insert into storage.objects (bucket_id, name) values ('contracten', 'x.pdf')`))
  await q(`insert into storage.objects (bucket_id, name) values ('fotos', 'b/1.jpg')`)
  ok('jan kan een foto uploaden', true)
})
await als('00000000-0000-0000-0000-000000000009', 'niemand@x.nl', async () => {
  ok('onbekend account ziet geen overzicht', (await q('select * from klant_laatste_beurt')).rows.length === 0)
})

// Migratie 0003: prijsopbouw.
await db.exec(fs.readFileSync(new URL('../migrations/0003_prijsopbouw.sql', import.meta.url), 'utf8'))
ok('bestaande werkzaamheden 1 keer per interval', (await q(`select keer from werkzaamheden where omschrijving = 'Haag knippen'`)).rows[0].keer === 1)
const afval = await als(baas, 'baas@x.nl', async () => {
  const w = (await q(`insert into werkzaamheden (klant_id, omschrijving, wanneer_nodig, meeteenheid) values ($1, 'Groenafval', true, 'm³') returning id`, [klant])).rows[0].id
  await q(`insert into werkzaamheid_prijzen (werkzaamheid_id, prijs_type, bedrag) values ($1, 'per_eenheid', 35)`, [w])
  await q(`insert into werkzaamheden (klant_id, omschrijving, keer, interval_aantal, interval_eenheid) values ($1, 'Onkruid', 2, 1, 'maand')`, [klant])
  await fout('2 keer zonder interval mag niet', () => q(`insert into werkzaamheden (klant_id, omschrijving, keer) values ($1, 'x', 2)`, [klant]))
  await fout('als nodig én schema mag niet', () => q(`insert into werkzaamheden (klant_id, omschrijving, wanneer_nodig, interval_aantal, interval_eenheid) values ($1, 'x', true, 1, 'maand')`, [klant]))
  await q(`update contracten set beurten_keer = 2, beurten_aantal = 1, beurten_eenheid = 'maand', uren_per_beurt = 3, termijnen = 4 where klant_id = $1`, [klant])
  await fout('5 termijnen mag niet', () => q(`update contracten set termijnen = 5 where klant_id = $1`, [klant]))
  ok('beheerder ziet prijs', (await q('select * from werkzaamheid_prijzen')).rows.length === 1)
  return w
})
await als(jan, 'jan@x.nl', async () => {
  ok('jan ziet geen prijzen', (await q('select * from werkzaamheid_prijzen')).rows.length === 0)
  await fout('jan kan geen prijs invullen', () => q(`insert into werkzaamheid_prijzen (werkzaamheid_id, prijs_type, bedrag) values ($1, 'per_keer', 1)`, [afval]))
  ok('jan ziet de eenheid', (await q(`select meeteenheid from werkzaamheden where id = $1`, [afval])).rows[0].meeteenheid === 'm³')
  const mid = (await q(`select huidige_medewerker() id`)).rows[0].id
  await q(`select bezoek_opslaan($1)`, [{ id: '33333333-3333-3333-3333-333333333333', klant_id: klant, datum: '2026-10-29', uren: [{ medewerker_id: mid, uren: 3 }], regels: [{ werkzaamheid_id: afval, omschrijving: 'Groenafval', hoeveelheid: 2.5 }, { werkzaamheid_id: null, omschrijving: 'Vegen' }] }])
  const r = (await q(`select hoeveelheid from bezoekregels where bezoek_id = '33333333-3333-3333-3333-333333333333' order by omschrijving`)).rows
  ok('hoeveelheid opgeslagen', Number(r[0].hoeveelheid) === 2.5 && r[1].hoeveelheid === null)
})
await als(baas, 'baas@x.nl', async () => {
  await q(`delete from werkzaamheden where id = $1`, [afval])
  ok('verwijderen ruimt prijs op', (await q('select * from werkzaamheid_prijzen')).rows.length === 0)
  ok('bezoekregel blijft na verwijderen', (await q(`select werkzaamheid_id from bezoekregels where omschrijving = 'Groenafval'`)).rows[0].werkzaamheid_id === null)
})

// Migratie 0004: vast contract in beurten.
await db.exec(fs.readFileSync(new URL('../migrations/0004_contractperiode.sql', import.meta.url), 'utf8'))
await als(baas, 'baas@x.nl', async () => {
  await q(`update contracten set uren = null, contract_beurten = 2 where klant_id = $1`, [klant])
  ok('contract in beurten', (await q('select contract_beurten from contracten')).rows[0].contract_beurten === 2)
})

// Migratie 0005: urenregistratie.
await db.exec(fs.readFileSync(new URL('../migrations/0005_urenregistratie.sql', import.meta.url), 'utf8'))
await db.exec(`grant all on all tables in schema public to authenticated;`)
const dag = '44444444-4444-4444-4444-444444444444'
await als(jan, 'jan@x.nl', async () => {
  await q(`insert into werkuren (id, datum, begintijd, eindtijd, pauze_minuten) values ($1, '2026-11-02', '07:30', '16:00', 30)`, [dag])
  ok('jan schrijft uren, 8 uur na pauze', Number((await q('select uren from werkuren')).rows[0].uren) === 8)
  await fout('eindtijd voor begintijd mag niet', () => q(`insert into werkuren (begintijd, eindtijd) values ('16:00', '08:00')`))
  await fout('jan kan geen uren voor een ander schrijven', () => q(`insert into werkuren (medewerker_id, begintijd, eindtijd) select id, '08:00', '12:00' from medewerkers where naam = 'Baas'`))
  await fout('jan kan niet zelf goedkeuren', () => q(`update werkuren set goedgekeurd = true where id = $1`, [dag]))
  await q(`update werkuren set opmerking = 'regen' where id = $1`, [dag])
  ok('jan wijzigt eigen uren', (await q('select opmerking from werkuren')).rows[0].opmerking === 'regen')
})
await als(baas, 'baas@x.nl', async () => {
  await q(`insert into werkuren (begintijd, eindtijd) values ('08:00', '12:00')`)
  ok('beheerder ziet alle uren', (await q('select * from werkuren')).rows.length === 2)
  await q(`update werkuren set goedgekeurd = true where id = $1`, [dag])
})
await als(jan, 'jan@x.nl', async () => {
  ok('jan ziet alleen eigen uren', (await q('select * from werkuren')).rows.length === 1)
  await q(`update werkuren set opmerking = 'later' where id = $1`, [dag])
  await q(`delete from werkuren where id = $1`, [dag])
  ok('goedgekeurde uren blijven staan', (await q('select opmerking from werkuren')).rows[0]?.opmerking === 'regen')
})
await als(vreemd, 'vreemd@x.nl', async () => {
  ok('ander ziet geen uren van jan', (await q('select * from werkuren')).rows.length === 0)
})

// Migratie 0006: klant per urenregel.
await db.exec(fs.readFileSync(new URL('../migrations/0006_uren_per_klant.sql', import.meta.url), 'utf8').replace(/notify pgrst.*$/m, ''))
await als(jan, 'jan@x.nl', async () => {
  await q(`insert into werkuren (datum, begintijd, eindtijd, klant_id) values ('2026-11-05', '07:00', '12:00', $1), ('2026-11-05', '12:00', '16:00', null)`, [klant])
  ok('jan kiest een klant per urenregel', (await q(`select count(*)::int n from werkuren where datum = '2026-11-05' and klant_id = $1`, [klant])).rows[0].n === 1)
})

// Migratie 0007: in- en uitklokken.
await db.exec(fs.readFileSync(new URL('../migrations/0007_inklokken.sql', import.meta.url), 'utf8').replace(/notify pgrst.*$/m, ''))
await db.exec('grant all on ingeklokt to authenticated')
await als(jan, 'jan@x.nl', async () => {
  await q(`insert into ingeklokt (klant_id) values ($1)`, [klant])
  await fout('jan klokt niet twee keer in', () => q(`insert into ingeklokt default values`))
})
await als(baas, 'baas@x.nl', async () => {
  ok('beheerder ziet wie ingeklokt is', (await q('select * from ingeklokt')).rows.length === 1)
  await fout('beheerder klokt niet in voor een ander', () => q(`insert into ingeklokt (medewerker_id) select id from medewerkers where naam = 'Jan'`))
})
// Doen alsof jan drie uur geleden begon en al 30 minuten pauze had.
await q(`update ingeklokt set gestart_op = now() - interval '3 hours', pauze_minuten = 30`)
await als(jan, 'jan@x.nl', async () => {
  await q('select pauze_wisselen()')
  ok('pauze loopt', (await q('select pauze_sinds from ingeklokt')).rows[0].pauze_sinds !== null)
  await q('select pauze_wisselen()')
  ok('weer aan het werk', (await q('select pauze_sinds, pauze_minuten from ingeklokt')).rows[0].pauze_sinds === null)
  const r = (await q('select * from uitklokken()')).rows[0]
  ok('uitklokken maakt een urenregel', r.pauze_minuten === 30 && r.klant_id === klant && r.eindtijd > r.begintijd)
  ok('klok gestopt', (await q('select count(*)::int n from ingeklokt')).rows[0].n === 0)
  await fout('uitklokken zonder inklokken', () => q('select uitklokken()'))
})
// Vergeten uit te klokken: de regel stopt om 23:59 op de dag van inklokken.
await als(jan, 'jan@x.nl', () => q(`insert into ingeklokt default values`))
await q(`update ingeklokt set gestart_op = now() - interval '2 days'`)
await als(jan, 'jan@x.nl', async () => {
  const r = (await q('select * from uitklokken()')).rows[0]
  ok('vergeten uitklokken stopt om 23:59', r.eindtijd === '23:59:00')
})
// Migratie 0008: beheerder wijzigt e-mailadres en geeft tijdelijk wachtwoord.
await db.exec(`
create schema extensions; create extension pgcrypto schema extensions; create role anon;
alter table auth.users add column encrypted_password text, add column raw_user_meta_data jsonb, add column updated_at timestamptz;
create table auth.identities (user_id uuid, provider text, identity_data jsonb, updated_at timestamptz);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000009', 'los@x.nl');
insert into auth.identities values ('${jan}', 'email', '{"email": "jan@x.nl", "sub": "x"}', null);
`)
await db.exec(fs.readFileSync(new URL('../migrations/0008_medewerker_wijzigen.sql', import.meta.url), 'utf8').replace(/notify pgrst.*$/m, ''))
await db.exec(`grant execute on all functions in schema public to authenticated;`)
const janId = (await q(`select id from medewerkers where email = 'jan@x.nl'`)).rows[0].id
await als(jan, 'jan@x.nl', async () => {
  await fout('medewerker mag geen e-mail wijzigen', () => q(`select medewerker_wijzigen($1, 'Jan', 'jan2@x.nl')`, [janId]))
  await fout('medewerker mag geen wachtwoord geven', () => q(`select tijdelijk_wachtwoord($1, 'geheim123')`, [janId]))
})
await als(baas, 'baas@x.nl', async () => {
  await fout('e-mail van ander account kan niet', () => q(`select medewerker_wijzigen($1, 'Jan', 'LOS@x.nl')`, [janId]))
  await fout('e-mail van andere medewerker kan niet', () => q(`select medewerker_wijzigen($1, 'Jan', 'baas@x.nl')`, [janId]))
  await fout('te kort wachtwoord kan niet', () => q(`select tijdelijk_wachtwoord($1, 'kort')`, [janId]))
  await q(`select medewerker_wijzigen($1, ' Jan de Vries ', ' Jan.Nieuw@X.nl ')`, [janId])
  await q(`select tijdelijk_wachtwoord($1, 'geheim123')`, [janId])
})
{
  const m = (await q(`select naam, email, user_id from medewerkers where id = $1`, [janId])).rows[0]
  ok('naam en e-mail gewijzigd', m.naam === 'Jan de Vries' && m.email === 'jan.nieuw@x.nl' && m.user_id === jan)
  const u = (await q(`select email, raw_user_meta_data, encrypted_password = extensions.crypt('geheim123', encrypted_password) as klopt from auth.users where id = $1`, [jan])).rows[0]
  ok('inlog-e-mail mee gewijzigd', u.email === 'jan.nieuw@x.nl')
  ok('tijdelijk wachtwoord werkt', u.klopt === true)
  ok('moet zelf nieuw wachtwoord kiezen', u.raw_user_meta_data.wachtwoord_ingesteld === false)
  const i = (await q(`select identity_data from auth.identities where user_id = $1`, [jan])).rows[0]
  ok('identiteit mee gewijzigd', i.identity_data.email === 'jan.nieuw@x.nl' && i.identity_data.sub === 'x')
}

// Migratie 0009: reistijd en werk apart klokken.
await db.exec(fs.readFileSync(new URL('../migrations/0009_reistijd_klokken.sql', import.meta.url), 'utf8').replace(/notify pgrst.*$/m, ''))
await db.exec('grant execute on all functions in schema public to authenticated')
await als(jan, 'jan@x.nl', async () => {
  await q(`delete from werkuren where datum = (now() at time zone 'Europe/Amsterdam')::date`)
  await q(`select klok_wissel('reis')`)
  ok('reistijd loopt', (await q('select soort from ingeklokt')).rows[0].soort === 'reis')
})
await q(`update ingeklokt set gestart_op = now() - interval '30 minutes'`)
await als(jan, 'jan@x.nl', async () => {
  await q(`select klok_wissel('werk', $1)`, [klant])
  const regels = (await q(`select soort, klant_id from werkuren where datum = (now() at time zone 'Europe/Amsterdam')::date`)).rows
  ok('aankomst zet reistijd in de uren', regels.length === 1 && regels[0].soort === 'reis')
  const nu = (await q('select soort, klant_id from ingeklokt')).rows[0]
  ok('werk bij klant loopt', nu.soort === 'werk' && nu.klant_id === klant)
  await fout('verkeerde soort mag niet', () => q(`select klok_wissel('vakantie')`))
  ok('na een fout loopt het werk nog', (await q('select soort from ingeklokt')).rows[0]?.soort === 'werk')
})

if (mislukt) {
  console.log(`${mislukt} test(s) mislukt`)
  process.exit(1)
}
