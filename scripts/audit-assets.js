import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const groups = new Map();
let bytes = 0,
	files = 0;
async function walk(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			await walk(path);
			continue;
		}
		if (!entry.isFile()) continue;
		const size = (await stat(path)).size;
		const hash = createHash("sha256")
			.update(await readFile(path))
			.digest("hex");
		if (!groups.has(hash)) groups.set(hash, { size, paths: [] });
		groups.get(hash).paths.push(path);
		bytes += size;
		files++;
	}
}
for (const dir of ["image", "audio", "font", "theme", "layout"]) await walk(join("apps/core", dir));
const duplicates = [...groups.values()].filter(group => group.paths.length > 1);
// Dynamic resource paths require a retained-asset list; this inventory never deletes candidates.
const report = { scope: ["image", "audio", "font", "theme", "layout"], files, bytes, duplicateBytes: duplicates.reduce((sum, group) => sum + group.size * (group.paths.length - 1), 0), duplicates };
await mkdir("output", { recursive: true });
await writeFile("output/resource-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ files, bytes, duplicateBytes: report.duplicateBytes }));
