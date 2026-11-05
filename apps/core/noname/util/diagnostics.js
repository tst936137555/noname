const errors = [];
const runtime = { longTasks: 0, longestTask: 0 };

export function sanitizeDiagnostic(value, limit = 2000) {
	return String(value ?? "")
		.replace(/(["']?(?:session_secret|onlineKey|token|password|secret|authorization|credential)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;&}]+)/gi, "$1[redacted]")
		.replace(/\bBearer\s+[\w.+/=-]+/gi, "Bearer [redacted]")
		.replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@")
		.replace(/([?&][^=\s]+)=([^&#\s]+)/g, "$1=[redacted]")
		.slice(0, limit);
}

export function recordError(error) {
	const message = sanitizeDiagnostic(error?.message || error);
	const stack = sanitizeDiagnostic(error?.stack, 6000);
	const previous = errors.find(item => item.message === message && item.stack === stack);
	if (previous) {
		previous.count++;
		return false;
	}
	errors.push({ message, stack, name: sanitizeDiagnostic(error?.name || "Error", 100), time: new Date().toISOString(), count: 1 });
	if (errors.length > 50) errors.shift();
	return true;
}

export function observeRuntime() {
	if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
	const observer = new PerformanceObserver(list => {
		for (const entry of list.getEntries()) {
			runtime.longTasks++;
			runtime.longestTask = Math.max(runtime.longestTask, Math.round(entry.duration));
		}
	});
	observer.observe({ type: "longtask", buffered: true });
	window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

/** Keep error recovery available without interrupting every input with native alerts. */
export function showErrorNotice(lib) {
	if (document.getElementById("noname-error-notice")) return;
	const notice = document.createElement("aside");
	notice.id = "noname-error-notice";
	notice.setAttribute("role", "status");
	notice.style.cssText = "position:fixed;z-index:2147483646;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));padding:12px;background:#30291f;color:#fff;border:1px solid #d9b66f;font:14px/1.6 sans-serif;box-sizing:border-box;height:auto";
	const message = document.createElement("span");
	message.textContent = "运行出现异常，诊断已记录。";
	const copy = document.createElement("button");
	copy.textContent = "复制诊断";
	copy.onclick = async () => {
		const text = diagnostics(lib);
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			window.prompt("复制以下诊断信息", text);
		}
	};
	const close = document.createElement("button");
	close.textContent = "关闭";
	close.onclick = () => notice.remove();
	for (const button of [copy, close]) button.style.cssText = "position:relative;margin-left:12px;padding:5px 10px;height:auto";
	notice.append(message, copy, close);
	document.body.appendChild(notice);
}

export function diagnostics(lib) {
	return JSON.stringify(
		{
			version: sanitizeDiagnostic(lib.version, 100),
			build: lib.buildInfo,
			platform: navigator.userAgent,
			runtime,
			resources: performance.getEntriesByType("resource").length,
			timings: performance
				.getEntriesByType("measure")
				.filter(item => item.name.startsWith("startup:"))
				.slice(-100)
				.map(item => ({ stage: sanitizeDiagnostic(item.name, 200), duration: Math.round(item.duration) })),
			errors,
		},
		null,
		2
	);
}
