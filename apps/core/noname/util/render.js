/** Keep drawing coordinates in CSS pixels while allocating a native-resolution bitmap. */
export function resizeCanvas(canvas, width, height, scale = globalThis.devicePixelRatio || 1) {
	const ratio = Math.max(1, Math.min(4, Number(scale) || 1));
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	canvas.width = Math.max(1, Math.round(width * ratio));
	canvas.height = Math.max(1, Math.round(height * ratio));
	const context = canvas.getContext("2d");
	context?.setTransform(ratio, 0, 0, ratio, 0, 0);
	if (context) context.imageSmoothingQuality = "high";
	return context;
}
