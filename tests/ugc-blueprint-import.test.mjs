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
function getManualEngine(){
 const start=builderSource.indexOf("function compileExpression(");
 const end=builderSource.indexOf("\nfunction makerCurrencyWarnings",start);
 assert.ok(start>=0&&end>start,"The shared Manual Builder formula engine must be present.");
 const engineSource=builderSource.slice(start,end);
 return runInNewContext("(function(){const CURRENCIES=[[\"EUR\",\"Euro\",2],[\"USD\",\"US Dollar\",2],[\"RSD\",\"Serbian Dinar\",2]];"+engineSource+";return{validateMakerSpec,evaluateFormulaResults};})()");
}
function getManualValidator(){return getManualEngine().validateMakerSpec;}
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

test("completes missing input metadata and generated keys while preserving the supplied formula",()=>{
 const importer=getImporter();
 const candidate={
  blueprintVersion:1,
  title:"Data Transfer Calculator",
  description:"Estimate total data transferred from the supplied data amount and multiplier.",
  category:"technology",
  spec:{
   inputs:[{label:"Data size",default:120,max:1000,unit:"GB"}],
   groups:[],
   results:[{label:"Total data transferred",expression:"data_size * 2",format:"unit",unit:"GB"}],
   scenarios:[]
  }
 };
 const result=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]}));
 assert.equal(result.spec.inputs[0].key,"data_size");
 assert.equal(result.spec.inputs[0].min,0);
 assert.equal(result.spec.inputs[0].default,120);
 assert.equal(result.spec.inputs[0].max,1000);
 assert.equal(result.spec.inputs[0].step,1);
 assert.equal(result.spec.results[0].key,"total_data_transferred");
 assert.equal(result.spec.results[0].expression,"data_size * 2");
 assert.ok(result.importNotes.some(note=>note.includes("supplied a missing minimum")));
 assert.ok(result.importNotes.some(note=>note.includes("supplied a sensible default step")));
});

test("maps common provider field aliases and rewrites formula references to normalized keys",()=>{
 const importer=getImporter();
 const candidate={
  blueprintVersion:1,
  title:"Data Volume Calculator",
  description:"Calculate a transformed data volume from one supplied base amount.",
  category:"technology",
  spec:{
   inputs:[{variableKey:"DataVolume",name:"Data volume",minValue:0,maxValue:100,defaultValue:10,stepSize:1,unitLabel:"GB"}],
   groups:[],
   results:[{name:"Tripled data volume",formula:"DataVolume * 3",format:"unit",resultUnit:"GB"}],
   scenarios:[]
  }
 };
 const result=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]}));
 assert.equal(result.spec.inputs[0].key,"datavolume");
 assert.equal(result.spec.results[0].expression,"datavolume * 3");
 assert.equal(result.spec.results[0].unit,"GB");
 assert.ok(result.importNotes.some(note=>note.includes("generated a valid unique variable key")));
});

test("adds a clearly marked temporary passthrough result when the blueprint contains no usable results",()=>{
 const importer=getImporter();
 const candidate={
  blueprintVersion:1,
  title:"Simple Quantity Calculator",
  description:"Show a supplied quantity as a basic result for further editing.",
  category:"other",
  spec:{
   inputs:[{key:"quantity",label:"Quantity",min:0,max:100,default:5,step:1,unit:"items"}],
   groups:[],
   results:[],
   scenarios:[]
  }
 };
 const result=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]}));
 assert.equal(result.spec.results.length,1);
 assert.equal(result.spec.results[0].expression,"quantity");
 assert.ok(result.importNotes.some(note=>note.includes("placeholder result")));
 assert.ok(result.importNotes.some(note=>note.includes("temporary passthrough formula")));
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

test("removes only a stray boundary Markdown fence and preserves literal backticks inside JSON strings",()=>{
 const importer=getImporter();
 const fence=String.fromCharCode(96).repeat(3);
 const candidate=blueprint({description:"A calculator whose explanation may contain literal "+fence+" markers as text, without treating them as executable code."});
 const raw=JSON.stringify(candidate);
 const openingOnly=fence+" json\n"+raw;
 const closingOnly=raw+"\n"+fence;
 assert.equal(importer.parseBlueprint(openingOnly,()=>({errors:[]})).title,candidate.title);
 assert.equal(importer.parseBlueprint(closingOnly,()=>({errors:[]})).title,candidate.title);
 assert.equal(importer.parseBlueprint(raw,()=>({errors:[]})).description,candidate.description);
});

test("repairs a serverless scaling blueprint with read, write, request and API call dimensions",()=>{
 const importer=getImporter(),engine=getManualEngine(),validate=engine.validateMakerSpec;
 const input=(key,label,min,max,def,step,unit,control)=>{
  const item={key,label,min,max,default:def,step,unit};
  if(control)item.control=control;
  if(control==="select")item.choices=[{label:"Free Tier",value:0},{label:"Pro Starter",value:30},{label:"Growth Tier",value:75},{label:"Business Scale",value:125}];
  return item;
 };
 const inputs=[
  input("monthly_active_users","Monthly Active Users",0,5000000,25000,1000,"people"),
  input("sessions_per_user","Sessions per User per Month",1,60,8,1,"","slider"),
  input("edge_requests_per_session","Edge Requests per Session",1,200,12,1,""),
  input("db_reads_per_session","Database Reads per Session",0,500,20,1,""),
  input("db_writes_per_session","Database Writes per Session",0,200,4,1,""),
  input("cache_hit_ratio_pct","Edge Cache Hit Ratio",0,95,65,5,"","slider"),
  input("base_platform_plan","Base Hosting & DB Plan",0,125,30,5,"USD","select"),
  input("included_edge_requests","Included Edge Requests",0,100000000,10000000,1000000,"items"),
  input("edge_overage_rate","Edge Overage Rate per Request",0,0.01,0.0000003,0.0000001,"USD/item"),
  input("included_db_reads","Included Database Reads",0,500000000,25000000,5000000,"items"),
  input("db_read_rate","Database Read Overage Rate",0,0.01,0.0000002,0.0000001,"USD/item"),
  input("included_db_writes","Included Database Writes",0,100000000,5000000,1000000,"items"),
  input("db_write_rate","Database Write Overage Rate",0,0.05,0.000001,0.0000005,"USD/item"),
  input("enable_security_waf","Enable Advanced Bot & WAF Protection",0,1,1,1,"","toggle"),
  input("waf_monthly_fee","Advanced WAF Add-on Fee",0,500,20,5,"USD"),
  input("avg_revenue_per_user","Average Monthly Revenue per User",0,100,0.05,0.01,"USD/people")
 ];
 const results=[
  ["total_monthly_sessions","Total Monthly Sessions","monthly_active_users * sessions_per_user","unit","people"],
  ["total_edge_requests","Total Edge Function Requests","(monthly_active_users / 1) * sessions_per_user * edge_requests_per_session","number"],
  ["billable_edge_requests","Billable Edge Overage Requests","max(0, total_edge_requests * 1 - included_edge_requests / 1)","number"],
  ["edge_overage_cost","Edge Compute Overage Cost","max(0, (monthly_active_users * (1 / 1)) * 0 + (total_edge_requests - (included_edge_requests / 1))) * (edge_overage_rate * 1)","number"],
  ["effective_db_reads","Origin Database Reads (Post-Cache)","monthly_active_users * (1 / 1) * sessions_per_user * db_reads_per_session * (1 - cache_hit_ratio_pct / 100)","unit","people"],
  ["total_db_writes","Total Database Writes","monthly_active_users * sessions_per_user * db_writes_per_session","unit","people"],
  ["db_overage_usd","Database Overage Cost","(max(0, (effective_db_reads / 1) - (included_db_reads / 1)) * (db_read_rate * 1) + max(0, (total_db_writes / 1) - (included_db_writes / 1)) * (db_write_rate * 1)) * (base_platform_plan * 0 + 1)","currency","USD"],
  ["external_api_variable_usd","External APIs Variable Usage Cost","(monthly_active_users / 1) * sessions_per_user * sum(external_apis.api_calls_per_session) * avg(external_apis.api_cost_per_call) * (base_platform_plan * 0 + 1)","currency","USD"],
  ["external_api_fixed_usd","External APIs Fixed Subscriptions","sum(external_apis.api_fixed_monthly)","currency","USD"],
  ["total_monthly_infra_cost","Total Monthly Infrastructure Cost","base_platform_plan + if(eq(enable_security_waf, 1), waf_monthly_fee, 0) + (edge_overage_cost * (base_platform_plan * 0 + 1)) + db_overage_usd + external_api_variable_usd + external_api_fixed_usd","currency","USD"],
  ["gross_monthly_revenue","Gross Monthly Revenue","monthly_active_users * avg_revenue_per_user","currency","USD"],
  ["net_monthly_profit","Net Monthly Operating Profit","gross_monthly_revenue - total_monthly_infra_cost","currency","USD"],
  ["gross_margin_pct","Infrastructure Gross Margin","if(gt(gross_monthly_revenue, 0), (net_monthly_profit / gross_monthly_revenue) * 100, 0)","percent"],
  ["cost_per_thousand_users","Infrastructure Cost per 1,000 Users","if(gt(monthly_active_users, 0), (total_monthly_infra_cost / (monthly_active_users / 1000)) * (1 / (1 / 1)), 0)","unit","USD/people"]
 ].map(([key,label,expression,format,unit])=>{
  const item={key,label,expression,format,explanation:"A deterministic scaling model result."};
  if(format==="currency")item.currency=unit;
  else if(format==="unit")item.unit=unit;
  return item;
 });
 const candidate={
  blueprintVersion:1,title:"Serverless Edge & Database Scaling Cost Calculator",
  description:"Models monthly cloud architecture expenses across serverless edge workers, database reads/writes, storage, and custom external API tiers with traffic growth projections.",
  category:"technology",subcategories:["serverless","cloud-hosting","database","unit-economics"],
  assumptions:["Rates are editable assumptions, not verified provider tariffs."],
  spec:{inputs,groups:[{key:"external_apis",label:"Third-Party Data & Telemetry APIs",itemLabel:"API Integration",minItems:1,maxItems:8,fields:[
   {key:"api_calls_per_session",label:"Uncached API Calls per Session",min:0,max:50,default:1,step:1,unit:""},
   {key:"api_cost_per_call",label:"Cost per API Call",min:0,max:1,default:0.0005,step:0.0001,unit:"USD/item"},
   {key:"api_fixed_monthly",label:"Fixed API Subscription",min:0,max:2000,default:15,step:5,unit:"USD"}
  ]}],results,scenarios:[]}
 };
 const fence=String.fromCharCode(96).repeat(3);
 const definition=importer.parseBlueprint(fence+"json\n"+JSON.stringify(candidate)+"\n"+fence,validate);
 console.log("SERVERLESS QUICK-FIX DEBUG",JSON.stringify({inputs:definition.spec.inputs.map(item=>[item.key,item.unit]),groupFields:definition.spec.groups[0].fields.map(item=>[item.key,item.unit]),results:definition.spec.results.map(item=>[item.key,item.format,item.unit,item.currency,item.expression]),errors:plain(validate(definition.spec).errors),notes:definition.importNotes},null,2));
 assert.deepEqual(plain(validate(definition.spec).errors),[]);
 const byKey=key=>definition.spec.inputs.find(item=>item.key===key);
 assert.equal(byKey("db_writes_per_session").unit,"write/session");
 assert.equal(byKey("included_edge_requests").unit,"request");
 assert.equal(byKey("included_db_reads").unit,"read");
 assert.equal(byKey("included_db_writes").unit,"write");
 assert.equal(byKey("edge_overage_rate").unit,"USD/request");
 assert.equal(byKey("db_read_rate").unit,"USD/read");
 assert.equal(byKey("db_write_rate").unit,"USD/write");
 const group=definition.spec.groups[0];
 assert.equal(group.fields.find(field=>field.key==="api_calls_per_session").unit,"call/session");
 assert.equal(group.fields.find(field=>field.key==="api_cost_per_call").unit,"USD/call");
 assert.equal(definition.spec.results.find(item=>item.key==="edge_overage_cost").format,"currency");
 assert.equal(definition.spec.results.find(item=>item.key==="total_db_writes").unit,"write");
 const values=Object.fromEntries(definition.spec.inputs.map(item=>[item.key,item.default]));
 const actual=engine.evaluateFormulaResults(definition.spec,values,{external_apis:[{api_calls_per_session:1,api_cost_per_call:0.0005,api_fixed_monthly:15}]});
 const get=key=>actual.find(item=>item.key===key).value;
 assert.equal(get("total_monthly_sessions"),200000);
 assert.equal(get("total_edge_requests"),2400000);
 assert.equal(get("billable_edge_requests"),0);
 assert.equal(get("edge_overage_cost"),0);
 assert.equal(get("effective_db_reads"),1400000);
 assert.equal(get("total_db_writes"),800000);
 assert.equal(get("db_overage_usd"),0);
 assert.equal(get("external_api_variable_usd"),100);
 assert.equal(get("external_api_fixed_usd"),15);
 assert.equal(get("total_monthly_infra_cost"),165);
 assert.equal(get("gross_monthly_revenue"),1250);
 assert.equal(get("net_monthly_profit"),1085);
 assert.ok(Math.abs(get("gross_margin_pct")-86.8)<1e-8);
 assert.equal(get("cost_per_thousand_users"),6.6);
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
  ()=>importer.parseBlueprint('{"blueprintVersion":1,\n"title": }',()=>({errors:[]})),
  /Could not read JSON/
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

test("keeps safe but invalid formulas in an editable draft instead of rejecting the import",()=>{
 const importer=getImporter();
 const candidate=blueprint();
 const originalExpression=candidate.spec.results[1].expression;
 const definition=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:["Final total formula: This calculator contains an invalid formula."]}));
 assert.equal(definition.spec.results[1].expression,originalExpression);
 assert.deepEqual(plain(definition.importValidationIssues),["Final total formula: This calculator contains an invalid formula."]);
 assert.equal(definition.importValidationIssueCount,1);
 assert.ok(definition.importNotes.some(note=>/editable draft/.test(note)));
});

test("retries deterministic repairs and returns unresolved validation items for editor review",()=>{
 const importer=getImporter();
 let repairCalls=0,validationCalls=0;
 const validator=spec=>{
  validationCalls++;
  return{errors:spec.assumptions.includes("Quick Fix completed a deterministic repair.")?[]:["Result formula: dimension review required."]};
 };
 validator.repairBlueprintSpec=spec=>{
  repairCalls++;
  return{spec:{...plain(spec),assumptions:[...spec.assumptions,"Quick Fix completed a deterministic repair."]},notes:["Quick Fix applied a deterministic structural repair."]};
 };
 const definition=importer.parseBlueprint(JSON.stringify(blueprint()),validator);
 assert.equal(repairCalls,1);
 assert.equal(validationCalls,1);
 assert.deepEqual(plain(definition.importValidationIssues||[]),[]);
 assert.ok(definition.importNotes.some(note=>note.includes("deterministic structural repair")));
});

test("keeps unresolved currency and unit validation issues in a draft without rejecting the import",()=>{
 const importer=getImporter();
 const definition=importer.parseBlueprint(JSON.stringify(blueprint()),()=>({errors:[
  "Monthly debt payments: use 1–20 rows and a valid group and item label.",
  "Estimated Monthly Cost formula: The formula's units do not match the selected USD result currency.",
  "Calculator result chain: The formula's units do not match the selected USD result currency."
 ]}));
 assert.equal(definition.importValidationIssueCount,3);
 assert.equal(definition.importValidationIssues.length,3);
 assert.ok(definition.importNotes.some(note=>/saved or published/.test(note)));
 assert.ok(!definition.importNotes.some(note=>/dividing EUR|EUR\/month/.test(note)));
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
 assert.ok(result.importNotes.some(note=>/changed minItems from 0 to 1/.test(note)));
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



test("repairs common Gemini-style planner units and a hard-coded 30-day projection period before shared validation",()=>{
 const importer=getImporter();
 const input=(key,label,unit,defaultValue=0,max=100000,step=10)=>({key,label,control:"number",min:0,max,default:defaultValue,step,unit});
 const field=(key,label,unit,defaultValue=0)=>({key,label,min:0,max:100000,default:defaultValue,step:10,unit});
 const candidate={
  blueprintVersion:1,
  title:"Household Budget and Savings Planner",
  description:"Plan household income, expenses, debt, savings and projected spending in EUR.",
  category:"home",
  subcategories:["household-budget"],
  assumptions:["All monetary amounts use EUR."],
  spec:{
   inputs:[
    input("regular_income","Regular monthly income","EUR",2500,50000,50),
    input("extra_income","Additional monthly income","EUR",200,20000,50),
    input("annual_expenses","Annual expenses","EUR",3600,100000,100),
    input("planned_savings","Planned monthly savings","EUR",500,20000,50),
    input("actual_savings","Actual monthly savings","EUR",450,20000,50),
    input("safety_buffer","Monthly safety buffer","EUR",200,10000,25),
    input("current_emergency_fund","Current emergency fund","EUR",6000,200000,100),
    input("target_coverage_months","Target emergency coverage","months",6,24,1),
    input("savings_goal_target","Savings goal target","EUR",3000,100000,100),
    input("savings_goal_deadline","Savings goal deadline","months",12,60,1),
    input("tracking_days","Actual spending tracking days","days",30,365,1),
    input("projection_days","Projected spending days","days",30,365,1)
   ],
   groups:[
    {key:"expenses",label:"Recurring household expenses",itemLabel:"Expense",minItems:1,maxItems:10,fields:[field("amount","Monthly amount","EUR",150)]},
    {key:"debts",label:"Monthly debt payments",itemLabel:"Debt obligation",minItems:0,maxItems:10,fields:[field("payment","Monthly payment","EUR",0)]},
    {key:"actual_spending_items",label:"Actual spending records",itemLabel:"Spending category",minItems:0,maxItems:10,fields:[field("spent","Amount spent","EUR",0)]}
   ],
   results:[
    {key:"total_income",label:"Total monthly income",expression:"regular_income + extra_income",format:"currency",currency:"EUR"},
    {key:"household_expenses",label:"Household expenses",expression:"sum(expenses.amount)",format:"currency",currency:"EUR"},
    {key:"debt_payments",label:"Debt payments",expression:"sum(debts.payment)",format:"currency",currency:"EUR"},
    {key:"monthly_annual_expenses",label:"Monthly annual expenses",expression:"annual_expenses / 12",format:"currency",currency:"EUR"},
    {key:"total_planned_expenses",label:"Total planned expenses",expression:"household_expenses + debt_payments + monthly_annual_expenses",format:"currency",currency:"EUR"},
    {key:"emergency_fund_target",label:"Emergency fund target",expression:"if(gt(target_coverage_months, 0), total_planned_expenses * target_coverage_months, 0)",format:"currency",currency:"EUR"},
    {key:"emergency_fund_shortfall",label:"Emergency fund shortfall",expression:"max(0, emergency_fund_target - current_emergency_fund)",format:"currency",currency:"EUR"},
    {key:"savings_goal_monthly",label:"Required savings goal monthly contribution",expression:"if(gt(savings_goal_deadline, 0), savings_goal_target / savings_goal_deadline, 0)",format:"currency",currency:"EUR"},
    {key:"tracked_actual_spending",label:"Total tracked actual spending",expression:"sum(actual_spending_items.spent)",format:"currency",currency:"EUR"},
    {key:"average_daily_spending",label:"Average daily spending",expression:"if(gt(tracking_days, 0), tracked_actual_spending / tracking_days, 0)",format:"unit",unit:"EUR/days"},
    {key:"projected_spending",label:"Projected spending",expression:"if(gt(tracking_days, 0), tracked_actual_spending / tracking_days * projection_days, 0)",format:"currency",currency:"EUR"},
    {key:"spending_difference",label:"Projected vs planned expenses difference",expression:"projected_spending - (total_planned_expenses / 30 * projection_days)",format:"currency",currency:"EUR"}
   ],
   scenarios:[{key:"balanced",label:"Balanced",values:{regular_income:2500,extra_income:200,planned_savings:500,safety_buffer:200}}]
  }
 };
 let validated;
 const result=importer.parseBlueprint(JSON.stringify(candidate),spec=>{validated=plain(spec);return{errors:[]};});
 assert.equal(validated.groups[1].minItems,1);
 assert.equal(validated.groups[2].minItems,1);
 assert.equal(validated.inputs.find(item=>item.key==="target_coverage_months").unit,"");
 const monthly=validated.results.find(item=>item.key==="savings_goal_monthly");
 assert.equal(monthly.format,"unit");
 assert.equal(monthly.unit,"EUR/month");
 assert.equal("currency" in monthly,false);
 assert.ok(validated.inputs.some(item=>item.key==="budget_month_days"&&item.unit==="days"&&item.default===30));
 assert.match(validated.results.find(item=>item.key==="spending_difference").expression,/total_planned_expenses \/ budget_month_days \* projection_days/);
 assert.ok(result.importNotes.length>=5);
});


test("repairs implicit USD-per-operation coefficients in a provider blueprint using editable dimensional rate inputs",()=>{
 const importer=getImporter();
 const engine=getManualEngine();
 const validate=engine.validateMakerSpec;
 const candidate={
  blueprintVersion:1,
  title:"Cloudflare Pages & Supabase Stack Cost Estimator",
  description:"Calculates monthly operational costs for a static frontend and serverless backend architecture based on visitors, database reads, and edge function executions.",
  category:"technology",
  subcategories:["hosting","serverless","database"],
  assumptions:["Pricing models are based on standard tiers for edge compute requests and relational database operations.","Data egress and storage sizes are estimated per user session."],
  spec:{
   inputs:[
    {key:"monthly_active_users",label:"Monthly Active Users",control:"number",min:100,max:1000000,default:10000,step:100,unit:""},
    {key:"sessions_per_user",label:"Sessions per User",control:"number",min:1,max:50,default:5,step:1,unit:""},
    {key:"db_reads_per_session",label:"Database Reads per Session",control:"number",min:1,max:200,default:20,step:1,unit:""},
    {key:"edge_requests_per_session",label:"Edge Requests per Session",control:"number",min:0,max:50,default:10,step:1,unit:""}
   ],
   groups:[],
   results:[
    {key:"total_sessions",label:"Total Monthly Sessions",expression:"monthly_active_users * sessions_per_user",format:"number",explanation:"Total number of user sessions handled across the platform per month."},
    {key:"total_db_reads",label:"Total Database Reads",expression:"total_sessions * db_reads_per_session",format:"number",explanation:"Total relational database query operations performed per month."},
    {key:"total_edge_requests",label:"Total Edge Function Requests",expression:"total_sessions * edge_requests_per_session",format:"number",explanation:"Total serverless edge function invocations executed per month."},
    {key:"estimated_monthly_cost",label:"Estimated Monthly Cost",expression:"total_edge_requests * 0.000015 + total_db_reads * 0.000001",format:"currency",currency:"USD",explanation:"Estimated total monthly infrastructure bill based on request volume and database reads."}
   ],
   scenarios:[
    {key:"small_project",label:"Indie Project",values:{monthly_active_users:1000,sessions_per_user:3,db_reads_per_session:10,edge_requests_per_session:5}},
    {key:"scaling_platform",label:"Scaling Application",values:{monthly_active_users:100000,sessions_per_user:10,db_reads_per_session:30,edge_requests_per_session:15}}
   ]
  }
 };
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validate);
 const inputs=definition.spec.inputs;
 const byKey=key=>inputs.find(item=>item.key===key);
 assert.equal(byKey("monthly_active_users").unit,"user");
 assert.equal(byKey("sessions_per_user").unit,"session/user");
 assert.equal(byKey("db_reads_per_session").unit,"read/session");
 assert.equal(byKey("edge_requests_per_session").unit,"request/session");
 assert.equal(byKey("cost_per_request").unit,"USD/request");
 assert.equal(byKey("cost_per_request").default,0.000015);
 assert.equal(byKey("cost_per_read").unit,"USD/read");
 assert.equal(byKey("cost_per_read").default,0.000001);
 assert.equal(definition.spec.scenarios.find(item=>item.key==="small_project").values.cost_per_request,0.000015);
 assert.equal(definition.spec.scenarios.find(item=>item.key==="small_project").values.cost_per_read,0.000001);
 assert.equal(definition.spec.scenarios.find(item=>item.key==="scaling_platform").values.cost_per_request,0.000015);
 assert.equal(definition.spec.scenarios.find(item=>item.key==="scaling_platform").values.cost_per_read,0.000001);
 assert.equal(definition.spec.results.find(item=>item.key==="total_sessions").unit,"session");
 assert.equal(definition.spec.results.find(item=>item.key==="total_db_reads").unit,"read");
 assert.equal(definition.spec.results.find(item=>item.key==="total_edge_requests").unit,"request");
 const totalCost=definition.spec.results.find(item=>item.key==="estimated_monthly_cost");
 assert.equal(totalCost.format,"currency");
 assert.equal(totalCost.currency,"USD");
 assert.match(totalCost.expression,/cost_per_request/);
 assert.match(totalCost.expression,/cost_per_read/);
 assert.deepEqual(plain(validate(definition.spec).errors),[]);
 const defaultValues=Object.fromEntries(definition.spec.inputs.map(input=>[input.key,input.default]));
 const current=engine.evaluateFormulaResults(definition.spec,defaultValues,{});
 assert.equal(current.find(item=>item.key==="estimated_monthly_cost").value,8.5);
 const indie=engine.evaluateFormulaResults(definition.spec,definition.spec.scenarios.find(item=>item.key==="small_project").values,{});
 assert.equal(indie.find(item=>item.key==="estimated_monthly_cost").value,0.255);
 const scaling=engine.evaluateFormulaResults(definition.spec,definition.spec.scenarios.find(item=>item.key==="scaling_platform").values,{});
 assert.equal(scaling.find(item=>item.key==="estimated_monthly_cost").value,255);
 assert.ok(indie.every(item=>Number.isFinite(item.value)));
 assert.ok(scaling.every(item=>Number.isFinite(item.value)));

 assert.ok(definition.importNotes.some(note=>note.includes("implicit numeric cost coefficient")));
});


test("imports the exact USD cost-estimator blueprint even with escaped line continuations and multiplication symbols",()=>{
 const importer=getImporter();
 const validate=getManualValidator();
 const candidate={
  blueprintVersion:1,
  title:"Cloudflare Pages & Supabase Stack Cost Estimator",
  description:"Calculates monthly operational costs for a static frontend and serverless backend architecture based on visitors, database reads, and edge function executions.",
  category:"technology",
  subcategories:["hosting","serverless","database"],
  assumptions:["Pricing models are based on standard tiers for edge compute requests and relational database operations.","Data egress and storage sizes are estimated per user session."],
  spec:{
   inputs:[
    {key:"monthly_active_users",label:"Monthly Active Users",control:"number",min:100,max:1000000,default:10000,step:100,unit:""},
    {key:"sessions_per_user",label:"Sessions per User",control:"number",min:1,max:50,default:5,step:1,unit:""},
    {key:"db_reads_per_session",label:"Database Reads per Session",control:"number",min:1,max:200,default:20,step:1,unit:""},
    {key:"edge_requests_per_session",label:"Edge Requests per Session",control:"number",min:0,max:50,default:10,step:1,unit:""}
   ],
   groups:[],
   results:[
    {key:"total_sessions",label:"Total Monthly Sessions",expression:"monthly_active_users * sessions_per_user",format:"number",explanation:"Total number of user sessions handled across the platform per month."},
    {key:"total_db_reads",label:"Total Database Reads",expression:"total_sessions * db_reads_per_session",format:"number",explanation:"Total relational database query operations performed per month."},
    {key:"total_edge_requests",label:"Total Edge Function Requests",expression:"total_sessions * edge_requests_per_session",format:"number",explanation:"Total serverless edge function invocations executed per month."},
    {key:"estimated_monthly_cost",label:"Estimated Monthly Cost",expression:"total_edge_requests * 0.000015 + total_db_reads * 0.000001",format:"currency",currency:"USD",explanation:"Estimated total monthly infrastructure bill based on request volume and database reads."}
   ],
   scenarios:[
    {key:"small_project",label:"Indie Project",values:{monthly_active_users:1000,sessions_per_user:3,db_reads_per_session:10,edge_requests_per_session:5}},
    {key:"scaling_platform",label:"Scaling Application",values:{monthly_active_users:100000,sessions_per_user:10,db_reads_per_session:30,edge_requests_per_session:15}}
   ]
  }
 };
 const copied=JSON.stringify(candidate,null,2).replace(/\n/g,"\\\n").replace(/\*/g,"\\*");
 const definition=importer.parseBlueprint(copied,validate);
 assert.equal(definition.spec.inputs.find(item=>item.key==="cost_per_request").unit,"USD/request");
 assert.equal(definition.spec.inputs.find(item=>item.key==="cost_per_read").unit,"USD/read");
 assert.deepEqual(plain(validate(definition.spec).errors),[]);
});

test("keeps unresolved currency dimension errors in the editable draft",()=>{
 const importer=getImporter();
 const definition=importer.parseBlueprint(JSON.stringify(blueprint()),()=>({errors:[
  "Estimated Monthly Cost: The formula's units do not match the selected USD result currency.",
  "Calculator result chain: The formula's units do not match the selected USD result currency."
 ]}));
 assert.equal(definition.importValidationIssueCount,2);
 assert.ok(definition.importValidationIssues.some(issue=>/USD result currency/.test(issue)));
 assert.ok(definition.importNotes.some(note=>/editable draft/.test(note)));
 assert.ok(!definition.importNotes.some(note=>/dividing EUR/.test(note)));
});

test("generates a provider-neutral prompt for arbitrary calculator requests",()=>{
 const importer=getImporter();
 const prompt=importer.buildPrompt();
 assert.match(prompt,/Return exactly one valid JSON object/);
 assert.match(prompt,/blueprintVersion/);
 assert.match(prompt,/"base_value"/);
 assert.match(prompt,/"calculated_value"/);
 assert.match(prompt,/strict dimensional algebra|UNIT SYSTEM/);
 assert.match(prompt,/EUR \/ days produces EUR\/day/);
 assert.match(prompt,/EUR\/month multiplied by months produces EUR/);
 assert.match(prompt,/unitless scalar multiplier or divisor/);
 assert.match(prompt,/never hide a currency-per-operation rate only inside a bare numeric formula/i);
 assert.match(prompt,/plain asterisk character/);
 assert.match(prompt,/Do not HTML-encode spaces/);
 assert.match(prompt,/maximums? (must )?align with step|whole numbers/);
 assert.match(prompt,/PROVIDER-NEUTRAL REQUIREMENT/i);
 assert.match(prompt,/the user's actual calculator request/);
 assert.match(prompt,/any subject/);
 assert.match(prompt,/NEVER use minItems 0/);
 assert.doesNotMatch(prompt,/Household Budget|emergency_target_months|budget_month_days|tracking_days|fixed_costs|debt_payments/);
 assert.doesNotMatch(helperSource,/fetch\s*\(/i);
});

test("extracts one JSON code block even when an AI adds surrounding explanation",()=>{
 const importer=getImporter();
 const fence=String.fromCharCode(96).repeat(3);
 const source="Here is the requested calculator blueprint:\n\n"+fence+"json\n"+JSON.stringify(blueprint())+"\n"+fence+"\n\nYou can now import it.";
 const result=importer.parseBlueprint(source,()=>({errors:[]}));
 assert.equal(result.title,"Household Expense Calculator");
});

test("extracts a single raw JSON object surrounded by explanatory text",()=>{
 const importer=getImporter();
 const source="Blueprint follows:\n"+JSON.stringify(blueprint())+"\nReview the assumptions after import.";
 const result=importer.parseBlueprint(source,()=>({errors:[]}));
 assert.equal(result.title,"Household Expense Calculator");
});

test("rejects non-JSON language fences instead of interpreting code as a blueprint",()=>{
 const importer=getImporter();
 const fence=String.fromCharCode(96).repeat(3);
 const source=fence+"javascript\\n"+JSON.stringify(blueprint())+"\\n"+fence;
 assert.throws(()=>importer.parseBlueprint(source,()=>({errors:[]})),/labelled json/);
});

test("preserves braces inside JSON strings when extracting a raw object",()=>{
 const importer=getImporter();
 const candidate=blueprint({description:"Calculate a value with optional details {when supplied} and explain the result."});
 const source="Blueprint follows:\\n"+JSON.stringify(candidate)+"\\nEnd of blueprint.";
 const result=importer.parseBlueprint(source,()=>({errors:[]}));
 assert.equal(result.description,candidate.description);
});

test("rejects multiple JSON objects rather than guessing which one to import",()=>{
 const importer=getImporter();
 const fence=String.fromCharCode(96).repeat(3);
 const source=fence+"json\n"+JSON.stringify(blueprint())+"\n"+fence+"\nAlternative:\n"+fence+"json\n"+JSON.stringify(blueprint({title:"Another calculator"}))+"\n"+fence;
 assert.throws(()=>importer.parseBlueprint(source,()=>({errors:[]})),/More than one code block/);
});

test("validates the household spending projection dimensions with the real Manual Builder validator",()=>{
 const start=builderSource.indexOf("function compileExpression(");
 const end=builderSource.indexOf("\nfunction makerCurrencyWarnings",start);
 assert.ok(start>=0&&end>start,"The shared formula validator must be present.");
 const validatorSource=builderSource.slice(start,end);
 const validateMakerSpec=runInNewContext("(function(){const CURRENCIES=[[\"EUR\",\"Euro\",2]];"+validatorSource+";return validateMakerSpec;})()");
 const spec={
  inputs:[
   {key:"actual_spending",label:"Actual tracked spending",min:0,max:100000,default:1200,step:10,unit:"EUR"},
   {key:"tracking_days",label:"Tracking period",min:1,max:365,default:15,step:1,unit:"days"},
   {key:"projection_days",label:"Projection period",min:1,max:365,default:30,step:1,unit:"days"},
   {key:"budget_month_days",label:"Days in budget month",min:28,max:31,default:30,step:1,unit:"days"}
  ],
  groups:[],
  results:[
   {key:"planned_expenses",label:"Planned expenses",expression:"actual_spending",format:"currency",currency:"EUR"},
   {key:"tracked_spending",label:"Tracked spending",expression:"actual_spending",format:"currency",currency:"EUR"},
   {key:"average_daily_spending",label:"Average daily spending",expression:"tracked_spending / tracking_days",format:"unit",unit:"EUR/day"},
   {key:"projected_spending",label:"Projected spending",expression:"average_daily_spending * projection_days",format:"currency",currency:"EUR"},
   {key:"spending_variance",label:"Projected vs planned spending difference",expression:"projected_spending - (planned_expenses / budget_month_days * projection_days)",format:"currency",currency:"EUR"}
  ],
  scenarios:[]
 };
 const validation=validateMakerSpec(spec);
 assert.deepEqual(plain(validation.errors),[]);
});
test("Manual Builder exposes the optional importer without wiring it to the Worth It AI endpoint",()=>{
 assert.match(html,/id="ugcBlueprintImportPanel"[^>]*hidden/);
 assert.match(html,/id="ugcBlueprintImportJson"/);
 assert.match(html,/ugc-blueprint-import\.js/);
 const importFunction=builderSource.match(/function importManualBlueprint\(\)\{[\s\S]*?\n\}/)?.[0]||"";
 assert.ok(importFunction.includes("parseBlueprint"));
 assert.ok(importFunction.includes("parseBlueprint(raw,validateMakerSpec,originalRequest)"));
 assert.doesNotMatch(importFunction,/parseBlueprint\(raw,\s*spec\s*=>/);
 assert.ok(importFunction.includes("Working on a quick fix"));
 assert.ok(importFunction.includes("importValidationIssueCount"));
 assert.ok(importFunction.includes('state.creationSource="manual"'));
 assert.ok(importFunction.includes('state.aiOperationId=""'));
 assert.doesNotMatch(importFunction,/fetch\s*\(|\/api\/ugc-maker|\.rpc\s*\(/);
 const saveFunction=builderSource.match(/async function saveMakerDraft\(publish\)\{[\s\S]*?\n\}/)?.[0]||"";
 assert.ok(saveFunction.includes("validateMakerSpec(specToSave)"));
 assert.ok(saveFunction.includes("Please fix the calculator validation issues before saving"));
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


test("does not mislabel a currency total when a duration is divided out and multiplied back in",()=>{
 const importer=getImporter();
 const start=builderSource.indexOf("function compileExpression(");
 const end=builderSource.indexOf("\nfunction makerCurrencyWarnings",start);
 assert.ok(start>=0&&end>start,"The shared Manual Builder validator must be present.");
 const validatorSource=builderSource.slice(start,end);
 const validateMakerSpec=runInNewContext("(function(){const CURRENCIES=[[\"EUR\",\"Euro\",2]];"+validatorSource+";return validateMakerSpec;})()");
 const candidate={
  blueprintVersion:1,
  title:"Household Spending Projection",
  description:"Compare projected household spending with the planned budget for the same period.",
  category:"home",
  subcategories:["household-budget"],
  assumptions:["All monetary amounts use EUR.","The projection uses matching day-based periods."],
  spec:{
   inputs:[
    {key:"planned_expenses",label:"Planned monthly expenses",min:0,max:100000,default:3000,step:10,unit:"EUR"},
    {key:"tracked_spending",label:"Tracked spending",min:0,max:100000,default:600,step:10,unit:"EUR"},
    {key:"tracking_days",label:"Tracking days",min:1,max:365,default:15,step:1,unit:"days"},
    {key:"projection_days",label:"Projection days",min:1,max:365,default:30,step:1,unit:"days"},
    {key:"budget_month_days",label:"Days in budget month",min:28,max:31,default:30,step:1,unit:"days"}
   ],
   groups:[],
   results:[
    {key:"average_daily_spending",label:"Average daily spending",expression:"tracked_spending / tracking_days",format:"unit",unit:"EUR/day"},
    {key:"projected_spending",label:"Projected spending",expression:"average_daily_spending * projection_days",format:"currency",currency:"EUR"},
    {key:"spending_variance",label:"Projected vs planned spending difference",expression:"projected_spending - (planned_expenses / budget_month_days * projection_days)",format:"currency",currency:"EUR"}
   ],
   scenarios:[]
  }
 };
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validateMakerSpec);
 const difference=definition.spec.results.find(item=>item.key==="spending_variance");
 assert.equal(difference.format,"currency");
 assert.equal(difference.currency,"EUR");
 assert.equal("unit" in difference,false);
 assert.ok(!definition.importNotes?.some(note=>note.includes("Projected vs planned spending difference")&&/changed the display|changed the result unit/i.test(note)));
});

test("still repairs a genuine currency-per-duration result to its exact rate unit",()=>{
 const importer=getImporter();
 const start=builderSource.indexOf("function compileExpression(");
 const end=builderSource.indexOf("\nfunction makerCurrencyWarnings",start);
 const validatorSource=builderSource.slice(start,end);
 const validateMakerSpec=runInNewContext("(function(){const CURRENCIES=[[\"EUR\",\"Euro\",2]];"+validatorSource+";return validateMakerSpec;})()");
 const candidate=blueprint({
  spec:{
   inputs:[
    {key:"tracked_spending",label:"Tracked spending",min:0,max:100000,default:600,step:10,unit:"EUR"},
    {key:"tracking_days",label:"Tracking days",min:1,max:365,default:15,step:1,unit:"days"}
   ],
   groups:[],
   results:[{key:"daily_rate",label:"Daily spending rate",expression:"tracked_spending / tracking_days",format:"currency",currency:"EUR"}],
   scenarios:[]
  }
 });
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validateMakerSpec);
 assert.equal(definition.spec.results[0].format,"unit");
 assert.equal(definition.spec.results[0].unit,"EUR/day");
 assert.equal("currency" in definition.spec.results[0],false);
});


test("imports the complete Household Budget and Savings Planner blueprint through the real validator",()=>{
 const importer=getImporter();
 const start=builderSource.indexOf("function compileExpression(");
 const end=builderSource.indexOf("\nfunction makerCurrencyWarnings",start);
 assert.ok(start>=0&&end>start,"The shared Manual Builder validator must be present.");
 const validatorSource=builderSource.slice(start,end);
 const validateMakerSpec=runInNewContext("(function(){const CURRENCIES=[[\"EUR\",\"Euro\",2]];"+validatorSource+";return validateMakerSpec;})()");
 const input=(key,label,min,max,def,step,unit,control="number")=>({key,label,control,min,max,default:def,step,unit});
 const group=(key,label,itemLabel,fieldKey,fieldLabel,def)=>({
  key,label,itemLabel,minItems:1,maxItems:10,
  fields:[{key:fieldKey,label:fieldLabel,min:0,max:50000,default:def,step:10,unit:"EUR"}]
 });
 const currency=(key,label,expression)=>({key,label,expression,format:"currency",currency:"EUR",explanation:label+" in EUR."});
 const percent=(key,label,expression)=>({key,label,expression,format:"percent",explanation:label+" as a percentage."});
 const resultRate=(key,label,expression,unit)=>({key,label,expression,format:"unit",unit,explanation:label+" using the exact derived rate unit."});
 const candidate={
  blueprintVersion:1,
  title:"Household Budget and Savings Planner",
  description:"Plans monthly household income, fixed expenses, debt payments, savings targets, emergency fund coverage, goal progress, and spending projections in EUR.",
  category:"home",
  subcategories:["household-budget","savings-planner"],
  assumptions:[
   "All monetary amounts are entered and calculated in EUR without currency conversion or exchange rates.",
   "Annual expenses are evenly distributed across 12 months when calculating monthly planned expenses.",
   "Investment returns, interest compounding, inflation, and taxes are not modeled.",
   "Dynamic lists require at least one row; set unused placeholder rows to 0 EUR."
  ],
  spec:{
   inputs:[
    input("regular_income","Regular monthly income",0,100000,2500,10,"EUR"),
    input("additional_income","Additional monthly income",0,100000,200,10,"EUR"),
    input("annual_expenses","Annual expenses",0,200000,1200,10,"EUR"),
    input("planned_savings","Planned monthly savings",0,100000,400,10,"EUR"),
    input("actual_savings","Actual monthly savings",0,100000,350,10,"EUR"),
    input("safety_buffer","Monthly safety buffer",0,50000,150,10,"EUR"),
    input("emergency_fund","Current emergency fund",0,500000,4500,50,"EUR"),
    input("emergency_target_months","Emergency fund target coverage (months)",1,24,6,1,"","slider"),
    input("savings_goal_amount","Savings goal target amount",0,500000,6000,50,"EUR"),
    input("current_goal_savings","Already saved toward goal",0,500000,1500,50,"EUR"),
    input("goal_deadline_months","Savings goal deadline",1,120,12,1,"months"),
    input("tracking_days","Actual spending tracking period",1,365,15,1,"days"),
    input("projection_days","Spending projection period",1,365,30,1,"days"),
    input("budget_month_days","Days in budget month",28,31,30,1,"days")
   ],
   groups:[
    group("fixed_costs","Recurring household expenses","Expense item","amount","Monthly amount",1200),
    group("debt_payments","Monthly debt payments","Debt payment","payment","Monthly payment",0),
    group("actual_spending","Actual tracked spending by category","Spending category","spent","Tracked spent amount",0)
   ],
   results:[
    {key:"total_income",label:"Total monthly income",expression:"regular_income + additional_income",format:"currency",currency:"EUR"},
    {key:"household_expense_total",label:"Household expense total",expression:"sum(fixed_costs.amount)",format:"currency",currency:"EUR"},
    {key:"debt_total",label:"Debt payment total",expression:"sum(debt_payments.payment)",format:"currency",currency:"EUR"},
    currency("monthly_annual_expenses","Monthly share of annual expenses","annual_expenses / 12"),
    currency("planned_expenses","Total planned monthly expenses","household_expense_total + debt_total + monthly_annual_expenses"),
    currency("remaining_before_savings","Remaining before savings","total_income - planned_expenses"),
    currency("remaining_after_savings_buffer","Remaining after savings and buffer","remaining_before_savings - planned_savings - safety_buffer"),
    percent("debt_to_income","Debt-to-income ratio","if(gt(total_income,0),debt_total / total_income * 100,0)"),
    percent("planned_savings_rate","Planned savings rate","if(gt(total_income,0),planned_savings / total_income * 100,0)"),
    percent("actual_savings_rate","Actual savings rate","if(gt(total_income,0),actual_savings / total_income * 100,0)"),
    currency("savings_variance","Actual minus planned savings","actual_savings - planned_savings"),
    currency("emergency_target","Emergency fund target","planned_expenses * emergency_target_months"),
    percent("emergency_progress","Emergency fund progress","if(gt(emergency_target,0),emergency_fund / emergency_target * 100,0)"),
    currency("emergency_shortfall","Emergency fund shortfall","max(0,emergency_target - emergency_fund)"),
    currency("remaining_goal","Remaining savings goal","max(0,savings_goal_amount - current_goal_savings)"),
    resultRate("goal_monthly_required","Required monthly goal contribution","remaining_goal / goal_deadline_months","EUR/month"),
    currency("tracked_spending","Tracked actual spending","sum(actual_spending.spent)"),
    resultRate("average_daily_spending","Average daily spending","tracked_spending / tracking_days","EUR/day"),
    currency("projected_spending","Projected period spending","average_daily_spending * projection_days"),
    currency("spending_variance","Projected vs planned spending difference","projected_spending - (planned_expenses / budget_month_days * projection_days)")
   ],
   scenarios:[
    {key:"conservative",label:"Conservative",values:{additional_income:0,planned_savings:600,safety_buffer:250,emergency_target_months:9}},
    {key:"balanced",label:"Balanced",values:{additional_income:200,planned_savings:400,safety_buffer:150,emergency_target_months:6}},
    {key:"flexible",label:"Flexible",values:{additional_income:300,planned_savings:250,safety_buffer:100,emergency_target_months:3}}
   ]
  }
 };
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validateMakerSpec);
 assert.equal(definition.spec.inputs.length,14);
 assert.equal(definition.spec.groups.length,3);
 assert.equal(definition.spec.results.length,20);
 assert.equal(definition.spec.scenarios.length,3);
 assert.equal(definition.spec.results.find(item=>item.key==="goal_monthly_required").unit,"EUR/month");
 assert.equal(definition.spec.results.find(item=>item.key==="average_daily_spending").unit,"EUR/day");
 const variance=definition.spec.results.find(item=>item.key==="spending_variance");
 assert.equal(variance.format,"currency");
 assert.equal(variance.currency,"EUR");
 assert.ok(variance.expression.includes("planned_expenses")&&variance.expression.includes("budget_month_days")&&variance.expression.includes("projection_days"));
});


test("automatically repairs a mismatched custom compound result unit without using an AI service",()=>{
 const importer=getImporter(),validateMakerSpec=getManualValidator();
 const candidate=blueprint({
  spec:{
   inputs:[
    {key:"transfer_size",label:"Transferred data",min:0,max:10000,default:120,step:1,unit:"GB"},
    {key:"transfer_hours",label:"Transfer duration",min:0,max:1000,default:2,step:1,unit:"hours"}
   ],
   groups:[],
   results:[
    {key:"transfer_rate",label:"Total Data Transfer Rate",expression:"transfer_size / transfer_hours",format:"unit",unit:"GB"},
    {key:"monthly_cost",label:"Estimated Monthly Cost",expression:"transfer_size * 2",format:"currency",currency:"EUR"}
   ],
   scenarios:[]
  }
 });
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validateMakerSpec);
 assert.equal(definition.spec.results[0].format,"unit");
 assert.equal(definition.spec.results[0].unit,"GB/hour");
 assert.ok(definition.importNotes.some(note=>note.includes("Total Data Transfer Rate")&&note.includes("GB/hour")));
 assert.deepEqual(plain(validateMakerSpec(definition.spec).errors),[]);
});

test("reorders result dependencies before validating a provider's out-of-order result chain",()=>{
 const importer=getImporter(),validateMakerSpec=getManualValidator();
 const candidate=blueprint({
  spec:{
   inputs:[{key:"unit_price",label:"Unit price",min:0,max:1000,default:12,step:1,unit:"EUR"}],
   groups:[],
   results:[
    {key:"grand_total",label:"Grand total",expression:"base_total + fee_total",format:"currency",currency:"EUR"},
    {key:"fee_total",label:"Fee total",expression:"unit_price * 0.1",format:"currency",currency:"EUR"},
    {key:"base_total",label:"Base total",expression:"unit_price * 2",format:"currency",currency:"EUR"}
   ],
   scenarios:[]
  }
 });
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validateMakerSpec);
 assert.deepEqual(plain(definition.spec.results.map(item=>item.key)),["fee_total","base_total","grand_total"]);
 assert.ok(definition.importNotes.some(note=>note.includes("Reordered result definitions")));
 assert.deepEqual(plain(validateMakerSpec(definition.spec).errors),[]);
});

test("adds safe guards to divisions with a variable denominator and validates zero boundaries",()=>{
 const importer=getImporter(),validateMakerSpec=getManualValidator();
 const candidate=blueprint({
  spec:{
   inputs:[
    {key:"data_size",label:"Data size",min:0,max:10000,default:120,step:1,unit:"GB"},
    {key:"duration_hours",label:"Duration",min:0,max:1000,default:2,step:1,unit:"hours"}
   ],
   groups:[],
   results:[
    {key:"transfer_rate",label:"Transfer rate",expression:"data_size / duration_hours",format:"unit",unit:"GB/hour"}
   ],
   scenarios:[]
  }
 });
 const definition=importer.parseBlueprint(JSON.stringify(candidate),validateMakerSpec);
 assert.match(definition.spec.results[0].expression,/if\(neq\(duration_hours,0\)/);
 assert.ok(definition.importNotes.some(note=>note.includes("zero-denominator guards")));
 assert.deepEqual(plain(validateMakerSpec(definition.spec).errors),[]);
});


test("checks prompt keyword coverage locally without storing or transmitting the original request",()=>{
 const importer=getImporter();
 const candidate=blueprint({
  title:"Electric vehicle monthly cost planner",
  description:"Estimate the monthly running cost of an electric vehicle from its energy and service inputs.",
  spec:{
   inputs:[{key:"energy_cost",label:"Monthly energy cost",min:0,max:10000,default:100,step:1,unit:"EUR"}],
   groups:[],
   results:[{key:"monthly_cost",label:"Monthly vehicle cost",expression:"energy_cost",format:"currency",currency:"EUR"}],
   scenarios:[]
  }
 });
 const request="Calculate battery degradation, charging time, and monthly charging cost for an electric vehicle.";
 const result=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]}),request);
 const coverage=result.importNotes.find(note=>note.includes("Prompt coverage review"));
 assert.ok(coverage);
 assert.match(coverage,/degradation/);
 assert.match(coverage,/charge/);
 const serialized=JSON.stringify(result);
 assert.equal(serialized.includes(request),false);
 assert.equal(serialized.includes("battery degradation, charging time"),false);
});

test("does not add a prompt coverage warning when key request concepts appear in calculator fields",()=>{
 const importer=getImporter();
 const candidate=blueprint({
  title:"Electric vehicle charging planner",
  description:"Estimate battery degradation, charging time, and monthly charging cost for an electric vehicle.",
  spec:{
   inputs:[
    {key:"battery_degradation",label:"Battery degradation",min:0,max:100,default:10,step:1,unit:"%"},
    {key:"charging_time",label:"Charging time",min:0,max:48,default:2,step:1,unit:"hours"}
   ],
   groups:[],
   results:[
    {key:"monthly_charging_cost",label:"Monthly charging cost",expression:"battery_degradation + charging_time",format:"number"}
   ],
   scenarios:[]
  }
 });
 const request="Calculate battery degradation, charging time, and monthly charging cost for an electric vehicle.";
 const result=importer.parseBlueprint(JSON.stringify(candidate),()=>({errors:[]}),request);
 assert.ok(!result.importNotes?.some(note=>note.includes("Prompt coverage review")));
});

test("rejects an oversized original request before importing a blueprint",()=>{
 const importer=getImporter();
 assert.throws(
  ()=>importer.parseBlueprint(JSON.stringify(blueprint()),()=>({errors:[]}),"x".repeat(5001)),
  /original calculator request can contain up to 5,000 characters/
 );
});
