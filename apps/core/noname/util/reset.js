/** Delete only this installation's data and keep its authenticated network identity. */
export async function resetUserData({ prefix, db, storage = localStorage, database = indexedDB, onBlocked = () => {} }) {
	if (!prefix) throw new Error("缺少存档命名空间");
	const identity = ["key", "session_secret"].map(key => storage.getItem(prefix + key));
	db?.close();
	await new Promise((resolve, reject) => {
		const request = database.deleteDatabase(prefix + "data");
		request.onsuccess = () => resolve(undefined);
		request.onerror = () => reject(request.error || new Error("无法删除存档数据库"));
		// A blocked delete cannot be cancelled: keep waiting rather than report failure
		// and allow the same request to silently delete data later.
		request.onblocked = onBlocked;
	});
	const keep = new Set([prefix + "legacy_config_import"]);
	if (identity.every(Boolean)) for (const key of ["key", "session_secret"]) keep.add(prefix + key);
	for (let i = storage.length - 1; i >= 0; i--) {
		const key = storage.key(i);
		if (key?.startsWith(prefix) && !keep.has(key)) storage.removeItem(key);
	}
}

let resetting = false;

export function clearReconnectData(db) {
	if (!db) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("config", "readwrite");
		for (const key of ["reconnect_info", "tmp_owner_roomId", "tmp_user_roomId"]) tx.objectStore("config").delete(key);
		tx.oncomplete = () => resolve(undefined);
		tx.onerror = tx.onabort = () => reject(tx.error || new Error("无法清除旧连接状态"));
	});
}

/** @param {{prefix: string, db?: IDBDatabase, storage?: Storage}} options */
export async function resetNetworkIdentity({ prefix, db, storage = localStorage }) {
	await clearReconnectData(db);
	for (const key of ["key", "session_secret", "directstart"]) storage.removeItem(prefix + key);
}

/** All user-facing reset entry points share the same completion and failure handling. */
export async function confirmReset(lib, game) {
	if (resetting) return;
	if (!confirm("将清空本游戏的设置、存档和录像，保留联机身份。建议先导出存档。是否继续？")) return;
	resetting = true;
	try {
		await resetUserData({ prefix: lib.configprefix, db: lib.db, onBlocked: () => alert("重置正在等待其它游戏窗口关闭，关闭后将自动完成。请勿重复重置。") });
		game.reload();
	} catch (error) {
		alert(`重置未完成：${error instanceof Error ? error.message : String(error)}。请重新加载后重试。`);
	} finally {
		resetting = false;
	}
}
