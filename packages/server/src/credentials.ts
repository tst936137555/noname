import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Disk-backed credential digests avoid a process-lifetime account capacity limit. */
export class Credentials {
	private memory = new Map<string, string>();
	constructor(private directory?: string) {
		if (directory) mkdirSync(directory, { recursive: true, mode: 0o700 });
	}
	async get(key: string): Promise<string | undefined> {
		if (!this.directory || this.memory.has(key)) return this.memory.get(key);
		try {
			const digest = (await readFile(this.file(key), "utf8")).trim();
			if (this.memory.size >= 1000) this.memory.delete(this.memory.keys().next().value!);
			this.memory.set(key, digest);
			return digest;
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
	}
	async register(key: string, digest: string) {
		if (!this.directory) {
			if (this.memory.size >= 10000) throw new Error("Use persistent credential storage for a public lobby");
			this.memory.set(key, digest);
			return;
		}
		await writeFile(this.file(key), digest, { flag: "wx", mode: 0o600 });
	}
	private file(key: string) {
		return join(this.directory!, createHash("sha256").update(key).digest("hex") + ".key");
	}
}
