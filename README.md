# Focuz

Klastimer voor zelfstandig werken. De leerkracht stelt per vak een afvinklijst met minuten in. Op elke iPad verschijnt de timer met de taken.

**App:** https://sandromeertens.github.io/focuz/

- Leerkracht: open de app en kies "Ik ben leerkracht".
- Leerlingen: scan de QR-code of typ de klascode in.
- Tip: zet de app via Delen → "Zet op beginscherm" als icoon op de iPad.

## Eigen server (optioneel)
Plak je Firebase-config bovenin `index.html` (zoek naar `window.KLASTIMER_FIREBASE`) en zet de regels uit `database.rules.json` in de Realtime Database.
