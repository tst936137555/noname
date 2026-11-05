import { createRequire } from "node:module";
import { resolve } from "node:path";
import { packageWindows, restoreWindowsGame } from "../../scripts/lib/windows-package.js";
import { build as buildElectron, Platform, Arch, type PackagerOptions, type Configuration } from "electron-builder";
import { build as buildVite } from "vite";
import { gameVersion } from "../../scripts/lib/game-version.js";

async function main(targets: PackagerOptions["targets"], config: Partial<Configuration> = {}) {
	const appPaths = await buildElectron({
		config: {
			asar: false,
			// Vite bundles the main process; no package-manager links are needed at runtime.
			beforeBuild: async () => false,
			appId: "com.libnoname.noname",
			productName: "noname",
			directories: {
				output: "../../output",
			},
			files: [
				{ from: "dist", to: "" },
				{ from: "../../dist", to: "" },
				{ from: "../../dist/node_modules", to: "node_modules" },
				"package.json",
			],
			extraMetadata: {
				main: "app/main.js",
				version: gameVersion,
			},
			...config,
		},
		targets,
	});
	console.log("打包完成");
	return appPaths;
}

await buildVite();

switch (process.argv[2]) {
	case "win": {
		await main(Platform.WINDOWS.createTarget("dir", Arch.x64), {
			directories: { output: "../../output/windows-build" },
			win: { verifyUpdateCodeSignature: false, icon: "noname.ico" },
		});
		const requireBuilder = createRequire(import.meta.resolve("electron-builder"));
		const requirePackager = createRequire(requireBuilder.resolve("app-builder-lib"));
		const { path7za } = requirePackager("7zip-bin");
		await restoreWindowsGame(resolve("../../dist"), resolve("../../output/windows-build/win-unpacked/resources/app"));
		console.log(await packageWindows(resolve("../../output/windows-build/win-unpacked"), resolve("../../output"), gameVersion, path7za));
		break;
	}
	case "linux":
		await main(Platform.LINUX.createTarget("AppImage", Arch.x64));
		break;
	case "macos":
		await main(Platform.MAC.createTarget("dmg", Arch.arm64, Arch.x64), {
			mac: {
				identity: null,
			},
		});
		break;
	default:
		console.log("未知平台:", process.argv[2]);
}
