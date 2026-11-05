/** 启动时只预热固定界面素材，不将全部立绘和语音常驻内存。 */
export const startupImages = Object.freeze(["image/background/ol_bg.jpg", "theme/simple/card.png", "theme/simple/card2.png", "theme/style/cardback/image/liusha.png", "theme/style/cardback/image/liusha2.png", ...Array.from({ length: 4 }, (_, index) => `theme/style/hp/image/glass${index + 1}.png`), "theme/style/hp/image/shield.png"]);

export async function preloadFont(font, timeout = 8000) {
	let timer;
	try {
		await Promise.race([
			document.fonts.load(`24px "${font}"`),
			new Promise((resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`字体加载超时：${font}`)), timeout);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export function updateStartupProgress(value, message) {
	window.dispatchEvent(new Event("noname:startup-progress"));
	const node = document.getElementById("startup-loading");
	if (!node) return;
	const progress = node.querySelector("progress");
	const percent = Math.max(0, Math.min(100, Math.round(value)));
	progress.value = percent;
	node.querySelector(".startup-percent").textContent = `${percent}%`;
	node.querySelector(".startup-status").textContent = message;
}

export function hideStartupLoading() {
	document.getElementById("startup-loading")?.setAttribute("hidden", "");
	window.dispatchEvent(new Event("noname:startup-ready"));
}

export function showStartupLoading(message) {
	document.getElementById("startup-loading")?.removeAttribute("hidden");
	updateStartupProgress(0, message);
}

/** @param {unknown} error */
export function failStartupLoading(error = new Error("游戏启动失败")) {
	window.dispatchEvent(new CustomEvent("noname:startup-error", { detail: error }));
	const node = document.getElementById("startup-loading");
	if (!node) return;
	node.removeAttribute("hidden");
	node.querySelector(".startup-status").textContent = "加载失败，请检查游戏文件或重新加载";
	node.querySelector("button").hidden = false;
}

export const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

/** 限制同时解析的包体数量，并在任务之间交还主线程。必要内容失败时阻止进入游戏。 */
export async function runStartupTasks(tasks, onProgress, concurrency = 4) {
	let next = 0;
	let completed = 0;
	const failures = [];
	await Promise.all(
		Array.from({ length: Math.min(tasks.length, Math.max(1, Math.floor(concurrency) || 1)) }, async () => {
			while (next < tasks.length) {
				const task = tasks[next++];
				try {
					let timer;
					const started = performance.now();
					try {
						await Promise.race([
							Promise.resolve().then(() => task.load()),
							new Promise((_, reject) => {
								timer = setTimeout(() => reject(new Error(`加载超时：${task.label}`)), 60000);
							}),
						]);
					} finally {
						clearTimeout(timer);
						performance.measure?.(`startup:${task.label}`, { start: started, end: performance.now() });
					}
				} catch (error) {
					if (task.optional) console.warn(`预加载失败：${task.label}`, error);
					else failures.push(`${task.label}：${error instanceof Error ? error.message : String(error)}`);
				} finally {
					onProgress(++completed, tasks.length, task.label);
				}
				await yieldToBrowser();
			}
		})
	);
	if (failures.length) throw new Error(`游戏内容加载失败\n${failures.join("\n")}`);
}

/** 缺失或过慢的装饰素材可回退到浏览器按需加载，不阻塞模式选择。 */
export function preloadImage(url, timeout = 8000) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		let settled = false;
		const timer = setTimeout(() => finish(new Error(`图片加载超时：${url}`)), timeout);
		function finish(error) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			image.onload = image.onerror = null;
			if (error) reject(error);
			else resolve();
		}
		image.onload = async () => {
			try {
				await image.decode?.();
				finish();
			} catch (error) {
				finish(error);
			}
		};
		image.onerror = () => finish(new Error(`图片加载失败：${url}`));
		image.src = url;
	});
}
