export type TripStatus = 'planned' | 'active' | 'completed';
export type SiteStatus = 'visited' | 'wishlist';

export type Trip = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  region: string;
  summary: string;
  destinationIds: string[];
  participantIds: string[];
  petIds: string[];
  coverTone: 'forest' | 'coast' | 'sunset';
  mainDestinationId?: string;
  activeSiteId?: string;
  albumStatus?: 'created' | 'collecting' | 'sorting' | 'building' | 'review' | 'completed';
  startedAt?: string;
  completedAt?: string;
};

export type CampingSite = {
  id: string;
  name: string;
  place: string;
  country: string;
  coordinates: [number, number];
  status: SiteStatus;
  rating: number;
  visits: number;
  tags: string[];
  note: string;
  favorite: boolean;
  address?: string;
  locationSource?: 'coordinates' | 'search' | 'map' | 'gps';
};

export type Experience = {
  id: string;
  title: string;
  place: string;
  date: string;
  status: 'idea' | 'planned' | 'done';
  note: string;
  tripId?: string;
  kind?: 'experience' | 'attraction';
  coordinates?: [number, number];
};

export type RouteProfile = 'caravan' | 'car' | 'hgv' | 'bike' | 'ebike' | 'road-bike' | 'mtb' | 'walk' | 'hike' | 'wheelchair';

export type RouteWaypoint = {
  id: string;
  label: string;
  coordinates: [number, number];
  siteId?: string;
  source: 'site' | 'search' | 'map' | 'gps' | 'poi';
};

export type RouteAvoidance = {
  highways: boolean;
  tollways: boolean;
  ferries: boolean;
};

export type VehicleDimensions = {
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  weightT?: number;
  axleLoadT?: number;
};

export type ElevationSummary = {
  ascentM: number;
  descentM: number;
  minimumM: number;
  maximumM: number;
};

export type SavedRoute = {
  id: string;
  name: string;
  startSiteId?: string;
  endSiteId?: string;
  profile: RouteProfile;
  createdAt: string;
  tripId?: string;
  distanceKm?: number;
  durationMinutes?: number;
  geometry: [number, number][];
  waypoints?: RouteWaypoint[];
  description?: string;
  avoidance?: RouteAvoidance;
  vehicle?: VehicleDimensions;
  elevation?: ElevationSummary;
  calculated?: boolean;
  optimized?: boolean;
};

export type SiteVisit = {
  id: string;
  siteId: string;
  tripId?: string;
  arrivalDate: string;
  departureDate?: string;
  rating: number;
  note: string;
};

export type CampingNote = {
  id: string;
  title: string;
  text: string;
  date: string;
  tripId?: string;
  pinned: boolean;
};

export type MediaItem = {
  id: string;
  name: string;
  createdAt: string;
  tripId?: string;
  siteId?: string;
  favorite: boolean;
};

export type Person = {
  id: string;
  name: string;
  kind: 'person' | 'pet';
  detail: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  type: 'trip' | 'place' | 'media' | 'note' | 'experience';
  tripId?: string;
  automatic?: boolean;
  target?: ViewId;
};

export type CampingSettings = {
  mapStyle: 'liberty' | 'bright' | 'positron' | 'dark' | 'fiord' | 'satellite' | 'hybrid' | 'custom';
  automationMode: 'automatic' | 'ask' | 'manual';
  weatherEnabled: boolean;
  reducedMotion: boolean;
  compactMode: boolean;
  highContrast: boolean;
  showCommandCenterOnDashboard: boolean;
  proactiveGuardEnabled: boolean;
  smartGuideEnabled: boolean;
  confirmBeforeDelete: boolean;
  autoCollectTripData: boolean;
  dashboardClockEnabled: boolean;
  dashboardAlbumEnabled: boolean;
  liveRoutingEnabled: boolean;
  externalSearchEnabled: boolean;
  weatherAdviceEnabled: boolean;
};

export type ServiceConfig = {
  customMapStyleUrl: string;
  mapProviderToken: string;
  openRouteServiceApiKey: string;
  openRouteServiceEndpoint: string;
  geocodingEndpoint: string;
  openPoiEndpoint: string;
  openElevationEndpoint: string;
  vroomEndpoint: string;
};

export type CampingData = {
  schemaVersion: 1;
  trips: Trip[];
  sites: CampingSite[];
  experiences: Experience[];
  routes: SavedRoute[];
  visits: SiteVisit[];
  notes: CampingNote[];
  media: MediaItem[];
  people: Person[];
  events: TimelineEvent[];
  settings: CampingSettings;
};

export type ViewId = 'dashboard' | 'administration' | 'trips' | 'map' | 'sites' | 'album' | 'experiences' | 'notes' | 'people' | 'settings' | 'testcenter';
