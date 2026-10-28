;(() => {
	"use strict";
	const vars = () => window.SugarCube?.State?.variables || window.State?.variables || {};
	const innateKeys = ["appearance", "fitness", "intelligence", "temperament"];
	const skillKeys = ["knowledge", "fitness", "social", "awareness"];
	// These passages continue using the selected child/event after the overlay closes.
	const activeChildEvents = new Set(["Wolf Cave Hurt Pup", "childCuddle", "childTalk", "Childrens Donate Milk", "Childrens Donate Milk 2", "Childrens Home Toys", "Children Activity Events", "Wolf Children Chew Bone", "Wolf Children Chew Rope", "Wolf Children Roll Ball", "Eden Child Interaction Event", "Eden Adult Birth", "Eden Adult Settlement", "Eden Adult Release Confirm"]);
	const errorMessage = error => typeof error?.message === "string" ? error.message : typeof error === "string" ? error : "操作失败，请重新打开作弊页后重试。";
	function snapshot(root) {
		// Preserve the original graph and descriptors, without reading or assigning
		// native getter-only aliases (e.g. player/NPC genital properties).
		const objects = new Map();
		const pending = [root];
		while (pending.length) {
			const value = pending.pop();
			if (!value || typeof value !== "object" || objects.has(value)) continue;
			const descriptors = Object.getOwnPropertyDescriptors(value);
			const tag = Object.prototype.toString.call(value);
			const contents = tag === "[object Map]" ? [...Map.prototype.entries.call(value)] : tag === "[object Set]" ? [...Set.prototype.values.call(value)] : tag === "[object Date]" ? Date.prototype.getTime.call(value) : undefined;
			objects.set(value, { descriptors, tag, contents });
			for (const key of Reflect.ownKeys(descriptors)) if ("value" in descriptors[key]) pending.push(descriptors[key].value);
			if (tag === "[object Map]") for (const [key, item] of contents) pending.push(key, item);
			if (tag === "[object Set]") for (const item of contents) pending.push(item);
		}
		return () => {
			let failure;
			for (const [object, { descriptors, tag, contents }] of objects) try {
				for (const key of Reflect.ownKeys(object)) if (!Object.hasOwn(descriptors, key)) delete object[key];
				Object.defineProperties(object, descriptors);
				if (tag === "[object Map]") { Map.prototype.clear.call(object); for (const [key, value] of contents) Map.prototype.set.call(object, key, value); }
				if (tag === "[object Set]") { Set.prototype.clear.call(object); for (const value of contents) Set.prototype.add.call(object, value); }
				if (tag === "[object Date]") Date.prototype.setTime.call(object, contents);
			} catch (error) { failure = error; }
			if (failure) throw failure;
		};
	}
	function available() {
		if (vars().cheatsEnabled === true) return true;
		// Cheat-Lyra exposes the native cheat menu without setting cheatsEnabled.
		// Follow that menu's access rather than requiring a second cheat switch.
		const overlay = typeof document !== "undefined" && document.getElementById("customOverlay");
		return !!(overlay && overlay.dataset.overlay === "cheats" && !overlay.closest(".hidden") && overlay.querySelector("#cheatsShown"));
	}
	function guard() {
		const v = vars();
		if (!available()) throw new Error("请先打开原版作弊页。");
		if (v.statFreeze || v.combat === 1 || v.possessed || v.NPCList?.[0]?.type) throw new Error("请在事件结束并解除属性冻结后使用。");
		const passage = (window.SugarCube?.State || window.State)?.passage;
		if (activeChildEvents.has(passage)) throw new Error("请先结束当前孩子互动或结算事件，再使用作弊。");
		if (Array.isArray(v.pregnancies) && v.pregnancies.some(p => p?.birthInProgress)) throw new Error("请在当前生产流程结束后使用作弊。");
	}
	function perform(action) {
		let rollback;
		const v = vars();
		try {
			guard();
			rollback = snapshot(v);
			const message = action(v);
			if (v.feats) v.feats.locked = true;
			return { ok: true, message };
		} catch (error) {
			try { if (rollback) rollback(); }
			catch (_) { return { ok: false, message: "操作失败，部分数据无法还原。请先读取操作前的存档。" }; }
			return { ok: false, message: errorMessage(error) };
		}
	}
	function labour() {
		return perform(v => {
			if (!Array.isArray(v.childRecords) || typeof window.checkLabour !== "function") throw new Error("此操作需要原版 0.5.12 的孕期系统。");
			const pregnancies = window.getActivePregnancies("pc").filter(p => !p.birthInProgress);
			if (!pregnancies.length) throw new Error("当前没有可推进的怀孕。");
			const now = window.Time?.date?.timeStamp;
			if (!Number.isFinite(now)) throw new Error("无法读取当前日期。");
			for (const p of pregnancies) {
				const span = window.getDueDate(p) - p.conceivedDate;
				if (!Number.isFinite(span) || span <= 0) throw new Error("孕期数据不完整。");
				p.conceivedDate = now - span;
			}
			window.checkLabour();
			const eggsOnly = pregnancies.every(p => window.childBaseSpecies(p.donorSpecies) === "hawk");
			return eggsOnly ? "已到产卵期，请继续原版产卵流程。" : "已足月并破水，请继续原版生产流程。";
		});
	}
	function parasites(fertilise) {
		return perform(v => {
			let count = 0;
			for (const orifice of ["vagina", "anus"]) {
				const p = v.sexStats?.[orifice]?.pregnancy;
				if (p?.type !== "parasite") continue;
				if (p.fetus != null && !Array.isArray(p.fetus)) throw new Error("寄生物数据不完整。");
				for (const item of p.fetus || []) {
					if (!item || typeof item !== "object") throw new Error("寄生物数据不完整。");
					if (fertilise ? !item.fertilised : item.fertilised && item.daysLeft !== 0) {
						if (fertilise) {
							if (!Number.isFinite(item.stats?.growth) || item.stats.growth <= 0) throw new Error("寄生卵数据不完整。");
							item.fertilised = true;
							item.daysLeft = item.stats.growth;
							if (item.stats.gender === "Hermaphrodite") p.motherStatus = 2;
						} else item.daysLeft = 0;
						count++;
					}
				}
			}
			if (!count) throw new Error(fertilise ? "没有未受精的寄生卵。" : "没有尚未成熟的已受精寄生物。");
			return `已${fertilise ? "受精" : "成熟"} ${count} 个。`;
		});
	}
	function target(id) {
		const v = vars(), child = window.EdenChildData.get(id), record = v.eden?.children?.[id];
		if (!child || !record || window.EdenChildData.phaseOf(child) !== "born") throw new Error("请选择已出生的孩子。");
		return { v, child, record };
	}
	function children(query = "") {
		const normalize = value => String(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
		const needle = normalize(query);
		const entries = window.EdenChildData?.entries({ scope: "born" }).filter(([id]) => vars().eden?.children?.[id]) || [];
		if (!needle) return entries;
		const rank = child => {
			const name = normalize(child.name || "未命名");
			if (name === needle) return 0;
			if (name.startsWith(needle)) return 1;
			if (name.includes(needle)) return 2;
			let cursor = 0;
			for (const letter of name) if (letter === needle[cursor]) cursor++;
			return cursor === needle.length ? 3 : Infinity;
		};
		return entries.map(entry => ({ entry, rank: rank(entry[1]) })).filter(item => Number.isFinite(item.rank))
			.sort((a, b) => a.rank - b.rank).map(item => item.entry);
	}
	function numeric(value, min, max, integer = false) {
		const invalid = `请输入${min}-${max}之间的数字`;
		if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || !Number.isFinite(Number(value))) throw new Error(invalid);
		const n = Number(value);
		if (n < min || n > max) throw new Error(invalid);
		if (integer && !Number.isInteger(n)) throw new Error("先天属性请输入0-100之间的整数");
		return Math.round(n * 100) / 100;
	}
	function choices(child) {
		const pool = window.PregnancyConstants?.genePool || {};
		return {
			species: ["human", "wolf", "hawk"], gender: ["m", "f", "h"],
			monster: ["", "monster"], beastTransform: ["", "bird", "cat", "fox", "wolf", "cow"],
			divineTransform: ["", "angel", "fallen", "demon"],
			size: pool.childSize || ["tiny", "small", "normal", "large"],
			hairColour: [...new Set([...(pool.hairColour || []), ...(pool.wolfFur || []), ...(pool.hawkFeather || []), "black"])],
			eyeColour: pool.eyeColour || [], skinColour: ["light", "medium", "dark", "gyaru", "ylight", "ymedium", "ydark", "ygyaru", "ghostlyPale"],
		};
	}
	function identity(child) {
		return { species: window.EdenChildData.baseSpecies(child), gender: child.gender, ...Object.fromEntries(["monster", "beastTransform", "divineTransform", "size", "hairColour", "eyeColour", "skinColour"].map(k => [k, child.features?.[k] ?? ""])) };
	}
	function saveInnate(id, patch) {
		return perform(() => {
			const { v, child, record } = target(id);
			const before = identity(child), options = choices(child), next = {};
			for (const key of Object.keys(before)) {
				const value = patch[key] ?? before[key];
				if (value !== before[key] && !options[key].includes(value)) throw new Error("请选择支持的种族或外貌。");
				next[key] = value;
			}
			// Human base species is already humanoid; monster is only meaningful for animals.
			if (next.species === "human") next.monster = "";
			const formChanged = ["species", "monster", "beastTransform", "gender"].some(k => before[k] !== next[k]);
			if (formChanged && record.adult?.pregnancy) throw new Error("请在该角色孕期结束后修改种族或性别。");
			if (record.adult?.settled && formChanged && next.species !== "human" && next.monster !== "monster") throw new Error("已成年结算的角色不能改为动物形态。");
			const values = Object.fromEntries(innateKeys.map(k => [k, numeric(patch[k], 0, 100, true)]));
			window.EdenTraining.syncRecord(record, child, v.eden.settings);
			window.EdenTraits.syncRecord(record, child, String(id), v);
			child.gender = next.gender;
			if (window.EdenChildData.isRecord(child)) child.species = next.species;
			else child.type = next.species === "wolf" && next.monster ? (next.gender === "f" ? "wolfgirl" : "wolfboy") : next.species === "hawk" && next.monster ? "harpy" : next.species;
			child.features ??= {};
			for (const key of Object.keys(next)) if (!["species", "gender"].includes(key)) child.features[key] = next[key] || null;
			// Do not allow a previous cached species to survive conversion back to human.
			record.species = "human";
			window.EdenAge.syncRecord(record, child, v.eden.settings);
			const old = record.innate;
			record.innate = { ...old, ...values, base: { ...old.base }, personality: values.temperament <= 50 ? "quiet" : "active",
				speciesAtGeneration: record.species, speciesModifiersApplied: { ...window.EdenTraits.getSpeciesModifiers(record.species) } };
			// Preserve the twin group's shared base; editing one child must not alter a sibling.
			if (!old.identical) record.innate.base = { ...values };
			window.EdenAdult.syncRecord(record, child);
			return "已保存先天属性与外貌。";
		});
	}
	function saveSkills(id, patch) {
		return perform(() => {
			const { v, child, record } = target(id);
			const values = Object.fromEntries(skillKeys.map(k => [k, numeric(patch[k], 0, 100)]));
			window.EdenTraining.syncRecord(record, child, v.eden.settings);
			Object.assign(record.training.skills, values);
			return "已保存养成属性。";
		});
	}
	function returnsFromAdulthood(record, child) {
		return record.adult?.settled || ["eden_contacts", "eden_released"].includes(window.EdenChildData.locationOf(child));
	}
	function resetReason(id) {
		try {
			const { v, child, record } = target(id);
			if (returnsFromAdulthood(record, child)) {
				if (!v.eden.facility?.owned) return "尚未拥有伊甸园，无法接回成年孩子。";
				const capacity = Number(v.eden.facility.capacity);
				const others = window.EdenFacility.residentIds(v).filter(residentId => String(residentId) !== String(id)).length;
				if (!Number.isInteger(capacity) || others >= capacity) return "伊甸园没有空位，无法重置成年孩子的养育进度。请先腾出空位。";
			}
			return "";
		} catch (e) { return errorMessage(e); }
	}
	function reset(id) {
		return perform(() => {
			const reason = resetReason(id);
			if (reason) throw new Error(reason);
			const { v, child, record } = target(id);
			const wasAdult = returnsFromAdulthood(record, child);
			if (!window.EdenAge.resetGrowthAge(record)) throw new Error("无法读取当前日期。");
			window.EdenChildRemoval.clearAdultPregnancy(v, String(id));
			clearAdultMemory(v, id, record);
			record.adult = {};
			if (wasAdult && !window.EdenChildData.setLocation(child, "eden_home")) throw new Error("无法更新孩子地点。");
			record.status = window.EdenChildData.locationOf(child) === "eden_home" ? "resident" : "active";
			record.training = window.EdenTraining.normalizeTraining(null);
			window.EdenAge.syncRecord(record, child, v.eden.settings);
			window.EdenAdult.syncRecord(record, child);
			return "养育进度已重置，成年判定、成年LLM及孕期数据已清空。";
		});
	}
	function clearAdultMemory(v, id, record) {
		delete record.chat;
		if (record.adult) delete record.adult.lifeStory;
		const migration = v.eden.recordsMigration;
		const oldIds = [String(id), ...Object.keys(migration?.childMap || {}).filter(key => String(migration.childMap[key]) === String(id))];
		for (const oldId of oldIds) {
			const saved = migration?.legacyBackup?.eden?.children?.[oldId];
			if (saved) { delete saved.chat; if (saved.adult) delete saved.adult.lifeStory; }
		}
	}
	function adultReason(id) {
		try {
			const { v, child, record } = target(id);
			if (!window.EdenAge.isHumanoid(record, child)) return "动物形态不支持成年结算。";
			if (!window.EdenAge.isCultivableSpecies(record, v.eden.settings)) return "该种族尚未开启养育。";
			return "";
		} catch (e) { return errorMessage(e); }
	}
	function settleAdult(id) {
		return perform(() => {
			const reason = adultReason(id);
			if (reason) throw new Error(reason);
			const { v, child, record } = target(id);
			const day = window.EdenAge.currentSerialDay();
			if (!Number.isFinite(day)) throw new Error("无法读取当前日期。");
			window.EdenAge.syncRecord(record, child, v.eden.settings);
			record.growthStartSerialDay = day - Math.max(record.ageDays, record.stageThresholds.adult);
			record.forcedAdult = true;
			// Keep current skills, without processing skipped days or their costs.
			const skills = { ...record.training?.skills };
			record.training = window.EdenTraining.normalizeTraining(null);
			Object.assign(record.training.skills, skills);
			// A physical pregnancy is not an outcome or LLM memory.
			const pregnancy = record.adult?.pregnancy;
			record.adult = pregnancy ? { pregnancy } : {};
			clearAdultMemory(v, id, record);
			window.EdenAge.syncRecord(record, child, v.eden.settings);
			if (!window.EdenChildData.setLocation(child, "eden_home")) throw new Error("无法更新孩子地点。");
			window.EdenAdult.syncRecord(record, child);
			const result = window.EdenAdult.settle(record, child);
			if (!result.ok) throw new Error(result.message);
			window.EdenLifeStory?.syncRecord(record);
			window.EdenHandbook?.syncAll(v.eden);
			return `已成年结算：${window.EdenAdult.outcomeLabel(record)}。`;
		});
	}
	function removeChild(id) {
		return perform(() => {
			const { v } = target(id);
			window.EdenChildRemoval.remove(v, String(id));
			return "已删除该孩子及其相关数据。";
		});
	}
	window.EdenCheats = Object.freeze({ available, labour, parasites, children, choices, identity, saveInnate, saveSkills, reset, resetReason, adultReason, settleAdult, removeChild });
})();
