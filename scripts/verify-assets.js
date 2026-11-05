import { readFile } from "node:fs/promises";
import { resourceManifest, verifyManifest } from "./lib/assets.js";
import { startupImages } from "../apps/core/noname/init/startup.js";
import { modes } from "../apps/core/noname/util/product.js";

if (process.argv.includes("--generate")) await resourceManifest("dist");
const manifest = JSON.parse(await readFile("dist/game/resource-manifest.json", "utf8"));
const entries = await verifyManifest("dist", manifest);
for (const file of ["index.html", "noname.js", "noname/entry.js", "noname/util/sandbox/sandbox.js", ...startupImages, ...modes.map(mode => `image/splash/style1/${mode}.jpg`)]) {
	if (!entries.has(file)) throw new Error(`Required startup resource missing: ${file}`);
}
console.log(`Verified ${entries.size} distribution files and required startup resources`);
