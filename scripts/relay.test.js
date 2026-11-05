import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { createServer } from "../packages/server/src/server/createServer.ts";
import { WebSocket } from "../packages/server/node_modules/ws/wrapper.mjs";
test("oversized relay envelope closes its source and preserves the room owner", async () => {
	const reserve = net.createServer();
	reserve.listen(0, "127.0.0.1");
	await once(reserve, "listening");
	const port = reserve.address().port;
	await new Promise(r => reserve.close(r));
	const server = createServer({ port, host: "127.0.0.1" });
	await server.start();
	const sockets = [];
	const until = async fn => {
		for (let n = 0; n < 300; n++) {
			if (fn()) return;
			await new Promise(r => setTimeout(r, 10));
		}
		throw Error("Timed out");
	};
	async function connect(id) {
		const ws = new WebSocket(`ws://127.0.0.1:${port}`),
			messages = [];
		sockets.push(ws);
		ws.on("error", () => {});
		ws.on("message", data => {
			try {
				messages.push(JSON.parse(String(data)));
			} catch {}
		});
		await once(ws, "open");
		const send = (...a) => ws.send(JSON.stringify(["server", ...a]));
		send("key", [id, "audit", "a".repeat(64)]);
		return { ws, messages, send };
	}
	try {
		const owner = await connect("audit-owner");
		owner.send("create", "audit-owner", "Owner", "caocao");
		owner.send("config", { gameStarted: false });
		await until(() => owner.messages.some(m => m[0] === "createroom"));
		const guest = await connect("audit-guest");
		guest.send("enter", "audit-owner", "Guest", "caocao");
		await until(() => owner.messages.some(m => m[0] === "onconnection"));
		const raw = JSON.stringify(["audit", "\\".repeat(300000)]);
		const wrapped = JSON.stringify(["onmessage", owner.messages.find(m => m[0] === "onconnection")[1], raw]);
		guest.ws.send(raw);
		await until(() => guest.ws.readyState === WebSocket.CLOSED);
		assert.equal(owner.ws.readyState, WebSocket.OPEN);
		assert.ok(Buffer.byteLength(raw) < 1048576 && Buffer.byteLength(wrapped) > 1048576);
	} finally {
		for (const s of sockets) s.terminate();
		await server.stop();
	}
});
