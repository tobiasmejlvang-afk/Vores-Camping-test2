'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyData, sampleData } from './data';
import { clearPendingImport, deleteAllMedia, getMediaBlob, getPendingImport, replaceAllMedia } from './media-db';
import type { CampingData, CampingSettings, TimelineEvent } from './types';

const STORAGE_KEY = 'vores-camping:data:v1';
export const MAX_BACKUP_FILE_BYTES = 250 * 1024 * 1024;

type CampingBackup = { format?: string; formatVersion?: number; data?: CampingData; media?: { id: string; type: string; data: string }[] };
const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

function cloneData(data: CampingData): CampingData {
  return JSON.parse(JSON.stringify(data)) as CampingData;
}

function validDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function clearWeatherCaches() {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('vores-camping:weather:')) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

async function assertDecodableImage(blob: Blob) {
  if (!SAFE_IMAGE_TYPES.has(blob.type)) throw new Error('Backupfilen indeholder en ikke-understøttet billedtype.');
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(blob);
      const validSize = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 12000 && bitmap.height <= 12000 && bitmap.width * bitmap.height <= 40_000_000;
      bitmap.close();
      if (!validSize) throw new Error('Ugyldige billeddimensioner');
      return;
    }
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 && image.naturalWidth <= 12000 && image.naturalHeight <= 12000 && image.naturalWidth * image.naturalHeight <= 40_000_000 ? resolve() : reject(new Error('Ugyldige billeddimensioner'));
        image.onerror = () => reject(new Error('Billedet kan ikke afkodes'));
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    throw new Error('Et billede i backupfilen kan ikke afkodes sikkert. De nuværende data er ikke ændret.');
  }
}

function prepareCampingData(value: unknown): CampingData {
  if (!value || typeof value !== 'object') throw new Error('Backupfilen indeholder ikke appdata.');
  const incoming = value as CampingData & { routes?: CampingData['routes']; visits?: CampingData['visits'] };
  incoming.routes ??= [];
  incoming.visits ??= [];
  const arrays = [incoming.trips, incoming.sites, incoming.experiences, incoming.routes, incoming.visits, incoming.notes, incoming.media, incoming.people, incoming.events];
  if (incoming.schemaVersion !== 1 || arrays.some((entry) => !Array.isArray(entry))) throw new Error('Backupfilen har ikke et understøttet Vores Camping-format.');
  if (!incoming.settings || typeof incoming.settings !== 'object') throw new Error('Backupfilen mangler gyldige indstillinger.');

  const legacySettings = incoming.settings as Partial<CampingSettings> & { autoLink?: boolean };
  if (!legacySettings.automationMode) legacySettings.automationMode = legacySettings.autoLink === false ? 'manual' : 'automatic';
  legacySettings.compactMode ??= false;
  legacySettings.highContrast ??= false;
  legacySettings.showCommandCenterOnDashboard ??= true;
  legacySettings.proactiveGuardEnabled ??= true;
  legacySettings.smartGuideEnabled ??= true;
  legacySettings.confirmBeforeDelete ??= true;
  legacySettings.autoCollectTripData ??= true;
  legacySettings.dashboardClockEnabled ??= true;
  legacySettings.dashboardAlbumEnabled ??= true;
  legacySettings.liveRoutingEnabled ??= true;
  legacySettings.externalSearchEnabled ??= true;
  legacySettings.weatherAdviceEnabled ??= true;
  const mapStyles = ['liberty', 'bright', 'positron', 'dark', 'fiord', 'satellite', 'hybrid', 'custom'];
  const automationModes = ['automatic', 'ask', 'manual'];
  const booleanSettings = [legacySettings.weatherEnabled, legacySettings.reducedMotion, legacySettings.compactMode, legacySettings.highContrast, legacySettings.showCommandCenterOnDashboard, legacySettings.proactiveGuardEnabled, legacySettings.smartGuideEnabled, legacySettings.confirmBeforeDelete, legacySettings.autoCollectTripData, legacySettings.dashboardClockEnabled, legacySettings.dashboardAlbumEnabled, legacySettings.liveRoutingEnabled, legacySettings.externalSearchEnabled, legacySettings.weatherAdviceEnabled];
  if (!mapStyles.includes(String(legacySettings.mapStyle)) || !automationModes.includes(String(legacySettings.automationMode)) || booleanSettings.some((setting) => typeof setting !== 'boolean')) throw new Error('Backupfilen indeholder ugyldige indstillinger.');

  const allItems = [...incoming.trips, ...incoming.sites, ...incoming.experiences, ...incoming.routes, ...incoming.visits, ...incoming.notes, ...incoming.media, ...incoming.people, ...incoming.events];
  const ids = allItems.map((item) => item?.id);
  if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new Error('Backupfilen har ugyldige eller dublerede id’er.');
  if (allItems.length > 100000) throw new Error('Backupfilen indeholder flere poster end appen understøtter.');

  if (incoming.trips.some((trip) => !trip || typeof trip.title !== 'string' || typeof trip.region !== 'string' || typeof trip.summary !== 'string' || !validDate(trip.startDate) || !validDate(trip.endDate) || trip.endDate < trip.startDate || !['planned','active','completed'].includes(trip.status) || !['forest','coast','sunset'].includes(trip.coverTone) || !Array.isArray(trip.destinationIds) || trip.destinationIds.some((id) => typeof id !== 'string') || !Array.isArray(trip.participantIds) || trip.participantIds.some((id) => typeof id !== 'string') || !Array.isArray(trip.petIds) || trip.petIds.some((id) => typeof id !== 'string'))) throw new Error('Backupfilen indeholder en ugyldig ferie.');
  if (incoming.sites.some((site) => !site || typeof site.name !== 'string' || typeof site.place !== 'string' || typeof site.country !== 'string' || !['visited','wishlist'].includes(site.status) || !Array.isArray(site.coordinates) || site.coordinates.length !== 2 || !Number.isFinite(site.coordinates[0]) || !Number.isFinite(site.coordinates[1]) || site.coordinates[0] < -180 || site.coordinates[0] > 180 || site.coordinates[1] < -90 || site.coordinates[1] > 90 || !Array.isArray(site.tags) || site.tags.some((tag) => typeof tag !== 'string') || typeof site.note !== 'string' || !Number.isFinite(site.rating) || !Number.isFinite(site.visits) || typeof site.favorite !== 'boolean')) throw new Error('Backupfilen indeholder en ugyldig campingplads.');
  if (incoming.experiences.some((item) => !item || typeof item.title !== 'string' || typeof item.place !== 'string' || !validDate(item.date) || !['idea','planned','done'].includes(item.status) || typeof item.note !== 'string' || (item.tripId !== undefined && typeof item.tripId !== 'string'))) throw new Error('Backupfilen indeholder en ugyldig oplevelse.');
  if (incoming.routes.some((route) => !route || typeof route.name !== 'string' || (route.startSiteId !== undefined && typeof route.startSiteId !== 'string') || (route.endSiteId !== undefined && typeof route.endSiteId !== 'string') || !['caravan','car','hgv','bike','ebike','road-bike','mtb','walk','hike','wheelchair'].includes(route.profile) || Number.isNaN(Date.parse(route.createdAt)) || (route.tripId !== undefined && typeof route.tripId !== 'string') || (route.distanceKm !== undefined && !Number.isFinite(route.distanceKm)) || (route.durationMinutes !== undefined && !Number.isFinite(route.durationMinutes)) || !Array.isArray(route.geometry) || route.geometry.length < 2 || route.geometry.some((coordinate) => !Array.isArray(coordinate) || coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) || coordinate[0] < -180 || coordinate[0] > 180 || coordinate[1] < -90 || coordinate[1] > 90))) throw new Error('Backupfilen indeholder en ugyldig rute.');
  if (incoming.visits.some((visit) => !visit || typeof visit.siteId !== 'string' || (visit.tripId !== undefined && typeof visit.tripId !== 'string') || !validDate(visit.arrivalDate) || (visit.departureDate !== undefined && !validDate(visit.departureDate)) || (visit.departureDate && visit.departureDate < visit.arrivalDate) || !Number.isFinite(visit.rating) || visit.rating < 0 || visit.rating > 5 || typeof visit.note !== 'string')) throw new Error('Backupfilen indeholder et ugyldigt besøg.');
  if (incoming.notes.some((note) => !note || typeof note.title !== 'string' || typeof note.text !== 'string' || !validDate(note.date) || typeof note.pinned !== 'boolean' || (note.tripId !== undefined && typeof note.tripId !== 'string'))) throw new Error('Backupfilen indeholder en ugyldig note.');
  if (incoming.media.some((item) => !item || typeof item.name !== 'string' || typeof item.createdAt !== 'string' || Number.isNaN(Date.parse(item.createdAt)) || typeof item.favorite !== 'boolean' || (item.tripId !== undefined && typeof item.tripId !== 'string') || (item.siteId !== undefined && typeof item.siteId !== 'string'))) throw new Error('Backupfilen indeholder en ugyldig mediepost.');
  if (incoming.people.some((person) => !person || typeof person.name !== 'string' || !['person','pet'].includes(person.kind) || typeof person.detail !== 'string')) throw new Error('Backupfilen indeholder en ugyldig profil.');
  if (incoming.events.some((event) => !event || typeof event.title !== 'string' || typeof event.detail !== 'string' || typeof event.createdAt !== 'string' || Number.isNaN(Date.parse(event.createdAt)) || !['trip','place','media','note','experience'].includes(event.type))) throw new Error('Backupfilen indeholder en ugyldig hændelse.');

  const siteIds = new Set(incoming.sites.map((site) => site.id));
  const personIds = new Set(incoming.people.map((person) => person.id));
  const tripIds = new Set(incoming.trips.map((trip) => trip.id));
  if (incoming.trips.some((trip) => trip.destinationIds.some((id) => !siteIds.has(id)) || [...trip.participantIds, ...trip.petIds].some((id) => !personIds.has(id)))) throw new Error('Backupfilen har ferier med manglende relationer.');
  if (incoming.notes.some((note) => note.tripId && !tripIds.has(note.tripId)) || incoming.media.some((item) => (item.tripId && !tripIds.has(item.tripId)) || (item.siteId && !siteIds.has(item.siteId))) || incoming.experiences.some((item) => item.tripId && !tripIds.has(item.tripId))) throw new Error('Backupfilen har indhold med manglende ferierelationer.');
  if (incoming.routes.some((route) => (route.startSiteId && !siteIds.has(route.startSiteId)) || (route.endSiteId && !siteIds.has(route.endSiteId)) || (route.tripId && !tripIds.has(route.tripId))) || incoming.visits.some((visit) => !siteIds.has(visit.siteId) || (visit.tripId && !tripIds.has(visit.tripId)))) throw new Error('Backupfilen har ruter eller besøg med manglende relationer.');

  const clean: CampingData = {
    schemaVersion: 1,
    trips: incoming.trips.map((trip) => ({ id: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate, status: trip.status, region: trip.region, summary: trip.summary, destinationIds: [...trip.destinationIds], participantIds: [...trip.participantIds], petIds: [...trip.petIds], coverTone: trip.coverTone, ...(trip.mainDestinationId ? { mainDestinationId: trip.mainDestinationId } : {}), ...(trip.activeSiteId ? { activeSiteId: trip.activeSiteId } : {}), ...(trip.albumStatus ? { albumStatus: trip.albumStatus } : {}), ...(trip.startedAt ? { startedAt: trip.startedAt } : {}), ...(trip.completedAt ? { completedAt: trip.completedAt } : {}) })),
    sites: incoming.sites.map((site) => ({ id: site.id, name: site.name, place: site.place, country: site.country, coordinates: [site.coordinates[0], site.coordinates[1]], status: site.status, rating: site.rating, visits: site.visits, tags: [...site.tags], note: site.note, favorite: site.favorite, ...(site.address ? { address: site.address } : {}), ...(site.locationSource ? { locationSource: site.locationSource } : {}) })),
    experiences: incoming.experiences.map((item) => ({ id: item.id, title: item.title, place: item.place, date: item.date, status: item.status, note: item.note, ...(item.tripId ? { tripId: item.tripId } : {}), ...(item.kind ? { kind: item.kind } : {}), ...(item.coordinates ? { coordinates: [item.coordinates[0], item.coordinates[1]] as [number, number] } : {}) })),
    routes: incoming.routes.map((route) => ({ id: route.id, name: route.name, startSiteId: route.startSiteId, endSiteId: route.endSiteId, profile: route.profile, createdAt: route.createdAt, ...(route.tripId ? { tripId: route.tripId } : {}), ...(route.distanceKm !== undefined ? { distanceKm: route.distanceKm } : {}), ...(route.durationMinutes !== undefined ? { durationMinutes: route.durationMinutes } : {}), geometry: route.geometry.map((coordinate) => [coordinate[0], coordinate[1]] as [number, number]), ...(route.waypoints ? { waypoints: route.waypoints.map((point) => ({ ...point, coordinates: [point.coordinates[0], point.coordinates[1]] as [number, number] })) } : {}), ...(route.description ? { description: route.description } : {}), ...(route.avoidance ? { avoidance: { ...route.avoidance } } : {}), ...(route.vehicle ? { vehicle: { ...route.vehicle } } : {}), ...(route.elevation ? { elevation: { ...route.elevation } } : {}), ...(route.calculated !== undefined ? { calculated: route.calculated } : {}), ...(route.optimized !== undefined ? { optimized: route.optimized } : {}) })),
    visits: incoming.visits.map((visit) => ({ id: visit.id, siteId: visit.siteId, ...(visit.tripId ? { tripId: visit.tripId } : {}), arrivalDate: visit.arrivalDate, ...(visit.departureDate ? { departureDate: visit.departureDate } : {}), rating: visit.rating, note: visit.note })),
    notes: incoming.notes.map((note) => ({ id: note.id, title: note.title, text: note.text, date: note.date, ...(note.tripId ? { tripId: note.tripId } : {}), pinned: note.pinned })),
    media: incoming.media.map((item) => ({ id: item.id, name: item.name, createdAt: item.createdAt, ...(item.tripId ? { tripId: item.tripId } : {}), ...(item.siteId ? { siteId: item.siteId } : {}), favorite: item.favorite })),
    people: incoming.people.map((person) => ({ id: person.id, name: person.name, kind: person.kind, detail: person.detail })),
    events: incoming.events.map((event) => ({ id: event.id, title: event.title, detail: event.detail, createdAt: event.createdAt, type: event.type, ...(event.tripId ? { tripId: event.tripId } : {}), ...(event.automatic !== undefined ? { automatic: event.automatic } : {}), ...(event.target ? { target: event.target } : {}) })),
    settings: {
      mapStyle: legacySettings.mapStyle as CampingSettings['mapStyle'],
      automationMode: legacySettings.automationMode as CampingSettings['automationMode'],
      weatherEnabled: legacySettings.weatherEnabled as boolean,
      reducedMotion: legacySettings.reducedMotion as boolean,
      compactMode: legacySettings.compactMode as boolean,
      highContrast: legacySettings.highContrast as boolean,
      showCommandCenterOnDashboard: legacySettings.showCommandCenterOnDashboard as boolean,
      proactiveGuardEnabled: legacySettings.proactiveGuardEnabled as boolean,
      smartGuideEnabled: legacySettings.smartGuideEnabled as boolean,
      confirmBeforeDelete: legacySettings.confirmBeforeDelete as boolean,
      autoCollectTripData: legacySettings.autoCollectTripData as boolean,
      dashboardClockEnabled: legacySettings.dashboardClockEnabled as boolean,
      dashboardAlbumEnabled: legacySettings.dashboardAlbumEnabled as boolean,
      liveRoutingEnabled: legacySettings.liveRoutingEnabled as boolean,
      externalSearchEnabled: legacySettings.externalSearchEnabled as boolean,
      weatherAdviceEnabled: legacySettings.weatherAdviceEnabled as boolean,
    },
  };
  let activeSeen = false;
  clean.trips.forEach((trip) => { if (trip.status === 'active') { if (activeSeen) trip.status = 'planned'; activeSeen = true; } });
  return clean;
}

export function makeId(prefix: string) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function useCampingStore() {
  const [data, setData] = useState<CampingData>(() => cloneData(emptyData));
  const [ready, setReady] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [storageError, setStorageError] = useState('');
  const hydrated = useRef(false);
  const initialized = useRef(false);
  const externalSync = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        const pending = await getPendingImport().catch(() => undefined);
        const saved = pending ?? localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setData(prepareCampingData(JSON.parse(saved)));
          initialized.current = true;
          if (pending) {
            try {
              localStorage.setItem(STORAGE_KEY, pending);
              await clearPendingImport();
            } catch {
              setStorageError('Den seneste import er sikkert journalført, men browserens lokale lager er fyldt. Eksportér en backup og frigør plads.');
            }
          }
        } else {
          setFirstRun(true);
        }
      } catch {
        // A malformed local backup must never stop the app from opening.
        setFirstRun(true);
      } finally {
        hydrated.current = true;
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const incoming = prepareCampingData(JSON.parse(event.newValue));
        externalSync.current = true;
        initialized.current = true;
        setFirstRun(false);
        setStorageError('');
        setData(incoming);
      } catch {
        setStorageError('En anden appinstans skrev ugyldige data. Denne visning er bevaret; genindlæs efter at have eksporteret en backup.');
      }
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);

  useEffect(() => {
    if (!hydrated.current || !initialized.current) return;
    if (externalSync.current) { externalSync.current = false; return; }
    let nextError = '';
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      nextError = 'Browserens lokale lager er fyldt eller blokeret. Eksportér en backup, før du fortsætter.';
    }
    if (!nextError) void clearPendingImport().catch(() => undefined);
    const timeout = window.setTimeout(() => setStorageError(nextError), 0);
    return () => window.clearTimeout(timeout);
  }, [data]);

  const mutate = useCallback((recipe: (draft: CampingData) => void) => {
    setData((current) => {
      const draft = cloneData(current);
      recipe(draft);
      return draft;
    });
  }, []);

  const addEvent = useCallback((event: Omit<TimelineEvent, 'id' | 'createdAt'>) => {
    mutate((draft) => {
      draft.events.unshift({ ...event, id: makeId('event'), createdAt: new Date().toISOString() });
      draft.events = draft.events.slice(0, 100);
    });
  }, [mutate]);

  const exportData = useCallback(async () => {
    const safeData = prepareCampingData(cloneData(data));
    const media: { id: string; type: string; data: string }[] = [];
    let projectedBytes = new Blob([JSON.stringify({ format: 'vores-camping-backup', formatVersion: 1, data: safeData, media: [] })]).size;
    for (const item of safeData.media) {
      const blob = await getMediaBlob(item.id);
      if (!blob) throw new Error('Backup blev stoppet, fordi et eller flere billeder mangler i medielageret. Fjern de tomme billedposter eller prøv igen på den oprindelige enhed.');
      projectedBytes += Math.ceil(blob.size * 4 / 3) + item.id.length + blob.type.length + 64;
      if (projectedBytes > MAX_BACKUP_FILE_BYTES) throw new Error('Albummet er for stort til én sikker backupfil. Vores Camping opretter ikke en fil, som appen ikke selv kan gendanne; fjern eller fordel billeder, indtil backupstørrelsen er under 250 MB.');
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      media.push({ id: item.id, type: blob.type, data: encoded });
    }
    const backup = { format: 'vores-camping-backup', formatVersion: 1, exportedAt: new Date().toISOString(), data: safeData, media };
    const backupBlob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    if (backupBlob.size > MAX_BACKUP_FILE_BYTES) throw new Error('Backupfilen overstiger den understøttede grænse på 250 MB og blev derfor ikke gemt.');
    const url = URL.createObjectURL(backupBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vores-camping-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data]);

  const importData = useCallback(async (file: File) => {
    const parsed = JSON.parse(await file.text()) as CampingData | CampingBackup;
    const bundle = 'data' in parsed && parsed.data ? parsed as CampingBackup : undefined;
    if (bundle?.format && (bundle.format !== 'vores-camping-backup' || bundle.formatVersion !== 1)) throw new Error('Backupfilens versionsformat understøttes ikke.');
    const incoming = prepareCampingData(bundle?.data ?? parsed);
    const incomingMediaIds = new Set(incoming.media.map((item) => item.id));
    const restoredMedia: { id: string; blob: Blob }[] = [];
    if (bundle && Array.isArray(bundle.media)) {
      const seenMedia = new Set<string>();
      for (const item of bundle.media) {
        if (!item || typeof item.id !== 'string' || typeof item.type !== 'string' || !SAFE_IMAGE_TYPES.has(item.type) || typeof item.data !== 'string' || seenMedia.has(item.id) || !incomingMediaIds.has(item.id) || !/^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(item.data)) throw new Error('Backupfilen indeholder ugyldige eller dublerede billeddata.');
        seenMedia.add(item.id);
        const response = await fetch(item.data);
        const blob = await response.blob();
        if (blob.type !== item.type || blob.size > 25 * 1024 * 1024) throw new Error('Et billede i backupfilen er ugyldigt eller for stort.');
        await assertDecodableImage(blob);
        restoredMedia.push({ id: item.id, blob });
      }
    }
    if (incoming.media.length && (!bundle || restoredMedia.length !== incoming.media.length)) throw new Error('Backupfilen mangler billeddata og kan derfor ikke gendanne et komplet album. Eksportér en ny komplet backup fra den oprindelige enhed.');
    const serialized = JSON.stringify(incoming);
    await replaceAllMedia(restoredMedia, serialized);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      await clearPendingImport();
      setStorageError('');
    } catch {
      setStorageError('Importen er sikkert journalført, men browserens lokale lager er fyldt. Eksportér en backup og frigør plads.');
    }
    setData(incoming);
  }, []);

  const resetToSample = useCallback(async () => {
    await deleteAllMedia();
    clearWeatherCaches();
    setData(cloneData(sampleData));
  }, []);

  const clearAll = useCallback(async () => {
    await deleteAllMedia();
    clearWeatherCaches();
    setData(cloneData(emptyData));
  }, []);

  const initialize = useCallback((mode: 'empty' | 'sample') => {
    const next = cloneData(mode === 'sample' ? sampleData : emptyData);
    initialized.current = true;
    setData(next);
    setFirstRun(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Browserens lokale lager er fyldt eller blokeret. Eksportér en backup, før du fortsætter.');
    }
  }, []);

  return { data, setData, mutate, addEvent, exportData, importData, resetToSample, clearAll, initialize, ready, firstRun, storageError };
}
