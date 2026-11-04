import { readFileSync, writeFileSync } from "node:fs";

/** The only maintained game version; platform package versions are derived from it. */
export const gameVersion = JSON.parse(readFileSync(new URL("../../apps/core/package.json", import.meta.url), "utf8")).version;
const parts = gameVersion.split(".").map(Number);
if (!/^\d+\.\d+\.\d+$/.test(gameVersion) || parts[1] > 999 || parts[2] > 999) {
	throw new Error(`Unsupported game version: ${gameVersion}`);
}
export const gameVersionCode = parts[0] * 1000000 + parts[1] * 1000 + parts[2];
if (gameVersionCode < 1 || gameVersionCode > 2100000000) {
	throw new Error(`Game version exceeds Android versionCode range: ${gameVersion}`);
}

/** Called by mobile sync before either native build, including CI builds. */
export function syncMobileVersion() {
	const project = new URL("../../apps/mobile/native/ios/App/App.xcodeproj/project.pbxproj", import.meta.url);
	const text = readFileSync(project, "utf8")
		.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${gameVersion};`)
		.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${gameVersion};`);
	writeFileSync(project, text);
}
