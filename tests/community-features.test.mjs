import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html=read("index.html"), js=read("community-features.js"), css=read("community-features.css");
const admin=read("admin-panel.js"), sql=read("supabase/worth-it-community-extras.sql");
const profileUi=read("profile-ui.js");
const settings=read("settings.js"), routing=read("routing.js");
const themeHoverMigration=read("supabase/worth-it-community-theme-hover.sql");
const themeHeaderMigration=read("supabase/worth-it-community-theme-header.sql");
const themeDesignMigration=read("supabase/worth-it-community-theme-design-system.sql");
const siteCss=read("style.css");
const themeSystemCss=read("site-theme-system.css");
const webShopCss=read("web-shop.css");
const ugcCss=read("ugc-calculators.css");
const ugcJs=read("ugc-calculators.js");
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

 assert.ok(!html.includes('id="favoriteCalculatorsToggle"'),"The broken built-in calculator Favourites filter stays out of the toolbar.");
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
test("Custom Themes expose full-site colours, typography and button/card styles",()=>{
 assert.ok(html.includes('id="worthItThemePrimary"'));
 assert.ok(html.includes('id="worthItThemeSecondary"'));
 assert.ok(html.includes('id="worthItThemeHover"'));
 assert.ok(html.includes('id="worthItThemeHeader"'));
 assert.ok(html.includes("Web Shop &amp; wallet background"));
 ["worthItThemeBackground","worthItThemeSurface","worthItThemeSurfaceAlt","worthItThemeText","worthItThemeHeading","worthItThemeMuted","worthItThemeLink","worthItThemeBorder"].forEach(id=>assert.ok(html.includes('id="'+id+'"')));
 ["worthItThemeFontFamily","worthItThemeHeadingStyle","worthItThemeBodyStyle","worthItThemeCorners","worthItThemeButtonStyle","worthItThemeCardStyle"].forEach(id=>assert.ok(html.includes('id="'+id+'"')));
 assert.ok(html.includes("PERSONAL WORKSPACE"));
 assert.ok(html.includes("Primary button"));
 assert.ok(html.includes("Example link"));
 assert.ok(js.includes("const THEME_COLOR_FIELDS"));
 assert.ok(js.includes("const THEME_SELECT_FIELDS"));
 assert.ok(js.includes("theme_config:themeConfig(theme)"));
 assert.ok(js.includes('select("theme_name,primary_color,secondary_color,hover_color,header_color,theme_config")'));
 assert.ok(js.includes("--worth-it-theme-heading-font-family"));
 assert.ok(js.includes("--worth-it-theme-body-line-height"));
 assert.ok(js.includes("--worth-it-theme-link-color"));
 assert.ok(js.includes('root.dataset.worthItButtonStyle=theme.buttonStyle'));
 assert.ok(css.includes("data-worth-it-button-style=\"solid\""));
 assert.ok(css.includes(".worth-it-theme-preview-card"));
 assert.ok(css.includes("var(--worth-it-theme-heading-color)"));
 assert.ok(sql.includes("theme_config jsonb not null"));
 assert.ok(themeDesignMigration.includes("add column if not exists theme_config"));
 assert.ok(themeDesignMigration.includes("jsonb_typeof(theme_config) = 'object'"));
 assert.ok(smoke.includes("theme_config->>'fontFamily'='georgia'"));
 assert.ok(smoke.includes("non-object design token configuration"));
 assert.ok(js.includes("function validHex"));
 assert.ok(js.includes("function isCustomTheme"));
 assert.ok(html.includes('id="worthItThemePresetGrid"'));
 assert.ok(html.includes('id="worthItThemePreviewSwitcher"'));
 assert.ok(html.includes('id="worthItThemeUndoButton"'));
 assert.ok(html.includes('id="worthItThemeContrastAudit"'));
 assert.ok(html.includes('data-theme-reset-group="colours"'));
 ["worthItThemeFontSize","worthItThemeHeadingScale","worthItThemeLineHeight","worthItThemeButtonAnimation","worthItThemeHoverEffect","worthItThemeShadowIntensity","worthItThemeBorderThickness","worthItThemeFocusAppearance"].forEach(id=>assert.ok(html.includes('id="'+id+'"')));
 ["fontSize","headingScale","lineHeight","buttonAnimation","hoverEffect","shadowIntensity","borderThickness","focusAppearance"].forEach(key=>assert.ok(js.includes('"'+key+'"')));
 assert.ok(js.includes("const THEME_PRESETS"));
 assert.ok(js.includes("function renderThemeContrastAudit"));
 assert.ok(js.includes("function decorateThemeColourFields"));
 assert.ok(js.includes("function rememberRecentThemeColour"));
 assert.ok(js.includes("function undoThemeChanges"));
 assert.ok(css.includes(".worth-it-theme-preset-grid"));
 assert.ok(css.includes(".worth-it-theme-preview-switcher"));
 assert.ok(css.includes(".worth-it-theme-contrast-audit"));
 assert.ok(css.includes('data-worth-it-hover-effect="glow"'));

 assert.ok(html.includes('id="worthItThemePresetGrid"'));
 assert.ok(html.includes('id="worthItThemePreviewSwitcher"'));
 assert.ok(html.includes('id="worthItThemeUndoButton"'));
 assert.ok(html.includes('id="worthItThemeContrastAudit"'));
 assert.ok(html.includes('data-theme-reset-group="colours"'));
 ["worthItThemeFontSize","worthItThemeHeadingScale","worthItThemeLineHeight","worthItThemeButtonAnimation","worthItThemeHoverEffect","worthItThemeShadowIntensity","worthItThemeBorderThickness","worthItThemeFocusAppearance"].forEach(id=>assert.ok(html.includes('id="'+id+'"')));
 ["fontSize","headingScale","lineHeight","buttonAnimation","hoverEffect","shadowIntensity","borderThickness","focusAppearance"].forEach(key=>assert.ok(js.includes('"'+key+'"')));
 assert.ok(js.includes("const THEME_PRESETS"));
 assert.ok(js.includes("function renderThemeContrastAudit"));
 assert.ok(js.includes("function decorateThemeColourFields"));
 assert.ok(js.includes("function rememberRecentThemeColour"));
 assert.ok(js.includes("function undoThemeChanges"));
 assert.ok(css.includes(".worth-it-theme-preset-grid"));
 assert.ok(css.includes(".worth-it-theme-preview-switcher"));
 assert.ok(css.includes(".worth-it-theme-contrast-audit"));
 assert.ok(css.includes('data-worth-it-hover-effect="glow"'));

 assert.ok(js.includes("--worth-it-hover-glow"));
 assert.ok(js.includes("hover_color:theme.hover"));
 assert.ok(js.includes("window.resetWorthItCustomTheme=resetCustomTheme"));
 assert.ok(sql.includes("primary_color"));
 assert.ok(sql.includes("secondary_color"));
 assert.ok(themeHoverMigration.includes("add column if not exists hover_color"));
 assert.ok(themeHoverMigration.includes("worth_it_user_themes_hover_color_check"));
 assert.ok(themeHeaderMigration.includes("add column if not exists header_color"));
 assert.ok(themeHeaderMigration.includes("worth_it_user_themes_header_color_check"));
 assert.ok(js.includes("header_color:theme.header"));
 assert.ok(js.includes("--worth-it-header-background"));
 assert.ok(smoke.includes("hover_color"));
 assert.ok(smoke.includes("header_color"));
 assert.ok(smoke.includes("#18243A"));
 assert.ok(smoke.includes("#FF8C42"));
 assert.ok(smoke.includes("invalid hover colour"));
 assert.ok(siteCss.includes("html[data-worth-it-custom-theme]{"));
 assert.ok(webShopCss.includes(".calc-economy-nav"));
 assert.ok(webShopCss.includes("--worth-it-header-foreground"));
 assert.ok(webShopCss.includes(".calc-wip-nav"));

 assert.ok(siteCss.includes(".worth-it-settings-kicker"));
 assert.ok(siteCss.includes("#profileNavBtn .auth-avatar"));
 assert.ok(siteCss.includes("#settingsPanel"));
 assert.ok(css.includes(".worth-it-theme-preview-card"));
 assert.ok(css.includes(".worth-it-theme-preview-secondary"));
 assert.ok(css.includes("html[data-worth-it-custom-theme] #marketsSection"));
 assert.ok(css.includes("--wt-section-card:linear-gradient"));
 assert.ok(css.includes("--wt-section-control:color-mix"));
 assert.ok(css.includes("html[data-worth-it-custom-theme] button:hover:not(:disabled)"));
 assert.ok(js.includes("removeLocal(scopedKey(THEME_KEY,userId))"));
 assert.ok(js.includes("return false;"));

});
test("everyone can preview Custom Themes in Settings, but only Premium can save them",()=>{
 assert.ok(html.includes('id="worthItThemeEditor">'));
 assert.ok(html.includes('id="settingsCustomThemePromo" role="note" hidden'));
 assert.ok(html.includes("Try every colour, font and style for free"));
 assert.ok(html.includes("Your preview lasts while Settings is open"));
 assert.ok(html.includes("Save it and keep it active across the whole website"));
 assert.ok(js.includes("if(editor)editor.hidden=false"));
 assert.ok(js.includes("if(locked)locked.hidden=themeEntitled"));
 assert.ok(js.includes("if(miniPromo)miniPromo.hidden=themeEntitled"));
 assert.ok(js.includes("Free live preview. Try colours, fonts, heading styles, buttons and corners."));
 assert.ok(js.includes("if(!themeEntitlementResolved||!themeEntitled)"));
 assert.ok(js.includes("window.openWorthItThemeUpgrade?.()"));
 assert.ok(js.includes("let savedTheme = DEFAULT_THEME"));
 assert.ok(js.includes("let themePreviewActive = false"));
 assert.ok(js.includes("window.setWorthItCustomThemeSettingsOpen=function(isOpen)"));
 assert.ok(js.includes("applyTheme(savedTheme)"));
 assert.ok(settings.includes("window.setWorthItCustomThemeSettingsOpen(true)"));
 assert.ok(settings.includes("window.refreshWorthItCustomTheme"));
 assert.ok(routing.includes("window.setWorthItCustomThemeSettingsOpen(false)"));
 assert.ok(js.includes("async function clearThemeAfterExpiry(userId,request)"));
 assert.ok(js.includes("await clearThemeAfterExpiry(userId,request)"));
 assert.ok(js.includes("scheduleThemeExpiry(wallet,userId)"));
 assert.ok(js.includes("premium_expires_at"));
 assert.ok(js.includes("Your Premium subscription is no longer active. Your saved Custom Theme was reset to the default."));
 assert.ok(js.includes("if(!walletResolved)"));
 assert.ok(js.includes("no saved theme has been changed"));
 assert.ok(js.includes("window.addEventListener(\"focus\",refreshThemeOnReturn)"));
});
test("custom themes stay active on public profile routes and after leaving",()=>{
 assert.ok(html.includes('root.classList.add("worth-it-profile-theme-isolated")'));
 assert.ok(js.includes("let activeTheme = DEFAULT_THEME"));
 assert.ok(js.includes("const theme=selectedTheme"));
 assert.ok(js.includes('root.classList.remove("worth-it-profile-theme-isolated")'));
 assert.ok(js.includes("window.setWorthItProfileThemeIsolation=function()"));
 assert.ok(js.includes("applyTheme(activeTheme)"));
 assert.ok(profileUi.includes("window.setWorthItProfileThemeIsolation(true)"));
 assert.ok(profileUi.includes("window.setWorthItProfileThemeIsolation(false)"));
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


test("community slide and calculator pagination surfaces stay opaque and clearly paginated",()=>{
 assert.ok(html.includes("The catalogue shows up to 30 calculators per page, not 30 in total."));
 assert.ok(ugcCss.includes("#ugcCommunitySection.calculator-explore-panel"));
 assert.ok(ugcCss.includes("background-color:var(--bg)"));
 assert.ok(ugcJs.includes("This is not a 30-calculator total limit"));
});


test("Custom Theme includes twelve distinct extra presets with an accessible expandable collection",()=>{
 const extraIds=["graphite","lavender-mist","terracotta","matcha","champagne","berry","arctic","retro","royal","mocha","sakura","neon-pulse"];
 const extraNames=["Graphite","Lavender Mist","Terracotta","Matcha","Champagne","Berry","Arctic","Retro","Royal","Mocha","Sakura","Neon Pulse"];
 extraIds.forEach(id=>assert.ok(html.includes('data-theme-preset="'+id+'"'),"missing preset "+id));
 extraNames.forEach(name=>assert.ok(html.includes("<strong>"+name+"</strong>"),"missing preset label "+name));
 assert.ok(html.includes('id="worthItThemePresetMoreToggle"'));
 assert.ok(html.includes('id="worthItThemePresetMoreGrid"'));
 assert.ok(html.includes('aria-controls="worthItThemePresetMoreGrid"'));
 assert.ok(js.includes("function setMoreThemePresetsExpanded"));
 assert.ok(js.includes('THEME_PRESETS.some(preset=>preset.group==="more"'));
 assert.ok(js.includes('preset.group==="more"'));
 assert.ok(css.includes(".worth-it-theme-preset-extra-grid"));
 assert.ok(css.includes("#worthItThemePresetMoreGrid[hidden]"));
});


test("Custom Theme is resolved before page content becomes visible",()=>{
 assert.ok(html.includes("worthItCustomTheme:v1:"));
 assert.ok(html.includes("sb-[a-z0-9]+-auth-token"));
 assert.ok(html.includes("worth_it_auth_remember_until_v1"));
 assert.ok(html.includes("worth-it-boot-background"));
 assert.ok(html.includes("html.worth-it-initial-paint body {\n    visibility: hidden !important;"));
 assert.ok(js.includes("let initialThemeHydrationPending"));
 assert.ok(js.includes("await window.worthItAuthReady"));
 assert.ok(js.includes("await loadThemeForSession()"));
 assert.ok(js.includes('classList.remove("worth-it-initial-paint")'));
 assert.ok(js.includes("themeRequest+=1"));
 assert.ok(js.includes("if(initialThemeHydrationPending||document.hidden)return;"));
});

test("Custom Theme text and controls use surface-specific accessible foregrounds",()=>{
 [
  "--worth-it-theme-page-text","--worth-it-theme-page-muted","--worth-it-theme-page-heading",
  "--worth-it-theme-page-link","--worth-it-theme-card-text","--worth-it-theme-card-muted",
  "--worth-it-theme-card-heading","--worth-it-theme-card-link","--worth-it-theme-surface-text",
  "--worth-it-theme-surface-muted","--worth-it-theme-soft-text","--worth-it-theme-soft-muted"
 ].forEach(token=>assert.ok(js.includes('setProperty("'+token+'"'),"missing computed theme token "+token));
 assert.ok(js.includes("accessibleThemeText(theme.text,[theme.background])"));
 assert.ok(js.includes("accessibleThemeText(theme.text,[cardSurface])"));
 assert.ok(js.includes("accessibleThemeText(theme.text,[theme.surface])"));
 assert.ok(themeSystemCss.includes("var(--worth-it-theme-page-text"));
 assert.ok(themeSystemCss.includes("var(--worth-it-theme-card-text"));
 assert.ok(themeSystemCss.includes("var(--worth-it-theme-surface-text"));
 assert.ok(themeSystemCss.includes("var(--worth-it-theme-soft-text"));
 assert.ok(themeSystemCss.includes("background: var(--card-solid) !important;"));
 assert.ok(themeSystemCss.includes("color: #FFFFFF !important;"));
 assert.ok(js.includes('"--worth-it-theme-card-text"'));
});

test("Custom Theme contrast fallback maintains WCAG AA text and gradient-button contrast",()=>{
 const extract=name=>{
  const start=js.indexOf("function "+name+"(");
  assert.ok(start>=0,"missing production helper "+name);
  const end=js.indexOf("\n}",start);
  assert.ok(end>start,"could not isolate production helper "+name);
  return js.slice(start,end+2);
 };
 const helpers=runInNewContext([
  "function validHex(value){return /^#[0-9a-f]{6}$/i.test(String(value||\"\"));}",
  extract("hexRgb"),extract("relativeLuminance"),extract("contrastRatio"),
  extract("accessibleThemeText"),extract("mixHex"),
  extract("accessibleButtonBackground"),extract("gradientForeground"),
  "({accessibleThemeText,contrastRatio,accessibleButtonBackground,gradientForeground,mixHex})"
 ].join("\n"));
 const surfaces=[
  "#FFFFFF","#F4F6FA","#E9EEF5","#080B18","#141A31","#1D1028",
  "#777777","#A7B3C6","#10B981","#F97316","#3157D5"
 ];
 for(const surface of surfaces){
  const foreground=helpers.accessibleThemeText("#AAB4D0",[surface]);
  assert.ok(helpers.contrastRatio(foreground,surface)>=4.5,
   "text contrast should pass on "+surface+" with "+foreground);
 }
 const gradients=[
  ["#8B5CF6","#38BDF8"],["#F97316","#EC4899"],["#10B981","#A3E635"],
  ["#777777","#999999"],["#F4F6FA","#FFFFFF"],["#101010","#202020"]
 ];
 for(const [primary,secondary] of gradients){
  const foreground=helpers.gradientForeground(primary,secondary);
  const safeStops=[primary,secondary].map(endpoint=>helpers.accessibleButtonBackground(endpoint,foreground));
  for(let step=0;step<=20;step+=1){
   const sample=helpers.mixHex(safeStops[0],safeStops[1],step/20);
   assert.ok(helpers.contrastRatio(foreground,sample)>=4.5,
    "gradient button foreground must pass at step "+step+" on "+sample);
  }
 }
});
