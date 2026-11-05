#!/usr/bin/env node

import { createServer } from "./server/createServer";
import { homedir } from "node:os";
import { join } from "node:path";

function readPort(): number {
	const portArgIndex = process.argv.findIndex(arg => arg === "--port" || arg === "-p");
	const rawPort = portArgIndex === -1 ? process.env.PORT : process.argv[portArgIndex + 1];
	const port = Number(rawPort ?? 8082);

	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new Error(`Invalid port: ${rawPort}`);
	}

	return port;
}

const port = readPort();
const server = createServer({ port, credentialDirectory: process.env.NONAME_LOBBY_DATA || join(homedir(), ".noname", "lobby-credentials") });

const stop = async () => {
	await server.stop();
	process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function main() {
	await server.start();
	console.log(`Server listening on port ${port}`);
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
