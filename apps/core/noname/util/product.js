/** 精简版的唯一内容清单，同时供启动、导入和构建使用。 */
export const characterPacks = Object.freeze(["standard", "shenhua", "extra", "yijiang", "refresh", "sp", "sp2", "newjiang", "onlyOL", "yingbian", "clan", "huicui", "xianding", "mobile", "shiji", "sb", "bingshi", "collab", "old"]);
export const modes = Object.freeze(["identity", "guozhan", "versus", "connect", "doudizhu", "single"]);
export const cardPacks = Object.freeze(["standard", "extra", "guozhan", "yingbian", "jiubian", "yongjian", "sp", "zhulu", "huodong"]);

// 使用现有长布局，避免破坏引擎对布局名称的判断；主题单独提供固定十周年配色。
const appearanceDefaults = {
	theme: "woodden",
	layout: "mobile",
	splash_style: "style1",
	player_height: "default",
	player_height_nova: "short",
	ui_zoom: "100%",
	image_background: "default",
	image_background_random: false,
	image_background_blur: false,
	phonelayout: false,
	change_skin: true,
	change_skin_auto: "off",
	card_style: "default",
	cardback_style: "default",
	hp_style: "default",
	player_style: "default",
	zhishixian: "default",
	border_style: "default",
	autoborder_count: "kill",
	autoborder_start: "bronze",
	player_border: "normal",
	menu_style: "default",
	control_style: "default",
	custom_button: false,
	custom_button_system_top: "0x",
	custom_button_system_bottom: "0x",
	custom_button_control_top: "0x",
	custom_button_control_bottom: "0x",
	radius_size: "default",
	glow_phase: "green",
	fold_card: true,
	fold_mode: true,
	seperate_control: true,
	blur_ui: false,
	glass_ui: false,
	damage_shake: true,
	button_press: true,
	jiu_effect: true,
	animation: false,
	spread_card: true,
	card_animation_info: false,
	animation_choose_to_move: true,
	skill_animation_type: "default",
	die_move: "off",
	target_shake: "off",
	turned_style: true,
	link_style2: "chain",
	cardshape: "default",
	cardtempname: "image",
	buttoncharacter_style: "default",
	buttoncharacter_prefix: "default",
	cursor_style: "auto",
	name_font: "xingkai",
	identity_font: "huangcao",
	cardtext_font: "default",
	global_font: "default",
	suits_font: true,
};
export const fixedAppearance = Object.freeze({
	...appearanceDefaults,
	theme: "decade",
	layout: "long2",
	phonelayout: false,
	autostyle: false,
	card_style: "default",
	cardback_style: "liusha",
	hp_style: "glass",
	player_style: "default",
	border_style: "default",
	player_border: "slim",
	menu_style: "music",
	control_style: "default",
	radius_size: "reduce",
	cardshape: "oblong",
	image_background: "ol_bg",
	image_background_random: false,
	image_background_blur: false,
	change_skin: false,
	change_skin_auto: "off",
	skin: {},
	name_font: "xinwei",
	identity_font: "huangcao",
	cardtext_font: "xinwei",
	global_font: "default",
	suits_font: false,
	custom_button: false,
	player_height: "default",
	player_height_nova: "default",
	turned_style: false,
	buttoncharacter_style: "default",
	cursor_style: "default",
	zhishixian: "default",
	// 显示结构属于固定主题；旧存档也不能恢复隐藏牌面、按钮或自定义位置。
	mount_combine: false,
	show_history: "right",
	pop_logv: false,
	show_log: "off",
	clear_log: true,
	log_highlight: true,
	show_time: false,
	show_time2: false,
	show_time3: false,
	watchface: "simple",
	show_card_prompt: true,
	hide_card_prompt_basic: false,
	hide_card_prompt_equip: false,
	show_phase_prompt: true,
	show_phaseuse_prompt: true,
	auto_popped_config: false,
	auto_popped_history: false,
	remember_round_button: false,
	remember_dialog: false,
	dialog_transform: [0, 0],
	roundmenu_transform: [0, 0],
	transparent_dialog: false,
	show_rarity: false,
	show_name: true,
	show_sex: false,
	show_group: true,
	hide_card_image: false,
	show_replay: false,
	show_playerids: true,
	show_sortcard: true,
	show_pause: true,
	show_auto: true,
	show_volumn: true,
	show_cardpile: true,
	show_commonCardpile: true,
	show_cardpile_number: true,
	show_handcardbutton: true,
	show_giveup: true,
	show_wuxie: true,
	wuxie_right: false,
	show_discardpile: true,
	show_round_menu: false,
	show_tip: true,
	show_sortPack: false,
	show_deckMonitor: false,
	show_charactercard: true,
	show_charactercardMode: "intro",
	show_favourite: true,
	show_favmode: true,
	show_favourite_menu: true,
	show_ban_menu: true,
	right_range: true,
	popequip: true,
	filternode_button: true,
	show_characternamepinyin: "doNotShow",
	show_skillnamepinyin: "doNotShow",
});

/** 每次读取旧存档后执行，旧包和旧模式不会重新进入加载队列。 */
export function simplifyConfig(config) {
	const object = value => value && typeof value === "object" && !Array.isArray(value);
	if (!object(config.mode_config)) config.mode_config = {};
	if (!object(config.mode_config.global)) config.mode_config.global = {};
	if (!object(config.all)) config.all = {};
	for (const mode of modes) if (!object(config.mode_config[mode])) config.mode_config[mode] = {};
	Object.assign(config, { ...fixedAppearance, skin: {} });
	// 首次进入也按需创建菜单，避免一次性生成全部武将和卡牌按钮。
	config.mode_config.global.menu_loadondemand = true;
	for (const mode of modes) {
		config.mode_config[mode] ??= {};
		config.mode_config[mode].menu_loadondemand = true;
	}
	if (!modes.includes(config.mode)) config.mode = "identity";
	for (const key of ["characters", "defaultcharacters", "connect_characters", "hiddenCharacterPack"]) {
		config[key] = (Array.isArray(config[key]) ? config[key] : []).filter(name => characterPacks.includes(name));
	}
	for (const key of ["cards", "defaultcards", "connect_cards", "hiddenCardPack"]) {
		config[key] = (Array.isArray(config[key]) ? config[key] : []).filter(name => cardPacks.includes(name));
	}
	config.all.sgscharacters = [...characterPacks];
	config.all.sgscards = [...cardPacks];
	config.all.sgsmodes = [...modes];
	config.all.stockmode = [...modes];
	config.all.stockextension = [];
	config.all.theme = ["decade"];
	config.all.layout = ["long2"];
	config.hiddenModePack = (Array.isArray(config.hiddenModePack) ? config.hiddenModePack : []).filter(name => modes.includes(name));
	config.plays = [];
	config.extensions = [];
	// Old update/resource preferences must not restore split-package behavior.
	for (const key of Object.keys(config)) {
		if (/^(?:asset_|extension_|version_description_v)/.test(key) || ["auto_check_update", "update_link", "updateURL", "brokenFile", "show_extensionmaker", "show_extensionshare", "remove_extension_onfig"].includes(key)) {
			delete config[key];
		}
	}
	config.mode_config.identity ??= {};
	config.mode_config.versus ??= {};
	if (!["normal", "zhong", "purple", "stratagem"].includes(config.mode_config.identity.identity_mode)) {
		config.mode_config.identity.identity_mode = "normal";
	}
	if (!["four", "three", "two"].includes(config.mode_config.versus.versus_mode)) {
		config.mode_config.versus.versus_mode = "two";
	}
}
