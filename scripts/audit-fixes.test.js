import test from "node:test";
import assert from "node:assert/strict";
import { lobbyCredential, bindLobbyCredential, socketCredential } from "../apps/core/noname/util/session.js";
import { resizeCanvas } from "../apps/core/noname/util/render.js";
import { createServer } from "../packages/server/src/server/createServer.ts";
import { createRequire } from "node:module";
import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const { WebSocket } = createRequire(new URL("../packages/server/package.json", import.meta.url))("ws");

function skillMethod(file, skill, method, globals) {
	const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
	let object;
	function visit(node) {
		if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer) && node.name?.getText(source) === skill) object = node.initializer;
		ts.forEachChild(node, visit);
	}
	visit(source);
	const member = object.properties.find(node => node.name?.getText(source) === method);
	return vm.runInNewContext(`({${member.getText(source)}}).${method}`, globals);
}

test("redimeng AI retains its selected target after leaving the loop", () => {
	const player = { countCards: () => 3 }, ally = { countCards: () => 1 }, enemy = { countCards: () => 3 };
	const find = skillMethod("apps/core/character/shenhua/skill.js", "redimeng", "find", {
		_status: { event: { player } }, game: { filterPlayer: predicate => [player, ally, enemy].filter(predicate) },
		get: { attitude: (_player, target) => target === ally ? 5 : -5, value: () => 1 },
	});
	assert.equal(find(2), enemy);
});

test("zpaiyi resolves the selected card type before transferring it", async () => {
	const target = {}, card = {}, transfers = [];
	const content = skillMethod("apps/core/character/yijiang/skill.js", "zpaiyi", "content", { get: { type: () => "basic" } });
	await content({ cards: [card], targets: [target] }, {}, {
		give: async (...args) => transfers.push(args), chooseBool: () => ({ forResult: async () => ({ bool: false }) }),
	});
	assert.deepEqual(transfers, [[card, target, "give"]]);
});

test("junksijun finds a bounded sum in a large pile and gains cards once", async () => {
	const pile = Array.from({ length: 500 }, () => ({ number: 6 }));
	const gains = [];
	const content = skillMethod("apps/core/noname/library/skill-dependencies.js", "junksijun", "content", {
		ui: { cardPile: { childNodes: pile } }, get: { number: card => card.number },
	});
	await content({}, {}, { removeMark() {}, countMark: () => 1, gain: async value => gains.push(value) });
	assert.equal(gains.length, 1);
	assert.equal(gains[0].cards.reduce((sum, card) => sum + card.number, 0), 36);
});

test("lobby credentials migrate only to the known lobby and remain independent", () => {
	const data = new Map([["game_session_secret", "a".repeat(64)]]);
	const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
	const legacy = lobbyCredential(storage, "game_", "wss://trusted.test:8082/", "wss://trusted.test:8082/");
	const other = lobbyCredential(storage, "game_", "wss://other.test:8082/", "wss://trusted.test:8082/");
	assert.equal(legacy, "a".repeat(64));
	assert.notEqual(other, legacy);
	assert.equal(lobbyCredential(storage, "game_", "wss://other.test:8082/"), other);
	const firstSocket = {}, secondSocket = {};
	bindLobbyCredential(storage, "game_", firstSocket, "wss://trusted.test:8082/");
	bindLobbyCredential(storage, "game_", secondSocket, "wss://other.test:8082/");
	assert.equal(socketCredential(firstSocket), legacy);
	assert.equal(socketCredential(secondSocket), other);
	assert.throws(() => socketCredential({}), /未绑定/);
});

test("canvas uses device pixels while retaining CSS coordinates and bounded memory", () => {
	let transform;
	const context = { setTransform: (...args) => { transform = args; } };
	const canvas = { style: {}, getContext: () => context };
	resizeCanvas(canvas, 300, 150, 2);
	assert.deepEqual([canvas.width, canvas.height], [600, 300]);
	assert.deepEqual(transform, [2, 0, 0, 2, 0, 0]);
	assert.equal(canvas.style.width, "300px");
	resizeCanvas(canvas, 300, 150, 20);
	assert.equal(canvas.width, 1200);
});

test("invalid event identity cannot ban another connection sharing the same IP", async t => {
	const probe = createNetServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise(resolve => probe.close(resolve));
	const server = createServer({ port, host: "127.0.0.1" });
	await server.start();
	t.after(() => server.stop());
	const connect = async () => {
		const socket = new WebSocket(`ws://127.0.0.1:${port}`);
		t.after(() => socket.terminate());
		const messages = [];
		socket.on("message", value => messages.push(JSON.parse(String(value))));
		await once(socket, "open");
		return { socket, messages };
	};
	const first = await connect();
	first.socket.send(JSON.stringify(["server", "key", ["audit-one", "test", "a".repeat(64)]]));
	first.socket.send(JSON.stringify(["server", "events", {}, "wrong-identity", "join"]));
	await once(first.socket, "close");
	const second = await connect();
	second.socket.send(JSON.stringify(["server", "key", ["audit-two", "test", "b".repeat(64)]]));
	second.socket.send(JSON.stringify(["server", "create", "audit-two", "Player", "caocao"]));
	for (let i = 0; i < 100 && !second.messages.some(message => message[0] === "createroom"); i++) await new Promise(resolve => setTimeout(resolve, 10));
	assert.ok(second.messages.some(message => message[0] === "createroom"));
});
