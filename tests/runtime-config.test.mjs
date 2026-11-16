import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet } from "../functions/api/runtime-config.js";

const STAGING_CONFIG = {
    url: "https://bhqxeoubhqwfziktbvuh.supabase.co",
    publishableKey: "sb_publishable_omhBqeKf_lFjej21UqZgrQ_le1gp5nY"
};

function request(host = "preview.worth-it-calculator.pages.dev") {
    return new Request("https://" + host + "/api/runtime-config");
}

function parseConfig(script) {
    const match = script.match(/window\.WORTH_IT_SUPABASE_CONFIG = Object\.freeze\((.*)\);/s);
    assert.ok(match, "the response assigns the public runtime configuration");
    return JSON.parse(match[1]);
}

test("every hashed and branch Pages Preview hostname is pinned to the staging Supabase project", async () => {
    for (const host of [
        "preview.worth-it-calculator.pages.dev",
        "2f15afaf.worth-it-calculator.pages.dev",
        "feat-calc-economy-web-shop-2.worth-it-calculator.pages.dev"
    ]) {
        const response = await onRequestGet({
            request: request(host),
            env: {
                // Even if Cloudflare Preview variables accidentally point to
                // Production, Preview hosts must still use isolated staging.
                SUPABASE_URL: "https://diutcnylnubljvpezhmq.supabase.co",
                SUPABASE_PUBLISHABLE_KEY: "sb_publishable_PRODUCTION_KEY_0123456789abcdef",
                SUPABASE_SERVICE_ROLE_KEY: "must-never-be-returned",
                GEMINI_API_KEY: "must-never-be-returned-either"
            }
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") || "", /application\/javascript/i);
        assert.match(response.headers.get("cache-control") || "", /no-store/i);
        const script = await response.text();
        assert.deepEqual(parseConfig(script), STAGING_CONFIG);
        assert.equal(script.includes("must-never-be-returned"), false);
        assert.equal(script.includes("diutcnylnubljvpezhmq"), false);
    }
});

test("the exact Production Pages hostname continues to use its Production environment variables", async () => {
    const response = await onRequestGet({
        request: request("worth-it-calculator.pages.dev"),
        env: {
            SUPABASE_URL: "https://diutcnylnubljvpezhmq.supabase.co/",
            SUPABASE_PUBLISHABLE_KEY: "sb_publishable_PRODUCTION_KEY_0123456789abcdef"
        }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(parseConfig(await response.text()), {
        url: "https://diutcnylnubljvpezhmq.supabase.co",
        publishableKey: "sb_publishable_PRODUCTION_KEY_0123456789abcdef"
    });
});

test("a future custom Production domain keeps using its Production environment variables", async () => {
    const response = await onRequestGet({
        request: request("worthit.example.com"),
        env: {
            SUPABASE_URL: "https://diutcnylnubljvpezhmq.supabase.co",
            SUPABASE_PUBLISHABLE_KEY: "sb_publishable_PRODUCTION_KEY_0123456789abcdef"
        }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(parseConfig(await response.text()), {
        url: "https://diutcnylnubljvpezhmq.supabase.co",
        publishableKey: "sb_publishable_PRODUCTION_KEY_0123456789abcdef"
    });
});

test("Production configuration fails closed when its variables are missing", async () => {
    const response = await onRequestGet({
        request: request("worth-it-calculator.pages.dev"),
        env: {}
    });

    assert.equal(response.status, 503);
    assert.match(await response.text(), /WORTH_IT_SUPABASE_CONFIG_ERROR/);
});

test("runtime config rejects non-Supabase URLs and non-publishable keys", async () => {
    const response = await onRequestGet({
        request: request("worth-it-calculator.pages.dev"),
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
