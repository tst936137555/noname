import { importSave, validateSave, MAX_SAVE_BYTES } from "../../../../util/save.js";
import { menuxpages, createConfig } from "../index.js";
import { createSettingsPages, isSettingVisible } from "../settings.js";
import { ui, game, get, lib } from "noname";
import { accessibleButton } from "../../../accessibility.js";
import { resetNetworkIdentity } from "../../../../util/reset.js";

export const optionsMenu = function (connectMenu) {
	if (connectMenu) return;
	const start = menuxpages.shift();
	start.classList.add("settings-page");
	const leftPane = start.firstChild;
	const rightPane = start.lastChild;
	let active;
	for (const section of createSettingsPages(lib.configMenu)) {
		const page = ui.create.div(".settings-section");
		ui.create.div(".settings-heading", section.name, page);
		const selectSection = function () {
			if (active === this) return;
			active?.classList.remove("active");
			active = this;
			active.classList.add("active");
			rightPane.replaceChildren(page);
			rightPane.scrollTop = 0;
			update();
		};
		const button = ui.create.div(".menubutton.large", section.name, leftPane, selectSection);
		accessibleButton(button, selectSection);
		const nodes = new Map();
		const update = () => {
			for (const [key, node] of nodes) {
				if (key === "import_data_button") continue;
				node.style.display = isSettingVisible(key, lib.config, {
					touchAvailable: "ontouchstart" in document,
					device: lib.device,
					node: lib.node,
				})
					? ""
					: "none";
			}
		};
		for (const [key, definition] of Object.entries(section.config)) {
			const cfg = get.copy(definition);
			cfg._name = key;
			if (key === "export_data") cfg.name = "导出游戏存档";
			if (key === "import_data") cfg.name = "导入游戏存档";
			if (key in lib.config) cfg.init = lib.config[key];
			else if (!cfg.clear) game.saveConfig(key, cfg.init);
			cfg.onclick ??= function (result) {
				game.saveConfig(key, result);
				cfg.onsave?.call(this, result);
			};
			cfg.update = update;
			// 保留内置音乐和已导入曲目，不再暴露音乐文件管理。
			if (key === "background_music") {
				delete cfg.item.music_custom;
				if (cfg.init === "music_custom") cfg.init = "music_off";
			}
			const node = createConfig(cfg, page);
			nodes.set(key, node);
			if (key === "import_data_button") {
				ui.import_data_button = node;
				node.classList.add("hidden");
				bindImport(node);
			}
		}
		if (section.name === "存档管理") {
			const restore = document.createElement("button");
			restore.textContent = "恢复上次导入前的存档";
			restore.onclick = async () => {
				if (restore.disabled) return;
				restore.disabled = true;
				try {
					const backup = await game.getDB("data", "__noname_import_backup__");
					if (!backup) {
						alert("暂无导入前的恢复快照。");
						return;
					}
					if (!confirm("将恢复上次导入前的存档并重新启动，是否继续？")) return;
					await importSave(lib.db, backup);
					game.reload();
				} catch {
					alert("恢复失败，当前存档未更改。");
				} finally {
					restore.disabled = false;
				}
			};
			page.appendChild(restore);
			const identity = document.createElement("button");
			identity.textContent = "重置联机身份";
			identity.onclick = async () => {
				if (!confirm("将断开连接并生成新的联机身份，旧房间身份无法沿用；游戏存档保持不变。是否继续？")) return;
				identity.disabled = true;
				try {
					await resetNetworkIdentity({ prefix: lib.configprefix, db: lib.db });
					game.reload();
				} catch {
					alert("联机身份未重置，请稍后重试。");
				} finally {
					identity.disabled = false;
				}
			};
			page.appendChild(identity);
		}
		if (!active) {
			active = button;
			button.classList.add("active");
			rightPane.appendChild(page);
		}
		update();
	}
};

function bindImport(node) {
	node.querySelector("button").onclick = async function () {
		if (this.disabled) return;
		const file = node.querySelector("input").files[0];
		if (!file) return;
		if (file.size > MAX_SAVE_BYTES) {
			alert("存档超过 32 MiB 限制。");
			return;
		}
		let data;
		try {
			data = JSON.parse(lib.init.decode(await file.text()));
			if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid save");
			validateSave(data);
		} catch {
			alert("导入失败：请选择有效的游戏存档。");
			return;
		}
		const version = typeof data.gameVersion === "string" ? data.gameVersion : "旧版";
		if (!confirm(`将导入 ${version} 存档，覆盖当前设置与存档并重新启动。录像不受影响。是否继续？`)) return;
		this.disabled = true;
		try {
			await importSave(lib.db, data);
			alert("导入成功，游戏将重新启动。");
			// 启动时统一修正旧存档外观，不在重启前应用旧字体／布局。
			game.reload();
		} catch {
			alert("导入失败：无法写入游戏存档。");
		} finally {
			this.disabled = false;
		}
	};
}
