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
  Iedereen vult alleen zijn eigen uren in; de beheerder bekijkt ieders week, keurt goed en kan per week
  een bestand downloaden (opent in Excel en Google Sheets). Het Drive-script zet alle uren ook in een apart
  bestand **Urenregistratie medewerkers** in de map Klussen-app

Nog niet: uren tegenover het contract en export naar Google Sheets.

## Eenmalig instellen

1. Maak een gratis project aan op [supabase.com](https://supabase.com).
2. Open in Supabase de **SQL Editor**, plak de inhoud van `supabase/migrations/0001_basis.sql` en klik op **Run**.
   Doe daarna hetzelfde met elk volgend bestand in die map, op volgorde (`0002_wensen.sql`, `0003_prijsopbouw.sql`, `0004_contractperiode.sql`, `0005_urenregistratie.sql`, ...).
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
