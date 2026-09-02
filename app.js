/* =========================================================
CALCULATOR NAVIGATION
========================================================= */

function openCalculator(type){

const homePage = document.getElementById("homePage");
const weatherSection = document.getElementById("weatherSection");
const newsSection = document.getElementById("newsSection");
const settingsPage = document.getElementById("settingsPage");
const calculatorApp = document.getElementById("calculatorApp");
const carsApp = document.getElementById("carsApp");
const genericApp = document.getElementById("genericApp");
const carResults = document.getElementById("carResults");
const navLinks = document.getElementById("navLinks");

if(homePage){
    homePage.style.display = "none";
}

if(weatherSection){
    weatherSection.style.display = "none";
}

if(newsSection){
    newsSection.style.display = "none";
}

if(settingsPage){
    settingsPage.style.display = "none";
}

document.querySelectorAll(".app").forEach(app => {
    app.classList.remove("active");
    app.style.display = "none";
});

if(
    type === "basic" ||
    type === "advanced" ||
    type === "scientific"
){

    if(calculatorApp){
        calculatorApp.style.display = "block";
        calculatorApp.classList.add("active");
    }

    if(typeof setCalculatorMode === "function"){
        setCalculatorMode(type);
    }

}else if(type === "cars"){

    if(carsApp){
        carsApp.style.display = "block";
        carsApp.classList.add("active");
    }

    if(carResults){
        carResults.style.display = "none";
    }

}else{

    if(genericApp){
        genericApp.style.display = "block";
        genericApp.classList.add("active");
    }

    if(typeof setupGeneric === "function"){
        setupGeneric(type);
    }
}

window.scrollTo({
    top: 0,
    behavior: "smooth"
});

document.documentElement.style.overflowY = "auto";
document.body.style.overflowY = "auto";

if(navLinks){
    navLinks.classList.remove("open");
}

}

window.openCalculator = openCalculator;

