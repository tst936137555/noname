const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const createApp = require("../packages/fs/dist/index.cjs").default;
app.setPath("userData", process.env.NONAME_SMOKE_PROFILE);
app.on("window-all-closed", () => {});
let server;
const results = [];
app.whenReady()
	.then(async () => {
		server = createApp({ dirname: path.resolve("dist"), listen: false, server: true });
		server.get("/__audit-setup.js", async (_q, r) => r.type("application/javascript").send('window.__auditErrors=[];window.alert=x=>window.__auditErrors.push(String(x));window.confirm=()=>false;window.addEventListener("error",e=>{if(e.error)window.__auditErrors.push(String(e.error.stack||e.error))});window.addEventListener("unhandledrejection",e=>window.__auditErrors.push(String(e.reason?.stack||e.reason)));localStorage.setItem("gplv3_noname_alerted","true");'));
		server.get("/index.html", async (_q, r) => r.type("text/html").send(fs.readFileSync("dist/index.html", "utf8").replace("<head>", '<head><script src="/__audit-setup.js"></script>')));
		const address = await server.listen({ port: 0, host: "127.0.0.1" });
		for (const mode of ["identity", "guozhan", "versus", "doudizhu", "single", "connect"]) {
			const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { partition: "audit-" + mode, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.resolve("apps/electron/dist/app/preload.cjs") } });
			try {
				await win.loadURL(address + "/index.html");
				const poll = async expression => {
					for (let i = 0; i < 150; i++) {
						if (await win.webContents.executeJavaScript(expression)) return;
						await new Promise(r => setTimeout(r, 200));
					}
					throw Error("Mode wait timed out: " + mode);
				};
				await poll('!!document.querySelector("#splash .splashtext")');
				await win.webContents.executeJavaScript("(()=>{const n=document.querySelector(" + JSON.stringify("#splash [link=" + mode + "]") + ');n.dispatchEvent(new Event("touchend"));n.click()})()');
				await poll('!!document.querySelector("#arena") && !!document.querySelector("#startup-loading")?.hidden');
				await new Promise(r => setTimeout(r, 700));
				const state = await win.webContents.executeJavaScript('(async()=>{const {lib,game}=await import("/noname.js");const resources=performance.getEntriesByType("resource");const groups={};for(const r of resources){const p=new URL(r.name).pathname;const group=p.split("/")[1];const g=groups[group]??={count:0,bytes:0};g.count++;g.bytes+=r.encodedBodySize}return {mode:lib.config.mode,players:game.players.length,errors:window.__auditErrors,resources:resources.length,bytes:resources.reduce((n,r)=>n+r.encodedBodySize,0),groups,largest:resources.sort((a,b)=>b.encodedBodySize-a.encodedBodySize).slice(0,10).map(r=>({path:new URL(r.name).pathname,bytes:r.encodedBodySize}))}})()');
				if (state.errors.length) throw Error(state.errors.join(" | "));
				const expected = { identity: 8, guozhan: 8, versus: 4, doudizhu: 3, single: 2, connect: 0 };
				if (state.players !== expected[mode]) throw Error("Unexpected player count: " + state.players);
				if (state.bytes > 40 * 1024 * 1024 || state.resources > 220) throw Error("Mode resource budget exceeded");
				results.push(state);
				console.log("MODE_OK", mode, state.players, state.resources, state.bytes);
			} catch (e) {
				results.push({ mode, error: String(e) });
				console.log("MODE_FAIL", mode, String(e));
			} finally {
				win.destroy();
			}
		}
		fs.writeFileSync("output/mode-metrics.json", JSON.stringify(results, null, 2));
		await server.close();
		app.exit(results.some(r => r.error || r.errors?.length) ? 1 : 0);
	})
	.catch(async e => {
		console.error(e);
		if (server) await server.close();
		app.exit(1);
	});
