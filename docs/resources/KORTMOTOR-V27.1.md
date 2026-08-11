# Kortmotor – Vores Camping v27.1

## Arkitektur

- **MapLibre GL JS 5.24.0**: selve browserens kortmotor/rendering.
- **OpenFreeMap**: primære vektorfliser og kortstile.
- **OpenStreetMap**: kortdata bag OpenFreeMap samt et direkte, valgfrit Standard-kort.
- **OpenRouteService (ORS)**: Directions, Matrix, Isochrones, Snap, POI, elevation m.m.
- **Esri World Imagery**: bruges kun som billedkilde til Satellit og Hybrid.

## Kortstile

1. Liberty · OpenFreeMap / OSM
2. Bright · OpenFreeMap / OSM
3. Positron · OpenFreeMap / OSM
4. Fiord · OpenFreeMap / OSM
5. OpenStreetMap · Standard
6. Satellit
7. Hybrid · Satellit + OpenFreeMap / OSM

## Hybrid

Hybrid starter med OpenFreeMap Liberty og lægger satellitbilledet under Liberty-lagene.
Land-/vandflader gøres næsten gennemsigtige, mens veje, grænser, POI'er og labels bevares.
Derefter tegnes Vores Campings egne campingmarkører og ORS-ruter ovenpå.

## OpenStreetMap Standard

Den direkte OSM-standardflise er kun en ekstra visning. Appen laver ikke offline-cache,
bulk-download eller forudindlæsning af OpenStreetMap-fliser.

## Routing

OpenRouteService ændrer ikke baggrundskortet. ORS leverer GeoJSON/analysedata, som
MapLibre tegner oven på den valgte kortstil.
