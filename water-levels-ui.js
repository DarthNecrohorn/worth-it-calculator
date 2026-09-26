/* =========================================================
   WATER LEVELS UI
   Live Copernicus CLMS integration.

   Backend:
     /api/water-levels?action=stations
     /api/water-levels?action=details&id=...&type=river&range=MAX
========================================================= */

(function(){
    "use strict";

    let activeFilter = "all";
    let activeHistoryRange = "MAX";
    let activeStationId = null;
    let activeStation = null;
    let searchTimer = null;
    let stationsRequest = null;
    let stationsRequestTimer = null;
    let stationMetadataRun = 0;
    let latestObserver = null;

    const stationMetadataCache = new Map();
    const stationLatestCache = new Map();
    const stationPlaceCache = new Map();
    const ALL_STATION_LIMIT = 24;
    const CATEGORY_STATION_LIMIT = 200;
    const STATION_METADATA_CONCURRENCY = 3;
    const STATION_LATEST_CONCURRENCY = 4;
    const STATION_PLACE_CONCURRENCY = 3;

    const WATER_STATION_PLACE_CACHE = {
        CACHE_KEY: "worthIt.waterLevels.stationPlaces.v2",
        TTL_MS: 7 * 24 * 60 * 60 * 1000
    };

    const WATER_LOCATION_CONFIG = {
        CACHE_KEY:
            "worthIt.waterLevels.location.v1",
        CACHE_TTL_MS:
            30 * 60 * 1000,
        GELOCATION_TIMEOUT_MS:
            10000,
        REVERSE_GEOCODE_TIMEOUT_MS:
            8000,
        COUNTRY_BOUNDARY_URL:
            "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
        US_STATE_BOUNDARY_URL:
            "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
    };

    let waterLocationPromise = null;
    let waterCountryFeaturesPromise = null;
    let waterUsStateFeaturesPromise = null;
    const waterStationGeoCache = new Map();

    const WATER_STATIONS_CACHE = {
        CACHE_KEY: "worthIt.waterLevels.stations.v8",
        TTL_MS: 30 * 60 * 1000,
        STALE_MS: 24 * 60 * 60 * 1000
    };

    const state = {
        stations: [],
        loading: false,
        error: "",
        location: null
    };

    function stationCacheKey(query,country){
        return WATER_STATIONS_CACHE.CACHE_KEY +
            "::" +
            (country || "global").toLowerCase() +
            "::" +
            (query || "all").toLowerCase();
    }

    function readStationsCache(query,country){
        try{
            const raw =
                localStorage.getItem(
                    stationCacheKey(query,country)
                );

            if(!raw) return null;

            const parsed = JSON.parse(raw);

            if(
                !parsed ||
                !parsed.timestamp ||
                !Array.isArray(parsed.stations)
            ){
                return null;
            }

            const age =
                Date.now() -
                Number(parsed.timestamp);

            if(
                !Number.isFinite(age) ||
                age < 0 ||
                age > WATER_STATIONS_CACHE.STALE_MS
            ){
                return null;
            }

            return {
                stations: parsed.stations,
                location: parsed.location || null,
                fresh:
                    age <= WATER_STATIONS_CACHE.TTL_MS
            };
        }
        catch(error){
            return null;
        }
    }

    function saveStationsCache(query,stations,location){
        try{
            localStorage.setItem(
                stationCacheKey(
                    query,
                    location &&
                    location.countryName
                ),
                JSON.stringify({
                    timestamp: Date.now(),
                    stations,
                    location: location || null
                })
            );
        }
        catch(error){}
    }

    function get(id){
        return document.getElementById(id);
    }

    function escapeHtml(value){
        return String(value == null ? "" : value)
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    function formatNumber(value, decimals){
        const number = Number(value);
        if(!Number.isFinite(number)) return "—";
        return number.toLocaleString(
            undefined,
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: decimals == null ? 2 : decimals
            }
        );
    }

    function formatDate(value){
        if(!value) return "—";

        const date = new Date(value);
        if(Number.isNaN(date.getTime())) return String(value);

        return date.toLocaleString(
            undefined,
            {
                dateStyle:"medium",
                timeStyle:"short"
            }
        );
    }

    function formatCoordinates(coordinates){
        if(
            !coordinates ||
            !Number.isFinite(Number(coordinates.latitude)) ||
            !Number.isFinite(Number(coordinates.longitude))
        ){
            return "—";
        }

        return (
            Number(coordinates.latitude).toFixed(4) +
            "°, " +
            Number(coordinates.longitude).toFixed(4) +
            "°"
        );
    }

    function waterUsesUsCustomaryUnits(){
        const location =
            state.location ||
            readWaterLocationCache();

        return (
            String(
                location &&
                location.countryCode || ""
            ).trim().toUpperCase() === "US"
        );
    }

    function formatWaterSurfaceHeight(value){
        const number = Number(value);

        if(!Number.isFinite(number)){
            return "—";
        }

        if(waterUsesUsCustomaryUnits()){
            return (
                formatNumber(
                    number * 3.280839895,
                    2
                ) +
                " ft"
            );
        }

        return formatNumber(number,3) + " m";
    }

    function formatWaterUncertainty(value){
        const number = Number(value);

        if(!Number.isFinite(number)){
            return "—";
        }

        if(waterUsesUsCustomaryUnits()){
            return (
                "± " +
                formatNumber(
                    number * 3.280839895,
                    2
                ) +
                " ft"
            );
        }

        return "± " + formatNumber(number,3) + " m";
    }

    function formatRelativeWaterLevelValue(
        surfaceHeight,
        referenceDatumAltitude
    ){
        const height =
            Number(surfaceHeight);

        const datum =
            Number(referenceDatumAltitude);

        if(
            !Number.isFinite(height) ||
            !Number.isFinite(datum)
        ){
            return "";
        }

        const centimeters =
            (height - datum) * 100;

        if(waterUsesUsCustomaryUnits()){
            const inches =
                centimeters * 0.3937007874;

            return (
                (
                    inches > 0
                        ? "+"
                        : ""
                ) +
                formatNumber(inches,1) +
                " in"
            );
        }

        return (
            (
                centimeters > 0
                    ? "+"
                    : ""
            ) +
            formatNumber(centimeters,0) +
            " cm"
        );
    }

    function formatSatelliteChange(
        latestHeight,
        previousHeight
    ){
        if(
            previousHeight === null ||
            previousHeight === undefined ||
            latestHeight === null ||
            latestHeight === undefined ||
            latestHeight === "" ||
            previousHeight === ""
        ){
            return "";
        }

        const latest =
            Number(latestHeight);
        const previous =
            Number(previousHeight);

        if(
            !Number.isFinite(latest) ||
            !Number.isFinite(previous)
        ){
            return "";
        }

        const centimeters =
            (latest - previous) * 100;

        if(waterUsesUsCustomaryUnits()){
            const inches =
                centimeters * 0.3937007874;

            return (
                (
                    inches > 0
                        ? "+"
                        : ""
                ) +
                formatNumber(inches,1) +
                " in"
            );
        }

        return (
            (
                centimeters > 0
                    ? "+"
                    : ""
            ) +
            formatNumber(centimeters,0) +
            " cm"
        );
    }

    function formatRelativeWaterLevel(
        surfaceHeight,
        referenceDatumAltitude
    ){
        const value =
            formatRelativeWaterLevelValue(
                surfaceHeight,
                referenceDatumAltitude
            );

        return value
            ? "Water level: " + value
            : "";
    }

    function waterLengthSystemName(){
        return waterUsesUsCustomaryUnits()
            ? "US customary"
            : "Metric";
    }

    function stationIcon(type){
        return type === "lake" ? "🏝️" : "🏞️";
    }

    function stationTypeLabel(type){
        return type === "lake" ? "Lake" : "River";
    }

    function stationBodyKey(station){
        return normalizeGeoName(
            station &&
            (
                station.waterBody ||
                station.title ||
                station.productName ||
                ""
            )
        );
    }

    function stationBaseTitle(station){
        const typeLabel =
            stationTypeLabel(
                station && station.type
            );

        return (
            station &&
            (
                station.waterBody ||
                station.title ||
                station.productName
            )
        ) || (
            typeLabel +
            " water-level station"
        );
    }

    function stationDisplayTitle(station){
        const base =
            stationBaseTitle(station);

        const place =
            station &&
            station.placeName
                ? String(station.placeName).trim()
                : "";

        return (
            base +
            " — " +
            (
                place ||
                "No city"
            )
        );
    }

    function localizeWaterPlaceName(placeName,location){
        const value =
            String(placeName || "").trim();

        if(!value) return "";

        const countryCode =
            String(
                location &&
                location.countryCode || ""
            ).trim().toUpperCase();

        if(countryCode !== "RS"){
            return value;
        }

        /*
         * BigDataCloud commonly returns Serbian place names in an
         * ASCII/English form. Restore Serbian diacritics for the
         * station label while keeping the geocoder as the source.
         */
        const serbianNames = {
            "indija":"Inđija",
            "beocin":"Beočin",
            "backa palanka":"Bačka Palanka",
            "backa topola":"Bačka Topola",
            "backi petrovac":"Bački Petrovac",
            "backi jarkovac":"Bački Jarkovac",
            "becej":"Bečej",
            "bezdan":"Bezdan",
            "crvenka":"Crvenka",
            "cacak":"Čačak",
            "djurdjevo":"Đurđevo",
            "gornji milanovac":"Gornji Milanovac",
            "kikinda":"Kikinda",
            "knjazevac":"Knjaževac",
            "kragujevac":"Kragujevac",
            "krusevac":"Kruševac",
            "loznica":"Loznica",
            "ljubovija":"Ljubovija",
            "ljig":"Ljig",
            "mionica":"Mionica",
            "novi pazar":"Novi Pazar",
            "novi sad":"Novi Sad",
            "odzaci":"Odžaci",
            "pozezga":"Požega",
            "sremska mitrovica":"Sremska Mitrovica",
            "senta":"Senta",
            "smederevo":"Smederevo",
            "smederevska palanka":"Smederevska Palanka",
            "sombor":"Sombor",
            "sremski karlovci":"Sremski Karlovci",
            "subotica":"Subotica",
            "sabac":"Šabac",
            "trstenik":"Trstenik",
            "uzice":"Užice",
            "vranje":"Vranje",
            "vrbas":"Vrbas",
            "vrsac":"Vršac",
            "zabari":"Žabari",
            "zabalj":"Žabalj",
            "zajecar":"Zaječar",
            "zrenjanin":"Zrenjanin"
        };

        const normalized =
            value
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g,"")
                .toLowerCase()
                .replace(/\s+/g," ")
                .trim();

        return (
            serbianNames[normalized] ||
            value
        );
    }

    function readStationPlaceCache(key){
        if(!key) return null;

        try{
            const raw =
                localStorage.getItem(
                    WATER_STATION_PLACE_CACHE.CACHE_KEY +
                    "::" +
                    key
                );

            if(!raw) return null;

            const parsed = JSON.parse(raw);

            if(
                !parsed ||
                !parsed.timestamp ||
                !parsed.placeName
            ){
                return null;
            }

            const age =
                Date.now() -
                Number(parsed.timestamp);

            if(
                !Number.isFinite(age) ||
                age < 0 ||
                age > WATER_STATION_PLACE_CACHE.TTL_MS
            ){
                return null;
            }

            return String(parsed.placeName);
        }
        catch(error){
            return null;
        }
    }

    function saveStationPlaceCache(key,placeName){
        if(!key || !placeName) return;

        try{
            localStorage.setItem(
                WATER_STATION_PLACE_CACHE.CACHE_KEY +
                "::" +
                key,
                JSON.stringify({
                    timestamp:Date.now(),
                    placeName
                })
            );
        }
        catch(error){}
    }

    async function reverseGeocodeStationPlace(coordinates){
        if(
            !coordinates ||
            !Number.isFinite(Number(coordinates.latitude)) ||
            !Number.isFinite(Number(coordinates.longitude))
        ){
            return "";
        }

        const controller =
            new AbortController();

        const timer =
            window.setTimeout(
                function(){
                    controller.abort();
                },
                WATER_LOCATION_CONFIG.REVERSE_GEOCODE_TIMEOUT_MS
            );

        try{
            const params =
                new URLSearchParams();

            params.set(
                "latitude",
                String(coordinates.latitude)
            );
            params.set(
                "longitude",
                String(coordinates.longitude)
            );
            params.set(
                "localityLanguage",
                "en"
            );

            const response =
                await fetch(
                    "https://api.bigdatacloud.net/data/reverse-geocode-client?" +
                    params.toString(),
                    {
                        method:"GET",
                        headers:{
                            "Accept":"application/json"
                        },
                        cache:"force-cache",
                        signal:controller.signal
                    }
                );

            if(!response.ok){
                return "";
            }

            const data =
                await response.json().catch(function(){
                    return null;
                });

            if(!data || typeof data !== "object"){
                return "";
            }

            return localizeWaterPlaceName(
                String(
                    data.city ||
                    data.locality ||
                    ""
                ).trim(),
                state.location
            );
        }
        catch(error){
            return "";
        }
        finally{
            window.clearTimeout(timer);
        }
    }

    async function loadStationPlaceLabels(stations){
        if(!Array.isArray(stations) || !stations.length){
            return;
        }

        /*
         * Every visible station gets a city lookup. This is global and is
         * not limited to repeated river/lake names. When no city can be
         * resolved, the title remains explicitly labelled "No city".
         */
        const targets =
            stations.filter(function(station){
                return (
                    station &&
                    station.coordinates &&
                    Number.isFinite(
                        Number(station.coordinates.latitude)
                    ) &&
                    Number.isFinite(
                        Number(station.coordinates.longitude)
                    )
                );
            });

        if(!targets.length){
            return;
        }

        let cursor = 0;

        async function worker(){
            while(cursor < targets.length){
                const station = targets[cursor++];

                const lat =
                    Number(
                        station.coordinates &&
                        station.coordinates.latitude
                    );
                const lon =
                    Number(
                        station.coordinates &&
                        station.coordinates.longitude
                    );

                if(
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon)
                ){
                    continue;
                }

                const cacheKey =
                    lat.toFixed(4) +
                    "|" +
                    lon.toFixed(4);

                let placeName =
                    stationPlaceCache.get(cacheKey) ||
                    readStationPlaceCache(cacheKey);

                if(placeName){
                    placeName =
                        localizeWaterPlaceName(
                            placeName,
                            state.location
                        );

                    stationPlaceCache.set(
                        cacheKey,
                        placeName
                    );
                }
                else{
                    placeName =
                        await reverseGeocodeStationPlace(
                            {
                                latitude:lat,
                                longitude:lon
                            }
                        );

                    if(placeName){
                        placeName =
                            localizeWaterPlaceName(
                                placeName,
                                state.location
                            );

                        stationPlaceCache.set(
                            cacheKey,
                            placeName
                        );
                        saveStationPlaceCache(
                            cacheKey,
                            placeName
                        );
                    }
                }

                if(!placeName){
                    continue;
                }

                station.placeName =
                    placeName;

                const current =
                    state.stations.find(function(item){
                        return item.id === station.id;
                    });

                if(current){
                    current.placeName =
                        placeName;
                    applyStationTitleToCard(
                        current
                    );
                }
            }
        }

        const workers = [];
        const count = Math.min(
            STATION_PLACE_CONCURRENCY,
            targets.length
        );

        for(let index = 0; index < count; index++){
            workers.push(worker());
        }

        await Promise.all(workers);
    }

    function currentQuery(){
        const input = get("waterLevelsSearch");
        return input ? input.value.trim() : "";
    }

    function normalizeGeoName(value){
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g,"")
            .toLowerCase()
            .replace(/\b(united states of america|usa)\b/g,"united states")
            .replace(/[^a-z0-9]+/g," ")
            .trim();
    }

    function readWaterLocationCache(){
        try{
            const raw =
                localStorage.getItem(
                    WATER_LOCATION_CONFIG.CACHE_KEY
                );

            if(!raw) return null;

            const parsed = JSON.parse(raw);
            if(
                !parsed ||
                !parsed.timestamp ||
                !parsed.location
            ){
                return null;
            }

            const age =
                Date.now() -
                Number(parsed.timestamp);

            if(
                !Number.isFinite(age) ||
                age < 0 ||
                age > WATER_LOCATION_CONFIG.CACHE_TTL_MS
            ){
                return null;
            }

            return parsed.location;
        }
        catch(error){
            return null;
        }
    }

    function saveWaterLocationCache(location){
        try{
            localStorage.setItem(
                WATER_LOCATION_CONFIG.CACHE_KEY,
                JSON.stringify({
                    timestamp:Date.now(),
                    location
                })
            );
        }
        catch(error){}
    }

    async function getWaterLocationCoordinates(){
        if(
            typeof getBrowserLocation === "function"
        ){
            try{
                const location =
                    await getBrowserLocation();

                if(
                    location &&
                    Number.isFinite(Number(location.latitude)) &&
                    Number.isFinite(Number(location.longitude))
                ){
                    return {
                        latitude:
                            Number(location.latitude),
                        longitude:
                            Number(location.longitude)
                    };
                }
            }
            catch(error){}
        }

        return await new Promise(function(resolve,reject){
            if(!navigator.geolocation){
                reject(
                    new Error(
                        "Browser geolocation is not supported."
                    )
                );
                return;
            }

            navigator.geolocation.getCurrentPosition(
                function(position){
                    resolve({
                        latitude:
                            Number(position.coords.latitude),
                        longitude:
                            Number(position.coords.longitude)
                    });
                },
                function(error){
                    reject(error);
                },
                {
                    enableHighAccuracy:false,
                    timeout:
                        WATER_LOCATION_CONFIG.GELOCATION_TIMEOUT_MS,
                    maximumAge:
                        WATER_LOCATION_CONFIG.CACHE_TTL_MS
                }
            );
        });
    }

    async function reverseGeocodeWaterLocation(
        coordinates
    ){
        const controller =
            new AbortController();

        const timer =
            window.setTimeout(
                function(){
                    controller.abort();
                },
                WATER_LOCATION_CONFIG.REVERSE_GEOCODE_TIMEOUT_MS
            );

        try{
            const params =
                new URLSearchParams();

            if(
                coordinates &&
                Number.isFinite(Number(coordinates.latitude)) &&
                Number.isFinite(Number(coordinates.longitude))
            ){
                params.set(
                    "latitude",
                    String(coordinates.latitude)
                );
                params.set(
                    "longitude",
                    String(coordinates.longitude)
                );
            }

            params.set(
                "localityLanguage",
                "en"
            );

            const response =
                await fetch(
                    "https://api.bigdatacloud.net/data/reverse-geocode-client?" +
                    params.toString(),
                    {
                        method:"GET",
                        headers:{
                            "Accept":"application/json"
                        },
                        cache:"no-store",
                        signal:controller.signal
                    }
                );

            if(!response.ok){
                throw new Error(
                    "Reverse geocoding failed."
                );
            }

            const data =
                await response.json();

            if(!data || typeof data !== "object"){
                throw new Error(
                    "Invalid reverse geocoding response."
                );
            }

            const latitude =
                Number(data.latitude);

            const longitude =
                Number(data.longitude);

            if(
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ){
                throw new Error(
                    "Reverse geocoding returned no coordinates."
                );
            }

            return {
                latitude,
                longitude,
                countryCode:
                    String(
                        data.countryCode || ""
                    ).trim().toUpperCase(),
                countryName:
                    String(
                        data.countryName || ""
                    ).trim(),
                stateCode:
                    String(
                        data.principalSubdivisionCode || ""
                    ).trim().toUpperCase(),
                stateName:
                    String(
                        data.principalSubdivision || ""
                    ).trim(),
                city:
                    String(
                        data.city ||
                        data.locality ||
                        ""
                    ).trim(),
                lookupSource:
                    String(
                        data.lookupSource || ""
                    ).trim()
            };
        }
        finally{
            window.clearTimeout(timer);
        }
    }

    async function resolveWaterLocation(){
        const cached =
            readWaterLocationCache();

        if(cached){
            return cached;
        }

        if(waterLocationPromise){
            return await waterLocationPromise;
        }

        waterLocationPromise =
            (async function(){
                let coordinates = null;

                try{
                    coordinates =
                        await getWaterLocationCoordinates();
                }
                catch(error){}

                try{
                    let location = null;

                    try{
                        location =
                            await reverseGeocodeWaterLocation(
                                coordinates
                            );
                    }
                    catch(error){
                        /*
                         * BigDataCloud also supports a client-side
                         * IP fallback when coordinates are omitted.
                         */
                        if(coordinates){
                            location =
                                await reverseGeocodeWaterLocation(
                                    null
                                );
                        }
                        else{
                            throw error;
                        }
                    }

                    saveWaterLocationCache(location);
                    return location;
                }
                catch(error){
                    console.warn(
                        "Water Levels location detection failed:",
                        error
                    );
                    return null;
                }
            })();

        try{
            return await waterLocationPromise;
        }
        finally{
            waterLocationPromise = null;
        }
    }

    function pointInRing(
        longitude,
        latitude,
        ring
    ){
        let inside = false;

        if(!Array.isArray(ring)) return false;

        for(
            let index = 0,
                previous = ring.length - 1;
            index < ring.length;
            previous = index++
        ){
            const point =
                ring[index] || [];
            const prev =
                ring[previous] || [];

            const xi = Number(point[0]);
            const yi = Number(point[1]);
            const xj = Number(prev[0]);
            const yj = Number(prev[1]);

            if(
                !Number.isFinite(xi) ||
                !Number.isFinite(yi) ||
                !Number.isFinite(xj) ||
                !Number.isFinite(yj)
            ){
                continue;
            }

            const intersects =
                (
                    yi > latitude
                ) !==
                (
                    yj > latitude
                ) &&
                longitude <
                (
                    (xj - xi) *
                    (latitude - yi) /
                    (yj - yi) +
                    xi
                );

            if(intersects){
                inside = !inside;
            }
        }

        return inside;
    }

    function pointInPolygon(
        longitude,
        latitude,
        coordinates
    ){
        if(!Array.isArray(coordinates)) return false;
        if(!pointInRing(longitude,latitude,coordinates[0])){
            return false;
        }

        for(
            let index = 1;
            index < coordinates.length;
            index++
        ){
            if(
                pointInRing(
                    longitude,
                    latitude,
                    coordinates[index]
                )
            ){
                return false;
            }
        }

        return true;
    }

    function pointInGeometry(
        longitude,
        latitude,
        geometry
    ){
        if(!geometry) return false;

        if(geometry.type === "Polygon"){
            return pointInPolygon(
                longitude,
                latitude,
                geometry.coordinates
            );
        }

        if(geometry.type === "MultiPolygon"){
            return geometry.coordinates.some(
                function(polygon){
                    return pointInPolygon(
                        longitude,
                        latitude,
                        polygon
                    );
                }
            );
        }

        if(
            geometry.type === "GeometryCollection" &&
            Array.isArray(geometry.geometries)
        ){
            return geometry.geometries.some(
                function(item){
                    return pointInGeometry(
                        longitude,
                        latitude,
                        item
                    );
                }
            );
        }

        return false;
    }

    async function loadGeoFeatures(url,objectName){
        if(
            typeof topojson === "undefined" ||
            typeof topojson.feature !== "function"
        ){
            throw new Error(
                "TopoJSON client library is unavailable."
            );
        }

        const response =
            await fetch(
                url,
                {
                    method:"GET",
                    headers:{
                        "Accept":"application/json"
                    },
                    cache:"force-cache"
                }
            );

        if(!response.ok){
            throw new Error(
                "Geographic boundary data failed to load."
            );
        }

        const topology =
            await response.json();

        if(
            !topology ||
            !topology.objects ||
            !topology.objects[objectName]
        ){
            throw new Error(
                "Invalid geographic boundary data."
            );
        }

        const featureCollection =
            topojson.feature(
                topology,
                topology.objects[objectName]
            );

        return featureCollection.features || [];
    }

    async function getCountryFeatures(){
        if(!waterCountryFeaturesPromise){
            waterCountryFeaturesPromise =
                loadGeoFeatures(
                    WATER_LOCATION_CONFIG.COUNTRY_BOUNDARY_URL,
                    "countries"
                );
        }

        return await waterCountryFeaturesPromise;
    }

    async function getUsStateFeatures(){
        if(!waterUsStateFeaturesPromise){
            waterUsStateFeaturesPromise =
                loadGeoFeatures(
                    WATER_LOCATION_CONFIG.US_STATE_BOUNDARY_URL,
                    "states"
                );
        }

        return await waterUsStateFeaturesPromise;
    }

    function featureContainsPoint(
        feature,
        longitude,
        latitude
    ){
        return !!(
            feature &&
            feature.geometry &&
            pointInGeometry(
                longitude,
                latitude,
                feature.geometry
            )
        );
    }

    async function classifyWaterStation(
        station,
        location
    ){
        const geoCacheKey =
            [
                station.id,
                String(
                    location &&
                    location.countryCode || ""
                ).toUpperCase(),
                normalizeGeoName(
                    location &&
                    location.stateName
                )
            ].join("|");

        const cached =
            waterStationGeoCache.get(
                geoCacheKey
            );

        if(cached){
            return cached;
        }

        const coordinates =
            station &&
            station.coordinates;

        if(
            !coordinates ||
            !Number.isFinite(Number(coordinates.longitude)) ||
            !Number.isFinite(Number(coordinates.latitude))
        ){
            const fallback = {
                countryMatch:false,
                stateMatch:false
            };

            waterStationGeoCache.set(
                geoCacheKey,
                fallback
            );

            return fallback;
        }

        const longitude =
            Number(coordinates.longitude);

        const latitude =
            Number(coordinates.latitude);

        const countryFeatures =
            await getCountryFeatures();

        const userCountryCode =
            String(
                location.countryCode || ""
            ).toUpperCase();

        const userCountryName =
            normalizeGeoName(
                location.countryName
            );

        let countryMatch = false;

        for(
            const feature of countryFeatures
        ){
            if(
                !featureContainsPoint(
                    feature,
                    longitude,
                    latitude
                )
            ){
                continue;
            }

            const featureName =
                normalizeGeoName(
                    feature.properties &&
                    feature.properties.name
                );

            countryMatch =
                (
                    userCountryName &&
                    featureName ===
                    userCountryName
                ) ||
                (
                    userCountryCode === "US" &&
                    featureName === "united states"
                );

            break;
        }

        let stateMatch = false;

        if(
            userCountryCode === "US" &&
            countryMatch &&
            location.stateName
        ){
            const stateFeatures =
                await getUsStateFeatures();

            const userStateName =
                normalizeGeoName(
                    location.stateName
                );

            const userStateCode =
                String(
                    location.stateCode || ""
                )
                .toUpperCase()
                .replace(/^US-/,"");

            for(
                const feature of stateFeatures
            ){
                if(
                    !featureContainsPoint(
                        feature,
                        longitude,
                        latitude
                    )
                ){
                    continue;
                }

                const featureName =
                    normalizeGeoName(
                        feature.properties &&
                        feature.properties.name
                    );

                const featureCode =
                    String(
                        feature.id || ""
                    )
                    .trim()
                    .toUpperCase();

                stateMatch =
                    (
                        userStateName &&
                        featureName ===
                        userStateName
                    ) ||
                    (
                        userStateCode &&
                        featureCode ===
                        userStateCode
                    );

                break;
            }
        }

        const result = {
            countryMatch,
            stateMatch
        };

        waterStationGeoCache.set(
            geoCacheKey,
            result
        );

        return result;
    }

    function haversineDistanceKm(
        first,
        second
    ){
        const lat1 =
            Number(first && first.latitude);
        const lon1 =
            Number(first && first.longitude);
        const lat2 =
            Number(second && second.latitude);
        const lon2 =
            Number(second && second.longitude);

        if(
            !Number.isFinite(lat1) ||
            !Number.isFinite(lon1) ||
            !Number.isFinite(lat2) ||
            !Number.isFinite(lon2)
        ){
            return Number.POSITIVE_INFINITY;
        }

        const toRadians =
            Math.PI / 180;

        const dLat =
            (lat2 - lat1) *
            toRadians;

        const dLon =
            (lon2 - lon1) *
            toRadians;

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * toRadians) *
            Math.cos(lat2 * toRadians) *
            Math.sin(dLon / 2) ** 2;

        return (
            6371 *
            2 *
            Math.atan2(
                Math.sqrt(a),
                Math.sqrt(
                    Math.max(
                        0,
                        1 - a
                    )
                )
            )
        );
    }

    async function personalizeWaterStations(
        stations,
        location
    ){
        if(
            !location ||
            !Number.isFinite(Number(location.latitude)) ||
            !Number.isFinite(Number(location.longitude))
        ){
            return stations;
        }

        const enriched =
            await Promise.all(
                stations.map(
                    async function(station,index){
                        const geo =
                            await classifyWaterStation(
                                station,
                                location
                            );

                        return {
                            station,
                            index,
                            geo,
                            distanceKm:
                                haversineDistanceKm(
                                    location,
                                    station.coordinates
                                )
                        };
                    }
                )
            );

        function sortByDistance(items){
            return items.slice().sort(
                function(left,right){
                    const distance =
                        left.distanceKm -
                        right.distanceKm;

                    if(
                        Number.isFinite(distance) &&
                        Math.abs(distance) > 0.000001
                    ){
                        return distance;
                    }

                    return left.index - right.index;
                }
            );
        }

        const rivers =
            enriched.filter(function(item){
                return item.station.type === "river";
            });

        const lakes =
            enriched.filter(function(item){
                return item.station.type === "lake";
            });

        const isUnitedStates =
            String(
                location.countryCode || ""
            ).toUpperCase() === "US";

        function selectCategory(items){
            const sorted =
                sortByDistance(items);

            if(isUnitedStates){
                const sameState =
                    sorted.filter(function(item){
                        return item.geo.stateMatch;
                    });

                const fallback =
                    sorted.filter(function(item){
                        return !item.geo.stateMatch;
                    });

                return sameState
                    .concat(fallback)
                    .slice(
                        0,
                        CATEGORY_STATION_LIMIT
                    );
            }

            return sorted
                .filter(function(item){
                    return item.geo.countryMatch;
                })
                .slice(
                    0,
                    CATEGORY_STATION_LIMIT
                );
        }

        const selectedRivers =
            selectCategory(rivers);

        const selectedLakes =
            selectCategory(lakes);

        /*
         * All is its own 800-item view: up to 400 rivers +
         * up to 400 lakes, then globally sorted by distance.
         */
        return selectedRivers
            .concat(selectedLakes)
            .sort(
                function(left,right){
                    return (
                        left.distanceKm -
                        right.distanceKm
                    );
                }
            )
            .map(function(item){
                return item.station;
            })
            .slice(
                0,
                ALL_STATION_LIMIT
            );
    }

    function filteredStations(){
        const query = currentQuery().toLowerCase();

        const matches =
            state.stations.filter(function(station){

                const typeOK =
                    activeFilter === "all" ||
                    (activeFilter === "rivers" && station.type === "river") ||
                    (activeFilter === "lakes" && station.type === "lake");

                if(!typeOK) return false;
                if(!query) return true;

                return [
                    station.id,
                    station.stationId,
                    station.title,
                    station.productName,
                    station.waterBody,
                    station.basin,
                    station.location,
                    station.datasetId
                ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query);
            });

        return activeFilter === "all"
            ? matches.slice(0, ALL_STATION_LIMIT)
            : matches.slice(0, CATEGORY_STATION_LIMIT);
    }

    function setResultsText(text){
        const count = get("waterLevelsResultsCount");
        if(count) count.textContent = text;
    }

    function renderLoading(preserveCards){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        if(!preserveCards || !grid.querySelector(".water-level-card")){
            grid.innerHTML =
                '<div class="water-level-empty">' +
                    '<strong>Loading Copernicus water-level stations…</strong>' +
                    '<span>Searching the CLMS catalogue and preparing live data.</span>' +
                '</div>';
        }

        setResultsText(
            preserveCards
                ? "Refreshing Copernicus water-level stations…"
                : "Loading live Copernicus stations…"
        );
    }

    function renderError(message){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        grid.innerHTML =
            '<div class="water-level-empty">' +
                '<strong>Water level data could not be loaded.</strong>' +
                '<span>' + escapeHtml(message || "Please try again.") + '</span>' +
            '</div>';

        setResultsText("Copernicus request failed");
    }

    function metric(label,value){
        return (
            '<div class="water-level-metric">' +
                '<span>' + escapeHtml(label) + '</span>' +
                '<strong>' + escapeHtml(value) + '</strong>' +
            '</div>'
        );
    }

    function cardMetric(label,value,key){
        return (
            '<div class="water-level-metric">' +
                '<span>' + escapeHtml(label) + '</span>' +
                '<strong data-water-card-meta="' +
                    escapeHtml(key) +
                '">' +
                    escapeHtml(value || "—") +
                '</strong>' +
            '</div>'
        );
    }

    function applyStationTitleToCard(station){
        if(!station) return;

        const card =
            findStationCard(station.id);

        if(!card) return;

        const title =
            card.querySelector(
                "[data-water-card-title]"
            );

        if(title){
            title.textContent =
                stationDisplayTitle(station);
        }
    }

    function findStationCard(stationId){
        const grid = get("waterLevelsGrid");
        if(!grid) return null;

        const cards = grid.querySelectorAll(
            "[data-water-station-id]"
        );

        for(const card of cards){
            if(card.dataset.waterStationId === String(stationId)){
                return card;
            }
        }

        return null;
    }

    function applyStationMetadata(station,metadata){
        if(!station || !metadata) return;

        const sourceStation = metadata.station || {};
        const latest = metadata.latest || null;

        station.waterBody =
            sourceStation.waterBody || station.waterBody || "";
        station.basin =
            sourceStation.basin || station.basin || "";
        station.stationId =
            sourceStation.stationId || station.stationId || "";
        station.location =
            [
                station.waterBody,
                station.basin,
                sourceStation.country || ""
            ]
            .filter(Boolean)
            .join(" · ");
        station.title =
            station.waterBody || station.title || station.productName;
        station.updated =
            sourceStation.updated || station.updated || "";
        station.coordinates =
            sourceStation.coordinates ||
            metadata.coordinates ||
            station.coordinates;
        station.country = sourceStation.country || station.country || "";
        station.platform = sourceStation.platform || station.platform || "";
        station.processingLevel =
            sourceStation.processingLevel ||
            station.processingLevel ||
            "";
        station.status =
            sourceStation.status || station.status || "CLMS";
        station.referenceDatumAltitude =
            Number.isFinite(
                Number(
                    sourceStation.referenceDatumAltitude
                )
            )
                ? Number(
                    sourceStation.referenceDatumAltitude
                )
                : station.referenceDatumAltitude;
        station.referenceGeoid =
            sourceStation.referenceGeoid ||
            station.referenceGeoid ||
            "";
        station.latestHeight =
            latest && Number.isFinite(Number(latest.height))
                ? Number(latest.height)
                : null;
        station.previousHeight =
            metadata.previous &&
            Number.isFinite(Number(metadata.previous.height))
                ? Number(metadata.previous.height)
                : (
                    station.previousHeight != null
                        ? station.previousHeight
                        : null
                );
        station.latestUncertainty =
            latest && Number.isFinite(Number(latest.uncertainty))
                ? Number(latest.uncertainty)
                : null;
        station.metadataLoaded = true;

        const card = findStationCard(station.id);
        if(!card) return;

        const title = card.querySelector(
            "[data-water-card-title]"
        );
        if(title){
            title.textContent =
                stationDisplayTitle(station);
        }

        const location = card.querySelector(
            "[data-water-card-location]"
        );
        if(location){
            location.textContent =
                station.location ||
                "Global Copernicus station";
        }

        const status = card.querySelector(
            "[data-water-card-status]"
        );
        if(status){
            status.textContent =
                station.status || "CLMS metadata";
        }

        const height = card.querySelector(
            "[data-water-card-height]"
        );
        if(height){
            height.textContent =
                station.latestHeight != null
                    ? formatWaterSurfaceHeight(
                        station.latestHeight
                      )
                    : "—";
        }

        const heightNote = card.querySelector(
            "[data-water-card-height-note]"
        );
        if(heightNote){
            const satelliteChange =
                formatSatelliteChange(
                    station.latestHeight,
                    station.previousHeight
                );

            heightNote.textContent =
                satelliteChange
                    ? satelliteChange +
                        " since previous satellite observation"
                    : (
                        station.latestHeight != null
                            ? "Latest available satellite observation"
                            : "Open details for latest measurement"
                    );
        }

        const updated = card.querySelector(
            "[data-water-card-updated]"
        );
        if(updated){
            updated.textContent =
                station.updated
                    ? new Date(station.updated).toLocaleDateString()
                    : "—";
        }

        const waterBody = card.querySelector(
            '[data-water-card-meta="waterBody"]'
        );
        if(waterBody){
            waterBody.textContent = station.waterBody || "—";
        }

        const basin = card.querySelector(
            '[data-water-card-meta="basin"]'
        );
        if(basin){
            basin.textContent = station.basin || "—";
        }

        const stationId = card.querySelector(
            '[data-water-card-meta="stationId"]'
        );
        if(stationId){
            stationId.textContent = station.stationId || "—";
        }

        const coordinates = card.querySelector(
            '[data-water-card-meta="coordinates"]'
        );
        if(coordinates){
            coordinates.textContent =
                formatCoordinates(station.coordinates);
        }
    }

    async function loadStationMetadata(stations){
        if(!Array.isArray(stations) || !stations.length){
            return;
        }

        const runId = ++stationMetadataRun;
        let cursor = 0;

        async function worker(){
            while(cursor < stations.length){
                const station = stations[cursor++];
                if(!station || !station.id) continue;

                if(stationMetadataCache.has(station.id)){
                    applyStationMetadata(
                        station,
                        stationMetadataCache.get(station.id)
                    );
                    continue;
                }

                try{
                    const params = new URLSearchParams();
                    params.set("action","metadata");
                    params.set("id",station.id);
                    params.set("type",station.type);

                    const metadataController =
                        new AbortController();

                    const metadataTimer =
                        window.setTimeout(
                            function(){
                                metadataController.abort();
                            },
                            20000
                        );

                    let response;

                    try{
                        response = await fetch(
                            "/api/water-levels?" + params.toString(),
                            {
                                method:"GET",
                                headers:{"Accept":"application/json"},
                                signal:metadataController.signal
                            }
                        );
                    }
                    finally{
                        window.clearTimeout(metadataTimer);
                    }

                    const data = await response.json().catch(function(){
                        return null;
                    });

                    if(
                        !response.ok ||
                        !data ||
                        data.ok === false
                    ){
                        throw new Error(
                            data && data.error
                                ? data.error
                                : "Metadata request failed."
                        );
                    }

                    stationMetadataCache.set(
                        station.id,
                        data
                    );

                    const current = state.stations.find(function(item){
                        return item.id === station.id;
                    });

                    if(current){
                        applyStationMetadata(current,data);
                    }

                }
                catch(error){
                    console.warn(
                        "Water-level station metadata request failed:",
                        station.id,
                        error
                    );
                }
            }
        }

        const workers = [];
        const count = Math.min(
            STATION_METADATA_CONCURRENCY,
            stations.length
        );

        for(let index = 0; index < count; index++){
            workers.push(worker());
        }

        await Promise.all(workers);

        if(runId !== stationMetadataRun){
            return;
        }
    }

    async function loadStationLatest(stations){
        if(!Array.isArray(stations) || !stations.length){
            return;
        }

        let cursor = 0;

        async function worker(){
            while(cursor < stations.length){
                const station = stations[cursor++];
                if(!station || !station.id) continue;

                if(stationLatestCache.has(station.id)){
                    const cached = stationLatestCache.get(station.id);
                    const current = state.stations.find(function(item){
                        return item.id === station.id;
                    });
                    if(current){
                        current.latestHeight = cached.height;
                        current.latestUncertainty = cached.uncertainty;
                        applyLatestToCard(current);
                    }
                    continue;
                }

                try{
                    const params = new URLSearchParams();
                    params.set("action","latest");
                    params.set("id",station.id);
                    params.set("type",station.type);

                    const controller = new AbortController();
                    const timer = window.setTimeout(function(){
                        controller.abort();
                    }, 70000);

                    let response;
                    try{
                        response = await fetch(
                            "/api/water-levels?" + params.toString(),
                            {
                                method:"GET",
                                headers:{"Accept":"application/json"},
                                signal:controller.signal
                            }
                        );
                    }
                    finally{
                        window.clearTimeout(timer);
                    }

                    const data = await response.json().catch(function(){
                        return null;
                    });

                    if(!response.ok || !data || data.ok === false){
                        throw new Error(
                            data && data.error
                                ? data.error
                                : "Latest measurement request failed."
                        );
                    }

                    const latest = data.latest || null;
                    const cached = {
                        height:
                            latest && Number.isFinite(Number(latest.height))
                                ? Number(latest.height)
                                : null,
                        previousHeight:
                            data.previous &&
                            Number.isFinite(Number(data.previous.height))
                                ? Number(data.previous.height)
                                : null,
                        uncertainty:
                            latest && Number.isFinite(Number(latest.uncertainty))
                                ? Number(latest.uncertainty)
                                : null,
                        datetime:
                            latest && latest.datetime
                                ? latest.datetime
                                : "",
                        errorCode: "",
                        errorMessage: ""
                    };

                    if(cached.height != null){
                        stationLatestCache.set(station.id,cached);
                    }

                    const current = state.stations.find(function(item){
                        return item.id === station.id;
                    });

                    if(current){
                        current.latestHeight = cached.height;
                        current.previousHeight = cached.previousHeight;
                        current.latestUncertainty = cached.uncertainty;
                        current.latestDatetime = cached.datetime;
                        current.latestErrorCode =
                            cached.height != null
                                ? ""
                                : "CDSE_NO_MEASUREMENT";
                        current.latestErrorMessage =
                            cached.height != null
                                ? ""
                                : "No usable latest measurement.";
                        applyLatestToCard(current);
                    }

                }
                catch(error){
                    console.warn(
                        "Water-level latest measurement request failed:",
                        station.id,
                        error
                    );

                    const current = state.stations.find(function(item){
                        return item.id === station.id;
                    });

                    if(current){
                        const message =
                            error && error.message
                                ? String(error.message)
                                : "Latest measurement unavailable.";

                        let code = "CDSE_LATEST_FAILED";

                        if(
                            message.toLowerCase().includes("credentials")
                        ){
                            code = "CDSE_CONFIGURATION";
                        }
                        else if(
                            message.toLowerCase().includes("authentication")
                        ){
                            code = "CDSE_AUTH";
                        }
                        else if(
                            message.toLowerCase().includes("no usable latest")
                        ){
                            code = "CDSE_NO_MEASUREMENT";
                        }

                        current.latestErrorCode = code;
                        current.latestErrorMessage = message;
                        applyLatestToCard(current);
                    }
                }
            }
        }

        const workers = [];
        const count = Math.min(
            STATION_LATEST_CONCURRENCY,
            stations.length
        );

        for(let index = 0; index < count; index++){
            workers.push(worker());
        }

        await Promise.all(workers);
    }

    function observeLatestCards(){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        if(latestObserver){
            try{
                latestObserver.disconnect();
            }catch(error){}
            latestObserver = null;
        }

        const cards =
            grid.querySelectorAll(
                ".water-level-card[data-water-station-id]"
            );

        if(!cards.length) return;

        function stationForCard(card){
            return state.stations.find(function(item){
                return (
                    item.id ===
                    card.dataset.waterStationId
                );
            }) || null;
        }

        if(!("IntersectionObserver" in window)){
            void loadStationLatest(
                filteredStations().slice(0,24)
            );
            return;
        }

        latestObserver =
            new IntersectionObserver(
                function(entries){
                    const stations = [];

                    entries.forEach(function(entry){
                        if(!entry.isIntersecting) return;

                        const station =
                            stationForCard(entry.target);

                        if(station){
                            stations.push(station);
                        }

                        latestObserver.unobserve(
                            entry.target
                        );
                    });

                    if(stations.length){
                        void loadStationLatest(stations);
                    }
                },
                {
                    rootMargin:"500px 0px"
                }
            );

        cards.forEach(function(card){
            latestObserver.observe(card);
        });
    }

    function applyLatestToCard(station){
        const card = findStationCard(station.id);
        if(!card) return;

        const height = card.querySelector("[data-water-card-height]");
        if(height){
            height.textContent =
                station.latestHeight != null
                    ? formatWaterSurfaceHeight(
                        station.latestHeight
                      )
                    : "—";
        }

        const note = card.querySelector("[data-water-card-height-note]");
        if(note){
            const satelliteChange =
                formatSatelliteChange(
                    station.latestHeight,
                    station.previousHeight
                );

            if(satelliteChange){
                note.textContent =
                    satelliteChange +
                    " since previous satellite observation";
            }
            else if(station.latestHeight != null){
                note.textContent = "Latest satellite observation";
            }
            else if(station.latestErrorCode === "CDSE_CONFIGURATION"){
                note.textContent = "Copernicus download credentials are not configured";
            }
            else if(station.latestErrorCode === "CDSE_AUTH"){
                note.textContent = "Copernicus download authentication failed";
            }
            else if(station.latestErrorCode === "CDSE_NO_MEASUREMENT"){
                note.textContent = "No usable latest Copernicus measurement";
            }
            else if(station.latestErrorCode){
                note.textContent = "Latest Copernicus measurement unavailable";
            }
            else{
                note.textContent = "No usable latest measurement";
            }
        }
    }

    function renderCards(){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        if(state.loading){
            renderLoading(true);
            return;
        }

        if(state.error){
            renderError(state.error);
            return;
        }

        const visible = filteredStations();

        if(!visible.length){
            grid.innerHTML =
                '<div class="water-level-empty">' +
                    '<strong>No Copernicus stations match your search.</strong>' +
                    '<span>Try a river, lake, basin, station ID or water-body name.</span>' +
                '</div>';

            setResultsText(
                "0 live station cards"
            );
            return;
        }

        grid.innerHTML = visible.map(function(station){

            const typeLabel =
                stationTypeLabel(station.type);

            const location =
                station.location ||
                station.waterBody ||
                station.basin ||
                "Global Copernicus station";

            return (
                '<article class="water-level-card" data-water-station-id="' +
                    escapeHtml(station.id) +
                '">' +

                    '<div class="water-level-card-top">' +
                        '<div class="water-level-card-icon">' +
                            stationIcon(station.type) +
                        '</div>' +

                        '<span class="water-level-card-type">' +
                            escapeHtml(typeLabel) +
                        '</span>' +

                        '<span class="water-level-card-status" data-water-card-status>' +
                            escapeHtml(station.status || "CLMS") +
                        '</span>' +
                    '</div>' +

                    '<div class="water-level-card-title">' +
                        '<h3 data-water-card-title>' +
                            escapeHtml(
                                stationDisplayTitle(station)
                            ) +
                        '</h3>' +

                        '<p data-water-card-location>' +
                            escapeHtml(location) +
                        '</p>' +
                    '</div>' +

                    '<div class="water-level-card-hero">' +
                        '<div>' +
                            '<span>Water surface height</span>' +
                            '<strong data-water-card-height>—</strong>' +
                            '<small data-water-card-height-note>Open details for latest measurement</small>' +
                        '</div>' +

                        '<div>' +
                            '<span>Last product update</span>' +
                            '<strong data-water-card-updated>' +
                                escapeHtml(
                                    station.updated
                                        ? new Date(station.updated).toLocaleDateString()
                                        : "—"
                                ) +
                            '</strong>' +
                            '<small>Copernicus CLMS</small>' +
                        '</div>' +
                    '</div>' +

                    '<div class="water-level-card-metrics">' +
                        cardMetric(
                            "Water body",
                            station.waterBody || "—",
                            "waterBody"
                        ) +

                        cardMetric(
                            "Basin",
                            station.basin || "—",
                            "basin"
                        ) +

                        cardMetric(
                            "Station / Cell ID",
                            station.stationId || "—",
                            "stationId"
                        ) +

                        cardMetric(
                            "Coordinates",
                            formatCoordinates(station.coordinates),
                            "coordinates"
                        ) +
                    '</div>' +

                    '<div class="water-level-card-meta">' +
                        '<span>' +
                            escapeHtml(typeLabel) +
                        '</span>' +

                        '<span>' +
                            escapeHtml(
                                station.datasetVersion ||
                                "CLMS"
                            ) +
                        '</span>' +
                    '</div>' +

                    '<div class="water-level-card-actions">' +
                        '<button type="button" class="water-level-action" data-water-action="details" data-water-station-id="' +
                            escapeHtml(station.id) +
                        '">View details</button>' +

                        '<button type="button" class="water-level-action secondary" data-water-action="history" data-water-station-id="' +
                            escapeHtml(station.id) +
                        '">History</button>' +
                    '</div>' +

                '</article>'
            );

        }).join("");

        const locationSuffix =
            !currentQuery() &&
            state.location &&
            state.location.city
                ? " near " +
                    state.location.city +
                    (
                        state.location.countryCode
                            ? ", " +
                                state.location.countryCode
                            : ""
                    )
                : "";

        setResultsText(
            visible.length +
            " live Copernicus station" +
            (visible.length === 1 ? "" : "s") +
            " found" +
            locationSuffix
        );

        /*
         * Initial station cards are deliberately lightweight so the first
         * paint is fast. Enrich only the visible first batch with the
         * heavier Copernicus metadata request after the cards are rendered.
         */
        void loadStationMetadata(
            visible.slice(0,24)
        );

        /*
         * Add a city beside every visible river/lake name so
         * individual station locations are identifiable globally. When
         * reverse geocoding cannot resolve a city, the title shows "No city".
         */
        void loadStationPlaceLabels(
            visible
        );

        /*
         * Latest measurements remain viewport-driven.
         */
        observeLatestCards();
    }

    async function fetchNearbyWaterCategory({
        type,
        location,
        controller,
        force
    }){
        const countryCode =
            String(
                location &&
                location.countryCode || ""
            ).trim().toUpperCase();

        const radiiKm =
            countryCode === "CA"
                ? [250,500,1000,2000,4000,8000]
                : [150,300,600,1000,2000];

        const byStation = new Map();

        function candidateIdentity(station){
            if(!station) return "";

            const stationId =
                String(
                    station.stationId || ""
                ).trim();

            if(stationId){
                return (
                    (station.type || type) +
                    "|" +
                    stationId
                );
            }

            const coordinates =
                station.coordinates || {};
            const lat = Number(coordinates.latitude);
            const lon = Number(coordinates.longitude);

            if(Number.isFinite(lat) && Number.isFinite(lon)){
                return (
                    (station.type || type) +
                    "|" +
                    lat.toFixed(4) +
                    "|" +
                    lon.toFixed(4)
                );
            }

            return String(station.id || "");
        }

        for(const radiusKm of radiiKm){
            const params = new URLSearchParams();
            params.set("action","nearby");
            params.set("type",type);
            params.set("lat",String(location.latitude));
            params.set("lon",String(location.longitude));
            params.set("radiusKm",String(radiusKm));
            params.set(
                "limit",
                countryCode === "CA" ? "400" : "120"
            );

            if(force){
                params.set("refresh","1");
            }

            const response = await fetch(
                "/api/water-levels?" + params.toString(),
                {
                    method:"GET",
                    headers:{"Accept":"application/json"},
                    signal:controller.signal
                }
            );

            const data = await response.json().catch(function(){
                return null;
            });

            if(!response.ok || !data || data.ok === false){
                throw new Error(
                    data && data.error
                        ? data.error
                        : "Nearby water-level request failed."
                );
            }

            const stations =
                Array.isArray(data.stations) ? data.stations : [];

            stations.forEach(function(station){
                const key = candidateIdentity(station);
                if(!key) return;

                const existing = byStation.get(key);
                if(!existing){
                    byStation.set(key,station);
                    return;
                }

                const existingUpdated = Date.parse(existing.updated);
                const candidateUpdated = Date.parse(station.updated);

                if(
                    Number.isFinite(candidateUpdated) &&
                    (!Number.isFinite(existingUpdated) || candidateUpdated > existingUpdated)
                ){
                    byStation.set(key,station);
                }
            });

            /*
             * Expand the search until we have enough UNIQUE virtual
             * stations. This prevents dated products for a few major
             * rivers from crowding out less common local rivers.
             */
            if(
                byStation.size >=
                (countryCode === "CA" ? 100 : 40)
            ){
                break;
            }
        }

        return Array.from(byStation.values());
    }

    async function loadLocationPersonalizedStations(
        location,
        controller,
        force
    ){
        const results =
            await Promise.all([
                fetchNearbyWaterCategory({
                    type:"river",
                    location,
                    controller,
                    force
                }),
                fetchNearbyWaterCategory({
                    type:"lake",
                    location,
                    controller,
                    force
                })
            ]);

        const candidates =
            results.flat();

        if(!candidates.length){
            return [];
        }

        /*
         * The catalogue can contain several dated products for the same
         * Copernicus virtual station. Collapse those first, before doing
         * any city lookup. Station/cell ID is the strongest identity;
         * coordinates are the fallback when an ID is unavailable.
         */
        const stationSeen = new Map();

        function stationIdentity(station){
            if(!station) return "";

            const stationId =
                String(
                    station.stationId ||
                    ""
                ).trim();

            if(stationId){
                return (
                    "station|" +
                    (station.type || "river") +
                    "|" +
                    stationId
                );
            }

            const coordinates =
                station.coordinates || {};

            const lat =
                Number(coordinates.latitude);
            const lon =
                Number(coordinates.longitude);

            return (
                "coord|" +
                (station.type || "river") +
                "|" +
                (
                    Number.isFinite(lat)
                        ? lat.toFixed(4)
                        : ""
                ) +
                "|" +
                (
                    Number.isFinite(lon)
                        ? lon.toFixed(4)
                        : ""
                )
            );
        }

        candidates.forEach(function(station,index){
            const key =
                stationIdentity(station);

            if(!key){
                return;
            }

            const existing =
                stationSeen.get(key);

            if(!existing){
                stationSeen.set(
                    key,
                    {
                        station,
                        index
                    }
                );
                return;
            }

            /*
             * When duplicates share one station ID, keep the newest
             * catalogue product so the visible card represents the
             * freshest product record.
             */
            const existingUpdated =
                Date.parse(
                    existing.station &&
                    existing.station.updated
                );

            const candidateUpdated =
                Date.parse(
                    station &&
                    station.updated
                );

            if(
                Number.isFinite(candidateUpdated) &&
                (
                    !Number.isFinite(existingUpdated) ||
                    candidateUpdated > existingUpdated
                )
            ){
                stationSeen.set(
                    key,
                    {
                        station,
                        index
                    }
                );
            }
        });

        const uniqueCandidates =
            Array.from(
                stationSeen.values()
            ).map(function(item){
                return item.station;
            });

        const enriched =
            await Promise.all(
                uniqueCandidates.map(
                    async function(station,index){
                        return {
                            station,
                            index,
                            distanceKm:
                                haversineDistanceKm(
                                    location,
                                    station.coordinates
                                ),
                            geo:
                                await classifyWaterStation(
                                    station,
                                    location
                                )
                        };
                    }
                )
            );

        const countryCode =
            String(
                location.countryCode || ""
            ).trim().toUpperCase();

        function sortByDistance(items){
            return items.slice().sort(
                function(left,right){
                    const distance =
                        left.distanceKm -
                        right.distanceKm;

                    if(
                        Number.isFinite(distance) &&
                        Math.abs(distance) > 0.000001
                    ){
                        return distance;
                    }

                    const leftUpdated =
                        Date.parse(
                            left.station &&
                            left.station.updated
                        );

                    const rightUpdated =
                        Date.parse(
                            right.station &&
                            right.station.updated
                        );

                    if(
                        Number.isFinite(leftUpdated) &&
                        Number.isFinite(rightUpdated) &&
                        leftUpdated !== rightUpdated
                    ){
                        return rightUpdated - leftUpdated;
                    }

                    return left.index - right.index;
                }
            );
        }

        /*
         * Do not collapse different locations of the same river or lake.
         * A repeated water body is allowed when it has a different place;
         * the same water body + same place is kept only once.
         */
        function fallbackPlaceKey(station){
            const coordinates =
                station.coordinates || {};

            const lat =
                Number(coordinates.latitude);
            const lon =
                Number(coordinates.longitude);

            return (
                Number.isFinite(lat) &&
                Number.isFinite(lon)
            )
                ? lat.toFixed(2) +
                    "|" +
                    lon.toFixed(2)
                : stationIdentity(station);
        }

        async function dedupeSameWaterbodyPlace(items){
            const counts = new Map();

            items.forEach(function(item){
                const body = normalizeGeoName(
                    item.station.waterBody ||
                    item.station.title ||
                    item.station.productName ||
                    ""
                );

                if(body){
                    counts.set(
                        body,
                        (counts.get(body) || 0) + 1
                    );
                }
            });

            const targets = items.filter(function(item){
                const body = normalizeGeoName(
                    item.station.waterBody ||
                    item.station.title ||
                    item.station.productName ||
                    ""
                );

                return counts.get(body) > 1;
            });

            let cursor = 0;

            async function worker(){
                while(cursor < targets.length){
                    const item = targets[cursor++];
                    const station = item.station;

                    if(station.placeName){
                        station.placeName = localizeWaterPlaceName(
                            station.placeName,
                            location
                        );
                        continue;
                    }

                    const coordinates = station.coordinates;
                    const lat = Number(coordinates && coordinates.latitude);
                    const lon = Number(coordinates && coordinates.longitude);

                    if(!Number.isFinite(lat) || !Number.isFinite(lon)){
                        continue;
                    }

                    const cacheKey = lat.toFixed(4) + "|" + lon.toFixed(4);
                    let placeName = stationPlaceCache.get(cacheKey) || readStationPlaceCache(cacheKey);

                    if(!placeName){
                        placeName = await reverseGeocodeStationPlace({
                            latitude:lat,
                            longitude:lon
                        });
                    }

                    if(placeName){
                        placeName = localizeWaterPlaceName(placeName,location);
                        station.placeName = placeName;
                        stationPlaceCache.set(cacheKey,placeName);
                        saveStationPlaceCache(cacheKey,placeName);
                    }
                }
            }

            const workers = [];
            const workerCount = Math.min(
                STATION_PLACE_CONCURRENCY,
                targets.length
            );

            for(let index = 0; index < workerCount; index++){
                workers.push(worker());
            }

            await Promise.all(workers);

            const seen = new Set();
            const unique = [];

            for(const item of sortByDistance(items)){
                const station = item.station;
                const body = normalizeGeoName(
                    station.waterBody ||
                    station.title ||
                    station.productName ||
                    ""
                );
                const place = normalizeGeoName(
                    station.placeName || ""
                );

                const coordinates = station.coordinates || {};
                const lat = Number(coordinates.latitude);
                const lon = Number(coordinates.longitude);
                const coordinateKey = Number.isFinite(lat) && Number.isFinite(lon)
                    ? lat.toFixed(4) + "|" + lon.toFixed(4)
                    : stationIdentity(station);

                const key =
                    (station.type || "river") +
                    "|" +
                    body +
                    "|" +
                    (place || coordinateKey);

                if(seen.has(key)){
                    continue;
                }

                seen.add(key);
                unique.push(item);
            }

            return unique;
        }

        function diverseStationSelection(items,limit){
            const sorted = sortByDistance(items);
            const seenBodies = new Set();
            const firstPerBody = [];
            const remaining = [];

            sorted.forEach(function(item){
                const body = normalizeGeoName(
                    item.station.waterBody ||
                    item.station.title ||
                    item.station.productName ||
                    ""
                ) || stationIdentity(item.station);

                if(!seenBodies.has(body)){
                    seenBodies.add(body);
                    firstPerBody.push(item);
                }else{
                    remaining.push(item);
                }
            });

            return firstPerBody
                .concat(remaining)
                .slice(0,limit);
        }

        async function selectCategory(type){
            const countryMatches = enriched.filter(function(item){
                return item.station.type === type && item.geo.countryMatch;
            });

            let ordered = countryMatches;

            if(countryCode === "US" && location.stateName){
                const sameState = countryMatches.filter(function(item){
                    return item.geo.stateMatch;
                });
                const otherState = countryMatches.filter(function(item){
                    return !item.geo.stateMatch;
                });
                ordered = sameState.concat(otherState);
            }

            const unique = await dedupeSameWaterbodyPlace(ordered);
            return diverseStationSelection(
                unique,
                CATEGORY_STATION_LIMIT
            );
        }
        const selectedRivers =
            await selectCategory("river");

        const selectedLakes =
            await selectCategory("lake");

        const combined =
            selectedRivers
                .concat(selectedLakes)
                .sort(function(left,right){
                    return (
                        left.distanceKm -
                        right.distanceKm
                    );
                });

        /*
         * A second, conservative spatial pass prevents accidental exact
         * duplicates when different product identities point to the same
         * virtual-station location. It still allows the same river at
         * different places, which is important for long rivers such as
         * the Danube, Sava, Tisa or Velika Morava.
         */
        const finalSeen = new Set();
        const finalItems = [];

        for(const item of combined){
            const station =
                item.station || {};

            const waterBody =
                normalizeGeoName(
                    station.waterBody ||
                    station.title ||
                    station.productName ||
                    ""
                );

            const key =
                (
                    (station.type || "river") +
                    "|" +
                    waterBody +
                    "|" +
                    fallbackPlaceKey(station)
                );

            if(finalSeen.has(key)){
                continue;
            }

            finalSeen.add(key);
            finalItems.push(item);

            if(finalItems.length >= ALL_STATION_LIMIT){
                break;
            }
        }

        return finalItems.map(function(item){
            return item.station;
        });
    }

    async function loadStations(options){
        options = options || {};

        const input =
            get("waterLevelsSearch");

        const query =
            input
                ? input.value.trim()
                : "";

        /*
         * Search remains global. Keep the detected user location separately
         * so unit preferences (metric vs US customary) remain automatic.
         */
        const controller =
            new AbortController();

        if(stationsRequest){
            try{
                stationsRequest.abort();
            }
            catch(error){}
        }

        stationsRequest = controller;

        window.clearTimeout(
            stationsRequestTimer
        );

        stationsRequestTimer =
            window.setTimeout(
                function(){
                    controller.abort();
                },
                query ? 25000 : 90000
            );

        state.loading = true;
        state.error = "";

        try{

            /*
             * Search is global. The normal landing view is location-aware:
             * Serbia/other countries use country-filtered Copernicus data;
             * Canada uses country + city proximity.
             */
            const location =
                !query
                    ? await resolveWaterLocation()
                    : null;

            if(
                stationsRequest !== controller
            ){
                return;
            }

            const cacheCountry =
                location &&
                location.countryName
                    ? location.countryName
                    : null;

            const cached =
                !options.force
                    ? readStationsCache(
                        query,
                        cacheCountry
                    )
                    : null;

            if(
                cached &&
                cached.stations.length
            ){
                state.stations =
                    cached.stations;

                state.location =
                    cached.location ||
                    location ||
                    null;

                state.error = "";
                state.loading = false;

                updateRefreshAvailability();
                renderCards();

                /*
                 * Fresh browser cache is enough for the landing view.
                 * Stale cache remains visible while the fresh request runs.
                 */
                if(cached.fresh){
                    return;
                }
            }

            if(
                !query &&
                location
            ){

                const countryCode =
                    String(
                        location.countryCode || ""
                    )
                    .trim()
                    .toUpperCase();

                const personalizedStations =
                    await loadLocationPersonalizedStations(
                        location,
                        controller,
                        Boolean(options.force)
                    );

                if(
                    stationsRequest !== controller
                ){
                    return;
                }

                /*
                 * Never fall back to the global catalogue here. A location-
                 * aware landing page must only show stations belonging to
                 * the detected country.
                 */
                if(
                    !personalizedStations.length
                ){
                    throw new Error(
                        "No Copernicus water-level stations were found for " +
                        (
                            location.countryName ||
                            countryCode ||
                            "the detected location"
                        ) +
                        "."
                    );
                }

                state.stations =
                    personalizedStations;

                state.location =
                    location;

                state.error = "";
                state.loading = false;

                saveStationsCache(
                    query,
                    personalizedStations,
                    location
                );

                updateRefreshAvailability();
                renderCards();
                return;
            }

            /*
             * Global search path. This is intentionally independent from
             * location so searching "Danube", "Cauto", etc. works worldwide.
             */
            const params =
                new URLSearchParams();

            params.set(
                "action",
                "stations"
            );

            params.set(
                "limit",
                String(
                    ALL_STATION_LIMIT
                )
            );

            if(query){
                params.set("q",query);
            }

            if(options.force){
                params.set("refresh","1");
            }

            const response =
                await fetch(
                    "/api/water-levels?" +
                    params.toString(),
                    {
                        method:"GET",
                        headers:{
                            "Accept":"application/json"
                        },
                        signal:
                            controller.signal
                    }
                );

            const data =
                await response.json()
                    .catch(function(){
                        return null;
                    });

            if(
                stationsRequest !== controller
            ){
                return;
            }

            if(
                !response.ok ||
                !data ||
                data.ok === false
            ){
                throw new Error(
                    data &&
                    data.error
                        ? data.error
                        : "The Copernicus water-level endpoint returned an error."
                );
            }

            const stations =
                Array.isArray(data.stations)
                    ? data.stations
                    : [];

            state.stations =
                stations;

            state.location =
                null;

            state.error = "";
            state.loading = false;

            saveStationsCache(
                query,
                stations,
                null
            );

            updateRefreshAvailability();
            renderCards();

        }
        catch(error){

            if(
                error &&
                error.name === "AbortError"
            ){
                if(
                    stationsRequest === controller
                ){
                    state.loading = false;

                    if(
                        state.stations.length
                    ){
                        state.error = "";
                        renderCards();
                    }
                    else{
                        state.error =
                            "The Copernicus water-level request timed out. Please try Refresh again.";

                        renderError(
                            state.error
                        );
                    }

                    updateRefreshAvailability();
                }

                return;
            }

            if(
                stationsRequest !== controller
            ){
                return;
            }

            console.error(
                "Water Levels station request failed:",
                error
            );

            /*
             * A stale browser cache is still valid presentation data.
             * Never replace it with an error screen.
             */
            try{
                const locationCountry =
                    state.location &&
                    state.location.countryName
                        ? state.location.countryName
                        : null;

                const cachedFallback =
                    readStationsCache(
                        query,
                        locationCountry
                    );

                if(
                    cachedFallback &&
                    cachedFallback.stations.length
                ){
                    state.stations =
                        cachedFallback.stations;

                    state.location =
                        cachedFallback.location ||
                        state.location ||
                        null;

                    state.error = "";
                    state.loading = false;

                    updateRefreshAvailability();
                    renderCards();
                    return;
                }
            }
            catch(cacheError){}

            state.stations = [];

            state.error =
                error &&
                error.message
                    ? error.message
                    : "Unable to load Copernicus water-level data.";

            state.loading = false;

            updateRefreshAvailability();
            renderError(
                state.error
            );

        }
        finally{

            if(
                stationsRequest === controller
            ){
                stationsRequest = null;

                window.clearTimeout(
                    stationsRequestTimer
                );

                if(state.loading){
                    state.loading = false;
                }
            }
        }
    }

    function scheduleSearch(){
        window.clearTimeout(
            searchTimer
        );

        searchTimer =
            window.setTimeout(
                function(){
                    loadStations();
                },
                280
            );
    }

    function setDetailText(id,value){
        const node = get(id);
        if(node){
            node.textContent =
                value == null || value === ""
                    ? "—"
                    : String(value);
        }
    }

    function renderHistoryChart(measurements){
        const chart =
            get("waterLevelsHistoryChart");

        if(!chart) return;

        const points =
            Array.isArray(measurements)
                ? measurements.filter(function(item){
                    return (
                        Number.isFinite(Number(item.height)) &&
                        item.datetime
                    );
                })
                : [];

        if(!points.length){
            chart.innerHTML =
                '<div class="water-levels-history-placeholder">' +
                    '<span>📈</span>' +
                    '<strong>No measurements in this range</strong>' +
                    '<small>The selected Copernicus product does not contain a usable time series for this range.</small>' +
                '</div>';
            return;
        }

        const width = 900;
        const height = 270;
        const padLeft = 58;
        const padRight = 18;
        const padTop = 20;
        const padBottom = 42;

        const values =
            points.map(function(item){
                return Number(item.height);
            });

        let min =
            Math.min.apply(null,values);

        let max =
            Math.max.apply(null,values);

        if(min === max){
            min -= 1;
            max += 1;
        }

        const x =
            function(index){
                return (
                    padLeft +
                    (
                        index /
                        Math.max(
                            1,
                            points.length - 1
                        )
                    ) *
                    (
                        width -
                        padLeft -
                        padRight
                    )
                );
            };

        const y =
            function(value){
                return (
                    padTop +
                    (
                        (max - value) /
                        (max - min)
                    ) *
                    (
                        height -
                        padTop -
                        padBottom
                    )
                );
            };

        const path =
            points.map(function(item,index){
                return (
                    (index === 0 ? "M " : "L ") +
                    x(index).toFixed(2) +
                    " " +
                    y(Number(item.height)).toFixed(2)
                );
            }).join(" ");

        const firstDate =
            points[0].datetime;

        const lastDate =
            points[points.length - 1].datetime;

        chart.innerHTML =
            '<div class="water-levels-chart-inner">' +
                '<svg class="water-levels-chart-svg" viewBox="0 0 ' +
                    width + " " + height +
                    '" role="img" aria-label="Water surface height history">' +

                    '<line x1="' + padLeft + '" y1="' + padTop +
                        '" x2="' + padLeft + '" y2="' +
                        (height - padBottom) +
                        '" stroke="currentColor" opacity=".18"/>' +

                    '<line x1="' + padLeft + '" y1="' +
                        (height - padBottom) +
                        '" x2="' +
                        (width - padRight) +
                        '" y2="' +
                        (height - padBottom) +
                        '" stroke="currentColor" opacity=".18"/>' +

                    '<path d="' + path +
                        '" fill="none" stroke="url(#waterGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +

                    '<defs>' +
                        '<linearGradient id="waterGradient" x1="0" x2="1">' +
                            '<stop offset="0%" stop-color="var(--primary)"/>' +
                            '<stop offset="100%" stop-color="var(--primary2)"/>' +
                        '</linearGradient>' +
                    '</defs>' +

                    '<text x="8" y="' +
                        (padTop + 5) +
                        '" fill="currentColor" opacity=".65" font-size="11">' +
                        escapeHtml(formatNumber(max,2)) +
                    '</text>' +

                    '<text x="8" y="' +
                        (height - padBottom) +
                        '" fill="currentColor" opacity=".65" font-size="11">' +
                        escapeHtml(formatNumber(min,2)) +
                    '</text>' +

                    '<text x="' +
                        padLeft +
                        '" y="' +
                        (height - 12) +
                        '" fill="currentColor" opacity=".65" font-size="10">' +
                        escapeHtml(
                            new Date(firstDate).toLocaleDateString()
                        ) +
                    '</text>' +

                    '<text x="' +
                        (width - padRight) +
                        '" y="' +
                        (height - 12) +
                        '" text-anchor="end" fill="currentColor" opacity=".65" font-size="10">' +
                        escapeHtml(
                            new Date(lastDate).toLocaleDateString()
                        ) +
                    '</text>' +

                '</svg>' +

                '<div class="water-levels-chart-summary">' +
                    '<span>' +
                        points.length +
                        " plotted point" +
                        (points.length === 1 ? "" : "s") +
                    '</span>' +

                    '<span>' +
                        escapeHtml(
                            formatNumber(
                                values[values.length - 1],
                                3
                            )
                        ) +
                        " m latest" +
                    '</span>' +
                '</div>' +
            '</div>';
    }

    function openDetails(station,mode){
        if(!station) return;

        const overlay =
            get("waterLevelsDetailOverlay");

        if(!overlay) return;

        activeStationId =
            station.id;

        activeStation =
            station;

        setDetailText(
            "waterLevelsDetailIcon",
            stationIcon(station.type)
        );

        setDetailText(
            "waterLevelsDetailType",
            stationTypeLabel(station.type) +
            " · Copernicus CLMS"
        );

        setDetailText(
            "waterLevelsDetailTitle",
            station.title ||
            "Water level station"
        );

        setDetailText(
            "waterLevelsDetailStatus",
            "Loading live Copernicus measurements…"
        );

        setDetailText(
            "waterLevelsDetailHeight",
            "—"
        );

        setDetailText(
            "waterLevelsDetailUncertainty",
            "—"
        );

        setDetailText(
            "waterLevelsDetailTrend",
            "—"
        );

        const controls =
            get("waterLevelsHistoryControls");

        if(controls){
            controls.querySelectorAll(
                "[data-water-history]"
            ).forEach(function(button){
                const active =
                    button.dataset.waterHistory ===
                    activeHistoryRange;

                button.classList.toggle(
                    "active",
                    active
                );

                button.setAttribute(
                    "aria-pressed",
                    active ? "true" : "false"
                );
            });
        }

        const chart =
            get("waterLevelsHistoryChart");

        if(chart){
            chart.innerHTML =
                '<div class="water-levels-history-placeholder">' +
                    '<span>💧</span>' +
                    '<strong>Loading measurements…</strong>' +
                    '<small>Fetching the selected Copernicus water-level product.</small>' +
                '</div>';
        }

        const detailMode =
            mode || "details";

        overlay.classList.add("open");
        overlay.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add(
            "water-levels-modal-open"
        );

        overlay.dataset.viewMode =
            detailMode;

        loadDetails(
            station,
            detailMode
        );
    }

    async function loadDetails(station,mode){
        const params =
            new URLSearchParams();

        params.set(
            "action",
            "details"
        );

        params.set(
            "id",
            station.id
        );

        params.set(
            "type",
            station.type
        );

        params.set(
            "range",
            activeHistoryRange
        );

        try{

            const response =
                await fetch(
                    "/api/water-levels?" +
                    params.toString(),
                    {
                        method:"GET",
                        headers:{
                            "Accept":"application/json"
                        }
                    }
                );

            const data =
                await response.json()
                    .catch(function(){
                        return null;
                    });

            if(!response.ok || !data || data.ok === false){
                throw new Error(
                    data &&
                    data.error
                        ? data.error
                        : "Unable to load Copernicus station details."
                );
            }

            renderDetails(
                data,
                mode
            );

        }catch(error){

            console.error(
                "Water levels details request failed:",
                error
            );

            setDetailText(
                "waterLevelsDetailStatus",
                error.message ||
                "Unable to load water-level details."
            );

            const chart =
                get("waterLevelsHistoryChart");

            if(chart){
                chart.innerHTML =
                    '<div class="water-levels-history-placeholder">' +
                        '<span>⚠️</span>' +
                        '<strong>Measurements unavailable</strong>' +
                        '<small>' +
                            escapeHtml(
                                error.message ||
                                "The Copernicus product could not be loaded."
                            ) +
                        '</small>' +
                    '</div>';
            }

        }
    }

    function renderDetails(
        data,
        mode
    ){

        const station =
            data.station ||
            {};

        const latest =
            data.latest ||
            null;

        const trend =
            data.trend ||
            {};

        setDetailText(
            "waterLevelsDetailStatus",
            "Live Copernicus data · " +
            (data.source &&
             data.source.dataset
                ? data.source.dataset
                : "CLMS")
        );

        setDetailText(
            "waterLevelsDetailHeight",
            latest &&
            Number.isFinite(Number(latest.height))
                ? formatNumber(latest.height,3) + " m"
                : "—"
        );

        setDetailText(
            "waterLevelsDetailUncertainty",
            latest &&
            Number.isFinite(Number(latest.uncertainty))
                ? "± " +
                    formatNumber(
                        latest.uncertainty,
                        3
                    ) +
                    " m"
                : "—"
        );

        setDetailText(
            "waterLevelsDetailTrend",
            trend.available
                ? (
                    formatNumber(
                        trend.millimetersPerYear,
                        1
                    ) +
                    " mm/year"
                )
                : "—"
        );

        const metrics =
            get("waterLevelsDetailMetrics");

        if(metrics){

            metrics.innerHTML = [

                metric(
                    "Station / Cell ID",
                    station.stationId
                ),

                metric(
                    "Water level",
                    formatRelativeWaterLevelValue(
                        latest &&
                        latest.height,
                        station.referenceDatumAltitude
                    ) || "—"
                ),

                metric(
                    "Water body",
                    station.waterBody
                ),

                metric(
                    "Basin",
                    station.basin
                ),

                metric(
                    "Country",
                    station.country
                ),

                metric(
                    "Coordinates",
                    formatCoordinates(
                        station.coordinates
                    )
                ),

                metric(
                    "Observed",
                    latest
                        ? formatDate(
                            latest.datetime
                        )
                        : "—"
                ),

                metric(
                    "Satellite",
                    latest &&
                    latest.satellite
                        ? latest.satellite
                        : "—"
                ),

                metric(
                    "Satellite cycle",
                    latest &&
                    Number.isFinite(
                        Number(
                            latest.cycleNumber
                        )
                    )
                        ? latest.cycleNumber
                        : "—"
                ),

                metric(
                    "Ground track",
                    latest &&
                    Number.isFinite(
                        Number(
                            latest.groundTrack
                        )
                    )
                        ? latest.groundTrack
                        : "—"
                ),

                metric(
                    "Measurements",
                    station.measurementCount
                ),

                metric(
                    "Selected range",
                    station.selectedMeasurementCount
                ),

                metric(
                    "Reference geoid",
                    station.referenceGeoid
                ),

                metric(
                    "Reference datum altitude",
                    Number.isFinite(
                        Number(
                            station.referenceDatumAltitude
                        )
                    )
                        ? formatWaterSurfaceHeight(
                            station.referenceDatumAltitude
                        )
                        : "—"
                ),

                metric(
                    "Coverage start",
                    formatDate(
                        station.coverageStart
                    )
                ),

                metric(
                    "Coverage end",
                    formatDate(
                        station.coverageEnd
                    )
                ),

                metric(
                    "Last product update",
                    formatDate(
                        station.updated
                    )
                ),

                metric(
                    "Processing level",
                    station.processingLevel
                ),

                metric(
                    "Processing mode",
                    station.processingMode ||
                    "Near Real Time"
                ),

                metric(
                    "Operational status",
                    station.status
                ),

                metric(
                    "Source",
                    station.source ||
                    "Satellite altimetry"
                )

            ].join("");

        }

        const note =
            get("waterLevelsDetailHistoryNote");

        if(note){

            note.textContent =
                (mode === "history"
                    ? "Selected range: "
                    : "Showing range: ") +
                activeHistoryRange +
                " · " +
                (
                    data.history &&
                    Number.isFinite(
                        Number(
                            data.history.totalPoints
                        )
                    )
                        ? data.history.totalPoints
                        : 0
                ) +
                " measurement(s).";

        }

        renderHistoryChart(
            data.measurements
        );

        const historySection =
            document.querySelector(
                "#waterLevelsDetailOverlay .water-levels-detail-history"
            );

        if(historySection){
            const focusHistory =
                mode === "history";

            historySection.classList.toggle(
                "is-focused",
                focusHistory
            );

            if(focusHistory){
                window.setTimeout(
                    function(){
                        historySection.scrollIntoView({
                            behavior:"smooth",
                            block:"start"
                        });
                    },
                    60
                );
            }
        }

        setDetailText(
            "waterLevelsDetailFooter",
            "Source: Copernicus Land Monitoring Service · " +
            "Satellite altimetry · " +
            (
                data.source &&
                data.source.dataset
                    ? data.source.dataset
                    : "CLMS"
            )
        );

    }

    function closeDetails(){
        const overlay =
            get("waterLevelsDetailOverlay");

        if(!overlay) return;

        overlay.classList.remove(
            "open"
        );

        overlay.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove(
            "water-levels-modal-open"
        );

        delete overlay.dataset.viewMode;

        const historySection =
            overlay.querySelector(
                ".water-levels-detail-history"
            );

        if(historySection){
            historySection.classList.remove(
                "is-focused"
            );
        }

        activeStationId = null;
        activeStation = null;
    }

    function setupFilters(){
        const filters =
            get("waterLevelsFilters");

        if(
            !filters ||
            filters.dataset.ready === "true"
        ){
            return;
        }

        filters.dataset.ready = "true";

        filters.querySelectorAll(
            "[data-water-filter]"
        ).forEach(function(button){
            button.setAttribute(
                "aria-pressed",
                button.classList.contains("active")
                    ? "true"
                    : "false"
            );
        });

        filters.addEventListener(
            "click",
            function(event){

                const button =
                    event.target.closest(
                        "[data-water-filter]"
                    );

                if(
                    !button ||
                    !filters.contains(button)
                ){
                    return;
                }

                activeFilter =
                    button.dataset.waterFilter ||
                    "all";

                filters.querySelectorAll(
                    "[data-water-filter]"
                ).forEach(function(item){

                    const active =
                        item === button;

                    item.classList.toggle(
                        "active",
                        active
                    );

                    item.setAttribute(
                        "aria-pressed",
                        active
                            ? "true"
                            : "false"
                    );

                });

                /* All/Rivers/Lakes are local filters; do not hit Copernicus again. */
                renderCards();

            }
        );
    }

    function setupSearch(){
        const input =
            get("waterLevelsSearch");

        if(
            !input ||
            input.dataset.ready === "true"
        ){
            return;
        }

        input.dataset.ready = "true";

        input.addEventListener(
            "input",
            scheduleSearch
        );

        input.addEventListener(
            "search",
            scheduleSearch
        );
    }

    function updateRefreshAvailability(){
        const button =
            get("waterLevelsRefresh");

        if(!button) return;

        const hasLoadedStations =
            Array.isArray(state.stations) &&
            state.stations.length > 0;

        button.disabled =
            hasLoadedStations;

        button.setAttribute(
            "aria-disabled",
            hasLoadedStations
                ? "true"
                : "false"
        );
    }

    function setupRefresh(){
        const button =
            get("waterLevelsRefresh");

        if(!button) return;

        updateRefreshAvailability();

        if(button.dataset.ready !== "true"){
            button.dataset.ready = "true";

            button.addEventListener(
                "click",
                function(){

                    if(button.disabled){
                        return;
                    }

                    loadStations({
                        force:true,
                        preserveCards:true
                    });

                    button.classList.remove(
                        "is-refreshing"
                    );

                    void button.offsetWidth;

                    button.classList.add(
                        "is-refreshing"
                    );

                    window.clearTimeout(
                        button._waterRefreshTimer
                    );

                    button._waterRefreshTimer =
                        window.setTimeout(
                            function(){
                                button.classList.remove(
                                    "is-refreshing"
                                );
                            },
                            600
                        );

                }
            );
        }
    }

    function setupRefreshInfo(){
        const button =
            get("waterLevelsRefreshInfoButton");

        const popover =
            get("waterLevelsRefreshInfo");

        if(
            !button ||
            !popover ||
            button.dataset.ready === "true"
        ){
            return;
        }

        button.dataset.ready = "true";

        function close(){
            popover.hidden = true;
            button.setAttribute(
                "aria-expanded",
                "false"
            );
        }

        function toggle(){
            popover.hidden =
                !popover.hidden;

            button.setAttribute(
                "aria-expanded",
                popover.hidden
                    ? "false"
                    : "true"
            );
        }

        button.addEventListener(
            "click",
            function(event){
                event.stopPropagation();
                toggle();
            }
        );

        document.addEventListener(
            "click",
            function(event){
                if(
                    popover.hidden ||
                    popover.contains(event.target) ||
                    event.target === button
                ){
                    return;
                }

                close();
            }
        );

        document.addEventListener(
            "keydown",
            function(event){
                if(event.key === "Escape"){
                    close();
                }
            }
        );
    }

    function setupCardActions(){
        const grid =
            get("waterLevelsGrid");

        if(
            !grid ||
            grid.dataset.ready === "true"
        ){
            return;
        }

        grid.dataset.ready = "true";

        grid.addEventListener(
            "click",
            function(event){

                const button =
                    event.target.closest(
                        "[data-water-action]"
                    );

                if(!button) return;

                const station =
                    state.stations.find(
                        function(item){
                            return (
                                item.id ===
                                button.dataset.waterStationId
                            );
                        }
                    );

                if(station){
                    openDetails(
                        station,
                        button.dataset.waterAction
                    );
                }

            }
        );
    }

    function setupDetailModal(){
        const overlay =
            get("waterLevelsDetailOverlay");

        const close =
            get("waterLevelsDetailClose");

        const controls =
            get("waterLevelsHistoryControls");

        if(
            close &&
            close.dataset.ready !== "true"
        ){

            close.dataset.ready = "true";

            close.addEventListener(
                "click",
                closeDetails
            );

        }

        if(
            overlay &&
            overlay.dataset.ready !== "true"
        ){

            overlay.dataset.ready = "true";

            overlay.addEventListener(
                "click",
                function(event){

                    if(
                        event.target === overlay
                    ){
                        closeDetails();
                    }

                }
            );

        }

        if(
            controls &&
            controls.dataset.ready !== "true"
        ){

            controls.dataset.ready = "true";

            controls.querySelectorAll(
                "[data-water-history]"
            ).forEach(function(button){

                button.setAttribute(
                    "aria-pressed",
                    button.classList.contains("active")
                        ? "true"
                        : "false"
                );

            });

            controls.addEventListener(
                "click",
                function(event){

                    const button =
                        event.target.closest(
                            "[data-water-history]"
                        );

                    if(!button) return;

                    activeHistoryRange =
                        button.dataset.waterHistory ||
                        "MAX";

                    controls.querySelectorAll(
                        "[data-water-history]"
                    ).forEach(function(item){

                        const active =
                            item === button;

                        item.classList.toggle(
                            "active",
                            active
                        );

                        item.setAttribute(
                            "aria-pressed",
                            active
                                ? "true"
                                : "false"
                        );

                    });

                    if(activeStation){
                        loadDetails(
                            activeStation,
                            "history"
                        );
                    }

                }
            );

        }

    }

    function setupKeyboard(){
        if(
            document.documentElement.dataset.waterLevelsKeyboard ===
            "true"
        ){
            return;
        }

        document.documentElement.dataset.waterLevelsKeyboard =
            "true";

        document.addEventListener(
            "keydown",
            function(event){

                const overlay =
                    get("waterLevelsDetailOverlay");

                if(
                    event.key === "Escape" &&
                    overlay &&
                    overlay.classList.contains("open")
                ){
                    closeDetails();
                }

            }
        );
    }

    function init(){
        if(
            !get("waterLevelsSection")
        ){
            return;
        }

        setupFilters();
        setupSearch();
        setupRefresh();
        setupRefreshInfo();
        updateRefreshAvailability();
        setupCardActions();
        setupDetailModal();
        setupKeyboard();

        if(
            state.stations.length === 0 &&
            !state.loading
        ){
            loadStations();
        }else{
            renderCards();
        }
    }

    window.initWaterLevelsUI =
        init;

    if(
        document.readyState === "loading"
    ){

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {once:true}
        );

    }else{

        init();

    }

})();
