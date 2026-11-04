import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadAdapter(platform, modules, globals = {}) {
	const source = readFileSync(new URL(`../apps/mobile/src/platform/${platform}.ts`, import.meta.url), "utf8");
	const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
	const exports = {};
	vm.runInNewContext(outputText, {
		exports,
		console,
		require(name) {
			if (!(name in modules)) throw new Error(`Unexpected module: ${name}`);
			return modules[name];
		},
		...globals,
	});
	return exports;
}

const general = {
	joinFilePath: (...parts) => parts.join("/"),
	dataToBase64: async data => data,
};

test("Android 首次启动无需选择外部游戏目录，导出时才申请权限", async () => {
	const calls = [];
	const fs = {
		hasAccess: async () => (calls.push("check"), { granted: false }),
		requestAccess: async () => (calls.push("request"), { granted: true }),
		createDir: async ({ dir }) => calls.push(dir),
		writeFile: async ({ path }) => calls.push(path),
	};
	const adapter = loadAdapter("android", { "@capacitor/core": { registerPlugin: () => fs }, "./general": general });
	await adapter.initializeAndroid();
	assert.deepEqual(calls, []);
	const game = {};
	adapter.attachAndroidFileSystem(game);
	await new Promise((resolve, reject) => game.writeFile("data", "export", "save.txt", error => (error ? reject(error) : resolve())));
	assert.deepEqual(calls, ["check", "request", "export", "export/save.txt"]);
});

test("Android 拒绝导出权限时回调错误且不写文件", async () => {
	const fs = {
		hasAccess: async () => ({ granted: false }),
		requestAccess: async () => ({ granted: false }),
		createDir: async () => assert.fail("must not write after permission denial"),
	};
	const adapter = loadAdapter("android", { "@capacitor/core": { registerPlugin: () => fs }, "./general": general });
	await adapter.initializeAndroid();
	const game = {};
	adapter.attachAndroidFileSystem(game);
	const error = await new Promise(resolve => game.writeFile("data", "export", "save.txt", resolve));
	assert.match(error.message, /未授权导出目录/);
});

test("iOS 从安装包读取游戏文件，旧 Documents 文件不覆盖当前版本", async () => {
	const requests = [];
	const adapter = loadAdapter("ios", {
		"@capacitor/core": { registerPlugin: () => ({ stat: async () => ({ type: "file" }) }) },
		"@capacitor/filesystem": { Filesystem: new Proxy({}, { get: () => () => assert.fail("must read the installed game") }) },
		"./general": general,
	}, {
		fetch: async url => (requests.push(url), { ok: true, text: async () => "installed version" }),
	});
	const { fs } = adapter.initializeIos();
	assert.equal((await fs.statEntry({ entryName: "noname.js" })).type, "file");
	assert.equal((await fs.readFileAsText({ fileName: "noname.js" })).data, "installed version");
	assert.deepEqual(requests, ["capacitor://localhost/noname.js"]);
});
