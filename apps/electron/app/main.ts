/// <reference types="vite/client" />
import { DirectHost } from "../../../packages/server/src/direct-host";
import { networkInterfaces } from "node:os";
import { app, BrowserWindow, crashReporter, dialog, Menu, shell, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import createApp from "@noname/fs";
const dirname = path.join(import.meta.dirname, "../");
const smokeProfile = process.env.NONAME_DESKTOP_SMOKE_PROFILE;
if (smokeProfile) app.setPath("userData", path.resolve(smokeProfile));
// 获取单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	// 如果获取失败，说明已经有实例在运行了，直接退出
	app.quit();
	process.exit(0);
}

app.setAppUserModelId("com.libnoname.noname");

//防止32位无名杀的乱码
app.setName("无名杀");

function setPath(path1: any, path2: any) {
	app.getPath(path1);
	fs.mkdirSync(path2, { recursive: true });
	app.setPath(path1, path2);
}

const userData = app.getPath("userData");
const legacyData = path.join(dirname, "Home", "UserData");
if (!fs.existsSync(userData) && fs.existsSync(legacyData)) fs.cpSync(legacyData, userData, { recursive: true, dereference: false });
setPath("crashDumps", path.join(userData, "crashDumps"));
setPath("logs", path.join(userData, "logs"));
const hosts = new Map<number, DirectHost>();
const hostIp =
	Object.values(networkInterfaces())
		.flat()
		.find(item => item?.family === "IPv4" && !item.internal)?.address || "127.0.0.1";
let serverReady = false;
let gameAddress = "http://127.0.0.1:8081";
//崩溃处理
crashReporter.start({
	productName: "无名杀",
	//崩溃报告将被收集并存储在崩溃目录中，不会上传
	uploadToServer: false,
	compress: false,
});

// 其他实例启动时，主实例会通过 second-instance 事件接收其他实例的启动参数 `argv`
app.on("second-instance", (event, argv) => {
	// Windows 下通过协议URL启动时，URL会作为参数，所以需要在这个事件里处理
	if (process.platform === "win32") {
		createWindow();
	}
});

// macOS 下通过协议URL启动时，主实例会通过 open-url 事件接收这个 URL
app.on("open-url", (event, urlStr) => {
	createWindow();
});

app.setAboutPanelOptions({
	iconPath: "noname.ico",
	website: "https://github.com/libnoname/noname",
});

process.env["ELECTRON_DEFAULT_ERROR_MODE"] = "true";

process.noDeprecation = true;

function createWindow() {
	if (!serverReady) return;
	const existing = BrowserWindow.getAllWindows()[0];
	if (existing) {
		if (existing.isMinimized()) existing.restore();
		existing.focus();
		return;
	}
	createMainWindow();
}

function createMainWindow() {
	let win = new BrowserWindow({
		show: !smokeProfile,
		width: 1000,
		height: 800,
		title: "无名杀",
		icon: path.join(dirname, "noname.ico"),
		webPreferences: {
			webSecurity: true,
			preload: path.join(dirname, "app/preload.cjs"),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			additionalArguments: [`--noname-data-root=${dirname}`, `--noname-host-ip=${hostIp}`],
		},
	});
	void win.loadURL(`${gameAddress}/index.html`);
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		if (new URL(url).origin !== new URL(gameAddress).origin) event.preventDefault();
	});
	win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

	const contentsId = win.webContents.id;
	win.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
		if (mainFrame) {
			hosts.get(contentsId)?.stop();
			hosts.delete(contentsId);
		}
	});
	win.webContents.on("destroyed", () => {
		hosts.get(contentsId)?.stop();
		hosts.delete(contentsId);
	});
	const menuTemplate: Electron.MenuItemConstructorOptions[] = [
		{
			label: "操作",
			submenu: [
				{
					label: "打开无名杀目录",
					click: () => {
						shell.showItemInFolder(path.join(app.getAppPath(), "app"));
					},
				},
			],
		},
		{
			label: "窗口",
			submenu: [
				{
					label: "重新加载当前窗口",
					role: "reload",
				},
				{
					label: "打开/关闭控制台",
					role: "toggleDevTools",
				},
				{
					type: "separator",
				},
				{
					label: "全屏模式",
					role: "togglefullscreen",
				},
				{
					label: "最小化",
					role: "minimize",
				},
				{
					type: "separator",
				},
			],
		},
		{
			label: "帮助",
			submenu: [
				{
					label: "bug反馈",
					click: () => {
						shell.openExternal("https://tieba.baidu.com/p/9117747182");
					},
				},
				{
					label: "版权声明",
					click: () => {
						dialog.showMessageBoxSync(win, {
							message: "【无名杀】属于个人（水乎）开发项目且【完全免费】。如非法倒卖用于牟利将承担法律责任 开发团队将追究到底",
							type: "info",
							title: "版权声明",
							icon: path.join(app.getAppPath(), "app", "noname.ico"),
						});
					},
				},
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
	if (smokeProfile) void verifyPortableStartup(win);
	return win;
}

app.whenReady()
	.then(async () => {
		if (!import.meta.env.DEV) {
			const server = createApp({ dirname, server: true, listen: false });
			if (smokeProfile) server.get("/index.html", async (_request, reply) => reply.type("text/html").send(fs.readFileSync(path.join(dirname, "index.html"), "utf8").replace("<head>", '<head><script src="/__desktop-smoke.js"></script>')));
			if (smokeProfile) server.get("/__desktop-smoke.js", async (_request, reply) => reply.type("application/javascript").send('localStorage.setItem("gplv3_noname_alerted","true");window.confirm=()=>false;window.alert=()=>{};'));
			const address = await server.listen({ port: smokeProfile ? 0 : 8089, host: "localhost" });
			gameAddress = smokeProfile ? address : "http://localhost:8089";
			app.on("before-quit", () => {
				void server.close();
			});
		}
		const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
			try {
				return event.senderFrame === event.sender.mainFrame && new URL(event.senderFrame.url).origin === new URL(gameAddress).origin;
			} catch {
				return false;
			}
		};
		ipcMain.handle("noname:host-start", async event => {
			if (!trusted(event) || hosts.has(event.sender.id)) throw new Error("Host request denied");
			const host = new DirectHost();
			hosts.set(event.sender.id, host);
			try {
				await host.start(payload => {
					if (!event.sender.isDestroyed()) event.sender.send("noname:host-event", payload);
				});
			} catch (error) {
				hosts.delete(event.sender.id);
				throw error;
			}
		});
		ipcMain.on("noname:host-send", (event, id, data) => {
			if (trusted(event)) hosts.get(event.sender.id)?.send(id, data);
		});
		ipcMain.on("noname:host-close", (event, id) => {
			if (trusted(event)) hosts.get(event.sender.id)?.close(id);
		});
		ipcMain.handle("noname:exit", event => {
			if (trusted(event)) BrowserWindow.fromWebContents(event.sender)?.close();
		});

		serverReady = true;
		createWindow();
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			}
		});
	})
	.catch(error => {
		if (smokeProfile) fs.writeFileSync(path.join(smokeProfile, "smoke-result.json"), JSON.stringify({ error: String(error) }));
		else dialog.showErrorBox("启动失败", String(error));
		app.quit();
	});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

async function verifyPortableStartup(win: BrowserWindow) {
	try {
		for (let attempt = 0; attempt < 120; attempt++) {
			await new Promise(resolve => setTimeout(resolve, 500));
			const ready = await win.webContents.executeJavaScript('!!document.querySelector("#splash .splashtext")').catch(() => false);
			if (!ready) continue;
			const result = await win.webContents.executeJavaScript('(async()=>{const {lib}=await import("/noname.js");return {version:lib.version,isolated:typeof window.require==="undefined",preload:typeof window.nonameDesktop?.exit==="function",startupError:document.querySelector("#startup-loading")?.dataset.error||null}})()');
			if (!result.isolated || !result.preload || result.startupError) throw new Error(JSON.stringify(result));
			fs.writeFileSync(path.join(smokeProfile!, "smoke-result.json"), JSON.stringify(result));
			app.exit(0);
			return;
		}
		throw new Error("Portable startup timed out");
	} catch (error) {
		fs.writeFileSync(path.join(smokeProfile!, "smoke-result.json"), JSON.stringify({ error: String(error) }));
		app.exit(1);
	}
}
