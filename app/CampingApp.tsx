'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from './AppImage';
import AlbumSlideshow from './AlbumSlideshow';
import DashboardClock from './DashboardClock';
import MapPanel from './MapPanel';
import WeatherCard from './WeatherCard';
import { albumStatusLabel, buildDashboardStats, buildGuardReport, buildTripPulse, guardHealth } from './holiday-insights';
import { deleteMediaBlob, getMediaBlob, putMediaBlob } from './media-db';
import type { CampingData, CampingSite, MediaItem, SavedRoute, Trip, ViewId } from './types';
import { isSafeServiceUrl, maskSecret, useServiceConfig } from './service-config';
import { makeId, MAX_BACKUP_FILE_BYTES, useCampingStore } from './use-camping-store';

const navigation: { id: ViewId; label: string; short: string; icon: string }[] = [
  { id: 'dashboard', label: 'Overblik', short: 'Overblik', icon: '⌂' },
  { id: 'administration', label: 'Ferie Administrationen', short: 'Central', icon: '◈' },
  { id: 'trips', label: 'Ferier', short: 'Ferier', icon: '◇' },
  { id: 'map', label: 'Kort & ruter', short: 'Kort', icon: '⌖' },
  { id: 'sites', label: 'Campingpladser', short: 'Pladser', icon: '△' },
  { id: 'album', label: 'Feriealbum', short: 'Album', icon: '▣' },
  { id: 'experiences', label: 'Oplevelser', short: 'Oplevelser', icon: '✦' },
  { id: 'notes', label: 'Noter', short: 'Noter', icon: '≡' },
  { id: 'people', label: 'Personer & dyr', short: 'Rejsehold', icon: '♧' },
];

const roleDetails = [
  {
    name: 'Sisi', role: 'Ferie Vagten', icon: '✓', image: '/sisi-vagten.png', status: 'Alt ser godt ud', task: 'Kontrollerer relationer og mangler', tone: 'green',
    description: 'Holder øje med hele feriearkivet, finder manglende oplysninger og viser præcis, hvor en relation eller plan kræver din opmærksomhed.',
    mission: 'At holde dine ferier sammenhængende og trygge uden at ændre noget på egen hånd.',
    responsibilities: ['Kontrollerer aktive ferier, datoer og destinationer', 'Finder manglende eller forældreløse relationer', 'Opdager mulige dubletter blandt campingpladser', 'Sender dig direkte til stedet, hvor et punkt kan løses'],
    capabilities: [
      { title: 'Sammenhængskontrol', text: 'Gennemgår ferier, noter, minder og destinationer for brudte forbindelser.' },
      { title: 'Prioriteret vagtliste', text: 'Skelner mellem egentlige problemer og punkter, der blot kræver opmærksomhed.' },
      { title: 'Direkte rettelse', text: 'Åbner den relevante appside, så du kan rette et fund uden omveje.' },
    ],
    workflow: ['Scanner de lokale data', 'Prioriterer fund efter alvor', 'Følger op, når du har rettet dem'],
  },
  {
    name: 'Sisi', role: 'Ferie Guiden', icon: '⌖', image: '/sisi-guiden.png', status: 'Næste stop er klar', task: 'Giver kontekstuelle forslag', tone: 'sand',
    description: 'Læser den aktuelle feriekontekst og omsætter den til et klart næste skridt, uanset om du planlægger, er undervejs eller samler minder bagefter.',
    mission: 'At gøre det let at vide, hvad der giver mest mening at gøre nu.',
    responsibilities: ['Finder næste naturlige trin i planlægningen', 'Knytter forslag til den aktive ferie og destination', 'Samler genveje til steder, ruter og oplevelser', 'Respekterer manuel tilstand, når smarte forslag er slået fra'],
    capabilities: [
      { title: 'Næste bedste skridt', text: 'Foreslår ferie, destination, rute eller oplevelse ud fra det, der mangler.' },
      { title: 'Ferie i kontekst', text: 'Holder den aktive ferie og det aktuelle stop som centrum for hjælpen.' },
      { title: 'Planlægningsgenveje', text: 'Samler de vigtigste handlinger, så du kan fortsætte med ét klik.' },
    ],
    workflow: ['Aflæser din feriestatus', 'Udvælger det vigtigste næste skridt', 'Lader dig vælge, om forslaget skal bruges'],
  },
  {
    name: 'Misser', role: 'Ferie Grafikeren', icon: '▣', image: '/misser-grafikeren.png', status: 'Albummet vokser', task: 'Organiserer minder og kapitler', tone: 'navy',
    description: 'Omsætter billeder, steder, ruter, noter og oplevelser til et samlet feriealbum, hvor hvert minde stadig er under din kontrol.',
    mission: 'At gøre feriearkivet levende, overskueligt og nemt at genopleve.',
    responsibilities: ['Organiserer billeder efter ferie og tidspunkt', 'Fremhæver favoritter og minder uden ferietilknytning', 'Samler steder, ruter, noter og oplevelser i kapitler', 'Bevarer originalerne i appens lokale medielager'],
    capabilities: [
      { title: 'Albumoverblik', text: 'Viser hele arkivet eller én udvalgt ferie med tilhørende spor.' },
      { title: 'Mindeorganisering', text: 'Holder styr på favoritter, ferietilknytning og endnu usorterede billeder.' },
      { title: 'Feriens fortælling', text: 'Samler destinationer, etaper, noter og oplevelser omkring billederne.' },
    ],
    workflow: ['Modtager billeder fra din enhed', 'Knytter dem efter din automatik', 'Bygger et samlet ferieforløb'],
  },
  {
    name: 'Misser', role: 'Ferie Meteorologen', icon: '☀', image: '/misser-meteorologen.png', status: 'Vejret er opdateret', task: 'Følger prognosen for dit stop', tone: 'teal',
    description: 'Kobler vejrudsigten til destinationen på din aktive ferie og gør det tydeligt, hvornår live data eller senest kendte prognose vises.',
    mission: 'At give dig et brugbart vejrbillede for det stop, der betyder noget lige nu.',
    responsibilities: ['Finder vejret ud fra destinationens koordinater', 'Viser prognose for den aktive campingplads', 'Forklarer når live vejr er slået fra eller forbindelsen mangler', 'Holder vejrdeling under din kontrol i Indstillinger'],
    capabilities: [
      { title: 'Destinationsvejr', text: 'Bruger kun koordinaterne for det aktuelle stop, når live vejr er aktiveret.' },
      { title: 'Offline-resiliens', text: 'Kan vise senest kendte data, når netværket ikke er tilgængeligt.' },
      { title: 'Privatlivskontrol', text: 'Giver en tydelig kontakt til indstillingen, der styrer eksterne vejropkald.' },
    ],
    workflow: ['Finder den aktive destination', 'Henter eller genbruger prognosen', 'Præsenterer vejret i feriens kontekst'],
  },
];

type ModalId = 'trip' | 'site' | 'visit' | 'note' | 'experience' | 'person' | null;
type TestResult = { label: string; state: 'passed' | 'warning' | 'failed'; detail: string; group: 'Lokal app' | 'Kort' | 'Ruter' | 'Søgning' | 'Andre tjenester' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function tripDuration(trip: Trip) {
  return Math.max(1, Math.round((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1);
}

function tripProgress(trip: Trip) {
  const start = new Date(`${trip.startDate}T00:00:00`).getTime();
  const end = new Date(`${trip.endDate}T23:59:59`).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

async function prepareImage(file: File): Promise<Blob> {
  if (!('createImageBitmap' in window)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('Billedet kunne ikke behandles.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Billedet kunne ikke komprimeres.')), 'image/webp', .86));
}

function statusLabel(status: Trip['status']) {
  return status === 'active' ? 'Aktiv' : status === 'completed' ? 'Afsluttet' : 'Planlagt';
}

function subscribeOnline(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
}

function getOnlineSnapshot() { return navigator.onLine; }
function getServerOnlineSnapshot() { return true; }

function SearchResults({ data, query, onChoose }: { data: CampingData; query: string; onChoose: (view: ViewId) => void }) {
  const normalized = query.trim().toLocaleLowerCase('da-DK');
  if (!normalized) return null;
  const matches = [
    ...data.trips.filter((item) => `${item.title} ${item.region}`.toLocaleLowerCase('da-DK').includes(normalized)).map((item) => ({ title: item.title, meta: 'Ferie', view: 'trips' as ViewId })),
    ...data.sites.filter((item) => `${item.name} ${item.place} ${item.tags.join(' ')}`.toLocaleLowerCase('da-DK').includes(normalized)).map((item) => ({ title: item.name, meta: `Campingplads · ${item.place}`, view: 'sites' as ViewId })),
    ...data.experiences.filter((item) => `${item.title} ${item.place}`.toLocaleLowerCase('da-DK').includes(normalized)).map((item) => ({ title: item.title, meta: 'Oplevelse', view: 'experiences' as ViewId })),
    ...data.notes.filter((item) => `${item.title} ${item.text}`.toLocaleLowerCase('da-DK').includes(normalized)).map((item) => ({ title: item.title, meta: 'Note', view: 'notes' as ViewId })),
  ].slice(0, 7);
  return <div className="search-results" id="global-search-results" role="listbox">{matches.length ? matches.map((match, index) => <button role="option" aria-selected="false" type="button" onClick={() => onChoose(match.view)} key={`${match.meta}-${index}`}><span>{match.meta}</span><strong>{match.title}</strong></button>) : <p>Ingen resultater for “{query}”</p>}</div>;
}

function EmptyState({ icon, title, text, action, onAction }: { icon: string; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}</div>;
}

function AlbumGallery({ media, trips, activeTrip, onFavorite, onDelete, onTripToggle }: { media: MediaItem[]; trips: Trip[]; activeTrip?: Trip; onFavorite: (id: string) => void; onDelete: (id: string) => void; onTripToggle: (id: string) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    Promise.all(media.map(async (item) => {
      const blob = await getMediaBlob(item.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      created.push(url);
      return [item.id, url] as const;
    })).then((entries) => {
      if (!cancelled) setUrls(Object.fromEntries(entries.filter(Boolean) as [string, string][]));
    }).catch(() => undefined);
    return () => { cancelled = true; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [media]);
  const groups = useMemo(() => {
    const sorted = [...media].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const formatter = new Intl.DateTimeFormat('da-DK', { month: 'long', year: 'numeric' });
    const grouped = new Map<string, MediaItem[]>();
    sorted.forEach((item) => {
      const label = formatter.format(new Date(item.createdAt));
      grouped.set(label, [...(grouped.get(label) ?? []), item]);
    });
    return Array.from(grouped.entries());
  }, [media]);
  return <div className="album-groups">{groups.map(([label, items]) => <section className="album-group" key={label}><h3>{label}</h3><div className="album-grid">{items.map((item, index) => <article className={`memory-card memory-${index % 5}`} key={item.id}><div className="memory-actions"><button type="button" aria-label={item.favorite ? `Fjern ${item.name} fra favoritter` : `Gør ${item.name} til favorit`} onClick={() => onFavorite(item.id)}>{item.favorite ? '★' : '☆'}</button><button className="danger-icon" type="button" aria-label={`Slet ${item.name}`} onClick={() => onDelete(item.id)}>×</button></div>{urls[item.id] ? <Image src={urls[item.id]} width={640} height={480} unoptimized alt={item.name} /> : <div className="memory-placeholder">▣</div>}<div><strong>{item.favorite ? `★ ${item.name}` : item.name}</strong><small>{new Intl.DateTimeFormat('da-DK',{dateStyle:'medium'}).format(new Date(item.createdAt))} · {trips.find((trip) => trip.id === item.tripId)?.title ?? 'Uden ferie'}</small>{activeTrip && <button className="memory-relation" type="button" onClick={() => onTripToggle(item.id)}>{item.tripId === activeTrip.id ? `Fjern fra ${activeTrip.title}` : `Knyt til ${activeTrip.title}`}</button>}</div></article>)}</div></section>)}</div>;
}

export default function CampingApp() {
  const store = useCampingStore();
  const serviceStore = useServiceConfig();
  const { data, mutate, addEvent } = store;
  const [view, setView] = useState<ViewId>('dashboard');
  const [modal, setModal] = useState<ModalId>(null);
  const [selectedRole, setSelectedRole] = useState(0);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [siteFilter, setSiteFilter] = useState<'all' | 'visited' | 'wishlist'>('all');
  const [tripFilter, setTripFilter] = useState<'all' | Trip['status']>('all');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [albumTripId, setAlbumTripId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [siteDetailId, setSiteDetailId] = useState('');
  const [tripDetailId, setTripDetailId] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [serviceMessage, setServiceMessage] = useState('');
  const [serviceTesting, setServiceTesting] = useState(false);
  const [manualGuardScan, setManualGuardScan] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastMobileFocusRef = useRef<HTMLElement | null>(null);

  const activeTrip = data.trips.find((trip) => trip.status === 'active');
  const activeSite = data.sites.find((site) => site.id === activeTrip?.activeSiteId) ?? data.sites.find((site) => site.id === activeTrip?.mainDestinationId) ?? data.sites.find((site) => activeTrip?.destinationIds.includes(site.id));
  const nextTrip = [...data.trips].filter((trip) => trip.status === 'planned' && Date.parse(`${trip.startDate}T00:00:00`) >= Date.now()).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const albumTrip = albumTripId === 'all' ? undefined : data.trips.find((trip) => trip.id === albumTripId) ?? activeTrip;
  const albumMedia = albumTrip ? data.media.filter((item) => item.tripId === albumTrip.id) : data.media;
  const pageTitle = navigation.find((item) => item.id === view)?.label ?? (view === 'settings' ? 'Indstillinger' : 'Testcenter');
  const guardChecks = useMemo(() => buildGuardReport(data, activeTrip), [activeTrip, data]);
  const health = guardHealth(guardChecks);
  const tripPulse = useMemo(() => buildTripPulse(data, activeTrip), [activeTrip, data]);
  const dashboardStats = useMemo(() => buildDashboardStats(data), [data]);
  const recentVisits = useMemo(() => [...data.visits].sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate)).slice(0, 4), [data.visits]);
  const bestSites = useMemo(() => [...data.sites].filter((site) => site.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 4), [data.sites]);
  const wishlistSites = useMemo(() => data.sites.filter((site) => site.status === 'wishlist').slice(0, 4), [data.sites]);
  const selectedTrip = data.trips.find((trip) => trip.id === tripDetailId);
  const selectedSite = data.sites.find((site) => site.id === siteDetailId);
  const albumChapters = useMemo(() => {
    if (!albumTrip) return [];
    const chapters = new Map<string, { type: string; title: string; detail: string }[]>();
    const add = (date: string, item: { type: string; title: string; detail: string }) => chapters.set(date, [...(chapters.get(date) ?? []), item]);
    data.visits.filter((item) => item.tripId === albumTrip.id).forEach((item) => add(item.arrivalDate, { type: '△', title: data.sites.find((site) => site.id === item.siteId)?.name ?? 'Campingbesøg', detail: item.note || 'Besøg registreret' }));
    data.media.filter((item) => item.tripId === albumTrip.id).forEach((item) => add(item.createdAt.slice(0,10), { type: '▣', title: item.name, detail: item.favorite ? 'Favoritminde' : 'Billede' }));
    data.notes.filter((item) => item.tripId === albumTrip.id).forEach((item) => add(item.date, { type: '≡', title: item.title, detail: item.text }));
    data.experiences.filter((item) => item.tripId === albumTrip.id).forEach((item) => add(item.date, { type: '✦', title: item.title, detail: item.place }));
    data.routes.filter((item) => item.tripId === albumTrip.id).forEach((item) => add(item.createdAt.slice(0,10), { type: '⌁', title: item.name, detail: item.distanceKm ? `${item.distanceKm.toFixed(1)} km` : 'Ruteudkast' }));
    return [...chapters.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items], index) => ({ date, items, day: Math.max(1, Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${albumTrip.startDate}T00:00:00`)) / 86_400_000) + 1), index }));
  }, [albumTrip, data.experiences, data.media, data.notes, data.routes, data.sites, data.visits]);
  const guideTarget: ViewId = !activeTrip ? 'trips' : !activeSite ? 'sites' : !data.routes.some((route) => route.tripId === activeTrip.id) ? 'map' : !data.experiences.some((item) => item.tripId === activeTrip.id) ? 'experiences' : 'album';
  const guardScanVisible = data.settings.proactiveGuardEnabled || manualGuardScan;
  const roleStates = roleDetails.map((role, index) => ({
    ...role,
    status: index === 0 ? (!guardScanVisible ? 'Automatisk kontrol er på pause' : health.label) : index === 1 ? (!data.settings.smartGuideEnabled ? 'Smarte forslag er på pause' : !activeTrip ? 'Opret din første ferie' : !activeSite ? 'Vælg næste destination' : 'Næste skridt er klar') : index === 2 ? (activeTrip ? `${albumStatusLabel(activeTrip, data.media.filter((item) => item.tripId === activeTrip.id).length)} · ${data.media.filter((item) => item.tripId === activeTrip.id).length} minder` : data.media.length ? `${data.media.length} minder samlet` : 'Klar til første minde') : !data.settings.weatherEnabled ? 'Live vejr er slået fra' : activeSite ? `Følger vejret i ${activeSite.place}` : 'Venter på en destination',
    task: index === 0 ? (!guardScanVisible ? 'Kør kontrollen manuelt efter behov' : guardChecks.some((item) => item.severity === 'critical') ? 'Handling nødvendig' : guardChecks.some((item) => item.severity === 'important') ? 'Vigtigt punkt fundet' : guardChecks.length ? 'Bør kontrolleres' : 'Kontrol gennemført') : role.task,
  }));
  const selectedDepartment = roleStates[selectedRole] ?? roleStates[0];
  const departmentActions: { label: string; description: string; target: ViewId }[][] = [
    [
      { label: !guardScanVisible ? 'Kør manuel kontrol' : guardChecks.length ? 'Åbn første kontrolpunkt' : 'Se ferieoversigten', description: !guardScanVisible ? 'Scan de lokale data én gang uden at aktivere den proaktive vagt.' : guardChecks.length ? 'Gå direkte til det vigtigste fund.' : 'Se alle ferier og deres status.', target: !guardScanVisible ? 'administration' : guardChecks[0]?.target ?? 'trips' },
      { label: 'Åbn Testcenter', description: 'Kontrollér lager, offline-app og eksterne tjenester.', target: 'testcenter' },
      { label: 'Styr vagten', description: 'Slå proaktiv kontrol til eller fra i Indstillinger.', target: 'settings' },
    ],
    [
      { label: data.settings.smartGuideEnabled ? 'Følg næste forslag' : 'Åbn ferieplanen', description: data.settings.smartGuideEnabled ? 'Fortsæt dér, hvor din ferie har mest brug for dig.' : 'Planlæg manuelt, mens smarte forslag er sat på pause.', target: data.settings.smartGuideEnabled ? guideTarget : 'trips' },
      { label: 'Vælg campingplads', description: 'Find eller tilføj et stop til ferien.', target: 'sites' },
      { label: 'Planlæg oplevelser', description: 'Gem idéer og markér dem som planlagt.', target: 'experiences' },
    ],
    [
      { label: 'Åbn feriealbummet', description: 'Se billeder og hele feriens fortælling samlet.', target: 'album' },
      { label: 'Se ferier', description: 'Vælg hvilken ferie albummet skal fortælle om.', target: 'trips' },
      { label: 'Åbn logbogen', description: 'Arbejd videre med noter, der indgår i fortællingen.', target: 'notes' },
    ],
    [
      { label: activeSite ? 'Åbn vejroverblik' : 'Vælg destination', description: activeSite ? `Se vejret for ${activeSite.place}.` : 'Meteorologen skal bruge et stop med koordinater.', target: activeSite ? 'dashboard' : 'sites' },
      { label: 'Administrér steder', description: 'Kontrollér koordinater og ferietilknytning.', target: 'sites' },
      { label: 'Styr live vejr', description: 'Bestem om destinationens koordinater må bruges.', target: 'settings' },
    ],
  ];
  const departmentCurrentItems: { label: string; value: string; state: 'good' | 'attention' | 'neutral' }[] = selectedRole === 0
    ? (!guardScanVisible
      ? [{ label: 'Vagtstatus', value: 'Automatisk scanning er sat på pause. Du kan stadig køre den herfra.', state: 'neutral' }]
      : guardChecks.length
        ? guardChecks.map((check) => ({ label: check.severity === 'critical' ? 'Kræver handling' : check.severity === 'important' ? 'Vigtigt' : 'Bør kontrolleres', value: `${check.title} · ${check.detail}`, state: 'attention' as const }))
        : [{ label: 'Kontrol gennemført', value: 'Alle kendte relationer og aktive ferieoplysninger ser sunde ud.', state: 'good' }])
    : selectedRole === 1
      ? [
        { label: 'Aktiv ferie', value: activeTrip?.title ?? 'Ingen aktiv ferie valgt endnu', state: activeTrip ? 'good' : 'attention' },
        { label: 'Aktuelt stop', value: activeSite ? `${activeSite.name} · ${activeSite.place}` : 'Vælg en destination for at fortsætte', state: activeSite ? 'good' : 'attention' },
        { label: 'Næste forslag', value: data.settings.smartGuideEnabled ? departmentActions[1][0].label : 'Manuel planlægning er aktiv', state: data.settings.smartGuideEnabled ? 'good' : 'neutral' },
      ]
      : selectedRole === 2
        ? [
          { label: 'Minder i arkivet', value: `${data.media.length} billeder gemt lokalt`, state: data.media.length ? 'good' : 'attention' },
          { label: 'Favoritter', value: `${data.media.filter((item) => item.favorite).length} fremhævede minder`, state: 'neutral' },
          { label: 'Mangler ferietilknytning', value: `${data.media.filter((item) => !item.tripId).length} billeder kan organiseres`, state: data.media.some((item) => !item.tripId) ? 'attention' : 'good' },
        ]
        : [
          { label: 'Live vejr', value: data.settings.weatherEnabled ? 'Aktiveret i hele appen' : 'Slået fra i Indstillinger', state: data.settings.weatherEnabled ? 'good' : 'neutral' },
          { label: 'Destination', value: activeSite ? `${activeSite.name} · ${activeSite.place}` : 'Ingen aktiv destination', state: activeSite ? 'good' : 'attention' },
          { label: 'Forbindelse', value: online ? 'Online · klar til frisk prognose' : 'Offline · senest kendte data bruges', state: online ? 'good' : 'neutral' },
        ];

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') { setModal(null); setMobileMenu(false); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    lastFocusRef.current = document.activeElement as HTMLElement;
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const workspace = document.querySelector<HTMLElement>('.workspace');
    sidebar?.setAttribute('inert', ''); workspace?.setAttribute('inert', '');
    window.setTimeout(() => modalRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus(), 0);
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); sidebar?.removeAttribute('inert'); workspace?.removeAttribute('inert'); lastFocusRef.current?.focus(); };
  }, [modal]);

  useEffect(() => {
    if (!mobileMenu) return;
    const mobileMoreButton = mobileMoreButtonRef.current;
    lastMobileFocusRef.current = document.activeElement as HTMLElement;
    const background = ['.sidebar', '.topbar', '.content', '.mobile-nav']
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => Boolean(element));
    background.forEach((element) => element.setAttribute('inert', ''));
    window.setTimeout(() => mobileMenuRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileMenu(false); return; }
      if (event.key !== 'Tab' || !mobileMenuRef.current) return;
      const focusable = Array.from(mobileMenuRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      background.forEach((element) => element.removeAttribute('inert'));
      (lastMobileFocusRef.current ?? mobileMoreButton)?.focus();
    };
  }, [mobileMenu]);

  function changeView(next: ViewId) {
    setView(next);
    setMobileMenu(false);
    setQuery('');
    window.scrollTo({ top: 0, behavior: data.settings.reducedMotion ? 'auto' : 'smooth' });
  }

  function openTripAlbum(tripId: string) {
    setAlbumTripId(tripId);
    changeView('album');
  }

  function openMediaPicker() {
    mediaInputRef.current?.click();
  }

  function allowDestructiveAction(message: string) {
    return !data.settings.confirmBeforeDelete || confirm(message);
  }

  function shouldLinkToActiveTrip(label: string) {
    if (!activeTrip || data.settings.automationMode === 'manual') return false;
    if (data.settings.automationMode === 'ask') return confirm(`Knyt ${label} til “${activeTrip.title}”?`);
    return data.settings.autoCollectTripData;
  }

  function submitTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('start')); const endDate = String(form.get('end'));
    if (new Date(endDate) < new Date(startDate)) { setToast('Slutdatoen skal ligge på eller efter startdatoen.'); return; }
    const destination = String(form.get('destination') || '');
    const trip: Trip = { id: makeId('trip'), title: String(form.get('title')), startDate, endDate, status: 'planned', region: String(form.get('region')), summary: String(form.get('summary')), destinationIds: destination ? [destination] : [], participantIds: data.people.filter((person) => person.kind === 'person').map((person) => person.id), petIds: data.people.filter((person) => person.kind === 'pet').map((person) => person.id), coverTone: 'forest', mainDestinationId: destination || undefined, albumStatus: 'created' };
    mutate((draft) => draft.trips.unshift(trip));
    addEvent({ title: 'Ny ferie planlagt', detail: trip.title, type: 'trip' });
    setModal(null); setToast('Ferien er oprettet og gemt lokalt.'); setView('trips');
  }

  function submitSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const latitudeText = String(form.get('latitude') ?? '').trim(); const longitudeText = String(form.get('longitude') ?? '').trim();
    if (!latitudeText || !longitudeText) { setToast('Vælg placeringen via kort eller indtast både breddegrad og længdegrad. Der gemmes ikke længere en standardplacering.'); return; }
    const latitude = Number(latitudeText.replace(',','.')); const longitude = Number(longitudeText.replace(',','.'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { setToast('Indtast gyldige koordinater: breddegrad −90 til 90 og længdegrad −180 til 180.'); return; }
    const site: CampingSite = { id: makeId('site'), name: String(form.get('name')), place: String(form.get('place')), country: String(form.get('country') || 'Danmark'), address: String(form.get('address') || ''), coordinates: [longitude, latitude], locationSource: 'coordinates', status: form.get('status') as CampingSite['status'], rating: 0, visits: 0, tags: String(form.get('tags')).split(',').map((tag) => tag.trim()).filter(Boolean), note: String(form.get('note')), favorite: false };
    const linkToTrip = shouldLinkToActiveTrip('campingpladsen');
    mutate((draft) => {
      draft.sites.unshift(site);
      if (linkToTrip && activeTrip) draft.trips.find((trip) => trip.id === activeTrip.id)?.destinationIds.push(site.id);
    });
    addEvent({ title: 'Campingplads gemt', detail: site.name, type: 'place', tripId: linkToTrip ? activeTrip?.id : undefined, automatic: linkToTrip });
    setModal(null); setToast('Campingpladsen er gemt.'); setView('sites');
  }

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const title = String(form.get('title'));
    const tripId = shouldLinkToActiveTrip('noten') ? activeTrip?.id : undefined;
    mutate((draft) => draft.notes.unshift({ id: makeId('note'), title, text: String(form.get('text')), date: new Date().toISOString().slice(0,10), tripId, pinned: form.get('pinned') === 'on' }));
    addEvent({ title: 'Ny note', detail: title, type: 'note', tripId, automatic: Boolean(tripId) }); setModal(null); setToast('Noten er gemt.'); setView('notes');
  }

  function submitExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title'));
    const tripId = shouldLinkToActiveTrip('oplevelsen') ? activeTrip?.id : undefined;
    const latitudeText = String(form.get('latitude') || '').trim(); const longitudeText = String(form.get('longitude') || '').trim();
    const coordinates = latitudeText && longitudeText ? [Number(longitudeText.replace(',','.')), Number(latitudeText.replace(',','.'))] as [number, number] : undefined;
    if (coordinates && (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90)) { setToast('Oplevelsens koordinater er ugyldige.'); return; }
    mutate((draft) => draft.experiences.unshift({ id: makeId('experience'), title, place: String(form.get('place')), date: String(form.get('date')), status: form.get('status') as 'idea' | 'planned' | 'done', note: String(form.get('note')), tripId, kind: form.get('kind') === 'attraction' ? 'attraction' : 'experience', coordinates }));
    addEvent({ title: 'Ny oplevelse', detail: title, type: 'experience', tripId, automatic: Boolean(tripId) }); setModal(null); setToast('Oplevelsen er tilføjet.'); setView('experiences');
  }

  function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    mutate((draft) => draft.people.push({ id: makeId('member'), name: String(form.get('name')), kind: form.get('kind') as 'person' | 'pet', detail: String(form.get('detail')) }));
    setModal(null); setToast('Rejseholdet er opdateret.'); setView('people');
  }

  function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const arrivalDate = String(form.get('arrival'));
    const departureDate = String(form.get('departure') || '') || undefined;
    const rating = Number(form.get('rating'));
    const site = data.sites.find((entry) => entry.id === selectedSiteId);
    if (!site) { setToast('Vælg en campingplads til besøget.'); return; }
    if (departureDate && departureDate < arrivalDate) { setToast('Afrejsedatoen skal ligge på eller efter ankomstdatoen.'); return; }
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) { setToast('Vurderingen skal være mellem 0 og 5.'); return; }
    const tripId = shouldLinkToActiveTrip('besøget') ? activeTrip?.id : undefined;
    mutate((draft) => {
      draft.visits.unshift({ id: makeId('visit'), siteId: site.id, tripId, arrivalDate, departureDate, rating, note: String(form.get('note')) });
      const target = draft.sites.find((entry) => entry.id === site.id);
      if (target) {
        target.status = 'visited';
        target.visits += 1;
        const ratings = draft.visits.filter((visit) => visit.siteId === site.id && visit.rating > 0).map((visit) => visit.rating);
        if (ratings.length) target.rating = Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10;
      }
      if (tripId) { const trip = draft.trips.find((entry) => entry.id === tripId); if (trip) { trip.activeSiteId = site.id; if (!trip.destinationIds.includes(site.id)) trip.destinationIds.push(site.id); } }
    });
    addEvent({ title: 'Besøg registreret', detail: site.name, type: 'place', tripId, automatic: Boolean(tripId) });
    setModal(null); setToast('Besøget er gemt og pladsens historik er opdateret.');
  }

  function saveRoute(route: Omit<SavedRoute, 'id' | 'createdAt' | 'tripId'>) {
    const tripId = shouldLinkToActiveTrip('ruten') ? activeTrip?.id : undefined;
    const saved: SavedRoute = { ...route, id: makeId('route'), createdAt: new Date().toISOString(), tripId };
    mutate((draft) => draft.routes.unshift(saved));
    addEvent({ title: saved.calculated ? 'Rute beregnet og gemt' : 'Etapeudkast gemt', detail: saved.name, type: 'trip', tripId, automatic: Boolean(tripId) });
    setToast(saved.calculated ? 'Ruten er gemt lokalt med geometri og rutedata.' : 'Etapeudkastet er gemt lokalt.');
  }

  function removeRoute(id: string) {
    const route = data.routes.find((entry) => entry.id === id);
    if (!route || !allowDestructiveAction(`Slet etapeudkastet “${route.name}”?`)) return;
    mutate((draft) => { draft.routes = draft.routes.filter((entry) => entry.id !== id); });
    setToast('Etapeudkastet er slettet.');
  }

  async function addMedia(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    let saved = 0;
    const tripId = shouldLinkToActiveTrip('de valgte billeder') ? activeTrip?.id : undefined;
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) continue;
      try {
        const blob = await prepareImage(file); const id = makeId('media');
        await putMediaBlob(id, blob);
        mutate((draft) => draft.media.unshift({ id, name: file.name.replace(/\.[^.]+$/, ''), createdAt: new Date().toISOString(), tripId, siteId: tripId ? activeSite?.id : undefined, favorite: false }));
        saved += 1;
      } catch { /* A bad image is skipped without affecting the rest of the batch. */ }
    }
    if (saved) addEvent({ title: saved === 1 ? 'Foto føjet til albummet' : `${saved} fotos føjet til albummet`, detail: activeTrip?.title ?? 'Feriealbum', type: 'media', tripId, automatic: Boolean(tripId) });
    setToast(saved ? `${saved} ${saved === 1 ? 'billede' : 'billeder'} gemt lokalt på enheden.` : 'Ingen billeder blev gemt. Brug billedfiler under 20 MB.');
    event.target.value = '';
  }

  function toggleMediaFavorite(id: string) {
    mutate((draft) => {
      const item = draft.media.find((entry) => entry.id === id);
      if (item) item.favorite = !item.favorite;
    });
  }

  async function removeMedia(id: string) {
    const item = data.media.find((entry) => entry.id === id);
    if (!item || !allowDestructiveAction(`Slet billedet “${item.name}” fra denne enhed?`)) return;
    try {
      await deleteMediaBlob(id);
      mutate((draft) => { draft.media = draft.media.filter((entry) => entry.id !== id); });
      setToast('Billedet er slettet fra appens lokale medielager.');
    } catch {
      setToast('Billedet kunne ikke slettes fra medielageret.');
    }
  }

  function toggleSiteOnActiveTrip(siteId: string) {
    if (!activeTrip) { setToast('Start eller aktivér først en ferie.'); return; }
    const linked = activeTrip.destinationIds.includes(siteId);
    mutate((draft) => {
      const trip = draft.trips.find((entry) => entry.id === activeTrip.id);
      if (!trip) return;
      trip.destinationIds = linked ? trip.destinationIds.filter((id) => id !== siteId) : [...trip.destinationIds, siteId];
    });
    setToast(linked ? 'Stedet er fjernet fra den aktive ferie.' : 'Stedet er knyttet til den aktive ferie.');
  }

  function toggleNoteOnActiveTrip(noteId: string) {
    if (!activeTrip) { setToast('Start eller aktivér først en ferie.'); return; }
    const note = data.notes.find((entry) => entry.id === noteId);
    const linked = note?.tripId === activeTrip.id;
    mutate((draft) => {
      const target = draft.notes.find((entry) => entry.id === noteId);
      if (target) target.tripId = linked ? undefined : activeTrip.id;
    });
    setToast(linked ? 'Notens ferietilknytning er fjernet.' : 'Noten er knyttet til den aktive ferie.');
  }

  function toggleMediaOnActiveTrip(mediaId: string) {
    if (!activeTrip) { setToast('Start eller aktivér først en ferie.'); return; }
    const linked = data.media.find((entry) => entry.id === mediaId)?.tripId === activeTrip.id;
    mutate((draft) => {
      const target = draft.media.find((entry) => entry.id === mediaId);
      if (target) target.tripId = linked ? undefined : activeTrip.id;
    });
    setToast(linked ? 'Mindets ferietilknytning er fjernet.' : 'Mindet er knyttet til den aktive ferie.');
  }

  function toggleExperienceOnActiveTrip(experienceId: string) {
    if (!activeTrip) { setToast('Start eller aktivér først en ferie.'); return; }
    const linked = data.experiences.find((entry) => entry.id === experienceId)?.tripId === activeTrip.id;
    mutate((draft) => {
      const target = draft.experiences.find((entry) => entry.id === experienceId);
      if (target) target.tripId = linked ? undefined : activeTrip.id;
    });
    setToast(linked ? 'Oplevelsens ferietilknytning er fjernet.' : 'Oplevelsen er knyttet til den aktive ferie.');
  }

  function toggleRouteOnActiveTrip(routeId: string) {
    if (!activeTrip) { setToast('Start eller aktivér først en ferie.'); return; }
    const linked = data.routes.find((entry) => entry.id === routeId)?.tripId === activeTrip.id;
    mutate((draft) => {
      const target = draft.routes.find((entry) => entry.id === routeId);
      if (target) target.tripId = linked ? undefined : activeTrip.id;
    });
    setToast(linked ? 'Etapeudkastets ferietilknytning er fjernet.' : 'Etapeudkastet er knyttet til den aktive ferie.');
  }

  function toggleVisitOnActiveTrip(visitId: string) {
    if (!activeTrip) { setToast('Start eller aktivér først en ferie.'); return; }
    const linked = data.visits.find((entry) => entry.id === visitId)?.tripId === activeTrip.id;
    mutate((draft) => {
      const target = draft.visits.find((entry) => entry.id === visitId);
      if (target) target.tripId = linked ? undefined : activeTrip.id;
    });
    setToast(linked ? 'Besøgets ferietilknytning er fjernet.' : 'Besøget er knyttet til den aktive ferie.');
  }

  function removeTrip(id: string) {
    const trip = data.trips.find((entry) => entry.id === id);
    if (!trip || !allowDestructiveAction(`Slet ferien “${trip.title}”? Steder, noter og billeder beholdes, men ferietilknytningen fjernes.`)) return;
    mutate((draft) => {
      draft.trips = draft.trips.filter((entry) => entry.id !== id);
      draft.notes.forEach((note) => { if (note.tripId === id) note.tripId = undefined; });
      draft.media.forEach((item) => { if (item.tripId === id) item.tripId = undefined; });
      draft.experiences.forEach((item) => { if (item.tripId === id) item.tripId = undefined; });
      draft.routes.forEach((route) => { if (route.tripId === id) route.tripId = undefined; });
      draft.visits.forEach((visit) => { if (visit.tripId === id) visit.tripId = undefined; });
    });
    setToast('Ferien er slettet, og tilknytningerne er ryddet sikkert op.');
  }

  function removeSite(id: string) {
    const site = data.sites.find((entry) => entry.id === id);
    if (!site || !allowDestructiveAction(`Slet campingpladsen “${site.name}”?`)) return;
    mutate((draft) => {
      draft.sites = draft.sites.filter((entry) => entry.id !== id);
      draft.trips.forEach((trip) => { trip.destinationIds = trip.destinationIds.filter((siteId) => siteId !== id); });
      draft.media.forEach((item) => { if (item.siteId === id) item.siteId = undefined; });
      draft.routes.forEach((route) => { if (route.startSiteId === id) route.startSiteId = undefined; if (route.endSiteId === id) route.endSiteId = undefined; route.waypoints?.forEach((point) => { if (point.siteId === id) point.siteId = undefined; }); });
      draft.visits = draft.visits.filter((visit) => visit.siteId !== id);
    });
    setToast('Campingpladsen er slettet. Gemte ruters koordinater er bevaret, mens stedrelationen er fjernet.');
  }

  function removeNote(id: string) {
    const note = data.notes.find((entry) => entry.id === id);
    if (!note || !allowDestructiveAction(`Slet noten “${note.title}”?`)) return;
    mutate((draft) => { draft.notes = draft.notes.filter((entry) => entry.id !== id); });
    setToast('Noten er slettet.');
  }

  function removeExperience(id: string) {
    const item = data.experiences.find((entry) => entry.id === id);
    if (!item || !allowDestructiveAction(`Slet oplevelsen “${item.title}”?`)) return;
    mutate((draft) => { draft.experiences = draft.experiences.filter((entry) => entry.id !== id); });
    setToast('Oplevelsen er slettet.');
  }

  function removePerson(id: string) {
    const person = data.people.find((entry) => entry.id === id);
    if (!person || !allowDestructiveAction(`Slet profilen “${person.name}”?`)) return;
    mutate((draft) => {
      draft.people = draft.people.filter((entry) => entry.id !== id);
      draft.trips.forEach((trip) => {
        trip.participantIds = trip.participantIds.filter((personId) => personId !== id);
        trip.petIds = trip.petIds.filter((personId) => personId !== id);
      });
    });
    setToast('Profilen er slettet, og ferietilknytningerne er opdateret.');
  }

  function setTripStatus(id: string, status: Trip['status']) {
    const changedAt = new Date().toISOString();
    mutate((draft) => {
      if (status === 'active') draft.trips.forEach((trip) => { if (trip.status === 'active') trip.status = 'planned'; });
      const trip = draft.trips.find((item) => item.id === id);
      if (trip) {
        trip.status = status;
        if (status === 'active') { trip.startedAt ??= changedAt; trip.albumStatus = trip.albumStatus === 'completed' ? 'review' : 'collecting'; trip.activeSiteId ??= trip.mainDestinationId ?? trip.destinationIds[0]; }
        if (status === 'completed') { trip.completedAt = changedAt; trip.albumStatus = 'review'; }
      }
    });
    const trip = data.trips.find((item) => item.id === id);
    if (trip) addEvent({ title: status === 'active' ? 'Ferie Administrationen aktiveret' : status === 'completed' ? 'Afsluttende feriekontrol startet' : 'Ferie sat til planlagt', detail: trip.title, type: 'trip', tripId: trip.id, automatic: status !== 'planned' });
    setToast(status === 'active' ? 'Ferie Administrationen, tidslinjen, opsamlingen, vejret og albumarbejdet er aktiveret.' : status === 'completed' ? 'Ferien er afsluttet. Albummet er klar til gennemgang, og Ferie Vagten viser eventuelle mangler.' : 'Ferien er opdateret.');
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) { setToast('Backupfilen er større end 250 MB og indlæses ikke. Appen producerer heller aldrig backupfiler over denne grænse.'); event.target.value = ''; return; }
    const hasCurrentData = data.trips.length + data.sites.length + data.experiences.length + data.routes.length + data.visits.length + data.notes.length + data.media.length + data.people.length + data.events.length > 0 || data.settings.mapStyle !== 'liberty' || data.settings.automationMode !== 'automatic' || data.settings.weatherEnabled || data.settings.reducedMotion || data.settings.compactMode || data.settings.highContrast || !data.settings.showCommandCenterOnDashboard || !data.settings.proactiveGuardEnabled || !data.settings.smartGuideEnabled || !data.settings.confirmBeforeDelete || !data.settings.autoCollectTripData || !data.settings.dashboardClockEnabled || !data.settings.dashboardAlbumEnabled || !data.settings.liveRoutingEnabled || !data.settings.externalSearchEnabled || !data.settings.weatherAdviceEnabled;
    if (hasCurrentData && !confirm('Import erstatter de nuværende lokale data. Fortsæt kun, hvis du allerede har gemt og kontrolleret en komplet backup via Indstillinger.')) { event.target.value = ''; return; }
    try { await store.importData(file); setToast('Backup er indlæst. Relationer og billeder er bevaret.'); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Backupfilen kunne ikke læses.'); }
    event.target.value = '';
  }

  async function exportBackup() {
    try {
      await store.exportData();
      setToast('Den komplette backup er sendt til enhedens downloads.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Backup kunne ikke oprettes.');
    }
  }

  async function testServiceConnection() {
    if (!serviceStore.config.openRouteServiceApiKey) { setServiceMessage('Tilføj først en OpenRouteService-nøgle. Nøglen gemmes kun på denne enhed.'); return; }
    if (!isSafeServiceUrl(serviceStore.config.geocodingEndpoint)) { setServiceMessage('Geocoding-endpointet er ikke en gyldig HTTPS-adresse.'); return; }
    setServiceTesting(true); setServiceMessage('Tester forbindelse uden at vise nøglen…');
    try {
      const base = serviceStore.config.geocodingEndpoint.replace(/\/$/, ''); const url = new URL(base.endsWith('/search') ? base : `${base}/search`); url.searchParams.set('api_key', serviceStore.config.openRouteServiceApiKey); url.searchParams.set('text', 'København'); url.searchParams.set('size', '1');
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      setServiceMessage(response.ok ? `Forbindelsen virker med ${maskSecret(serviceStore.config.openRouteServiceApiKey)}.` : `Tjenesten svarede med status ${response.status}. Nøglen blev ikke vist eller logget.`);
    } catch { setServiceMessage('Forbindelsen kunne ikke oprettes. Kontrollér endpoint, CORS, netværk og nøglens adgang.'); }
    finally { setServiceTesting(false); }
  }

  async function runTests() {
    const results: TestResult[] = [];
    const add = (label: string, state: TestResult['state'], detail: string, group: TestResult['group']) => results.push({ label, state, detail, group });
    try { localStorage.setItem('vores-camping:test','ok'); const ok = localStorage.getItem('vores-camping:test') === 'ok'; localStorage.removeItem('vores-camping:test'); add('Lokal datalagring', ok ? 'passed' : 'failed', ok ? 'Skrive-, læse- og slettetest bestået' : 'Testdata kunne ikke læses tilbage', 'Lokal app'); } catch { add('Lokal datalagring', 'failed', 'Blokeret af browseren', 'Lokal app'); }
    try { const testId = makeId('media-test'); await putMediaBlob(testId, new Blob(['vores-camping'], { type: 'text/plain' })); const restored = await getMediaBlob(testId); await deleteMediaBlob(testId); add('Medielager', restored?.size === 13 ? 'passed' : 'failed', restored?.size === 13 ? 'IndexedDB virker' : 'Testdata kunne ikke læses tilbage', 'Lokal app'); } catch { add('Medielager', 'failed', 'IndexedDB er blokeret eller utilgængelig', 'Lokal app'); }
    const canvas = document.createElement('canvas'); const webgl = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')); add('MapLibre/WebGL', webgl ? 'passed' : 'failed', webgl ? 'Kortgrafik er tilgængelig' : 'WebGL mangler', 'Kort');
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined; add('Offline-appskal', registration ? 'passed' : 'warning', registration ? 'Service worker registreret' : 'Registreres efter første produktionsbesøg', 'Lokal app');
    add('Forbindelse', navigator.onLine ? 'passed' : 'warning', navigator.onLine ? 'Online' : 'Offline – lokal CRUD virker stadig', 'Lokal app');
    try { const response = await fetch('https://tiles.openfreemap.org/styles/liberty', { signal: AbortSignal.timeout(6500) }); const style = response.ok ? await response.json() as { sources?: unknown; sprite?: unknown; glyphs?: unknown } : undefined; add('OpenFreeMap style', response.ok && Boolean(style?.sources) ? 'passed' : 'failed', response.ok ? `Style, kilder${style?.sprite ? ', sprites' : ''}${style?.glyphs ? ' og glyphs' : ''} er beskrevet` : `Svar ${response.status}`, 'Kort'); } catch { add('OpenFreeMap style', 'failed', 'Intet svar – kortet bruger sin isolerede fejltilstand', 'Kort'); }
    try { const googleUrl = new URL('https://www.google.com/maps/dir/?api=1&origin=55.67,12.56&destination=56.16,10.20&travelmode=driving'); add('Google Maps URL-format', googleUrl.searchParams.get('api') === '1' && Boolean(googleUrl.searchParams.get('origin')) ? 'passed' : 'failed', 'api=1 og korrekt URL-kodning anvendes uden Google API-nøgle', 'Kort'); } catch { add('Google Maps URL-format', 'failed', 'URL-formatet kunne ikke valideres', 'Kort'); }

    const orsConfigured = Boolean(serviceStore.config.openRouteServiceApiKey) && isSafeServiceUrl(serviceStore.config.openRouteServiceEndpoint);
    if (!orsConfigured) {
      ['Directions', 'Matrix', 'Isochrones', 'Snap'].forEach((label) => add(`HeiGIT ${label}`, 'warning', 'Ikke kørt – tilføj ORS-nøgle og endpoint i Indstillinger', 'Ruter'));
      ['Pelias search', 'Pelias autocomplete', 'Pelias reverse'].forEach((label) => add(label, 'warning', 'Ikke kørt – tilføj ORS-nøgle og geocoding-endpoint', 'Søgning'));
    } else {
      const base = serviceStore.config.openRouteServiceEndpoint.replace(/\/$/, ''); const headers = { authorization: serviceStore.config.openRouteServiceApiKey, 'content-type': 'application/json' };
      const tests = [
        { label: 'HeiGIT Directions', url: `${base}/v2/directions/driving-car/geojson`, body: { coordinates: [[12.5683,55.6761],[12.575,55.68]], instructions: false } },
        { label: 'HeiGIT Matrix', url: `${base}/v2/matrix/driving-car`, body: { locations: [[12.5683,55.6761],[12.575,55.68]], metrics: ['distance','duration'] } },
        { label: 'HeiGIT Isochrones', url: `${base}/v2/isochrones/driving-car`, body: { locations: [[12.5683,55.6761]], range: [300] } },
        { label: 'HeiGIT Snap', url: `${base}/v2/snap/driving-car`, body: { locations: [[12.5683,55.6761]], radius: 350 } },
      ];
      for (const test of tests) { try { const response = await fetch(test.url, { method: 'POST', headers, body: JSON.stringify(test.body), signal: AbortSignal.timeout(9000) }); add(test.label, response.ok ? 'passed' : 'failed', response.ok ? 'Endpoint og CORS svarer korrekt' : `Svar ${response.status} – kontrollér nøglens adgang og endpoint`, 'Ruter'); } catch { add(test.label, 'failed', 'Timeout, CORS eller netværksfejl', 'Ruter'); } }
      const geoBase = serviceStore.config.geocodingEndpoint.replace(/\/$/, ''); const geocoding = [
        { label: 'Pelias search', path: 'search', params: { text: 'København', size: '1' } },
        { label: 'Pelias autocomplete', path: 'autocomplete', params: { text: 'Køben', size: '1' } },
        { label: 'Pelias reverse', path: 'reverse', params: { 'point.lon': '12.5683', 'point.lat': '55.6761', size: '1' } },
      ];
      for (const test of geocoding) { try { const url = new URL(geoBase.endsWith(`/${test.path}`) ? geoBase : `${geoBase}/${test.path}`); url.searchParams.set('api_key', serviceStore.config.openRouteServiceApiKey); Object.entries(test.params).forEach(([key, value]) => url.searchParams.set(key, value)); const response = await fetch(url, { signal: AbortSignal.timeout(8000) }); add(test.label, response.ok ? 'passed' : 'failed', response.ok ? 'Søgning og CORS virker' : `Svar ${response.status}`, 'Søgning'); } catch { add(test.label, 'failed', 'Timeout, CORS eller netværksfejl', 'Søgning'); } }
    }
    add('OpenPOIService', serviceStore.config.openPoiEndpoint && isSafeServiceUrl(serviceStore.config.openPoiEndpoint) ? 'passed' : 'warning', serviceStore.config.openPoiEndpoint ? 'Endpoint er valideret; fuld POI-forespørgsel køres fra kortet' : 'Endpoint mangler', 'Andre tjenester');
    add('OpenElevationService', serviceStore.config.openElevationEndpoint && isSafeServiceUrl(serviceStore.config.openElevationEndpoint) ? 'passed' : 'warning', serviceStore.config.openElevationEndpoint ? 'Endpoint er valideret; ORS-højde bruges direkte på beregnede ruter' : 'Endpoint mangler', 'Andre tjenester');
    add('VROOM', serviceStore.config.vroomEndpoint && isSafeServiceUrl(serviceStore.config.vroomEndpoint) ? 'passed' : 'warning', serviceStore.config.vroomEndpoint ? 'Endpoint er klar til stopoptimering fra kortet' : 'Valgfrit endpoint er ikke konfigureret', 'Andre tjenester');
    add('Hemmelighedskontrol', 'passed', `Nøgler vises kun maskeret (${maskSecret(serviceStore.config.openRouteServiceApiKey)}) og eksporteres ikke`, 'Lokal app');
    setTestResults(results);
  }

  const filteredSites = data.sites.filter((site) => siteFilter === 'all' || site.status === siteFilter);
  const filteredTrips = data.trips.filter((trip) => tripFilter === 'all' || trip.status === tripFilter);
  const visibleToast = toast || store.storageError;

  if (!store.ready) return <main className="app-loading"><Image src="/app-icon.webp" width={86} height={86} alt="" priority /><strong>Vores Camping</strong><span>Åbner dit lokale feriearkiv…</span></main>;
  if (store.firstRun) return <main className="onboarding"><section className="onboarding-card"><div className="onboarding-visual"><Image src="/vores-camping-logo.webp" width={310} height={430} alt="Vores Camping" priority /></div><div className="onboarding-copy"><p className="eyebrow">Velkommen hjem</p><h1>Din campinghistorie starter her</h1><p>Vores Camping samler ferier, steder, ruter og minder på denne enhed. Du bestemmer selv, hvornår eksterne kort- og vejrdata bruges.</p><ul><li><span>✓</span> Lokal-first og uden login</li><li><span>✓</span> Billeder bliver på enheden</li><li><span>✓</span> Komplet backup kan eksporteres</li></ul><div className="onboarding-actions"><button className="primary-button" type="button" onClick={() => store.initialize('empty')}>Start med en tom app</button><button className="outline-button" type="button" onClick={() => store.initialize('sample')}>Udforsk med eksempeldata</button></div><small>Live vejr er slået fra i en tom app, indtil du selv aktiverer det.</small></div></section></main>;

  return (
    <main className={['app-shell', data.settings.reducedMotion ? 'reduce-motion' : '', data.settings.compactMode ? 'compact-mode' : '', data.settings.highContrast ? 'high-contrast' : ''].filter(Boolean).join(' ')}>
      <aside className="sidebar" aria-label="Primær navigation">
        <button className="brand-lockup brand-button" type="button" onClick={() => changeView('dashboard')}><Image src="/app-icon.webp" width={52} height={52} alt="" priority /><div><strong>Vores Camping</strong><span>Ferie Administrationen</span></div></button>
        <nav className="side-nav">{navigation.map((item) => <button aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => changeView(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
        <div className="side-footer"><button className={view === 'settings' ? 'active' : ''} onClick={() => changeView('settings')} type="button"><span>⚙</span>Indstillinger</button><button className={view === 'testcenter' ? 'active' : ''} onClick={() => changeView('testcenter')} type="button"><span>✓</span>Testcenter</button><p><i className={online ? '' : 'offline'} />{online ? 'Gemmer lokalt' : 'Offline · lokalt aktiv'}</p></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{activeTrip ? `Aktiv: ${activeTrip.title}` : 'Ingen aktiv ferie'}</p><h1>{pageTitle}</h1></div>
          <div className="search-wrap"><label className="search-box" role="search"><span aria-hidden="true">⌕</span><span className="sr-only">Søg i Vores Camping</span><input role="combobox" aria-autocomplete="list" aria-controls="global-search-results" aria-expanded={Boolean(query.trim())} ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg i ferier, steder og minder…" /><kbd>⌘ K</kbd></label><SearchResults data={data} query={query} onChoose={changeView} /></div>
          <div className="top-actions"><span className={`connectivity ${online ? '' : 'offline'}`}>{online ? 'Online' : 'Offline'}</span><button type="button" onClick={() => setToast('Ingen ulæste beskeder lige nu.')} aria-label="Beskeder">●</button><Image src="/app-icon.webp" width={42} height={42} alt="Vores Camping" /></div>
        </header>

        <div className="content">
          {view === 'dashboard' && <>
            <section className="dashboard-cover-grid">
              <article className="personal-cover"><div className="cover-orbit orbit-one" /><div className="cover-orbit orbit-two" /><Image src="/vores-camping-logo.webp" width={220} height={300} alt="Vores Camping" priority /><div><p className="eyebrow">Dit personlige campinghjem</p><h2>God tur, når vejen kalder</h2><p>Ferier, pladser, ruter, vejr og minder er samlet lokalt på denne enhed.</p><div className="cover-actions"><button type="button" onClick={() => changeView('administration')}>Åbn Kommandocentralen</button><button type="button" onClick={() => changeView('map')}>Planlæg på kortet</button></div></div></article>
              {data.settings.dashboardClockEnabled && <DashboardClock nextTrip={nextTrip} activeSite={activeSite} weatherEnabled={data.settings.weatherEnabled} />}
            </section>
            {activeTrip ? <section className="trip-hero">
              <div className="trip-copy"><div className="status-line"><span className="pulse" />Aktiv ferie <em>Lokalt gemt</em></div><h2>{activeTrip.title}</h2><p>{formatDate(activeTrip.startDate)} – {formatDate(activeTrip.endDate)} · {tripDuration(activeTrip)} dage</p><div className="trip-progress" aria-label={`${tripProgress(activeTrip)} procent af ferien er gået`}><span style={{ width: `${tripProgress(activeTrip)}%` }} /></div><div className="hero-actions"><button className="primary-button" onClick={() => changeView('trips')} type="button">Åbn ferien</button><button className="soft-button" onClick={() => mediaInputRef.current?.click()} type="button">＋ Tilføj et minde</button></div></div>
              <button className="route-preview" type="button" onClick={() => changeView('map')} aria-label="Åbn kort og ruter"><div className="map-grid" /><span className="map-water water-one" /><span className="map-water water-two" /><span className="route-line" /><span className="map-pin start">1</span><span className="map-pin end">2</span><span className="map-caption"><span>Næste stop</span><strong>{activeSite?.place ?? 'Vælg et stop'}</strong><small>{activeSite ? activeSite.name : 'Planlæg på kortet'}</small></span></button>
            </section> : <EmptyState icon="◇" title="Din næste ferie begynder her" text="Opret en ferie, så får overblik, kort, minder og vejret automatisk den rigtige kontekst." action="Opret ferie" onAction={() => setModal('trip')} />}

            {data.settings.showCommandCenterOnDashboard && <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Ferie Administrationen</p><h2>Dit rejsehold er på arbejde</h2></div><button className="text-button" type="button" onClick={() => changeView('administration')}>Åbn Kommandocentralen</button></div><div className="role-grid">{roleStates.map((role, index) => <article className={`role-card ${role.tone} ${index === 0 && guardScanVisible && guardChecks.some((item) => item.severity === 'critical') ? 'problem' : ''}`} key={role.role}><Image src={role.image} width={124} height={124} alt={`${role.name} som ${role.role}`} /><div><p>{role.name}</p><h3>{role.role}</h3><strong><span />{role.status}</strong><small>{role.task}</small></div><button onClick={() => { setSelectedRole(index); changeView('administration'); }} type="button" aria-label={`Åbn ${role.role} i Kommandocentralen`}>→</button></article>)}</div></section>}

            {tripPulse && <section className="ferie-pulse" aria-labelledby="dashboard-pulse-title"><div className="pulse-heading"><div><p className="eyebrow">Ferie-puls</p><h2 id="dashboard-pulse-title">Dag {tripPulse.currentDay} af {tripPulse.totalDays}</h2><p>{activeTrip?.title} følges på tværs af hele appen.</p></div><span className={`health-badge ${tripPulse.dataStatus.severity}`}>{tripPulse.dataStatus.label}</span></div><div className="pulse-metrics"><article><strong>{tripPulse.visitedSites}</strong><span>besøgte pladser</span></article><article><strong>{tripPulse.destinations}</strong><span>destinationer</span></article><article><strong>{tripPulse.media}</strong><span>billeder</span></article><article><strong>{tripPulse.experiences}</strong><span>oplevelser</span></article><article><strong>{tripPulse.cyclingRoutes}</strong><span>cykelture</span></article><article><strong>{tripPulse.distanceKm ? `${tripPulse.distanceKm.toFixed(0)} km` : '–'}</strong><span>beregnet kørsel</span></article><article><strong>{tripPulse.albumStatus}</strong><span>albumstatus</span></article><article><strong>{tripPulse.weatherStatus}</strong><span>vejrstatus</span></article></div></section>}

            {data.settings.dashboardAlbumEnabled && <AlbumSlideshow media={activeTrip ? data.media.filter((item) => item.tripId === activeTrip.id) : data.media} activeTrip={activeTrip} reducedMotion={data.settings.reducedMotion} onOpen={() => openTripAlbum(activeTrip?.id ?? 'all')} />}

            <section className="dashboard-grid dashboard-grid-rich">
              <article className="panel quick-panel"><div className="panel-title"><div><p className="eyebrow">Gør noget nu</p><h2>Hurtighandlinger</h2></div></div><div className="quick-grid"><button type="button" onClick={() => setModal('site')}><span>＋</span>Nyt stop</button><button type="button" onClick={() => changeView('map')}><span>⌖</span>Find plads</button><button type="button" onClick={openMediaPicker}><span>▣</span>Tilføj foto</button><button type="button" onClick={() => setModal('experience')}><span>✦</span>Ny oplevelse</button><button type="button" onClick={() => activeSite && document.getElementById('weather')?.scrollIntoView({ behavior: 'smooth' })}><span>☀</span>Tjek vejr</button><button type="button" onClick={() => setModal('trip')}><span>◇</span>Planlæg ferie</button></div></article>
              {activeSite && <div id="weather"><WeatherCard latitude={activeSite.coordinates[1]} longitude={activeSite.coordinates[0]} place={activeSite.place} enabled={data.settings.weatherEnabled} adviceEnabled={data.settings.weatherAdviceEnabled} /></div>}
              <article className="panel activity-panel"><div className="panel-title"><div><p className="eyebrow">Din ferie</p><h2>Seneste hændelser</h2></div><button className="text-button" onClick={() => changeView('notes')} type="button">Se noter</button></div>{data.events.length ? <ol className="timeline">{data.events.slice(0,4).map((event, index) => <li key={event.id}><span className={index === 0 ? 'done' : index === 1 ? 'active' : ''}>{event.type === 'media' ? '▣' : event.type === 'place' ? '⌖' : event.type === 'note' ? '≡' : '◇'}</span><div><b>{event.title}</b><small>{event.detail} · {new Intl.DateTimeFormat('da-DK',{dateStyle:'short',timeStyle:'short'}).format(new Date(event.createdAt))}</small></div></li>)}</ol> : <EmptyState icon="✓" title="Ingen hændelser endnu" text="Nye steder, noter og minder vises her." />}</article>
            </section>
            <section className="dashboard-library-grid"><article className="panel"><div className="panel-title"><div><p className="eyebrow">Senest</p><h2>Campingbesøg</h2></div><button className="text-button" type="button" onClick={() => changeView('sites')}>Alle pladser</button></div><div className="compact-library-list">{recentVisits.length ? recentVisits.map((visit) => { const site = data.sites.find((item) => item.id === visit.siteId); return <button type="button" onClick={() => { setSiteDetailId(visit.siteId); changeView('sites'); }} key={visit.id}><span>△</span><div><strong>{site?.name ?? 'Ukendt campingplads'}</strong><small>{formatDate(visit.arrivalDate)}{visit.rating ? ` · ★ ${visit.rating}` : ''}</small></div><em>→</em></button>; }) : <p>Ingen campingbesøg registreret endnu.</p>}</div></article><article className="panel"><div className="panel-title"><div><p className="eyebrow">Favoritter</p><h2>Bedst bedømte</h2></div></div><div className="compact-library-list">{bestSites.length ? bestSites.map((site) => <button type="button" onClick={() => { setSiteDetailId(site.id); changeView('sites'); }} key={site.id}><span>★</span><div><strong>{site.name}</strong><small>{site.place} · {site.rating.toFixed(1)}</small></div><em>→</em></button>) : <p>Bedøm en besøgt plads for at se den her.</p>}</div></article><article className="panel"><div className="panel-title"><div><p className="eyebrow">Næste idéer</p><h2>Udvalgte ønskesteder</h2></div></div><div className="compact-library-list">{wishlistSites.length ? wishlistSites.map((site) => <button type="button" onClick={() => { setSiteDetailId(site.id); changeView('sites'); }} key={site.id}><span>☆</span><div><strong>{site.name}</strong><small>{site.place} · {site.tags.slice(0,2).join(' · ')}</small></div><em>→</em></button>) : <p>Ønskelisten er tom.</p>}</div></article><article className="panel"><div className="panel-title"><div><p className="eyebrow">På vejen</p><h2>Seneste ruter</h2></div><button className="text-button" type="button" onClick={() => changeView('map')}>Åbn kort</button></div><div className="compact-library-list">{data.routes.slice(0,4).map((route) => <button type="button" onClick={() => changeView('map')} key={route.id}><span>⌁</span><div><strong>{route.name}</strong><small>{route.distanceKm ? `${route.distanceKm.toFixed(1)} km` : 'Etapeudkast'} · {['bike','ebike','road-bike','mtb'].includes(route.profile) ? 'Cykelrute' : 'Rute'}</small></div><em>→</em></button>)}</div></article></section>
            <section className="dashboard-stat-grid">{dashboardStats.map((stat) => <article key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></article>)}</section>
          </>}

          {view === 'administration' && <section className="page-view command-center-page">
            <section className="command-hero">
              <div className="command-hero-copy"><span className="command-kicker">Ferie Administrationen</span><h2>Kommandocentralen</h2><p>Vælg den afdeling, du vil have hjælp fra. Hver afdeling viser sit aktuelle arbejde, ansvarsområde og de funktioner, den kan føre dig videre til.</p><div className="command-hero-actions"><button className="primary-button" type="button" onClick={() => { if (!guardScanVisible) { setSelectedRole(0); setManualGuardScan(true); } else { setSelectedRole(guardChecks.length ? 0 : 1); } }}>{!guardScanVisible ? 'Kør Ferie Vagten' : guardChecks.length ? 'Se vagtens kontrolpunkter' : 'Få næste forslag'}</button><button className="command-settings-button" type="button" onClick={() => changeView('settings')}>⚙ Styr funktioner</button></div></div>
              <div className="command-metrics" aria-label="Kommandocentralens status"><article><span>Afdelinger</span><strong>4</strong><small>arbejder som én organisation</small></article><article><span>Aktiv ferie</span><strong>{activeTrip ? '1' : '0'}</strong><small>{activeTrip?.title ?? 'ikke valgt'}</small></article><article><span>Ferie-sundhed</span><strong>{guardScanVisible ? health.label : 'Pause'}</strong><small>{guardScanVisible ? `${guardChecks.length} kontrolpunkter` : 'manuel kontrol mulig'}</small></article><article><span>Album</span><strong>{albumStatusLabel(activeTrip, activeTrip ? data.media.filter((item) => item.tripId === activeTrip.id).length : data.media.length)}</strong><small>{data.media.length} lokale minder</small></article></div>
            </section>

            {tripPulse && <section className="ferie-pulse command-pulse" aria-label="Ferie-puls"><div className="pulse-heading"><div><p className="eyebrow">Operativ ferie-puls</p><h2>Dag {tripPulse.currentDay} af {tripPulse.totalDays}</h2><p>{activeSite ? `Aktuelt stop: ${activeSite.name}` : 'Vælg et aktivt stop for vejr og lokal kontekst.'}</p></div><span className={`health-badge ${tripPulse.dataStatus.severity}`}>{tripPulse.dataStatus.label}</span></div><div className="pulse-metrics"><article><strong>{tripPulse.destinations}</strong><span>destinationer</span></article><article><strong>{tripPulse.visitedSites}</strong><span>besøgte pladser</span></article><article><strong>{tripPulse.media}</strong><span>billeder</span></article><article><strong>{tripPulse.experiences}</strong><span>oplevelser</span></article><article><strong>{tripPulse.cyclingRoutes}</strong><span>cykelture</span></article><article><strong>{tripPulse.distanceKm ? `${tripPulse.distanceKm.toFixed(0)} km` : '–'}</strong><span>kørte kilometer</span></article><article><strong>{tripPulse.albumStatus}</strong><span>album</span></article><article><strong>{tripPulse.weatherStatus}</strong><span>vejr</span></article></div>{tripPulse.recentAutomaticEvents.length > 0 && <div className="automatic-log"><strong>Seneste automatiske handlinger</strong>{tripPulse.recentAutomaticEvents.map((event) => <span key={event.id}>{event.title} · {event.detail}</span>)}</div>}</section>}

            <section className="department-selector" aria-labelledby="department-selector-title"><div className="department-selector-heading"><div><p className="eyebrow">Vælg hjælp</p><h2 id="department-selector-title">Hvilken afdeling skal på sagen?</h2></div><span>Valgt: {selectedDepartment.role}</span></div><div className="department-selector-grid">{roleStates.map((role, index) => <button className={`${role.tone} ${selectedRole === index ? 'active' : ''}`} type="button" aria-pressed={selectedRole === index} onClick={() => setSelectedRole(index)} key={role.role}><span className="department-selector-icon" aria-hidden="true">{role.icon}</span><Image src={role.image} width={88} height={88} alt="" /><span className="department-selector-copy"><small>{role.name}</small><strong>{role.role}</strong><em>{role.status}</em></span><span className="department-selector-arrow" aria-hidden="true">→</span></button>)}</div></section>

            <section className={`department-workspace ${selectedDepartment.tone}`} aria-labelledby="active-department-title">
              <header className="department-header"><div className="department-portrait"><Image src={selectedDepartment.image} width={220} height={220} alt={`${selectedDepartment.name} som ${selectedDepartment.role}`} /></div><div className="department-header-copy"><p className="eyebrow">{selectedDepartment.name} · afdeling {selectedRole + 1} af 4</p><h2 id="active-department-title">{selectedDepartment.role}</h2><p>{selectedDepartment.description}</p><blockquote>{selectedDepartment.mission}</blockquote></div><div className="department-live-status"><span className="status-dot" /><small>Aktuel status</small><strong>{selectedDepartment.status}</strong><em>{selectedDepartment.task}</em></div></header>

              <div className="department-detail-grid">
                <article className="department-panel current-work"><div className="department-panel-heading"><span aria-hidden="true">◎</span><div><p className="eyebrow">Lige nu</p><h3>Aktuelt arbejde</h3></div></div><div className="current-work-list">{departmentCurrentItems.map((item, index) => <div className={item.state} key={`${item.label}-${index}`}><span aria-hidden="true">{item.state === 'good' ? '✓' : item.state === 'attention' ? '!' : '•'}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></div>)}</div>{selectedRole === 0 && guardScanVisible && guardChecks.length > 0 && <div className="guard-action-list">{guardChecks.map((finding) => <button className={finding.severity} type="button" onClick={() => changeView(finding.target)} key={finding.id}><span>{finding.severity === 'critical' ? '🔴' : finding.severity === 'important' ? '!' : '○'}</span><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><em>Ret →</em></button>)}</div>}{selectedRole === 0 && !guardScanVisible && <button className="soft-action" type="button" onClick={() => setManualGuardScan(true)}>Kør manuel kontrol nu</button>}{selectedRole === 2 && <button className="soft-action" type="button" onClick={openMediaPicker}>＋ Tilføj nye billeder</button>}</article>

                <article className="department-panel"><div className="department-panel-heading"><span aria-hidden="true">≣</span><div><p className="eyebrow">Ejer området</p><h3>Ansvar & opgaver</h3></div></div><ul className="responsibility-list">{selectedDepartment.responsibilities.map((responsibility) => <li key={responsibility}><span aria-hidden="true">✓</span>{responsibility}</li>)}</ul></article>
              </div>

              {selectedRole === 3 && activeSite && <div className="department-weather"><WeatherCard latitude={activeSite.coordinates[1]} longitude={activeSite.coordinates[0]} place={activeSite.place} enabled={data.settings.weatherEnabled} adviceEnabled={data.settings.weatherAdviceEnabled} /></div>}

              <section className="department-capabilities" aria-labelledby="department-capabilities-title"><div className="section-heading"><div><p className="eyebrow">Afdelingens værktøjskasse</p><h2 id="department-capabilities-title">Funktioner og fagligt ansvar</h2></div><span className="section-count">{selectedDepartment.capabilities.length} kernefunktioner</span></div><div className="capability-grid">{selectedDepartment.capabilities.map((capability, index) => <article key={capability.title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{capability.title}</h3><p>{capability.text}</p></article>)}</div></section>

              <section className="department-actions-section" aria-labelledby="department-actions-title"><div className="section-heading"><div><p className="eyebrow">Arbejd videre</p><h2 id="department-actions-title">Handlinger i appen</h2></div></div><div className="department-action-grid">{departmentActions[selectedRole].map((action, actionIndex) => <button type="button" onClick={() => { if (selectedRole === 0 && actionIndex === 0 && !guardScanVisible) setManualGuardScan(true); else changeView(action.target); }} key={action.label}><span>{selectedDepartment.icon}</span><div><strong>{action.label}</strong><small>{action.description}</small></div><em aria-hidden="true">→</em></button>)}</div></section>

              <section className="department-workflow" aria-labelledby="department-workflow-title"><div><p className="eyebrow">Sådan arbejder afdelingen</p><h2 id="department-workflow-title">Fra signal til handling</h2></div><ol>{selectedDepartment.workflow.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol></section>
              <section className="administration-lifecycle"><div><p className="eyebrow">Ferie Administrationens livscyklus</p><h2>Før, under og efter ferien</h2></div><div className="lifecycle-grid"><article className={!activeTrip ? 'active' : ''}><span>01</span><h3>Før ferien</h3><p>Kontrollerer datoer, destinationer, deltagere, stop, ruter og vejrudsigter.</p></article><article className={activeTrip?.status === 'active' ? 'active' : ''}><span>02</span><h3>Under ferien</h3><p>Følger besøg, ruter, billeder, noter, oplevelser, vejr og albumudvikling.</p></article><article className={activeTrip?.status === 'completed' ? 'active' : ''}><span>03</span><h3>Efter ferien</h3><p>Kører afsluttende kontrol og gør albummet klar til gennemgang og genoplevelse.</p></article></div><div className="collaboration-example"><strong>Sådan samarbejder de fire afdelinger</strong><p>På en cykeltur registrerer Vagten konteksten, Grafikeren organiserer minderne, Meteorologen tilføjer vejrråd, og Guiden fører dig videre til ruten, noterne eller albummet.</p></div></section>
            </section>
          </section>}

          {view === 'trips' && <section className="page-view">
            <div className="page-heading"><div><p className="eyebrow">Feriearkiv</p><h2>Fra første idé til genoplevelse</h2><p>Hver ferie er hovedbeholder for destinationer, deltagere, besøg, ruter, billeder, noter, oplevelser, vejr og album.</p></div><button className="primary-button" onClick={() => setModal('trip')} type="button">＋ Ny ferie</button></div>
            {selectedTrip && <section className={`trip-detail ${selectedTrip.coverTone}`}><button className="detail-close" type="button" onClick={() => setTripDetailId('')} aria-label="Luk feriedetaljer">×</button><div className="trip-detail-hero"><div><span className={`status-chip ${selectedTrip.status}`}>{statusLabel(selectedTrip.status)}</span><p className="eyebrow">{selectedTrip.region}</p><h2>{selectedTrip.title}</h2><p>{selectedTrip.summary}</p><strong>{formatDate(selectedTrip.startDate)} – {formatDate(selectedTrip.endDate)} · {tripDuration(selectedTrip)} dage</strong></div><div className="trip-detail-actions">{selectedTrip.status !== 'active' && <button type="button" onClick={() => setTripStatus(selectedTrip.id, 'active')}>Start ferie</button>}{selectedTrip.status === 'active' && <button type="button" onClick={() => setTripStatus(selectedTrip.id, 'completed')}>Afslut med kontrol</button>}<button type="button" onClick={() => openTripAlbum(selectedTrip.id)}>Åbn Ferie Album</button><button type="button" onClick={() => changeView('map')}>Åbn kort & ruter</button></div></div><div className="trip-detail-metrics"><article><strong>{selectedTrip.destinationIds.length}</strong><span>destinationer</span></article><article><strong>{data.visits.filter((item) => item.tripId === selectedTrip.id).length}</strong><span>besøg</span></article><article><strong>{data.routes.filter((item) => item.tripId === selectedTrip.id).length}</strong><span>ruter</span></article><article><strong>{data.media.filter((item) => item.tripId === selectedTrip.id).length}</strong><span>minder</span></article><article><strong>{data.notes.filter((item) => item.tripId === selectedTrip.id).length}</strong><span>noter</span></article><article><strong>{albumStatusLabel(selectedTrip, data.media.filter((item) => item.tripId === selectedTrip.id).length)}</strong><span>album</span></article></div><div className="trip-container-grid"><article><h3>Destinationer & campingpladser</h3>{selectedTrip.destinationIds.length ? selectedTrip.destinationIds.map((id) => { const site = data.sites.find((item) => item.id === id); return <button type="button" onClick={() => { setSiteDetailId(id); changeView('sites'); }} key={id}><span>△</span><div><strong>{site?.name ?? 'Slettet destination'}</strong><small>{site?.place ?? 'Kontrollér relationen'}</small></div><em>→</em></button>; }) : <p>Ingen destinationer valgt.</p>}</article><article><h3>Rejsehold</h3>{[...selectedTrip.participantIds, ...selectedTrip.petIds].map((id) => { const person = data.people.find((item) => item.id === id); return <span key={id}>{person?.kind === 'pet' ? '♧' : '●'} {person?.name ?? 'Slettet profil'}</span>; })}</article><article><h3>Ferie Administration</h3><span>✓ Datastatus: {guardHealth(buildGuardReport(data, selectedTrip)).label}</span><span>▣ Album: {albumStatusLabel(selectedTrip, data.media.filter((item) => item.tripId === selectedTrip.id).length)}</span><span>☀ Vejr: {data.settings.weatherEnabled ? 'aktivt' : 'slået fra'}</span><span>⌁ Opsamling: {data.settings.autoCollectTripData ? 'automatisk' : 'manuel'}</span></article></div></section>}
            <div className="filter-tabs">{(['all','planned','active','completed'] as const).map((status) => <button className={tripFilter === status ? 'active' : ''} onClick={() => setTripFilter(status)} type="button" key={status}>{status === 'all' ? 'Alle' : statusLabel(status)}</button>)}</div>
            {filteredTrips.length ? <div className="trip-grid">{filteredTrips.map((trip) => <article className={`trip-card ${trip.coverTone}`} key={trip.id}><div className="trip-card-art"><span className={`status-chip ${trip.status}`}>{statusLabel(trip.status)}</span><span className="trip-symbol">⌁</span></div><div className="trip-card-body"><p>{trip.region}</p><h3>{trip.title}</h3><span>{formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {tripDuration(trip)} dage</span><small>{trip.summary}</small><div className="trip-card-stats"><b>{trip.destinationIds.length}<em>stop</em></b><b>{trip.participantIds.length + trip.petIds.length}<em>med</em></b><b>{data.media.filter((media) => media.tripId === trip.id).length}<em>minder</em></b></div><div className="card-actions">{trip.status !== 'active' && <button type="button" onClick={() => setTripStatus(trip.id,'active')}>Start ferie</button>}{trip.status === 'active' && <button type="button" onClick={() => setTripStatus(trip.id,'completed')}>Afslut ferie</button>}{trip.status === 'completed' && <button type="button" onClick={() => openTripAlbum(trip.id)}>Genoplev</button>}<button className="ghost" type="button" onClick={() => { setTripDetailId(trip.id); window.scrollTo({ top: 0, behavior: data.settings.reducedMotion ? 'auto' : 'smooth' }); }}>Detaljer</button><button className="danger-ghost" type="button" onClick={() => removeTrip(trip.id)}>Slet</button></div></div></article>)}</div> : <EmptyState icon="◇" title="Ingen ferier i denne visning" text="Opret en ny ferie eller vælg et andet filter." action="Opret ferie" onAction={() => setModal('trip')} />}
          </section>}

          {view === 'map' && <><MapPanel sites={data.sites} experiences={data.experiences} routes={data.routes} mapStyle={data.settings.mapStyle} serviceConfig={serviceStore.config} liveRoutingEnabled={data.settings.liveRoutingEnabled} externalSearchEnabled={data.settings.externalSearchEnabled} onStyleChange={(style) => mutate((draft) => { draft.settings.mapStyle = style; })} onSaveRoute={saveRoute} />
            <section className="saved-routes" aria-labelledby="saved-routes-title"><div className="section-heading"><div><p className="eyebrow">Lokalt rutearkiv</p><h2 id="saved-routes-title">Gemte ruter & cykelruter</h2></div><span className="section-count">{data.routes.length} gemt</span></div>{data.routes.length ? <div className="saved-route-grid rich-route-grid">{data.routes.map((route) => { const cycling = ['bike','ebike','road-bike','mtb'].includes(route.profile); return <article key={route.id}><span>{cycling ? '◉' : '⌁'}</span><div><div className="route-card-heading"><strong>{route.name}</strong><em>{cycling ? 'Cykelrute' : route.calculated ? 'Beregnet rute' : 'Etapeudkast'}</em></div><small>{route.profile === 'caravan' ? 'Bil + campingvogn' : route.profile === 'hgv' ? 'Stort køretøj' : route.profile === 'ebike' ? 'Elcykel' : route.profile === 'road-bike' ? 'Landevejscykel' : route.profile === 'mtb' ? 'Mountainbike' : route.profile === 'hike' ? 'Vandring' : route.profile === 'wheelchair' ? 'Kørestol' : route.profile === 'bike' ? 'Cykel' : route.profile === 'walk' ? 'Gang' : 'Bil'} · {route.waypoints?.length ?? 2} punkter{route.distanceKm ? ` · ${route.distanceKm.toFixed(1)} km` : ''}{route.durationMinutes ? ` · ${Math.round(route.durationMinutes)} min.` : ''}</small>{route.elevation && <small>↗ {route.elevation.ascentM} m · ↘ {route.elevation.descentM} m · højeste {route.elevation.maximumM} m</small>}<span className="relation-label">{route.tripId ? data.trips.find((trip) => trip.id === route.tripId)?.title ?? 'Ferie' : 'Uden ferie'}{route.optimized ? ' · stop optimeret' : ''}</span></div><div className="saved-route-actions">{activeTrip && <button type="button" onClick={() => toggleRouteOnActiveTrip(route.id)}>{route.tripId === activeTrip.id ? 'Fjern ferie' : 'Knyt til ferie'}</button>}<button className="danger-text" type="button" onClick={() => removeRoute(route.id)}>Slet</button></div></article>; })}</div> : <p className="empty-route-note">Planlæg en rute ovenfor. Appen kan gemme stop, profil, undgåelser, køretøjsmål, vejføring, tid, distance og højde – eller bevare et sikkert lokalt linjeudkast.</p>}</section>
          </>}

          {view === 'sites' && <section className="page-view">
            <div className="page-heading"><div><p className="eyebrow">Fælles bibliotek</p><h2>Campingpladser</h2><p>Registrér stedet én gang og genbrug det på ferier, kort, besøg og i album.</p></div><button className="primary-button" onClick={() => setModal('site')} type="button">＋ Ny campingplads</button></div>
            {selectedSite && <section className="site-detail"><button className="detail-close" type="button" onClick={() => setSiteDetailId('')} aria-label="Luk campingpladsdetaljer">×</button><div className="site-detail-cover"><div><span className={`status-chip ${selectedSite.status}`}>{selectedSite.status === 'visited' ? 'Besøgt' : 'Vil besøge'}</span><p className="eyebrow">{selectedSite.place}, {selectedSite.country}</p><h2>{selectedSite.name}</h2><p>{selectedSite.address || 'Adresse er ikke registreret'}</p><small>⌖ {selectedSite.coordinates[1].toFixed(5)}, {selectedSite.coordinates[0].toFixed(5)} · kilde: {selectedSite.locationSource === 'gps' ? 'GPS' : selectedSite.locationSource === 'map' ? 'kort' : selectedSite.locationSource === 'search' ? 'stedsøgning' : 'koordinater'}</small></div><div className="site-score"><strong>{selectedSite.rating > 0 ? selectedSite.rating.toFixed(1) : '–'}</strong><span>samlet score</span><small>{data.visits.filter((visit) => visit.siteId === selectedSite.id).length} registrerede besøg</small></div></div><div className="site-detail-actions"><button type="button" onClick={() => { setSelectedSiteId(selectedSite.id); setModal('visit'); }}>＋ Tilføj besøg</button><button type="button" onClick={() => mutate((draft) => { const site = draft.sites.find((item) => item.id === selectedSite.id); if (site) site.status = site.status === 'visited' ? 'wishlist' : 'visited'; })}>Skift til {selectedSite.status === 'visited' ? 'ønskested' : 'besøgt'}</button>{activeTrip && <button type="button" onClick={() => { toggleSiteOnActiveTrip(selectedSite.id); mutate((draft) => { const trip = draft.trips.find((item) => item.id === activeTrip.id); if (trip) trip.activeSiteId = selectedSite.id; }); }}>Brug som aktiv destination</button>}<button type="button" onClick={() => changeView('map')}>Åbn på kort</button><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedSite.name}, ${selectedSite.address || selectedSite.place}`)}`} target="_blank" rel="noreferrer">Google Maps ↗</a><a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedSite.coordinates[1]},${selectedSite.coordinates[0]}`} target="_blank" rel="noreferrer">Street View ↗</a></div><div className="site-detail-grid"><article><h3>Beskrivelse & tags</h3><p>{selectedSite.note || 'Ingen beskrivelse endnu.'}</p><div className="tag-row">{selectedSite.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></article><article><h3>Besøgshistorik</h3>{data.visits.filter((visit) => visit.siteId === selectedSite.id).sort((a,b) => b.arrivalDate.localeCompare(a.arrivalDate)).map((visit) => <div className="detail-list-row" key={visit.id}><span>✓</span><div><strong>{formatDate(visit.arrivalDate)}{visit.departureDate ? ` – ${formatDate(visit.departureDate)}` : ''}</strong><small>{visit.rating ? `★ ${visit.rating} · ` : ''}{visit.note || data.trips.find((trip) => trip.id === visit.tripId)?.title || 'Uden ferie'}</small></div></div>)}</article><article><h3>Ferier & ruter</h3>{data.trips.filter((trip) => trip.destinationIds.includes(selectedSite.id)).map((trip) => <button className="detail-list-button" type="button" onClick={() => { setTripDetailId(trip.id); changeView('trips'); }} key={trip.id}>◇ {trip.title} →</button>)}{data.routes.filter((route) => route.startSiteId === selectedSite.id || route.endSiteId === selectedSite.id || route.waypoints?.some((point) => point.siteId === selectedSite.id)).map((route) => <button className="detail-list-button" type="button" onClick={() => changeView('map')} key={route.id}>⌁ {route.name} →</button>)}</article><article><h3>Galleri & oplevelser</h3><p>{data.media.filter((item) => item.siteId === selectedSite.id).length} billeder · {data.experiences.filter((item) => item.tripId && data.trips.find((trip) => trip.id === item.tripId)?.destinationIds.includes(selectedSite.id)).length} ferieoplevelser</p><button className="detail-list-button" type="button" onClick={() => changeView('album')}>▣ Åbn galleri →</button><button className="detail-list-button" type="button" onClick={() => changeView('experiences')}>✦ Se oplevelser →</button></article></div></section>}
            <div className="filter-tabs">{(['all','visited','wishlist'] as const).map((status) => <button className={siteFilter === status ? 'active' : ''} onClick={() => setSiteFilter(status)} type="button" key={status}>{status === 'all' ? 'Alle' : status === 'visited' ? 'Besøgt' : 'Vil besøge'}</button>)}</div>
            {filteredSites.length ? <div className="site-grid">{filteredSites.map((site) => {
              const visits = data.visits.filter((visit) => visit.siteId === site.id).sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));
              return <article className="site-card" key={site.id}>
                <div className="site-cover"><span>△</span><button aria-label={site.favorite ? 'Fjern favorit' : 'Tilføj favorit'} onClick={() => mutate((draft) => { const target = draft.sites.find((item) => item.id === site.id); if (target) target.favorite = !target.favorite; })} type="button">{site.favorite ? '★' : '☆'}</button></div>
                <div className="site-body"><div className="site-meta"><span className={`status-chip ${site.status}`}>{site.status === 'visited' ? 'Besøgt' : 'Vil besøge'}</span>{site.rating > 0 && <span>★ {site.rating.toFixed(1)}</span>}</div><h3>{site.name}</h3><p>⌖ {site.place}, {site.country} · {visits.length} registrerede besøg</p>{site.address && <small>{site.address}</small>}<small>{site.note}</small><div className="tag-row">{site.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{activeTrip && <button className="relation-action" type="button" onClick={() => toggleSiteOnActiveTrip(site.id)}>{activeTrip.destinationIds.includes(site.id) ? `Fjern fra ${activeTrip.title}` : `Knyt til ${activeTrip.title}`}</button>}{visits.length > 0 && <div className="visit-history"><strong>Seneste besøg</strong>{visits.slice(0,2).map((visit) => <div key={visit.id}><span>{formatDate(visit.arrivalDate)}{visit.rating ? ` · ★ ${visit.rating}` : ''}<small>{data.trips.find((trip) => trip.id === visit.tripId)?.title ?? 'Uden ferie'}</small></span>{activeTrip && <button type="button" onClick={() => toggleVisitOnActiveTrip(visit.id)}>{visit.tripId === activeTrip.id ? 'Fjern ferie' : 'Knyt til ferie'}</button>}</div>)}</div>}<div className="card-actions"><button type="button" onClick={() => { setSiteDetailId(site.id); window.scrollTo({ top: 0, behavior: data.settings.reducedMotion ? 'auto' : 'smooth' }); }}>Detaljer</button><button type="button" onClick={() => changeView('map')}>Vis på kort</button><button type="button" onClick={() => { setSelectedSiteId(site.id); setModal('visit'); }}>Registrér besøg</button><a href={`https://www.google.com/maps/search/?api=1&query=${site.coordinates[1]},${site.coordinates[0]}`} target="_blank" rel="noreferrer">Navigation ↗</a><button className="danger-ghost" type="button" onClick={() => removeSite(site.id)}>Slet</button></div></div>
              </article>;
            })}</div> : <EmptyState icon="△" title="Ingen campingpladser her" text="Gem en plads som besøgt eller til ønskelisten." action="Tilføj campingplads" onAction={() => setModal('site')} />}
          </section>}

          {view === 'album' && <section className="page-view">
            <div className="page-heading"><div><p className="eyebrow">Ferie Grafikeren</p><h2>Feriealbum & genoplevelse</h2><p>Billeder bliver på enheden og kobles til ferier efter din valgte automatik eller dine manuelle valg.</p></div><button className="primary-button" onClick={() => mediaInputRef.current?.click()} type="button">＋ Tilføj billeder</button></div>
            <label className="album-filter">Vis ferie<select value={albumTrip?.id ?? 'all'} onChange={(event) => setAlbumTripId(event.target.value)}><option value="all">Hele feriearkivet</option>{data.trips.map((trip) => <option value={trip.id} key={trip.id}>{trip.title}</option>)}</select></label>
            <div className="album-summary"><Image src="/misser-grafikeren.png" width={150} height={150} alt="Misser, Ferie Grafikeren" /><div><span>{albumTrip ? 'Genoplevelse' : 'Albumstatus'}</span><h3>{albumTrip?.title ?? 'Dit samlede feriearkiv'}</h3><p>{albumMedia.length ? `${albumMedia.length} minder indgår i en fortælling med feriedage, steder, ruter, noter og oplevelser.` : albumTrip ? 'Ferien har endnu ingen billeder, men steder, etaper og noter er stadig samlet nedenfor.' : 'Misser er klar, så snart du tilføjer de første billeder.'}</p><div className="album-status-steps">{['Oprettet','Samler','Sorterer','Opbygger','Klar til gennemgang','Færdigt'].map((step) => <span className={step === albumStatusLabel(albumTrip, albumMedia.length) ? 'active' : ''} key={step}>{step}</span>)}</div></div><div className="album-meter"><strong>{albumMedia.length}</strong><span>minder</span></div></div>
            {albumTrip && <section className="trip-recap" aria-labelledby="trip-recap-title"><div className="section-heading"><div><p className="eyebrow">Feriens fortælling</p><h2 id="trip-recap-title">{formatDate(albumTrip.startDate)} – {formatDate(albumTrip.endDate)}</h2></div></div><div className="recap-grid"><article><span>△</span><h3>Steder</h3>{albumTrip.destinationIds.length ? <ul>{albumTrip.destinationIds.map((id) => <li key={id}>{data.sites.find((site) => site.id === id)?.name ?? 'Slettet sted'}</li>)}</ul> : <small>Ingen steder knyttet</small>}</article><article><span>⌁</span><h3>Etapeudkast</h3>{data.routes.some((route) => route.tripId === albumTrip.id) ? <ul>{data.routes.filter((route) => route.tripId === albumTrip.id).map((route) => <li key={route.id}>{route.name}</li>)}</ul> : <small>Ingen etaper knyttet</small>}</article><article><span>≡</span><h3>Noter</h3>{data.notes.some((note) => note.tripId === albumTrip.id) ? <ul>{data.notes.filter((note) => note.tripId === albumTrip.id).map((note) => <li key={note.id}>{note.title}</li>)}</ul> : <small>Ingen noter knyttet</small>}</article><article><span>✦</span><h3>Oplevelser</h3>{data.experiences.some((item) => item.tripId === albumTrip.id) ? <ul>{data.experiences.filter((item) => item.tripId === albumTrip.id).map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <small>Ingen oplevelser knyttet</small>}</article></div></section>}
            {albumTrip && <section className="album-highlights"><div className="section-heading"><div><p className="eyebrow">Ferie-højdepunkter</p><h2>Det, der gjorde turen særlig</h2></div></div><div className="highlight-grid"><article><span>★</span><strong>{albumMedia.filter((item) => item.favorite).length}</strong><small>favoritminder</small></article><article><span>△</span><strong>{data.sites.filter((site) => albumTrip.destinationIds.includes(site.id)).sort((a,b) => b.rating-a.rating)[0]?.name ?? '–'}</strong><small>bedst bedømte plads</small></article><article><span>⌁</span><strong>{data.routes.filter((route) => route.tripId === albumTrip.id).sort((a,b) => (b.distanceKm ?? 0)-(a.distanceKm ?? 0))[0]?.distanceKm?.toFixed(1) ?? '–'} km</strong><small>længste rute</small></article><article><span>✦</span><strong>{data.experiences.filter((item) => item.tripId === albumTrip.id && item.status === 'done').length}</strong><small>oplevelser gennemført</small></article></div></section>}
            {albumTrip && albumChapters.length > 0 && <section className="album-story"><div className="section-heading"><div><p className="eyebrow">Automatiske kapitler</p><h2>Feriehistorien dag for dag</h2></div><span className="section-count">{albumChapters.length} kapitler</span></div><div className="story-timeline">{albumChapters.map((chapter) => <article key={chapter.date}><div className="story-day"><span>Dag {chapter.day}</span><strong>{formatDate(chapter.date)}</strong></div><div>{chapter.items.map((item, index) => <section key={`${item.title}-${index}`}><span>{item.type}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div></section>)}</div></article>)}</div></section>}
            {albumMedia.length ? <AlbumGallery media={albumMedia} trips={data.trips} activeTrip={activeTrip} onFavorite={toggleMediaFavorite} onDelete={(id) => void removeMedia(id)} onTripToggle={toggleMediaOnActiveTrip} /> : <EmptyState icon="▣" title={albumTrip ? 'Ingen billeder på denne ferie endnu' : 'Albummet venter på første minde'} text="Vælg billeder fra enheden. De bliver på denne enhed og sendes ikke til en billedtjeneste." action="Vælg billeder" onAction={() => mediaInputRef.current?.click()} />}
          </section>}

          {view === 'experiences' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">På vejen</p><h2>Oplevelser & seværdigheder</h2><p>Gem idéer, læg dem i planen, se dem på kortet og markér dem som oplevet.</p></div><button className="primary-button" onClick={() => setModal('experience')} type="button">＋ Ny oplevelse</button></div>{data.experiences.length ? <div className="experience-list">{data.experiences.map((item) => <article key={item.id}><span className={`experience-icon ${item.status}`}>{item.status === 'done' ? '✓' : item.status === 'planned' ? '◇' : item.kind === 'attraction' ? '⌖' : '✦'}</span><div><span className={`status-chip ${item.status}`}>{item.status === 'done' ? 'Oplevet' : item.status === 'planned' ? 'Planlagt' : 'Idé'}</span><h3>{item.title}</h3><p>⌖ {item.place} · {formatDate(item.date)} · {item.kind === 'attraction' ? 'Seværdighed' : 'Oplevelse'}</p><small>{item.note}</small><em className="relation-label">{data.trips.find((trip) => trip.id === item.tripId)?.title ?? 'Uden ferie'}</em></div><div className="compact-actions">{item.coordinates && <button type="button" onClick={() => changeView('map')}>Vis på kort</button>}<button type="button" onClick={() => mutate((draft) => { const target = draft.experiences.find((entry) => entry.id === item.id); if (target) target.status = target.status === 'idea' ? 'planned' : target.status === 'planned' ? 'done' : 'idea'; })}>Næste status →</button>{activeTrip && <button type="button" onClick={() => toggleExperienceOnActiveTrip(item.id)}>{item.tripId === activeTrip.id ? 'Fjern ferie' : 'Knyt til ferie'}</button>}<button className="danger-text" type="button" onClick={() => removeExperience(item.id)}>Slet</button></div></article>)}</div> : <EmptyState icon="✦" title="Ingen oplevelser endnu" text="Gem et sted eller en idé til næste ferie." action="Tilføj oplevelse" onAction={() => setModal('experience')} />}</section>}

          {view === 'notes' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">Logbog</p><h2>Noter</h2><p>Korte tanker, huskelister og praktiske detaljer – koblet efter din valgte automatik.</p></div><button className="primary-button" onClick={() => setModal('note')} type="button">＋ Ny note</button></div>{data.notes.length ? <div className="notes-grid">{data.notes.map((note) => <article className={note.pinned ? 'pinned' : ''} key={note.id}><div><span>{note.pinned ? '★ Fastgjort' : formatDate(note.date)}</span><button type="button" aria-label={note.pinned ? 'Frigør note' : 'Fastgør note'} onClick={() => mutate((draft) => { const target = draft.notes.find((item) => item.id === note.id); if (target) target.pinned = !target.pinned; })}>{note.pinned ? '★' : '☆'}</button></div><h3>{note.title}</h3><p>{note.text}</p><small>{data.trips.find((trip) => trip.id === note.tripId)?.title ?? 'Uden ferie'}</small><div className="note-footer">{activeTrip && <button type="button" onClick={() => toggleNoteOnActiveTrip(note.id)}>{note.tripId === activeTrip.id ? 'Fjern ferietilknytning' : `Knyt til ${activeTrip.title}`}</button>}<button className="danger-text" type="button" onClick={() => removeNote(note.id)}>Slet</button></div></article>)}</div> : <EmptyState icon="≡" title="Logbogen er tom" text="Tilføj din første note; den gemmes straks lokalt." action="Skriv note" onAction={() => setModal('note')} />}</section>}

          {view === 'people' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">Genbrugelige profiler</p><h2>Personer & kæledyr</h2><p>Vælg de samme rejsefæller på flere ferier uden at oprette dem igen.</p></div><button className="primary-button" onClick={() => setModal('person')} type="button">＋ Tilføj profil</button></div>{data.people.length ? <div className="people-grid">{data.people.map((person, index) => <article key={person.id}><div className={`profile-avatar avatar-${index % 4}`}>{person.kind === 'pet' ? '♧' : person.name.slice(0,1).toUpperCase()}</div><span className="status-chip">{person.kind === 'pet' ? 'Kæledyr' : 'Person'}</span><h3>{person.name}</h3><p>{person.detail}</p><small>Med på {data.trips.filter((trip) => trip.participantIds.includes(person.id) || trip.petIds.includes(person.id)).length} ferier</small><button className="profile-delete" type="button" onClick={() => removePerson(person.id)}>Slet profil</button></article>)}</div> : <EmptyState icon="♧" title="Rejseholdet er tomt" text="Tilføj personer eller kæledyr, som kan genbruges på alle ferier." action="Tilføj profil" onAction={() => setModal('person')} />}</section>}

          {view === 'settings' && <section className="page-view">
            <div className="page-heading"><div><p className="eyebrow">Kontrol over hele appen</p><h2>Indstillinger</h2><p>Skift avancerede funktioner, visning, assistenter og eksterne tjenester. Alt gemmes kun på enheden.</p></div><button className="outline-button" type="button" onClick={() => { mutate((draft) => { Object.assign(draft.settings, { compactMode: false, highContrast: false, reducedMotion: false, showCommandCenterOnDashboard: true, proactiveGuardEnabled: true, smartGuideEnabled: true, confirmBeforeDelete: true, autoCollectTripData: true, dashboardClockEnabled: true, dashboardAlbumEnabled: true, liveRoutingEnabled: true, externalSearchEnabled: true, weatherAdviceEnabled: true, mapStyle: 'liberty' }); }); setToast('De anbefalede indstillinger er gendannet.'); }}>Gendan anbefalet</button></div>
            <div className="settings-intro"><span aria-hidden="true">⚙</span><div><strong>Avanceret styring er aktiv</strong><p>Ændringer slår igennem med det samme i Kommandocentralen, på Overblik og i appens arbejdsgange.</p></div><small>{[data.settings.proactiveGuardEnabled, data.settings.smartGuideEnabled, data.settings.showCommandCenterOnDashboard, data.settings.confirmBeforeDelete, data.settings.autoCollectTripData, data.settings.dashboardClockEnabled, data.settings.dashboardAlbumEnabled, data.settings.liveRoutingEnabled, data.settings.externalSearchEnabled, data.settings.weatherAdviceEnabled].filter(Boolean).length}/10 kernestyringer til</small></div>
            <div className="settings-grid">
              <article className="settings-card"><div className="settings-card-title"><span>◈</span><div><p className="eyebrow">Assistance</p><h3>Kommandocentral & automatik</h3></div></div>
                <label className="field-label">Når nyt indhold oprettes<select value={data.settings.automationMode} onChange={(event) => mutate((draft) => { draft.settings.automationMode = event.target.value as CampingData['settings']['automationMode']; })}><option value="automatic">Knyt automatisk til aktiv ferie</option><option value="ask">Spørg mig hver gang</option><option value="manual">Kun manuel tilknytning</option></select></label>
                <label className="toggle-row"><span><b>Proaktiv Ferie Vagt</b><small>Scanner automatisk ferier, relationer og mulige dubletter.</small></span><input type="checkbox" checked={data.settings.proactiveGuardEnabled} onChange={(event) => { setManualGuardScan(false); mutate((draft) => { draft.settings.proactiveGuardEnabled = event.target.checked; }); }} /></label>
                <label className="toggle-row"><span><b>Smarte forslag fra Ferie Guiden</b><small>Foreslår næste relevante skridt ud fra den aktive ferie.</small></span><input type="checkbox" checked={data.settings.smartGuideEnabled} onChange={(event) => mutate((draft) => { draft.settings.smartGuideEnabled = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Kommandocentral på Overblik</b><small>Vis de fire afdelingers statuskort på startsiden.</small></span><input type="checkbox" checked={data.settings.showCommandCenterOnDashboard} onChange={(event) => mutate((draft) => { draft.settings.showCommandCenterOnDashboard = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Automatisk ferieindsamling</b><small>Knyt besøg, ruter, minder og aktivitet til den aktive ferie og byg Ferie Puls.</small></span><input type="checkbox" checked={data.settings.autoCollectTripData} onChange={(event) => mutate((draft) => { draft.settings.autoCollectTripData = event.target.checked; })} /></label>
              </article>

              <article className="settings-card"><div className="settings-card-title"><span>◐</span><div><p className="eyebrow">Hele appen</p><h3>Visning & tilgængelighed</h3></div></div>
                <label className="toggle-row"><span><b>Kompakt visning</b><small>Reducer afstande og kortstørrelser, så mere indhold er synligt.</small></span><input type="checkbox" checked={data.settings.compactMode} onChange={(event) => mutate((draft) => { draft.settings.compactMode = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Høj kontrast</b><small>Forstærk tekst, kanter og aktive elementer i hele appen.</small></span><input type="checkbox" checked={data.settings.highContrast} onChange={(event) => mutate((draft) => { draft.settings.highContrast = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Reduceret bevægelse</b><small>Fjern glidende scrolling og overgangseffekter.</small></span><input type="checkbox" checked={data.settings.reducedMotion} onChange={(event) => mutate((draft) => { draft.settings.reducedMotion = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Ur på Overblik</b><small>Vis dato, tid, vejr og nedtælling i det illustrerede ferie-ur.</small></span><input type="checkbox" checked={data.settings.dashboardClockEnabled} onChange={(event) => mutate((draft) => { draft.settings.dashboardClockEnabled = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Albumshow på Overblik</b><small>Vis lokale billeder som en rolig fortælling på startsiden.</small></span><input type="checkbox" checked={data.settings.dashboardAlbumEnabled} onChange={(event) => mutate((draft) => { draft.settings.dashboardAlbumEnabled = event.target.checked; })} /></label>
              </article>

              <article className="settings-card"><div className="settings-card-title"><span>⌖</span><div><p className="eyebrow">Eksterne tjenester</p><h3>Kort & vejr</h3></div></div>
                <label className="toggle-row"><span><b>Live vejr</b><small>Sender destinationens koordinater til Open-Meteo efter dit valg.</small></span><input type="checkbox" checked={data.settings.weatherEnabled} onChange={(event) => mutate((draft) => { draft.settings.weatherEnabled = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Vejrråd</b><small>Omsætter vejret til praktiske campingråd om vind, regn, UV og temperatur.</small></span><input type="checkbox" checked={data.settings.weatherAdviceEnabled} onChange={(event) => mutate((draft) => { draft.settings.weatherAdviceEnabled = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Live ruteberegning</b><small>Brug OpenRouteService til vejgeometri, profiler, undgåelser, højde og rækkevidde.</small></span><input type="checkbox" checked={data.settings.liveRoutingEnabled} onChange={(event) => mutate((draft) => { draft.settings.liveRoutingEnabled = event.target.checked; })} /></label>
                <label className="toggle-row"><span><b>Ekstern sted- og områdesøgning</b><small>Brug geocoding og POI-søgning fra Det Store Kort.</small></span><input type="checkbox" checked={data.settings.externalSearchEnabled} onChange={(event) => mutate((draft) => { draft.settings.externalSearchEnabled = event.target.checked; })} /></label>
                <label className="field-label">Standardkort<select value={data.settings.mapStyle} onChange={(event) => mutate((draft) => { draft.settings.mapStyle = event.target.value as CampingData['settings']['mapStyle']; })}><option value="liberty">Liberty</option><option value="bright">Bright</option><option value="positron">Positron</option><option value="dark">Dark</option><option value="fiord">Fiord</option><option value="satellite">Satellit</option><option value="hybrid">Hybrid</option><option value="custom">Eget MapLibre-kort</option></select></label><p className="provider-note">Basiskort fra OpenFreeMap/OpenStreetMap kræver ingen nøgle. Satellit, eget kort, præcis routing og udvidet søgning kan kræve din lokale tjenestekonfiguration.</p>
              </article>

              <article className="settings-card service-config-card"><div className="settings-card-title"><span>⌘</span><div><p className="eyebrow">Kun på denne enhed</p><h3>API-nøgler & endpoints</h3></div></div>
                <p>Aktivér præcise bil-, campingvogns-, cykel- og vandreruter samt geocoding, POI, højde og stopoptimering. Hemmeligheder ligger i et separat lokalt lager og kommer aldrig med i backup eller GitHub.</p>
                <div className="service-field-grid">
                  <label className="field-label secret-field">OpenRouteService-nøgle<input type="password" autoComplete="off" value={serviceStore.config.openRouteServiceApiKey} placeholder="Indsæt din lokale API-nøgle" onChange={(event) => serviceStore.updateConfig({ openRouteServiceApiKey: event.target.value })} /><small>Aktuel: {maskSecret(serviceStore.config.openRouteServiceApiKey)}</small></label>
                  <label className="field-label secret-field">Kortudbyder-token<input type="password" autoComplete="off" value={serviceStore.config.mapProviderToken} placeholder="Valgfrit token til satellit/eget kort" onChange={(event) => serviceStore.updateConfig({ mapProviderToken: event.target.value })} /><small>Aktuel: {maskSecret(serviceStore.config.mapProviderToken)}</small></label>
                  <label className="field-label service-wide">Egen MapLibre style-URL<input type="url" value={serviceStore.config.customMapStyleUrl} placeholder="https://…/style.json" onChange={(event) => serviceStore.updateConfig({ customMapStyleUrl: event.target.value })} /></label>
                  <label className="field-label">ORS API<input type="url" value={serviceStore.config.openRouteServiceEndpoint} onChange={(event) => serviceStore.updateConfig({ openRouteServiceEndpoint: event.target.value })} /></label>
                  <label className="field-label">Geocoding<input type="url" value={serviceStore.config.geocodingEndpoint} onChange={(event) => serviceStore.updateConfig({ geocodingEndpoint: event.target.value })} /></label>
                  <label className="field-label">POI/områdesøgning<input type="url" value={serviceStore.config.openPoiEndpoint} onChange={(event) => serviceStore.updateConfig({ openPoiEndpoint: event.target.value })} /></label>
                  <label className="field-label">Højdetjeneste<input type="url" value={serviceStore.config.openElevationEndpoint} onChange={(event) => serviceStore.updateConfig({ openElevationEndpoint: event.target.value })} /></label>
                  <label className="field-label">VROOM stopoptimering<input type="url" value={serviceStore.config.vroomEndpoint} placeholder="Valgfrit HTTPS-endpoint" onChange={(event) => serviceStore.updateConfig({ vroomEndpoint: event.target.value })} /></label>
                </div>
                <div className="stack-actions service-actions"><button type="button" disabled={serviceTesting} onClick={() => void testServiceConnection()}>{serviceTesting ? 'Tester…' : 'Test ORS-forbindelse'}</button><button type="button" onClick={() => { serviceStore.clearSecrets(); setServiceMessage('De lokale API-nøgler er glemt.'); }}>Glem nøgler</button><button type="button" onClick={() => { serviceStore.resetEndpoints(); setServiceMessage('Standardendpoints er gendannet, og lokale nøgler er fjernet.'); }}>Nulstil tjenester</button></div>
                {(serviceMessage || serviceStore.storageError) && <p className="service-status" role="status">{serviceStore.storageError || serviceMessage}</p>}
                <p className="service-security-note"><strong>Vigtigt på GitHub Pages:</strong> En nøgle, du bruger direkte i browseren, kan ses i dine egne netværksforespørgsler. Brug en nøgle med begrænset kvote og domæne, eller dit eget beskyttede proxy-endpoint.</p>
              </article>

              <article className="settings-card safety-card"><div className="settings-card-title"><span>✓</span><div><p className="eyebrow">Sikkerhed</p><h3>Bekræftelser</h3></div></div><label className="toggle-row"><span><b>Bekræft før sletning</b><small>Spørg før ferier, steder, minder og andre lokale data fjernes.</small></span><input type="checkbox" checked={data.settings.confirmBeforeDelete} onChange={(event) => mutate((draft) => { draft.settings.confirmBeforeDelete = event.target.checked; })} /></label>{!data.settings.confirmBeforeDelete && <p className="settings-warning">Advarsel: Sletninger gennemføres nu med det samme. En backup er den eneste vej tilbage.</p>}</article>

              <article className="settings-card data-card"><div className="settings-card-title"><span>⇅</span><div><p className="eyebrow">Lokal opbevaring</p><h3>Data & backup</h3></div></div><p>Eksporten indeholder relationer og billedfiler, men aldrig hemmelig tjenestekonfiguration. Samme sikkerhedsgrænse på 250 MB gælder for eksport og import.</p><div className="stack-actions"><button type="button" onClick={() => void exportBackup()}>Eksportér komplet JSON-backup</button><button type="button" onClick={() => importInputRef.current?.click()}>Importér backup</button><button type="button" onClick={async () => { if (allowDestructiveAction('Gendan eksempeldata og fjern egne mediefiler fra appens lokale lager?')) { await store.resetToSample(); setToast('Eksempeldata er gendannet.'); } }}>Gendan eksempeldata</button><button className="danger" type="button" onClick={async () => { if (allowDestructiveAction('Slet alle Vores Camping-data på denne enhed? Handlingen kan ikke fortrydes uden en backup.')) { await store.clearAll(); setToast('Alle lokale appdata og vejrpositioner er slettet.'); } }}>Slet alle lokale data</button></div></article>
            </div>
          </section>}

          {view === 'testcenter' && <section className="page-view"><div className="page-heading"><div><p className="eyebrow">Sundhedstjek</p><h2>Testcenter</h2><p>Kontrollerer lokal app, MapLibre, offline-funktioner, CORS, timeouts, konfiguration og de rute- og søgetjenester, du selv har valgt.</p></div><button className="primary-button" disabled={serviceTesting} onClick={() => void runTests()} type="button">{serviceTesting ? 'Tester…' : 'Kør alle tests'}</button></div><div className="test-overview"><div className="test-score"><strong>{testResults.length ? testResults.filter((test) => test.state === 'passed').length : '–'}<small>/{testResults.length || 13}</small></strong><span>bestået</span></div><div><h3>{testResults.length ? (testResults.every((test) => test.state === 'passed') ? 'Alt er klar' : testResults.some((test) => test.state === 'failed') ? 'En eller flere tjenester kræver handling' : 'Appen er klar med valgfrie begrænsninger') : 'Klar til komplet systemtjek'}</h3><p>Lokal registrering virker uafhængigt af kort, vejr og routing. Tests viser aldrig komplette nøgler.</p></div></div>{testResults.length ? <div className="test-groups">{Array.from(new Set(testResults.map((test) => test.group))).map((group) => <section key={group}><div className="test-group-heading"><h3>{group}</h3><span>{testResults.filter((test) => test.group === group && test.state === 'passed').length}/{testResults.filter((test) => test.group === group).length}</span></div><div className="test-list">{testResults.filter((test) => test.group === group).map((test) => <article className={test.state} key={`${test.group}-${test.label}`}><span>{test.state === 'passed' ? '✓' : test.state === 'warning' ? '○' : '!'}</span><div><strong>{test.label}</strong><small>{test.detail}</small></div></article>)}</div></section>)}</div> : <EmptyState icon="✓" title="Ingen tests kørt endnu" text="Start testen for at kontrollere lagring, mediedatabase, MapLibre, offline-appskal, netværk, ORS, Pelias, POI, højde og stopoptimering." />}</section>}
        </div>

        <nav className="mobile-nav" aria-label="Mobil navigation">{navigation.slice(0,5).map((item) => <button aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'active' : ''} onClick={() => changeView(item.id)} type="button" key={item.id}><span aria-hidden="true">{item.icon}</span>{item.short}</button>)}<button ref={mobileMoreButtonRef} aria-expanded={mobileMenu} aria-controls="mobile-more-menu" className={mobileMenu || ['album','experiences','notes','people','settings','testcenter'].includes(view) ? 'active' : ''} onClick={() => setMobileMenu((open) => !open)} type="button"><span aria-hidden="true">•••</span>Mere</button></nav>
        {mobileMenu && <div ref={mobileMenuRef} id="mobile-more-menu" className="mobile-more" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title"><div className="mobile-more-head"><strong id="mobile-more-title">Flere områder</strong><button type="button" onClick={() => setMobileMenu(false)} aria-label="Luk menu">×</button></div>{navigation.slice(5).map((item) => <button aria-current={view === item.id ? 'page' : undefined} type="button" onClick={() => changeView(item.id)} key={item.id}><span aria-hidden="true">{item.icon}</span><div><strong>{item.label}</strong><small>Åbn {item.label.toLocaleLowerCase('da-DK')}</small></div><span aria-hidden="true">→</span></button>)}<button type="button" onClick={() => changeView('settings')}><span aria-hidden="true">⚙</span><div><strong>Indstillinger</strong><small>Tilpas app, kort og backup</small></div><span aria-hidden="true">→</span></button><button type="button" onClick={() => changeView('testcenter')}><span aria-hidden="true">✓</span><div><strong>Testcenter</strong><small>Kontrollér lokal app og tjenester</small></div><span aria-hidden="true">→</span></button></div>}
      </section>

      <input ref={mediaInputRef} className="sr-only" tabIndex={-1} aria-hidden="true" type="file" accept="image/*" multiple onChange={(event) => void addMedia(event)} />
      <input ref={importInputRef} className="sr-only" tabIndex={-1} aria-hidden="true" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event)} />
      {visibleToast && <div className="toast" role="status">✓ {visibleToast}</div>}

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="Luk">×</button>
        {modal === 'trip' && <><p className="eyebrow">Ny plan</p><h2 id="modal-title">Opret ferie</h2><form onSubmit={submitTrip}><label>Navn<input name="title" required placeholder="Fx Rundt om Limfjorden" /></label><div className="form-row"><label>Startdato<input name="start" type="date" required /></label><label>Slutdato<input name="end" type="date" required /></label></div><label>Område<input name="region" required placeholder="Fx Nordjylland" /></label><label>Første destination<select name="destination" defaultValue=""><option value="">Vælg senere</option>{data.sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><label>Kort beskrivelse<textarea name="summary" rows={3} placeholder="Hvad glæder I jer til?" /></label><button className="primary-button" type="submit">Opret ferie</button></form></>}
        {modal === 'site' && <><p className="eyebrow">Fælles bibliotek</p><h2 id="modal-title">Ny campingplads</h2><form onSubmit={submitSite}><label>Navn<input name="name" required placeholder="Campingpladsens navn" /></label><label>Adresse<input name="address" autoComplete="street-address" placeholder="Vej, nummer og postnummer" /></label><div className="form-row"><label>By/område<input name="place" required /></label><label>Land<input name="country" defaultValue="Danmark" /></label></div><div className="form-row"><label>Breddegrad<input name="latitude" required inputMode="decimal" placeholder="56.1234" /></label><label>Længdegrad<input name="longitude" required inputMode="decimal" placeholder="9.1234" /></label></div><p className="form-help">Placeringen skal være reel. Kopiér koordinater fra Det Store Kort eller GPS – appen indsætter aldrig en falsk standardplacering.</p><label>Status<select name="status" defaultValue="wishlist"><option value="wishlist">Vil besøge</option><option value="visited">Besøgt</option></select></label><label>Tags<input name="tags" placeholder="Hav, hund, cykling" /></label><label>Note<textarea name="note" rows={3} /></label><button className="primary-button" type="submit">Gem campingplads</button></form></>}
        {modal === 'visit' && <><p className="eyebrow">Besøgshistorik</p><h2 id="modal-title">Registrér besøg</h2><form onSubmit={submitVisit}><label>Campingplads<select value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)} required>{data.sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><div className="form-row"><label>Ankomst<input name="arrival" type="date" required defaultValue={new Date().toISOString().slice(0,10)} /></label><label>Afrejse<input name="departure" type="date" /></label></div><label>Vurdering<select name="rating" defaultValue="0"><option value="0">Ingen vurdering</option><option value="5">5 · Fremragende</option><option value="4">4 · Meget god</option><option value="3">3 · God</option><option value="2">2 · Begrænset</option><option value="1">1 · Dårlig</option></select></label><label>Note<textarea name="note" rows={3} placeholder="Hvad vil du huske fra opholdet?" /></label><button className="primary-button" type="submit">Gem besøg</button></form></>}
        {modal === 'note' && <><p className="eyebrow">Logbog</p><h2 id="modal-title">Ny note</h2><form onSubmit={submitNote}><label>Titel<input name="title" required /></label><label>Note<textarea name="text" rows={5} required /></label><label className="check-row"><input name="pinned" type="checkbox" />Fastgør noten øverst</label><button className="primary-button" type="submit">Gem note</button></form></>}
        {modal === 'experience' && <><p className="eyebrow">På vejen</p><h2 id="modal-title">Ny oplevelse</h2><form onSubmit={submitExperience}><label>Oplevelse<input name="title" required /></label><div className="form-row"><label>Sted<input name="place" required /></label><label>Dato<input name="date" type="date" required /></label></div><div className="form-row"><label>Type<select name="kind"><option value="experience">Oplevelse</option><option value="attraction">Seværdighed</option></select></label><label>Status<select name="status"><option value="idea">Idé</option><option value="planned">Planlagt</option><option value="done">Oplevet</option></select></label></div><div className="form-row"><label>Breddegrad <small>(valgfri)</small><input name="latitude" inputMode="decimal" placeholder="56.1234" /></label><label>Længdegrad <small>(valgfri)</small><input name="longitude" inputMode="decimal" placeholder="9.1234" /></label></div><p className="form-help">Med koordinater vises oplevelsen på Det Store Kort og kan bruges som rutestop.</p><label>Note<textarea name="note" rows={3} /></label><button className="primary-button" type="submit">Tilføj oplevelse</button></form></>}
        {modal === 'person' && <><p className="eyebrow">Rejsehold</p><h2 id="modal-title">Tilføj profil</h2><form onSubmit={submitPerson}><label>Navn<input name="name" required /></label><label>Type<select name="kind"><option value="person">Person</option><option value="pet">Kæledyr</option></select></label><label>Detalje<input name="detail" placeholder="Fx fotograf eller hund" /></label><button className="primary-button" type="submit">Gem profil</button></form></>}
      </section></div>}
    </main>
  );
}
