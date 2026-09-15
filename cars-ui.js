const carsData = [
    {
        make: "BMW",
        model: "3 Series"
    },
    {
        make: "BMW",
        model: "X5"
    },
    {
        make: "Mercedes-Benz",
        model: "C-Class"
    },
    {
        make: "Mercedes-Benz",
        model: "GLC"
    },
    {
        make: "Audi",
        model: "A4"
    },
    {
        make: "Audi",
        model: "Q5"
    },
    {
        make: "Volkswagen",
        model: "Golf"
    },
    {
        make: "Volkswagen",
        model: "Tiguan"
    },
    {
        make: "Toyota",
        model: "Corolla"
    },
    {
        make: "Toyota",
        model: "RAV4"
    },
    {
        make: "Toyota",
        model: "Camry"
    },
    {
        make: "Tesla",
        model: "Model 3"
    },
    {
        make: "Tesla",
        model: "Model Y"
    },
    {
        make: "Ford",
        model: "F-150"
    },
    {
        make: "Ford",
        model: "Mustang"
    },
    {
        make: "Hyundai",
        model: "Tucson"
    },
    {
        make: "Hyundai",
        model: "Ioniq 5"
    },
    {
        make: "Kia",
        model: "Sportage"
    },
    {
        make: "Porsche",
        model: "911"
    },
    {
        make: "Skoda",
        model: "Octavia"
    }
];

async function fetchCarData(car, year = 2024) {

    try {

        const params = new URLSearchParams({
            action: "vehicle",
            year: year,
            make: car.make,
            model: car.model
        });

        const response = await fetch(
            `/api/cars?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error(
                `Failed to load ${car.make} ${car.model}`
            );
        }

        const data = await response.json();

        if (!data.success || !data.bestMatch) {
            throw new Error(
                `No vehicle data found for ${car.make} ${car.model}`
            );
        }

        return data;

    } catch (error) {

        console.error(
            `Cars API error for ${car.make} ${car.model}:`,
            error
        );

        return null;
    }
}

async function fetchCarImage(car, year = 2024) {

    try {

        const params = new URLSearchParams({
            action: "images",
            year: year,
            make: car.make,
            model: car.model
        });

        const response = await fetch(
            `/api/cars?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error(
                `Failed to load image for ${car.make} ${car.model}`
            );
        }

        const data = await response.json();

        if (
            !data.success ||
            !data.images ||
            !data.images.length
        ) {
            return null;
        }

        return data.images[0];

    } catch (error) {

        console.error(
            `Cars image API error for ${car.make} ${car.model}:`,
            error
        );

        return null;
    }
}

function normalizeCarData(data, fallbackCar) {

    if (!data || !data.bestMatch) {
        return null;
    }

    const vehicle = data.bestMatch;

    return {
        make: vehicle.make || fallbackCar.make,
        model: vehicle.model || fallbackCar.model,
        name: vehicle.name || "",
        year: vehicle.year || 2024,

        price:
            vehicle.base_msrp ??
            null,

        horsepower:
            vehicle.horsepower ??
            null,

        drivetrain:
            vehicle.drivetrain ||
            vehicle.drive_train ||
            null,

        fuel:
            vehicle.fuel_type ||
            vehicle.fuel ||
            null,

        engine:
            vehicle.engine ||
            null,

        transmission:
            vehicle.transmission ||
            null,

        mpg:
            vehicle.mpg_combined ??
            null,

        electric:
            vehicle.is_electric === true,

        plugInHybrid:
            vehicle.is_plugin_electric === true
    };
}

async function renderPopularCars(cars = carsData) {

    const grid =
        document.getElementById("popularCarsGrid");

    if (!grid) return;

    grid.innerHTML = "";

    for (const car of cars) {

        const card =
            document.createElement("button");

        card.type = "button";
        card.className = "car-card";

        card.innerHTML = `
            <div class="car-card-icon">🚗</div>
            <strong>${car.make} ${car.model}</strong>
            <span>Loading vehicle data...</span>
        `;

        grid.appendChild(card);

        const data =
            await fetchCarData(car);

        if (!data || !data.bestMatch) {

            card.querySelector("span").textContent =
                "Vehicle data unavailable";

            continue;
        }

        const normalizedCar =
            normalizeCarData(data, car);

        if (!normalizedCar) {

            card.querySelector("span").textContent =
                "Vehicle data unavailable";

            continue;
        }

        const image =
            await fetchCarImage(
                car,
                normalizedCar.year
            );

        card.innerHTML = `
            ${
                image
                    ? `
                        <img
                            class="car-card-image"
                            src="${image}"
                            alt="${normalizedCar.make} ${normalizedCar.model}"
                            loading="lazy"
                        >
                    `
                    : `
                        <div class="car-card-icon">🚗</div>
                    `
            }

            <strong>
                ${normalizedCar.make}
                ${normalizedCar.model}
            </strong>

            <span>
                ${normalizedCar.year}
                ${normalizedCar.horsepower
                    ? ` • ${normalizedCar.horsepower} hp`
                    : ""}
                ${normalizedCar.fuel
                    ? ` • ${normalizedCar.fuel}`
                    : ""}
            </span>
        `;
    }
}

function filterCarsByCategory(category) {

    let filteredCars = [];

    switch (category) {

        case "new":
            filteredCars = carsData.filter(car =>
                car.condition === "New"
            );
            break;

        case "used":
            filteredCars = carsData.filter(car =>
                car.condition === "Used"
            );
            break;

        case "electric":
            filteredCars = carsData.filter(car =>
                car.powertrain === "Electric"
            );
            break;

        case "hybrid":
            filteredCars = carsData.filter(car =>
                car.powertrain === "Hybrid"
            );
            break;

        case "petrol":
            filteredCars = carsData.filter(car =>
                car.powertrain === "Petrol"
            );
            break;

        case "diesel":
            filteredCars = carsData.filter(car =>
                car.powertrain === "Diesel"
            );
            break;
    }

    renderPopularCars(filteredCars);
}

function openCars() {

    const homePage =
        document.getElementById("homePage");

    if (homePage) {
        homePage.style.display = "none";
    }

    document.querySelectorAll(".app").forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });

    const weatherSection =
        document.getElementById("weatherSection");

    if (weatherSection) {
        weatherSection.style.display = "none";
    }

    const newsSection =
        document.getElementById("newsSection");

    if (newsSection) {
        newsSection.style.display = "none";
    }

    const discountsSection =
        document.getElementById("discountsSection");

    if (discountsSection) {
        discountsSection.style.display = "none";
    }

    const settingsPanel =
        document.getElementById("settingsPanel");

    if (settingsPanel) {
        settingsPanel.style.display = "none";
    }

    const marketsSection =
        document.getElementById("marketsSection");

    if (marketsSection) {
        marketsSection.style.display = "none";
    }

    const moneySection =
        document.getElementById("moneySection");

    if (moneySection) {
        moneySection.style.display = "none";
    }

    const carsSection =
        document.getElementById("carsSection");

    if (carsSection) {
        carsSection.style.display = "block";
    }

    renderPopularCars();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


window.openCars = openCars;

window.filterCarsByCategory = filterCarsByCategory;

document.addEventListener("DOMContentLoaded", function () {

    const searchInput =
        document.getElementById("carsSearchInput");

    if (!searchInput) return;

    searchInput.addEventListener("input", function () {

        const query =
            this.value.trim().toLowerCase();

        const filteredCars =
            carsData.filter(car => {

                const searchText =
                    `${car.make} ${car.model} ${car.type} ${car.powertrain}`
                    .toLowerCase();

                return searchText.includes(query);
        });

    });

});
