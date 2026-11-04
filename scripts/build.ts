import { publishDirectory } from "./lib/distribution.js";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
// Workspace declaration builds share the root tsconfig; finish dependencies in order.
// The core build still parallelizes character, mode and card bundles.
const coreBuild = spawnSync("pnpm -r --workspace-concurrency=1 -F noname... build", {
	shell: true,
	stdio: "inherit",
});

if (coreBuild.error) throw coreBuild.error;
if (coreBuild.status !== 0) process.exit(coreBuild.status ?? 1);

console.log("合并打包结果");
await publishDirectory("dist", async staging => {
	const copies = await Promise.allSettled([fs.cp("apps/core/dist", staging, { recursive: true }), fs.cp("apps/core/audio", join(staging, "audio"), { recursive: true }), fs.cp("apps/core/image", join(staging, "image"), { recursive: true }), fs.cp("docs", join(staging, "docs"), { recursive: true }), ...[".nomedia", "LICENSE", "README.md"].map(file => fs.cp(file, join(staging, file)))]);
	const failed = copies.find(result => result.status === "rejected");
	if (failed?.status === "rejected") throw failed.reason;
});
