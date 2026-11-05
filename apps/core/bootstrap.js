// Keep this module independent of the engine so module-graph failures remain recoverable.
let watchdog;
let loading = true;
const failures = [];
const clean = value =>
	String(value?.message || value || "未知错误")
		.replace(/(["']?(?:session_secret|onlineKey|token|password|secret)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;&}]+)/gi, "$1[redacted]")
		.replace(/([?&][^=\s]+)=([^&#\s]+)/g, "$1=[redacted]")
		.slice(0, 2000);
function failed(error) {
	clearTimeout(watchdog);
	const message = clean(error);
	if (!failures.includes(message)) {
		failures.push(message);
		console.error("Startup Error:", message);
	}
	if (failures.length > 20) failures.shift();
	if (!loading) return;
	const panel = document.getElementById("startup-loading");
	if (!panel) return;
	panel.hidden = false;
	panel.dataset.error = message;
	const status = panel.querySelector(".startup-status");
	if (status) status.textContent = "加载失败，请重试；若重复失败，请检查游戏文件或复制诊断。";
	panel.querySelectorAll("button").forEach(button => {
		button.hidden = false;
	});
}
function heartbeat() {
	clearTimeout(watchdog);
	loading = true;
	watchdog = setTimeout(() => failed(new Error("启动超过 90 秒未取得进展")), 90000);
}
window.addEventListener("noname:startup-progress", heartbeat);
window.addEventListener("noname:startup-ready", () => {
	loading = false;
	clearTimeout(watchdog);
});
window.addEventListener("noname:startup-error", event => failed(event.detail));
window.addEventListener("error", event => {
	if (event.error) failed(event.error);
});
window.addEventListener("unhandledrejection", event => failed(event.reason));
const diagnosticsButton = document.getElementById("startup-diagnostics");
if (diagnosticsButton)
	diagnosticsButton.onclick = async () => {
		const text = JSON.stringify({ phase: "startup", errors: failures, platform: navigator.userAgent, time: new Date().toISOString() }, null, 2);
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			window.prompt("复制以下诊断信息", text);
		}
	};
performance.setResourceTimingBufferSize?.(3000);
heartbeat();
import("./noname/entry.ts").catch(failed);
