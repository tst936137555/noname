import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
test("skill request rate limit refreshes after every accepted window", async () => {
	const path = "apps/core/noname/game/index.js";
	const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
	const method = source.statements
		.find(n => ts.isClassDeclaration(n) && n.name.text === "Game")
		.members.find(n => n.name?.getText(source) === "respondSkillData")
		.getText(source);
	let now = 1000,
		calls = 0;
	const context = vm.createContext({ Date: { now: () => now }, get: { info: () => ({ sync: { ping: () => ++calls } }) }, lib: { skill: { global: ["audit"] } } });
	const instance = vm.runInContext(`new class { #skillSyncTicks=new WeakMap(); SKILL_SYNC_RESULTS={TOO_MANY_REQUESTS:'rate-limit'}; ${method} }`, context);
	context.game = instance;
	const player = {};
	const results = [];
	for (const time of [1000, 1200, 1600, 1601, 1602]) {
		now = time;
		results.push({ time, result: await instance.respondSkillData("audit", player, { name: "audit", key: "ping", args: [], timeout: 5000 }) });
	}
	assert.deepEqual(
		results.map(x => x.result[0]),
		[true, false, true, false, false]
	);
	assert.equal(calls, 2);
});
