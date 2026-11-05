import { extractDistribution } from "./lib/archive.js";

extractDistribution(process.argv[2] || "output/noname-dist.tar", process.cwd());
