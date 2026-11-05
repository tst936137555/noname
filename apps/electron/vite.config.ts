import { defineConfig } from "vite";
import electron from "vite-plugin-electron";

export default defineConfig({
	resolve: {
		extensions: [".ts", ".mts", ".cts", ".js"],
	},
	plugins: [
		electron([
			{
				entry: "app/main.ts",
				vite: {
					build: {
						outDir: "dist/app/",
						minify: false,
						rollupOptions: { output: { banner: 'import { createRequire as createNodeRequire } from "node:module";const require = createNodeRequire(import.meta.url);' } },
						// rollupOptions: {
						// 	output: {
						// 		preserveModules: true,
						// 	},
						// },
					},
				},
			},
			{
				entry: "app/preload.ts",
				onstart({ reload }) {
					// Notify the Renderer process to reload the page when the Preload scripts build is complete,
					// instead of restarting the entire Electron App.
					reload();
				},
				vite: {
					build: {
						outDir: "dist/app/",
						lib: false,
						rollupOptions: { input: "app/preload.ts", output: { format: "cjs", entryFileNames: "preload.cjs" } },
						// rollupOptions: {
						// 	output: {
						// 		preserveModules: true,
						// 	},
						// },
					},
				},
			},
		]),
	],
});
