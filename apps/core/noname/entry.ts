import { lib, game, get, _status, ui, ai } from "noname";
import { boot } from "@/init/index.js";
import { userAgentLowerCase, device } from "@/util/index.js";
import { loadBuildInfo } from "@/util/meta.js";
import { failStartupLoading, updateStartupProgress } from "@/init/startup.js";
import { observeRuntime, recordError } from "@/util/diagnostics.js";
import "core-js-bundle";


(async () => {
	try {
		observeRuntime();
		updateStartupProgress(2, "正在初始化运行环境");
		lib.device = device;

		// 预加载脚本
		const path = "/preload.js";
		const { default: preload } = await import(/* @vite-ignore */ path).catch(error => {
			if (window.Capacitor?.isNativePlatform?.()) throw error;
			return import("./init/browser.js");
		});
		await preload({ lib, game, get, _status, ui, ai });
		lib.buildInfo = await loadBuildInfo(url => lib.init.promises.json(url));

		// GPL确认
		if (!localStorage.getItem("gplv3_noname_alerted")) {
			if (
				confirm(`①无名杀是一款基于GPLv3协议的开源软件
你可以在遵守GPLv3协议的基础上任意使用，修改并转发《无名杀》，以及所有基于《无名杀》开发的扩展
点击“确定”即代表您认可并接受GPLv3协议↓️
https://www.gnu.org/licenses/gpl-3.0.html
②无名杀官方发布地址仅有GitHub仓库
其他所有的所谓“无名杀”社群（包括但不限于绝大多数“官方”QQ群、QQ频道等）均为玩家自发组织，与无名杀官方无关`)
			) {
				localStorage.setItem("gplv3_noname_alerted", String(true));
			} else {
				game.exit();
				return;
			}
		}

		await boot();
	} catch (e) {
		clearTimeout(window.resetGameTimeout);
		recordError(e);
		failStartupLoading(e);
		console.error(e);
		alert(`《无名杀》加载内容失败
浏览器UA信息: 
${userAgentLowerCase}
错误信息: 
${e instanceof Error ? e.stack : String(e)}
若您不理解该信息，请依次检查：
1. 游戏文件是否完整（重新下载完整包）
2. 客户端是否需要更新
3. 浏览器是否需要更新
4. 若您直接打开index.html进行游戏，请改为运行文件夹内的noname-server.exe
5. 若以上步骤均无法解决问题，请及时向开发组反馈`);
	}
})();
