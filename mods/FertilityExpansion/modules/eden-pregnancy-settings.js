(() => {
	"use strict";

	const unlockedNames = Object.freeze(["Bailey", "Leighton", "Gwylan"]);
	let baseline = null;
	let baselineSetup = null;
	let refreshPending = false;

	function setMembership(list, value, present) {
		if (!Array.isArray(list)) return false;
		const before = list.includes(value);
		if (present && !before) list.push(value);
		if (!present) {
			for (let i = list.length - 1; i >= 0; i--) if (list[i] === value) list.splice(i, 1);
		}
		return before !== present;
	}

	function settingEnabled() {
		// The options checkbox takes precedence, including an explicit false before edenSetup copies it.
		const option = V?.options?.eden?.allowSterilePregnancy;
		return typeof option === "boolean" ? option : V?.eden?.settings?.allowSterilePregnancy === true;
	}

	function hasActivePregnancy(name) {
		if (Array.isArray(V?.pregnancies)) return V.pregnancies.some(p => p?.carrier === name && p.deliveredDate === null);
		const pregnancy = C?.npc?.[name]?.pregnancy;
		return Boolean(pregnancy?.enabled && ((pregnancy.type !== null && pregnancy.type !== undefined) || pregnancy.fetus?.length));
	}

	function refreshNpcPregnancyState() {
		if (typeof Wikifier !== "function" || !V?.NPCNameList || !C?.npc) return false;
		new Wikifier(null, "<<npcPregnancyUpdater>>");
		return true;
	}

	function apply() {
		const pregnancy = typeof setup === "object" ? setup.pregnancy : null;
		if (!pregnancy) return false;
		if (baselineSetup !== pregnancy) { baseline = null; baselineSetup = pregnancy; refreshPending = false; }
		const enabled = settingEnabled();
		const activeNames = unlockedNames.filter(hasActivePregnancy);
		if (!baseline && !enabled && !activeNames.length) return false;
		if (!baseline) {
			baseline = Object.fromEntries(unlockedNames.map(name => [name, {
				canBePregnant: pregnancy.canBePregnant?.includes(name) === true,
				canImpregnatePlayer: pregnancy.canImpregnatePlayer?.includes(name) === true,
				infertile: pregnancy.infertile?.includes(name) === true,
			}]));
		}
		for (const name of unlockedNames) {
			const keepCarrier = enabled || activeNames.includes(name);
			const original = baseline[name];
			refreshPending = setMembership(pregnancy.canBePregnant, name, keepCarrier || original.canBePregnant) || refreshPending;
			refreshPending = setMembership(pregnancy.canImpregnatePlayer, name, enabled || original.canImpregnatePlayer) || refreshPending;
			refreshPending = setMembership(pregnancy.infertile, name, keepCarrier ? false : original.infertile) || refreshPending;
		}
		if (refreshPending && refreshNpcPregnancyState()) refreshPending = false;
		return enabled;
	}

	function npcName(npc) {
		if (typeof npc === "string" || npc instanceof String) return String(npc);
		return npc?.fullDescription || npc?.name || "";
	}

	function recordNativeFairyContact(type) {
		const gwylan = C.npc?.Gwylan;
		if (!gwylan) return;
		const playerOrifice = V.player?.vaginaExist ? "vagina" : "anus";
		const donorHasPenis = gwylan.penis !== undefined && gwylan.penis !== "none" && gwylan.penis !== false;
		const playerCanCarry = V.player?.vaginaExist || ["always", "exceptional"].includes(V.settings?.analPregnancy);
		if (donorHasPenis && playerCanCarry && typeof window.sceneInseminate === "function") {
			// In fetish mode the native helper rolls immediately and stores no persistent load.
			window.sceneInseminate(playerOrifice, "Gwylan", type, "deep", 1, 0);
		}
		if (!V.player?.penisExist || !gwylan?.pregnancy?.enabled || V.settings?.nnpcPregnancyEnabled !== true || typeof window.npcPregnancyRoll !== "function") return;
		const hasVagina = gwylan.vagina !== undefined && gwylan.vagina !== "none" && gwylan.vagina !== false;
		const orifice = hasVagina ? "vagina" : "anus";
		if (!hasVagina && !V.settings.npcAnalPregnancyEnabled) return;
		window.npcPregnancyRoll("Gwylan", gwylan.type || "human", "pc", "human", orifice);
	}

	function recordGwylanFairyContact(npc, spermType, genital) {
		if (!settingEnabled() || npcName(npc) !== "Gwylan" || !["hand", "kiss"].includes(genital)) return false;
		const records = Array.isArray(V?.pregnancies);
		if (V.settings?.pregnancyType !== (records ? "fetish" : "silly")) return false;

		apply();
		if (V.statFreeze || V.activeNightmare || V.disableImpregnation || V.disableNormalImpregnation) return true;
		if (genital === "hand" && V.worn?.hands?.name !== "naked") return true;
		if (genital === "kiss" && V.worn?.face?.type?.includes("face_covering")) return true;
		const type = spermType || C.npc?.Gwylan?.type || "human";
		if (records) {
			// Fantasy contact is a mod rule. Both directions use the native conception
			// gates, anatomy, chance, menstrual cycle and medication; no forced flag.
			recordNativeFairyContact(type);
			return true;
		}
		if (typeof fetishPregnancy !== "function") return true;
		let rngModifier = 100;
		if (Object.values(V.loveInterest || {}).some(name => V.NPCNameList?.includes(name))) rngModifier = 200;
		if (setup.pregnancy.typesEnabled.includes(type) && V.settings.playerPregnancyHumanEnabled !== false) {
			fetishPregnancy({ genital, target: "pc", spermOwner: "Gwylan", spermType: type, rngModifier });
		}
		if (setup.pregnancy.typesEnabled.includes("human") && V.settings.npcPregnancyEnabled !== false && C.npc?.Gwylan?.pregnancy?.enabled) {
			fetishPregnancy({ genital, target: "Gwylan", spermOwner: "pc", spermType: "human", rngModifier });
		}
		return true;
	}

	window.EdenPregnancySettings = Object.freeze({ apply, hasActivePregnancy, recordGwylanFairyContact });
	$(document).on(":storyready.edenPregnancySettings :passagedisplay.edenPregnancySettings", apply);
})();
