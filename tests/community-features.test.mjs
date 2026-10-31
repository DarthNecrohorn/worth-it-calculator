import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html=read("index.html"), js=read("community-features.js"), css=read("community-features.css");
const admin=read("admin-panel.js"), sql=read("supabase/worth-it-community-extras.sql");
const setup=read("tests/fixtures/community-features-postgres-setup.sql");
const smoke=read("tests/fixtures/community-features-postgres-smoke.sql");
const actions=read("supabase/worth-it-chat-message-actions.sql");

test("profile reporting reuses the protected existing submission RPC",()=>{
 assert.ok(html.includes('id="worthItProfileReportButton"'));
 assert.ok(js.includes('submit_worth_it_user_report'));
 assert.ok(js.includes('email_confirmed_at'));
 assert.ok(js.includes('worthItReportReason'));
});
test("owner-only report moderation has a database-side identity check",()=>{
 assert.ok(admin.includes('data-admin-section="reports"'));
 assert.ok(admin.includes("admin_update_worth_it_user_report"));
 assert.ok(sql.includes("auth.jwt()->>'email'"));
 assert.ok(sql.includes("revoke all on function public.admin_update_worth_it_user_report"));
 assert.ok(sql.includes("grant execute on function public.admin_update_worth_it_user_report"));
});
test("calculator favourites are stored per account with row-level ownership policies",()=>{
 assert.ok(js.includes("function ugcCalculatorId"));
 assert.ok(js.includes("function isUGCCalculatorCard"));
 assert.ok(js.includes('if(!favouritesUserId||!isUGCCalculatorCard(card))'));
 assert.ok(js.includes('return id?"ugc:"+id:""'));
 assert.ok(js.includes('if(!favouritesUserId){toast("Sign in to save a user-created calculator.")'));

 assert.ok(html.includes('id="favoriteCalculatorsToggle"'));
 assert.ok(js.includes("worth_it_calculator_favorites"));
 assert.ok(sql.includes("Users can view their own calculator favourites"));
 assert.ok(sql.includes("Users can save their own calculator favourites"));
 assert.ok(sql.includes("Users can remove their own calculator favourites"));
 assert.ok(js.includes('card.dataset.calculatorOrigin!=="ugc"'));
 assert.ok(js.includes('window.canInteractWithWorthItUGCCalculator'));
 assert.ok(js.includes('const allowed=["favorite","like","dislike","report"]'));
 assert.ok(js.includes('if(!favouritesUserId||!isUGCCalculatorCard(card))'));
 assert.ok(js.includes("window.applyCalculatorFilters?.__worthItFavouriteOriginal"));
 assert.ok(js.includes('.like("calculator_key","ugc:%")'));
 assert.ok(sql.includes("^ugc:[a-z0-9][a-z0-9_-]{0,62}$"));
 assert.ok(sql.includes("worth_it_calculator_favorites_ugc_key_check"));
});
test("custom accent themes only accept hex colours and can sync to the user account",()=>{
 assert.ok(html.includes('id="worthItThemePrimary"'));
 assert.ok(html.includes('id="worthItThemeSecondary"'));
 assert.ok(js.includes("function validHex"));
 assert.ok(js.includes("worth_it_user_themes"));
 assert.ok(sql.includes("primary_color ~ '^#[0-9A-Fa-f]{6}$'"));
 assert.ok(sql.includes("secondary_color ~ '^#[0-9A-Fa-f]{6}$'"));
});
test("existing chat soft-delete keeps tombstones and per-user history behaviour",()=>{
 assert.ok(actions.includes("deleted_at = now()"));
 assert.ok(actions.includes("set body = ''"));
 assert.ok(actions.includes("'is_deleted', m.deleted_at is not null"));
});
test("Preview uses account-scoped local fallbacks when community tables are not installed",()=>{
 assert.ok(js.includes("isMissingCommunitySchema"));
 assert.ok(js.includes("favouritesRemoteAvailable===false"));
 assert.ok(js.includes("themeRemoteAvailable===false"));
 assert.ok(js.includes("scopedKey(FAVOURITES_KEY,userId)"));
 assert.ok(js.includes("scopedKey(THEME_KEY,userId)"));
});
test("Admin report list stays read-only when new moderation columns are absent",()=>{
 assert.ok(admin.includes("isCommunityReportMigrationMissing"));
 assert.ok(admin.includes("Database reports are read-only in this Preview."));
 assert.ok(admin.includes("reviewed_at"));
 assert.ok(css.includes(".admin-user-report-readonly-note"));
});
test("Preview profile reports use local-only storage and can be moderated by the owner without DB writes",()=>{
 assert.ok(js.includes("COMMUNITY_PREVIEW_MODE"));
 assert.ok(js.includes("Preview test report saved locally"));
 assert.ok(js.includes("worthItPreviewReports:v1"));
 assert.ok(js.includes('session.user.email||"").trim().toLowerCase()!=="pedjasebez3545@gmail.com'));
 assert.ok(admin.includes("getWorthItPreviewReports"));
 assert.ok(admin.includes("moderateWorthItPreviewReport"));
 assert.ok(admin.includes("Database reports are read-only in this Preview."));
});
test("community migration is designed for repeat execution and has postgres smoke coverage",()=>{
 assert.ok(sql.includes("add column if not exists admin_note"));
 assert.ok(setup.includes("create table if not exists public.worth_it_user_reports"));
 assert.ok(smoke.includes("unauthorised attempt"));
 assert.ok(smoke.includes("admin_update_worth_it_user_report"));
 assert.ok(smoke.includes("ordinary built-in calculator was allowed"));
 assert.ok(sql.includes("drop constraint if exists worth_it_calculator_favorites_ugc_key_check"));
});
