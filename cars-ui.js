const carsData = [
    { make: "BMW", model: "3 Series" },
    { make: "BMW", model: "X5" },
    { make: "BMW", model: "5 Series" },

    { make: "Mercedes-Benz", model: "GLC" },
    { make: "Mercedes-Benz", model: "E-Class" },

    { make: "Audi", model: "A4" },
    { make: "Audi", model: "Q5" },
    { make: "Audi", model: "Q7" },

    { make: "Volkswagen", model: "Golf" },
    { make: "Volkswagen", model: "Tiguan" },

    { make: "Toyota", model: "Corolla" },
    { make: "Toyota", model: "RAV4" },
    { make: "Toyota", model: "Camry" },

    { make: "Tesla", model: "Model 3" },
    { make: "Tesla", model: "Model Y" },

    { make: "Ford", model: "F-150" },
    { make: "Ford", model: "Mustang" },

    { make: "Hyundai", model: "Tucson" },
    { make: "Hyundai", model: "Ioniq 5" },

    { make: "Kia", model: "Sportage" },

    { make: "Porsche", model: "911" }
];

const popularCars = [
    { make: "BMW", model: "3 Series" },
    { make: "BMW", model: "X5" },

    { make: "Volkswagen", model: "Golf" },
    { make: "Mercedes-Benz", model: "E-Class" },

    { make: "Audi", model: "Q5" },
    { make: "Audi", model: "Q7" },

    { make: "Toyota", model: "RAV4" },
    { make: "Toyota", model: "Camry" },

    { make: "Tesla", model: "Model 3" },
    { make: "Tesla", model: "Model Y" },

    { make: "Hyundai", model: "Tucson" },
    { make: "Porsche", model: "911" }
];

const carPowertrainMap = {
    "BMW 3 Series": ["Petrol"],
    "BMW X5": ["Petrol", "Hybrid"],
    "BMW 5 Series": ["Petrol", "Hybrid"],

    "Mercedes-Benz GLC": ["Petrol", "Hybrid"],
    "Mercedes-Benz E-Class": ["Petrol", "Hybrid"],

    "Audi A4": ["Petrol", "Diesel", "Hybrid"],
    "Audi Q5": ["Petrol", "Diesel", "Hybrid"],
    "Audi Q7": ["Petrol", "Diesel", "Hybrid"],

    "Volkswagen Golf": ["Petrol", "Diesel"],
    "Volkswagen Tiguan": ["Petrol", "Diesel", "Hybrid"],

    "Toyota Corolla": ["Petrol", "Hybrid"],
    "Toyota RAV4": ["Petrol", "Hybrid"],
    "Toyota Camry": ["Petrol", "Hybrid"],

    "Tesla Model 3": ["Electric"],
    "Tesla Model Y": ["Electric"],

    "Ford F-150": ["Petrol", "Hybrid"],
    "Ford Mustang": ["Petrol"],

    "Hyundai Tucson": ["Petrol", "Diesel", "Hybrid"],
    "Hyundai Ioniq 5": ["Electric"],

    "Kia Sportage": ["Petrol", "Diesel", "Hybrid"],

    "Porsche 911": ["Petrol"]
};

  function getCachedCarData(car, year) {

    if (year === 2024 && car.loadedData) {
        return car.loadedData;
    }

    if (year === 2023 && car.usedData) {
        return car.usedData;
    }

    return null;
}

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

async function loadUsedCars() {

    const usedCars = [];

    for (const car of carsData) {

        const data =
            await fetchCarData(car, 2023);

        if (!data || !data.bestMatch) {
            continue;
        }

        const normalizedCar =
            normalizeCarData(data, car);

        if (!normalizedCar) {
            continue;
        }

        normalizedCar.year = 2023;

        car.usedData = normalizedCar;

        usedCars.push(car);
    }

    return usedCars;
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

        return data.images[0].link;

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

    const engineType =
        data.bestMatch?.features?.standard
            ?.find(feature =>
                feature.category === "Engine"
            )
            ?.features
            ?.find(feature =>
                feature.name === "Base engine type"
            )
            ?.value;

    const fuelType =
        data.bestMatch?.features?.standard
            ?.find(feature =>
                feature.category === "Fuel"
            )
            ?.features
            ?.find(feature =>
                feature.name === "Fuel type"
            )
            ?.value;

    const normalizedEngineType =
        String(engineType || "").toLowerCase();

    const normalizedFuelType =
        String(fuelType || "").toLowerCase();

    let powertrain = "Petrol";

    if (vehicle.is_electric === true) {
        powertrain = "Electric";
    } else if (vehicle.is_plugin_electric === true) {
        powertrain = "Hybrid";
    } else if (
        normalizedEngineType.includes("hybrid") ||
        normalizedFuelType.includes("hybrid")
    ) {
        powertrain = "Hybrid";
    } else if (
        normalizedEngineType.includes("diesel") ||
        normalizedFuelType.includes("diesel")
    ) {
        powertrain = "Diesel";
    } else if (
        normalizedEngineType.includes("electric") ||
        normalizedFuelType.includes("electric")
    ) {
        powertrain = "Electric";
    } else if (
        normalizedEngineType.includes("gasoline") ||
        normalizedEngineType.includes("petrol") ||
        normalizedFuelType.includes("gasoline") ||
        normalizedFuelType.includes("petrol") ||
        normalizedFuelType.includes("unleaded")
    ) {
        powertrain = "Petrol";
    }

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
            fuelType ||
            null,

        powertrain,

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

    if (!cars.length) {
    grid.innerHTML = `
        <div class="cars-empty-state">
            <div class="cars-empty-icon">🚗</div>
            <strong>No cars available</strong>
            <p>
                There are currently no vehicles available
                for this category.
            </p>
        </div>
    `;

    return;
}
    
    const carCards = [];

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

        carCards.push({
            car,
            card
        });
    }

    await Promise.all(
        carCards.map(async ({ car, card }) => {

           let normalizedCar =
    getCachedCarData(car, 2024);

if (!normalizedCar) {

    const data =
        await fetchCarData(car);

    if (!data || !data.bestMatch) {

        card.querySelector("span").textContent =
            "Vehicle data unavailable";

        return;
    }

    normalizedCar =
        normalizeCarData(data, car);

    if (!normalizedCar) {

        card.querySelector("span").textContent =
            "Vehicle data unavailable";

        return;
    }

        car.loadedData = normalizedCar;
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
        })
    );
}

function updateCarsCategoryHeader(category) {

    const title =
        document.getElementById("carsResultsTitle");

    const description =
        document.getElementById("carsResultsDescription");

    if (!title || !description) return;

    const categoryInfo = {

        popular: {
            title: "⭐ Popular Cars",
            description:
                "Discover some of the most popular cars."
        },

        new: {
            title: "🆕 New Cars",
            description:
                "Explore the latest car models."
        },

        used: {
            title: "🔄 Used Cars",
            description:
                "Explore used and pre-owned cars."
        },

        electric: {
            title: "⚡ Electric Cars",
            description:
                "Discover electric and EV models."
        },

        hybrid: {
            title: "🔋 Hybrid Cars",
            description:
                "Explore hybrid and plug-in hybrid models."
        },

        petrol: {
            title: "⛽ Petrol Cars",
            description:
                "Explore cars powered by petrol engines."
        },

        diesel: {
            title: "🛢️ Diesel Cars",
            description:
                "Explore cars powered by diesel engines."
        }
    };

    const info =
        categoryInfo[category] ||
        categoryInfo.popular;

    title.textContent = info.title;
    description.textContent = info.description;
}

async function filterCarsByCategory(category) {

    updateCarsCategoryHeader(category);

    let filteredCars = [];

    switch (category) {

        case "popular":
           filteredCars = popularCars;
           break;
            
        case "electric":
    filteredCars = carsData.filter(car =>
        (carPowertrainMap[`${car.make} ${car.model}`] || [])
            .includes("Electric")
    );
    break;

case "hybrid":
    filteredCars = carsData.filter(car =>
        (carPowertrainMap[`${car.make} ${car.model}`] || [])
            .includes("Hybrid")
    );
    break;

case "petrol":
    filteredCars = carsData.filter(car =>
        (carPowertrainMap[`${car.make} ${car.model}`] || [])
            .includes("Petrol")
    );
    break;

case "diesel":
    filteredCars = carsData.filter(car =>
        (carPowertrainMap[`${car.make} ${car.model}`] || [])
            .includes("Diesel")
    );
    break;
        case "new": {
    const availableYears = carsData
        .map(car => car.loadedData?.year)
        .filter(Boolean);

    const latestYear = availableYears.length
        ? Math.max(...availableYears)
        : null;

    filteredCars = latestYear
        ? carsData.filter(car =>
            car.loadedData &&
            car.loadedData.year === latestYear
        )
        : carsData;

    break;
}

        case "used":
    filteredCars = [];
    break;

        default:
            filteredCars = carsData;
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

    updateCarsCategoryHeader("popular");
    renderPopularCars(popularCars);

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
                    `${car.make} ${car.model}`
                    .toLowerCase();

                return searchText.includes(query);
            });

        renderPopularCars(filteredCars);

    });

});
