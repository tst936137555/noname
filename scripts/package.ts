import { resolve } from "node:path";
import { packageDistribution } from "./lib/distribution.js";

const root = resolve(import.meta.dirname, "..");
await packageDistribution(resolve(root, "dist"), resolve(root, "output/noname"));
console.log("全量包已输出到 output/noname");
