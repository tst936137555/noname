import { workerData } from "node:worker_threads";
import { build } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const { type, target, input, importMap, copies } = workerData;

// 本体先完成清理和静态复制；各线程只写自己的 dist/<type>。
await build({
	build: {
		target,
		sourcemap: false,
		minify: "terser",
		terserOptions: { compress: false, mangle: false, keep_fnames: true, keep_classnames: true },
		outDir: `dist/${type}`,
		rollupOptions: {
			preserveEntrySignatures: "strict",
			treeshake: true,
			external: Object.keys(importMap),
			input,
			output: {
				preserveModules: false,
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name][extname]",
			},
			onwarn(warning, warn) {
				if (warning.code !== "CYCLIC_CROSS_CHUNK_REEXPORT") warn(warning);
			},
		},
	},
	plugins: [viteStaticCopy({ targets: copies })],
});
