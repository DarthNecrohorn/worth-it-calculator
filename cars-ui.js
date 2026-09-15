const carsData = [
    {
        make: "BMW",
        model: "3 Series",
        type: "Sedan",
        powertrain: "Petrol",
        icon: "🚘"
    },
    {
        make: "Tesla",
        model: "Model 3",
        type: "Sedan",
        powertrain: "Electric",
        icon: "⚡"
    },
    {
        make: "Volkswagen",
        model: "Golf",
        type: "Hatchback",
        powertrain: "Petrol",
        icon: "🚗"
    },
    {
        make: "Toyota",
        model: "RAV4",
        type: "SUV",
        powertrain: "Hybrid",
        icon: "🚙"
    },
    {
        make: "Mercedes-Benz",
        model: "C-Class",
        type: "Sedan",
        powertrain: "Petrol",
        icon: "🚘"
    },
    {
        make: "Audi",
        model: "A4",
        type: "Sedan",
        powertrain: "Petrol",
        icon: "🚘"
    },
    {
        make: "Toyota",
        model: "Corolla",
        type: "Sedan",
        powertrain: "Hybrid",
        icon: "🚗"
    },
    {
        make: "Ford",
        model: "F-150",
        type: "Pickup",
        powertrain: "Petrol",
        icon: "🛻"
    }
];


function renderPopularCars(cars = carsData) {

    const grid =
        document.getElementById("popularCarsGrid");

    if (!grid) return;

    grid.innerHTML = "";

    cars.forEach(car => {

        const card =
            document.createElement("button");

        card.type = "button";
        card.className = "car-card";

        card.innerHTML = `
            <div class="car-card-icon">${car.icon}</div>
            <strong>${car.make} ${car.model}</strong>
            <span>${car.powertrain} · ${car.type}</span>
        `;

        grid.appendChild(card);
    });
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


document.addEventListener("DOMContentLoaded", function () {

    renderPopularCars();

});
