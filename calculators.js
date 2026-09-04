/* =========================================================
STANDARD CALCULATOR MODES
========================================================= */

let calculatorMode = "basic";

function setCalculatorMode(mode){

calculatorMode = mode;

document.querySelectorAll(".calculator-mode-btn")
    .forEach(btn => {
        btn.classList.remove("active");
    });

const activeButton = document.querySelector(
    `.calculator-mode-btn[onclick="setCalculatorMode('${mode}')"]`
);

if(activeButton){
    activeButton.classList.add("active");
}

renderCalculator();

}

/* =========================================================
STANDARD CALCULATOR
========================================================= */

let calculatorExpression = "";

function renderCalculator(){

const keypad = $("calculatorKeypad");

if(!keypad) return;

let buttons = [];

if(calculatorMode === "basic"){

    buttons = [
        ["C","clear"],
        ["⌫","backspace"],
        ["÷","operator"],
        ["×","operator"],

        ["7","number"],
        ["8","number"],
        ["9","number"],
        ["−","operator"],

        ["4","number"],
        ["5","number"],
        ["6","number"],
        ["+","operator"],

        ["1","number"],
        ["2","number"],
        ["3","number"],
        ["=","equals"],

        ["0","number"],
        [".","number"]
    ];

}else if(calculatorMode === "advanced"){

    buttons = [
        ["C","clear"],
        ["⌫","backspace"],
        ["÷","operator"],
        ["×","operator"],

        ["7","number"],
        ["8","number"],
        ["9","number"],
        ["−","operator"],

        ["4","number"],
        ["5","number"],
        ["6","number"],
        ["+","operator"],

        ["1","number"],
        ["2","number"],
        ["3","number"],
        ["=","equals"],

        ["0","number"],
        [".","number"],
        ["%","operator"],
        ["±","operator"]
    ];

}else{

    buttons = [
        ["C","clear"],
        ["⌫","backspace"],
        ["(","operator"],
        [")","operator"],

        ["sin","function"],
        ["cos","function"],
        ["tan","function"],
        ["√","function"],

        ["π","constant"],
        ["^","operator"],
        ["log","function"],
        ["ln","function"],

        ["7","number"],
        ["8","number"],
        ["9","number"],
        ["÷","operator"],

        ["4","number"],
        ["5","number"],
        ["6","number"],
        ["×","operator"],

        ["1","number"],
        ["2","number"],
        ["3","number"],
        ["−","operator"],

        ["0","number"],
        [".","number"],
        ["%","operator"],
        ["+","operator"],

        ["=","equals"]
    ];

}

keypad.innerHTML = buttons.map(([label,type]) => `
    <button
        type="button"
        class="calculator-key ${type}"
        onclick="calculatorPress('${label}')">
        ${label}
    </button>
`).join("");

updateCalculatorDisplay();

}

function calculatorPress(value){

const display = $("calculatorDisplay");

if(!display) return;

/* CLEAR */

if(value === "C"){

    calculatorExpression = "";

    updateCalculatorDisplay();

    return;
}


/* BACKSPACE */

if(value === "⌫"){

    calculatorExpression =
        calculatorExpression.slice(0,-1);

    updateCalculatorDisplay();

    return;
}


/* EQUALS */

if(value === "="){

    calculateExpression();

    return;
}


/* PLUS / MINUS */

if(value === "±"){

    if(calculatorExpression === ""){

        calculatorExpression = "−";

        updateCalculatorDisplay();

        return;
    }

    const match =
        calculatorExpression.match(/(\d*\.?\d+)$/);

    if(!match){

        updateCalculatorDisplay();

        return;
    }

    const number = match[1];

    const start =
        calculatorExpression.length - number.length;

    const before =
        calculatorExpression.slice(0,start);


    if(
        before === "−" ||
        before === "-"
    ){

        calculatorExpression = number;

    }else if(
        before.endsWith("−") ||
        before.endsWith("-") ||
        before.endsWith("+") ||
        before.endsWith("×") ||
        before.endsWith("÷")
    ){

        calculatorExpression =
            before + "(-" + number + ")";

    }else{

        calculatorExpression =
            before + "−" + number;
    }

    updateCalculatorDisplay();

    return;
}


/* PERCENT */

if(value === "%"){

    const match =
        calculatorExpression.match(/(-?\d*\.?\d+)$/);

    if(match){

        const number = match[1];

        calculatorExpression =
            calculatorExpression.slice(
                0,
                calculatorExpression.length - number.length
            ) +
            number + "%";
    }

    updateCalculatorDisplay();

    return;
}


/* SCIENTIFIC FUNCTIONS */

if(
    value === "sin" ||
    value === "cos" ||
    value === "tan" ||
    value === "log" ||
    value === "ln"
){

    if(
        calculatorExpression &&
        /[\dπ)]$/.test(calculatorExpression)
    ){

        calculatorExpression += "×";
    }

    calculatorExpression += value + "(";

    updateCalculatorDisplay();

    return;
}


/* SQUARE ROOT */

if(value === "√"){

    if(
        calculatorExpression &&
        /[\dπ)]$/.test(calculatorExpression)
    ){

        calculatorExpression += "×";
    }

    calculatorExpression += "√(";

    updateCalculatorDisplay();

    return;
}


/* PI */

if(value === "π"){

    if(
        calculatorExpression &&
        /[\d)]$/.test(calculatorExpression)
    ){

        calculatorExpression += "×";
    }

    calculatorExpression += "π";

    updateCalculatorDisplay();

    return;
}


/* OPEN PARENTHESIS */

if(value === "("){

    if(
        calculatorExpression &&
        /[\dπ)]$/.test(calculatorExpression)
    ){

        calculatorExpression += "×";
    }

    calculatorExpression += "(";

    updateCalculatorDisplay();

    return;
}


/* NORMAL BUTTON */

calculatorExpression += value;

updateCalculatorDisplay();

}

function updateCalculatorDisplay(){

const display = $("calculatorDisplay");

if(!display) return;

display.textContent =
    calculatorExpression || "0";

}

/* =========================================================
CALCULATE EXPRESSION
========================================================= */

function calculateExpression(){

try{

    let expression =
        calculatorExpression
            .replaceAll("×","*")
            .replaceAll("÷","/")
            .replaceAll("−","-")
            .replaceAll("^","**")
            .replaceAll("π","Math.PI");

    expression =
        expression
            .replaceAll("sin(","Math.sin(")
            .replaceAll("cos(","Math.cos(")
            .replaceAll("tan(","Math.tan(")
            .replaceAll("√(","Math.sqrt(")
            .replaceAll("log(","Math.log10(")
            .replaceAll("ln(","Math.log(");

    expression =
        expression.replace(
            /(-?\d*\.?\d+)%/g,
            "($1/100)"
        );

    let open =
        (expression.match(/\(/g) || []).length;

    let close =
        (expression.match(/\)/g) || []).length;

    while(open > close){

        expression += ")";

        close++;
    }

    if(!expression.trim()){

        return;
    }

    const result =
        Function(
            `"use strict"; return (${expression})`
        )();

    if(!Number.isFinite(result)){

        throw new Error("Invalid result");
    }

    calculatorExpression =
        String(result);

    updateCalculatorDisplay();

}catch(error){

    console.error(
        "Calculator error:",
        error
    );

    const display =
        $("calculatorDisplay");

    if(display){

        display.textContent =
            "Error";
    }
}

}

/* =========================================================
EV VS GAS
========================================================= */

function num(id){

    const element = $(id);

    if(!element) return 0;

    const value =
        parseFloat(element.value);

    return Number.isFinite(value)
        ? value
        : 0;
}


function calculateCars(){

$("carResults").style.display="block";

const evPrice=num("evPrice");
const evConsumption=num("evConsumption");

const homeCharge =
    Math.min(
        100,
        Math.max(0,num("homeCharge"))
    )/100;

const homeElectricity=num("homeElectricity");
const publicElectricity=num("publicElectricity");

const evMaintenance=num("evMaintenance");
const evInsurance=num("evInsurance");
const evRegistration=num("evRegistration");

const gasPrice=num("gasPrice");
const gasConsumption=num("gasConsumption");
const fuelPrice=num("fuelPrice");

const gasMaintenance=num("gasMaintenance");
const gasInsurance=num("gasInsurance");
const gasRegistration=num("gasRegistration");
const gasOther=num("gasOther");

const distance=num("yearlyDistance");
const growth=num("priceGrowth")/100;
const years=Number($("carYears").value);


if(
    evPrice<0 ||
    evConsumption<=0 ||
    homeElectricity<0 ||
    publicElectricity<0 ||
    evMaintenance<0 ||
    evInsurance<0 ||
    evRegistration<0 ||
    gasPrice<0 ||
    gasConsumption<=0 ||
    fuelPrice<0 ||
    gasMaintenance<0 ||
    gasInsurance<0 ||
    gasRegistration<0 ||
    gasOther<0 ||
    distance<=0 ||
    years<=0
){

    alert("Please enter valid values.");

    $("carResults").style.display="none";

    return;
}


const evEnergyBase =
    (distance/100) *
    evConsumption *
    (
        homeCharge*homeElectricity +
        (1-homeCharge)*publicElectricity
    );


const gasFuelBase =
    (distance/100) *
    gasConsumption *
    fuelPrice;


let evCumulative=evPrice;
let gasCumulative=gasPrice;

const rows=[];

let breakEvenYear=null;


for(
    let year=1;
    year<=years;
    year++
){

    const multiplier =
        Math.pow(1+growth,year-1);

    const evEnergy =
        evEnergyBase*multiplier;

    const gasFuel =
        gasFuelBase*multiplier;


    const evYearCost =
        evEnergy +
        evMaintenance +
        evInsurance +
        evRegistration;


    const gasYearCost =
        gasFuel +
        gasMaintenance +
        gasInsurance +
        gasRegistration +
        gasOther;


    evCumulative += evYearCost;
    gasCumulative += gasYearCost;


    if(
        breakEvenYear===null &&
        evCumulative<gasCumulative
    ){

        breakEvenYear=year;
    }


    rows.push({

        year,

        ev:evCumulative,

        gas:gasCumulative,

        diff:
            Math.abs(
                evCumulative-gasCumulative
            ),

        winner:
            evCumulative<gasCumulative
            ? "⚡ Electric"
            : gasCumulative<evCumulative
            ? "⛽ Gasoline"
            : "🤝 Equal"

    });
}


const evTotal=evCumulative;
const gasTotal=gasCumulative;

const savings=
    Math.abs(
        evTotal-gasTotal
    );


const winner =
    evTotal<gasTotal
    ? "⚡ Electric car"
    :
    gasTotal<evTotal
    ? "⛽ Gasoline car"
    :
    "🤝 Almost equal";


const winnerText =
    evTotal<gasTotal
    ?
    `Estimated to save ${money(savings)} over ${years} years.`
    :
    gasTotal<evTotal
    ?
    `Estimated to save ${money(savings)} over ${years} years.`
    :
    "Both options have approximately the same estimated cost.";


$("carWinner").textContent=winner;
$("carWinnerText").textContent=winnerText;

$("evTotalResult").textContent=money(evTotal);
$("gasTotalResult").textContent=money(gasTotal);
$("carSavings").textContent=money(savings);

$("evEnergyResult").textContent=
    money(evEnergyBase);

$("gasFuelResult").textContent=
    money(gasFuelBase);


$("breakEven").textContent =
    breakEvenYear
    ?
    `${breakEvenYear} year${breakEvenYear===1?"":"s"}`
    :
    "Not reached";


let score;

if(evTotal===gasTotal){

    score=50;

}else{

    const cheaper=
        Math.min(
            evTotal,
            gasTotal
        );

    const expensive=
        Math.max(
            evTotal,
            gasTotal
        );

    const ratio=
        cheaper/expensive;

    score=
        Math.round(
            Math.min(
                98,
                Math.max(
                    52,
                    50+(1-ratio)*150
                )
            )
        );
}


$("carScore").textContent=score;

$("carScoreText").textContent =
    score>=85
    ? "Excellent value"
    :
    score>=70
    ? "Strong value"
    :
    score>=55
    ? "Worth considering"
    :
    "Needs more consideration";


renderCarChart(rows);
renderCarTable(rows);


$("carResults").scrollIntoView({
    behavior:"smooth",
    block:"start"
});


localStorage.setItem(
    "lastCarResult",
    JSON.stringify({
        evTotal,
        gasTotal,
        savings,
        years
    })
);

}

function renderCarChart(rows){

const chart=$("carChart");

if(!chart) return;

chart.innerHTML="";

if(!rows.length) return;


const max=Math.max(
    ...rows.map(
        x=>Math.max(
            x.ev,
            x.gas
        )
    )
);


rows.forEach(row=>{

    const group=
        document.createElement("div");

    group.className="bar-group";


    const bars=
        document.createElement("div");

    bars.className="bars";


    const evBar=
        document.createElement("div");

    evBar.className="bar";

    evBar.style.height=
        max>0
        ? (row.ev/max*100)+"%"
        : "0%";

    evBar.title=
        `EV: ${money(row.ev)}`;


    const gasBar=
        document.createElement("div");

    gasBar.className="bar alt";

    gasBar.style.height=
        max>0
        ? (row.gas/max*100)+"%"
        : "0%";

    gasBar.title=
        `Gas: ${money(row.gas)}`;


    bars.appendChild(evBar);
    bars.appendChild(gasBar);


    const label=
        document.createElement("div");

    label.className="bar-label";

    label.textContent=
        "Y"+row.year;


    group.appendChild(bars);
    group.appendChild(label);

    chart.appendChild(group);
});

}

function renderCarTable(rows){

const table=$("carTable");

if(!table) return;

table.innerHTML="";


rows.forEach(row=>{

    const tr=
        document.createElement("tr");

    tr.innerHTML=`

        <td>${row.year}</td>

        <td>${money(row.ev)}</td>

        <td>${money(row.gas)}</td>

        <td>${money(row.diff)}</td>

        <td>${row.winner}</td>

    `;

    table.appendChild(tr);
});

}

function resetCars(){

$("evPrice").value=15000;
$("evConsumption").value=16;
$("homeCharge").value=80;
$("homeElectricity").value=.15;
$("publicElectricity").value=.40;

$("evMaintenance").value=350;
$("evInsurance").value=400;
$("evRegistration").value=150;

$("gasPrice").value=10000;
$("gasConsumption").value=7;
$("fuelPrice").value=1.60;

$("gasMaintenance").value=650;
$("gasInsurance").value=400;
$("gasRegistration").value=250;
$("gasOther").value=100;

$("yearlyDistance").value=15000;
$("priceGrowth").value=3;
$("carYears").value=10;

$("carResults").style.display="none";

showToast("Reset complete");

}

/* =========================================================
GENERIC CALCULATORS
========================================================= */

let currentGenericType="";

function genericInput(
id,
label,
value,
step="0.01"
){

return `
    <div class="form-group">

        <label>${label}</label>

        <input
            id="${id}"
            type="number"
            value="${value}"
            step="${step}"
            min="0">

    </div>
`;

}

const configs={

savings:{
    icon:"💰",
    title:"Savings Calculator",
    description:"Estimate how your savings can grow over time.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gStart",
                "Starting savings (€)",
                1000
            )}

            ${genericInput(
                "gMonthly",
                "Monthly deposit (€)",
                300
            )}

            ${genericInput(
                "gRate",
                "Annual interest (%)",
                2.5
            )}

            ${genericInput(
                "gYears",
                "Years",
                5,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


investment:{
    icon:"📈",
    title:"Investment Calculator",
    description:"Estimate future value using compound growth.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gInitial",
                "Initial investment (€)",
                2000
            )}

            ${genericInput(
                "gMonthly",
                "Monthly contribution (€)",
                200
            )}

            ${genericInput(
                "gRate",
                "Expected annual return (%)",
                7
            )}

            ${genericInput(
                "gYears",
                "Years",
                10,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


loan:{
    icon:"🏦",
    title:"Loan Calculator",
    description:"Calculate monthly payment and total loan cost.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gLoan",
                "Loan amount (€)",
                10000
            )}

            ${genericInput(
                "gRate",
                "Annual interest (%)",
                6
            )}

            ${genericInput(
                "gYears",
                "Loan term (years)",
                5,
                "0.1"
            )}

            ${genericInput(
                "gDown",
                "Upfront payment (€)",
                0
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


pc:{
    icon:"💻",
    title:"PC Upgrade Calculator",
    description:"Compare upgrading your PC with buying a new system.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gUpgrade",
                "Upgrade cost (€)",
                500
            )}

            ${genericInput(
                "gNew",
                "New PC cost (€)",
                1500
            )}

            ${genericInput(
                "gYears",
                "Expected upgrade lifespan (years)",
                3,
                "0.1"
            )}

            ${genericInput(
                "gNewYears",
                "Expected new PC lifespan (years)",
                6,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


phone:{
    icon:"📱",
    title:"Phone Upgrade Calculator",
    description:"Compare keeping your current phone against upgrading.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gNew",
                "New phone price (€)",
                700
            )}

            ${genericInput(
                "gTrade",
                "Trade-in / resale value (€)",
                200
            )}

            ${genericInput(
                "gAge",
                "Current phone age (years)",
                3,
                "0.1"
            )}

            ${genericInput(
                "gYears",
                "Expected years with new phone",
                4,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


rent:{
    icon:"🏠",
    title:"Rent vs Buy Calculator",
    description:"Compare simplified long-term housing costs.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gRent",
                "Monthly rent (€)",
                600
            )}

            ${genericInput(
                "gHome",
                "Home purchase price (€)",
                100000
            )}

            ${genericInput(
                "gOwner",
                "Monthly ownership costs (€)",
                180
            )}

            ${genericInput(
                "gYears",
                "Comparison period (years)",
                10,
                "0.1"
            )}

            ${genericInput(
                "gFutureHome",
                "Estimated home value after period (€)",
                115000
            )}

            ${genericInput(
                "gRentGrowth",
                "Annual rent increase (%)",
                3,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


energy:{
    icon:"⚡",
    title:"Energy Cost Calculator",
    description:"Calculate the cost of running an appliance or device.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gWatts",
                "Device power (watts)",
                1000
            )}

            ${genericInput(
                "gHours",
                "Hours used per day",
                4,
                "0.1"
            )}

            ${genericInput(
                "gRate",
                "Electricity price (€ / kWh)",
                0.15
            )}

            ${genericInput(
                "gDays",
                "Days per year",
                365,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


purchase:{
    icon:"🛒",
    title:"Purchase Worth It",
    description:"Estimate the cost per use of something you want to buy.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gPrice",
                "Purchase price (€)",
                200
            )}

            ${genericInput(
                "gYears",
                "Expected years of use",
                3,
                "0.1"
            )}

            ${genericInput(
                "gUses",
                "Uses per week",
                3,
                "0.1"
            )}

            ${genericInput(
                "gResale",
                "Estimated resale value (€)",
                50
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


salary:{
    icon:"💼",
    title:"Salary Calculator",
    description:"Break down annual income into different time periods.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gSalary",
                "Monthly salary (€)",
                1500
            )}

            ${genericInput(
                "gWeeks",
                "Paid weeks per year",
                52,
                "0.1"
            )}

            ${genericInput(
                "gHours",
                "Working hours per week",
                40,
                "0.1"
            )}

            ${genericInput(
                "gDays",
                "Work days per week",
                5,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


solar:{
    icon:"☀️",
    title:"Solar Panel Calculator",
    description:"Estimate yearly solar generation and simple payback.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gKW",
                "System size (kW)",
                5,
                "0.1"
            )}

            ${genericInput(
                "gSun",
                "Sun hours equivalent per day",
                3.5,
                "0.1"
            )}

            ${genericInput(
                "gRate",
                "Electricity price (€ / kWh)",
                0.15
            )}

            ${genericInput(
                "gPrice",
                "System price (€)",
                6000
            )}

            ${genericInput(
                "gEfficiency",
                "Estimated efficiency (%)",
                85,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


heating:{
    icon:"🔥",
    title:"Heating Cost Calculator",
    description:"Estimate yearly heating energy costs.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gKwh",
                "Energy consumption (kWh / day)",
                35,
                "0.1"
            )}

            ${genericInput(
                "gDays",
                "Heating days per year",
                180,
                "0.1"
            )}

            ${genericInput(
                "gRate",
                "Energy price (€ / kWh)",
                0.15
            )}

            ${genericInput(
                "gGrowth",
                "Expected yearly price increase (%)",
                3,
                "0.1"
            )}

            ${genericInput(
                "gYears",
                "Years",
                5,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


ownership:{
    icon:"🚘",
    title:"Car Ownership Cost",
    description:"Estimate the true yearly and long-term cost of owning a car.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gPurchase",
                "Purchase price (€)",
                15000
            )}

            ${genericInput(
                "gResale",
                "Estimated resale value (€)",
                7000
            )}

            ${genericInput(
                "gEnergy",
                "Fuel / energy per year (€)",
                1200
            )}

            ${genericInput(
                "gMaintenance",
                "Maintenance per year (€)",
                700
            )}

            ${genericInput(
                "gInsurance",
                "Insurance per year (€)",
                450
            )}

            ${genericInput(
                "gRegistration",
                "Registration per year (€)",
                250
            )}

            ${genericInput(
                "gOther",
                "Other yearly costs (€)",
                200
            )}

            ${genericInput(
                "gYears",
                "Years of ownership",
                5,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


usednew:{
    icon:"🚙",
    title:"Used vs New Car",
    description:"Compare the estimated long-term cost of buying used or new.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gUsedPrice",
                "Used car price (€)",
                10000
            )}

            ${genericInput(
                "gNewPrice",
                "New car price (€)",
                22000
            )}

            ${genericInput(
                "gUsedMaintenance",
                "Used annual maintenance (€)",
                900
            )}

            ${genericInput(
                "gNewMaintenance",
                "New annual maintenance (€)",
                450
            )}

            ${genericInput(
                "gUsedInsurance",
                "Used annual insurance (€)",
                350
            )}

            ${genericInput(
                "gNewInsurance",
                "New annual insurance (€)",
                550
            )}

            ${genericInput(
                "gUsedResale",
                "Used resale value (€)",
                4500
            )}

            ${genericInput(
                "gNewResale",
                "New resale value (€)",
                11000
            )}

            ${genericInput(
                "gUsedYears",
                "Comparison period (years)",
                5,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


carrepair:{
    icon:"🛠️",
    title:"Car Repair vs Replace",
    description:"Compare repairing your current car with replacing it.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gRepairCost",
                "Repair cost (€)",
                2500
            )}

            ${genericInput(
                "gRepairYears",
                "Years after repair",
                2,
                "0.1"
            )}

            ${genericInput(
                "gCurrentAnnual",
                "Current yearly running cost (€)",
                1800
            )}

            ${genericInput(
                "gReplacementPrice",
                "Replacement price (€)",
                12000
            )}

            ${genericInput(
                "gReplacementYears",
                "Replacement lifespan (years)",
                5,
                "0.1"
            )}

            ${genericInput(
                "gReplacementAnnual",
                "Replacement yearly cost (€)",
                1400
            )}

            ${genericInput(
                "gReplacementResale",
                "Replacement resale value (€)",
                5000
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


taxi:{
    icon:"🚕",
    title:"Car vs Taxi",
    description:"Compare the yearly cost of owning a car with using taxis.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gTaxiTrips",
                "Taxi trips per week",
                5,
                "0.1"
            )}

            ${genericInput(
                "gTaxiTripCost",
                "Taxi cost per trip (€)",
                8
            )}

            ${genericInput(
                "gTaxiCarFixed",
                "Car fixed costs per year (€)",
                1200
            )}

            ${genericInput(
                "gTaxiCarKm",
                "Car cost per km (€)",
                0.12
            )}

            ${genericInput(
                "gTaxiKm",
                "Car km per year",
                12000,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


publictransport:{
    icon:"🚌",
    title:"Car vs Public Transport",
    description:"Compare yearly car costs with public transport.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gTransitPass",
                "Monthly public transport pass (€)",
                40
            )}

            ${genericInput(
                "gTransitOther",
                "Other yearly transport costs (€)",
                100
            )}

            ${genericInput(
                "gTransitCarFixed",
                "Car fixed costs per year (€)",
                1400
            )}

            ${genericInput(
                "gTransitCarKm",
                "Car cost per km (€)",
                0.14
            )}

            ${genericInput(
                "gTransitKm",
                "Car km per year",
                12000,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


creditcard:{
    icon:"💳",
    title:"Credit Card Cost",
    description:"Estimate how much interest you pay on a credit card balance.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gCCBalance",
                "Credit card balance (€)",
                3000
            )}

            ${genericInput(
                "gCCAPR",
                "Annual interest rate (%)",
                18
            )}

            ${genericInput(
                "gCCPayment",
                "Monthly payment (€)",
                100
            )}

            ${genericInput(
                "gCCFee",
                "Annual card fee (€)",
                0
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


debtpayoff:{
    icon:"💸",
    title:"Debt Payoff",
    description:"See how long it takes to pay off debt and how extra payments help.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gDebt",
                "Current debt (€)",
                5000
            )}

            ${genericInput(
                "gDebtAPR",
                "Annual interest rate (%)",
                8
            )}

            ${genericInput(
                "gDebtPayment",
                "Current monthly payment (€)",
                150
            )}

            ${genericInput(
                "gDebtExtra",
                "Extra monthly payment (€)",
                50
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


emergency:{
    icon:"🛟",
    title:"Emergency Fund",
    description:"Calculate your emergency savings target and how long it takes to reach it.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gEmergencyExpenses",
                "Essential monthly expenses (€)",
                1000
            )}

            ${genericInput(
                "gEmergencyMonths",
                "Target months",
                6,
                "0.1"
            )}

            ${genericInput(
                "gEmergencyCurrent",
                "Current emergency savings (€)",
                1500
            )}

            ${genericInput(
                "gEmergencyContribution",
                "Monthly contribution (€)",
                250
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


buysubscribe:{
    icon:"🔄",
    title:"Buy vs Subscribe",
    description:"Compare buying something once with paying a recurring subscription.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gBuyPrice",
                "Purchase price (€)",
                300
            )}

            ${genericInput(
                "gBuyResale",
                "Estimated resale value (€)",
                80
            )}

            ${genericInput(
                "gSubMonthly",
                "Subscription per month (€)",
                15
            )}

            ${genericInput(
                "gBuyYears",
                "Comparison period (years)",
                3,
                "0.1"
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
},


repairreplace:{
    icon:"🔧",
    title:"Repair vs Replace",
    description:"Compare repairing an item with replacing it.",
    html:`
        <div class="form-grid">

            ${genericInput(
                "gRRRepair",
                "Repair cost (€)",
                120
            )}

            ${genericInput(
                "gRRRepairYears",
                "Years after repair",
                2,
                "0.1"
            )}

            ${genericInput(
                "gRRRepairAnnual",
                "Annual cost after repair (€)",
                40
            )}

            ${genericInput(
                "gRRNew",
                "Replacement price (€)",
                500
            )}

            ${genericInput(
                "gRRNewYears",
                "Replacement lifespan (years)",
                5,
                "0.1"
            )}

            ${genericInput(
                "gRRNewAnnual",
                "Annual cost after replacement (€)",
                20
            )}

        </div>

        <div class="form-actions">

            <button
                class="btn btn-primary"
                onclick="calculateGeneric()">
                Calculate
            </button>

            <button
                class="btn btn-secondary"
                onclick="resetGeneric()">
                Reset
            </button>

        </div>
    `
}

};

/* =========================================================
GENERIC SETUP
========================================================= */

function setupGeneric(type){

currentGenericType=type;

const config=configs[type];

if(!config){

    return;
}

$("genericIcon").textContent=
    config.icon;

$("genericTitle").textContent=
    config.title;

$("genericDescription").textContent=
    config.description;

$("genericForm").innerHTML=
    config.html;

$("genericResult").classList.remove("active");

$("genericResult").innerHTML="";

}

/* =========================================================
GENERIC CALCULATIONS
========================================================= */

function calculateGeneric(){

const type=currentGenericType;

const result=$("genericResult");

if(!result) return;

let title="";
let text="";
let metrics=[];


/* =====================================================
   SAVINGS
===================================================== */

if(type==="savings"){

    const start=num("gStart");
    const monthly=num("gMonthly");
    const annualRate=num("gRate");
    const rate=annualRate/100/12;
    const years=num("gYears");

    if(
        start<0 ||
        monthly<0 ||
        annualRate<0 ||
        years<=0
    ){

        showToast("Please enter valid values.");

        return;
    }


    let balance=start;

    for(
        let i=0;
        i<Math.max(0,Math.round(years*12));
        i++
    ){

        balance=
            balance*(1+rate)+monthly;
    }


    const contributed=
        start+
        monthly*years*12;

    const interest=
        balance-contributed;


    title=
        interest>0
        ? "💰 Your savings can grow"
        : "💰 Your estimated savings";


    text=
        interest>0
        ? `You could finish with ${money(balance)}, including approximately ${money(interest)} from interest.`
        : "Your result is based mainly on the money you contribute.";


    metrics=[

        ["Final balance",money(balance)],

        ["Your contributions",money(contributed)],

        ["Estimated interest",money(interest)],

        ["Monthly deposit",money(monthly)]

    ];
}


/* =====================================================
   INVESTMENT
===================================================== */

else if(type==="investment"){

    const initial=num("gInitial");
    const monthly=num("gMonthly");
    const annual=num("gRate");
    const years=num("gYears");

    if(
        initial<0 ||
        monthly<0 ||
        years<=0
    ){

        showToast("Please enter valid values.");

        return;
    }


    const monthlyRate=
        annual/100/12;

    let balance=initial;


    for(
        let i=0;
        i<Math.max(0,Math.round(years*12));
        i++
    ){

        balance=
            balance*(1+monthlyRate)+monthly;
    }


    const contributed=
        initial+
        monthly*years*12;

    const growth=
        balance-contributed;


    title=
        growth>0
        ? "📈 Estimated investment growth"
        : "📈 Estimated future value";


    text=
        growth>0
        ? `The estimate suggests approximately ${money(growth)} of growth beyond your contributions.`
        : "This calculation assumes the selected return and contribution schedule.";


    metrics=[

        ["Future value",money(balance)],

        ["Total contributed",money(contributed)],

        ["Estimated growth",money(growth)],

        ["Time invested",decimal(years)+" years"]

    ];
}


/* =====================================================
   LOAN
===================================================== */

else if(type==="loan"){

    const amount=num("gLoan");
    const down=num("gDown");
    const annual=num("gRate");
    const years=num("gYears");


    if(
        amount<0 ||
        down<0 ||
        annual<0 ||
        years<=0 ||
        down>amount
    ){

        showToast("Please enter valid loan values.");

        return;
    }


    const loan=
        Math.max(
            0,
            amount-down
        );

    const n=years*12;
    const r=annual/100/12;

    let payment=0;


    if(loan>0){

        if(r===0){

            payment=loan/n;

        }else{

            payment=
                loan*
                r*
                Math.pow(1+r,n)/
                (
                    Math.pow(1+r,n)-1
                );
        }
    }


    const total=
        payment*n;

    const interest=
        total-loan;


    title=
        loan===0
        ? "🏦 No financing needed"
        :
        interest===0
        ? "🏦 Interest-free loan estimate"
        : "🏦 Loan estimate";


    text=
        loan===0
        ? "Your upfront payment covers the full purchase price."
        :
        interest>0
        ? `You would pay approximately ${money(interest)} in interest over the loan term.`
        : "No interest is included in this estimate.";


    metrics=[

        ["Monthly payment",money(payment)],

        ["Amount financed",money(loan)],

        ["Total repayment",money(total)],

        ["Total interest",money(interest)]

    ];
}


/* =====================================================
   PC
===================================================== */

else if(type==="pc"){

    const upgrade =
        num("gUpgrade");

    const fresh =
        num("gNew");

    const upgradeYears =
        num("gYears");

    const newYears =
        num("gNewYears");


    if(
        upgrade < 0 ||
        fresh < 0 ||
        upgradeYears <= 0 ||
        newYears <= 0
    ){

        showToast(
            "Please enter valid values."
        );

        return;
    }


    /* =================================================
       YEARLY COST
    ================================================= */

    const upgradePerYear =
        upgrade / upgradeYears;

    const newPerYear =
        fresh / newYears;


    /* =================================================
       MONTHLY COST
    ================================================= */

    const upgradePerMonth =
        upgradePerYear / 12;

    const newPerMonth =
        newPerYear / 12;


    /* =================================================
   DIFFERENCE
================================================= */

const yearlyDifference =
    Math.abs(
        upgradePerYear -
        newPerYear
    );


    /* =================================================
       BEST OPTION
    ================================================= */

    if(upgradePerYear < newPerYear){

        title =
            "💻 Upgrading is cheaper per year.";

        text =
            `The upgrade costs about ${money(yearlyDifference)} less per year than buying a new PC.`;


    }else if(newPerYear < upgradePerYear){

        title =
            "🖥️ Buying a new PC is cheaper per year.";

        text =
            `Buying new costs about ${money(yearlyDifference)} less per year than the upgrade.`;


    }else{

        title =
            "🤝 Both options have a similar yearly cost.";

        text =
            "The estimated yearly cost is approximately the same for both options.";

    }


    /* =================================================
       RESULTS
    ================================================= */

    metrics = [

        [
            "Upgrade / year",
            money(upgradePerYear)
        ],

        [
            "New PC / year",
            money(newPerYear)
        ],

        [
            "Upgrade / month",
            money(upgradePerMonth)
        ],

        [
            "New PC / month",
            money(newPerMonth)
        ],

        [
            "Upgrade cost",
            money(upgrade)
        ],

        [
            "New PC cost",
            money(fresh)
        ],

        [
            "Yearly difference",
            money(yearlyDifference)
        ],

        [
            "Upgrade lifespan",
            decimal(upgradeYears) + " years"
        ],

        [
            "New PC lifespan",
            decimal(newYears) + " years"
        ]

    ];
}


/* =====================================================
   PHONE
===================================================== */

else if(type==="phone"){

    const price=num("gNew");
    const trade=num("gTrade");
    const age=num("gAge");
    const years=num("gYears");


    if(
        price<0 ||
        trade<0 ||
        age<0 ||
        years<=0
    ){

        showToast("Please enter valid phone values.");

        return;
    }


    const net=
        price-trade;

    const annual=
        net/years;


    if(net<0){

        const surplus=
            Math.abs(net);

        title=
            "📱 Trade-in value exceeds the phone price";

        text=
            `Based on these values, the trade-in would leave you with an estimated ${money(surplus)} surplus.`;


        metrics=[

            ["New phone",money(price)],

            ["Trade-in value",money(trade)],

            ["Trade-in surplus",money(surplus)],

            ["Surplus / year",money(surplus/years)],

            ["Current age",decimal(age)+" years"]

        ];

    }else if(net===0){

        title=
            "📱 The trade-in covers the new phone";

        text=
            "Your estimated trade-in value exactly covers the new phone price.";


        metrics=[

            ["New phone",money(price)],

            ["Trade-in value",money(trade)],

            ["Net cost",money(0)],

            ["Cost / year",money(0)],

            ["Current age",decimal(age)+" years"]

        ];

    }else{

        title=
            annual<250
            ? "📱 Upgrade looks relatively affordable."
            : "📱 Consider keeping your current phone.";


        text=
            annual<250
            ? `The estimated net cost is ${money(net)} over ${decimal(years)} years of use.`
            : `The upgrade would cost about ${money(annual)} per year after the trade-in.`;


        metrics=[

            ["New phone",money(price)],

            ["Trade-in value",money(trade)],

            ["Net cost",money(net)],

            ["Cost / year",money(annual)],

            ["Current age",decimal(age)+" years"]

        ];
    }
}


/* =====================================================
   RENT VS BUY
===================================================== */

else if(type==="rent"){

    const rent=num("gRent");
    const home=num("gHome");
    const owner=num("gOwner");
    const years=num("gYears");
    const future=num("gFutureHome");
    const growth=num("gRentGrowth")/100;


    if(
        rent<0 ||
        home<0 ||
        owner<0 ||
        years<=0 ||
        future<0 ||
        growth<0
    ){

        showToast("Please enter valid housing values.");

        return;
    }


    let totalRent=0;
    let currentRent=rent;


    for(
        let y=0;
        y<Math.max(0,Math.round(years));
        y++
    ){

        totalRent +=
            currentRent*12;

        currentRent *=
            1+growth;
    }


    const ownershipCost=
        home+
        owner*12*years;

    const netOwnership=
        ownershipCost-
        future;

    const difference=
        Math.abs(
            totalRent-
            netOwnership
        );


    if(netOwnership<totalRent){

        title=
            "🏠 Buying is cheaper in this simplified model.";

        text=
            `Buying is estimated to cost about ${money(difference)} less over the selected period.`;

    }else if(totalRent<netOwnership){

        title=
            "🏠 Renting is cheaper in this simplified model.";

        text=
            `Renting is estimated to cost about ${money(difference)} less over the selected period.`;

    }else{

        title=
            "🤝 Renting and buying are approximately equal";

        text=
            "Both options have approximately the same estimated cost.";
    }


    metrics=[

        ["Total rent",money(totalRent)],

        ["Ownership costs",money(ownershipCost)],

        ["Estimated home value",money(future)],

        ["Net ownership cost",money(netOwnership)],

        ["Difference",money(difference)]

    ];
}


/* =====================================================
   ENERGY
===================================================== */

else if(type==="energy"){

    const watts=num("gWatts");
    const hours=num("gHours");
    const rate=num("gRate");
    const days=num("gDays");


    if(
        watts<0 ||
        hours<0 ||
        rate<0 ||
        days<=0 ||
        hours>24
    ){

        showToast(
            "Please enter valid energy values."
        );

        return;
    }


    const dailyKwh=
        watts/1000*hours;

    const yearlyKwh=
        dailyKwh*days;

    const yearlyCost=
        yearlyKwh*rate;

    const monthly=
        yearlyCost/12;


    title=
        "⚡ Estimated energy cost";


    text=
        yearlyCost>500
        ? `This device could cost approximately ${money(yearlyCost)} per year to run.`
        : `This device costs approximately ${money(monthly)} per month at the selected usage.`;


    metrics=[

        ["Daily energy",decimal(dailyKwh)+" kWh"],

        ["Yearly energy",decimal(yearlyKwh)+" kWh"],

        ["Monthly cost",money(monthly)],

        ["Yearly cost",money(yearlyCost)]

    ];
}


/* =====================================================
   PURCHASE WORTH IT
===================================================== */

else if(type==="purchase"){

    const price =
        num("gPrice");

    const years =
        num("gYears");

    const uses =
        num("gUses");

    const resale =
        num("gResale");


    if(
        price < 0 ||
        years <= 0 ||
        uses < 0 ||
        resale < 0
    ){

        showToast(
            "Please enter valid purchase values."
        );

        return;
    }


    const net =
        Math.max(
            0,
            price - resale
        );


    const totalUses =
        years *
        52 *
        uses;


    const perUse =
        totalUses > 0
        ? net / totalUses
        : 0;


    const yearlyCost =
        net / years;


    const monthlyCost =
        yearlyCost / 12;

    
    const monthlyUses =
        uses * 52 / 12;


    /* =================================================
       DECISION
    ================================================= */

    if(net === 0){

        title =
            "🛒 Your resale value covers the purchase.";

        text =
            "Based on your inputs, the estimated net cost of owning the item is €0.";

    }else if(perUse < 1){

        title =
            "🛒 Very low cost per use.";

       text =
    `At about €${decimal(perUse)} per use, this looks like strong value if you use it as often as planned.`;

    }else if(perUse < 5){

        title =
            "🛒 Reasonable cost per use.";

        text =
    `The item costs about €${decimal(perUse)} per use based on your expected usage.`;

    }else{

        title =
            "🛒 Cost per use is relatively high.";

        text =
    `At about €${decimal(perUse)} per use, the purchase makes more sense if you expect to use it frequently or keep it longer.`;
    }


    /* =================================================
       RESULTS
    ================================================= */

    metrics = [

        [
            "Cost per use",
            money(perUse)
        ],

        [
            "Net purchase cost",
            money(net)
        ],

        [
            "Purchase price",
            money(price)
        ],

        [
            "Resale value",
            money(resale)
        ],

        [
            "Estimated total uses",
            decimal(totalUses)
        ],

        [
            "Cost / year",
            money(yearlyCost)
        ],

        [
            "Cost / month",
            money(monthlyCost)
        ],

        [
            "Uses / month",
            decimal(monthlyUses)
        ],

        [
            "Years of use",
            decimal(years)
        ]

    ];
}


/* =====================================================
   SALARY
===================================================== */

else if(type==="salary"){

    const monthly=num("gSalary");
    const weeks=num("gWeeks");
    const hours=num("gHours");
    const days=num("gDays");


    if(
        monthly<0 ||
        weeks<=0 ||
        hours<=0 ||
        days<=0 ||
        days>7
    ){

        showToast(
            "Please enter valid salary values."
        );

        return;
    }


    const annual=
        monthly*12;

    const weekly=
        annual/weeks;

    const hourly=
        weekly/hours;

    const daily=
        weekly/days;


    title=
        "💼 Your salary breakdown";


    text=
        `Your estimated hourly income is ${money(hourly)} based on the entered schedule.`;


    metrics=[

        ["Monthly",money(monthly)],

        ["Yearly",money(annual)],

        ["Weekly",money(weekly)],

        ["Daily",money(daily)],

        ["Hourly",money(hourly)]

    ];
}


/* =====================================================
   SOLAR
===================================================== */

else if(type==="solar"){

    const kw=num("gKW");
    const sun=num("gSun");
    const rate=num("gRate");
    const price=num("gPrice");
    const efficiency=num("gEfficiency")/100;


    if(
        kw<=0 ||
        sun<0 ||
        rate<0 ||
        price<0 ||
        efficiency<=0 ||
        efficiency>1
    ){

        showToast(
            "Please enter valid solar values."
        );

        return;
    }


    const yearlyKwh=
        kw*
        sun*
        365*
        efficiency;

    const yearlySavings=
        yearlyKwh*
        rate;

    const payback=
        yearlySavings>0
        ? price/yearlySavings
        : Infinity;


    if(payback<5){

        title=
            "☀️ Excellent simple payback";

        text=
            `The system could theoretically recover its cost in about ${decimal(payback)} years.`;

    }else if(payback<10){

        title=
            "☀️ Solar may have an attractive simple payback.";

        text=
            `The estimated simple payback is about ${decimal(payback)} years.`;

    }else{

        title=
            "☀️ The simple payback period is relatively long.";

        text=
            `The estimated payback is about ${decimal(payback)} years, so the upfront cost takes longer to recover.`;
    }


    metrics=[

        [
            "Estimated yearly generation",
            decimal(yearlyKwh)+" kWh"
        ],

        [
            "Estimated yearly savings",
            money(yearlySavings)
        ],

        [
            "System price",
            money(price)
        ],

        [
            "Simple payback",
            Number.isFinite(payback)
            ? decimal(payback)+" years"
            : "—"
        ]

    ];
}


/* =====================================================
   HEATING
===================================================== */

else if(type==="heating"){

    const kwh=num("gKwh");
    const days=num("gDays");
    const rate=num("gRate");
    const growth=num("gGrowth")/100;
    const years=num("gYears");


    if(
        kwh<0 ||
        days<=0 ||
        rate<0 ||
        growth<0 ||
        years<=0
    ){

        showToast(
            "Please enter valid heating values."
        );

        return;
    }


    let total=0;


    const yearlyBase=
        kwh*
        days*
        rate;


    for(
        let y=0;
        y<Math.max(0,Math.round(years));
        y++
    ){

        total +=
            yearlyBase*
            Math.pow(
                1+growth,
                y
            );
    }


    const firstYear=
        yearlyBase;


    const average=
        total/years;


    title=
        "🔥 Estimated heating cost";


    text=
        growth>0
        ? `With the selected price growth, the average yearly cost is approximately ${money(average)}.`
        : `Your estimated first-year heating cost is ${money(firstYear)}.`;


    metrics=[

        ["First year",money(firstYear)],

        ["Total period",money(total)],

        ["Average / year",money(average)],

        ["Period",decimal(years)+" years"]

    ];
}


/* =====================================================
   CAR OWNERSHIP
===================================================== */

else if(type==="ownership"){

    const purchase=num("gPurchase");
    const resale=num("gResale");
    const energy=num("gEnergy");
    const maintenance=num("gMaintenance");
    const insurance=num("gInsurance");
    const registration=num("gRegistration");
    const other=num("gOther");
    const years=num("gYears");


    if(
        purchase<0 ||
        resale<0 ||
        energy<0 ||
        maintenance<0 ||
        insurance<0 ||
        registration<0 ||
        other<0 ||
        years<=0
    ){

        showToast(
            "Please enter valid car ownership values."
        );

        return;
    }


    const yearly=
        energy+
        maintenance+
        insurance+
        registration+
        other;


    const total=
        purchase+
        yearly*years-
        resale;


    const average=
        total/years;


    title=
        "🚘 Estimated total ownership cost";


    text=
        `After accounting for resale value, the car costs approximately ${money(average)} per year to own.`;


    metrics=[

        ["Total cost",money(total)],

        ["Average / year",money(average)],

        ["Yearly running cost",money(yearly)],

        ["Resale value",money(resale)],

        ["Ownership period",decimal(years)+" years"]

    ];
}


/* =====================================================
   USED VS NEW
===================================================== */

else if(type==="usednew"){

    const years=num("gUsedYears");

    const usedPrice=num("gUsedPrice");
    const newPrice=num("gNewPrice");

    const usedMaintenance=
        num("gUsedMaintenance");

    const newMaintenance=
        num("gNewMaintenance");

    const usedInsurance=
        num("gUsedInsurance");

    const newInsurance=
        num("gNewInsurance");

    const usedResale=
        num("gUsedResale");

    const newResale=
        num("gNewResale");


    if(
        years<=0 ||
        usedPrice<0 ||
        newPrice<0 ||
        usedMaintenance<0 ||
        newMaintenance<0 ||
        usedInsurance<0 ||
        newInsurance<0 ||
        usedResale<0 ||
        newResale<0
    ){

        showToast(
            "Please enter valid car values."
        );

        return;
    }


    const used=
        usedPrice+
        (
            usedMaintenance+
            usedInsurance
        )*years-
        usedResale;


    const fresh=
        newPrice+
        (
            newMaintenance+
            newInsurance
        )*years-
        newResale;


    const diff=
        Math.abs(
            used-fresh
        );


    if(used<fresh){

        title=
            "🚙 Used car is cheaper";

        text=
            `The used car is estimated to save about ${money(diff)} over ${decimal(years)} years.`;

    }else if(fresh<used){

        title=
            "🚘 New car is cheaper";

        text=
            `The new car is estimated to save about ${money(diff)} over ${decimal(years)} years.`;

    }else{

        title=
            "🤝 Similar cost";

        text=
            "Both options have approximately the same estimated cost.";
    }


    metrics=[

        ["Used total",money(used)],

        ["New total",money(fresh)],

        ["Difference",money(diff)],

        ["Used / year",money(used/years)],

        ["New / year",money(fresh/years)]

    ];
}


/* =====================================================
   CAR REPAIR VS REPLACE
===================================================== */

else if(type==="carrepair"){

    const repair=num("gRepairCost");
    const repairYears=num("gRepairYears");
    const currentAnnual=num("gCurrentAnnual");

    const replacement=num("gReplacementPrice");
    const replacementYears=num("gReplacementYears");
    const replacementAnnual=num("gReplacementAnnual");
    const replacementResale=num("gReplacementResale");


    if(
        repair<0 ||
        repairYears<=0 ||
        currentAnnual<0 ||
        replacement<0 ||
        replacementYears<=0 ||
        replacementAnnual<0 ||
        replacementResale<0
    ){

        showToast(
            "Please enter valid repair and replacement values."
        );

        return;
    }


    const repairPerYear=
        (
            repair+
            currentAnnual*repairYears
        )/repairYears;


    const replacePerYear=
        (
            replacement+
            replacementAnnual*replacementYears-
            replacementResale
        )/replacementYears;


    const diff=
        Math.abs(
            repairPerYear-
            replacePerYear
        );


    if(repairPerYear<replacePerYear){

        title=
            "🛠️ Repair appears cheaper";

        text=
            `Repairing is estimated to cost about ${money(diff)} less per year.`;

    }else if(replacePerYear<repairPerYear){

        title=
            "🚘 Replacement appears cheaper";

        text=
            `Replacing is estimated to cost about ${money(diff)} less per year.`;

    }else{

        title=
            "🤝 Similar cost";

        text=
            "Both options have approximately the same estimated annual cost.";
    }


    metrics=[

        ["Repair / year",money(repairPerYear)],

        ["Replace / year",money(replacePerYear)],

        ["Difference / year",money(diff)],

        ["Repair period",decimal(repairYears)+" years"],

        ["Replace period",decimal(replacementYears)+" years"]

    ];
}


/* =====================================================
   CAR VS TAXI
===================================================== */

else if(type==="taxi"){

    const trips=num("gTaxiTrips");
    const tripCost=num("gTaxiTripCost");
    const fixed=num("gTaxiCarFixed");
    const kmCost=num("gTaxiCarKm");
    const km=num("gTaxiKm");


    if(
        trips<0 ||
        tripCost<0 ||
        fixed<0 ||
        kmCost<0 ||
        km<0
    ){

        showToast(
            "Please enter valid transport values."
        );

        return;
    }


    const taxi=
        trips*
        52*
        tripCost;


    const car=
        fixed+
        km*kmCost;


    const diff=
        Math.abs(
            taxi-car
        );


    if(car<taxi){

        title=
            "🚘 Owning a car is cheaper";

        text=
            `Owning the car is estimated to save about ${money(diff)} per year.`;

    }else if(taxi<car){

        title=
            "🚕 Using taxis is cheaper";

        text=
            `Using taxis is estimated to save about ${money(diff)} per year.`;

    }else{

        title=
            "🤝 Similar yearly cost";

        text=
            "Both options have approximately the same estimated yearly cost.";
    }


    metrics=[

        ["Taxi / year",money(taxi)],

        ["Car / year",money(car)],

        ["Difference",money(diff)],

        ["Taxi / month",money(taxi/12)],

        ["Car / month",money(car/12)]

    ];
}


/* =====================================================
   CAR VS PUBLIC TRANSPORT
===================================================== */

else if(type==="publictransport"){

    const pass=num("gTransitPass");
    const other=num("gTransitOther");
    const fixed=num("gTransitCarFixed");
    const kmCost=num("gTransitCarKm");
    const km=num("gTransitKm");


    if(
        pass<0 ||
        other<0 ||
        fixed<0 ||
        kmCost<0 ||
        km<0
    ){

        showToast(
            "Please enter valid transport values."
        );

        return;
    }


    const transit=
        pass*
        12+
        other;


    const car=
        fixed+
        km*kmCost;


    const diff=
        Math.abs(
            transit-car
        );


    if(transit<car){

        title=
            "🚌 Public transport is cheaper";

        text=
            `Public transport is estimated to save about ${money(diff)} per year.`;

    }else if(car<transit){

        title=
            "🚘 Car is cheaper";

        text=
            `The car is estimated to save about ${money(diff)} per year.`;

    }else{

        title=
            "🤝 Similar yearly cost";

        text=
            "Both options have approximately the same estimated yearly cost.";
    }


    metrics=[

        ["Public transport / year",money(transit)],

        ["Car / year",money(car)],

        ["Difference",money(diff)],

        ["Public transport / month",money(transit/12)],

        ["Car / month",money(car/12)]

    ];
}


/* =====================================================
   CREDIT CARD
===================================================== */

else if(type==="creditcard"){

    const balance =
        num("gCCBalance");

    const apr =
        num("gCCAPR") / 100;

    const payment =
        num("gCCPayment");

    const fee =
        num("gCCFee");


    if(
        balance < 0 ||
        apr < 0 ||
        payment < 0 ||
        fee < 0
    ){

        showToast(
            "Please enter valid credit card values."
        );

        return;
    }


    const rate =
        apr / 12;


    let remaining =
        balance;

    let interest =
        0;

    let months =
        0;


    /* =================================================
       NO BALANCE
    ================================================= */

    if(balance === 0){

        title =
            "💳 No credit card balance.";

        text =
            "There is currently no balance to repay.";

        metrics = [

            [
                "Current balance",
                money(0)
            ]

        ];


    /* =================================================
       NO PAYMENT
    ================================================= */

    }else if(payment <= 0){

        title =
            "⚠️ Monthly payment required.";

        text =
            "Enter a monthly payment greater than zero to estimate your payoff.";

        metrics = [

            [
                "Current balance",
                money(balance)
            ],

            [
                "Monthly payment",
                money(payment)
            ],

            [
                "Annual interest rate",
                decimal(apr * 100) + "%"
            ]

        ];


    /* =================================================
       PAYMENT TOO LOW
    ================================================= */

    }else if(
        rate > 0 &&
        payment <= remaining * rate
    ){

        const monthlyInterest =
            remaining * rate;


        title =
            "⚠️ Payment is too low.";

        text =
            `Your monthly payment of ${money(payment)} does not cover the estimated monthly interest of ${money(monthlyInterest)}.`;


        metrics = [

            [
                "Current balance",
                money(balance)
            ],

            [
                "Monthly interest",
                money(monthlyInterest)
            ],

            [
                "Monthly payment",
                money(payment)
            ],

            [
                "Annual interest rate",
                decimal(apr * 100) + "%"
            ]

        ];


    /* =================================================
       NORMAL REPAYMENT
    ================================================= */

    }else{

        while(
            remaining > 0.005 &&
            months < 1200
        ){

            const monthInterest =
                remaining * rate;

            interest +=
                monthInterest;

            remaining +=
                monthInterest;

            const paid =
                Math.min(
                    payment,
                    remaining
                );

            remaining -=
                paid;

            months++;
        }


        if(months >= 1200){

            title =
                "⚠️ Very long repayment period.";

            text =
                "With these settings, the balance would take an unusually long time to repay.";

            metrics = [

                [
                    "Current balance",
                    money(balance)
                ],

                [
                    "Monthly payment",
                    money(payment)
                ],

                [
                    "Annual interest rate",
                    decimal(apr * 100) + "%"
                ]

            ];


        }else{

            const fees =
                fee * (months / 12);


            const totalPaid =
                balance +
                interest +
                fees;


            const extraCost =
                interest +
                fees;


            const payoffYears =
                months / 12;


            const payoffMonths =
                months;


            /* =========================================
               DECISION
            ========================================= */

            if(extraCost > balance){

                title =
                    "💳 This balance is expensive to repay.";

                text =
                    `You could pay approximately ${money(extraCost)} in interest and fees before the balance is fully repaid.`;

            }else if(extraCost > balance * 0.25){

                title =
                    "💳 A significant amount goes to interest.";

                text =
                    `Interest and fees add approximately ${money(extraCost)} to the cost of repaying this balance.`;

            }else{

                title =
                    "💳 Estimated credit card repayment.";

                text =
                    `At ${money(payment)} per month, the balance could be repaid in about ${decimal(payoffYears)} years.`;

            }


            /* =========================================
               RESULTS
            ========================================= */

            metrics = [

                [
                    "Current balance",
                    money(balance)
                ],

                [
                    "Monthly payment",
                    money(payment)
                ],

                [
                    "Total interest",
                    money(interest)
                ],

                [
                    "Card fees",
                    money(fees)
                ],

                [
                    "Total extra cost",
                    money(extraCost)
                ],

                [
                    "Total paid",
                    money(totalPaid)
                ],

                [
                    "Payoff time",
                    decimal(payoffYears) + " years"
                ],

                [
                    "Payoff months",
                    decimal(payoffMonths)
                ],

                [
                    "Annual interest rate",
                    decimal(apr * 100) + "%"
                ]

            ];

        }
    }
}


/* =====================================================
   DEBT PAYOFF
===================================================== */

else if(type==="debtpayoff"){

    const debt =
        num("gDebt");

    const apr =
        num("gDebtAPR") / 100;

    const payment =
        num("gDebtPayment");

    const extra =
        num("gDebtExtra");


    if(
        debt < 0 ||
        apr < 0 ||
        payment < 0 ||
        extra < 0
    ){

        showToast(
            "Please enter valid debt values."
        );

        return;
    }


    const rate =
        apr / 12;


    function payoff(
        amount,
        monthlyPayment
    ){

        let remaining =
            amount;

        let interest =
            0;

        let months =
            0;


        if(amount <= 0){

            return {
                months: 0,
                interest: 0
            };
        }


        if(
            rate > 0 &&
            monthlyPayment <= remaining * rate
        ){

            return null;
        }


        while(
            remaining > 0.005 &&
            months < 1200
        ){

            const monthInterest =
                remaining * rate;

            interest +=
                monthInterest;

            remaining +=
                monthInterest;

            const paid =
                Math.min(
                    monthlyPayment,
                    remaining
                );

            remaining -=
                paid;

            months++;
        }


        return {
            months,
            interest
        };
    }


    const normal =
        payoff(
            debt,
            payment
        );


    const accelerated =
        payoff(
            debt,
            payment + extra
        );


    /* =================================================
       PAYMENT TOO LOW
    ================================================= */

    if(!normal){

        title =
            "⚠️ Monthly payment is too low.";

        text =
            "The payment does not cover the interest. Increase the monthly payment to reduce the balance.";

        metrics = [

            [
                "Current debt",
                money(debt)
            ],

            [
                "Monthly payment",
                money(payment)
            ],

            [
                "Annual interest rate",
                decimal(apr * 100) + "%"
            ]

        ];


    }else{

        const interestSaved =
            accelerated
            ? Math.max(
                0,
                normal.interest -
                accelerated.interest
            )
            : 0;


        const monthsSaved =
            accelerated
            ? Math.max(
                0,
                normal.months -
                accelerated.months
            )
            : 0;


        const normalYears =
            normal.months / 12;

        const acceleratedYears =
            accelerated
            ? accelerated.months / 12
            : 0;


        const normalTotal =
            debt +
            normal.interest;


        const acceleratedTotal =
            accelerated
            ? debt +
                accelerated.interest
            : normalTotal;


        /* =============================================
           DECISION
        ============================================= */

        if(extra > 0 && interestSaved > 0){

            title =
                "💸 Extra payments can save you money.";

            text =
                `An extra ${money(extra)} per month could save about ${money(interestSaved)} in interest and pay off the debt ${decimal(monthsSaved / 12)} years sooner.`;

        }else if(interestSaved > 0){

            title =
                "💸 Paying more each month reduces interest.";

            text =
                `A higher monthly payment would reduce both the repayment time and total interest paid.`;

        }else{

            title =
                "💸 Debt payoff estimate.";

            text =
                `At ${money(payment)} per month, the debt could be repaid in about ${decimal(normalYears)} years.`;

        }


        /* =============================================
           RESULTS
        ============================================= */

        metrics = [

            [
                "Current monthly payment",
                money(payment)
            ],

            [
                "Extra monthly payment",
                money(extra)
            ],

            [
                "Current payoff time",
                decimal(normalYears) + " years"
            ],

            [
                "With extra payment",
                accelerated
                ? decimal(acceleratedYears) + " years"
                : "—"
            ],

            [
                "Current interest",
                money(normal.interest)
            ],

            [
                "With extra interest",
                accelerated
                ? money(accelerated.interest)
                : "—"
            ],

            [
                "Interest saved",
                money(interestSaved)
            ],

            [
                "Current total paid",
                money(normalTotal)
            ],

            [
                "Total paid with extra",
                money(acceleratedTotal)
            ],

            [
                "Time saved",
                decimal(monthsSaved / 12) + " years"
            ],

            [
                "Annual interest rate",
                decimal(apr * 100) + "%"
            ]

        ];

    }
}

/* =====================================================
   EMERGENCY FUND
===================================================== */

else if(type==="emergency"){

    const expenses=
        num("gEmergencyExpenses");

    const monthsTarget=
        num("gEmergencyMonths");

    const current=
        num("gEmergencyCurrent");

    const contribution=
        num("gEmergencyContribution");


    if(
        expenses<0 ||
        monthsTarget<=0 ||
        current<0 ||
        contribution<0
    ){

        showToast(
            "Please enter valid emergency fund values."
        );

        return;
    }


    const target=
        expenses*
        monthsTarget;


    const needed=
        Math.max(
            0,
            target-current
        );


    const months=
        contribution>0
        ? needed/contribution
        : Infinity;


    if(needed<=0){

        title=
            "🎉 Emergency fund goal reached";

        text=
            "You already have enough savings to meet your selected emergency fund target.";

    }else if(contribution<=0){

        title=
            "🛟 Emergency fund target";

        text=
            `You need ${money(needed)} more, but no monthly contribution has been entered.`;

    }else{

        title=
            "🛟 Emergency fund target";

        text=
            `You need ${money(needed)} more, which would take approximately ${decimal(months)} months at the selected contribution.`;
    }


    metrics=[

        ["Target fund",money(target)],

        ["Current savings",money(current)],

        ["Still needed",money(needed)],

        ["Target months",decimal(monthsTarget)],

        [
            "Estimated time",
            Number.isFinite(months)
            ? decimal(months)+" months"
            : "—"
        ]

    ];
}


/* =====================================================
   BUY VS SUBSCRIBE
===================================================== */

else if(type==="buysubscribe"){

    const purchase=num("gBuyPrice");
    const resale=num("gBuyResale");
    const monthly=num("gSubMonthly");
    const years=num("gBuyYears");


    if(
        purchase<0 ||
        resale<0 ||
        monthly<0 ||
        years<=0
    ){

        showToast(
            "Please enter valid subscription values."
        );

        return;
    }


    const buy=
        Math.max(
            0,
            purchase-resale
        );


    const sub=
        monthly*
        12*
        years;


    const diff=
        Math.abs(
            buy-sub
        );


    const breakEven=
        monthly>0
        ? buy/monthly
        : Infinity;


    if(buy<sub){

        title=
            "🛒 Buying is cheaper";

        text=
            `Buying is estimated to save about ${money(diff)} over ${decimal(years)} years.`;

    }else if(sub<buy){

        title=
            "🔄 Subscription is cheaper";

        text=
            `The subscription is estimated to save about ${money(diff)} over ${decimal(years)} years.`;

    }else{

        title=
            "🤝 Similar cost";

        text=
            "Both options have approximately the same estimated cost over the selected period.";
    }


    metrics=[

        ["Buying cost",money(buy)],

        ["Subscription cost",money(sub)],

        ["Difference",money(diff)],

        [
            "Break-even",
            Number.isFinite(breakEven)
            ? decimal(breakEven)+" months"
            : "No subscription cost"
        ]

    ];
}


/* =====================================================
   REPAIR VS REPLACE
===================================================== */

else if(type==="repairreplace"){

    const repair =
        num("gRRRepair");

    const repairYears =
        num("gRRRepairYears");

    const repairAnnual =
        num("gRRRepairAnnual");

    const replace =
        num("gRRNew");

    const replaceYears =
        num("gRRNewYears");

    const replaceAnnual =
        num("gRRNewAnnual");


    if(
        repair < 0 ||
        repairYears <= 0 ||
        repairAnnual < 0 ||
        replace < 0 ||
        replaceYears <= 0 ||
        replaceAnnual < 0
    ){

        showToast(
            "Please enter valid repair and replacement values."
        );

        return;
    }


    /* =================================================
       TOTAL COST
    ================================================= */

    const repairTotal =
        repair +
        repairAnnual * repairYears;

    const replaceTotal =
        replace +
        replaceAnnual * replaceYears;


    /* =================================================
       YEARLY COST
    ================================================= */

    const repairPerYear =
        repairTotal / repairYears;

    const replacePerYear =
        replaceTotal / replaceYears;


    /* =================================================
       MONTHLY COST
    ================================================= */

    const repairPerMonth =
        repairPerYear / 12;

    const replacePerMonth =
        replacePerYear / 12;


    /* =================================================
       DIFFERENCE
    ================================================= */

    const yearlyDifference =
        Math.abs(
            repairPerYear -
            replacePerYear
        );

    const totalDifference =
        Math.abs(
            repairTotal -
            replaceTotal
        );


    /* =================================================
       DECISION
    ================================================= */

    if(repairPerYear < replacePerYear){

        title =
            "🔧 Repair appears to be the better value.";

        text =
            `Repairing costs about ${money(yearlyDifference)} less per year over the selected period.`;

    }else if(replacePerYear < repairPerYear){

        title =
            "🆕 Replacement appears to be the better value.";

        text =
            `Replacing costs about ${money(yearlyDifference)} less per year over the selected period.`;

    }else{

        title =
            "🤝 Both options have a similar estimated cost.";

        text =
            "The estimated yearly cost is approximately the same for repairing and replacing.";

    }


    /* =================================================
       RESULTS
    ================================================= */

    metrics = [

        [
            "Repair / year",
            money(repairPerYear)
        ],

        [
            "Replacement / year",
            money(replacePerYear)
        ],

        [
            "Repair / month",
            money(repairPerMonth)
        ],

        [
            "Replacement / month",
            money(replacePerMonth)
        ],

        [
            "Repair total",
            money(repairTotal)
        ],

        [
            "Replacement total",
            money(replaceTotal)
        ],

        [
            "Yearly difference",
            money(yearlyDifference)
        ],

        [
            "Total difference",
            money(totalDifference)
        ],

        [
            "Repair period",
            decimal(repairYears) + " years"
        ],

        [
            "Replacement period",
            decimal(replaceYears) + " years"
        ]

    ];
}


/* =====================================================
   RESULT OUTPUT
===================================================== */

if(!metrics.length){

    title =
        "Unable to calculate";

    text =
        "Please check the values and try again.";

    metrics = [];

}


/* =====================================================
   SMART VERDICT
===================================================== */

let verdict = "";
let verdictClass = "result-neutral";


if(
    title.toLowerCase().includes("cheaper") ||
    title.toLowerCase().includes("save") ||
    title.toLowerCase().includes("affordable") ||
    title.toLowerCase().includes("low") ||
    title.toLowerCase().includes("growth") ||
    title.toLowerCase().includes("excellent") ||
    title.toLowerCase().includes("goal reached")
){

    verdict = "✅ Looks favorable";
    verdictClass = "result-positive";

}else if(
    title.toLowerCase().includes("consider") ||
    title.toLowerCase().includes("similar") ||
    title.toLowerCase().includes("reasonable") ||
    title.toLowerCase().includes("estimate") ||
    title.toLowerCase().includes("target")
){

    verdict = "⚠️ Worth considering";
    verdictClass = "result-warning";

}else if(
    title.toLowerCase().includes("high") ||
    title.toLowerCase().includes("too low") ||
    title.toLowerCase().includes("long") ||
    title.toLowerCase().includes("expensive")
){

    verdict = "❌ Needs caution";
    verdictClass = "result-negative";

}else{

    verdict = "ℹ️ Based on your inputs";
}


/* =====================================================
   MAIN RESULT
===================================================== */

const mainMetric =
    metrics.length
    ? metrics[0][1]
    : "—";


const extraMetrics =
    metrics.slice(1);


/* =====================================================
   RENDER RESULT
===================================================== */

result.innerHTML = `

    <div class="big-result">

        <div class="result-label">
            ${title}
        </div>

        <div class="number">
            ${mainMetric}
        </div>

        <div
            class="result-verdict ${verdictClass}"
            style="margin-top:12px"
        >
            ${verdict}
        </div>

        <p
            style="
                color:var(--muted);
                margin-top:12px;
                line-height:1.6;
            "
        >
            ${text}
        </p>

    </div>


    ${
        extraMetrics.length
        ? `
            <div
                class="result-section-title"
                style="
                    margin-top:22px;
                    margin-bottom:10px;
                    font-weight:700;
                "
            >
                📊 Breakdown
            </div>

            <div
                class="result-grid"
                style="margin-top:0"
            >

                ${extraMetrics.map(m => `

                    <div class="metric">

                        <span>
                            ${m[0]}
                        </span>

                        <strong>
                            ${m[1]}
                        </strong>

                    </div>

                `).join("")}

            </div>
        `
        : ""
    }

`;


result.classList.add("active");

result.scrollIntoView({
    behavior:"smooth",
    block:"start"
});

}


/* =========================================================
RESET GENERIC
========================================================= */

function resetGeneric(){

    setupGeneric(
        currentGenericType
    );

    showToast(
        "Reset complete"
    );

}
