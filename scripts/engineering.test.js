import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import vm from "node:vm";
import { resetUserData, resetNetworkIdentity } from "../apps/core/noname/util/reset.js";
import { resourceManifest, verifyManifest } from "./lib/assets.js";
import { sanitizeDiagnostic, recordError, diagnostics } from "../apps/core/noname/util/diagnostics.js";
import { socketAddress, parseWireMessage } from "../apps/core/noname/util/network.js";
import { Credentials } from "../packages/server/src/credentials.ts";
import { boundedSend, messageBudget, publicConfig } from "../packages/server/src/transport.ts";

function storage(values) {
	const items = new Map(Object.entries(values));
	return {
		get length() {
			return items.size;
		},
		key: i => [...items.keys()][i],
		getItem: key => items.get(key),
		removeItem: key => items.delete(key),
	};
}

test("reset preserves authenticated identity and unrelated origin storage, and waits for database deletion", async () => {
	const store = storage({ game_key: "id", game_session_secret: "secret", game_setting: "old", other_app: "keep" });
	let request,
		completed = false,
		closed = false;
	const result = resetUserData({
		prefix: "game_",
		db: {
			close() {
				closed = true;
			},
		},
		storage: store,
		database: {
			deleteDatabase() {
				return (request = {});
			},
		},
	}).then(() => {
		completed = true;
	});
	await Promise.resolve();
	assert.equal(closed, true);
	assert.equal(completed, false);
	assert.equal(store.getItem("game_setting"), "old");
	request.onsuccess();
	await result;
	assert.equal(store.getItem("game_key"), "id");
	assert.equal(store.getItem("game_session_secret"), "secret");
	assert.equal(store.getItem("other_app"), "keep");
	assert.equal(store.getItem("game_setting"), undefined);
});

test("blocked reset keeps waiting so a pending delete cannot complete after reporting failure", async () => {
	const store = storage({ game_setting: "keep" });
	let request;
	let blocked = false,
		completed = false;
	const operation = resetUserData({
		prefix: "game_",
		storage: store,
		database: {
			deleteDatabase() {
				return (request = {});
			},
		},
		onBlocked: () => {
			blocked = true;
		},
	}).then(() => {
		completed = true;
	});
	request.onblocked();
	await Promise.resolve();
	assert.equal(blocked, true);
	assert.equal(completed, false);
	assert.equal(store.getItem("game_setting"), "keep");
	request.onsuccess();
	await operation;
});

test("resetting a failed network identity removes both credentials but preserves user data", async () => {
	const store = storage({ game_key: "old", game_session_secret: "old-secret", game_setting: "keep", other_app: "keep" });
	await resetNetworkIdentity({ prefix: "game_", storage: store });
	assert.equal(store.getItem("game_key"), undefined);
	assert.equal(store.getItem("game_session_secret"), undefined);
	assert.equal(store.getItem("game_setting"), "keep");
	assert.equal(store.getItem("other_app"), "keep");
});

test("diagnostics redact structured secrets, authorization and query parameters and bound message size", () => {
	for (const input of ['{"token":"PLACEHOLDER"}', "session_secret=PLACEHOLDER", "Bearer PLACEHOLDER", "https://example.invalid/?foo=PLACEHOLDER", "https://user:PLACEHOLDER@example.invalid/"]) {
		assert.ok(!sanitizeDiagnostic(input).includes("PLACEHOLDER"), input);
	}
	assert.equal(sanitizeDiagnostic("x".repeat(10000)).length, 2000);
	recordError(new Error('{"token":"PLACEHOLDER"}'));
	assert.ok(!diagnostics({ version: "test" }).includes("PLACEHOLDER"));
});

test("socket address validation accepts IPv6 and confines unsupported schemes to an error", () => {
	assert.equal(socketAddress("localhost"), "ws://localhost:8080/");
	assert.equal(socketAddress("::1"), "ws://[::1]:8080/");
	assert.equal(socketAddress("wss://example.invalid/path"), "wss://example.invalid/path");
	for (const input of ["http://example.invalid", "ws://user:password@example.invalid", "[", ""]) assert.throws(() => socketAddress(input));
});

test("wire envelopes reject inherited commands, prototype fields and deep structures before decoding", () => {
	const handlers = { valid() {} };
	assert.deepEqual(parseWireMessage('["valid",{"text":"ok"}]', handlers), ["valid", { text: "ok" }]);
	for (const input of ['["constructor"]', '["valid",{"__proto__":{}}]', JSON.stringify(["valid", "x".repeat(1024 * 1024)])]) assert.throws(() => parseWireMessage(input, handlers));
	let value = {};
	for (let i = 0; i < 40; i++) value = { next: value };
	assert.throws(() => parseWireMessage(JSON.stringify(["valid", value]), handlers));
});

test("send queues, byte budgets and public metadata reject oversized or executable data", () => {
	let terminated = false;
	boundedSend(
		{
			readyState: 1,
			bufferedAmount: 4 * 1024 * 1024,
			terminate() {
				terminated = true;
			},
			send() {
				assert.fail("must not queue");
			},
		},
		"data"
	);
	assert.equal(terminated, true);
	let now = 0;
	const budget = messageBudget(() => now);
	for (let i = 0; i < 8; i++) assert.equal(budget(1024 * 1024), true);
	assert.equal(budget(1), false);
	now = 1000;
	assert.equal(budget(1), true);
	assert.equal(publicConfig({ mode: "test", observe: true })?.mode, "test");
	for (const value of [{ x: "_noname_func:function(){}" }, JSON.parse('{"__proto__":{}}'), { x: "x".repeat(17000) }]) assert.equal(publicConfig(value), null);
});

test("credential digests survive server recreation without an in-memory account limit", async () => {
	const dir = await mkdtemp(join(tmpdir(), "noname-credentials-"));
	try {
		await new Credentials(dir).register("../not-a-path", "digest");
		assert.equal(await new Credentials(dir).get("../not-a-path"), "digest");
		await assert.rejects(() => new Credentials(dir).register("../not-a-path", "replacement"));
	} finally {
		assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
		await rm(dir, { recursive: true, force: true });
	}
});

test("distribution integrity detects same-size corruption and rejects escaped paths", async () => {
	const dir = await mkdtemp(join(tmpdir(), "noname-integrity-"));
	try {
		await mkdir(join(dir, "game"));
		await writeFile(join(dir, "entry.js"), "safe");
		const manifest = await resourceManifest(dir);
		await verifyManifest(dir, manifest);
		await writeFile(join(dir, "entry.js"), "evil");
		await assert.rejects(verifyManifest(dir, manifest), /checksum/);
		await assert.rejects(verifyManifest(dir, { formatVersion: 1, files: [{ path: "../outside", bytes: 0 }] }), /escapes/);
	} finally {
		assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
		await rm(dir, { recursive: true, force: true });
	}
});

test("chat identity is taken from the authenticated connection", () => {
	const source = readFileSync(new URL("../apps/core/noname/library/index.js", import.meta.url), "utf8");
	const start = source.indexOf("\n\t\t\tchat(_id, str) {");
	const end = source.indexOf("\n\t\t\t/**", start + 1);
	assert.ok(start > 0 && end > start);
	let speaker;
	const context = {
		lib: {
			node: { observing: [] },
			playerOL: {
				a: {
					chat() {
						speaker = "a";
					},
				},
				b: {
					chat() {
						speaker = "b";
					},
				},
			},
		},
		game: {},
	};
	const chat = vm.runInNewContext("({" + source.slice(start, end) + "})", context).chat;
	chat.call({ id: "a" }, "b", "hello");
	assert.equal(speaker, "a");
});
