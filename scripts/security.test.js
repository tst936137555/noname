import { DirectHost } from "../packages/server/src/direct-host.ts";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import net from "node:net";
import { once } from "node:events";
import createApp from "../packages/fs/src/index.ts";
import { createServer } from "../packages/server/src/server/createServer.ts";
import { WebSocket } from "../packages/server/node_modules/ws/wrapper.mjs";
import { simplifyConfig } from "../apps/core/noname/util/product.js";
import { validateSave, importSave } from "../apps/core/noname/util/save.js";

test("file service rejects foreign origins, junction escapes and all mutation routes", async t => {
	const root = await mkdtemp(join(tmpdir(), "noname-fs-test-"));
	assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
	const served = join(root, "served"),
		outside = join(root, "outside");
	await mkdir(served);
	await mkdir(outside);
	await writeFile(join(served, "test.txt"), "safe");
	await writeFile(join(outside, "test.txt"), "private");
	await symlink(outside, join(served, "junction"), process.platform === "win32" ? "junction" : "dir");
	const app = createApp({ dirname: served, listen: false });
	t.after(async () => {
		await app.close();
		await rm(root, { recursive: true, force: true });
	});
	assert.equal((await app.inject("/readFileAsText?fileName=test.txt")).json().data, "safe");
	assert.equal((await app.inject({ url: "/readFileAsText?fileName=test.txt", headers: { origin: "https://evil.invalid" } })).statusCode, 403);
	assert.equal((await app.inject("/readFileAsText?fileName=junction/test.txt")).statusCode, 400);
	assert.equal((await app.inject("/junction/test.txt")).statusCode, 403);
	assert.equal((await app.inject("/readFileAsText?fileName=../outside/test.txt")).statusCode, 400);
	for (const url of ["/removeDir?dir=.", "/createDir?dir=x", "/removeFile?fileName=test.txt"]) assert.equal((await app.inject(url)).statusCode, 404);
	assert.equal((await app.inject({ method: "POST", url: "/writeFile", payload: { path: "test.txt", data: [1] } })).statusCode, 404);
});

test("lobby isolates invalid commands, protects credentials and leaves failed joins unchanged", async t => {
	const reserve = net.createServer();
	reserve.listen(0, "127.0.0.1");
	await once(reserve, "listening");
	const port = reserve.address().port;
	await new Promise(resolve => reserve.close(resolve));
	const server = createServer({ port, host: "127.0.0.1" });
	await server.start();
	const sockets = [];
	t.after(async () => {
		for (const ws of sockets) ws.terminate();
		await server.stop();
	});
	const until = async fn => {
		for (let i = 0; i < 300; i++) {
			const result = fn();
			if (result) return result;
			await new Promise(resolve => setTimeout(resolve, 10));
		}
		throw new Error("Message timeout");
	};
	const connect = async () => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}`);
		const messages = [];
		sockets.push(ws);
		ws.on("error", () => {});
		ws.on("message", data => {
			try {
				messages.push(JSON.parse(String(data)));
			} catch {}
		});
		await once(ws, "open");
		return { ws, messages, send: (...args) => ws.send(JSON.stringify(["server", ...args])) };
	};
	const owner = await connect();
	owner.send("__defineGetter__");
	owner.send("key", ["owner", "test", "a".repeat(64)]);
	owner.send("create", "owner", "Owner", "caocao");
	owner.send("config", { gameStarted: true, observe: false });
	await until(() => owner.messages.some(m => m[0] === "createroom"));
	const guest = await connect();
	guest.send("key", ["guest", "test", "b".repeat(64)]);
	guest.send("enter", "owner", "Guest", "caocao");
	await until(() => guest.messages.some(m => m[0] === "enterroomfailed"));
	const observer = await connect();
	const snapshot = await until(() => observer.messages.find(m => m[0] === "roomlist"));
	assert.equal(snapshot[1][0][3], 1);
	assert.equal(snapshot[3].find(c => c[0] === "Guest")[2], true);
	assert.ok(snapshot[3].every(c => c[5] !== "owner"));
	observer.send("key", ["owner", "test", "c".repeat(64)]);
	await until(() => observer.ws.readyState === WebSocket.CLOSED);
	owner.ws.close();
	await until(() => owner.ws.readyState === WebSocket.CLOSED);
	const impostor = await connect();
	impostor.send("key", ["owner", "test", "d".repeat(64)]);
	await until(() => impostor.ws.readyState === WebSocket.CLOSED);
	const valid = await connect();
	valid.send("key", ["owner", "test", "a".repeat(64)]);
	valid.send("create", "owner", "Owner", "caocao");
	await until(() => valid.messages.some(m => m[0] === "createroom"));
});

test("corrupt configuration is normalized and invalid imports never open a transaction", () => {
	const cfg = { characters: "bad", mode_config: null, all: [], hiddenModePack: {} };
	simplifyConfig(cfg);
	assert.deepEqual(cfg.characters, []);
	assert.equal(cfg.mode, "identity");
	for (const save of [{ config: [], data: {} }, { config: { characters: "bad" }, data: {} }, JSON.parse('{"config":{"__proto__":{}},"data":{}}')]) {
		assert.throws(() => validateSave(save));
		assert.throws(() =>
			importSave(
				{
					transaction() {
						assert.fail("must validate first");
					},
				},
				save
			)
		);
	}
});

function method(file, className, name) {
	const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
	return source.statements
		.find(node => ts.isClassDeclaration(node) && node.name.text === className)
		.members.find(node => node.name?.getText(source) === name)
		.getText(source);
}

test("rejected game events always release their event stack", async () => {
	const stack = [];
	const start = method("apps/core/noname/library/element/gameEvent.ts", "GameEvent", "start");
	const source = `new class { #start; manager={setStatusEvent:event=>stack.push(event),popStatusEvent:()=>stack.pop()}; async loop(){throw new Error("failed")}; ${start} }`;
	const event = vm.runInNewContext(ts.transpile(source), { stack, game: { getGlobalHistory: () => [] } });
	await assert.rejects(event.start(), /failed/);
	assert.equal(stack.length, 0);
});

test("database writes resolve at transaction completion and reject transaction abort", async () => {
	const putDB = method("apps/core/noname/game/index.js", "Game", "putDB");
	for (const abort of [false, true]) {
		const request = {};
		const transaction = { objectStore: () => ({ put: () => request }) };
		const lib = { db: { transaction: () => transaction }, status: { reload: 0 } };
		let cleaned = 0,
			settled = false;
		const game = {
			reload2: () => {
				cleaned++;
			},
		};
		const instance = vm.runInNewContext(`new class { ${putDB} }`, { lib, game, _status: {}, structuredClone });
		const result = instance.putDB("config", "key", "value");
		result.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			}
		);
		request.onsuccess({ type: "success" });
		await Promise.resolve();
		assert.equal(settled, false);
		if (abort) {
			transaction.onabort({ type: "abort" });
			await assert.rejects(result);
		} else {
			transaction.oncomplete();
			await result;
		}
		assert.equal(cleaned, 1);
	}
});

test("desktop LAN bridge forwards bounded messages without exposing native sockets", async t => {
	const host = new DirectHost(0),
		events = [];
	t.after(() => host.stop());
	await host.start(event => events.push(event));
	const socket = new WebSocket(`ws://127.0.0.1:${host.port}`);
	t.after(() => socket.terminate());
	await once(socket, "open");
	const until = async fn => {
		for (let i = 0; i < 200; i++) {
			const found = fn();
			if (found) return found;
			await new Promise(resolve => setTimeout(resolve, 10));
		}
		throw new Error("Bridge timeout");
	};
	const connection = await until(() => events.find(event => event.type === "connection"));
	assert.equal(Object.keys(connection).length, 2);
	socket.send("client-message");
	await until(() => events.find(event => event.type === "message" && event.data === "client-message"));
	const incoming = once(socket, "message");
	host.send(connection.id, "host-message");
	assert.equal(String((await incoming)[0]), "host-message");
	host.close(connection.id);
	await until(() => events.find(event => event.type === "close"));
});
