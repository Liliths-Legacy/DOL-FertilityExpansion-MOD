(() => {
	"use strict";

	const unlockedNames = Object.freeze(["Bailey", "Leighton", "Gwylan"]);
	const originallyInfertile = Object.freeze(["Bailey", "Leighton"]);
	let appliedUnlock = false;

	function addUnique(list, value) {
		if (Array.isArray(list) && !list.includes(value)) list.push(value);
	}

	function removeValue(list, value) {
		if (!Array.isArray(list)) return;
		for (let index = list.length - 1; index >= 0; index--) {
			if (list[index] === value) list.splice(index, 1);
		}
	}

	function settingEnabled() {
		return V?.options?.eden?.allowSterilePregnancy === true || V?.eden?.settings?.allowSterilePregnancy === true;
	}

	function hasActivePregnancy(name) {
		const pregnancy = C?.npc?.[name]?.pregnancy;
		return Boolean(pregnancy?.enabled && ((pregnancy.type !== null && pregnancy.type !== undefined) || pregnancy.fetus?.length));
	}

	function refreshNpcPregnancyState() {
		if (typeof Wikifier !== "function" || !V?.NPCNameList || !C?.npc) return;
		new Wikifier(null, "<<npcPregnancyUpdater>>");
	}

	function apply() {
		const pregnancy = setup?.pregnancy;
		if (!pregnancy) return false;
		const enabled = settingEnabled();

		if (enabled) {
			const firstApplication = !appliedUnlock;
			for (const name of unlockedNames) {
				addUnique(pregnancy.canBePregnant, name);
				addUnique(pregnancy.canImpregnatePlayer, name);
			}
			for (const name of originallyInfertile) removeValue(pregnancy.infertile, name);
			appliedUnlock = true;
			if (firstApplication) refreshNpcPregnancyState();
			return true;
		}

		const activeNames = unlockedNames.filter(hasActivePregnancy);
		if (!appliedUnlock && activeNames.length === 0) return false;
		const restoringOurChanges = appliedUnlock;
		/* Player pregnancies already contain their fetus data, so that direction can
		 * be restored immediately. NPC support must remain until birth or the base
		 * updater will erase the active pregnancy. */
		if (restoringOurChanges) {
			for (const name of unlockedNames) removeValue(pregnancy.canImpregnatePlayer, name);
		}
		for (const name of unlockedNames) {
			if (hasActivePregnancy(name)) {
				addUnique(pregnancy.canBePregnant, name);
				removeValue(pregnancy.infertile, name);
			} else if (restoringOurChanges) {
				removeValue(pregnancy.canBePregnant, name);
				if (originallyInfertile.includes(name)) addUnique(pregnancy.infertile, name);
			}
		}
		appliedUnlock = activeNames.length > 0;
		if (restoringOurChanges) refreshNpcPregnancyState();
		return false;
	}

	function npcName(npc) {
		if (typeof npc === "string" || npc instanceof String) return String(npc);
		return npc?.fullDescription || npc?.name || "";
	}

	function recordGwylanFairyContact(npc, spermType, genital) {
		if (!settingEnabled() || npcName(npc) !== "Gwylan" || !["hand", "kiss"].includes(genital)) return false;
		if (V.settings?.pregnancyType !== "silly") return false;

		/* Returning true means this Gwylan contact has been handled, including when
		 * clothing or another base setting prevents conception. */
		apply();
		if (V.activeNightmare || V.disableImpregnation || V.disableNormalImpregnation) return true;
		if (genital === "hand" && V.worn?.hands?.name !== "naked") return true;
		if (genital === "kiss" && V.worn?.face?.type?.includes("face_covering")) return true;
		if (typeof fetishPregnancy !== "function") return true;

		let rngModifier = 100;
		if (Object.values(V.loveInterest || {}).some(name => V.NPCNameList?.includes(name))) rngModifier = 200;
		const type = spermType || C.npc?.Gwylan?.type || "human";
		if (setup.pregnancy.typesEnabled.includes(type) && V.settings.playerPregnancyHumanEnabled !== false) {
			fetishPregnancy({ genital, target: "pc", spermOwner: "Gwylan", spermType: type, rngModifier });
		}
		if (
			setup.pregnancy.typesEnabled.includes("human") &&
			V.settings.npcPregnancyEnabled !== false &&
			C.npc?.Gwylan?.pregnancy?.enabled
		) {
			fetishPregnancy({ genital, target: "Gwylan", spermOwner: "pc", spermType: "human", rngModifier });
		}
		return true;
	}

	window.EdenPregnancySettings = Object.freeze({ apply, hasActivePregnancy, recordGwylanFairyContact });
	$(document).on(":storyready.edenPregnancySettings :passagedisplay.edenPregnancySettings", apply);
})();
