/* =========================================================
   WORTH IT — WEATHER UI
   =========================================================

   Responsibilities of this file:

   - Browser geolocation
   - Local/browser weather cache
   - Requesting weather from /api/weather
   - Main current-weather card
   - 14-day forecast cards
   - Clickable forecast cards
   - Detailed selected-day weather panel
   - Localized weekday/date formatting
   - Location name display
   - Location coordinates display
   - Precipitation coverage
   - Moon phase
   - Hover / selected-card UI
   - Loading / error handling
   - Duplicate request prevention

   Server-side API caching belongs in weather.js.
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const WEATHER_UI_CONFIG = {

    /* Primary UI forecast length. */
    FORECAST_DAYS: 14,

    /* Browser weather-data cache. */
    BROWSER_CACHE_TTL_MS:
        4 * 60 * 60 * 1000,

    /* Browser location cache. */
    LOCATION_CACHE_TTL_MS:
        30 * 60 * 1000,

    /* Browser geolocation timeout. */
    GEOLOCATION_TIMEOUT_MS:
        10000,

    /* Weather request timeout. */
    WEATHER_REQUEST_TIMEOUT_MS:
        20000

};


/* =========================================================
   STATE
========================================================= */

let weatherLoadPromise = null;

let weatherLastData = null;

let weatherLastCoordinates = null;

let weatherSelectedForecastIndex = 0;


/* =========================================================
   HELPER
========================================================= */

function $(id){

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


    document.querySelectorAll(".app").forEach(
        x => {

            x.classList.remove("active");

            x.style.display = "none";

        }
    );


    const newsSection =
        $("newsSection");

    if(newsSection){
        newsSection.style.display = "none";
    }


    const settingsPanel =
        $("settingsPanel");

    if(settingsPanel){
        settingsPanel.style.display = "none";
    }


    const weatherSection =
        $("weatherSection");

    if(!weatherSection){
        return;
    }


    weatherSection.style.display = "block";


    const navLinks =
        $("navLinks");

    if(navLinks){
        navLinks.classList.remove("open");
    }


    document.documentElement.style.overflowY = "auto";

    document.body.style.overflowY = "auto";


    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });


    ensureWeatherUIStyles();

    loadWeather();

}


/* =========================================================
   LOAD WEATHER
========================================================= */

async function loadWeather(){

    /*
     * Prevent duplicate simultaneous weather requests.
     */
    if(weatherLoadPromise){
        return weatherLoadPromise;
    }


    weatherLoadPromise =
        loadWeatherInternal()
            .finally(
                () => {

                    weatherLoadPromise = null;

                }
            );


    return weatherLoadPromise;

}


/* =========================================================
   INTERNAL WEATHER LOADER
========================================================= */

async function loadWeatherInternal(){

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


    ensureWeatherUIStyles();

    ensureForecastHeading(
        forecastContainer
    );


    /*
     * Initial loading state.
     */
    location.textContent =
        "Detecting location...";


    if(description){

        description.textContent =
            "Loading weather...";

    }


    if(forecastContainer){

        forecastContainer.innerHTML = "";

    }


    hideWeatherDetails();


    try{

        /*
         * -------------------------------------------------
         * 1. GET BROWSER LOCATION
         * -------------------------------------------------
         */

        const userLocation =
            await getWeatherLocation();


        if(!userLocation){

            throw new Error(
                "Unable to determine location."
            );

        }


        const latitude =
            Number(
                userLocation.latitude
            );

        const longitude =
            Number(
                userLocation.longitude
            );


        if(
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ){

            throw new Error(
                "Invalid location coordinates."
            );

        }


        weatherLastCoordinates = {

            latitude,

            longitude

        };


        /*
         * -------------------------------------------------
         * 2. DETERMINE BROWSER / API LANGUAGE
         * -------------------------------------------------
         */

        const visualCrossingLanguage =
            getPreferredWeatherLanguage();


        /*
         * -------------------------------------------------
         * 3. BROWSER CACHE
         * -------------------------------------------------
         */

        const browserCacheKey =
            createWeatherBrowserCacheKey(
                latitude,
                longitude,
                visualCrossingLanguage
            );


        const cachedWeather =
            readWeatherBrowserCache(
                browserCacheKey
            );


        if(cachedWeather){

            weatherLastData =
                cachedWeather.data;


            renderWeatherData({

                data:
                    cachedWeather.data,

                latitude,

                longitude

            });


            return;

        }


        /*
         * -------------------------------------------------
         * 4. REQUEST WEATHER THROUGH CLOUDFLARE FUNCTION
         * -------------------------------------------------
         */

        const controller =
            new AbortController();


        const timeout =
            setTimeout(
                () => {

                    controller.abort();

                },

                WEATHER_UI_CONFIG
                    .WEATHER_REQUEST_TIMEOUT_MS
            );


        let response;


        try{

            response =
                await fetch(

                    `/api/weather` +
                    `?latitude=${encodeURIComponent(latitude)}` +
                    `&longitude=${encodeURIComponent(longitude)}` +
                    `&lang=${encodeURIComponent(visualCrossingLanguage)}`,

                    {

                        method:
                            "GET",

                        headers: {

                            "Accept":
                                "application/json"

                        },

                        /*
                         * Server-side cache in weather.js
                         * remains the main API protection.
                         */
                        cache:
                            "no-store",

                        signal:
                            controller.signal

                    }

                );

        }
        finally{

            clearTimeout(timeout);

        }


        if(!response.ok){

            let serverMessage = "";


            try{

                const errorData =
                    await response.json();


                serverMessage =
                    errorData &&
                    typeof errorData.error === "string"
                        ? ` — ${errorData.error}`
                        : "";

            }
            catch(errorResponseParsing){

                /*
                 * Ignore malformed error bodies.
                 */

            }


            throw new Error(

                `Weather API HTTP ${response.status}${serverMessage}`

            );

        }


        const data =
            await response.json();


        /*
         * -------------------------------------------------
         * 5. VALIDATE RESPONSE
         * -------------------------------------------------
         */

        if(
            !data ||
            !data.currentConditions
        ){

            throw new Error(
                "Current weather data is unavailable."
            );

        }


        if(
            !Array.isArray(data.days) ||
            data.days.length === 0
        ){

            throw new Error(
                "Forecast data is unavailable."
            );

        }


        /*
         * -------------------------------------------------
         * 6. SAVE BROWSER CACHE
         * -------------------------------------------------
         */

        saveWeatherBrowserCache(

            browserCacheKey,

            data

        );


        weatherLastData =
            data;


        /*
         * -------------------------------------------------
         * 7. RENDER EVERYTHING
         * -------------------------------------------------
         */

        renderWeatherData({

            data,

            latitude,

            longitude

        });

    }
    catch(error){

        console.error(
            "Weather error:",
            error
        );


        /*
         * If API fails but there is some older data
         * currently stored in memory, keep using it.
         */

        if(weatherLastData){

            try{

                renderWeatherData({

                    data:
                        weatherLastData,

                    latitude:
                        weatherLastCoordinates
                            ? weatherLastCoordinates.latitude
                            : NaN,

                    longitude:
                        weatherLastCoordinates
                            ? weatherLastCoordinates.longitude
                            : NaN,

                    isStale:
                        true

                });


                showWeatherStaleNotice();

                return;

            }
            catch(staleRenderError){

                console.error(
                    "Stale weather render error:",
                    staleRenderError
                );

            }

        }


        showWeatherError();

    }

}


/* =========================================================
   RENDER WEATHER DATA
========================================================= */

function renderWeatherData({

    data,
    latitude,
    longitude,
    isStale = false

}){

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


    const current =
        data &&
        data.currentConditions;


    if(!current){

        throw new Error(
            "Current weather data is unavailable."
        );

    }


    /*
     * -------------------------------------------------
     * FORECAST DATA
     *
     * Visual Crossing can provide up to 15 days.
     * Worth It Weather UI displays 14.
     * -------------------------------------------------
     */

    const forecast =
        Array.isArray(data.days)
            ? data.days.slice(
                0,
                WEATHER_UI_CONFIG.FORECAST_DAYS
            )
            : [];


    if(forecast.length === 0){

        throw new Error(
            "Forecast data is unavailable."
        );

    }


    /*
     * -------------------------------------------------
     * LOCATION NAME
     * -------------------------------------------------
     */

    const displayName =
    getLocationDisplayName(
        data.resolvedAddress,
        data.address
    );


if(location){

    location.textContent =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)

            ? `📍 ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`

            : "📍 Location unavailable";

}


    /*
     * -------------------------------------------------
     * LOCATION INFORMATION UNDER THE MAIN LOCATION
     * -------------------------------------------------
     */

    renderWeatherLocationMeta({

        latitude,

        longitude,

        city:
            displayName

    });


    /*
     * -------------------------------------------------
     * TODAY
     * -------------------------------------------------
     */

    const today =
        forecast[0] || null;


    /*
     * -------------------------------------------------
     * SUNRISE / SUNSET
     * -------------------------------------------------
     */

    if(sunrise){

        sunrise.textContent =
            formatWeatherTime(
                today &&
                today.sunrise
            );

    }


    if(sunset){

        sunset.textContent =
            formatWeatherTime(
                today &&
                today.sunset
            );

    }


    /*
     * -------------------------------------------------
     * CURRENT TEMPERATURE
     * -------------------------------------------------
     */

    if(temperature){

        temperature.textContent =
            formatCelsius(
                current.temp
            );

    }


    /*
     * -------------------------------------------------
     * FEELS LIKE
     * -------------------------------------------------
     */

    if(feelsLike){

        feelsLike.textContent =
            formatCelsius(
                current.feelslike
            );

    }


    /*
     * -------------------------------------------------
     * HUMIDITY
     * -------------------------------------------------
     */

    if(humidity){

        humidity.textContent =
            formatPercentage(
                current.humidity
            );

    }


    /*
     * -------------------------------------------------
     * WIND
     * -------------------------------------------------
     */

    if(wind){

        wind.textContent =
            formatWindDisplay(
                current.windspeed,
                current.winddir
            );

    }


    /*
     * -------------------------------------------------
     * CURRENT WEATHER
     * -------------------------------------------------
     */

    const currentWeather =
        getWeatherDescription(

            current.icon,

            current.conditions,

            current.windspeed

        );


    if(icon){

        icon.textContent =
            currentWeather.icon;

    }


    if(description){

        description.textContent =
            currentWeather.text;

    }


    /*
     * -------------------------------------------------
     * FORECAST TITLE
     * -------------------------------------------------
     */

    ensureForecastHeading(
        forecastContainer,
        forecast.length
    );


    /*
     * -------------------------------------------------
     * FORECAST CARDS
     * -------------------------------------------------
     */

    renderForecastCards(
        forecastContainer,
        forecast
    );


    /*
     * -------------------------------------------------
     * SHOW TODAY DETAILS BY DEFAULT
     * -------------------------------------------------
     */

    weatherSelectedForecastIndex = 0;

    renderSelectedDayDetails(
        forecast,
        0
    );


    /*
     * -------------------------------------------------
     * STALE NOTICE
     * -------------------------------------------------
     */

    if(isStale){

        showWeatherStaleNotice();

    }
    else{

        hideWeatherStaleNotice();

    }

}


/* =========================================================
   LOCATION META
========================================================= */

function ensureWeatherLocationMeta(){

    let container =
        $("weatherLocationMeta");


    if(container){
        return container;
    }


    const location =
        $("weatherLocation");


    if(!location){
        return null;
    }


    container =
        document.createElement(
            "div"
        );


    container.id =
        "weatherLocationMeta";


    container.className =
        "weather-location-meta";


    location.insertAdjacentElement(

        "afterend",

        container

    );


    return container;

}


function renderWeatherLocationMeta({

    latitude,

    longitude,

    city

}){

    const container =
        ensureWeatherLocationMeta();


    if(!container){
        return;
    }


    const coordinateText =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)

            ? `📍 ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`

            : "📍 Location coordinates unavailable";


    const displayCity =
        String(
            city || ""
        )
        .trim() ||
        "Location unavailable";


    container.innerHTML = `

        <div class="weather-location-coordinates">
            ${escapeHtml(coordinateText)}
        </div>

        <div class="weather-location-card">

            <div class="weather-location-card-label">
                📌 Weather location
            </div>

            <div class="weather-location-card-city">
                ${escapeHtml(displayCity)}
            </div>

        </div>

    `;


    container.style.display =
        "block";

}


/* =========================================================
   RENDER FORECAST CARDS
========================================================= */

function renderForecastCards(

    forecastContainer,

    forecast

){

    if(!forecastContainer){
        return;
    }


    forecastContainer.innerHTML = "";


    forecast.forEach(

        (
            forecastDay,
            index
        ) => {

            const forecastWeather =
                getWeatherDescription(

                    forecastDay.icon,

                    forecastDay.conditions,

                    forecastDay.windspeed

                );


            const day =
                getForecastDayName(

                    forecastDay.datetime,

                    index

                );


            const fullDate =
                formatForecastDate(

                    forecastDay.datetime

                );


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "weather-forecast-card";


            card.dataset.forecastIndex =
                String(index);


            card.setAttribute(
                "role",
                "button"
            );


            card.setAttribute(
                "tabindex",
                "0"
            );


            card.setAttribute(
                "aria-label",
                `Show weather details for ${day}`
            );


            if(index === weatherSelectedForecastIndex){

                card.classList.add(
                    "is-selected"
                );

            }


            const maxTemperature =
                formatCelsius(
                    forecastDay.tempmax
                );


            const minTemperature =
                formatCelsius(
                    forecastDay.tempmin
                );


            const rainProbability =
                formatPercentage(
                    forecastDay.precipprob
                );


            card.innerHTML = `

                <div class="weather-forecast-day">
                    ${escapeHtml(day)}
                </div>

                <div class="weather-forecast-date">
                    ${escapeHtml(fullDate)}
                </div>

                <div class="weather-forecast-icon">
                    ${escapeHtml(forecastWeather.icon)}
                </div>

                <div class="weather-forecast-description">
                    ${escapeHtml(forecastWeather.text)}
                </div>

                <div class="weather-forecast-temp">

                    <strong>
                        ${escapeHtml(maxTemperature)}
                    </strong>

                    <span>
                        ${escapeHtml(minTemperature)}
                    </span>

                </div>

                <div class="weather-forecast-rain">
                    💧 ${escapeHtml(rainProbability)}
                </div>

            `;


            /*
             * Click.
             */
            card.addEventListener(

                "click",

                () => {

                    selectForecastDay(
                        forecast,
                        index
                    );

                }

            );


            /*
             * Keyboard accessibility.
             */
            card.addEventListener(

                "keydown",

                event => {

                    if(
                        event.key === "Enter" ||
                        event.key === " "
                    ){

                        event.preventDefault();

                        selectForecastDay(
                            forecast,
                            index
                        );

                    }

                }

            );


            forecastContainer.appendChild(
                card
            );

        }

    );

}


/* =========================================================
   SELECT FORECAST DAY
========================================================= */

function selectForecastDay(

    forecast,

    index

){

    if(
        !Array.isArray(forecast) ||
        !forecast[index]
    ){

        return;

    }


    weatherSelectedForecastIndex =
        index;


    document
        .querySelectorAll(
            ".weather-forecast-card"
        )
        .forEach(

            card => {

                const cardIndex =
                    Number(
                        card.dataset.forecastIndex
                    );


                card.classList.toggle(

                    "is-selected",

                    cardIndex === index

                );

            }

        );


    renderSelectedDayDetails(
        forecast,
        index
    );


    const details =
        $("weatherDayDetails");


    if(details){

        details.scrollIntoView({

            behavior:
                "smooth",

            block:
                "nearest"

        });

    }

}


/* =========================================================
   RENDER SELECTED DAY DETAILS
========================================================= */

function renderSelectedDayDetails(

    forecast,

    index

){

    if(
        !Array.isArray(forecast) ||
        !forecast[index]
    ){

        hideWeatherDetails();

        return;

    }


    const day =
        forecast[index];


    const panel =
        ensureWeatherDetailsPanel();


    if(!panel){
        return;
    }


    const weather =
        getWeatherDescription(

            day.icon,

            day.conditions,

            day.windspeed

        );


    const isToday =
        index === 0;


    const heading =
        isToday

            ? "Today"

            : formatForecastDateLong(
                day.datetime
            );


    const description =
        day.description ||
        day.conditions ||
        weather.text ||
        "Weather information";


    const sunrise =
        formatWeatherTime(
            day.sunrise
        );


    const sunset =
        formatWeatherTime(
            day.sunset
        );


    panel.innerHTML = `

        <div class="weather-details-header">

            <div>

                <div class="weather-details-kicker">
                    ${isToday ? "Today" : "Selected day"}
                </div>

                <h3 class="weather-details-title">
                    ${escapeHtml(heading)}
                </h3>

            </div>

            <div class="weather-details-header-weather">

                <span class="weather-details-header-icon">
                    ${escapeHtml(weather.icon)}
                </span>

                <span class="weather-details-header-temp">
                    ${escapeHtml(
                        formatCelsius(day.temp)
                    )}
                </span>

            </div>

        </div>


        <div class="weather-details-description">

            ${escapeHtml(description)}

        </div>


        <div class="weather-details-grid">


            ${createWeatherDetailItem(

                "Maximum",
                formatCelsius(day.tempmax)

            )}


            ${createWeatherDetailItem(

                "Minimum",
                formatCelsius(day.tempmin)

            )}


            ${createWeatherDetailItem(

                "Feels like",
                formatCelsius(day.feelslike)

            )}


            ${createWeatherDetailItem(

                "Humidity",
                formatPercentage(day.humidity)

            )}


            ${createWeatherDetailItem(

                "Rain chance",
                formatPercentage(day.precipprob)

            )}


            ${createWeatherDetailItem(

                "Precipitation",
                formatMillimeters(day.precip)

            )}


            ${createWeatherDetailItem(

                "Wind",
                formatWindDisplay(
                    day.windspeed,
                    day.winddir
                )

            )}


            ${createWeatherDetailItem(

                "Wind gust",
                formatWindSpeed(day.windgust)

            )}


            ${createWeatherDetailItem(

                "Cloud cover",
                formatPercentage(day.cloudcover)

            )}


            ${createWeatherDetailItem(

                "Visibility",
                formatVisibility(day.visibility)

            )}


            ${createWeatherDetailItem(

                "Pressure",
                formatPressure(day.pressure)

            )}


            ${createWeatherDetailItem(

                "Dew point",
                formatCelsius(day.dew)

            )}


            ${createWeatherDetailItem(

                "UV index",
                formatPlainNumber(day.uvindex)

            )}


            ${createWeatherDetailItem(

                "Sunrise",
                sunrise

            )}


            ${createWeatherDetailItem(

                "Sunset",
                sunset

            )}


            ${createWeatherDetailItem(

                "Solar energy",
                formatSolarEnergy(day.solarenergy)

            )}


            ${createWeatherDetailItem(

                "Precipitation coverage",
                formatPercentage(day.precipcover)

            )}


            ${createWeatherDetailItem(

                "Moon phase",
                formatMoonPhase(day.moonphase),

                "weather-moon-phase"

            )}


        </div>

    `;


    panel.style.display =
        "block";

}


/* =========================================================
   WEATHER DETAIL ITEM
========================================================= */

function createWeatherDetailItem(

    label,

    value,

    extraClass = ""

){

    return `

        <div class="weather-detail-item ${escapeHtml(extraClass)}">

            <div class="weather-detail-label">
                ${escapeHtml(label)}
            </div>

            <div class="weather-detail-value">
                ${escapeHtml(value)}
            </div>

        </div>

    `;

}


/* =========================================================
   MOON PHASE
========================================================= */

function formatMoonPhase(

    value

){

    const number =
        Number(value);


    if(
        !Number.isFinite(number)
    ){

        return "—";

    }


    /*
     * Visual Crossing moonphase:
     *
     * 0.00 = New Moon
     * 0.25 = First Quarter
     * 0.50 = Full Moon
     * 0.75 = Last Quarter
     * 1.00 = New Moon
     */

    const normalized =
        Math.max(
            0,
            Math.min(
                1,
                number
            )
        );


    if(
        normalized < 0.03 ||
        normalized >= 0.97
    ){

        return "🌑 New Moon";

    }


    if(
        normalized < 0.22
    ){

        return "🌒 Waxing Crescent";

    }


    if(
        normalized < 0.28
    ){

        return "🌓 First Quarter";

    }


    if(
        normalized < 0.47
    ){

        return "🌔 Waxing Gibbous";

    }


    if(
        normalized < 0.53
    ){

        return "🌕 Full Moon";

    }


    if(
        normalized < 0.72
    ){

        return "🌖 Waning Gibbous";

    }


    if(
        normalized < 0.78
    ){

        return "🌗 Last Quarter";

    }


    return "🌘 Waning Crescent";

}


/* =========================================================
   ENSURE DETAILS PANEL
========================================================= */

function ensureWeatherDetailsPanel(){

    let panel =
        $("weatherDayDetails");


    if(panel){
        return panel;
    }


    const forecastContainer =
        $("weatherForecast");


    if(!forecastContainer){
        return null;
    }


    panel =
        document.createElement(
            "div"
        );


    panel.id =
        "weatherDayDetails";


    panel.className =
        "weather-day-details";


    panel.style.display =
        "none";


    forecastContainer.insertAdjacentElement(

        "afterend",

        panel

    );


    return panel;

}


/* =========================================================
   HIDE DETAILS
========================================================= */

function hideWeatherDetails(){

    const panel =
        $("weatherDayDetails");


    if(panel){

        panel.style.display =
            "none";

    }

}


/* =========================================================
   FORECAST TITLE
========================================================= */

function ensureForecastHeading(

    forecastContainer,

    count = WEATHER_UI_CONFIG.FORECAST_DAYS

){

    if(!forecastContainer){
        return;
    }


    let heading = null;


    const possibleSelectors = [

        "#weatherForecastTitle",

        ".weather-forecast-title",

        ".weather-forecast-heading",

        "[data-weather-forecast-title]"

    ];


    for(
        const selector of possibleSelectors
    ){

        heading =
            forecastContainer
                .parentElement
                ?.querySelector(
                    selector
                ) ||
            document.querySelector(
                selector
            );


        if(heading){
            break;
        }

    }


    /*
     * Try to find an existing nearby heading.
     */
    if(!heading){

        let previous =
            forecastContainer.previousElementSibling;


        while(previous){

            if(
                /^(H1|H2|H3|H4|H5|H6)$/
                    .test(previous.tagName) ||
                previous.classList.contains(
                    "section-title"
                ) ||
                previous.classList.contains(
                    "section-subtitle"
                )
            ){

                heading =
                    previous;

                break;

            }


            previous =
                previous.previousElementSibling;

        }

    }


    /*
     * If no heading exists, create one.
     */
    if(!heading){

        heading =
            document.createElement(
                "h3"
            );


        heading.className =
            "weather-forecast-title";


        forecastContainer
            .parentElement
            ?.insertBefore(
                heading,
                forecastContainer
            );

    }


    const visibleCount =
        Math.min(

            Number(count) ||
                WEATHER_UI_CONFIG.FORECAST_DAYS,

            WEATHER_UI_CONFIG.FORECAST_DAYS

        );


    heading.textContent =
        `${visibleCount}-day forecast`;

}


/* =========================================================
   BROWSER GEOLOCATION
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


            /*
             * Check our own short-term browser location cache.
             */
            const cached =
                readBrowserLocationCache();


            if(cached){

                resolve(cached);

                return;

            }


            navigator.geolocation.getCurrentPosition(

                position => {

                    const result = {

                        latitude:
                            position.coords.latitude,

                        longitude:
                            position.coords.longitude,

                        accuracy:
                            Number.isFinite(
                                Number(
                                    position.coords.accuracy
                                )
                            )
                                ? position.coords.accuracy
                                : null,

                        source:
                            "browser"

                    };


                    saveBrowserLocationCache(
                        result
                    );


                    resolve(result);

                },


                error => {

                    console.warn(

                        "Browser geolocation failed:",

                        error

                    );


                    reject(error);

                },


                {

                    enableHighAccuracy:
                        false,

                    timeout:
                        WEATHER_UI_CONFIG
                            .GEOLOCATION_TIMEOUT_MS,

                    maximumAge:
                        WEATHER_UI_CONFIG
                            .LOCATION_CACHE_TTL_MS

                }

            );

        }

    );

}


/* =========================================================
   WEATHER LOCATION
========================================================= */

async function getWeatherLocation(){

    return await getBrowserLocation();

}


/* =========================================================
   LOCATION CACHE
========================================================= */

const WEATHER_LOCATION_STORAGE_KEY =
    "worthIt.weather.location.v1";


function readBrowserLocationCache(){

    try{

        const raw =
            localStorage.getItem(
                WEATHER_LOCATION_STORAGE_KEY
            );


        if(!raw){
            return null;
        }


        const parsed =
            JSON.parse(raw);


        if(
            !parsed ||
            !parsed.location ||
            !Number.isFinite(
                Number(
                    parsed.location.latitude
                )
            ) ||
            !Number.isFinite(
                Number(
                    parsed.location.longitude
                )
            )
        ){

            return null;

        }


        const age =
            Date.now() -
            Number(parsed.timestamp);


        if(
            !Number.isFinite(age) ||
            age < 0 ||
            age >
                WEATHER_UI_CONFIG
                    .LOCATION_CACHE_TTL_MS
        ){

            return null;

        }


        return parsed.location;

    }
    catch(error){

        console.warn(
            "Weather location cache read failed:",
            error
        );


        return null;

    }

}


function saveBrowserLocationCache(

    location

){

    try{

        localStorage.setItem(

            WEATHER_LOCATION_STORAGE_KEY,

            JSON.stringify({

                timestamp:
                    Date.now(),

                location

            })

        );

    }
    catch(error){

        console.warn(
            "Weather location cache save failed:",
            error
        );

    }

}


/* =========================================================
   WEATHER BROWSER CACHE
========================================================= */

function createWeatherBrowserCacheKey(

    latitude,

    longitude,

    language

){

    /*
     * v4 is intentional.
     *
     * v3 may contain older weather responses without
     * precipcover and moonphase.
     */

    const lat =
        Number(latitude)
            .toFixed(3);


    const lon =
        Number(longitude)
            .toFixed(3);


    return (

        "worthIt.weather.data.v4." +
        `${lat}.${lon}.` +
        `${String(language || "en")}`

    );

}


function readWeatherBrowserCache(

    key

){

    try{

        const raw =
            localStorage.getItem(key);


        if(!raw){
            return null;
        }


        const parsed =
            JSON.parse(raw);


        if(
            !parsed ||
            !parsed.timestamp ||
            !parsed.data
        ){

            return null;

        }


        const age =
            Date.now() -
            Number(parsed.timestamp);


        if(
            !Number.isFinite(age) ||
            age < 0 ||
            age >
                WEATHER_UI_CONFIG
                    .BROWSER_CACHE_TTL_MS
        ){

            return null;

        }


        return {

            data:
                parsed.data,

            timestamp:
                parsed.timestamp

        };

    }
    catch(error){

        console.warn(
            "Weather browser cache read failed:",
            error
        );


        return null;

    }

}


function saveWeatherBrowserCache(

    key,

    data

){

    try{

        localStorage.setItem(

            key,

            JSON.stringify({

                timestamp:
                    Date.now(),

                data

            })

        );

    }
    catch(error){

        console.warn(
            "Weather browser cache save failed:",
            error
        );

    }

}


/* =========================================================
   PREFERRED WEATHER LANGUAGE
========================================================= */

function getPreferredWeatherLanguage(){

    const candidates = [];


    if(
        Array.isArray(
            navigator.languages
        )
    ){

        candidates.push(
            ...navigator.languages
        );

    }


    if(
        navigator.language
    ){

        candidates.push(
            navigator.language
        );

    }


    for(
        const localeValue
        of candidates
    ){

        const raw =
            String(
                localeValue || ""
            )
            .toLowerCase()
            .split("-")[0];


        const supported = [

            "ar",
            "bg",
            "cs",
            "da",
            "de",
            "el",
            "en",
            "es",
            "fa",
            "fi",
            "fr",
            "he",
            "hu",
            "it",
            "ja",
            "ko",
            "nl",
            "pl",
            "pt",
            "ru",
            "sk",
            "sr",
            "sv",
            "tr",
            "uk",
            "vi",
            "zh"

        ];


        if(
            supported.includes(raw)
        ){

            return raw;

        }

    }


    return "en";

}


/* =========================================================
   LOCATION DISPLAY
========================================================= */

function getLocationDisplayName(

    resolvedAddress

){

    const value =
        String(
            resolvedAddress || ""
        )
        .trim();


    if(!value){
        return "";
    }


    /*
     * Remove accidental coordinate-only responses.
     */
    if(
        isCoordinateString(value)
    ){

        return "";

    }


    /*
     * Visual Crossing commonly returns:
     *
     * City, Region, Country
     *
     * The first component is normally the most useful
     * locality label.
     */
    const parts =
        value
            .split(",")
            .map(
                part =>
                    part.trim()
            )
            .filter(Boolean);


    if(parts.length === 0){
        return value;
    }


    const firstPart =
        parts[0];


    if(
        !isCoordinateString(
            firstPart
        )
    ){

        return firstPart;

    }


    return value;

}


/* =========================================================
   COORDINATE STRING DETECTION
========================================================= */

function isCoordinateString(

    value

){

    const text =
        String(value || "")
            .trim();


    return /^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/
        .test(text);

}


/* =========================================================
   WIND HELPERS
========================================================= */

function getWindFlowDirection(

    windFromDirection

){

    const value =
        Number(
            windFromDirection
        );


    if(!Number.isFinite(value)){
        return NaN;
    }


    return (

        value +
        180 +
        360

    ) % 360;

}


function getWindFlowCompass(

    windFromDirection

){

    const direction =
        getWindFlowDirection(
            windFromDirection
        );


    if(!Number.isFinite(direction)){
        return "";
    }


    const compass = [

        "N",
        "NE",
        "E",
        "SE",
        "S",
        "SW",
        "W",
        "NW"

    ];


    const index =
        Math.round(
            direction / 45
        ) % compass.length;


    return compass[index];

}


function getWindFlowArrow(

    windFromDirection

){

    const direction =
        getWindFlowDirection(
            windFromDirection
        );


    if(!Number.isFinite(direction)){
        return "";
    }


    const arrows = [

        "↑",
        "↗",
        "→",
        "↘",
        "↓",
        "↙",
        "←",
        "↖"

    ];


    const index =
        Math.round(
            direction / 45
        ) % arrows.length;


    return arrows[index];

}


function formatWindDisplay(

    speed,

    direction

){

    const numericSpeed =
        Number(speed);


    if(
        !Number.isFinite(
            numericSpeed
        )
    ){

        return "—";

    }


    const roundedSpeed =
        Math.round(
            numericSpeed
        );


    const numericDirection =
        Number(direction);


    if(
        !Number.isFinite(
            numericDirection
        )
    ){

        return `${roundedSpeed} km/h`;

    }


    return (

        `${roundedSpeed} km/h · ` +
        `${getWindFlowArrow(numericDirection)} ` +
        `${getWindFlowCompass(numericDirection)}`

    );

}


function formatWindSpeed(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? `${Math.round(number)} km/h`

        : "—";

}


/* =========================================================
   WEATHER DESCRIPTION
========================================================= */

function getWeatherDescription(

    iconName,

    conditions = "",

    windSpeed = 0

){

    const icon =
        String(
            iconName || ""
        )
        .toLowerCase();


    const conditionText =
        String(
            conditions || ""
        )
        .trim();


    const conditionLower =
        conditionText.toLowerCase();


    const numericWindSpeed =
        Number(windSpeed);


    /*
     * VERY STRONG WIND
     */

    if(

        Number.isFinite(
            numericWindSpeed
        ) &&

        numericWindSpeed >= 75 &&

        !icon.includes(
            "thunder"
        )

    ){

        return {

            icon:
                "🌪️",

            text:
                "Very strong wind / extreme weather"

        };

    }


    /*
     * THUNDERSTORMS
     */

    if(

        icon.includes("thunder") ||
        conditionLower.includes("thunder")

    ){

        return {

            icon:
                "🌩️",

            text:
                "Thunderstorm"

        };

    }


    /*
     * SNOW
     */

    if(

        icon.includes("snow") ||
        conditionLower.includes("snow")

    ){

        return {

            icon:
                "🌨️",

            text:
                "Snow"

        };

    }


    /*
     * RAIN / SHOWERS
     */

    if(

        icon.includes("rain") ||
        icon.includes("showers") ||
        conditionLower.includes("rain") ||
        conditionLower.includes("drizzle")

    ){

        return {

            icon:
                "🌧️",

            text:
                icon.includes("showers")
                    ? "Rain showers"
                    : "Rain"

        };

    }


    /*
     * FOG
     */

    if(

        icon.includes("fog") ||
        conditionLower.includes("fog")

    ){

        return {

            icon:
                "🌫️",

            text:
                "Fog"

        };

    }


    /*
     * CLOUDY
     */

    if(

        icon === "cloudy" ||
        icon.includes("overcast") ||
        conditionLower.includes("overcast")

    ){

        return {

            icon:
                "☁️",

            text:
                "Cloudy"

        };

    }


    /*
     * PARTLY CLOUDY
     */

    if(

        icon.includes(
            "partly-cloudy"
        ) ||

        conditionLower.includes(
            "partly cloudy"
        )

    ){

        return {

            icon:
                "🌤️",

            text:
                "Partly cloudy"

        };

    }


    /*
     * CLEAR
     */

    if(

        icon.includes("clear") ||
        conditionLower === "clear"

    ){

        return {

            icon:
                "☀️",

            text:
                "Clear sky"

        };

    }


    /*
     * WIND
     */

    if(
        icon === "wind"
    ){

        return {

            icon:
                "💨",

            text:
                "Windy"

        };

    }


    /*
     * FALLBACK
     */

    return {

        icon:
            "🌤️",

        text:
            conditionText ||
            "Unknown"

    };

}


/* =========================================================
   FORECAST DAY NAME
========================================================= */

function getForecastDayName(

    dateValue,

    index

){

    if(index === 0){
        return "Today";
    }


    const rawDate =
        String(
            dateValue || ""
        )
        .slice(
            0,
            10
        );


    if(
        !/^\d{4}-\d{2}-\d{2}$/
            .test(rawDate)
    ){

        return "—";

    }


    const date =
        createLocalSafeDate(
            rawDate
        );


    if(!date){
        return "—";
    }


    try{

        return new Intl.DateTimeFormat(

            getBrowserLocale(),

            {

                weekday:
                    "short"

            }

        )
        .format(date);

    }
    catch(error){

        return date.toLocaleDateString(

            "en-US",

            {

                weekday:
                    "short"

            }

        );

    }

}


/* =========================================================
   FORECAST DATE
========================================================= */

function formatForecastDate(

    dateValue

){

    const date =
        createLocalSafeDate(
            dateValue
        );


    if(!date){
        return "—";
    }


    try{

        return new Intl.DateTimeFormat(

            getBrowserLocale(),

            {

                month:
                    "short",

                day:
                    "numeric"

            }

        )
        .format(date);

    }
    catch(error){

        return date.toLocaleDateString(

            "en-US",

            {

                month:
                    "short",

                day:
                    "numeric"

            }

        );

    }

}


/* =========================================================
   LONG DATE
========================================================= */

function formatForecastDateLong(

    dateValue

){

    const date =
        createLocalSafeDate(
            dateValue
        );


    if(!date){
        return "—";
    }


    try{

        return new Intl.DateTimeFormat(

            getBrowserLocale(),

            {

                weekday:
                    "long",

                month:
                    "long",

                day:
                    "numeric"

            }

        )
        .format(date);

    }
    catch(error){

        return date.toLocaleDateString(

            "en-US",

            {

                weekday:
                    "long",

                month:
                    "long",

                day:
                    "numeric"

            }

        );

    }

}


/* =========================================================
   BROWSER LOCALE
========================================================= */

function getBrowserLocale(){

    return (

        navigator.language ||
        "en-US"

    );

}


/* =========================================================
   SAFE LOCAL DATE
========================================================= */

function createLocalSafeDate(

    dateValue

){

    const rawDate =
        String(
            dateValue || ""
        )
        .slice(
            0,
            10
        );


    if(
        !/^\d{4}-\d{2}-\d{2}$/
            .test(rawDate)
    ){

        return null;

    }


    const parts =
        rawDate
            .split("-")
            .map(Number);


    const year =
        parts[0];

    const month =
        parts[1];

    const day =
        parts[2];


    if(

        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||

        month < 1 ||
        month > 12 ||

        day < 1 ||
        day > 31

    ){

        return null;

    }


    const date =
        new Date(

            year,

            month - 1,

            day

        );


    if(
        Number.isNaN(
            date.getTime()
        )
    ){

        return null;

    }


    return date;

}


/* =========================================================
   FORMAT HELPERS
========================================================= */

function formatCelsius(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? `${Math.round(number)}°C`

        : "—";

}


function formatPercentage(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? `${Math.round(number)}%`

        : "—";

}


function formatMillimeters(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? `${Number(number.toFixed(1))} mm`

        : "—";

}


function formatVisibility(value){

    const number =
        Number(value);


    if(!Number.isFinite(number)){
        return "—";
    }


    return `${Number(number.toFixed(1))} km`;

}


function formatPressure(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? `${Math.round(number)} hPa`

        : "—";

}


function formatSolarEnergy(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? `${Number(number.toFixed(1))} MJ/m²`

        : "—";

}


function formatPlainNumber(value){

    const number =
        Number(value);


    return Number.isFinite(number)

        ? String(
            Number(
                number.toFixed(1)
            )
        )

        : "—";

}


function formatWeatherTime(value){

    const text =
        String(
            value || ""
        )
        .trim();


    if(!text){
        return "—";
    }


    const match =
        text.match(

            /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

        );


    if(!match){
        return text;
    }


    const hours =
        Number(match[1]);


    const minutes =
        Number(match[2]);


    if(

        !Number.isInteger(hours) ||
        !Number.isInteger(minutes) ||

        hours < 0 ||
        hours > 23 ||

        minutes < 0 ||
        minutes > 59

    ){

        return text;

    }


    const period =
        hours >= 12
            ? "PM"
            : "AM";


    const displayHour =
        hours % 12 || 12;


    return (

        `${displayHour}:` +
        `${String(minutes).padStart(2, "0")} ` +
        `${period}`

    );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value){

    return String(
        value ?? ""
    )
    .replaceAll(
        "&",
        "&amp;"
    )
    .replaceAll(
        "<",
        "&lt;"
    )
    .replaceAll(
        ">",
        "&gt;"
    )
    .replaceAll(
        '"',
        "&quot;"
    )
    .replaceAll(
        "'",
        "&#039;"
    );

}


/* =========================================================
   STALE NOTICE
========================================================= */

function ensureWeatherStatusNotice(){

    let notice =
        $("weatherStatusNotice");


    if(notice){
        return notice;
    }


    const weatherSection =
        $("weatherSection");


    if(!weatherSection){
        return null;
    }


    notice =
        document.createElement(
            "div"
        );


    notice.id =
        "weatherStatusNotice";


    notice.className =
        "weather-status-notice";


    notice.style.display =
        "none";


    weatherSection.prepend(
        notice
    );


    return notice;

}


function showWeatherStaleNotice(){

    const notice =
        ensureWeatherStatusNotice();


    if(!notice){
        return;
    }


    notice.textContent =
        "Showing the latest available weather data.";


    notice.style.display =
        "block";

}


function hideWeatherStaleNotice(){

    const notice =
        $("weatherStatusNotice");


    if(notice){

        notice.style.display =
            "none";

    }

}


/* =========================================================
   WEATHER ERROR
========================================================= */

function showWeatherError(){

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

    const sunrise =
        $("weatherSunrise");

    const sunset =
        $("weatherSunset");

    const forecastContainer =
        $("weatherForecast");


    if(location){

        location.textContent =
            "Location unavailable";

    }


    const locationMeta =
        $("weatherLocationMeta");


    if(locationMeta){

        locationMeta.style.display =
            "none";

    }


    if(icon){

        icon.textContent =
            "🌤️";

    }


    if(temperature){

        temperature.textContent =
            "—";

    }


    if(description){

        description.textContent =
            "Weather unavailable.";

    }


    if(feelsLike){

        feelsLike.textContent =
            "—";

    }


    if(humidity){

        humidity.textContent =
            "—";

    }


    if(wind){

        wind.textContent =
            "—";

    }


    if(sunrise){

        sunrise.textContent =
            "—";

    }


    if(sunset){

        sunset.textContent =
            "—";

    }


    if(forecastContainer){

        forecastContainer.innerHTML =
            `

                <div class="weather-error-state">

                    Unable to load the weather forecast.
                    Please check location permission
                    and try again.

                </div>

            `;

    }


    hideWeatherDetails();

}


/* =========================================================
   DYNAMIC WEATHER UI STYLES
========================================================= */

function ensureWeatherUIStyles(){

    if(
        document.getElementById(
            "worthItWeatherUIStyles"
        )
    ){

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "worthItWeatherUIStyles";


    style.textContent = `

        /*
         * -----------------------------------------------
         * LOCATION META
         * -----------------------------------------------
         */

        .weather-location-meta {

            margin-top:
                10px;

            display:
                block;

        }


        .weather-location-coordinates {

            margin-bottom:
                9px;

            font-size:
                0.88rem;

            opacity:
                0.72;

            line-height:
                1.4;

        }


        .weather-location-card {

            display:
                inline-flex;

            flex-direction:
                column;

            gap:
                3px;

            padding:
                10px 13px;

            border:
                1px solid
                rgba(
                    105,
                    105,
                    200,
                    0.18
                );

            border-radius:
                12px;

            background:
                rgba(
                    255,
                    255,
                    255,
                    0.025
                );

        }


        .weather-location-card-label {

            font-size:
                0.78rem;

            opacity:
                0.66;

        }


        .weather-location-card-city {

            font-weight:
                700;

        }


        /*
         * -----------------------------------------------
         * FORECAST GRID
         * -----------------------------------------------
         */

        #weatherForecast {

            display:
                grid;

            grid-template-columns:
                repeat(
                    auto-fit,
                    minmax(
                        150px,
                        1fr
                    )
                );

            gap:
                14px;

        }


        /*
         * -----------------------------------------------
         * FORECAST CARD
         * -----------------------------------------------
         */

        #weatherForecast
        .weather-forecast-card {

            position:
                relative;

            cursor:
                pointer;

            transform:
                translateY(0)
                scale(1);

            transition:
                transform 0.22s ease,
                box-shadow 0.22s ease,
                border-color 0.22s ease,
                outline-color 0.22s ease;

        }


        /*
         * -----------------------------------------------
         * HOVER
         * -----------------------------------------------
         */

        #weatherForecast
        .weather-forecast-card:hover {

            transform:
                translateY(-4px)
                scale(1.035);

            border-color:
                rgba(
                    110,
                    95,
                    220,
                    0.95
                ) !important;

            outline:
                2px solid
                rgba(
                    94,
                    111,
                    220,
                    0.72
                );

            outline-offset:
                2px;

            box-shadow:
                0 12px 30px
                rgba(
                    80,
                    80,
                    170,
                    0.18
                );

            z-index:
                2;

        }


        /*
         * -----------------------------------------------
         * FOCUS
         * -----------------------------------------------
         */

        #weatherForecast
        .weather-forecast-card:focus-visible {

            outline:
                2px solid
                rgba(
                    105,
                    100,
                    220,
                    0.9
                );

            outline-offset:
                3px;

        }


        /*
         * -----------------------------------------------
         * SELECTED CARD
         * -----------------------------------------------
         */

        #weatherForecast
        .weather-forecast-card.is-selected {

            border-color:
                rgba(
                    100,
                    100,
                    220,
                    0.95
                ) !important;

            box-shadow:
                0 10px 28px
                rgba(
                    85,
                    80,
                    180,
                    0.16
                );

        }


        /*
         * -----------------------------------------------
         * DATE
         * -----------------------------------------------
         */

        #weatherForecast
        .weather-forecast-date {

            margin-top:
                3px;

            opacity:
                0.68;

            font-size:
                0.82em;

        }


        /*
         * -----------------------------------------------
         * DETAILS PANEL
         * -----------------------------------------------
         */

        #weatherDayDetails {

            margin-top:
                22px;

            padding:
                22px;

            border:
                1px solid
                rgba(
                    104,
                    103,
                    220,
                    0.30
                );

            border-radius:
                18px;

            background:
                rgba(
                    255,
                    255,
                    255,
                    0.035
                );

            box-shadow:
                0 12px 35px
                rgba(
                    70,
                    70,
                    150,
                    0.10
                );

        }


        /*
         * -----------------------------------------------
         * DETAILS HEADER
         * -----------------------------------------------
         */

        .weather-details-header {

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            gap:
                20px;

            margin-bottom:
                10px;

        }


        .weather-details-kicker {

            font-size:
                0.82rem;

            opacity:
                0.68;

            margin-bottom:
                3px;

        }


        .weather-details-title {

            margin:
                0;

        }


        .weather-details-header-weather {

            display:
                flex;

            align-items:
                center;

            gap:
                10px;

            white-space:
                nowrap;

        }


        .weather-details-header-icon {

            font-size:
                2rem;

        }


        .weather-details-header-temp {

            font-size:
                1.5rem;

            font-weight:
                700;

        }


                /*
         * -----------------------------------------------
         * DETAILS DESCRIPTION
         * -----------------------------------------------
         */

        .weather-details-description {

            margin-bottom:
                18px;

            line-height:
                1.5;

            opacity:
                0.90;

        }


        /*
         * -----------------------------------------------
         * DETAILS GRID
         *
         * 3 columns on desktop.
         *
         * There are currently 18 detail cards,
         * so 3 columns create 6 complete rows.
         *
         * This fills the entire large weather card
         * without unnecessary empty space.
         * -----------------------------------------------
         */

        .weather-details-grid {

            display:
                grid;

            grid-template-columns:
                repeat(
                    3,
                    minmax(
                        0,
                        1fr
                    )
                );

            gap:
                10px;

        }

        .weather-detail-item {

            padding:
                12px 13px;

            border:
                1px solid
                rgba(
                    120,
                    120,
                    180,
                    0.15
                );

            border-radius:
                12px;

            background:
                rgba(
                    255,
                    255,
                    255,
                    0.025
                );

            min-width:
                0;

        }


        .weather-detail-label {

            font-size:
                0.80rem;

            opacity:
                0.64;

            margin-bottom:
                4px;

        }


        .weather-detail-value {

            font-weight:
                600;

            overflow-wrap:
                anywhere;

        }
        

        /*
         * -----------------------------------------------
         * ERROR
         * -----------------------------------------------
         */

        .weather-error-state {

            grid-column:
                1 / -1;

            padding:
                18px;

            text-align:
                center;

            opacity:
                0.78;

        }


        /*
         * -----------------------------------------------
         * STATUS NOTICE
         * -----------------------------------------------
         */

        .weather-status-notice {

            margin-bottom:
                10px;

            font-size:
                0.82rem;

            opacity:
                0.65;

        }


        /*
         * -----------------------------------------------
         * SMALL SCREENS
         * -----------------------------------------------
         */

        @media(
            max-width: 700px
        ){

            #weatherForecast {

                grid-template-columns:
                    repeat(
                        2,
                        minmax(
                            0,
                            1fr
                        )
                    );

            }


            .weather-details-grid {

                grid-template-columns:
                    repeat(
                        2,
                        minmax(
                            0,
                            1fr
                        )
                    );

            }

            .weather-details-header {

                align-items:
                    flex-start;

                flex-direction:
                    column;

            }

        }


        @media(
            max-width: 420px
        ){

            #weatherForecast {

                grid-template-columns:
                    1fr;

            }


            .weather-details-grid {

                grid-template-columns:
                    1fr;

            }


            .weather-location-card {

                width:
                    100%;

                box-sizing:
                    border-box;

            }

        }

    `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.openWeather =
    openWeather;


window.loadWeather =
    loadWeather;
