// Classic, independent entry: recovery still works if the module graph fails.
window.addEventListener("DOMContentLoaded", () => {
	document.getElementById("startup-retry")?.addEventListener("click", () => location.reload());
	const entry = document.querySelector('script[src$="bootstrap.js"]');
	entry?.addEventListener("error", showFailure);
});
window.addEventListener("error", event => {
	if (event.target instanceof HTMLScriptElement) showFailure();
}, true);
function showFailure() {
	const status = document.querySelector(".startup-status");
	if (status) status.textContent = "启动文件加载失败，请重试或检查游戏文件";
	const button = document.getElementById("startup-retry");
	if (button) button.hidden = false;
}
