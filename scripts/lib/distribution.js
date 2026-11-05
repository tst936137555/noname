import { copyFile, readdir, lstat, mkdir, rm, stat, mkdtemp, rename } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname, join } from "node:path";

/** Bound parallel file copies without serializing thousands of independent assets. */
export async function copyTree(source, destination) {
	const info = await lstat(source);
	if (info.isFile()) {
		await mkdir(dirname(destination), { recursive: true });
		return copyFile(source, destination);
	}
	if (!info.isDirectory()) throw new Error(`Unsupported distribution entry: ${source}`);
	const jobs = [];
	async function walk(from, to) {
		await mkdir(to, { recursive: true });
		for (const entry of await readdir(from, { withFileTypes: true })) {
			const input = join(from, entry.name), output = join(to, entry.name);
			if (entry.isDirectory()) await walk(input, output);
			else if (entry.isFile()) jobs.push([input, output]);
			else throw new Error(`Unsupported distribution entry: ${input}`);
		}
	}
	await walk(source, destination);
	let next = 0;
	const results = await Promise.allSettled(Array.from({ length: Math.min(8, jobs.length) }, async () => {
		while (next < jobs.length) {
			const [from, to] = jobs[next++];
			await copyFile(from, to);
		}
	}));
	const failure = results.find(result => result.status === "rejected");
	if (failure) throw failure.reason;
}

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
	await publishDirectory(destination, staging => copyTree(source, staging));
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
