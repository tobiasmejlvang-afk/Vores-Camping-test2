# Vores Camping

En personlig, lokal-first campingapp til ferier, campingpladser, besøg, etapeudkast, oplevelser, noter, rejsehold og feriealbum.

## Start lokalt

Kræver Node.js 22.13 eller nyere.

```bash
npm install
npm run dev
```

Produktionskontrol:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Data og privatliv

- Appdata gemmes i browserens lokale lager.
- Billeder gemmes som blobs i IndexedDB.
- En komplet JSON-backup kan eksporteres og importeres.
- GPS gemmes ikke; positionen vises kun midlertidigt efter et aktivt valg.
- Vejr og kort kan hente data fra eksterne tjenester. Vejr er slået fra som standard i en tom app.
- Ekstern navigation åbnes kun efter et aktivt klik.
- Etapeudkast er direkte linjer mellem stop. De er ikke vejberegnede og kontrollerer ikke campingvognsmål eller kørestolsegnethed.
- Ingen API-hemmeligheder ligger i browserkoden eller i backupfiler.

## Centrale funktioner

- Aktiv feriekontekst med automatisk, spørg-først eller manuel tilknytning.
- Genoplevelse pr. ferie med billeder, steder, etaper, noter og oplevelser.
- Genbrugeligt bibliotek over campingpladser, personer og kæledyr.
- Besøgshistorik og vurderinger.
- MapLibre-kort med OpenFreeMap-stilarter.
- Open-Meteo-prognose med lokal cache og offline-fejltilstand.
- Installerbar PWA med kontrollerede opdateringer og offline-appskal.
- Testcenter for lokal lagring, medielager, kortgrafik, PWA og forbindelser.
