(() => {
  'use strict';

  const MAP_STACK = Object.freeze({
    engine:{name:'MapLibre GL JS',version:'5.24.0'},
    vectorTiles:{name:'OpenFreeMap',data:'OpenStreetMap / OpenMapTiles'},
    mapData:{name:'OpenStreetMap',attribution:'© OpenStreetMap contributors'},
    routing:{name:'OpenRouteService',shortName:'ORS'},
    imagery:{name:'Esri World Imagery',role:'Kun satellit-baggrund'}
  });

  const LIBERTY_URL = 'https://tiles.openfreemap.org/styles/liberty';
  const OPENFREEMAP_BASE = 'https://tiles.openfreemap.org/styles/';
  const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
  const SATELLITE_ATTRIBUTION = 'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community';

  const osmStandardStyle = () => ({
    version:8,
    name:'Vores Camping – OpenStreetMap Standard',
    metadata:{
      'vores-camping:engine':'MapLibre GL JS',
      'vores-camping:provider':'OpenStreetMap',
      'vores-camping:purpose':'Standard vejkort'
    },
    sources:{
      'osm-standard':{
        type:'raster',
        tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize:256,
        minzoom:0,
        maxzoom:19,
        attribution:OSM_ATTRIBUTION
      }
    },
    layers:[{
      id:'osm-standard',
      type:'raster',
      source:'osm-standard',
      minzoom:0,
      maxzoom:22,
      paint:{'raster-opacity':1,'raster-fade-duration':120,'raster-resampling':'linear'}
    }]
  });

  const satelliteStyle = () => ({
    version:8,
    name:'Vores Camping – Satellit',
    metadata:{
      'vores-camping:engine':'MapLibre GL JS',
      'vores-camping:provider':'Esri World Imagery',
      'vores-camping:map-data':'OpenStreetMap bruges fortsat af appens ORS/rute- og OpenFreeMap-lag'
    },
    sources:{
      'world-imagery':{
        type:'raster',
        tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize:256,minzoom:0,maxzoom:19,attribution:SATELLITE_ATTRIBUTION
      }
    },
    layers:[{
      id:'world-imagery',
      type:'raster',
      source:'world-imagery',
      minzoom:0,
      maxzoom:22,
      paint:{'raster-opacity':1,'raster-fade-duration':120,'raster-resampling':'linear'}
    }]
  });

  const STYLES = Object.freeze({
    liberty:{label:'Liberty · OpenFreeMap / OSM',url:LIBERTY_URL,provider:'OpenFreeMap',data:'OpenStreetMap'},
    bright:{label:'Bright · OpenFreeMap / OSM',url:`${OPENFREEMAP_BASE}bright`,provider:'OpenFreeMap',data:'OpenStreetMap'},
    positron:{label:'Positron · OpenFreeMap / OSM',url:`${OPENFREEMAP_BASE}positron`,provider:'OpenFreeMap',data:'OpenStreetMap'},
    fiord:{label:'Fiord · OpenFreeMap / OSM',url:`${OPENFREEMAP_BASE}fiord`,provider:'OpenFreeMap',data:'OpenStreetMap'},
    osm:{label:'OpenStreetMap · Standard',style:osmStandardStyle,provider:'OpenStreetMap',data:'OpenStreetMap'},
    satellite:{label:'Satellit',style:satelliteStyle,provider:'Esri',data:'Imagery'},
    hybrid:{label:'Hybrid · Satellit + OpenFreeMap / OSM',url:LIBERTY_URL,hybrid:true,provider:'Esri + OpenFreeMap',data:'OpenStreetMap + imagery'}
  });

  function applyHybridBasemap(map){
    if(!map||map.getSource('vc-hybrid-imagery'))return;
    map.addSource('vc-hybrid-imagery',{
      type:'raster',
      tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize:256,minzoom:0,maxzoom:19,attribution:SATELLITE_ATTRIBUTION
    });
    const layers=map.getStyle()?.layers||[];
    const before=(layers.find(layer=>layer.type!=='background')||{}).id;
    map.addLayer({
      id:'vc-hybrid-imagery',
      type:'raster',
      source:'vc-hybrid-imagery',
      minzoom:0,
      maxzoom:22,
      paint:{'raster-opacity':1,'raster-fade-duration':120,'raster-resampling':'linear'}
    },before);

    // OpenFreeMap Liberty uses OpenStreetMap-derived vector data.
    // In hybrid mode the aerial photo becomes the ground layer while
    // Liberty's roads, boundaries, POIs and labels remain readable above it.
    layers.forEach(layer=>{
      if(layer.id==='vc-hybrid-imagery'||layer.type==='background')return;
      try{
        if(layer.type==='raster'){
          map.setLayoutProperty(layer.id,'visibility','none');
        }else if(layer.type==='fill'){
          const id=String(layer.id||'').toLowerCase();
          const opacity=id.includes('building')?.16:id.includes('water')?.08:id.includes('park')?.06:.035;
          map.setPaintProperty(layer.id,'fill-opacity',opacity);
        }
      }catch(_){ }
    });
  }

  const registry = new Map();

  function destroy(id){
    const item=registry.get(id);
    if(!item) return;
    try{ item.map.remove(); }catch(_){ }
    registry.delete(id);
  }

  function destroyAll(){ [...registry.keys()].forEach(destroy); }

  function create(id, options={}) {
    destroy(id);
    const el=document.getElementById(id);
    if(!el) return null;
    if(!window.maplibregl){
      el.innerHTML='<div class="map-fallback">Kortmotoren kunne ikke indlæses. Appens øvrige funktioner virker stadig.</div>';
      return null;
    }

    const style=STYLES[options.styleKey]||STYLES.liberty;
    const resolvedStyle=typeof style.style==='function'?style.style():style.url;
    const map=new maplibregl.Map({
      container:id,
      style:resolvedStyle,
      center:options.center||[9.5,55.8],
      zoom:Number(options.zoom||4),
      attributionControl:true,
      cooperativeGestures:Boolean(options.cooperativeGestures)
    });

    const item={
      id,
      map,
      loaded:false,
      options:{...options},
      placeMarkers:[],
      routeMarkers:[],
      poiMarkers:[],
      selectedMarker:null,
      userMarker:null,
      pending:[]
    };
    registry.set(id,item);

    map.addControl(new maplibregl.NavigationControl({showCompass:true,visualizePitch:true}),'top-right');
    if(window.maplibregl.FullscreenControl) map.addControl(new maplibregl.FullscreenControl(),'top-right');
    if(window.maplibregl.ScaleControl) map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');

    map.on('load',()=>{
      if(style.hybrid)applyHybridBasemap(map);
      item.loaded=true;
      setPlaces(id,options.places||[],options);
      setRoute(id,options.routeGeoJSON||null,options.routePoints||[],options);
      setPois(id,options.poiFeatures||[],options);
      if(options.selectedPoint) setSelectedPoint(id,options.selectedPoint,options);
      if(options.userLocation) setUserLocation(id,options.userLocation,options);
      if(options.isochroneGeoJSON) setOverlay(id,'isochrone',options.isochroneGeoJSON,{kind:'fill',color:'#1f8f5f',opacity:.18,lineColor:'#1f5f3c'});
      item.pending.splice(0).forEach(fn=>{try{fn()}catch(error){console.error(error)}});
      if(options.fitAll!==false) fitCurrent(id);
      options.onReady?.(map);
    });

    map.on('click',event=>options.onClick?.({lng:event.lngLat.lng,lat:event.lngLat.lat,map,event}));
    map.on('moveend',()=>options.onMoveEnd?.({center:map.getCenter(),zoom:map.getZoom(),bounds:map.getBounds()}));
    return map;
  }

  function whenReady(id,fn){
    const item=registry.get(id);
    if(!item) return;
    if(item.loaded&&item.map?.isStyleLoaded()) fn(item);
    else item.pending.push(()=>fn(item));
  }

  function get(id){ return registry.get(id)?.map||null; }

  function clearMarkers(list){
    list.splice(0).forEach(marker=>{try{marker.remove()}catch(_){}});
  }

  function makeImageMarker(src,className='marker-pin'){
    const node=document.createElement('button');
    node.type='button';
    node.className=className;
    node.style.border='0';
    node.style.backgroundColor='transparent';
    node.style.cursor='pointer';
    node.style.backgroundImage=`url('${src}')`;
    return node;
  }

  function setPlaces(id,places=[],options={}){
    whenReady(id,item=>{
      clearMarkers(item.placeMarkers);
      item.options.places=places;
      places.forEach(place=>{
        const lng=Number(place.lng),lat=Number(place.lat);
        if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
        const icon=place.status==='visited'
          ?(options.visitedIcon||item.options.visitedIcon||'assets/map-visited-v21.svg')
          :(options.wishIcon||item.options.wishIcon||'assets/map-wish-v21.svg');
        const node=makeImageMarker(icon,'marker-pin place-marker');
        node.title=place.name||'Campingplads';
        const popup=new maplibregl.Popup({offset:22,maxWidth:'290px'}).setHTML(
          `<strong>${escapeHtml(place.name||'Campingplads')}</strong><br>`+
          `<span>${escapeHtml([place.city,place.country].filter(Boolean).join(', '))}</span><br>`+
          `<button class="map-popup-btn" data-open-place="${escapeHtml(place.id||'')}">Åbn detaljer</button>`
        );
        const marker=new maplibregl.Marker({element:node,anchor:'bottom'})
          .setLngLat([lng,lat]).setPopup(popup).addTo(item.map);
        node.addEventListener('click',()=>options.onPlaceClick?.(place));
        item.placeMarkers.push(marker);
      });
    });
  }

  function normalizeFeatureCollection(data){
    if(!data) return {type:'FeatureCollection',features:[]};
    if(data.type==='FeatureCollection') return data;
    if(data.type==='Feature') return {type:'FeatureCollection',features:[data]};
    if(data.type&&data.coordinates) return {type:'FeatureCollection',features:[{type:'Feature',geometry:data,properties:{}}]};
    return {type:'FeatureCollection',features:[]};
  }

  function upsertLine(map,id,data,color='#d86c28',width=5){
    const fc=normalizeFeatureCollection(data);
    if(map.getSource(id)) map.getSource(id).setData(fc);
    else {
      map.addSource(id,{type:'geojson',data:fc});
      map.addLayer({id,type:'line',source:id,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':width,'line-opacity':.92}});
    }
  }

  function removeLayerAndSource(map,id){
    try{if(map.getLayer(id))map.removeLayer(id)}catch(_){ }
    try{if(map.getSource(id))map.removeSource(id)}catch(_){ }
  }

  function setRoute(id,geojson,points=[],options={}){
    whenReady(id,item=>{
      item.options.routeGeoJSON=geojson;
      item.options.routePoints=points;
      upsertLine(item.map,'route-line',geojson||lineFromPoints(points),options.routeColor||item.options.routeColor||'#d86c28',Number(options.routeWidth||6));
      clearMarkers(item.routeMarkers);
      points.forEach((point,index)=>{
        const lng=Number(point.lng),lat=Number(point.lat);
        if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
        const img=index===0
          ?(options.startIcon||item.options.startIcon||'assets/route-start-v21.svg')
          :index===points.length-1
            ?(options.endIcon||item.options.endIcon||'assets/route-end-v21.svg')
            :(options.viaIcon||item.options.viaIcon||'assets/route-via-v21.svg');
        const el=makeImageMarker(img,'marker-pin route-point-marker');
        el.title=index===0?'Start':index===points.length-1?'Mål':`Stop ${index}`;
        const marker=new maplibregl.Marker({element:el,draggable:Boolean(options.draggable??item.options.draggable)})
          .setLngLat([lng,lat]).addTo(item.map);
        marker.on('dragend',event=>(options.onPointMove||item.options.onPointMove)?.(index,event.target.getLngLat()));
        item.routeMarkers.push(marker);
      });
    });
  }

  function setPois(id,features=[],options={}){
    whenReady(id,item=>{
      clearMarkers(item.poiMarkers);
      item.options.poiFeatures=features;
      features.forEach((feature,index)=>{
        const coordinates=feature?.geometry?.coordinates;
        if(!Array.isArray(coordinates)||coordinates.length<2) return;
        const lng=Number(coordinates[0]),lat=Number(coordinates[1]);
        if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
        const properties=feature.properties||{};
        const tags=properties.osm_tags||{};
        const categories=properties.category_ids||{};
        const firstCategory=Object.values(categories)[0]||{};
        const name=tags.name||properties.name||firstCategory.category_name||`Sted ${index+1}`;
        const type=firstCategory.category_name||properties.category_name||'Point of interest';
        const node=document.createElement('button');
        node.type='button';
        node.className='poi-marker';
        node.title=name;
        node.innerHTML=escapeHtml(options.icon||'✦');
        const distance=Number(properties.distance);
        const popup=new maplibregl.Popup({offset:18,maxWidth:'300px'}).setHTML(
          `<strong>${escapeHtml(name)}</strong><br><span>${escapeHtml(type.replaceAll('_',' '))}</span>`+
          `${Number.isFinite(distance)?`<br><small>${Math.round(distance)} m væk</small>`:''}`
        );
        const marker=new maplibregl.Marker({element:node,anchor:'center'})
          .setLngLat([lng,lat]).setPopup(popup).addTo(item.map);
        node.addEventListener('click',()=>options.onPoiClick?.(feature));
        item.poiMarkers.push(marker);
      });
    });
  }

  function setSelectedPoint(id,point,options={}){
    whenReady(id,item=>{
      try{item.selectedMarker?.remove()}catch(_){ }
      item.selectedMarker=null;
      if(!point) return;
      const lng=Number(point.lng),lat=Number(point.lat);
      if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
      const node=document.createElement('div');
      node.className='selected-map-point';
      node.title=options.title||'Valgt punkt';
      item.selectedMarker=new maplibregl.Marker({element:node,anchor:'center'}).setLngLat([lng,lat]).addTo(item.map);
    });
  }

  function setUserLocation(id,point,options={}){
    whenReady(id,item=>{
      try{item.userMarker?.remove()}catch(_){ }
      item.userMarker=null;
      if(!point) return;
      const lng=Number(point.lng),lat=Number(point.lat);
      if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
      const node=document.createElement('div');
      node.className='user-location-marker';
      node.title=options.title||'Min placering';
      item.userMarker=new maplibregl.Marker({element:node,anchor:'center'}).setLngLat([lng,lat]).addTo(item.map);
    });
  }

  function setOverlay(id,key,data,options={}){
    whenReady(id,item=>{
      const sourceId=`overlay-${key}`;
      const fillId=`${sourceId}-fill`;
      const lineId=`${sourceId}-line`;
      const circleId=`${sourceId}-circle`;
      [fillId,lineId,circleId].forEach(layer=>{try{if(item.map.getLayer(layer))item.map.removeLayer(layer)}catch(_){}});
      try{if(item.map.getSource(sourceId))item.map.removeSource(sourceId)}catch(_){ }
      const fc=normalizeFeatureCollection(data);
      item.map.addSource(sourceId,{type:'geojson',data:fc});
      const kind=options.kind||'fill';
      if(kind==='line'){
        item.map.addLayer({id:lineId,type:'line',source:sourceId,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':options.color||'#2878bd','line-width':Number(options.width||4),'line-opacity':Number(options.opacity??.9)}});
      }else if(kind==='circle'){
        item.map.addLayer({id:circleId,type:'circle',source:sourceId,paint:{'circle-radius':Number(options.radius||6),'circle-color':options.color||'#2878bd','circle-stroke-color':'#fff','circle-stroke-width':2}});
      }else{
        item.map.addLayer({id:fillId,type:'fill',source:sourceId,paint:{'fill-color':options.color||'#1f8f5f','fill-opacity':Number(options.opacity??.18)}});
        item.map.addLayer({id:lineId,type:'line',source:sourceId,paint:{'line-color':options.lineColor||options.color||'#1f5f3c','line-width':Number(options.lineWidth||2),'line-opacity':.8}});
      }
    });
  }

  function removeOverlay(id,key){
    whenReady(id,item=>{
      const sourceId=`overlay-${key}`;
      [`${sourceId}-fill`,`${sourceId}-line`,`${sourceId}-circle`].forEach(layer=>{try{if(item.map.getLayer(layer))item.map.removeLayer(layer)}catch(_){}});
      try{if(item.map.getSource(sourceId))item.map.removeSource(sourceId)}catch(_){ }
    });
  }

  function clearAnalyses(id){
    setPois(id,[]);
    setSelectedPoint(id,null);
    removeOverlay(id,'isochrone');
  }

  function fit(map,coords,padding=70,maxZoom=13){
    if(!coords.length) return;
    if(coords.length===1){map.flyTo({center:coords[0],zoom:Math.min(maxZoom,12),essential:true});return;}
    const bounds=coords.reduce((box,coordinate)=>box.extend(coordinate),new maplibregl.LngLatBounds(coords[0],coords[0]));
    map.fitBounds(bounds,{padding,maxZoom,duration:350});
  }

  function fitCurrent(id,options={}){
    const item=registry.get(id);
    if(!item) return;
    const coords=[];
    (item.options.places||[]).forEach(place=>coords.push([Number(place.lng),Number(place.lat)]));
    (item.options.routePoints||[]).forEach(point=>coords.push([Number(point.lng),Number(point.lat)]));
    (item.options.poiFeatures||[]).forEach(feature=>coords.push(feature?.geometry?.coordinates));
    fit(item.map,coords.filter(pair=>Array.isArray(pair)&&pair.length>=2&&pair.every(Number.isFinite)),options.padding||70,options.maxZoom||13);
  }

  function flyTo(id,point,zoom=13){
    const map=get(id);
    if(!map||!point) return;
    const lng=Number(point.lng??point[0]),lat=Number(point.lat??point[1]);
    if(!Number.isFinite(lng)||!Number.isFinite(lat)) return;
    map.flyTo({center:[lng,lat],zoom:Number(zoom),essential:true});
  }

  function center(id){
    const value=get(id)?.getCenter?.();
    return value?{lng:value.lng,lat:value.lat}:null;
  }

  function bounds(id){
    const value=get(id)?.getBounds?.();
    if(!value) return null;
    return [[value.getWest(),value.getSouth()],[value.getEast(),value.getNorth()]];
  }

  function resize(id){try{get(id)?.resize()}catch(_){ }}

  function lineFromPoints(points=[]){
    return {type:'FeatureCollection',features:points.length>=2?[{type:'Feature',geometry:{type:'LineString',coordinates:points.map(point=>[Number(point.lng),Number(point.lat)])},properties:{}}]:[]};
  }

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  window.VCMaps={
    stack:MAP_STACK,
    styles:STYLES,
    create,destroy,destroyAll,get,resize,center,bounds,flyTo,fit,fitCurrent,
    setPlaces,setRoute,setPois,setSelectedPoint,setUserLocation,setOverlay,removeOverlay,clearAnalyses,
    upsertLine,lineFromPoints
  };
})();
