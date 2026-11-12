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
   key:item.key===undefined?"":requireString(item.key,label+" variable key",1,32),
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
  assumptions=requireArray(rootValue.assumptions,"Assumptions",10).map((item,index)=>requireString(item,"Assumption "+(index+1),1,180));
 }
 if(assumptions.length){
  const suffix="\n\nAssumptions: "+assumptions.join("; ");
  if(description.length+suffix.length>500)fail("The description and assumptions exceed the 500-character limit. Shorten them and import again.");
  description+=suffix;
 }
 const spec={subcategories,inputs,groups,results,scenarios};
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
  "You are designing a Worth It Calculator Manual Builder blueprint.",
  "Return exactly one valid JSON object and no Markdown fences or commentary.",
  "Do not return JavaScript, Python, HTML, scripts, formulas outside the documented expression language, or network instructions.",
  "Use blueprintVersion 1 and this exact root shape:",
  JSON.stringify({blueprintVersion:1,title:"Calculator title",description:"Explain what it measures and its assumptions in at least 24 characters.",category:"home",subcategories:["household-budget"],assumptions:["State important assumptions as plain text."],spec:{inputs:[{key:"base_cost",label:"Base cost",min:0,max:1000000,default:30,step:1,unit:"EUR"}],groups:[],results:[{key:"final_total",label:"Final total",expression:"base_cost",format:"currency",currency:"EUR",explanation:"Explain this result in plain language."}],scenarios:[]}},null,2),
  "Allowed root keys: blueprintVersion, title, description, category, subcategories, assumptions, spec.",
  "Allowed categories: cars, money, technology, home, other. Subcategories must be short plain-text category keys.",
  "spec supports inputs, groups, results and scenarios. Use only these exact object fields:",
  "Input: key, label, control, min, max, default, step, unit, choices. control is number, slider, select or toggle. choices is only for select and contains {label,value}; use 2–12 unique choices.",
  "Dynamic group: key, label, itemLabel, minItems, maxItems, fields. Each field uses key, label, min, max, default, step, unit. Use 1–4 groups, 1–20 rows, and 1–6 fields per group.",
  "Result: key, label, expression, format, currency, unit, prefix, suffix, explanation. format is number, currency, percent or unit. Include currency only for currency results and unit only for unit results.",
  "Scenario: key (optional), label, values. values is an object mapping input keys to numeric values.",
  "Limits: 1–24 fixed inputs, 1–20 results, up to 3 scenarios, title 3–70 chars, description 24–500 chars, input/result/group keys start with a lowercase letter and use only lowercase letters, digits and underscores.",
  "Formula grammar is restricted: arithmetic + - * / ^, parentheses, pi, e, and the documented functions min, max, avg, sum, count, abs, round, floor, ceil, trunc, sign, sqrt, pow, clamp, mod, hypot, log, ln, exp, sin, cos, tan, if, gt, gte, lt, lte, eq, neq, and, or, not.",
  "Use sum(group.field), avg(group.field), min(group.field), max(group.field), and count(group) only for valid dynamic group references. A formula may use an input or an earlier result key.",
  "Keep units compatible. Addition/subtraction and comparisons require matching units. Currency codes are distinct units; never convert currencies or invent exchange rates. Any conversion must be an explicit numeric input/formula in one consistent target unit.",
  "Use finite numeric defaults, sensible min/max/step, and formulas that work at both default and boundary values. Keep formulas deterministic and bounded.",
  "Do not include unknown keys, custom components, code, HTML, URLs, file references, arbitrary functions, loops, recursion, callbacks or network access.",
  "Assumptions are optional plain-text strings. If uncertain, state the uncertainty in assumptions rather than inventing data."
 ].join("\n\n");
}
root.WorthItBlueprintImport=Object.freeze({parseBlueprint,buildPrompt,MAX_BLUEPRINT_CHARS});
})(typeof window!=="undefined"?window:globalThis);
