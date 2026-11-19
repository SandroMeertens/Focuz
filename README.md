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
De afvinklijst met minuten komt uit het vak met dezelfde naam in Focuz.

- **Handmatig:** "Kies Word-bestand" → kies je dagklapper (ook uit OneDrive).
- **Automatisch, zonder Microsoft-login:** open Focuz in Chrome of Edge op een computer waar OneDrive gesynchroniseerd is, tik op "Automatisch bijwerken" en kies je dagklapper in de OneDrive-map. Focuz kijkt elke minuut of het bestand is aangepast.
- **Automatisch via Microsoft-login (optioneel):** eenmalig een app-registratie bij Microsoft:
  1. Ga naar https://entra.microsoft.com → Applicaties → App-registraties → **Nieuwe registratie**.
  2. Naam: `Focuz`. Accounttypen: **Accounts in elke organisatiedirectory en persoonlijke Microsoft-accounts**.
  3. Omleidings-URI: platform **Toepassing met één pagina (SPA)**, adres `https://sandromeertens.github.io/Focuz/`.
  4. Klik **Registreren** en kopieer de **Application (client) ID**.
  5. Plak die in Focuz bij "Automatisch via OneDrive" (of bovenin `index.html` bij `FOCUZ_MS_CLIENT_ID`).
  Bij een schoolaccount kan het zijn dat de ICT-beheerder toestemming moet geven.
