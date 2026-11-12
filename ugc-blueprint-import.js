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
  return{
   key:requireString(group.key,label+" key",1,32),
   label:requireString(group.label,label+" label",2,60),
   itemLabel:group.itemLabel===undefined?"Item":requireString(group.itemLabel,label+" row label",1,40),
   minItems:group.minItems===undefined?1:requireNumber(group.minItems,label+" minimum rows"),
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
 if(typeof validateSpec!=="function")fail("The calculator validator is unavailable. Please reload Manual Builder.");
 const validation=validateSpec(spec);
 const errors=Array.isArray(validation?.errors)?validation.errors:[];
 if(errors.length)fail("The blueprint did not pass calculator validation: "+errors.slice(0,5).join(" "));
 return definition;
}
function parseBlueprint(text,validateSpec){
 if(typeof text!=="string"||!text.trim())fail("Paste a JSON blueprint first.");
 if(text.length>MAX_BLUEPRINT_CHARS)fail("The blueprint is too large. Maximum size is 50 KB.");
 let source=text.trim();
 const fenced=source.match(/^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i);
 if(fenced)source=fenced[1].trim();
 let parsed;
 try{parsed=JSON.parse(source);}catch(_){fail("Could not read JSON. Check the braces, quotes and commas, then try again.");}
 inspectTree(parsed);
 return normalizeBlueprint(parsed,validateSpec);
}
function buildPrompt(){
 return [
  "You are creating a data-only calculator blueprint for Worth It Manual Builder.",
  "Return exactly one raw JSON object. Do not include Markdown fences, headings, explanations, comments, or any text before or after the JSON.",
  "Use ordinary JSON syntax only. Do not HTML-encode spaces or characters (for example, never output &#x20;). Do not add backslash line continuations. In formula strings, write the multiplication operator as a plain asterisk * with no preceding backslash. Do not add trailing commas.",
  "Do not return JavaScript, Python, HTML, CSS, scripts, URLs, file references, network instructions, callbacks, loops, or executable code.",
  "Use blueprintVersion 1 and exactly this root structure. Keep subcategories and assumptions at the root; do not duplicate them inside spec:",
  JSON.stringify({blueprintVersion:1,title:"Calculator title",description:"Explain what it measures and its assumptions in at least 24 characters.",category:"home",subcategories:["household-budget"],assumptions:["State important assumptions as plain text."],spec:{inputs:[{key:"base_cost",label:"Base cost",control:"number",min:0,max:1000000,default:30,step:1,unit:"EUR"}],groups:[],results:[{key:"final_total",label:"Final total",expression:"base_cost",format:"currency",currency:"EUR",explanation:"Explain this result in plain language."}],scenarios:[]}},null,2),
  "Allowed root keys only: blueprintVersion, title, description, category, subcategories, assumptions, spec. Allowed categories: cars, money, technology, home, other. Use short lowercase plain-text subcategory keys.",
  "The spec object contains only inputs, groups, results and scenarios. Do not add other spec properties.",
  "Input fields only: key, label, control, min, max, default, step, unit, choices. control may be number, slider, select or toggle; when omitted it defaults to number. Use finite numeric values. Require min <= default <= max and step > 0. For every number or slider input, both (default - min) / step and (max - min) / step must be whole numbers. Use sensible bounded ranges. Give every variable key a unique lowercase name beginning with a letter and containing only lowercase letters, digits and underscores.",
  "For select inputs, choices must contain 2–12 entries with unique text labels and unique numeric values. min and max must exactly equal the smallest and largest choice values, and default must equal one of the choice values. For toggle inputs use min 0, max 1, step 1, and default 0 or 1. Include choices only for select inputs.",
  "Unit handling is strict dimensional algebra and is checked for every formula. An input unit of EUR or USD is a currency dimension; days, weeks, months, years and hours are time dimensions; units/items/people are count dimensions. Multiplication multiplies dimensions and division divides dimensions. For example, EUR / days produces EUR/day, and EUR * months produces EUR*month. These are not plain EUR currency results.",
  "A result with format currency must evaluate to exactly the selected currency dimension, such as EUR or USD. A result with format percent must be dimensionless. A result with format unit must have a unit whose dimensions exactly match the formula. Never label EUR/day, EUR/month or EUR*month as format currency with currency EUR. Never hide a dimensional mismatch by changing the result label.",
  "If a number is only a scalar multiplier or divisor (for example, a count of months used as a simple planning multiplier), set its input unit to an empty string \"\" or omit unit. Do not label a dimensionless scalar as days, months, hours or units. If the value genuinely represents a duration or count, give it that unit and carry the resulting dimensions through the formula and result. To convert a rate into a total, multiply by an input with the matching denominator unit; for example, EUR/day multiplied by a duration in days produces EUR.",
  "Addition and subtraction require matching dimensions; a numeric constant may inherit the other operand's unit only in addition/subtraction and comparisons. Multiplication and division do not make constants inherit units. Comparisons require compatible units. if() requires a dimensionless condition and its result branches must have matching units. Division must remain safe when an input is at its minimum, including zero; use a supported guarded expression such as if(gt(denominator,0),numerator/denominator,0) where appropriate.",
  "Dynamic group fields only: key, label, min, max, default, step, unit. A group only has key, label, itemLabel, minItems, maxItems, fields. Use 1–4 groups, 1–20 rows per group, and 1–6 numeric fields per group. Use unique lowercase keys across inputs, groups, group fields and result variables. Each group needs at least one field. Group formulas may use sum(group.field), avg(group.field), min(group.field), max(group.field), and count(group), only with an existing group and field.",
  "Result fields only: key, label, expression, format, currency, unit, prefix, suffix, explanation. Use 1–20 results. Results are evaluated from top to bottom: each formula may reference inputs, valid dynamic group fields, and only earlier result keys. Result keys must be unique. format is number, currency, percent or unit. Include currency only for currency results and unit only for unit results. Keep explanations plain text and no longer than 280 characters.",
  "Scenario fields only: optional key, label, values. Use up to 3 scenarios. values must map existing input keys to finite numeric values within each input's minimum and maximum. For select inputs, use one of the declared choice values; for toggles, use 0 or 1. Do not put result or group keys in scenario values.",
  "Limits: title 3–70 characters; description 24–500 characters; assumptions optional, as a root array of plain-text strings with at most 5,000 characters total and no more than 50 entries. Keep assumptions separate from description. Use at most 24 fixed inputs, 4 dynamic groups and 20 results.",
  "Formula grammar only: arithmetic + - * / ^, parentheses, pi, e, and functions min, max, avg, sum, count, abs, round, floor, ceil, trunc, sign, sqrt, pow, clamp, mod, hypot, log, ln, exp, sin, cos, tan, if, gt, gte, lt, lte, eq, neq, and, or, not. Use the plain * character for multiplication, never \\*.",
  "Before returning the JSON, internally check all of the following: every referenced input/group/result exists; result dependencies point only backwards; keys are unique; all fields are allowed; input defaults and maximums align with steps; scenarios are in range; formula dimensions match each result format; every formula remains finite at default values and at minimum/maximum boundaries; no division by zero is possible. Remove unnecessary unused inputs rather than adding decorative controls.",
  "If a requested calculation cannot be represented with these fields or formulas, simplify it or state the limitation in assumptions. Never invent a unit, conversion rate, data source or capability.",
  "Calculator request: [REPLACE THIS PLACEHOLDER WITH THE CALCULATOR YOU WANT TO BUILD]."
 ].join("\n\n");
}
root.WorthItBlueprintImport=Object.freeze({parseBlueprint,buildPrompt,MAX_BLUEPRINT_CHARS,MAX_ASSUMPTIONS_CHARS});
})(typeof window!=="undefined"?window:globalThis);
