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
