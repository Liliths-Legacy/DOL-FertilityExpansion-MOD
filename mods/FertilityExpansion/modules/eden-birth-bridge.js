(() => {
	"use strict";

	const scriptId = "twine-user-script";
	const marker = "/* FertilityExpansion: expose original birth helper */";
	const recordsMarker = "/* FertilityExpansion: Eden pregnancy records hooks */";

	function patchSource(code) {
		if (code.includes(recordsMarker) || code.includes(marker)) return code;
		if (code.includes("function giveBirthToChildren(")) return `${code}\n${marker}\nwindow.giveBirthToChildren = giveBirthToChildren;\n`;
		if (!code.includes("function birthRecordedLitter(")) return code;
		// Patch the lexical functions before DefineMacro captures them. Every anchor is
		// checked first: a changed upstream script must never get a partial patch.
		const patches = [
			['function npcPregnancyRoll(carrier, carrierSpecies, donor, donorSpecies, orifice, depth = "deep", location = V.location, donorFertility = 1, slot = null) {', 'function npcPregnancyRoll(carrier, carrierSpecies, donor, donorSpecies, orifice, depth = "deep", location = V.location, donorFertility = 1, slot = null) {\n\tconst edenCarrier = window.EdenBreeding?.encounterCarrier(slot, carrier);\n\tif (edenCarrier) { carrier = edenCarrier.name; carrierSpecies = edenCarrier.species; }'],
			['!randomCarrierTypes.includes(carrierSpecies)', '(!edenCarrier && !randomCarrierTypes.includes(carrierSpecies))'],
			['recorded = rememberRandomCarrier(slot, location);', 'recorded = edenCarrier ? carrier : rememberRandomCarrier(slot, location);'],
			['const pregnancyId = createPregnancy(recorded, carrierSpecies, donor, offspring, [{ name: donor, species: donorSpecies }], time, orifice, location);', 'const pregnancyId = createPregnancy(recorded, carrierSpecies, donor, offspring, [{ name: donor, species: donorSpecies }], time, orifice, location);\n\tif (edenCarrier) window.EdenBreeding.captureNativePregnancy(V.eden, edenCarrier.childId, pregnancyId);'],
			['const donorSpecies = !beast && V.enemytype === "man" ? "human" : npc.type;', 'const donorSpecies = window.EdenBreeding?.encounterSpecies(npc) ?? (!beast && V.enemytype === "man" ? "human" : npc.type);'],
			['function resolveChildParent(name) {', 'function resolveChildParent(name) {\n\tconst edenParent = window.EdenBreeding?.nativeParentTraits(name);\n\tif (edenParent) return edenParent;'],
		];
		if (patches.some(([anchor]) => code.split(anchor).length !== 2)) return code;
		for (const [anchor, replacement] of patches) code = code.replace(anchor, replacement);
		return `${code}\n${recordsMarker}\n`;
	}

	window.EdenBirthBridge = Object.freeze({ patchSource });

	function patchOriginalScript() {
		const source = document.getElementById(scriptId);
		if (!source) return false;
		const code = source.textContent || "";
		const patched = patchSource(code);
		if (patched !== code) source.textContent = patched;
		if (patched.includes(recordsMarker)) {
			window.EdenBirthBridgeStatus = "native-records";
			return true;
		}
		if (patched.includes(marker)) {
			window.EdenBirthBridgeStatus = "patched";
			return true;
		}
		if (code.includes("function birthRecordedLitter(")) {
			window.EdenBirthBridgeStatus = "unsupported-records";
			return true;
		}
		return false;
	}

	if (patchOriginalScript()) return;
	const observer = new MutationObserver(() => {
		if (!patchOriginalScript()) return;
		observer.disconnect();
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
})();
