import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDistribution, publishDirectory } from "./lib/distribution.js";

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
