import type { CampingData, Trip, ViewId } from './types';

export type GuardSeverity = 'ok' | 'attention' | 'important' | 'critical';

export type GuardFinding = {
  id: string;
  severity: Exclude<GuardSeverity, 'ok'>;
  title: string;
  detail: string;
  target: ViewId;
};

const dayMs = 24 * 60 * 60 * 1000;

function utcDay(value: string) {
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

export function getTripDay(trip: Trip, now = new Date()) {
  const start = utcDay(trip.startDate);
  const end = utcDay(trip.endDate);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const currentDay = Math.min(totalDays, Math.max(1, Math.floor((today - start) / dayMs) + 1));
  return { currentDay, totalDays };
}

export function buildGuardReport(data: CampingData, activeTrip?: Trip): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const add = (finding: GuardFinding) => findings.push(finding);
  const tripIds = new Set(data.trips.map((trip) => trip.id));
  const siteIds = new Set(data.sites.map((site) => site.id));
  const personIds = new Set(data.people.map((person) => person.id));

  if (!activeTrip) add({ id: 'no-active-trip', severity: 'attention', title: 'Ingen aktiv ferie', detail: 'Start en planlagt ferie for at aktivere automatisk opsamling og ferie-puls.', target: 'trips' });
  if (activeTrip && utcDay(activeTrip.endDate) < utcDay(activeTrip.startDate)) add({ id: 'invalid-trip-dates', severity: 'critical', title: 'Feriens datoer er ugyldige', detail: 'Slutdatoen ligger før startdatoen.', target: 'trips' });
  if (activeTrip && !activeTrip.destinationIds.length) add({ id: 'missing-destination', severity: 'important', title: 'Aktiv ferie mangler destination', detail: 'Tilføj mindst én campingplads eller destination.', target: 'sites' });
  if (activeTrip?.destinationIds.some((id) => !siteIds.has(id))) add({ id: 'missing-site-relation', severity: 'critical', title: 'En destination findes ikke længere', detail: 'Ferieplanen henviser til et slettet sted.', target: 'trips' });
  if (activeTrip && [...activeTrip.participantIds, ...activeTrip.petIds].some((id) => !personIds.has(id))) add({ id: 'missing-person-relation', severity: 'important', title: 'En rejsefælle mangler', detail: 'Ferieplanen henviser til en slettet profil.', target: 'people' });

  const siteKeys = new Set<string>();
  data.sites.forEach((site) => {
    const key = `${site.name}|${site.place}`.toLocaleLowerCase('da-DK');
    if (siteKeys.has(key)) add({ id: `duplicate-${site.id}`, severity: 'attention', title: `Mulig dublet: ${site.name}`, detail: 'Navn og sted matcher en anden campingplads.', target: 'sites' });
    siteKeys.add(key);
    if (!Number.isFinite(site.coordinates[0]) || !Number.isFinite(site.coordinates[1]) || site.coordinates[0] < -180 || site.coordinates[0] > 180 || site.coordinates[1] < -90 || site.coordinates[1] > 90) add({ id: `coordinates-${site.id}`, severity: 'critical', title: `Ugyldig placering: ${site.name}`, detail: 'Kortkoordinaterne ligger uden for det gyldige område.', target: 'sites' });
  });

  data.notes.forEach((note) => { if (note.tripId && !tripIds.has(note.tripId)) add({ id: `note-${note.id}`, severity: 'critical', title: 'Note uden gyldig ferie', detail: note.title, target: 'notes' }); });
  data.media.forEach((item) => {
    if (item.tripId && !tripIds.has(item.tripId)) add({ id: `media-trip-${item.id}`, severity: 'critical', title: 'Minde uden gyldig ferie', detail: item.name, target: 'album' });
    if (item.siteId && !siteIds.has(item.siteId)) add({ id: `media-site-${item.id}`, severity: 'important', title: 'Minde uden gyldigt sted', detail: item.name, target: 'album' });
  });
  data.routes.forEach((route) => {
    if ((route.startSiteId && !siteIds.has(route.startSiteId)) || (route.endSiteId && !siteIds.has(route.endSiteId))) add({ id: `route-${route.id}`, severity: 'critical', title: 'Rute henviser til et slettet sted', detail: route.name, target: 'map' });
    if (route.tripId && !tripIds.has(route.tripId)) add({ id: `route-trip-${route.id}`, severity: 'important', title: 'Rute uden gyldig ferie', detail: route.name, target: 'map' });
  });
  data.visits.forEach((visit) => {
    if (!siteIds.has(visit.siteId)) add({ id: `visit-site-${visit.id}`, severity: 'critical', title: 'Besøg uden campingplads', detail: visit.arrivalDate, target: 'sites' });
    if (visit.tripId && !tripIds.has(visit.tripId)) add({ id: `visit-trip-${visit.id}`, severity: 'important', title: 'Besøg uden gyldig ferie', detail: visit.arrivalDate, target: 'sites' });
  });
  data.experiences.forEach((item) => { if (item.tripId && !tripIds.has(item.tripId)) add({ id: `experience-${item.id}`, severity: 'important', title: 'Oplevelse uden gyldig ferie', detail: item.title, target: 'experiences' }); });
  return findings;
}

export function guardHealth(findings: GuardFinding[]): { severity: GuardSeverity; label: string } {
  if (findings.some((item) => item.severity === 'critical')) return { severity: 'critical', label: 'Kræver handling' };
  if (findings.some((item) => item.severity === 'important')) return { severity: 'important', label: 'Vigtigt' };
  if (findings.length) return { severity: 'attention', label: 'Bør kontrolleres' };
  return { severity: 'ok', label: 'Alt OK' };
}

export function albumStatusLabel(trip: Trip | undefined, mediaCount: number) {
  if (trip?.albumStatus === 'completed') return 'Færdigt';
  if (trip?.albumStatus === 'review') return 'Klar til gennemgang';
  if (trip?.albumStatus === 'building') return 'Opbygger';
  if (trip?.albumStatus === 'sorting') return 'Sorterer';
  if (mediaCount > 3) return 'Opbygger';
  if (mediaCount > 0) return 'Samler';
  return 'Oprettet';
}

export function buildTripPulse(data: CampingData, trip?: Trip) {
  if (!trip) return undefined;
  const { currentDay, totalDays } = getTripDay(trip);
  const siteSet = new Set(trip.destinationIds);
  const visits = data.visits.filter((visit) => visit.tripId === trip.id || siteSet.has(visit.siteId));
  const media = data.media.filter((item) => item.tripId === trip.id);
  const experiences = data.experiences.filter((item) => item.tripId === trip.id);
  const routes = data.routes.filter((route) => route.tripId === trip.id);
  const cyclingRoutes = routes.filter((route) => ['bike', 'ebike', 'road-bike', 'mtb'].includes(route.profile));
  const distanceKm = routes.reduce((sum, route) => sum + (route.distanceKm ?? 0), 0);
  const findings = buildGuardReport(data, trip);
  return {
    currentDay,
    totalDays,
    destinations: trip.destinationIds.length,
    visitedSites: new Set(visits.map((visit) => visit.siteId)).size,
    media: media.length,
    experiences: experiences.length,
    cyclingRoutes: cyclingRoutes.length,
    distanceKm,
    albumStatus: albumStatusLabel(trip, media.length),
    dataStatus: guardHealth(findings),
    weatherStatus: data.settings.weatherEnabled ? 'Aktiv' : 'Slået fra',
    recentAutomaticEvents: data.events.filter((event) => event.automatic && (!event.tripId || event.tripId === trip.id)).slice(0, 3),
  };
}

export function buildDashboardStats(data: CampingData) {
  const visited = data.sites.filter((site) => site.status === 'visited');
  return [
    { label: 'Besøgte pladser', value: visited.length },
    { label: 'Ønskesteder', value: data.sites.filter((site) => site.status === 'wishlist').length },
    { label: 'Besøgte lande', value: new Set(visited.map((site) => site.country)).size },
    { label: 'Ferier', value: data.trips.length },
    { label: 'Gemte ruter', value: data.routes.length },
    { label: 'Cykelruter', value: data.routes.filter((route) => ['bike', 'ebike', 'road-bike', 'mtb'].includes(route.profile)).length },
    { label: 'Oplevelser', value: data.experiences.filter((item) => item.kind !== 'attraction').length },
    { label: 'Seværdigheder', value: data.experiences.filter((item) => item.kind === 'attraction').length },
    { label: 'Billeder & minder', value: data.media.length },
  ];
}
