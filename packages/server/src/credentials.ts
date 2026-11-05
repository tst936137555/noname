import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Disk-backed credential digests avoid a process-lifetime account capacity limit. */
export class Credentials {
	private memory = new Map<string, string>();
	constructor(private directory?: string) {
		if (directory) mkdirSync(directory, { recursive: true, mode: 0o700 });
	}
	get(key: string): string | undefined {
		if (!this.directory) return this.memory.get(key);
		try {
			return readFileSync(this.file(key), "utf8").trim();
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
	}
	register(key: string, digest: string) {
		if (!this.directory) {
			if (this.memory.size >= 10000) throw new Error("Use persistent credential storage for a public lobby");
			this.memory.set(key, digest);
			return;
		}
		writeFileSync(this.file(key), digest, { flag: "wx", mode: 0o600 });
	}
	private file(key: string) {
		return join(this.directory!, createHash("sha256").update(key).digest("hex") + ".key");
	}
}
