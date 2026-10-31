const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const GROQ_MODEL = "openai/gpt-oss-120b";
const GEMINI_MODEL = "gemini-3.7-flash";
const MAX_PROMPT_CHARS = 900;
const ALLOWED_CATEGORIES = new Set(["cars","money","technology","home","other"]);
const FUNCTIONS = new Set(["min","max","abs","round","floor","ceil","sqrt","pow"]);

function json(data,status,origin){
    return new Response(JSON.stringify(data),{
        status:status||200,
        headers:{
            "Content-Type":"application/json; charset=utf-8",
            "Cache-Control":"no-store",
            "Access-Control-Allow-Origin":origin||SITE_ORIGIN,
            "Access-Control-Allow-Headers":"Content-Type, Authorization",
            "Access-Control-Allow-Methods":"POST, OPTIONS",
            "Vary":"Origin"
        }
    });
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
async function reserveMakerGeneration(env,token){
    const base=String(env.SUPABASE_URL||"").trim().replace(/\/$/,"");
    const key=String(env.SUPABASE_PUBLISHABLE_KEY||"").trim();
    if(!base||!key)throw new Error("The account service is not configured.");
    const response=await fetch(base+"/rest/v1/rpc/reserve_worth_it_ugc_maker_generation",{
        method:"POST",
        headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
        body:"{}",
        cache:"no-store"
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data||typeof data!=="object")throw new Error("The AI calculator usage limit could not be checked.");
    return data;
}
async function generateWithGemini(apiKey,system,prompt){
    const response=await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(GEMINI_MODEL)+":generateContent",
        {
            method:"POST",
            headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
            body:JSON.stringify({
                systemInstruction:{parts:[{text:system}]},
                contents:[{role:"user",parts:[{text:prompt}]}],
                generationConfig:{temperature:0.15,maxOutputTokens:1300,responseMimeType:"application/json"}
            })
        }
    );
    if(!response.ok){
        const details=await response.text().catch(()=>"");
        throw new Error("Gemini calculator generation failed ("+response.status+"): "+details.slice(0,240));
    }
    const data=await response.json();
    const content=data?.candidates?.[0]?.content?.parts?.map(part=>typeof part?.text==="string"?part.text:"").join("").trim();
    if(!content)throw new Error("Gemini returned an empty calculator definition.");
    return content;
}
async function generateWithGroq(apiKey,system,prompt){
    const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
        body:JSON.stringify({
            model:GROQ_MODEL,
            temperature:0.15,
            max_tokens:1300,
            response_format:{type:"json_object"},
            messages:[{role:"system",content:system},{role:"user",content:prompt}]
        })
    });
    if(!response.ok){
        const details=await response.text().catch(()=>"");
        throw new Error("Groq calculator generation failed ("+response.status+"): "+details.slice(0,240));
    }
    const data=await response.json();
    const content=data?.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim())throw new Error("Groq returned an empty calculator definition.");
    return content.trim();
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

/* A tiny expression parser: generated formulas are data, never executable JavaScript. */
function compileExpression(source,keys){
    const input=String(source||"");
    let at=0;
    const fail=()=>{throw new Error("The AI returned an unsupported or invalid formula.");};
    const ws=()=>{while(/\s/.test(input[at]||"")&&at<input.length)at++;};
    const take=(value)=>{ws();if(input.slice(at,at+value.length)===value){at+=value.length;return true;}return false;};
    const identifier=()=>{
        ws();const match=input.slice(at).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        if(!match)return null;at+=match[0].length;return match[0];
    };
    function primary(){
        ws();
        if(take("(")){const node=add();if(!take(")"))fail();return node;}
        const rest=input.slice(at);
        const number=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
        if(number){at+=number[0].length;const value=Number(number[0]);if(!Number.isFinite(value))fail();return {type:"number",value};}
        const name=identifier();
        if(!name)fail();
        if(take("(")){
            if(!FUNCTIONS.has(name))fail();
            const args=[];
            if(!take(")")){
                do{args.push(add());}while(take(","));
                if(!take(")"))fail();
            }
            const valid=(name==="min"||name==="max")?args.length>=1:
                name==="pow"?args.length===2:
                name==="round"?args.length>=1&&args.length<=2:args.length===1;
            if(!valid)fail();
            return {type:"call",name,args};
        }
        if(name==="pi")return {type:"number",value:Math.PI};
        if(name==="e")return {type:"number",value:Math.E};
        if(!keys.has(name))fail();
        return {type:"variable",name};
    }
    function power(){
        let left=primary();
        if(take("^"))left={type:"binary",op:"^",left,right:unary()};
        return left;
    }
    function unary(){
        if(take("+"))return {type:"unary",op:"+",value:unary()};
        if(take("-"))return {type:"unary",op:"-",value:unary()};
        return power();
    }
    function multiply(){
        let node=unary();
        while(true){
            if(take("*"))node={type:"binary",op:"*",left:node,right:unary()};
            else if(take("/"))node={type:"binary",op:"/",left:node,right:unary()};
            else return node;
        }
    }
    function add(){
        let node=multiply();
        while(true){
            if(take("+"))node={type:"binary",op:"+",left:node,right:multiply()};
            else if(take("-"))node={type:"binary",op:"-",left:node,right:multiply()};
            else return node;
        }
    }
    const ast=add();ws();if(at!==input.length)fail();return ast;
}
function evaluate(node,values){
    let result;
    if(node.type==="number")return node.value;
    if(node.type==="variable")return Number(values[node.name]);
    if(node.type==="unary"){const value=evaluate(node.value,values);return node.op==="-"?-value:value;}
    if(node.type==="binary"){
        const a=evaluate(node.left,values),b=evaluate(node.right,values);
        if(node.op==="+")result=a+b;
        else if(node.op==="-")result=a-b;
        else if(node.op==="*")result=a*b;
        else if(node.op==="/"){if(b===0)throw new Error("A formula divides by zero for its default values.");result=a/b;}
        else result=Math.pow(a,b);
        return result;
    }
    const args=node.args.map(arg=>evaluate(arg,values));
    if(node.name==="min")result=Math.min(...args);
    else if(node.name==="max")result=Math.max(...args);
    else if(node.name==="abs")result=Math.abs(args[0]);
    else if(node.name==="round")result=args.length===1?Math.round(args[0]):Number(args[0].toFixed(Math.max(0,Math.min(8,Math.floor(args[1])))));
    else if(node.name==="floor")result=Math.floor(args[0]);
    else if(node.name==="ceil")result=Math.ceil(args[0]);
    else if(node.name==="sqrt"){if(args[0]<0)throw new Error("Square root is invalid for the default values.");result=Math.sqrt(args[0]);}
    else if(node.name==="pow")result=Math.pow(args[0],args[1]);
    if(!Number.isFinite(result))throw new Error("A generated formula produces an invalid result.");return result;
}
function normalizeDefinition(raw){
    const title=String(raw?.title||"").trim().slice(0,70);
    const description=String(raw?.description||"").trim().slice(0,500);
    const category=String(raw?.category||"other").toLowerCase();
    if(title.length<3||!ALLOWED_CATEGORIES.has(category))throw new Error("The generated calculator details are incomplete.");
    if(!Array.isArray(raw?.inputs)||raw.inputs.length<1||raw.inputs.length>12)throw new Error("A calculator must have between 1 and 12 inputs.");
    if(!Array.isArray(raw?.results)||raw.results.length<1||raw.results.length>6)throw new Error("A calculator must have between 1 and 6 results.");
    const seen=new Set();
    const inputs=raw.inputs.map((item)=>{
        const key=String(item?.key||"").trim().toLowerCase();
        const label=String(item?.label||"").trim().slice(0,60);
        const min=Number(item?.min),max=Number(item?.max),value=Number(item?.default);
        const step=Number(item?.step??1);
        if(!/^[a-z][a-z0-9_]{0,31}$/.test(key)||seen.has(key)||!label||
            !Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(value)||
            min>value||value>max||max-min>1e12||!Number.isFinite(step)||step<=0)throw new Error("The AI generated an invalid input field.");
        seen.add(key);
        return {key,label,min,max,default:value,step,unit:String(item?.unit||"").trim().slice(0,16)};
    });
    const values=Object.fromEntries(inputs.map(item=>[item.key,item.default]));
    const results=raw.results.map((item)=>{
        const label=String(item?.label||"").trim().slice(0,70);
        const expression=String(item?.expression||"").trim().slice(0,260);
        const format=["number","currency","percent"].includes(item?.format)?item.format:"number";
        const currency=String(item?.currency||"EUR").toUpperCase();
        if(!label||!expression||!/^([A-Z]{3})$/.test(currency))throw new Error("The AI generated an invalid result.");
        const ast=compileExpression(expression,seen);
        evaluate(ast,values);
        return {label,expression,format,currency,prefix:String(item?.prefix||"").slice(0,12),suffix:String(item?.suffix||"").slice(0,16)};
    });
    return {version:1,inputs,results};
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
export async function onRequestPost(context){
    const request=context.request,env=context.env,origin=allowedOrigin(request);
    if(!origin)return json({success:false,error:"Forbidden origin."},403,SITE_ORIGIN);
    const token=tokenFrom(request);
    if(!token)return json({success:false,code:"AUTH_REQUIRED",error:"Sign in to create a community calculator."},401,origin);
    try{
        const user=await verifyUser(env,token);
        if(!user)return json({success:false,code:"AUTH_REQUIRED",error:"Your session has expired. Please sign in again."},401,origin);
        if(!user.email_confirmed_at&&!user.confirmed_at)return json({success:false,code:"EMAIL_VERIFICATION_REQUIRED",error:"Verify your email before creating or publishing community calculators."},403,origin);
        let body;
        try{body=await request.json();}catch(_){return json({success:false,error:"A valid JSON request is required."},400,origin);}
        const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
        if(!prompt||prompt.length>MAX_PROMPT_CHARS)return json({success:false,error:"Describe the calculator in 1 to 900 characters."},400,origin);
        const geminiKey=String(env.GEMINI_API_KEY||"").trim();
        const groqKey=String(env.GROQ_API_KEY||"").trim();
        if(!geminiKey&&!groqKey)return json({success:false,code:"AI_PROVIDER_UNAVAILABLE",error:"The AI calculator maker is temporarily unavailable."},503,origin);
        let usage;
        try{usage=await reserveMakerGeneration(env,token);}
        catch(error){
            console.error("UGC maker usage reservation failed:",error);
            return json({success:false,code:"USAGE_LIMIT_UNAVAILABLE",error:"The AI calculator usage limit is temporarily unavailable. Please try again later."},503,origin);
        }
        if(usage?.ok!==true){
            if(usage?.code==="DAILY_LIMIT")return json({success:false,code:"DAILY_AI_LIMIT",error:"You have reached the daily AI calculator limit of 10 generations. Try again after the UTC daily reset.",daily_limit:10,requests_used:10},429,origin);
            return json({success:false,code:"USAGE_LIMIT_UNAVAILABLE",error:"The AI calculator usage limit is temporarily unavailable. Please try again later."},503,origin);
        }
        const system=[
            "You design calculator definitions for the Worth It website.",
            "Return only one valid JSON object with keys title, description, category, inputs, results.",
            "Never return HTML, Markdown, JavaScript, SQL, code, scripts, event handlers, URLs or executable content.",
            "The result is a declarative calculator schema only. Formula expressions are evaluated by a restricted arithmetic parser.",
            "Allowed categories: cars, money, technology, home, other.",
            "Create 2 to 8 useful number inputs where possible (minimum 1, maximum 12). Each input has key, label, min, max, default, step, unit.",
            "Keys must match ^[a-z][a-z0-9_]{0,31}$ and be unique. All numeric values must be finite and min <= default <= max.",
            "Create 1 to 4 result rows (maximum 6), each with label, expression, format, currency, prefix, suffix.",
            "Expressions may use only input keys, decimal numbers, + - * / ^, parentheses, comma, and functions min,max,abs,round,floor,ceil,sqrt,pow; constants pi and e are allowed.",
            "Do not use assignment, comparisons, strings, arrays, object syntax, property access, or any other function.",
            "Choose sensible defaults and bounded input ranges. Use clear labels, short units and realistic example values.",
            "For percent values, express percentages in their ordinary human scale (e.g. 5 means 5 percent) and divide by 100 in the formula.",
            "For currency outputs, set format to currency and choose a sensible ISO 4217 currency code. If the user does not name one, use EUR.",
            "Keep title within 70 characters and description within 500 characters."
        ].join(" ");
        let content="";
        if(geminiKey){
            try{content=await generateWithGemini(geminiKey,system,prompt);}
            catch(error){console.warn("Gemini UGC calculator generation failed:",error);}
        }
        if(!content&&groqKey){
            try{content=await generateWithGroq(groqKey,system,prompt);}
            catch(error){console.error("Groq UGC calculator generation failed:",error);}
        }
        if(!content){
            return json({success:false,code:"AI_PROVIDER_UNAVAILABLE",error:"The AI could not generate this calculator right now. Please try again."},503,origin);
        }
        let parsed;
        try{parsed=JSON.parse(content);}catch(_){return json({success:false,error:"The AI returned an invalid calculator definition. Please adjust your description and try again."},502,origin);}
        let definition;
        try{definition=normalizeDefinition(parsed);}catch(error){return json({success:false,error:error?.message||"The AI returned an invalid calculator definition."},422,origin);}
        return json({success:true,calculator:{
            title:String(parsed.title).trim().slice(0,70),
            description:String(parsed.description||"").trim().slice(0,500),
            category:String(parsed.category).toLowerCase(),
            spec:definition
        }},200,origin);
    }catch(error){
        console.error("UGC calculator generation failed:",error);
        return json({success:false,error:"The AI calculator maker is temporarily unavailable."},503,origin);
    }
}
