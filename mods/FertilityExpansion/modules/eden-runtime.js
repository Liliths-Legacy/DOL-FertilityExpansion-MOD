;(() => {
	"use strict";

	// Check lazily: early scripts execute before the other modules and the game State.
	const required = Object.freeze([
		["EdenChildData", "syncRegistry", "孩子资料"],
		["EdenSaveMigration", "ensureReady", "存档转换"],
		["EdenSaveRecovery", "infer", "旧资料恢复"],
		["EdenAge", "syncAll", "成长"],
		["EdenTraits", "syncAll", "天生属性"],
		["EdenTraining", "syncAll", "培养"],
		["EdenBreeding", "syncAll", "孕期"],
		["EdenAdult", "syncAll", "成年结算"],
		["EdenHandbook", "syncAll", "通讯录"],
		["EdenLifeStory", "syncAll", "人生来信"],
	]);
	function missing() {
		return required.filter(([api, method]) => typeof window[api]?.[method] !== "function").map(([, , label]) => label);
	}
	const bannerMarker = "/* FertilityExpansion: preserve banner target across scene changes */";
	let bannerPatchStatus = "waiting";
	function patchSource(source) {
		if (source.includes(bannerMarker)) return source;
		const append = "\t\tWeather.banner.skybox.appendTo(this.output);";
		const onload = "\t\t\tWeather.banner.skybox.empty().append($(bannerFallbackImage));\n\t\t\tWeather.banner.skybox.css(\"padding-top\", 0);";
		if (source.split(append).length !== 2 || source.split(onload).length !== 2) return source;
		return source.replace(append,
			`\t\t${bannerMarker}\n\t\tconst bannerSkybox = Weather.banner?.skybox;\n\t\tif (!bannerSkybox) return;\n\t\tbannerSkybox.appendTo(this.output);`)
			.replace(onload,
				"\t\t\tif (!bannerSkybox[0]?.isConnected) return;\n\t\t\tbannerSkybox.empty().append($(bannerFallbackImage));\n\t\t\tbannerSkybox.css(\"padding-top\", 0);");
	}
	window.EdenRuntime = Object.freeze({ version: "1.7.0", missing, isReady: () => missing().length === 0,
		patchSource, bannerPatchStatus: () => bannerPatchStatus });

	function install() {
		const script = document.getElementById("twine-user-script");
		if (!script?.textContent) return false;
		const patched = patchSource(script.textContent);
		if (patched !== script.textContent) script.textContent = patched;
		bannerPatchStatus = patched.includes(bannerMarker) ? "patched" : "unmatched";
		return true;
	}
	if (install()) return;
	const observer = new MutationObserver(() => {
		if (install()) observer.disconnect();
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
})();
