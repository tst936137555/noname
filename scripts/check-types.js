import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const baseline = JSON.parse(readFileSync(new URL("./type-baseline.json", import.meta.url)));
const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "apps/core/tsconfig.json", "--noEmit", "--pretty", "false"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (result.error) throw result.error;
mkdirSync("output", { recursive: true });
writeFileSync("output/type-diagnostics.txt", result.stdout);
const counts = {};
const fingerprints = {};
const legacyFingerprints = {};
const sources = new Map();
const workspaceRoot = process.cwd().replaceAll("\\", "/");
for (const line of result.stdout.split("\n")) {
	const match = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)/);
	if (match) {
		const file = match[1].replaceAll("\\", "/");
		const key = file + " " + match[3];
		counts[key] = (counts[key] || 0) + 1;
		if (!sources.has(file)) sources.set(file, readFileSync(file, "utf8").split(/\r?\n/));
		const anchor = sources.get(file)[Number(match[2]) - 1]?.trim() || "";
		const rawMessage = match[4].trim().replaceAll("\\", "/").replaceAll(workspaceRoot, "<workspace>");
		// The truncated member count changes whenever a class gains a valid member.
		// Keep the diagnostic, source anchor and listed members stable in the fingerprint.
		const message = rawMessage.replace(/\band \d+ more\b/g, "and <more> more");
		const fingerprint = createHash("sha256").update([file, match[3], message, anchor].join("\n")).digest("hex").slice(0, 32);
		const legacyMessages = [rawMessage];
		if (rawMessage !== message) legacyMessages.push(rawMessage.replace(/\band (\d+) more\b/g, (_text, count) => `and ${Number(count) - 1} more`));
		legacyFingerprints[fingerprint] = legacyMessages.map(value => createHash("sha256").update([file, match[3], value, anchor].join("\n")).digest("hex").slice(0, 32));
		fingerprints[fingerprint] = (fingerprints[fingerprint] || 0) + 1;
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
const fingerprintPath = new URL("./type-fingerprints.json", import.meta.url);
if (existsSync(fingerprintPath)) {
	const previous = JSON.parse(readFileSync(fingerprintPath, "utf8"));
	const added = Object.entries(fingerprints).filter(([key, count]) => count > (previous[key] || Math.max(0, ...legacyFingerprints[key].map(legacy => previous[legacy] || 0))));
	if (added.length) {
		console.error(`New diagnostic fingerprints: ${added.length}; inspect output/type-diagnostics.txt and fix the new diagnostics`);
		failures += added.length;
	}
}
if (!failures && process.argv.includes("--ratchet")) {
	writeFileSync(new URL("./type-baseline.json", import.meta.url), JSON.stringify(Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
	writeFileSync(fingerprintPath, JSON.stringify(Object.fromEntries(Object.entries(fingerprints).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
}
console.log(`Type diagnostics: ${Object.values(counts).reduce((a, b) => a + b, 0)}; newly increased groups: ${failures}`);
process.exitCode = failures ? 1 : 0;
