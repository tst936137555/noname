import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import fs from "fs/promises";
import path from "path";
import { cwd } from "process";
import { exec } from "child_process";

interface JsonResult<T = any> {
	success: boolean;
	code: number;
	errorMsg?: string;
	data?: T;
}

const successfulJson = <T = any>(data?: T): JsonResult<T> => ({
	success: true,
	code: 200,
	data,
});
const failedJson = <T = any>(code: number, message?: string): JsonResult<T> => ({
	success: false,
	code,
	errorMsg: message,
});

export const defaultConfig = {
	server: false,
	port: 8089,
	debug: false,
	listen: true,
	dirname: cwd(),
};

function createFsHandler(dirname: string) {
	const inside = (root: string, target: string) => {
		const relative = path.relative(root, target);
		return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
	};
	const ensureSafe = async (url: string) => {
		if (typeof url !== "string" || url.includes("\0") || path.isAbsolute(url)) throw new Error("Invalid path");
		const full = path.resolve(dirname, url);
		if (!inside(dirname, full) || url.split(/[\\/]/).some(part => part.toLowerCase() === "home" || part.toLowerCase() === ".git")) throw new Error("Access denied");
		const root = await fs.realpath(dirname);
		let ancestor = full;
		while (true) {
			try {
				if (!inside(root, await fs.realpath(ancestor))) throw new Error("Access denied");
				break;
			} catch (error: any) {
				if (error.code !== "ENOENT") throw error;
				const parent = path.dirname(ancestor);
				if (parent === ancestor) throw error;
				ancestor = parent;
			}
		}
		return full;
	};
	const wrap =
		<Q, R>(fn: (query: Q) => Promise<R>) =>
		async (req: any, reply: any) => {
			try {
				return successfulJson(await fn(req.method === "POST" ? req.body : req.query));
			} catch (e: any) {
				reply.code(400);
				return failedJson(400, String(e));
			}
		};
	return { ensureSafe, wrap };
}

export default function createApp(config: Partial<typeof defaultConfig> = {}) {
	const cfg = { ...defaultConfig, ...config };
	cfg.dirname = path.resolve(cfg.dirname);
	if (cfg.debug) console.log(cfg);
	const app = Fastify({
		logger: cfg.debug,
	});

	const { ensureSafe, wrap } = createFsHandler(cfg.dirname);

	app.register(cors, {
		origin: false,
		methods: ["GET", "POST", "OPTIONS"],
	});

	app.register(fastifyStatic, {
		root: cfg.dirname,
		prefix: "/",
		dotfiles: "allow",
		allowedPath: (_path, _root, request) => !request.url.split(/[/?]/).some(part => ["home", ".git"].includes(decodeURIComponent(part).toLowerCase())),
		maxAge: 0,
	});

	// index.html
	app.get("/", async (req, reply) => reply.redirect("/index.html"));

	app.get(
		"/readFile",
		wrap(async ({ fileName }: { fileName: string }) => {
			const full = await ensureSafe(fileName);
			const data = await fs.readFile(full);
			return [...new Uint8Array(data)];
		})
	);

	app.get(
		"/readFileAsText",
		wrap(async ({ fileName }: { fileName: string }) => {
			const full = await ensureSafe(fileName);
			return await fs.readFile(full, "utf-8");
		})
	);

	app.get(
		"/getFileList",
		wrap(async ({ dir }: { dir: string }) => {
			const full = await ensureSafe(dir);
			const stat = await fs.stat(full);
			if (stat.isFile()) throw new Error("路径不是文件夹");

			const entries = await fs.readdir(full);
			const files: string[] = [];
			const folders: string[] = [];

			await Promise.all(
				entries.map(async entry => {
					if (entry.startsWith(".") || entry.startsWith("_")) return;
					const s = await fs.stat(path.join(full, entry));
					s.isDirectory() ? folders.push(entry) : files.push(entry);
				})
			);

			return { folders, files };
		})
	);

	app.get(
		"/checkFile",
		wrap(async ({ fileName }: { fileName: string }) => {
			const full = await ensureSafe(fileName);
			try {
				const stat = await fs.stat(full);
				if (stat.isFile()) return "file";
				else return "directory";
			} catch {
				return {};
			}
		})
	);

	app.get(
		"/checkDir",
		wrap(async ({ dir }: { dir: string }) => {
			const full = await ensureSafe(dir);
			try {
				const stat = await fs.stat(full);
				if (stat.isFile()) return "file";
				else return "directory";
			} catch {
				return {};
			}
		})
	);

	app.setNotFoundHandler((req, reply) => {
		reply.code(404).send("Sorry can't find that!");
	});

	app.setErrorHandler((err, req, reply) => {
		reply.send(failedJson(400, String(err)));
	});

	app.addHook("onRequest", async (req, reply) => {
		const origin = req.headers.origin;
		const expected = `http://${req.headers.host}`;
		if (origin && origin !== expected) return reply.code(403).send(failedJson(403, "Origin denied"));
		if (req.headers["sec-fetch-site"] === "cross-site") return reply.code(403).send(failedJson(403, "Origin denied"));
		if (!["localhost", "127.0.0.1", "[::1]"].includes((req.headers.host || "").replace(/:\d+$/, ""))) return reply.code(403).send(failedJson(403, "Host denied"));
		// Validate static requests as well as API paths, including junctions.
		try {
			await ensureSafe(decodeURIComponent(req.url.split("?")[0]).replace(/^\//, ""));
		} catch {
			return reply.code(403).send(failedJson(403, "Path denied"));
		}
	});
	if (cfg.listen)
		app.listen({ port: cfg.port, host: "127.0.0.1" }, (error, address) => {
			if (error) {
				console.error(error);
				process.exitCode = 1;
				return;
			}
			console.log(`Server listening at ${address}`);
			if (!cfg.server && !cfg.debug && process.platform === "win32") exec(`start ${address}/`);
		});
	return app;
}
