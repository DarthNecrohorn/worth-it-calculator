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
   normalized.currency=requireString(item.currency,label+" currency",3,3).toUpperCase();
   if(!/^[A-Z]{3}$/.test(normalized.currency))fail(label+" must use a three-letter ISO currency code.");
   if(item.unit!==undefined)fail(label+" cannot have both currency and unit.");
  }else if(format==="unit"){
   normalized.unit=requireString(item.unit,label+" result unit",1,20);
   if(item.currency!==undefined)fail(label+" cannot have both unit and currency.");
  }else if(item.currency!==undefined||item.unit!==undefined)fail(label+" should not specify a currency or unit for this display format.");
  return normalized;
 });

 // Apply narrow, semantics-preserving compatibility fixes for common external-AI output.
 // These do not bypass the shared formula/unit/boundary validator.
 const inputReference=(expression,key)=>{
  const escaped=String(key).replace(/[.*+?^${}()|[\]\\]/g,"\\ const rawScenarios=specSource.scenarios===undefined?[]:requireArray(specSource.scenarios,"Scenarios",3);");
  return new RegExp("(^|[^a-z0-9_])"+escaped+"([^a-z0-9_]|$)","i").test(String(expression||""));
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
 // A target-coverage month count is a multiplier, not a duration quantity.
 inputs.forEach(input=>{
  const unit=String(input.unit||"").trim().toLowerCase();
  const semantic=(String(input.key)+" "+String(input.label)).toLowerCase();
  if(!["month","months"].includes(unit)||!/(emergency|coverage)/.test(semantic))return;
  const uses=results.filter(result=>inputReference(result.expression,input.key));
  const isOnlyScalarMultiplier=uses.length>0&&uses.every(result=>{
   const expression=String(result.expression||"");
   const escaped=String(input.key).replace(/[.*+?^${}()|[\]\\]/g,"\\ const rawScenarios=specSource.scenarios===undefined?[]:requireArray(specSource.scenarios,"Scenarios",3);");
   const occurrences=(expression.match(new RegExp("(^|[^a-z0-9_])"+escaped+"(?=$|[^a-z0-9_])","gi"))||[]).length;
   const multiplied=new RegExp("(?:\\b"+escaped+"\\s*\\*|\\*\\s*"+escaped+"\\b)","i").test(expression);
   const divided=new RegExp("/\\s*"+escaped+"\\b","i").test(expression);
   return occurrences===1&&multiplied&&!divided;
  });
  if(isOnlyScalarMultiplier){
   input.unit="";
   compatibilityNotes.push(input.label+": treated as a unitless multiplier because it scales a monthly EUR amount; the selected value still represents the number of months of coverage.");
  }
 });
 // If a currency result divides a currency amount by an explicit duration input,
 // present the derived rate as EUR/month or EUR/day instead of incorrectly labelling it EUR.
 results.forEach((result,index)=>{
  if(result.format!=="currency")return;
  const expression=String(result.expression||"");
  const denominator=inputs.find(input=>{
   const unit=String(input.unit||"").trim().toLowerCase();
   return ["month","months","day","days","week","weeks","year","years","hour","hours"].includes(unit)
    &&new RegExp("/\\s*"+String(input.key).replace(/[.*+?^${}()|[\]\\]/g,"\\ const rawScenarios=specSource.scenarios===undefined?[]:requireArray(specSource.scenarios,"Scenarios",3);")+"\\b","i").test(expression);
  });
  if(!denominator)return;
  const currency=referencedCurrency(expression,index);
  if(!currency)return;
  const timeUnit=String(denominator.unit).trim().toLowerCase();
  const canonicalTime=({month:"month",months:"month",day:"day",days:"day",week:"week",weeks:"week",year:"year",years:"year",hour:"hour",hours:"hour"})[timeUnit];
  if(!canonicalTime)return;
  result.format="unit";
  result.unit=currency+"/"+canonicalTime;
  delete result.currency;
  compatibilityNotes.push(result.label+": changed the display from currency to "+result.unit+" because the formula divides a currency amount by a duration.");
 });
 // Convert common hard-coded 30-day monthly prorating into an explicit duration input.
 // This preserves dimensional correctness when comparing a projection with a monthly budget.
 const hardCodedPeriod=/([a-z][a-z0-9_]*)\\s*\\/\\s*30(?:\\.0+)?\\s*\\*\\s*([a-z][a-z0-9_]*)/i;
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
 });
 const rawScenarios=specSource.scenarios===undefined?[]:requireArray(specSource.scenarios,"Scenarios",3);
 const inputKeys=new Set(inputs.map(item=>item.key));
 const scenarios=rawScenarios.map((raw,index)=>{
  const label="Scenario "+(index+1),scenario=requireObject(raw,label);
  rejectUnknownKeys(scenario,SCENARIO_KEYS,label);
  const rawValues=requireObject(scenario.values,label+" input values");
  const values={};
  Object.keys(rawValues).forEach(key=>{
   if(!inputKeys.has(key))fail(label+" references an unknown input \""+key+"\".");
   values[key]=requireNumber(rawValues[key],label+" value for "+key);
  });
  return{
   ...(scenario.key===undefined?{}:{key:requireString(scenario.key,label+" key",1,32)}),
   label:requireString(scenario.label,label+" label",2,50),
   values
  };
 });
 let assumptions=[];
 if(rootValue.assumptions!==undefined){
  assumptions=requireArray(rootValue.assumptions,"Assumptions",50).map((item,index)=>requireString(item,"Assumption "+(index+1),1,MAX_ASSUMPTIONS_CHARS));
  if(assumptions.join("\n").length>MAX_ASSUMPTIONS_CHARS)fail("Assumptions can contain up to 5,000 characters in total.");
 }
 const spec={subcategories,inputs,groups,results,scenarios,assumptions};
 const definition={title,description,category,spec};
 if(compatibilityNotes.length)definition.importNotes=compatibilityNotes;
 if(typeof validateSpec!=="function")fail("The calculator validator is unavailable. Please reload Manual Builder.");
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
function parseBlueprint(text,validateSpec){
 if(typeof text!=="string"||!text.trim())fail("Paste a JSON blueprint first.");
 if(text.length>MAX_BLUEPRINT_CHARS)fail("The blueprint is too large. Maximum size is 50 KB.");
 let source=text.replace(/^\uFEFF/,"").trim();
 const fenced=source.match(/^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i);
 if(fenced)source=fenced[1].trim();
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
  "You are creating a data-only calculator blueprint for Worth It Manual Builder.",
  "Return exactly one valid JSON object as raw JSON text. Do not include Markdown fences, headings, explanations, comments, or any text before or after the JSON.",
  "Use ordinary JSON syntax only. Do not HTML-encode spaces or characters (for example, never output &#x20;). Do not add backslash line continuations. In formula strings, write the multiplication operator as a plain asterisk * with no preceding backslash. Do not add trailing commas.",
  "Do not return JavaScript, Python, HTML, CSS, scripts, URLs, file references, network instructions, callbacks, loops, arbitrary functions, or executable code.",
  "Use blueprintVersion 1 and exactly this root structure. Keep subcategories and assumptions at the root; do not duplicate them inside spec:",
  JSON.stringify({blueprintVersion:1,title:"Calculator title",description:"Explain what it measures and its assumptions in at least 24 characters.",category:"home",subcategories:["household-budget"],assumptions:["State important assumptions as plain text."],spec:{inputs:[{key:"base_cost",label:"Base cost",control:"number",min:0,max:1000000,default:30,step:1,unit:"EUR"}],groups:[],results:[{key:"final_total",label:"Final total",expression:"base_cost",format:"currency",currency:"EUR",explanation:"Explain this result in plain language."}],scenarios:[]}},null,2),
  "Allowed root keys only: blueprintVersion, title, description, category, subcategories, assumptions, spec. Allowed categories: cars, money, technology, home, other. Use short lowercase plain-text subcategory keys.",
  "The spec object contains only inputs, groups, results and scenarios. Do not add other spec properties.",
  "Input fields only: key, label, control, min, max, default, step, unit, choices. control may be number, slider, select or toggle; when omitted it defaults to number. Use finite numeric values. Require min <= default <= max and step > 0. For every number or slider input, both (default - min) / step and (max - min) / step must be whole numbers. Use sensible bounded ranges. Give every variable key a unique lowercase name beginning with a letter and containing only lowercase letters, digits and underscores.",
  "For select inputs, choices must contain 2–12 entries with unique text labels and unique numeric values. min and max must exactly equal the smallest and largest choice values, and default must equal one of the choice values. For toggle inputs use min 0, max 1, step 1, and default 0 or 1. Include choices only for select inputs.",
  "Unit handling is strict dimensional algebra and is checked for every formula. An input unit of EUR or USD is a currency dimension; days, weeks, months, years and hours are time dimensions; units/items/people are count dimensions. Multiplication multiplies dimensions and division divides dimensions. For example, EUR / days produces EUR/day, and EUR * months produces EUR*month. These are not plain EUR currency results.",
  "A result with format currency must evaluate to exactly the selected currency dimension, such as EUR or USD. A result with format percent must be dimensionless. A result with format unit must have a unit whose dimensions exactly match the formula. Never label EUR/day, EUR/month or EUR*month as format currency with currency EUR. Do not ever convert currencies or invent exchange rates. Never hide a dimensional mismatch by changing the result label.",
  "If a number is only a unitless scalar multiplier or divisor (for example, a count of months used as a simple planning multiplier), set its input unit to an empty string \"\" or omit unit. Do not label a unitless scalar as days, months, hours or units. If the value genuinely represents a duration or count, give it that unit and carry the resulting dimensions through the formula and result. To convert a rate into a total, multiply by an input with the matching denominator unit; for example, EUR/day multiplied by a duration in days produces EUR.",
  "Addition and subtraction require matching dimensions; a numeric constant may inherit the other operand's unit only in addition/subtraction and comparisons. Multiplication and division do not make constants inherit units. Comparisons require compatible units. if() requires a dimensionless condition and its result branches must have matching units. if() evaluates only the selected result branch, so guarded division such as if(gt(denominator,0),numerator/denominator,0) is safe when the denominator is zero. Still guard every division whose denominator can be zero.",
  "Dynamic group fields only: key, label, min, max, default, step, unit. A group only has key, label, itemLabel, minItems, maxItems, fields. Use 1–4 groups, 1–20 rows per group, and 1–6 numeric fields per group. Use unique lowercase keys across inputs, groups, group fields and result variables. Each group needs at least one field. Group formulas may use sum(group.field), avg(group.field), min(group.field), max(group.field), and count(group), only with an existing group and field.",
  "Result fields only: key, label, expression, format, currency, unit, prefix, suffix, explanation. Use 1–20 results. Results are evaluated from top to bottom: each formula may reference inputs, valid dynamic group fields, and only earlier result keys. Result keys must be unique. format is number, currency, percent or unit. Include currency only for currency results and unit only for unit results. Keep explanations plain text and no longer than 280 characters.",
  "Scenario fields only: optional key, label, values. Use up to 3 scenarios. values must map existing input keys to finite numeric values within each input's minimum and maximum. For select inputs, use one of the declared choice values; for toggles, use 0 or 1. Do not put result or group keys in scenario values.",
  "Limits: title 3–70 characters; description 24–500 characters; assumptions optional, as a root array of plain-text strings with at most 5,000 characters total and no more than 50 entries. Keep assumptions separate from description. Use at most 24 fixed inputs, 4 dynamic groups and 20 results.",
  "Formula grammar only: arithmetic + - * / ^, parentheses, pi, e, and functions min, max, avg, sum, count, abs, round, floor, ceil, trunc, sign, sqrt, pow, clamp, mod, hypot, log, ln, exp, sin, cos, tan, if, gt, gte, lt, lte, eq, neq, and, or, not. Use the plain * character for multiplication, never \\*.",
  "Before returning the JSON, internally check all of the following: every referenced input/group/result exists; result dependencies point only backwards; keys are unique; all fields are allowed; input defaults and maximums align with steps; scenarios are in range; formula dimensions match each result format; every formula remains finite at default values and at minimum/maximum boundaries; no division by zero is possible. Remove unnecessary unused inputs rather than adding decorative controls.",
  "If a requested calculation cannot be represented with these fields or formulas, simplify it or state the limitation in assumptions. Never invent a unit, conversion rate, data source or capability.",
  "Provider-neutral requirement: these instructions apply identically to Gemini, ChatGPT, Claude and any other AI assistant. Do not substitute a different schema or invent capabilities. Produce the complete requested blueprint in one response.",
  "CRITICAL dynamic-group rule: minItems must be an integer from 1 through maxItems. NEVER set minItems to 0. The current Manual Builder requires at least one row. For an optional debt or spending list, keep one row whose numeric field default is 0; the user can leave that row at zero. maxItems must be 1–20.",
  "CRITICAL dimension rules for this exact planner: emergency_target_months is a unitless numeric multiplier, so its input unit must be the empty string \"\" or omitted even though its label describes a number of months. Its formula is planned_expenses * emergency_target_months and its result is currency EUR. Do not give this multiplier the unit months.",
  "The savings-goal deadline is a real duration input and MUST have unit months. First calculate remaining_goal = max(0,savings_goal_amount-current_goal_savings) as currency EUR. Then calculate goal_monthly_required = remaining_goal / goal_deadline_months using format unit and unit EUR/month. Do NOT label this result as currency EUR.",
  "The daily-spending rate MUST use formula tracked_spending / tracking_days, where tracking_days has unit days, and its result must use format unit with unit EUR/day (singular day). The projected spending formula is average_daily_spending * projection_days, where projection_days has unit days; this result is currency EUR.",
  "To compare projected spending with planned expenses over the same number of days, include a budget_month_days input with unit days, min 28, max 31, default 30, step 1. Calculate the planned amount for the projection period as planned_expenses / budget_month_days * projection_days. This result has currency EUR. Never use planned_expenses / 30 * projection_days because the constant 30 has no day unit and the formula has incompatible dimensions.",
  "Required result checklist for this planner (use no more than 20 results): total monthly income; household expense total; debt payment total; annual expenses divided by 12; total planned expenses; amount remaining before savings; amount remaining after planned savings and buffer; debt-to-income percent; planned savings percent; actual savings percent; actual-minus-planned savings; emergency fund target; emergency fund progress percent; emergency fund shortfall; remaining savings goal; required monthly goal contribution in EUR/month; tracked actual spending; average daily spending in EUR/day; projected spending in EUR; projected-versus-planned spending difference for the same projection period. Include all twenty results.",
  "Required inputs for this planner: regular monthly income in EUR; additional monthly income in EUR; annual expenses in EUR; planned monthly savings in EUR; actual monthly savings in EUR; monthly safety buffer in EUR; current emergency fund in EUR; emergency_target_months as a unitless multiplier; savings_goal_amount in EUR; current_goal_savings in EUR; goal_deadline_months in months; tracking_days in days; projection_days in days; budget_month_days in days. Do not omit current_goal_savings or budget_month_days.",
  "Use exactly three dynamic groups: fixed_costs with amount in EUR; debt_payments with payment in EUR; actual_spending with spent in EUR. Each group must use minItems 1, maxItems 10, and one numeric field. For debt_payments and actual_spending, the field default should be 0 so an unused placeholder row adds no amount.",
  "Use these formula patterns, adapting only variable names when necessary: debt_to_income = if(gt(total_income,0),debt_total / total_income * 100,0) with format percent; planned_savings_rate = if(gt(total_income,0),planned_savings / total_income * 100,0) with format percent; actual_savings_rate = if(gt(total_income,0),actual_savings / total_income * 100,0) with format percent; emergency_progress = if(gt(emergency_target,0),emergency_fund / emergency_target * 100,0) with format percent; emergency_shortfall = max(0,emergency_target - emergency_fund) with format currency EUR; remaining_goal = max(0,savings_goal_amount - current_goal_savings) with format currency EUR; goal_monthly_required = remaining_goal / goal_deadline_months with format unit EUR/month; average_daily_spending = tracked_spending / tracking_days with format unit EUR/day; projected_spending = average_daily_spending * projection_days with format currency EUR; spending_variance = projected_spending - (planned_expenses / budget_month_days * projection_days) with format currency EUR.",
  "Every fixed input and every dynamic-group field must have a finite default, min, max and positive step. Defaults and maximums must align exactly with steps. Scenario values must be in range and align with the corresponding input step. Result keys must be unique, at most 32 characters, and result formulas may reference only earlier result keys.",
  "Before returning, verify every result dimension manually: EUR results are currency EUR; percentages are dimensionless; daily and monthly rates are format unit with EUR/day or EUR/month. The unitless emergency_target_months multiplier multiplied by EUR stays EUR. Never use format currency for EUR/day or EUR/month.",
  "Calculator request: Build a comprehensive Household Budget and Savings Planner for an individual or household. Use EUR consistently and follow every exact planner-specific key, unit, group, formula and result rule immediately above. Let users enter regular and additional monthly income, recurring household expenses and monthly debt payments, additional annual expenses, planned and actual savings, a monthly safety buffer, current emergency fund and coverage target, one savings goal with already-saved amount and deadline, actual spending by category and a separate projection period. Include Conservative, Balanced and Flexible scenarios that change only existing numeric inputs. Do not invent investment returns, taxes, inflation, bank connections or exchange rates."
 ].join("\n\n");
}
root.WorthItBlueprintImport=Object.freeze({parseBlueprint,buildPrompt,MAX_BLUEPRINT_CHARS,MAX_ASSUMPTIONS_CHARS});
})(typeof window!=="undefined"?window:globalThis);
