import "../../ugc-calculator-currency-data.js";
import "../../ugc-calculator-engine.js";
import "../../ugc-blueprint-import.js";
import { validateCalculatorForServer } from "../lib/ugc-calculator-validation.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_TOKEN_LIMIT_FALLBACK_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_THINKING_LEVEL = "medium";
const GROQ_REASONING_EFFORT = "low";
const MAX_PROMPT_CHARS = 5000;
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
function providerFailureCode(error,provider){
    const message=String(error?.message||"");
    const status=message.match(new RegExp(provider+" calculator generation failed \\((\\d{3})\\)","i"));
    if(status){
        if(status[1]==="400"){
            const detailCode=message.match(/"code"\s*:\s*"([a-z0-9_-]{1,48})"/i)?.[1];
            if(detailCode)return "PROVIDER_"+detailCode.replace(/[^a-z0-9]+/gi,"_").toUpperCase();
        }
        return "HTTP_"+status[1];
    }
    if(/token limit|truncated/i.test(message))return "OUTPUT_TOKEN_LIMIT";
    if(/empty calculator definition/i.test(message))return "EMPTY_RESPONSE";
    if(/timeout|aborted|network|fetch failed/i.test(message))return "NETWORK_ERROR";
    return "PROVIDER_ERROR";
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
        httpStatus:nullableUsageNumber(attempt.httpStatus),
        failureCode:typeof attempt.failureCode==="string"?attempt.failureCode:null
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
export function summarizeAiCandidateForDiagnostics(candidate,schemaVersion=1){
    if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return null;
    const spec=candidate.spec&&typeof candidate.spec==="object"?candidate.spec:candidate;
    const boundedString=(value,max=500)=>String(value??"").trim().slice(0,max);
    const inputs=Array.isArray(spec.inputs)?spec.inputs.slice(0,24).map(item=>({
        key:boundedString(item?.key,32),
        label:boundedString(item?.label,60),
        type:boundedString(item?.type||"number",16),
        control:boundedString(item?.control||"number",16),
        unit:boundedString(item?.unit,24),
        min:Number.isFinite(Number(item?.min))?Number(item.min):null,
        max:Number.isFinite(Number(item?.max))?Number(item.max):null,
        step:Number.isFinite(Number(item?.step))?Number(item.step):null
    })):[];
    const groups=Array.isArray(spec.groups)?spec.groups.slice(0,4).map(group=>({
        key:boundedString(group?.key,32),
        label:boundedString(group?.label,60),
        fields:Array.isArray(group?.fields)?group.fields.slice(0,6).map(field=>({
            key:boundedString(field?.key,32),
            label:boundedString(field?.label,60),
            type:boundedString(field?.type||"number",16),
            unit:boundedString(field?.unit,24)
        })):[]
    })):[];
    const results=Array.isArray(spec.results)?spec.results.slice(0,20).map(item=>({
        key:boundedString(item?.key,32),
        label:boundedString(item?.label,70),
        expression:boundedString(item?.expression,500),
        format:boundedString(item?.format,16),
        currency:boundedString(item?.currency,3),
        unit:boundedString(item?.unit,24)
    })):[];
    return {
        schemaVersion:Number(schemaVersion)===2?2:1,
        title:boundedString(candidate.title,70),
        category:boundedString(candidate.category||candidate.classification?.category,24),
        inputs,
        groups,
        results,
        scenarioCount:Array.isArray(spec.scenarios)?Math.min(3,spec.scenarios.length):0
    };
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
async function reserveAiOperation(env,token,requestId,mode,calculatorId,schemaVersion=1){
    return normalizeRpcObject(await userRpc(env,token,"reserve_worth_it_ugc_ai_operation",{
        p_request_id:requestId,p_mode:mode,p_calculator_id:calculatorId||null,p_schema_version:schemaVersion
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
async function generateWithGemini(apiKey,system,prompt,usageCollector,stage="initial-generation",schemaVersion=1){
    const startedAt=Date.now();
    let data=null,httpStatus=null,recorded=false;
    const record=(success,error=null)=>{
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
            httpStatus,
            failureCode:success?null:providerFailureCode(error,"Gemini")
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
                    generationConfig:{maxOutputTokens:Number(schemaVersion)===2?16384:8192,responseMimeType:"application/json",thinkingConfig:{thinkingLevel:GEMINI_THINKING_LEVEL}}
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
        record(false,error);
        throw error;
    }
}
async function generateWithGroq(apiKey,system,prompt,usageCollector,stage="initial-generation",schemaVersion=1,model=GROQ_MODEL){
    const startedAt=Date.now();
    let data=null,httpStatus=null,recorded=false;
    const record=(success,error=null)=>{
        if(recorded)return;
        const usage=data?.usage||{};
        recordAiUsageAttempt(usageCollector,{
            provider:"groq",
            model:data?.model||model,
            stage,
            success,
            durationMs:Date.now()-startedAt,
            inputTokens:usage.prompt_tokens,
            outputTokens:usage.completion_tokens,
            thinkingTokens:usage.completion_tokens_details?.reasoning_tokens,
            totalTokens:usage.total_tokens,
            cachedInputTokens:usage.prompt_tokens_details?.cached_tokens,
            finishReason:data?.choices?.[0]?.finish_reason||null,
            httpStatus,
            failureCode:success?null:providerFailureCode(error,"Groq")
        });
        recorded=true;
    };
    try{
        const typedV2=Number(schemaVersion)===2;
        const jsonOutputRule="Output contract: return ONLY one complete JSON object. Do not return Markdown fences, prose, explanations, comments or any text before or after the JSON object. Use valid JSON strings and escape all quotation marks and newlines correctly.";
        const groqSystem=typedV2?[
            jsonOutputRule,
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
        const providerRequest={
            model,
            temperature:0.15,
            max_completion_tokens:typedV2?16384:8192,
            messages:[{role:"user",content:[jsonOutputRule,groqSystem,"Calculator request:",prompt].join(String.fromCharCode(10))}]
        };
        if(model===GROQ_MODEL){
            providerRequest.reasoning_effort=GROQ_REASONING_EFFORT;
            // GPT-OSS uses include_reasoning; reasoning_format is not supported by this model.
            providerRequest.include_reasoning=false;
        }else if(model===GROQ_TOKEN_LIMIT_FALLBACK_MODEL){
            // This non-reasoning recovery model supports JSON Object Mode. Server-side
            // V1/V2 parsing and validation still remain authoritative.
            providerRequest.response_format={type:"json_object"};
        }
        const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
            method:"POST",
            headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
            body:JSON.stringify(providerRequest)
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
        record(false,error);
        throw error;
    }
}
async function generateWithGroqWithTokenRecovery(apiKey,system,prompt,usageCollector,stage="initial-generation",schemaVersion=1){
    try{
        return await generateWithGroq(apiKey,system,prompt,usageCollector,stage,schemaVersion);
    }catch(error){
        if(providerFailureCode(error,"Groq")!=="OUTPUT_TOKEN_LIMIT")throw error;
        console.warn("Groq GPT-OSS exhausted its completion-token budget; retrying once with the non-reasoning JSON model.");
        return generateWithGroq(
            apiKey,system,prompt,usageCollector,"token-limit-recovery",schemaVersion,
            GROQ_TOKEN_LIMIT_FALLBACK_MODEL
        );
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
    const origin=allowedOrigin(context.request);
    if(!origin)return json({success:false,error:"Forbidden origin."},403,SITE_ORIGIN);
    return json({
        success:false,
        code:"AI_UGC_CREATOR_DISABLED",
        error:"AI generation and AI improvement for community calculators have been removed. Use the Manual Builder instead."
    },410,origin);
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
function normalizeTypedV2CurrencyPolicy(raw,defaultCurrency,forceCurrency){
    const candidate=JSON.parse(JSON.stringify(raw));
    const fallback=SERVER_SUPPORTED_CURRENCY_CODES.has(String(defaultCurrency||"").toUpperCase())
        ?String(defaultCurrency).toUpperCase():"USD";
    const forced=SERVER_SUPPORTED_CURRENCY_CODES.has(String(forceCurrency||"").toUpperCase())
        ?String(forceCurrency).toUpperCase():"";
    const normalizeField=field=>{
        if(!field||typeof field!=="object"||field.type!=="number")return;
        const semantic=normalizeMonetaryPromptText(String(field.label||"")+" "+String(field.key||""));
        const unit=String(field.unit||"").trim();
        const upperUnit=unit.toUpperCase();
        const currencyPrefix=upperUnit.match(/^([A-Z]{3})(?:\s*\/|$)/)?.[1]||"";
        const hasCurrencyUnit=SERVER_SUPPORTED_CURRENCY_CODES.has(upperUnit)
            ||SERVER_SUPPORTED_CURRENCY_CODES.has(currencyPrefix);
        const percentageUnit=["%","percent","percentage"].includes(unit.toLowerCase());
        const percentageRate=/\b(?:tax|interest|discount|growth|inflation|commission|margin|processing|marketplace)\s+(?:fee\s+)?(?:rates?|percentages?)\b/.test(semantic);
        const exchangeRate=/\b(?:exchange|conversion)\s+rates?\b/.test(semantic);
        const monetary=!percentageUnit&&!exchangeRate&&!(percentageRate&&!hasCurrencyUnit)&&(
            hasCurrencyUnit
            ||/\b(?:price|cost|amount|fees?|tariffs?|charges?|salary|income|budget|rent|payment|saving|savings|deposit|expense|spend|wage|tax|insurance|maintenance|parking|tolls?|loan|lease|repair|subscription|revenue|profit|turnover)\b/.test(semantic)
        );
        if(!monetary)return;
        const basisMatch=semantic.match(/\bper\s+(kwh|m3|m³|litres?|liters?|l|km|kilometres?|kilometers?|kg|g|hours?|days?|units?|items?|packs?|products?)\b/i);
        const rawBasis=basisMatch?.[1]||"";
        const basis=/^kwh$/i.test(rawBasis)?"kWh":
            /^(?:m3|m³)$/i.test(rawBasis)?"m3":
            /^(?:litres?|liters?|l)$/i.test(rawBasis)?"L":
            /^(?:kilometres?|kilometers?|km)$/i.test(rawBasis)?"km":
            /^(?:kg)$/i.test(rawBasis)?"kg":
            /^(?:g)$/i.test(rawBasis)?"g":
            /^hours?$/i.test(rawBasis)?"hour":
            /^days?$/i.test(rawBasis)?"day":
            /^items?$/i.test(rawBasis)?"item":
            /^packs?$/i.test(rawBasis)?"pack":
            /^(?:units?|products?)$/i.test(rawBasis)?"unit":"";
        const existingRate=unit.match(/^[A-Z]{3}\s*\/\s*(.+)$/);
        let normalizedUnit=unit;
        if(forced){
            normalizedUnit=existingRate?forced+"/"+existingRate[1]:forced;
        }else if(!hasCurrencyUnit){
            normalizedUnit=fallback;
        }
        if(basis&&/^[A-Z]{3}$/.test(normalizedUnit))normalizedUnit+="/"+basis;
        field.unit=normalizedUnit;
    };
    (Array.isArray(candidate?.spec?.inputs)?candidate.spec.inputs:[]).forEach(normalizeField);
    (Array.isArray(candidate?.spec?.groups)?candidate.spec.groups:[]).forEach(group=>{
        (Array.isArray(group?.fields)?group.fields:[]).forEach(normalizeField);
    });
    (Array.isArray(candidate?.spec?.results)?candidate.spec.results:[]).forEach(result=>{
        if(!result||typeof result!=="object")return;
        if(result.format==="currency"){
            result.currency=forced||(
                SERVER_SUPPORTED_CURRENCY_CODES.has(String(result.currency||"").toUpperCase())
                    ?String(result.currency).toUpperCase():fallback
            );
            delete result.unit;
        }else if(result.format==="unit"){
            const unit=String(result.unit||"").trim();
            const prefix=unit.match(/^([A-Z]{3})(?:\s*\/|$)/)?.[1]||"";
            if(forced&&SERVER_SUPPORTED_CURRENCY_CODES.has(prefix))result.unit=forced+unit.slice(3);
            delete result.currency;
        }else{
            delete result.currency;
            delete result.unit;
        }
    });
    return candidate;
}
function normalizeTypedV2Definition(raw,defaultCurrency,options={}){
    const candidate=normalizeTypedV2CurrencyPolicy(raw,defaultCurrency,options?.forceCurrency);
    const importer=globalThis.WorthItBlueprintImport;
    if(typeof importer?.parseBlueprint!=="function")throw new Error("The shared strict Blueprint V2 importer is unavailable.");
    const category=String(candidate?.category||"");
    const subcategories=Array.isArray(candidate?.subcategories)?candidate.subcategories:[];
    const allowed=ALLOWED_SUBCATEGORIES[category];
    if(!allowed||subcategories.length<1||subcategories.length>3||new Set(subcategories).size!==subcategories.length||
       subcategories.some(value=>typeof value!=="string"||!allowed.has(value))){
        throw new Error("The AI-selected V2 categories are invalid or do not belong to the selected primary category.");
    }
    const normalized=importer.parseBlueprint(JSON.stringify(candidate),spec=>{
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
    normalized.spec.assumptions=Array.isArray(candidate.assumptions)?[...candidate.assumptions]:[];
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
    if(Number(raw?.blueprintVersion)===2)return normalizeTypedV2Definition(raw,defaultCurrency,options);
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
        const rateBasis=semantic.match(/\bper\s+(kwh|m3|m³|litres?|liters?|l|km|kilometres?|kilometers?|kg|g|hour|hours|day|days|units?|items?|packs?|products?)\b/i)?.[1]||"";
        const normalizedRateBasis=/^(?:kwh)$/i.test(rateBasis)?"kWh":
            /^(?:m3|m³)$/i.test(rateBasis)?"m3":
            /^(?:litres?|liters?|l)$/i.test(rateBasis)?"L":
            /^(?:kilometres?|kilometers?|km)$/i.test(rateBasis)?"km":
            /^(?:kg)$/i.test(rateBasis)?"kg":
            /^(?:g)$/i.test(rateBasis)?"g":
            /^(?:hours?)$/i.test(rateBasis)?"hour":
            /^(?:days?)$/i.test(rateBasis)?"day":
            /^(?:items?)$/i.test(rateBasis)?"item":
            /^(?:packs?)$/i.test(rateBasis)?"pack":
            /^(?:units?|products?)$/i.test(rateBasis)?"unit":"";
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
            const rateBasis=semantic.match(/\bper\s+(kwh|m3|m³|litres?|liters?|l|km|kilometres?|kilometers?|kg|g|hour|hours|day|days|units?|items?|packs?|products?)\b/i)?.[1]||"";
            const normalizedRateBasis=/^(?:kwh)$/i.test(rateBasis)?"kWh":
                /^(?:m3|m³)$/i.test(rateBasis)?"m3":
                /^(?:litres?|liters?|l)$/i.test(rateBasis)?"L":
                /^(?:kilometres?|kilometers?|km)$/i.test(rateBasis)?"km":
                /^(?:kg)$/i.test(rateBasis)?"kg":
                /^(?:g)$/i.test(rateBasis)?"g":
                /^(?:hours?)$/i.test(rateBasis)?"hour":
                /^(?:days?)$/i.test(rateBasis)?"day":
            /^(?:items?)$/i.test(rateBasis)?"item":
            /^(?:packs?)$/i.test(rateBasis)?"pack":
            /^(?:units?|products?)$/i.test(rateBasis)?"unit":"";
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
    const origin=allowedOrigin(context.request);
    if(!origin)return json({success:false,error:"Forbidden origin."},403,SITE_ORIGIN);
    return json({
        success:false,
        code:"AI_UGC_CREATOR_DISABLED",
        error:"AI generation and AI improvement for community calculators have been removed. Use the Manual Builder instead."
    },410,origin);
}
