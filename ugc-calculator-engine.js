/* Worth It Calculator Engine — v1 shared, deterministic and environment-neutral. */
(function(root){
"use strict";
function create(options={}){
 const CURRENCIES=Array.isArray(options.currencies)?options.currencies:[];
 const HISTORICAL_CURRENCIES=Array.isArray(options.historicalCurrencies)?options.historicalCurrencies:[];
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
  kwh:{energy:1},mwh:{energy:1},mj:{energy:1},w:{power:1},kw:{power:1},
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
 return Object.freeze({
  compileExpression,formulaGroupFieldReferences,formulaInputReferences,evaluate,groupMapForSpec,defaultGroupValues,
  unitDescriptor,constantFormulaValue,analyseFormulaUnit,unitVectorKey,ensureResultCurrency,
  validateFormulaResultUnit,evaluateFormulaResults,validateMakerSpec,sameUnitDescriptor,combineUnitDescriptors
 });
}
root.WorthItCalculatorEngine=Object.freeze({apiVersion:1,create});
})(typeof globalThis!=="undefined"?globalThis:this);
