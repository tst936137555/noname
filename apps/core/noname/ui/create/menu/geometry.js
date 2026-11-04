/** 所有坐标均使用弹出层自身的 CSS 像素，兼容页面缩放和触屏放大。 */
export function fitMenu({ x, y, anchorLeft, width, height, availableWidth, availableHeight, gap = 10 }) {
	const left = x + width <= availableWidth - gap ? x : anchorLeft - width - 5;
	return {
		left: Math.max(gap, Math.min(left, availableWidth - width - gap)),
		top: Math.max(gap, Math.min(y, availableHeight - height - gap)),
	};
}
