const socketCredentials = new WeakMap();
export function bindLobbyCredential(storage, prefix, socket, address, legacyAddress) {
	socketCredentials.set(socket, lobbyCredential(storage, prefix, address, legacyAddress));
}
export function socketCredential(socket) {
	const credential = socketCredentials.get(socket);
	if (!credential) throw new Error("联机身份未绑定到当前连接");
	return credential;
}
/** A legacy credential migrates only to its previously saved lobby. New lobbies get independent secrets. */
export function lobbyCredential(storage, prefix, address, legacyAddress) {
	const origin = new URL(address).origin;
	let accounts;
	try { accounts = JSON.parse(storage.getItem(prefix + "session_accounts") || "{}"); } catch { accounts = {}; }
	if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) accounts = {};
	let secret = Object.hasOwn(accounts, origin) ? accounts[origin] : null;
	if (typeof secret === "string" && /^[a-f0-9]{64}$/.test(secret)) return secret;
	let legacyOrigin;
	try { legacyOrigin = new URL(legacyAddress).origin; } catch { /* No known old lobby. */ }
	const legacy = legacyOrigin === origin ? storage.getItem(prefix + "session_secret") : null;
	secret = legacy && /^[a-f0-9]{64}$/.test(legacy) ? legacy : Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
	Object.defineProperty(accounts, origin, { value: secret, enumerable: true, configurable: true });
	storage.setItem(prefix + "session_accounts", JSON.stringify(accounts));
	return secret;
}
