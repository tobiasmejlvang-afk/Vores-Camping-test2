# OpenRouteService – Vores Camping v27

V27 er opdateret efter den vedhæftede **Openrouteservice(8).zip / CLEAN v26.2**.

## Kernefunktioner
- Bilferie: `driving-car`
- Bil + campingvogn / stort køretøj: `driving-hgv` med køretøjsmål
- Cykel, elcykel, landevej og MTB
- Gang, vandring og kørestol
- Geocoding / autocomplete / reverse
- Matrix med batching
- Isochroner
- Snap
- POI med batching på højst 5 `category_ids` pr. request
- Elevation
- GPX
- Optimization som bonus

## API
Alle kald går via `api.heigit.org`. API-nøglen gemmes kun lokalt i browseren.

## POI
Større POI-presets deles automatisk i batches på maks. fem category IDs, resultater samles, deduplikeres og sorteres efter afstand.
