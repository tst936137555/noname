const errors = [];
export function recordError(error) {
	const message = String(error?.message || error).replace(/(?:session_secret|onlineKey|token)[=:]\s*[^\s,;]+/gi, "[redacted]");
	const previous = errors.find(item => item.message === message);
	if (previous) {
		previous.count++;
		return false;
	}
	errors.push({ message, name: error?.name || "Error", time: new Date().toISOString(), count: 1 });
	if (errors.length > 50) errors.shift();
	return true;
}
export function diagnostics(lib) {
	return JSON.stringify(
		{
			version: lib.version,
			build: lib.buildInfo,
			platform: navigator.userAgent,
			timings: performance
				.getEntriesByType("measure")
				.filter(item => item.name.startsWith("startup:"))
				.map(item => ({ stage: item.name, duration: Math.round(item.duration) })),
			errors,
		},
		null,
		2
	);
}
