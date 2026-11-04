// Run with Electron: an isolated hidden window and temporary profile; no user save is used.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const createApp = require("../packages/fs/dist/index.cjs").default;
const profile = process.env.NONAME_SMOKE_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), "noname-smoke-"));
app.setPath("userData", profile);
let server;
app.whenReady()
	.then(async () => {
		server = createApp({ dirname: path.resolve("dist"), listen: false, server: true });
		server.get("/index.html", async (_req, reply) => reply.type("text/html").send(fs.readFileSync("dist/index.html", "utf8").replace("<head>", "<head><script>window.alert=(message)=>console.error(message);window.confirm=()=>false;window.addEventListener('error',e=>console.error('RAW',e.message,e.error?.stack));window.addEventListener('unhandledrejection',e=>console.error('RAW',e.reason?.stack));</script>")));
		server.get("/__smoke", async (_req, reply) => reply.type("text/html").send('<script>localStorage.setItem("gplv3_noname_alerted","true");location.replace("/index.html")</script>'));
		const address = await server.listen({ port: 0, host: "127.0.0.1" });
		const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.resolve("apps/electron/dist/app/preload.cjs"), additionalArguments: [`--noname-data-root=${path.resolve("dist")}`] } });
		win.webContents.on("console-message", (_event, ...args) => {
			if (args.some(x => /Error|加载.*失败|RAW/.test(String(x)))) console.log("PAGE", ...args);
		});
		await win.loadURL(address + "/__smoke");
		const deadline = Date.now() + 90000;
		while (Date.now() < deadline) {
			await new Promise(resolve => setTimeout(resolve, 500));
			const ready = await win.webContents.executeJavaScript('!!document.querySelector("#splash .splashtext")');
			if (!ready) continue;
			const isolated = await win.webContents.executeJavaScript('typeof window.require === "undefined" && typeof window.nonameDesktop?.exit === "function"');
			if (!isolated) throw new Error("Desktop bridge isolation failed");
			console.log("SMOKE_SPLASH_OK");
			const result = await win.webContents.executeJavaScript(`(async () => {
   const { importSave } = await import('/noname/util/save.js');
   const db = await new Promise((resolve, reject) => { const req = indexedDB.open('smoke-atomic', 1); req.onupgradeneeded = () => { req.result.createObjectStore('config'); req.result.createObjectStore('data'); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
   await importSave(db, {config:{mode:'identity'},data:{test:1}});
   const stored = await new Promise(resolve => { const request = db.transaction('config').objectStore('config').get('mode'); request.onsuccess=()=>resolve(request.result); });
   const failDb = { transaction(...args) { const tx = db.transaction(...args); const objectStore = tx.objectStore.bind(tx); tx.objectStore = name => { const store = objectStore(name); const put = store.put.bind(store); store.put = (value, key) => { if (key === 'broken') throw new Error('simulated disk failure'); return put(value, key); }; return store; }; return tx; } };
   let rejected=false; try { await importSave(failDb,{config:{mode:'single'},data:{broken:1}}); } catch { rejected=true; }
   const retained = await new Promise(resolve => { const request = db.transaction('config').objectStore('config').get('mode'); request.onsuccess=()=>resolve(request.result); });
   if (!rejected || retained !== 'identity') throw new Error('Import rollback failed');
   db.close(); return stored;
  })()`);
			if (result !== "identity") throw new Error("Atomic save smoke failed");
			console.log("SMOKE_INDEXEDDB_OK");
			await win.webContents.executeJavaScript(`(() => { const node=document.querySelector('#splash [link=identity]');node.dispatchEvent(new Event('touchend'));node.click(); })()`);
			for (let attempt = 0; attempt < 90; attempt++) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				if (await win.webContents.executeJavaScript('!!document.querySelector("#arena") && document.querySelector("#startup-loading").hidden')) break;
			}
			const state = await win.webContents.executeJavaScript('({arena:!!document.querySelector("#arena"),loading:!document.querySelector("#startup-loading").hidden, status:document.querySelector(".startup-status").textContent,splash:document.querySelector("#splash")?.className,inSplash:window.inSplash})');
			console.log("SMOKE_GAME", JSON.stringify(state));
			if (!state.arena || state.loading) throw new Error("Game failed to enter");
			win.destroy();
			await server.close();
			app.exit(0);
			return;
		}
		throw new Error("Splash timed out");
	})
	.catch(async error => {
		console.error(error);
		if (server) await server.close();
		app.exit(1);
	});
