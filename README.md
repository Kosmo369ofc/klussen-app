# klussen-app

Klussen-app voor hoveniers: per klant bijhouden wat er bij elk bezoek is gedaan, door wie en hoe lang.
Werkt op telefoon en laptop; alles staat in één online database, dus het is overal meteen bijgewerkt.

## Wat er nu in zit

- Inloggen met een code per e-mail, per medewerker een eigen account
- Klantenlijst met zoeken, klantkaart met adres (tik om te navigeren), telefoon, notities en de laatste bezoeken
- Bezoek invoeren: werkzaamheden afvinken, extra werk typen, uren per medewerker, opmerkingen
- Geen bereik bij het opslaan? Dan bewaart de telefoon het bezoek en verstuurt het zodra er weer internet is
- Voor de beheerder: klanten toevoegen en bewerken (contractvorm, contracturen, werkzaamheden) en medewerkers beheren

Nog niet: overzichten (uren tegenover contract, beurten om te factureren), export naar Google Sheets en foto's.

## Eenmalig instellen

1. Maak een gratis project aan op [supabase.com](https://supabase.com).
2. Open in Supabase de **SQL Editor**, plak de inhoud van `supabase/migrations/0001_basis.sql` en klik op **Run**.
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
