import test from "node:test";
import assert from "node:assert/strict";
import { resetUserData } from "../apps/core/noname/util/reset.js";
import { lobbyCredential } from "../apps/core/noname/util/session.js";
test("ordinary reset retains identity with per-lobby credentials", async () => {
	const values = new Map([["audit_key", "existing-identity"]]);
	const storage = {
		get length() {
			return values.size;
		},
		key: i => [...values.keys()][i],
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: key => values.delete(key),
	};
	lobbyCredential(storage, "audit_", "ws://127.0.0.1:8082");
	const before = { identityPresent: values.has("audit_key"), legacySecretPresent: values.has("audit_session_secret"), accountsPresent: values.has("audit_session_accounts") };
	let request;
	const done = resetUserData({
		prefix: "audit_",
		storage,
		database: {
			deleteDatabase() {
				return (request = {});
			},
		},
	});
	request.onsuccess();
	await done;
	assert.equal(before.legacySecretPresent, false);
	assert.equal(values.get("audit_key"), "existing-identity");
	assert.ok(values.has("audit_session_accounts"));
});
