import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet } from "../functions/api/runtime-config.js";

function request() {
    return new Request("https://preview.worth-it-calculator.pages.dev/api/runtime-config");
}

function parseConfig(script) {
    const match = script.match(/window\.WORTH_IT_SUPABASE_CONFIG = Object\.freeze\((.*)\);/s);
    assert.ok(match, "the response assigns the public runtime configuration");
    return JSON.parse(match[1]);
}

test("runtime config returns only the environment's public Supabase URL and publishable key", async () => {
    const response = await onRequestGet({
        request: request(),
        env: {
            SUPABASE_URL: "https://stagingproject.supabase.co/",
            SUPABASE_PUBLISHABLE_KEY: "sb_publishable_TEST_KEY_0123456789abcdefgh",
            SUPABASE_SERVICE_ROLE_KEY: "must-never-be-returned",
            GEMINI_API_KEY: "must-never-be-returned-either"
        }
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /application\/javascript/i);
    assert.match(response.headers.get("cache-control") || "", /no-store/i);
    const script = await response.text();
    assert.deepEqual(parseConfig(script), {
        url: "https://stagingproject.supabase.co",
        publishableKey: "sb_publishable_TEST_KEY_0123456789abcdefgh"
    });
    assert.equal(script.includes("must-never-be-returned"), false);
    assert.equal(script.includes("must-never-be-returned-either"), false);
});

test("runtime config fails closed when preview Supabase variables are missing", async () => {
    const response = await onRequestGet({
        request: request(),
        env: {}
    });

    assert.equal(response.status, 503);
    assert.match(await response.text(), /WORTH_IT_SUPABASE_CONFIG_ERROR/);
});

test("runtime config rejects non-Supabase URLs and non-publishable keys", async () => {
    const response = await onRequestGet({
        request: request(),
        env: {
            SUPABASE_URL: "https://production.example.com",
            SUPABASE_PUBLISHABLE_KEY: "service_role_secret_value_that_is_not_public"
        }
    });

    assert.equal(response.status, 503);
    assert.match(await response.text(), /WORTH_IT_SUPABASE_CONFIG_ERROR/);
});

test("the browser loads deployment configuration before creating the Supabase client", () => {
    const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    assert.ok(index.indexOf('src="/api/runtime-config"') < index.indexOf('src="app.js?'));
    assert.match(app, /window\.WORTH_IT_SUPABASE_CONFIG/);
    assert.doesNotMatch(app, /https:\/\/diutcnylnubljvpezhmq\.supabase\.co/);
});
