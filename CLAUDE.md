# Hand in Hand administratie (bonnetjes-app)

Website waarmee een begeleider (werkt met ~20 cliënten met een verstandelijke beperking)
voorgeschoten kosten vastlegt: cliënt kiezen → foto van bonnetje → bedrag → omschrijving →
opslaan. Aan het eind van de maand een PDF-declaratie maken.

De eigenaar heeft weinig programmeerervaring: **leg wijzigingen kort en in gewoon Nederlands
uit**, en praat altijd Nederlands.

## Techniek
- Gewone HTML/CSS/JS, **geen build-stap**, geen npm nodig. Scripts worden in volgorde geladen
  in `index.html` en delen één globale scope (geen imports).
- Opslag: **Supabase** (database + privé-bucket `bonnetjes` voor foto's), EU-regio.
  Is `js/config.js` leeg, dan draait de app in **demo-modus** (localStorage, foto's alleen in geheugen).
- PDF: jsPDF + jspdf-autotable. Bibliotheken staan in `vendor/` (geen CDN).
- Hosting: GitHub Pages (branch `main`, root).

## Bestanden
| Bestand | Inhoud |
|---|---|
| `index.html` | alle schermen: inloggen, tabbladen Nieuw / Zoeken / Cliënten / Uitdraaien, venster (modal) |
| `css/style.css` | opmaak; kleuren als variabelen bovenaan, ook dark mode. Huisstijl van handinhand-begeleiding.nl: turquoise `--primary`, koraal `--accent` (hoofdknoppen), Georgia voor koppen |
| `img/` | logo (inlogscherm), `mark.png` (rondje, bovenbalk/favicon), app-iconen 180/192/512 |
| `js/config.js` | Supabase URL + anon key, uitlogtijd (60 min) |
| `js/util.js` | bedragen (in centen!), datums, `esc()` tegen XSS, foto verkleinen, toast |
| `js/api.js` | `Api` object: Supabase-versie en demo-versie met dezelfde functies |
| `js/pdf.js` | `PDF.report()` (maand/periode, alle cliënten of één) en `PDF.single()` |
| `js/app.js` | state, rendering per tabblad, klantenkaart, formulieren, automatisch uitloggen (`Idle`) |
| `supabase/schema.sql` | tabellen `clients` en `receipts`, row level security, storage policies |
| `.github/workflows/wakker-houden.yml` | pingt Supabase 2× per week zodat het gratis project niet pauzeert |

## Afspraken
- Gebruikersinvoer altijd via `esc()` in HTML zetten.
- Geld rekenen in centen (`toCents`, `sumCents`, `fmtEUR`).
- Cliëntnamen als voorletter + achternaam (privacy/AVG).
- Nieuwe databasevelden: toevoegen in `schema.sql` (met `alter table ... add column if not exists`)
  én in `CLIENT_FIELDS` / `RECEIPT_FIELDS` in `js/api.js`.
- Zet nooit de Supabase service_role key in de code.
- Na een wijziging in `js/` of `css/`: verhoog het versienummer (`?v=2` → `?v=3`) achter
  alle eigen bestanden in `index.html`, anders laten browsers een oude kopie zien.

## Online
- Site: https://sjuulhofmans-stack.github.io/bonnetjes/ (GitHub Pages, repo `sjuulhofmans-stack/bonnetjes`)
- Supabase-project `bonnetjes` (EU, Parijs); nieuwe aanmeldingen staan uit, gebruikers aanmaken via
  Supabase → Authentication → Users (e-mail = `gebruikersnaam@bonnetjes.app`, Auto Confirm aan).

## Testen
Open met de VS Code-extensie **Live Server** ("Go Live" rechtsonder), of
`python3 -m http.server` en ga naar http://localhost:8000. Zonder config = demo-modus.
Check: bonnetje opslaan, zoeken, klantenkaart, PDF maken, browserconsole leeg.
