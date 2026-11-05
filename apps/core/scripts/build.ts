import { build } from "vite";
import { execFileSync } from "node:child_process";
import { join } from "path";
import { existsSync, readdirSync, writeFileSync } from "fs";
import { Target, viteStaticCopy } from "vite-plugin-static-copy";
import generateImportMap from "./vite-plugin-importmap";
import type { BuildChannel, BuildInfo } from "../noname/util/meta";

import { buildConcurrency, runBuildWorkers } from "../../../scripts/lib/build-workers.js";

import { characterPacks, cardPacks, modes } from "../noname/util/product.js";

const root = join(import.meta.dirname, "..");

/**
 * 构建脚本入口。
 *
 * 负责收集本体构建需要复制的静态资源、各类单独构建包体的入口，
 * 本体构建完成后，再在线程中并行构建各类包体。
 */
async function main() {
	const concurrency = buildConcurrency();
	/**
	 * 编译目标
	 *
	 * 目前无名杀的目标为`Chromium >= 91 || Safari >=16.4.0`
	 */
	const target = ["chrome91", "safari16.4"];

	/**
	 * 无名杀所使用的导入映射（import map，翻译来源MDN）
	 */
	const importMap: Record<string, string> = {
		noname: "/noname.js",
		vue: "/vendor/vue.esm-browser.prod.js",
		"pinyin-pro": "/vendor/index.mjs",
		dedent: "/vendor/dedent.mjs",
	};

	/**
	 * 本体编译过程需要直接复制的文件
	 */
	const staticModules: Target[] = [
		{ src: "node_modules/vue/dist/vue.esm-browser.prod.js", dest: "vendor" },
		{ src: "node_modules/pinyin-pro/dist/index.mjs", dest: "vendor" },
		{ src: "node_modules/dedent/dist/dedent.mjs", dest: "vendor" },
		{ src: "layout", dest: "" },
		{ src: "font", dest: "" },
		{ src: "theme", dest: "" },
		{ src: "game", dest: "" },
		{ src: "noname", dest: "src" },
		{ src: "typings", dest: "src" },
		{ src: "noname.js", dest: "src" },
	];

	/**
	 * 需要脱离本体单独输出的包体，无名杀中即为武将包、卡牌包和模式
	 *
	 * Individual译为“个体”，不过此处只是找个后续不太用得上的单词
	 */
	const individuals: Record<IndividualType, IndividualContent[]> = {
		character: [],
		mode: modes.map(name => {
			const source = name === "guozhan" ? `mode/${name}` : `mode/${name}.js`;
			return { name, index: name === "guozhan" ? getDirectoryEntry("mode", name) : source, source };
		}),
		card: [],
	};

	const characterDirectories = readdirSync(join(root, "character"), { withFileTypes: true })
		.filter(entry => entry.isDirectory() && characterPacks.includes(entry.name))
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const { name } of characterDirectories) {
		individuals.character.push({
			name,
			index: getDirectoryEntry("character", name),
			source: `character/${name}`,
		});
	}

	// #3941 - 卡牌包均重写完毕
	for (const file of readdirSync(join(root, "card")).sort()) {
		if (!cardPacks.includes(getEntryName(file))) continue;
		const index = `card/${file}`;
		individuals.card.push({
			name: getEntryName(file),
			index,
			source: index,
		});
	}

	// 将单独构建的包体全部复制到dist/src中
	for (const [type, content] of Object.entries(individuals)) {
		for (const { source } of content) {
			const dest = `src/${type}`;
			staticModules.push({ src: source, dest });
		}
	}

	// 编译无名杀本体
	await buildSelf(target, importMap, staticModules);

	// 先收集任务，再由独立线程构建互不重叠的输出目录。
	const jobs = [];
	for (const [type, content] of Object.entries(individuals)) {
		// 构建vite编译输入
		const input: Record<string, string> = {};
		for (const { name, index } of content) {
			input[name] = index;
		}

		// 获取需要单独复制的文件
		const copies: Target[] = [];
		for (const file of readdirSync(join(root, type)).sort()) {
			if (getEntryName(file) in input || type !== "character" || !["rank.js", "replace.js", "perfectPairs.js"].includes(file)) {
				continue;
			}

			copies.push({ src: `${type}/${file}`, dest: "" });
		}

		jobs.push({ type, target, input, importMap, copies });
	}

	console.log(`包体构建使用 ${Math.min(concurrency, jobs.length)} 个工作线程`);
	await runBuildWorkers(new URL("./build-individual.js", import.meta.url), jobs, concurrency);
	writeBuildInfo();
}

/**
 * 构建无名杀本体。
 *
 * @param target Vite/Rollup的浏览器编译目标
 * @param importMap 写入最终产物的导入映射
 * @param copies 本体构建阶段需要直接复制到dist的文件
 */
async function buildSelf(target: string | string[], importMap: Record<string, string>, copies: Target[]) {
	// 继承vite.config.ts
	// 合并会导致开发服务器依赖失效
	await build({
		build: {
			target,
			sourcemap: "hidden",
			// Network callbacks are serialized with Function#toString; their engine
			// global identifiers must survive compilation unchanged.
			minify: "terser",
			terserOptions: { compress: false, mangle: false, keep_fnames: true, keep_classnames: true },
			rollupOptions: {
				preserveEntrySignatures: "strict",
				treeshake: false,
				external: ["vue"],
				input: {
					index: "index.html",
					noname: "noname.js",
					"noname/util/save": join(root, "noname/util/save.js"),
					"noname/util/sandbox/initRealms": join(root, "noname/util/sandbox/initRealms.js"),
					"noname/util/sandbox/sandbox": join(root, "noname/util/sandbox/sandbox.js"),
					"noname/util/sandbox/error": join(root, "noname/util/sandbox/error.ts"),
					"noname/entry": join(root, "noname/entry.ts"),
				},
				output: {
					preserveModules: false,
					onlyExplicitManualChunks: true,
					manualChunks(id) {
						const file = id.replaceAll("\\", "/");
						// Let Rollup place the engine's cyclic dependencies together. Realm
						// entry points remain independent; only optional editor modules are grouped.
						if (/\/(?:@codemirror|@lezer|eslint-linter-browserify|codemirror)[/@]/.test(file)) return "editor";
					},

					// 去掉 hash
					entryFileNames: "[name].js", // 入口文件
					chunkFileNames: "chunks/[name]-[hash].js",
					assetFileNames: "[name][extname]", // 静态资源
				},
				onwarn(warning, warn) {
					if (warning.code === "CYCLIC_CROSS_CHUNK_REEXPORT") return;
					warn(warning);
				},
			},
		},
		plugins: [viteStaticCopy({ targets: copies }), generateImportMap(importMap)],
	});
}

/**
 * 从顶层文件或目录名中取得可与Rollup入口配置对比的入口名。
 *
 * @example
 * getEntryName("identity.js") // "identity"
 * getEntryName("guozhan") // "guozhan"
 */
function getEntryName(file: string): string {
	return file.replace(/\.(js|ts)$/, "");
}

/** 取得目录型包体的入口，优先使用 TypeScript 文件。 */
function getDirectoryEntry(type: IndividualType, name: string): string {
	for (const extension of ["ts", "js"]) {
		const index = `${type}/${name}/index.${extension}`;
		if (existsSync(join(root, index))) {
			return index;
		}
	}

	throw new Error(`未找到${type}包体“${name}”的入口文件`);
}

const buildChannels = ["test", "nightly", "release"] as const satisfies readonly BuildChannel[];
type ArtifactBuildChannel = (typeof buildChannels)[number];

function writeBuildInfo() {
	const channelValue = process.env.NONAME_BUILD_CHANNEL;
	const channel: ArtifactBuildChannel = buildChannels.includes(channelValue as ArtifactBuildChannel) ? (channelValue as ArtifactBuildChannel) : "test";
	let commit = process.env.NONAME_BUILD_COMMIT;
	if (!commit) {
		try {
			commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		} catch {
			commit = "local";
		}
	}

	const buildInfo: BuildInfo = {
		channel,
		commit,
		builtAt: process.env.NONAME_BUILD_TIME || new Date().toISOString(),
	};
	writeFileSync(join(root, "dist/game/build-info.json"), `${JSON.stringify(buildInfo, null, "\t")}\n`, "utf8");
}

/** 支持按包体维度处理的目录类型。 */
type IndividualType = "character" | "card" | "mode";

/** 单个需要独立构建的包体配置。 */
interface IndividualContent {
	/** 包体名称，同时作为 Rollup input 的 key 使用。 */
	name: string;
	/** 包体入口文件，使用相对于 apps/core 的路径。 */
	index: string;
	/** 复制到 dist/src 的源码文件或目录。 */
	source: string;
}

if (import.meta.main) {
	await main();
}
