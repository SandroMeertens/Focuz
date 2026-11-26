# Focuz

Klastimer voor zelfstandig werken. De leerkracht stelt per vak een afvinklijst met minuten in. Op elke iPad verschijnt de timer met de taken.

**App:** https://sandromeertens.github.io/Focuz/

- Leerkracht: open de app en kies "Ik ben leerkracht".
- Leerlingen: scan de QR-code of typ de klascode in.
- Tip: zet de app via Delen → "Zet op beginscherm" als icoon op de iPad.

## Eigen server (optioneel)
Plak je Firebase-config bovenin `index.html` (zoek naar `window.KLASTIMER_FIREBASE`) en zet de regels uit `database.rules.json` in de Realtime Database.

## Koppeling met Word (dagklapper)
Focuz leest de dagtabellen uit je dagklapper (kolommen Tijd, Vak, Leerstof, Lesdoel, met een kop als "Donderdag 19 november").
Per blok worden de tijd, het vak, de leerstof (titel) en het lesdoel (ik-doel) overgenomen. "klaar: ..." in de leerstof wordt een klaaropdracht.
Taken met minuten zet je in de leerstof, gescheiden door een puntkomma: `Instructie (10 min); Werkboek opdr. 1-4 (20 min); klaar: plusblad`. Staan er geen taken in Word, dan gebruikt Focuz de afvinklijst van het vak met dezelfde naam.

- **Ochtendscherm:** zet bovenaan een dag een rij met als vak `Ochtend` (bijv. `8.15 | Ochtend | Jas ophangen; Huiswerk op tafel | Fijne vrijdag!`). De leerstof wordt de ochtendtaken, het lesdoel de welkomstzin. Focuz vult aan met huiswerk, gymspullen en leesboek als die bij de dag horen, en toont de vakken van vandaag.
- **Handmatig:** "Kies Word-bestand" → kies je dagklapper (ook uit OneDrive).
- **Automatisch, zonder Microsoft-login:** open Focuz in Chrome of Edge op een computer waar OneDrive gesynchroniseerd is, tik op "Automatisch bijwerken" en kies je dagklapper in de OneDrive-map. Focuz kijkt elke minuut of het bestand is aangepast.
- **Automatisch via Microsoft-login (optioneel):** eenmalig een app-registratie bij Microsoft:
  1. Ga naar https://entra.microsoft.com → Applicaties → App-registraties → **Nieuwe registratie**.
  2. Naam: `Focuz`. Accounttypen: **Accounts in elke organisatiedirectory en persoonlijke Microsoft-accounts**.
  3. Omleidings-URI: platform **Toepassing met één pagina (SPA)**, adres `https://sandromeertens.github.io/Focuz/`.
  4. Klik **Registreren** en kopieer de **Application (client) ID**.
  5. Plak die in Focuz bij "Automatisch via OneDrive" (of bovenin `index.html` bij `FOCUZ_MS_CLIENT_ID`).
  Bij een schoolaccount kan het zijn dat de ICT-beheerder toestemming moet geven.

## Proefdag (stappenplan)
1. **Voor schooltijd:** open Focuz op je laptop of het digibord (Chrome of Edge), koppel je dagklapper via Rooster → Automatisch bijwerken.
2. **Drie iPads:** scan de QR-code bij Klas, zet Focuz op het beginscherm (Delen → Zet op beginscherm). Controleer dat bovenin "3 iPads" staat.
3. **Ochtend:** de iPads tonen het ochtendscherm. Om het eerste blok moet de timer vanzelf starten.
4. **Tijdens de les:** vink op één iPad een taak af en kijk of de voortgang bij jou verschijnt. Stuur één keer een melding.
5. **Wifi-test:** zet op één iPad even de vliegtuigmodus aan. De timer moet doorlopen; na het uitzetten verbindt hij weer.
6. **Na de proefdag:** werkt alles, dan kan de hele klas meedoen. Zie je "Geen verbinding met de server", dan blokkeert het schoolnetwerk de verbinding: vraag de ICT-beheerder om poort 8084 (broker.emqx.io) open te zetten, of koppel een eigen Firebase-server.

## Opbouw en tests
- `index.html` – de pagina, `style.css` – opmaak, `app.js` – alle logica, `sw.js` – offline starten, `manifest.webmanifest` + `icons/` – app-icoon.
- `tests/` – automatische tests (Playwright) met een lokale MQTT-server en twee voorbeeld-dagklappers zonder echte gegevens. Ze draaien bij elke wijziging via GitHub Actions (tabblad **Actions**).
- Lokaal draaien: `cd tests && npm install && npx playwright install chromium && npx playwright test`

## Beveiliging
- **Openbare server:** alle berichten zijn versleuteld met de klascode (AES-GCM, sleutel via PBKDF2). Wie op de server meeluistert ziet alleen onleesbare tekst en een hash als onderwerp, geen klascodes, roosters of lesdoelen. Wie de klascode kent (dus ook leerlingen) kan in theorie nog wel berichten sturen.
- **Eigen Firebase-server:** alleen de ingelogde leerkracht kan de timer besturen (zie `database.rules.json`). Aanbevolen voor dagelijks gebruik.

## Huiswerk en toetsen
Zet in je dagklapper een tabel met de kolommen **Vak**, **Wat ga je doen** en **Voor wanneer**. In "Voor wanneer" mag een datum staan (ook een Word-datumveld, `25 nov 2026` of `25-11`), `Elke vrijdag` of `Elke week`. Leerlingen zien de lijst op hun iPad (knop *Huiswerk en toetsen*) en vinken af; jij ziet per item hoeveel iPads klaar zijn. Via Rooster → *Huiswerk en toetsen* → *Planning voor thuis* kopieer je een link (`?thuis=KLASCODE`) voor ouders: die toont alleen deze lijst.

## Voor collega's
- **Startgids** bij de eerste keer, **Probeerstand** (`?probeer=1`, eigen opslag, voorbeeldrooster), **Handleiding** (`handleiding.html`) en een **sjabloon** (`sjabloon/Focuz-dagklapper-sjabloon.docx`).
- **Rooster in Focuz** voor wie geen dagklapper heeft; **Vaste taken per vak** vullen de lessen.
- **Groep** en **grote letters** bij Klas en iPads; **?**-uitleg bij instellingen.
- **Vraag of probleem doorgeven** opent een e-mail; stel het adres in met `window.FOCUZ_FEEDBACK_EMAIL` in `index.html`.
