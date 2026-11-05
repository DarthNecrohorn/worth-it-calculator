import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const news = readFileSync(new URL("../news-ui.js", import.meta.url), "utf8");
const communityCss = readFileSync(new URL("../community-features.css", import.meta.url), "utf8");
const siteThemeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");

test("choosing a section keeps an explicitly opened hamburger panel open", () => {
    const start = app.indexOf("function closeNavMenuUnlessPreserved(navLinks)");
    assert.ok(start >= 0);
    const end = app.indexOf("\nfunction toggleMenu()", start);
    const body = app.slice(start, end);
    const preserveGuard = body.indexOf('navLinks.dataset.preserveOpen === "true"');
    const closePanel = body.indexOf('navLinks.classList.remove("open")');
    assert.ok(preserveGuard >= 0, "section navigation checks the user's persistent-menu choice");
    assert.ok(closePanel > preserveGuard, "ordinary close logic only runs when preservation is not active");
    assert.match(body, /navLinks\.classList\.contains\("open"\)[\s\S]*?return;/);
    assert.match(body, /navLinks\.setAttribute\("aria-hidden", "true"\)/);
    assert.match(body, /menuButton\.setAttribute\("aria-expanded", "false"\)/);
});

test("the hamburger toggle remains the explicit open and close control", () => {
    const start = app.indexOf("function toggleMenu()");
    const end = app.indexOf("\nwindow.toggleMenu = toggleMenu;", start);
    assert.ok(start >= 0 && end > start, "hamburger toggle function exists");
    const body = app.slice(start, end);
    assert.match(body, /navLinks\.classList\.toggle\("open"\)/);
    assert.match(body, /navLinks\.dataset\.preserveOpen = "true"/);
    assert.match(body, /delete navLinks\.dataset\.preserveOpen/);
    assert.match(body, /aria-expanded"[\s\S]*?String\(isOpen\)/);
});

test("every discovery section button is inside the persistent hamburger menu", () => {
    const start = html.indexOf('<div class="nav-links" id="navLinks">');
    const end = html.indexOf('<div class="nav-actions">', start);
    assert.ok(start >= 0 && end > start, "hamburger menu markup exists");
    const menu = html.slice(start, end);
    for (const handler of [
        'onclick="openWeather()"',
        'onclick="openNews()"',
        'onclick="openDiscounts()"',
        'onclick="openCarsFromMenu()"',
        'onclick="openMarketsFromMenu()"',
        'onclick="openMoneyFromMenu()"',
        'onclick="openCryptoFromMenu()"',
        'onclick="openWaterLevelsFromMenu()"',
        'onclick="openShipTrackingFromMenu()"'
    ]) {
        assert.ok(menu.includes(handler), "Expected a section handler inside hamburger menu");
    }
});

test("open hamburger blocks header actions from receiving clicks behind the dropdown", () => {
    assert.match(css, /#navLinks\.nav-links\.open\s*\{[^}]*z-index:\s*2147483000 !important;[^}]*pointer-events:\s*auto !important;/);
    assert.match(css, /\.nav-inner:has\(> #navLinks\.nav-links\.open\) > \.nav-right-stack\s*\{\s*pointer-events:\s*none !important;/);
    assert.match(css, /\.nav-inner:has\(> #navLinks\.nav-links\.open\) > \.nav-right-stack \*\s*\{\s*pointer-events:\s*none !important;/);
    assert.match(html, /style\.css\?v=[^"']+/);
    assert.match(html, /app\.js\?v=deployment-supabase-config-20261031a/);
});

test("the open hamburger shields every header sibling, including Sign out", () => {
    assert.match(css, /\.nav-inner:has\(> #navLinks\.nav-links\.open\) > :not\(#navLinks\):not\(\.menu-btn\):not\(\.logo\),\s*\.nav-inner:has\(> #navLinks\.nav-links\.open\) > :not\(#navLinks\):not\(\.menu-btn\):not\(\.logo\) \*\s*\{\s*pointer-events:\s*none !important;/);
    assert.match(css, /#navLinks\.nav-links\.open button\s*\{[^}]*pointer-events:\s*auto !important;/);
    const nav = html.slice(html.indexOf('<nav class="nav">'), html.indexOf("</nav>"));
    assert.match(nav, /class="signout-nav-btn" id="signOutNavBtn"/);
    const navActionsStart = nav.indexOf('<div class="nav-actions">');
    const secondaryRowStart = nav.indexOf('<div class="nav-secondary-row">');
    const signOutIndex = nav.indexOf('id="signOutNavBtn"');
    assert.ok(navActionsStart >= 0 && secondaryRowStart > navActionsStart);
    assert.ok(signOutIndex > secondaryRowStart, "Sign out is in the separate secondary utility row");
    assert.match(html, /style\.css\?v=[^"']+/);
});

test("News section code does not sign out or erase Supabase auth state", () => {
    assert.doesNotMatch(news, /\.auth\.signOut\s*\(/);
    assert.doesNotMatch(news, /localStorage\.removeItem\([^)]*(?:auth-token|supabase)/i);
});


test("News uses the resolved primary auth state for cache scoping without a second auth request", () => {
    const start = news.indexOf("async function getNewsAccountScope()");
    const end = news.indexOf("\nfunction readNewsFeedSnapshot", start);
    assert.ok(start >= 0, "News account-scope helper exists");
    assert.ok(end > start, "News account-scope helper has a clear boundary");
    const body = news.slice(start, end);
    assert.match(body, /window\.worthItAuthReady/);
    assert.match(body, /window\.worthItAuthStateResolved/);
    assert.match(body, /window\.worthItCurrentAuthUser\?\.id/);
    assert.doesNotMatch(body, /\.auth\??\.getUser\s*\(/);
    assert.doesNotMatch(body, /supabaseClient/);
});

test("News rechecks the account scope before reusing its in-memory feed", () => {
    const start = news.indexOf("async function loadNews()");
    const end = news.indexOf("/* =========================================================\n   NEWS", start);
    const body = news.slice(start, end < 0 ? undefined : end);
    assert.ok(start >= 0, "loadNews exists");
    assert.ok(body.indexOf("await getNewsAccountScope()") < body.indexOf("showNewsCategory(\"all\")"));
    assert.match(body, /newsFeedAccountScope !==\s*previousAccountScope/);
    assert.match(body, /newsData = \{\};/);
    assert.match(body, /newsLoadInProgress = false;\s*return;/);
});

test("hamburger opens as a left-to-right drawer and reverses smoothly on close", () => {
    assert.match(app, /navLinks\.classList\.add\("closing"\)/);
    assert.match(app, /navMenuCloseTimer/);
    assert.match(app, /window\.setTimeout\([\s\S]*?460\)/);
    assert.match(communityCss, /#navLinks\.nav-links\s*\{[\s\S]*?transform:translate3d\(-105%,0,0\)/);
    assert.match(communityCss, /#navLinks\.nav-links\.open\s*\{[\s\S]*?transform:translate3d\(0,0,0\)/);
    assert.match(communityCss, /#navLinks\.nav-links\.closing\s*\{[\s\S]*?transform:translate3d\(-105%,0,0\)/);
    assert.match(communityCss, /prefers-reduced-motion:reduce/);
});

test("the final hamburger drawer uses explicit enter/exit keyframes below the two-row header", () => {
    assert.match(siteThemeCss, /@keyframes worthItHamburgerEnter/);
    assert.match(siteThemeCss, /@keyframes worthItHamburgerExit/);
    assert.match(siteThemeCss, /#navLinks\.nav-links\.open[\s\S]*?animation: worthItHamburgerEnter/);
    assert.match(siteThemeCss, /#navLinks\.nav-links\.closing[\s\S]*?animation: worthItHamburgerExit/);
    assert.match(siteThemeCss, /top: 88px !important/);
    assert.match(siteThemeCss, /top: 114px !important/);
    assert.match(siteThemeCss, /prefers-reduced-motion: reduce/);
    assert.match(html, /site-theme-system\.css\?v=/);
});


test("responsive header stacks the economy controls under the logo and enlarges only the profile target", () => {
    const start = siteThemeCss.indexOf("The compact header has two predictable left-side rows");
    assert.ok(start >= 0, "the compact brand-stack layout exists");
    const block = siteThemeCss.slice(start);
    assert.match(block, /\.nav-inner > \.menu-btn[\s\S]*?left: 16px/);
    assert.match(block, /\.nav-inner > \.logo[\s\S]*?left: 64px/);
    assert.match(block, /\.nav-inner > \.calc-economy-nav[\s\S]*?left: 64px[\s\S]*?top: 48px/);
    assert.match(block, /\.nav-top-row \.nav-actions > \.auth-wrap > \.profile-nav-btn[\s\S]*?width: 44px/);
    assert.match(block, /\.nav-top-row \.nav-actions > \.auth-wrap > \.profile-nav-btn[\s\S]*?height: 44px/);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?worthItHamburgerEnterReduced/);
    assert.match(block, /animation-duration: \.54s/);
    assert.match(block, /animation-duration: \.44s/);
    assert.match(html, /site-theme-system\.css\?v=global-theme-wallpaper-drawer-20261105d/);
});

test("the homepage no longer reserves a large block for outdated calculator statistics", () => {
    const home = html.slice(html.indexOf('<section id="homePage">'), html.indexOf('<div id="calculatorExploreStage"'));
    assert.doesNotMatch(home, /Decision calculators|Long-term comparisons|Free to use/);
});
