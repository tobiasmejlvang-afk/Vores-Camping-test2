# Vores Camping v27

Personlig campingdagbog og rejseværksted til GitHub Pages. Appen publiceres direkte fra `main` → `/docs`.

## V27
- Nyt logo, ikoner, knapper og farvesystem fra den vedhæftede designpakke.
- Fuld venstrefane på Overblik; kompakt ikonrail på alle andre sider.
- OpenFreeMap + MapLibre med Liberty, Bright, Positron, Fiord, Satellit og Hybrid.
- Hybrid = satellitbillede med OpenFreeMap Liberty-veje, bynavne, POI-labels og grænser ovenpå.
- OpenRouteService opdateret efter den vedhæftede CLEAN-referencepakke.
- Bilferie og bil + campingvogn/HGV med køretøjsmål.
- Ferie Vagten redesignet med det nye vedhæftede illustrationssæt.

Ingen brugerlogin eller Supabase er nødvendigt i denne version.


## Kortmotor v27.1

Kortet bruger MapLibre GL JS som kortmotor, OpenFreeMap som primær vektorkorttjeneste,
OpenStreetMap som datagrundlag/valgfri Standard-visning og OpenRouteService til ruter og analyser.
Satellit og Hybrid er fortsat tilgængelige; satellitbillederne kommer fra en separat imagery-kilde.
