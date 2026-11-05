import { WebSocket } from "ws";

export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export function boundedSend(socket: WebSocket, data: string) {
	if (socket.readyState !== WebSocket.OPEN) return;
	if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES || socket.bufferedAmount + Buffer.byteLength(data) > MAX_BUFFER_BYTES) {
		socket.terminate();
		return;
	}
	socket.send(data, error => {
		if (error) socket.terminate();
	});
}

/** Bound both dispatch work and byte/IPC work, including queued messages. */
export function messageBudget(now = Date.now) {
	let start = now(),
		count = 0,
		bytes = 0;
	return (size: number) => {
		if (now() - start >= 1000) {
			start = now();
			count = 0;
			bytes = 0;
		}
		bytes += size;
		return ++count <= 200 && bytes <= 8 * 1024 * 1024;
	};
}

/** Public lobby metadata accepts bounded JSON data only, never encoded executable values. */
export function publicConfig(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	if (Buffer.byteLength(JSON.stringify(value)) > 16 * 1024) return null;
	let nodes = 0;
	const visit = (item: unknown, depth: number): boolean => {
		if (++nodes > 1000 || depth > 8) return false;
		if (typeof item === "string") return item.length <= 2000 && !item.startsWith("_noname_func:");
		if (item === null || typeof item === "boolean") return true;
		if (typeof item === "number") return Number.isFinite(item);
		if (typeof item !== "object") return false;
		if (Array.isArray(item)) return item.length <= 100 && item.every(entry => visit(entry, depth + 1));
		return Object.entries(item).every(([key, entry]) => key.length <= 100 && !["__proto__", "prototype", "constructor"].includes(key) && visit(entry, depth + 1));
	};
	return visit(value, 0) ? (value as Record<string, unknown>) : null;
}
