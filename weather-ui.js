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

   External weather data path:

   Browser Geolocation
          ↓
   /api/weather
          ↓
   Visual Crossing (server-side)

   No direct client-side weather API call is made here.
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


    if(forecastContainer){

        forecastContainer.innerHTML = "";

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
            Number(userLocation.latitude);

        const longitude =
            Number(userLocation.longitude);


        if(
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ){

            throw new Error(
                "Invalid location coordinates."
            );

        }


        /* =================================================
           WORTH IT WEATHER API
        ================================================= */

        const response =
            await fetch(
                `/api/weather` +
                `?latitude=${encodeURIComponent(latitude)}` +
                `&longitude=${encodeURIComponent(longitude)}`,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    },
                    cache: "no-store"
                }
            );


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

                /* Ignore malformed error bodies. */

            }


            throw new Error(
                `Weather API HTTP ${response.status}${serverMessage}`
            );

        }


        const data =
            await response.json();


        const current =
            data &&
            data.currentConditions;

        const forecast =
            data &&
            Array.isArray(data.days)
                ? data.days.slice(0, 7)
                : [];


        if(!current){

            throw new Error(
                "Current weather data is unavailable."
            );

        }


        /* =================================================
           LOCATION NAME

           Visual Crossing resolves the coordinates server-side,
           so no separate reverse-geocoding service is required.
        ================================================= */

        if(location){

            location.textContent =
                getLocationDisplayName(
                    data.resolvedAddress
                ) ||
                `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

        }


        /* =================================================
           SUNRISE / SUNSET
        ================================================= */

        const today =
            forecast[0] || null;


        if(sunrise){

            sunrise.textContent =
                formatWeatherTime(
                    today && today.sunrise
                );

        }


        if(sunset){

            sunset.textContent =
                formatWeatherTime(
                    today && today.sunset
                );

        }


        /* =================================================
           CURRENT TEMPERATURE
        ================================================= */

        if(temperature){

            temperature.textContent =
                formatCelsius(
                    current.temp
                );

        }


        /* =================================================
           FEELS LIKE
        ================================================= */

        if(feelsLike){

            feelsLike.textContent =
                formatCelsius(
                    current.feelslike
                );

        }


        /* =================================================
           HUMIDITY
        ================================================= */

        if(humidity){

            humidity.textContent =
                formatPercentage(
                    current.humidity
                );

        }


        /* =================================================
           WIND
        ================================================= */

        if(wind){

            const windSpeed =
                Number(current.windspeed);

            const windDirection =
                Number(current.winddir);


            if(Number.isFinite(windSpeed)){

                const roundedWindSpeed =
                    Math.round(windSpeed);


                wind.textContent =
                    Number.isFinite(windDirection)
                        ? `${roundedWindSpeed} km/h · ${getWindFlowArrow(windDirection)} ${getWindFlowCompass(windDirection)}`
                        : `${roundedWindSpeed} km/h`;

            }
            else{

                wind.textContent =
                    "—";

            }

        }


        /* =================================================
           CURRENT WEATHER DESCRIPTION
        ================================================= */

        const weather =
            getWeatherDescription(
                current.icon,
                current.conditions,
                current.windspeed
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


            forecast.forEach(
                (forecastDay, index) => {

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


                    const card =
                        document.createElement("div");


                    card.className =
                        "weather-forecast-card";


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

                        <div class="weather-forecast-icon">
                            ${forecastWeather.icon}
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


                    forecastContainer.appendChild(
                        card
                    );

                }
            );

        }

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


        if(icon){

            icon.textContent =
                "🌤️";

        }


        if(temperature){

            temperature.textContent =
                "—";

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

            forecastContainer.innerHTML = "";

        }


        if(description){

            description.textContent =
                "Weather unavailable.";

        }

    }

}


/* =========================================================
   GET BROWSER LOCATION

   Browser Geolocation is the only location source used
   by the client. No IP-location or reverse-geocoding API
   is called from the frontend.
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
   WEATHER LOCATION

   Only browser geolocation is used.

   There is intentionally NO IP-location fallback here.
========================================================= */

async function getWeatherLocation(){

    return await getBrowserLocation();

}


/* =========================================================
   WIND FLOW HELPERS

   The API reports the direction the wind comes FROM.
   The visual arrow and compass direction show where the
   wind flows TO, preserving the behavior of the old UI.
========================================================= */

function getWindFlowDirection(
    windFromDirection
){

    return (
        Number(windFromDirection) +
        180 +
        360
    ) % 360;

}


function getWindFlowCompass(
    windFromDirection
){

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
            getWindFlowDirection(
                windFromDirection
            ) / 45
        ) % compass.length;

    return compass[index];

}


function getWindFlowArrow(
    windFromDirection
){

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
            getWindFlowDirection(
                windFromDirection
            ) / 45
        ) % arrows.length;

    return arrows[index];

}


/* =========================================================
   WEATHER DESCRIPTION

   Visual Crossing returns textual icon identifiers rather
   than numeric provider-specific weather codes.
========================================================= */

function getWeatherDescription(
    iconName,
    conditions = "",
    windSpeed = 0
){

    const icon =
        String(iconName || "").toLowerCase();


    const conditionText =
        String(conditions || "").trim();


    const numericWindSpeed =
        Number(windSpeed);


    /* =================================================
       VERY STRONG WIND
    ================================================= */

    if(
        Number.isFinite(numericWindSpeed) &&
        numericWindSpeed >= 75 &&
        !icon.includes("thunder")
    ){

        return {

            icon:
                "🌪️",

            text:
                "Very strong wind / extreme weather"

        };

    }


    /* =================================================
       THUNDERSTORMS
    ================================================= */

    if(
        icon.includes("thunder") ||
        conditionText.toLowerCase().includes("thunder")
    ){

        return {

            icon:
                "🌩️",

            text:
                "Thunderstorm"

        };

    }


    /* =================================================
       SNOW
    ================================================= */

    if(
        icon.includes("snow") ||
        conditionText.toLowerCase().includes("snow")
    ){

        return {

            icon:
                "🌨️",

            text:
                "Snow"

        };

    }


    /* =================================================
       RAIN / SHOWERS
    ================================================= */

    if(
        icon.includes("rain") ||
        icon.includes("showers") ||
        conditionText.toLowerCase().includes("rain") ||
        conditionText.toLowerCase().includes("drizzle")
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


    /* =================================================
       FOG
    ================================================= */

    if(
        icon.includes("fog") ||
        conditionText.toLowerCase().includes("fog")
    ){

        return {

            icon:
                "🌫️",

            text:
                "Fog"

        };

    }


    /* =================================================
       CLOUDY
    ================================================= */

    if(
        icon === "cloudy" ||
        icon.includes("overcast") ||
        conditionText.toLowerCase().includes("overcast")
    ){

        return {

            icon:
                "☁️",

            text:
                "Cloudy"

        };

    }


    /* =================================================
       PARTLY CLOUDY
    ================================================= */

    if(
        icon.includes("partly-cloudy") ||
        conditionText.toLowerCase().includes("partly cloudy")
    ){

        return {

            icon:
                "🌤️",

            text:
                "Partly cloudy"

        };

    }


    /* =================================================
       CLEAR
    ================================================= */

    if(
        icon.includes("clear") ||
        conditionText.toLowerCase() === "clear"
    ){

        return {

            icon:
                "☀️",

            text:
                "Clear sky"

        };

    }


    /* =================================================
       WIND
    ================================================= */

    if(icon === "wind"){

        return {

            icon:
                "💨",

            text:
                "Windy"

        };

    }


    /* =================================================
       FALLBACK
    ================================================= */

    return {

        icon:
            "🌤️",

        text:
            conditionText || "Unknown"

    };

}


/* =========================================================
   LOCATION DISPLAY
========================================================= */

function getLocationDisplayName(
    resolvedAddress
){

    const value =
        String(resolvedAddress || "").trim();


    if(!value){
        return "";
    }


    return value;

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
        String(dateValue || "").slice(0, 10);


    if(!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)){
        return "—";
    }


    const parts =
        rawDate.split("-").map(Number);


    const date =
        new Date(
            parts[0],
            parts[1] - 1,
            parts[2]
        );


    if(Number.isNaN(date.getTime())){
        return "—";
    }


    return date.toLocaleDateString(
        "en-US",
        {
            weekday: "short"
        }
    );

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


function formatWeatherTime(value){

    const text =
        String(value || "").trim();


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
        hours >= 12 ? "PM" : "AM";


    const displayHour =
        hours % 12 || 12;


    return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;

}


/* =========================================================
   HTML ESCAPE HELPER

   Keeps API text safe when inserted into forecast cards.
========================================================= */

function escapeHtml(value){

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.openWeather =
    openWeather;

window.loadWeather =
    loadWeather;
