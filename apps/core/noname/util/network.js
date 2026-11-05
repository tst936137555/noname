/** Normalize user addresses inside the connection error boundary. */
export function socketAddress(address, secure = false) {
	const input = address.trim();
	if (!input || input.length > 2048) throw new Error("无效联机地址");
	const explicit = /^wss?:\/\//i.test(input);
	if (/^[a-z][\w+.-]*:\/\//i.test(input) && !explicit) throw new Error("无效联机协议");
	const bareIPv6 = !explicit && input.includes(":") && !input.includes("[") && input.split(":").length > 2;
	const url = new URL(explicit ? input : `${secure ? "wss" : "ws"}://${bareIPv6 ? "[" + input + "]" : input}`);
	if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error("无效联机地址");
	if (!explicit && !url.port) url.port = "8080";
	return url.href;
}

/** Validate the transport envelope before restoring engine objects or functions. */
export function parseWireMessage(value, handlers) {
	const text = String(value);
	if (text.length > 1024 * 1024 || new TextEncoder().encode(text).length > 1024 * 1024) throw new Error("联机消息过大");
	const message = JSON.parse(text);
	if (!Array.isArray(message) || typeof message[0] !== "string" || !Object.hasOwn(handlers, message[0]) || typeof handlers[message[0]] !== "function") throw new Error("未知联机命令");
	let nodes = 0;
	const visit = (item, depth) => {
		if (++nodes > 50000 || depth > 32) throw new Error("联机消息结构超出限制");
		if (!item || typeof item !== "object") return;
		for (const [key, entry] of Object.entries(item)) {
			if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("不安全的联机字段");
			visit(entry, depth + 1);
		}
	};
	visit(message, 0);
	return message;
}
