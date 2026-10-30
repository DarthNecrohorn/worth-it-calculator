import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/guest-calc.js";
import { readFileSync } from "node:fs";

const SITE = "https://worth-it-calculator.pages.dev";

class MockStatement {
    constructor(db,sql){ this.db=db; this.sql=sql.replace(/\s+/g," ").trim(); this.args=[]; }
    bind(...args){ this.args=args; return this; }
    async run(){ return this.db.run(this.sql,this.args); }
    async first(){ return this.db.first(this.sql,this.args); }
}

class MockD1 {
    constructor(){ this.wallets=new Map(); this.transactions=new Map(); }
    prepare(sql){ return new MockStatement(this,sql); }
    async batch(statements){
        const results=[];
        for(const statement of statements) results.push(await statement.run());
        return results;
    }
    async run(sql,a){
        if(sql.startsWith("CREATE TABLE")||sql.startsWith("CREATE INDEX")||sql.startsWith("DELETE FROM")){
            return {success:true,meta:{changes:0}};
        }
        if(sql.startsWith("INSERT INTO worth_it_guest_calc_wallets")){
            const [hash,day,_balance,created,updated]=a;
            const current=this.wallets.get(hash);
            if(!current) this.wallets.set(hash,{session_hash:hash,reward_date:day,balance_milli:500,created_at:created,updated_at:updated});
            else if(current.reward_date!==day){
                current.reward_date=day;current.balance_milli=500;current.updated_at=updated;
            }
            return {success:true,meta:{changes:current?1:1}};
        }
        if(sql.startsWith("INSERT OR IGNORE INTO worth_it_guest_calc_transactions")){
            const [hash,requestId,claimToken,created,updated,lookupHash,day]=a;
            const wallet=this.wallets.get(lookupHash);
            const key=hash+":"+requestId;
            let changes=0;
            if(wallet && wallet.reward_date===day && wallet.balance_milli>=100 && !this.transactions.has(key)){
                this.transactions.set(key,{session_hash:hash,request_id:requestId,status:"reserved",amount_milli:100,claim_token:claimToken,created_at:created,updated_at:updated});
                changes=1;
            }
            return {success:true,meta:{changes}};
        }
        if(sql.startsWith("UPDATE worth_it_guest_calc_wallets SET balance_milli=balance_milli-100")){
            const [updated,hash,day,lookupHash,requestId,claim]=a;
            const wallet=this.wallets.get(hash);
            const tx=this.transactions.get(lookupHash+":"+requestId);
            let changes=0;
            if(wallet&&wallet.reward_date===day&&tx&&tx.status==="reserved"&&tx.claim_token===claim&&wallet.balance_milli>=100){
                wallet.balance_milli-=100;wallet.updated_at=updated;changes=1;
            }
            return {success:true,meta:{changes}};
        }
        if(sql.startsWith("UPDATE worth_it_guest_calc_transactions SET status='completed'")){
            const [updated,hash,requestId]=a;
            const tx=this.transactions.get(hash+":"+requestId);
            let changes=0;
            if(tx&&tx.status==="reserved"){tx.status="completed";tx.updated_at=updated;changes=1;}
            return {success:true,meta:{changes}};
        }
        if(sql.startsWith("UPDATE worth_it_guest_calc_wallets SET balance_milli=MIN(500,balance_milli+100)")){
            const [updated,hash,lookupHash,requestId]=a;
            const wallet=this.wallets.get(hash);
            const tx=this.transactions.get(lookupHash+":"+requestId);
            let changes=0;
            if(wallet&&tx&&tx.status==="reserved"){
                wallet.balance_milli=Math.min(500,wallet.balance_milli+100);wallet.updated_at=updated;changes=1;
            }
            return {success:true,meta:{changes}};
        }
        if(sql.startsWith("UPDATE worth_it_guest_calc_transactions SET status='refunded'")){
            const [updated,hash,requestId]=a;
            const tx=this.transactions.get(hash+":"+requestId);
            let changes=0;
            if(tx&&tx.status==="reserved"){tx.status="refunded";tx.updated_at=updated;changes=1;}
            return {success:true,meta:{changes}};
        }
        if(sql.startsWith("UPDATE worth_it_guest_calc_wallets SET balance_milli=MIN(500,balance_milli+COALESCE(")){
            return {success:true,meta:{changes:0}};
        }
        throw new Error("Unexpected D1 run SQL: "+sql);
    }
    async first(sql,a){
        if(sql.startsWith("SELECT balance_milli,reward_date FROM worth_it_guest_calc_wallets")){
            const w=this.wallets.get(a[0]);
            return w?{balance_milli:w.balance_milli,reward_date:w.reward_date}:null;
        }
        if(sql.startsWith("SELECT balance_milli FROM worth_it_guest_calc_wallets")){
            const w=this.wallets.get(a[0]);
            return w?{balance_milli:w.balance_milli}:null;
        }
        if(sql.startsWith("SELECT status,amount_milli,claim_token,created_at FROM worth_it_guest_calc_transactions")){
            const tx=this.transactions.get(a[0]+":"+a[1]);
            return tx?{status:tx.status,amount_milli:tx.amount_milli,claim_token:tx.claim_token,created_at:tx.created_at}:null;
        }
        throw new Error("Unexpected D1 first SQL: "+sql);
    }
}

function request(method,body,cookie,origin=SITE){
    const headers=new Headers({Origin:origin});
    if(cookie) headers.set("Cookie",cookie);
    if(body!==undefined) headers.set("Content-Type","application/json");
    return new Request(SITE+"/api/guest-calc",{
        method,headers,body:body===undefined?undefined:JSON.stringify(body)
    });
}

async function call(db,method,body,cookie){
    return onRequest({request:request(method,body,cookie),env:{DB:db}});
}

test("a new guest receives a non-stackable 0.5 CALC wallet in an HttpOnly host-only cookie",async()=>{
    const db=new MockD1();
    const response=await call(db,"GET");
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.balance,0.5);
    assert.equal(result.balance_milli,500);
    assert.equal(result.is_guest,true);
    const cookie=response.headers.get("set-cookie")||"";
    assert.match(cookie,/^__Host-worthit_guest_calc=[a-f0-9]{64}/);
    assert.match(cookie,/HttpOnly/);
    assert.match(cookie,/Secure/);
    assert.match(cookie,/SameSite=Lax/);
    assert.match(cookie,/Path=\//);
    assert.equal([...db.wallets.values()].length,1);
    assert.equal([...db.wallets.values()][0].session_hash.length,64);
});

test("guest calculation reservations debit once, settle, and refund unsuccessful work",async()=>{
    const db=new MockD1();
    const start=await call(db,"GET");
    const cookie=(start.headers.get("set-cookie")||"").split(";")[0];
    const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    let response=await call(db,"POST",{action:"reserve",request_id:id,calculator_type:"cars"},cookie);
    assert.equal(response.status,200);
    let result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.balance,0.4);

    response=await call(db,"POST",{action:"reserve",request_id:id},cookie);
    result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.duplicate,true);
    assert.equal(result.balance,0.4);

    response=await call(db,"POST",{action:"settle",request_id:id},cookie);
    result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.status,"completed");

    const refundId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    response=await call(db,"POST",{action:"reserve",request_id:refundId,calculator_type:"savings"},cookie);
    assert.equal(response.status,200);
    response=await call(db,"POST",{action:"refund",request_id:refundId},cookie);
    result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.balance,0.4);

    response=await call(db,"POST",{action:"refund",request_id:refundId},cookie);
    result=await response.json();
    assert.equal(result.ok,true);
    assert.equal(result.balance,0.4);
});

test("guest daily allowance is enforced by D1, not client localStorage",async()=>{
    const db=new MockD1();
    const start=await call(db,"GET");
    const cookie=(start.headers.get("set-cookie")||"").split(";")[0];
    for(let index=0;index<5;index++){
        const id="cccccccc-cccc-4ccc-8ccc-"+String(index).padStart(12,"0");
        const response=await call(db,"POST",{action:"reserve",request_id:id,calculator_type:"cars"},cookie);
        assert.equal(response.status,200);
        const result=await response.json();
        assert.equal(result.ok,true);
        await call(db,"POST",{action:"settle",request_id:id},cookie);
    }
    const exhaustedId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const exhausted=await call(db,"POST",{action:"reserve",request_id:exhaustedId,calculator_type:"cars"},cookie);
    assert.equal(exhausted.status,402);
    const result=await exhausted.json();
    assert.equal(result.ok,false);
    assert.equal(result.code,"INSUFFICIENT_CALC");
    assert.equal(result.balance,0);
});

test("different guest session cookies have separate non-stacking allowances",async()=>{
    const db=new MockD1();
    const first=await call(db,"GET");
    const second=await call(db,"GET");
    const firstCookie=(first.headers.get("set-cookie")||"").split(";")[0];
    const secondCookie=(second.headers.get("set-cookie")||"").split(";")[0];
    assert.notEqual(firstCookie,secondCookie);
    const firstValue=await first.json();
    const secondValue=await second.json();
    assert.equal(firstValue.balance,0.5);
    assert.equal(secondValue.balance,0.5);
    assert.equal(db.wallets.size,2);
});

test("the guest CALC endpoint rejects foreign origins and fails closed without D1",async()=>{
    const foreign=await onRequest({request:request("GET",undefined,undefined,"https://attacker.example"),env:{DB:new MockD1()}});
    assert.equal(foreign.status,403);
    const unavailable=await onRequest({request:request("GET"),env:{}});
    assert.equal(unavailable.status,503);
});

test("guest wallet identity is opaque and never stores IP address or user-agent fingerprints",()=>{
    const source=readFileSync(new URL("../functions/api/guest-calc.js",import.meta.url),"utf8");
    assert.match(source,/crypto\.getRandomValues/);
    assert.match(source,/crypto\.subtle\.digest\("SHA-256"/);
    assert.match(source,/HttpOnly; SameSite=Lax/);
    assert.doesNotMatch(source,/CF-Connecting-IP|X-Forwarded-For|navigator\.userAgent/i);
    assert.match(source,/balance_milli=500/);
    assert.match(source,/status='reserved'/);
});


test("the D1 API rejects UGC and unknown calculator reservations even with a valid guest session",async()=>{
    const db=new MockD1();
    const start=await call(db,"GET");
    const cookie=(start.headers.get("set-cookie")||"").split(";")[0];
    const blocked=["community","user-created","ugc","basic","scientific","not-a-calculator"];
    for(let index=0;index<blocked.length;index++){
        const id="eeeeeeee-eeee-4eee-8eee-"+String(index).padStart(12,"0");
        const response=await call(db,"POST",{action:"reserve",request_id:id,calculator_type:blocked[index]},cookie);
        assert.equal(response.status,403,blocked[index]+" must be rejected");
        const result=await response.json();
        assert.equal(result.code,"GUEST_CALCULATOR_NOT_ALLOWED");
    }
});
