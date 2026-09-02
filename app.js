/* =========================================================
CALCULATOR NAVIGATION
========================================================= */

function openCalculator(type){

```
$("homePage").style.display = "none";

$("weatherSection").style.display = "none";
$("newsSection").style.display = "none";

const settingsPage = $("settingsPage");

if(settingsPage){
    settingsPage.style.display = "none";
}

document.querySelectorAll(".app")
    .forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });

if(
    type === "basic" ||
    type === "advanced" ||
    type === "scientific"
){

    $("calculatorApp").style.display = "block";

    $("calculatorApp").classList.add("active");

    setCalculatorMode(type);

}else if(type === "cars"){

    $("carsApp").style.display = "block";

    $("carsApp").classList.add("active");

    if($("carResults")){
        $("carResults").style.display = "none";
    }

}else{

    $("genericApp").style.display = "block";

    $("genericApp").classList.add("active");

    setupGeneric(type);

}

window.scrollTo({
    top: 0,
    behavior: "smooth"
});

document.documentElement.style.overflowY = "auto";
document.body.style.overflowY = "auto";

$("navLinks").classList.remove("open");
```

}

window.openCalculator = openCalculator;
