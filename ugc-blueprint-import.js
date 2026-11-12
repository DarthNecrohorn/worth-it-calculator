(function(root){
"use strict";
const MAX_BLUEPRINT_CHARS=50000;
const MAX_NODES=3000;
const MAX_DEPTH=12;
const FORBIDDEN_KEYS=new Set(["__proto__","prototype","constructor"]);
const CATEGORIES=new Set(["cars","money","technology","home","other"]);
const INPUT_KEYS=new Set(["key","label","control","min","max","default","step","unit","choices"]);
const GROUP_KEYS=new Set(["key","label","itemLabel","minItems","maxItems","fields"]);
const FIELD_KEYS=new Set(["key","label","min","max","default","step","unit"]);
const RESULT_KEYS=new Set(["key","label","expression","format","currency","unit","prefix","suffix","explanation"]);
const SCENARIO_KEYS=new Set(["key","label","values"]);
const CHOICE_KEYS=new Set(["label","value"]);
const SPEC_KEYS=new Set(["subcategories","inputs","groups","results","scenarios"]);
const MAX_ASSUMPTIONS_CHARS=5000;

function fail(message){throw new Error(message);}
function isObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function requireObject(value,label){if(!isObject(value))fail(label+" must be a JSON object.");return value;}
function requireArray(value,label,max){if(!Array.isArray(value))fail(label+" must be a JSON array.");if(value.length>max)fail(label+" exceeds the supported item limit.");return value;}
function requireString(value,label,min,max){
 if(typeof value!=="string")fail(label+" must be text.");
 const result=value.trim();
 if(result.length<min||result.length>max)fail(label+" must contain "+min+"–"+max+" characters.");
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result))fail(label+" contains unsupported control characters.");
 return result;
}
function requireNumber(value,label){
 if(typeof value!=="number"||!Number.isFinite(value))fail(label+" must be a finite JSON number.");
 return value;
}
function rejectUnknownKeys(value,allowed,label){
 Object.keys(value).forEach(key=>{
  if(FORBIDDEN_KEYS.has(key))fail(label+" contains a forbidden property.");
  if(!allowed.has(key))fail(label+" contains unsupported property \""+key+"\".");
 });
}
function inspectTree(value){
 let nodes=0;
 const visit=(item,depth)=>{
  nodes++;
  if(nodes>MAX_NODES)fail("The blueprint contains too many values.");
  if(depth>MAX_DEPTH)fail("The blueprint is nested too deeply.");
  if(Array.isArray(item)){if(item.length>200)fail("A blueprint list is too large.");item.forEach(child=>visit(child,depth+1));return;}
  if(isObject(item)){
   Object.keys(item).forEach(key=>{
    if(FORBIDDEN_KEYS.has(key))fail("The blueprint contains a forbidden property.");
    visit(item[key],depth+1);
   });
  }
 };
 visit(value,0);
}
function normalizeBlueprint(source,validateSpec){
 const rootValue=requireObject(source,"Blueprint");
 rejectUnknownKeys(rootValue,new Set(["blueprintVersion","title","description","category","subcategories","spec","assumptions"]),"Blueprint");
 if(rootValue.blueprintVersion!==1)fail("Unsupported blueprint version. Please use blueprintVersion 1.");
 const title=requireString(rootValue.title,"Calculator title",3,70);
 let description=requireString(rootValue.description,"Calculator description",24,500);
 const category=String(rootValue.category||"");
 if(!CATEGORIES.has(category))fail("Choose one supported primary category: cars, money, technology, home or other.");
 const specSource=requireObject(rootValue.spec,"spec");
 rejectUnknownKeys(specSource,SPEC_KEYS,"spec");
 const rawSubcategories=Object.prototype.hasOwnProperty.call(rootValue,"subcategories")
  ?rootValue.subcategories:(specSource.subcategories||[]);
 if(Object.prototype.hasOwnProperty.call(rootValue,"subcategories")&&Object.prototype.hasOwnProperty.call(specSource,"subcategories"))fail("Choose one subcategories location: the blueprint root or spec, not both.");
 const subcategories=requireArray(rawSubcategories,"Subcategories",12).map((item,index)=>requireString(item,"Subcategory "+(index+1),1,40));
 if(new Set(subcategories).size!==subcategories.length)fail("Subcategories must be unique.");
 const rawInputs=requireArray(specSource.inputs,"Inputs",24);
 if(!rawInputs.length)fail("Add at least one input.");
 const inputs=rawInputs.map((raw,index)=>{
  const label="Input "+(index+1),item=requireObject(raw,label);
  rejectUnknownKeys(item,INPUT_KEYS,label);
  const normalized={
   key:requireString(item.key,label+" variable key",1,32),
   label:requireString(item.label,label+" label",1,60),
   min:requireNumber(item.min,label+" minimum"),
   max:requireNumber(item.max,label+" maximum"),
   default:requireNumber(item.default,label+" default"),
   step:requireNumber(item.step,label+" step"),
   unit:item.unit===undefined?"":requireString(item.unit,label+" unit",0,16)
  };
  const control=item.control===undefined?"number":item.control;
  if(!["number","slider","select","toggle"].includes(control))fail(label+" uses an unsupported control type.");
  if(control!=="number")normalized.control=control;
  if(control==="select"){
   const choices=requireArray(item.choices,label+" choices",12);
   if(choices.length<2)fail(label+" needs 2–12 dropdown choices.");
   normalized.choices=choices.map((rawChoice,choiceIndex)=>{
    const choice=requireObject(rawChoice,label+" choice "+(choiceIndex+1));
    rejectUnknownKeys(choice,CHOICE_KEYS,label+" choice "+(choiceIndex+1));
    return{label:requireString(choice.label,label+" choice label",1,50),value:requireNumber(choice.value,label+" choice value")};
   });
   if(new Set(normalized.choices.map(choice=>choice.label.toLowerCase())).size!==choices.length
    ||new Set(normalized.choices.map(choice=>choice.value)).size!==choices.length)fail(label+" dropdown choices must have unique labels and numeric values.");
   const choiceValues=normalized.choices.map(choice=>choice.value);
   if(normalized.min!==Math.min(...choiceValues)||normalized.max!==Math.max(...choiceValues)
    ||!normalized.choices.some(choice=>choice.value===normalized.default))fail(label+" minimum, maximum and default must match its dropdown choices.");
  }else if(item.choices!==undefined)fail(label+" can only include choices when its control type is select.");
  if(control==="toggle"&&(normalized.min!==0||normalized.max!==1||normalized.step!==1||![0,1].includes(normalized.default)))fail(label+" toggle values must use min 0, max 1, step 1 and default 0 or 1.");
  return normalized;
 });
 const compatibilityNotes=[];
 const rawGroups=specSource.groups===undefined?[]:requireArray(specSource.groups,"Dynamic groups",4);
 const groups=rawGroups.map((raw,index)=>{
  const label="Dynamic group "+(index+1),group=requireObject(raw,label);
  rejectUnknownKeys(group,GROUP_KEYS,label);
  const fieldsRaw=requireArray(group.fields,label+" fields",6);
  if(!fieldsRaw.length)fail(label+" needs at least one field.");
  const fields=fieldsRaw.map((rawField,fieldIndex)=>{
   const fieldLabel=label+" field "+(fieldIndex+1),field=requireObject(rawField,fieldLabel);
   rejectUnknownKeys(field,FIELD_KEYS,fieldLabel);
   return{
    key:requireString(field.key,fieldLabel+" key",1,32),
    label:requireString(field.label,fieldLabel+" label",1,60),
    min:requireNumber(field.min,fieldLabel+" minimum"),
    max:requireNumber(field.max,fieldLabel+" maximum"),
    default:requireNumber(field.default,fieldLabel+" default"),
    step:requireNumber(field.step,fieldLabel+" step"),
    unit:field.unit===undefined?"":requireString(field.unit,fieldLabel+" unit",0,16)
   };
  });
  let minItems=group.minItems===undefined?1:requireNumber(group.minItems,label+" minimum rows");
  if(minItems===0){
   if(!fields.every(field=>field.default===0))fail(label+" cannot start with zero rows unless every field defaults to zero. The Manual Builder requires at least one row; use a zero-value placeholder row.");
   minItems=1;
   compatibilityNotes.push(label+": changed minItems from 0 to 1 because the Manual Builder requires one row. Its default values are all zero, so the placeholder does not change the calculation.");
  }
  return{
   key:requireString(group.key,label+" key",1,32),
   label:requireString(group.label,label+" label",2,60),
   itemLabel:group.itemLabel===undefined?"Item":requireString(group.itemLabel,label+" row label",1,40),
   minItems,
   maxItems:group.maxItems===undefined?10:requireNumber(group.maxItems,label+" maximum rows"),
   fields
  };
 });
 const rawResults=requireArray(specSource.results,"Results",20);
 if(!rawResults.length)fail("Add at least one result.");
 const results=rawResults.map((raw,index)=>{
  const label="Result "+(index+1),item=requireObject(raw,label);
  rejectUnknownKeys(item,RESULT_KEYS,label);
  const format=item.format===undefined?"number":item.format;
  if(!["number","currency","percent","unit"].includes(format))fail(label+" uses an unsupported display format.");
  const normalized={
   key:item.key===undefined||item.key===""?"":requireString(item.key,label+" variable key",1,32),
   label:requireString(item.label,label+" label",1,70),
   expression:requireString(item.expression,label+" formula",1,500),
   format,
   explanation:item.explanation===undefined?"":requireString(item.explanation,label+" explanation",0,280),
   prefix:item.prefix===undefined?"":requireString(item.prefix,label+" prefix",0,16),
   suffix:item.suffix===undefined?"":requireString(item.suffix,label+" suffix",0,16)
  };
  if(format==="currency"){
   const currency=typeof item.currency==="string"?item.currency.trim().toUpperCase():"";
   normalized.currency=/^[A-Z]{3}$/.test(currency)?currency:"";
   if(!normalized.currency){
    if(typeof validateSpec?.repairBlueprintSpec!=="function")fail(label+" must specify an explicit three-letter currency code.");
    compatibilityNotes.push(label+": currency will be inferred from the formula's dimensions because its code was missing or invalid.");
   }
   if(item.unit!==undefined)compatibilityNotes.push(label+": removed redundant unit metadata from a currency result.");
  }else if(format==="unit"){
   normalized.unit=typeof item.unit==="string"?item.unit.trim().slice(0,20):"";
   if(!normalized.unit&&typeof validateSpec?.repairBlueprintSpec!=="function")fail(label+" must specify a result unit.");
   if(!normalized.unit)compatibilityNotes.push(label+": result unit will be inferred from the formula's dimensions.");
   if(item.currency!==undefined)compatibilityNotes.push(label+": removed redundant currency metadata from a unit result.");
  }else if(item.currency!==undefined||item.unit!==undefined){
   compatibilityNotes.push(label+": removed currency or unit metadata that does not apply to its selected display format.");
  }
  return normalized;
 });

 // Apply narrow, semantics-preserving compatibility fixes for common external-AI output.
 // These do not bypass the shared formula/unit/boundary validator.
 const inputReference=(expression,key)=>{
  if(!/^[a-z][a-z0-9_]{0,31}$/i.test(String(key)))return false;
  return new RegExp("(^|[^a-z0-9_])"+String(key)+"(?=$|[^a-z0-9_])","i").test(String(expression||""));
 };
 const referencedCurrency=(expression,priorIndex)=>{
  for(const input of inputs){
   if(inputReference(expression,input.key)&&/^[A-Z]{3}$/.test(input.unit||""))return input.unit;
  }
  for(const result of results.slice(0,priorIndex)){
   if(result.key&&inputReference(expression,result.key)&&result.format==="currency")return result.currency;
  }
  return "";
 };
 // A target-coverage month count used only as a multiplier is dimensionless.
 inputs.forEach(input=>{
  const unit=String(input.unit||"").trim().toLowerCase();
  const semantic=(String(input.key)+" "+String(input.label)).toLowerCase();
  if(!["month","months"].includes(unit)||!/(emergency|coverage)/.test(semantic))return;
  const uses=results.filter(result=>inputReference(result.expression,input.key));
  const isOnlyScalarMultiplier=uses.length>0&&uses.every(result=>{
   const expression=String(result.expression||"");
   const key=String(input.key);
   const guardsRemoved=expression.replace(new RegExp("(?:gt|gte|lt|lte|eq|neq)\\(\\s*"+key+"\\s*,\\s*(?:0|0\\.0+)\\s*\\)","gi"),"");
   const occurrences=(guardsRemoved.match(new RegExp("(^|[^a-z0-9_])"+key+"(?=$|[^a-z0-9_])","gi"))||[]).length;
   const multiplied=new RegExp("(?:\\b"+key+"\\s*\\*|\\*\\s*"+key+"\\b)","i").test(guardsRemoved);
   const divided=new RegExp("/\\s*"+key+"\\b","i").test(guardsRemoved);
   return occurrences===1&&multiplied&&!divided;
  });
  if(isOnlyScalarMultiplier){
   input.unit="";
   compatibilityNotes.push(input.label+": treated as a unitless multiplier because it scales a monthly EUR amount; the selected value still represents the number of months of coverage.");
  }
 });
 // A currency amount divided by a duration is a rate only when that
 // duration dimension is still present in the final expression. If a matching
 // duration is multiplied later (e.g. EUR / budget_month_days * projection_days),
 // the time dimension cancels and the final result remains currency.
 const timeUnitKind=unit=>{
  const value=String(unit||"").trim().toLowerCase();
  return ["month","months","day","days","week","weeks","year","years","hour","hours"].includes(value)?"time":"";
 };
 const isMultipliedReference=(expression,key)=>
  new RegExp("(?:\\b"+String(key)+"\\s*\\*|\\*\\s*"+String(key)+"\\b)","i").test(expression);
 results.forEach((result,index)=>{
  if(result.format!=="currency")return;
  const expression=String(result.expression||"");
  const denominator=inputs.find(input=>timeUnitKind(input.unit)
   &&new RegExp("/\\s*"+String(input.key)+"\\b","i").test(expression));
  if(!denominator)return;
  const currency=referencedCurrency(expression,index);
  if(!currency)return;
  const finalDimensionCancels=timeUnitKind(denominator.unit)&&inputs.some(input=>
   input.key!==denominator.key&&timeUnitKind(input.unit)===timeUnitKind(denominator.unit)
   &&isMultipliedReference(expression,input.key));
  if(finalDimensionCancels)return;
  const timeUnit=String(denominator.unit).trim().toLowerCase();
  const canonicalTime=({month:"month",months:"month",day:"day",days:"day",week:"week",weeks:"week",year:"year",years:"year",hour:"hour",hours:"hour"})[timeUnit];
  if(!canonicalTime)return;
  result.format="unit";
  result.unit=currency+"/"+canonicalTime;
  delete result.currency;
  compatibilityNotes.push(result.label+": changed the display from currency to "+result.unit+" because the formula divides a currency amount by a duration and retains that rate dimension.");
 });
 // Replace a hard-coded 30-day monthly divisor with an explicit duration input.
 const hardCodedPeriod=/([a-z][a-z0-9_]*)\s*\/\s*30(?:\.0+)?\s*\*\s*([a-z][a-z0-9_]*)/i;
 const needsBudgetPeriod=results.some(result=>{
  const match=String(result.expression||"").match(hardCodedPeriod);
  if(!match)return false;
  const numeratorIsCurrency=Boolean(referencedCurrency(match[1],results.indexOf(result)));
  const projectionInput=inputs.find(input=>input.key===match[2]&&["day","days"].includes(String(input.unit||"").trim().toLowerCase()));
  return numeratorIsCurrency&&Boolean(projectionInput);
 });
 if(needsBudgetPeriod){
  let budgetDays=inputs.find(input=>input.key==="budget_month_days");
  if(!budgetDays){
   if(inputs.length>=24)fail("A projection comparison uses a hard-coded 30-day period, but there is no room for the required budget_month_days input. Add it manually (days, 28–31, default 30) and retry.");
   budgetDays={key:"budget_month_days",label:"Days in the monthly budget period",control:"number",min:28,max:31,default:30,step:1,unit:"days"};
   inputs.push(budgetDays);
  }else if(!["day","days"].includes(String(budgetDays.unit||"").trim().toLowerCase())){
   fail("The budget_month_days input must use the days unit.");
  }
  results.forEach(result=>{
   const expression=String(result.expression||"");
   if(!hardCodedPeriod.test(expression))return;
   result.expression=expression.replace(hardCodedPeriod,"$1 / budget_month_days * $2");
  });
  compatibilityNotes.push("Added budget_month_days (28–31 days, default 30) and replaced hard-coded 30-day monthly prorating so projected and planned spending use matching EUR dimensions over the same period.");
 }
 const rawScenarios=specSource.scenarios===undefined?[]:requireArray(specSource.scenarios,"Scenarios",3);
 const inputKeys=new Set(inputs.map(item=>item.key));
 const scenarios=rawScenarios.map((raw,index)=>{
  const label="Scenario "+(index+1),scenario=requireObject(raw,label);
  rejectUnknownKeys(scenario,SCENARIO_KEYS,label);
  const rawValues=isObject(scenario.values)?scenario.values:{};
  if(!isObject(scenario.values))compatibilityNotes.push(label+": created an empty scenario value map because the supplied values were missing or invalid.");
  const values={};
  Object.keys(rawValues).forEach(key=>{
   if(!inputKeys.has(key)){compatibilityNotes.push(label+": removed an unknown input value ("+key+").");return;}
   const input=inputs.find(item=>item.key===key);
   let value=requireNumber(rawValues[key],label+" value for "+key);
   const original=value;
   value=Math.max(input.min,Math.min(input.max,value));
   if(input.control==="toggle")value=value>=0.5?1:0;
   else if(input.control==="select"&&Array.isArray(input.choices)){
    value=input.choices.reduce((best,choice)=>Math.abs(choice.value-value)<Math.abs(best.value-value)?choice:best,input.choices[0]).value;
   }else{
    const position=(value-input.min)/input.step;
    if(Math.abs(position-Math.round(position))>1e-7){
     value=input.min+Math.round(position)*input.step;
     value=Math.max(input.min,Math.min(input.max,value));
    }
   }
   if(value!==original)compatibilityNotes.push(label+": adjusted "+key+" to a valid in-range value aligned with its input control.");
   values[key]=value;
  });
  let scenarioLabel=typeof scenario.label==="string"&&scenario.label.trim()?scenario.label.trim().slice(0,50):"Scenario "+(index+1);
  if(scenarioLabel.length<2)scenarioLabel="Scenario "+(index+1);
  return{
   ...(typeof scenario.key==="string"&&/^[a-z][a-z0-9_]{0,31}$/.test(scenario.key)?{key:scenario.key}:{}),
   label:scenarioLabel,
   values
  };
 });
 let assumptions=[];
 if(rootValue.assumptions!==undefined){
  assumptions=requireArray(rootValue.assumptions,"Assumptions",50).map((item,index)=>requireString(item,"Assumption "+(index+1),1,MAX_ASSUMPTIONS_CHARS));
  if(assumptions.join("\n").length>MAX_ASSUMPTIONS_CHARS)fail("Assumptions can contain up to 5,000 characters in total.");
 }
 let spec={subcategories,inputs,groups,results,scenarios,assumptions};
 if(typeof validateSpec!=="function")fail("The calculator validator is unavailable. Please reload Manual Builder.");
 if(typeof validateSpec.repairBlueprintSpec==="function"){
  const repaired=validateSpec.repairBlueprintSpec(spec);
  if(repaired&&isObject(repaired.spec))spec=repaired.spec;
  if(Array.isArray(repaired?.notes))compatibilityNotes.push(...repaired.notes);
 }
 const definition={title,description,category,spec};
 if(compatibilityNotes.length)definition.importNotes=compatibilityNotes.slice(0,20);
 const validation=validateSpec(spec);
 const errors=Array.isArray(validation?.errors)?validation.errors:[];
 if(errors.length){
  const visibleErrors=errors.slice(0,5);
  const guidance=[];
  if(visibleErrors.some(message=>/use 1–20 rows and a valid group/i.test(message))){
   guidance.push("Dynamic groups must use minItems 1 or greater. For an optional list, keep one row whose field defaults to zero; minItems 0 is not supported.");
  }
  if(visibleErrors.some(message=>/units do not match the selected .* result currency/i.test(message))){
   guidance.push("Check dimensional algebra: a month count used only as a multiplier must have an empty unit; dividing EUR by a real months input produces EUR/month, which must use format unit with unit EUR/month, not currency EUR.");
  }
  if(visibleErrors.some(message=>/dimensions do not match the selected result unit/i.test(message))){
   guidance.push("Use the exact derived unit for rate results, for example EUR/day for money divided by days or EUR/month for money divided by months.");
  }
  if(visibleErrors.some(message=>/divides by zero|remainder by zero/i.test(message))){
   guidance.push("Guard every possibly-zero denominator with if(gt(denominator,0),numerator/denominator,0). if() evaluates only its selected result branch.");
  }
  fail("The blueprint did not pass calculator validation: "+visibleErrors.join(" ")+(guidance.length?" Correction guidance: "+guidance.join(" "):""));
 }
 return definition;
}
function repairCopiedJsonArtifacts(source){
 return source
  .replace(/&#x20;|&#32;|&nbsp;/gi," ")
  .replace(/\\[ \t]*\r?\n/g,"\n")
  .replace(/\\\*/g,"*");
}
function jsonSyntaxFailure(error,source){
 const message=String(error?.message||"Invalid JSON syntax.");
 const match=message.match(/position\s+(\d+)/i);
 if(match){
  const position=Math.max(0,Math.min(source.length,Number(match[1])));
  const before=source.slice(0,position);
  const line=before.split("\n").length;
  const column=position-(before.lastIndexOf("\n")+1)+1;
  fail("Could not read JSON at line "+line+", column "+column+". "+message+" Paste only the JSON object, without surrounding instructions.");
 }
 fail("Could not read JSON. "+message+" Paste only the JSON object, without surrounding instructions.");
}
function extractSingleJsonPayload(source){
 const fencePattern=/\x60{3}([a-z0-9_-]*)[ \t]*\r?\n?([\s\S]*?)\x60{3}/gi;
 const fences=[...source.matchAll(fencePattern)];
 if(fences.length>1)fail("More than one code block was found. Keep only the single calculator JSON object.");
 if(fences.length===1){
  const language=String(fences[0][1]||"").toLowerCase();
  if(language&&language!=="json")fail("The calculator blueprint code block must be labelled json or have no language label.");
  return String(fences[0][2]||"").trim();
 }
 // Some assistants return one raw JSON object with a short introduction or closing sentence.
 // Extract only when there is exactly one balanced top-level object; never guess between candidates.
 let depth=0,start=-1,inString=false,escaped=false;
 const candidates=[];
 for(let index=0;index<source.length;index++){
  const character=source[index];
  if(inString){
   if(escaped){escaped=false;continue;}
   if(character==="\\"){escaped=true;continue;}
   if(character==='"')inString=false;
   continue;
  }
  if(character==='"'){inString=true;continue;}
  if(character==="{"){
   if(depth===0)start=index;
   depth++;
  }else if(character==="}"&&depth>0){
   depth--;
   if(depth===0&&start>=0){candidates.push(source.slice(start,index+1));start=-1;}
  }
 }
 if(candidates.length>1)fail("More than one JSON object was found. Paste only the single calculator blueprint.");
 if(candidates.length===1)return candidates[0];
 return source.trim();
}
function parseBlueprint(text,validateSpec){
 if(typeof text!=="string"||!text.trim())fail("Paste a JSON blueprint first.");
 if(text.length>MAX_BLUEPRINT_CHARS)fail("The blueprint is too large. Maximum size is 50 KB.");
 const withoutBom=text.replace(/^\uFEFF/,"").trim();
 let source=extractSingleJsonPayload(withoutBom);
 let parsed;
 try{
  parsed=JSON.parse(source);
 }catch(firstError){
  const repaired=repairCopiedJsonArtifacts(source);
  if(repaired!==source){
   try{
    parsed=JSON.parse(repaired);
    source=repaired;
   }catch(secondError){
    jsonSyntaxFailure(secondError,repaired);
   }
  }else{
   jsonSyntaxFailure(firstError,source);
  }
 }
 inspectTree(parsed);
 return normalizeBlueprint(parsed,validateSpec);
}
function buildPrompt(){
 return [
  "You are designing a data-only calculator blueprint for Worth It Manual Builder.",
  "GOAL: Turn the user's actual calculator request into a complete, correct and useful calculator. The subject may be any domain. These instructions define the output format and safety limits; they do not prescribe a calculator topic.",
  "Return exactly one valid JSON object. Prefer raw JSON with no Markdown fences, headings, explanations, comments, or text before or after it. If your interface requires a code block, use exactly one JSON code block containing only the JSON object.",
  "Use ordinary JSON syntax. Do not HTML-encode spaces or characters (never write &#x20;), add backslash line continuations, add trailing commas, or escape the multiplication operator. In formula strings use the plain asterisk character.",
  "Never return JavaScript, Python, HTML, CSS, scripts, URLs, file references, network instructions, callbacks, loops, arbitrary functions, executable code or instructions to run code.",
  "Use blueprintVersion 1 and exactly this root structure. Keep subcategories and assumptions at the root; do not duplicate them inside spec:",
  JSON.stringify({blueprintVersion:1,title:"Calculator title",description:"Explain what the calculator measures and its main assumptions in at least 24 characters.",category:"other",subcategories:[],assumptions:["State important assumptions as plain text."],spec:{inputs:[{key:"base_value",label:"Base value",control:"number",min:0,max:1000,default:30,step:1,unit:""}],groups:[],results:[{key:"calculated_value",label:"Calculated value",expression:"base_value",format:"number",explanation:"Explain this result in plain language."}],scenarios:[]}},null,2),
  "Allowed root keys only: blueprintVersion, title, description, category, subcategories, assumptions, spec. Allowed categories: cars, money, technology, home, other. Use concise lowercase plain-text subcategory keys that describe the actual requested subject.",
  "The spec object contains only inputs, groups, results and scenarios. Do not add any other spec properties.",
  "Input fields only: key, label, control, min, max, default, step, unit, choices. control may be number, slider, select or toggle; when omitted it defaults to number. Use finite numeric values. Require min <= default <= max and step > 0. For every number or slider input, both (default - min) / step and (max - min) / step must be whole numbers. Use sensible, realistic and bounded ranges.",
  "Give every input, group, group-field and result variable key a unique lowercase name beginning with a letter and containing only lowercase letters, digits and underscores. Keys must be unique across the entire blueprint, not merely within one object.",
  "For select inputs, choices must contain 2–12 entries with unique text labels and unique numeric values. min and max must exactly equal the smallest and largest choice values, and default must equal one of the choice values. For toggle inputs use min 0, max 1, step 1, and default 0 or 1. Include choices only for select inputs.",
  "UNIT SYSTEM: Unit handling uses dimensional algebra. Currency codes such as EUR, USD and RSD are currency dimensions; days, weeks, months, years and hours are time dimensions; items, units, people and packs are count dimensions. Common supported physical units include km, miles, m, cm, mm, m², ft², L, m³, mL, kg, g, tonnes, kWh, MWh, MJ, W and kW. Common supported compound units include L/100 km, km/h, m/s, m²/pack, kWh/day and kWh/month. Currency rates such as EUR/day, EUR/month, EUR/hour, EUR/km, EUR/L, EUR/kWh, EUR/kg and EUR/unit are dimensionally understood when their denominator is supported.",
  "Do not invent compound-unit syntax and assume the validator can decompose it. A custom unit not recognised by the unit system is treated as an opaque standalone unit; do not combine it with other physical or currency dimensions. Prefer supported base units and calculate with them. Use consistent unit spelling and case, especially for currency codes and symbols.",
  "Multiplication multiplies dimensions and division divides dimensions. For example EUR / days produces EUR/day; EUR/month multiplied by months produces EUR. A unitless scalar multiplier or divisor must have an empty unit. If a value genuinely represents a duration, distance, mass, volume, energy or count, give it the corresponding supported unit and carry that dimension through the formula.",
  "A result with format currency must evaluate to exactly the selected currency dimension, such as EUR or USD. A result with format percent must be dimensionless. A result with format unit must use a unit whose dimensions match the formula exactly. Never label EUR/day, EUR/month, EUR/km or EUR*month as format currency with currency EUR. Never mix currencies or invent exchange rates.",
  "Addition and subtraction require matching units; numeric constants may inherit the other operand's unit only in addition, subtraction and comparisons. Multiplication and division do not make constants inherit units. Comparisons require compatible units. if() requires a dimensionless condition and its result branches must have matching units.",
  "There is no automatic conversion between currencies or unit scales. Do not assume months, years, days, kilometres and miles are numerically interchangeable. Use matching units on both sides of a calculation wherever possible. When conversion is essential, include the correct explicit numerical conversion and explain the assumption.",
  "Keep rates and totals separate. Do not add EUR/month directly to EUR/year. Convert each rate to a total over its matching duration first, then add totals of the same currency. For a rate result, use the exact derived unit, e.g. EUR/day for money divided by days or EUR/month for money divided by months.",
  "Dynamic group fields only: key, label, min, max, default, step, unit. A group only has key, label, itemLabel, minItems, maxItems, fields. Use 0–4 groups, 1–20 rows per group, and 1–6 numeric fields per group. The Manual Builder requires minItems from 1 through maxItems; NEVER use minItems 0. For an optional list, use one placeholder row with all numeric defaults set to 0. maxItems must be 1–20. All group field keys must be unique across the entire blueprint.",
  "Group formulas may use sum(group.field), avg(group.field), min(group.field), max(group.field), and count(group), only with an existing group and field. Aggregate group fields before combining their values with fixed inputs where appropriate.",
  "Result fields only: key, label, expression, format, currency, unit, prefix, suffix, explanation. Use 1–20 results. Results are evaluated from top to bottom: each formula may reference inputs, valid dynamic group fields, and only earlier result keys. Result keys must be unique. format is number, currency, percent or unit. Include currency only for currency results and unit only for unit results. Keep explanations plain text and no longer than 280 characters.",
  "Scenario fields only: optional key, label, values. Use up to 3 scenarios. values must map existing input keys to finite numeric values within each input's minimum and maximum. For select inputs, use one of the declared choice values; for toggles, use 0 or 1. Do not put result or group keys in scenario values. Scenarios may change fixed inputs only; do not imply that they modify dynamic group rows.",
  "Formula grammar only: arithmetic + - * / ^, parentheses, pi, e, and functions min, max, abs, round, floor, ceil, sqrt, pow, clamp, avg, sum, count, mod, trunc, sign, hypot, log, ln, exp, sin, cos, tan, asin, acos, atan, if, gt, gte, lt, lte, eq, neq, and, or, not. Use the plain asterisk for multiplication.",
  "Guard every division whose denominator can be zero, for example if(gt(denominator,0),numerator/denominator,0). if() evaluates only its selected result branch. Keep every calculation finite at realistic values and at input boundaries.",
  "Limits: title 3–70 characters; description 24–500 characters; assumptions optional as a root array of plain-text strings, at most 50 entries and 5,000 characters total; at most 24 fixed inputs, 4 dynamic groups and 20 results.",
  "Before returning, check every field against the allowed schema; all keys are unique; every reference exists; result dependencies point only backwards; inputs and group fields have valid ranges and step alignment; scenarios are in range; every formula uses only supported syntax; formula dimensions match result formats; no denominator can unexpectedly be zero; and formulas produce finite numbers at defaults and tested minimum/maximum boundaries.",
  "REQUEST-SPECIFIC DESIGN: Follow the user's actual calculator request supplied with these instructions or in the surrounding conversation. It may describe any subject, level of complexity, audience or use case. Do not assume the example calculator above is the requested subject. Do not apply topic-specific keys, groups, formulas, inputs, scenarios or requirements from another calculator. Preserve the requested functionality as fully as the supported schema allows.",
  "Use the user's prompt as the source of calculator requirements, and this blueprint contract as the output and safety format. If details are missing but a safe calculation can still be designed, make conservative assumptions and list them in assumptions. Ask for clarification only when a missing detail makes a correct calculation impossible. Never invent data sources, live data, external connections, medical or financial guarantees, conversion rates or unsupported capabilities.",
  "If part of the requested calculator cannot be represented by the allowed fields or formula grammar, implement the supported parts and state the limitation transparently in assumptions. Do not silently omit an important requested feature.",
  "PROVIDER-NEUTRAL REQUIREMENT: These same rules apply to ChatGPT, Gemini, Claude, DeepSeek and any other AI assistant. Do not substitute another schema, add provider-specific fields or claim that the importer can execute code. Return one complete blueprint in the canonical version-1 format."
 ].join("\n\n");
}

root.WorthItBlueprintImport=Object.freeze({parseBlueprint,buildPrompt,MAX_BLUEPRINT_CHARS,MAX_ASSUMPTIONS_CHARS});
})(typeof window!=="undefined"?window:globalThis);
