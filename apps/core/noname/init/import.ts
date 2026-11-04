/// <reference types="vite/client" />
import { characterPacks, cardPacks, modes } from "@/util/product.js";
import { game } from "noname";

export async function importCardPack(name: string) {
	if (!cardPacks.includes(name)) throw new Error(`精简版不支持此内容：${name}`);
	await importFunction("card", `/card/${name}`);
}

export async function importCharacterPack(name: string) {
	if (!characterPacks.includes(name)) throw new Error(`精简版不支持此内容：${name}`);
	const path = import.meta.env.DEV ? `/character/${name}/index` : `/character/${name}`;
	await importFunction("character", path);
}

function modePath(name: string) {
	if (!modes.includes(name)) throw new Error(`精简版不支持此内容：${name}`);
	return name === "guozhan" && import.meta.env.DEV ? `/mode/${name}/index` : `/mode/${name}`;
}

/** 只预热模块，选择模式后才向引擎注册，避免提前改变当前模式。 */
export async function preloadMode(name: string) {
	await loadModule(modePath(name));
}

export async function importMode(name: string) {
	await importFunction("mode", modePath(name));
}

async function importFunction(type: "card" | "character" | "mode", path: string): Promise<void> {
	const modeContent = await loadModule(path);
	if (!modeContent.type) return;
	if (modeContent.type !== type) {
		throw new Error(`Loaded Content doesn't match "${type}" (received "${modeContent.type}").`);
	}
	// @ts-expect-error ignore
	await game.import(type, modeContent.default);
}

async function loadModule(path: string) {
	return import(/* @vite-ignore */ path + ".js").catch(async e => {
		if (window.isSecureContext) {
			try {
				return await import(/* @vite-ignore */ path + ".ts");
			} catch {
				throw e;
			}
		}
		throw e;
	});
}
