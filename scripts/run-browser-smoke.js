import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire(new URL("../apps/electron/package.json", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "noname-smoke-"));
if (!resolve(profile).startsWith(resolve(tmpdir()) + sep)) throw new Error("Invalid temporary profile");
const env = { ...process.env, NONAME_SMOKE_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [process.argv.includes("--modes") ? "scripts/mode-smoke.cjs" : "scripts/browser-smoke.cjs", "--disable-gpu"], { stdio: "inherit", windowsHide: true, env });
const timer = setTimeout(() => {
	console.error("Browser smoke timeout");
	child.kill();
}, 150000);
child.on("error", error => {
	clearTimeout(timer);
	console.error(error);
	process.exitCode = 1;
});
child.on("exit", async code => {
	clearTimeout(timer);
	process.exitCode = code ?? 1;
	await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => {
		console.error("Temporary profile cleanup failed", error);
		process.exitCode = 1;
	});
});
