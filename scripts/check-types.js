import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const baseline = JSON.parse(readFileSync(new URL("./type-baseline.json", import.meta.url)));
const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "apps/core/tsconfig.json", "--noEmit", "--pretty", "false"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
const counts = {};
for (const line of result.stdout.split("\n")) {
	const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+):/);
	if (match) {
		const key = match[1].replaceAll("\\", "/") + " " + match[2];
		counts[key] = (counts[key] || 0) + 1;
	}
}
let failures = 0;
for (const [key, count] of Object.entries(counts))
	if (count > (baseline[key] || 0)) {
		console.error(`${key}: ${count} (baseline ${baseline[key] || 0})`);
		failures++;
	}
if (result.status !== 0 && !Object.keys(counts).length) {
	console.error(result.stdout, result.stderr);
	failures++;
}
console.log(`Type diagnostics: ${Object.values(counts).reduce((a, b) => a + b, 0)}; newly increased groups: ${failures}`);
process.exitCode = failures ? 1 : 0;
