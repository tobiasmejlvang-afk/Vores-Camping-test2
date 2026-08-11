(() => {
  'use strict';

  const VERSION = '27.0';
  const API_ROOT = 'https://api.heigit.org';
  const GEOJSON_ACCEPT = 'application/geo+json, application/json';
  const POI_FILTER_BATCH_SIZE = 5;
  const ENDPOINTS = Object.freeze({
    routing: `${API_ROOT}/openrouteservice`,
    geocoding: `${API_ROOT}/pelias`,
    elevation: `${API_ROOT}/openelevationservice`,
    optimization: `${API_ROOT}/vroom/v0`,
    pois: `${API_ROOT}/openpoiservice/v0/pois`
  });

  const LIMITS = Object.freeze({
    maxWaypoints: 50,
    maxPoiRadiusM: 2000,
    maxPoiAreaKm2: 50,
    maxMatrixDynamicLocations: 25,
    maxIsochroneLocations: 5,
    maxIsochroneIntervals: 10,
    maxElevationVertices: 2000,
    maxOptimizationRoutes: 50,
    maxOptimizationVehicles: 3,
    maxSnapLocations: 5000
  });

  const PROFILES = Object.freeze({
    'driving-car': {label:'Bil', icon:'🚗', group:'Kørsel'},
    'driving-hgv': {label:'Bil + campingvogn / stort køretøj', icon:'🚙', group:'Kørsel'},
    'cycling-regular': {label:'Almindelig cykel', icon:'🚲', group:'Cykling'},
    'cycling-electric': {label:'Elcykel', icon:'⚡', group:'Cykling'},
    'cycling-road': {label:'Landevejscykel', icon:'🏁', group:'Cykling'},
    'cycling-mountain': {label:'Mountainbike', icon:'⛰️', group:'Cykling'},
    'foot-walking': {label:'Gåtur', icon:'🚶', group:'Til fods'},
    'foot-hiking': {label:'Vandring', icon:'🥾', group:'Til fods'},
    'wheelchair': {label:'Kørestol', icon:'♿', group:'Til fods'}
  });

  const POI_PRESETS = Object.freeze({
    camping: {label:'Camping og autocamper', categoryIds:[103,104]},
    essentials: {label:'Praktisk på turen', categoryIds:[166,179,208,518,565,596,601,603]},
    food: {label:'Mad og café', categoryIds:[435,564,570]},
    cycling: {label:'Cykelservice', categoryIds:[429,583,584,585]},
    family: {label:'Udflugter og oplevelser', categoryIds:[134,263,281,291,292,332,622,625,627]},
    dog: {label:'Hundevenligt', categoryIds:[123,268]},
    allTravel: {label:'Alt relevant på ferien', categoryGroupIds:[100,130,160,200,260,330,420,560,580,620]}
  });

  const CAPABILITIES = Object.freeze([
    'autocomplete','geocode','structured','reverse',
    'directions-geojson','directions-json','directions-gpx','directions-get',
    'snap-json','snap-geojson','isochrones','matrix','pois',
    'elevation-point-get','elevation-point-post','elevation-line','optimization',
    'route-extra-info','route-attributes','round-trip','alternative-routes',
    'pois-around','poi-stats-around','poi-filter-batching','isochrone-around','matrix-from-origin','elevation-route-summary','caravan-restrictions','europe-roadtrip','diagnostics'
  ]);

  function requireApiKey(config = {}) {
    const key = String(config.apiKey || '').trim();
    if (!key) throw new Error('Openrouteservice API-nøglen mangler. Indsæt den under Indstillinger → Ruteplanlægning.');
    return key;
  }

  function requestTimeout(config = {}) {
    return Math.max(3000, Math.min(60000, Number(config.timeout || 25000)));
  }

  function parseError(data, status) {
    const candidate = data?.error?.message || data?.error?.details || data?.message || data?.error;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (candidate && typeof candidate === 'object') {
      try { return JSON.stringify(candidate); } catch (_) {}
    }
    if (status === 401 || status === 403) return 'Openrouteservice afviste API-nøglen eller tjenesten. Kontrollér nøglen under Indstillinger → Ruteplanlægning.';
    if (status === 406) return 'Openrouteservice afviste svarformatet. GeoJSON-kaldet bruger nu det officielle GeoJSON/JSON Accept-format.';
    if (status === 429) return 'Openrouteservice-grænsen er nået. Vent lidt og prøv igen.';
    return `Openrouteservice svarede med HTTP ${status}.`;
  }

  async function parseResponse(response, responseType = 'json') {
    if (responseType === 'blob') return response.blob();
    const raw = await response.text();
    if (responseType === 'text') return raw;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }

  function addQuery(url, query = {}) {
    Object.entries(query).forEach(([name, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach(item => url.searchParams.append(name, String(item)));
      else url.searchParams.set(name, String(value));
    });
  }

  async function requestUrl(urlOrString, options = {}, config = {}, responseType = 'json') {
    const key = requireApiKey(config);
    const method = String(options.method || 'GET').toUpperCase();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), requestTimeout(config));
    try {
      const url = urlOrString instanceof URL ? new URL(urlOrString.href) : new URL(String(urlOrString));
      addQuery(url, options.query || {});
      const headers = {
        accept: responseType === 'text' ? '*/*' : 'application/json',
        authorization: key,
        ...(options.headers || {})
      };
      if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
      const response = await fetch(url, {
        method,
        headers,
        body: options.body,
        signal: controller.signal,
        cache: 'no-store'
      });
      const data = await parseResponse(response, responseType);
      if (!response.ok) {
        const error = new Error(parseError(data, response.status));
        error.status = response.status;
        error.data = data;
        error.url = url.href;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Openrouteservice brugte for lang tid på at svare.');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function requestJson(url, body, config, options = {}) {
    return requestUrl(url, {
      method:'POST',
      body: JSON.stringify(body),
      headers: options.headers,
      query: options.query
    }, config, options.responseType || 'json');
  }

  function cleanObject(value) {
    if (Array.isArray(value)) return value.map(cleanObject).filter(item => item !== undefined);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      if (item === undefined || item === null || item === '') return;
      if (Array.isArray(item) && !item.length) return;
      const cleaned = cleanObject(item);
      if (cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) && !Object.keys(cleaned).length) return;
      result[key] = cleaned;
    });
    return result;
  }

  function assertProfile(profile) {
    const value = String(profile || 'cycling-regular');
    if (!PROFILES[value]) throw new Error(`ORS-profilen “${value}” understøttes ikke i appen.`);
    return value;
  }

  function assertPoints(points, minimum = 1, maximum = Infinity) {
    if (!Array.isArray(points) || points.length < minimum) throw new Error(`Der kræves mindst ${minimum} koordinat${minimum === 1 ? '' : 'er'}.`);
    if (points.length > maximum) throw new Error(`Der kan højst bruges ${maximum} koordinater i denne ORS-funktion.`);
    points.forEach(point => {
      if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) {
        throw new Error('Koordinater skal angives som [længdegrad, breddegrad].');
      }
    });
    return points.map(point => [Number(point[0]), Number(point[1])]);
  }

  function sanitizeAvoidFeatures(profile, features = []) {
    const p = assertProfile(profile);
    const allowed = new Set(['ferries']);
    if (p.startsWith('driving-')) { allowed.add('highways'); allowed.add('tollways'); allowed.add('fords'); }
    if (p.startsWith('cycling-') || p.startsWith('foot-')) { allowed.add('steps'); allowed.add('fords'); }
    if (p === 'wheelchair') allowed.add('steps');
    return [...new Set((features || []).map(String).filter(value => allowed.has(value)))];
  }

  function extraInfoForProfile(profile) {
    const p = assertProfile(profile);
    if (p === 'driving-car') return ['surface','waytype','waycategory','tollways'];
    if (p === 'driving-hgv') return ['surface','waytype','waycategory','tollways','roadaccessrestrictions'];
    if (p === 'cycling-mountain') return ['steepness','surface','waytype','suitability','traildifficulty'];
    if (p.startsWith('cycling-')) return ['steepness','surface','waytype','suitability'];
    if (p.startsWith('foot-')) return ['steepness','surface','waytype','suitability','green'];
    if (p === 'wheelchair') return ['steepness','surface','waytype','suitability'];
    return ['surface','waytype'];
  }

  function buildDirectionsBody(points, profile, options = {}) {
    const p = assertProfile(profile);
    const routeOptions = {...(options.routeOptions || options.options || {})};
    const avoidFeatures = sanitizeAvoidFeatures(p, options.avoidFeatures || []);
    if (avoidFeatures.length) routeOptions.avoid_features = avoidFeatures;
    if (options.roundTrip) routeOptions.round_trip = cleanObject(options.roundTrip);
    if (options.vehicleType && p === 'driving-hgv') routeOptions.vehicle_type = options.vehicleType;
    if (options.profileParams && p !== 'driving-car') routeOptions.profile_params = options.profileParams;

    return cleanObject({
      coordinates: assertPoints(points, 2, LIMITS.maxWaypoints),
      preference: options.preference || 'recommended',
      units: options.units || 'm',
      language: options.language || 'da',
      geometry: options.geometry !== false,
      geometry_simplify: Boolean(options.geometrySimplify),
      elevation: options.elevation !== false,
      instructions: options.instructions !== false,
      instructions_format: options.instructionsFormat || 'text',
      maneuvers: Boolean(options.maneuvers),
      roundabout_exits: Boolean(options.roundaboutExits),
      continue_straight: options.continueStraight,
      suppress_warnings: options.suppressWarnings,
      radiuses: options.radiuses,
      bearings: options.bearings,
      skip_segments: options.skipSegments,
      attributes: options.attributes,
      extra_info: options.extraInfo || options.extra_info,
      alternative_routes: options.alternativeRoutes,
      maximum_speed: options.maximumSpeed,
      options: routeOptions,
      ...(options.body || {})
    });
  }

  function poiFilters(options = {}) {
    if (options.filters) return options.filters;
    const preset = POI_PRESETS[options.preset || 'allTravel'] || POI_PRESETS.allTravel;
    return cleanObject({
      category_group_ids: preset.categoryGroupIds,
      category_ids: preset.categoryIds,
      name: options.name,
      wheelchair: options.wheelchair,
      smoking: options.smoking,
      fee: options.fee
    });
  }

  function chunkValues(values, size = POI_FILTER_BATCH_SIZE) {
    const list=Array.isArray(values)?values:[];
    if(!list.length)return [null];
    const chunks=[];for(let i=0;i<list.length;i+=size)chunks.push(list.slice(i,i+size));
    return chunks;
  }

  function poiFilterBatches(filters = {}) {
    const categories=chunkValues(filters.category_ids);
    const groups=chunkValues(filters.category_group_ids);
    const rest={...filters};delete rest.category_ids;delete rest.category_group_ids;
    const batches=[];
    categories.forEach(category_ids=>groups.forEach(category_group_ids=>batches.push(cleanObject({...rest,category_ids,category_group_ids}))));
    return batches.length?batches:[rest];
  }

  function poiFeatureKey(feature) {
    const p=feature?.properties||{},c=feature?.geometry?.coordinates||[];
    return String(p.osm_id||p.id||feature?.id||`${c.join(',')}|${p.osm_tags?.name||p.name||''}`);
  }

  function mergePoiResponses(responses, limit=20, sortby='distance') {
    const seen=new Set(),features=[];
    responses.forEach(response=>(response?.features||[]).forEach(feature=>{const key=poiFeatureKey(feature);if(seen.has(key))return;seen.add(key);features.push(feature)}));
    if(sortby==='distance')features.sort((a,b)=>Number(a?.properties?.distance??Infinity)-Number(b?.properties?.distance??Infinity));
    const base=responses.find(Boolean)||{type:'FeatureCollection'};
    return {...base,features:features.slice(0,limit),batched:responses.length>1,batches:responses.length};
  }

  function mergeStats(a,b){
    if(typeof a==='number'&&typeof b==='number')return a+b;
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out={...a};Object.entries(b).forEach(([k,v])=>out[k]=k in out?mergeStats(out[k],v):v);return out;}
    return b??a;
  }

  function elevationTotals(coordinates = []) {
    let ascentM=0, descentM=0, previous=null;
    for (const coordinate of coordinates || []) {
      const height=Number(coordinate?.[2]);
      if (!Number.isFinite(height)) continue;
      if (previous !== null) {
        const delta=height-previous;
        if (delta>0) ascentM+=delta;
        else descentM+=Math.abs(delta);
      }
      previous=height;
    }
    return {ascentM,descentM};
  }

  function normalizeRouteSummary(result) {
    const feature = result?.features?.[0];
    const route = result?.routes?.[0];
    const props = feature?.properties || {};
    const summary = props.summary || route?.summary || {};
    const segments = props.segments || route?.segments || [];
    const distanceM = Number(summary.distance || 0);
    const durationS = Number(summary.duration || 0);
    const calculatedSpeed = distanceM > 0 && durationS > 0 ? (distanceM / 1000) / (durationS / 3600) : 0;
    const weightedSpeed = (() => {
      const valid = segments.map(segment => ({distance:Number(segment?.distance),speed:Number(segment?.avgspeed)})).filter(x=>Number.isFinite(x.distance)&&x.distance>0&&Number.isFinite(x.speed)&&x.speed>0);
      const total = valid.reduce((sum,x)=>sum+x.distance,0);
      return total ? valid.reduce((sum,x)=>sum+x.distance*x.speed,0)/total : 0;
    })();
    return {
      distanceM,
      durationS,
      ascentM: Number(props.ascent ?? summary.ascent ?? route?.ascent ?? 0),
      descentM: Number(props.descent ?? summary.descent ?? route?.descent ?? 0),
      averageSpeedKmh: Number(calculatedSpeed || weightedSpeed || 0),
      segmentAverageSpeedsKmh: segments.map(segment=>Number(segment?.avgspeed)).filter(Number.isFinite),
      bbox: result?.bbox || route?.bbox || null,
      warnings: props.warnings || route?.warnings || [],
      extras: props.extras || route?.extras || {},
      segments
    };
  }

  function createClient(getConfig) {
    const cfg = () => typeof getConfig === 'function' ? (getConfig() || {}) : (getConfig || {});
    const routingUrl = path => `${ENDPOINTS.routing}${path}`;
    const geocodeUrl = path => `${ENDPOINTS.geocoding}${path}`;
    const elevationUrl = path => `${ENDPOINTS.elevation}${path}`;

    const client = {
      version: VERSION,
      profiles: PROFILES,
      poiPresets: POI_PRESETS,
      capabilities: CAPABILITIES,
      endpoints: ENDPOINTS,
      limits: LIMITS,
      normalizeRouteSummary,
      sanitizeAvoidFeatures,
      extraInfoForProfile,

      geocode(text, options = {}) {
        const params = {
          text,
          size: options.size || 8,
          layers: options.layers,
          sources: options.sources,
          lang: options.lang || 'da',
          'boundary.country': options.country,
          'boundary.rect.min_lon': options.bounds?.[0]?.[0],
          'boundary.rect.min_lat': options.bounds?.[0]?.[1],
          'boundary.rect.max_lon': options.bounds?.[1]?.[0],
          'boundary.rect.max_lat': options.bounds?.[1]?.[1]
        };
        if (options.focus) {
          params['focus.point.lon'] = options.focus.lng;
          params['focus.point.lat'] = options.focus.lat;
        }
        return requestUrl(geocodeUrl('/v1/search'), {method:'GET', query:cleanObject(params)}, cfg());
      },

      autocomplete(text, options = {}) {
        const params = {text, size:options.size || 8, lang:options.lang || 'da', layers:options.layers, sources:options.sources};
        if (options.focus) {
          params['focus.point.lon'] = options.focus.lng;
          params['focus.point.lat'] = options.focus.lat;
        }
        return requestUrl(geocodeUrl('/v1/autocomplete'), {method:'GET', query:cleanObject(params)}, cfg());
      },

      structuredGeocode(fields = {}, options = {}) {
        return requestUrl(geocodeUrl('/v1/search/structured'), {method:'GET', query:cleanObject({...fields, size:options.size || 8, lang:options.lang || 'da'})}, cfg());
      },

      reverseGeocode(lng, lat, options = {}) {
        return requestUrl(geocodeUrl('/v1/reverse'), {method:'GET', query:cleanObject({
          'point.lon': Number(lng),
          'point.lat': Number(lat),
          size: options.size || 1,
          radius: options.radius,
          layers: options.layers,
          lang: options.lang || 'da'
        })}, cfg());
      },

      directions(points, profile = 'cycling-regular', options = {}) {
        return this.directionsGeoJSON(points, profile, options);
      },

      directionsGeoJSON(points, profile = 'cycling-regular', options = {}) {
        const p = assertProfile(profile);
        return requestJson(routingUrl(`/v2/directions/${p}/geojson`), buildDirectionsBody(points, p, options), cfg(), {headers:{accept:GEOJSON_ACCEPT}});
      },

      directionsJson(points, profile = 'cycling-regular', options = {}) {
        const p = assertProfile(profile);
        return requestJson(routingUrl(`/v2/directions/${p}/json`), buildDirectionsBody(points, p, options), cfg());
      },

      directionsGpx(points, profile = 'cycling-regular', options = {}) {
        const p = assertProfile(profile);
        return requestJson(routingUrl(`/v2/directions/${p}/gpx`), buildDirectionsBody(points, p, {...options, instructions:true}), cfg(), {
          responseType:'text',
          headers:{accept:'application/gpx+xml, application/xml, text/xml'}
        });
      },

      directionsSimple(start, end, profile = 'cycling-regular') {
        const p = assertProfile(profile);
        const from = assertPoints([start], 1, 1)[0].join(',');
        const to = assertPoints([end], 1, 1)[0].join(',');
        return requestUrl(routingUrl(`/v2/directions/${p}`), {method:'GET', query:{start:from,end:to},headers:{accept:GEOJSON_ACCEPT}}, cfg());
      },

      snap(points, profile = 'cycling-regular', radius = 400) {
        return this.snapGeoJSON(points, profile, radius);
      },

      snapJson(points, profile = 'cycling-regular', radius = 400) {
        const p = assertProfile(profile);
        return requestJson(routingUrl(`/v2/snap/${p}/json`), {locations:assertPoints(points,1,LIMITS.maxSnapLocations), radius:Math.max(1,Number(radius||400))}, cfg());
      },

      snapGeoJSON(points, profile = 'cycling-regular', radius = 400) {
        const p = assertProfile(profile);
        return requestJson(routingUrl(`/v2/snap/${p}/geojson`), {locations:assertPoints(points,1,LIMITS.maxSnapLocations), radius:Math.max(1,Number(radius||400))}, cfg(), {headers:{accept:GEOJSON_ACCEPT}});
      },

      isochrones(points, profile = 'cycling-regular', ranges = [900,1800], options = {}) {
        const p = assertProfile(profile);
        const locations = assertPoints(points,1,LIMITS.maxIsochroneLocations);
        const normalizedRanges = (ranges||[]).map(Number).filter(Number.isFinite);
        if (!normalizedRanges.length || normalizedRanges.length > LIMITS.maxIsochroneIntervals) throw new Error(`Der kan bruges 1–${LIMITS.maxIsochroneIntervals} rækkeviddeintervaller.`);
        return requestJson(routingUrl(`/v2/isochrones/${p}`), cleanObject({
          locations,
          range: normalizedRanges,
          range_type: options.rangeType || 'time',
          interval: options.interval,
          location_type: options.locationType || 'start',
          smoothing: options.smoothing,
          attributes: options.attributes,
          area_units: options.areaUnits,
          units: options.units,
          intersections: options.intersections,
          options: cleanObject({
            ...(options.routeOptions || options.options || {}),
            avoid_features: sanitizeAvoidFeatures(p, options.avoidFeatures || []),
            round_trip: options.roundTrip
          }),
          ...(options.body || {})
        }), cfg(), {headers:{accept:GEOJSON_ACCEPT}});
      },

      matrix(points, profile = 'cycling-regular', options = {}) {
        const p = assertProfile(profile);
        const locations = assertPoints(points,2);
        return requestJson(routingUrl(`/v2/matrix/${p}`), cleanObject({
          locations,
          metrics: options.metrics || ['distance','duration'],
          sources: options.sources,
          destinations: options.destinations,
          resolve_locations: Boolean(options.resolveLocations),
          units: options.units || 'm',
          optimized: options.optimized,
          fallback_speed: options.fallbackSpeed,
          ...(options.body || {})
        }), cfg());
      },

      async pois(geometry, options = {}) {
        const limit=Math.min(100,Math.max(1,Number(options.limit||20)));
        const sortby=options.sortby||'distance';
        const batches=poiFilterBatches(poiFilters(options));
        const responses=[];
        for(const filters of batches){
          responses.push(await requestJson(ENDPOINTS.pois, cleanObject({request:'pois',geometry,limit,sortby,filters}), cfg(), {headers:{accept:GEOJSON_ACCEPT}}));
        }
        return mergePoiResponses(responses,limit,sortby);
      },

      poisAround(lng, lat, radius = 1500, options = {}) {
        const buffer = Math.min(LIMITS.maxPoiRadiusM, Math.max(50, Number(radius || 1500)));
        return this.pois({geojson:{type:'Point',coordinates:[Number(lng),Number(lat)]},buffer}, options);
      },

      async poiStats(geometry, options = {}) {
        const batches=poiFilterBatches(poiFilters(options));
        let merged=null;
        for(const filters of batches){
          const response=await requestJson(ENDPOINTS.pois, cleanObject({request:'stats',geometry,filters}), cfg(), {headers:{accept:GEOJSON_ACCEPT}});
          merged=merged===null?response:mergeStats(merged,response);
        }
        if(merged&&typeof merged==='object'){merged.batched=batches.length>1;merged.batches=batches.length;}
        return merged;
      },

      poiStatsAround(lng, lat, radius = 1500, options = {}) {
        const buffer = Math.min(LIMITS.maxPoiRadiusM, Math.max(50, Number(radius || 1500)));
        return this.poiStats({geojson:{type:'Point',coordinates:[Number(lng),Number(lat)]},buffer}, options);
      },

      isochroneAround(lng, lat, profile = 'cycling-regular', ranges = [900,1800], options = {}) {
        return this.isochrones([[Number(lng),Number(lat)]], profile, ranges, options);
      },

      matrixFromOrigin(origin, destinations, profile = 'driving-car', options = {}) {
        const dest = assertPoints(destinations||[],1);
        if (dest.length + 1 > LIMITS.maxMatrixDynamicLocations) {
          throw new Error(`En direkte matrix kan højst indeholde ${LIMITS.maxMatrixDynamicLocations-1} destinationer ad gangen. Brug matrixFromOriginBatched til større lister.`);
        }
        const points=[assertPoints([origin],1,1)[0],...dest];
        return this.matrix(points, profile, {...options,sources:['0'],destinations:points.slice(1).map((_,index)=>String(index+1))});
      },

      async matrixFromOriginBatched(origin, destinations, profile = 'driving-car', options = {}) {
        const dest = assertPoints(destinations||[],1);
        const batchSize = Math.max(1, LIMITS.maxMatrixDynamicLocations - 1);
        const durations=[];
        const distances=[];
        for (let offset=0; offset<dest.length; offset+=batchSize) {
          const chunk=dest.slice(offset,offset+batchSize);
          const matrix=await this.matrixFromOrigin(origin,chunk,profile,options);
          durations.push(...(matrix?.durations?.[0]||[]));
          distances.push(...(matrix?.distances?.[0]||[]));
        }
        return {durations:[durations],distances:[distances],batched:true,batches:Math.ceil(dest.length/batchSize)};
      },

      elevationPoint(coordinates, formatIn = 'point', formatOut = 'point') {
        return requestJson(elevationUrl('/v0/point'), {format_in:formatIn, format_out:formatOut, geometry:coordinates}, cfg());
      },

      elevationPointGet(lng, lat, options = {}) {
        const geometry = `${Number(lng)},${Number(lat)}`;
        return requestUrl(elevationUrl('/v0/point'), {method:'GET', query:{geometry, format_out:options.formatOut || 'point'}}, cfg());
      },

      elevationLine(geometry, formatIn = 'geojson', formatOut = 'geojson') {
        return requestJson(elevationUrl('/v0/line'), {format_in:formatIn, format_out:formatOut, geometry}, cfg());
      },

      async routeSummaryWithElevation(result) {
        const summary=normalizeRouteSummary(result);
        if (summary.ascentM || summary.descentM) return summary;
        const feature=result?.features?.[0];
        const coordinates=feature?.geometry?.type==='LineString' ? feature.geometry.coordinates : null;
        if (!Array.isArray(coordinates) || coordinates.length<2) return summary;
        const direct=elevationTotals(coordinates);
        if (direct.ascentM || direct.descentM || coordinates.some(c=>Number.isFinite(Number(c?.[2])))) {
          return {...summary,...direct};
        }
        const max=LIMITS.maxElevationVertices;
        const sampled=coordinates.length<=max ? coordinates : Array.from({length:max},(_,i)=>coordinates[Math.round(i*(coordinates.length-1)/(max-1))]);
        try {
          const elevated=await this.elevationLine({type:'LineString',coordinates:sampled},'geojson','geojson');
          const totals=elevationTotals(elevated?.geometry?.coordinates||[]);
          return {...summary,...totals};
        } catch (_) {
          return summary;
        }
      },

      optimization(jobs, vehicles, options = {}) {
        if ((jobs||[]).length > LIMITS.maxOptimizationRoutes) throw new Error(`Optimering kan højst indeholde ${LIMITS.maxOptimizationRoutes} opgaver.`);
        if ((vehicles||[]).length > LIMITS.maxOptimizationVehicles) throw new Error(`Optimering kan højst indeholde ${LIMITS.maxOptimizationVehicles} køretøjer.`);
        return requestJson(ENDPOINTS.optimization, cleanObject({jobs, vehicles, ...options}), cfg());
      },

      async test() {
        const result = await this.geocode('Holstebro, Danmark', {size:1});
        return Array.isArray(result?.features) && result.features.length > 0;
      },

      async testRouting() {
        const result = await this.directionsGeoJSON([[8.6153,56.3601],[8.6182,56.3632]],'cycling-regular',{instructions:false,elevation:false});
        return Boolean(result?.features?.length);
      },

      async diagnostics() {
        const tests = [
          ['Adresse', () => this.geocode('Holstebro, Danmark',{size:1})],
          ['Rute', () => this.directionsGeoJSON([[8.6153,56.3601],[8.6182,56.3632]],'cycling-regular',{instructions:false,elevation:false})],
          ['Reverse', () => this.reverseGeocode(8.6153,56.3601,{size:1})],
          ['Højde', () => this.elevationPointGet(8.6153,56.3601)],
          ['POI', () => this.poisAround(8.6153,56.3601,500,{preset:'essentials',limit:5})],
          ['Matrix', () => this.matrixFromOrigin([8.6153,56.3601],[[8.6182,56.3632]],'cycling-regular',{metrics:['distance','duration']})]
        ];
        const results=[];
        for (const [name,run] of tests) {
          const started=performance.now?.() ?? Date.now();
          try {
            await run();
            results.push({name,ok:true,ms:Math.round((performance.now?.() ?? Date.now())-started)});
          } catch (error) {
            results.push({name,ok:false,ms:Math.round((performance.now?.() ?? Date.now())-started),message:error?.message||String(error)});
          }
        }
        return results;
      }
    };

    return client;
  }

  window.VCORS = {
    createClient,
    VERSION,
    API_ROOT,
    ENDPOINTS,
    LIMITS,
    PROFILES,
    POI_PRESETS,
    CAPABILITIES,
    normalizeRouteSummary,
    elevationTotals,
    sanitizeAvoidFeatures,
    extraInfoForProfile,
    poiFilterBatches
  };
})();
