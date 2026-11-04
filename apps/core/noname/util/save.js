import defaults from "../../game/config.json" with { type: "json" };
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
		if (["function", "symbol", "bigint", "undefined"].includes(typeof value)) throw new Error("Save contains unsupported data");
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
export function importSave(db, save) {
	validateSave(save);
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["config", "data"], "readwrite");
		tx.oncomplete = () => resolve();
		tx.onerror = tx.onabort = () => reject(tx.error || new Error("Save transaction aborted"));
		const backup = { config: Object.create(null), data: Object.create(null) };
		let pending = 2;
		for (const name of ["config", "data"]) {
			const store = tx.objectStore(name);
			const cursor = store.openCursor();
			cursor.onsuccess = () => {
				const item = cursor.result;
				if (item) {
					if (item.key !== "__noname_import_backup__") backup[name][item.key] = item.value;
					item.continue();
					return;
				}
				if (--pending) return;
				try {
					for (const target of ["config", "data"]) {
						const output = tx.objectStore(target);
						output.clear();
						for (const [key, value] of Object.entries(save[target])) if (key !== "__noname_import_backup__") output.put(value, key);
					}
					tx.objectStore("data").put(backup, "__noname_import_backup__");
				} catch (error) {
					tx.abort();
					reject(error);
				}
			};
		}
	});
}
