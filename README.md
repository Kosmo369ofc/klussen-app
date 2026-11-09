# klussen-app

Klussen-app voor hoveniers: per klant bijhouden wat er bij elk bezoek is gedaan, door wie en hoe lang.
Werkt op telefoon en laptop; alles staat in één online database, dus het is overal meteen bijgewerkt.

## Wat er nu in zit

- Koppeling met Google Drive: per klant een map met de beurten en foto's, zie [google-drive/LEESMIJ.md](google-drive/LEESMIJ.md)
- Inloggen met e-mail en wachtwoord; de eerste keer (of bij een vergeten wachtwoord) met een code per e-mail, waarna je zelf een wachtwoord kiest
- Klantenlijst met zoeken, klantkaart met adres (tik om te navigeren), telefoon, notities en de laatste bezoeken
- Bezoek invoeren: werkzaamheden afvinken, extra werk typen, uren per medewerker, opmerkingen
- Geen bereik bij het opslaan? Dan bewaart de telefoon het bezoek en verstuurt het zodra er weer internet is
- Foto's van het resultaat bij een bezoek (alleen met internet)
- Per werkzaamheid een eigen interval (elke beurt, elke 2 weken, elke 3 maanden, ...) en wanneer het weer nodig is
- Overzicht van de laatste beurt per klant, langst geleden bovenaan
- Voor de beheerder: klanten met contactpersoon, prijsafspraken, contractgegevens en contract als bestand;
  facturatie-overzicht met per beurt gefactureerd ja of nee; medewerkers beheren

- Urenregistratie voor medewerkers, los van de klantbeurten: per werkdag begin, eind en pauze.
  Weekoverzicht met weeknummer en per dag de dag en datum; een dag invullen begint op 07:00–16:00 met een uur pauze.
  Klokken op het startscherm: bij vertrek start je reistijd, bij de klant start je werk, en als je klaar bent
  ga je weer verder met reistijd; aan het eind tik je Dag klaar. Elk stuk komt vanzelf als regel in de week;
  reistijd telt apart van de werkuren. Het scherm Uren is voor achteraf invullen en aanpassen.
  Kilometers: op het startscherm de kilometerstand van de bus bij begin en Dag klaar, of achteraf per dag
  het aantal km in het weekoverzicht. De km staan ook in de download en het Drive-bestand.
  Iedereen vult alleen zijn eigen uren in; de beheerder bekijkt ieders week, keurt goed en kan per week
  een bestand downloaden (opent in Excel en Google Sheets). Het Drive-script zet alle uren ook in een apart
  bestand **Urenregistratie medewerkers** in de map Klussen-app

Nog niet: uren tegenover het contract en export naar Google Sheets.

## Eenmalig instellen

1. Maak een gratis project aan op [supabase.com](https://supabase.com).
2. Open in Supabase de **SQL Editor**, plak de inhoud van `supabase/migrations/0001_basis.sql` en klik op **Run**.
   Doe daarna hetzelfde met elk volgend bestand in die map, op volgorde (`0002_wensen.sql`, `0003_prijsopbouw.sql`, `0004_contractperiode.sql`, `0005_urenregistratie.sql`, `0006_uren_per_klant.sql`, `0007_inklokken.sql`, `0008_medewerker_wijzigen.sql`, `0009_reistijd_klokken.sql`, `0010_kilometers.sql`, ...).
   Een bestand dat al is uitgevoerd, voer je niet nog een keer uit.
3. Zet jezelf erin als eerste beheerder (in de SQL Editor):
   ```sql
   insert into medewerkers (naam, email, rol) values ('Jouw naam', 'jij@voorbeeld.nl', 'beheerder');
   ```
4. Ga naar **Authentication > Emails > Magic Link** en zet `{{ .Token }}` in de tekst van de e-mail,
   bijvoorbeeld: `Je inlogcode is {{ .Token }}`. Zo krijgen medewerkers een code in plaats van een link;
   een code werkt ook in de app op het beginscherm van de telefoon.
5. Kopieer `.env.example` naar `.env` en vul de URL en de anon key in (Supabase: **Project Settings > API**).

## Draaien op je eigen computer

```sh
npm install
npm run dev
```

## Controleren

```sh
npm run build    # bouwt de app en controleert de code
npm run test:db  # test de database-opzet en de rechten, zonder Supabase
```

## Rechten

Medewerkers zien alle klanten en bezoeken, en voeren hun eigen bezoeken in. Een eigen bezoek kunnen ze
aanpassen tot het gefactureerd is. Alleen de beheerder kan klanten, werkzaamheden en medewerkers beheren
en de contracturen zien. Dit wordt in de database afgedwongen, niet alleen in de app.

## Online zetten (Netlify)

1. Log in op [netlify.com](https://www.netlify.com) met je GitHub-account.
2. Kies **Add new project > Import an existing project > GitHub** en selecteer `klussen-app`.
   De instellingen komen uit `netlify.toml`.
3. Voeg bij **Environment variables** toe: `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`
   (de anon of publishable key) en klik op **Deploy**.
4. Zet in Supabase bij **Authentication > URL Configuration** de **Site URL** op het adres dat Netlify je geeft.

Daarna zet Netlify elke wijziging op `main` vanzelf online.

## Online zetten (Cloudflare Pages)

De app staat op Cloudflare Pages en wordt bij elke wijziging op `main` vanzelf bijgewerkt.
Elke pull request krijgt een eigen testlink, zodat je een wijziging kunt bekijken voordat je merget.

Instellingen in Cloudflare (Workers & Pages > het project > Settings > Builds):

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables (bij Production én Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` en `NODE_VERSION` = `22`

`public/_headers` regelt extra beveiliging en zorgt dat telefoons een nieuwe versie meteen ophalen.
Pagina's als `/klanten/123` werken vanzelf, omdat Cloudflare zonder `404.html` alles naar de app stuurt.

## Back-ups

Elke nacht maakt de GitHub-workflow **Database-back-up** (`.github/workflows/database-backup.yml`) een
versleutelde kopie van alle gegevens in de database. Die staat 30 dagen onder **Actions > Database-back-up**.
Lukt een back-up niet, dan stuurt GitHub een e-mail. Foto's staan niet in de database maar in Supabase Storage;
het Drive-script zet ze ook in Google Drive.

### Back-up terugzetten

1. Download de back-up bij **Actions > Database-back-up > (de nacht die je wilt) > Artifacts** en pak de zip uit.
2. Ontsleutel en pak uit (vraagt om `BACKUP_WACHTWOORD`):
   `gpg -d klussen-db-JJJJ-MM-DD.tar.gz.gpg | tar -xz`
   Je krijgt een map met `opzet.sql` (de tabellen) en `gegevens.sql` (alle gegevens).
3. Zorg dat de database de opzet heeft: bij een nieuw project eerst alle bestanden uit `supabase/migrations` uitvoeren (zie hierboven).
4. Maak de tabellen leeg en zet de gegevens terug, in één keer (stopt bij de eerste fout, zodat er niets half gebeurt):
   ```sh
   psql "<verbindingslink>" -v ON_ERROR_STOP=1 --single-transaction \
     -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('truncate table public.%I cascade', t); end loop; end \$\$;" \
     -f gegevens.sql
   ```
   Bij een **nieuw** project bestaan de inlogaccounts nog niet. Voer dan vóór stap 4 in de SQL Editor uit:
   `alter table medewerkers drop constraint medewerkers_user_id_fkey;`
   en erna:
   `update medewerkers set user_id = null; alter table medewerkers add constraint medewerkers_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;`
   Medewerkers loggen dan opnieuw in met een code per e-mail en worden vanzelf weer aan hun gegevens gekoppeld.
