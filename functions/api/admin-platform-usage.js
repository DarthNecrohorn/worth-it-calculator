import { isWorthItAdminRequest, adminRequiredResponse } from "../lib/admin-auth.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const CLOUDFLARE_GRAPHQL_API = "https://api.cloudflare.com/client/v4/graphql";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const WORKER_QUERY_LIMIT = 10000;
const D1_QUERY_LIMIT = 10000;

function responseJson(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Vary": "Origin"
        }
    });
}

export function isAllowedAdminPlatformOrigin(origin) {
    if (!origin) return true;
    if (origin === SITE_ORIGIN) return true;

    try {
        const parsed = new URL(origin);
        return (
            parsed.protocol === "https:" &&
            parsed.origin === origin &&
            parsed.username === "" &&
            parsed.password === "" &&
            parsed.port === "" &&
            parsed.hostname.endsWith(".worth-it-calculator.pages.dev")
        );
    } catch {
        return false;
    }
}

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Vary": "Origin"
    };
}

export async function onRequestOptions(context) {
    const origin = context?.request?.headers?.get("Origin") || "";

    if (origin && !isAllowedAdminPlatformOrigin(origin)) {
        return new Response(null, { status: 403 });
    }

    return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
    });
}

function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function sumValues(rows, fields) {
    const totals = {};
    fields.forEach(field => { totals[field] = 0; });

    (Array.isArray(rows) ? rows : []).forEach(row => {
        const value = row?.sum || {};
        fields.forEach(field => {
            totals[field] += number(value[field]);
        });
    });

    return totals;
}

function aggregatePagesFunctionRows(rows) {
    const totals = sumValues(rows, [
        "requests",
        "errors",
        "subrequests",
        "wallTime"
    ]);

    const requests = totals.requests;
    const cpuRows = Array.isArray(rows) ? rows : [];
    let weightedCpuP50Us = 0;
    let weightedCpuP99Us = 0;
    let cpuWeight = 0;

    cpuRows.forEach(row => {
        const rowRequests = number(row?.sum?.requests);
        const quantiles = row?.quantiles || {};
        if (rowRequests <= 0 || quantiles.cpuTimeP50 == null) return;
        weightedCpuP50Us += number(quantiles.cpuTimeP50) * rowRequests;
        weightedCpuP99Us += number(quantiles.cpuTimeP99) * rowRequests;
        cpuWeight += rowRequests;
    });

    const cpuTimeP50Ms = cpuWeight ? weightedCpuP50Us / cpuWeight / 1000 : null;
    const cpuTimeP99Ms = cpuWeight ? weightedCpuP99Us / cpuWeight / 1000 : null;
    const wallTimeMs = totals.wallTime / 1000;

    return {
        requests,
        errors: totals.errors,
        subrequests: totals.subrequests,
        cpuTimeP50Ms: cpuTimeP50Ms == null ? null : round(cpuTimeP50Ms, 3),
        cpuTimeP99Ms: cpuTimeP99Ms == null ? null : round(cpuTimeP99Ms, 3),
        wallTimeMs: round(wallTimeMs, 2),
        averageWallTimeMs: round(requests ? wallTimeMs / requests : 0, 3),
        sampledRows: cpuRows.length,
        possiblyTruncated: cpuRows.length >= WORKER_QUERY_LIMIT
    };
}

function round(value, decimals = 2) {
    const scale = 10 ** decimals;
    return Math.round(number(value) * scale) / scale;
}

function graphQLString(value) {
    return JSON.stringify(String(value ?? ""));
}

function createPagesFunctionFields(alias, startDate, endDate, scriptName) {
    return `
        ${alias}: pagesFunctionsInvocationsAdaptiveGroups(
            limit: 1000
            filter: {
                scriptName: ${graphQLString(scriptName)}
                date_geq: ${graphQLString(startDate)}
                date_leq: ${graphQLString(endDate)}
            }
        ) {
            sum {
                requests
                errors
                subrequests
                wallTime
            }
            quantiles {
                cpuTimeP50
                cpuTimeP99
            }
            dimensions {
                scriptName
            }
        }
    `;
}

async function callGraphQL(apiToken, query) {
    const response = await fetch(CLOUDFLARE_GRAPHQL_API, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiToken,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({ query })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || (Array.isArray(result.errors) && result.errors.length)) {
        const message = Array.isArray(result.errors)
            ? result.errors.map(item => item?.message).filter(Boolean).join("; ")
            : "";
        throw new Error(
            message ||
            "Cloudflare Analytics API returned HTTP " + response.status + "."
        );
    }

    if (!result?.data?.viewer?.accounts?.[0]) {
        throw new Error(
            "Cloudflare Analytics returned no account data. Check the account ID and Account Analytics Read permission."
        );
    }

    return result.data.viewer.accounts[0];
}

async function discoverPagesFunctionScript(apiToken, accountId, nowIso) {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
    const endDate = String(nowIso).slice(0, 10);
    const query = `
        query WorthItPagesFunctionScriptDiscovery {
            viewer {
                accounts(filter: { accountTag: ${graphQLString(accountId)} }) {
                    pagesFunctionsInvocationsAdaptiveGroups(
                        limit: 500
                        filter: {
                            date_geq: ${graphQLString(startDate)}
                            date_leq: ${graphQLString(endDate)}
                        }
                    ) {
                        sum { requests }
                        dimensions { scriptName }
                    }
                }
            }
        }
    `;

    const account = await callGraphQL(apiToken, query);
    const rows = Array.isArray(account.pagesFunctionsInvocationsAdaptiveGroups)
        ? account.pagesFunctionsInvocationsAdaptiveGroups
        : [];

    const requestCounts = new Map();
    rows.forEach(row => {
        const name = String(row?.dimensions?.scriptName || "").trim();
        if (!name) return;
        requestCounts.set(name, (requestCounts.get(name) || 0) + number(row?.sum?.requests));
    });

    const candidates = Array.from(requestCounts.entries())
        .map(([name, requests]) => ({ name, requests }))
        .sort((a, b) => b.requests - a.requests);

    const known = candidates.find(item =>
        item.name.toLowerCase() === "worth-it-calculator"
    ) || candidates.find(item =>
        item.name.toLowerCase().includes("worth-it-calculator")
    ) || candidates.find(item =>
        item.name.toLowerCase().includes("worth-it")
    ) || (candidates.length === 1 ? candidates[0] : null);

    return {
        scriptName: known?.name || "",
        candidates: candidates.slice(0, 12)
    };
}

async function fetchD1DatabaseNames(accountId, apiToken) {
    try {
        const response = await fetch(
            CLOUDFLARE_API_BASE +
            "/accounts/" + encodeURIComponent(accountId) +
            "/d1/database?per_page=100",
            {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + apiToken,
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {
            return { byId: new Map(), available: false };
        }

        const payload = await response.json().catch(() => ({}));
        if (!payload?.success || !Array.isArray(payload.result)) {
            return { byId: new Map(), available: false };
        }

        const byId = new Map();
        payload.result.forEach(database => {
            const id = String(database?.uuid || database?.id || "").trim();
            if (!id) return;
            byId.set(id, {
                id,
                name: String(database?.name || "").trim() || id,
                fileSizeBytes: number(database?.file_size)
            });
        });

        return { byId, available: true };
    } catch {
        // D1 names are helpful labels; their lookup must not block metrics.
        return { byId: new Map(), available: false };
    }
}

function createEmptyD1Period() {
    return {
        readQueries: 0,
        writeQueries: 0,
        rowsRead: 0,
        rowsWritten: 0,
        queryTimeMs: 0,
        responseBytes: 0
    };
}

function addD1Row(target, row) {
    const sum = row?.sum || {};
    const readQueries = number(sum.readQueries);
    const writeQueries = number(sum.writeQueries);
    target.readQueries += readQueries;
    target.writeQueries += writeQueries;
    target.rowsRead += number(sum.rowsRead);
    target.rowsWritten += number(sum.rowsWritten);

    // D1's GraphQL schema exposes queryBatchTimeMs under avg, not sum.
    // Estimate total query time by weighting each group's average by its read/write query count.
    const queryCount = readQueries + writeQueries;
    target.queryTimeMs += number(row?.avg?.queryBatchTimeMs) * queryCount;
    target.responseBytes += number(sum.queryBatchResponseBytes);
}

function finalizeD1Period(period) {
    const queryCount = period.readQueries + period.writeQueries;
    return {
        readQueries: period.readQueries,
        writeQueries: period.writeQueries,
        totalQueries: queryCount,
        rowsRead: period.rowsRead,
        rowsWritten: period.rowsWritten,
        queryTimeMs: round(period.queryTimeMs, 2),
        averageQueryTimeMs: round(queryCount ? period.queryTimeMs / queryCount : 0, 4),
        responseBytes: period.responseBytes
    };
}

function groupD1Usage(usageRows, storageRows, databaseDirectory, env, today, monthStart, last30Start) {
    const usageByDatabase = new Map();
    const ensureDatabase = id => {
        if (!usageByDatabase.has(id)) {
            usageByDatabase.set(id, {
                id,
                name: databaseDirectory.byId.get(id)?.name || id,
                today: createEmptyD1Period(),
                month: createEmptyD1Period(),
                last30Days: createEmptyD1Period(),
                latestSizeBytes: databaseDirectory.byId.get(id)?.fileSizeBytes || 0,
                latestSizeDate: ""
            });
        }
        return usageByDatabase.get(id);
    };

    (Array.isArray(usageRows) ? usageRows : []).forEach(row => {
        const id = String(row?.dimensions?.databaseId || "").trim();
        const date = String(row?.dimensions?.date || "").slice(0, 10);
        if (!id || !date) return;

        if (env.CLOUDFLARE_D1_DATABASE_ID &&
            id !== String(env.CLOUDFLARE_D1_DATABASE_ID).trim()) {
            return;
        }

        const target = ensureDatabase(id);
        addD1Row(target.last30Days, row);
        if (date >= monthStart) addD1Row(target.month, row);
        if (date === today) addD1Row(target.today, row);
    });

    (Array.isArray(storageRows) ? storageRows : []).forEach(row => {
        const id = String(row?.dimensions?.databaseId || "").trim();
        const date = String(row?.dimensions?.date || "").slice(0, 10);
        const size = number(
            row?.max?.databaseSizeBytes ??
            row?.max?.databaseSize ??
            row?.sum?.databaseSizeBytes
        );

        if (!id || !date) return;

        if (env.CLOUDFLARE_D1_DATABASE_ID &&
            id !== String(env.CLOUDFLARE_D1_DATABASE_ID).trim()) {
            return;
        }

        const target = ensureDatabase(id);
        if (!target.latestSizeDate || date >= target.latestSizeDate) {
            target.latestSizeDate = date;
            target.latestSizeBytes = size;
        }
    });

    const knownD1Databases = Array.from(databaseDirectory.byId.values());
    let seedIds = [];

    if (env.CLOUDFLARE_D1_DATABASE_ID) {
        seedIds = [String(env.CLOUDFLARE_D1_DATABASE_ID).trim()];
    } else {
        const namedWorthItDatabases = knownD1Databases.filter(database =>
            /worth\s*[-_]?\s*it|worth-it-calculator/i.test(database.name)
        );

        if (namedWorthItDatabases.length) {
            seedIds = namedWorthItDatabases.map(database => database.id);
        } else if (knownD1Databases.length === 1) {
            seedIds = [knownD1Databases[0].id];
        }
    }

    seedIds.forEach(ensureDatabase);

    let databases = Array.from(usageByDatabase.values());
    let scope = env.CLOUDFLARE_D1_DATABASE_ID
        ? "configured-database"
        : "automatic";

    if (!env.CLOUDFLARE_D1_DATABASE_ID) {
        const namedWorthItDatabases = databases.filter(database =>
            /worth\s*[-_]?\s*it|worth-it-calculator/i.test(database.name)
        );

        if (namedWorthItDatabases.length) {
            databases = namedWorthItDatabases;
            if (databases.length > 1) {
                scope = "multiple-named-worth-it-databases";
            }
        } else if (databases.length > 1) {
            // Keep all databases visible rather than silently omitting usage.
            scope = "multiple-databases";
        }
    }

    return {
        databases: databases.map(database => ({
            id: database.id,
            name: database.name,
            storageBytes: database.latestSizeBytes,
            storageAsOf: database.latestSizeDate || null,
            today: finalizeD1Period(database.today),
            month: finalizeD1Period(database.month),
            last30Days: finalizeD1Period(database.last30Days)
        })),
        lookupAvailable: databaseDirectory.available,
        accountDatabaseCount: databaseDirectory.byId.size,
        scope
    };
}

async function handleAdminPlatformUsage(context) {
    const env = context.env || {};

    try {
        if (!(await isWorthItAdminRequest(context))) {
            return adminRequiredResponse();
        }

        const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
        const apiToken = String(env.CLOUDFLARE_API_TOKEN || "").trim();

        if (!accountId || !apiToken) {
            return responseJson({
                success: false,
                code: "configuration_required",
                error: "Cloudflare platform analytics has not been configured.",
                required: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
                optional: ["CLOUDFLARE_PAGES_FUNCTION_SCRIPT_NAME", "CLOUDFLARE_D1_DATABASE_ID"]
            }, 503);
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const today = nowIso.slice(0, 10);
        const monthStart = today.slice(0, 7) + "-01";
        const last30Start = new Date(
            Date.parse(today + "T00:00:00.000Z") - 29 * 24 * 60 * 60 * 1000
        ).toISOString().slice(0, 10);
        const d1Start = monthStart < last30Start ? monthStart : last30Start;
        let scriptName = String(
            env.CLOUDFLARE_PAGES_FUNCTION_SCRIPT_NAME ||
            env.CLOUDFLARE_WORKER_SCRIPT_NAME ||
            ""
        ).trim();
        let workerCandidates = [];

        if (!scriptName) {
            try {
                const discovery = await discoverPagesFunctionScript(apiToken, accountId, nowIso);
                scriptName = discovery.scriptName;
                workerCandidates = discovery.candidates;
            } catch (error) {
                // The D1 metrics below may still be useful if Worker discovery is unavailable.
                console.warn("Platform usage worker discovery failed:", String(error?.message || error));
            }
        }

        const accountEscaped = graphQLString(accountId);
        const d1Query = `
            d1Usage: d1AnalyticsAdaptiveGroups(
                limit: ${D1_QUERY_LIMIT}
                filter: {
                    date_geq: ${graphQLString(d1Start)}
                    date_leq: ${graphQLString(today)}
                }
            ) {
                sum {
                    readQueries
                    writeQueries
                    rowsRead
                    rowsWritten
                    queryBatchResponseBytes
                }
                avg {
                    queryBatchTimeMs
                }
                dimensions { date databaseId }
            }
            d1Storage: d1StorageAdaptiveGroups(
                limit: ${D1_QUERY_LIMIT}
                filter: {
                    date_geq: ${graphQLString(d1Start)}
                    date_leq: ${graphQLString(today)}
                }
            ) {
                max { databaseSizeBytes }
                dimensions { date databaseId }
            }
        `;

        const workerQuery = scriptName
            ? [
                createPagesFunctionFields("workersToday", today, today, scriptName),
                createPagesFunctionFields("workersMonth", monthStart, today, scriptName),
                createPagesFunctionFields("workers30Days", last30Start, today, scriptName)
            ].join("\n")
            : "";

        const query = `
            query WorthItPlatformUsage {
                viewer {
                    accounts(filter: { accountTag: ${accountEscaped} }) {
                        ${workerQuery}
                        ${d1Query}
                    }
                }
            }
        `;

        const [analyticsResult, databaseDirectory] = await Promise.all([
            callGraphQL(apiToken, query),
            fetchD1DatabaseNames(accountId, apiToken)
        ]);

        const workerMetricsAvailable = Boolean(scriptName);
        const workers = workerMetricsAvailable ? {
            scriptName,
            today: aggregatePagesFunctionRows(analyticsResult.workersToday),
            month: aggregatePagesFunctionRows(analyticsResult.workersMonth),
            last30Days: aggregatePagesFunctionRows(analyticsResult.workers30Days),
            limitRows: WORKER_QUERY_LIMIT,
            candidates: workerCandidates
        } : {
            scriptName: "",
            today: aggregatePagesFunctionRows([]),
            month: aggregatePagesFunctionRows([]),
            last30Days: aggregatePagesFunctionRows([]),
            limitRows: WORKER_QUERY_LIMIT,
            candidates: workerCandidates
        };

        const d1 = groupD1Usage(
            analyticsResult.d1Usage,
            analyticsResult.d1Storage,
            databaseDirectory,
            env,
            today,
            monthStart,
            last30Start
        );

        return responseJson({
            success: true,
            source: "Cloudflare Analytics API",
            generatedAt: nowIso,
            timezone: "UTC",
            ranges: {
                today: today,
                monthStart: monthStart,
                last30DaysStart: last30Start,
                last30DaysEnd: today
            },
            workers: {
                available: workerMetricsAvailable,
                ...workers
            },
            d1: {
                ...d1,
                available: d1.databases.length > 0,
                metricsRetentionDays: 31
            },
            notes: [
                "These are Cloudflare platform metrics, separate from external-provider API Usage.",
                "Pages Functions CPU time is shown as P50 (median) and P99 execution percentiles, converted from microseconds to milliseconds.",
                "D1 figures cover the selected database(s), not a breakdown by individual signed-in user.",
                "Cloudflare analytics can have ingestion delay or adaptive sampling; values are shown as returned by Cloudflare.",
                "This feature reads Cloudflare analytics and does not write telemetry rows into D1."
            ]
        }, 200);
    } catch (error) {
        console.error("Admin platform usage failed:", String(error?.message || error));
        return responseJson({
            success: false,
            error: "Could not load Cloudflare platform metrics.",
            detail: String(error?.message || "Unknown Cloudflare Analytics API error.")
        }, 502);
    }
}


export async function onRequestGet(context) {
    const origin = context?.request?.headers?.get("Origin") || "";

    if (origin && !isAllowedAdminPlatformOrigin(origin)) {
        return responseJson(
            { success: false, error: "Forbidden origin." },
            403
        );
    }

    const response = await handleAdminPlatformUsage(context);
    const headers = new Headers(response.headers);

    // Pages preview deployments are same-project origins. Echo only origins
    // validated above so previews work without allowing arbitrary sites.
    Object.entries(corsHeaders(origin)).forEach(([name, value]) => {
        headers.set(name, value);
    });

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
