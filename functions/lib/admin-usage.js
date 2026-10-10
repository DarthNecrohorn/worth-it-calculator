const TOTALS_TABLE = "admin_api_usage_totals_v2";
const DAILY_TABLE = "admin_api_usage_daily_v2";

const CREATE_DAILY_SQL =
    "CREATE TABLE IF NOT EXISTS " +
    DAILY_TABLE +
    " (api_key TEXT NOT NULL, provider TEXT NOT NULL, usage_date TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (api_key, usage_date))";

/*
 * D1 should not execute CREATE TABLE statements and update two tables
 * for every API request. Ensure the daily table once per Worker isolate;
 * admin-stats also provisions it as a recovery path.
 */
let dailyTableReadyPromise = null;

function ensureDailyTable(db) {
    if (!dailyTableReadyPromise) {
        dailyTableReadyPromise =
            db.prepare(CREATE_DAILY_SQL).run().catch(error => {
                dailyTableReadyPromise = null;
                throw error;
            });
    }

    return dailyTableReadyPromise;
}

function normalizeEntry(entry) {
    const apiKey =
        String(entry?.apiKey || "").trim();

    const provider =
        String(entry?.provider || "").trim();

    const requests =
        Math.max(
            1,
            Number.parseInt(
                entry?.requests,
                10
            ) || 1
        );

    if (!apiKey || !provider) {
        return null;
    }

    return {
        apiKey,
        provider,
        requests
    };
}

export function recordAdminApiUsage(
    context,
    entries
) {
    const db =
        context?.env?.DB;

    if (!db) {
        console.warn(
            "Admin API usage tracking skipped: D1 binding DB is not configured."
        );
        return;
    }

    const normalizedEntries =
        (Array.isArray(entries) ? entries : [entries])
            .map(normalizeEntry)
            .filter(Boolean);

    if (!normalizedEntries.length) {
        return;
    }

    const timestamp =
        new Date().toISOString();

    const usageDate =
        timestamp.slice(0, 10);

    /*
     * Daily rows are the source of truth. Lifetime totals are calculated
     * by aggregating these compact rows in admin-stats.js, so each tracked
     * event writes only one daily row instead of both totals and daily.
     */
    const statements =
        normalizedEntries.map(entry =>
            db.prepare(
                "INSERT INTO " +
                DAILY_TABLE +
                " (api_key, provider, usage_date, requests) " +
                "VALUES (?, ?, ?, ?) " +
                "ON CONFLICT(api_key, usage_date) DO UPDATE SET " +
                "provider = excluded.provider, " +
                "requests = requests + excluded.requests"
            ).bind(
                entry.apiKey,
                entry.provider,
                usageDate,
                entry.requests
            )
        );

    const task =
        ensureDailyTable(db)
            .then(() => db.batch(statements))
            .catch(error => {
                console.error(
                    "Admin API usage tracking failed:",
                    error
                );
            });

    if (
        typeof context?.waitUntil === "function"
    ) {
        context.waitUntil(task);
        return;
    }

    return task;
}

export const ADMIN_USAGE_TABLES = {
    totals: TOTALS_TABLE,
    daily: DAILY_TABLE
};
