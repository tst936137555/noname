import { cp, mkdir, rm, stat, mkdtemp, rename } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname, join } from "node:path";

/** Copy the complete build, including all bundled resources, into a clean package. */
export async function packageDistribution(source, destination) {
	source = resolve(source);
	destination = resolve(destination);
	const contains = (parent, child) => {
		const path = relative(parent, child);
		return !path || (!isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\"));
	};
	if (contains(source, destination) || contains(destination, source)) {
		throw new Error("Build and package directories must not overlap");
	}
	for (const entry of ["noname.js", "image", "audio", "font"]) {
		await stat(resolve(source, entry));
	}
	await publishDirectory(destination, staging => cp(source, staging, { recursive: true }));
}

/** Populate a sibling staging directory before replacing the previous complete output. */
export async function publishDirectory(destination, populate) {
	destination = resolve(destination);
	const parent = dirname(destination);
	if (parent === destination) throw new Error("Cannot replace filesystem root");
	await mkdir(parent, { recursive: true });
	const staging = await mkdtemp(join(parent, ".noname-stage-"));
	const backup = staging + "-previous";
	if (dirname(staging) !== parent || dirname(backup) !== parent) throw new Error("Invalid staging path");
	let moved = false;
	try {
		await populate(staging);
		try {
			await rename(destination, backup);
			moved = true;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		try {
			await rename(staging, destination);
		} catch (error) {
			if (moved) await rename(backup, destination);
			moved = false;
			throw error;
		}
	} finally {
		// Both paths are derived from a verified mkdtemp child of the destination's parent.
		await rm(staging, { recursive: true, force: true });
	}
	if (moved) await rm(backup, { recursive: true, force: true });
}
