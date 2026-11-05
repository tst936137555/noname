import defaults from "../../game/config.json" with { type: "json" };
export const MAX_SAVE_BYTES = 32 * 1024 * 1024;
export const IMPORT_BACKUP_KEY = "__noname_import_backup__";
export const LEGACY_IMPORT_KEY = "__noname_legacy_import__";

const internalKey = key => key === IMPORT_BACKUP_KEY || key === LEGACY_IMPORT_KEY;

/** Read both stores at one transaction snapshot, excluding private recovery metadata. */
export function exportSave(db, version) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["config", "data"], "readonly");
		const save = { formatVersion: 1, gameVersion: version, createdAt: new Date().toISOString(), scope: ["config", "data"], config: Object.create(null), data: Object.create(null) };
		tx.onerror = tx.onabort = () => reject(tx.error || new Error("无法读取完整存档"));
		tx.oncomplete = () => {
			try {
				validateSave(save);
				resolve(save);
			} catch (error) {
				reject(error);
			}
		};
		for (const name of ["config", "data"]) {
			const request = tx.objectStore(name).openCursor();
			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) return;
				if (!internalKey(cursor.key)) save[name][cursor.key] = cursor.value;
				cursor.continue();
			};
		}
	});
}

export function checkSaveSize(text) {
	if (new Blob([text]).size > MAX_SAVE_BYTES) throw new Error("存档超过 32 MiB 限制，请先清理不需要的存档数据");
	return text;
}

/** Decode/validate a legacy file, and fall back to the existing database on any failure. */
export async function migrateLegacySave({ db, text, decode, previousHash, onWarning }) {
	try {
		checkSaveSize(text);
		const save = validateSave(JSON.parse(decode(text)));
		const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, "0")).join("");
		const stored = await new Promise((resolve, reject) => {
			const tx = db.transaction("data", "readonly");
			const request = tx.objectStore("data").get(LEGACY_IMPORT_KEY);
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = tx.onabort = () => reject(tx.error);
		});
		if (stored !== hash && previousHash !== hash) await importSave(db, save, hash);
		return hash;
	} catch (error) {
		onWarning(error);
	}
}
/** Validate before touching persistent data. Imported JSON must contain only data. */
export function validateSave(save) {
	const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
	if (!record(save) || !record(save.config) || !record(save.data)) throw new Error("Invalid save structure");
	if (save.formatVersion !== undefined && save.formatVersion !== 1) throw new Error("Unsupported save version");
	for (const [key, expected] of Object.entries(defaults)) {
		if (!(key in save.config) || expected === null) continue;
		const value = save.config[key];
		if (Array.isArray(expected) ? !Array.isArray(value) : typeof expected === "object" ? !record(value) : typeof value !== typeof expected) throw new Error(`Invalid setting: ${key}`);
	}
	const arrays = ["characters", "cards", "defaultcharacters", "defaultcards", "connect_characters", "connect_cards", "hiddenCharacterPack", "hiddenCardPack", "hiddenModePack", "extensions", "plays"];
	for (const key of arrays) if (key in save.config && (!Array.isArray(save.config[key]) || !save.config[key].every(item => typeof item === "string"))) throw new Error(`Invalid setting: ${key}`);
	for (const key of ["all", "mode_config"]) if (key in save.config && !record(save.config[key])) throw new Error(`Invalid setting: ${key}`);
	if ("mode" in save.config && typeof save.config.mode !== "string") throw new Error("Invalid mode");
	if (save.config.mode_config) for (const mode of Object.values(save.config.mode_config)) if (!record(mode)) throw new Error("Invalid mode configuration");
	const visit = (value, depth = 0) => {
		if (["function", "symbol", "bigint", "undefined"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Save contains unsupported data");
		if (depth > 50) throw new Error("Save is too deeply nested");
		if (value && typeof value === "object")
			for (const [key, item] of Object.entries(value)) {
				if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsafe save key");
				visit(item, depth + 1);
			}
	};
	visit(save);
	return save;
}

/** A single transaction either commits the full import and recovery snapshot, or changes nothing. */
/** @returns {Promise<void>} */
export function importSave(db, save, legacyHash) {
	validateSave(save);
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["config", "data"], "readwrite");
		tx.oncomplete = () => resolve();
		tx.onerror = tx.onabort = () => reject(tx.error || new Error("Save transaction aborted"));
		const backup = { config: Object.create(null), data: Object.create(null) };
		let existingLegacyHash;
		let pending = 2;
		for (const name of ["config", "data"]) {
			const store = tx.objectStore(name);
			const cursor = store.openCursor();
			cursor.onsuccess = () => {
				const item = cursor.result;
				if (item) {
					if (name === "data" && item.key === LEGACY_IMPORT_KEY) existingLegacyHash = item.value;
					if (!internalKey(item.key)) backup[name][item.key] = item.value;
					item.continue();
					return;
				}
				if (--pending) return;
				try {
					for (const target of ["config", "data"]) {
						const output = tx.objectStore(target);
						output.clear();
						for (const [key, value] of Object.entries(save[target])) if (!internalKey(key)) output.put(value, key);
					}
					tx.objectStore("data").put(backup, IMPORT_BACKUP_KEY);
					if (legacyHash || existingLegacyHash) tx.objectStore("data").put(legacyHash || existingLegacyHash, LEGACY_IMPORT_KEY);
				} catch (error) {
					tx.abort();
					reject(error);
				}
			};
		}
	});
}
