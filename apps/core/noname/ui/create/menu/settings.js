// 设置只暴露对局、输入、声音和存档；外观由 product.js 统一锁定。
export function createSettingsPages(configMenu) {
	const pick = (section, keys) => Object.fromEntries(keys.map(key => [key, configMenu[section].config[key]]));
	return [
		{
			name: "对局设置",
			config: pick("general", ["game_speed", "sync_speed", "auto_confirm", "skip_shan", "unauto_choose", "wuxie_self", "tao_enemy", "confirm_exit", "keep_awake"]),
		},
		{
			name: "操作设置",
			config: pick("general", ["touchscreen", "enable_drag", "mousewheel", "hover_all", "hover_handcard", "hoveration", "right_info", "right_click", "longpress_info", "swipe", "swipe_down", "swipe_up", "swipe_left", "swipe_right", "enable_vibrate"]),
		},
		{
			name: "声音设置",
			config: pick("audio", ["background_music", "volumn_background", "background_audio", "background_speak", "equip_audio", "volumn_audio", "repeat_audio"]),
		},
		{
			name: "存档管理",
			config: { ...pick("general", ["video", "video_default_play_speed"]), ...pick("others", ["export_data", "import_data", "import_data_button", "reset_hiddenpack"]) },
		},
	];
}

/** 按输入设备显示有意义的操作，避免同名鼠标／触屏设置混在一起。 */
export function isSettingVisible(key, config, { touchAvailable, device, node }) {
	if (key === "touchscreen") return touchAvailable;
	if (key === "enable_vibrate" || key === "keep_awake") return Boolean(device);
	if (key === "confirm_exit") return !node && device !== "ios";
	if (["mousewheel", "hover_all", "right_info", "right_click"].includes(key)) return !config.touchscreen;
	if (["hover_handcard", "hoveration"].includes(key)) return !config.touchscreen && config.hover_all;
	if (["longpress_info", "swipe"].includes(key)) return Boolean(config.touchscreen);
	if (key.startsWith("swipe_")) return Boolean(config.touchscreen && config.swipe);
	return true;
}
