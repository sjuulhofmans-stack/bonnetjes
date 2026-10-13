# Bonnetjes

Een kleine website om **voorgeschoten kosten voor cliënten** bij te houden. Je maakt een
foto van het bonnetje, kiest de cliënt, vult het bedrag in en klaar. Aan het eind van de
maand maak je met één klik een nette PDF voor de declaratie.

## Wat kan het?

| Tabblad        | Wat doe je daar? |
|----------------|------------------|
| **Nieuw**      | Cliënt aantikken → foto maken of uit fotorol kiezen → bedrag → omschrijving → *Opslaan*. Bovenaan zie je wat je deze en vorige maand hebt voorgeschoten. |
| **Zoeken**     | Zoek op omschrijving, cliënt, bedrag (bv. `4,50`) of datum. Filter op cliënt en periode. Van de resultaten kun je ook een PDF maken. |
| **Cliënten**   | Alle cliënten als kaartjes. Tik op een cliënt voor de **klantenkaart**: gegevens, bewindvoerder, totalen en alle bonnetjes. Toevoegen, wijzigen, archiveren en verwijderen. |
| **Uitdraaien** | Kies een maand of een eigen periode (handig als een bewindvoerder met terugwerkende kracht iets vraagt). Maak een PDF van alles, per cliënt of per bonnetje. |

De PDF bevat:
- het bedrag dat je terugkrijgt, groot bovenaan
- statistieken: aantal bonnetjes, aantal cliënten, gemiddeld bedrag en hoogste bedrag
- een staafgrafiek per cliënt (of per maand)
- een tabel met alle bonnetjes, plus ruimte voor handtekeningen
- als bijlage, als je dat wilt, de foto van elk bonnetje (genummerd, zodat de administratie ze makkelijk terugvindt)

**Beveiliging**
- Je kunt alleen inloggen met een gebruikersnaam en wachtwoord. Nieuwe accounts kan alleen de beheerder aanmaken.
- Na **60 minuten** zonder activiteit word je automatisch uitgelogd. Vijf minuten van tevoren krijg je een waarschuwing.
- Foto's staan in een **privé**-opslag. Ze zijn alleen te zien met tijdelijke links die na een uur verlopen.
- De database controleert zelf dat je alleen je eigen gegevens kunt zien en wijzigen.

---

## Eenmalig instellen (± 20 minuten)

### Stap 1: Supabase (database + opslag van de foto's)

1. Ga naar **https://supabase.com** → *Start your project*. Log in met je GitHub-account.
2. Klik op **New project**:
   - Name: `bonnetjes`
   - Database password: verzin een sterk wachtwoord en **bewaar het** (bijvoorbeeld in je wachtwoordmanager)
   - Region: **Central EU (Frankfurt)**, zodat de gegevens in Europa blijven
   - Plan: **Free**
3. Wacht ongeveer een minuut tot het project klaar is.
4. Ga links naar **SQL Editor** → *New query*. Plak de hele inhoud van
   [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**. Je moet *Success* zien.
5. Ga naar **Authentication** → *Sign In / Providers* (of *Settings*) en zet
   **"Allow new users to sign up" UIT**. Zo kan niemand anders zelf een account maken.
6. Ga naar **Authentication → Users → Add user → Create new user**:
   - Email: een echt e-mailadres, **of** een verzonnen adres zoals `marieke@bonnetjes.app`.
     Bij de verzonnen variant logt ze in met alleen de gebruikersnaam `marieke`.
   - Password: het wachtwoord voor je vrouw
   - Vink **Auto Confirm User** aan
7. Ga naar **Project Settings → API / Data API** en kopieer:
   - de **Project URL** (begint met `https://` en eindigt op `.supabase.co`)
   - de **anon / publishable key** (een lange code)

   ⚠️ Gebruik **niet** de *service_role* / *secret* key. Die moet geheim blijven.

### Stap 2: Gegevens invullen

Open [`js/config.js`](js/config.js) en vul de twee waarden in:

```js
SUPABASE_URL: 'https://abcdefgh.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

Op GitHub kan dit direct in de browser: open het bestand, klik op het potloodje, plak de
waarden en klik op *Commit changes*.

> Zolang dit leeg is, draait de site in **demo-modus**: je kunt dan alles uitproberen,
> maar de gegevens blijven alleen in je eigen browser.

### Stap 3: Online zetten met GitHub Pages (gratis)

1. In deze repository: **Settings → Pages**.
2. Bij *Build and deployment* kies je **Source: Deploy from a branch**, daarna
   **Branch: `main`** en **`/ (root)`**, en dan **Save**.
3. Na 1 à 2 minuten staat de site op `https://<jouw-gebruikersnaam>.github.io/bonnetjes/`.

> Bij een gratis GitHub-account moet de repository daarvoor **openbaar** zijn. Dat is
> veilig: in de code staan geen wachtwoorden of cliëntgegevens. Die staan alleen in
> Supabase, achter de inlog.

### Stap 4: Op de telefoon zetten

Open de link op de telefoon en kies:
- **iPhone (Safari):** deelknop → *Zet op beginscherm*
- **Android (Chrome):** menu ⋮ → *Toevoegen aan startscherm*

Dan staat er een app-icoontje "Bonnetjes" op het beginscherm.

---

## Goed om te weten

- **Wachtwoord vergeten?** In Supabase: *Authentication → Users* → klik op de gebruiker →
  stel een nieuw wachtwoord in (of verstuur een reset-mail als het een echt e-mailadres is).
- **Database in slaap:** gratis Supabase-projecten worden na een week zonder gebruik gepauzeerd.
  De taak in `.github/workflows/wakker-houden.yml` voorkomt dat automatisch. Ziet de site er
  toch "dood" uit, log dan in op supabase.com en klik op *Restore project*. Er gaat niets verloren.
- **Opslag:** foto's worden automatisch verkleind (± 300 KB). De gratis 1 GB is dus genoeg
  voor ruim 3.000 bonnetjes.
- **Reservekopie:** het gratis plan maakt geen automatische back-ups. Doe af en toe
  *Table Editor → receipts → Export → CSV*. De PDF's die je elke maand maakt, zijn
  natuurlijk ook een goede reservekopie.
- **Privacy (AVG):** het gaat om gegevens van kwetsbare mensen. Gebruik daarom alleen
  voorletter + achternaam (of een cliëntnummer), en overleg met de werkgever of dit
  zo mag.
- **Cliënt verwijderen** kan alleen als die geen bonnetjes meer heeft. Kies anders
  *Archiveren*: de cliënt verdwijnt dan uit de keuzelijst, maar de bonnetjes blijven
  bewaard voor uitdraaien.

## Voor wie later iets wil aanpassen

Gewone HTML, CSS en JavaScript, zonder build-stap. Wat je wijzigt, is direct live na het pushen.

```
index.html            de pagina (tabbladen, formulieren)
css/style.css         opmaak (kleuren staan bovenaan)
js/config.js          Supabase-gegevens en uitlog-tijd
js/util.js            hulpfuncties: bedragen, datums, foto verkleinen
js/api.js             opslaan/ophalen: Supabase (live) of demo (lokaal)
js/pdf.js             de PDF-uitdraaien
js/app.js             alle schermen en knoppen
supabase/schema.sql   tabellen + beveiliging + foto-opslag
vendor/               meegeleverde bibliotheken (supabase-js, jsPDF, autotable)
```

Lokaal testen: `python3 -m http.server` in deze map, en dan naar http://localhost:8000.
