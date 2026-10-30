const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const COOKIE_NAME = "__Host-worthit_guest_calc";
const DAILY_MILLI = 500;
const SPEND_MILLI = 100;
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
let schemaReady = false;
let schemaPromise = null;

function json(data,status,origin,cookie){
    const headers = new Headers({
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store, max-age=0",
        "Pragma":"no-cache",
        "Vary":"Cookie, Origin",
        "Access-Control-Allow-Origin":origin,
        "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type",
        "Access-Control-Allow-Credentials":"true"
    });
    if(cookie) headers.append("Set-Cookie",cookie);
    return new Response(JSON.stringify(data),{status:status||200,headers});
}

function safeOrigin(request){
    const requestOrigin = new URL(request.url).origin;
    const origin = request.headers.get("Origin") || requestOrigin;
    return origin === requestOrigin ? origin : "";
}

function cookieValue(request){
    const header = request.headers.get("Cookie") || "";
    for(const part of header.split(";")){
        const index = part.indexOf("=");
        if(index < 0) continue;
        if(part.slice(0,index).trim() !== COOKIE_NAME) continue;
        const value = part.slice(index+1).trim();
        return /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : "";
    }
    return "";
}

function newSessionToken(){
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function hashSession(token){
    const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
}

function sessionCookie(token){
    return COOKIE_NAME + "=" + token + "; Path=/; Max-Age=" + COOKIE_MAX_AGE + "; Secure; HttpOnly; SameSite=Lax";
}

async function ensureSchema(db){
    if(schemaReady) return;
    if(!schemaPromise){
        schemaPromise = (async()=>{
            await db.prepare(
                "CREATE TABLE IF NOT EXISTS worth_it_guest_calc_wallets ("+
                "session_hash TEXT PRIMARY KEY, reward_date TEXT NOT NULL, "+
                "balance_milli INTEGER NOT NULL DEFAULT 500 CHECK(balance_milli BETWEEN 0 AND 500), "+
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
            ).run();
            await db.prepare(
                "CREATE TABLE IF NOT EXISTS worth_it_guest_calc_transactions ("+
                "session_hash TEXT NOT NULL, request_id TEXT NOT NULL, "+
                "status TEXT NOT NULL CHECK(status IN ('reserved','completed','refunded')), "+
                "amount_milli INTEGER NOT NULL DEFAULT 100, claim_token TEXT NOT NULL, "+
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, "+
                "PRIMARY KEY(session_hash,request_id))"
            ).run();
            await db.prepare(
                "CREATE INDEX IF NOT EXISTS worth_it_guest_calc_transactions_created_idx "+
                "ON worth_it_guest_calc_transactions(created_at)"
            ).run();
            schemaReady = true;
        })().catch(error=>{
            schemaPromise = null;
            throw error;
        });
    }
    await schemaPromise;
}

function utcDay(){
    return new Date().toISOString().slice(0,10);
}

async function loadWallet(db,sessionHash){
    const now = new Date().toISOString();
    const day = utcDay();
    await db.prepare(
        "INSERT INTO worth_it_guest_calc_wallets "+
        "(session_hash,reward_date,balance_milli,created_at,updated_at) VALUES (?,?,500,?,?) "+
        "ON CONFLICT(session_hash) DO UPDATE SET "+
        "reward_date=excluded.reward_date,balance_milli=500,updated_at=excluded.updated_at "+
        "WHERE worth_it_guest_calc_wallets.reward_date <> excluded.reward_date"
    ).bind(sessionHash,day,now,now).run();

    const staleBefore = new Date(Date.now()-30*60*1000).toISOString();
    await db.batch([
        db.prepare(
            "UPDATE worth_it_guest_calc_wallets SET "+
            "balance_milli=MIN(500,balance_milli+COALESCE(("+
            "SELECT SUM(amount_milli) FROM worth_it_guest_calc_transactions "+
            "WHERE session_hash=? AND status='reserved' AND created_at < ?),0)),"+
            "updated_at=? WHERE session_hash=? AND EXISTS ("+
            "SELECT 1 FROM worth_it_guest_calc_transactions "+
            "WHERE session_hash=? AND status='reserved' AND created_at < ?)"
        ).bind(sessionHash,staleBefore,now,sessionHash,sessionHash,staleBefore),
        db.prepare(
            "UPDATE worth_it_guest_calc_transactions SET status='refunded',updated_at=? "+
            "WHERE session_hash=? AND status='reserved' AND created_at < ?"
        ).bind(now,sessionHash,staleBefore),
        db.prepare(
            "DELETE FROM worth_it_guest_calc_transactions WHERE session_hash=? AND created_at < datetime('now','-7 days')"
        ).bind(sessionHash),
        db.prepare(
            "DELETE FROM worth_it_guest_calc_wallets WHERE updated_at < datetime('now','-400 days')"
        )
    ]);

    const wallet = await db.prepare(
        "SELECT balance_milli,reward_date FROM worth_it_guest_calc_wallets WHERE session_hash=?"
    ).bind(sessionHash).first();
    if(!wallet) throw new Error("Guest CALC wallet could not be created.");
    return {
        balance_milli:Number(wallet.balance_milli)||0,
        balance:(Number(wallet.balance_milli)||0)/1000,
        daily_reward:0.5,
        is_guest:true,
        premium_plan:"guest_lite",
        reward_date:wallet.reward_date
    };
}

async function readTransaction(db,sessionHash,requestId){
    return db.prepare(
        "SELECT status,amount_milli,claim_token,created_at FROM worth_it_guest_calc_transactions "+
        "WHERE session_hash=? AND request_id=?"
    ).bind(sessionHash,requestId).first();
}

async function reserve(db,sessionHash,requestId){
    const now = new Date().toISOString();
    const claimToken = newSessionToken();
    await db.batch([
        db.prepare(
            "INSERT OR IGNORE INTO worth_it_guest_calc_transactions "+
            "(session_hash,request_id,status,amount_milli,claim_token,created_at,updated_at) "+
            "SELECT ?,?,'reserved',100,?,?,? FROM worth_it_guest_calc_wallets "+
            "WHERE session_hash=? AND reward_date=? AND balance_milli>=100"
        ).bind(sessionHash,requestId,claimToken,now,now,sessionHash,utcDay()),
        db.prepare(
            "UPDATE worth_it_guest_calc_wallets SET balance_milli=balance_milli-100,updated_at=? "+
            "WHERE session_hash=? AND reward_date=? AND EXISTS ("+
            "SELECT 1 FROM worth_it_guest_calc_transactions "+
            "WHERE session_hash=? AND request_id=? AND status='reserved' AND claim_token=?)"
        ).bind(now,sessionHash,utcDay(),sessionHash,requestId,claimToken)
    ]);

    const tx = await readTransaction(db,sessionHash,requestId);
    const wallet = await db.prepare(
        "SELECT balance_milli FROM worth_it_guest_calc_wallets WHERE session_hash=?"
    ).bind(sessionHash).first();
    const balance = Number(wallet?.balance_milli)||0;

    if(!tx){
        return balance < SPEND_MILLI
            ? {ok:false,code:"INSUFFICIENT_CALC",balance,balance_milli:balance}
            : {ok:false,code:"RESERVATION_FAILED",balance,balance_milli:balance};
    }
    if(tx.status === "reserved" || tx.status === "completed"){
        return {ok:true,reserved:true,duplicate:tx.claim_token !== claimToken,status:tx.status,balance:balance/1000,balance_milli:balance};
    }
    return {ok:false,code:"REQUEST_ALREADY_REFUNDED",balance:balance/1000,balance_milli:balance};
}

async function settle(db,sessionHash,requestId){
    await db.prepare(
        "UPDATE worth_it_guest_calc_transactions SET status='completed',updated_at=? "+
        "WHERE session_hash=? AND request_id=? AND status='reserved'"
    ).bind(new Date().toISOString(),sessionHash,requestId).run();
    const tx = await readTransaction(db,sessionHash,requestId);
    return tx?.status === "completed"
        ? {ok:true,status:"completed"}
        : {ok:false,code:tx?.status === "refunded" ? "ALREADY_REFUNDED" : "RESERVATION_NOT_FOUND"};
}

async function refund(db,sessionHash,requestId){
    const now = new Date().toISOString();
    await db.batch([
        db.prepare(
            "UPDATE worth_it_guest_calc_wallets SET "+
            "balance_milli=MIN(500,balance_milli+100),updated_at=? "+
            "WHERE session_hash=? AND EXISTS ("+
            "SELECT 1 FROM worth_it_guest_calc_transactions "+
            "WHERE session_hash=? AND request_id=? AND status='reserved')"
        ).bind(now,sessionHash,sessionHash,requestId),
        db.prepare(
            "UPDATE worth_it_guest_calc_transactions SET status='refunded',updated_at=? "+
            "WHERE session_hash=? AND request_id=? AND status='reserved'"
        ).bind(now,sessionHash,requestId)
    ]);
    const tx = await readTransaction(db,sessionHash,requestId);
    return tx?.status === "refunded"
        ? {ok:true,status:"refunded"}
        : {ok:false,code:tx?.status === "completed" ? "ALREADY_SETTLED" : "RESERVATION_NOT_FOUND"};
}

export async function onRequest(context){
    const {request,env} = context;
    const origin = safeOrigin(request);
    if(!origin) return json({ok:false,error:"This origin is not allowed."},403,"https://worth-it-calculator.pages.dev");
    if(request.method === "OPTIONS") return new Response(null,{status:204,headers:{
        "Access-Control-Allow-Origin":origin,
        "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type",
        "Access-Control-Allow-Credentials":"true",
        "Vary":"Origin"
    }});
    if(!["GET","POST"].includes(request.method)) return json({ok:false,error:"Method not allowed."},405,origin);

    const db = env.DB;
    if(!db) return json({ok:false,error:"Guest CALC service is temporarily unavailable."},503,origin);

    let token = cookieValue(request);
    const isNewSession = !token;
    if(isNewSession) token = newSessionToken();
    const sessionHash = await hashSession(token);
    const cookie = isNewSession ? sessionCookie(token) : "";

    try{
        await ensureSchema(db);
        if(request.method === "GET"){
            const wallet = await loadWallet(db,sessionHash);
            return json({ok:true,...wallet},200,origin,cookie);
        }
        await loadWallet(db,sessionHash);

        let payload;
        try{
            const text = await request.text();
            if(text.length > 2048) return json({ok:false,error:"Request is too large."},413,origin,cookie);
            payload = JSON.parse(text);
        }catch(_){
            return json({ok:false,error:"A valid JSON action is required."},400,origin,cookie);
        }
        const action = String(payload?.action||"");
        const requestId = String(payload?.request_id||"").toLowerCase();
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)){
            return json({ok:false,error:"A valid request ID is required."},400,origin,cookie);
        }

        let result;
        if(action === "reserve") result = await reserve(db,sessionHash,requestId);
        else if(action === "settle") result = await settle(db,sessionHash,requestId);
        else if(action === "refund") result = await refund(db,sessionHash,requestId);
        else return json({ok:false,error:"Unsupported guest CALC action."},400,origin,cookie);

        if(action === "reserve" && !result.ok && result.code === "INSUFFICIENT_CALC"){
            result.balance = Number(result.balance_milli||0)/1000;
        }
        const wallet = await loadWallet(db,sessionHash);
        return json({ok:result.ok,...result,balance:wallet.balance,balance_milli:wallet.balance_milli},result.ok?200:result.code==="INSUFFICIENT_CALC"?402:409,origin,cookie);
    }catch(error){
        console.error("Guest CALC request failed:",error);
        return json({ok:false,error:"Guest CALC service is temporarily unavailable."},503,origin,cookie);
    }
}
