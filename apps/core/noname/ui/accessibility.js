/** Keyboard behavior for legacy div controls without changing their visual layout. */
export function accessibleButton(node, activate, role = "button") {
	node.tabIndex = 0;
	node.setAttribute("role", role);
	const sync = () => {
		const disabled = node.classList.contains("disabled") || node.classList.contains("unselectable");
		node.setAttribute("aria-disabled", String(disabled));
		if (role === "switch") node.setAttribute("aria-checked", String(node.classList.contains("on")));
	};
	sync();
	new MutationObserver(sync).observe(node, { attributes: true, attributeFilter: ["class"] });
	node.addEventListener("keydown", event => {
		if (event.target !== node || event.isComposing) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			event.stopPropagation();
			if (node.getAttribute("aria-disabled") !== "true") activate.call(node, event);
		}
	});
}

const controls = root => [...root.querySelectorAll('button, input, select, textarea, [tabindex="0"], [contenteditable="true"]')].filter(node => !node.disabled && node.getClientRects().length && node.getAttribute("aria-disabled") !== "true");

export function bindDialog(container, label, close) {
	let previous;
	let visible = false;
	container.setAttribute("role", "dialog");
	container.setAttribute("aria-label", label);
	container.setAttribute("aria-modal", "true");
	container.tabIndex = -1;
	const sync = () => {
		const next = !container.classList.contains("hidden");
		if (next === visible) return;
		visible = next;
		if (visible) {
			previous = document.activeElement;
			(controls(container)[0] || container).focus();
		} else if (previous?.isConnected) previous.focus();
	};
	new MutationObserver(sync).observe(container, { attributes: true, attributeFilter: ["class"] });
	container.addEventListener("keydown", event => {
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if (event.key === "Tab") {
			const nodes = controls(container);
			const current = nodes.indexOf(document.activeElement);
			if (!nodes.length) {
				event.preventDefault();
				container.focus();
				return;
			}
			if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === nodes.length - 1)) {
				event.preventDefault();
				nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
			}
		}
	});
}
