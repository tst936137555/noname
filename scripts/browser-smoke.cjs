// Run with Electron: an isolated hidden window and temporary profile; no user save is used.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const createApp = require("../packages/fs/dist/index.cjs").default;
const profile = process.env.NONAME_SMOKE_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), "noname-smoke-"));
app.setPath("userData", profile);
let server;
const buildRoot = process.env.NONAME_SMOKE_ROOT || "dist";
app.whenReady()
	.then(async () => {
		server = createApp({ dirname: path.resolve(buildRoot), listen: false, server: true });
		if (buildRoot !== "dist") {
			server.get("/image/*", async (req, reply) => reply.sendFile(req.params["*"], path.resolve("dist/image")));
			server.get("/audio/*", async (req, reply) => reply.sendFile(req.params["*"], path.resolve("dist/audio")));
		}
		server.get("/index.html", async (_req, reply) => reply.type("text/html").send(fs.readFileSync(path.join(buildRoot, "index.html"), "utf8").replace("<head>", "<head><script>window.__smokeErrors=[];window.alert=(message)=>window.__smokeErrors.push(String(message));window.confirm=()=>false;window.addEventListener('error',e=>{if(e.error)window.__smokeErrors.push(String(e.error.stack||e.message))});window.addEventListener('unhandledrejection',e=>window.__smokeErrors.push(String(e.reason?.stack||e.reason)));</script>")));
		server.get("/__smoke", async (_req, reply) => reply.type("text/html").send('<script>localStorage.setItem("gplv3_noname_alerted","true");location.replace("/index.html")</script>'));
		const address = await server.listen({ port: 0, host: "127.0.0.1" });
		const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.resolve("apps/electron/dist/app/preload.cjs"), additionalArguments: [`--noname-data-root=${path.resolve("dist")}`] } });
		win.webContents.on("console-message", (_event, ...args) => {
			const message = args.map(value => (typeof value === "object" ? value.message || JSON.stringify(value) : String(value))).join(" ");
			if (/Error|加载.*失败|RAW|Cannot|Uncaught/.test(message)) console.log("PAGE", message);
		});
		await win.loadURL(address + "/__smoke");
		const deadline = Date.now() + 90000;
		let lastStatus = "";
		while (Date.now() < deadline) {
			await new Promise(resolve => setTimeout(resolve, 500));
			const ready = await win.webContents.executeJavaScript('!!document.querySelector("#splash .splashtext")');
			const status = await win.webContents.executeJavaScript('document.querySelector(".startup-status")?.textContent');
			if (status !== lastStatus) {
				console.log("SMOKE_STARTUP", status);
				lastStatus = status;
			}
			const startupErrors = await win.webContents.executeJavaScript("window.__smokeErrors || []");
			if (startupErrors.length) throw new Error("Startup browser errors: " + startupErrors.join(" | "));
			const startupFailure = await win.webContents.executeJavaScript('document.querySelector("#startup-loading")?.dataset.error');
			if (startupFailure) throw new Error("Startup failed: " + startupFailure);
			if (!ready) continue;
			const isolated = await win.webContents.executeJavaScript('typeof window.require === "undefined" && typeof window.nonameDesktop?.exit === "function"');
			if (!isolated) throw new Error("Desktop bridge isolation failed");
			console.log("SMOKE_SPLASH_OK");
			const checks = await win.webContents.executeJavaScript(`(async () => {
   const { importSave, exportSave, migrateLegacySave } = await import('/noname/util/save.js');
   const {lib,game,get} = await import('/noname.js');
   lib.config.new_tutorial=false;
   const db = await new Promise((resolve,reject)=>{const req=indexedDB.open('smoke-atomic',1);req.onupgradeneeded=()=>{req.result.createObjectStore('config');req.result.createObjectStore('data')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
   await importSave(db,{config:{mode:'identity'},data:{old:'PRIVATE_PREVIOUS_SAVE'}});
   await importSave(db,{config:{mode:'identity'},data:{current:1}});
   const exported=await exportSave(db,lib.version);
   if(exported.data.__noname_import_backup__ || JSON.stringify(exported).includes('PRIVATE_PREVIOUS_SAVE') || exported.formatVersion!==1) throw new Error('Export includes recovery data');
   const failDb={transaction(...args){const tx=db.transaction(...args);const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);const put=store.put.bind(store);store.put=(value,key)=>{if(key==='broken')throw new Error('simulated disk failure');return put(value,key)};return store};return tx}};
   let rejected=false;try{await importSave(failDb,{config:{mode:'single'},data:{broken:1}})}catch{rejected=true}
   let warning=false; await migrateLegacySave({db,text:'broken legacy',decode:text=>text,onWarning:()=>{warning=true}});
   const retained=await exportSave(db,lib.version);
   if(!rejected || !warning || retained.config.mode!=='identity' || retained.data.current!==1)throw new Error('Save rollback or migration fallback failed');
   db.close();return {atomic:true,export:true,legacyFallback:true};
  })()`);
			console.log("SMOKE_BOUNDARIES", JSON.stringify(checks));
			const metrics = await win.webContents.executeJavaScript('({splashReadyMs:Math.round(performance.now()),resourceCount:performance.getEntriesByType("resource").length,scriptCount:performance.getEntriesByType("resource").filter(x=>x.initiatorType==="script").length,resourceBytes:performance.getEntriesByType("resource").reduce((sum,x)=>sum+x.encodedBodySize,0)})');
			fs.mkdirSync("output", { recursive: true });
			fs.writeFileSync("output/browser-metrics.json", JSON.stringify(metrics, null, 2));
			console.log("SMOKE_METRICS", JSON.stringify(metrics));
			if (metrics.scriptCount > 40 || metrics.resourceCount > 100) throw new Error("Startup resource budget exceeded");
			await win.webContents.executeJavaScript(`(() => { const node=document.querySelector('#splash [link=identity]');node.dispatchEvent(new Event('touchend'));node.click(); })()`);
			for (let attempt = 0; attempt < 90; attempt++) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				if (await win.webContents.executeJavaScript('!!document.querySelector("#arena") && document.querySelector("#startup-loading").hidden')) break;
			}
			const state = await win.webContents.executeJavaScript('({arena:!!document.querySelector("#arena"),loading:!document.querySelector("#startup-loading").hidden, status:document.querySelector(".startup-status").textContent,splash:document.querySelector("#splash")?.className,inSplash:window.inSplash})');
			console.log("SMOKE_GAME", JSON.stringify(state));
			if (!state.arena || state.loading) throw new Error("Game failed to enter");
			await win.webContents.executeJavaScript(`(async()=>{
    const {ui,lib,game,get,_status}=await import('/noname.js');
    for(let i=0;i<40 && !ui.click.configMenu;i++)await new Promise(r=>setTimeout(r,100));
    if(!ui.click.configMenu)lib.init.onfree();
    for(let i=0;i<40 && !ui.click.configMenu;i++)await new Promise(r=>setTimeout(r,100));
    if(!ui.click.configMenu)throw new Error('Menu initialization did not complete');
    ui.click.configMenu();await new Promise(r=>setTimeout(r,50));
    if(!ui.menuContainer.contains(document.activeElement))throw new Error('Dialog did not focus a control');
    const options=[...ui.menuContainer.querySelectorAll('[role="tab"]')].find(n=>n.textContent==='选项');
    options.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const section=[...ui.menuContainer.querySelectorAll('.settings-page .menubutton')].find(n=>n.textContent==='操作设置');
    section.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const control=ui.menuContainer.querySelector('.settings-section [role="switch"]');
    if(!control)throw new Error('No keyboard-accessible setting');
    const before=control.getAttribute('aria-checked');control.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));await Promise.resolve();
    if(control.getAttribute('aria-checked')===before)throw new Error('Keyboard switch failed');
    ui.menuContainer.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    if(!ui.menuContainer.classList.contains('hidden'))throw new Error('Escape did not close dialog');
    const input=document.createElement('input');document.body.appendChild(input);input.focus();const auto=_status.auto;
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));if(_status.auto!==auto)throw new Error('Typing triggered a shortcut');input.remove();
   const originalBroadcast=game.broadcast;
   let captured,said=0;
   const fake={playerid:'smoke-serialization',say(){said++}};
   game.broadcast=fn=>{captured=fn};
   try {lib.element.Player.prototype.chat.call(fake,'hello')} finally {game.broadcast=originalBroadcast}
   const originalPlayers=lib.playerOL;lib.playerOL={'smoke-serialization':fake};
   try {
     const restored=get.parsedResult(get.stringifiedResult(captured));
     restored('smoke-serialization','hello');
     if(said!==2)throw new Error('Serialized engine callback lost its global identifiers');
   } finally {lib.playerOL=originalPlayers}
   game.requireSandboxOn('smoke-isolation');
   localStorage.setItem('smoke-private-value','PRIVATE_TEST_VALUE');
   if(get.parsedResult('_noname_func:function(){return 7}')()!==7)throw new Error('Sandbox cannot run a harmless function');
   for(const expression of ['localStorage.getItem("smoke-private-value")','localStorage["smoke-private-value"]','lib.db','window.nonameDesktop']) {
     const remote=get.parsedResult('_noname_func:function(){return '+expression+'}');
     let value;try{value=remote()}catch{continue}
     if(value && (typeof value==='object' || value==='PRIVATE_TEST_VALUE'))throw new Error('Remote private capability was exposed');
   }

   const prior={online:game.online,onlineroom:game.onlineroom,ws:game.ws,sandbox:game.sandbox,reload:game.reload};
   let reloads=0;game.reload=()=>{reloads++};game.online=true;
   try {await lib.element.ws.onclose.call({}, {code:1008});if(reloads || game.online)throw new Error('Failed authentication triggered an automatic reload loop');}
   finally {Object.assign(game,prior)}

  })()`);
			console.log("SMOKE_INTERACTION_ISOLATION_OK");
			const pageErrors = await win.webContents.executeJavaScript("window.__smokeErrors");
			if (pageErrors.length) throw new Error("Unexpected browser errors: " + pageErrors.join(" | "));
			win.webContents.session.webRequest.onBeforeRequest({ urls: [address + "/noname/entry.js*"] }, (_details, callback) => callback({ cancel: true }));
			await win.loadURL(address + "/index.html");
			await new Promise(resolve => setTimeout(resolve, 1500));
			const recovery = await win.webContents.executeJavaScript('!document.querySelector("#startup-loading").hidden && !document.querySelector("#startup-loading button").hidden && !document.querySelector("#startup-diagnostics").hidden');
			if (!recovery) throw new Error("Module-graph failure has no recovery controls");
			console.log("SMOKE_RECOVERY_OK");
			win.destroy();
			await server.close();
			app.exit(0);
			return;
		}
		console.log("SMOKE_FAILURE_STATE", await win.webContents.executeJavaScript('JSON.stringify({status:document.querySelector(".startup-status")?.textContent,retry:document.querySelector("#startup-loading button")?.hidden,errors:window.__smokeErrors,iframes:document.querySelectorAll("iframe").length})'));
		throw new Error("Splash timed out");
	})
	.catch(async error => {
		console.error(error);
		if (server) await server.close();
		app.exit(1);
	});
