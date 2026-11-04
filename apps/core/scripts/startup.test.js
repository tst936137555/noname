import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { modes, simplifyConfig } from "../noname/util/product.js";
import { preloadFont, preloadImage, runStartupTasks, startupImages } from "../noname/init/startup.js";

test("预加载限制并发，每个任务只执行一次，进度在任务完成后递增", async () => {
	let active = 0;
	let peak = 0;
	const loaded = [];
	const progress = [];
	const tasks = Array.from({ length: 12 }, (_, index) => ({
		label: String(index),
		async load() {
			peak = Math.max(peak, ++active);
			await new Promise(resolve => setTimeout(resolve, index % 3));
			loaded.push(index);
			active--;
		},
	}));
	await runStartupTasks(tasks, (completed, total) => progress.push([completed, total]), 3);
	assert.equal(peak, 3);
	assert.deepEqual(
		loaded.sort((a, b) => a - b),
		Array.from({ length: 12 }, (_, index) => index)
	);
	assert.deepEqual(
		progress,
		Array.from({ length: 12 }, (_, index) => [index + 1, 12])
	);
	const ordered = [];
	await runStartupTasks(
		tasks.map(task => ({ ...task, load: async () => ordered.push(task.label) })),
		() => {},
		1
	);
	assert.deepEqual(
		ordered,
		tasks.map(task => task.label)
	);
});

test("必要内容失败会阻止进入游戏；可选素材失败和空队列可以完成", async t => {
	const finished = [];
	await assert.rejects(
		runStartupTasks(
			[
				{
					label: "武将包",
					load: async () => {
						throw new Error("缺失文件");
					},
				},
				{ label: "卡牌包", load: async () => finished.push("cards") },
			],
			() => {}
		),
		/武将包：缺失文件/
	);
	assert.deepEqual(finished, ["cards"]);
	t.mock.method(console, "warn", () => {});
	await runStartupTasks(
		[
			{
				label: "封面",
				optional: true,
				load: async () => {
					throw new Error("404");
				},
			},
		],
		() => {}
	);
	assert.equal(console.warn.mock.callCount(), 1);
	await runStartupTasks([], () => assert.fail("空队列不应报告进度"));
});

test("图片预加载等待解码，缺失或超时后清理事件监听", async t => {
	const images = [];
	let decoded = false;
	const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
	t.after(() => {
		if (original) Object.defineProperty(globalThis, "Image", original);
		else delete globalThis.Image;
	});
	globalThis.Image = class {
		constructor() {
			images.push(this);
		}
		async decode() {
			decoded = true;
		}
	};
	const ready = preloadImage("ready.png");
	await images[0].onload();
	await ready;
	assert.ok(decoded);
	assert.equal(images[0].onload, null);
	const missing = preloadImage("missing.png");
	images[1].onerror();
	await assert.rejects(missing, /图片加载失败/);
	await assert.rejects(preloadImage("slow.png", 5), /图片加载超时/);
	assert.equal(images[2].onload, null);
	assert.equal(images[2].onerror, null);
});

test("预加载清单中的固定素材和所有模式封面存在", () => {
	for (const path of [...startupImages, ...modes.map(mode => `image/splash/style1/${mode}.jpg`)]) {
		assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), path);
	}
});

test("首次和旧存档都按需创建菜单，不影响已保存的游戏设置", () => {
	for (const oldSave of [false, true]) {
		const config = JSON.parse(fs.readFileSync(new URL("../game/config.json", import.meta.url), "utf8"));
		if (oldSave) {
			config.mode_config.identity.menu_loadondemand = false;
			config.mode_config.identity.player_number = 5;
			config.new_tutorial = false;
		}
		simplifyConfig(config);
		for (const mode of ["global", ...modes]) assert.equal(config.mode_config[mode].menu_loadondemand, true);
		if (oldSave) assert.equal(config.mode_config.identity.player_number, 5);
	}
});

test("字体预加载等待字体就绪，超时或失败后可回退", async t => {
	const original = Object.getOwnPropertyDescriptor(globalThis, "document");
	t.after(() => {
		if (original) Object.defineProperty(globalThis, "document", original);
		else delete globalThis.document;
	});
	const requested = [];
	globalThis.document = { fonts: { load: async font => requested.push(font) } };
	await preloadFont("xinwei");
	assert.deepEqual(requested, ['24px "xinwei"']);
	document.fonts.load = () => new Promise(() => {});
	await assert.rejects(preloadFont("slow", 5), /字体加载超时/);
	document.fonts.load = async () => {
		throw new Error("文件缺失");
	};
	await assert.rejects(preloadFont("missing"), /文件缺失/);
});

test("预热模式只加载模块，选择后才向引擎注册", async () => {
	let source = fs
		.readFileSync(new URL("../noname/init/import.ts", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "")
		.replace(/import\.meta\.env\.DEV/g, "false")
		.replaceAll('import(/* @vite-ignore */ path + ".js")', "loadTestModule(path)")
		.replaceAll('import(/* @vite-ignore */ path + ".ts")', "loadTestModule(path)");
	const registered = [];
	const imports = [];
	const context = vm.createContext({
		exports: {},
		modes,
		window: { isSecureContext: true },
		game: { import: async (...args) => registered.push(args) },
		loadTestModule: async path => {
			imports.push(path);
			return { type: "mode", default: { name: "identity" } };
		},
	});
	vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
	await context.exports.preloadMode("identity");
	assert.equal(registered.length, 0);
	await context.exports.importMode("identity");
	assert.equal(registered.length, 1);
	assert.equal(registered[0][0], "mode");
	assert.deepEqual(imports, ["/mode/identity", "/mode/identity"]);
	await assert.rejects(context.exports.preloadMode("unsupported"), /不支持/);
});
