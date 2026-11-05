import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import type { ServerInstance, ServerOptions } from "../types";
import { Credentials } from "../credentials";
import { boundedSend, messageBudget, publicConfig, MAX_MESSAGE_BYTES } from "../transport";
const DISPLAY_ESCAPES: Readonly<Record<string, string>> = { "<": "＜", ">": "＞", '"': "＂", "'": "＇", "`": "｀", "&": "＆" };

interface Client extends WebSocket {
	wsid: string;
	nickname: string;
	avatar: string;
	clientIp: string;
	onlineKey?: string;
	status?: string;
	owner?: Client;
	room?: Room;
	servermode?: boolean;
	beat?: boolean;
	keyCheck?: NodeJS.Timeout;
	heartbeat?: NodeJS.Timeout;
}

interface Room {
	key: string;
	owner?: Client;
	config?: any;
	servermode?: boolean;
}

interface EventItem {
	id: string;
	creator: string;
	nickname: string;
	avatar: string;
	utc: number;
	day: number;
	hour: number;
	content: string;
	members: string[];
}

export function createServer(options: ServerOptions = {}): ServerInstance {
	const port = options.port ?? 8082;

	const clients = new Map<string, Client>();
	const rooms = new Map<string, Room>();
	const events: EventItem[] = [];

	const credentials = new Credentials(options.credentialDirectory);
	const registrationWindows = new Map<string, { start: number; count: number }>();
	const bannedKeys = new Set<string>();
	const bannedIps = new Set<string>();
	const bannedKeyWords: string[] = [];

	let wss: WebSocketServer | undefined;
	let broadcastTimer: NodeJS.Timeout | undefined;
	let eventTimer: NodeJS.Timeout | undefined;
	let roomsDirty = false;
	const broadcast = () => {
		broadcastTimer = undefined;
		const list = util.buildClientList();
		const message = JSON.stringify(roomsDirty ? ["updaterooms", util.buildRoomList(), list] : ["updateclients", list]);
		roomsDirty = false;
		clients.forEach(client => {
			if (!client.room && client.onlineKey) boundedSend(client, message);
		});
	};
	const scheduleBroadcast = () => {
		if (!broadcastTimer) broadcastTimer = setTimeout(broadcast, 100);
	};

	const clearClientTimers = (client: Client) => {
		clearTimeout(client.keyCheck);
		clearInterval(client.heartbeat);
	};

	const util = {
		text(str: string, max: number) {
			return Array.from(str.slice(0, max), character => (character.charCodeAt(0) < 32 ? " " : DISPLAY_ESCAPES[character] || character)).join("");
		},
		avatar(value: unknown) {
			return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : "caocao";
		},
		nickname(str: any): string {
			return typeof str === "string" ? util.text(str, 12) : "无名玩家";
		},

		isBanned(str: string): boolean {
			return bannedKeyWords.some(k => str.includes(k));
		},

		sendl(client: Client, ...args: any[]) {
			try {
				boundedSend(client, JSON.stringify(args));
			} catch {
				client.terminate();
			}
		},

		newId(): string {
			return randomUUID();
		},

		buildRoomList(): any[] {
			const roomList: any[] = [];
			const clientCount = new Map<string, number>();

			// init counter
			rooms.forEach((room, key) => clientCount.set(key, 0));

			// count clients per room
			clients.forEach(c => {
				if (c.room && !c.servermode) {
					const key = c.room.key;
					clientCount.set(key, (clientCount.get(key) || 0) + 1);
				}
			});

			// build output list
			rooms.forEach((room, key) => {
				const count = clientCount.get(key) || 0;
				if (room.servermode) {
					roomList.push("server");
				} else if (room.owner && room.config) {
					if (count === 0) {
						util.sendl(room.owner, "reloadroom");
					}
					roomList.push([room.owner.nickname, room.owner.avatar, room.config, count, room.key]);
				}
			});

			return roomList;
		},

		buildClientList(): any[] {
			const out: any[] = [];
			clients.forEach(c => {
				out.push([c.nickname, c.avatar, !c.room, c.status, c.wsid, c.wsid]);
			});
			return out;
		},

		updateRooms() {
			roomsDirty = true;
			scheduleBroadcast();
		},

		updateClients() {
			scheduleBroadcast();
		},

		checkEvents() {
			const now = Date.now();
			for (let i = 0; i < events.length; i++) {
				if (events[i].utc <= now) {
					events.splice(i--, 1);
				}
			}
			return events;
		},

		updateEvents() {
			if (eventTimer) return;
			eventTimer = setTimeout(() => {
				eventTimer = undefined;
				util.checkEvents();
				clients.forEach(c => { if (!c.room && c.onlineKey) util.sendl(c, "updateevents", events); });
			}, 100);
		},
	};

	const handlers: Record<string, (client: Client, ...args: any[]) => void> = {
		create(client: Client, key: string, nickname: string, avatar: string, config: any, mode: string) {
			if (client.onlineKey !== key || client.room || rooms.has(key)) return util.sendl(client, "enterroomfailed");
			if (rooms.size >= 128) return util.sendl(client, "denied", "capacity");

			client.nickname = util.nickname(nickname);
			client.avatar = util.avatar(avatar);

			const room: Room = { key, owner: client };
			rooms.set(key, room);

			client.room = room;
			delete client.status;

			util.sendl(client, "createroom", key);
			util.updateRooms();
		},

		enter(client: Client, key: string, nickname: string, avatar: string) {
			const room = rooms.get(key);
			if (!room || client.room) return util.sendl(client, "enterroomfailed");

			client.nickname = util.nickname(nickname);
			client.avatar = util.avatar(avatar);

			if (!room.owner) return util.sendl(client, "enterroomfailed");

			if (!room.config || (room.config.gameStarted && (!room.config.observe || !room.config.observeReady))) {
				return util.sendl(client, "enterroomfailed");
			}

			client.room = room;
			delete client.status;
			client.owner = room.owner;
			util.sendl(room.owner, "onconnection", client.wsid);
			util.updateRooms();
		},

		changeAvatar(client: Client, nickname: string, avatar: string) {
			client.nickname = util.nickname(nickname);
			client.avatar = util.avatar(avatar);
			util.updateClients();
		},

		async key(client: Client, id: any) {
			if (client.onlineKey) return;
			if (!Array.isArray(id) || typeof id[0] !== "string" || !id[0] || id[0].length > 128 || (client.onlineKey && client.onlineKey !== id[0]) || [...clients.values()].some(other => other !== client && other.onlineKey === id[0])) {
				util.sendl(client, "denied", "key");
				return client.terminate();
			}
			if (typeof id[2] !== "string" || id[2].length < 32 || id[2].length > 256) return client.close(1008, "Session credential required");
			const credential = createHash("sha256").update(id[2]).digest("hex");
			const existing = await credentials.get(id[0]);
			if (client.readyState !== WebSocket.OPEN || [...clients.values()].some(other => other !== client && other.onlineKey === id[0])) return client.close(1008, "Identity already connected");
			if (existing && existing !== credential) return client.close(1008, "Invalid credential");
			if (!existing) {
				const now = Date.now();
				for (const [ip, window] of registrationWindows) if (now - window.start >= 60000) registrationWindows.delete(ip);
				const window = registrationWindows.get(client.clientIp) || { start: now, count: 0 };
				if (window.count >= 60 || (!registrationWindows.has(client.clientIp) && registrationWindows.size >= 1000)) return client.close(1013, "Registration rate limit");
				window.count++;
				registrationWindows.set(client.clientIp, window);
				await credentials.register(id[0], credential);
			}
			if (bannedKeys.has(id[0])) {
				// Reject this identity without penalizing other users behind the same NAT.
				return client.terminate();
			}
			client.onlineKey = id[0];
			clearTimeout(client.keyCheck);
		},

		events(client: Client, cfg: any, id: string, type: string) {
			if (bannedKeys.has(id) || typeof id !== "string" || client.onlineKey !== id) {
				// Reject this identity without penalizing other users behind the same NAT.
				client.close();
				return;
			}

			let changed = false;
			const now = Date.now();

			if (typeof cfg === "string") {
				// join / leave existing event
				for (let ev of events) {
					if (ev.id === cfg) {
						if (type === "join" && !ev.members.includes(id)) {
							if (ev.members.length >= 1000) return;
						ev.members.push(id);
							changed = true;
						}
						if (type === "leave") {
							const idx = ev.members.indexOf(id);
							if (idx !== -1) {
								ev.members.splice(idx, 1);
								if (ev.members.length === 0) {
									const index = events.indexOf(ev);
									events.splice(index, 1);
								}
								changed = true;
							}
						}
					}
				}
			} else if (cfg && typeof cfg === "object" && "utc" in cfg && "day" in cfg && "hour" in cfg && "content" in cfg) {
				if (typeof cfg.content !== "string" || cfg.content.length > 2000 || !Number.isFinite(cfg.utc) || !Number.isInteger(cfg.day) || !Number.isInteger(cfg.hour)) return;
				if (events.length >= 20) util.sendl(client, "eventsdenied", "total");
				else if (cfg.utc <= now || cfg.utc > now + 30 * 86400000) util.sendl(client, "eventsdenied", "time");
				else if (util.isBanned(cfg.content)) util.sendl(client, "eventsdenied", "ban");
				else {
					const item: EventItem = {
						utc: cfg.utc,
						day: cfg.day,
						hour: cfg.hour,
						content: util.text(cfg.content, 2000),
						nickname: util.nickname(cfg.nickname),
						avatar: util.avatar(cfg.avatar),
						creator: id,
						id: util.newId(),
						members: [id],
					};
					events.unshift(item);
					changed = true;
				}
			}

			if (changed) util.updateEvents();
		},

		config(client: Client, config: any) {
			const room = client.room;
			if (!room || room.owner !== client) return;

			if (room.servermode) {
				room.servermode = false;
			}
			const safe = publicConfig(config);
			if (!safe) return;
			let lobbyBytes = Buffer.byteLength(JSON.stringify(safe));
			for (const other of rooms.values()) if (other !== room && other.config) lobbyBytes += Buffer.byteLength(JSON.stringify(other.config));
			if (lobbyBytes > 256 * 1024) return util.sendl(client, "denied", "capacity");
			room.config = safe;
			util.updateRooms();
		},

		status(client: Client, str: any) {
			if (typeof str === "string") client.status = util.text(str, 64);
			else delete client.status;
			util.updateClients();
		},

		send(client: Client, id: string, message: string) {
			if (typeof id !== "string" || typeof message !== "string") return;
			const target = clients.get(id);
			if (target && target.owner === client) {
				try {
					boundedSend(target, message);
				} catch {
					target.close();
				}
			}
		},

		close(client: Client, id: string) {
			const target = clients.get(id);
			if (target && target.owner === client) target.close();
		},
	};

	const handleConnection = (ws: WebSocket, req: IncomingMessage) => {
		const client = ws as Client;
		client.on("error", () => client.terminate());
		if (clients.size >= 1000) return client.terminate();
		const ip = req.socket.remoteAddress ?? "";

		// ban check
		if (bannedIps.has(ip)) {
			util.sendl(client, "denied", "banned");
			return setTimeout(() => ws.terminate(), 500);
		}

		client.wsid = util.newId();
		client.clientIp = ip;
		clients.set(client.wsid, client);

		client.keyCheck = setTimeout(() => {
			util.sendl(client, "denied", "key");
			setTimeout(() => client.terminate(), 500);
		}, 2000);

		util.sendl(client, "roomlist", util.buildRoomList(), util.checkEvents(), util.buildClientList(), client.wsid);

		// heartbeat
		client.heartbeat = setInterval(() => {
			if (client.beat) {
				client.close();
				clearInterval(client.heartbeat);
				return;
			}
			client.beat = true;
			try {
				client.send("heartbeat");
			} catch {
				client.terminate();
			}
		}, 60000);

		// message handler
		const budget = messageBudget();
		let dispatch = Promise.resolve();
		let pending = 0;
		let pendingBytes = 0;
		client.on("message", msg => {
			if (client.readyState !== WebSocket.OPEN) return;
			const raw = msg.toString();
			if (!budget(Buffer.byteLength(raw))) return client.close(1008, "Rate limit");
			if (raw === "heartbeat") {
				client.beat = false;
				return;
			}

			// forward from slave to owner
			if (client.owner) {
				util.sendl(client.owner, "onmessage", client.wsid, raw);
				return;
			}

			let arr: any[];
			try {
				arr = JSON.parse(raw);
				if (!Array.isArray(arr)) throw new Error();
			} catch {
				util.sendl(client, "denied", "banned");
				return;
			}

			if (arr.shift() !== "server") return;

			const type = arr.shift();
			if (typeof type !== "string" || !Object.hasOwn(handlers, type)) return;
			const size = Buffer.byteLength(raw);
			if (pending >= 64 || pendingBytes + size > 4 * 1024 * 1024) return client.close(1008, "Dispatch backlog");
			pending++;
			pendingBytes += size;
			dispatch = dispatch.then(async () => {
				if (client.readyState !== WebSocket.OPEN || (type !== "key" && !client.onlineKey)) return;
				await handlers[type](client, ...arr);
			}).catch(() => { client.close(1008, "Invalid message"); }).finally(() => { pending--; pendingBytes -= size; });
		});

		// disconnect handler
		client.on("close", () => {
			clearClientTimers(client);

			// remove rooms owned by this client
			rooms.forEach((room, key) => {
				if (room.owner === client) {
					// notify all clients in this room
					clients.forEach(c => {
						if (c.room === room && c !== client) {
							delete c.room;
							delete c.owner;
							util.sendl(c, "selfclose");
						}
					});
					rooms.delete(key);
				}
			});

			// notify owner if client was slave
			if (client.owner) util.sendl(client.owner, "onclose", client.wsid);

			clients.delete(client.wsid);

			if (client.room) util.updateRooms();
			else util.updateClients();
		});
	};

	return {
		start() {
			if (wss) return Promise.resolve();

			return new Promise<void>((resolve, reject) => {
				const server = new WebSocketServer({ port, host: options.host, maxPayload: MAX_MESSAGE_BYTES });

				const handleError = (error: Error) => {
					server.off("listening", handleListening);
					server.off("connection", handleConnection);
					wss = undefined;
					reject(error);
				};
				const handleListening = () => {
					server.on("error", error => console.error("WebSocket server error", error));
					resolve();
				};

				server.once("error", handleError);
				server.once("listening", handleListening);
				server.on("connection", handleConnection);
				wss = server;
			});
		},

		stop() {
			clearTimeout(eventTimer);
			eventTimer = undefined;
			clearTimeout(broadcastTimer);
			broadcastTimer = undefined;
			if (!wss) return Promise.resolve();

			const server = wss;
			wss = undefined;

			const curClients = [...clients];
			for (const [_, client] of curClients) {
				clearClientTimers(client);
				client.terminate();
			}

			return new Promise<void>((resolve, reject) => {
				server.close(error => {
					if (error) reject(error);
					else resolve();
				});
			});
		},
	};
}
