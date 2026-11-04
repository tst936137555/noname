import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
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
		const server = new WebSocketServer({ port: this.listenPort, maxPayload: 1024 * 1024 });
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
			let start = Date.now(),
				count = 0;
			socket.on("message", data => {
				if (Date.now() - start >= 1000) {
					start = Date.now();
					count = 0;
				}
				if (++count > 200) {
					socket.terminate();
					return;
				}
				notify({ type: "message", id, data: String(data) });
			});
			socket.on("close", () => {
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
		if (socket?.readyState !== WebSocket.OPEN) return;
		if (socket.bufferedAmount > 4 * 1024 * 1024) {
			socket.terminate();
			return;
		}
		socket.send(data, error => {
			if (error) socket.terminate();
		});
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
