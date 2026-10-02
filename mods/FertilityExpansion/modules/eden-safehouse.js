(() => {
	"use strict";

	function canUnbind(variables = window.SugarCube?.State?.variables) {
		if (typeof window.breakableSoftBinding === "function") {
			return window.breakableSoftBinding();
		}
		// 0.5.8 Bedroom checks these states directly; keep its native unbind rules.
		if (!variables) return false;
		const armsBound = typeof window.pcAreArmsBound === "function"
			? window.pcAreArmsBound("any")
			: variables.leftarm === "bound" || variables.rightarm === "bound";
		return armsBound || variables.feetuse === "bound" || variables.worn?.feet?.name === "ankle cuffs";
	}

	window.EdenSafehouseCompat = Object.freeze({ canUnbind });
})();
