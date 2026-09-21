const TOTALS_TABLE = "admin_api_usage_totals_v2";
const DAILY_TABLE = "admin_api_usage_daily_v2";

const CREATE_TOTALS_SQL =
    "CREATE TABLE IF NOT EXISTS " +
    TOTALS_TABLE +
    " (api_key TEXT PRIMARY KEY, provider TEXT NOT NULL, total_requests INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)";

const CREATE_DAILY_SQL =
    "CREATE TABLE IF NOT EXISTS " +
    DAILY_TABLE +
    " (api_key TEXT NOT NULL, provider TEXT NOT NULL, usage_date TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (api_key, usage_date))";

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

    const now =
        new Date();

    const timestamp =
        now.toISOString();

    const usageDate =
        timestamp.slice(
            0,
            10
        );

    const statements = [
        db.prepare(CREATE_TOTALS_SQL),
        db.prepare(CREATE_DAILY_SQL)
    ];

    for (const entry of normalizedEntries) {
        statements.push(
            db.prepare(
                "INSERT INTO " +
                TOTALS_TABLE +
                " (api_key, provider, total_requests, first_seen_at, last_seen_at) " +
                "VALUES (?, ?, ?, ?, ?) " +
                "ON CONFLICT(api_key) DO UPDATE SET " +
                "provider = excluded.provider, " +
                "total_requests = total_requests + excluded.total_requests, " +
                "last_seen_at = excluded.last_seen_at"
            ).bind(
                entry.apiKey,
                entry.provider,
                entry.requests,
                timestamp,
                timestamp
            )
        );

        statements.push(
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
    }

    const task =
        db.batch(
            statements
        ).catch(error => {
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
