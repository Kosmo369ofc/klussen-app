# Koppeling met Google Drive

Dit script zet de beurten uit de app in Google Drive:

```
Klussen-app/
  Urenregistratie medewerkers   (spreadsheet: "Alle uren", "Per week" en een tabblad per medewerker)
  Carin Bodewes/
    Beurten Carin Bodewes   (spreadsheet: datum, werk, uren, wie, opmerkingen, foto's, gefactureerd)
    Foto's/                 (de foto's van de beurten)
  Fam. Bakker/
    ...
```

Het script werkt elk uur alles bij. Nieuwe klanten krijgen vanzelf een map. Een andere klantnaam
geeft geen nieuwe map: de map krijgt dan alleen een nieuwe naam. Het werkt als de beheerder,
dus de spreadsheet laat ook zien wat gefactureerd is. Prijzen staan er niet in.

Zet het script in Beau's Google-account. Met `MAP_ID` komt de map Klussen-app in jullie
gezamenlijke drive, zodat iedereen die daar toegang heeft hem ziet.

## Installeren (één keer, ongeveer 10 minuten)

1. Ga naar [script.google.com](https://script.google.com) en klik op **Nieuw project**.
   Geef het project bovenaan de naam **Klussen-app naar Drive**.
2. Haal alles weg wat in `Code.gs` staat en plak de inhoud van [`Code.gs`](Code.gs) erin.
3. Vul bovenaan bij `INSTELLINGEN` in:
   - `SUPABASE_URL`: in Supabase bij **Project Settings > Data API** (Project URL), dezelfde als
     `VITE_SUPABASE_URL` in Netlify.
   - `SUPABASE_SLEUTEL`: de **publishable** (of anon) key, dezelfde als `VITE_SUPABASE_ANON_KEY`
     in Netlify. Gebruik nooit de service_role key.
   - `EMAIL`: het e-mailadres waarmee het script in de app inlogt (standaard Beau's account).
   - `MAP_ID`: waar de map Klussen-app moet komen. Laat leeg voor "Mijn Drive". Voor jullie
     gezamenlijke drive: open daar de map waarin het moet komen (of de drive zelf) en kopieer uit
     de adresbalk het stuk na `/folders/`, bijvoorbeeld `0AbCdEfGh...`. Het account waarin het
     script draait moet in die drive minstens **Inhoudsbeheerder** zijn (bij een gedeelde
     map: **Bewerker**). Vul dit in vóór de eerste keer uitvoeren.
4. Klik op het tandwiel **Projectinstellingen**, scrol naar **Scripteigenschappen** en klik op
   **Scripteigenschap toevoegen**. Eigenschap `WACHTWOORD`, waarde: het wachtwoord van dat
   account in de app. Klik op **Scripteigenschappen opslaan**. Alleen de eigenaar van het
   script kan dit zien.
5. Ga terug naar de editor (het `< >`-icoon), kies bovenaan de functie **elkUurBijwerken** en
   klik op **Uitvoeren**.
6. Google vraagt toestemming: klik op **Rechten controleren**, kies het account, dan
   **Geavanceerd > Ga naar Klussen-app naar Drive (onveilig)** en **Toestaan**. Die melding komt
   omdat het je eigen script is en niet door Google is gecontroleerd.
7. Klaar. In Drive staat nu de map **Klussen-app**. Onder **Triggers** (het klokje) zie je dat
   `bijwerken` elk uur draait.

## Goed om te weten

- Nieuwe versie van `Code.gs`? Vervang alles in het script door de nieuwe code, sla op en klaar.
  Het script onthoudt de instellingen van de eerste keer, dus `INSTELLINGEN` mag dan leeg blijven.
  Een waarde die je daar wel invult, vervangt de onthouden waarde. Ze staan onder
  **Projectinstellingen > Scripteigenschappen**, naast `WACHTWOORD`.

- Wil je meteen bijwerken? Kies de functie **bijwerken** en klik op **Uitvoeren**.
- Wordt het wachtwoord in de app veranderd, pas dan ook `WACHTWOORD` in de scripteigenschappen aan.
- Lukt het bijwerken niet, dan stuurt Google een e-mail. Onder **Uitvoeringen** staat de foutmelding.
- De spreadsheet wordt bij elke ronde opnieuw geschreven: eigen aantekeningen in dat blad gaan
  verloren. Zet die in een tweede tabblad of in een ander bestand in de map.
- Bij de eerste keer met veel foto's kan het meerdere rondes duren voordat alle foto's er staan.

Testen zonder Google: `npm run test:drive`.
