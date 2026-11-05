import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, rename, rm, writeFile, readFile, copyFile, mkdir } from "node:fs/promises";
import { join, resolve, basename, dirname, sep } from "node:path";
import { copyTree, publishDirectory } from "./distribution.js";
import { verifyManifest } from "./assets.js";

/** Restore distribution files omitted by the packager's default file filters. */
export async function restoreWindowsGame(distribution, appRoot) {
	distribution = resolve(distribution);
	appRoot = resolve(appRoot);
	const manifest = JSON.parse(await readFile(join(distribution, "game/resource-manifest.json"), "utf8"));
	let next = 0;
	await Promise.all(Array.from({ length: 8 }, async () => {
		while (next < manifest.files.length) {
			const entry = manifest.files[next++];
			const source = resolve(distribution, entry.path), target = resolve(appRoot, entry.path);
			if (!source.startsWith(distribution + sep) || !target.startsWith(appRoot + sep)) throw new Error("Invalid Windows resource path");
			const info = await stat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
			if (!info || info.size !== entry.bytes) {
				await mkdir(dirname(target), { recursive: true });
				await copyFile(source, target);
			}
		}
	}));
	await copyFile(join(distribution, "game/resource-manifest.json"), join(appRoot, "game/resource-manifest.json"));
	await verifyManifest(appRoot, manifest);
}

/** Portable Windows releases always contain one top-level noname directory. */
export async function packageWindows(source, output, version, archiver) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid game version");
	output = resolve(output);
	await stat(join(source, "noname.exe"));
	await stat(join(source, "resources/app/noname.js"));
	const directory = join(output, "windows-portable");
	await publishDirectory(directory, staging => copyTree(source, join(staging, "noname")));
	const archive = join(output, `noname.windows.${version}.zip`);
	const temporary = join(output, `.noname-windows-${randomUUID()}.zip`);
	const run = args => {
		const result = spawnSync(archiver, args, { cwd: directory, stdio: "inherit", windowsHide: true });
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(`Windows ZIP failed: ${result.status}`);
	};
	try {
		run(["a", "-tzip", "-mx=3", temporary, "noname"]);
		run(["t", temporary]);
		const hash = createHash("sha256");
		for await (const chunk of createReadStream(temporary)) hash.update(chunk);
		await rename(temporary, archive);
		await writeFile(archive + ".sha256", `${hash.digest("hex")}  ${basename(archive)}\n`);
	} finally {
		await rm(temporary, { force: true });
	}
	return archive;
}
