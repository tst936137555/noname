import { App } from "@capacitor/app";
import { Capacitor, SystemBars } from "@capacitor/core";

import { sanitizeExportName, type MinimalFileSystem, type LegacyFileSystemGame } from "./platform/general";
import { initializeAndroid, attachAndroidFileSystem, androidExportLocation, shareAndroidExport } from "./platform/android";
import { initializeIos, attachIosFileSystem, shareIosExport, openIosExternal } from "./platform/ios";

interface MobileContext {
	lib: { path?: unknown; config: { confirm_exit?: boolean } };
	game: LegacyFileSystemGame & { export?: (data: string | Blob, name?: string) => Promise<void>; exit?: () => void; open?: (url: string) => void };
	ui: { backgroundMusic?: HTMLAudioElement; updatexr?: () => void; menuContainer?: HTMLElement; connectMenuContainer?: HTMLElement; click: { pause(): void; configMenu(): void; connectMenu(): void } };
	_status: { gameStarted?: boolean; connectMode?: boolean; paused2?: boolean };
}

export default async function preload({ lib, game, ui, _status }: MobileContext) {
	lib.path = (await import("path-browserify-esm")).default;

	await hideSystemBars();

	const platform = Capacitor.getPlatform();
	const { fs } = await resolveFileSystem(platform);
	const rootCheck = await fs.statEntry({ entryName: "noname.js" });
	if (rootCheck.type !== "file") {
		throw new Error("游戏资源缺失: noname.js");
	}
	attachFileSystemAPI(game, platform);
	let resumeMusic = false;
	const listeners = await Promise.all([
		App.addListener("pause", () => {
			resumeMusic = Boolean(ui.backgroundMusic && !ui.backgroundMusic.paused);
			ui.backgroundMusic?.pause();
			if (_status.gameStarted && !_status.connectMode && !_status.paused2) ui.click.pause();
		}),
		App.addListener("resume", () => {
			void hideSystemBars();
			ui.updatexr?.();
			if (resumeMusic && ui.backgroundMusic) void ui.backgroundMusic.play().catch(() => {});
			resumeMusic = false;
		}),
		...(platform === "android"
			? [
					App.addListener("backButton", () => {
						const popup = document.querySelector<HTMLElement>(".popup-container:not(.hidden)");
						if (popup) {
							popup.click();
							return;
						}
						if (ui.menuContainer && !ui.menuContainer.classList.contains("hidden")) {
							ui.click.configMenu();
							return;
						}
						if (ui.connectMenuContainer && !ui.connectMenuContainer.classList.contains("hidden")) {
							ui.click.connectMenu();
							return;
						}
						if (!lib.config.confirm_exit || confirm("是否退出游戏？请先确认已保存所需数据。")) void App.exitApp();
					}),
				]
			: []),
	]);
	window.addEventListener(
		"pagehide",
		() => {
			for (const listener of listeners) void listener.remove();
		},
		{ once: true }
	);

	game.export = async function (data: string | Blob, name?: string) {
		const fileName = sanitizeExportName(name);
		const blob = typeof data === "string" ? new Blob([data], { type: "text/plain" }) : data;

		try {
			await new Promise<void>((resolve, reject) => game.writeFile(blob, "export", fileName, (error?: unknown) => (error ? reject(error) : resolve())));
			const location = platform === "android" ? `${await androidExportLocation()}/export/${fileName}` : `文件 App → 我的 iPhone/iPad → noname → export/${fileName}`;
			if (confirm(`文件已保存至：${location}\n是否打开系统分享面板？`)) {
				try {
					await (platform === "android" ? shareAndroidExport(`export/${fileName}`) : shareIosExport(`export/${fileName}`));
				} catch (error) {
					alert(`文件已保存，分享未完成：${error instanceof Error ? error.message : String(error)}`);
				}
			}
		} catch (error) {
			alert(`文件导出失败：${error instanceof Error ? error.message : String(error)}`);
		}
	};

	game.exit = function () {
		App.exitApp();
	};

	game.open = function (url: string) {
		const target = new URL(url);
		if (!["http:", "https:"].includes(target.protocol)) throw new Error("仅支持 HTTP 或 HTTPS 外部链接");
		if (platform === "ios") {
			void openIosExternal(target.href).catch(error => alert(`无法打开链接：${error.message}`));
			return;
		}
		window.open(url);
	};
}

async function hideSystemBars() {
	try {
		await SystemBars.hide();
	} catch {}
}

function resolveFileSystem(platform: string) {
	switch (platform) {
		case "android":
			return initializeAndroid();

		case "ios":
			return initializeIos();

		default:
			throw new Error(`暂不支持的平台: ${platform}`);
	}
}

function attachFileSystemAPI(game: LegacyFileSystemGame, platform: string) {
	switch (platform) {
		case "android":
			attachAndroidFileSystem(game);
			break;

		case "ios":
			attachIosFileSystem(game);
			break;
	}
}
