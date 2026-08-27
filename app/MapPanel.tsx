'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl';
import { isSafeServiceUrl } from './service-config';
import type { CampingSettings, CampingSite, ElevationSummary, Experience, RouteAvoidance, RouteProfile, RouteWaypoint, SavedRoute, ServiceConfig, VehicleDimensions } from './types';

const OPEN_STYLES: Partial<Record<CampingSettings['mapStyle'], string>> = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty', bright: 'https://tiles.openfreemap.org/styles/bright', positron: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark', fiord: 'https://tiles.openfreemap.org/styles/fiord',
};
const SATELLITE_STYLE: StyleSpecification = { version: 8, sources: { satellite: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar, Earthstar Geographics' } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }] };
const HYBRID_STYLE: StyleSpecification = { version: 8, sources: { satellite: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar, Earthstar Geographics' }, labels: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }, { id: 'labels', type: 'raster', source: 'labels' }] };
const PROFILE_LABELS: Record<RouteProfile, string> = { caravan: 'Bil + campingvogn', car: 'Bil', hgv: 'Stort køretøj', bike: 'Cykel', ebike: 'Elcykel', 'road-bike': 'Landevejscykel', mtb: 'Mountainbike', walk: 'Gang', hike: 'Vandring', wheelchair: 'Kørestol' };
const ORS_PROFILES: Record<RouteProfile, string> = { caravan: 'driving-hgv', car: 'driving-car', hgv: 'driving-hgv', bike: 'cycling-regular', ebike: 'cycling-electric', 'road-bike': 'cycling-road', mtb: 'cycling-mountain', walk: 'foot-walking', hike: 'foot-hiking', wheelchair: 'wheelchair' };
const STYLE_LABELS: Record<CampingSettings['mapStyle'], string> = { liberty: 'Liberty', bright: 'Bright', positron: 'Positron', dark: 'Dark', fiord: 'Fiord', satellite: 'Satellit', hybrid: 'Hybrid', custom: 'Brugerdefineret' };

type SearchPoint = RouteWaypoint & { subtitle?: string; kind?: 'search' | 'poi' };
type RouteResult = { geometry: [number, number][]; distanceKm?: number; durationMinutes?: number; elevation?: ElevationSummary; calculated: boolean };
type Props = { sites: CampingSite[]; experiences: Experience[]; routes: SavedRoute[]; mapStyle: CampingSettings['mapStyle']; serviceConfig: ServiceConfig; liveRoutingEnabled: boolean; externalSearchEnabled: boolean; onStyleChange: (style: CampingSettings['mapStyle']) => void; onSaveRoute: (route: Omit<SavedRoute, 'id' | 'createdAt' | 'tripId'>) => void };

function resolveStyle(style: CampingSettings['mapStyle'], config: ServiceConfig): string | StyleSpecification {
  if (style === 'satellite') return SATELLITE_STYLE;
  if (style === 'hybrid') return HYBRID_STYLE;
  if (style === 'custom' && config.customMapStyleUrl && isSafeServiceUrl(config.customMapStyleUrl)) return config.customMapStyleUrl.replace('{token}', encodeURIComponent(config.mapProviderToken));
  return OPEN_STYLES[style] ?? OPEN_STYLES.liberty!;
}

async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Tjenesten svarede med status ${response.status}.`);
    return await response.json() as unknown;
  } finally { window.clearTimeout(timeout); }
}

function elevationSummary(coordinates: number[][]): ElevationSummary | undefined {
  const elevations = coordinates.map((point) => point[2]).filter(Number.isFinite);
  if (elevations.length < 2) return undefined;
  let ascentM = 0; let descentM = 0;
  for (let index = 1; index < elevations.length; index += 1) { const change = elevations[index] - elevations[index - 1]; if (change > 0) ascentM += change; else descentM += Math.abs(change); }
  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM), minimumM: Math.round(Math.min(...elevations)), maximumM: Math.round(Math.max(...elevations)) };
}

export default function MapPanel({ sites, experiences, routes, mapStyle, serviceConfig, liveRoutingEnabled, externalSearchEnabled, onStyleChange, onSaveRoute }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null); const mapRef = useRef<MapLibreMap | null>(null);
  const siteMarkersRef = useRef<Marker[]>([]); const resultMarkersRef = useRef<Marker[]>([]); const userMarkerRef = useRef<Marker | null>(null);
  const [renderRevision, setRenderRevision] = useState(0); const [mapError, setMapError] = useState(false);
  const [showVisited, setShowVisited] = useState(true); const [showWishlist, setShowWishlist] = useState(true); const [showExperiences, setShowExperiences] = useState(true);
  const [startId, setStartId] = useState(sites[0]?.id ?? ''); const [endId, setEndId] = useState(sites[1]?.id ?? sites[0]?.id ?? ''); const [stopIds, setStopIds] = useState<string[]>([]); const [stopCandidate, setStopCandidate] = useState('');
  const [customPoints, setCustomPoints] = useState<SearchPoint[]>([]); const [profile, setProfile] = useState<RouteProfile>('caravan');
  const [avoidance, setAvoidance] = useState<RouteAvoidance>({ highways: false, tollways: false, ferries: false }); const [vehicle, setVehicle] = useState<VehicleDimensions>({ lengthM: 7.2, widthM: 2.4, heightM: 2.7, weightT: 3.5 });
  const [routeResult, setRouteResult] = useState<RouteResult | undefined>(); const [routeMessage, setRouteMessage] = useState('Vælg stop og beregn en rute. Uden en nøgle vises et lokalt linjeudkast.'); const [routing, setRouting] = useState(false); const [optimized, setOptimized] = useState(false);
  const [query, setQuery] = useState(''); const [externalResults, setExternalResults] = useState<SearchPoint[]>([]); const [searching, setSearching] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<SearchPoint | undefined>(); const [locationMessage, setLocationMessage] = useState(''); const [locationActive, setLocationActive] = useState(false);
  const [rangeMinutes, setRangeMinutes] = useState(30); const [rangeGeometry, setRangeGeometry] = useState<[number, number][][] | undefined>(); const [rangeMessage, setRangeMessage] = useState('');
  const [poiCategory, setPoiCategory] = useState('camping'); const [poiResults, setPoiResults] = useState<SearchPoint[]>([]); const [poiMessage, setPoiMessage] = useState('');

  const style = useMemo(() => resolveStyle(mapStyle, serviceConfig), [mapStyle, serviceConfig]);
  const sitePoints = useMemo<SearchPoint[]>(() => sites.map((site) => ({ id: site.id, label: site.name, subtitle: `${site.place}, ${site.country}`, coordinates: site.coordinates, siteId: site.id, source: 'site' })), [sites]);
  const allPoints = useMemo(() => [...sitePoints, ...customPoints], [customPoints, sitePoints]);
  const pointById = useMemo(() => new Map(allPoints.map((point) => [point.id, point])), [allPoints]);
  const start = pointById.get(startId); const end = pointById.get(endId); const stops = stopIds.map((id) => pointById.get(id)).filter((point): point is SearchPoint => Boolean(point));
  const plannerPoints = useMemo(() => [start, ...stops, end].filter((point): point is SearchPoint => Boolean(point)), [end, start, stops]);
  const straightGeometry = useMemo(() => plannerPoints.map((point) => point.coordinates), [plannerPoints]);
  const visibleSites = useMemo(() => sites.filter((site) => site.status === 'visited' ? showVisited : showWishlist), [showVisited, showWishlist, sites]);
  const localResults = useMemo(() => query.trim() ? sitePoints.filter((point) => `${point.label} ${point.subtitle}`.toLocaleLowerCase('da-DK').includes(query.trim().toLocaleLowerCase('da-DK'))).slice(0, 6) : [], [query, sitePoints]);

  useEffect(() => {
    if (!containerRef.current) return; let cancelled = false; let resizeObserver: ResizeObserver | undefined;
    void import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;
      const map = new maplibregl.Map({ container: containerRef.current, style, center: [9.4, 56.1], zoom: 6.2, attributionControl: false, maplibreLogo: true });
      mapRef.current = map; map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right'); map.addControl(new maplibregl.FullscreenControl(), 'top-right'); map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left'); map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      map.on('load', () => { setMapError(false); setRenderRevision((value) => value + 1); }); map.on('style.load', () => setRenderRevision((value) => value + 1)); map.on('error', () => setMapError(true)); map.on('idle', () => setMapError(false));
      map.on('click', (event) => setPickedPoint({ id: `map-${event.lngLat.lng.toFixed(5)}-${event.lngLat.lat.toFixed(5)}`, label: 'Valgt kortpunkt', subtitle: `${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`, coordinates: [event.lngLat.lng, event.lngLat.lat], source: 'map' }));
      resizeObserver = new ResizeObserver(() => map.resize()); resizeObserver.observe(containerRef.current);
    }).catch(() => setMapError(true));
    return () => { cancelled = true; resizeObserver?.disconnect(); siteMarkersRef.current.forEach((marker) => marker.remove()); resultMarkersRef.current.forEach((marker) => marker.remove()); userMarkerRef.current?.remove(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => { const map = mapRef.current; if (!map) return; try { map.setStyle(style); } catch { setMapError(true); } }, [style]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return; let cancelled = false;
    siteMarkersRef.current.forEach((marker) => marker.remove()); siteMarkersRef.current = [];
    void import('maplibre-gl').then(({ default: maplibregl }) => { if (cancelled || !mapRef.current) return;
      const markers: Marker[] = [];
      visibleSites.forEach((site) => { const node = document.createElement('button'); node.className = `camping-marker ${site.status}`; node.type = 'button'; node.title = site.name; node.setAttribute('aria-label', `${site.name}, ${site.place}`); node.textContent = site.status === 'visited' ? '✓' : '☆'; const popup = new maplibregl.Popup({ offset: 26 }).setHTML(`<strong>${site.name.replace(/[<>]/g, '')}</strong><br><small>${site.place.replace(/[<>]/g, '')} · ${site.status === 'visited' ? 'Besøgt' : 'Vil besøge'}</small>`); markers.push(new maplibregl.Marker({ element: node }).setLngLat(site.coordinates).setPopup(popup).addTo(map)); });
      if (showExperiences) experiences.filter((item) => item.coordinates).forEach((item) => { const node = document.createElement('button'); node.className = 'camping-marker experience'; node.type = 'button'; node.textContent = item.kind === 'attraction' ? '✦' : '●'; node.title = item.title; markers.push(new maplibregl.Marker({ element: node }).setLngLat(item.coordinates!).setPopup(new maplibregl.Popup({ offset: 24 }).setText(item.title)).addTo(map)); });
      siteMarkersRef.current = markers;
    });
    return () => { cancelled = true; };
  }, [experiences, renderRevision, showExperiences, visibleSites]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !map.isStyleLoaded()) return;
    const coordinates = routeResult?.geometry ?? (straightGeometry.length >= 2 ? straightGeometry : []);
    const data: FeatureCollection<LineString> = { type: 'FeatureCollection', features: coordinates.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [] };
    const source = map.getSource('camping-route') as GeoJSONSource | undefined;
    if (source) source.setData(data); else { map.addSource('camping-route', { type: 'geojson', data }); map.addLayer({ id: 'camping-route-shadow', type: 'line', source: 'camping-route', paint: { 'line-color': '#fff8e8', 'line-width': 8, 'line-opacity': .88 } }); map.addLayer({ id: 'camping-route', type: 'line', source: 'camping-route', paint: { 'line-color': routeResult?.calculated ? '#176c52' : '#c49a58', 'line-width': 4, 'line-dasharray': routeResult?.calculated ? [1, 0] : [1.3, .55] } }); }
  }, [renderRevision, routeResult, straightGeometry]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !map.isStyleLoaded()) return;
    const data: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: rangeGeometry ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rangeGeometry } }] : [] };
    const source = map.getSource('camping-range') as GeoJSONSource | undefined;
    if (source) source.setData(data); else { map.addSource('camping-range', { type: 'geojson', data }); map.addLayer({ id: 'camping-range-fill', type: 'fill', source: 'camping-range', paint: { 'fill-color': '#5aa585', 'fill-opacity': .2 } }); map.addLayer({ id: 'camping-range-line', type: 'line', source: 'camping-range', paint: { 'line-color': '#176c52', 'line-width': 2 } }); }
  }, [rangeGeometry, renderRevision]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return; let cancelled = false; resultMarkersRef.current.forEach((marker) => marker.remove()); resultMarkersRef.current = [];
    void import('maplibre-gl').then(({ default: maplibregl }) => { if (cancelled || !mapRef.current) return; resultMarkersRef.current = [...externalResults, ...poiResults].map((point) => { const node = document.createElement('button'); node.className = `camping-marker ${point.kind === 'poi' ? 'poi' : 'search'}`; node.type = 'button'; node.textContent = point.kind === 'poi' ? '◎' : '⌖'; node.title = point.label; return new maplibregl.Marker({ element: node }).setLngLat(point.coordinates).setPopup(new maplibregl.Popup({ offset: 24 }).setText(point.label)).addTo(map); }); });
    return () => { cancelled = true; };
  }, [externalResults, poiResults, renderRevision]);

  useEffect(() => { setRouteResult(undefined); setOptimized(false); }, [avoidance, endId, profile, startId, stopIds, vehicle]);

  function fitVisible() { const map = mapRef.current; if (!map) return; const coordinates = [...visibleSites.map((site) => site.coordinates), ...experiences.filter((item) => showExperiences && item.coordinates).map((item) => item.coordinates!)]; if (!coordinates.length) return; void import('maplibre-gl').then(({ default: maplibregl }) => { const bounds = new maplibregl.LngLatBounds(); coordinates.forEach((coordinate) => bounds.extend(coordinate)); map.fitBounds(bounds, { padding: 70, maxZoom: 12 }); }); }

  function addCustomPoint(point: SearchPoint, target: 'start' | 'end' | 'stop') { setCustomPoints((current) => current.some((item) => item.id === point.id) ? current : [...current, point]); if (target === 'start') setStartId(point.id); else if (target === 'end') setEndId(point.id); else setStopIds((current) => current.includes(point.id) ? current : [...current, point.id]); mapRef.current?.flyTo({ center: point.coordinates, zoom: 13 }); }

  function useMyLocation() {
    if (locationActive) { userMarkerRef.current?.remove(); userMarkerRef.current = null; setLocationActive(false); setLocationMessage('Din positionsmarkør er fjernet og blev ikke gemt.'); return; }
    if (!navigator.geolocation) { setLocationMessage('GPS understøttes ikke på denne enhed.'); return; }
    setLocationMessage('Finder din position…'); navigator.geolocation.getCurrentPosition(async ({ coords }) => { const maplibregl = (await import('maplibre-gl')).default; if (!mapRef.current) return; const node = document.createElement('div'); node.className = 'gps-marker'; const point: SearchPoint = { id: 'gps-current', label: 'Min aktuelle position', coordinates: [coords.longitude, coords.latitude], source: 'gps' }; setCustomPoints((current) => [...current.filter((item) => item.id !== point.id), point]); userMarkerRef.current?.remove(); userMarkerRef.current = new maplibregl.Marker({ element: node }).setLngLat(point.coordinates).addTo(mapRef.current); mapRef.current.flyTo({ center: point.coordinates, zoom: 13 }); setLocationActive(true); setLocationMessage('Positionen er klar som rutepunkt og gemmes kun, hvis du gemmer en rute.'); }, () => setLocationMessage('Positionen blev ikke delt. Du kan fortsat vælge et kortpunkt.'), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function searchExternal() {
    if (!query.trim()) return; if (!externalSearchEnabled) { setRouteMessage('Ekstern søgning er slået fra i Indstillinger.'); return; }
    if (!serviceConfig.openRouteServiceApiKey) { setRouteMessage('Tilføj en OpenRouteService-nøgle under Indstillinger for ekstern adressesøgning.'); return; }
    if (!isSafeServiceUrl(serviceConfig.geocodingEndpoint)) { setRouteMessage('Geocoding-endpointet er ugyldigt.'); return; }
    setSearching(true);
    try { const base = serviceConfig.geocodingEndpoint.replace(/\/$/, ''); const url = new URL(base.endsWith('/search') ? base : `${base}/search`); url.searchParams.set('api_key', serviceConfig.openRouteServiceApiKey); url.searchParams.set('text', query.trim()); url.searchParams.set('size', '8'); const json = await requestJson(url.toString()) as { features?: { geometry?: { coordinates?: number[] }; properties?: { label?: string; name?: string; locality?: string; country?: string } }[] }; const results = (json.features ?? []).flatMap((feature, index) => { const coordinates = feature.geometry?.coordinates; if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return []; return [{ id: `search-${Date.now()}-${index}`, label: feature.properties?.label ?? feature.properties?.name ?? 'Søgeresultat', subtitle: [feature.properties?.locality, feature.properties?.country].filter(Boolean).join(', '), coordinates: [coordinates[0], coordinates[1]] as [number, number], source: 'search' as const, kind: 'search' as const }]; }); setExternalResults(results); setRouteMessage(results.length ? `${results.length} eksterne resultater fundet.` : 'Ingen eksterne resultater fundet.'); }
    catch (error) { setRouteMessage(error instanceof Error ? `Søgning mislykkedes: ${error.message}` : 'Søgning mislykkedes.'); } finally { setSearching(false); }
  }

  async function calculateRoute() {
    if (plannerPoints.length < 2) { setRouteMessage('Vælg start og destination.'); return; }
    const fallback = { geometry: straightGeometry, calculated: false };
    if (!liveRoutingEnabled || !serviceConfig.openRouteServiceApiKey || !isSafeServiceUrl(serviceConfig.openRouteServiceEndpoint)) { setRouteResult(fallback); setRouteMessage(liveRoutingEnabled ? 'Lokalt linjeudkast vist. Tilføj en gyldig OpenRouteService-nøgle for rigtig vejføring.' : 'Live ruteberegning er slået fra. Lokalt linjeudkast vist.'); return; }
    setRouting(true);
    try {
      const avoid = [avoidance.highways && 'highways', avoidance.tollways && 'tollways', avoidance.ferries && 'ferries'].filter(Boolean);
      const restrictions = Object.fromEntries(Object.entries({ length: vehicle.lengthM, width: vehicle.widthM, height: vehicle.heightM, weight: vehicle.weightT, axleload: vehicle.axleLoadT }).filter(([, value]) => Number.isFinite(value)));
      const options: Record<string, unknown> = {}; if (avoid.length) options.avoid_features = avoid; if (['caravan','hgv'].includes(profile) && Object.keys(restrictions).length) options.profile_params = { restrictions };
      const body: Record<string, unknown> = { coordinates: plannerPoints.map((point) => point.coordinates), elevation: true, instructions: false }; if (Object.keys(options).length) body.options = options;
      const url = `${serviceConfig.openRouteServiceEndpoint.replace(/\/$/, '')}/v2/directions/${ORS_PROFILES[profile]}/geojson`;
      const json = await requestJson(url, { method: 'POST', headers: { authorization: serviceConfig.openRouteServiceApiKey, 'content-type': 'application/json' }, body: JSON.stringify(body) }) as { features?: { geometry?: { coordinates?: number[][] }; properties?: { summary?: { distance?: number; duration?: number } } }[] };
      const feature = json.features?.[0]; const coordinates = feature?.geometry?.coordinates; if (!coordinates || coordinates.length < 2) throw new Error('Rutens geometri mangler.'); const result: RouteResult = { geometry: coordinates.map((point) => [point[0], point[1]]), distanceKm: (feature.properties?.summary?.distance ?? 0) / 1000, durationMinutes: (feature.properties?.summary?.duration ?? 0) / 60, elevation: elevationSummary(coordinates), calculated: true }; setRouteResult(result); setRouteMessage(`Rute beregnet: ${result.distanceKm?.toFixed(1)} km · ${Math.round(result.durationMinutes ?? 0)} min.`);
    } catch (error) { setRouteResult(fallback); setRouteMessage(error instanceof Error ? `Ruteberegningen svarede ikke: ${error.message} Linjeudkastet er bevaret.` : 'Ruteberegningen svarede ikke. Linjeudkastet er bevaret.'); } finally { setRouting(false); }
  }

  async function optimizeStops() {
    if (!serviceConfig.vroomEndpoint || !isSafeServiceUrl(serviceConfig.vroomEndpoint)) { setRouteMessage('Tilføj et gyldigt VROOM-endpoint under Indstillinger for stopoptimering.'); return; } if (!start || !end || stops.length < 2) { setRouteMessage('Tilføj mindst to mellempunkter før optimering.'); return; }
    try { const jobs = stops.map((point, index) => ({ id: index + 1, location: point.coordinates })); const json = await requestJson(serviceConfig.vroomEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vehicles: [{ id: 1, profile: ORS_PROFILES[profile], start: start.coordinates, end: end.coordinates }], jobs }) }) as { routes?: { steps?: { type?: string; id?: number }[] }[] }; const order = (json.routes?.[0]?.steps ?? []).filter((step) => step.type === 'job' && step.id).map((step) => stops[(step.id ?? 1) - 1]?.id).filter(Boolean) as string[]; if (order.length !== stops.length) throw new Error('Optimeret rækkefølge mangler.'); setStopIds(order); setOptimized(true); setRouteMessage('VROOM har optimeret rækkefølgen af stoppene. Beregn ruten igen for ny geometri.'); } catch (error) { setRouteMessage(error instanceof Error ? `VROOM-fejl: ${error.message}` : 'VROOM kunne ikke optimere stoppene.'); }
  }

  async function calculateRange() {
    if (!start) { setRangeMessage('Vælg et udgangspunkt.'); return; } if (!serviceConfig.openRouteServiceApiKey || !isSafeServiceUrl(serviceConfig.openRouteServiceEndpoint)) { setRangeMessage('En OpenRouteService-nøgle er nødvendig for rækkeviddekort.'); return; }
    try { const url = `${serviceConfig.openRouteServiceEndpoint.replace(/\/$/, '')}/v2/isochrones/${ORS_PROFILES[profile]}`; const json = await requestJson(url, { method: 'POST', headers: { authorization: serviceConfig.openRouteServiceApiKey, 'content-type': 'application/json' }, body: JSON.stringify({ locations: [start.coordinates], range: [rangeMinutes * 60], range_type: 'time' }) }) as { features?: { geometry?: { coordinates?: [number, number][][] } }[] }; const coordinates = json.features?.[0]?.geometry?.coordinates; if (!coordinates) throw new Error('Rækkeviddepolygon mangler.'); setRangeGeometry(coordinates); setRangeMessage(`${rangeMinutes} minutters rækkevidde vises fra ${start.label}.`); } catch (error) { setRangeMessage(error instanceof Error ? `Rækkeviddekort mislykkedes: ${error.message}` : 'Rækkeviddekort mislykkedes.'); }
  }

  async function searchPoi() {
    const center = pickedPoint ?? start; if (!center) { setPoiMessage('Vælg et kortpunkt eller et rutestartpunkt.'); return; } if (!serviceConfig.openPoiEndpoint || !isSafeServiceUrl(serviceConfig.openPoiEndpoint)) { setPoiMessage('Tilføj et gyldigt OpenPOIService-endpoint under Indstillinger.'); return; }
    const groups: Record<string, number[]> = { camping: [100], restaurant: [200], shop: [500], fuel: [420], attraction: [600], nature: [300], recreation: [300] };
    try { const json = await requestJson(serviceConfig.openPoiEndpoint, { method: 'POST', headers: { ...(serviceConfig.openRouteServiceApiKey ? { authorization: serviceConfig.openRouteServiceApiKey } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ request: 'pois', geometry: { geojson: { type: 'Point', coordinates: center.coordinates }, buffer: 5000 }, filters: { category_group_ids: groups[poiCategory] }, limit: 50 }) }) as { features?: { geometry?: { coordinates?: number[] }; properties?: { osm_tags?: { name?: string }; category_name?: string } }[] }; const results = (json.features ?? []).flatMap((feature, index) => { const coordinates = feature.geometry?.coordinates; if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return []; return [{ id: `poi-${Date.now()}-${index}`, label: feature.properties?.osm_tags?.name ?? feature.properties?.category_name ?? 'Interessepunkt', coordinates: [coordinates[0], coordinates[1]] as [number, number], source: 'poi' as const, kind: 'poi' as const }]; }); setPoiResults(results); setPoiMessage(results.length ? `${results.length} interessepunkter vises inden for 5 km.` : 'Ingen interessepunkter fundet i området.'); } catch (error) { setPoiMessage(error instanceof Error ? `POI-søgning mislykkedes: ${error.message}` : 'POI-søgning mislykkedes.'); }
  }

  function moveStop(index: number, direction: -1 | 1) { setStopIds((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  function saveCurrentRoute() { if (!start || !end || plannerPoints.length < 2) { setRouteMessage('Vælg start og destination før ruten gemmes.'); return; } const result = routeResult ?? { geometry: straightGeometry, calculated: false }; onSaveRoute({ name: `${start.label} → ${end.label}`, ...(start.siteId ? { startSiteId: start.siteId } : {}), ...(end.siteId ? { endSiteId: end.siteId } : {}), profile, distanceKm: result.distanceKm, durationMinutes: result.durationMinutes, geometry: result.geometry, waypoints: plannerPoints.map(({ id, label, coordinates, siteId, source }) => ({ id, label, coordinates, siteId, source })), avoidance, vehicle, elevation: result.elevation, calculated: result.calculated, optimized }); setRouteMessage('Ruten er gemt med punkter, profil, indstillinger og eventuelle højdedata.'); }
  const travelMode = ['bike','ebike','road-bike','mtb'].includes(profile) ? 'bicycling' : ['walk','hike','wheelchair'].includes(profile) ? 'walking' : 'driving'; const googleRoute = start && end ? `https://www.google.com/maps/dir/?api=1&origin=${start.coordinates[1]},${start.coordinates[0]}&destination=${end.coordinates[1]},${end.coordinates[0]}&travelmode=${travelMode}` : '';

  return <section className="map-workspace">
    <div className="map-toolbar"><div><p className="eyebrow">Det store kort</p><h2>Steder, søgning, ruter og rækkevidde</h2></div><div className="style-switcher" aria-label="Kortstil">{(Object.keys(STYLE_LABELS) as CampingSettings['mapStyle'][]).map((value) => <button className={mapStyle === value ? 'active' : ''} onClick={() => onStyleChange(value)} type="button" key={value}>{STYLE_LABELS[value]}</button>)}</div><button className="soft-action" onClick={fitVisible} type="button">◎ Vis alle</button><button className="soft-action" onClick={useMyLocation} type="button">⌖ {locationActive ? 'Fjern position' : 'Min position'}</button></div>
    {(locationMessage || routeMessage) && <p className="inline-notice" role="status">{locationMessage || routeMessage}</p>}
    <div className="map-layout map-layout-advanced">
      <aside className="map-control-stack">
        <section className="map-tool-card"><span className="section-kicker">Søg</span><h3>Find sted eller adresse</h3><div className="map-search-row"><input value={query} onChange={(event) => { setQuery(event.target.value); setExternalResults([]); }} placeholder="Campingplads, by eller adresse" /><button type="button" onClick={() => void searchExternal()} disabled={searching}>{searching ? 'Søger…' : 'Søg eksternt'}</button></div>{[...localResults, ...externalResults].length > 0 && <div className="map-result-list">{[...localResults, ...externalResults].map((point) => <article key={point.id}><div><strong>{point.label}</strong><small>{point.subtitle ?? 'Kortresultat'}</small></div><button type="button" onClick={() => mapRef.current?.flyTo({ center: point.coordinates, zoom: 13 })}>Vis</button><button type="button" onClick={() => addCustomPoint(point, 'end')}>Destination</button><button type="button" onClick={() => addCustomPoint(point, 'stop')}>Stop</button></article>)}</div>}</section>
        <section className="map-tool-card"><span className="section-kicker">Kortlag</span><h3>Vis eller skjul</h3><label className="mini-toggle"><input type="checkbox" checked={showVisited} onChange={(event) => setShowVisited(event.target.checked)} />Besøgte campingpladser</label><label className="mini-toggle"><input type="checkbox" checked={showWishlist} onChange={(event) => setShowWishlist(event.target.checked)} />Ønskesteder</label><label className="mini-toggle"><input type="checkbox" checked={showExperiences} onChange={(event) => setShowExperiences(event.target.checked)} />Oplevelser & seværdigheder</label><small>{routes.length} gemte ruter · {experiences.filter((item) => item.coordinates).length} kortlagte oplevelser</small></section>
        <section className="map-tool-card route-builder advanced-route-builder"><span className="section-kicker">Ruteplanlægning</span><h3>Byg hele etapen</h3><label>Start<select value={startId} onChange={(event) => setStartId(event.target.value)}>{allPoints.map((point) => <option value={point.id} key={point.id}>{point.label}</option>)}</select></label>{stops.map((point, index) => <div className="waypoint-row" key={point.id}><span>{index + 1}</span><strong>{point.label}</strong><button type="button" onClick={() => moveStop(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => moveStop(index, 1)} disabled={index === stops.length - 1}>↓</button><button type="button" onClick={() => setStopIds((current) => current.filter((id) => id !== point.id))}>×</button></div>)}<div className="add-stop-row"><select value={stopCandidate} onChange={(event) => setStopCandidate(event.target.value)}><option value="">Vælg mellemstop</option>{allPoints.filter((point) => point.id !== startId && point.id !== endId && !stopIds.includes(point.id)).map((point) => <option value={point.id} key={point.id}>{point.label}</option>)}</select><button type="button" disabled={!stopCandidate} onClick={() => { setStopIds((current) => [...current, stopCandidate]); setStopCandidate(''); }}>＋</button></div><label>Destination<select value={endId} onChange={(event) => setEndId(event.target.value)}>{allPoints.map((point) => <option value={point.id} key={point.id}>{point.label}</option>)}</select></label><label>Profil<select value={profile} onChange={(event) => setProfile(event.target.value as RouteProfile)}>{(Object.keys(PROFILE_LABELS) as RouteProfile[]).map((value) => <option value={value} key={value}>{PROFILE_LABELS[value]}</option>)}</select></label>
          <details><summary>Undgåelser & køretøj</summary><div className="route-options"><label><input type="checkbox" checked={avoidance.highways} onChange={(event) => setAvoidance((value) => ({ ...value, highways: event.target.checked }))} />Motorveje</label><label><input type="checkbox" checked={avoidance.tollways} onChange={(event) => setAvoidance((value) => ({ ...value, tollways: event.target.checked }))} />Betalingsveje</label><label><input type="checkbox" checked={avoidance.ferries} onChange={(event) => setAvoidance((value) => ({ ...value, ferries: event.target.checked }))} />Færger</label><div className="vehicle-grid"><label>Længde m<input type="number" min="0" step="0.1" value={vehicle.lengthM ?? ''} onChange={(event) => setVehicle((value) => ({ ...value, lengthM: Number(event.target.value) || undefined }))} /></label><label>Bredde m<input type="number" min="0" step="0.1" value={vehicle.widthM ?? ''} onChange={(event) => setVehicle((value) => ({ ...value, widthM: Number(event.target.value) || undefined }))} /></label><label>Højde m<input type="number" min="0" step="0.1" value={vehicle.heightM ?? ''} onChange={(event) => setVehicle((value) => ({ ...value, heightM: Number(event.target.value) || undefined }))} /></label><label>Vægt t<input type="number" min="0" step="0.1" value={vehicle.weightT ?? ''} onChange={(event) => setVehicle((value) => ({ ...value, weightT: Number(event.target.value) || undefined }))} /></label></div></div></details>
          <div className="route-summary"><span>{routeResult?.calculated ? 'OpenRouteService-rute' : 'Lokalt etapeudkast'}</span><strong>{PROFILE_LABELS[profile]}</strong><small>{routeResult?.distanceKm ? `${routeResult.distanceKm.toFixed(1)} km · ${Math.round(routeResult.durationMinutes ?? 0)} min.` : `${plannerPoints.length} rutepunkter`}</small>{routeResult?.elevation && <small>↗ {routeResult.elevation.ascentM} m · ↘ {routeResult.elevation.descentM} m · {routeResult.elevation.minimumM}–{routeResult.elevation.maximumM} m</small>}</div><div className="route-command-row"><button className="route-save" type="button" onClick={() => void calculateRoute()} disabled={routing || plannerPoints.length < 2}>{routing ? 'Beregner…' : 'Beregn rute'}</button><button type="button" onClick={() => void optimizeStops()} disabled={stops.length < 2}>Optimér stop</button><button type="button" onClick={saveCurrentRoute} disabled={plannerPoints.length < 2}>Gem rute</button></div>{googleRoute && <a className="primary-link" href={googleRoute} target="_blank" rel="noreferrer">Åbn ekstern navigation ↗</a>}</section>
        <section className="map-tool-card"><span className="section-kicker">Rækkevidde</span><h3>Hvor langt kan du nå?</h3><div className="range-row"><select value={rangeMinutes} onChange={(event) => setRangeMinutes(Number(event.target.value))}>{[10,15,30,45,60,90,120].map((minutes) => <option value={minutes} key={minutes}>{minutes} minutter</option>)}</select><button type="button" onClick={() => void calculateRange()}>Vis område</button><button type="button" onClick={() => { setRangeGeometry(undefined); setRangeMessage(''); }}>Ryd</button></div>{rangeMessage && <small>{rangeMessage}</small>}</section>
        <section className="map-tool-card"><span className="section-kicker">Området omkring</span><h3>Find praktiske steder</h3><div className="range-row"><select value={poiCategory} onChange={(event) => setPoiCategory(event.target.value)}><option value="camping">Camping</option><option value="restaurant">Restauranter</option><option value="shop">Butikker</option><option value="fuel">Tankstationer</option><option value="attraction">Seværdigheder</option><option value="nature">Natur</option><option value="recreation">Rekreative områder</option></select><button type="button" onClick={() => void searchPoi()}>Søg 5 km</button></div>{pickedPoint && <small>Centrum: {pickedPoint.label}</small>}{poiMessage && <small>{poiMessage}</small>}{poiResults.slice(0, 6).map((point) => <button className="poi-result" type="button" onClick={() => addCustomPoint(point, 'stop')} key={point.id}>＋ {point.label}</button>)}</section>
      </aside>
      <div className="map-surface-wrap"><div className="map-surface" ref={containerRef} />{mapError && <div className="map-error" role="status"><strong>Kortbaggrunden svarer ikke</strong><span>Dine lokale steder og ruter er stadig gemt. Prøv igen, når forbindelsen er tilbage.</span></div>}{pickedPoint && <div className="picked-point"><strong>⌖ {pickedPoint.label}</strong><small>{pickedPoint.subtitle}</small><button type="button" onClick={() => addCustomPoint(pickedPoint, 'start')}>Brug som start</button><button type="button" onClick={() => addCustomPoint(pickedPoint, 'end')}>Brug som destination</button><button type="button" onClick={() => addCustomPoint(pickedPoint, 'stop')}>Tilføj stop</button></div>}<div className="map-legend"><span><i className="legend-visited" />Besøgt</span><span><i className="legend-wishlist" />Vil besøge</span><span><i className="legend-experience" />Oplevelse</span><span><i className="legend-poi" />POI</span></div></div>
    </div>
  </section>;
}
