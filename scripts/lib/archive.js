import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/** Read PAX names as Unicode, including on Windows runners with a legacy ANSI code page. */
export function extractDistribution(archive, destination) {
	archive = resolve(archive);
	destination = resolve(destination);
	if (process.platform === "win32") {
		const app = createRequire(new URL("../../apps/electron/package.json", import.meta.url));
		const builder = createRequire(app.resolve("electron-builder"));
		const packager = createRequire(builder.resolve("app-builder-lib"));
		const { path7za } = packager("7zip-bin");
		execFileSync(path7za, ["x", "-y", archive, `-o${destination}`], { stdio: "inherit", windowsHide: true });
	} else {
		execFileSync("tar", ["-xf", archive, "-C", destination], { stdio: "inherit" });
	}
}
