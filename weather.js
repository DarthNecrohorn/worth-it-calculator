/* =========================================================
   WEATHER
========================================================= */

const RAINVIEWER_API =
    "https://api.rainviewer.com/public/weather-maps.json";

const RAINVIEWER_TILE_SIZE = 512;
const RAINVIEWER_COLOR = 2;       // Universal Blue
const RAINVIEWER_OPTIONS = "1_0"; // smoothed, no separate snow color
const RAINVIEWER_MAX_ZOOM = 7;

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
        document.getElementById("discountsSection");

    if(discountsSection){
        discountsSection.style.display = "none";
    }

    const marketsSection =
        document.getElementById("marketsSection");

    if(marketsSection){
        marketsSection.style.display = "none";
    }

    const moneySection =
        document.getElementById("moneySection");

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
           OPEN-METEO
        ================================================= */

        const response =
            await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=7&timezone=auto`
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
           SUNRISE / SUNSET
        ================================================= */

        if(sunrise && daily.sunrise){

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

        if(sunset && daily.sunset){

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
           CURRENT WEATHER
        ================================================= */

        if(temperature){

            temperature.textContent =
                `${Math.round(
                    current.temperature_2m
                )}°C`;
        }

        if(feelsLike){

            feelsLike.textContent =
                `${Math.round(
                    current.apparent_temperature
                )}°C`;
        }

        if(humidity){

            humidity.textContent =
                `${current.relative_humidity_2m}%`;
        }

        if(wind){

            wind.textContent =
                `${Math.round(
                    current.wind_speed_10m
                )} km/h`;
        }


        const weather =
            getWeatherDescription(
                current.weather_code
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
           7-DAY FORECAST
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
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`,
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
   GET LOCATION
   Browser Geolocation -> IP FALLBACK
========================================================= */

function getBrowserLocation(){

    return new Promise(
        (resolve, reject) => {

            if(
                !navigator.geolocation
            ){

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

    if(
        typeof L === "undefined"
    ){

        showWeatherRadarError(
            "Leaflet could not be loaded."
        );

        return;
    }


    /* =================================================
       CREATE MAP ONCE
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
                        RAINVIEWER_MAX_ZOOM,

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
           USER LOCATION MARKER
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


    /* =================================================
       IMPORTANT:
       Leaflet maps inside hidden sections sometimes
       calculate their dimensions incorrectly.
    ================================================= */

    setTimeout(
        () => {

            if(weatherRadarMap){

                weatherRadarMap.invalidateSize();
            }

        },
        150
    );


    await loadRainViewerFrames();
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
                    cache: "no-store"
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
            Array.isArray(data.radar.past)
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


        /*
         * The API returns the past timeline.
         * We keep its real order and show the newest
         * available frame first.
         */

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

                opacity: 0.72,

                maxZoom:
                    RAINVIEWER_MAX_ZOOM,

                updateWhenIdle: true,

                updateWhenZooming: false,

                keepBuffer: 2
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
   RADAR UI
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
   RADAR UI UPDATE
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


    /*
     * Each RainViewer public past frame is a real
     * radar frame. We advance every 700ms to create
     * a smooth playback effect.
     */

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

                    /*
                     * Loop back to the oldest
                     * available real frame.
                     */

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
            weekday: "short",
            month: "short",
            day: "numeric",

            hour: "2-digit",
            minute: "2-digit",

            hour12: false
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

function getWeatherDescription(code){

    if(code === 0)
        return {
            icon:"☀️",
            text:"Clear sky"
        };

    if(code === 1 || code === 2)
        return {
            icon:"🌤️",
            text:"Partly cloudy"
        };

    if(code === 3)
        return {
            icon:"☁️",
            text:"Cloudy"
        };

    if(code >= 45 && code <= 48)
        return {
            icon:"🌫️",
            text:"Fog"
        };

    if(code >= 51 && code <= 57)
        return {
            icon:"🌦️",
            text:"Drizzle"
        };

    if(code >= 61 && code <= 67)
        return {
            icon:"🌧️",
            text:"Rain"
        };

    if(code >= 71 && code <= 77)
        return {
            icon:"❄️",
            text:"Snow"
        };

    if(code >= 80 && code <= 82)
        return {
            icon:"🌦️",
            text:"Rain showers"
        };

    if(code >= 95)
        return {
            icon:"⛈️",
            text:"Thunderstorm"
        };

    return {
        icon:"🌤️",
        text:"Unknown"
    };
}


/* =========================================================
   CLEANUP WHEN LEAVING WEATHER
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        stopWeatherRadar();

    }
);


/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.openWeather =
    openWeather;

window.loadWeather =
    loadWeather;
