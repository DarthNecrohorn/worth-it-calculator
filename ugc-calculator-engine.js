/* Worth It Calculator Engine — v1 shared, deterministic and environment-neutral. */
(function(root){
"use strict";
function create(options={}){
 const CURRENCIES=Array.isArray(options.currencies)?options.currencies:[];
 const HISTORICAL_CURRENCIES=Array.isArray(options.historicalCurrencies)?options.historicalCurrencies:[];
 const V2_FUNCTION_HELP=Object.freeze([
  ["min","min(value1, value2, ...)","Smallest numeric argument or the minimum of a numeric group field.","min(monthly_cost, annual_cost)"],
  ["max","max(value1, value2, ...)","Largest numeric argument or the maximum of a numeric group field.","max(monthly_cost, annual_cost)"],
  ["avg","avg(value1, value2, ...)","Arithmetic mean of numeric arguments or one group field.","avg(items.amount)"],
  ["sum","sum(group.numericField)","Sum a numeric field from one dynamic group.","sum(expenses.amount)"],
  ["count","count(group)","Count rows in a dynamic group.","count(expenses)"],
  ["abs","abs(value)","Absolute value.","abs(balance)"],
  ["round","round(value, decimals?)","Round to the nearest integer or decimal places.","round(total, 2)"],
  ["floor","floor(value)","Round down to the nearest integer.","floor(quantity)"],
  ["ceil","ceil(value)","Round up to the nearest integer.","ceil(quantity)"],
  ["trunc","trunc(value)","Remove the fractional part.","trunc(amount)"],
  ["sign","sign(value)","Return -1, 0 or 1 according to the sign.","sign(balance)"],
  ["sqrt","sqrt(value)","Square root; unit powers must be even.","sqrt(area)"],
  ["pow","pow(base, exponent)","Raise a number to a power.","pow(growth_factor, years)"],
  ["clamp","clamp(value, minimum, maximum)","Keep a value within inclusive bounds.","clamp(score, 0, 100)"],
  ["mod","mod(dividend, divisor)","Remainder after division.","mod(quantity, pack_size)"],
  ["hypot","hypot(value1, value2, ...)","Euclidean norm of numeric arguments.","hypot(width, height)"],
  ["log","log(value, base?)","Base-10 logarithm or logarithm with a supplied base.","log(population, 10)"],
  ["ln","ln(value)","Natural logarithm.","ln(growth_factor)"],
  ["exp","exp(value)","Natural exponential function.","exp(rate * periods)"],
  ["sin","sin(radians)","Sine; angle is expressed in radians.","sin(angle)"],
  ["cos","cos(radians)","Cosine; angle is expressed in radians.","cos(angle)"],
  ["tan","tan(radians)","Tangent; angle is expressed in radians.","tan(angle)"],
  ["asin","asin(value)","Inverse sine; returns radians.","asin(ratio)"],
  ["acos","acos(value)","Inverse cosine; returns radians.","acos(ratio)"],
  ["atan","atan(value)","Inverse tangent; returns radians.","atan(slope)"],
  ["if","if(condition, whenTrue, whenFalse)","Choose a value using a boolean condition.","if(eq(plan, \"pro\"), premium_price, base_price)"],
  ["and","and(condition1, condition2, ...)","True only when every condition is true.","and(include_tax, gt(amount, 0))"],
  ["or","or(condition1, condition2, ...)","True when at least one condition is true.","or(eq(plan, \"pro\"), eq(plan, \"team\"))"],
  ["not","not(condition)","Invert a boolean condition.","not(include_tax)"],
  ["eq","eq(a, b)","Compare two values for equality.","eq(plan, \"pro\")"],
  ["gt","gt(a, b)","Test whether a number or date is greater.","gt(start_date, \"2026-01-01\")"],
  ["gte","gte(a, b)","Test whether a number or date is greater than or equal.","gte(amount, minimum)"],
  ["lt","lt(a, b)","Test whether a number or date is less.","lt(end_date, deadline)"],
  ["lte","lte(a, b)","Test whether a number or date is less than or equal.","lte(amount, maximum)"],
  ["neq","neq(a, b)","Test whether two supported scalar values differ.","neq(plan, \"basic\")"],

  ["sum_if","sum_if(value, predicate)","Sum matching rows from one dynamic group.","sum_if(expenses.amount, expenses.taxable)"],
  ["count_if","count_if(predicate)","Count matching rows from one dynamic group.","count_if(gt(expenses.amount, 100))"],
  ["median","median(group.numericExpression)","Median of numeric values in one group.","median(expenses.amount)"],
  ["variance","variance(group.numericExpression)","Population variance (divide by N).","variance(items.score)"],
  ["stddev","stddev(group.numericExpression)","Population standard deviation.","stddev(items.score)"],
  ["percentile","percentile(group.numericExpression, p)","Interpolated percentile; p is a literal from 0 to 100.","percentile(items.amount, 75)"],
  ["weighted_avg","weighted_avg(value, weight)","Weighted average; both expressions use the same group.","weighted_avg(items.score, items.weight)"],
  ["date_diff_days","date_diff_days(startDate, endDate)","Signed calendar-day difference.","date_diff_days(start_date, end_date)"],
  ["add_days","add_days(date, days)","Add whole calendar days.","add_days(start_date, 30)"],
  ["add_months","add_months(date, months)","Add whole calendar months with month-end clamping.","add_months(start_date, 1)"],
  ["days_in_month","days_in_month(date)","Number of days in the date's month.","days_in_month(start_date)"],
  ["calendar_year","calendar_year(date)","Calendar year number.","calendar_year(start_date)"],
  ["calendar_month","calendar_month(date)","Calendar month number from 1 to 12.","calendar_month(start_date)"],
  ["weekday","weekday(date)","ISO weekday number: Monday 1 through Sunday 7.","weekday(start_date)"],

  ["compound_interest","compound_interest(amount, rate, periods)","Compound amount; rate is a decimal fraction.","compound_interest(principal, 0.05, 12)"],
  ["present_value","present_value(futureAmount, rate, periods)","Discount a future amount to present value.","present_value(future_amount, 0.05, 12)"],
  ["loan_payment","loan_payment(principal, rate, periods)","Fixed periodic loan payment.","loan_payment(principal, 0.05, 12)"]
 ].map(([name,signature,description,example])=>Object.freeze({name,signature,description,example})));

function compileExpression(source,keys,groups){
 const input=String(source||"");let at=0;
 const groupDefinitions=groups instanceof Map?groups:new Map();
 const fail=()=>{throw new Error("This calculator contains an invalid formula.");};
 const ws=()=>{while(at<input.length&&/\s/.test(input[at]))at++;};
 const take=value=>{ws();if(input.slice(at,at+value.length)===value){at+=value.length;return true;}return false;};
 const identifier=()=>{ws();const m=input.slice(at).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(!m)return null;at+=m[0].length;return m[0];};
 const functions=new Set(["min","max","abs","round","floor","ceil","sqrt","pow","clamp","avg","sum","count","mod","trunc","sign","hypot","log","ln","exp","sin","cos","tan","asin","acos","atan","if","gt","gte","lt","lte","eq","neq","and","or","not"]);
 function primary(){
  ws();
  if(take("(")){const node=add();if(!take(")"))fail();return node;}
  const m=input.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  if(m){at+=m[0].length;const value=Number(m[0]);if(!Number.isFinite(value))fail();return{type:"number",value};}
  const name=identifier();if(!name)fail();
  if(take(".")){
   const field=identifier();
   if(!field||!groupDefinitions.get(name)?.has(field))fail();
   return{type:"groupField",group:name,field};
  }
  if(take("(")){
   if(!functions.has(name))fail();
   const args=[];if(!take(")")){do{args.push(add());}while(take(","));if(!take(")"))fail();}
   const valid=name==="min"||name==="max"||name==="avg"?args.length>=1&&args.length<=12
    :name==="sum"||name==="count"?args.length===1
    :name==="pow"||name==="mod"||name==="gt"||name==="gte"||name==="lt"||name==="lte"||name==="eq"||name==="neq"?args.length===2
    :name==="if"||name==="clamp"?args.length===3
    :name==="and"||name==="or"?args.length>=2&&args.length<=12
    :name==="hypot"?args.length>=2&&args.length<=8
    :name==="round"||name==="log"?args.length>=1&&args.length<=2
    :args.length===1;
   if(!valid)fail();return{type:"call",name,args};
  }
  if(groupDefinitions.has(name))return{type:"group",name};
  if(name==="pi")return{type:"number",value:Math.PI};
  if(name==="e")return{type:"number",value:Math.E};
  if(!keys.has(name))fail();return{type:"variable",name};
 }
 function unary(){if(take("+"))return{type:"unary",op:"+",value:unary()};if(take("-"))return{type:"unary",op:"-",value:unary()};return power();}
 function power(){let node=primary();if(take("^"))node={type:"binary",op:"^",left:node,right:unary()};return node;}
 function multiply(){let node=unary();while(true){if(take("*"))node={type:"binary",op:"*",left:node,right:unary()};else if(take("/"))node={type:"binary",op:"/",left:node,right:unary()};else return node;}}
 function add(){let node=multiply();while(true){if(take("+"))node={type:"binary",op:"+",left:node,right:multiply()};else if(take("-"))node={type:"binary",op:"-",left:node,right:multiply()};else return node;}}
 const ast=add();ws();if(at!==input.length)fail();return ast;
}
function formulaGroupFieldReferences(ast,output=[]){
 if(!ast||typeof ast!=="object")return output;
 if(ast.type==="groupField"){output.push({group:ast.group,field:ast.field});return output;}
 if(ast.type==="binary"){formulaGroupFieldReferences(ast.left,output);formulaGroupFieldReferences(ast.right,output);}
 else if(ast.type==="unary")formulaGroupFieldReferences(ast.value,output);
 else if(ast.type==="call")(ast.args||[]).forEach(arg=>formulaGroupFieldReferences(arg,output));
 return output;
}
function formulaInputReferences(ast,output=new Set()){
 if(!(output instanceof Set))output=new Set();
 if(!ast||typeof ast!=="object")return output;
 if(ast.type==="variable")output.add(ast.name);
 else if(ast.type==="unary")formulaInputReferences(ast.value,output);
 else if(ast.type==="binary"){
  formulaInputReferences(ast.left,output);
  formulaInputReferences(ast.right,output);
 }else if(ast.type==="call")(ast.args||[]).forEach(argument=>formulaInputReferences(argument,output));
 return output;
}
function evaluate(ast,values,groupValues,rowContext=null){
 const groups=groupValues&&typeof groupValues==="object"?groupValues:{};
 let n;
 if(ast.type==="number")return ast.value;
 if(ast.type==="variable")return Number(values[ast.name]);
 if(ast.type==="group")return Array.isArray(groups[ast.name])?groups[ast.name]:[];
 if(ast.type==="groupField"){
  if(rowContext&&rowContext.group===ast.group)return Number(rowContext.row?.[ast.field]??0);
  const rows=Array.isArray(groups[ast.group])?groups[ast.group]:[];
  return rows.map(row=>Number(row?.[ast.field]??0));
 }
 if(ast.type==="unary"){const v=evaluate(ast.value,values,groups,rowContext);return ast.op==="-"?-v:v;}
 if(ast.type==="binary"){
  const a=evaluate(ast.left,values,groups,rowContext),b=evaluate(ast.right,values,groups,rowContext);
  if(ast.op==="+")n=a+b;else if(ast.op==="-")n=a-b;else if(ast.op==="*")n=a*b;else if(ast.op==="/"){if(b===0)throw new Error("A formula divides by zero. Change your inputs.");n=a/b;}else n=Math.pow(a,b);
 }else if(ast.name==="if"){
  const condition=evaluate(ast.args[0],values,groups,rowContext);
  n=evaluate(ast.args[condition!==0?1:2],values,groups,rowContext);
 }else{
  if(ast.name==="sum"){
   const refs=formulaGroupFieldReferences(ast.args[0]),groupNames=[...new Set(refs.map(ref=>ref.group))];
   if(!refs.length||groupNames.length!==1)throw new Error("sum() requires fields from one dynamic group, e.g. sum(expenses.amount).");
   const rows=Array.isArray(groups[groupNames[0]])?groups[groupNames[0]]:[];
   n=rows.reduce((total,row)=>total+evaluate(ast.args[0],values,groups,{group:groupNames[0],row}),0);
  }else{
   const a=ast.args.map(x=>evaluate(x,values,groups,rowContext));
   if(ast.name==="count"){if(!Array.isArray(a[0]))throw new Error("count() requires a dynamic group, e.g. count(expenses).");n=a[0].length;}
   else if(ast.name==="min")n=a.length===1&&Array.isArray(a[0])?Math.min(...a[0]):Math.min(...a);
  else if(ast.name==="max")n=a.length===1&&Array.isArray(a[0])?Math.max(...a[0]):Math.max(...a);
  else if(ast.name==="avg")n=a.length===1&&Array.isArray(a[0])?(a[0].length?a[0].reduce((sum,value)=>sum+value,0)/a[0].length:0):a.reduce((sum,value)=>sum+value,0)/a.length;
  else if(ast.name==="abs")n=Math.abs(a[0]);
  else if(ast.name==="round")n=a.length===1?Math.round(a[0]):Number(a[0].toFixed(Math.max(0,Math.min(8,Math.floor(a[1])))));
  else if(ast.name==="floor")n=Math.floor(a[0]);
  else if(ast.name==="ceil")n=Math.ceil(a[0]);
  else if(ast.name==="trunc")n=Math.trunc(a[0]);
  else if(ast.name==="sign")n=Math.sign(a[0]);
  else if(ast.name==="clamp"){if(a[1]>a[2])throw new Error("Clamp minimum cannot be greater than its maximum.");n=Math.min(a[2],Math.max(a[1],a[0]));}
  else if(ast.name==="gt")n=a[0]>a[1]?1:0;
  else if(ast.name==="gte")n=a[0]>=a[1]?1:0;
  else if(ast.name==="lt")n=a[0]<a[1]?1:0;
  else if(ast.name==="lte")n=a[0]<=a[1]?1:0;
  else if(ast.name==="eq")n=a[0]===a[1]?1:0;
  else if(ast.name==="neq")n=a[0]!==a[1]?1:0;
  else if(ast.name==="and")n=a.every(value=>value!==0)?1:0;
  else if(ast.name==="or")n=a.some(value=>value!==0)?1:0;
  else if(ast.name==="not")n=a[0]===0?1:0;
  else if(ast.name==="mod"){if(a[1]===0)throw new Error("A formula cannot calculate a remainder by zero.");n=a[0]%a[1];}
  else if(ast.name==="hypot")n=Math.hypot(...a);
  else if(ast.name==="sqrt"){if(a[0]<0)throw new Error("Square root is invalid for these values.");n=Math.sqrt(a[0]);}
  else if(ast.name==="pow")n=Math.pow(a[0],a[1]);
  else if(ast.name==="log")n=a.length===1?Math.log10(a[0]):Math.log(a[0])/Math.log(a[1]);
  else if(ast.name==="ln")n=Math.log(a[0]);
  else if(ast.name==="exp")n=Math.exp(a[0]);
  else if(ast.name==="sin")n=Math.sin(a[0]);
  else if(ast.name==="cos")n=Math.cos(a[0]);
  else if(ast.name==="tan")n=Math.tan(a[0]);
  else if(ast.name==="asin")n=Math.asin(a[0]);
  else if(ast.name==="acos")n=Math.acos(a[0]);
   else n=Math.atan(a[0]);
  }
 }
 if(!Number.isFinite(n))throw new Error("The calculator produced an invalid result for these input values.");
 return n;
}
function groupMapForSpec(spec){
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 return new Map(groups.map(group=>[String(group.key||""),new Set((Array.isArray(group.fields)?group.fields:[]).map(field=>String(field.key||"")))]));
}
function defaultGroupValues(groups){
 const values={};
 (Array.isArray(groups)?groups:[]).forEach(group=>{
  const minItems=Math.max(1,Math.min(20,Number(group.minItems)||1));
  values[group.key]=Array.from({length:minItems},()=>Object.fromEntries((group.fields||[]).map(field=>[field.key,Number(field.default)||0])));
 });
 return values;
}
function unitDescriptor(unit){
 const raw=String(unit||"").trim();
 const key=raw.toLowerCase().replace(/\s+/g," ");
 const descriptor=(exact,vector,opaque,symbols={})=>({exact,vector,opaque,symbols});
 const canonicalTimeUnit=value=>({
  days:"day",day:"day",weeks:"week",week:"week",months:"month",month:"month",
  years:"year",year:"year",hours:"hour",hour:"hour",hrs:"hour",hr:"hour",h:"hour",
  minutes:"minute",minute:"minute",seconds:"second",second:"second"
 })[String(value||"").trim().toLowerCase()]||String(value||"").trim();
 if(!raw)return descriptor("",{},false,{});
 if(raw==="1")return descriptor(raw,{},false,{});
 if(/^[A-Z]{3}$/.test(raw))return descriptor(raw,{["currency:"+raw]:1},false,{["currency:"+raw]:raw});
 const rateMatch=raw.match(/^([A-Z]{3})\s*\/\s*(.+)$/);
 if(rateMatch){
  const denominator=rateMatch[2].trim().toLowerCase();
  const dimension=({
   kwh:"energy",mwh:"energy",mj:"energy",l:"volume",litre:"volume",liter:"volume",
   kg:"mass",g:"mass","m³":"volume",m3:"volume","m²":"area",m2:"area",
   hour:"time",hours:"time",hr:"time",hrs:"time",h:"time",day:"time",days:"time",
   week:"time",weeks:"time",month:"time",months:"time",year:"time",years:"time",
   minute:"time",minutes:"time",second:"time",seconds:"time",
   unit:"count",units:"count",item:"count",items:"count",pack:"count",packs:"count",
   person:"count",people:"count",user:"count",users:"count",
   request:"count",requests:"count",read:"count",reads:"count",write:"count",writes:"count",
   call:"count",calls:"count",token:"token",tokens:"token",km:"length",mile:"length",miles:"length",m:"length"
  })[denominator];
  if(dimension)return descriptor(raw,{["currency:"+rateMatch[1]]:1,[dimension]:-1},false,{["currency:"+rateMatch[1]]:rateMatch[1],[dimension]:dimension==="token"?"token":rateMatch[2].trim()});
 }
 const known={
  "%":{},"%/year":{time:-1},"%/month":{time:-1},"%/day":{time:-1},
  months:{time:1},month:{time:1},years:{time:1},year:{time:1},days:{time:1},day:{time:1},weeks:{time:1},week:{time:1},hours:{time:1},hour:{time:1},minutes:{time:1},minute:{time:1},seconds:{time:1},second:{time:1},hr:{time:1},hrs:{time:1},h:{time:1},s:{time:1},
  km:{length:1},kilometres:{length:1},kilometers:{length:1},miles:{length:1},mile:{length:1},m:{length:1},cm:{length:1},mm:{length:1},
  "m²":{area:1},"m2":{area:1},"ft²":{area:1},
  l:{volume:1},litres:{volume:1},liters:{volume:1},"m³":{volume:1},"m3":{volume:1},ml:{volume:1},
  kg:{mass:1},kilograms:{mass:1},g:{mass:1},grams:{mass:1},tonnes:{mass:1},
  b:{data:1},kb:{data:1},mb:{data:1},gb:{data:1},tb:{data:1},pb:{data:1},
  wh:{energy:1},kwh:{energy:1},mwh:{energy:1},mj:{energy:1},w:{power:1},kw:{power:1},
  "l/100 km":{volume:1,length:-1},"km/h":{length:1,time:-1},"m/s":{length:1,time:-1},
  "m²/pack":{area:1,count:-1},"kwh/day":{energy:1,time:-1},"kwh/month":{energy:1,time:-1},
  "eur/kwh":{"currency:EUR":1,energy:-1},"usd/kwh":{"currency:USD":1,energy:-1},"rsd/kwh":{"currency:RSD":1,energy:-1},
  "eur/l":{"currency:EUR":1,volume:-1},"usd/l":{"currency:USD":1,volume:-1},"rsd/l":{"currency:RSD":1,volume:-1},
  "eur/kg":{"currency:EUR":1,mass:-1},"eur/m²":{"currency:EUR":1,area:-1},"eur/m2":{"currency:EUR":1,area:-1},
  "eur/m³":{"currency:EUR":1,volume:-1},"eur/m3":{"currency:EUR":1,volume:-1},
  "eur/hour":{"currency:EUR":1,time:-1},"usd/hour":{"currency:USD":1,time:-1},
  "eur/month":{"currency:EUR":1,time:-1},"eur/day":{"currency:EUR":1,time:-1},
  "eur/person/day":{"currency:EUR":1,count:-1,time:-1},"usd/person/day":{"currency:USD":1,count:-1,time:-1},
  "eur/unit":{"currency:EUR":1,count:-1},"eur/item":{"currency:EUR":1,count:-1},"eur/pack":{"currency:EUR":1,count:-1},
  "usd/unit":{"currency:USD":1,count:-1},"usd/item":{"currency:USD":1,count:-1},"rsd/unit":{"currency:RSD":1,count:-1}
 };
 const knownSymbols={
  months:{time:"month"},month:{time:"month"},years:{time:"year"},year:{time:"year"},
  days:{time:"day"},day:{time:"day"},weeks:{time:"week"},week:{time:"week"},
  hours:{time:"hour"},hour:{time:"hour"},wh:{energy:"Wh"},minutes:{time:"minute"},minute:{time:"minute"},
  seconds:{time:"second"},second:{time:"second"},hr:{time:"hour"},hrs:{time:"hour"},h:{time:"hour"},s:{time:"second"},
  km:{length:"km"},kilometres:{length:"kilometres"},kilometers:{length:"kilometers"},
  miles:{length:"miles"},mile:{length:"mile"},m:{length:"m"},cm:{length:"cm"},mm:{length:"mm"},
  "m²":{area:"m²"},"m2":{area:"m2"},"ft²":{area:"ft²"},
  l:{volume:"L"},litres:{volume:"litres"},liters:{volume:"liters"},
  "m³":{volume:"m³"},"m3":{volume:"m3"},ml:{volume:"mL"},
  kg:{mass:"kg"},kilograms:{mass:"kilograms"},g:{mass:"g"},grams:{mass:"grams"},tonnes:{mass:"tonnes"},
  b:{data:"B"},kb:{data:"KB"},mb:{data:"MB"},gb:{data:"GB"},tb:{data:"TB"},pb:{data:"PB"},
  wh:{energy:"Wh"},kwh:{energy:"kWh"},mwh:{energy:"MWh"},mj:{energy:"MJ"},w:{power:"W"},kw:{power:"kW"},
  "l/100 km":{volume:"L",length:"km"},"km/h":{length:"km",time:"hour"},"m/s":{length:"m",time:"second"},
  "m²/pack":{area:"m²",count:"pack"},"kwh/day":{energy:"kWh",time:"day"},"kwh/month":{energy:"kWh",time:"month"}
 };
 if(Object.prototype.hasOwnProperty.call(known,key)){
  const vector=known[key],symbols={...(knownSymbols[key]||{})};
  Object.keys(vector).forEach(dimension=>{
   if(dimension.startsWith("currency:"))symbols[dimension]=dimension.slice(9);
   else if(!symbols[dimension])symbols[dimension]=({time:"days",length:"km",area:"m²",volume:"L",mass:"kg",energy:"kWh",power:"W",count:"items"})[dimension]||dimension;
  });
  return descriptor(raw,vector,false,symbols);
 }
 if(key==="token"||key==="tokens")return descriptor(raw,{token:1},false,{token:"token"});
 const countSymbols={items:"items",item:"item",units:"units",unit:"unit",people:"people",person:"person",packs:"packs",pack:"pack",
  users:"user",user:"user",vehicles:"vehicles",vehicle:"vehicle",cars:"cars",car:"car",
  requests:"request",request:"request",reads:"read",read:"read",writes:"write",write:"write",calls:"call",call:"call",devices:"device",device:"device"};
 if(Object.prototype.hasOwnProperty.call(countSymbols,key)){
  return descriptor(raw,{count:1},false,{count:countSymbols[key]});
 }
 if(["period","periods","occurrences","times"].includes(key))return descriptor(raw,{},false,{});
 // Compose simple products and quotients dimensionally. Unknown atoms remain distinct
 // opaque dimensions, so GB/hour can be checked without inventing a GB-to-MB conversion.
 if(/[*/]/.test(raw)){
  const compact=raw.replace(/\s*([*/])\s*/g,"$1");
  const parts=compact.split(/([*/])/);
  if(parts.length>=3&&parts.length%2===1){
   let vector={},symbols={},opaque=false,operation=1,valid=true;
   for(let index=0;index<parts.length;index++){
    if(index%2===1){operation=parts[index]==="/" ? -1 : 1;continue;}
    const match=parts[index].match(/^([A-Za-zµμ%°][A-Za-z0-9_µμ%°²³-]*|1)(?:\^(-?[1-4]))?$/);
    if(!match){valid=false;break;}
    const power=Number(match[2]||1)*operation;
    const base=unitDescriptor(match[1]);
    opaque=opaque||base.opaque;
    Object.entries(base.vector).forEach(([dimension,exponent])=>{
     vector[dimension]=(vector[dimension]||0)+exponent*power;
     if(Math.abs(vector[dimension])<1e-10){delete vector[dimension];delete symbols[dimension];}
     else if(base.symbols?.[dimension])symbols[dimension]=base.symbols[dimension];
    });
   }
   if(valid){
    normalizeDerivedEnergyUnit(vector,symbols);
    return descriptor(raw,vector,Object.keys(vector).some(dimension=>dimension.startsWith("unit:")),symbols);
   }
  }
 }
 if(["period","periods","occurrences","times"].includes(key))return descriptor(raw,{},false,{});
 return descriptor(raw,{["unit:"+key]:1},true,{["unit:"+key]:raw});
}
function normalizeDerivedEnergyUnit(vector,symbols){
 // Power multiplied by one hour is energy. Keep the scale in the displayed unit:
 // kW × hour = kWh; W × hour = Wh.
 if(Math.abs(Number(vector.power||0)-1)<1e-10&&Math.abs(Number(vector.time||0)-1)<1e-10){
  const powerSymbol=String(symbols.power||"");
  const timeSymbol=String(symbols.time||"");
  const energySymbol=powerSymbol==="kW"&&timeSymbol==="hour"?"kWh"
   :powerSymbol==="W"&&timeSymbol==="hour"?"Wh":"";
  if(energySymbol){
   delete vector.power;
   delete vector.time;
   delete symbols.power;
   delete symbols.time;
   vector.energy=(vector.energy||0)+1;
   symbols.energy=energySymbol;
  }
 }
}
function combineUnitDescriptors(left,right,sign){
 const vector={...left.vector},symbols={...(left.symbols||{})};
 Object.entries(right.vector).forEach(([key,value])=>{
  vector[key]=(vector[key]||0)+value*sign;
  if(Math.abs(vector[key])<1e-10){delete vector[key];delete symbols[key];}
  else if(!symbols[key]&&right.symbols?.[key])symbols[key]=right.symbols[key];
 });
 normalizeDerivedEnergyUnit(vector,symbols);
 return{exact:"",vector,opaque:Object.keys(vector).some(dimension=>dimension.startsWith("unit:")),symbols};
}
function sameUnitDescriptor(left,right){
 const sameDimensions=unitVectorKey(left)===unitVectorKey(right)&&left.opaque===right.opaque;
 if(!sameDimensions)return false;
 if(left.exact===right.exact)return true;
 // A formula-derived descriptor has no explicit display spelling. It may safely
 // match a selected unit only when the complete dimension vector is identical.
 if(!left.exact||!right.exact)return true;
 const vector=Object.entries(left.vector);
 const isSingleCurrency=vector.length===1&&vector[0][0].startsWith("currency:")&&Math.abs(vector[0][1]-1)<1e-9;
 return isSingleCurrency;
}
function constantFormulaValue(ast){
 if(ast.type==="number")return ast.value;
 if(ast.type==="unary"){const value=constantFormulaValue(ast.value);return value===null?null:ast.op==="-"?-value:value;}
 return null;
}
function analyseFormulaUnit(ast,inputs,groups){
 const definitions=Array.isArray(groups)?groups:[];
 if(ast.type==="number")return unitDescriptor("");
 if(ast.type==="variable"){
  const input=inputs.find(item=>item.key===ast.name);
  if(!input)throw new Error("Unknown input or earlier result in formula.");
  return input.unitDescriptor||unitDescriptor(input.unit);
 }
 if(ast.type==="group")return unitDescriptor("");
 if(ast.type==="groupField"){
  const group=definitions.find(item=>item.key===ast.group);
  const field=group?.fields?.find(item=>item.key===ast.field);
  if(!field)throw new Error("Unknown dynamic group field in formula.");
  return unitDescriptor(field.unit);
 }
 if(ast.type==="unary")return analyseFormulaUnit(ast.value,inputs,groups);
 const compatibleUnits=(units,nodes,message)=>{
  const dimensionedIndex=units.findIndex(item=>Object.keys(item.vector).length>0);
  const target=units[dimensionedIndex>=0?dimensionedIndex:0]||unitDescriptor("");
  const valid=units.every((item,index)=>sameUnitDescriptor(item,target)||
   (constantFormulaValue(nodes[index])!==null&&Object.keys(item.vector).length===0));
  if(!valid)throw new Error(message);
  return target;
 };
 if(ast.type==="binary"){
  const left=analyseFormulaUnit(ast.left,inputs,groups),right=analyseFormulaUnit(ast.right,inputs,groups);
  if(ast.op==="+"||ast.op==="-"){
   return compatibleUnits([left,right],[ast.left,ast.right],"Addition and subtraction require matching units. Numeric constants inherit the other value's unit.");
  }
  if(ast.op==="*")return combineUnitDescriptors(left,right,1);
  if(ast.op==="/")return combineUnitDescriptors(left,right,-1);
  const power=constantFormulaValue(ast.right);
  if(power===null&&!Object.keys(left.vector).length)return unitDescriptor("");
  if(power===null)throw new Error("A dimensional value must use a fixed numeric power.");
  const vector={};Object.entries(left.vector).forEach(([key,value])=>{const result=value*power;if(Math.abs(result)>1e-10)vector[key]=result;});
  return{exact:"",vector,opaque:left.opaque,symbols:{...(left.symbols||{})}};
 }
 const args=ast.args.map(arg=>analyseFormulaUnit(arg,inputs,groups));
 const sameArgs=()=>compatibleUnits(args,ast.args,ast.name+"() requires arguments with matching units. Numeric constants inherit the other argument's unit.");
 const dimensionless=()=>{if(Object.keys(args[0].vector).length)throw new Error(ast.name+"() requires a dimensionless condition.");return unitDescriptor("");};
 if(ast.name==="if"){
  dimensionless();
  return compatibleUnits(args.slice(1),ast.args.slice(1),"if() branches must return matching units. Numeric constants inherit the other branch's unit.");
 }
 if(["gt","gte","lt","lte","eq","neq"].includes(ast.name)){
  compatibleUnits(args,ast.args,ast.name+"() compares values with different units. Numeric thresholds inherit the compared input's unit.");
  return unitDescriptor("");
 }
 if(["and","or","not"].includes(ast.name)){
  args.forEach(item=>{if(Object.keys(item.vector).length)throw new Error(ast.name+"() requires dimensionless conditions.");});
  return unitDescriptor("");
 }
 if(ast.name==="count"){
  if(ast.args[0]?.type!=="group")throw new Error("count() requires a dynamic group, e.g. count(expenses).");
  return unitDescriptor("");
 }
 if(ast.name==="sum"){
  const refs=formulaGroupFieldReferences(ast.args[0]),groupNames=[...new Set(refs.map(ref=>ref.group))];
  if(!refs.length||groupNames.length!==1)throw new Error("sum() requires fields from one dynamic group, e.g. sum(expenses.amount).");
  return analyseFormulaUnit(ast.args[0],inputs,groups);
 }
 if(["min","max","avg","hypot","mod","clamp"].includes(ast.name))return sameArgs();
 if(["abs","round","floor","ceil","trunc"].includes(ast.name))return args[0];
 if(ast.name==="sign")return unitDescriptor("");
 if(ast.name==="sqrt"){
  const vector={};Object.entries(args[0].vector).forEach(([key,value])=>{if(Math.abs(value/2-Math.round(value/2))>1e-9)throw new Error("Square root requires even unit powers.");if(value/2)vector[key]=value/2;});
  return{exact:"",vector,opaque:args[0].opaque,symbols:{...(args[0].symbols||{})}};
 }
 if(ast.name==="pow"){
  const power=constantFormulaValue(ast.args[1]);
  if(power===null){
   if(Object.keys(args[1].vector).length)throw new Error("A variable power exponent must be dimensionless.");
   if(Object.keys(args[0].vector).length)throw new Error("A variable exponent requires a dimensionless base.");
   return unitDescriptor("");
  }
  const vector={};Object.entries(args[0].vector).forEach(([key,value])=>{if(value*power)vector[key]=value*power;});
  return{exact:"",vector,opaque:args[0].opaque,symbols:{...(args[0].symbols||{})}};
 }
 if(["log","ln","exp","sin","cos","tan","asin","acos","atan"].includes(ast.name)){
  if(Object.keys(args[0].vector).length)throw new Error(ast.name+"() requires a dimensionless input.");
  return unitDescriptor("");
 }
 return unitDescriptor("");
}
function unitVectorKey(unit){
 return Object.entries(unit.vector).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+"^"+Number(value.toFixed(6))).join("*");
}
function ensureResultCurrency(result,fallback="EUR"){
 if(!result||result.format!=="currency")return "";
 const current=String(result.currency||"").trim().toUpperCase();
 const isSupported=code=>CURRENCIES.some(([candidate])=>candidate===code)
  ||(typeof HISTORICAL_CURRENCIES!=="undefined"&&HISTORICAL_CURRENCIES.some(([candidate])=>candidate===code));
 if(current){result.currency=current;return current;}
 const preferred=String(fallback||"").trim().toUpperCase();
 result.currency=isSupported(preferred)?preferred:"EUR";
 return result.currency;
}
function validateFormulaResultUnit(result,unit){
 const format=String(result.format||"number");
 if(format==="unit"){
  const expected=unitDescriptor(result.unit);
  if(unitVectorKey(expected)!==unitVectorKey(unit)||expected.opaque!==unit.opaque){
   throw new Error("The formula's dimensions do not match the selected result unit. Check the input units and formula.");
  }
 }else if(format==="currency"){
  const expected=ensureResultCurrency(result);
  const actual=Object.keys(unit.vector);
  if(actual.length!==1||actual[0]!=="currency:"+expected||Math.abs(unit.vector[actual[0]]-1)>1e-9){
   throw new Error("The formula's units do not match the selected "+expected+" result currency. Check the input units and conversion assumptions.");
  }
 }else if(format==="percent"&&Object.keys(unit.vector).length){
  throw new Error("A percent result must be dimensionless. Divide by the relevant base value and multiply by 100.");
 }
}
function evaluateFormulaResults(spec,baseValues,groupValues){
 const inputs=Array.isArray(spec?.inputs)?spec.inputs:[];
 const definitions=Array.isArray(spec?.results)?spec.results:[];
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 const groupMap=groupMapForSpec(spec);
 const values={...(baseValues||{})};
 const availableKeys=new Set(inputs.map(item=>item.key));
 const unitInputs=inputs.slice();
 const results=[];
 definitions.forEach((item,index)=>{
  const ast=compileExpression(item.expression,availableKeys,groupMap);
  const outputUnit=analyseFormulaUnit(ast,unitInputs,groups);
  validateFormulaResultUnit(item,outputUnit);
  const value=evaluate(ast,values,groupValues||defaultGroupValues(groups));
  if(!Number.isFinite(value))throw new Error("Result "+(index+1)+" must produce one finite number. Use sum(), avg(), min() or max() to aggregate a dynamic group field.");
  results.push({item,label:item.label,value,explanation:String(item.explanation||""),key:String(item.key||"")});
  const resultKey=String(item.key||"").trim();
  if(resultKey){
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(resultKey)||availableKeys.has(resultKey)||groupMap.has(resultKey))throw new Error("Result "+(index+1)+" has an invalid or duplicate variable key.");
   availableKeys.add(resultKey);
   values[resultKey]=value;
   unitInputs.push({key:resultKey,unitDescriptor:outputUnit});
  }
 });
 return results;
}
function validateMakerSpec(spec){
 const errors=[];
 if(!Array.isArray(spec?.inputs)||!spec.inputs.length)errors.push("Add at least one input.");
 if(!Array.isArray(spec?.results)||!spec.results.length)errors.push("Add at least one result.");
 const inputs=Array.isArray(spec?.inputs)?spec.inputs:[],values={};
 const results=Array.isArray(spec?.results)?spec.results:[];
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 if(inputs.length>24)errors.push("A calculator can contain up to 24 fixed inputs.");
 if(results.length>20)errors.push("A calculator can contain up to 20 results.");
 if(groups.length>4)errors.push("A calculator can contain up to 4 dynamic input groups.");
 inputs.forEach(item=>{
  const label=String(item.label||item.key||"input"),min=Number(item.min),max=Number(item.max),value=Number(item.default),step=Number(item.step);
  if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(item.key||"")))errors.push(label+": variable keys must start with a lowercase letter and use only letters, numbers and underscores.");
  if(![min,max,value,step].every(Number.isFinite)||min>value||value>max||max<min||step<=0){errors.push(label+": check its minimum, maximum, default and step.");return;}
  const textValue=(label+" "+item.key).toLowerCase();
  if(/\b(?:commut(?:e|ing)|work|working|business)\s+days?\b|\bdays?_per_week\b/.test(textValue)&&(min<1||!Number.isInteger(value)||!Number.isInteger(step)||step<1)){
   errors.push(label+": use positive whole days and a step of at least 1.");
  }
  const stepPosition=(value-min)/step;
  if(!Number.isFinite(stepPosition)||Math.abs(stepPosition-Math.round(stepPosition))>1e-7)errors.push(label+": the default value does not match its step.");
  const maxStepPosition=(max-min)/step;
  if(max>min&&(!Number.isFinite(maxStepPosition)||Math.abs(maxStepPosition-Math.round(maxStepPosition))>1e-7))errors.push(label+": the maximum value does not match its step.");
  values[item.key]=value;
 });
 const fixedKeys=new Set(inputs.map(item=>item.key));
 const groupKeys=new Set(),groupFieldKeys=new Set(),groupFieldNames=new Set();
 groups.forEach((group,index)=>{
  const label=String(group.label||group.key||"Group "+(index+1));
  const minItems=Number(group.minItems??1),maxItems=Number(group.maxItems??10);
  if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(group.key||""))||fixedKeys.has(group.key)||groupKeys.has(group.key)||groupFieldNames.has(group.key)){
   errors.push(label+": use a unique lowercase variable key for this group.");
  }
  groupKeys.add(group.key);
  if(label.length<2||label.length>60||String(group.itemLabel||"Item").trim().length<1||String(group.itemLabel||"Item").length>40||!Number.isInteger(minItems)||!Number.isInteger(maxItems)||minItems<1||maxItems<minItems||maxItems>20){
   errors.push(label+": use 1–20 rows and a valid group and item label.");
  }
  if(!Array.isArray(group.fields)||group.fields.length<1||group.fields.length>6)errors.push(label+": each group needs 1–6 numeric fields.");
  (Array.isArray(group.fields)?group.fields:[]).forEach(field=>{
   const fieldLabel=String(field.label||field.key||"Field");
   const min=Number(field.min),max=Number(field.max),value=Number(field.default),step=Number(field.step);
   const composite=String(group.key)+"."+String(field.key);
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(field.key||""))||!fieldLabel.trim()||fieldLabel.length>60||groupFieldKeys.has(composite)||groupFieldNames.has(field.key)||fixedKeys.has(field.key)||groupKeys.has(field.key)){
    errors.push(fieldLabel+": use a unique lowercase key within its dynamic group.");
   }
   groupFieldKeys.add(composite);groupFieldNames.add(field.key);
   if(![min,max,value,step].every(Number.isFinite)||min>value||value>max||max<min||step<=0||String(field.unit||"").length>16){
    errors.push(fieldLabel+": check the minimum, maximum, default, step and unit.");
   }
  });
 });
 const groupMap=groupMapForSpec(spec);
 const groupSamples=defaultGroupValues(groups);
 const scenarios=[{...values}];
 const definedScenarios=Array.isArray(spec?.scenarios)?spec.scenarios:[];
 if(definedScenarios.length>3)errors.push("A calculator can contain up to 3 comparison scenarios.");
 const scenarioLabels=new Set();
 definedScenarios.forEach((scenario,index)=>{
  const label=String(scenario?.label||"").trim();
  if(label.length<2||label.length>50)errors.push("Scenario "+(index+1)+": use a name of 2 to 50 characters.");
  const normalized=label.toLowerCase();
  if(normalized&&scenarioLabels.has(normalized))errors.push("Scenario names must be unique.");
  scenarioLabels.add(normalized);
  const scenarioValues={...values};
  if(!scenario?.values||typeof scenario.values!=="object"||Array.isArray(scenario.values)){errors.push("Scenario "+(index+1)+" has invalid input values.");return;}
  Object.entries(scenario.values).forEach(([key,raw])=>{
   const input=inputs.find(item=>item.key===key),value=Number(raw);
   if(!input||!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max)){
    errors.push("Scenario "+(index+1)+": "+key+" must be a valid value within its input range.");return;
   }
   if(input.control==="toggle"&&![0,1].includes(value)){errors.push("Scenario "+(index+1)+": toggle "+key+" must be 0 or 1.");return;}
   if(input.control==="select"&&Array.isArray(input.choices)&&!input.choices.some(choice=>Number(choice.value)===value)){
    errors.push("Scenario "+(index+1)+": "+key+" must match one of its dropdown choices.");return;
   }
   scenarioValues[key]=value;
  });
  scenarios.push(scenarioValues);
 });
 if(inputs.length){
  scenarios.push(Object.fromEntries(inputs.map(item=>[item.key,Number(item.min)])));
  scenarios.push(Object.fromEntries(inputs.map(item=>[item.key,Number(item.max)])));
  inputs.forEach(item=>{
   const low={...values};low[item.key]=Number(item.min);scenarios.push(low);
   const high={...values};high[item.key]=Number(item.max);scenarios.push(high);
  });
  if(inputs.length<=12){
   for(let left=0;left<inputs.length;left++){
    for(let right=left+1;right<inputs.length;right++){
     for(const leftValue of [Number(inputs[left].min),Number(inputs[left].max)]){
      for(const rightValue of [Number(inputs[right].min),Number(inputs[right].max)]){
       const pair={...values};pair[inputs[left].key]=leftValue;pair[inputs[right].key]=rightValue;scenarios.push(pair);
      }
     }
    }
   }
  }
 }
 const availableKeys=new Set(inputs.map(item=>item.key));
 const formulaUnits=inputs.slice();
 const resultKeys=new Set();
 results.forEach((item,index)=>{
  const resultKey=String(item.key||"").trim();
  if(resultKey){
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(resultKey)||availableKeys.has(resultKey)||resultKeys.has(resultKey)||groupKeys.has(resultKey)||groupFieldNames.has(resultKey)){
    errors.push((item.label||"Result "+(index+1))+": result variable keys must be unique lowercase names.");
   }
  }
  const currencyCode=item.format==="currency"?ensureResultCurrency(item):String(item.currency||"").trim().toUpperCase();
  const supportedCurrency=CURRENCIES.some(([code])=>code===currencyCode)
   ||(typeof HISTORICAL_CURRENCIES!=="undefined"&&HISTORICAL_CURRENCIES.some(([code])=>code===currencyCode));
  if(item.format==="currency"&&!supportedCurrency)errors.push((item.label||"A currency result")+": choose a supported ISO 4217 currency code.");
  if(item.format==="unit"&&(!String(item.unit||"").trim()||String(item.unit||"").length>20))errors.push((item.label||"A result")+": select or enter a result unit of up to 20 characters.");
  if(String(item.explanation||"").length>280)errors.push((item.label||"A result")+": its explanation must be 280 characters or fewer.");
  try{
   const ast=compileExpression(item.expression,availableKeys,groupMap);
   const outputUnit=analyseFormulaUnit(ast,formulaUnits,groups);
   validateFormulaResultUnit(item,outputUnit);
   if(resultKey){
    availableKeys.add(resultKey);resultKeys.add(resultKey);
    formulaUnits.push({key:resultKey,unitDescriptor:outputUnit});
   }
  }catch(error){errors.push((item.label||"A result")+" formula: "+String(error?.message||"could not be validated."));}
 });
 scenarios.forEach(sample=>{
  try{evaluateFormulaResults(spec,sample,groupSamples);}
  catch(error){errors.push("Calculator result chain: "+String(error?.message||"could not be validated."));}
 });
 // Exercise dynamic-group field boundaries and maximum row counts with default fixed inputs.
 const cloneGroupSamples=()=>Object.fromEntries(groups.map(group=>[
  group.key,(groupSamples[group.key]||[]).map(row=>({...row}))
 ]));
 groups.forEach(group=>{
  (Array.isArray(group.fields)?group.fields:[]).forEach(field=>{
   [Number(field.min),Number(field.max)].forEach(boundary=>{
    const sample=cloneGroupSamples();
    if(sample[group.key]?.length)sample[group.key][0][field.key]=boundary;
    try{evaluateFormulaResults(spec,values,sample);}
    catch(error){errors.push("Dynamic group "+String(group.label||group.key)+" boundary check: "+String(error?.message||"could not be validated."));}
   });
  });
  const maxRows=Math.max(Number(group.minItems)||1,Math.min(20,Number(group.maxItems)||1));
  const maximumSample=cloneGroupSamples();
  maximumSample[group.key]=Array.from({length:maxRows},()=>Object.fromEntries((group.fields||[]).map(field=>[field.key,Number(field.default)||0])));
  try{evaluateFormulaResults(spec,values,maximumSample);}
  catch(error){errors.push("Dynamic group "+String(group.label||group.key)+" maximum-row check: "+String(error?.message||"could not be validated."));}
 });
 return {errors:[...new Set(errors)]};
}

function hasOwn(object,key){return Object.prototype.hasOwnProperty.call(object,key);}
function isRecord(value){return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)&&Object.prototype.toString.call(value)==="[object Object]";}
function validKey(value){return typeof value==="string"&&/^[a-z][a-z0-9_]{0,31}$/.test(value);}
function isIsoDateOnly(value){
 if(typeof value!=="string"||!/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.test(value))return false;
 const year=Number(value.slice(0,4));
 if(year<1||year>9999)return false;
 const date=new Date(value+"T00:00:00.000Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function normalizeTypedValue(definition,rawValue){
 const type=String(definition?.type||"");
 const fail=error=>({valid:false,value:undefined,error});
 if(type==="number"){
  let value;
  if(typeof rawValue==="number")value=rawValue;
  else if(typeof rawValue==="string"){
   const numericText=rawValue.trim();
   if(!numericText||! /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(numericText))return fail("Enter a numeric value.");
   value=Number(numericText);
  }else return fail("Enter a numeric value.");
  const min=definition.min,max=definition.max,step=definition.step;
  if(![value,min,max,step].every(Number.isFinite)||min>max||value<min||value>max||step<=0)return fail("The number is outside its allowed range.");
  const stepPosition=(value-min)/step;
  if(!Number.isFinite(stepPosition)||Math.abs(stepPosition-Math.round(stepPosition))>1e-7)return fail("The number does not match the permitted step.");
  if(definition.control==="select"&&(!Array.isArray(definition.choices)||!definition.choices.some(choice=>choice?.value===value)))return fail("Choose one of the listed numeric options.");
  return {valid:true,value,error:null};
 }
 if(type==="boolean")return typeof rawValue==="boolean"?{valid:true,value:rawValue,error:null}:fail("Choose true or false.");
 if(type==="enum"){
  const choices=Array.isArray(definition.choices)?definition.choices:[];
  return typeof rawValue==="string"&&choices.some(choice=>choice?.value===rawValue)
   ?{valid:true,value:rawValue,error:null}:fail("Choose one of the listed options.");
 }
 if(type==="date"){
  if(!isIsoDateOnly(rawValue))return fail("Enter a valid calendar date in YYYY-MM-DD format.");
  if(typeof definition.minDate==="string"&&isIsoDateOnly(definition.minDate)&&rawValue<definition.minDate)return fail("The date is earlier than the allowed minimum.");
  if(typeof definition.maxDate==="string"&&isIsoDateOnly(definition.maxDate)&&rawValue>definition.maxDate)return fail("The date is later than the allowed maximum.");
  return {valid:true,value:rawValue,error:null};
 }
 return fail("This calculator input type is not supported.");
}
function resolveCalculatorVersions(spec){
 if(!isRecord(spec))throw new Error("The calculator definition must be an object.");
 const hasSchema=hasOwn(spec,"schemaVersion"),hasEngine=hasOwn(spec,"engineVersion");
 if(!hasSchema&&!hasEngine){
  if(spec.version!==undefined&&Number(spec.version)!==1)throw new Error("Legacy calculator definitions must use version 1.");
  return {schemaVersion:1,engineVersion:1,legacy:true};
 }
 if(!hasSchema||!hasEngine)throw new Error("A versioned calculator must declare both schemaVersion and engineVersion.");
 const schemaVersion=spec.schemaVersion,engineVersion=spec.engineVersion;
 if(!Number.isInteger(schemaVersion)||!Number.isInteger(engineVersion))throw new Error("Calculator schemaVersion and engineVersion must be integers.");
 if(schemaVersion===1&&engineVersion===1){
  if(spec.version!==undefined&&Number(spec.version)!==1)throw new Error("Schema 1 definitions must keep the legacy version field at 1.");
  return {schemaVersion:1,engineVersion:1,legacy:false};
 }
 if(schemaVersion===2&&engineVersion===2)return {schemaVersion:2,engineVersion:2,legacy:false};
 throw new Error("This calculator schema/engine version combination is not supported.");
}

function compileV2Expression(source,symbols,groups){
 const input=String(source||"");
 if(!input.trim()||input.length>500)throw new Error("A v2 formula must contain 1–500 characters.");
 let at=0,nodeCount=0,nesting=0;
 const groupDefinitions=groups instanceof Map?groups:new Map();
 const fail=()=>{throw new Error("This v2 formula contains invalid syntax or an unknown reference.");};
 const node=value=>{nodeCount++;if(nodeCount>256)throw new Error("A v2 formula exceeds the 256-node limit.");return value;};
 const ws=()=>{while(at<input.length&&/\s/.test(input[at]))at++;};
 const take=value=>{ws();if(input.slice(at,at+value.length)===value){at+=value.length;return true;}return false;};
 const nested=callback=>{nesting++;if(nesting>32)throw new Error("A v2 formula exceeds the 32-level nesting limit.");try{return callback();}finally{nesting--;}};
 const identifier=()=>{ws();const match=input.slice(at).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(!match)return null;at+=match[0].length;return match[0];};
 const stringLiteral=()=>{
  ws();if(input[at]!=="\"")return null;
  const start=at++;let escaped=false;
  while(at<input.length){
   const ch=input[at++];
   if(escaped){escaped=false;continue;}
   if(ch==="\\"){escaped=true;continue;}
   if(ch==="\""){
    let value;try{value=JSON.parse(input.slice(start,at));}catch(_){fail();}
    if(typeof value!=="string"||value.length>64)fail();
    return node({type:"string",value});
   }
  }
  fail();
 };
 const functions=new Set(V2_FUNCTION_HELP.map(item=>item.name));
 function primary(){
  ws();
  if(take("("))return nested(()=>{const expression=add();if(!take(")"))fail();return expression;});
  const text=stringLiteral();if(text)return text;
  const numberMatch=input.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  if(numberMatch){at+=numberMatch[0].length;const value=Number(numberMatch[0]);if(!Number.isFinite(value))fail();return node({type:"number",value});}
  const name=identifier();if(!name)fail();
  if(name==="true"||name==="false")return node({type:"boolean",value:name==="true"});
  if(name==="pi")return node({type:"number",value:Math.PI});
  if(name==="e")return node({type:"number",value:Math.E});
  if(take(".")){
   const field=identifier(),definition=groupDefinitions.get(name);
   if(!field||!definition?.fields?.some(item=>item.key===field))fail();
   return node({type:"groupField",group:name,field});
  }
  if(take("(")){
   if(!functions.has(name))fail();
   const args=nested(()=>{
    const list=[];if(!take(")")){do{list.push(add());}while(take(","));if(!take(")"))fail();}
    return list;
   });
   const length=args.length;
   const valid=name==="min"||name==="max"||name==="avg"?length>=1&&length<=12
    :name==="sum"||name==="count"||name==="count_if"||name==="not"||name==="abs"||name==="floor"||name==="ceil"||name==="sqrt"||name==="trunc"||name==="sign"||name==="ln"||name==="exp"||name==="sin"||name==="cos"||name==="tan"||name==="asin"||name==="acos"||name==="atan"||name==="days_in_month"||name==="calendar_year"||name==="calendar_month"||name==="weekday"?length===1
    :name==="pow"||name==="mod"||name==="gt"||name==="gte"||name==="lt"||name==="lte"||name==="eq"||name==="neq"||name==="sum_if"||name==="date_diff_days"||name==="add_days"||name==="add_months"?length===2
    :name==="if"||name==="clamp"?length===3
    :name==="and"||name==="or"?length>=2&&length<=12
    :name==="hypot"?length>=2&&length<=8
    :name==="round"||name==="log"?length>=1&&length<=2
    :name==="percentile"||name==="weighted_avg"?length===2
    :name==="compound_interest"||name==="present_value"||name==="loan_payment"?length===3
    :name==="median"||name==="variance"||name==="stddev"?length===1
    :false;
   if(!valid)throw new Error(name+"() has an invalid number of arguments.");
   return node({type:"call",name,args});
  }
  if(groupDefinitions.has(name))return node({type:"group",name});
  if(!symbols.has(name))throw new Error("Unknown v2 input or earlier result: "+name+".");
  return node({type:"variable",name});
 }
 function unary(){if(take("+"))return node({type:"unary",op:"+",value:unary()});if(take("-"))return node({type:"unary",op:"-",value:unary()});return power();}
 function power(){let expression=primary();if(take("^"))expression=node({type:"binary",op:"^",left:expression,right:unary()});return expression;}
 function multiply(){let expression=unary();while(true){if(take("*"))expression=node({type:"binary",op:"*",left:expression,right:unary()});else if(take("/"))expression=node({type:"binary",op:"/",left:expression,right:unary()});else return expression;}}
 function add(){let expression=multiply();while(true){if(take("+"))expression=node({type:"binary",op:"+",left:expression,right:multiply()});else if(take("-"))expression=node({type:"binary",op:"-",left:expression,right:multiply()});else return expression;}}
 const ast=add();ws();if(at!==input.length)fail();return ast;
}
function typedFormulaGroupReferences(ast,output=[]){
 if(!ast||typeof ast!=="object")return output;
 if(ast.type==="groupField"){output.push({group:ast.group,field:ast.field});return output;}
 if(ast.type==="binary"){typedFormulaGroupReferences(ast.left,output);typedFormulaGroupReferences(ast.right,output);}
 else if(ast.type==="unary")typedFormulaGroupReferences(ast.value,output);
 else if(ast.type==="call")(ast.args||[]).forEach(arg=>typedFormulaGroupReferences(arg,output));
 return output;
}
function typedFormulaInputReferences(ast,output=new Set()){
 if(!(output instanceof Set))output=new Set();
 if(!ast||typeof ast!=="object")return output;
 if(ast.type==="variable")output.add(ast.name);
 else if(ast.type==="unary")typedFormulaInputReferences(ast.value,output);
 else if(ast.type==="binary"){typedFormulaInputReferences(ast.left,output);typedFormulaInputReferences(ast.right,output);}
 else if(ast.type==="call")(ast.args||[]).forEach(arg=>typedFormulaInputReferences(arg,output));
 return output;
}
function dateParts(value){
 if(!isIsoDateOnly(value))throw new Error("A date formula received an invalid calendar date.");
 return {year:Number(value.slice(0,4)),month:Number(value.slice(5,7)),day:Number(value.slice(8,10))};
}
function daysInCalendarMonth(year,month){
 const date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month,0);
 return date.getUTCDate();
}
function formatCalendarDate(year,month,day){
 if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>daysInCalendarMonth(year,month)){
  throw new Error("A date formula produced a date outside the supported calendar range.");
 }
 return String(year).padStart(4,"0")+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
function calendarDayNumber(value){
 const parts=dateParts(value),date=new Date(0);
 date.setUTCHours(0,0,0,0);date.setUTCFullYear(parts.year,parts.month-1,parts.day);
 return Math.floor(date.getTime()/86400000);
}
function typedUnitCompatible(left,nodes,message){
 const dimensioned=left.findIndex(unit=>Object.keys(unit.vector).length>0);
 const target=left[dimensioned>=0?dimensioned:0]||unitDescriptor("");
 const valid=left.every((unit,index)=>sameUnitDescriptor(unit,target)||
  (constantFormulaValue(nodes[index])!==null&&Object.keys(unit.vector).length===0));
 if(!valid)throw new Error(message);
 return target;
}
function inferV2Expression(ast,symbols,groups){
 const definitions=groups instanceof Map?groups:new Map();
 const numberResult=unit=>({type:"number",unit:unit||unitDescriptor("")});
 const scalarTypes=new Set(["number","boolean","enum","date"]);
 const infer=expression=>{
  if(expression.type==="number")return numberResult(unitDescriptor(""));
  if(expression.type==="boolean")return {type:"boolean"};
  if(expression.type==="string")return {type:"string",value:expression.value};
  if(expression.type==="variable"){
   const definition=symbols.get(expression.name);
   if(!definition)throw new Error("Unknown v2 variable: "+expression.name+".");
   return definition.type==="number"?numberResult(definition.unit||unitDescriptor("")):{...definition};
  }
  if(expression.type==="group"){
   if(!definitions.has(expression.name))throw new Error("Unknown dynamic group: "+expression.name+".");
   return {type:"group",group:expression.name};
  }
  if(expression.type==="groupField"){
   const field=definitions.get(expression.group)?.fields?.find(item=>item.key===expression.field);
   if(!field)throw new Error("Unknown dynamic group field: "+expression.group+"."+expression.field+".");
   return field.type==="number"?numberResult(unitDescriptor(field.unit||"")):{type:field.type,choices:field.choices||[] ,group:expression.group};
  }
  if(expression.type==="unary"){
   const value=infer(expression.value);
   if(value.type!=="number")throw new Error("Unary numeric operators require a number.");
   return value;
  }
  if(expression.type==="binary"){
   const left=infer(expression.left),right=infer(expression.right);
   if(left.type!=="number"||right.type!=="number")throw new Error("Arithmetic operators require numeric values; boolean, enum and date values are not numbers.");
   if(expression.op==="+"||expression.op==="-"){
    return numberResult(typedUnitCompatible([left.unit,right.unit],[expression.left,expression.right],"Addition and subtraction require matching units; numeric constants inherit the other value's unit."));
   }
   if(expression.op==="*")return numberResult(combineUnitDescriptors(left.unit,right.unit,1));
   if(expression.op==="/")return numberResult(combineUnitDescriptors(left.unit,right.unit,-1));
   const power=constantFormulaValue(expression.right);
   if(power===null&&Object.keys(left.unit.vector).length)throw new Error("A dimensional value must use a fixed numeric power.");
   const vector={};Object.entries(left.unit.vector).forEach(([key,value])=>{const result=value*(power===null?1:power);if(Math.abs(result)>1e-10)vector[key]=result;});
   return numberResult({exact:"",vector,opaque:left.unit.opaque,symbols:{...(left.unit.symbols||{})}});
  }
  if(expression.type!=="call")throw new Error("This v2 expression node is unsupported.");
  const args=expression.args.map(infer),name=expression.name;
  const sameScalar=(left,right,context)=>{
   if(left.type==="string"&&right.type==="enum"||right.type==="string"&&left.type==="enum"){
    const enumType=left.type==="enum"?left:right,literal=left.type==="string"?left:right;
    if(!enumType.choices.some(choice=>choice?.value===literal.value))throw new Error(context+" string "+JSON.stringify(literal.value)+" does not match a declared enum choice.");
    return;
   }
   if(left.type!==right.type||!scalarTypes.has(left.type))throw new Error(context+" requires values of the same supported type.");
   if(left.type==="number")typedUnitCompatible([left.unit,right.unit],[{type:"number",value:null},{type:"number",value:null}],context+" compares values with incompatible units.");
   if(left.type==="enum"&&JSON.stringify(left.choices.map(item=>item.value))!==JSON.stringify(right.choices.map(item=>item.value)))throw new Error(context+" requires the same enum definition.");
  };
  if(name==="if"){
   if(args[0].type!=="boolean")throw new Error("if() condition must be boolean.");
   const yes=args[1],no=args[2];
   if(yes.type!==no.type||!scalarTypes.has(yes.type))throw new Error("if() branches must return the same supported value type.");
   if(yes.type==="number")return numberResult(typedUnitCompatible([yes.unit,no.unit],[expression.args[1],expression.args[2]],"if() branches must return matching units."));
   if(yes.type==="enum"&&JSON.stringify(yes.choices.map(item=>item.value))!==JSON.stringify(no.choices.map(item=>item.value)))throw new Error("if() enum branches must use the same choices.");
   return yes;
  }
  if(["eq","neq"].includes(name)){
   if(args[0].type==="number"&&args[1].type==="number")typedUnitCompatible([args[0].unit,args[1].unit],expression.args,name+"() compares values with incompatible units.");
   else if(args[0].type==="date"&&args[1].type==="string"&&isIsoDateOnly(expression.args[1].value)){}
   else if(args[1].type==="date"&&args[0].type==="string"&&isIsoDateOnly(expression.args[0].value)){}
   else sameScalar(args[0],args[1],name+"()");
   return {type:"boolean"};
  }
  if(["gt","gte","lt","lte"].includes(name)){
   if(args[0].type==="date"&&args[1].type==="date")return {type:"boolean"};
   if(args[0].type==="date"&&args[1].type==="string"&&isIsoDateOnly(expression.args[1].value))return {type:"boolean"};
   if(args[1].type==="date"&&args[0].type==="string"&&isIsoDateOnly(expression.args[0].value))return {type:"boolean"};
   if(args[0].type!=="number"||args[1].type!=="number")throw new Error(name+"() supports only compatible numbers or calendar dates.");
   typedUnitCompatible([args[0].unit,args[1].unit],expression.args,name+"() compares values with incompatible units.");
   return {type:"boolean"};
  }
  if(name==="and"||name==="or"||name==="not"){
   if(args.some(item=>item.type!=="boolean"))throw new Error(name+"() accepts only boolean conditions.");
   return {type:"boolean"};
  }
  if(name==="date_diff_days"){
   if(args.some(item=>item.type!=="date"&&item.type!=="string"))throw new Error("date_diff_days() requires two calendar dates.");
   expression.args.forEach((argument,index)=>{if(args[index].type==="string"&&!isIsoDateOnly(argument.value))throw new Error("date_diff_days() string literals must be valid YYYY-MM-DD dates.");});
   return numberResult(unitDescriptor("days"));
  }
  if(name==="add_days"||name==="add_months"){
   if(args[0].type!=="date")throw new Error(name+"() first argument must be a date input or date expression.");
   if(args[1].type!=="number")throw new Error(name+"() offset must be numeric.");
   const expected=unitDescriptor(name==="add_days"?"days":"months"),offsetUnit=args[1].unit;
   const literal=constantFormulaValue(expression.args[1])!==null;
   if(literal&&!Number.isInteger(constantFormulaValue(expression.args[1])))throw new Error(name+"() offset constants must be whole numbers.");
   const acceptedOffsetUnits=name==="add_days"?["day","days"]:["month","months"];
   if(!literal&&!acceptedOffsetUnits.includes(String(offsetUnit.exact||"")))throw new Error(name+"() offset must use "+(name==="add_days"?"day/days":"month/months")+" or be a numeric constant.");
   return {type:"date"};
  }
  if(name==="days_in_month"){
   if(args[0].type!=="date")throw new Error("days_in_month() requires a calendar date.");
   return numberResult(unitDescriptor("days"));
  }
  if(name==="calendar_year"||name==="calendar_month"||name==="weekday"){
   if(args[0].type!=="date")throw new Error(name+"() requires a calendar date.");
   return numberResult(unitDescriptor(""));
  }
  if(["median","variance","stddev","percentile","weighted_avg"].includes(name)){
   const valueIndex=0,refs=typedFormulaGroupReferences(expression.args[valueIndex]),groupNames=[...new Set(refs.map(item=>item.group))];
   if(args[0].type!=="number"||!refs.length||groupNames.length!==1)throw new Error(name+"() requires a numeric expression from exactly one dynamic group.");
   if(name==="percentile"&&(args[1].type!=="number"||constantFormulaValue(expression.args[1])===null||constantFormulaValue(expression.args[1])<0||constantFormulaValue(expression.args[1])>100))throw new Error("percentile() requires a constant percentile from 0 to 100.");
   if(name==="weighted_avg"){
    const weightRefs=typedFormulaGroupReferences(expression.args[1]),weightGroups=[...new Set(weightRefs.map(item=>item.group))];
    if(args[1].type!=="number"||weightGroups.length!==1||weightGroups[0]!==groupNames[0]||Object.keys(args[1].unit.vector).length)throw new Error("weighted_avg() requires a dimensionless weight from the same dynamic group.");
    return numberResult(args[0].unit);
   }
   if(name==="variance")return numberResult(combineUnitDescriptors(args[0].unit,args[0].unit,1));
   return numberResult(args[0].unit);
  }
  if(["compound_interest","present_value","loan_payment"].includes(name)){
   if(args.some(item=>item.type!=="number"))throw new Error(name+"() accepts numeric arguments only.");
   if(Object.keys(args[1].unit.vector).length||Object.keys(args[2].unit.vector).length)throw new Error(name+"() rate and period arguments must be dimensionless.");
   if(name==="loan_payment"&&args[2].type!=="number")throw new Error("loan_payment() requires a numeric period count.");
   return numberResult(args[0].unit);
  }
  if(name==="count"){
   if(args[0].type!=="group")throw new Error("count() requires a dynamic group name.");
   return numberResult(unitDescriptor(""));
  }
  if(name==="count_if"){
   if(args[0].type!=="boolean")throw new Error("count_if() condition must be boolean.");
   const refs=typedFormulaGroupReferences(expression.args[0]),names=[...new Set(refs.map(item=>item.group))];
   if(!refs.length||names.length!==1)throw new Error("count_if() must refer to fields from exactly one dynamic group.");
   return numberResult(unitDescriptor(""));
  }
  if(name==="sum"||name==="sum_if"){
   const valueExpression=name==="sum"?expression.args[0]:expression.args[0];
   const valueType=args[0];
   if(valueType.type!=="number")throw new Error(name+"() must aggregate a numeric expression.");
   const valueRefs=typedFormulaGroupReferences(valueExpression),groupsUsed=[...new Set(valueRefs.map(item=>item.group))];
   if(!valueRefs.length||groupsUsed.length!==1)throw new Error(name+"() must aggregate fields from exactly one dynamic group.");
   if(name==="sum_if"){
    if(args[1].type!=="boolean")throw new Error("sum_if() predicate must be boolean.");
    const predicateGroups=[...new Set(typedFormulaGroupReferences(expression.args[1]).map(item=>item.group))];
    if(predicateGroups.length!==1||predicateGroups[0]!==groupsUsed[0])throw new Error("sum_if() value and predicate must refer to fields from the same dynamic group.");
   }
   return numberResult(valueType.unit);
  }
  if(args.some(item=>item.type!=="number"))throw new Error(name+"() accepts only numeric arguments.");
  if(name==="min"||name==="max"||name==="avg"||name==="hypot"||name==="mod"||name==="clamp"){
   return numberResult(typedUnitCompatible(args.map(item=>item.unit),expression.args,name+"() requires matching units."));
  }
  if(["abs","round","floor","ceil","trunc"].includes(name))return numberResult(args[0].unit);
  if(name==="sign")return numberResult(unitDescriptor(""));
  if(name==="sqrt"){
   const vector={};Object.entries(args[0].unit.vector).forEach(([key,value])=>{if(Math.abs(value/2-Math.round(value/2))>1e-9)throw new Error("Square root requires even unit powers.");if(value/2)vector[key]=value/2;});
   return numberResult({exact:"",vector,opaque:args[0].unit.opaque,symbols:{...(args[0].unit.symbols||{})}});
  }
  if(name==="pow"){
   const power=constantFormulaValue(expression.args[1]);
   if(power===null&&Object.keys(args[0].unit.vector).length)throw new Error("A dimensional value must use a fixed numeric power.");
   const vector={};Object.entries(args[0].unit.vector).forEach(([key,value])=>{const result=value*(power===null?1:power);if(Math.abs(result)>1e-10)vector[key]=result;});
   return numberResult({exact:"",vector,opaque:args[0].unit.opaque,symbols:{...(args[0].unit.symbols||{})}});
  }
  if(["log","ln","exp","sin","cos","tan","asin","acos","atan"].includes(name)){
   if(Object.keys(args[0].unit.vector).length)throw new Error(name+"() requires a dimensionless input.");
   return numberResult(unitDescriptor(""));
  }
  throw new Error("Unsupported v2 formula function: "+name+".");
 };
 return infer(ast);
}
function evaluateV2Expression(ast,values,groupValues,rowContext=null){
 const groups=groupValues&&typeof groupValues==="object"?groupValues:{};
 if(ast.type==="number"||ast.type==="boolean"||ast.type==="string")return ast.value;
 if(ast.type==="variable")return values[ast.name];
 if(ast.type==="group")return Array.isArray(groups[ast.name])?groups[ast.name]:[];
 if(ast.type==="groupField"){
  if(rowContext&&rowContext.group===ast.group)return rowContext.row?.[ast.field];
  const rows=Array.isArray(groups[ast.group])?groups[ast.group]:[];
  return rows.map(row=>row?.[ast.field]);
 }
 if(ast.type==="unary"){
  const value=evaluateV2Expression(ast.value,values,groups,rowContext);
  if(typeof value!=="number")throw new Error("Unary numeric operators require a number.");
  return ast.op==="-"?-value:value;
 }
 if(ast.type==="binary"){
  const left=evaluateV2Expression(ast.left,values,groups,rowContext),right=evaluateV2Expression(ast.right,values,groups,rowContext);
  if(typeof left!=="number"||typeof right!=="number")throw new Error("Arithmetic operators require numeric values.");
  if(ast.op==="+")return left+right;
  if(ast.op==="-")return left-right;
  if(ast.op==="*")return left*right;
  if(ast.op==="/"){if(right===0)throw new Error("A formula divides by zero.");return left/right;}
  return Math.pow(left,right);
 }
 const name=ast.name;
 if(name==="if"){
  const condition=evaluateV2Expression(ast.args[0],values,groups,rowContext);
  if(typeof condition!=="boolean")throw new Error("if() condition must be boolean.");
  return evaluateV2Expression(ast.args[condition?1:2],values,groups,rowContext);
 }
 if(name==="and"){
  for(const argument of ast.args){if(evaluateV2Expression(argument,values,groups,rowContext)!==true)return false;}
  return true;
 }
 if(name==="or"){
  for(const argument of ast.args){if(evaluateV2Expression(argument,values,groups,rowContext)===true)return true;}
  return false;
 }
 if(name==="not")return !evaluateV2Expression(ast.args[0],values,groups,rowContext);
 if(["eq","neq","gt","gte","lt","lte"].includes(name)){
  const left=evaluateV2Expression(ast.args[0],values,groups,rowContext),right=evaluateV2Expression(ast.args[1],values,groups,rowContext);
  if(name==="eq")return left===right;
  if(name==="neq")return left!==right;
  if(name==="gt")return left>right;
  if(name==="gte")return left>=right;
  if(name==="lt")return left<right;
  return left<=right;
 }
 if(name==="date_diff_days"){
  const start=evaluateV2Expression(ast.args[0],values,groups,rowContext),end=evaluateV2Expression(ast.args[1],values,groups,rowContext);
  return calendarDayNumber(end)-calendarDayNumber(start);
 }
 if(name==="add_days"||name==="add_months"){
  const date=evaluateV2Expression(ast.args[0],values,groups,rowContext),offset=evaluateV2Expression(ast.args[1],values,groups,rowContext);
  if(!Number.isInteger(offset))throw new Error(name+"() offset must be a whole number.");
  const parts=dateParts(date);
  if(name==="add_days"){
   const target=calendarDayNumber(date)+offset,dateObject=new Date(target*86400000);
   dateObject.setTime(target*86400000);
   const year=dateObject.getUTCFullYear(),month=dateObject.getUTCMonth()+1,day=dateObject.getUTCDate();
   return formatCalendarDate(year,month,day);
  }
  const totalMonths=parts.year*12+(parts.month-1)+offset;
  const year=Math.floor(totalMonths/12),month=totalMonths-year*12+1;
  return formatCalendarDate(year,month,Math.min(parts.day,daysInCalendarMonth(year,month)));
 }
 if(name==="days_in_month"){
  const parts=dateParts(evaluateV2Expression(ast.args[0],values,groups,rowContext));
  return daysInCalendarMonth(parts.year,parts.month);
 }
 if(name==="calendar_year")return dateParts(evaluateV2Expression(ast.args[0],values,groups,rowContext)).year;
 if(name==="calendar_month")return dateParts(evaluateV2Expression(ast.args[0],values,groups,rowContext)).month;
 if(name==="weekday"){
  const date=evaluateV2Expression(ast.args[0],values,groups,rowContext),dayNumber=calendarDayNumber(date);
  const jsDay=((dayNumber+4)%7+7)%7;
  return jsDay===0?7:jsDay;
 }
 if(["median","variance","stddev","percentile","weighted_avg"].includes(name)){
  const refs=typedFormulaGroupReferences(ast.args[0]),groupName=[...new Set(refs.map(item=>item.group))][0],rows=Array.isArray(groups[groupName])?groups[groupName]:[];
  const valuesForRows=rows.map(row=>evaluateV2Expression(ast.args[0],values,groups,{group:groupName,row}));
  if(!valuesForRows.length)return 0;
  if(name==="weighted_avg"){
   let weighted=0,totalWeight=0;
   rows.forEach(row=>{const value=evaluateV2Expression(ast.args[0],values,groups,{group:groupName,row});const weight=evaluateV2Expression(ast.args[1],values,groups,{group:groupName,row});if(weight<0)throw new Error("weighted_avg() weights cannot be negative.");weighted+=value*weight;totalWeight+=weight;});
   if(totalWeight===0)throw new Error("weighted_avg() requires a positive total weight.");
   return weighted/totalWeight;
  }
  const sorted=[...valuesForRows].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  if(name==="median")return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  if(name==="percentile"){
   const percentile=evaluateV2Expression(ast.args[1],values,groups,rowContext),position=(sorted.length-1)*percentile/100,lower=Math.floor(position),upper=Math.ceil(position);
   return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
  }
  const mean=valuesForRows.reduce((sum,value)=>sum+value,0)/valuesForRows.length;
  const variance=valuesForRows.reduce((sum,value)=>sum+(value-mean)**2,0)/valuesForRows.length;
  return name==="variance"?variance:Math.sqrt(variance);
 }
 if(["compound_interest","present_value","loan_payment"].includes(name)){
  const amount=evaluateV2Expression(ast.args[0],values,groups,rowContext),rate=evaluateV2Expression(ast.args[1],values,groups,rowContext),periods=evaluateV2Expression(ast.args[2],values,groups,rowContext);
  if(rate<=-1||periods<=0||(name==="loan_payment"&&rate<0))throw new Error(name==="loan_payment"?"loan_payment() requires a non-negative rate and a positive period count.":name+"() requires a rate greater than -100% and a positive period count.");
  if(name==="compound_interest")return amount*Math.pow(1+rate,periods);
  if(name==="present_value")return amount/Math.pow(1+rate,periods);
  return rate===0?amount/periods:amount*rate/(1-Math.pow(1+rate,-periods));
 }
 if(name==="count"){
  const group=evaluateV2Expression(ast.args[0],values,groups,rowContext);
  if(!Array.isArray(group))throw new Error("count() requires a dynamic group.");
  return group.length;
 }
 if(name==="count_if"||name==="sum_if"){
  const refs=typedFormulaGroupReferences(name==="count_if"?ast.args[0]:ast.args[1]);
  const groupName=[...new Set(refs.map(item=>item.group))][0],rows=Array.isArray(groups[groupName])?groups[groupName]:[];
  if(name==="count_if"){
   let count=0;rows.forEach(row=>{if(evaluateV2Expression(ast.args[0],values,groups,{group:groupName,row})===true)count++;});
   return count;
  }
  let total=0;rows.forEach(row=>{
   if(evaluateV2Expression(ast.args[1],values,groups,{group:groupName,row})===true){
    total+=evaluateV2Expression(ast.args[0],values,groups,{group:groupName,row});
   }
  });
  return total;
 }
 if(name==="sum"){
  const refs=typedFormulaGroupReferences(ast.args[0]),groupName=[...new Set(refs.map(item=>item.group))][0],rows=Array.isArray(groups[groupName])?groups[groupName]:[];
  return rows.reduce((total,row)=>total+evaluateV2Expression(ast.args[0],values,groups,{group:groupName,row}),0);
 }
 const args=ast.args.map(argument=>evaluateV2Expression(argument,values,groups,rowContext));
 let result;
 if(name==="min")result=args.length===1&&Array.isArray(args[0])?Math.min(...args[0]):Math.min(...args);
 else if(name==="max")result=args.length===1&&Array.isArray(args[0])?Math.max(...args[0]):Math.max(...args);
 else if(name==="avg")result=args.length===1&&Array.isArray(args[0])?(args[0].length?args[0].reduce((sum,value)=>sum+value,0)/args[0].length:0):args.reduce((sum,value)=>sum+value,0)/args.length;
 else if(name==="abs")result=Math.abs(args[0]);
 else if(name==="round")result=args.length===1?Math.round(args[0]):Number(args[0].toFixed(Math.max(0,Math.min(8,Math.floor(args[1])))));
 else if(name==="floor")result=Math.floor(args[0]);
 else if(name==="ceil")result=Math.ceil(args[0]);
 else if(name==="trunc")result=Math.trunc(args[0]);
 else if(name==="sign")result=Math.sign(args[0]);
 else if(name==="clamp"){if(args[1]>args[2])throw new Error("Clamp minimum cannot be greater than its maximum.");result=Math.min(args[2],Math.max(args[1],args[0]));}
 else if(name==="mod"){if(args[1]===0)throw new Error("A formula cannot calculate a remainder by zero.");result=args[0]%args[1];}
 else if(name==="hypot")result=Math.hypot(...args);
 else if(name==="sqrt"){if(args[0]<0)throw new Error("Square root is invalid for these values.");result=Math.sqrt(args[0]);}
 else if(name==="pow")result=Math.pow(args[0],args[1]);
 else if(name==="log")result=args.length===1?Math.log10(args[0]):Math.log(args[0])/Math.log(args[1]);
 else if(name==="ln")result=Math.log(args[0]);
 else if(name==="exp")result=Math.exp(args[0]);
 else if(name==="sin")result=Math.sin(args[0]);
 else if(name==="cos")result=Math.cos(args[0]);
 else if(name==="tan")result=Math.tan(args[0]);
 else if(name==="asin")result=Math.asin(args[0]);
 else if(name==="acos")result=Math.acos(args[0]);
 else if(name==="atan")result=Math.atan(args[0]);
 else throw new Error("Unsupported v2 formula function: "+name+".");
 if(!Number.isFinite(result))throw new Error("The calculator produced an invalid numeric result.");
 return result;
}
function validateV2FormulaResults(spec){
 const errors=[],symbols=new Map(),groups=new Map((spec.groups||[]).map(group=>[group.key,group]));
 (spec.inputs||[]).forEach(input=>{
  symbols.set(input.key,input.type==="number"?{type:"number",unit:unitDescriptor(input.unit||"")}:
   input.type==="enum"?{type:"enum",choices:input.choices||[]}:{type:input.type});
 });
 const results=[];
 (spec.results||[]).forEach((result,index)=>{
  const label=String(result.label||"Result "+(index+1));
  try{
   const ast=compileV2Expression(result.expression,symbols,groups);
   const inferred=inferV2Expression(ast,symbols,groups);
   if(inferred.type!=="number")throw new Error("Result formulas must return a number. Use typed booleans, enums and dates inside comparisons and if() expressions.");
   validateFormulaResultUnit(result,inferred.unit);
   results.push({ast,inferred});
   if(result.key)symbols.set(result.key,{type:"number",unit:inferred.unit});
  }catch(error){errors.push(label+" formula: "+String(error?.message||"could not be validated."));}
 });
 const values=createDefaultTypedValues(spec).values;
 const groupDefaults=createDefaultTypedGroupValues(spec).groups;
 if(!Object.keys(values).length)errors.push("A v2 calculator needs at least one valid default input.");
 const evaluateSet=(baseValues,groupValues,label)=>{
  const evaluatedValues={...baseValues};
  results.forEach((compiled,index)=>{
   try{
    const value=evaluateV2Expression(compiled.ast,evaluatedValues,groupValues);
    if(typeof value!=="number"||!Number.isFinite(value))throw new Error("A result must produce one finite number.");
    const resultKey=spec.results[index]?.key;
    if(resultKey)evaluatedValues[resultKey]=value;
   }catch(error){errors.push((label?label+": ":"")+String(spec.results[index]?.label||"Result "+(index+1))+": "+String(error?.message||"could not be evaluated."));}
  });
 };
 evaluateSet(values,groupDefaults,"Default values");
 (spec.scenarios||[]).forEach(scenario=>{
  if(isRecord(scenario?.values))evaluateSet({...values,...scenario.values},groupDefaults,"Scenario "+String(scenario.label||""));
 });
 return {errors:[...new Set(errors)],compiled:results};
}


function evaluateV2TypedResults(spec,rawValues,rawGroups){
 const validation=validateV2TypedSpec(spec);
 if(validation.errors.length)throw new Error(validation.errors[0]);
 const defaults=createDefaultTypedValues(spec);
 const values={...defaults.values};
 const sourceValues=rawValues===undefined||rawValues===null?{}:rawValues;
 if(!isRecord(sourceValues))throw new Error("Calculator input values must be an object.");
 const definitions=new Map((spec.inputs||[]).map(input=>[input.key,input]));
 Object.keys(sourceValues).forEach(key=>{if(!definitions.has(key))throw new Error("Unknown calculator input: "+key+".");});
 Object.entries(sourceValues).forEach(([key,value])=>{
  const definition=definitions.get(key);
  if(definition.type==="number"&&typeof value!=="number")throw new Error(key+" must use a JSON number value.");
  const normalized=normalizeTypedValue(definition,value);
  if(!normalized.valid)throw new Error(String(definition.label||key)+": "+normalized.error);
  values[key]=normalized.value;
 });
 const groupsResult=normalizeTypedGroupValues(spec,rawGroups===undefined?createDefaultTypedGroupValues(spec).groups:rawGroups);
 if(!groupsResult.valid)throw new Error(groupsResult.errors[0]);
 const compiled=validateV2FormulaResults(spec);
 if(compiled.errors.length)throw new Error(compiled.errors[0]);
 const evaluatedValues={...values},results=[];
 compiled.compiled.forEach((entry,index)=>{
  const value=evaluateV2Expression(entry.ast,evaluatedValues,groupsResult.groups);
  if(typeof value!=="number"||!Number.isFinite(value))throw new Error("Result "+(index+1)+" must produce one finite number.");
  const item=spec.results[index];
  results.push({key:String(item.key||""),label:item.label,value,format:item.format||"number",unit:entry.inferred.unit});
  if(item.key)evaluatedValues[item.key]=value;
 });
 return {results,values,groups:groupsResult.groups};
}

function validateV2TypedSpec(spec){
 const errors=[];
 const add=message=>errors.push(message);
 const allowed=(value,keys,label)=>{
  if(!isRecord(value)){add(label+" must be an object.");return;}
  const unexpected=Object.keys(value).filter(key=>!keys.has(key));
  if(unexpected.length)add(label+" contains unsupported properties: "+unexpected.join(", ")+".");
 };
 allowed(spec,new Set(["schemaVersion","engineVersion","inputs","groups","results","scenarios"]),"Calculator definition");
 if(spec.schemaVersion!==2||spec.engineVersion!==2)add("V2 definitions must declare schemaVersion 2 and engineVersion 2.");
 const inputs=Array.isArray(spec.inputs)?spec.inputs:[];
 const groups=Array.isArray(spec.groups)?spec.groups:[];
 const results=Array.isArray(spec.results)?spec.results:[];
 const scenarios=Array.isArray(spec.scenarios)?spec.scenarios:[];
 if(!Array.isArray(spec.inputs)||inputs.length<1||inputs.length>24)add("A v2 calculator needs 1–24 fixed inputs.");
 if(!Array.isArray(spec.groups)||groups.length>4)add("A v2 calculator can define up to 4 dynamic groups.");
 if(!Array.isArray(spec.results)||results.length<1||results.length>20)add("A v2 calculator needs 1–20 results.");
 if(!Array.isArray(spec.scenarios)||scenarios.length>3)add("A v2 calculator can define up to 3 scenarios.");
 try{if(JSON.stringify(spec).length>32000)add("The calculator definition exceeds the 32,000-character limit.");}
 catch(_){add("The calculator definition cannot be serialized safely.");}
 const allKeys=new Set(),numericInputs=[],numericGroups=[],numericScenarios=[];
 const reserveKey=(key,label)=>{
  if(!validKey(key)){add(label+" must use a lowercase key beginning with a letter.");return false;}
  if(allKeys.has(key)){add(label+" uses a duplicate key.");return false;}
  allKeys.add(key);return true;
 };
 const validateChoices=(definition,kind,label)=>{
  const choices=definition.choices;
  if(!Array.isArray(choices)||choices.length<2||choices.length>12){add(label+" needs 2–12 choices.");return false;}
  const labels=new Set(),values=new Set();
  choices.forEach((choice,index)=>{
   if(!isRecord(choice)||typeof choice.label!=="string"||choice.label.trim().length<1||choice.label.length>50){
    add(label+" choice "+(index+1)+" has an invalid label.");return;
   }
   const unexpectedChoiceKeys=Object.keys(choice).filter(key=>key!=="label"&&key!=="value");
   if(unexpectedChoiceKeys.length)add(label+" choice "+(index+1)+" contains unsupported properties.");
   const normalizedLabel=choice.label.trim().toLowerCase();
   if(labels.has(normalizedLabel))add(label+" choice labels must be unique.");
   labels.add(normalizedLabel);
   if(kind==="number"){
    if(typeof choice.value!=="number"||!Number.isFinite(choice.value)||Math.abs(choice.value)>1e12)add(label+" choice "+(index+1)+" needs a finite numeric value.");
   }else if(typeof choice.value!=="string"||!choice.value.trim().length||choice.value.length>64){
    add(label+" choice "+(index+1)+" needs a non-empty string value of at most 64 characters.");
   }
   const valueKey=typeof choice.value==="string"?choice.value:String(choice.value);
   if(values.has(valueKey))add(label+" choice values must be unique.");
   values.add(valueKey);
  });
  return true;
 };
 const validateTypedDefinition=(definition,label,kind)=>{
  if(!isRecord(definition)){add(label+" must be an object.");return null;}
  const type=definition.type;
  if(!["number","boolean","enum","date"].includes(type)){add(label+" must declare type number, boolean, enum or date.");return null;}
  if(kind==="input"){
   allowed(definition,new Set(["key","label","type","min","max","default","step","unit","control","choices","minDate","maxDate"]),label);
  }else{
   allowed(definition,new Set(["key","label","type","min","max","default","step","unit","choices","minDate","maxDate"]),label);
  }
  if(typeof definition.label!=="string"||!definition.label.trim()||definition.label.length>60)add(label+" needs a label of 1–60 characters.");
  if(type==="number"){
   const min=definition.min,max=definition.max,value=definition.default,step=definition.step;
   if(![min,max,value,step].every(item=>typeof item==="number"&&Number.isFinite(item))||min>value||value>max||max-min>1e12||step<=0){
    add(label+" has invalid numeric minimum, maximum, default or step values.");
   }else{
    const defaultStep=(value-min)/step,maximumStep=(max-min)/step;
    if(Math.abs(defaultStep-Math.round(defaultStep))>1e-7)add(label+" default value does not match its step.");
    if(max>min&&Math.abs(maximumStep-Math.round(maximumStep))>1e-7)add(label+" maximum value does not match its step.");
   }
   if(typeof definition.unit!=="string"||definition.unit.length>16)add(label+" unit must be plain text of up to 16 characters.");
   if(kind==="input"&&!["number","slider","select"].includes(definition.control))add(label+" must use a number, slider or numeric select control.");
   if(kind==="input"&&definition.control==="select"){
    validateChoices(definition,"number",label);
    if(!Array.isArray(definition.choices)||!definition.choices.some(choice=>choice?.value===value))add(label+" numeric choices must include the default.");
    if(Array.isArray(definition.choices)&&[min,max,step].every(Number.isFinite))definition.choices.forEach((choice,choiceIndex)=>{
     const choiceValue=choice?.value;
     if(typeof choiceValue==="number"&&(choiceValue<min||choiceValue>max))add(label+" choice "+(choiceIndex+1)+" is outside the numeric input range.");
     if(typeof choiceValue==="number"&&step>0){const position=(choiceValue-min)/step;if(Math.abs(position-Math.round(position))>1e-7)add(label+" choice "+(choiceIndex+1)+" does not match the numeric step.");}
    });
   }else if(Array.isArray(definition.choices)&&definition.choices.length)add(label+" choices are only allowed for a numeric select control.");
   if(kind==="field"&&definition.choices!==undefined&&(!Array.isArray(definition.choices)||definition.choices.length))add(label+" choices are not supported on dynamic numeric fields.");
   if(kind==="field"&&definition.unit===undefined)add(label+" must declare its unit (use an empty string when dimensionless).");
   return {type:"number"};
  }
  if(definition.unit!==undefined&&definition.unit!=="")add(label+" non-numeric values cannot declare a measurement unit.");
  if(type==="boolean"){
   if(typeof definition.default!=="boolean")add(label+" boolean default must be true or false.");
   if(kind==="input"&&definition.control!=="toggle")add(label+" boolean inputs must use the toggle control.");
   if(kind==="field"&&definition.control!==undefined)add(label+" dynamic fields do not declare UI controls.");
   if(["min","max","step","choices","minDate","maxDate"].some(key=>definition[key]!==undefined))add(label+" boolean values cannot declare numeric ranges, choices or date bounds.");
   return {type:"boolean"};
  }
  if(type==="enum"){
   if(typeof definition.default!=="string"||!definition.default.trim().length)add(label+" enum default must be a non-empty string.");
   if(kind==="input"&&definition.control!=="select")add(label+" enum inputs must use the select control.");
   if(kind==="field"&&definition.control!==undefined)add(label+" dynamic fields do not declare UI controls.");
   if(["min","max","step","minDate","maxDate"].some(key=>definition[key]!==undefined))add(label+" enum values cannot declare numeric ranges or date bounds.");
   validateChoices(definition,"enum",label);
   if(Array.isArray(definition.choices)&&!definition.choices.some(choice=>choice?.value===definition.default))add(label+" enum choices must include the default.");
   return {type:"enum"};
  }
  if(type==="date"){
   if(!isIsoDateOnly(definition.default))add(label+" date default must be a real YYYY-MM-DD calendar date.");
   if(kind==="input"&&definition.control!=="date")add(label+" date inputs must use the date control.");
   if(kind==="field"&&definition.control!==undefined)add(label+" dynamic fields do not declare UI controls.");
   if(["min","max","step","unit","choices"].some(key=>definition[key]!==undefined&&definition[key]!==""))add(label+" date values cannot declare numeric ranges, units or choices.");
   if(definition.minDate!==undefined&&!isIsoDateOnly(definition.minDate))add(label+" minimum date must use a real YYYY-MM-DD date.");
   if(definition.maxDate!==undefined&&!isIsoDateOnly(definition.maxDate))add(label+" maximum date must use a real YYYY-MM-DD date.");
   if(isIsoDateOnly(definition.minDate)&&isIsoDateOnly(definition.maxDate)&&definition.minDate>definition.maxDate)add(label+" minimum date cannot be later than its maximum date.");
   if(isIsoDateOnly(definition.default)&&isIsoDateOnly(definition.minDate)&&definition.default<definition.minDate)add(label+" default date is earlier than its minimum.");
   if(isIsoDateOnly(definition.default)&&isIsoDateOnly(definition.maxDate)&&definition.default>definition.maxDate)add(label+" default date is later than its maximum.");
   return {type:"date"};
  }
  return null;
 };
 inputs.forEach((input,index)=>{
  const label="Input "+(index+1);
  if(!isRecord(input)){add(label+" must be an object.");return;}
  reserveKey(input.key,label+" key");
  if(typeof input.label!=="string"||!input.label.trim()||input.label.length>60)add(label+" needs a label of 1–60 characters.");
  validateTypedDefinition(input,label,"input");
  if(input.type==="number")numericInputs.push(input);
 });
 groups.forEach((group,index)=>{
  const label="Group "+(index+1);
  if(!isRecord(group)){add(label+" must be an object.");return;}
  allowed(group,new Set(["key","label","itemLabel","minItems","maxItems","fields"]),label);
  reserveKey(group.key,label+" key");
  if(typeof group.label!=="string"||!group.label.trim()||group.label.length>60)add(label+" needs a label of 1–60 characters.");
  if(typeof group.itemLabel!=="string"||!group.itemLabel.trim()||group.itemLabel.length>40)add(label+" needs an item label of 1–40 characters.");
  if(!Number.isInteger(group.minItems)||!Number.isInteger(group.maxItems)||group.minItems<1||group.maxItems>20||group.maxItems<group.minItems)add(label+" must allow between 1 and 20 rows.");
  if(!Array.isArray(group.fields)||group.fields.length<1||group.fields.length>6){add(label+" needs 1–6 typed fields.");return;}
  const numericFields=[];
  group.fields.forEach((field,fieldIndex)=>{
   const fieldLabel=label+" field "+(fieldIndex+1);
   if(!isRecord(field)){add(fieldLabel+" must be an object.");return;}
   reserveKey(field.key,fieldLabel+" key");
   validateTypedDefinition(field,fieldLabel,"field");
   if(field.type==="number")numericFields.push(field);
  });
  numericGroups.push({key:group.key,label:group.label,itemLabel:group.itemLabel,minItems:group.minItems,maxItems:group.maxItems,fields:numericFields.length?numericFields:[{
   key:"v2_internal_field_"+index,label:"Internal validation field",min:0,max:1,default:0,step:1,unit:""
  }]});
 });
 results.forEach((result,index)=>{
  const label="Result "+(index+1);
  if(!isRecord(result)){add(label+" must be an object.");return;}
  allowed(result,new Set(["key","label","expression","format","currency","unit","prefix","suffix","explanation"]),label);
  if(typeof result.label!=="string"||!result.label.trim()||result.label.length>70)add(label+" needs a label of 1–70 characters.");
  if(typeof result.expression!=="string"||!result.expression.trim()||result.expression.length>500)add(label+" needs a formula of 1–500 characters.");
  if(result.key!==undefined)reserveKey(result.key,label+" key");
  if(!["number","currency","percent","unit"].includes(result.format||"number"))add(label+" has an unsupported result format.");
  if(result.format==="unit"&&(typeof result.unit!=="string"||!result.unit.trim()||result.unit.length>20))add(label+" needs a result unit of up to 20 characters.");
  if(result.format==="currency"&&typeof result.currency!=="string")add(label+" must declare an ISO currency code.");
  if(result.explanation!==undefined&&(typeof result.explanation!=="string"||result.explanation.length>280))add(label+" explanation must be plain text of up to 280 characters.");
 });
 const scenarioLabels=new Set();
 scenarios.forEach((scenario,index)=>{
  const label="Scenario "+(index+1);
  if(!isRecord(scenario)){add(label+" must be an object.");return;}
  allowed(scenario,new Set(["label","values"]),label);
  if(typeof scenario.label!=="string"||scenario.label.trim().length<2||scenario.label.length>50)add(label+" needs a name of 2–50 characters.");
  const normalizedScenarioLabel=typeof scenario.label==="string"?scenario.label.trim().toLowerCase():"";
  if(normalizedScenarioLabel&&scenarioLabels.has(normalizedScenarioLabel))add("Scenario names must be unique.");
  scenarioLabels.add(normalizedScenarioLabel);
  if(!isRecord(scenario.values)||Object.keys(scenario.values).length===0){add(label+" needs at least one typed input override.");return;}
  const numericValues={};
  Object.entries(scenario.values).forEach(([key,value])=>{
   const definition=inputs.find(item=>item?.key===key);
   if(!definition){add(label+" references an unknown input: "+key+".");return;}
   if(definition.type==="number"&&typeof value!=="number"){add(label+" "+key+" must use a JSON number value.");return;}
   const normalized=normalizeTypedValue(definition,value);
   if(!normalized.valid){add(label+" "+key+": "+normalized.error);return;}
   if(definition.type==="number")numericValues[key]=normalized.value;
  });
  if(Object.keys(numericValues).length)numericScenarios.push({label:scenario.label,values:numericValues});
 });
 const formulaValidation=validateV2FormulaResults(spec);
 (Array.isArray(formulaValidation?.errors)?formulaValidation.errors:[]).forEach(add);
 return {errors:[...new Set(errors)]};
}
function validateVersionedSpec(spec){
 let versions;
 try{versions=resolveCalculatorVersions(spec);}
 catch(error){return {errors:[String(error?.message||"Unsupported calculator version.")]};}
 if(versions.schemaVersion===1)return validateMakerSpec(spec);
 return validateV2TypedSpec(spec);
}
function createDefaultTypedValues(spec){
 const values={},errors=[];
 (Array.isArray(spec?.inputs)?spec.inputs:[]).forEach(input=>{
  const normalized=normalizeTypedValue(input,input?.default);
  if(!normalized.valid)errors.push(String(input?.label||input?.key||"Input")+": "+normalized.error);
  else values[input.key]=normalized.value;
 });
 return {valid:errors.length===0,values,errors};
}
function createDefaultTypedGroupValues(spec){
 const groups={},errors=[];
 (Array.isArray(spec?.groups)?spec.groups:[]).forEach(group=>{
  const row=Object.fromEntries((Array.isArray(group.fields)?group.fields:[]).map(field=>{
   const normalized=normalizeTypedValue(field,field?.default);
   if(!normalized.valid)errors.push(String(group.label||group.key)+" / "+String(field.label||field.key)+": "+normalized.error);
   return [field.key,normalized.value];
  }));
  const count=Math.max(1,Math.min(20,Number(group.minItems)||1));
  groups[group.key]=Array.from({length:count},()=>({...row}));
 });
 return {valid:errors.length===0,groups,errors};
}
function normalizeTypedGroupValues(spec,rawGroups){
 const source=isRecord(rawGroups)?rawGroups:{};
 const groups={},errors=[];
 if(rawGroups!==undefined&&rawGroups!==null&&!isRecord(rawGroups))errors.push("Dynamic group values must be an object.");
 const definitions=Array.isArray(spec?.groups)?spec.groups:[];
 const known=new Set(definitions.map(group=>group.key));
 Object.keys(source).forEach(key=>{if(!known.has(key))errors.push("Unknown dynamic group: "+key+".");});
 definitions.forEach(group=>{
  const supplied=source[group.key];
  if(supplied===undefined){
   const defaults=createDefaultTypedGroupValues({groups:[group]});
   groups[group.key]=defaults.groups[group.key]||[];
   errors.push(...defaults.errors);
   return;
  }
  if(!Array.isArray(supplied)){errors.push(String(group.label||group.key)+" must contain a list of rows.");return;}
  if(supplied.length<Number(group.minItems)||supplied.length>Number(group.maxItems)){errors.push(String(group.label||group.key)+" must contain "+group.minItems+"–"+group.maxItems+" rows.");return;}
  groups[group.key]=supplied.map((row,index)=>{
   const label=String(group.label||group.key)+" row "+(index+1);
   if(!isRecord(row)){errors.push(label+" must be an object.");return {};}
   const allowedFields=new Set(group.fields.map(field=>field.key));
   Object.keys(row).forEach(key=>{if(!allowedFields.has(key))errors.push(label+" contains an unknown field: "+key+".");});
   const normalizedRow={};
   group.fields.forEach(field=>{
    const value=hasOwn(row,field.key)?row[field.key]:field.default;
    const normalized=normalizeTypedValue(field,value);
    if(!normalized.valid)errors.push(label+" / "+String(field.label||field.key)+": "+normalized.error);
    else normalizedRow[field.key]=normalized.value;
   });
   return normalizedRow;
  });
 });
 return {valid:errors.length===0,groups,errors};
}

 return Object.freeze({
  compileExpression,compileV2Expression,formulaGroupFieldReferences,formulaInputReferences,typedFormulaGroupReferences,typedFormulaInputReferences,evaluate,groupMapForSpec,defaultGroupValues,
  unitDescriptor,constantFormulaValue,analyseFormulaUnit,unitVectorKey,ensureResultCurrency,
  validateFormulaResultUnit,evaluateFormulaResults,validateMakerSpec,sameUnitDescriptor,combineUnitDescriptors,
  resolveCalculatorVersions,validateVersionedSpec,normalizeTypedValue,createDefaultTypedValues,
  createDefaultTypedGroupValues,normalizeTypedGroupValues,evaluateV2TypedResults,
  getV2FunctionHelp:()=>V2_FUNCTION_HELP.map(item=>({...item}))
 });
}
root.WorthItCalculatorEngine=Object.freeze({apiVersion:1,create});
})(typeof globalThis!=="undefined"?globalThis:this);
