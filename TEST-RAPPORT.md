# Testrapport – Vores Camping v27

Dato: 11. august 2026

## Resultat
Den statiske releasekontrol er bestået. V27 er pakket med den nye kortmotor, OpenRouteService-opdatering, Ferie-Vagt-design, designpakke og minimeret sidefane.

## JavaScript og manifest
- `docs/app.js`: Node syntakskontrol **PASS**.
- `docs/maps.js`: Node syntakskontrol **PASS**.
- `docs/ors.js`: Node syntakskontrol **PASS**.
- `docs/manifest.webmanifest`: gyldig JSON **PASS**.
- Lokale `src`/`href`-referencer i `index.html`: **PASS**, ingen manglende filer.
- Literal asset-referencer fra `app.js`: **PASS**, ingen manglende v27-assets.
- CSS: balancerede klammer og ingen fejlindsatte `\\n`-sekvenser: **PASS**.

## Kort – MapLibre / OpenFreeMap
VM-enhedstest: **PASS**.

Kontrolleret:
- Liberty, Bright, Positron og Fiord fra OpenFreeMap er tilgængelige.
- `Satellit` er tilgængelig som ren imagery-visning.
- `Hybrid · Satellit + Liberty` er tilgængelig.
- Hybrid er baseret på OpenFreeMap Liberty og lægger satellitbilledet under Liberty-referenceinformation.
- Liberty-veje, grænser, POI-/stedlabels og bynavne bevares over satellitbilledet.
- Appens kortstilvælgere oprettes dynamisk fra `VCMaps.styles`, så Satellit og Hybrid vises både på det store kort og under Indstillinger → Kort.

## OpenRouteService
VM-enhedstest: **PASS**.

Kontrolleret:
- ORS-klient version 27.0.
- GeoJSON-ruter sender eksplicit GeoJSON Accept-header – rettelse til den tidligere HTTP 406-fejl.
- POI-kategorier deles automatisk i batches på højst 5 IDs.
- POI-batches samles og dubletter fjernes.
- `driving-car` til bilferie.
- `driving-hgv` til den forsigtige bil + campingvogn-profil.
- HGV-request indeholder `vehicle_type=goods` og køretøjsrestriktioner.
- Køretøjsfelter findes både på det store kort og i ruteeditoren: længde, bredde, højde, vægt; ruteeditor har også akseltryk.
- Cykel-, gang- og øvrige ORS-profiler er bevaret.
- Matrix, Snap, Isochroner, POI, elevation, GPX og optimization-reference er bevaret.
- Vedhæftet `Openrouteservice(8).zip` ligger som den eneste samlede ORS-referencepakke under `docs/resources/openrouteservice-reference-v27.zip` sammen med de app-relevante JSON-referencer.

## Ferie Vagten
Strukturel assetkontrol: **PASS**.

- 14 optimerede Ferie-Vagt-assets er integreret under `docs/assets/ferie-vagt-v27/`.
- Nyt stationsmotiv på Ferie-Vagtens kontrolside.
- Nye figurer til ready, travel, inspect, vacation, patrol og rest.
- Nyt Ferie-Vagt-kit med radio, kuffert, skilt og potepause-element.
- Ferie Album og sidebar bruger det nye illustrationssæt.

## Logo, ikoner og UI
Strukturel assetkontrol: **PASS**.

- Nyt hovedlogo integreret.
- 8 primære ikoner + 8 line-ikoner integreret fra den vedhæftede designpakke.
- Nye app-ikoner 192×192 og 512×512 er genereret fra det nye logo.
- Farvepaletten er opdateret til navy, skovgrøn, salvie, creme, coral, varm gul, skyblå og taupe.
- Knapper, navigation, chips, bokse og aktive tilstande er opdateret.

## Sidefane
Strukturel routingkontrol: **PASS**.

- `Overblik`: fuld sidefane.
- Alle øvrige app-ruter: kompakt 94 px ikonrail.
- Den kompakte rail indeholder logo/hjem, hurtighandlinger og Ferie-Vagt.
- På tablet/mindre skærme overtager den eksisterende bundnavigation som før.

## Ruter
- "Ny cykelrute" er generaliseret til **Ny rute**.
- Oversigten viser **Seneste ruter** og profilens eget ikon.
- Bil-, campingvogns- og cykelruter kan dermed ligge i samme rutesystem.

## Begrænsning i denne testkørsel
En fuld interaktiv Chromium-test kunne ikke køres i dette miljø, fordi lokal browsernavigation blev blokeret af miljøets administratorpolitik. Derfor påstås der ikke en browser-runtime-godkendelse her.

Efter upload til GitHub Pages bør den indbyggede **Kør komplet ORS-test** køres med den lokale ORS API-nøgle. Det er den afsluttende live-kontrol af Adresse, Rute, Reverse, Højde, POI og Matrix mod de eksterne tjenester.
