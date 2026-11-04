/**
 * 从读取的内容中获取数据
 */

import { lib, game, get, _status, ui, ai } from "noname";
import { characterPacks, modes } from "@/util/product.js";

/**
 * 读取导入的卡牌包信息
 */
export function loadCard(cardConfig: importCardConfig) {
	const cardConfigName = cardConfig.name;

	lib.cardPack[cardConfigName] ??= [];
	if (cardConfig.card) {
		for (let [cardPackName, cardPack2] of Object.entries(cardConfig.card)) {
			if (!(!cardPack2.hidden && cardConfig.translate[`${cardPackName}_info`])) {
				continue;
			}
			lib.cardPack[cardConfigName].add(cardPackName);
		}
	}

	for (const [configName, configItem] of Object.entries(cardConfig)) {
		switch (configName) {
			case "name":
			case "mode":
			case "forbid":
				break;
			case "connect":
				// @ts-expect-error ignore
				lib.connectCardPack.push(cardConfigName);
				break;
			case "list":
				if (lib.config.mode === "connect") {
					// @ts-expect-error ignore
					lib.cardPackList[cardConfigName] ??= [];
					// @ts-expect-error ignore
					lib.cardPackList[cardConfigName].addArray(configItem);
				} else if (lib.config.cards.includes(cardConfigName)) {
					/**
					 * @type {any[]}
					 */
					let pile = typeof configItem == "function" ? configItem() : configItem;

					lib.cardPile[cardConfigName] ??= [];
					lib.cardPile[cardConfigName].addArray(pile);

					if (lib.config.bannedpile[cardConfigName]) {
						pile = pile.filter((_value, index) => !lib.config.bannedpile[cardConfigName].includes(index));
					}

					if (lib.config.addedpile[cardConfigName]) {
						pile = [...pile, ...lib.config.addedpile[cardConfigName]];
					}

					lib.card.list.addArray(pile);
				}
				break;
			default:
				for (const [itemName, item] of Object.entries(configItem)) {
					if (configName === "skill" && itemName[0] === "_" && !item.forceLoad && (lib.config.mode !== "connect" ? !lib.config.cards.includes(cardConfigName) : !cardConfig.connect)) {
						continue;
					}

					if (configName === "translate" && itemName === cardConfigName) {
						lib[configName][`${itemName}_card_config`] = item;
					} else {
						if (lib[configName][itemName] == null) {
							if (configName === "skill" && !item.forceLoad && lib.config.mode === "connect" && !cardConfig.connect) {
								lib[configName][itemName] = {
									nopop: item.nopop,
									derivation: item.derivation,
								};
							} else {
								// @ts-expect-error ignore
								Object.defineProperty(lib[configName], itemName, Object.getOwnPropertyDescriptor(configItem, itemName));
							}
						} else {
							console.log(`duplicated ${configName} in card ${cardConfigName}:\n${itemName}:\nlib.${configName}.${itemName}`, lib[configName][itemName], `\ncard.${cardConfigName}.${configName}.${itemName}`, item);
						}

						if (configName === "card" && lib[configName][itemName].derivation) {
							// @ts-expect-error ignore
							lib.cardPack.mode_derivation ??= [];
							// @ts-expect-error ignore
							lib.cardPack.mode_derivation.push(itemName);
						}
					}
				}
				break;
		}
	}
}

/**
 * 读取牌堆信息
 */
export function loadCardPile() {
	if (lib.config.mode === "connect") {
		// @ts-expect-error ignore
		lib.cardPackList = {};
	} else {
		let pilecfg = lib.config.customcardpile[get.config("cardpilename") || "当前牌堆"];
		if (pilecfg) {
			lib.config.bannedpile = get.copy(pilecfg[0] || {});
			lib.config.addedpile = get.copy(pilecfg[1] || {});
		} else {
			lib.config.bannedpile = {};
			lib.config.addedpile = {};
		}
	}
}

/**
 * 读取导入的武将包信息
 */
export function loadCharacter(character: importCharacterConfig) {
	let name = character.name;
	if (!characterPacks.includes(name)) return;

	if (character.character) {
		const characterPack = lib.characterPack[name];
		if (characterPack) {
			Object.assign(characterPack, character.character);
		} else {
			lib.characterPack[name] = character.character;
		}
	}

	// 摆了
	for (let key in character) {
		let value = character[key];

		switch (key) {
			case "name":
			case "mode":
			case "forbid":
				break;
			case "connect":
				// @ts-expect-error ignore
				lib.connectCharacterPack.push(name);
				break;
			case "character":
				if (!lib.config.characters.includes(name) && lib.config.mode !== "connect") {
					break;
				}
			// [falls through]
			default:
				if (Array.isArray(lib[key]) && Array.isArray(value)) {
					lib[key].addArray(value);
					break;
				}

				for (let key2 in value) {
					let value2 = value[key2];

					if (key === "character") {
						if (lib.config[`forbidai_user_${name}`] || lib.config.forbidai_user?.includes(key2)) {
							lib.config.forbidai.add(key2);
						}
						if (Array.isArray(value2)) {
							if (!value2[4]) {
								value2[4] = [];
							}
							if (value2[4].includes("boss") || value2[4].includes("hiddenboss")) {
								lib.config.forbidai.add(key2);
							}
							for (const skill of value2[3]) {
								lib.skilllist.add(skill);
							}
						} else {
							if (value2.isBoss || value2.isHiddenBoss) {
								lib.config.forbidai.add(key2);
							}
							if (value2.skills) {
								for (const skill of value2.skills) {
									lib.skilllist.add(skill);
								}
							}
						}
					}

					if (key === "skill" && key2[0] === "_" && (lib.config.mode !== "connect" ? !lib.config.characters.includes(name) : !character.connect)) {
						continue;
					}

					if (key === "translate" && key2 === name) {
						lib[key][`${key2}_character_config`] = value2;
					} else {
						if (lib[key][key2] == null) {
							if (key === "skill" && !value2.forceLoad && lib.config.mode === "connect" && !character.connect) {
								lib[key][key2] = {
									nopop: value2.nopop,
									derivation: value2.derivation,
								};
							} else if (key === "character") {
								lib.character[key2] = value2;
							} else {
								// @ts-expect-error ignore
								Object.defineProperty(lib[key], key2, Object.getOwnPropertyDescriptor(character[key], key2));
							}
							if (key === "card" && lib[key][key2].derivation) {
								// @ts-expect-error ignore
								if (!lib.cardPack.mode_derivation) {
									// @ts-expect-error ignore
									lib.cardPack.mode_derivation = [key2];
								} else {
									// @ts-expect-error ignore
									lib.cardPack.mode_derivation.push(key2);
								}
							}
						} else if (Array.isArray(lib[key][key2]) && Array.isArray(value2)) {
							lib[key][key2].addArray(value2);
						} else {
							console.log(`duplicated ${key} in character ${name}:\n${key2}:\nlib.${key}.${key2}`, lib[key][key2], `\ncharacter.${name}.${key}.${key2}`, value2);
						}
					}
				}
				break;
		}
	}
}

/**
 * 读取当前的模式信息
 */
export function loadMode(mode: importModeConfig) {
	if (!modes.includes(mode.name)) throw new Error(`精简版不支持此模式：${mode.name}`);
	mixinLibrary(mode, lib);
	mixinGeneral(mode, "game", game);
	mixinGeneral(mode, "ui", ui);
	mixinGeneral(mode, "get", get);
	mixinGeneral(mode, "ai", ai);

	["onwash", "onover"].forEach(name => {
		if (game[name]) {
			lib[name]?.push(game[name]);
			delete game[name];
		}
	});

	if (typeof mode.init == "function") {
		mode.init();
	}
}

/**
 * 通用形式的内容注入
 *
 * 由于历史原因，故直接覆盖对应的变量
 *
 * @template {Object} T
 * @param {importModeConfig} config
 * @param {string} name
 * @param {T} where
 * @return {void}
 */
function mixinGeneral(config, name, where) {
	if (!config[name]) {
		return;
	}

	for (let [key, value] of Object.entries(config[name])) {
		if (["ui", "ai"].includes(name)) {
			if (typeof value == "object") {
				// 我甚至不敢把这个双等于改了，怕了
				if (where[key] == undefined) {
					where[key] = {};
				}
				for (let [key2, value2] of Object.entries(value)) {
					where[key][key2] = value2;
				}
			} else {
				where[key] = value;
			}
		} else {
			where[key] = value;
		}
	}
}

/**
 * `lib`的内容注入
 *
 * @param {importModeConfig} config
 * @param {Library} lib
 * @return {void}
 */
function mixinLibrary(config, lib) {
	const KeptWords = ["name", "element", "game", "ai", "ui", "get", "config", "onreinit", "start", "startBefore"];

	// @ts-expect-error ignore
	lib.element = mixinElement(config, lib.element);
	lib.config.banned = lib.config[`${lib.config.mode}_banned`] || [];
	lib.config.bannedcards = lib.config[`${lib.config.mode}_bannedcards`] || [];
	// @ts-expect-error ignore
	lib.rank = window.noname_character_rank;
	// @ts-expect-error ignore
	delete window.noname_character_rank;
	// @ts-expect-error ignore
	Object.keys(window.noname_character_replace).forEach(i => (lib.characterReplace[i] = window.noname_character_replace[i]));
	// @ts-expect-error ignore
	delete window.noname_character_replace;
	// @ts-expect-error ignore
	Object.keys(window.noname_character_perfectPairs).forEach(i => (lib.perfectPair[i] = window.noname_character_perfectPairs[i]));
	// @ts-expect-error ignore
	delete window.noname_character_perfectPairs;

	for (let name in config) {
		if (KeptWords.includes(name)) {
			continue;
		}
		if (lib[name] == null) {
			lib[name] = Array.isArray(config[name]) ? [] : {};
		}

		Object.assign(lib[name], config[name]);
	}
}

/**
 * `lib.element`的内容注入
 *
 * @param {importModeConfig} config
 * @param {Record<string, Object>} element
 * @return {Record<string, Object>}
 */
function mixinElement(config, element) {
	let newElement = { ...element };

	if (config.element) {
		for (let name in config.element) {
			if (!newElement[name]) {
				newElement[name] = [];
			}

			let source = config.element[name];
			let target = newElement[name];

			for (let key in source) {
				if (key === "init") {
					if (!target.inits) {
						target.inits = [];
					}
					target.inits.push(source[key]);
				} else {
					target[key] = source[key];
				}
			}
		}
	}

	return newElement;
}
