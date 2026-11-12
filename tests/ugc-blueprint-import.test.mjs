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
 assert.match(definition.description,/Assumptions: All monetary amounts use EUR\./);
});

test("accepts one outer JSON Markdown fence without interpreting other Markdown",()=>{
 const importer=getImporter();
 const source="\x60\x60\x60json\n"+JSON.stringify(blueprint())+"\n\x60\x60\x60";
 const result=importer.parseBlueprint(source,()=>({errors:[]}));
 assert.equal(result.title,"Household Expense Calculator");
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
 assert.equal(importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]})).spec.inputs[0].control,"select");
 candidate.spec.inputs[0].choices[1].value=0;
 assert.throws(()=>importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]})),/unique labels and numeric values/);
});

test("generates copyable instructions for an external AI and contains no request operation",()=>{
 const importer=getImporter();
 const prompt=importer.buildPrompt();
 assert.match(prompt,/Return exactly one valid JSON object/);
 assert.match(prompt,/blueprintVersion/);
 assert.match(prompt,/never convert currencies/);
 assert.match(prompt,/arbitrary functions/);
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
});
