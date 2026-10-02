(() => {
	"use strict";

	const scriptId = "twine-user-script";
	const marker = "/* FertilityExpansion: expose original birth helper */";

	function patchOriginalScript() {
		const source = document.getElementById(scriptId);
		if (!source) return false;
		const code = source.textContent || "";
		if (code.includes(marker)) return true;
		if (!code.includes("function giveBirthToChildren(")) return false;
		source.textContent = `${code}\n${marker}\nwindow.giveBirthToChildren = giveBirthToChildren;\n`;
		window.EdenBirthBridgeStatus = "patched";
		return true;
	}

	if (patchOriginalScript()) return;
	const observer = new MutationObserver(() => {
		if (!patchOriginalScript()) return;
		observer.disconnect();
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
})();
