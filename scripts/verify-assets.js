import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resourceManifest, verifyManifest } from "./lib/assets.js";
import { startupImages } from "../apps/core/noname/init/startup.js";
import { modes } from "../apps/core/noname/util/product.js";

const root = process.argv.slice(2).find(value => value !== "--generate") || "dist";
if (process.argv.includes("--generate")) await resourceManifest(root);
const manifest = JSON.parse(await readFile(join(root, "game/resource-manifest.json"), "utf8"));
const entries = await verifyManifest(root, manifest);
for (const file of ["index.html", "noname.js", "noname/entry.js", "noname/util/sandbox/sandbox.js", ...startupImages, ...modes.map(mode => `image/splash/style1/${mode}.jpg`)]) {
	if (!entries.has(file)) throw new Error(`Required startup resource missing: ${file}`);
}
console.log(`Verified ${entries.size} distribution files and required startup resources`);
