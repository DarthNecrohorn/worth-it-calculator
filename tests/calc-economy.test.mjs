import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const shopCss = read("web-shop.css");
const economy = read("calc-economy.js");
const sql = read("supabase/calc-economy.sql");
const ai = read("functions/api/ai-chat.js");
const mediaApi = read("functions/api/chat-media.js");
const chat = read("chat-ui.js");
const profile = read("profile-ui.js");
const admin = read("admin-panel.js");
const routes = read("routing.js");

test("Web Shop and CALC balance sit beside the logo without replacing the affiliate Shop", () => {
    const logo = html.indexOf('class="logo"');
    const webShop = html.indexOf('id="worthItWebShopButton"');
    const balance = html.indexOf('id="worthItCalcWalletButton"');
    const nav = html.indexOf('id="navLinks"');
    assert.ok(logo >= 0 && logo < webShop && webShop < balance && balance < nav);
    assert.match(html, /id="webShopSection"/);
    assert.match(html, /id="shopSection"/);
    assert.match(html, /data-webshop-category="currency"/);
    assert.match(html, /data-webshop-category="subscriptions"/);
    assert.match(routes, /"\/web-shop": "openWebShop"/);
    assert.match(html, /Buying is completely optional/);
    assert.match(html, /free daily allowance/i);
});

test("the Web Shop has its own persistent dark and light themes", () => {
    assert.match(shopCss, /#webShopSection\s*\{/);
    assert.match(shopCss, /#webShopSection\[data-ws-theme="light"\]/);
    assert.match(economy, /worthItWebShopTheme/);
    assert.match(economy, /window\.toggleWebShopTheme/);
});

test("daily rewards, guest non-stacking and calculator costs use exact milli-CALC units", () => {
    assert.match(economy, /GUEST_DAILY_MILLI = 500/);
    assert.match(economy, /CALCULATOR_COST_MILLI = 100/);
    assert.match(economy, /stored\.date !== today/);
    assert.match(sql, /when 'premium_lite' then 2000/);
    assert.match(sql, /when 'premium' then 3000/);
    assert.match(sql, /else 1000/);
    assert.match(sql, /v_added := v_reward/);
    assert.match(sql, /interval '15 days'/);
    assert.match(sql, /v_cost integer := 75000/);
});

test("the ordinary Basic/Advanced/Scientific calculator stays free", () => {
    assert.match(economy, /window\.calculateGeneric/);
    assert.match(economy, /window\.calculateCars/);
    assert.doesNotMatch(economy, /window\.calculateExpression\s*=/);
    assert.match(html, /Basic[\s\S]{0,100}Advanced[\s\S]{0,100}Scientific/);
});

test("the wallet uses private RLS-protected tables and authenticated, owner-checked RPCs", () => {
    assert.match(sql, /alter table private\.worth_it_calc_wallets enable row level security/);
    assert.match(sql, /alter table private\.worth_it_calc_transactions enable row level security/);
    assert.match(sql, /revoke all on private\.worth_it_calc_wallets from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.calc_wallet_reserve\(uuid,text\) to authenticated/);
    assert.match(sql, /create or replace function public\.calc_admin_overview\(\)/);
    assert.match(sql, /Administrator authorization required/);
    assert.match(sql, /create unique index if not exists worth_it_calc_transactions_request_uidx/);
});

test("AI reservations settle only after successful Gemini or Groq replies and failure paths refund", () => {
    const reserve = ai.indexOf('"calc_wallet_reserve"');
    const settle = ai.indexOf('"calc_wallet_settle"');
    const refund = ai.indexOf('"calc_wallet_refund"');
    const geminiDone = ai.indexOf('provider: "gemini"');
    const groqDone = ai.indexOf('provider: "groq"');
    assert.ok(reserve >= 0 && settle > reserve && refund > reserve);
    assert.ok(geminiDone > settle);
    assert.ok(groqDone > settle);
    assert.match(ai, /INSUFFICIENT_CALC/);
    assert.match(ai, /No CALC was charged/);
});

test("chat media limits are enforced server-side and dynamically validated in the composer", () => {
    assert.match(mediaApi, /calc_chat_media_limits/);
    assert.match(mediaApi, /tierLimits\.image_bytes/);
    assert.match(mediaApi, /tierLimits\.gif_bytes/);
    assert.match(mediaApi, /tierLimits\.video_bytes/);
    assert.match(chat, /getWorthItChatMediaLimits/);
    assert.match(economy, /window\.getWorthItChatMediaLimits/);
    assert.match(sql, /image_bytes',5242880/);
    assert.match(sql, /image_bytes',10485760/);
    assert.match(sql, /image_bytes',26214400/);
});

test("Premium Lite, Premium and owner badges are rendered beside profile and chat usernames", () => {
    assert.match(html, /id="worthItProfilePremiumBadge"/);
    assert.match(profile, /getWorthItPremiumBadge/);
    assert.match(chat, /worth-it-chat-message-author-line/);
    assert.match(chat, /getWorthItPremiumBadge/);
    assert.match(shopCss, /\.worth-it-premium-badge\[hidden\]\{display:none!important\}/);
    assert.match(shopCss, /data-badge="premium"/);
    assert.match(shopCss, /data-badge="owner"/);
});

test("transaction reporting is exposed only through the existing owner-verified Admin Panel", () => {
    assert.match(admin, /data-admin-section="economy"/);
    assert.match(admin, /if\(!\(await isAdmin\(\)\)\)/);
    assert.match(admin, /calc_admin_overview/);
    assert.match(sql, /if auth\.uid\(\) is null or v_email <>/);
});
