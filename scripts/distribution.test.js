import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDistribution, publishDirectory } from "./lib/distribution.js";
import { packageWindows, restoreWindowsGame } from "./lib/windows-package.js";
import { resourceManifest, verifyManifest } from "./lib/assets.js";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

test("Windows 打包恢复被默认过滤器遗漏的资源并校验清单", async t => {
	const root = await mkdtemp(join(tmpdir(), "noname-portable-resources-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const source = join(root, "dist"), target = join(root, "app");
	await mkdir(join(source, "game"), { recursive: true });
	await mkdir(join(target, "game"), { recursive: true });
	await writeFile(join(source, "game/.gitkeep"), "");
	await writeFile(join(source, "noname.js"), "complete-game");
	await writeFile(join(target, "noname.js"), "old");
	const manifest = await resourceManifest(source);
	await restoreWindowsGame(source, target);
	assert.equal(await readFile(join(target, "game/.gitkeep"), "utf8"), "");
	assert.equal(await readFile(join(target, "noname.js"), "utf8"), "complete-game");
	await verifyManifest(target, manifest);
});

test("Windows ZIP 解压后只有 noname 顶层目录并包含启动程序和游戏资源", async t => {
	const root = await mkdtemp(join(tmpdir(), "noname-portable-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const source = join(root, "unpacked");
	await mkdir(join(source, "resources/app"), { recursive: true });
	await writeFile(join(source, "noname.exe"), "test-runtime");
	await writeFile(join(source, "resources/app/noname.js"), "test-game");
	const app = createRequire(new URL("../apps/electron/package.json", import.meta.url));
	const builder = createRequire(app.resolve("electron-builder"));
	const packager = createRequire(builder.resolve("app-builder-lib"));
	const { path7za } = packager("7zip-bin");
	const archive = await packageWindows(source, join(root, "output"), "1.2.3", path7za);
	const list = execFileSync(path7za, ["l", "-slt", archive], { encoding: "utf8", windowsHide: true }).replaceAll("\\", "/");
	assert.ok(list.includes("Path = noname/noname.exe"));
	assert.ok(list.includes("Path = noname/resources/app/noname.js"));
	assert.ok((await readFile(archive + ".sha256", "utf8")).includes("noname.windows.1.2.3.zip"));
});

test("全量包保留所有代码、图片、字体和音频，并清理旧产物", async t => {
	const root = await mkdtemp(join(tmpdir(), "noname-package-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const source = join(root, "dist");
	const output = join(root, "package");
	const files = ["noname.js", "image/character/caocao.jpg", "audio/skill/jianxiong.mp3", "audio/die/caocao.mp3", "audio/effect/damage.mp3", "font/default.woff2", "game/config.json", ".nomedia"];
	for (const file of files) {
		await mkdir(join(source, file, ".."), { recursive: true });
		await writeFile(join(source, file), file);
	}
	await mkdir(output);
	await writeFile(join(output, "stale.js"), "old");
	await packageDistribution(source, output);
	for (const file of files) assert.equal(await readFile(join(output, file), "utf8"), file);
	assert.equal((await readdir(output)).includes("stale.js"), false);
	await assert.rejects(packageDistribution(source, source), /overlap/);
	await assert.rejects(packageDistribution(source, root), /overlap/);
	assert.equal(await readFile(join(source, "noname.js"), "utf8"), "noname.js");
});

test("failed distribution staging keeps the last complete output", async t => {
	const root = await mkdtemp(join(tmpdir(), "noname-package-fail-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const output = join(root, "dist");
	await mkdir(output);
	await writeFile(join(output, "keep"), "previous");
	await assert.rejects(
		publishDirectory(output, async staging => {
			await writeFile(join(staging, "partial"), "new");
			throw new Error("disk failure");
		}),
		/disk failure/
	);
	assert.equal(await readFile(join(output, "keep"), "utf8"), "previous");
	assert.deepEqual(await readdir(root), ["dist"]);
});
