/*
 * Shareable top-level routes for Worth It Calculator.
 * Calculator IDs are intentionally stable: /calculator/0 is the standard
 * Basic/Advanced/Scientific calculator; /calculator/1..50 follow the
 * existing calculator catalog order.
 */
(function () {
    "use strict";

    const CALCULATOR_TYPES = [
        "cars", "savings", "investment", "loan", "purchase", "salary",
        "pc", "phone", "rent", "energy", "solar", "heating",
        "ownership", "usednew", "carrepair", "taxi", "publictransport",
        "creditcard", "debtpayoff", "emergency", "buysubscribe",
        "repairreplace", "fuelcost", "depreciation", "carloan",
        "evcharging", "parkingcost", "inflation", "budget", "networth",
        "discount", "opportunity", "laptopdesktop", "phonerepair",
        "cloudstorage", "internetplan", "appliance", "watercost",
        "heatingcompare", "rentafford", "evhybrid", "carinsurance",
        "compound", "savingsgoal", "priceincrease", "monitorupgrade",
        "storageupgrade", "electricitybill", "renovation", "mortgageafford"
    ];

    const SECTION_PATHS = {
        "/weather": "openWeather",
        "/news": "openNews",
        "/shop": "openDiscounts",
        "/compare-cars": "openCars",
        "/markets": "openMarkets",
        "/currencies": "openMoney",
        "/cryptocurrencies": "openCrypto",
        "/water-levels": "openWaterLevels",
        "/ship-tracking": "openShipTracking",
        "/settings": "openFullSettings"
    };

    const LEGAL_PATHS = new Set([
        "/terms-of-use",
        "/community-rules",
        "/privacy-policy",
        "/cookie-storage-policy",
        "/affiliate-disclosure",
        "/disclaimer"
    ]);

    const originalFunctions = Object.create(null);
    let applyingRoute = false;

    function normalizePath(pathname) {
        let path = String(pathname || "/");
        if (path !== "/") path = path.replace(/\/+$/, "");
        if (path === "/index.html") return "/";
        return path || "/";
    }

    function setPath(path, replace) {
        const target = normalizePath(path);
        if (!target) return;
        if (
            normalizePath(window.location.pathname) === target &&
            !window.location.search &&
            !window.location.hash
        ) return;

        const method = replace ? "replaceState" : "pushState";
        window.history[method]({ worthItRoute: true }, "", target);
    }

    function pathForCalculator(type) {
        if (type === "basic" || type === "advanced" || type === "scientific") {
            return "/calculator/0";
        }
        const index = CALCULATOR_TYPES.indexOf(String(type || ""));
        return index >= 0 ? "/calculator/" + (index + 1) : null;
    }

    function patchRouteFunction(name, getPath) {
        const original = window[name];
        if (typeof original !== "function") return;

        originalFunctions[name] = original;
        window[name] = function () {
            if (name !== "openFullSettings") {
                const settingsPage = document.getElementById("settingsPage");
                if (settingsPage) settingsPage.style.display = "none";
            }
            if (name !== "openWorthItProfile" && typeof window.hideWorthItProfileSection === "function") {
                window.hideWorthItProfileSection();
            }
            if (!applyingRoute) {
                const path = typeof getPath === "function"
                    ? getPath.apply(this, arguments)
                    : getPath;
                if (path) setPath(path, false);
            }
            return original.apply(this, arguments);
        };
    }

    patchRouteFunction("showHome", "/");
    patchRouteFunction("openWorthItProfile", function (worthItId) {
        const id = Number(worthItId);
        return Number.isSafeInteger(id) && id > 0 ? "/profile/" + id : null;
    });
    patchRouteFunction("openWorthItProfileConnections", function (worthItId, category) {
        const id = Number(worthItId);
        const type = String(category || "").toLowerCase();
        return Number.isSafeInteger(id) && id > 0 && ["friends", "followers", "following"].includes(type)
            ? "/profile/" + id + "/" + type
            : null;
    });
    patchRouteFunction("openCalculator", function (type) {
        return pathForCalculator(type);
    });

    Object.keys(SECTION_PATHS).forEach(function (path) {
        patchRouteFunction(SECTION_PATHS[path], path);
    });

    function showHomeAndScroll(targetId, behavior) {
        const showHome = originalFunctions.showHome || window.showHome;
        if (typeof showHome === "function") showHome.call(window);
        window.setTimeout(function () {
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({
                    behavior: behavior || "smooth",
                    block: "start"
                });
            }
        }, 60);
    }

    window.openCalculatorGallery = function () {
        if (!applyingRoute) setPath("/calculators", false);
        showHomeAndScroll("calculators", applyingRoute ? "auto" : "smooth");
    };

    // Replace the old FAQ anchor action so it also has a stable, shareable URL.
    window.scrollToFAQ = function () {
        if (!applyingRoute) setPath("/faq", false);
        showHomeAndScroll("faq", applyingRoute ? "auto" : "smooth");
    };

    function resolveRoute(path) {
        if (path === "/") return { kind: "home" };
        if (path === "/calculators") return { kind: "anchor", target: "calculators" };
        if (path === "/faq") return { kind: "anchor", target: "faq" };

        const profileConnectionsMatch = path.match(/^\/profile\/(\d+)\/(friends|followers|following)$/);
        if (profileConnectionsMatch) {
            const id = Number(profileConnectionsMatch[1]);
            if (Number.isSafeInteger(id) && id > 0) return { kind: "profile-connections", id: id, category: profileConnectionsMatch[2] };
            return null;
        }

        const profileMatch = path.match(/^\/profile\/(\d+)$/);
        if (profileMatch) {
            const id = Number(profileMatch[1]);
            if (Number.isSafeInteger(id) && id > 0) return { kind: "profile", id: id };
            return null;
        }

        const calculatorMatch = path.match(/^\/calculator\/(\d+)$/);
        if (calculatorMatch) {
            const id = Number(calculatorMatch[1]);
            if (id === 0) return { kind: "calculator", type: "basic" };
            if (id >= 1 && id <= CALCULATOR_TYPES.length) {
                return { kind: "calculator", type: CALCULATOR_TYPES[id - 1] };
            }
            return { kind: "invalid-calculator" };
        }

        if (Object.prototype.hasOwnProperty.call(SECTION_PATHS, path)) {
            return { kind: "section", functionName: SECTION_PATHS[path] };
        }
        return null;
    }

    function applyRoute(path, options) {
        const normalized = normalizePath(path);
        if (LEGAL_PATHS.has(normalized)) return;

        const route = resolveRoute(normalized);
        if (!route) return;

        const rawPath = window.location.pathname;
        if (rawPath !== normalized && (options && options.initial)) {
            window.history.replaceState(
                window.history.state || { worthItRoute: true },
                "",
                normalized + window.location.search + window.location.hash
            );
        }

        applyingRoute = true;
        try {
            if (route.kind !== "profile" && route.kind !== "profile-connections" && typeof window.hideWorthItProfileSection === "function") {
                window.hideWorthItProfileSection();
            }
            if (route.kind === "home") {
                if (!(options && options.initial)) {
                    const showHome = originalFunctions.showHome || window.showHome;
                    if (typeof showHome === "function") showHome.call(window);
                }
                return;
            }

            if (route.kind === "anchor") {
                showHomeAndScroll(route.target, options && options.initial ? "auto" : "smooth");
                return;
            }

            if (route.kind === "calculator") {
                const openCalculator = originalFunctions.openCalculator || window.openCalculator;
                if (typeof openCalculator === "function") openCalculator.call(window, route.type);
                return;
            }

            if (route.kind === "section") {
                const fn = originalFunctions[route.functionName] || window[route.functionName];
                if (typeof fn === "function") fn.call(window);
                return;
            }
            if (route.kind === "profile") {
                const fn = originalFunctions.openWorthItProfile || window.openWorthItProfile;
                if (typeof fn === "function") fn.call(window, route.id, { fromUrl: true });
                return;
            }

            if (route.kind === "profile-connections") {
                const fn = originalFunctions.openWorthItProfileConnections || window.openWorthItProfileConnections;
                if (typeof fn === "function") fn.call(window, route.id, route.category, { fromUrl: true });
            }
        } finally {
            applyingRoute = false;
        }
    }

    window.addEventListener("popstate", function () {
        applyRoute(window.location.pathname, { initial: false });
    });

    // Respect the existing legal-document router. Otherwise dispatch a direct URL.
    const initialPath = normalizePath(window.location.pathname);
    const initialRoute = resolveRoute(initialPath);
    const isInitialProfileRoute = initialRoute &&
        (initialRoute.kind === "profile" || initialRoute.kind === "profile-connections");

    const root = document.documentElement;
    const waitForProfileAuth = isInitialProfileRoute &&
        root.classList.contains("worth-it-profile-route-pending");

    if (waitForProfileAuth) {
        // Keep the solid theme cover until auth is resolved and the requested profile route is shown.
        Promise.resolve(window.worthItAuthReady)
            .catch(function () {})
            .then(function () {
                try {
                    applyRoute(window.location.pathname, { initial: true });
                } finally {
                    root.classList.remove("worth-it-profile-route-pending");
                    root.classList.remove("worth-it-initial-paint");
                }
            });
    } else {
        try {
            if (!LEGAL_PATHS.has(initialPath) && initialPath !== "/") {
                applyRoute(initialPath, { initial: true });
                root.classList.remove("worth-it-profile-route-pending");
            } else if (window.location.pathname === "/index.html") {
                window.history.replaceState(window.history.state || null, "", "/");
            }
        } finally {
            // The selected initial route is now installed; reveal the page without a wrong-section flash.
            root.classList.remove("worth-it-initial-paint");
        }
    }

    // Expose the stable calculator index map for diagnostics and future additions.
    window.WORTH_IT_CALCULATOR_ROUTES = Object.freeze(
        CALCULATOR_TYPES.reduce(function (result, type, index) {
            result[type] = "/calculator/" + (index + 1);
            return result;
        }, { basic: "/calculator/0", advanced: "/calculator/0", scientific: "/calculator/0" })
    );
})();