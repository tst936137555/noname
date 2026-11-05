import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const executable = resolve(process.argv[2] || "output/windows-portable/noname/noname.exe");
const profile = await mkdtemp(join(tmpdir(), "noname-portable-smoke-"));
let child, timer;
try {
	const env = { ...process.env, NONAME_DESKTOP_SMOKE_PROFILE: profile };
	delete env.ELECTRON_RUN_AS_NODE;
	child = spawn(executable, [], { windowsHide: true, stdio: "inherit", env });
	const code = await new Promise((resolveCode, reject) => {
		timer = setTimeout(() => { child.kill(); reject(new Error("Portable smoke timeout")); }, 90000);
		child.once("error", reject);
		child.once("exit", resolveCode);
	});
	const result = JSON.parse(await readFile(join(profile, "smoke-result.json"), "utf8"));
	if (code !== 0 || result.error) throw new Error(JSON.stringify(result));
	console.log("PORTABLE_STARTUP_OK", JSON.stringify(result));
} finally {
	clearTimeout(timer);
	await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
