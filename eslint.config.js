import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import ts from "typescript-eslint";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import globals from "globals";

export default defineConfig(
	globalIgnores(["**/dist/", "**/output/", "**/node_modules/"]),
	js.configs.recommended,
	ts.configs.recommended,
	vue.configs["flat/essential"],
	{
		files: ["**/*.js", "**/*.ts", "**/*.vue"],
		rules: {
			"@typescript-eslint/no-require-imports": 0,
			"@typescript-eslint/no-unused-vars": 0,
			"@typescript-eslint/no-unused-expressions": 0,
			"@typescript-eslint/no-this-alias": 0,
			"@typescript-eslint/no-explicit-any": 0,
			"@typescript-eslint/no-unsafe-function-type": 0,
			"vue/multi-word-component-names": 0,
			"no-class-assign": 0,
			"no-console": 0,
			"@typescript-eslint/ban-ts-comment": [
				"error",
				{
					"ts-ignore": false,
					"ts-nocheck": false,
				},
			],
			"no-constant-condition": [
				"error",
				{
					checkLoops: false,
				},
			],
			"no-irregular-whitespace": [
				"error",
				{
					skipStrings: true,
					skipTemplates: true,
				},
			],
			"prefer-const": 0,
			"prefer-spread": 0,
			"no-redeclare": 0,
			"no-undef": 0,
			"no-empty": [
				"error",
				{
					allowEmptyCatch: true,
				},
			],
			"no-unused-vars": 0,
			"require-yield": 0,
			"no-fallthrough": ["error", { commentPattern: "\\[falls[\\s\\w]*through\\]" }],
			// curly: "error",
		},
		languageOptions: {
			ecmaVersion: 13,
			sourceType: "module",
			parser: vueParser,
			parserOptions: {
				parser: ts.parser,
			},
			globals: {
				...globals.browser,
				...globals.es2015,
				...globals.node,
				...globals.serviceworker,
				...globals.worker,
			},
		},
		ignores: [],
	},
	{
		files: ["scripts/**/*.cjs"],
		languageOptions: { sourceType: "commonjs", globals: globals.node },
		rules: { "@typescript-eslint/no-require-imports": "off" },
	},
	{
		files: ["scripts/engineering.test.js", "scripts/verify-assets.js", "scripts/lib/assets.js", "packages/server/src/transport.ts", "packages/server/src/credentials.ts"],
		languageOptions: { globals: { ...Object.fromEntries(Object.keys(globals.browser).map(key => [key, "off"])), ...globals.node } },
		rules: { "no-undef": "error", "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
	},
	{
		files: ["apps/core/bootstrap.js", "apps/core/recovery.js", "apps/core/noname/util/{reset,save,diagnostics,network,render,session}.js", "apps/core/noname/ui/accessibility.js"],
		languageOptions: { globals: { ...Object.fromEntries(Object.keys(globals.node).map(key => [key, "off"])), ...globals.browser } },
		rules: { "no-undef": "error", "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
	}
);
