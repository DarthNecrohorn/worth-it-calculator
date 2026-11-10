const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const GROQ_MODEL = "openai/gpt-oss-120b";
const GEMINI_MODEL = "gemini-3.7-flash";
const MAX_PROMPT_CHARS = 1000;
const ALLOWED_CATEGORIES = new Set(["cars","money","technology","home","other"]);
const ALLOWED_SUBCATEGORIES = {
 cars:new Set(["car-ownership","ev-ownership","fuel-costs","vehicle-financing","car-insurance","car-maintenance","depreciation-resale","vehicle-comparison"]),
 money:new Set(["budgeting","saving","investing","loans-debt","mortgages","taxes","income-salary","retirement"]),
 technology:new Set(["smartphones","computers","gaming","software-subscriptions","internet-connectivity","consumer-electronics","tech-comparison"]),
 home:new Set(["utilities-energy","rent-housing","home-buying","renovation-repairs","home-appliances","home-maintenance","household-budget"]),
 other:new Set(["travel","education-career","health-fitness","food-groceries","business","lifestyle","general-comparison"])
};
const GROQ_CALCULATOR_RESPONSE_SCHEMA = {
    name: "worth_it_calculator",
    strict: true,
    schema: {
        type: "object",
        properties: {
            title: { type: "string" },
            description: { type: "string" },
            classification: {
                anyOf: Object.entries(ALLOWED_SUBCATEGORIES).map(([category,subcategories])=>({
                    type: "object",
                    properties: {
                        category: { type: "string", enum: [category] },
                        subcategory_1: { type: "string", enum: [...subcategories] },
                        subcategory_2: {
                            anyOf: [
                                { type: "string", enum: [...subcategories] },
                                { type: "null" }
                            ]
                        },
                        subcategory_3: {
                            anyOf: [
                                { type: "string", enum: [...subcategories] },
                                { type: "null" }
                            ]
                        }
                    },
                    required: ["category","subcategory_1","subcategory_2","subcategory_3"],
                    additionalProperties: false
                }))
            },
            inputs: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        min: { type: "number" },
                        max: { type: "number" },
                        default: { type: "number" },
                        step: { type: "number" },
                        unit: { type: "string" }
                    },
                    required: ["key","label","min","max","default","step","unit"],
                    additionalProperties: false
                }
            },
            results: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        label: { type: "string" },
                        expression: { type: "string" },
                        format: { type: "string", enum: ["number","currency","percent"] },
                        currency: { type: "string" },
                        prefix: { type: "string" },
                        suffix: { type: "string" }
                    },
                    required: ["label","expression","format","currency","prefix","suffix"],
                    additionalProperties: false
                }
            }
        },
        required: ["title","description","classification","inputs","results"],
        additionalProperties: false
    }
};

const FUNCTIONS = new Set(["min","max","abs","round","floor","ceil","sqrt","pow"]);
const COUNTRY_DEFAULTS = {
 US:["USD","en-US"],GB:["GBP","en-GB"],CA:["CAD","en-CA"],AU:["AUD","en-AU"],NZ:["NZD","en-NZ"],
 CH:["CHF","de-CH"],JP:["JPY","ja-JP"],CN:["CNY","zh-CN"],IN:["INR","en-IN"],PL:["PLN","pl-PL"],
 CZ:["CZK","cs-CZ"],HU:["HUF","hu-HU"],SE:["SEK","sv-SE"],NO:["NOK","nb-NO"],DK:["DKK","da-DK"],
 IS:["ISK","is-IS"],TR:["TRY","tr-TR"],BR:["BRL","pt-BR"],MX:["MXN","es-MX"],ZA:["ZAR","en-ZA"],
 SG:["SGD","en-SG"],HK:["HKD","zh-HK"],KR:["KRW","ko-KR"],AE:["AED","ar-AE"],SA:["SAR","ar-SA"],
 BG:["EUR","bg-BG"],RS:["EUR","sr-Latn-RS"],ME:["EUR","sr-Latn-ME"],XK:["EUR","sq-XK"],
 AT:["EUR","de-AT"],BE:["EUR","nl-BE"],CY:["EUR","el-CY"],EE:["EUR","et-EE"],FI:["EUR","fi-FI"],
 FR:["EUR","fr-FR"],DE:["EUR","de-DE"],GR:["EUR","el-GR"],HR:["EUR","hr-HR"],IE:["EUR","en-IE"],
 IT:["EUR","it-IT"],LV:["EUR","lv-LV"],LT:["EUR","lt-LT"],LU:["EUR","fr-LU"],MT:["EUR","mt-MT"],
 NL:["EUR","nl-NL"],PT:["EUR","pt-PT"],SK:["EUR","sk-SK"],SI:["EUR","sl-SI"],ES:["EUR","es-ES"],
 AD:["EUR","ca-AD"],MC:["EUR","fr-MC"],SM:["EUR","it-SM"],VA:["EUR","it-VA"]
};
const EXPLICIT_CURRENCY_RULES=[
 ["EUR",/\b(?:eur|euros?)\b/i],
 ["USD",/\b(?:usd|us dollars?|u\.?s\.? dollars?|american dollars?)\b/i],
 ["GBP",/\b(?:gbp|pounds? sterling|british pounds?)\b/i],
 ["RSD",/\b(?:rsd|serbian dinars?)\b/i],
 ["CHF",/\b(?:chf|swiss francs?)\b/i],
 ["CAD",/\b(?:cad|canadian dollars?)\b/i],
 ["AUD",/\b(?:aud|australian dollars?)\b/i],
 ["NZD",/\b(?:nzd|new zealand dollars?)\b/i],
 ["JPY",/\b(?:jpy|japanese yen)\b/i],
 ["CNY",/\b(?:cny|chinese yuan)\b/i],
 ["INR",/\b(?:inr|indian rupees?)\b/i],
 ["PLN",/\b(?:pln|polish zloty)\b/i],
 ["CZK",/\b(?:czk|czech korunas?)\b/i],
 ["HUF",/\b(?:huf|hungarian forints?)\b/i],
 ["SEK",/\b(?:sek|swedish krona)\b/i],
 ["NOK",/\b(?:nok|norwegian kroner?)\b/i],
 ["DKK",/\b(?:dkk|danish kroner?)\b/i],
 ["BRL",/\b(?:brl|brazilian reals?)\b/i],
 ["MXN",/\b(?:mxn|mexican pesos?)\b/i],
 ["ZAR",/\b(?:zar|south african rand)\b/i],
 ["SGD",/\b(?:sgd|singapore dollars?)\b/i],
 ["HKD",/\b(?:hkd|hong kong dollars?)\b/i],
 ["KRW",/\b(?:krw|south korean won)\b/i],
 ["TRY",/(?:\bTRY\b|\bturkish lira\b)/],
 ["AED",/\b(?:aed|uae dirhams?)\b/i],
 ["SAR",/\b(?:sar|saudi riyals?)\b/i]
];
export function resolveExplicitCurrencies(prompt){
 const value=String(prompt||"");
 return [...new Set(EXPLICIT_CURRENCY_RULES.filter(([,pattern])=>pattern.test(value)).map(([code])=>code))];
}
export function resolveExplicitCurrency(prompt){
 const matches=resolveExplicitCurrencies(prompt);
 return matches.length===1?matches[0]:null;
}
export function resolveRegionalDefaults(request){
 const country=String(request?.cf?.country||"").trim().toUpperCase().slice(0,2);
 const regional=COUNTRY_DEFAULTS[country];
 const continent=String(request?.cf?.continent||"").trim().toUpperCase();
 const fallbackCurrency=continent==="EU"?"EUR":"USD";
 const header=String(request?.headers?.get?.("Accept-Language")||"");
 const candidates=header.split(",").map((part,index)=>{
  const pieces=part.trim().split(";"),tag=pieces[0].trim();
  const quality=Number((pieces[1]||"").match(/q=([0-9.]+)/)?.[1]||1);
  return {tag,quality,index};
 }).filter(item=>/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(item.tag)&&Number.isFinite(item.quality))
  .sort((a,b)=>b.quality-a.quality||a.index-b.index);
 let acceptedLocale="";
 for(const item of candidates){try{acceptedLocale=Intl.getCanonicalLocales(item.tag)[0]||"";if(acceptedLocale)break;}catch(_){}}
 return {country:country||null,currency:regional?.[0]||fallbackCurrency,locale:acceptedLocale||regional?.[1]||"en-US",currencySource:regional?"country":continent==="EU"?"continent-default":"global-default"};
}

function json(data,status,origin){
    return new Response(JSON.stringify(data),{
        status:status||200,
        headers:{
            "Content-Type":"application/json; charset=utf-8",
            "Cache-Control":"no-store",
            "Access-Control-Allow-Origin":origin||SITE_ORIGIN,
            "Access-Control-Allow-Headers":"Content-Type, Authorization",
            "Access-Control-Allow-Methods":"POST, OPTIONS",
            "Vary":"Origin"
        }
    });
}
function allowedOrigin(request){
    const origin=request.headers.get("Origin")||new URL(request.url).origin;
    if(origin===SITE_ORIGIN)return origin;
    try{
        const url=new URL(origin);
        if(url.protocol==="https:" && (url.hostname==="worth-it-calculator.pages.dev" || /^[a-z0-9-]+\.worth-it-calculator\.pages\.dev$/.test(url.hostname)))return origin;
    }catch(_){}
    return "";
}
function tokenFrom(request){
    const header=request.headers.get("Authorization")||"";
    return header.startsWith("Bearer ")?header.slice(7).trim():"";
}
async function reserveMakerGeneration(env,token,requestId){
    return normalizeRpcObject(await userRpc(env,token,"reserve_worth_it_ugc_maker_generation_v2",{
        p_request_id:requestId
    }));
}
async function generateWithGemini(apiKey,system,prompt){
    const response=await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(GEMINI_MODEL)+":generateContent",
        {
            method:"POST",
            headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
            body:JSON.stringify({
                systemInstruction:{parts:[{text:system}]},
                contents:[{role:"user",parts:[{text:prompt}]}],
                generationConfig:{temperature:0.15,maxOutputTokens:1300,responseMimeType:"application/json"}
            })
        }
    );
    if(!response.ok){
        const details=await response.text().catch(()=>"");
        throw new Error("Gemini calculator generation failed ("+response.status+"): "+details.slice(0,240));
    }
    const data=await response.json();
    const content=data?.candidates?.[0]?.content?.parts?.map(part=>typeof part?.text==="string"?part.text:"").join("").trim();
    if(!content)throw new Error("Gemini returned an empty calculator definition.");
    return content;
}
async function generateWithGroq(apiKey,system,prompt){
    const groqSystem=[
        system,
        "For this provider's structured response, put the primary category and its subcategories together inside a root field named classification.",
        "The classification object must contain category, subcategory_1, subcategory_2 and subcategory_3. subcategory_1 is mandatory and must be one valid ID from the chosen category. Use null for each unused optional subcategory_2 or subcategory_3 field.",
        "Never use an empty subcategory_1, never mix categories, and never put category or subcategory fields at the root level.",
        "Keep title, description, inputs and results as root fields. The server converts classification into the calculator's saved category fields."
    ].join(" ");
    const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
        body:JSON.stringify({
            model:GROQ_MODEL,
            temperature:0.15,
            max_tokens:1300,
            reasoning_effort:"low",
            response_format:{type:"json_schema",json_schema:GROQ_CALCULATOR_RESPONSE_SCHEMA},
            messages:[{role:"system",content:groqSystem},{role:"user",content:prompt}]
        })
    });
    if(!response.ok){
        const details=await response.text().catch(()=>"");
        throw new Error("Groq calculator generation failed ("+response.status+"): "+details.slice(0,240));
    }
    const data=await response.json();
    const content=data?.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim())throw new Error("Groq returned an empty calculator definition.");
    const generated=content.trim();
    try{
        const parsed=JSON.parse(generated);
        if(parsed?.classification&&typeof parsed.classification==="object"){
            const classification=parsed.classification;
            parsed.category=classification.category;
            parsed.subcategories=Array.isArray(classification.subcategories)
                ? classification.subcategories
                : [classification.subcategory_1,classification.subcategory_2,classification.subcategory_3]
                    .filter(value=>typeof value==="string");
            delete parsed.classification;
            return JSON.stringify(parsed);
        }
    }catch(_){}
    return generated;
}
async function verifyUser(env,token){
    const base=String(env.SUPABASE_URL||"").trim().replace(/\/$/,"");
    const key=String(env.SUPABASE_PUBLISHABLE_KEY||"").trim();
    if(!base||!key)throw new Error("The account service is not configured.");
    const response=await fetch(base+"/auth/v1/user",{
        headers:{apikey:key,Authorization:"Bearer "+token,Accept:"application/json"},
        cache:"no-store"
    });
    if(!response.ok)return null;
    const user=await response.json();
    return user&&user.id?user:null;
}

/* A tiny expression parser: generated formulas are data, never executable JavaScript. */
function compileExpression(source,keys){
    const input=String(source||"");
    let at=0;
    const fail=()=>{throw new Error("The AI returned an unsupported or invalid formula.");};
    const ws=()=>{while(/\s/.test(input[at]||"")&&at<input.length)at++;};
    const take=(value)=>{ws();if(input.slice(at,at+value.length)===value){at+=value.length;return true;}return false;};
    const identifier=()=>{
        ws();const match=input.slice(at).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        if(!match)return null;at+=match[0].length;return match[0];
    };
    function primary(){
        ws();
        if(take("(")){const node=add();if(!take(")"))fail();return node;}
        const rest=input.slice(at);
        const number=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
        if(number){at+=number[0].length;const value=Number(number[0]);if(!Number.isFinite(value))fail();return {type:"number",value};}
        const name=identifier();
        if(!name)fail();
        if(take("(")){
            if(!FUNCTIONS.has(name))fail();
            const args=[];
            if(!take(")")){
                do{args.push(add());}while(take(","));
                if(!take(")"))fail();
            }
            const valid=(name==="min"||name==="max")?args.length>=1:
                name==="pow"?args.length===2:
                name==="round"?args.length>=1&&args.length<=2:args.length===1;
            if(!valid)fail();
            return {type:"call",name,args};
        }
        if(name==="pi")return {type:"number",value:Math.PI};
        if(name==="e")return {type:"number",value:Math.E};
        if(!keys.has(name))fail();
        return {type:"variable",name};
    }
    function power(){
        let left=primary();
        if(take("^"))left={type:"binary",op:"^",left,right:unary()};
        return left;
    }
    function unary(){
        if(take("+"))return {type:"unary",op:"+",value:unary()};
        if(take("-"))return {type:"unary",op:"-",value:unary()};
        return power();
    }
    function multiply(){
        let node=unary();
        while(true){
            if(take("*"))node={type:"binary",op:"*",left:node,right:unary()};
            else if(take("/"))node={type:"binary",op:"/",left:node,right:unary()};
            else return node;
        }
    }
    function add(){
        let node=multiply();
        while(true){
            if(take("+"))node={type:"binary",op:"+",left:node,right:multiply()};
            else if(take("-"))node={type:"binary",op:"-",left:node,right:multiply()};
            else return node;
        }
    }
    const ast=add();ws();if(at!==input.length)fail();return ast;
}
function evaluate(node,values){
    let result;
    if(node.type==="number")return node.value;
    if(node.type==="variable")return Number(values[node.name]);
    if(node.type==="unary"){const value=evaluate(node.value,values);return node.op==="-"?-value:value;}
    if(node.type==="binary"){
        const a=evaluate(node.left,values),b=evaluate(node.right,values);
        if(node.op==="+")result=a+b;
        else if(node.op==="-")result=a-b;
        else if(node.op==="*")result=a*b;
        else if(node.op==="/"){if(b===0)throw new Error("A formula divides by zero for its default values.");result=a/b;}
        else result=Math.pow(a,b);
        return result;
    }
    const args=node.args.map(arg=>evaluate(arg,values));
    if(node.name==="min")result=Math.min(...args);
    else if(node.name==="max")result=Math.max(...args);
    else if(node.name==="abs")result=Math.abs(args[0]);
    else if(node.name==="round")result=args.length===1?Math.round(args[0]):Number(args[0].toFixed(Math.max(0,Math.min(8,Math.floor(args[1])))));
    else if(node.name==="floor")result=Math.floor(args[0]);
    else if(node.name==="ceil")result=Math.ceil(args[0]);
    else if(node.name==="sqrt"){if(args[0]<0)throw new Error("Square root is invalid for the default values.");result=Math.sqrt(args[0]);}
    else if(node.name==="pow")result=Math.pow(args[0],args[1]);
    if(!Number.isFinite(result))throw new Error("A generated formula produces an invalid result.");return result;
}
function findMissingRequestedCoverage(prompt,raw){
 const request=String(prompt||"").toLowerCase();
 const inputs=Array.isArray(raw?.inputs)?raw.inputs:[];
 const results=Array.isArray(raw?.results)?raw.results:[];
 const inputText=inputs.map(item=>String(item?.label||"")+" "+String(item?.key||"")).join(" ").toLowerCase();
 const resultText=results.map(item=>String(item?.label||"")).join(" ").toLowerCase();
 const missing=[];
 const periodRules=[
  {request:/\b(?:weekly|per week|each week|every week)\b/,result:/\b(?:weekly|per week|week)\b/,label:"weekly result"},
  {request:/\b(?:monthly|per month|each month|every month)\b/,result:/\b(?:monthly|per month|month)\b/,label:"monthly result"},
  {request:/\b(?:yearly|annually|annual|per year|each year|every year)\b/,result:/\b(?:yearly|annual|per year|year)\b/,label:"yearly result"},
  {request:/\b(?:per day|each day|every day|daily total|daily expenses?|daily results?|daily cost)\b/,result:/\b(?:daily|per day|day)\b/,label:"daily result"},
  {request:/\b(?:quarterly|per quarter|each quarter)\b/,result:/\b(?:quarterly|per quarter|quarter)\b/,label:"quarterly result"}
 ];
 const requestedPeriodCount=periodRules.filter(rule=>rule.request.test(request)).length;
 const explicitPeriodOutput=
  /\b(?:calculate|show|display|estimate|report|provide|include|break down|work out|give)\b.{0,80}\b(?:weekly|monthly|yearly|annual|annually|daily|quarterly|per week|per month|per year|per day)\b/.test(request)||
  /\b(?:weekly|monthly|yearly|annual|annually|daily|quarterly|per week|per month|per year|per day)\b.{0,80}\b(?:calculate|show|display|estimate|report|provide|include|break down|work out|give)\b/.test(request)||
  /\b(?:weekly|monthly|yearly|annual|annually|daily|quarterly)\s+(?:costs?|expenses?|results?|totals?|figures?|amounts?|breakdown)\b/.test(request)||
  requestedPeriodCount>=2&&/\b(?:costs?|expenses?|results?|totals?|figures?|amounts?)\b/.test(request);
 if(explicitPeriodOutput)periodRules.forEach(rule=>{if(rule.request.test(request)&&!rule.result.test(resultText))missing.push(rule.label);});
 const requestedInputs=[
  {request:/\b(?:fuel consumption|fuel efficiency|consumption rate)\b/,input:/\b(?:fuel|consumption|economy)\b/,label:"fuel consumption input"},
  {request:/\bparking\b/,input:/\bparking\b/,label:"parking input"},
  {request:/\b(?:daily|round[- ]?trip|commuting|commute) distance\b|\bdistance\b/,input:/\b(?:distance|mileage|kilomet(?:er|re)s?|miles?)\b/,label:"distance input"},
  {request:/\bfuel price\b/,input:/\b(?:fuel|gas|petrol|diesel).{0,12}price\b|\bprice.{0,12}(?:fuel|gas|petrol|diesel)\b/,label:"fuel-price input"}
 ];
 requestedInputs.forEach(rule=>{if(rule.request.test(request)&&!rule.input.test(inputText))missing.push(rule.label);});
 if(explicitPeriodOutput&&/\btotal\b/.test(request)){
  periodRules.filter(rule=>rule.request.test(request)).forEach(rule=>{
   const hasPeriodTotal=results.some(item=>{
    const label=String(item?.label||"").toLowerCase();
    return rule.result.test(label)&&/\b(?:total|overall|combined)\b/.test(label);
   });
   if(!hasPeriodTotal)missing.push("total "+rule.label.replace(" result",""));
  });
 }
 return [...new Set(missing)];
}
function normalizeDefinition(raw,defaultCurrency,options={}){
    const previousSpec=options?.previousSpec&&typeof options.previousSpec==="object"?options.previousSpec:null;
    const forceCurrency=/^[A-Z]{3}$/.test(String(options?.forceCurrency||"").toUpperCase())?String(options.forceCurrency).toUpperCase():"";
    const currencyFallback=/^[A-Z]{3}$/.test(String(defaultCurrency||"").toUpperCase())?String(defaultCurrency).toUpperCase():"USD";
    const title=String(raw?.title||"").trim().slice(0,70);
    const description=String(raw?.description||"").trim().slice(0,500);
    const category=String(raw?.category||"other").toLowerCase();
    if(title.length<3||!ALLOWED_CATEGORIES.has(category))throw new Error("The generated calculator details are incomplete.");
    const subcategories=Array.isArray(raw?.subcategories)?Array.from(new Set(raw.subcategories.map(value=>String(value||"").trim().toLowerCase()))):[];
    const allowedSubcategories=ALLOWED_SUBCATEGORIES[category];
    if(subcategories.length<1||subcategories.length>3||subcategories.some(value=>!allowedSubcategories.has(value)))throw new Error("The AI-selected community categories are invalid.");
    if(!Array.isArray(raw?.inputs)||raw.inputs.length<1||raw.inputs.length>12)throw new Error("A calculator must have between 1 and 12 inputs.");
    if(!Array.isArray(raw?.results)||raw.results.length<1||raw.results.length>6)throw new Error("A calculator must have between 1 and 6 results.");
    const seen=new Set();
    const inputs=raw.inputs.map((item)=>{
        const key=String(item?.key||"").trim().toLowerCase();
        const previousInput=Array.isArray(previousSpec?.inputs)?previousSpec.inputs.find(input=>String(input?.key||"")===key):null;
        const label=String(item?.label||"").trim().slice(0,60);
        let min=Number(item?.min),max=Number(item?.max),value=Number(item?.default);
        let step=Number(item?.step??1);
        const semantic=(label+" "+key).toLowerCase();
        const wholeDays=/\b(?:commut(?:e|ing)|work|working|business)\s+days?\b|\bdays?_per_week\b/.test(semantic);
        const mustBePositive=/\b(?:distance|mileage|fuel consumption|consumption|litres? per 100|liters? per 100|hours per week|number of passengers|number of employees)\b/.test(semantic);
        if(!/^[a-z][a-z0-9_]{0,31}$/.test(key)||seen.has(key)||!label||
            !Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(value)||
            min>value||value>max||max-min>1e12||!Number.isFinite(step)||step<=0)throw new Error("The AI generated an invalid input field.");
        if(wholeDays){
            if(!Number.isInteger(value)||!Number.isInteger(max)||!Number.isInteger(step)||value<1||max<value)throw new Error("The AI generated an invalid whole-day input. Use positive whole numbers for days worked or travelled.");
            min=Math.max(1,Math.ceil(min));step=Math.max(1,Math.round(step));
        }else if(mustBePositive&&min<=0){
            if(value<=0)throw new Error("The AI generated a non-positive default for "+label+". Use a positive default for this input.");
            min=Math.min(value,step);
        }
        if(min>value||value>max)throw new Error("The AI generated an invalid range for "+label+".");
        const stepPosition=(value-min)/step;
        if(!Number.isFinite(stepPosition)||Math.abs(stepPosition-Math.round(stepPosition))>1e-7)throw new Error("The default value for "+label+" does not match its input step.");
        const maxStepPosition=(max-min)/step;
        if(max>min&&(!Number.isFinite(maxStepPosition)||Math.abs(maxStepPosition-Math.round(maxStepPosition))>1e-7))throw new Error("The maximum value for "+label+" does not match its input step.");
        const unitWasSupplied=Object.prototype.hasOwnProperty.call(item||{},"unit");
        let unit=String(unitWasSupplied?item.unit:(previousInput?.unit||"")).trim().slice(0,16);
        const monetaryInput=/\b(?:price|cost|amount|fee|salary|income|budget|rent|payment|saving|savings|deposit|expense|spend|wage|tax)\b/.test(semantic);
        if(forceCurrency&&monetaryInput)unit=forceCurrency;
        else if(!unit&&!previousInput&&monetaryInput)unit=currencyFallback;
        seen.add(key);
        return {key,label,min,max,default:value,step,unit};
    });
    const values=Object.fromEntries(inputs.map(item=>[item.key,item.default]));
    const results=raw.results.map((item,index)=>{
        const label=String(item?.label||"").trim().slice(0,70);
        const expression=String(item?.expression||"").trim().slice(0,260);
        const format=["number","currency","percent"].includes(item?.format)?item.format:"number";
        const previousCurrency=Array.isArray(previousSpec?.results)?previousSpec.results[index]?.currency:"";
        const currency=String(format==="currency"&&forceCurrency?forceCurrency:(item?.currency||previousCurrency||currencyFallback)).toUpperCase();
        if(!label||!expression||!/^([A-Z]{3})$/.test(currency))throw new Error("The AI generated an invalid result.");
        const ast=compileExpression(expression,seen);
        return {label,expression,format,currency,prefix:String(item?.prefix||"").slice(0,12),suffix:String(item?.suffix||"").slice(0,16),_ast:ast};
    });
    const scenarios=[{...values},Object.fromEntries(inputs.map(item=>[item.key,item.min])),Object.fromEntries(inputs.map(item=>[item.key,item.max]))];
    inputs.forEach(item=>{const low={...values};low[item.key]=item.min;scenarios.push(low);const high={...values};high[item.key]=item.max;scenarios.push(high);});
    for(let left=0;left<inputs.length;left++){
        for(let right=left+1;right<inputs.length;right++){
            for(const leftValue of [inputs[left].min,inputs[left].max]){
                for(const rightValue of [inputs[right].min,inputs[right].max]){
                    const pair={...values};
                    pair[inputs[left].key]=leftValue;
                    pair[inputs[right].key]=rightValue;
                    scenarios.push(pair);
                }
            }
        }
    }
    results.forEach(item=>{
        scenarios.forEach((sample,index)=>{
            try{evaluate(item._ast,sample);}
            catch(error){throw new Error("The formula for "+item.label+" fails with a default, minimum or maximum input value (test "+(index+1)+"): "+String(error?.message||"invalid result"));}
        });
        delete item._ast;
    });
    if(options?.requireDescription!==false&&description.length<24)throw new Error("The calculator description is too short. Add a clear explanation of what it calculates and its main assumptions (at least 24 characters).");
    return {version:1,subcategories,inputs,results};
}
export async function onRequestOptions(context){
    const origin=allowedOrigin(context.request);
    return new Response(null,{status:origin?204:403,headers:{
        "Access-Control-Allow-Origin":origin||SITE_ORIGIN,
        "Access-Control-Allow-Headers":"Content-Type, Authorization",
        "Access-Control-Allow-Methods":"POST, OPTIONS",
        "Vary":"Origin"
    }});
}

async function userRpc(env,token,functionName,payload){
    const base=String(env.SUPABASE_URL||"").trim().replace(/\/$/,"");
    const key=String(env.SUPABASE_PUBLISHABLE_KEY||"").trim();
    if(!base||!key)throw new Error("The account service is not configured.");
    const response=await fetch(base+"/rest/v1/rpc/"+encodeURIComponent(functionName),{
        method:"POST",
        headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(payload||{}),
        cache:"no-store"
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
        const detail=String(data?.message||data?.details||data?.hint||"");
        const error=new Error(detail||"The account service could not complete this request.");
        error.status=response.status;
        error.code=data?.code||"";
        throw error;
    }
    return data;
}

function normalizeRpcObject(value){
    return Array.isArray(value)&&value.length===1&&value[0]&&typeof value[0]==="object"?value[0]:value;
}

function sameArray(left,right){
    return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>value===right[index]);
}

export async function onRequestPost(context){
    const request=context.request,env=context.env,origin=allowedOrigin(request);
    let editRequestId="";
    let editQuotaSettled=false;
    let editQuotaRefunded=false;
    let makerRequestId="";
    let makerQuotaSettled=false;
    let makerQuotaRefunded=false;
    const token=tokenFrom(request);
    const refundEditQuota=async()=>{
        if(!editRequestId||editQuotaSettled||editQuotaRefunded)return;
        try{
            const result=await userRpc(env,token,"refund_worth_it_ugc_ai_edit",{p_request_id:editRequestId});
            if(result?.ok===true)editQuotaRefunded=true;
        }catch(error){
            console.error("Could not refund a failed UGC AI edit reservation:",error);
        }
    };
    const refundMakerQuota=async()=>{
        if(!makerRequestId||makerQuotaSettled||makerQuotaRefunded)return false;
        try{
            const result=normalizeRpcObject(await userRpc(env,token,"refund_worth_it_ugc_maker_generation_v2",{
                p_request_id:makerRequestId
            }));
            if(result?.ok===true&&(result?.refunded===true||result?.already_refunded===true)){
                makerQuotaRefunded=true;
                return true;
            }
            if(result?.code==="RESERVATION_NOT_FOUND"){
                makerQuotaRefunded=true;
                return true;
            }
            console.error("Could not refund a failed UGC Maker generation:",result?.code||result);
            return false;
        }catch(error){
            console.error("Could not refund a failed UGC Maker generation:",error);
            return false;
        }
    };
    const settleMakerQuota=async()=>{
        if(!makerRequestId||makerQuotaSettled)return;
        const result=normalizeRpcObject(await userRpc(env,token,"settle_worth_it_ugc_maker_generation_v2",{
            p_request_id:makerRequestId
        }));
        if(result?.ok!==true)throw new Error("The AI generation reservation could not be finalized.");
        makerQuotaSettled=true;
    };
    try{
        if(!origin)return json({success:false,error:"Forbidden origin."},403,SITE_ORIGIN);
        if(!token)return json({success:false,code:"AUTH_REQUIRED",error:"Sign in to create or improve a community calculator."},401,origin);

        const user=await verifyUser(env,token);
        if(!user)return json({success:false,code:"AUTH_REQUIRED",error:"Your session has expired. Please sign in again."},401,origin);
        if(!user.email_confirmed_at&&!user.confirmed_at)return json({success:false,code:"EMAIL_VERIFICATION_REQUIRED",error:"Verify your email before creating or improving community calculators."},403,origin);

        let body;
        try{body=await request.json();}catch(_){return json({success:false,error:"A valid JSON request is required."},400,origin);}
        const mode=body?.mode==="refine"?"refine":"create";
        const regionalDefaults=resolveRegionalDefaults(request);
        const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
        if(!prompt||prompt.length>MAX_PROMPT_CHARS)return json({success:false,error:"Describe the requested calculator or improvement in 10 to 1000 characters."},400,origin);
        const requestedCurrencies=resolveExplicitCurrencies(prompt);
        const requestedCurrency=requestedCurrencies.length===1?requestedCurrencies[0]:null;
        const defaultCurrency=requestedCurrency||regionalDefaults.currency;
        const forceCurrency=requestedCurrencies.length>1?"":(requestedCurrency||(mode==="create"?regionalDefaults.currency:""));

        const geminiKey=String(env.GEMINI_API_KEY||"").trim();
        const groqKey=String(env.GROQ_API_KEY||"").trim();
        if(!geminiKey&&!groqKey)return json({success:false,code:"AI_PROVIDER_UNAVAILABLE",error:"Worth It AI is temporarily unavailable. No calculator was changed."},503,origin);

        let existingCalculator=null;
        if(mode==="refine"){
            const calculatorId=String(body?.calculator_id||"").trim().toLowerCase();
            if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(calculatorId)){
                return json({success:false,code:"INVALID_CALCULATOR",error:"Choose a valid saved community calculator to improve."},400,origin);
            }
            let current;
            try{current=normalizeRpcObject(await userRpc(env,token,"get_worth_it_ugc_calculator",{p_id:calculatorId}));}
            catch(error){
                console.warn("UGC AI edit could not load the saved calculator:",error);
                return json({success:false,code:"CALCULATOR_UNAVAILABLE",error:"This calculator could not be loaded. Only your own saved calculators can be improved."},404,origin);
            }
            if(!current?.id||current.is_owner!==true){
                return json({success:false,code:"NOT_CALCULATOR_OWNER",error:"Only the owner of a saved community calculator can improve it with AI."},403,origin);
            }
            if(!current.spec||!Array.isArray(current.spec.inputs)||!Array.isArray(current.spec.results)){
                return json({success:false,code:"INVALID_CALCULATOR",error:"This calculator definition cannot be safely improved."},422,origin);
            }
            existingCalculator=current;
            editRequestId=crypto.randomUUID();
            let reservation;
            try{
                reservation=normalizeRpcObject(await userRpc(env,token,"reserve_worth_it_ugc_ai_edit",{
                    p_id:calculatorId,p_request_id:editRequestId
                }));
            }catch(error){
                console.error("UGC AI edit quota reservation failed:",error);
                editRequestId="";
                return json({success:false,code:"EDIT_QUOTA_UNAVAILABLE",error:"The daily AI improvement allowance could not be checked. Please try again later."},503,origin);
            }
            if(reservation?.ok!==true){
                editRequestId="";
                if(reservation?.code==="DAILY_LIMIT"){
                    return json({success:false,code:"DAILY_AI_EDIT_LIMIT",daily_limit:reservation.daily_limit,edits_used:reservation.edits_used,remaining:0,
                        error:"You have used all your AI improvements for today. Free accounts can improve 2 saved calculators per UTC day, Premium Lite 3 and Premium 4."},429,origin);
                }
                return json({success:false,code:reservation?.code||"EDIT_QUOTA_UNAVAILABLE",error:"The AI improvement could not be reserved. Please try again."},503,origin);
            }
        }else{
            let usage;
            makerRequestId=crypto.randomUUID();
            try{usage=await reserveMakerGeneration(env,token,makerRequestId);}
            catch(error){
                await refundMakerQuota();
                console.error("UGC Maker usage reservation failed:",error);
                return json({success:false,code:"USAGE_LIMIT_UNAVAILABLE",error:"The AI calculator creation allowance could not be checked. Please try again later."},503,origin);
            }
            if(usage?.ok!==true){
                makerRequestId="";
                if(usage?.code==="DAILY_LIMIT")return json({success:false,code:"DAILY_AI_LIMIT",error:"You have reached the daily AI calculator creation limit of 10 generations. Try again after the UTC daily reset.",daily_limit:10,requests_used:10},429,origin);
                return json({success:false,code:"USAGE_LIMIT_UNAVAILABLE",error:"The AI calculator creation allowance is temporarily unavailable. Please try again later."},503,origin);
            }
        }

        const commonRules=[
            "Return only one valid JSON object with keys title, description, category, subcategories, inputs, results.",
            "Never return HTML, Markdown, JavaScript, SQL, code, scripts, event handlers, URLs or executable content.",
            "The result is a declarative calculator schema only. Formula expressions are evaluated by a restricted arithmetic parser.",
            "Choose exactly one primary category: cars, money, technology, home, or other. AI must choose it; users do not choose or override it.",
            "Choose 1 to 3 relevant subcategories from the selected primary category only. Do not invent tags or choose unrelated categories.",
            "cars subcategories: car-ownership, ev-ownership, fuel-costs, vehicle-financing, car-insurance, car-maintenance, depreciation-resale, vehicle-comparison.",
            "money subcategories: budgeting, saving, investing, loans-debt, mortgages, taxes, income-salary, retirement.",
            "technology subcategories: smartphones, computers, gaming, software-subscriptions, internet-connectivity, consumer-electronics, tech-comparison.",
            "home subcategories: utilities-energy, rent-housing, home-buying, renovation-repairs, home-appliances, home-maintenance, household-budget.",
            "other subcategories: travel, education-career, health-fitness, food-groceries, business, lifestyle, general-comparison.",
            "Category compatibility is mandatory: every selected subcategory must come from the exact list belonging to the chosen primary category. Never mix subcategories between categories. If the calculator is mainly about a car, vehicle or fuel, choose cars; if mainly about personal money, budgeting, saving, debt or investing, choose money; if mainly about devices, software or connectivity, choose technology; if mainly about housing, utilities or appliances, choose home; use other only when none of those categories fits.",
            "Before returning JSON, verify that category and all subcategories are a valid combination from the same category list. Do not translate category IDs or invent labels; use the exact lowercase IDs shown above.",
            "Each input has key, label, min, max, default, step, unit. Keys must match ^[a-z][a-z0-9_]{0,31}$ and be unique.",
            "For monetary inputs, set unit to the relevant ISO 4217 currency code. Common choices include EUR, USD, GBP, RSD, CHF, CAD, AUD, JPY, CNY, PLN and CZK.",
            "Each result may use its own ISO 4217 currency code. Currency selection controls formatting only; never imply that different currencies have been converted.",
            "Only calculate currency conversion when an exchange rate is supplied as an explicit numeric input and used in the formula. Never invent or fetch exchange rates.",
            "All numeric values must be finite and min <= default <= max. Keep input ranges realistic and bounded.",
            "Each result has label, expression, format, currency, prefix, suffix.",
            "Expressions may use only input keys, decimal numbers, + - * / ^, parentheses, comma, and functions min,max,abs,round,floor,ceil,sqrt,pow; constants pi and e are allowed.",
            "Do not use assignment, comparisons, strings, arrays, object syntax, property access, or any other function.",
            "For percent values, express percentages in their ordinary human scale (e.g. 5 means 5 percent) and divide by 100 in the formula.",
            "For currency outputs, set format to currency and use a valid ISO 4217 code. If the user names a currency, use it. Otherwise use the regional suggestion "+regionalDefaults.currency+".",
            "For monetary inputs, use the same requested or suggested currency code in unit; never silently mix currencies.",
            "Write the title, description, input labels and result labels in the same language as the user's prompt. If the prompt language is unclear, use the primary Accept-Language language; otherwise use English. Never choose the language from country alone.",
            "For a new calculator, the description must be 24 to 500 characters and use one or two concise, informative sentences: explain what is calculated, the important assumptions or included costs, and what the results represent. During refinement, preserve the existing description exactly, even if it is shorter. Do not add marketing claims or unsupported facts.",
            "Cover every requested output and time period. If the user asks for weekly, monthly and yearly figures, include a separate clearly labelled result row for each requested period. When the user requests a total for a period, its result label must also contain the word total. Do not treat a monthly or annual figure as a substitute for a separately requested weekly or yearly result. Do not silently omit requested inputs or output periods.",
            "Use positive minimums for quantities that cannot logically be zero, such as working days, commute distance and fuel consumption. Use whole-number steps for counts of days or people. Zero is acceptable for optional charges such as parking or fees.",
            "Check every formula at default values, all-minimum values, all-maximum values, and each input's individual minimum and maximum. Avoid divisions by zero, invalid square roots, overflow and non-finite results across the entire allowed input range.",
            "Keep the title within 70 characters and description within 500 characters."
        ];
        let system;
        let userPrompt=[
            "User request:",
            prompt,
            "Regional presentation suggestions (not mandatory): currency "+regionalDefaults.currency+"; number locale "+regionalDefaults.locale+". Use an explicitly requested currency in preference to these suggestions.",
            "Explicitly requested currencies: "+(requestedCurrencies.length?requestedCurrencies.join(", "):"none detected")+". If exactly one is specified, it overrides regional suggestions for all monetary inputs and outputs. If multiple currencies are explicitly requested, preserve the requested multi-currency comparison.",
            "Keep currency selection separate from conversion: these suggestions only affect default units and formatting."
        ].join("\n");
        if(mode==="refine"){
            system=[
                "You are improving a saved Worth It community calculator. This is an edit, not a new calculator.",
                "Preserve the exact title, category, description, subcategories, underlying subject, comparison and purpose from the existing calculator.",
                "Preserve every existing input key in its original order. Do not add, remove, rename or repurpose input keys.",
                "Preserve the exact number, order and labels of all result rows. Improve only input labels, sensible bounds/defaults/steps/units and the formula expressions where useful.",
                "Never turn the saved calculator into a different calculator, even if the user asks you to. Reject unrelated requests by returning the original definition unchanged.",
                "Keep all assumptions explicit and do not invent factual prices, interest rates, tariffs or current market values.",
                "When improving an existing calculator, preserve its existing currency codes and monetary input units unless the user explicitly requests a currency or unit change.",
                ...commonRules
            ].join(" ");
            userPrompt=[
                "Existing saved calculator (its identity and structure must remain fixed):",
                JSON.stringify({
                    title:existingCalculator.title,
                    description:existingCalculator.description||"",
                    category:existingCalculator.category,
                    subcategories:existingCalculator.subcategories||existingCalculator.spec.subcategories||[],
                    inputs:existingCalculator.spec.inputs,
                    results:existingCalculator.spec.results
                }),
                "Requested improvement:",
                prompt,
                "Return the improved full calculator definition. Keep title, description and category exactly unchanged; keep input keys and result labels exactly unchanged."
            ].join("\n");
        }else{
            system=[
                "You design new calculator definitions for the Worth It website.",
                "Create a useful calculator that directly matches the user's described decision or calculation.",
                "Create 2 to 8 useful number inputs where possible (minimum 1, maximum 12), and 1 to 4 result rows (maximum 6).",
                ...commonRules
            ].join(" ");
        }

        let content="";
        let contentProvider="";
        let groqFallbackAttempted=false;
        if(geminiKey){
            try{
                content=await generateWithGemini(geminiKey,system,userPrompt);
                if(content)contentProvider="gemini";
            }catch(error){console.warn("Gemini UGC calculator request failed:",error);}
        }
        if(!content&&groqKey){
            try{
                content=await generateWithGroq(groqKey,system,userPrompt);
                if(content)contentProvider="groq";
            }catch(error){console.error("Groq UGC calculator request failed:",error);}
        }
        if(!content){
            const makerRefunded=mode==="create"?await refundMakerQuota():false;
            await refundEditQuota();
            const error=mode==="create"
                ?(makerRefunded
                    ?"Worth It AI could not complete this request right now. No calculator was changed, and your failed generation attempt was returned to your daily allowance."
                    :"Worth It AI could not complete this request right now. No calculator was changed. We could not confirm that the generation attempt was returned; please contact support before retrying.")
                :"Worth It AI could not complete this request right now. No calculator was changed and no AI edit quota was used.";
            return json({success:false,code:"AI_PROVIDER_UNAVAILABLE",error},503,origin);
        }

        let parsed;
        let definition;
        let validationError=null;
        const parseAndValidate=generatedContent=>{
            const candidate=JSON.parse(generatedContent);
            const normalized=normalizeDefinition(candidate,defaultCurrency,{previousSpec:existingCalculator?.spec,requireDescription:mode!=="refine",forceCurrency});
            return {candidate,normalized};
        };
        try{
            const validated=parseAndValidate(content);
            parsed=validated.candidate;
            definition=validated.normalized;
        }catch(error){
            validationError=error;
        }

        // Gemini's JSON mode guarantees JSON syntax, not category/subcategory compatibility.
        // Retry a rejected Gemini draft with Groq's category-specific strict schema once,
        // keeping the same Maker reservation for this generation request.
        if(validationError&&mode==="create"&&contentProvider==="gemini"&&groqKey){
            groqFallbackAttempted=true;
            console.warn("Gemini UGC calculator output failed validation; trying strict Groq fallback:",validationError);
            try{
                content=await generateWithGroq(groqKey,system,userPrompt);
                contentProvider="groq";
                const validated=parseAndValidate(content);
                parsed=validated.candidate;
                definition=validated.normalized;
                validationError=null;
            }catch(error){
                validationError=error;
                console.error("Groq UGC calculator validation fallback failed:",error);
            }
        }
        if(validationError){
            await refundMakerQuota();
            await refundEditQuota();
            const invalidJson=validationError instanceof SyntaxError;
            return json({
                success:false,
                code:invalidJson?"INVALID_AI_JSON":"INVALID_AI_CALCULATOR",
                error:validationError?.message||"The AI returned an invalid calculator definition."
            },invalidJson?502:422,origin);
        }

        if(mode==="refine"){
            const originalKeys=existingCalculator.spec.inputs.map(item=>String(item.key));
            const refinedKeys=definition.inputs.map(item=>String(item.key));
            const originalLabels=existingCalculator.spec.results.map(item=>String(item.label));
            const refinedLabels=definition.results.map(item=>String(item.label));
            const originalSubcategories=existingCalculator.subcategories||existingCalculator.spec.subcategories||[];
            const identityIsPreserved=
                String(parsed.title||"").trim()===String(existingCalculator.title||"").trim()&&
                String(parsed.description||"").trim()===String(existingCalculator.description||"").trim()&&
                String(parsed.category||"").toLowerCase()===String(existingCalculator.category||"").toLowerCase()&&
                sameArray(definition.subcategories,originalSubcategories)&&
                sameArray(refinedKeys,originalKeys)&&sameArray(refinedLabels,originalLabels);
            if(!identityIsPreserved){
                await refundEditQuota();
                return json({success:false,code:"CALCULATOR_IDENTITY_CHANGED",
                    error:"Worth It AI tried to change the calculator's identity. That update was rejected; your saved calculator is unchanged and the AI edit was refunded."},422,origin);
            }
            let settled;
            try{settled=normalizeRpcObject(await userRpc(env,token,"settle_worth_it_ugc_ai_edit",{p_request_id:editRequestId}));}
            catch(error){console.error("Could not settle the UGC AI edit quota:",error);settled=null;}
            if(settled?.ok!==true){
                await refundEditQuota();
                return json({success:false,code:"EDIT_QUOTA_SETTLEMENT_FAILED",error:"The AI improvement could not be confirmed. Your saved calculator was not changed; please refresh and try again."},503,origin);
            }
            editQuotaSettled=true;
            return json({success:true,mode:"refine",regionalDefaults,calculator:{
                title:existingCalculator.title,
                description:existingCalculator.description||"",
                category:existingCalculator.category,
                spec:definition
            }},200,origin);
        }

        let missingCoverage=findMissingRequestedCoverage(prompt,parsed);
        if(missingCoverage.length&&mode==="create"&&groqKey&&!groqFallbackAttempted){
            groqFallbackAttempted=true;
            console.warn("Gemini UGC calculator omitted requested coverage; trying targeted Groq regeneration:",missingCoverage);
            try{
                const coverageRepairPrompt=[
                    "Original user request:",
                    prompt,
                    "",
                    "The previous draft was rejected because it omitted these explicitly requested items:",
                    ...missingCoverage.map(item=>"- "+item),
                    "",
                    "Generate a complete replacement calculator definition. Do not merely explain the missing items.",
                    "Add a real result row with a valid formula for every missing output period. Result labels must clearly contain the requested period (for example, Weekly total and Yearly total).",
                    "When a period total is requested, include the word total in that result label.",
                    "Keep all original requested inputs, assumptions, comparisons, and other requested outputs. Do not silently omit any requirement."
                ].join("\n");
                content=await generateWithGroq(groqKey,system,coverageRepairPrompt);
                contentProvider="groq";
                const validated=parseAndValidate(content);
                parsed=validated.candidate;
                definition=validated.normalized;
                missingCoverage=findMissingRequestedCoverage(prompt,parsed);
            }catch(error){
                validationError=error;
                console.error("Groq UGC calculator coverage fallback failed:",error);
            }
        }
        if(validationError){
            await refundMakerQuota();
            await refundEditQuota();
            const invalidJson=validationError instanceof SyntaxError;
            return json({
                success:false,
                code:invalidJson?"INVALID_AI_JSON":"INVALID_AI_CALCULATOR",
                error:validationError?.message||"The AI returned an invalid calculator definition."
            },invalidJson?502:422,origin);
        }
        if(missingCoverage.length){
            await refundMakerQuota();
            return json({success:false,code:"INCOMPLETE_CALCULATOR",
                error:"The generated calculator is missing requested coverage: "+missingCoverage.join(", ")+". Please generate it again with those items included."},422,origin);
        }
        try{await settleMakerQuota();}
        catch(error){
            console.error("Could not settle the UGC Maker generation quota:",error);
            await refundMakerQuota();
            return json({success:false,code:"MAKER_QUOTA_SETTLEMENT_FAILED",error:"The generated calculator could not be finalized. No calculator was changed; please try again later."},503,origin);
        }
        return json({success:true,mode:"create",regionalDefaults,calculator:{
            title:String(parsed.title).trim().slice(0,70),
            description:String(parsed.description||"").trim().slice(0,500),
            category:String(parsed.category).toLowerCase(),
            spec:definition
        }},200,origin);
    }catch(error){
        await refundMakerQuota();
        await refundEditQuota();
        console.error("UGC calculator request failed:",error);
        return json({success:false,error:"The AI calculator service is temporarily unavailable. Please try again."},503,origin||SITE_ORIGIN);
    }
}
