/* =========================================================
   WEATHER + LIVE RADAR + MAP WEATHER
========================================================= */

/* =========================================================
   RAINVIEWER
========================================================= */

const RAINVIEWER_API =
    "https://api.rainviewer.com/public/weather-maps.json";

const RAINVIEWER_TILE_SIZE = 512;
const RAINVIEWER_COLOR = 2;
const RAINVIEWER_OPTIONS = "1_0";

/*
 * RainViewer public radar currently works reliably
 * up to zoom 7.
 *
 * The Leaflet map itself can zoom much further.
 */
const RAINVIEWER_MAX_ZOOM = 7;


/* =========================================================
   MAP WEATHER SETTINGS
========================================================= */

const WEATHER_MAP_MAX_ZOOM = 15;

/*
 * OpenStreetMap Overpass server.
 *
 * We use this to find towns/cities in the visible
 * map area when the user zooms in.
 */
const OVERPASS_APIS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter"
];

/*
 * Maximum number of places requested at once.
 *
 * This prevents the map from becoming overloaded.
 */
const WEATHER_MAX_PLACES = 100;


/* =========================================================
   GLOBAL STATE
========================================================= */

let weatherRadarMap = null;

let weatherRadarLayer = null;

let weatherRadarMarker = null;

let weatherRadarFrames = [];

let weatherRadarIndex = -1;

let weatherRadarPlaying = false;

let weatherRadarTimer = null;

let weatherRadarLocation = null;

let weatherRadarInitialized = false;


/* =========================================================
   MAP WEATHER STATE
========================================================= */

let weatherPlaceMarkers = [];

let weatherCloudMarkers = [];

let weatherCloudAnimationTimer = null;

let weatherCloudAnimationRunning = false;

let weatherCloudAutoRefreshTimer = null;

let weatherCloudDataLoading = false;

let weatherCloudLastUpdate = 0;

const WEATHER_CLOUD_REFRESH =
    10 * 60 * 1000;

let weatherPlacesLoading = false;

let weatherPlacesTimer = null;

let weatherLastPlacesKey = "";

let weatherPlacesCache = new Map();

let weatherWeatherCache = new Map();

let weatherLastWeatherUpdate = 0;

let weatherPlacesTimer = null;

let weatherLastPlacesKey = "";

let weatherPlacesCache = new Map();

let weatherWeatherCache = new Map();

let weatherLastWeatherUpdate = 0;

const WEATHER_CACHE_TIME =
    10 * 60 * 1000;


/* =========================================================
   HELPER
========================================================= */

function $(id) {

    return document.getElementById(id);

}


/* =========================================================
   OPEN WEATHER
========================================================= */

function openWeather(){

    const homePage = $("homePage");

    if(homePage){
        homePage.style.display = "none";
    }


    const discountsSection =
        $("discountsSection");

    if(discountsSection){
        discountsSection.style.display = "none";
    }


    const marketsSection =
        $("marketsSection");

    if(marketsSection){
        marketsSection.style.display = "none";
    }


    const moneySection =
        $("moneySection");

    if(moneySection){
        moneySection.style.display = "none";
    }


    document.querySelectorAll(".app").forEach(x => {

        x.classList.remove("active");

        x.style.display = "none";

    });


    const newsSection = $("newsSection");

    if(newsSection){
        newsSection.style.display = "none";
    }


    const settingsPanel = $("settingsPanel");

    if(settingsPanel){
        settingsPanel.style.display = "none";
    }


    const weatherSection = $("weatherSection");

    if(!weatherSection){
        return;
    }


    weatherSection.style.display = "block";


    const navLinks = $("navLinks");

    if(navLinks){
        navLinks.classList.remove("open");
    }


    document.documentElement.style.overflowY = "auto";

    document.body.style.overflowY = "auto";


    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });


    loadWeather();

}


/* =========================================================
   LOAD WEATHER
========================================================= */

async function loadWeather(){

    const location =
        $("weatherLocation");

    const icon =
        $("weatherIcon");

    const temperature =
        $("weatherTemperature");

    const description =
        $("weatherDescription");

    const feelsLike =
        $("weatherFeelsLike");

    const humidity =
        $("weatherHumidity");

    const wind =
        $("weatherWind");

    const forecastContainer =
        $("weatherForecast");

    const sunrise =
        $("weatherSunrise");

    const sunset =
        $("weatherSunset");


    if(!location){
        return;
    }


    location.textContent =
        "Detecting location...";


    if(description){

        description.textContent =
            "Loading weather...";

    }


    try{

        const userLocation =
            await getWeatherLocation();


        if(!userLocation){

            throw new Error(
                "Unable to determine location."
            );

        }


        const latitude =
            userLocation.latitude;

        const longitude =
            userLocation.longitude;


        weatherRadarLocation = {

            latitude,

            longitude

        };


        /* =================================================
           OPEN-METEO CURRENT WEATHER
        ================================================= */

        const response =
            await fetch(

                `https://api.open-meteo.com/v1/forecast` +
                `?latitude=${encodeURIComponent(latitude)}` +
                `&longitude=${encodeURIComponent(longitude)}` +
                `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,cloud_cover` +
                `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
                `&forecast_days=7` +
                `&timezone=auto`

            );


        if(!response.ok){

            throw new Error(
                `Open-Meteo HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        const current =
            data.current;

        const daily =
            data.daily;


        /* =================================================
           SUNRISE
        ================================================= */

        if(
            sunrise &&
            daily &&
            daily.sunrise
        ){

            sunrise.textContent =
                new Date(
                    daily.sunrise[0]
                ).toLocaleTimeString(
                    "en-US",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );

        }


        /* =================================================
           SUNSET
        ================================================= */

        if(
            sunset &&
            daily &&
            daily.sunset
        ){

            sunset.textContent =
                new Date(
                    daily.sunset[0]
                ).toLocaleTimeString(
                    "en-US",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );

        }


        /* =================================================
           CURRENT TEMPERATURE
        ================================================= */

        if(temperature){

            temperature.textContent =
                `${Math.round(
                    current.temperature_2m
                )}°C`;

        }


        /* =================================================
           FEELS LIKE
        ================================================= */

        if(feelsLike){

            feelsLike.textContent =
                `${Math.round(
                    current.apparent_temperature
                )}°C`;

        }


        /* =================================================
           HUMIDITY
        ================================================= */

        if(humidity){

            humidity.textContent =
                `${current.relative_humidity_2m}%`;

        }


        /* =================================================
           WIND
        ================================================= */

        if(wind){

            wind.textContent =
                `${Math.round(
                    current.wind_speed_10m
                )} km/h`;

        }


        /* =================================================
           CURRENT WEATHER DESCRIPTION
        ================================================= */

        const weather =
            getWeatherDescription(
                current.weather_code,
                current.wind_speed_10m
            );


        if(icon){

            icon.textContent =
                weather.icon;

        }


        if(description){

            description.textContent =
                weather.text;

        }


        /* =================================================
           7 DAY FORECAST
        ================================================= */

        if(forecastContainer){

            forecastContainer.innerHTML = "";


            const forecast =
                data.daily;


            for(
                let i = 0;
                i < forecast.time.length;
                i++
            ){

                const forecastWeather =
                    getWeatherDescription(
                        forecast.weather_code[i]
                    );


                const date =
                    new Date(
                        forecast.time[i] +
                        "T00:00:00"
                    );


                const day =
                    date.toLocaleDateString(
                        "en-US",
                        {
                            weekday: "short"
                        }
                    );


                const card =
                    document.createElement("div");


                card.className =
                    "weather-forecast-card";


                card.innerHTML = `

                    <div class="weather-forecast-day">
                        ${i === 0 ? "Today" : day}
                    </div>

                    <div class="weather-forecast-icon">
                        ${forecastWeather.icon}
                    </div>

                    <div class="weather-forecast-description">
                        ${forecastWeather.text}
                    </div>

                    <div class="weather-forecast-temp">

                        <strong>
                            ${Math.round(
                                forecast.temperature_2m_max[i]
                            )}°C
                        </strong>

                        <span>
                            ${Math.round(
                                forecast.temperature_2m_min[i]
                            )}°C
                        </span>

                    </div>

                    <div class="weather-forecast-rain">
                        💧 ${forecast.precipitation_probability_max[i]}%
                    </div>

                `;


                forecastContainer.appendChild(
                    card
                );

            }

        }


        /* =================================================
           LOCATION NAME
        ================================================= */

        try{

            const locationResponse =
                await fetch(

                    `https://nominatim.openstreetmap.org/reverse` +
                    `?format=json` +
                    `&lat=${encodeURIComponent(latitude)}` +
                    `&lon=${encodeURIComponent(longitude)}` +
                    `&zoom=10` +
                    `&addressdetails=1`,

                    {
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }

                );


            if(locationResponse.ok){

                const locationData =
                    await locationResponse.json();


                const address =
                    locationData.address || {};


                location.textContent =
                    address.city ||
                    address.town ||
                    address.village ||
                    address.municipality ||
                    `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

            }
            else{

                location.textContent =
                    `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

            }

        }
        catch(locationError){

            console.warn(
                "Reverse geocoding unavailable:",
                locationError
            );


            location.textContent =
                `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

        }


        /* =================================================
           RADAR
        ================================================= */

        await initializeWeatherRadar(
            latitude,
            longitude
        );


    }
    catch(error){

        console.error(
            "Weather error:",
            error
        );


        if(location){

            location.textContent =
                "Location unavailable";

        }


        if(description){

            description.textContent =
                "Weather unavailable.";

        }


        showWeatherRadarError(
            "Unable to load radar location."
        );

    }

}


/* =========================================================
   GET BROWSER LOCATION
========================================================= */

function getBrowserLocation(){

    return new Promise(

        (resolve, reject) => {

            if(!navigator.geolocation){

                reject(
                    new Error(
                        "Geolocation is not supported."
                    )
                );

                return;

            }


            navigator.geolocation.getCurrentPosition(

                position => {

                    resolve({

                        latitude:
                            position.coords.latitude,

                        longitude:
                            position.coords.longitude,

                        source:
                            "browser"

                    });

                },


                error => {

                    console.warn(
                        "Browser geolocation failed:",
                        error
                    );


                    reject(error);

                },


                {

                    enableHighAccuracy: true,

                    timeout: 10000,

                    maximumAge: 300000

                }

            );

        }

    );

}


/* =========================================================
   IP LOCATION
========================================================= */

async function getIPLocation(){

    const response =
        await fetch(
            "https://ipapi.co/json/"
        );


    if(!response.ok){

        throw new Error(
            `IP location HTTP ${response.status}`
        );

    }


    const data =
        await response.json();


    const latitude =
        Number(data.latitude);


    const longitude =
        Number(data.longitude);


    if(
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ){

        throw new Error(
            "Invalid IP location response."
        );

    }


    return {

        latitude,

        longitude,

        city:
            data.city || "",

        region:
            data.region || "",

        country:
            data.country_name || "",

        source:
            "ip"

    };

}


/* =========================================================
   WEATHER LOCATION
========================================================= */

async function getWeatherLocation(){

    try{

        return await getBrowserLocation();

    }
    catch(browserError){

        console.warn(
            "Using IP location fallback."
        );


        try{

            return await getIPLocation();

        }
        catch(ipError){

            console.error(
                "IP location fallback failed:",
                ipError
            );


            throw new Error(
                "Unable to determine location."
            );

        }

    }

}


/* =========================================================
   RADAR INITIALIZATION
========================================================= */

async function initializeWeatherRadar(
    latitude,
    longitude
){

    const radarContainer =
        $("weatherRadarMap");


    if(!radarContainer){
        return;
    }


    if(typeof L === "undefined"){

        showWeatherRadarError(
            "Leaflet could not be loaded."
        );

        return;

    }


    /* =================================================
       CREATE MAP
    ================================================= */

    if(!weatherRadarMap){

        weatherRadarMap =
            L.map(

                radarContainer,

                {

                    center: [
                        latitude,
                        longitude
                    ],

                    zoom: 7,

                    minZoom: 3,

                    maxZoom:
                        WEATHER_MAP_MAX_ZOOM,

                    zoomControl: true,

                    attributionControl: true

                }

            );


        /* =================================================
           BASE MAP
        ================================================= */

        L.tileLayer(

            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

            {

                maxZoom: 19,

                attribution:
                    '&copy; OpenStreetMap contributors'

            }

        ).addTo(
            weatherRadarMap
        );


        /* =================================================
           USER LOCATION
        ================================================= */

        weatherRadarMarker =
            L.circleMarker(

                [
                    latitude,
                    longitude
                ],

                {

                    radius: 8,

                    weight: 3,

                    fillOpacity: 1

                }

            )
            .addTo(
                weatherRadarMap
            );


        weatherRadarMarker.bindTooltip(

            "Your approximate location",

            {
                direction: "top"
            }

        );


        weatherRadarInitialized =
            true;


        /* =================================================
           MAP MOVE / ZOOM EVENTS
        ================================================= */

        weatherRadarMap.on(
            "zoomend",
            handleWeatherMapChanged
        );


        weatherRadarMap.on(
            "moveend",
            handleWeatherMapChanged
        );

    }
    else{

        weatherRadarMap.setView(

            [
                latitude,
                longitude
            ],

            Math.max(
                weatherRadarMap.getZoom(),
                7
            )

        );


        if(weatherRadarMarker){

            weatherRadarMarker.setLatLng(

                [
                    latitude,
                    longitude
                ]

            );

        }

    }


    setTimeout(

        () => {

            if(weatherRadarMap){

                weatherRadarMap.invalidateSize();

            }

        },

        150

    );


    await loadRainViewerFrames();


    /*
     * Load map weather after radar is ready.
     */
    scheduleWeatherMapRefresh();

    /*
 * Start automatic cloud/weather refresh.
    */
   startWeatherCloudAutoRefresh();

}

/* =========================================================
   MAP CHANGED
========================================================= */

function handleWeatherMapChanged(){

    scheduleWeatherMapRefresh();

}


/* =========================================================
   SCHEDULE MAP WEATHER
========================================================= */

function scheduleWeatherMapRefresh(){

    clearTimeout(
        weatherPlacesTimer
    );


    weatherPlacesTimer =
        setTimeout(

            () => {

                refreshWeatherMapData();

            },

            500

        );

}


/* =========================================================
   REFRESH MAP WEATHER
========================================================= */

async function refreshWeatherMapData(){

    if(
        !weatherRadarMap ||
        weatherPlacesLoading
    ){

        return;

    }


    const zoom =
        weatherRadarMap.getZoom();


    /*
     * Don't load a huge number of places
     * while zoomed far out.
     */
    if(zoom < 5){

        clearWeatherPlaceMarkers();

        clearWeatherCloudMarkers();

        return;

    }


    weatherPlacesLoading =
        true;


    try{

        const bounds =
            weatherRadarMap.getBounds();


        const south =
            bounds.getSouth();

        const west =
            bounds.getWest();

        const north =
            bounds.getNorth();

        const east =
            bounds.getEast();


               /*
         * Round the area to create a cache key.
         *
         * The zoom bucket is included so that we request
         * more detailed places as the user zooms in.
         */
        const key = [

            Math.round(south * 10) / 10,

            Math.round(west * 10) / 10,

            Math.round(north * 10) / 10,

            Math.round(east * 10) / 10,

            zoom >= 12
                ? "high"
                : zoom >= 9
                    ? "medium"
                    : "low"

        ].join("|");


        /*
         * Only reload places when the visible area
         * or zoom level has actually changed.
         */
        if(key === weatherLastPlacesKey){

    /*
     * City/place data did not change,
     * but the cloud/weather layer may need
     * its own refresh.
     */
    await updateWeatherCloudLayer();

    return;

}


        /*
         * IMPORTANT:
         *
         * Do not save the cache key until the
         * places and weather markers have loaded
         * successfully.
         */
        const places =
            await getPlacesForMap(
                south,
                west,
                north,
                east,
                zoom
            );


        await updateWeatherPlaceMarkers(
            places,
            zoom
        );

        /*
         * Cloud grid is independent from city markers.
         */
        await updateWeatherCloudLayer();

        /*
         * Mark this area as successfully loaded.
         */
        weatherLastPlacesKey =
            key;


    }
    catch(error){

        console.warn(
            "Map weather refresh failed:",
            error
        );

    }
    finally{

        weatherPlacesLoading =
            false;

    }

}

/* =========================================================
   GET PLACES FROM OPENSTREETMAP
========================================================= */

async function getPlacesForMap(
    south,
    west,
    north,
    east,
    zoom
){

    /*
     * At lower zoom levels we only ask for
     * cities / towns.
     *
     * At higher zoom we include villages.
     */

    let placeFilter;


    if(zoom >= 12){

        placeFilter = `
            node["place"~"city|town|village|hamlet"]
        `;

    }
    else if(zoom >= 9){

        placeFilter = `
            node["place"~"city|town|village"]
        `;

    }
    else{

        placeFilter = `
            node["place"~"city|town"]
        `;

    }


    /*
     * Keep the bounding box reasonably small.
     */
    const query = `

        [out:json][timeout:20];

        (
            ${placeFilter}
            (${south},${west},${north},${east});
        );

        out body;

    `;


    const cacheKey = [

        Math.round(south * 10) / 10,

        Math.round(west * 10) / 10,

        Math.round(north * 10) / 10,

        Math.round(east * 10) / 10,

        zoom >= 12 ? "v" :
        zoom >= 9 ? "t" :
        "c"

    ].join("|");


    if(weatherPlacesCache.has(cacheKey)){

        return weatherPlacesCache.get(
            cacheKey
        );

    }


    let response = null;
let lastError = null;

for (const api of OVERPASS_APIS) {

    try {

        response = await fetch(
            api,
            {
                method: "POST",

                body: query,

                headers: {
                    "Content-Type":
                        "text/plain;charset=UTF-8"
                }
            }
        );

        if (response.ok) {
            break;
        }

        lastError =
            new Error(
                `Overpass HTTP ${response.status}`
            );

    }
    catch (error) {

        lastError = error;

    }

}

if (!response || !response.ok) {

    throw (
        lastError ||
        new Error(
            "All Overpass servers failed."
        )
    );

}


    if(!response.ok){

        throw new Error(
            `Overpass HTTP ${response.status}`
        );

    }


    const data =
        await response.json();


    let places =
        Array.isArray(data.elements)
            ? data.elements
            : [];


    /*
     * Remove entries without names.
     */
    places =
        places.filter(
            place =>
                place &&
                place.tags &&
                place.tags.name &&
                Number.isFinite(place.lat) &&
                Number.isFinite(place.lon)
        );


    /*
     * Sort by importance:
     *
     * city > town > village > hamlet
     */
    const priority = {

        city: 4,

        town: 3,

        village: 2,

        hamlet: 1

    };


    places.sort(
        (a, b) => {

            const pa =
                priority[
                    a.tags.place
                ] || 0;

            const pb =
                priority[
                    b.tags.place
                ] || 0;

            return pb - pa;

        }
    );


    /*
     * Limit the number of places.
     */
    places =
        places.slice(
            0,
            WEATHER_MAX_PLACES
        );


    weatherPlacesCache.set(
        cacheKey,
        places
    );


    return places;

}


/* =========================================================
   UPDATE PLACE MARKERS
========================================================= */

async function updateWeatherPlaceMarkers(
    places,
    zoom
){

    clearWeatherPlaceMarkers();


    if(!places.length){

        return;

    }


    /*
     * Get weather for all visible places.
     */
    const weatherData =
        await getWeatherForPlaces(
            places
        );


    for(
        let i = 0;
        i < places.length;
        i++
    ){

        const place =
            places[i];


        const weather =
            weatherData[i];


        if(!weather){
            continue;
        }


        const name =
            place.tags.name;


        const temp =
            Math.round(
                weather.temperature
            );


        const weatherInfo =
            getWeatherDescription(

                weather.weatherCode,

                weather.windSpeed

            );


        /*
         * Marker becomes slightly smaller
         * when zoomed out.
         */
        const fontSize =
            zoom >= 12
                ? 14
                : zoom >= 9
                    ? 13
                    : 12;


        const html = `

            <div
                class="weather-place-marker"
                style="
                    font-size:${fontSize}px;
                "
            >

                <span class="weather-place-icon">
                    ${weatherInfo.icon}
                </span>

                <span class="weather-place-name">
                    ${escapeWeatherHTML(name)}
                </span>

                <span class="weather-place-temp">
                    ${temp}°C
                </span>

            </div>

        `;


        const marker =
            L.marker(

                [
                    place.lat,
                    place.lon
                ],

                {

                    icon:
                        L.divIcon({

                            className:
                                "weather-place-icon-wrapper",

                            html,

                            iconSize:
                                null,

                            iconAnchor:
                                [0, 0]

                        }),

                    interactive: true

                }

            );


        marker.bindTooltip(

            `

                <strong>
                    ${escapeWeatherHTML(name)}
                </strong>

                <br>

                ${weatherInfo.icon}
                ${escapeWeatherHTML(
                    weatherInfo.text
                )}

                <br>

                🌡️ ${temp}°C

                <br>

                ☁️ ${Math.round(
                    weather.cloudCover
                )}%

            `,

            {

                direction:
                    "top",

                opacity:
                    0.95

            }

        );


        marker.addTo(
            weatherRadarMap
        );


        weatherPlaceMarkers.push(
            marker
        );

    }


    /*
     * Cloud overlay.
     */
    await updateWeatherCloudLayer(
        places,
        weatherData
    );

}


/* =========================================================
   GET WEATHER FOR MANY PLACES
========================================================= */

async function getWeatherForPlaces(
    places
){

    const now =
        Date.now();


    const fresh =
        now - weatherLastWeatherUpdate <
        WEATHER_CACHE_TIME;


    /*
     * If cache is still fresh and every place
     * exists in cache, use it.
     */
    if(fresh){

        let allCached = true;

        const cached =
            places.map(
                place => {

                    const key =
                        getWeatherPlaceKey(
                            place.lat,
                            place.lon
                        );

                    const value =
                        weatherWeatherCache.get(
                            key
                        );

                    if(!value){

                        allCached = false;

                    }

                    return value;

                }
            );


        if(allCached){

            return cached;

        }

    }


    const latitudes =
        places.map(
            place =>
                place.lat
        );


    const longitudes =
        places.map(
            place =>
                place.lon
        );


    const url =

        "https://api.open-meteo.com/v1/forecast" +

        `?latitude=${latitudes.join(",")}` +

        `&longitude=${longitudes.join(",")}` +

        "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m" +

        "&timezone=auto";


    const response =
        await fetch(
            url
        );


    if(!response.ok){

        throw new Error(
            `Open-Meteo map HTTP ${response.status}`
        );

    }


    const data =
        await response.json();


    /*
     * Multiple coordinates return an array.
     *
     * Some API responses may contain a single
     * object, so handle both forms.
     */
    const results =
        Array.isArray(data)
            ? data
            : [data];


    const weather =
        places.map(
            (place, index) => {

                const result =
                    results[index];


                if(
                    !result ||
                    !result.current
                ){

                    return null;

                }


                const current =
                    result.current;


                const item = {

                    temperature:
                        Number(
                            current.temperature_2m
                        ),

                    weatherCode:
                        Number(
                            current.weather_code
                        ),

                    cloudCover:
                        Number(
                            current.cloud_cover || 0
                        ),

                    windSpeed:
                        Number(
                            current.wind_speed_10m || 0
                        ),

                    windDirection:
                        Number(
                            current.wind_direction_10m || 0
                        )
                
                };


                const key =
                    getWeatherPlaceKey(
                        place.lat,
                        place.lon
                    );


                weatherWeatherCache.set(
                    key,
                    item
                );


                return item;

            }
        );


    weatherLastWeatherUpdate =
        now;


    return weather;

}


/* =========================================================
   WEATHER PLACE KEY
========================================================= */

function getWeatherPlaceKey(
    latitude,
    longitude
){

    return (

        `${Math.round(latitude * 100)}` +

        "_" +

        `${Math.round(longitude * 100)}`

    );

}


/* =========================================================
   ANIMATED CLOUD GRID
========================================================= */

/*
 * Clouds are independent from city markers.
 *
 * The map viewport is divided into a grid.
 * Each grid point gets its own Open-Meteo weather data.
 *
 * Therefore clouds can appear over:
 *
 * Europe
 * Asia
 * Australia
 * North America
 * South America
 * Africa
 *
 * without depending on whether a city exists there.
 *
 * This is a visual weather layer based on current
 * cloud cover and wind. It is NOT satellite imagery.
 */


async function updateWeatherCloudLayer(){

    if(
        !weatherRadarMap ||
        weatherCloudDataLoading
    ){

        return;

    }


    const now =
        Date.now();


    /*
     * Avoid unnecessary API requests.
     */
    if(
        weatherCloudLastUpdate &&
        now - weatherCloudLastUpdate <
            WEATHER_CLOUD_REFRESH
    ){

        /*
         * If data is still fresh, only make sure
         * the animation is running.
         */
        if(
            weatherCloudMarkers.length &&
            !weatherCloudAnimationRunning
        ){

            startWeatherCloudAnimation();

        }

        return;

    }


    weatherCloudDataLoading =
        true;


    try{

        const bounds =
            weatherRadarMap.getBounds();


        const south =
            bounds.getSouth();

        const west =
            bounds.getWest();

        const north =
            bounds.getNorth();

        const east =
            bounds.getEast();


        /*
         * Build a viewport grid.
         *
         * We intentionally use a fixed grid so
         * the cloud layer is visible across the
         * entire screen instead of only around cities.
         */

        const rows =
            5;

        const columns =
            7;


        const points = [];


        for(
            let row = 0;
            row < rows;
            row++
        ){

            const lat =
                rows === 1
                    ? (south + north) / 2
                    : south +
                      (
                          (north - south) *
                          row /
                          (rows - 1)
                      );


            for(
                let col = 0;
                col < columns;
                col++
            ){

                const lon =
                    columns === 1
                        ? (west + east) / 2
                        : west +
                          (
                              (east - west) *
                              col /
                              (columns - 1)
                          );


                points.push({

                    latitude:
                        lat,

                    longitude:
                        lon

                });

            }

        }


        if(!points.length){

            return;

        }


        /*
         * Multiple coordinates are supported by
         * Open-Meteo.
         */
        const latitudes =
            points.map(
                point =>
                    point.latitude
            );


        const longitudes =
            points.map(
                point =>
                    point.longitude
            );


        const url =

            "https://api.open-meteo.com/v1/forecast" +

            `?latitude=${latitudes.join(",")}` +

            `&longitude=${longitudes.join(",")}` +

            "&current=cloud_cover,wind_speed_10m,wind_direction_10m" +

            "&timezone=auto";


        const response =
            await fetch(
                url,
                {
                    cache:
                        "no-store"
                }
            );


        if(!response.ok){

            throw new Error(
                `Open-Meteo cloud HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        const results =
            Array.isArray(data)
                ? data
                : [data];


        /*
         * Remove the old cloud layer.
         */
        clearWeatherCloudMarkers();


        for(
            let i = 0;
            i < points.length;
            i++
        ){

            const point =
                points[i];


            const result =
                results[i];


            if(
                !result ||
                !result.current
            ){

                continue;

            }


            const current =
                result.current;


            const cloudCover =
                Number(
                    current.cloud_cover
                );


            const windSpeed =
                Number(
                    current.wind_speed_10m || 0
                );


            const windDirection =
                Number(
                    current.wind_direction_10m || 0
                );


            if(
                !Number.isFinite(
                    cloudCover
                )
            ){

                continue;

            }


            /*
             * Don't completely hide partly cloudy
             * areas. This makes the layer much easier
             * to see while keeping clear sky mostly clean.
             */
            if(cloudCover < 15){

                continue;

            }


            /*
             * Number of cloud symbols at each
             * grid point.
             */
            const cloudCount =
                cloudCover >= 80
                    ? 4
                    : cloudCover >= 60
                        ? 3
                        : cloudCover >= 35
                            ? 2
                            : 1;


            for(
                let c = 0;
                c < cloudCount;
                c++
            ){

                /*
                 * Deterministic offsets prevent clouds
                 * from jumping randomly on refresh.
                 */
                const latOffset =
                    (
                        ((i * 17 + c * 31) % 100)
                        - 50
                    ) /
                    100;


                const lonOffset =
                    (
                        ((i * 29 + c * 43) % 100)
                        - 50
                    ) /
                    100;


                /*
                 * Scale offsets to the viewport.
                 */
                const latitudeScale =
                    Math.max(
                        (north - south) * 0.025,
                        0.05
                    );


                const longitudeScale =
                    Math.max(
                        (east - west) * 0.025,
                        0.05
                    );


                const cloudLat =
                    point.latitude +
                    latOffset *
                    latitudeScale;


                const cloudLon =
                    point.longitude +
                    lonOffset *
                    longitudeScale;


                /*
                 * Bigger cloud symbols when cloud cover
                 * is stronger.
                 */
                const size =
                    cloudCover >= 80
                        ? 42
                        : cloudCover >= 60
                            ? 36
                            : cloudCover >= 35
                                ? 31
                                : 27;


                const opacity =
                    0.34 +
                    (
                        cloudCover /
                        100
                    ) *
                    0.38;


                const html = `

                    <div
                        class="weather-animated-cloud"
                        style="
                            --cloud-size:${size}px;
                            --cloud-opacity:${opacity};
                        "
                    >

                        <span class="weather-cloud-shape">
                            ☁️
                        </span>

                    </div>

                `;


                const marker =
                    L.marker(

                        [
                            cloudLat,
                            cloudLon
                        ],

                        {

                            icon:
                                L.divIcon({

                                    className:
                                        "weather-cloud-icon-wrapper",

                                    html,

                                    iconSize:
                                        [size, size],

                                    iconAnchor:
                                        [
                                            size / 2,
                                            size / 2
                                        ]

                                }),

                            interactive:
                                false,

                            keyboard:
                                false,

                            zIndexOffset:
                                -50

                        }

                    );


                marker.addTo(
                    weatherRadarMap
                );


                /*
                 * Save animation data.
                 *
                 * Direction:
                 *
                 * 0   = North
                 * 90  = East
                 * 180 = South
                 * 270 = West
                 */
                marker.weatherCloudData = {

                    baseLat:
                        cloudLat,

                    baseLon:
                        cloudLon,

                    windDirection:

                        Number.isFinite(
                            windDirection
                        )

                            ? windDirection

                            : 0,

                    windSpeed:

                        Number.isFinite(
                            windSpeed
                        )

                            ? windSpeed

                            : 0

                };


                weatherCloudMarkers.push(
                    marker
                );

            }

        }


        weatherCloudLastUpdate =
            now;


        startWeatherCloudAnimation();

    }
    catch(error){

        console.warn(
            "Animated cloud layer failed:",
            error
        );

    }
    finally{

        weatherCloudDataLoading =
            false;

    }

}


/* =========================================================
   START CLOUD ANIMATION
========================================================= */

function startWeatherCloudAnimation(){

    stopWeatherCloudAnimation();


    if(
        !weatherRadarMap ||
        !weatherCloudMarkers.length
    ){

        return;

    }


    weatherCloudAnimationRunning =
        true;


    let progress =
        0;


    weatherCloudAnimationTimer =
        setInterval(

            () => {

                if(
                    !weatherCloudAnimationRunning ||
                    !weatherRadarMap
                ){

                    return;

                }


                progress +=
                    0.08;


                weatherCloudMarkers.forEach(

                    marker => {

                        if(
                            !marker ||
                            !marker.weatherCloudData
                        ){

                            return;

                        }


                        const cloud =
                            marker.weatherCloudData;


                        const direction =
                            Number(
                                cloud.windDirection
                            ) *
                            Math.PI /
                            180;


                        /*
                         * Wind speed affects
                         * animation speed.
                         *
                         * This remains intentionally
                         * subtle so clouds do not fly
                         * across the map.
                         */
                        const speed =
                            Math.max(

                                0.002,

                                Math.min(

                                    0.012,

                                    0.002 +
                                    cloud.windSpeed *
                                    0.00018

                                )

                            );


                        const distance =
                            (
                                progress *
                                speed
                            ) %
                            0.16;


                        /*
                         * Move the cloud according to
                         * the local wind direction.
                         */
                        const lat =
                            cloud.baseLat +
                            Math.cos(direction) *
                            distance;


                        const lon =
                            cloud.baseLon +
                            Math.sin(direction) *
                            distance;


                        marker.setLatLng([

                            lat,

                            lon

                        ]);

                    }

                );


            },

            1000

        );

}


/* =========================================================
   STOP CLOUD ANIMATION
========================================================= */

function stopWeatherCloudAnimation(){

    weatherCloudAnimationRunning =
        false;


    clearInterval(
        weatherCloudAnimationTimer
    );


    weatherCloudAnimationTimer =
        null;

}

/* =========================================================
   CLEAR PLACE MARKERS
========================================================= */

function clearWeatherPlaceMarkers(){

    if(!weatherRadarMap){
        return;
    }


    weatherPlaceMarkers.forEach(
        marker => {

            weatherRadarMap.removeLayer(
                marker
            );

        }
    );


    weatherPlaceMarkers = [];

}


/* =========================================================
   CLEAR CLOUD MARKERS
========================================================= */

function clearWeatherCloudMarkers(){

    stopWeatherCloudAnimation();


    if(!weatherRadarMap){

        weatherCloudMarkers = [];

        return;

    }


    weatherCloudMarkers.forEach(

        marker => {

            if(marker){

                weatherRadarMap.removeLayer(
                    marker
                );

            }

        }

    );


    weatherCloudMarkers = [];

}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeWeatherHTML(
    value
){

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   RAINVIEWER FRAMES
========================================================= */

async function loadRainViewerFrames(){

    const status =
        $("weatherRadarStatus");


    try{

        if(status){

            status.textContent =
                "Loading radar...";

        }


        const response =
            await fetch(

                RAINVIEWER_API,

                {
                    cache:
                        "no-store"
                }

            );


        if(!response.ok){

            throw new Error(
                `RainViewer HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        const pastFrames =

            data &&
            data.radar &&
            Array.isArray(
                data.radar.past
            )

                ? data.radar.past

                : [];


        if(!pastFrames.length){

            throw new Error(
                "No radar frames available."
            );

        }


        weatherRadarFrames =

            pastFrames

                .filter(

                    frame =>

                        frame &&
                        frame.path &&
                        Number.isFinite(
                            Number(frame.time)
                        )

                )

                .map(

                    frame => ({

                        time:
                            Number(frame.time),

                        path:
                            frame.path

                    })

                );


        if(!weatherRadarFrames.length){

            throw new Error(
                "No valid radar frames."
            );

        }


        weatherRadarFrames.sort(

            (a, b) =>
                a.time - b.time

        );


        weatherRadarIndex =
            weatherRadarFrames.length - 1;


        stopWeatherRadar();


        renderWeatherRadarControls();


        showWeatherRadarFrame(
            weatherRadarIndex
        );


        if(status){

            status.textContent =
                `${weatherRadarFrames.length} radar frames available`;

        }


    }
    catch(error){

        console.error(
            "RainViewer radar error:",
            error
        );


        weatherRadarFrames = [];

        weatherRadarIndex = -1;


        stopWeatherRadar();


        showWeatherRadarError(
            "Radar data is temporarily unavailable."
        );

    }

}


/* =========================================================
   RADAR TILE URL
========================================================= */

function getRainViewerTileUrl(
    frame
){

    if(
        !frame ||
        !frame.path
    ){

        return "";

    }


    return (

        `https://tilecache.rainviewer.com` +

        `${frame.path}` +

        `/${RAINVIEWER_TILE_SIZE}` +

        `/{z}/{x}/{y}` +

        `/${RAINVIEWER_COLOR}` +

        `/${RAINVIEWER_OPTIONS}.png`

    );

}


/* =========================================================
   SHOW RADAR FRAME
========================================================= */

function showWeatherRadarFrame(
    index
){

    if(
        !weatherRadarMap ||
        !weatherRadarFrames.length
    ){

        return;

    }


    if(
        index < 0 ||
        index >= weatherRadarFrames.length
    ){

        return;

    }


    const frame =
        weatherRadarFrames[index];


    const tileUrl =
        getRainViewerTileUrl(
            frame
        );


    if(!tileUrl){

        return;

    }


    if(weatherRadarLayer){

        weatherRadarMap.removeLayer(
            weatherRadarLayer
        );

        weatherRadarLayer = null;

    }


    weatherRadarLayer =
        L.tileLayer(

            tileUrl,

            {

                tileSize:
                    RAINVIEWER_TILE_SIZE,

                opacity:
                    0.72,

                maxZoom:
                    RAINVIEWER_MAX_ZOOM,

                updateWhenIdle:
                    true,

                updateWhenZooming:
                    false,

                keepBuffer:
                    2

            }

        );


    weatherRadarLayer.addTo(
        weatherRadarMap
    );


    weatherRadarIndex =
        index;


    updateWeatherRadarUI();

}


/* =========================================================
   RADAR CONTROLS
========================================================= */

function renderWeatherRadarControls(){

    const slider =
        $("weatherRadarSlider");

    const previous =
        $("weatherRadarPrevious");

    const next =
        $("weatherRadarNext");

    const play =
        $("weatherRadarPlay");


    if(!slider){

        return;

    }


    slider.min =
        "0";


    slider.max =
        String(

            Math.max(

                weatherRadarFrames.length - 1,

                0

            )

        );


    slider.step =
        "1";


    slider.value =
        String(

            Math.max(
                weatherRadarIndex,
                0
            )

        );


    slider.disabled =
        false;


    if(!slider.dataset.bound){

        slider.addEventListener(

            "input",

            () => {

                const index =
                    Number(
                        slider.value
                    );


                stopWeatherRadar();


                showWeatherRadarFrame(
                    index
                );

            }

        );


        slider.dataset.bound =
            "true";

    }


    if(
        previous &&
        !previous.dataset.bound
    ){

        previous.addEventListener(

            "click",

            () => {

                stopWeatherRadar();


                const nextIndex =
                    Math.max(

                        weatherRadarIndex - 1,

                        0

                    );


                showWeatherRadarFrame(
                    nextIndex
                );

            }

        );


        previous.dataset.bound =
            "true";

    }


    if(
        next &&
        !next.dataset.bound
    ){

        next.addEventListener(

            "click",

            () => {

                stopWeatherRadar();


                const nextIndex =
                    Math.min(

                        weatherRadarIndex + 1,

                        weatherRadarFrames.length - 1

                    );


                showWeatherRadarFrame(
                    nextIndex
                );

            }

        );


        next.dataset.bound =
            "true";

    }


    if(
        play &&
        !play.dataset.bound
    ){

        play.addEventListener(

            "click",

            () => {

                if(weatherRadarPlaying){

                    stopWeatherRadar();

                }
                else{

                    startWeatherRadar();

                }

            }

        );


        play.dataset.bound =
            "true";

    }


    updateWeatherRadarUI();

}


/* =========================================================
   RADAR UI
========================================================= */

function updateWeatherRadarUI(){

    const slider =
        $("weatherRadarSlider");

    const frameTime =
        $("weatherRadarTime");

    const play =
        $("weatherRadarPlay");

    const previous =
        $("weatherRadarPrevious");

    const next =
        $("weatherRadarNext");


    if(slider){

        slider.value =
            String(

                Math.max(
                    weatherRadarIndex,
                    0
                )

            );


        slider.max =
            String(

                Math.max(

                    weatherRadarFrames.length - 1,

                    0

                )

            );

    }


    if(frameTime){

        if(

            weatherRadarFrames.length &&

            weatherRadarIndex >= 0

        ){

            const frame =
                weatherRadarFrames[
                    weatherRadarIndex
                ];


            frameTime.textContent =
                formatRadarTime(
                    frame.time
                );

        }
        else{

            frameTime.textContent =
                "No radar frame";

        }

    }


    if(play){

        play.textContent =

            weatherRadarPlaying

                ? "⏸ Pause"

                : "▶ Play";


        play.setAttribute(

            "aria-label",

            weatherRadarPlaying

                ? "Pause radar"

                : "Play radar"

        );

    }


    if(previous){

        previous.disabled =
            weatherRadarIndex <= 0;

    }


    if(next){

        next.disabled =

            weatherRadarIndex >=
            weatherRadarFrames.length - 1;

    }

}


/* =========================================================
   PLAY RADAR
========================================================= */

function startWeatherRadar(){

    if(
        weatherRadarFrames.length < 2
    ){

        return;

    }


    weatherRadarPlaying =
        true;


    updateWeatherRadarUI();


    clearInterval(
        weatherRadarTimer
    );


    weatherRadarTimer =

        setInterval(

            () => {

                let nextIndex =
                    weatherRadarIndex + 1;


                if(

                    nextIndex >=
                    weatherRadarFrames.length

                ){

                    nextIndex = 0;

                }


                showWeatherRadarFrame(
                    nextIndex
                );

            },

            700

        );

}


/* =========================================================
   STOP RADAR
========================================================= */

function stopWeatherRadar(){

    weatherRadarPlaying =
        false;


    clearInterval(
        weatherRadarTimer
    );


    weatherRadarTimer =
        null;


    updateWeatherRadarUI();

}


/* =========================================================
   FORMAT RADAR TIME
========================================================= */

function formatRadarTime(
    unixTime
){

    const date =
        new Date(
            Number(unixTime) * 1000
        );


    return date.toLocaleString(

        "en-US",

        {

            weekday:
                "short",

            month:
                "short",

            day:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false

        }

    );

}


/* =========================================================
   RADAR ERROR
========================================================= */

function showWeatherRadarError(
    message
){

    const status =
        $("weatherRadarStatus");

    const frameTime =
        $("weatherRadarTime");


    if(status){

        status.textContent =
            message;

    }


    if(frameTime){

        frameTime.textContent =
            "Radar unavailable";

    }


    const slider =
        $("weatherRadarSlider");


    if(slider){

        slider.disabled =
            true;

    }


    const play =
        $("weatherRadarPlay");

    const previous =
        $("weatherRadarPrevious");

    const next =
        $("weatherRadarNext");


    if(play){
        play.disabled = true;
    }


    if(previous){
        previous.disabled = true;
    }


    if(next){
        next.disabled = true;
    }

}


/* =========================================================
   WEATHER DESCRIPTION
========================================================= */

function getWeatherDescription(
    code,
    windSpeed = 0
){

    /*
     * Very strong wind.
     *
     * This does NOT claim that it is literally
     * a hurricane/tornado. It is simply used as
     * an extreme-weather visual indicator.
     */
    if(
        Number(windSpeed) >= 75 &&
        Number(code) < 95
    ){

        return {

            icon:
                "🌪️",

            text:
                "Very strong wind / extreme weather"

        };

    }


    if(code === 0){

        return {

            icon:
                "☀️",

            text:
                "Clear sky"

        };

    }


    if(code === 1){

        return {

            icon:
                "🌤️",

            text:
                "Mainly clear"

        };

    }


    if(code === 2){

        return {

            icon:
                "🌤️",

            text:
                "Partly cloudy"

        };

    }


    if(code === 3){

        return {

            icon:
                "☁️",

            text:
                "Cloudy"

        };

    }


    if(code >= 45 && code <= 48){

        return {

            icon:
                "🌫️",

            text:
                "Fog"

        };

    }


    if(code >= 51 && code <= 57){

        return {

            icon:
                "🌦️",

            text:
                "Drizzle"

        };

    }


    if(code >= 61 && code <= 67){

        return {

            icon:
                "🌧️",

            text:
                "Rain"

        };

    }


    if(code >= 71 && code <= 77){

        return {

            icon:
                "🌨️",

            text:
                "Snow"

        };

    }


    if(code >= 80 && code <= 82){

        return {

            icon:
                "🌧️",

            text:
                "Rain showers"

        };

    }


    if(code >= 95){

        return {

            icon:
                "🌩️",

            text:
                "Thunderstorm"

        };

    }


    return {

        icon:
            "🌤️",

        text:
            "Unknown"

    };

}


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(

    "beforeunload",

    () => {

        stopWeatherRadar();

    }

);

/* =========================================================
   AUTO REFRESH CLOUDS
========================================================= */

function startWeatherCloudAutoRefresh(){

    clearInterval(
        weatherCloudAutoRefreshTimer
    );


    weatherCloudAutoRefreshTimer =
        setInterval(

            () => {

                if(
                    !weatherRadarMap
                ){

                    return;

                }


                /*
                 * Force a fresh cloud/weather request.
                 */
                weatherCloudLastUpdate = 0;


                updateWeatherCloudLayer();

            },

            WEATHER_CLOUD_REFRESH

        );

}

/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.openWeather =
    openWeather;

window.loadWeather =
    loadWeather;
