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

    /*
     * Standalone negative number:
     * −5 → 5
     */
    if(
        before === "−" ||
        before === "-"
    ){

        calculatorExpression = number;

    }

    /*
     * Number after an operator:
     * 5−3 → 5−(−3)
     */
    else if(
        before.endsWith("−") ||
        before.endsWith("-") ||
        before.endsWith("+") ||
        before.endsWith("×") ||
        before.endsWith("÷")
    ){

        calculatorExpression =
            before + "(-" + number + ")";

    }

    /*
     * Positive number:
     * 5 → −5
     */
    else{

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

        /* SCIENTIFIC FUNCTIONS */

        expression =
            expression
                .replaceAll("sin(","Math.sin(")
                .replaceAll("cos(","Math.cos(")
                .replaceAll("tan(","Math.tan(")
                .replaceAll("√(","Math.sqrt(")
                .replaceAll("log(","Math.log10(")
                .replaceAll("ln(","Math.log(");

        /* PERCENT */

        expression =
            expression.replace(
                /(-?\d*\.?\d+)%/g,
                "($1/100)"
            );

        /* AUTO CLOSE PARENTHESES */

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
            display.textContent = "Error";
        }
    }
}

/* =========================================================
   EV VS GAS
========================================================= */
function calculateCars(){

    $("carResults").style.display="block";

    const evPrice=num("evPrice");

    const evConsumption=num("evConsumption");

    const homeCharge=
        Math.min(
            100,
            Math.max(0,num("homeCharge"))
        )/100;

    const homeElectricity=
        num("homeElectricity");

    const publicElectricity=
        num("publicElectricity");

    const evMaintenance=
        num("evMaintenance");

    const evInsurance=
        num("evInsurance");

    const evRegistration=
        num("evRegistration");


    const gasPrice=
        num("gasPrice");

    const gasConsumption=
        num("gasConsumption");

    const fuelPrice=
        num("fuelPrice");

    const gasMaintenance=
        num("gasMaintenance");

    const gasInsurance=
        num("gasInsurance");

    const gasRegistration=
        num("gasRegistration");

    const gasOther=
        num("gasOther");


    const distance=
        num("yearlyDistance");

    const growth=
        num("priceGrowth")/100;

    const years=
        Number($("carYears").value);


    if(
        evPrice<0 ||
        evConsumption<=0 ||
        homeElectricity<0 ||
        publicElectricity<0 ||
        gasPrice<0 ||
        gasConsumption<=0 ||
        fuelPrice<0 ||
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

        const multiplier=
            Math.pow(1+growth,year-1);

        const evEnergy=
            evEnergyBase*multiplier;

        const gasFuel=
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
                : "⛽ Gasoline"

        });

    }


    const evTotal=
        evCumulative;

    const gasTotal=
        gasCumulative;


    const savings=
        Math.abs(evTotal-gasTotal);


    const winner=

        evTotal<gasTotal
        ? "⚡ Electric car"

        :

        gasTotal<evTotal
        ? "⛽ Gasoline car"

        :

        "🤝 Almost equal";


    const winnerText=

        evTotal<gasTotal

        ?

        `Estimated to save ${money(savings)} over ${years} years.`

        :

        gasTotal<evTotal

        ?

        `Estimated to save ${money(savings)} over ${years} years.`

        :

        "Both options have approximately the same estimated cost.";


    $("carWinner").textContent=
        winner;

    $("carWinnerText").textContent=
        winnerText;


    $("evTotalResult").textContent=
        money(evTotal);

    $("gasTotalResult").textContent=
        money(gasTotal);

    $("carSavings").textContent=
        money(savings);

    $("evEnergyResult").textContent=
        money(evEnergyBase);

    $("gasFuelResult").textContent=
        money(gasFuelBase);


    $("breakEven").textContent=

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
            Math.min(evTotal,gasTotal);

        const expensive=
            Math.max(evTotal,gasTotal);

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


    $("carScore").textContent=
        score;


    $("carScoreText").textContent=

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

    chart.innerHTML="";


    if(!rows.length){
        return;
    }


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

        group.className=
            "bar-group";


        const bars=
            document.createElement("div");

        bars.className=
            "bars";


        const evBar=
            document.createElement("div");

        evBar.className=
            "bar";

        evBar.style.height=
            (row.ev/max*100)+"%";

        evBar.title=
            `EV: ${money(row.ev)}`;


        const gasBar=
            document.createElement("div");

        gasBar.className=
            "bar alt";

        gasBar.style.height=
            (row.gas/max*100)+"%";

        gasBar.title=
            `Gas: ${money(row.gas)}`;


        bars.appendChild(evBar);

        bars.appendChild(gasBar);


        const label=
            document.createElement("div");

        label.className=
            "bar-label";

        label.textContent=
            "Y"+row.year;


        group.appendChild(bars);

        group.appendChild(label);

        chart.appendChild(group);

    });
}


function renderCarTable(rows){

    const table=
        $("carTable");

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


    $("carResults").style.display=
        "none";


    showToast(
        "Reset complete"
    );
}


/* =========================================================
   GENERIC CALCULATORS
========================================================= */

let currentGenericType="";


function genericInput(id,label,value,step="0.01"){

    return `
        <div class="form-group">
            <label>${label}</label>
            <input id="${id}" type="number" value="${value}" step="${step}">
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
                ${genericInput("gStart","Starting savings (€)",1000)}
                ${genericInput("gMonthly","Monthly deposit (€)",300)}
                ${genericInput("gRate","Annual interest (%)",2.5)}
                ${genericInput("gYears","Years",5,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    investment:{
        icon:"📈",
        title:"Investment Calculator",
        description:"Estimate future value using compound growth.",
        html:`
            <div class="form-grid">
                ${genericInput("gInitial","Initial investment (€)",2000)}
                ${genericInput("gMonthly","Monthly contribution (€)",200)}
                ${genericInput("gRate","Expected annual return (%)",7)}
                ${genericInput("gYears","Years",10,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    loan:{
        icon:"🏦",
        title:"Loan Calculator",
        description:"Calculate monthly payment and total loan cost.",
        html:`
            <div class="form-grid">
                ${genericInput("gLoan","Loan amount (€)",10000)}
                ${genericInput("gRate","Annual interest (%)",6)}
                ${genericInput("gYears","Loan term (years)",5,"0.1")}
                ${genericInput("gDown","Upfront payment (€)",0)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    pc:{
        icon:"💻",
        title:"PC Upgrade Calculator",
        description:"Compare upgrading your PC with buying a new system.",
        html:`
            <div class="form-grid">
                ${genericInput("gUpgrade","Upgrade cost (€)",500)}
                ${genericInput("gNew","New PC cost (€)",1500)}
                ${genericInput("gYears","Expected upgrade lifespan (years)",3,"0.1")}
                ${genericInput("gNewYears","Expected new PC lifespan (years)",6,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    phone:{
        icon:"📱",
        title:"Phone Upgrade Calculator",
        description:"Compare keeping your current phone against upgrading.",
        html:`
            <div class="form-grid">
                ${genericInput("gNew","New phone price (€)",700)}
                ${genericInput("gTrade","Trade-in / resale value (€)",200)}
                ${genericInput("gAge","Current phone age (years)",3,"0.1")}
                ${genericInput("gYears","Expected years with new phone",4,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    rent:{
        icon:"🏠",
        title:"Rent vs Buy Calculator",
        description:"Compare simplified long-term housing costs.",
        html:`
            <div class="form-grid">
                ${genericInput("gRent","Monthly rent (€)",600)}
                ${genericInput("gHome","Home purchase price (€)",100000)}
                ${genericInput("gOwner","Monthly ownership costs (€)",180)}
                ${genericInput("gYears","Comparison period (years)",10,"0.1")}
                ${genericInput("gFutureHome","Estimated home value after period (€)",115000)}
                ${genericInput("gRentGrowth","Annual rent increase (%)",3,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    energy:{
        icon:"⚡",
        title:"Energy Cost Calculator",
        description:"Calculate the cost of running an appliance or device.",
        html:`
            <div class="form-grid">
                ${genericInput("gWatts","Device power (watts)",1000)}
                ${genericInput("gHours","Hours used per day",4,"0.1")}
                ${genericInput("gRate","Electricity price (€ / kWh)",0.15)}
                ${genericInput("gDays","Days per year",365,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    purchase:{
        icon:"🛒",
        title:"Purchase Worth It",
        description:"Estimate the cost per use of something you want to buy.",
        html:`
            <div class="form-grid">
                ${genericInput("gPrice","Purchase price (€)",200)}
                ${genericInput("gYears","Expected years of use",3,"0.1")}
                ${genericInput("gUses","Uses per week",3,"0.1")}
                ${genericInput("gResale","Estimated resale value (€)",50)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    salary:{
        icon:"💼",
        title:"Salary Calculator",
        description:"Break down annual income into different time periods.",
        html:`
            <div class="form-grid">
                ${genericInput("gSalary","Monthly salary (€)",1500)}
                ${genericInput("gWeeks","Paid weeks per year",52,"0.1")}
                ${genericInput("gHours","Working hours per week",40,"0.1")}
                ${genericInput("gDays","Work days per week",5,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    solar:{
        icon:"☀️",
        title:"Solar Panel Calculator",
        description:"Estimate yearly solar generation and simple payback.",
        html:`
            <div class="form-grid">
                ${genericInput("gKW","System size (kW)",5,"0.1")}
                ${genericInput("gSun","Sun hours equivalent per day",3.5,"0.1")}
                ${genericInput("gRate","Electricity price (€ / kWh)",0.15)}
                ${genericInput("gPrice","System price (€)",6000)}
                ${genericInput("gEfficiency","Estimated efficiency (%)",85,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    heating:{
        icon:"🔥",
        title:"Heating Cost Calculator",
        description:"Estimate yearly heating energy costs.",
        html:`
            <div class="form-grid">
                ${genericInput("gKwh","Energy consumption (kWh / day)",35,"0.1")}
                ${genericInput("gDays","Heating days per year",180,"0.1")}
                ${genericInput("gRate","Energy price (€ / kWh)",0.15)}
                ${genericInput("gGrowth","Expected yearly price increase (%)",3,"0.1")}
                ${genericInput("gYears","Years",5,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    ownership:{
        icon:"🚘",
        title:"Car Ownership Cost",
        description:"Estimate the true yearly and long-term cost of owning a car.",
        html:`
            <div class="form-grid">
                ${genericInput("gPurchase","Purchase price (€)",15000)}
                ${genericInput("gResale","Estimated resale value (€)",7000)}
                ${genericInput("gEnergy","Fuel / energy per year (€)",1200)}
                ${genericInput("gMaintenance","Maintenance per year (€)",700)}
                ${genericInput("gInsurance","Insurance per year (€)",450)}
                ${genericInput("gRegistration","Registration per year (€)",250)}
                ${genericInput("gOther","Other yearly costs (€)",200)}
                ${genericInput("gYears","Years of ownership",5,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    usednew:{
        icon:"🚙",
        title:"Used vs New Car",
        description:"Compare the estimated long-term cost of buying used or new.",
        html:`
            <div class="form-grid">
                ${genericInput("gUsedPrice","Used car price (€)",10000)}
                ${genericInput("gNewPrice","New car price (€)",22000)}
                ${genericInput("gUsedMaintenance","Used annual maintenance (€)",900)}
                ${genericInput("gNewMaintenance","New annual maintenance (€)",450)}
                ${genericInput("gUsedInsurance","Used annual insurance (€)",350)}
                ${genericInput("gNewInsurance","New annual insurance (€)",550)}
                ${genericInput("gUsedResale","Used resale value (€)",4500)}
                ${genericInput("gNewResale","New resale value (€)",11000)}
                ${genericInput("gUsedYears","Comparison period (years)",5,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    carrepair:{
        icon:"🛠️",
        title:"Car Repair vs Replace",
        description:"Compare repairing your current car with replacing it.",
        html:`
            <div class="form-grid">
                ${genericInput("gRepairCost","Repair cost (€)",2500)}
                ${genericInput("gRepairYears","Years after repair",2,"0.1")}
                ${genericInput("gCurrentAnnual","Current yearly running cost (€)",1800)}
                ${genericInput("gReplacementPrice","Replacement price (€)",12000)}
                ${genericInput("gReplacementYears","Replacement lifespan (years)",5,"0.1")}
                ${genericInput("gReplacementAnnual","Replacement yearly cost (€)",1400)}
                ${genericInput("gReplacementResale","Replacement resale value (€)",5000)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    taxi:{
        icon:"🚕",
        title:"Car vs Taxi",
        description:"Compare the yearly cost of owning a car with using taxis.",
        html:`
            <div class="form-grid">
                ${genericInput("gTaxiTrips","Taxi trips per week",5,"0.1")}
                ${genericInput("gTaxiTripCost","Taxi cost per trip (€)",8)}
                ${genericInput("gTaxiCarFixed","Car fixed costs per year (€)",1200)}
                ${genericInput("gTaxiCarKm","Car cost per km (€)",0.12)}
                ${genericInput("gTaxiKm","Car km per year",12000,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    publictransport:{
        icon:"🚌",
        title:"Car vs Public Transport",
        description:"Compare yearly car costs with public transport.",
        html:`
            <div class="form-grid">
                ${genericInput("gTransitPass","Monthly public transport pass (€)",40)}
                ${genericInput("gTransitOther","Other yearly transport costs (€)",100)}
                ${genericInput("gTransitCarFixed","Car fixed costs per year (€)",1400)}
                ${genericInput("gTransitCarKm","Car cost per km (€)",0.14)}
                ${genericInput("gTransitKm","Car km per year",12000,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    creditcard:{
        icon:"💳",
        title:"Credit Card Cost",
        description:"Estimate how much interest you pay on a credit card balance.",
        html:`
            <div class="form-grid">
                ${genericInput("gCCBalance","Credit card balance (€)",3000)}
                ${genericInput("gCCAPR","Annual interest rate (%)",18)}
                ${genericInput("gCCPayment","Monthly payment (€)",100)}
                ${genericInput("gCCFee","Annual card fee (€)",0)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    debtpayoff:{
        icon:"💸",
        title:"Debt Payoff",
        description:"See how long it takes to pay off debt and how extra payments help.",
        html:`
            <div class="form-grid">
                ${genericInput("gDebt","Current debt (€)",5000)}
                ${genericInput("gDebtAPR","Annual interest rate (%)",8)}
                ${genericInput("gDebtPayment","Current monthly payment (€)",150)}
                ${genericInput("gDebtExtra","Extra monthly payment (€)",50)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    emergency:{
        icon:"🛟",
        title:"Emergency Fund",
        description:"Calculate your emergency savings target and how long it takes to reach it.",
        html:`
            <div class="form-grid">
                ${genericInput("gEmergencyExpenses","Essential monthly expenses (€)",1000)}
                ${genericInput("gEmergencyMonths","Target months",6,"0.1")}
                ${genericInput("gEmergencyCurrent","Current emergency savings (€)",1500)}
                ${genericInput("gEmergencyContribution","Monthly contribution (€)",250)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    buysubscribe:{
        icon:"🔄",
        title:"Buy vs Subscribe",
        description:"Compare buying something once with paying a recurring subscription.",
        html:`
            <div class="form-grid">
                ${genericInput("gBuyPrice","Purchase price (€)",300)}
                ${genericInput("gBuyResale","Estimated resale value (€)",80)}
                ${genericInput("gSubMonthly","Subscription per month (€)",15)}
                ${genericInput("gBuyYears","Comparison period (years)",3,"0.1")}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    },


    repairreplace:{
        icon:"🔧",
        title:"Repair vs Replace",
        description:"Compare repairing an item with replacing it.",
        html:`
            <div class="form-grid">
                ${genericInput("gRRRepair","Repair cost (€)",120)}
                ${genericInput("gRRRepairYears","Years after repair",2,"0.1")}
                ${genericInput("gRRRepairAnnual","Annual cost after repair (€)",40)}
                ${genericInput("gRRNew","Replacement price (€)",500)}
                ${genericInput("gRRNewYears","Replacement lifespan (years)",5,"0.1")}
                ${genericInput("gRRNewAnnual","Annual cost after replacement (€)",20)}
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onclick="calculateGeneric()">Calculate</button>
                <button class="btn btn-secondary" onclick="resetGeneric()">Reset</button>
            </div>
        `
    }

};


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

    const type=
        currentGenericType;

    const result=
        $("genericResult");

    let title="";
    let text="";
    let metrics=[];


    /* SAVINGS */

    if(type==="savings"){

        const start=num("gStart");
        const monthly=num("gMonthly");
        const rate=num("gRate")/100/12;
        const years=num("gYears");

        let balance=start;

        for(let i=0;i<Math.max(0,Math.round(years*12));i++){
            balance=balance*(1+rate)+monthly;
        }

        const contributed=
            start+
            monthly*years*12;

        const interest=
            balance-contributed;

        title="Your estimated savings";

        text=
            "Regular saving can add up significantly over time.";

        metrics=[
            ["Final balance",money(balance)],
            ["Your contributions",money(contributed)],
            ["Estimated interest",money(interest)],
            ["Monthly deposit",money(monthly)]
        ];
    }


    /* INVESTMENT */

    else if(type==="investment"){

        const initial=num("gInitial");
        const monthly=num("gMonthly");
        const annual=num("gRate")/100;
        const years=num("gYears");

        const monthlyRate=
            annual/12;

        let balance=initial;

        for(let i=0;i<Math.max(0,Math.round(years*12));i++){
            balance=
                balance*(1+monthlyRate)+monthly;
        }

        const contributed=
            initial+
            monthly*years*12;

        const growth=
            balance-contributed;

        title="Estimated future value";

        text=
            "This is a mathematical estimate using compound growth.";

        metrics=[
            ["Future value",money(balance)],
            ["Total contributed",money(contributed)],
            ["Estimated growth",money(growth)],
            ["Time invested",decimal(years)+" years"]
        ];
    }


    /* LOAN */

    else if(type==="loan"){

        const loan=
            Math.max(
                0,
                num("gLoan")-
                num("gDown")
            );

        const annual=
            num("gRate")/100;

        const years=
            num("gYears");

        const n=
            years*12;

        const r=
            annual/12;

        let payment=0;

        if(n>0){

            if(r===0){

                payment=
                    loan/n;

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

        title="Loan estimate";

        text=
            "Your estimated monthly repayment and total cost.";

        metrics=[
            ["Monthly payment",money(payment)],
            ["Amount financed",money(loan)],
            ["Total repayment",money(total)],
            ["Total interest",money(interest)]
        ];
    }


    /* PC */

    else if(type==="pc"){

        const upgrade=num("gUpgrade");
        const fresh=num("gNew");
        const upgradeYears=num("gYears");
        const newYears=num("gNewYears");

        const upgradePerYear=
            upgradeYears>0
            ? upgrade/upgradeYears
            : 0;

        const newPerYear=
            newYears>0
            ? fresh/newYears
            : 0;

        const better=
            upgradePerYear<newPerYear
            ? "Upgrade appears cheaper per year."
            : "Buying new appears cheaper per year.";

        title=better;

        text=
            "This comparison uses simple cost per expected year.";

        metrics=[
            ["Upgrade cost",money(upgrade)],
            ["New PC cost",money(fresh)],
            ["Upgrade / year",money(upgradePerYear)],
            ["New PC / year",money(newPerYear)]
        ];
    }


    /* PHONE */

    else if(type==="phone"){

        const price=num("gNew");
        const trade=num("gTrade");
        const age=num("gAge");
        const years=num("gYears");

        const net=
            price-trade;

        const annual=
            years>0
            ? net/years
            : 0;

        title=
            annual<250
            ? "Upgrade looks relatively affordable."
            : "Consider keeping your current phone.";

        text=
            "The estimate is based on net purchase cost and expected years of use.";

        metrics=[
            ["New phone",money(price)],
            ["Trade-in value",money(trade)],
            ["Net cost",money(net)],
            ["Cost / year",money(annual)],
            ["Current age",decimal(age)+" years"]
        ];
    }


    /* RENT */

    else if(type==="rent"){

        const rent=num("gRent");
        const home=num("gHome");
        const owner=num("gOwner");
        const years=num("gYears");
        const future=num("gFutureHome");
        const growth=num("gRentGrowth")/100;

        let totalRent=0;
        let currentRent=rent;

        for(let y=0;y<Math.max(0,Math.round(years));y++){

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

        title=
            netOwnership<totalRent
            ? "Buying is cheaper in this simplified model."
            : "Renting is cheaper in this simplified model.";

        text=
            "This is a simplified comparison and does not include taxes, financing, maintenance surprises or investment opportunity costs.";

        metrics=[
            ["Total rent",money(totalRent)],
            ["Ownership costs",money(ownershipCost)],
            ["Estimated home value",money(future)],
            ["Net ownership cost",money(netOwnership)],
            ["Difference",money(difference)]
        ];
    }


    /* ENERGY */

    else if(type==="energy"){

        const watts=num("gWatts");
        const hours=num("gHours");
        const rate=num("gRate");
        const days=num("gDays");

        const dailyKwh=
            watts/1000*hours;

        const yearlyKwh=
            dailyKwh*days;

        const yearlyCost=
            yearlyKwh*rate;

        const monthly=
            yearlyCost/12;

        title="Estimated energy cost";

        text=
            "Based on the power rating, usage time and electricity price.";

        metrics=[
            ["Daily energy",decimal(dailyKwh)+" kWh"],
            ["Yearly energy",decimal(yearlyKwh)+" kWh"],
            ["Monthly cost",money(monthly)],
            ["Yearly cost",money(yearlyCost)]
        ];
    }


    /* PURCHASE */

    else if(type==="purchase"){

        const price=num("gPrice");
        const years=num("gYears");
        const uses=num("gUses");
        const resale=num("gResale");

        const net=
            Math.max(
                0,
                price-resale
            );

        const totalUses=
            Math.max(
                0,
                years*52*uses
            );

        const perUse=
            totalUses>0
            ? net/totalUses
            : 0;

        title=
            perUse<1
            ? "Very low estimated cost per use."
            :
            perUse<5
            ? "Potentially reasonable if you use it often."
            :
            "Consider how frequently you will actually use it.";

        text=
            "The more frequently you use a purchase, the lower its estimated cost per use.";

        metrics=[
            ["Net purchase cost",money(net)],
            ["Estimated uses",decimal(totalUses)],
            ["Cost per use",money(perUse)],
            ["Years of use",decimal(years)]
        ];
    }


    /* SALARY */

    else if(type==="salary"){

        const monthly=num("gSalary");
        const weeks=num("gWeeks");
        const hours=num("gHours");
        const days=num("gDays");

        const annual=
            monthly*12;

        const weekly=
            weeks>0
            ? annual/weeks
            : 0;

        const hourly=
            hours>0
            ? weekly/hours
            : 0;

        const daily=
            days>0
            ? weekly/days
            : 0;

        title="Your salary breakdown";

        text=
            "A simple conversion of your monthly salary.";

        metrics=[
            ["Monthly",money(monthly)],
            ["Yearly",money(annual)],
            ["Weekly",money(weekly)],
            ["Daily",money(daily)],
            ["Hourly",money(hourly)]
        ];
    }


    /* SOLAR */

    else if(type==="solar"){

        const kw=num("gKW");
        const sun=num("gSun");
        const rate=num("gRate");
        const price=num("gPrice");
        const efficiency=num("gEfficiency")/100;

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

        title=
            payback<10
            ? "Solar may have an attractive simple payback."
            : "The simple payback period is relatively long.";

        text=
            "Actual solar output depends heavily on location, orientation, weather and system losses.";

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


    /* HEATING */

    else if(type==="heating"){

        const kwh=num("gKwh");
        const days=num("gDays");
        const rate=num("gRate");
        const growth=num("gGrowth")/100;
        const years=num("gYears");

        let total=0;

        const yearlyBase=
            kwh*
            days*
            rate;

        for(let y=0;y<Math.max(0,Math.round(years));y++){

            total +=
                yearlyBase*
                Math.pow(
                    1+growth,
                    y
                );
        }

        const firstYear=
            yearlyBase;

        title=
            "Estimated heating cost";

        text=
            "Estimated energy cost over the selected period.";

        metrics=[
            ["First year",money(firstYear)],
            ["Total period",money(total)],
            ["Average / year",money(years>0?total/years:0)],
            ["Period",decimal(years)+" years"]
        ];
    }


    /* CAR OWNERSHIP */

    else if(type==="ownership"){

        const purchase=num("gPurchase");
        const resale=num("gResale");
        const energy=num("gEnergy");
        const maintenance=num("gMaintenance");
        const insurance=num("gInsurance");
        const registration=num("gRegistration");
        const other=num("gOther");
        const years=num("gYears");

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

        title=
            "Estimated total ownership cost";

        text=
            "Includes purchase price, yearly running costs and estimated resale value.";

        metrics=[
            ["Total cost",money(total)],
            ["Average / year",money(years>0?total/years:0)],
            ["Yearly running cost",money(yearly)],
            ["Resale value",money(resale)],
            ["Ownership period",decimal(years)+" years"]
        ];
    }


    /* USED VS NEW */

    else if(type==="usednew"){

        const years=num("gUsedYears");

        const used=
            num("gUsedPrice")+
            (
                num("gUsedMaintenance")+
                num("gUsedInsurance")
            )*years-
            num("gUsedResale");

        const fresh=
            num("gNewPrice")+
            (
                num("gNewMaintenance")+
                num("gNewInsurance")
            )*years-
            num("gNewResale");

        const diff=
            Math.abs(
                used-fresh
            );

        const win=
            used<fresh
            ? "🚙 Used car"
            :
            fresh<used
            ? "🚘 New car"
            :
            "🤝 Similar cost";

        title=win;

        text=
            `Estimated difference over ${decimal(years)} years: ${money(diff)}.`;

        metrics=[
            ["Used total",money(used)],
            ["New total",money(fresh)],
            ["Difference",money(diff)],
            ["Used / year",money(years>0?used/years:0)],
            ["New / year",money(years>0?fresh/years:0)]
        ];
    }


    /* CAR REPAIR VS REPLACE */

    else if(type==="carrepair"){

        const repair=num("gRepairCost");
        const repairYears=num("gRepairYears");
        const currentAnnual=num("gCurrentAnnual");

        const replacement=num("gReplacementPrice");
        const replacementYears=num("gReplacementYears");
        const replacementAnnual=num("gReplacementAnnual");
        const replacementResale=num("gReplacementResale");

        const repairPerYear=
            repairYears>0
            ? (
                repair+
                currentAnnual*repairYears
              )/repairYears
            : 0;

        const replacePerYear=
            replacementYears>0
            ? (
                replacement+
                replacementAnnual*replacementYears-
                replacementResale
              )/replacementYears
            : 0;

        const diff=
            Math.abs(
                repairPerYear-
                replacePerYear
            );

        title=
            repairPerYear<replacePerYear
            ? "🛠️ Repair"
            :
            replacePerYear<repairPerYear
            ? "🚘 Replace"
            :
            "🤝 Similar cost";

        text=
            `Estimated annual difference: ${money(diff)}.`;

        metrics=[
            ["Repair / year",money(repairPerYear)],
            ["Replace / year",money(replacePerYear)],
            ["Difference / year",money(diff)],
            ["Repair period",decimal(repairYears)+" years"],
            ["Replace period",decimal(replacementYears)+" years"]
        ];
    }


    /* CAR VS TAXI */

    else if(type==="taxi"){

        const trips=num("gTaxiTrips");
        const tripCost=num("gTaxiTripCost");
        const fixed=num("gTaxiCarFixed");
        const kmCost=num("gTaxiCarKm");
        const km=num("gTaxiKm");

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

        title=
            car<taxi
            ? "🚘 Owning a car"
            :
            taxi<car
            ? "🚕 Using taxis"
            :
            "🤝 Similar cost";

        text=
            `Estimated yearly difference: ${money(diff)}.`;

        metrics=[
            ["Taxi / year",money(taxi)],
            ["Car / year",money(car)],
            ["Difference",money(diff)],
            ["Taxi / month",money(taxi/12)],
            ["Car / month",money(car/12)]
        ];
    }


    /* CAR VS PUBLIC TRANSPORT */

    else if(type==="publictransport"){

        const pass=num("gTransitPass");
        const other=num("gTransitOther");
        const fixed=num("gTransitCarFixed");
        const kmCost=num("gTransitCarKm");
        const km=num("gTransitKm");

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

        title=
            transit<car
            ? "🚌 Public transport"
            :
            car<transit
            ? "🚘 Car"
            :
            "🤝 Similar cost";

        text=
            `Estimated yearly difference: ${money(diff)}.`;

        metrics=[
            ["Public transport / year",money(transit)],
            ["Car / year",money(car)],
            ["Difference",money(diff)],
            ["Public transport / month",money(transit/12)],
            ["Car / month",money(car/12)]
        ];
    }


    /* CREDIT CARD */

    else if(type==="creditcard"){

        const balance=num("gCCBalance");
        const apr=num("gCCAPR")/100;
        const payment=num("gCCPayment");
        const fee=num("gCCFee");

        const rate=
            apr/12;

        let remaining=
            balance;

        let interest=
            0;

        let months=
            0;

        if(balance<=0){

            title="No balance";

            text=
                "Enter a credit card balance.";

            metrics=[
                ["Balance",money(0)]
            ];

        }else if(
            rate>0 &&
            payment<=remaining*rate
        ){

            title=
                "Payment is too low";

            text=
                "The monthly payment does not cover the monthly interest.";

            metrics=[
                ["Monthly interest",money(remaining*rate)],
                ["Monthly payment",money(payment)]
            ];

        }else{

            while(
                remaining>0.005 &&
                months<1200
            ){

                const monthInterest=
                    remaining*rate;

                interest +=
                    monthInterest;

                remaining +=
                    monthInterest;

                const paid=
                    Math.min(
                        payment,
                        remaining
                    );

                remaining -=
                    paid;

                months++;
            }

            const fees=
                fee*
                (months/12);

            title=
                "Credit card repayment estimate";

            text=
                `Estimated payoff time: ${decimal(months/12)} years.`;

            metrics=[
                ["Total interest",money(interest)],
                ["Card fees",money(fees)],
                ["Total extra cost",money(interest+fees)],
                ["Payoff time",decimal(months/12)+" years"],
                ["Monthly payment",money(payment)]
            ];
        }
    }


    /* DEBT PAYOFF */

    else if(type==="debtpayoff"){

        const debt=num("gDebt");
        const apr=num("gDebtAPR")/100;
        const payment=num("gDebtPayment");
        const extra=num("gDebtExtra");

        const rate=
            apr/12;

        function payoff(amount,monthlyPayment){

            let remaining=
                amount;

            let interest=
                0;

            let months=
                0;

            if(
                rate>0 &&
                monthlyPayment<=remaining*rate
            ){
                return null;
            }

            while(
                remaining>0.005 &&
                months<1200
            ){

                const monthInterest=
                    remaining*rate;

                interest +=
                    monthInterest;

                remaining +=
                    monthInterest;

                const paid=
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

        const normal=
            payoff(
                debt,
                payment
            );

        const accelerated=
            payoff(
                debt,
                payment+extra
            );

        if(!normal){

            title=
                "Monthly payment is too low";

            text=
                "The payment does not cover the interest.";

            metrics=[];

        }else{

            const saved=
                accelerated
                ? Math.max(
                    0,
                    normal.interest-
                    accelerated.interest
                )
                : 0;

            title=
                "Debt payoff comparison";

            text=
                `Potential interest saved: ${money(saved)}.`;

            metrics=[
                [
                    "Current payoff",
                    decimal(normal.months/12)+" years"
                ],
                [
                    "With extra",
                    accelerated
                    ? decimal(accelerated.months/12)+" years"
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
                    money(saved)
                ]
            ];
        }
    }


    /* EMERGENCY FUND */

    else if(type==="emergency"){

        const expenses=
            num("gEmergencyExpenses");

        const monthsTarget=
            num("gEmergencyMonths");

        const current=
            num("gEmergencyCurrent");

        const contribution=
            num("gEmergencyContribution");

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
            : 0;

        title=
            needed<=0
            ? "Emergency fund goal reached 🎉"
            : "Emergency fund target";

        text=
            needed<=0
            ? "You have already reached your target."
            : `You need ${money(needed)} more to reach your goal.`;

        metrics=[
            ["Target fund",money(target)],
            ["Current savings",money(current)],
            ["Still needed",money(needed)],
            ["Target months",decimal(monthsTarget)],
            ["Estimated time",decimal(months)+" months"]
        ];
    }


    /* BUY VS SUBSCRIBE */

    else if(type==="buysubscribe"){

        const purchase=
            num("gBuyPrice");

        const resale=
            num("gBuyResale");

        const monthly=
            num("gSubMonthly");

        const years=
            num("gBuyYears");

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
            : 0;

        title=
            buy<sub
            ? "🛒 Buying is cheaper"
            :
            sub<buy
            ? "🔄 Subscription is cheaper"
            :
            "🤝 Similar cost";

        text=
            `Estimated difference over ${decimal(years)} years: ${money(diff)}.`;

        metrics=[
            ["Buying cost",money(buy)],
            ["Subscription cost",money(sub)],
            ["Difference",money(diff)],
            ["Break-even",decimal(breakEven)+" months"]
        ];
    }


    /* REPAIR VS REPLACE */

    else if(type==="repairreplace"){

        const repair=
            num("gRRRepair");

        const repairYears=
            num("gRRRepairYears");

        const repairAnnual=
            num("gRRRepairAnnual");

        const replace=
            num("gRRNew");

        const replaceYears=
            num("gRRNewYears");

        const replaceAnnual=
            num("gRRNewAnnual");

        const repairPerYear=
            repairYears>0
            ? (
                repair+
                repairAnnual*repairYears
              )/repairYears
            : 0;

        const replacePerYear=
            replaceYears>0
            ? (
                replace+
                replaceAnnual*replaceYears
              )/replaceYears
            : 0;

        const diff=
            Math.abs(
                repairPerYear-
                replacePerYear
            );

        title=
            repairPerYear<replacePerYear
            ? "🔧 Repair"
            :
            replacePerYear<repairPerYear
            ? "🆕 Replace"
            :
            "🤝 Similar cost";

        text=
            `Estimated yearly difference: ${money(diff)}.`;

        metrics=[
            ["Repair / year",money(repairPerYear)],
            ["Replacement / year",money(replacePerYear)],
            ["Difference / year",money(diff)],
            ["Repair period",decimal(repairYears)+" years"],
            ["Replacement period",decimal(replaceYears)+" years"]
        ];
    }


    /* RESULT OUTPUT */

    result.innerHTML=`

        <div class="big-result">

            <div class="result-label">
                ${title}
            </div>

            <div class="number">
                ${metrics[0]?.[1] || ""}
            </div>

            <p style="color:var(--muted);margin-top:8px">
                ${text}
            </p>

        </div>

        <div class="result-grid"
             style="margin-top:15px">

            ${metrics.map(m=>`

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

    `;

    result.classList.add("active");

    result.scrollIntoView({
        behavior:"smooth",
        block:"start"
    });
}


function resetGeneric(){

    setupGeneric(
        currentGenericType
    );

    showToast(
        "Reset complete"
    );
}

function openCalculator(type){

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

if(type === "basic" || type === "advanced" || type === "scientific"){

    $("calculatorApp").style.display = "block";
    $("calculatorApp").classList.add("active");

    setCalculatorMode(type);

}else if(type === "cars"){

    $("carsApp").style.display = "block";
    $("carsApp").classList.add("active");

    $("carResults").style.display = "none";

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

}
