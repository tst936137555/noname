import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { boundedSend, messageBudget, MAX_MESSAGE_BYTES } from "./transport";
export type HostEvent = { type: "connection" | "message" | "close"; id: string; data?: string };
/** Fixed-purpose desktop LAN host. No renderer-controlled ports or native objects. */
export class DirectHost {
	constructor(private listenPort = 8080) {}
	get port() {
		const address = this.server?.address();
		return typeof address === "object" && address ? address.port : undefined;
	}
	private server?: WebSocketServer;
	private sockets = new Map<string, WebSocket>();
	async start(notify: (event: HostEvent) => void) {
		if (this.server) throw new Error("Host already running");
		const server = new WebSocketServer({ port: this.listenPort, maxPayload: MAX_MESSAGE_BYTES });
		this.server = server;
		server.on("error", () => {});
		server.on("connection", socket => {
			if (this.sockets.size >= 24) {
				socket.terminate();
				return;
			}
			const id = randomUUID();
			this.sockets.set(id, socket);
			socket.on("error", () => socket.terminate());
			const budget = messageBudget();
			const admission = setTimeout(() => socket.terminate(), 10000);
			let alive = true;
			socket.on("pong", () => {
				alive = true;
			});
			const heartbeat = setInterval(() => {
				if (!alive) {
					socket.terminate();
					return;
				}
				alive = false;
				socket.ping();
			}, 30000);
			socket.on("message", data => {
				const message = String(data);
				if (!budget(Buffer.byteLength(message))) {
					socket.terminate();
					return;
				}
				try {
					if (JSON.parse(message)?.[0] === "init") clearTimeout(admission);
				} catch {
					/* Engine rejects malformed messages. */
				}
				notify({ type: "message", id, data: message });
			});
			socket.on("close", () => {
				clearTimeout(admission);
				clearInterval(heartbeat);
				this.sockets.delete(id);
				notify({ type: "close", id });
			});
			notify({ type: "connection", id });
		});
		try {
			await new Promise<void>((resolve, reject) => {
				server.once("listening", resolve);
				server.once("error", reject);
			});
		} catch (error) {
			this.server = undefined;
			server.close();
			throw error;
		}
	}
	send(id: unknown, data: unknown) {
		if (typeof id !== "string" || typeof data !== "string" || Buffer.byteLength(data) > 1024 * 1024) return;
		const socket = this.sockets.get(id);
		if (socket) boundedSend(socket, data);
	}
	close(id: unknown) {
		if (typeof id === "string") this.sockets.get(id)?.terminate();
	}
	stop() {
		for (const socket of this.sockets.values()) socket.terminate();
		this.sockets.clear();
		this.server?.close();
		this.server = undefined;
	}
}
