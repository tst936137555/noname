// Restored from bdd273e and adapted to the structured event API; only dependencies of retained content are registered.
import { lib, game, ui, get, ai, _status } from "noname";
/** @satisfies {importCharacterConfig["skill"]} */
const dependencySkills = {
twqiushou: {
		trigger: { global: "useCardAfter" },
		filter(event, player) {
			if (event.card.name !== "nanman") {
				return false;
			}
			let num = 0;
			let bool = false;
			for (const target of event.targets) {
				if (!target.isAlive()) {
					bool = true;
				}
				target.getHistory("damage", evt => {
					if (evt.getParent(2) === event) {
						num += evt.num;
					}
					return false;
				});
			}
			return player.hasZhuSkill("twqiushou") && (bool || num > 3);
		},
		zhuSkill: true,
		forced: true,
		logTarget(event, player) {
			return game.filterPlayer(target => {
				return ["shu", "qun"].includes(target.group);
			});
		},
		async content(event, trigger, player) {
			await game.asyncDraw(game.filterPlayer(target => ["shu", "qun"].includes(target.group)));
			await game.delayx();
		},
	},
twjuxiang: {
		global: "twjuxiang_global",
		zhuSkill: true,
		subSkill: {
			global: {
				audio: "twjuxiang",
				usable: 1,
				enable: "phaseUse",
				forceaudio: true,
				filter(event, player) {
					return (
						player.countCards("e") > 0 &&
						player.group == "qun" &&
						game.hasPlayer(function (target) {
							return target != player && target.hasZhuSkill("twjuxiang", player) && player.countCards("e", card => target.hasEmptySlot(get.subtype(card)) || target.hasDisabledSlot(get.subtype(card))) > 0;
						})
					);
				},
				filterTarget(card, player, target) {
					return target != player && target.hasZhuSkill("twjuxiang", player) && (target.hasEmptySlot(get.subtype(ui.selected.cards[0])) || target.hasDisabledSlot(get.subtype(ui.selected.cards[0])));
				},
				filterCard: { type: "equip" },
				position: "e",
				check(card) {
					return get.value(card);
				},
				prompt: "将装备区中的一张牌置入主公的装备区中或恢复主公的对应装备栏",
				discard: false,
				lose: false,
				async content(event, trigger, player) {
					const { target, cards } = event;
					if (target.hasEmptySlot(get.subtype(cards[0]))) {
						player.$give(cards[0], target, false);
						target.equip(cards[0]);
					} else {
						target.gain({ cards: [cards[0]], source: player, animate: "give" });
						target.enableEquip({slots: [get.subtype(cards[0]) || "equip1"]});
					}
				},
				ai: {
					order: 7,
					result: {
						target: 1,
					},
				},
			},
		},
	},
twchongwang: {
		init(player) {
			player.storage.twchongwang = [];
			player.storage.twchongwangx = [];
		},
		mod: {
			playerEnabled(card, player, target) {
				if (!player.hasZhuSkill("twchongwang")) {
					return;
				}
				if (get.tag(card, "damage") > 0 && player.storage.twchongwangx.includes(target)) {
					return false;
				}
			},
			targetEnabled(card, player, target) {
				if (!target.hasZhuSkill("twchongwang")) {
					return;
				}
				if (get.tag(card, "damage") > 0 && target.storage.twchongwangx.includes(player)) {
					return false;
				}
			},
		},
		locked: false,
		onremove: true,
		global: "twchongwang_global",
		group: "twchongwang_clear",
		audio: 2,
		zhuSkill: true,
		subSkill: {
			clear: {
				charlotte: true,
				trigger: { player: "phaseAfter" },
				direct: true,
				async content(event, trigger, player) {
					player.storage.twchongwangx = [];
				},
			},
			global: {
				trigger: { player: "phaseUseBegin" },
				filter(event, player) {
					return (
						player.group === "qun" &&
						game.hasPlayer(current => {
							return current !== player && current.hasZhuSkill("twchongwang", player) && !current.storage.twchongwang.includes(player);
						})
					);
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseCardTarget({
							prompt: "崇望：是否将一张牌交给主公并获得双重庇护？",
							selectCard: 1,
							filterCard: true,
							filterTarget(card, player, target) {
								return target !== player && target.hasZhuSkill("twchongwang", player) && !target.storage.twchongwang.includes(player);
							},
							position: "he",
							ai1(card) {
								if (card.name === "du") {
									return 10;
								} else if (ui.selected.cards.length && ui.selected.cards[0].name === "du") {
									return 0;
								}
								const player = _status.event.player;
								if (
									ui.selected.cards.length > 4 ||
									!game.hasPlayer(current => {
										return get.attitude(player, current) > 0 && !current.hasSkillTag("nogain");
									})
								) {
									return 0;
								}
								return 1 / Math.max(0.1, get.value(card));
							},
							ai2(target) {
								const player = _status.event.player;
								let att = get.attitude(player, target);
								if (ui.selected.cards[0].name === "du") {
									return -att;
								}
								if (target.hasSkillTag("nogain")) {
									att /= 6;
								}
								return att;
							},
						})
						.forResult();
				},
				async content(event, trigger, player) {
					const target = event.targets[0];
					await target.gain({
						cards: event.cards,
						source: player,
						animate: "giveAuto",
					});
					target.storage.twchongwang.push(player);
					target.storage.twchongwangx.push(player);
				},
			},
		},
	},
junklangmie: {
		audio: "langmie",
		trigger: { global: "phaseJieshuBegin" },
		direct: true,
		filter(event, player) {
			if (player == event.player || player.countCards("he") == 0) {
				return false;
			}
			var num = 0;
			if (
				event.player.hasHistory("sourceDamage", function (evt) {
					num += evt.num;
					return num >= 2;
				})
			) {
				return true;
			}
			var map = {};
			return event.player.hasHistory("useCard", function (i) {
				var name = get.type2(i.card, false);
				if (!map[name]) {
					map[name] = true;
					return false;
				}
				return true;
			});
		},
		async content(event, trigger, player) {
			let result;

			// step 0
			const list = [];
			let num = 0;
			const target = trigger.player;
			event.target = target;
			event.choices = [];
			const map = {};

			if (
				target.hasHistory("useCard", i => {
					const name = get.type2(i.card, false);
					if (!map[name]) {
						map[name] = true;
						return false;
					}
					return true;
				})
			) {
				list.push("弃置一张牌，然后摸两张牌");
				event.choices.push("draw");
			}

			if (
				target.hasHistory("sourceDamage", evt => {
					num += evt.num;
					return num >= 2;
				})
			) {
				list.push("弃置一张牌，对" + get.translation(target) + "造成1点伤害");
				event.choices.push("damage");
			}

			result = await player
				.chooseControl({controls: ["cancel2"]})
				.set("choiceList", list)
				.set("ai", function () {
					const player = _status.event.player;
					const choices = (_status.event.getParent()?.choices || []).slice(0);
					choices.push("cancel");
					const choicex = choices.slice(0);
					const getx = function (a) {
						switch (a) {
							case "draw":
								return 2 * get.effect(player, { name: "draw" }, player, player);
							case "damage":
								return get.damageEffect(_status.event.getParent()?.target || player, player, player);
							default:
								return 0;
						}
					};
					choices.sort(function (a, b) {
						return (getx(b) || 0) - (getx(a) || 0);
					});
					return choicex.indexOf(choices[0] || "cancel");
				})
				.set("prompt", get.prompt("junklangmie", target))
				.forResult();

			// step 1
			if (result.control == "cancel2") {
				return;
			}

			event.choice = event.choices[result.index ?? 0];
			result = await player
				.chooseToDiscard({position: "he"})
				.set("ai", card => 7 - get.value(card))
				.set("logSkill", event.choice == "draw" ? "junklangmie" : ["junklangmie", target])
				.forResult();

			// step 2
			if (result.bool) {
				if (event.choice == "draw") {
					await player.draw(2);
				} else {
					await target.damage();
				}
			}
		},
	},
twniju: {
		audio: 2,
		zhuSkill: true,
		trigger: {
			global: "compare",
		},
		priority: 1,
		filter(event, player) {
			if (!player.hasZhuSkill("twniju")) {
				return false;
			}
			if (event.iwhile || (event.target && event.compareMeanwhile)) {
				return false;
			}
			const participant = [event.player];
			if (event.targets) {
				participant.addArray(event.targets);
			} else {
				participant.add(event.target);
			}
			return participant.includes(player);
		},
		async cost(event, trigger, player) {
			const num = game.countPlayer(current => current.group === "qun");
			const dialog = [
				get.prompt("twniju"),
				`<div class="text center">令一张拼点牌的点数+${num}或-${num}</div>`,
				[
					[
						["add", "增加"],
						["subtract", "减少"],
					],
					"tdnodes",
				],
			];
			const lose_list = trigger.lose_list.slice().sort((a, b) => lib.sort.seat(a[0], b[0]));
			dialog.push(
				`<div class="text center">${lose_list
					.map(list => {
						return get.translation(list[0]);
					})
					.join("　 / 　")}</div>`
			);
			const cards = lose_list.map(list => list[1]).flat();
			dialog.push(cards);
			const result = await player
				.chooseButton({
					createDialog: dialog,
					selectButton: 2,
					filterButton: button => {
						const type = typeof button.link;
						if (ui.selected.buttons.length && type === typeof ui.selected.buttons[0].link) {
							return false;
						}
						return true;
					},
				})
				.forResult();
			if (!result.bool) {
				event.result = result;
				return;
			}
			const links = result.links || [];
			if (links.length < 2) return;
			if (typeof links[0] !== "string") {
				links.reverse();
			}
			const [fn, card] = links;
			const selectedPlayer = lose_list.find(item => {
				if (Array.isArray(item[1])) {
					return item[1].includes(card);
				}
				return item[1] === card;
			})[0];
			event.result = {
				bool: true,
				targets: [selectedPlayer],
				cost_data: { fn, card, num },
			};
		},
		async content(event, trigger, player) {
			const selectedPlayer = event.targets[0];
			const { fn, card, num } = event.cost_data;
			selectedPlayer.addTempSkill("twniju_change");
			if (!selectedPlayer.storage.twniju_change) {
				selectedPlayer.storage.twniju_change = [];
			}
			selectedPlayer.storage.twniju_change.push([fn, num, card]);
			player
				.when("chooseToCompareAfter")
				.filter(evt => evt === trigger)
				.step(async (event, trigger, player) => {
					const num1 = trigger.result.num1;
					const num2 = trigger.result.num2;
					let bool = false;
					if (typeof num1 === "number" && typeof num2 === "number") {
						if (num1 === num2) {
							bool = true;
						}
					} else {
						const num1List = num1.toUniqued();
						const totalList = num1List.concat(num2).toUniqued();
						if (totalList.length < num1List.length + num2.length) {
							bool = true;
						}
					}
					if (bool) {
						await player.draw(num);
					}
				});
		},
		subSkill: {
			change: {
				trigger: { global: "compare" },
				filter(event, player) {
					const storage = player.getStorage("twniju_change");
					if (!storage.length) {
						return false;
					}
					if ((player !== event.player || event.iwhile) && player !== event.target) {
						return false;
					}
					return event.lose_list.some(list => {
						const cards = Array.isArray(list[1]) ? list[1] : [list[1]];
						return list[0] === player && storage.some(s => cards.includes(s[2]));
					});
				},
				charlotte: true,
				forced: true,
				silent: true,
				async content(event, trigger, player) {
					const [fn, num] = player.getStorage("twniju_change").find(s => {
						return trigger.lose_list.some(list => {
							const cards = Array.isArray(list[1]) ? list[1] : [list[1]];
							return list[0] === player && cards.includes(s[2]);
						});
					});
					const numId = player === trigger.player ? "num1" : "num2";
					if (fn === "add") {
						trigger[numId] += num;
					} else {
						trigger[numId] -= num;
					}
					if (trigger[numId] > 13) {
						trigger[numId] = 13;
					} else if (trigger[numId] < 1) {
						trigger[numId] = 1;
					}
					game.log(player, "的拼点牌点数", fn === "add" ? "+" : "-", num);
				},
			},
		},
	},
twpolu: {
		audio: "repolu",
		trigger: { global: ["dieAfter", "die"] },
		forceDie: true,
		zhuSkill: true,
		filter(event, player, name) {
			if (!player.hasZhuSkill("twpolu")) {
				return false;
			}
			if (event.player != player && player.isDead()) {
				return false;
			}
			if (name == "dieAfter" && event.source && event.source.group == "wu") {
				return true;
			}
			if (name == "die" && event.player.group == "wu") {
				return true;
			}
			return false;
		},
		async cost(event, trigger, player) {
			const num = player.getAllHistory("useSkill", evt => evt.skill == event.skill).length + 1;
			event.result = await player
				.chooseTarget({selectTarget: [1, Infinity], prompt: get.prompt(event.skill), prompt2: `令任意名角色摸${get.cnNumber(num)}张牌`})
				.set("forceDie", true)
				.set("ai", target => {
					const player = get.player();
					return get.attitude(player, target);
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const num = player.getAllHistory("useSkill", evt => evt.skill == event.name).length;
			await game.asyncDraw(event.targets.sortBySeat(), num);
			await game.delay();
		},
	},
junksijun: {
		audio: "sijun",
		inherit: "sijun",
		check(event, player) {
			return ui.cardPile.childNodes.length;
		},
		async content(event, trigger, player) {
			player.removeMark("yizhao", player.countMark("yizhao"));
			const pile = /** @type {Card[]} */ (Array.from(ui.cardPile.childNodes));
			const sums = new Map([[0, /** @type {Card[]} */ ([])]]);
			for (const card of pile) {
				const value = Number(get.number(card)) || 0;
				for (const [sum, chosen] of [...sums]) {
					if (sum + value <= 36 && !sums.has(sum + value)) sums.set(sum + value, [...chosen, card]);
				}
				if (sums.has(36)) break;
			}
			let cards = sums.get(36);
			if (!cards) {
				cards = [];
				let total = 0;
				for (const card of pile) { cards.push(card); total += Number(get.number(card)) || 0; if (total >= 36) break; }
			}
			if (cards.length) await player.gain({cards, animate: "gain2"});
		},
	},
junkyuheng: {
		audio: "yuheng",
		trigger: { player: "phaseBegin" },
		forced: true,
		keepSkill: true,
		filter(event, player) {
			return player.hasCard(function (card) {
				return lib.filter.cardDiscardable(card, player, "junkyuheng");
			}, "he");
		},
		async content(event, trigger, player) {
			let result;

			const suits = new Set();
			for (const card of player.iterableGetCards("he")) {
				const suit = (get.suit(card, player) || "none");
				suits.add(suit);
			}
			const num = suits.size;

			result = await player
				.chooseToDiscard({
					forced: true,
					position: "he",
					complexCard: true,
					selectCard: [1, num],
					filterCard(card, player) {
						if (!ui.selected.cards.length) {
							return true;
						}
						const suit = (get.suit(card, player) || "none");
						for (const selectedCard of ui.selected.cards) {
							if (get.suit(selectedCard, player) == suit) {
								return false;
							}
						}
						return true;
					},
					ai(card) {
						if (!player.hasValueTarget(card)) {
							return 5;
						}
						return 5 - get.value(card);
					},
				})
				.forResult();

			if (result.bool) {
				const skills = dependencySkills.junkyuheng.derivation.randomGets(result.cards?.length || 0);
				await player.addAdditionalSkills("junkyuheng", skills, true);
			}
		},
		group: "junkyuheng_remove",
		derivation: ["olbingyi", "shenxing", "xiashu", "old_anxu", "rezhiheng", "xinanguo", "lanjiang", "xinfu_guanwei", "dimeng", "xindiaodu", "xingxue", "jiexun", "olhongyuan", "xinfu_youdi", "bizheng"],
		subSkill: {
			remove: {
				audio: "yuheng",
				trigger: { player: "phaseEnd" },
				forced: true,
				filter(event, player) {
					return player.additionalSkills.junkyuheng && player.additionalSkills.junkyuheng.length > 0;
				},
				async content(event, trigger, player) {
					const skillslength = player.additionalSkills.junkyuheng.length;
					await player.removeAdditionalSkills("junkyuheng");
					await player.draw(skillslength);
				},
			},
		},
	},
junkdili: {
		audio: "dili",
		trigger: { player: "changeSkillsAfter" },
		forced: true,
		juexingji: true,
		skillAnimation: true,
		animationColor: "wood",
		filter(event, player) {
			if (!event.addSkill.length) {
				return false;
			}
			var skills = player.getSkills(null, false, false).filter(function (i) {
				var info = get.info(i);
				return info && !info.charlotte;
			});
			return skills.length > player.maxHp;
		},
		async content(event, trigger, player) {
			let result;

			player.awakenSkill(event.name);
			await player.loseMaxHp();

			const skills = player.getSkills(null, false, false).filter(skill => {
				if (skill === "junkdili") {
					return false;
				}
				const info = get.info(skill);
				return info && !info.charlotte;
			});

			result = await player
				.chooseButton({createDialog: ["请选择失去任意个技能", [skills, "skill"]]})
				.set("forced", true)
				.set("selectButton", [1, skills.length])
				.set("skills", skills)
				.set("ai", button => {
					const skill = button.link;
					const skillList = _status.event.skills.slice(0);
					skillList.removeArray(["xinanguo", "lanjiang", "rezhiheng", "junkyuheng"]);

					switch (ui.selected.buttons.length) {
						case 0: {
							if (skillList.includes(skill)) {
								return 2;
							}
							if (skill === "junkyuheng") {
								return 1;
							}
							return Math.random();
						}
						case 1: {
							if (skillList.length < 2) {
								return 0;
							}
							if (skillList.includes(skill)) {
								return 2;
							}
							if (skill === "junkyuheng") {
								return 1;
							}
							return 0;
						}
						case 2: {
							if (skillList.includes(skill)) {
								return 2;
							}
							if (skill === "junkyuheng") {
								return 1;
							}
							return 0;
						}
						default: {
							return 0;
						}
					}
				})
				.forResult();

			let removeCount = skills.length;
			if (result.bool) {
				const removedSkills = (result.links || []).slice(0);
				removeCount = removedSkills.length;
				await player.removeSkills(removedSkills);
			}

			const derivation = dependencySkills.junkdili.derivation;
			const list = derivation.slice(0, Math.min(removeCount, derivation.length));
			await player.addSkills(list);
		},
		ai: {
			combo: "junkyuheng",
		},
		derivation: ["junkshengzhi", "junkquandao", "junkchigang"],
	},
junkshengzhi: {
		audio: "dili_shengzhi",
		trigger: { player: ["logSkill", "useSkillAfter"] },
		forced: true,
		filter(event, player) {
			if (event.type != "player") {
				return false;
			}
			var skill = get.sourceSkillFor(event);
			if (get.is.locked(skill)) {
				return false;
			}
			var info = get.info(skill);
			return !info.charlotte;
		},
		async content(event, trigger, player) {
			player.addTempSkill("junkshengzhi_effect");
		},
		subSkill: {
			effect: {
				mod: {
					cardUsable: () => Infinity,
					targetInRange: () => true,
				},
				trigger: { player: "useCard1" },
				forced: true,
				charlotte: true,
				popup: false,
				firstDo: true,
				async content(event, trigger, player) {
					player.removeSkill(event.name);
					if (trigger.addCount !== false) {
						trigger.addCount = false;
						const stat = player.getStat().card;
						const name = trigger.card.name;
						if (typeof stat[name] == "number") {
							stat[name]--;
						}
					}
				},
				mark: true,
				intro: { content: "使用下一张牌无距离和次数限制" },
			},
		},
	},
junkquandao: {
		audio: "dili_quandao",
		trigger: { player: "useCard" },
		forced: true,
		filter(event, player) {
			return event.card.name == "sha" || get.type(event.card, null, false) == "trick";
		},
		async content(event, trigger, player) {
			const cards1 = player.getCards("h", card => get.name(card) === "sha"),
				cards2 = player.getCards("h", card => get.type(card) === "trick");
			if (cards1.length !== cards2.length) {
				const num = cards1.length - cards2.length,
					cards = num > 0 ? cards1 : cards2;
				let i = 0;
				cards.forEach(card => {
					if (i < Math.abs(num) && lib.filter.cardDiscardable(card, player, "junkquandao")) {
						i++;
					}
				});
				if (i > 0) {
					await player.chooseToDiscard({selectCard: i, forced: true, prompt: `权道：请弃置${get.cnNumber(i)}张${num > 0 ? "杀" : "普通锦囊牌"}`, filterCard: num > 0 ? card => get.name(card) === "sha" : card => get.type(card) === "trick"});
				}
			}
			await player.draw();
		},
	},
junkchigang: {
		audio: "dili_chigang",
		trigger: { player: "phaseChange" },
		forced: true,
		zhuanhuanji: true,
		mark: true,
		marktext: "☯",
		filter(event, player) {
			return event.phaseList[event.num].indexOf("phaseJudge") != -1;
		},
		async content(event, trigger, player) {
			player.changeZhuanhuanji(event.name);
			let phase = player.storage.junkchigang ? "phaseDraw" : "phaseUse";
			trigger.phaseList[trigger.num] = `${phase}|${event.name}`;
			game.delayx();
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (get.type(card) == "delay") {
						return "zeroplayertarget";
					}
				},
			},
		},
		intro: {
			content(storage) {
				return "转换技，锁定技。判定阶段开始前，你取消此阶段。然后你获得一个额外的" + (storage ? "出牌阶段" : "摸牌阶段") + "。";
			},
		},
	},
jsrgtuwei: {
		audio: 2,
		trigger: {
			player: "phaseUseBegin",
		},
		filter(event, player) {
			return (
				player.group == "wei" &&
				game.hasPlayer(current => {
					return player.inRange(current) && current.countGainableCards(player, "he") > 0;
				})
			);
		},
		groupSkill: "wei",
		direct: true,
		async content(event, trigger, player) {
			let result;
			result = await player
				.chooseTarget(
					{prompt: get.prompt("jsrgtuwei"), prompt2: "获得攻击范围内任意名角色的各一张牌。然后回合结束时这些角色中未受过伤害的角色依次获得你的一张牌。",
					filterTarget: (card, player, target) => {
						return player.inRange(target) && target.countGainableCards(player, "he") > 0;
					},
					selectTarget: [1, Infinity]}
				)
				.set("ai", target => {
					let player = _status.event.player;
					return get.effect(target, { name: "shunshou_copy2" }, player, player);
				})
				.forResult();
			if (result.bool) {
				let targets = (result.targets || []).slice();
				targets.sortBySeat();
				player.logSkill("jsrgtuwei", targets);
				player.gainMultiple(result.targets || [], "he");
				player.addTempSkill("jsrgtuwei_backfire");
				player.markAuto("jsrgtuwei_backfire", targets);
			}
		},
		subSkill: {
			backfire: {
				audio: "jsrgtuwei",
				trigger: {
					player: "phaseEnd",
				},
				charlotte: true,
				onremove: true,
				forced: true,
				filter(event, player) {
					return player.getStorage("jsrgtuwei_backfire").some(target => {
						return !target.getHistory("damage").length && target.isIn();
					});
				},
				async content(event, trigger, player) {
					const targets = player.getStorage("jsrgtuwei_backfire").filter(target => !target.getHistory("damage").length && target.isIn());
					targets.sortBySeat();

					for (const target of targets) {
						if (target.isIn() && player.countGainableCards(target, "he")) {
							target.line(player);
							await target.gainPlayerCard(player, true, "he");
						}
						if (!player.countCards("he")) {
							break;
						}
					}
				},
				ai: {
					effect: {
						player(card, player, target) {
							if (player != target && get.tag(card, "damage") && target && player.getStorage("jsrgtuwei_backfire").includes(target) && !target.getHistory("damage").length) {
								return [1, 1, 1, 0];
							}
						},
					},
				},
			},
		},
	},
twzhuiting: {
		zhuSkill: true,
		audio: 2,
		global: "twzhuiting_global",
		subSkill: {
			global: {
				hiddenWuxie(player, info) {
					if (player.group != "wei" && player.group != "qun") {
						return false;
					}
					const target = info.target,
						card = info.card;
					if (!target || target == player || !target.hasZhuSkill("twzhuiting")) {
						return false;
					}
					if (_status.connectMode && player.countCards("hs") > 0) {
						return true;
					}
					const color = get.color(card, false);
					if (color == "none") {
						return false;
					}
					return player.hasCard(card => get.color(card) == color, "hes");
				},
				audio: "twzhuiting",
				forceaudio: true,
				enable: "chooseToUse",
				filter(event, player) {
					if (event.type != "wuxie" || (player.group != "wei" && player.group != "qun")) {
						return false;
					}
					const info = event.info_map,
						target = info.target,
						card = info.card;
					if (!target || target == player || !target.hasZhuSkill("twzhuiting")) {
						return false;
					}
					const color = get.color(card, false);
					if (color == "none") {
						return false;
					}
					return player.hasCard(card => get.color(card) == color, "hes");
				},
				filterCard(card) {
					const info = _status.event.info_map;
					return info && get.color(card) == get.color(info.card, false);
				},
				viewAs: { name: "wuxie" },
				position: "hes",
				prompt() {
					const info = _status.event.info_map;
					return "将一张" + get.translation(get.color(info.card)) + "牌当作【无懈可击】对" + get.translation(info.target) + "使用";
				},
				check(card) {
					return 8 - get.value(card);
				},
			},
		},
	},
twshijun: {
		global: "twshijun_global",
		audio: 2,
		zhuSkill: true,
		ai: { combo: "yishe" },
		subSkill: {
			global: {
				audio: "twshijun",
				usable: 1,
				enable: "phaseUse",
				forceaudio: true,
				filter(event, player) {
					return player.group === "qun" && game.hasPlayer(current => current !== player && current.hasZhuSkill("twshijun", player) && !current.getExpansions("yishe").length);
				},
				filterTarget(card, player, target) {
					return target !== player && target.hasZhuSkill("twshijun", player) && !target.getExpansions("yishe").length;
				},
				prompt: "摸一张牌然后将一张牌作为“米”置于主公的武将牌上",
				async content(event, trigger, player) {
					const { target } = event;
					await player.draw();
					if (!player.hasCards("he")) {
						return;
					}
					const result = await player
						.chooseCard({
							prompt: `将一张牌置于${get.translation(target)}的武将牌上`,
							position: "he",
							forced: true,
						})
						.forResult();
					if (!result.bool) {
						return;
					}
					await target.addToExpansion({
						cards: result.cards,
						source: player,
						animate: "give",
						gaintag: ["yishe"],
					});
				},
				ai: {
					order: 7,
					result: {
						target: 1,
					},
				},
			},
		},
	},
twjichou: {
		audio: 3,
		enable: "chooseToUse",
		group: ["twjichou_ban", "twjichou_give"],
		filter(event, player) {
			if (player.hasSkill("twjichou_used") && player.hasSkill("twjichou_given")) {
				return false;
			}
			if (!player.hasSkill("twjichou_used")) {
				var record = player.getStorage("twjichou");
				for (var i of lib.inpile) {
					var type = get.type(i);
					if (type == "trick" && !record.includes(i) && event.filterCard({ name: i, isCard: true }, player, event)) {
						return true;
					}
				}
			}
			return false;
		},
		chooseButton: {
			dialog(event, player) {
				var dialog = /** @type {import("./element/dialog.js").Dialog & {_chosenOpt: import("./element/button.js").Button[]}} */ (ui.create.dialog("急筹"));
				if (
					!player.hasSkill("twjichou_used") &&
					!player.hasSkill("twjichou_given") &&
					event.type == "phase" &&
					player.countCards("h", card => {
						return player.getStorage("twjichou").includes(get.name(card));
					})
				) {
					dialog._chosenOpt = [];
					var table = document.createElement("div");
					table.classList.add("add-setting");
					table.style.margin = "0";
					table.style.width = "100%";
					table.style.position = "relative";
					var list = ["视为使用牌", "交出锦囊牌"];
					for (var i of list) {
						var td = /** @type {import("./element/button.js").Button} */ (ui.create.div(".shadowed.reduce_radius.pointerdiv.tdnode"));
						td.innerHTML = "<span>" + i + "</span>";
						td.link = i;
						if (i == list[0]) {
							td.classList.add("bluebg");
							dialog._chosenOpt.add(td);
						}
						td.addEventListener(lib.config.touchscreen ? "touchend" : "click", function () {
							if (_status.dragged) {
								return;
							}
							if (_status.clicked) {
								return;
							}
							if (Reflect.get(_status, "justdragged")) {
								return;
							}
							Reflect.set(_status, "tempNoButton", true);
							_status.clicked = true;
							setTimeout(function () {
								Reflect.set(_status, "tempNoButton", false);
							}, 500);
							var link = Reflect.get(this, "link");
							if (link == "交出锦囊牌") {
								game.uncheck();
							}
							var current = this.parentElement?.querySelector(".bluebg");
							if (current) {
								current.classList.remove("bluebg");
								dialog._chosenOpt.remove(/** @type {import("./element/button.js").Button} */ (current));
							}
							dialog._chosenOpt.add(td);
							this.classList.add("bluebg");
							game.check();
						});
						table.appendChild(td);
						dialog.buttons.add(td);
					}
					dialog.content.appendChild(table);
				}
				var cardList = [],
					record = player.getStorage("twjichou");
				for (var name of lib.inpile) {
					if (get.type(name) == "trick" && !record.includes(name) && event.filterCard({ name: name, isCard: true }, player, event)) {
						cardList.push(["锦囊", "", name]);
					}
				}
				dialog.buttons.addArray(/** @type {import("./element/button.js").Button[]} */ (ui.create.buttons(cardList, "vcard", dialog.content)));
				return dialog;
			},
			filter(button) {
				if (_status.event.dialog) {
					var opts = Reflect.get(_status.event.dialog, "_chosenOpt");
					if (opts && opts.length && opts[0].link == "交出锦囊牌" && typeof button.link != typeof opts[0].link) {
						return false;
					}
					return true;
				}
				return false;
			},
			/** @returns {[number, number]} */
			select() {
				if (_status.event.dialog) {
					var opts = Reflect.get(_status.event.dialog, "_chosenOpt");
					return opts && opts.length && opts[0].link == "交出锦囊牌" ? [0, 0] : [1, 1];
				}
				return [0, 0];
			},
			check(button) {
				if (_status.event.getParent()?.type != "phase") {
					return 1;
				}
				var player = _status.event.player;
				if (["wugu", "zhulu_card", "yiyi", "lulitongxin", "lianjunshengyan", "diaohulishan"].includes(button.link[2])) {
					return 0.1;
				}
				return player.getUseValue({ name: button.link[2] });
			},
			backup(links, player) {
				var isUse = links.length == 1;
				var backup = get.copy(lib.skill["twjichou_" + (isUse ? "use" : "give")]);
				if (isUse) {
					backup.viewAs = { name: links[0][2], isCard: true };
				}
				return backup;
			},
			prompt(links, player) {
				var isUse = links.length == 1;
				return "急筹：" + (isUse ? "视为使用" + get.translation(links[0][2]) + "" : "选择要交出的牌和要交给的目标");
			},
		},
		hiddenCard(player, name) {
			if (player.hasSkill("twjichou_used")) {
				return false;
			}
			var type = get.type(name);
			return type == "trick" && !player.getStorage("twjichou").includes(name);
		},
		marktext: "筹",
		intro: {
			markcount(storage, player) {
				if (storage && storage.length) {
					return storage.length;
				}
				return 0;
			},
			content: "已记录牌名：$",
		},
		ai: {
			order: 1,
			result: {
				player(player) {
					if (_status.event.dying) {
						return get.attitude(player, _status.event.dying);
					}
					return 1;
				},
			},
		},
		subSkill: {
			backup: {},
			used: { charlotte: true },
			given: { charlotte: true },
			ban: {
				trigger: { global: "useCard1" },
				filter(event, player) {
					return player.getStorage("twjichou").includes(event.card.name);
				},
				forced: true,
				locked: false,
				silent: true,
				async content(event, trigger, player) {
					trigger.directHit.add(player);
				},
				mod: {
					cardEnabled(card, player) {
						if (player.getStorage("twjichou").includes(card.name) && (get.position(card) == "h" || ("cards" in card && Array.isArray(card.cards) && card.cards.some(i => get.position(i) == "h")))) {
							return false;
						}
					},
					cardSavable(card, player) {
						if (player.getStorage("twjichou").includes(card.name) && (get.position(card) == "h" || ("cards" in card && Array.isArray(card.cards) && card.cards.some(i => get.position(i) == "h")))) {
							return false;
						}
					},
					aiValue(player, card) {
						if (get.type(card) != "trick" || Reflect.get(_status, "twjichou_give_aiCheck")) {
							return;
						}
						if (!player.getFriends().length && player.getStorage("twjichou").includes(get.name(card))) {
							return 0;
						}
					},
					aiUseful(player, card) {
						return dependencySkills.twjichou.subSkill.ban.mod.aiValue(player, card);
					},
				},
			},
			use: {
				filterCard: () => false,
				selectCard: -1,
				audio: "twjichou",
				popname: true,
				onuse(links, player) {
					player.markAuto("twjichou", [links.card.name]);
					player.syncStorage("twjichou");
					player.addTempSkill("twjichou_used");
				},
			},
			give: {
				audio: "twjichou",
				enable: "phaseUse",
				filter(event, player) {
					return player.hasSkill("twjichou_used") && !player.hasSkill("twjichou_given") && player.countCards("h", i => player.getStorage("twjichou").includes(get.name(i))) > 0;
				},
				filterTarget(card, player, target) {
					return target != player;
				},
				filterCard(card, player) {
					return player.getStorage("twjichou").includes(get.name(card));
				},
				check(card) {
					Reflect.set(_status, "twjichou_give_aiCheck", true);
					var val = get.value(card);
					Reflect.deleteProperty(_status, "twjichou_give_aiCheck");
					return val;
				},
				prompt: () => "选择要交出的牌和要交给的目标",
				selectCard: [1, Infinity],
				discard: false,
				lose: false,
				delay: false,
				allowChooseAll: true,
				async content(event, trigger, player) {
					const { target, cards } = event;
					player.give(cards, target);
					player.addTempSkill("twjichou_given", "phaseUseAfter");
				},
				ai: {
					order: 0.9,
					result: {
						target(player, target) {
							if (target.hasSkillTag("nogain")) {
								return 0;
							}
							if (target.hasJudge("lebu", true)) {
								return 0;
							}
							return target.getCards("h", card => player.getStorage("twjichou").includes(get.name(card))).filter(card => get.name(card) !== undefined).reduce((p, c) => p + (target.getUseValue(c) || 1), 0);
						},
					},
				},
			},
		},
	},
twhuantu: {
		audio: "huantu",
		trigger: { global: "phaseDrawBefore" },
		round: 1,
		filter(event, player) {
			return player.countCards("he") > 0 && event.player != player;
		},
		checkx(event, player) {
			const target = event.player;
			return get.attitude(player, target) > 0 && (target.hasSkill("pingkou") || target.skipList.includes("phaseUse") || (target.isDamaged() && target.hp <= 2) || target.needsToDiscard());
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseCard({prompt: get.prompt(event.skill, trigger.player), prompt2: "交给其一张牌并令其暂时跳过摸牌阶段", position: "he"})
				.set("ai", function (card) {
					if (!_status.event.checkx) {
						return 0;
					}
					return 1 + Math.random();
				})
				.set("checkx", lib.skill.huantu.checkx(trigger, player))
				.forResult();
		},
		logTarget: "player",
		async content(event, trigger, player) {
			const target = event.targets[0],
				{ cards } = event;
			await player.give(cards, target);
			trigger.cancel();
			player.addTempSkill(event.name + "_effect");
		},
		subSkill: {
			effect: {
				audio: "huantu",
				trigger: { global: "phaseJieshuBegin" },
				forced: true,
				charlotte: true,
				logTarget: "player",
				filter(event, player) {
					return event.player.isIn();
				},
				async content(event, trigger, player) {
					const target = trigger.player,
						str = get.translation(target),
						list = ["令" + str + "回复1点体力并摸两张牌", "摸三张牌，然后交给" + str + "两张手牌"];
					const result = await player
						.chooseControl()
						.set("choiceList", list)
						.set("choice", target.isDamaged() ? 0 : 1)
						.forResult();
					const funcs = [
						async function () {
							await target.recover();
							await target.draw(2);
						},
						async function () {
							await player.draw(3);
							if (player.countCards("h") && target.isIn()) {
								await player.chooseToGive({target, position: "h", selectCard: 2, forced: true});
							}
						},
					];
					await funcs[result.index ?? 0]?.();
					if (!target.hasHistory("sourceDamage", evt => evt.num > 0) && player.inRange(target)) {
						const index = 1 - (result.index ?? 0);
						const result2 = await player
							.chooseBool({prompt: "缓图：是否执行另一项？", prompt2: list[index]})
							.set("choice", get.attitude(player, target) > 0)
							.forResult();
						if (!result2.bool) {
							return;
						}
						await funcs[index]?.();
					}
				},
			},
		},
	},
twbihuo: {
		audio: "bihuo",
		trigger: { global: "dyingAfter" },
		logTarget: "player",
		limited: true,
		skillAnimation: true,
		animationColor: "gray",
		filter(event, player) {
			return event.player.isIn();
		},
		check(event, player) {
			return get.attitude(player, event.player) > 0;
		},
		async content(event, trigger, player) {
			const target = trigger.player,
				skill = event.name + "_effect",
				num = Math.max(3, game.countPlayer());
			player.awakenSkill(event.name);
			await target.draw(num);
			target.addTempSkill(skill, "roundStart");
			target.addMark(skill, num, false);
		},
		subSkill: {
			effect: {
				onremove: true,
				charlotte: true,
				mod: {
					globalTo(from, to, distance) {
						return distance + to.countMark("twbihuo_effect");
					},
				},
				intro: { content: "其他角色至你的距离+#" },
			},
		},
	},
twmingce: {
		audio: "sbmingce",
		enable: "phaseUse",
		position: "he",
		filter(event, player) {
			return player.countCards("he") > 0 && player.getStorage("twmingce_used").length < 2;
		},
		filterCard: true,
		check(card) {
			const player = get.player();
			if (player.getStorage("twmingce_used").includes(1)) {
				return 6 - get.value(card);
			}
			return 8 - get.value(card);
		},
		filterTarget: lib.filter.notMe,
		selectTarget: 1,
		discard: false,
		lose: false,
		delay: false,
		onremove: true,
		group: "twmingce_hit",
		async content(event, trigger, player) {
			const { cards } = event,
				{ target } = event,
				name = "twmingce_used",
				storage = player.getStorage(name);
			const extra = storage.length < 1 ? 1 : 0;
			await player.give(cards, target);
			let choices = ["选项一", "选项二"],
				choiceList = [`失去1点体力，令${get.translation(player)}摸${get.cnNumber(2 + extra)}张牌并获得1枚“策”`, `摸${get.cnNumber(1 + extra)}张牌`];
			storage.forEach(num => {
				choices.remove(`选项${get.cnNumber(num + 1, true)}`);
				choiceList[num] = '<span style="opacity:0.5">' + choiceList[num] + "</span>";
			});
			let result;
			if (choices.length == 1) {
				result = { index: storage[0] == 0 ? 1 : 0 };
			} else {
				result = await target
					.chooseControl({
						controls: choices,
						choiceList,
						prompt: get.translation(player) + "对你发动了【明策】，请选择一项",
						choice: 1,
					})
					.forResult();
			}
			if (typeof result?.index !== "number") {
				return;
			}
			player.addTempSkill(name, ["phaseChange", "phaseUseAfter"]);
			player.markAuto(name, result.index);
			if (result.index == 0) {
				await target.loseHp();
				await player.draw({ num: 2 + extra });
				player.addMark(event.name, 1);
			} else {
				await target.draw({ num: 1 + extra });
			}
		},
		marktext: "策",
		intro: {
			name: "策(明策)",
			name2: "策",
			content: "mark",
		},
		ai: {
			result: {
				target(player, target) {
					if (!player.getStorage("twmingce_used").includes(1)) {
						return 1;
					}
					return -1;
				},
			},
			order: 8.5,
			expose: 0.2,
		},
		subSkill: {
			used: {
				charlotte: true,
				onremove: true,
			},
			hit: {
				audio: "sbmingce",
				trigger: { player: "phaseUseBegin" },
				filter(event, player) {
					return player.hasMark("twmingce");
				},
				async cost(event, trigger, player) {
					const num = player.countMark("twmingce");
					event.result = await player
						.chooseTarget({
							prompt: get.prompt(event.skill),
							prompt2: "移去所有“策”，对一名其他角色造成" + num + "点伤害",
							filterTarget: lib.filter.notMe,
							ai(target) {
								const player = _status.event.player;
								const eff = get.damageEffect(target, player, player);
								let num = player.countMark("twmingce");
								if (target.hasSkillTag("filterDamage", null, { player: player })) {
									num = 1;
								}
								return eff * num;
							},
						})
						.forResult();
				},
				async content(event, trigger, player) {
					const target = event.targets[0],
						num = player.countMark("twmingce");
					player.removeMark("twmingce", num);
					await target.damage({ num });
				},
			},
		},
	},
twjuyan: {
		audio: 2,
		trigger: { source: "damageSource" },
		filter(event, player) {
			return event.hasNature("fire");
		},
		forced: true,
		async content(event, trigger, player) {
			await player.draw();
			await trigger.player.loseMaxHp();
		},
	},
twlihuo: {
		trigger: { player: "useCard1" },
		filter(event, player) {
			return event.card.name === "sha" && !game.hasNature(event.card);
		},
		audio: "lihuo",
		prompt2(event) {
			return `将${get.translation(event.card)}改为火属性`;
		},
		audioname: ["re_chengpu"],
		check(event, player) {
			return game.hasPlayer(current => {
				return !event.targets.includes(current) && player.canUse(event.card, current) && get.effect(current, { name: "sha", nature: "fire", cards: event.cards.slice(0) }, player, player) > 0;
			});
		},
		async content(event, trigger, player) {
			game.setNature(trigger.card, "fire");
			Reflect.set(trigger.card, "twlihuo_buffed", true);
		},
		group: ["twlihuo2", "twlihuo3"],
		ai: {
			fireAttack: true,
		},
	},
twlihuo2: {
		trigger: { player: "useCard2" },
		sourceSkill: "twlihuo",
		filter(event, player) {
			if (event.card.name !== "sha" || !game.hasNature(event.card, "fire")) {
				return false;
			}
			return game.hasPlayer(current => {
				return !event.targets.includes(current) && player.canUse(event.card, current);
			});
		},
		async cost(event, trigger, player) {
			const result = await player
				.chooseTarget({
					prompt: get.prompt("twlihuo"),
					prompt2: `为${get.translation(trigger.card)}增加一个目标`,
					filterTarget(card, player, target) {
						return !trigger.targets.includes(target) && player.canUse(trigger.card, target);
					},
					ai: target => get.effect(target, trigger.card, player, player),
				})
				.forResult();
			if (!result.bool) {
				event.result = result;
				return;
			}
			if (!event.isMine() && !_status.connectMode) {
				await game.delayx();
			}
			event.result = result;
		},
		async content(event, trigger, player) {
			trigger.targets.push(event.targets[0]);
		},
	},
twlihuo3: {
		trigger: { player: "useCardAfter" },
		sourceSkill: "twlihuo",
		filter(event, player) {
			return (
				Reflect.get(event.card, "twlihuo_buffed") &&
				player.getHistory("sourceDamage", evt => {
					return evt.card === event.card && evt._dyinged;
				}).length > 0
			);
		},
		forced: true,
		audio: "lihuo",
		audioname: ["re_chengpu"],
		async content(event, trigger, player) {
			await player.loseHp();
		},
	},
twjianming: {
		audio: 2,
		trigger: {
			player: ["useCard", "respond"],
			global: "loseAsyncAfter",
		},
		getIndex(event, player) {
			if (event.name == "loseAsync") {
				if (!event.getParent()?.name?.startsWith("chooseToCompare")) {
					return [];
				}
				if (!event.getl?.(player)?.cards2?.length) {
					return [];
				}
				return event.getl(player).cards2;
			} else {
				if (event.card.name != "sha") {
					return [];
				}
				return [event.card];
			}
		},
		filter(event, player, name, card) {
			const suit = get.suit(card);
			if (!lib.suit.includes(suit || "none")) {
				return false;
			}
			return !player.getStorage("twjianming_used").includes(suit);
		},
		forced: true,
		async content(event, trigger, player) {
			const skill = "twjianming_used";
			player.addTempSkill(skill);
			player.markAuto(skill, get.suit(event.indexedData));
			player.addTip(
				skill,
				`剑鸣${player
					.getStorage(skill)
					.sort((a, b) => lib.suit.indexOf(b) - lib.suit.indexOf(a))
					.map(suit => get.translation(suit))
					.join("")}`
			);
			await player.draw();
		},
		subSkill: {
			used: {
				charlotte: true,
				onremove(player, skill) {
					player.removeTip(skill);
					player.setStorage(skill, []);
				},
			},
		},
	},
boss_juejing: {
		audio: "juejing",
		audioname2: {
			dc_zhaoyun: "dcjuejing",
		},
		trigger: { player: "phaseDrawBefore" },
		forced: true,
		async content(event, trigger, player) {
			trigger.cancel();
		},
		ai: {
			noh: true,
			nogain: true,
		},
		group: "boss_juejing2",
	},
dcjuejing: { audio: 2 },
boss_juejing2: {
		audio: "juejing",
		sourceSkill: "boss_juejing",
		audioname2: {
			dc_zhaoyun: "dcjuejing",
		},
		mod: {
			aiOrder(player, card, num) {
				if (num > 0) {
					return num;
				}
				if (card.name === "zhuge" && player.getCardUsable("sha", true) < 6) {
					return 1;
				}
			},
			aiValue(player, card, num) {
				if (card.name === "zhuge") {
					return 60 / (1 + player.getCardUsable("sha", true));
				}
			},
			aiUseful(player, card, num) {
				if (card.name === "zhuge") {
					return 60 / (1 + player.getCardUsable("sha", true));
				}
			},
		},
		trigger: {
			player: "loseAfter",
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		forced: true,
		filter(event, player) {
			if (event.name === "gain" && event.player === player) {
				return player.countCards("h") > 4;
			}
			let evt = event.getl(player);
			if (!evt || !evt.hs || evt.hs.length === 0 || player.countCards("h") >= 4) {
				return false;
			}
			evt = event;
			for (let i = 0; i < 4; i++) {
				evt = evt.getParent("boss_juejing2");
				if (evt.name !== "boss_juejing2") {
					return true;
				}
			}
			return false;
		},
		async content(event, trigger, player) {
			const num = 4 - player.countCards("h");
			if (num > 0) {
				await player.draw({ num, nodelay: true });
			} else {
				await player.chooseToDiscard({position: "h", forced: true, selectCard: -num, allowChooseAll: true});
			}
		},
		ai: {
			freeSha: true,
			freeShan: true,
			skillTagFilter() {
				return true;
			},
		},
	}
};
const translations = {twlihuo: "疠火",
twlihuo2: "疠火",
twlihuo3: "疠火",
twlihuo_info: "①当你声明使用普【杀】后，你可以将此【杀】改为火【杀】。此牌使用结算结束后，若有角色因此【杀】造成的伤害进入过濒死状态，则你失去1点体力。②当你使用火【杀】选择目标后，你可为此牌增加一个目标。",
twjichou: "急筹",
twjichou_info: "①每回合限一次。你可以视为使用一张未被〖急筹①〗记录过的普通锦囊牌并记录此牌。②你无法响应或{使用对应实体牌包含你的手牌的}〖急筹①〗记录过的锦囊牌。③出牌阶段限一次。你可将手牌中任意张〖急筹①〗记录过的锦囊牌交给一名其他角色。",
twjianming: "剑鸣",
twjianming_info: "锁定技。每回合每种花色限一次，当你使用或打出【杀】时，或你因拼点而失去牌时，你摸一张牌。",
twshijun: "师君",
twshijun_info: "主公技，其他群势力角色出牌阶段限一次，若你没有“米”，其可以摸一张牌，然后将一张牌置于你的武将牌上，称为“米”。",
twjuxiang: "踞襄",
twjuxiang_info: "主公技，其他群势力角色出牌阶段限一次，其可以选择其装备区的一张牌移动到你的装备区中，若你对应的装备栏已被废除，则改为交给你此装备牌，然后恢复你的对应装备栏。",
twpolu: "破虏",
twpolu_info: "主公技，当吴势力角色杀死一名角色或死亡后，你可以令任意名角色各摸X张牌（X为你此前发动过此技能的次数+1）。",
twqiushou: "酋首",
twqiushou_info: "主公技，锁定技，当一张【南蛮入侵】结算结束后，若此牌造成的伤害大于3点或有角色因此死亡，所有蜀势力和群势力角色各摸一张牌。",
twzhuiting: "坠廷",
twzhuiting_info: "主公技，当一张锦囊牌即将对你生效时，其他魏势力角色和群势力角色可将一张与此牌颜色相同的牌当作【无懈可击】使用。",
twniju: "逆拒",
twniju_info: "主公技。当你的拼点牌亮出后，你可以令本次拼点事件中的一张拼点牌的点数+X或-X。然后当本次拼点事件结束后，若有两张拼点牌的点数相等，你摸X张牌（X为场上群势力角色数）。",
twchongwang: "崇望",
twchongwang_info: "主公技，其他群势力角色的出牌阶段开始时，其可以交给你一张牌，然后你与其使用【杀】或伤害性锦囊牌指定目标时不能指定对方为目标直至你的下回合结束（每名角色限发动一次）。",
twjuyan: "炬湮",
twjuyan_info: "锁定技。当你对一名角色造成火焰伤害后，你摸一张牌，然后令其减1点体力上限。",
twmingce: "明策",
twmingce_info: "出牌阶段各限一次，你可以将一张牌交给一名其他角色，然后其选择一项：1. 其流失1点体力，你摸三张牌并获得一个「策」标记；2.其摸两张牌。（本阶段第二次执行选项时摸牌数-1）出牌阶段开始时，若你拥有「策」标记，你可以选择一名其他角色，对其造成X点伤害并移除所有「策」标记（X为你拥有的「策」标记数量）。",
twhuantu: "缓图",
twhuantu_info: "每轮限一次，一名其他角色摸牌阶段开始前，你可以交给其一张牌，令其跳过摸牌阶段，若如此做，其结束阶段你须选择一项：1. 令其回复1点体力并摸两张牌；2. 你摸三张牌并交给其两张手牌。若其本回合未造成伤害且其在你攻击范围内，你可以再对其执行另一项。",
twbihuo: "避祸",
twbihuo_info: "限定技，一名角色脱离濒死状态时，你可以令其摸X张牌，然后其他角色本轮计算与其的距离时+X（X为场上角色数，且至少为3）。",
junkyuheng: "驭衡",
junkyuheng_info: '锁定技。①回合开始时，你须弃置任意张花色不同的牌，从<span style="font-family: yuanli">东吴命运线·改</span>中随机获得等量的技能。②回合结束时，你失去所有因〖驭衡①〗获得的技能，然后摸等量的牌。',
junkdili: "帝力",
junkdili_info: `觉醒技。当你获得技能后，若你拥有的技能数大于你的体力上限，则你减1点体力上限，选择失去任意个其他技能，然后获得以下技能中的前等量个：${get.poptip("junkshengzhi")}${get.poptip("junkquandao")}${get.poptip("junkchigang")}。`,
junkshengzhi: "圣质",
junkshengzhi_info: "锁定技。当你发动非锁定技后，你令你本回合使用的下一张牌无距离和次数限制。",
junkquandao: "权道",
junkquandao_info: "锁定技。当你使用【杀】或普通锦囊牌时，{若你手牌中的【杀】或普通锦囊牌的数量之差X不为0，则你弃置X张数量较多的一种牌}，然后你摸一张牌。",
junkchigang: "持纲",
junkchigang_info: "转换技，锁定技。判定阶段开始前，你取消此阶段。然后你获得一个额外的：阳，摸牌阶段；阴，出牌阶段。",
junklangmie: "狼灭",
junklangmie_info: "其他角色的结束阶段开始时，你可以选择一项：⒈若其本回合内使用过某种类型的牌超过一张，则你弃置一张牌并摸两张牌。⒉若其本回合累计造成过的伤害大于1，则你弃置一张牌，然后对其造成1点伤害。",
junksijun: "肆军",
junksijun_info: "准备阶段，若“黄”数大于牌堆的牌数，你可以移去所有“黄”，然后从牌堆中随机获得任意张点数之和为36的牌（若牌堆没有点数和为36的组合则获得牌堆顶点数和刚好超过36的牌组）。",
jsrgtuwei: "突围",
jsrgtuwei_info: "魏势力技。出牌阶段开始时，你可以获得攻击范围内任意名角色各一张牌。然后此回合结束时，这些角色中未于本回合受到过伤害的角色依次获得你的一张牌。",
boss_juejing: "绝境",
boss_juejing2: "绝境",
boss_juejing_info: "锁定技，摸牌阶段开始前，你跳过此阶段。当你得到牌/失去手牌后，若你的手牌数大于四/小于四，则你将手牌摸至四张/弃置至四张。"};
export function installSkillDependencies() {
 for (const [name, skill] of Object.entries(dependencySkills)) if (!lib.skill[name]) lib.skill[name] = /** @type {Skill} */ (skill);
 for (const [name, text] of Object.entries(translations)) if (!lib.translate[name]) lib.translate[name] = String(text);
}
