import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { characterPacks, cardPacks, modes, fixedAppearance, simplifyConfig, initializeModeConfig } from "../noname/util/product.js";
import { createSettingsPages, isSettingVisible } from "../noname/ui/create/menu/settings.js";
import { fitMenu } from "../noname/ui/create/menu/geometry.js";

const defaults = () => JSON.parse(fs.readFileSync(new URL("../game/config.json", import.meta.url)));

test("各模式首次迁移关闭自由选将，设置中主动开启后保持选择", () => {
	const config = defaults();
	config.mode_config.global.free_choose = true;
	config.mode_config.identity.free_choose = true;
	simplifyConfig(config);
	for (const mode of ["global", ...modes]) assert.equal(config.mode_config[mode].free_choose, false, mode);
	config.mode_config.identity.free_choose = true;
	simplifyConfig(config);
	assert.equal(config.mode_config.identity.free_choose, true);
	assert.equal(defaults().mode_config.global.free_choose, false);
});

test("位置编号随人数显示中文数字，并跟随换座和联机恢复更新", () => {
	const source = ts.createSourceFile("player.js", fs.readFileSync(new URL("../noname/library/element/player.js", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
	const declaration = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "Player");
	assert.ok(declaration && ts.isClassDeclaration(declaration));
	const members = declaration.members;
	const code = members.filter(node => ["seatNum", "getSeatNum", "updateSeatNumber"].includes(node.name?.getText(source) || "")).map(node => node.getText(source)).join("\n");
	const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
	const Player = vm.runInNewContext(`(class { dataset={};node={seatNumber:{}};${code} })`, { game: {}, _status: {}, get: { cnNumber: value => digits[value] } });
	for (const count of [2, 3, 4, 6, 8, 10]) {
		for (let position = 0; position < count; position++) {
			const player = new Player();
			player.dataset.position = String(position);
			player.updateSeatNumber();
			assert.equal(player.node.seatNumber.textContent, digits[position + 1]);
			player.seatNum = count - position;
			player.updateSeatNumber();
			assert.equal(player.node.seatNumber.textContent, digits[count - position]);
		}
	}
});

function classMember(file, className, memberName) {
	const source = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	return source.statements
		.find(node => ts.isClassDeclaration(node) && node.name?.text === className)
		.members.find(node => node.name?.getText(source) === memberName)
		.getText(source);
}

test("必要设置不包含固定外观、调试、作弊或资源管理入口", () => {
	const member = classMember("../noname/library/index.js", "Library", "configMenu");
	const configMenu = vm.runInNewContext(`new class { ${member} }().configMenu`);
	const pages = createSettingsPages(configMenu);
	assert.deepEqual(
		pages.map(page => page.name),
		["对局设置", "操作设置", "声音设置", "存档管理"]
	);
	const keys = pages.flatMap(page => Object.keys(page.config));
	for (const page of pages) {
		for (const [key, definition] of Object.entries(page.config)) {
			assert.ok(definition?.name, key);
			assert.equal(Object.hasOwn(fixedAppearance, key), false, key);
		}
	}
	for (const key of ["dev", "lucky_star", "ignore_error", "import_music", "reset_game", "hide_card_image", "show_name"]) assert.equal(keys.includes(key), false, key);
	for (const key of ["game_speed", "auto_confirm", "background_music", "volumn_audio", "export_data", "import_data", "import_data_button"]) assert.ok(keys.includes(key), key);
});

test("鼠标和触屏设置按设备及开关显示", () => {
	const desktop = { touchAvailable: false, device: undefined, node: false };
	const config = { touchscreen: false, hover_all: true, swipe: true };
	assert.ok(isSettingVisible("mousewheel", config, desktop));
	assert.ok(isSettingVisible("hoveration", config, desktop));
	assert.equal(isSettingVisible("swipe_down", config, desktop), false);
	assert.equal(isSettingVisible("touchscreen", config, desktop), false);
	assert.equal(isSettingVisible("enable_vibrate", config, desktop), false);
	config.hover_all = false;
	assert.equal(isSettingVisible("hoveration", config, desktop), false);
	config.touchscreen = true;
	const mobile = { touchAvailable: true, device: "android", node: false };
	assert.equal(isSettingVisible("mousewheel", config, mobile), false);
	assert.ok(isSettingVisible("swipe_down", config, mobile));
	assert.ok(isSettingVisible("enable_vibrate", config, mobile));
	config.swipe = false;
	assert.equal(isSettingVisible("swipe_down", config, mobile), false);
});

test("下拉菜单贴近锚点并在右侧、底部和窄屏边界内显示", () => {
	const bounds = { x: 300, y: 100, anchorLeft: 220, width: 120, height: 240, availableWidth: 800, availableHeight: 600 };
	assert.deepEqual(fitMenu(bounds), { left: 300, top: 100 });
	assert.deepEqual(fitMenu({ ...bounds, x: 740, anchorLeft: 650, y: 530 }), { left: 525, top: 350 });
	assert.deepEqual(fitMenu({ ...bounds, x: 250, anchorLeft: 12, availableWidth: 320, availableHeight: 200, height: 180 }), { left: 10, top: 10 });
});

test("运行时保存及旧存档迁移不能恢复自定义字体、隐藏卡面或布局", () => {
	const config = defaults();
	Object.assign(config, { cardtext_font: "xiaozhuan", hide_card_image: true, show_name: false, remember_dialog: true });
	simplifyConfig(config);
	const saved = [];
	const context = vm.createContext({
		lib: { config },
		fixedAppearance,
		modes,
		_status: {},
		save: (...args) => {
			saved.push(args);
			return Promise.resolve();
		},
	});
	vm.runInContext(`globalThis.game = new class { ${classMember("../noname/game/index.js", "Game", "saveConfig")} }();`, context);
	for (const [key, value] of [
		["cardtext_font", "xiaozhuan"],
		["layout", "mobile"],
		["hide_card_image", true],
		["show_name", false],
		["ui_zoom", "150%"],
	]) {
		context.game.saveConfig(key, value);
		assert.equal(config[key], fixedAppearance[key], key);
		assert.equal(saved.at(-1)[2], fixedAppearance[key], key);
	}
	context.game.saveConfig("volumn_audio", 3);
	assert.equal(config.volumn_audio, 3);
});

test("装备原牌、视为牌和红黑花色复用同一文字格式", () => {
	const label = {
		replaceChildren(...children) {
			this.children = children;
		},
	};
	const context = vm.createContext({
		document: { createElement: () => ({}) },
		lib: { color: { red: ["heart", "diamond"] } },
		get: { translation: suit => ({ heart: "♥", spade: "♠" })[suit] },
	});
	vm.runInContext(`globalThis.card = new class { ${classMember("../noname/library/element/card.js", "Card", "setEquipmentLabel")} }();`, context);
	context.card.node = { name2: label };
	context.card.setEquipmentLabel("诸葛连弩", "heart", "A", true);
	assert.equal(label.children[0].className, "equip-suit red");
	assert.equal(label.children[0].textContent, "♥");
	assert.equal(label.children[1].textContent, "A");
	assert.equal(label.children[3].textContent, "[诸葛连弩]");
	context.card.setEquipmentLabel("青釭剑", "spade", "6");
	assert.equal(label.children[0].className, "equip-suit");
	assert.equal(label.children[3].textContent, "青釭剑");
});

test("扩展导入不会执行代码，内置卡牌包仍可注册", async () => {
	const source = ts.createSourceFile("game.js", fs.readFileSync(new URL("../noname/game/index.js", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	const gameClass = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "Game");
	const method = gameClass.members.find(node => node.name?.getText(source) === "import");
	const context = vm.createContext({ lib: { imported: {} }, _status: {}, ui: {}, get: {}, ai: {} });
	vm.runInContext(`Array.prototype.add = function (value) { this.push(value); }; globalThis.game = new class { ${method.getText(source)} }();`, context);
	let executed = false;
	for (const type of ["extension", "play"]) {
		await assert.rejects(
			context.game.import(type, () => {
				executed = true;
			}),
			/不支持安装或加载扩展/
		);
	}
	assert.equal(executed, false);
	assert.deepEqual(Object.keys(context.lib.imported), []);
	const pack = { name: "standard", card: {} };
	await context.game.import("card", pack);
	assert.equal(context.lib.imported.card.standard, pack);
	assert.equal(context._status.importing.card.length, 1);
});

test("旧配置移除不支持的内容，并保留联网偏好和正常模式设置", () => {
	const config = defaults();
	Object.assign(config, {
		mode: "tafang",
		theme: "woodden",
		layout: "nova",
		skin: { caocao: 3 },
		characters: ["standard", "tw", "offline", "jsrg", "sxrm", "sixiang", "diy", "key", "mobile"],
		cards: ["standard", "xianxia"],
		extensions: ["英雄杀"],
		plays: ["boss"],
		connect_characters: ["tw", "mobile"],
		connect_nickname: "测试玩家",
		connect_address: "localhost:8080",
	});
	config.mode_config.versus = { versus_mode: "endless" };
	config.mode_config.guozhan = { aozhan: "normal" };
	simplifyConfig(config);
	assert.equal(config.mode, "identity");
	assert.deepEqual(config.characters, ["standard", "mobile"]);
	assert.deepEqual(config.cards, ["standard"]);
	assert.deepEqual(config.connect_characters, ["mobile"]);
	assert.equal(config.mode_config.versus.versus_mode, "two");
	assert.equal(config.mode_config.guozhan.aozhan, "normal");
	assert.equal(config.connect_nickname, "测试玩家");
	assert.equal(config.connect_address, "localhost:8080");
	assert.deepEqual(config.extensions, []);
	for (const [key, value] of Object.entries(fixedAppearance)) assert.deepEqual(config[key], value, key);
	const first = JSON.stringify(config);
	simplifyConfig(config);
	assert.equal(JSON.stringify(config), first);
});

test("旧更新与资源版本配置被清理，包体开关和存档数据继续保留", () => {
	const config = defaults();
	Object.assign(config, {
		asset_version: "v1.9",
		asset_image: false,
		asset_audio: false,
		auto_check_update: true,
		update_link: "github",
		updateURL: "https://example.invalid/",
		brokenFile: ["noname.js"],
		extension_sources: { old: "https://example.invalid/" },
		extension_auto_import: true,
		extension_old_enable: true,
		version_description_v1: { body: "旧版本" },
		characters: ["standard", "mobile"],
		cards: ["standard", "extra"],
		favouriteCharacter: ["caocao"],
	});
	simplifyConfig(config);
	for (const key of ["asset_version", "asset_image", "asset_audio", "auto_check_update", "update_link", "updateURL", "brokenFile", "extension_sources", "extension_auto_import", "extension_old_enable", "version_description_v1"]) {
		assert.equal(Object.hasOwn(config, key), false, key);
	}
	assert.deepEqual(config.characters, ["standard", "mobile"]);
	assert.deepEqual(config.cards, ["standard", "extra"]);
	assert.deepEqual(config.favouriteCharacter, ["caocao"]);
});

test("注册清单与构建白名单一致，标准模式可以继续启动", () => {
	const context = { window: {} };
	vm.runInNewContext(fs.readFileSync(new URL("../game/package.js", import.meta.url), "utf8"), context);
	const pack = context.window.noname_package;
	for (const [key, allowed] of [
		["character", characterPacks],
		["card", cardPacks],
		["mode", modes],
	]) {
		assert.deepEqual(Object.keys(pack[key]).sort(), [...allowed].sort(), key);
	}
	for (const mode of modes) {
		const config = defaults();
		config.mode = mode;
		simplifyConfig(config);
		assert.equal(config.mode, mode);
	}
	assert.equal(defaults().mode_config.identity.player_number, 8);
});

test("保留内容的源码入口完整，已禁用的包体源码已清理", () => {
	const root = new URL("../", import.meta.url);
	for (const name of characterPacks) {
		assert.ok(
			["js", "ts"].some(ext => fs.existsSync(new URL(`character/${name}/index.${ext}`, root))),
			name
		);
	}
	for (const name of modes) {
		assert.ok(
			[`mode/${name}.js`, `mode/${name}/index.ts`, `mode/${name}/index.js`].some(file => fs.existsSync(new URL(file, root))),
			name
		);
	}
	const cards = fs.readdirSync(new URL("card/", root)).map(file => file.replace(/\.js$/, ""));
	assert.deepEqual(cards.sort(), [...cardPacks].sort());
	for (const name of ["diy", "jsrg", "key", "offline", "sixiang", "sxrm", "tw"]) {
		assert.equal(fs.existsSync(new URL(`character/${name}/index.js`, root)), false, name);
	}
	for (const name of ["boss", "brawl", "chess", "realtime", "stone", "tafang"]) {
		assert.equal(fs.existsSync(new URL(`mode/${name}.js`, root)), false, name);
	}
});

test("mode defaults initialize before lazy menus and preserve valid saved choices", () => {
 const config = defaults(); simplifyConfig(config);
 const definitions = { single: { config: { single_mode: { init: "normal", item: { normal: "Normal", changban: "Changban" } } } }, guozhan: { config: { player_number: { init: "8" } } } };
 initializeModeConfig(config, definitions);
 assert.equal(config.mode_config.single.single_mode, "normal");
 assert.equal(config.mode_config.guozhan.player_number, "8");
 config.mode_config.single.single_mode = "changban"; initializeModeConfig(config, definitions);
 assert.equal(config.mode_config.single.single_mode, "changban");
 config.mode_config.single.single_mode = "removed"; initializeModeConfig(config, definitions);
 assert.equal(config.mode_config.single.single_mode, "normal");
 assert.notEqual(config.mode_config.identity, config.mode_config.guozhan);
});
