import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

async function boundedMap(items, run) {
	let next = 0,
		failure;
	await Promise.all(
		Array.from({ length: Math.min(8, items.length) }, async () => {
			while (next < items.length && !failure) {
				const item = items[next++];
				try {
					await run(item);
				} catch (error) {
					failure = error;
				}
			}
		})
	);
	if (failure) throw failure;
}

export async function resourceManifest(root) {
	const files = [];
	const paths = [];
	async function walk(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (entry.isFile()) {
				const name = relative(root, path).replaceAll("\\", "/");
				if (name === "game/resource-manifest.json") continue;
				paths.push({ path, name });
			} else throw new Error(`Unsupported distribution entry: ${path}`);
		}
	}
	await walk(root);
	await boundedMap(paths, async ({ path, name }) => {
		const data = await readFile(path);
		files.push({ path: name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
	});
	files.sort((a, b) => a.path.localeCompare(b.path));
	const manifest = { formatVersion: 1, files };
	await writeFile(join(root, "game/resource-manifest.json"), JSON.stringify(manifest));
	return manifest;
}

export async function verifyManifest(root, manifest, hashes = true) {
	root = resolve(root);
	if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("Invalid resource manifest");
	const seen = new Set();
	const entries = [];
	for (const entry of manifest.files) {
		if (typeof entry.path !== "string" || seen.has(entry.path)) throw new Error("Invalid or duplicate resource path");
		seen.add(entry.path);
		const file = resolve(root, entry.path);
		if (!file.startsWith(root + sep)) throw new Error("Resource path escapes distribution");
		entries.push({ file, entry });
	}
	await boundedMap(entries, async ({ file, entry }) => {
		const data = hashes ? await readFile(file) : undefined;
		if ((data ? data.length : (await stat(file)).size) !== entry.bytes) throw new Error(`Resource size mismatch: ${entry.path}`);
		if (data && createHash("sha256").update(data).digest("hex") !== entry.sha256) throw new Error(`Resource checksum mismatch: ${entry.path}`);
	});
	return seen;
}
