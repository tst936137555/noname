import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld(
	"nonameDesktop",
	Object.freeze({
		legacyDirectory: process.argv.find(arg => arg.startsWith("--noname-data-root="))?.slice("--noname-data-root=".length),
		exit: () => ipcRenderer.invoke("noname:exit"),
		host: Object.freeze({
			ip: process.argv.find(arg => arg.startsWith("--noname-host-ip="))?.slice("--noname-host-ip=".length) || "127.0.0.1",
			start: () => ipcRenderer.invoke("noname:host-start"),
			send: (id: string, data: string) => {
				if (typeof id === "string" && typeof data === "string" && data.length <= 1024 * 1024) ipcRenderer.send("noname:host-send", id, data);
			},
			close: (id: string) => {
				if (typeof id === "string") ipcRenderer.send("noname:host-close", id);
			},
			onEvent: (callback: (event: unknown) => void) => {
				const listener = (_event: unknown, payload: unknown) => callback(payload);
				ipcRenderer.on("noname:host-event", listener);
				return () => ipcRenderer.removeListener("noname:host-event", listener);
			},
		}),
	})
);
