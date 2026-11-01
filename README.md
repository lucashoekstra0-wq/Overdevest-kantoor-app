# Overdevest App

Interne app voor Overdevest Adviseurs: lunch en snacks, lunchroulette, boodschappen, koffie naar de vergadering, ruimtes reserveren, activiteiten en polls, Social met LinkedIn/Instagram, Werknemer van de week en een TV-scherm voor de kantine.

- **App:** werkt in elke browser en is als app op de telefoon te zetten (geen App Store nodig)
- **Hosting:** gratis via GitHub Pages
- **Database, inloggen en foto's:** Supabase (gratis abonnement, servers in de EU)
- **Inloggen:** met een code per e-mail, alleen voor @overdevestadviseurs.nl-adressen

---

## Online zetten: stap voor stap (± 45 minuten)

### 1. Supabase-project aanmaken
1. Ga naar [supabase.com](https://supabase.com), maak een gratis account en klik op **New project**.
2. Naam: `overdevest-app`, regio: **Central EU (Frankfurt)** of een andere EU-regio. Kies een sterk databasewachtwoord en bewaar het.

### 2. Database klaarzetten
1. Open `supabase/schema.sql` en controleer bovenaan de twee regels onder **INSTELLINGEN**:
   - het e-maildomein (`overdevestadviseurs.nl`)
   - de e-mailadressen van Lucas en Dennis, die automatisch beheerder worden
2. Ga in Supabase naar **SQL Editor**, klik op **New query**, plak het hele bestand en klik op **Run**.
   Je hoort "Success. No rows returned" te zien. Het bestand mag je later gerust nog eens uitvoeren.

### 3. E-mail instellen (belangrijk)
Supabase verstuurt standaard alleen e-mail naar leden van je Supabase-team, en maximaal 2 per uur. Voor collega's is daarom een eigen e-mailverzender nodig.

1. Maak een gratis account bij bijvoorbeeld **Brevo** (300 mails per dag gratis) of **Resend**. Je kunt ook de Microsoft 365-mailserver van kantoor gebruiken (vraag IT om SMTP-gegevens).
2. Vul in Supabase onder **Authentication → Emails → SMTP Settings** de gegevens in, met als afzender bijvoorbeeld `app@overdevestadviseurs.nl`.
   > Tip: laat IT het afzenderdomein verifiëren (een DNS-record). Anders kunnen mails in de spam belanden.
3. Ga naar **Authentication → Emails → Templates** en pas zowel **Magic Link** als **Confirm signup** aan, zodat de inlogcode erin staat:

   **Onderwerp:** `Je inlogcode voor de Overdevest App`

   **Bericht:**
   ```html
   <h2>Je inlogcode</h2>
   <p>Vul deze code in de Overdevest App in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Of tik op deze link op hetzelfde apparaat: <a href="{{ .ConfirmationURL }}">inloggen</a></p>
   ```
   (De code werkt ook als de app op het beginscherm staat. Een link opent op een iPhone soms in Safari in plaats van in de app.)

### 4. NOS-nieuws voor het TV-scherm
1. Ga in Supabase naar **Edge Functions → Deploy a new function → Via Editor**.
2. Noem de functie precies `nos`, plak de inhoud van `supabase/functions/nos/index.ts` en klik op **Deploy**.
3. Zet bij de instellingen van de functie **Verify JWT** uit, zodat het TV-scherm de koppen mag ophalen.

### 5. De app aan Supabase koppelen
1. Ga in Supabase naar **Project Settings → API Keys** (of **Data API**).
2. Kopieer de **Project URL** en de **publishable key** (of de **anon key**).
3. Plak ze in `js/config.js`. Die sleutel mag openbaar zijn: de database is beveiligd met regels.
4. Zet daar ook de links naar jullie LinkedIn- en Instagram-pagina.

### 6. Op GitHub Pages zetten
1. Maak op [github.com](https://github.com) een nieuwe repository, bijvoorbeeld `overdevest-app`. Kies **Public**, want GitHub Pages is gratis voor openbare repositories. De code bevat geen geheimen.
2. Upload alle bestanden uit deze map via **Add file → Upload files**.
3. Kies bij **Settings → Pages** onder Source **Deploy from a branch**, met branch `main` en map `/ (root)`, en sla op.
4. Na een minuut staat de app op `https://JOUW-GITHUBNAAM.github.io/overdevest-app/`.

### 7. Inloglinks toestaan
Vul in Supabase onder **Authentication → URL Configuration** het volgende in:
- **Site URL:** `https://JOUW-GITHUBNAAM.github.io/overdevest-app/`
- **Redirect URLs:** hetzelfde adres, plus `https://JOUW-GITHUBNAAM.github.io/overdevest-app/**`

### 8. Testen en inrichten
1. Open de app en log in met je eigen adres. Je bent automatisch beheerder.
2. Ga via je profielfoto naar **Beheer** en controleer:
   - **Ruimtes:** kloppen de namen? De Teams-ruimte staat er al in.
   - **Lunch:** de sluitingstijd, het tijdstip van de roulette, de snackdag en de snacks
   - **LinkedIn & Insta:** zet de nieuwste post neer, met afbeelding
3. **TV-scherm:** open **Beheer → TV-scherm**, kopieer de link en open die in volledig scherm in de browser van de TV. De TV hoeft niet in te loggen.

### 9. Collega's uitnodigen
Stuur de link rond. Iedereen logt in met het werkadres en zet de app op het beginscherm:
- **iPhone:** Safari → deelknop → *Zet op beginscherm*
- **Android:** Chrome → menu → *App installeren*

Nieuwe collega's verschijnen vanzelf bij **Beheer → Medewerkers**. Zet daar **Actief** uit voor wie uit dienst gaat.

---

## Hoe het werkt

| Onderdeel | Spelregels |
|---|---|
| **Aanwezigheid** | Op Home kies je *Op kantoor / Thuis / Vrij*. Dat telt mee voor de roulette. |
| **Lunchroulette** | Om 10:30 (instelbaar) wordt eerlijk geloot onder wie op kantoor is of meeluncht. Wie het minst vaak aan de beurt was, gaat voor. Je kunt de taak overdragen aan een collega. |
| **Snacks** | Op de snackdag bestel je per snack tot de sluitingstijd. Daarna kan wijzigen niet meer, dat bewaakt de database. De airfryer-collega ziet de totalen en de bestellingen per persoon. |
| **Koffie** | Je verzoek verschijnt live bij iedereen in de app. De eerste die op *Ik pak het op* tikt, krijgt het. Dubbel oppakken kan niet. Jij ziet de status: opgepakt, onderweg, gebracht. |
| **Ruimtes** | Dubbel boeken wordt door de database tegengehouden. Met *Boek nu 30 min* reserveer je in één tik. |
| **Werknemer van de week** | Eén nominatie per persoon per week, niet op jezelf. De winnaar van vorige week staat in de app en op de TV. |
| **Foto van de week** | Plaats een foto in de categorie *Foto van de week*. De foto met de meeste likes van de afgelopen 7 dagen komt op de TV. |
| **LinkedIn & Instagram** | Beheerders zetten de nieuwste post neer via *Beheer*. Automatisch ophalen vraagt een koppeling met Meta en LinkedIn, die later kan worden toegevoegd. |

## Privacy (AVG)
- Alleen ingelogde collega's met een actief account zien gegevens. Dat wordt afgedwongen in de database (Row Level Security).
- Foto's staan in afgeschermde opslag. Alleen afbeeldingen die bewust als LinkedIn- of Instagram-post zijn toegevoegd, zijn openbaar.
- Een verjaardag is alleen zichtbaar als iemand dat zelf aanzet.
- Het TV-scherm toont alleen voornamen, ruimtes en nieuws, en werkt met een geheime link die je in Beheer kunt vervangen.
- Advies: meld de app even bij de directie of IT en vertel collega's welke gegevens erin staan.

## Bestanden
```
index.html            de app
tv.html               het TV-scherm (1920×1080, schaalt mee)
css/app.css           huisstijl
js/config.js          ← hier vul je de Supabase-gegevens in
js/app.js             inloggen, menu, live meldingen
js/pages/*.js         de schermen (home, lunch, koffie, agenda, social, werknemer, profiel, beheer)
js/tv.js              logica van het TV-scherm
supabase/schema.sql   database, beveiliging en startgegevens
supabase/functions/nos/index.ts   NOS-nieuwsfeed
```

## Later uitbreiden
- Pushmeldingen op de telefoon (bijvoorbeeld voor koffie of "jij dekt de tafel")
- Koppeling met de Outlook-agenda voor de ruimtes
- Kantoorquiz en dartklassement
- LinkedIn en Instagram automatisch ophalen
