import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const helperSource=readFileSync(new URL("../ugc-blueprint-import.js",import.meta.url),"utf8");
const builderSource=readFileSync(new URL("../ugc-calculators.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

function getImporter(){
 const sandbox={window:{}};
 runInNewContext(helperSource,sandbox);
 return sandbox.window.WorthItBlueprintImport;
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function blueprint(overrides={}){
 return {
  blueprintVersion:1,
  title:"Household Expense Calculator",
  description:"Calculate a household purchase total and analyse additional expenses.",
  category:"home",
  subcategories:["household-budget"],
  assumptions:["All monetary amounts use EUR."],
  spec:{
   inputs:[{key:"base_cost",label:"Base cost",min:0,max:1000000,default:30,step:1,unit:"EUR"}],
   groups:[{key:"expenses",label:"Extra expenses",itemLabel:"Item",minItems:2,maxItems:10,fields:[{key:"amount",label:"Amount",min:0,max:1000000,default:0,step:1,unit:"EUR"}]}],
   results:[
    {key:"extra_total",label:"Extra expenses total",expression:"sum(expenses.amount)",format:"currency",currency:"EUR"},
    {key:"final_total",label:"Final total",expression:"base_cost + extra_total",format:"currency",currency:"EUR"}
   ],
   scenarios:[{key:"lower_cost",label:"Lower cost",values:{base_cost:20}}]
  },
  ...overrides
 };
}

test("imports a valid version-1 blueprint into the current Manual Builder definition shape",()=>{
 const importer=getImporter();
 const definition=importer.parseBlueprint(JSON.stringify(blueprint()),()=>({errors:[]}));
 assert.equal(definition.title,"Household Expense Calculator");
 assert.equal(definition.category,"home");
 assert.deepEqual(plain(definition.spec.subcategories),["household-budget"]);
 assert.equal(definition.spec.inputs[0].unit,"EUR");
 assert.equal(definition.spec.groups[0].minItems,2);
 assert.equal(definition.spec.results[1].expression,"base_cost + extra_total");
 assert.equal(definition.spec.scenarios[0].values.base_cost,20);
 assert.equal(definition.description,blueprint().description);
 assert.deepEqual(plain(definition.spec.assumptions),["All monetary amounts use EUR."]);
});

test("keeps assumptions separate from the short description and supports up to 5,000 characters",()=>{
 const importer=getImporter();
 const candidate=blueprint({assumptions:["A".repeat(1000),"B".repeat(1000),"C".repeat(1000),"D".repeat(1000),"E".repeat(996)]});
 const result=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]}));
 assert.equal(result.description,candidate.description);
 assert.equal(result.spec.assumptions.join("\n").length,5000);
 candidate.assumptions.push("F");
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]})),/up to 5,000 characters/);
});

test("accepts one outer JSON Markdown fence without interpreting other Markdown",()=>{
 const importer=getImporter();
 const source="\x60\x60\x60json\n"+JSON.stringify(blueprint())+"\n\x60\x60\x60";
 const result=importer.parseBlueprint(source,()=>({errors:[]}));
 assert.equal(result.title,"Household Expense Calculator");
});

test("repairs copied JSON line continuations, HTML-encoded spaces and escaped multiplication signs",()=>{
 const importer=getImporter();
 const candidate=blueprint();
 candidate.spec.results[1].expression="base_cost * 2 + extra_total";
 const clean=JSON.stringify(candidate,null,2);
 const copiedArtifactText=clean
  .replace(/ /g,"&#x20;")
  .replace(/\n/g,"\\\n")
  .replace(/\*/g,"\\*");
 const result=importer.parseBlueprint(copiedArtifactText,()=>({errors:[]}));
 assert.equal(result.spec.results[1].expression,"base_cost * 2 + extra_total");
 assert.equal(result.title,candidate.title);
});
test("reports a JSON syntax location when copy/paste artifacts cannot be repaired",()=>{
 const importer=getImporter();
 assert.throws(
  ()=>importer.parseBlueprint('{"blueprintVersion":1,\\n"title": }',()=>({errors:[]})),
  /Could not read JSON at line/
 );
});
test("rejects malformed or empty JSON with a useful error",()=>{
 const importer=getImporter();
 assert.throws(()=>importer.parseBlueprint("",()=>({errors:[]})),/Paste a JSON blueprint/);
 assert.throws(()=>importer.parseBlueprint("{not json}",()=>({errors:[]})),/Could not read JSON/);
});

test("rejects unsupported fields instead of silently discarding them",()=>{
 const importer=getImporter();
 const invalid=blueprint();
 invalid.spec.inputs[0].script="alert(1)";
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(invalid),()=>({errors:[]})),/unsupported property/);
});

test("rejects prototype-sensitive property names",()=>{
 const importer=getImporter();
 const json=JSON.stringify(blueprint()).replace('"blueprintVersion":1','"__proto__":{"polluted":true},"blueprintVersion":1');
 assert.throws(()=>importer.parseBlueprint(json,()=>({errors:[]})),/forbidden property/);
});

test("enforces payload size and nesting limits before normalisation",()=>{
 const importer=getImporter();
 const oversized=JSON.stringify(blueprint())+" ".repeat(importer.MAX_BLUEPRINT_CHARS);
 assert.throws(()=>importer.parseBlueprint(oversized,()=>({errors:[]})),/too large/);
 const nested=JSON.parse(JSON.stringify(blueprint()));
 let cursor=nested;
 for(let i=0;i<15;i++){cursor.extra={};cursor=cursor.extra;}
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(nested),()=>({errors:[]})),/nested too deeply/);
});

test("rejects non-finite/non-numeric inputs and requires explicit currency",()=>{
 const importer=getImporter();
 const badNumber=blueprint();badNumber.spec.inputs[0].default="30";
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(badNumber),()=>({errors:[]})),/finite JSON number/);
 const missingCurrency=blueprint();delete missingCurrency.spec.results[0].currency;
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(missingCurrency),()=>({errors:[]})),/currency/);
});

test("rejects unsupported formulas when the shared Manual Builder validator reports an error",()=>{
 const importer=getImporter();
 assert.throws(
  ()=>importer.parseBlueprint(JSON.stringify(blueprint()),()=>({errors:["Result formula: This calculator contains an invalid formula."]})),
  /did not pass calculator validation/
 );
});

test("validates dropdown choice uniqueness and bounds",()=>{
 const importer=getImporter();
 const candidate=blueprint();
 candidate.spec.inputs[0]={key:"plan",label:"Plan",control:"select",min:0,max:10,default:0,step:10,unit:"",choices:[{label:"Basic",value:0},{label:"Premium",value:10}]};
 candidate.spec.results=[{key:"plan_value",label:"Plan value",expression:"plan",format:"number"}];
 candidate.spec.scenarios=[];
 assert.equal(importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]})).spec.inputs[0].control,"select");
 candidate.spec.inputs[0].choices[1].value=0;
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]})),/unique labels and numeric values/);
});

test("normalizes optional zero-value groups to the Manual Builder minimum of one row",()=>{
 const importer=getImporter();
 const candidate=blueprint();
 candidate.spec.groups[0].minItems=0;
 candidate.spec.groups[0].fields[0].default=0;
 let validatedSpec;
 const result=importer.parseBlueprint(JSON.stringify(candidate),spec=>{validatedSpec=plain(spec);return{errors:[]};});
 assert.equal(result.spec.groups[0].minItems,1);
 assert.equal(validatedSpec.groups[0].minItems,1);
 assert.match(result.importNotes[0],/changed minItems from 0 to 1/);
});

test("does not normalize zero-row groups when a placeholder would add a nonzero amount",()=>{
 const importer=getImporter();
 const candidate=blueprint();
 candidate.spec.groups[0].minItems=0;
 candidate.spec.groups[0].fields[0].default=100;
 assert.throws(
  ()=>importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]})),
  /cannot start with zero rows unless every field defaults to zero/
 );
});


test("generates copyable instructions for an external AI and contains no request operation",()=>{
 const importer=getImporter();
 const prompt=importer.buildPrompt();
 assert.match(prompt,/Return exactly one valid JSON object/);
 assert.match(prompt,/blueprintVersion/);
 assert.match(prompt,/never convert currencies|currency dimension/);
 assert.match(prompt,/arbitrary functions/);
 assert.match(prompt,/5,000 characters total/);
 assert.match(prompt,/strict dimensional algebra/);
 assert.match(prompt,/EUR \/ days produces EUR\/day/);
 assert.match(prompt,/EUR \* months produces EUR\*month/);
 assert.match(prompt,/unitless scalar/);
 assert.match(prompt,/plain asterisk \* with no preceding backslash/);
 assert.match(prompt,/Do not HTML-encode spaces/);
 assert.match(prompt,/maximums align with steps/);
 assert.match(prompt,/Provider-neutral requirement/);
 assert.match(prompt,/NEVER set minItems to 0/);
 assert.match(prompt,/emergency_target_months is a unitless numeric multiplier/);
 assert.match(prompt,/format unit and unit EUR\/month/);
 assert.match(prompt,/format unit with unit EUR\/day/);
 assert.match(prompt,/budget_month_days/);
 assert.match(prompt,/Include all twenty results/);
 assert.doesNotMatch(helperSource,/fetch\s*\(/i);
});

test("Manual Builder exposes the optional importer without wiring it to the Worth It AI endpoint",()=>{
 assert.match(html,/id="ugcBlueprintImportPanel"[^>]*hidden/);
 assert.match(html,/id="ugcBlueprintImportJson"/);
 assert.match(html,/ugc-blueprint-import\.js/);
 const importFunction=builderSource.match(/function importManualBlueprint\(\)\{[\s\S]*?\n\}/)?.[0]||"";
 assert.ok(importFunction.includes("parseBlueprint"));
 assert.ok(importFunction.includes('state.creationSource="manual"'));
 assert.ok(importFunction.includes('state.aiOperationId=""'));
 assert.doesNotMatch(importFunction,/fetch\s*\(|\/api\/ugc-maker|\.rpc\s*\(/);
 assert.match(builderSource,/ugcBlueprintCopyPrompt/);
 assert.match(builderSource,/ugcBlueprintImportButton/);
 assert.match(builderSource,/ugcMakerAssumptions/);
 assert.match(builderSource,/maxLength=5000/);
});

test("if() evaluates only the selected branch so guarded division is safe at zero",()=>{
 const start=builderSource.indexOf("function evaluate(ast,values,groupValues){");
 const end=builderSource.indexOf("\nfunction groupMapForSpec",start);
 assert.ok(start>=0&&end>start,"The shared formula evaluator must be present.");
 const evaluateSource=builderSource.slice(start,end);
 const evaluate=runInNewContext("("+evaluateSource+")");
 const guarded={
  type:"call",name:"if",args:[
   {type:"call",name:"gt",args:[{type:"variable",name:"income"},{type:"number",value:0}]},
   {type:"binary",op:"/",left:{type:"number",value:100},right:{type:"variable",name:"income"}},
   {type:"number",value:0}
  ]
 };
 assert.equal(evaluate(guarded,{income:0},{}),0);
 assert.equal(evaluate(guarded,{income:20},{}),5);
});
