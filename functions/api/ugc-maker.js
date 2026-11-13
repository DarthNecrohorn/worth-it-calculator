import "../../ugc-calculator-currency-data.js";
import "../../ugc-calculator-engine.js";
import "../../ugc-blueprint-import.js";
import { validateCalculatorForServer } from "../lib/ugc-calculator-validation.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const GROQ_MODEL = "openai/gpt-oss-120b";
const GEMINI_MODEL = "gemini-3.8-flash";
const MAX_PROMPT_CHARS = 1000;
const UGC_MAKER_DIAGNOSTIC_VERSION = "2026-11-11-autonomous-quality-v3";
const serverCurrencyData=globalThis.WorthItCalculatorCurrencyData;
const serverEngineApi=globalThis.WorthItCalculatorEngine;
if(!serverCurrencyData?.currencies||!serverCurrencyData?.historicalCurrencies||serverEngineApi?.apiVersion!==1){
    throw new Error("The shared Worth It calculator engine or currency metadata could not be loaded.");
}
const SERVER_CALCULATOR_ENGINE=serverEngineApi.create(serverCurrencyData);
const SERVER_SUPPORTED_CURRENCY_CODES=new Set([
    ...serverCurrencyData.currencies,...serverCurrencyData.historicalCurrencies
].map(item=>String(item[0]||"").toUpperCase()));
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
                type: "object",
                properties: {
                    category: { type: "string", enum: [...ALLOWED_CATEGORIES] },
                    subcategories: {
                        type: "array",
                        minItems: 1,
                        maxItems: 3,
                        items: {
                            type: "string",
                            enum: [...new Set(Object.values(ALLOWED_SUBCATEGORIES).flatMap(values=>[...values]))]
                        }
                    }
                },
                required: ["category","subcategories"],
                additionalProperties: false
            },
            inputs: {
                type: "array",
                minItems: 1,
                maxItems: 24,
                items: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        min: { type: "number" },
                        max: { type: "number" },
                        default: { type: "number" },
                        step: { type: "number" },
                        unit: { type: "string" },
                        control: { type: "string", enum: ["number","slider","select","toggle"] },
                        choices: {
                            type: "array",
                            maxItems: 12,
                            items: {
                                type: "object",
                                properties: {
                                    label: { type: "string" },
                                    value: { type: "number" }
                                },
                                required: ["label","value"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ["key","label","min","max","default","step","unit","control","choices"],
                    additionalProperties: false
                }
            },
            groups: {
                type: "array",
                maxItems: 4,
                items: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        itemLabel: { type: "string" },
                        minItems: { type: "integer" },
                        maxItems: { type: "integer" },
                        fields: {
                            type: "array",
                            minItems: 1,
                            maxItems: 6,
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
                        }
                    },
                    required: ["key","label","itemLabel","minItems","maxItems","fields"],
                    additionalProperties: false
                }
            },
            results: {
                type: "array",
                minItems: 1,
                maxItems: 20,
                items: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        expression: { type: "string" },
                        format: { type: "string", enum: ["number","currency","percent","unit"] },
                        currency: { type: "string" },
                        unit: { type: "string" },
                        prefix: { type: "string" },
                        suffix: { type: "string" },
                        explanation: { type: "string" }
                    },
                    required: ["key","label","expression","format","currency","unit","prefix","suffix","explanation"],
                    additionalProperties: false
                }
            },
            scenarios: {
                type: "array",
                maxItems: 3,
                items: {
                    type: "object",
                    properties: {
                        label: { type: "string" },
                        overrides: {
                            type: "array",
                            minItems: 1,
                            maxItems: 24,
                            items: {
                                type: "object",
                                properties: {
                                    key: { type: "string" },
                                    value: { type: "number" }
                                },
                                required: ["key","value"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: ["label","overrides"],
                    additionalProperties: false
                }
            }
        },
        required: ["title","description","classification","inputs","groups","results","scenarios"],
        additionalProperties: false
    }
};
const V2_VALUE_SCHEMA={
    anyOf:[{type:"number"},{type:"boolean"},{type:"string"}]
};
const V2_CHOICE_SCHEMA={
    type:"object",
    properties:{label:{type:"string"},value:{anyOf:[{type:"number"},{type:"string"}]}},
    required:["label","value"],
    additionalProperties:false
};
const V2_TYPED_DEFINITION_SCHEMA={
    type:"object",
    properties:{
        key:{type:"string"},label:{type:"string"},
        type:{type:"string",enum:["number","boolean","enum","date"]},
        control:{type:["string","null"],enum:["number","slider","select","toggle","date",null]},
        min:{type:["number","null"]},max:{type:["number","null"]},default:V2_VALUE_SCHEMA,
        step:{type:["number","null"]},unit:{type:["string","null"]},
        choices:{type:"array",maxItems:12,items:V2_CHOICE_SCHEMA},
        minDate:{type:["string","null"]},maxDate:{type:["string","null"]}
    },
    required:["key","label","type","control","min","max","default","step","unit","choices","minDate","maxDate"],
    additionalProperties:false
};
const V2_TYPED_FIELD_SCHEMA={
    type:"object",
    properties:{
        key:{type:"string"},label:{type:"string"},
        type:{type:"string",enum:["number","boolean","enum","date"]},
        min:{type:["number","null"]},max:{type:["number","null"]},default:V2_VALUE_SCHEMA,
        step:{type:["number","null"]},unit:{type:["string","null"]},
        choices:{type:"array",maxItems:12,items:V2_CHOICE_SCHEMA},
        minDate:{type:["string","null"]},maxDate:{type:["string","null"]}
    },
    required:["key","label","type","min","max","default","step","unit","choices","minDate","maxDate"],
    additionalProperties:false
};
const GROQ_TYPED_V2_BLUEPRINT_SCHEMA={
    name:"worth_it_typed_v2_calculator",strict:true,
    schema:{
        type:"object",
        properties:{
            blueprintVersion:{type:"integer",enum:[2]},title:{type:"string"},description:{type:"string"},
            category:{type:"string",enum:[...ALLOWED_CATEGORIES]},
            subcategories:{type:"array",minItems:1,maxItems:3,items:{type:"string",enum:[...new Set(Object.values(ALLOWED_SUBCATEGORIES).flatMap(values=>[...values]))]}},
            assumptions:{type:"array",maxItems:50,items:{type:"string"}},
            spec:{
                type:"object",
                properties:{
                    schemaVersion:{type:"integer",enum:[2]},engineVersion:{type:"integer",enum:[2]},
                    inputs:{type:"array",minItems:1,maxItems:24,items:V2_TYPED_DEFINITION_SCHEMA},
                    groups:{type:"array",maxItems:4,items:{
                        type:"object",
                        properties:{
                            key:{type:"string"},label:{type:"string"},itemLabel:{type:"string"},
                            minItems:{type:"integer"},maxItems:{type:"integer"},
                            fields:{type:"array",minItems:1,maxItems:6,items:V2_TYPED_FIELD_SCHEMA}
                        },
                        required:["key","label","itemLabel","minItems","maxItems","fields"],additionalProperties:false
                    }},
                    results:{type:"array",minItems:1,maxItems:20,items:{
                        type:"object",
                        properties:{
                            key:{type:"string"},label:{type:"string"},expression:{type:"string"},
                            format:{type:"string",enum:["number","currency","percent","unit"]},
                            currency:{type:["string","null"]},unit:{type:["string","null"]},
                            prefix:{type:"string"},suffix:{type:"string"},explanation:{type:"string"}
                        },
                        required:["key","label","expression","format","currency","unit","prefix","suffix","explanation"],
                        additionalProperties:false
                    }},
                    scenarios:{type:"array",maxItems:3,items:{
                        type:"object",
                        properties:{label:{type:"string"},overrides:{type:"array",minItems:1,maxItems:24,items:{
                            type:"object",properties:{key:{type:"string"},value:V2_VALUE_SCHEMA},
                            required:["key","value"],additionalProperties:false
                        }}},
                        required:["label","overrides"],additionalProperties:false
                    }}
                },
                required:["schemaVersion","engineVersion","inputs","groups","results","scenarios"],additionalProperties:false
            }
        },
        required:["blueprintVersion","title","description","category","subcategories","assumptions","spec"],additionalProperties:false
    }
};

const COUNTRY_DEFAULTS = {
 US:["USD","en-US"],GB:["GBP","en-GB"],CA:["CAD","en-CA"],AU:["AUD","en-AU"],NZ:["NZD","en-NZ"],
 CH:["CHF","de-CH"],JP:["JPY","ja-JP"],CN:["CNY","zh-CN"],IN:["INR","en-IN"],PL:["PLN","pl-PL"],
 CZ:["CZK","cs-CZ"],HU:["HUF","hu-HU"],SE:["SEK","sv-SE"],NO:["NOK","nb-NO"],DK:["DKK","da-DK"],
 IS:["ISK","is-IS"],TR:["TRY","tr-TR"],BR:["BRL","pt-BR"],MX:["MXN","es-MX"],ZA:["ZAR","en-ZA"],
 SG:["SGD","en-SG"],HK:["HKD","zh-HK"],KR:["KRW","ko-KR"],AE:["AED","ar-AE"],SA:["SAR","ar-SA"],
 BG:["EUR","bg-BG"],RS:["RSD","sr-Latn-RS"],ME:["EUR","sr-Latn-ME"],XK:["EUR","sq-XK"],
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

const PROMPT_COUNTRY_ALIASES = [
 ["DE",["germany","german"]],
 ["RS",["serbia","serbian"]],
 ["AT",["austria","austrian"]],
 ["CH",["switzerland","swiss"]],
 ["FR",["france","french"]],
 ["IT",["italy","italian"]],
 ["ES",["spain","spanish"]],
 ["PT",["portugal","portuguese"]],
 ["NL",["netherlands","dutch"]],
 ["BE",["belgium","belgian"]],
 ["IE",["ireland","irish"]],
 ["PL",["poland","polish"]],
 ["CZ",["czechia","czech republic","czech"]],
 ["HU",["hungary","hungarian"]],
 ["RO",["romania","romanian"]],
 ["BG",["bulgaria","bulgarian"]],
 ["HR",["croatia","croatian"]],
 ["SI",["slovenia","slovenian"]],
 ["SK",["slovakia","slovak"]],
 ["GR",["greece","greek"]],
 ["SE",["sweden","swedish"]],
 ["NO",["norway","norwegian"]],
 ["DK",["denmark","danish"]],
 ["FI",["finland","finnish"]],
 ["IS",["iceland","icelandic"]],
 ["GB",["united kingdom","great britain","britain","british"]],
 ["US",["united states","united states of america","american"]],
 ["CA",["canada","canadian"]],
 ["AU",["australia","australian"]],
 ["NZ",["new zealand"]],
 ["JP",["japan","japanese"]],
 ["CN",["china","chinese"]],
 ["IN",["india","indian"]],
 ["TR",["turkey","türkiye","turkish"]],
 ["BR",["brazil","brazilian"]],
 ["MX",["mexico","mexican"]],
 ["ZA",["south africa","south african"]],
 ["SG",["singapore"]],
 ["HK",["hong kong"]],
 ["KR",["south korea","korea","south korean"]],
 ["AE",["united arab emirates","uae"]],
 ["SA",["saudi arabia","saudi"]]
];
export function resolvePromptCountry(prompt){
 const value=String(prompt||"").toLowerCase();
 const found=new Set();
 for(const [code,aliases] of PROMPT_COUNTRY_ALIASES){
  if(aliases.some(alias=>{
   const phrase=alias.toLowerCase().replace(/\s+/g,"\\s+");
   return new RegExp("(^|[^a-z])"+phrase+"([^a-z]|$)","i").test(value);
  }))found.add(code);
 }
 return found.size===1?[...found][0]:null;
}
export function resolveRegionalDefaults(request,prompt=""){
 const promptCountry=resolvePromptCountry(prompt);
 const country=promptCountry||String(request?.cf?.country||"").trim().toUpperCase().slice(0,2);
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
 return {country:country||null,currency:regional?.[0]||fallbackCurrency,locale:acceptedLocale||regional?.[1]||"en-US",currencySource:promptCountry?"prompt-country":regional?"country":continent==="EU"?"continent-default":"global-default"};
}

function json(data,status,origin){
    return new Response(JSON.stringify(data),{
        status:status||200,
        headers:{
            "Content-Type":"application/json; charset=utf-8",
            "Cache-Control":"no-store",
            "Access-Control-Allow-Origin":origin||SITE_ORIGIN,
            "Access-Control-Allow-Headers":"Content-Type, Authorization",
            "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
            "Vary":"Origin"
        }
    });
}

function nullableUsageNumber(value){
    const number=Number(value);
    return value!==null&&value!==undefined&&value!==""&&Number.isFinite(number)?number:null;
}
export function createAiUsageCollector(){
    return {attempts:[]};
}
export function recordAiUsageAttempt(collector,attempt){
    if(!collector||!Array.isArray(collector.attempts))return;
    const inputTokens=nullableUsageNumber(attempt.inputTokens);
    const cachedInputTokens=nullableUsageNumber(attempt.cachedInputTokens);
    const cacheUsageKnown=inputTokens!==null&&cachedInputTokens!==null;
    const boundedCachedInputTokens=cacheUsageKnown?Math.min(inputTokens,cachedInputTokens):null;
    collector.attempts.push({
        provider:String(attempt.provider||"unknown"),
        model:String(attempt.model||"unknown"),
        stage:String(attempt.stage||"generation"),
        success:attempt.success===true,
        durationMs:Math.max(0,Math.round(Number(attempt.durationMs)||0)),
        inputTokens,
        outputTokens:nullableUsageNumber(attempt.outputTokens),
        thinkingTokens:nullableUsageNumber(attempt.thinkingTokens),
        totalTokens:nullableUsageNumber(attempt.totalTokens),
        cachedInputTokens,
        uncachedInputTokens:cacheUsageKnown?Math.max(0,inputTokens-boundedCachedInputTokens):null,
        cacheHitRatePercent:cacheUsageKnown&&inputTokens>0
            ?Number((boundedCachedInputTokens/inputTokens*100).toFixed(2))
            :cacheUsageKnown?0:null,
        finishReason:typeof attempt.finishReason==="string"?attempt.finishReason:null,
        httpStatus:nullableUsageNumber(attempt.httpStatus)
    });
}
export function summarizeAiUsage(collector){
    const attempts=Array.isArray(collector?.attempts)?collector.attempts:[];
    const sumKnown=key=>{
        const values=attempts.map(item=>item?.[key]).filter(value=>typeof value==="number"&&Number.isFinite(value));
        return values.length?values.reduce((sum,value)=>sum+value,0):null;
    };
    const inputAttempts=attempts.filter(item=>typeof item?.inputTokens==="number"&&Number.isFinite(item.inputTokens));
    const cacheUsageComplete=inputAttempts.length>0&&inputAttempts.every(item=>
        typeof item?.cachedInputTokens==="number"&&Number.isFinite(item.cachedInputTokens)
    );
    const inputTokens= sumKnown("inputTokens");
    const cachedInputTokens= cacheUsageComplete?sumKnown("cachedInputTokens"):null;
    const uncachedInputTokens=cacheUsageComplete&&inputTokens!==null&&cachedInputTokens!==null
        ?Math.max(0,inputTokens-cachedInputTokens)
        :null;
    const cacheHitRatePercent=cacheUsageComplete&&inputTokens>0&&cachedInputTokens!==null
        ?Number((Math.min(inputTokens,cachedInputTokens)/inputTokens*100).toFixed(2))
        :cacheUsageComplete&&inputTokens===0?0:null;
    return {
        attemptCount:attempts.length,
        attempts:attempts.map(item=>({...item})),
        totals:{
            inputTokens,
            outputTokens:sumKnown("outputTokens"),
            thinkingTokens:sumKnown("thinkingTokens"),
            totalTokens:sumKnown("totalTokens"),
            cachedInputTokens,
            uncachedInputTokens,
            cacheHitRatePercent,
            requestsWithUsage:attempts.filter(item=>["inputTokens","outputTokens","thinkingTokens","totalTokens","cachedInputTokens"].some(key=>typeof item?.[key]==="number")).length,
            totalProviderDurationMs:attempts.reduce((sum,item)=>sum+(Number(item?.durationMs)||0),0)
        }
    };
}
function jsonWithAiUsage(data,status,origin,collector){
    const aiUsage=summarizeAiUsage(collector);
    return json(aiUsage.attemptCount?{...data,aiUsage}:data,status,origin);
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
async function reserveAiOperation(env,token,requestId,mode,calculatorId){
    return normalizeRpcObject(await userRpc(env,token,"reserve_worth_it_ugc_ai_operation",{
        p_request_id:requestId,p_mode:mode,p_calculator_id:calculatorId||null
    }));
}
async function refundAiOperationReservation(env,token,requestId,mode){
    return normalizeRpcObject(await userRpc(env,token,"refund_worth_it_ugc_ai_operation",{
        p_request_id:requestId,p_mode:mode
    }));
}
async function settleAiOperationReservation(env,token,requestId,mode){
    return normalizeRpcObject(await userRpc(env,token,"settle_worth_it_ugc_ai_operation",{
        p_request_id:requestId,p_mode:mode
    }));
}
async function generateWithGemini(apiKey,system,prompt,usageCollector,stage="initial-generation"){
    const startedAt=Date.now();
    let data=null,httpStatus=null,recorded=false;
    const record=(success)=>{
        if(recorded)return;
        const usage=data?.usageMetadata||{};
        recordAiUsageAttempt(usageCollector,{
            provider:"gemini",
            model:data?.modelVersion||GEMINI_MODEL,
            stage,
            success,
            durationMs:Date.now()-startedAt,
            inputTokens:usage.promptTokenCount,
            outputTokens:usage.candidatesTokenCount,
            thinkingTokens:usage.thoughtsTokenCount,
            totalTokens:usage.totalTokenCount,
            cachedInputTokens:usage.cachedContentTokenCount,
            finishReason:data?.candidates?.[0]?.finishReason||null,
            httpStatus
        });
        recorded=true;
    };
    try{
        const response=await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(GEMINI_MODEL)+":generateContent",
            {
                method:"POST",
                headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
                body:JSON.stringify({
                    systemInstruction:{parts:[{text:system}]},
                    contents:[{role:"user",parts:[{text:prompt}]}],
                    generationConfig:{maxOutputTokens:8192,responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"high"}}
                })
            }
        );
        httpStatus=response.status;
        if(!response.ok){
            const details=await response.text().catch(()=>"");
            throw new Error("Gemini calculator generation failed ("+response.status+"): "+details.slice(0,240));
        }
        data=await response.json();
        const candidate=data?.candidates?.[0];
        if(candidate?.finishReason==="MAX_TOKENS")throw new Error("Gemini calculator output reached the token limit and was truncated.");
        const content=candidate?.content?.parts?.map(part=>typeof part?.text==="string"?part.text:"").join("").trim();
        if(!content)throw new Error("Gemini returned an empty calculator definition.");
        record(true);
        return content;
    }catch(error){
        record(false);
        throw error;
    }
}
async function generateWithGroq(apiKey,system,prompt,usageCollector,stage="initial-generation",schemaVersion=1){
    const startedAt=Date.now();
    let data=null,httpStatus=null,recorded=false;
    const record=(success)=>{
        if(recorded)return;
        const usage=data?.usage||{};
        recordAiUsageAttempt(usageCollector,{
            provider:"groq",
            model:data?.model||GROQ_MODEL,
            stage,
            success,
            durationMs:Date.now()-startedAt,
            inputTokens:usage.prompt_tokens,
            outputTokens:usage.completion_tokens,
            thinkingTokens:usage.completion_tokens_details?.reasoning_tokens,
            totalTokens:usage.total_tokens,
            cachedInputTokens:usage.prompt_tokens_details?.cached_tokens,
            finishReason:data?.choices?.[0]?.finish_reason||null,
            httpStatus
        });
        recorded=true;
    };
    try{
        const typedV2=Number(schemaVersion)===2;
        const groqSystem=typedV2?[
            system,
            "For this provider use the canonical Blueprint V2 root: blueprintVersion, title, description, category, subcategories, assumptions, spec. Never use classification or the V1 numeric schema.",
            "spec must contain schemaVersion 2, engineVersion 2, inputs, groups, results and scenarios.",
            "Every typed input includes key, label, type, control, min, max, default, step, unit, choices, minDate and maxDate. Set irrelevant optional values to null and unused choice arrays to []. Use strict number, boolean, enum and date types. Numeric controls are number, slider or select; boolean uses toggle; enum uses select; date uses date.",
            "Every dynamic group field uses the typed field shape without a control property. Number fields require finite bounds/default/step and a unit string. Boolean defaults are JSON booleans, enum values are strings and dates are YYYY-MM-DD.",
            "Provider-specific scenario shape: scenarios contain label and overrides arrays of {key,value}. The server converts these into canonical spec.scenarios[].values. Preserve primitive types exactly.",
            "For monetary numeric values without an explicit prompt amount, use number controls and zero defaults. Never put monetary amounts in enum or boolean values.",
            "All values must obey the full V2 contract in the system instructions. Null is only a placeholder for irrelevant optional schema properties, never a calculator value."
        ].join(" "):[
            system,
            "For this provider, the root JSON object must have exactly these keys: title, description, classification, inputs, groups, results and scenarios. This provider-specific root shape overrides the shared prompt's generic category/subcategories root-field instruction.",
            "Put the primary category and its subcategories together inside the root field named classification.",
            "The classification object must contain exactly category and subcategories. category must be one of cars, money, technology, home or other. subcategories must be an array containing 1 to 3 valid lowercase IDs from the selected category only.",
            "Never use an empty subcategories array, never mix subcategories from different categories, and never put category or subcategory fields at the root level.",
            "Keep title, description, inputs, groups, results and scenarios as root fields. Use empty arrays when no dynamic groups or comparison scenarios are needed. The server converts classification into the calculator's saved category fields."
        ].join(" ");
        const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
            method:"POST",
            headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
            body:JSON.stringify({
                model:GROQ_MODEL,
                temperature:0.15,
                max_tokens:8192,
                reasoning_effort:"high",
                response_format:{type:"json_schema",json_schema:typedV2?GROQ_TYPED_V2_BLUEPRINT_SCHEMA:GROQ_CALCULATOR_RESPONSE_SCHEMA},
                messages:[{role:"system",content:groqSystem},{role:"user",content:prompt}]
            })
        });
        httpStatus=response.status;
        if(!response.ok){
            const details=await response.text().catch(()=>"");
            throw new Error("Groq calculator generation failed ("+response.status+"): "+details.slice(0,240));
        }
        data=await response.json();
        const choice=data?.choices?.[0];
        if(choice?.finish_reason==="length")throw new Error("Groq calculator output reached the token limit and was truncated.");
        const content=choice?.message?.content;
        if(typeof content!=="string"||!content.trim())throw new Error("Groq returned an empty calculator definition.");
        const generated=content.trim();
        let normalized=generated;
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
                normalized=JSON.stringify(parsed);
            }
        }catch(_){}
        record(true);
        return normalized;
    }catch(error){
        record(false);
        throw error;
    }
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

/* Formula parsing, evaluation and unit validation are provided by the shared engine. */
function extractRequestedResultItems(prompt){
 const match=String(prompt||"").match(/\bresults?\s*:\s*([\s\S]*?)(?=\r?\n\s*\r?\n|\r?\n\s*(?:use|formulas?|assumptions?|notes?|requirements?)\b|$)/i);
 if(!match)return [];
 return match[1].split(/\r?\n|;/)
  .map(item=>item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,"").replace(/[.!?]+$/,"").trim())
  .filter(item=>item.length>=3&&item.length<=160)
  .slice(0,12);
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
 // Keep total coverage scoped to the same requested output clause; an average weekly figure is not a weekly total.
 const requestClauses=request
  .split(/(?:\r?\n|;|(?<=[.!?])\s+)/)
  .map(clause=>clause.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,"").trim())
  .filter(Boolean);
 if(explicitPeriodOutput){
  const totalPeriodAliases={
   "weekly result":/\b(?:weekly|per week|each week|every week)\b/,
   "monthly result":/\b(?:monthly|per month|each month|every month)\b/,
   "yearly result":/\b(?:yearly|annual|annually|per year|each year|every year)\b/,
   "daily result":/\b(?:daily|per day|each day|every day)\b/,
   "quarterly result":/\b(?:quarterly|per quarter|each quarter)\b/
  };
  periodRules.filter(rule=>rule.request.test(request)).forEach(rule=>{
   const period=totalPeriodAliases[rule.label];
   const explicitlyRequestsTotal=requestClauses.some(clause=>
    /\b(?:total|overall|combined)\b/.test(clause)&&period.test(clause)
   );
   if(!explicitlyRequestsTotal)return;
   const hasPeriodTotal=results.some(item=>{
    const label=String(item?.label||"").toLowerCase();
    return rule.result.test(label)&&/\b(?:total|overall|combined)\b/.test(label);
   });
   if(!hasPeriodTotal)missing.push("total "+rule.label.replace(" result",""));
  });
 }
 return [...new Set(missing)];
}
export async function onRequestGet(context){
 const request=context.request;
 const origin=allowedOrigin(request);
 if(!origin)return json({success:false,error:"This Preview diagnostic is available only from a Worth It Pages origin."},403,SITE_ORIGIN);
 const url=new URL(request.url);
 if(url.searchParams.get("diagnostic")!=="coverage")return json({success:false,error:"Use diagnostic=coverage."},405,origin);
 const prompt=url.searchParams.get("prompt")||"";
 if(!prompt||prompt.length>MAX_PROMPT_CHARS)return json({success:false,error:"Provide the calculator prompt (up to 1000 characters)."},400,origin);
 const requestedResultItems=extractRequestedResultItems(prompt);
 let suppliedLabels=[];
 const rawLabels=url.searchParams.get("labels");
 if(rawLabels){
  try{
   const parsed=JSON.parse(rawLabels);
   if(Array.isArray(parsed))suppliedLabels=parsed.map(value=>String(value||"").trim()).filter(Boolean).slice(0,12);
  }catch(_){return json({success:false,error:"The labels parameter must be a JSON array of result labels."},400,origin);}
 }
 const labelsToTest=suppliedLabels.length?suppliedLabels:requestedResultItems;
 const sampleInputs=[
  {key:"monthly_distance",label:"Monthly distance driven"},
  {key:"fuel_consumption",label:"Fuel consumption"},
  {key:"fuel_price",label:"Fuel price per liter"},
  {key:"parking",label:"Monthly parking"}
 ];
 const missingCoverage=findMissingRequestedCoverage(prompt,{inputs:sampleInputs,results:labelsToTest.map(label=>({label}))});
 return json({
  success:true,
  diagnostic:"ugc-maker-output-coverage",
  build:UGC_MAKER_DIAGNOSTIC_VERSION,
  promptLength:prompt.length,
  requestedResultItems,
  testedResultLabels:labelsToTest,
  missingCoverage,
  passed:missingCoverage.length===0
 },200,origin);
}
const MONETARY_CURRENCY_CODES = new Set([
    ...EXPLICIT_CURRENCY_RULES.map(([code])=>code),
    ...Object.values(COUNTRY_DEFAULTS).map(([code])=>code),
    "BGN","RON","UAH","ILS","THB","IDR","MYR","PHP","VND","QAR","KWD","JOD","EGP","PKR","BDT","NGN","KES"
]);
function normalizeMonetaryPromptText(value){
    return String(value||"").toLowerCase()
        .replace(/m³/g,"m3")
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[^a-z0-9]+/g," ").trim();
}
function extractExplicitMonetaryAmounts(prompt){
    const codeList=[...MONETARY_CURRENCY_CODES].join("|");
    const words="(?:serbian dinars?|dinars?|rsd|euros?|eur|us dollars?|dollars?|usd|pounds?|gbp|swiss francs?|chf|cad|aud|nzd|jpy|cny|inr|pln|czk|huf|sek|nok|dkk|bgn|ron|try|brl|mxn|zar)";
    const marker="(?:"+codeList+"|"+words+")";
    const amount="(?:\\d+(?:[.,]\\d+)?)";
    const pattern=new RegExp("(?:\\b("+amount+")\\s*"+marker+"\\b|\\b"+marker+"\\s*("+amount+")|[€$£]\\s*("+amount+"))","gi");
    const text=String(prompt||"");
    const matches=[];
    let match;
    while((match=pattern.exec(text))!==null){
        matches.push({start:match.index,end:match.index+match[0].length});
    }
    const lastBoundaryBefore=(position)=>{
        const prefix=text.slice(0,position);
        return Math.max(prefix.lastIndexOf("."),prefix.lastIndexOf(";"),prefix.lastIndexOf("!"),prefix.lastIndexOf("?"),prefix.lastIndexOf("\n"));
    };
    const nextBoundaryAfter=(position)=>{
        const suffix=text.slice(position);
        const indexes=[".", ";", "!", "?", "\n"].map(value=>suffix.indexOf(value)).filter(value=>value>=0);
        return indexes.length?position+Math.min(...indexes):text.length;
    };
    return matches.map((item,index)=>{
        const previousEnd=index?matches[index-1].end:0;
        const beforeStart=Math.max(previousEnd,lastBoundaryBefore(item.start)+1);
        const nextAmount=index+1<matches.length?matches[index+1].start:text.length;
        const afterEnd=Math.min(nextAmount,nextBoundaryAfter(item.end));
        return {
            before:normalizeMonetaryPromptText(text.slice(beforeStart,item.start)),
            after:normalizeMonetaryPromptText(text.slice(item.end,afterEnd))
        };
    });
}
function isMonetaryInput(input){
    const semantic=normalizeMonetaryPromptText(String(input?.label||"")+" "+String(input?.key||""));
    const unit=String(input?.unit||"").trim().toUpperCase();
    return MONETARY_CURRENCY_CODES.has(unit)||/\b(?:price|cost|amount|fees?|rates?|tariffs?|charges?|salary|income|budget|rent|payment|saving|savings|deposit|expense|spend|wage|tax)\b/.test(semantic);
}
function monetaryInputBases(input){
    const semantic=normalizeMonetaryPromptText(String(input?.label||"")+" "+String(input?.key||""));
    return [...semantic.matchAll(/\bper\s+(kwh|m3|liters?|litres?|gallons?|km|miles?|hours?|days?)\b/g)].map(match=>match[1]);
}
function explicitAmountContextMatchesInput(input,context){
    const semantic=normalizeMonetaryPromptText(String(input?.label||"")+" "+String(input?.key||""));
    if(!semantic)return false;
    const tokens=semantic.split(/\s+/).filter(Boolean);
    const generic=new Set([
        "per","price","prices","cost","costs","amount","amounts","expense","expenses","fee","fees","rate","rates","tariff","tariffs",
        "charge","charges","fixed","monthly","month","annual","annually","yearly","year","weekly","week","daily","day",
        "total","average","the","and","for","from","with","of","in","on","by","input","value","currency"
    ]);
    const specific=tokens.filter(token=>token.length>1&&!generic.has(token)&&!/^\\d+$/.test(token));
    const hasFixed=/\bfixed\b/.test(semantic);
    const isRate=/\b(?:rate|price|tariff)\b/.test(semantic);
    const isFee=/\b(?:fee|charge)\b/.test(semantic);
    const isCost=/\b(?:cost|expense|spend)\b/.test(semantic);
    const hasAny=(text,values)=>values.some(value=>new RegExp("\\b"+value+"\\b").test(text));
    const matchingSpecific=specific.some(token=>hasAny(context,
        token==="electricity"?["electricity","electric","power"]:
        token==="fuel"?["fuel","petrol","gasoline","diesel"]:
        token==="petrol"?["petrol","gasoline","fuel"]:
        token==="gasoline"?["gasoline","petrol","fuel"]:
        token==="maintenance"?["maintenance","repair","repairs"]:
        token==="repair"?["repair","repairs","maintenance"]:[token]
    ));
    if(!matchingSpecific)return false;
    if(hasFixed&&!hasAny(context,["fixed","standing"]))return false;
    if(isFee&&!hasAny(context,["fee","fees","charge","charges"]))return false;
    if(isRate&&!hasAny(context,["rate","rates","price","prices","tariff","tariffs"]))return false;
    if(isCost&&!hasAny(context,["cost","costs","expense","expenses","spend","bill","bills"]))return false;
    return true;
}
function explicitAmountMatchesInput(input,amounts,allInputs){
    const bases=monetaryInputBases(input);
    return amounts.some(amount=>{
        // A per-unit amount can identify a field by unit only when that basis is
        // unique in this calculator. If several inputs share it, require a clear
        // field-specific phrase immediately before the amount.
        const matchedBasis=bases.find(basis=>new RegExp("\\b"+basis+"\\b").test(amount.after));
        if(matchedBasis){
            const sameBasisFields=(Array.isArray(allInputs)?allInputs:[input]).filter(other=>
                isMonetaryInput(other)&&monetaryInputBases(other).includes(matchedBasis)
            );
            if(sameBasisFields.length===1)return sameBasisFields[0]===input;
            const contextMatches=sameBasisFields.filter(other=>explicitAmountContextMatchesInput(other,amount.before));
            return contextMatches.length===1&&contextMatches[0]===input;
        }
        return explicitAmountContextMatchesInput(input,amount.before);
    });
}
function applyUnspecifiedMonetaryDefaults(candidate,prompt,defaultCurrency){
    const typedV2=Number(candidate?.blueprintVersion)===2&&candidate?.spec&&typeof candidate.spec==="object";
    const root=typedV2?candidate.spec:candidate;
    if(!root||(!Array.isArray(root.inputs)&&!Array.isArray(root.groups)))return false;
    const explicitAmounts=extractExplicitMonetaryAmounts(prompt);
    let changed=false;
    const fallback=/^[A-Z]{3}$/.test(String(defaultCurrency||"").toUpperCase())?String(defaultCurrency).toUpperCase():"USD";
    const allFields=[
        ...(Array.isArray(root.inputs)?root.inputs:[]),
        ...(Array.isArray(root.groups)?root.groups.flatMap(group=>Array.isArray(group?.fields)?group.fields:[]):[])
    ];
    for(const input of allFields){
        if(!input||typeof input!=="object")continue;
        const semantic=(String(input.label||"")+" "+String(input.key||"")).toLowerCase();
        const unit=String(input.unit||"").trim().toUpperCase();
        const unitCurrencyPrefix=unit.match(/^([A-Z]{3})(?:\s*\/|$)/)?.[1]||"";
        const hasCurrencyUnit=MONETARY_CURRENCY_CODES.has(unit)||MONETARY_CURRENCY_CODES.has(unitCurrencyPrefix);
        const percentageUnit=["%","percent","percentage"].includes(unit.toLowerCase());
        const percentageRate=/\b(?:tax|interest|discount|growth|inflation|commission|margin)\s+rates?\b|\bpercentage\b/.test(semantic);
        const moneyInput=(!typedV2||input.type==="number")&&input.control!=="toggle"&&!percentageUnit&&!(percentageRate&&!hasCurrencyUnit)&&
            (hasCurrencyUnit||/\b(?:price|cost|amount|fees?|rates?|tariffs?|charges?|salary|income|budget|rent|payment|saving|savings|deposit|expense|spend|wage|tax|insurance|maintenance|parking|tolls?|loan|lease|repair|subscription)\b/.test(semantic));
        if(!moneyInput||explicitAmountMatchesInput(input,explicitAmounts,allFields))continue;
        if(!hasCurrencyUnit)input.unit=fallback;
        const step=Number(input.step??1),maximum=Number(input.max);
        if(!Number.isFinite(step)||step<=0||!Number.isFinite(maximum))continue;
        input.min=0;
        input.default=0;
        const alignedMaximum=Math.floor(maximum/step+1e-9)*step;
        input.max=alignedMaximum>0?Number(alignedMaximum.toPrecision(12)):step;
        changed=true;
    }
    if(changed){
        const serbian=/\b(?:potrosnja|trosak|struja|voda|gorivo|mesecn|godisn|racun|uporedi|poredjenje)\b/i.test(normalizeMonetaryPromptText(prompt));
        const note=serbian
            ?"Nenavedena novčana polja počinju od nule; unesite preostale cene i troškove pre oslanjanja na rezultate."
            :"Unspecified monetary fields start at zero; enter any remaining prices and costs before relying on results.";
        const description=String(candidate.description||"").trim();
        if(!/start at zero|pocinju od nule/i.test(normalizeMonetaryPromptText(description))){
            const available=Math.max(0,500-note.length-1);
            candidate.description=(description.slice(0,available).trim()+" "+note).trim();
        }
    }
    return changed;
}
function stripNullTypedBlueprintProperties(item,keys){
    if(!item||typeof item!=="object")return;
    keys.forEach(key=>{if(item[key]===null)delete item[key];});
}
function prepareTypedV2ProviderCandidate(raw,defaultCurrency){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("The AI did not return a V2 blueprint object.");
    const candidate=JSON.parse(JSON.stringify(raw));
    if(candidate.blueprintVersion!==2||candidate.spec?.schemaVersion!==2||candidate.spec?.engineVersion!==2){
        throw new Error("The AI response must use blueprintVersion 2, schemaVersion 2 and engineVersion 2.");
    }
    const spec=candidate.spec;
    if(!Array.isArray(spec.inputs)||!Array.isArray(spec.groups)||!Array.isArray(spec.results)||!Array.isArray(spec.scenarios)){
        throw new Error("The AI returned an incomplete typed V2 structure.");
    }
    const normalizeTypedDefinition=(item,isInput)=>{
        if(!item||typeof item!=="object"||Array.isArray(item))return;
        stripNullTypedBlueprintProperties(item,["min","max","step","unit","control","minDate","maxDate"]);
        if(item.type==="number"){
            if(item.unit===undefined)item.unit="";
            if(item.control!=="select"&&Array.isArray(item.choices)&&item.choices.length===0)delete item.choices;
            delete item.minDate;delete item.maxDate;
        }else if(item.type==="boolean"){
            ["min","max","step","choices","minDate","maxDate"].forEach(key=>delete item[key]);
            if(item.unit==="")delete item.unit;
            if(!isInput)delete item.control;
        }else if(item.type==="enum"){
            ["min","max","step","minDate","maxDate"].forEach(key=>delete item[key]);
            if(item.unit==="")delete item.unit;
            if(!isInput)delete item.control;
        }else if(item.type==="date"){
            ["min","max","step","choices"].forEach(key=>delete item[key]);
            if(item.unit==="")delete item.unit;
            if(!isInput)delete item.control;
        }
    };
    spec.inputs.forEach(item=>normalizeTypedDefinition(item,true));
    spec.groups.forEach(group=>(Array.isArray(group?.fields)?group.fields:[]).forEach(item=>normalizeTypedDefinition(item,false)));
    spec.results.forEach(item=>{
        if(!item||typeof item!=="object"||Array.isArray(item))return;
        stripNullTypedBlueprintProperties(item,["currency","unit"]);
        if(item.format==="currency"){
            if(typeof item.currency!=="string"||!item.currency.trim())item.currency=String(defaultCurrency||"EUR").toUpperCase();
            delete item.unit;
        }else if(item.format==="unit"){
            delete item.currency;
        }else{
            delete item.currency;delete item.unit;
        }
    });
    spec.scenarios=spec.scenarios.map((scenario,index)=>{
        if(!scenario||typeof scenario!=="object"||Array.isArray(scenario))return scenario;
        if(Array.isArray(scenario.overrides)){
            const values={};
            scenario.overrides.forEach(override=>{
                if(!override||typeof override!=="object"||Array.isArray(override)||typeof override.key!=="string")throw new Error("Scenario "+(index+1)+" contains an invalid typed override.");
                if(Object.prototype.hasOwnProperty.call(values,override.key))throw new Error("Scenario "+(index+1)+" repeats an input override.");
                values[override.key]=override.value;
            });
            scenario.values=values;delete scenario.overrides;
        }
        return scenario;
    });
    return candidate;
}
function normalizeTypedV2Definition(raw,defaultCurrency){
    const importer=globalThis.WorthItBlueprintImport;
    if(typeof importer?.parseBlueprint!=="function")throw new Error("The shared strict Blueprint V2 importer is unavailable.");
    const category=String(raw?.category||"");
    const subcategories=Array.isArray(raw?.subcategories)?raw.subcategories:[];
    const allowed=ALLOWED_SUBCATEGORIES[category];
    if(!allowed||subcategories.length<1||subcategories.length>3||new Set(subcategories).size!==subcategories.length||
       subcategories.some(value=>typeof value!=="string"||!allowed.has(value))){
        throw new Error("The AI-selected V2 categories are invalid or do not belong to the selected primary category.");
    }
    const normalized=importer.parseBlueprint(JSON.stringify(raw),spec=>{
        const result=validateCalculatorForServer(SERVER_CALCULATOR_ENGINE,spec);
        return {errors:Array.isArray(result?.errors)?result.errors.map(String):["The server V2 validator returned an invalid response."]};
    });
    const remaining=Number(normalized?.importValidationIssueCount)||0;
    if(remaining>0){
        const issues=Array.isArray(normalized.importValidationIssues)?normalized.importValidationIssues.slice(0,4).join(" "):"";
        throw new Error("The AI-generated V2 calculator did not pass server formula, unit or default-value validation. "+issues);
    }
    if(!normalized?.spec||normalized.spec.schemaVersion!==2||normalized.spec.engineVersion!==2){
        throw new Error("The AI-generated calculator did not preserve the typed V2 schema.");
    }
    normalized.spec.subcategories=[...subcategories];
    normalized.spec.assumptions=Array.isArray(raw.assumptions)?[...raw.assumptions]:[];
    normalized.spec.results.forEach(item=>{
        if(item.format==="currency"&&!SERVER_SUPPORTED_CURRENCY_CODES.has(String(item.currency||"").toUpperCase())){
            throw new Error("A currency result uses an unsupported ISO currency code.");
        }
    });
    // Match the V1 contract: every fixed input and dynamic field must affect
    // at least one result, including typed values used only in conditions.
    const engineSpec={...normalized.spec};
    delete engineSpec.assumptions;delete engineSpec.subcategories;
    const availableKeys=new Set((engineSpec.inputs||[]).map(item=>item.key));
    const referencedInputs=new Set();
    const groupDefinitions=new Map((engineSpec.groups||[]).map(group=>[group.key,group]));
    const referencedGroupFields=new Map((engineSpec.groups||[]).map(group=>[group.key,new Set()]));
    (engineSpec.results||[]).forEach(result=>{
        const ast=SERVER_CALCULATOR_ENGINE.compileV2Expression(result.expression,availableKeys,groupDefinitions);
        SERVER_CALCULATOR_ENGINE.typedFormulaInputReferences(ast,referencedInputs);
        SERVER_CALCULATOR_ENGINE.typedFormulaGroupReferences(ast).forEach(reference=>{
            if(referencedGroupFields.has(reference.group))referencedGroupFields.get(reference.group).add(reference.field);
        });
        if(result.key)availableKeys.add(result.key);
    });
    const unusedInputs=(engineSpec.inputs||[]).filter(item=>!referencedInputs.has(item.key)).map(item=>item.label||item.key);
    const unusedFields=(engineSpec.groups||[]).flatMap(group=>(group.fields||[]).filter(field=>!referencedGroupFields.get(group.key)?.has(field.key)).map(field=>group.label+": "+(field.label||field.key)));
    if(unusedInputs.length||unusedFields.length){
        throw new Error("The generated V2 calculator contains unused inputs or group fields: "+[...unusedInputs,...unusedFields].join(", ")+". Use them in a result formula or remove them.");
    }
    return normalized.spec;
}

export function normalizeDefinition(raw,defaultCurrency,options={}){
    if(Number(raw?.blueprintVersion)===2)return normalizeTypedV2Definition(raw,defaultCurrency);
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
    if(!Array.isArray(raw?.inputs)||raw.inputs.length<1||raw.inputs.length>24)throw new Error("A calculator must have between 1 and 24 fixed inputs.");
    if(!Array.isArray(raw?.results)||raw.results.length<1||raw.results.length>20)throw new Error("A calculator must have between 1 and 20 results.");

    const seen=new Set();
    const inputs=raw.inputs.map(item=>{
        const key=String(item?.key||"").trim().toLowerCase();
        const previousInput=Array.isArray(previousSpec?.inputs)?previousSpec.inputs.find(input=>String(input?.key||"")===key):null;
        const label=String(item?.label||"").trim().slice(0,60);
        let min=Number(item?.min),max=Number(item?.max),value=Number(item?.default);
        let step=Number(item?.step??1);
        const semantic=(label+" "+key).toLowerCase();
        const control=["number","slider","select","toggle"].includes(item?.control)?item.control:"number";
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
        if(control==="toggle"&&(min!==0||max!==1||!Number.isInteger(value)||![0,1].includes(value)||step!==1)){
            throw new Error(label+": a toggle must use minimum 0, maximum 1, default 0 or 1, and step 1.");
        }
        const stepPosition=(value-min)/step;
        if(!Number.isFinite(stepPosition)||Math.abs(stepPosition-Math.round(stepPosition))>1e-7)throw new Error("The default value for "+label+" does not match its input step.");
        const maxStepPosition=(max-min)/step;
        if(max>min&&(!Number.isFinite(maxStepPosition)||Math.abs(maxStepPosition-Math.round(maxStepPosition))>1e-7))throw new Error("The maximum value for "+label+" does not match its input step.");
        const unitWasSupplied=Object.prototype.hasOwnProperty.call(item||{},"unit");
        let unit=String(unitWasSupplied?item.unit:(previousInput?.unit||"")).trim().slice(0,16);
        const unitCurrencyPrefix=unit.match(/^([A-Z]{3})(?:\s*\/|$)/)?.[1]||"";
        const percentageUnit=["%","percent","percentage"].includes(unit.toLowerCase());
        const percentageRate=/\b(?:tax|interest|discount|growth|inflation|commission|margin)\s+rates?\b|\bpercentage\b/.test(semantic);
        const monetaryInput=control!=="toggle"&&!percentageUnit&&!(percentageRate&&!SERVER_SUPPORTED_CURRENCY_CODES.has(unitCurrencyPrefix))&&(
            /\b(?:price|cost|amount|fees?|rates?|tariffs?|charges?|salary|income|budget|rent|payment|saving|savings|deposit|expense|spend|wage|tax|insurance|maintenance|parking|tolls?|loan|lease|repair|subscription)\b/.test(semantic)
            ||SERVER_SUPPORTED_CURRENCY_CODES.has(unitCurrencyPrefix));
        const rateBasis=semantic.match(/\bper\s+(kwh|m3|m³|litres?|liters?|l|km|kilometres?|kilometers?|kg|g|hour|hours|day|days)\b/i)?.[1]||"";
        const normalizedRateBasis=/^(?:kwh)$/i.test(rateBasis)?"kWh":
            /^(?:m3|m³)$/i.test(rateBasis)?"m3":
            /^(?:litres?|liters?|l)$/i.test(rateBasis)?"L":
            /^(?:kilometres?|kilometers?|km)$/i.test(rateBasis)?"km":
            /^(?:kg)$/i.test(rateBasis)?"kg":
            /^(?:g)$/i.test(rateBasis)?"g":
            /^(?:hours?)$/i.test(rateBasis)?"hour":
            /^(?:days?)$/i.test(rateBasis)?"day":"";
        if(forceCurrency&&monetaryInput){
            const existingRate=unit.match(/^[A-Z]{3}\s*\/\s*(.+)$/);
            unit=existingRate?forceCurrency+"/"+existingRate[1]:forceCurrency;
        }else if(!unit&&!previousInput&&monetaryInput)unit=currencyFallback;
        if(monetaryInput&&normalizedRateBasis&&/^[A-Z]{3}$/.test(unit))unit=unit+"/"+normalizedRateBasis;

        let choices=[];
        if(control==="select"){
            choices=(Array.isArray(item?.choices)?item.choices:[]).map(choice=>({
                label:String(choice?.label||"").trim().slice(0,50),
                value:Number(choice?.value)
            }));
            if(choices.length<2||choices.length>12||choices.some(choice=>!choice.label||!Number.isFinite(choice.value)||Math.abs(choice.value)>1e12)){
                throw new Error(label+": a dropdown needs 2 to 12 choices with valid labels and numeric values.");
            }
            const choiceValues=new Set(choices.map(choice=>choice.value));
            const choiceLabels=new Set(choices.map(choice=>choice.label.toLowerCase()));
            if(choiceValues.size!==choices.length||choiceLabels.size!==choices.length||!choiceValues.has(value)){
                throw new Error(label+": dropdown choices must have unique labels and values and include the default.");
            }
        }
        seen.add(key);
        return control==="select"
            ?{key,label,min,max,default:value,step,unit,control,choices}
            :{key,label,min,max,default:value,step,unit,control};
    });

    const groups=Array.isArray(raw?.groups)?raw.groups.map((group,index)=>{
        const key=String(group?.key||"").trim().toLowerCase();
        const label=String(group?.label||"").trim().slice(0,60);
        const itemLabel=String(group?.itemLabel||"Item").trim().slice(0,40);
        const minItems=Number(group?.minItems??1),maxItems=Number(group?.maxItems??10);
        if(!/^[a-z][a-z0-9_]{0,31}$/.test(key)||seen.has(key)||!label||!itemLabel||
            !Number.isInteger(minItems)||!Number.isInteger(maxItems)||minItems<1||maxItems<minItems||maxItems>20){
            throw new Error("The AI generated an invalid dynamic group definition.");
        }
        if(!Array.isArray(group?.fields)||group.fields.length<1||group.fields.length>6){
            throw new Error(label+": a dynamic group needs 1 to 6 numeric fields.");
        }
        seen.add(key);
        const previousGroup=Array.isArray(previousSpec?.groups)?previousSpec.groups.find(item=>String(item?.key||"")===key):null;
        const fields=group.fields.map(field=>{
            const fieldKey=String(field?.key||"").trim().toLowerCase();
            const previousField=Array.isArray(previousGroup?.fields)?previousGroup.fields.find(item=>String(item?.key||"")===fieldKey):null;
            const fieldLabel=String(field?.label||"").trim().slice(0,60);
            const min=Number(field?.min),max=Number(field?.max),value=Number(field?.default),step=Number(field?.step);
            let unit=String(Object.prototype.hasOwnProperty.call(field||{},"unit")?field.unit:(previousField?.unit||"")).trim().slice(0,16);
            const semantic=(fieldLabel+" "+fieldKey).toLowerCase();
            const unitCurrencyPrefix=unit.match(/^([A-Z]{3})(?:\s*\/|$)/)?.[1]||"";
            const percentageUnit=["%","percent","percentage"].includes(unit.toLowerCase());
            const percentageRate=/\b(?:tax|interest|discount|growth|inflation|commission|margin)\s+rates?\b|\bpercentage\b/.test(semantic);
            const monetaryField=!percentageUnit&&!(percentageRate&&!SERVER_SUPPORTED_CURRENCY_CODES.has(unitCurrencyPrefix))&&(
                /\b(?:price|cost|amount|fees?|rates?|tariffs?|charges?|salary|income|budget|rent|payment|saving|savings|deposit|expense|spend|wage|tax|insurance|maintenance|parking|tolls?|loan|lease|repair|subscription)\b/.test(semantic)
                ||SERVER_SUPPORTED_CURRENCY_CODES.has(unitCurrencyPrefix));
            const rateBasis=semantic.match(/\bper\s+(kwh|m3|m³|litres?|liters?|l|km|kilometres?|kilometers?|kg|g|hour|hours|day|days)\b/i)?.[1]||"";
            const normalizedRateBasis=/^(?:kwh)$/i.test(rateBasis)?"kWh":
                /^(?:m3|m³)$/i.test(rateBasis)?"m3":
                /^(?:litres?|liters?|l)$/i.test(rateBasis)?"L":
                /^(?:kilometres?|kilometers?|km)$/i.test(rateBasis)?"km":
                /^(?:kg)$/i.test(rateBasis)?"kg":
                /^(?:g)$/i.test(rateBasis)?"g":
                /^(?:hours?)$/i.test(rateBasis)?"hour":
                /^(?:days?)$/i.test(rateBasis)?"day":"";
            if(forceCurrency&&monetaryField){
                const existingRate=unit.match(/^[A-Z]{3}\s*\/\s*(.+)$/);
                unit=existingRate?forceCurrency+"/"+existingRate[1]:forceCurrency;
            }else if(!unit&&!previousField&&monetaryField)unit=currencyFallback;
            if(monetaryField&&normalizedRateBasis&&/^[A-Z]{3}$/.test(unit))unit=unit+"/"+normalizedRateBasis;
            if(!/^[a-z][a-z0-9_]{0,31}$/.test(fieldKey)||seen.has(fieldKey)||!fieldLabel||
                ![min,max,value,step].every(Number.isFinite)||min>value||value>max||max-min>1e12||
                step<=0||unit.length>16||!Number.isFinite((value-min)/step)||Math.abs((value-min)/step-Math.round((value-min)/step))>1e-7||
                (max>min&&Math.abs((max-min)/step-Math.round((max-min)/step))>1e-7)){
                throw new Error(label+": the dynamic group contains an invalid field definition.");
            }
            seen.add(fieldKey);
            return {key:fieldKey,label:fieldLabel,min,max,default:value,step,unit};
        });
        return {key,label,itemLabel,minItems,maxItems,fields};
    }):[];
    if(groups.length>4)throw new Error("A calculator can contain up to 4 dynamic input groups.");

    const resultKeys=new Set();
    const makeResultKey=(label,index)=>{
        const normalized=String(label||"result").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const base=normalized.replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,24)||"result";
        let key=base;
        let suffix=2;
        while(seen.has(key)||resultKeys.has(key)){
            const tail="_"+suffix++;
            key=base.slice(0,32-tail.length)+tail;
        }
        return key;
    };
    const results=raw.results.map((item,index)=>{
        const label=String(item?.label||"").trim().slice(0,70);
        const expression=String(item?.expression||"").trim().slice(0,500);
        const format=["number","currency","percent","unit"].includes(item?.format)?item.format:"number";
        const previousResult=Array.isArray(previousSpec?.results)?previousSpec.results[index]:null;
        const suppliedKey=String(item?.key||previousResult?.key||"").trim().toLowerCase();
        const key=suppliedKey||makeResultKey(label,index);
        const previousCurrency=previousResult?.currency||"";
        const currency=String(format==="currency"&&forceCurrency?forceCurrency:(item?.currency||previousCurrency||currencyFallback)).toUpperCase();
        let unit=String(item?.unit||previousResult?.unit||"").trim().slice(0,20);
        const resultCurrencyPrefix=unit.match(/^([A-Z]{3})(?:\s*\/|$)/)?.[1]||"";
        if(format==="unit"&&forceCurrency&&SERVER_SUPPORTED_CURRENCY_CODES.has(resultCurrencyPrefix)){
            unit=forceCurrency+unit.slice(3);
        }
        const explanation=String(item?.explanation||previousResult?.explanation||"").trim().slice(0,280);
        if(!label||!expression||!/^([A-Z]{3})$/.test(currency)||(format==="unit"&&!unit)||
            !/^[a-z][a-z0-9_]{0,31}$/.test(key)||resultKeys.has(key)||seen.has(key)){
            throw new Error("The AI generated an invalid result.");
        }
        seen.add(key);resultKeys.add(key);
        return {key,label,expression,format,currency,unit,prefix:String(item?.prefix||"").slice(0,12),suffix:String(item?.suffix||"").slice(0,16),explanation};
    });

    const scenarios=Array.isArray(raw?.scenarios)?raw.scenarios.map((scenario,index)=>{
        const label=String(scenario?.label||"").trim().slice(0,50);
        const values=scenario?.values&&typeof scenario.values==="object"&&!Array.isArray(scenario.values)
            ?{...scenario.values}
            :Object.fromEntries((Array.isArray(scenario?.overrides)?scenario.overrides:[]).map(item=>[String(item?.key||""),item?.value]));
        if(!label||!Object.keys(values).length)throw new Error("A comparison scenario needs a name and at least one input override.");
        return {label,values};
    }):[];
    if(scenarios.length>3)throw new Error("A calculator can contain up to 3 comparison scenarios.");

    const spec={version:1,subcategories,inputs,groups,results,scenarios};
    const validation=validateCalculatorForServer(SERVER_CALCULATOR_ENGINE,spec);
    const validationErrors=Array.isArray(validation?.errors)?validation.errors:[];
    if(validationErrors.length){
        const firstError=String(validationErrors[0]||"");
        if(/^Calculator result chain:/i.test(firstError)){
            throw new Error("The formula fails with a default, minimum or maximum input value. "+firstError);
        }
        throw new Error(firstError);
    }
    if(options?.requireAllInputsUsed===true){
        const availableKeys=new Set(inputs.map(item=>item.key));
        const referencedInputs=new Set();
        const groupMap=SERVER_CALCULATOR_ENGINE.groupMapForSpec(spec);
        const referencedGroupFields=new Map(groups.map(group=>[group.key,new Set()]));
        results.forEach(item=>{
            const ast=SERVER_CALCULATOR_ENGINE.compileExpression(item.expression,availableKeys,groupMap);
            SERVER_CALCULATOR_ENGINE.formulaInputReferences(ast,referencedInputs);
            SERVER_CALCULATOR_ENGINE.formulaGroupFieldReferences(ast).forEach(reference=>{
                if(referencedGroupFields.has(reference.group))referencedGroupFields.get(reference.group).add(reference.field);
            });
            if(item.key)availableKeys.add(item.key);
        });
        const unusedInputs=inputs.filter(item=>!referencedInputs.has(item.key)).map(item=>item.label);
        const unusedGroupFields=groups.flatMap(group=>group.fields.filter(field=>!referencedGroupFields.get(group.key)?.has(field.key)).map(field=>group.label+": "+field.label));
        if(unusedInputs.length||unusedGroupFields.length){
            throw new Error("The generated calculator contains unused input fields: "+[...unusedInputs,...unusedGroupFields].join(", ")+". Remove them or use them in a result formula.");
        }
    }
    if(options?.requireDescription!==false&&description.length<24)throw new Error("The calculator description is too short. Add a clear explanation of what it calculates and its main assumptions (at least 24 characters).");
    return spec;
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
    const aiUsageCollector=createAiUsageCollector();
    let aiOperationRequestId="";
    let aiOperationMode="";
    let aiOperationReserved=false;
    let aiOperationSettled=false;
    let aiOperationRefunded=false;
    let aiBilling=null;
    const token=tokenFrom(request);
    const refundAiOperation=async()=>{
        if(!aiOperationRequestId||!aiOperationMode||aiOperationSettled||aiOperationRefunded)return false;
        try{
            const result=await refundAiOperationReservation(env,token,aiOperationRequestId,aiOperationMode);
            if(result?.ok===true){aiOperationRefunded=true;aiOperationReserved=false;return true;}
            console.error("Could not refund a failed UGC AI operation:",result?.code||result);
            return false;
        }catch(error){
            console.error("Could not refund a failed UGC AI operation:",error);
            return false;
        }
    };
    const settleAiOperation=async()=>{
        if(!aiOperationRequestId||!aiOperationMode||!aiOperationReserved||aiOperationSettled)return;
        const result=await settleAiOperationReservation(env,token,aiOperationRequestId,aiOperationMode);
        if(result?.ok!==true)throw new Error("The AI operation and CALC reservation could not be finalized.");
        aiOperationSettled=true;
        aiOperationReserved=false;
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
        const requestedSchemaVersion=body?.schema_version===undefined?1:body.schema_version;
        if(requestedSchemaVersion!==1&&requestedSchemaVersion!==2)return json({success:false,code:"UNSUPPORTED_CALCULATOR_SCHEMA",error:"Choose calculator schema version 1 or 2."},400,origin);
        if(mode==="refine"&&requestedSchemaVersion!==1)return json({success:false,code:"V2_REFINEMENT_UNAVAILABLE",error:"AI improvement of saved calculators remains on Version 1 until typed V2 persistence is supported."},400,origin);
        const outputSchemaVersion=mode==="create"?requestedSchemaVersion:1;
        const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
        const regionalDefaults=resolveRegionalDefaults(request,prompt);
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
            aiOperationRequestId=crypto.randomUUID();
            aiOperationMode="refine";
            let reservation;
            try{
                reservation=await reserveAiOperation(env,token,aiOperationRequestId,"refine",calculatorId);
            }catch(error){
                await refundAiOperation();
                aiOperationRequestId="";
                console.error("UGC AI edit and CALC reservation failed:",error);
                return json({success:false,code:"AI_OPERATION_UNAVAILABLE",error:"The AI improvement allowance and CALC charge could not be authorised. No AI request was sent."},503,origin);
            }
            if(reservation?.ok!==true){
                const code=reservation?.code||"EDIT_QUOTA_UNAVAILABLE";
                aiOperationRequestId="";
                if(code==="DAILY_LIMIT"){
                    return json({success:false,code:"DAILY_AI_EDIT_LIMIT",daily_limit:reservation.daily_limit,edits_used:reservation.edits_used,remaining:0,
                        error:"You have used all your AI improvements for today. Free accounts can improve 1 saved calculator per UTC day, Premium Lite 2 and Premium 3."},429,origin);
                }
                if(code==="INSUFFICIENT_CALC"){
                    const price=Number(reservation.required)||Number(reservation.required_milli)/1000||2;
                    return json({success:false,code:"INSUFFICIENT_CALC",required:price,plan:reservation.plan||"free",
                        error:"Not enough CALC. This AI improvement costs "+price+" CALC for your current membership. No AI request was sent."},402,origin);
                }
                return json({success:false,code,error:"The AI improvement could not be reserved. Please try again."},code==="GLOBAL_DAILY_LIMIT"?429:503,origin);
            }
            aiOperationReserved=true;
            aiBilling={plan:reservation.plan||"free",price:Number(reservation.price)||0,price_milli:Number(reservation.price_milli)||0,owner_exempt:reservation.owner_exempt===true};
        }else{
            aiOperationRequestId=crypto.randomUUID();
            aiOperationMode="create";
            let usage;
            try{usage=await reserveAiOperation(env,token,aiOperationRequestId,"create",null);}
            catch(error){
                await refundAiOperation();
                aiOperationRequestId="";
                console.error("UGC Maker generation and CALC reservation failed:",error);
                return json({success:false,code:"AI_OPERATION_UNAVAILABLE",error:"The AI generation allowance and CALC charge could not be authorised. No AI request was sent."},503,origin);
            }
            if(usage?.ok!==true){
                const code=usage?.code||"USAGE_LIMIT_UNAVAILABLE";
                aiOperationRequestId="";
                if(code==="DAILY_LIMIT"){
                    const dailyLimit=Math.max(1,Number(usage.daily_limit)||1);
                    return json({success:false,code:"DAILY_AI_LIMIT",error:"You have used your "+dailyLimit+" AI calculator generation"+(dailyLimit===1?"":"s")+" for today on your current plan. Your allowance resets at 00:00 UTC.",daily_limit:dailyLimit,requests_used:Number(usage.requests_used)||dailyLimit},429,origin);
                }
                if(code==="GLOBAL_DAILY_LIMIT"){
                    return json({success:false,code:"GLOBAL_DAILY_AI_LIMIT",error:"Worth It has reached its internal AI generation capacity for today. The shared allowance resets at 00:00 UTC.",global_daily_limit:100,global_requests_used:Number(usage.global_requests_used)||100},429,origin);
                }
                if(code==="INSUFFICIENT_CALC"){
                    const price=Number(usage.required)||Number(usage.required_milli)/1000||2;
                    return json({success:false,code:"INSUFFICIENT_CALC",required:price,plan:usage.plan||"free",
                        error:"Not enough CALC. This AI generation costs "+price+" CALC for your current membership. No AI request was sent."},402,origin);
                }
                return json({success:false,code,error:"The AI calculator generation could not be reserved. Please try again."},503,origin);
            }
            aiOperationReserved=true;
            aiBilling={plan:usage.plan||"free",price:Number(usage.price)||0,price_milli:Number(usage.price_milli)||0,owner_exempt:usage.owner_exempt===true};
        }

        const commonRules=[
            "Return only one valid JSON object with keys title, description, category, subcategories, inputs, groups, results and scenarios. Use empty arrays for groups and scenarios when they are not needed.",
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
            "Each fixed input has key, label, min, max, default, step, unit, control and choices. Keys must match ^[a-z][a-z0-9_]{0,31}$ and be unique. Use control number or slider for ordinary numeric values, toggle for a strict 0/1 Boolean-style choice, and select for a closed list of 2 to 12 numeric choices. For non-select controls, set choices to an empty array. For select, choices must contain unique label/value pairs and include the default value.",
            "For monetary inputs, set unit to the relevant ISO 4217 currency code. Common choices include EUR, USD, GBP, RSD, CHF, CAD, AUD, JPY, CNY, PLN and CZK.",
            "Each result may use its own ISO 4217 currency code. Currency selection controls formatting only; never imply that different currencies have been converted.",
            "Only calculate currency conversion when an exchange rate is supplied as an explicit numeric input and used in the formula. Never invent or fetch exchange rates.",
            "All numeric values must be finite and min <= default <= max. Keep input ranges realistic and bounded.",
            "Use no more than 24 fixed inputs, 4 dynamic groups, 6 numeric fields per group, 20 rows per group, 20 results and 3 comparison scenarios. Prefer fewer when they answer the user's request clearly.",
            "Each dynamic group has key, label, itemLabel, minItems, maxItems and fields. Each field has key, label, min, max, default, step and unit. Use groups for repeated user-entered rows such as expenses, appliances, products, rooms, trips or devices; do not imitate repeated rows with many fixed inputs.",
            "Each comparison scenario has a label and an overrides array of {key,value} entries. Overrides may refer only to known fixed numeric inputs and must stay within their ranges. Use scenarios only for meaningful alternatives such as low/base/high demand or different household sizes; omit unnecessary scenarios.",
            "A result may use the key of an earlier result to create a calculation chain. Declare each result key once and place dependent results after the result they use. Do not create circular dependencies.",
            "For dynamic groups, use sum(group_key.field_key) to total one numeric field across that group and count(group_key) to count its rows. Do not use a sum expression across more than one group in a single sum() call.",
            "Think through the user's actual question before designing the schema: identify the main quantity or decision, the variables that materially affect it, the comparison baseline, and the time period. Build the calculator around that question rather than a generic collection of fields.",
            "Every input must have a clear purpose and must be used by at least one result formula. Do not add redundant fields, duplicate the same cost under different names, or create inputs that do not affect any result.",
            "Maintain dimensional and unit consistency in every formula. Make input labels state the relevant unit or rate basis (for example, kWh per month, RSD per kWh, m3 per month, litres per 100 km, or currency per month). A price per unit must be multiplied by the matching quantity; do not multiply or compare incompatible units.",
            "Set rate input units explicitly: a rate in currency per physical unit must use a compound unit such as RSD/kWh, RSD/m3, EUR/L or EUR/km, so multiplying it by the matching quantity produces a currency amount. Do not label such a rate with the bare currency code.",
            "Choose result formatting from the formula's actual dimensions. Use format currency only for currency amounts, format unit for dimensioned rates such as EUR/km or RSD/kWh (and include result.unit), format percent for dimensionless ratios, and number for other dimensionless values. Do not label a currency-per-distance result as a plain currency amount.",
            "A period count used only as a multiplier (for example, number of months, years, weeks, trips or billing cycles) is a count: use an empty unit string for that input, keep the period in its label, and multiply by the count in the formula. Use a time unit only when the formula genuinely needs a dimensional duration or rate conversion.",
            "Keep time bases consistent. Distinguish daily, weekly, monthly, annual, one-time and per-unit amounts. Convert between periods explicitly and consistently; do not treat a month as exactly four weeks. Do not add a one-time purchase cost to a monthly recurring cost unless it is deliberately spread across a clearly defined comparison period.",
            "For comparisons, model both options symmetrically and on the same usage level, service level and time period. Show the important result for each option and a direct difference or savings result when useful. Make the direction of any difference clear in its label so users know which option is cheaper or better.",
            "For vehicle energy comparisons, use the same distance and period for both options; calculate fuel use from distance times litres per 100 km divided by 100, and electricity use from distance times kWh per 100 km divided by 100. Multiply each by its own editable per-unit price. Do not claim to calculate full vehicle ownership unless insurance, maintenance, depreciation, financing and other relevant costs are actually modeled.",
            "For household utility comparisons, calculate each utility using its own physical unit and matching rate (for example, kWh multiplied by currency per kWh, or m3 multiplied by currency per m3). Do not compare raw kWh and m3 as interchangeable quantities. Add fixed charges, taxes or tariff tiers only when supplied or represented by explicit editable inputs. If the user enters one blended rate, describe it as an average effective rate; do not claim that tiered or seasonal tariffs are calculated unless separate tiers are represented by inputs and formulas.",
            "Avoid double-counting overlapping costs. Include a cost component only once, distinguish optional from required costs, and do not label a partial-cost estimate as total ownership or total cost when important components are not modeled.",
            "Use practical, editable defaults for non-monetary quantities, but describe them as illustrative starting estimates rather than typical national averages unless source-backed values are supplied. Never invent current tariffs, fuel prices, exchange rates, taxes, interest rates, product prices, fixed fees, maintenance bills or personal monetary costs. Only a monetary input that can be unambiguously matched to a concrete amount in the user prompt may keep a non-zero default. Every other monetary input must have default 0 and minimum 0, even when the prompt supplies a price for a different input. Explicitly say in the description that any remaining unspecified prices and costs must be entered before relying on totals. Do not fabricate non-zero monetary examples for Serbia or any other region.",
            "When monetary defaults are zero, keep formulas valid at zero. For a ratio or percentage whose denominator can be zero, use max(denominator,1) so the result remains finite and represents zero share when no cost has been entered.",
            "Use ranges and steps that fit the real-world scale of each input. Avoid absurd maxima, overly precise steps, unexplained constants and arbitrary default values. Keep optional fees at zero by default unless the user supplies a value.",
            "Prioritize a small number of non-redundant results that answer the main question: the primary per-period amounts, a useful combined or total figure when relevant, and a clear comparison or difference when it adds value. Do not fill the result limit with decorative or repetitive metrics.",
            "Before returning the schema, silently audit it as a calculator designer: verify that every input is needed, every requested output is present, every formula follows from the labels and units, all options use the same basis, no component is counted twice, and the default and boundary values produce plausible finite results. Correct any issue before returning JSON.",
            "Each result has a unique lowercase key, label, expression, format, currency, unit, prefix, suffix and explanation. Result keys use ^[a-z][a-z0-9_]{0,31}$ and can be referenced by later result formulas. Keep results in dependency order: inputs and group fields first, then earlier result keys.",
            "Use the shared v1 formula language: numeric constants, pi, e, + - * / ^, unary signs, parentheses, and functions min,max,abs,round,floor,ceil,sqrt,pow,clamp,avg,sum,count,mod,trunc,sign,hypot,log,ln,exp,sin,cos,tan,asin,acos,atan,if,gt,gte,lt,lte,eq,neq,and,or,not. You may reference fixed input keys, dynamic group fields using group_key.field_key, and earlier result keys. sum(group.field) aggregates a numeric field from one dynamic group; count(group) counts its rows. Keep formulas within the shared engine limits and never use unsupported syntax.",
            "Do not use assignment, JavaScript, strings, arbitrary property access, object syntax, arrays, loops, external calls, or any function outside the shared formula registry. The only permitted dotted references are a declared dynamic group key followed by one of that group's declared field keys.",
            "For percent values, express percentages in their ordinary human scale (e.g. 5 means 5 percent) and divide by 100 in the formula.",
            "For currency outputs, set format to currency and use a valid ISO 4217 code. If the user names a currency, use it; otherwise use the regional currency suggestion supplied separately in the user request.",
            "For monetary inputs, use the same requested or suggested currency code in unit; never silently mix currencies.",
            "Write the title, description, input labels and result labels in the same language as the user's prompt when that language is clearly identifiable. If the prompt has no clear language or is language-neutral/ambiguous, use English. Do not use the visitor's country, region or Accept-Language header to choose the language of calculator text. Accept-Language and regional settings are for number formatting and currency defaults only; they must not override a clear prompt language.",
            "For a new calculator, write a genuinely informative description in the user's language, normally 2 or 3 concise sentences and ideally 140 to 380 characters (hard limit 24 to 500). In the first sentence, explain the practical question or quantity being estimated, not merely repeat the title. In the next sentence, summarize the main input factors or included costs and explain what the key result or comparison period represents; state useful time-basis conversions or consistency assumptions when relevant (for example, monthly-to-weekly or yearly calculations). Add a final sentence only when a material assumption, estimate limitation or important exclusion is clear from the user's request and generated inputs/results; say clearly what is not separately modeled, but never invent exclusions, data sources, prices, rates, guarantees or unsupported claims. Make the description understandable without seeing the input form. Avoid filler, generic marketing language, vague claims such as accurate or complete, and simply listing every input or result. During refinement, preserve the existing description exactly, even if it is shorter. Do not add marketing claims or unsupported facts.",
            "Cover every requested output and time period. If the user asks for weekly, monthly and yearly figures, include a separate clearly labelled result row for each requested period. Apply the word total only to the specific period/output item where the user requested a total; never infer a total weekly result from a separate total monthly or total yearly request. An average weekly result is not a total weekly result. Do not treat a monthly or annual figure as a substitute for a separately requested weekly or yearly result. Do not silently omit requested inputs or output periods.",
            "Use positive minimums for quantities that cannot logically be zero, such as working days, commute distance and fuel consumption. Use whole-number steps for counts of days or people. Zero is acceptable for optional charges such as parking or fees.",
            "Check every formula at default values, all-minimum values, all-maximum values, and each input's individual minimum and maximum. Avoid divisions by zero, invalid square roots, overflow and non-finite results across the entire allowed input range.",
            "Keep the title within 70 characters and description within 500 characters."
        ];
        const requestedResultItems=extractRequestedResultItems(prompt);
        let system;
        let userPrompt=[
            "Regional presentation suggestions are defaults only, not verified prices, tariffs, exchange rates or market data.",
            "Keep currency selection separate from conversion: regional suggestions affect default units and formatting only.",
            "Use an explicitly requested currency in preference to regional suggestions.",
            "Regional defaults: currency "+regionalDefaults.currency+"; number locale "+regionalDefaults.locale+".",
            "Explicitly requested currencies: "+(requestedCurrencies.length?requestedCurrencies.join(", "):"none detected")+". If exactly one is specified, it overrides regional suggestions for all monetary inputs and outputs. If multiple currencies are explicitly requested, preserve the requested multi-currency comparison.",
            "User request:",
            prompt
        ].join("\n") + (requestedResultItems.length
            ? "\n\nExplicit result checklist from the user's Results section. Every listed item requires its own separate result row; do not invent extra rows:\n- " + requestedResultItems.join("\n- ")
            : "");
        if(mode==="refine"){
            system=[
                "You are improving a saved Worth It community calculator. This is an edit, not a new calculator.",
                "Preserve the exact title, category, description, subcategories, underlying subject, comparison and purpose from the existing calculator.",
                "Preserve every existing fixed input key and its order, every dynamic group key and field key, every result key and label, and every scenario name. Do not add, remove, rename or repurpose structural keys during refinement.",
                "Preserve the exact number, order, keys and labels of all result rows. Preserve group and scenario structure. Improve only labels, numeric bounds/defaults/steps/units and formulas where useful.",
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
                    groups:existingCalculator.spec.groups||[],
                    results:existingCalculator.spec.results,
                    scenarios:existingCalculator.spec.scenarios||[]
                }),
                "Requested improvement:",
                prompt,
                "Return the improved full calculator definition including inputs, groups, results and scenarios. Keep title, description, category, subcategories, all fixed input keys, all group and field keys, result keys and result labels exactly unchanged."
            ].join("\n");
        }else if(outputSchemaVersion===2){
            const blueprintContract=globalThis.WorthItBlueprintImport?.buildPrompt?.(2);
            if(!blueprintContract)throw new Error("The typed V2 blueprint contract is unavailable.");
            system=[
                blueprintContract,
                "You are Worth It's AI Calculator Creator. The user's request may describe any subject; design a correct and useful calculator around that exact request.",
                "Choose 1–3 subcategories from the exact allowed list for the primary category: cars: car-ownership, ev-ownership, fuel-costs, vehicle-financing, car-insurance, car-maintenance, depreciation-resale, vehicle-comparison; money: budgeting, saving, investing, loans-debt, mortgages, taxes, income-salary, retirement; technology: smartphones, computers, gaming, software-subscriptions, internet-connectivity, consumer-electronics, tech-comparison; home: utilities-energy, rent-housing, home-buying, renovation-repairs, home-appliances, home-maintenance, household-budget; other: travel, education-career, health-fitness, food-groceries, business, lifestyle, general-comparison.",
                "Return the canonical root blueprintVersion 2 format defined above. Do not return a V1 root, classification object, numeric-only schema or saved-calculator object.",
                "Keep the calculator compact but complete. Use a small set of meaningful inputs and typed dynamic groups for repeated rows. Every input and group field must be used by at least one result formula. Include every output explicitly requested by the user.",
                "Use exact monetary values only when a concrete amount can be matched unambiguously to that input in the prompt. Every other monetary number input or group field must have minimum 0 and default 0. Monetary numeric inputs that need zero defaults must use number controls, not select controls. State clearly that unspecified prices and rates must be entered before relying on totals.",
                "Never invent current tariffs, fuel prices, taxes, interest rates, exchange rates, product prices, fixed fees, market data, population averages or personal costs. Regional currency and locale are presentation suggestions only. Use an explicitly requested currency where applicable; otherwise use the regional currency suggestion. Currency values are never automatically converted.",
                "Model comparisons symmetrically on the same time and usage basis. Avoid double-counting, mixing monthly and annual amounts, or claiming a complete cost when important components are not represented.",
                "Use clear labels in the same language as the user's request. Descriptions must explain what is measured, the main drivers, the output meaning and any material exclusions without unsupported claims.",
                "Audit all types, choices, dates, units, keys, scenarios and formulas. Ensure dependency order, formula type safety, dimensional consistency, finite default results and no division-by-zero paths. Reject a request that cannot be represented safely instead of silently omitting requirements."
            ].join("\n\n");
        }else{
            system=[
                "You design new calculator definitions for the Worth It website.",
                "Create a useful calculator that directly matches the user's described decision or calculation.",
                "Treat short topic descriptions as intentional requests for you to design the calculator, not as incomplete forms that require the user to specify fields, formulas or result rows. Examples include a few words naming a comparison or household topic.",
                "Approach the task as an experienced subject-matter analyst and calculator designer: infer the real-world scenario, identify the key drivers, choose an appropriate calculation method, then translate it into a compact and understandable form.",
                "Infer a sensible, practical calculator structure from the subject and any stated context. Choose the smallest useful set of inputs and result rows; do not add fields merely to make the form look comprehensive. Prefer clear, editable user inputs for values that vary by household, location, provider or time.",
                "Do not merely rename a generic template to match the topic. The inputs, formulas, units and outputs must specifically fit the subject the user named. For a comparison, explicitly represent the relevant variables for each option and make the comparison fair.",
                "When details are missing, make conservative structural assumptions that are ordinary for the subject, express them through editable inputs and sensible defaults, and make material assumptions clear in labels or the description. Do not present assumptions as verified facts.",
                "Use regional context only for presentation defaults such as currency and locale. Never invent current prices, tariffs, exchange rates, tax rates, market data or provider-specific values. If a current or personal value is needed and was not supplied, make it an editable input rather than guessing.",
                "For comparison topics, make the options comparable on the same basis and time period. Include useful totals or differences only when they follow directly from the available inputs and formulas.",
                "Do not reject or overcomplicate a request merely because the user did not provide a detailed specification. Generate a sensible first version whenever the topic can be represented as a valid numeric calculator. Ask for clarification only when the subject is genuinely impossible to interpret or cannot be calculated safely within the supported schema.",
                "Create the smallest useful set of fixed numeric inputs, normally 2 to 8 (minimum 1, maximum 24). Use dynamic groups for repeated rows instead of creating many fixed inputs. Include a separate result row for every output explicitly requested by the user; do not omit or combine requested results to fit a preferred row count. Support up to 20 result rows, 4 dynamic groups and 3 comparison scenarios when they add real value.",
                ...commonRules
            ].join(" ");
        }

        let content="";
        let contentProvider="";
        // Keep the reusable system instructions and provider schema stable and ahead
        // of user-specific content so supported providers can reuse cached prefixes.
        if(geminiKey){
            try{
                content=await generateWithGemini(geminiKey,system,userPrompt,aiUsageCollector,"initial-generation");
                if(content)contentProvider="gemini";
            }catch(error){console.warn("Gemini UGC calculator request failed:",error);}
        }
        if(!content&&groqKey){
            try{
                content=await generateWithGroq(groqKey,system,userPrompt,aiUsageCollector,"provider-fallback",outputSchemaVersion);
                if(content)contentProvider="groq";
            }catch(error){console.error("Groq UGC calculator request failed:",error);}
        }
        if(!content){
            await refundAiOperation();
            const error="Worth It AI could not complete this request right now. No calculator was changed; any reserved CALC charge and AI allowance were returned.";
            return jsonWithAiUsage({success:false,code:"AI_PROVIDER_UNAVAILABLE",error},503,origin,aiUsageCollector);
        }
        let parsed;
        let definition;
        let validationError=null;
        const parseAndValidate=generatedContent=>{
            let candidate=JSON.parse(generatedContent);
            if(outputSchemaVersion===2)candidate=prepareTypedV2ProviderCandidate(candidate,defaultCurrency);
            if(mode==="create")applyUnspecifiedMonetaryDefaults(candidate,prompt,defaultCurrency);
            const normalized=normalizeDefinition(candidate,defaultCurrency,{previousSpec:existingCalculator?.spec,requireDescription:mode!=="refine",forceCurrency,requireAllInputsUsed:mode==="create"});
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
            console.warn("Gemini UGC calculator output failed validation; trying strict Groq fallback:",validationError);
            try{
                content=await generateWithGroq(groqKey,system,userPrompt,aiUsageCollector,"validation-fallback",outputSchemaVersion);
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
            await refundAiOperation();
            const invalidJson=validationError instanceof SyntaxError;
            return jsonWithAiUsage({
                success:false,
                code:invalidJson?"INVALID_AI_JSON":"INVALID_AI_CALCULATOR",
                error:validationError?.message||"The AI returned an invalid calculator definition."
            },invalidJson?502:422,origin,aiUsageCollector);
        }

        if(mode==="refine"){
            const originalKeys=existingCalculator.spec.inputs.map(item=>String(item.key));
            const refinedKeys=definition.inputs.map(item=>String(item.key));
            const groupStructure=spec=> (Array.isArray(spec?.groups)?spec.groups:[]).map(group=>({
                key:String(group.key||""),
                fields:(Array.isArray(group.fields)?group.fields:[]).map(field=>String(field.key||""))
            }));
            const originalGroups=groupStructure(existingCalculator.spec);
            const refinedGroups=groupStructure(definition);
            const originalResultKeys=existingCalculator.spec.results.map(item=>String(item.key||""));
            const refinedResultKeys=definition.results.map(item=>String(item.key||""));
            const resultKeysPreserved=originalResultKeys.length===refinedResultKeys.length&&
                originalResultKeys.every((key,index)=>!key||key===refinedResultKeys[index]);
            const originalLabels=existingCalculator.spec.results.map(item=>String(item.label));
            const refinedLabels=definition.results.map(item=>String(item.label));
            const originalScenarios=(existingCalculator.spec.scenarios||[]).map(item=>String(item.label||""));
            const refinedScenarios=(definition.scenarios||[]).map(item=>String(item.label||""));
            const originalSubcategories=existingCalculator.subcategories||existingCalculator.spec.subcategories||[];
            const identityIsPreserved=
                String(parsed.title||"").trim()===String(existingCalculator.title||"").trim()&&
                String(parsed.description||"").trim()===String(existingCalculator.description||"").trim()&&
                String(parsed.category||"").toLowerCase()===String(existingCalculator.category||"").toLowerCase()&&
                sameArray(definition.subcategories,originalSubcategories)&&
                sameArray(refinedKeys,originalKeys)&&sameArray(refinedGroups.map(group=>group.key),originalGroups.map(group=>group.key))&&
                sameArray(refinedGroups.map(group=>group.fields.join("|")),originalGroups.map(group=>group.fields.join("|")))&&
                resultKeysPreserved&&sameArray(refinedLabels,originalLabels)&&
                sameArray(refinedScenarios,originalScenarios);
            if(!identityIsPreserved){
                await refundAiOperation();
                return jsonWithAiUsage({success:false,code:"CALCULATOR_IDENTITY_CHANGED",
                    error:"Worth It AI tried to change the calculator's identity. That update was rejected; your saved calculator is unchanged and the AI edit was refunded."},422,origin,aiUsageCollector);
            }
            try{await settleAiOperation();}
            catch(error){
                console.error("Could not settle the UGC AI improvement and CALC charge:",error);
                await refundAiOperation();
                return jsonWithAiUsage({success:false,code:"AI_OPERATION_SETTLEMENT_FAILED",error:"The AI improvement could not be confirmed. Your saved calculator was not changed; any reserved CALC and AI allowance were returned."},503,origin,aiUsageCollector);
            }
            return jsonWithAiUsage({success:true,mode:"refine",regionalDefaults,billing:aiBilling,operation_id:aiOperationRequestId,calculator:{
                title:existingCalculator.title,
                description:existingCalculator.description||"",
                category:existingCalculator.category,
                spec:definition
            }},200,origin,aiUsageCollector);
        }

        const coverageDefinition=outputSchemaVersion===2?{inputs:parsed?.spec?.inputs||[],results:parsed?.spec?.results||[]}:parsed;
        let missingCoverage=findMissingRequestedCoverage(prompt,coverageDefinition);
        const coverageAttempts=[{
            provider:contentProvider,
            resultLabels:(Array.isArray(coverageDefinition?.results)?coverageDefinition.results:[]).map(item=>String(item?.label||"")),
            missingCoverage:[...missingCoverage]
        }];
        // A first Groq response may itself be the Gemini fallback. If it is valid but
        // incomplete, allow one additional, targeted Groq repair call. This is the
        // only extra provider call and is made only when explicit requested coverage
        // is missing; the original valid draft is retained if repair fails.
        if(missingCoverage.length&&mode==="create"&&groqKey){
            const missingBeforeRepair=[...missingCoverage];
            console.warn("UGC calculator omitted requested coverage; trying targeted Groq regeneration (one attempt):",{
                missingCoverage:missingBeforeRepair,
                initialProvider:contentProvider
            });
            try{
                const coverageRepairPrompt=[
                    "Original user request:",
                    prompt,
                    "",
                    "The previous draft was rejected because it omitted these explicitly requested items:",
                    ...missingBeforeRepair.map(item=>"- "+item),
                    "The complete original result checklist is:",
                    ...requestedResultItems.map(item=>"- "+item),
                    "",
                    "Generate a complete replacement calculator definition. Do not merely explain the missing items.",
                    "The replacement MUST contain a separate result row for EVERY missing item listed above.",
                    "For weekly result, add a real formula row whose label contains Weekly or per week.",
                    "For yearly result, add a real formula row whose label contains Yearly, Annual or per year.",
                    "For total weekly, the matching weekly row label MUST contain the word total.",
                    "For total yearly, the matching yearly row label MUST contain the word total.",
                    "Use the original inputs and their keys. Do not invent new inputs unless absolutely required by the requested calculation.",
                    "Keep all original requested assumptions, comparisons, and other requested outputs. Do not silently omit any requirement."
                ].join("\n");
                const repairedContent=await generateWithGroq(groqKey,system,coverageRepairPrompt,aiUsageCollector,"coverage-repair",outputSchemaVersion);
                const repaired= parseAndValidate(repairedContent);
                const repairedCoverageDefinition=outputSchemaVersion===2?{inputs:repaired.candidate?.spec?.inputs||[],results:repaired.candidate?.spec?.results||[]}:repaired.candidate;
                const repairedMissing=findMissingRequestedCoverage(prompt,repairedCoverageDefinition);
                coverageAttempts.push({
                    provider:"groq-repair",
                    resultLabels:(Array.isArray(repairedCoverageDefinition?.results)?repairedCoverageDefinition.results:[]).map(item=>String(item?.label||"")),
                    missingCoverage:[...repairedMissing]
                });
                if(repairedMissing.length){
                    missingCoverage=repairedMissing;
                    console.warn("Groq UGC coverage repair remained incomplete:",repairedMissing);
                }else{
                    content=repairedContent;
                    contentProvider="groq";
                    parsed=repaired.candidate;
                    definition=repaired.normalized;
                    missingCoverage=[];
                }
            }catch(error){
                console.error("Groq UGC calculator coverage repair failed; retaining the original incomplete draft:",error);
            }
        }
        if(validationError){
            await refundAiOperation();
            const invalidJson=validationError instanceof SyntaxError;
            return json({
                success:false,
                code:invalidJson?"INVALID_AI_JSON":"INVALID_AI_CALCULATOR",
                error:validationError?.message||"The AI returned an invalid calculator definition."
            },invalidJson?502:422,origin);
        }
        if(missingCoverage.length){
            const finalCoverageAttempt=coverageAttempts[coverageAttempts.length-1]||{resultLabels:[],missingCoverage};
            const diagnostics={
                build:UGC_MAKER_DIAGNOSTIC_VERSION,
                provider:contentProvider,
                requestedResultItems,
                generatedResultLabels:finalCoverageAttempt.resultLabels,
                generatedResultCount:finalCoverageAttempt.resultLabels.length,
                missingCoverage:[...missingCoverage],
                attempts:coverageAttempts
            };
            console.warn("UGC calculator coverage diagnostics:",diagnostics);
            await refundAiOperation();
            return jsonWithAiUsage({success:false,code:"INCOMPLETE_CALCULATOR",
                error:"The generated calculator is missing requested coverage: "+missingCoverage.join(", ")+". Please generate it again with those items included.",
                diagnostics
            },422,origin,aiUsageCollector);
        }
        try{await settleAiOperation();}
        catch(error){
            console.error("Could not settle the UGC Maker generation and CALC charge:",error);
            await refundAiOperation();
            return jsonWithAiUsage({success:false,code:"AI_OPERATION_SETTLEMENT_FAILED",error:"The generated calculator could not be finalized. No calculator was changed; any reserved CALC and AI allowance were returned."},503,origin,aiUsageCollector);
        }
        return jsonWithAiUsage({success:true,mode:"create",regionalDefaults,billing:aiBilling,operation_id:aiOperationRequestId,calculator:{
            title:String(parsed.title).trim().slice(0,70),
            description:String(parsed.description||"").trim().slice(0,500),
            category:String(parsed.category).toLowerCase(),
            spec:definition
        }},200,origin,aiUsageCollector);
    }catch(error){
        await refundAiOperation();
        console.error("UGC calculator request failed:",error);
        return jsonWithAiUsage({success:false,error:"The AI calculator service is temporarily unavailable. Please try again."},503,origin||SITE_ORIGIN,aiUsageCollector);
    }
}
