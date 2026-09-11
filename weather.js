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
                `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover` +
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

            const windSpeed =
                Math.round(
                    current.wind_speed_10m
                );

            const windDirection =
                Number(
                    current.wind_direction_10m
                );

            wind.textContent =
                Number.isFinite(windDirection)
                    ? `${windSpeed} km/h · ${getWindFlowArrow(windDirection)} ${getWindFlowCompass(windDirection)}`
                    : `${windSpeed} km/h`;

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
   WIND FLOW HELPERS

   Open-Meteo reports the direction the wind comes FROM.
   The visual arrow and cloud movement show where it flows TO.
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
   GLOBAL EXPORTS
========================================================= */

window.openWeather =
    openWeather;

window.loadWeather =
    loadWeather;
