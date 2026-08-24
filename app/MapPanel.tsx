'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { CampingSite, CampingSettings, RouteProfile, SavedRoute } from './types';

const MAP_STYLES: Record<CampingSettings['mapStyle'], string> = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
};

type Props = {
  sites: CampingSite[];
  mapStyle: CampingSettings['mapStyle'];
  onStyleChange: (style: CampingSettings['mapStyle']) => void;
  onSaveRoute: (route: Omit<SavedRoute, 'id' | 'createdAt' | 'tripId'>) => void;
};

const PROFILE_LABELS: Record<RouteProfile, string> = { caravan: 'Campingvogn', car: 'Bil', bike: 'Cykel', walk: 'Gang', wheelchair: 'Kørestol' };

export default function MapPanel({ sites, mapStyle, onStyleChange, onSaveRoute }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const [mapError, setMapError] = useState(false);
  const [startId, setStartId] = useState(sites[0]?.id ?? '');
  const [endId, setEndId] = useState(sites[1]?.id ?? sites[0]?.id ?? '');
  const [profile, setProfile] = useState<RouteProfile>('caravan');
  const [locationMessage, setLocationMessage] = useState('');
  const [locationActive, setLocationActive] = useState(false);

  const start = useMemo(() => sites.find((site) => site.id === startId), [sites, startId]);
  const end = useMemo(() => sites.find((site) => site.id === endId), [sites, endId]);
  const routeGeometry = useMemo(() => start && end ? [start.coordinates, end.coordinates] as [number, number][] : null, [end, start]);
  const routeMetrics: { distanceKm?: number; durationMinutes?: number } = {};
  const routeReady = Boolean(start && end && start.id !== end.id);
  const routeStatus = 'Lokalt etapeudkast · ingen koordinater sendes automatisk';

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    async function createMap() {
      try {
        const maplibreModule = await import('maplibre-gl');
        if (cancelled || !containerRef.current) return;
        const maplibregl = maplibreModule.default;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: MAP_STYLES[mapStyle],
          center: [9.4, 56.1],
          zoom: 6.25,
          attributionControl: false,
          maplibreLogo: true,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(new maplibregl.FullscreenControl(), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        map.on('error', () => setMapError(true));
        map.on('idle', () => setMapError(false));
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current);
        map.on('load', () => {
          setMapError(false);
          markersRef.current = sites.map((site) => {
            const markerNode = document.createElement('button');
            markerNode.className = `camping-marker ${site.status}`;
            markerNode.type = 'button';
            markerNode.title = site.name;
            markerNode.setAttribute('aria-label', `${site.name}, ${site.place}`);
            const markerSymbol = document.createElement('span');
            markerSymbol.setAttribute('aria-hidden', 'true');
            markerSymbol.textContent = site.status === 'visited' ? '✓' : '☆';
            markerNode.appendChild(markerSymbol);
            const popupContent = document.createElement('div');
            const popupTitle = document.createElement('strong');
            const popupMeta = document.createElement('small');
            popupTitle.textContent = site.name;
            popupMeta.textContent = `${site.place} · ${site.status === 'visited' ? 'Besøgt' : 'Vil besøge'}`;
            popupContent.appendChild(popupTitle);
            popupContent.appendChild(popupMeta);
            const popup = new maplibregl.Popup({ offset: 26 }).setDOMContent(popupContent);
            return new maplibregl.Marker({ element: markerNode }).setLngLat(site.coordinates).setPopup(popup).addTo(map);
          });
          if (sites.length) {
            const bounds = new maplibregl.LngLatBounds();
            sites.forEach((site) => bounds.extend(site.coordinates));
            map.fitBounds(bounds, { padding: 70, maxZoom: 10, duration: 0 });
          }
          if (start && end && start.id !== end.id) {
            map.addSource('camping-route', {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeGeometry ?? [start.coordinates, end.coordinates] } },
            });
            map.addLayer({ id: 'camping-route-shadow', type: 'line', source: 'camping-route', paint: { 'line-color': '#fff8e8', 'line-width': 8, 'line-opacity': .88 } });
            map.addLayer({ id: 'camping-route', type: 'line', source: 'camping-route', paint: { 'line-color': '#c49a58', 'line-width': 4, 'line-dasharray': [1.3, .55] } });
          }
        });
      } catch {
        setMapError(true);
      }
    }

    void createMap();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [sites, mapStyle, start, end, routeGeometry]);

  function useMyLocation() {
    if (locationActive) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      setLocationActive(false);
      setLocationMessage('Din positionsmarkør er fjernet og blev ikke gemt.');
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage('GPS understøttes ikke på denne enhed.');
      return;
    }
    setLocationMessage('Finder din position…');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const maplibregl = (await import('maplibre-gl')).default;
        if (!mapRef.current) return;
        const markerNode = document.createElement('div');
        markerNode.className = 'gps-marker';
        markerNode.setAttribute('aria-label', 'Din aktuelle position');
        userMarkerRef.current = new maplibregl.Marker({ element: markerNode }).setLngLat([coords.longitude, coords.latitude]).addTo(mapRef.current);
        mapRef.current.flyTo({ center: [coords.longitude, coords.latitude], zoom: 12 });
        setLocationActive(true);
        setLocationMessage('Din position vises midlertidigt på kortet og gemmes ikke.');
      },
      () => setLocationMessage('Positionen blev ikke delt. Du kan fortsat bruge kortet manuelt.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const travelMode = profile === 'bike' ? 'bicycling' : profile === 'walk' || profile === 'wheelchair' ? 'walking' : 'driving';
  const googleRoute = routeReady && start && end
    ? `https://www.google.com/maps/dir/?api=1&origin=${start.coordinates[1]},${start.coordinates[0]}&destination=${end.coordinates[1]},${end.coordinates[0]}&travelmode=${travelMode}`
    : '';

  function saveCurrentRoute() {
    if (!start || !end || start.id === end.id) {
      setLocationMessage('Vælg to forskellige campingpladser for at gemme ruten.');
      return;
    }
    onSaveRoute({
      name: `${start.name} → ${end.name}`,
      startSiteId: start.id,
      endSiteId: end.id,
      profile,
      distanceKm: routeMetrics.distanceKm,
      durationMinutes: routeMetrics.durationMinutes,
      geometry: routeGeometry ?? [start.coordinates, end.coordinates],
    });
    setLocationMessage('Etapeudkastet er gemt lokalt. Profilen er en præference; vejføring og køretøjsbegrænsninger beregnes ikke i appen endnu.');
  }

  return (
    <section className="map-workspace">
      <div className="map-toolbar">
        <div>
          <p className="eyebrow">Kort & ruter</p>
          <h2>Alle dine steder samlet</h2>
        </div>
        <div className="style-switcher" aria-label="Kortstil">
          {(Object.keys(MAP_STYLES) as CampingSettings['mapStyle'][]).map((style) => <button className={mapStyle === style ? 'active' : ''} onClick={() => onStyleChange(style)} type="button" key={style}>{style}</button>)}
        </div>
        <button className="soft-action" onClick={useMyLocation} type="button">⌖ {locationActive ? 'Fjern position' : 'Min position'}</button>
      </div>
      {locationMessage && <p className="inline-notice" role="status">{locationMessage}</p>}
      <div className="map-layout">
        <aside className="route-builder">
          <span className="section-kicker">Ny rute</span>
          <h3>Planlæg næste etape</h3>
          <label>Fra<select value={startId} onChange={(event) => setStartId(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
          <label>Til<select value={endId} onChange={(event) => setEndId(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
          <label>Profil<select value={profile} onChange={(event) => setProfile(event.target.value as RouteProfile)}>{(Object.keys(PROFILE_LABELS) as RouteProfile[]).map((value) => <option value={value} key={value}>{PROFILE_LABELS[value]}</option>)}</select></label>
          <div className="route-summary"><span>{routeStatus}</span><strong>{PROFILE_LABELS[profile]}</strong><small>{routeMetrics.distanceKm ? `${routeMetrics.distanceKm.toFixed(1)} km · ${Math.round(routeMetrics.durationMinutes ?? 0)} min.` : 'Den viste linje forbinder blot de to stop. Profilen gemmes som ønske og er ikke en beregnet eller tilgængelighedskontrolleret rute.'}</small></div>
          <button className="route-save" type="button" disabled={!routeReady} onClick={saveCurrentRoute}>Gem etapeudkast</button>
          {routeReady ? <a className="primary-link" href={googleRoute} target="_blank" rel="noreferrer">Åbn ekstern navigation ↗</a> : <button className="primary-link" type="button" disabled>Åbn ekstern navigation ↗</button>}
          <p className="provider-note">Ekstern navigation åbnes kun, når du vælger det. Campingvognsmål og kørestolsegnethed kræver en særskilt, serverbeskyttet rutetjeneste og kontrolleres ikke her.</p>
        </aside>
        <div className="map-surface-wrap">
          <div className="map-surface" ref={containerRef} />
          {mapError && <div className="map-error" role="status"><strong>Kortbaggrunden svarer ikke</strong><span>Dine steder og ruteudkast er stadig gemt lokalt. Prøv igen, når forbindelsen er tilbage.</span></div>}
          <div className="map-legend"><span><i className="visited" /> Besøgt</span><span><i className="wishlist" /> Vil besøge</span></div>
        </div>
      </div>
    </section>
  );
}
