function openWeather(){

$("homePage").style.display = "none";

document.querySelectorAll(".app")
    .forEach(x => x.classList.remove("active"));

$("newsSection").style.display = "none";

const settingsPage = $("settingsPage");

if(settingsPage){
    settingsPage.style.display = "none";
}

$("weatherSection").style.display = "block";

$("navLinks").classList.remove("open");

document.documentElement.style.overflowY = "auto";
document.body.style.overflowY = "auto";

window.scrollTo({
    top: 0,
    behavior: "smooth"
});

loadWeather();

}

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

    if(!location) return;

    location.textContent =
        "Detecting location...";

    try{

        navigator.geolocation.getCurrentPosition(

            async position => {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                const response =
                    await fetch(
                        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=7&timezone=auto`
                    );

                const data =
                    await response.json();

                const current =
                    data.current;

                const daily =
                    data.daily;

                if(sunrise && daily.sunrise){
                    sunrise.textContent =
                        new Date(daily.sunrise[0]).toLocaleTimeString(
                            "en-US",
                            {
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        );
                }

                if(sunset && daily.sunset){
                    sunset.textContent =
                        new Date(daily.sunset[0]).toLocaleTimeString(
                            "en-US",
                            {
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        );
                }
                
                temperature.textContent =
                    `${Math.round(current.temperature_2m)}°C`;

                feelsLike.textContent =
                    `${Math.round(current.apparent_temperature)}°C`;

                humidity.textContent =
                    `${current.relative_humidity_2m}%`;

                wind.textContent =
                    `${Math.round(current.wind_speed_10m)} km/h`;

                const weather =
                    getWeatherDescription(
                        current.weather_code
                    );

                icon.textContent =
                    weather.icon;

                description.textContent =
                    weather.text;


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
                                    weekday:"short"
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

                const locationResponse =
                    await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`
                    );

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

            },

            error => {

                console.error(
                    "Location error:",
                    error
                );

                location.textContent =
                    "Location unavailable";

                description.textContent =
                    "Please allow location access.";

            }

        );

    }catch(error){

        console.error(
            "Weather error:",
            error
        );

        description.textContent =
            "Weather unavailable.";

    }
}

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
