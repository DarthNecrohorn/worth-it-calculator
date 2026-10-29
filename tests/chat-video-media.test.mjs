import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { File } from "node:buffer";
import { onRequest } from "../functions/api/chat-media.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ENV = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"
};
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../functions/api/chat-media.js", import.meta.url), "utf8");

function mediaFile(bytes, name, type) {
    return new File([Uint8Array.from(bytes)], name, { type });
}

function makeMockFetch({ userId = "test-user", storageStatus = 200 } = {}) {
    const calls = [];
    const storageUploads = [];
    const fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: userId }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (url.includes("/storage/v1/object/worth-it-chat-media/")) {
            storageUploads.push({
                url,
                contentType: new Headers(init.headers || {}).get("Content-Type"),
                body: init.body
            });
            return new Response(JSON.stringify({ Key: "stored" }), {
                status: storageStatus,
                headers: { "Content-Type": "application/json" }
            });
        }
        throw new Error("Unexpected fetch URL: " + url);
    };
    return { fetch, calls, storageUploads };
}

async function callUpload(file, { origin = SITE_ORIGIN, token = "test-session-token" } = {}) {
    const form = new FormData();
    form.append("file", file, file.name);
    const headers = { Origin: origin };
    if (token) headers.Authorization = "Bearer " + token;
    const request = new Request(SITE_ORIGIN + "/api/chat-media", {
        method: "POST",
        headers,
        body: form
    });
    return onRequest({ request, env: ENV });
}

async function withFetch(fetchImpl, callback) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
        return await callback();
    } finally {
        globalThis.fetch = original;
    }
}

test("chat video controls, accepted types, upload limits and cache key are wired together", () => {
    assert.match(html, /Images, GIFs, videos and links supported/);
    assert.match(html, /chat-ui\.js\?v=chat-media-lightbox-20261029a/);
    assert.match(html, /accept="image\/png,image\/jpeg,image\/webp,image\/gif,video\/mp4,video\/webm"/);
    assert.match(client, /"video\/mp4":"video","video\/webm":"video"/);
    assert.match(client, /50 \* 1024 \* 1024/);
    assert.match(client, /video\.controls = true/);
    assert.match(server, /const VIDEO_LIMIT = 50 \* 1024 \* 1024;/);
});

test("the API accepts MP4 and WebM only when each file signature matches", async () => {
    const samples = [
        {
            name: "sample.mp4",
            type: "video/mp4",
            bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00],
            extension: ".mp4"
        },
        {
            name: "sample.webm",
            type: "video/webm",
            bytes: [0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x84],
            extension: ".webm"
        }
    ];

    for (const sample of samples) {
        const mock = makeMockFetch();
        const response = await withFetch(mock.fetch, () =>
            callUpload(mediaFile(sample.bytes, sample.name, sample.type))
        );
        assert.equal(response.status, 200, sample.type + " should upload successfully");
        assert.equal((await response.json()).type, "video");
        assert.equal(mock.storageUploads.length, 1);
        assert.equal(mock.storageUploads[0].contentType, sample.type);
        assert.ok(mock.storageUploads[0].url.endsWith(sample.extension));
        assert.equal(mock.calls.filter(call => call.url.endsWith("/auth/v1/user")).length, 1);
    }
});

test("the API rejects mismatched media signatures before storing the file", async () => {
    const mock = makeMockFetch();
    const response = await withFetch(mock.fetch, () =>
        callUpload(mediaFile([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "fake.mp4", "video/mp4"))
    );
    assert.equal(response.status, 415);
    assert.equal(mock.storageUploads.length, 0);
});

test("legacy PNG and GIF uploads remain accepted", async () => {
    const samples = [
        {
            name: "sample.png",
            type: "image/png",
            bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            expectedType: "image"
        },
        {
            name: "sample.gif",
            type: "image/gif",
            bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
            expectedType: "gif"
        }
    ];
    for (const sample of samples) {
        const mock = makeMockFetch();
        const response = await withFetch(mock.fetch, () =>
            callUpload(mediaFile(sample.bytes, sample.name, sample.type))
        );
        assert.equal(response.status, 200, sample.type + " must remain supported");
        assert.equal((await response.json()).type, sample.expectedType);
        assert.equal(mock.storageUploads[0]?.contentType, sample.type);
    }
});

test("unauthorized origins and missing sessions cannot upload media", async () => {
    const blocked = makeMockFetch();
    const blockedResponse = await withFetch(blocked.fetch, () =>
        callUpload(mediaFile([0x1a, 0x45, 0xdf, 0xa3], "sample.webm", "video/webm"), {
            origin: "https://attacker.example"
        })
    );
    assert.equal(blockedResponse.status, 403);
    assert.equal(blocked.calls.length, 0);

    const unauthenticated = makeMockFetch();
    const authResponse = await withFetch(unauthenticated.fetch, () =>
        callUpload(mediaFile([0x1a, 0x45, 0xdf, 0xa3], "sample.webm", "video/webm"), {
            token: ""
        })
    );
    assert.equal(authResponse.status, 401);
    assert.equal(unauthenticated.calls.length, 0);
});


test("the local owned GIF picker remains installed alongside video controls", () => {
    assert.match(html, /id="worthItChatEmojiGrid"/);
    assert.match(html, /id="worthItChatGifGrid"/);
    assert.match(client, /const WORTH_IT_CHAT_GIF_LIBRARY = \[/);
    assert.doesNotMatch(html + "\n" + client, /GIPHY|giphy\.com/i);
});
