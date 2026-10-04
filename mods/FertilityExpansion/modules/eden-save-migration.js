(() => {
	"use strict";

	const version = 1;
	const marker = "/* FertilityExpansion: migrate Eden save records */";
	const descriptionPrefix = "Eden child ";
	const persistentPrefix = "eden_child:";
	let transaction = null;

	function variables() {
		return typeof V === "object" ? V : window.SugarCube?.State?.variables;
	}

	function copy(value) {
		return typeof clone === "function" ? clone(value) : structuredClone(value);
	}

	function hasId(value) {
		return value !== null && value !== undefined && value !== "";
	}

	function addMapping(oldId, newId) {
		if (!transaction || !hasId(oldId)) return;
		const key = String(oldId);
		if (!Number.isInteger(newId) || newId < 0) throw new Error("孩子编号转换结果无效。");
		if (Object.hasOwn(transaction.childMap, key) && transaction.childMap[key] !== newId) {
			throw new Error(`旧孩子编号 ${key} 对应了多个新编号。`);
		}
		transaction.childMap[key] = newId;
	}

	/* Called inside the native migration, while its exact old-key map still exists. */
	function captureChildMap(map) {
		if (!transaction) return;
		for (const [oldId, newId] of Object.entries(map)) {
			addMapping(oldId, newId);
			transaction.legacyByNewId[newId] = transaction.snapshot.children[oldId];
		}
	}

	/* Native PC/NPC in-flight migration otherwise drops custom genetic fields. */
	function pushLegacyChild(legacy, fields) {
		const newId = window.pushChildRecord(fields);
		if (transaction) {
			addMapping(legacy.childId, newId);
			transaction.legacyByNewId[newId] = copy(legacy);
		}
		return newId;
	}

	function mappedId(value) {
		if (!hasId(value)) return value;
		const key = String(value);
		if (!Object.hasOwn(transaction.childMap, key)) throw new Error(`无法关联旧孩子编号 ${key}。`);
		return String(transaction.childMap[key]);
	}

	function mappedIdentity(value) {
		if (typeof value !== "string") return value;
		for (const prefix of [descriptionPrefix, persistentPrefix]) {
			if (value.startsWith(prefix)) return prefix + mappedId(value.slice(prefix.length));
		}
		return value;
	}

	const idFields = new Set([
		"childId", "selectedChildId", "activeEncounterChildId", "activeChildId", "geneticParentId",
		"edenGeneticParentId", "edenParentChildId", "inheritedFrom", "activeBirthParentId", "parentId",
	]);
	const identityFields = new Set(["mother", "father", "carrier", "donor", "fullDescription", "persistentKey", "per"]);

	/* Only rewrite identity fields. Profiles, generated prose, and historical snapshots stay intact. */
	function rewriteReferences(root, seen = new WeakSet()) {
		if (!root || typeof root !== "object" || seen.has(root)) return;
		seen.add(root);
		for (const [key, value] of Object.entries(root)) {
			if (["recordsMigration", "inputSnapshot", "content"].includes(key)) continue;
			if (idFields.has(key)) root[key] = mappedId(value);
			else if (identityFields.has(key)) root[key] = mappedIdentity(value);
			else if (key === "childIds" && Array.isArray(value)) root[key] = value.map(mappedId);
			else if (key === "parentsByDescription" && value && typeof value === "object") {
				const parents = {};
				for (const [name, id] of Object.entries(value)) {
					const newName = mappedIdentity(name);
					if (Object.hasOwn(parents, newName)) throw new Error("父母身份记录发生冲突。");
					parents[newName] = mappedId(id);
				}
				root[key] = parents;
			} else rewriteReferences(value, seen);
		}
	}

	function rewriteNativeIdentity(root, seen) {
		if (!root || typeof root !== "object" || seen.has(root)) return;
		seen.add(root);
		for (const key of ["carrier", "donor", "fullDescription", "per", "edenChildId"]) {
			if (key === "edenChildId" && hasId(root[key])) root[key] = mappedId(root[key]);
			else if (key in root) root[key] = mappedIdentity(root[key]);
		}
		for (const list of ["awareOfPregnancy", "awareOfCarrier", "awareOfDonor", "awareOfChild", "awareOfGender"]) {
			if (Array.isArray(root[list])) root[list] = root[list].map(mappedIdentity);
		}
		if (Array.isArray(root.possibleDonors)) {
			root.possibleDonors.forEach(donor => { donor.name = mappedIdentity(donor.name); });
		}
		if (root.talkedAbout) {
			root.talkedAbout = Object.fromEntries(Object.entries(root.talkedAbout).map(([name, value]) => [mappedIdentity(name), value]));
		}
	}

	function migratePersistentNpcs(vars) {
		const seen = new WeakSet();
		if (vars.per_npc) {
			const entries = {};
			for (const [key, npc] of Object.entries(vars.per_npc)) {
				const newKey = mappedIdentity(key);
				if (Object.hasOwn(entries, newKey)) throw new Error("持久角色编号发生冲突。");
				rewriteNativeIdentity(npc, seen);
				entries[newKey] = npc;
			}
			vars.per_npc = entries;
		}
		for (const npc of vars.NPCList || []) rewriteNativeIdentity(npc, seen);
		for (const stored of Object.values(vars.storedNPCs || {})) rewriteNativeIdentity(stored.npc, seen);
		for (const pregnancy of vars.pregnancies) rewriteNativeIdentity(pregnancy, seen);
	}

	function migrateAdultPregnancies(vars, legacyEden) {
		let count = 0;
		for (const [oldParentId, oldRecord] of Object.entries(legacyEden.children || {})) {
			const legacy = oldRecord?.adult?.pregnancy;
			if (!legacy?.fetus?.length) continue;
			const parentId = mappedId(oldParentId);
			const record = vars.eden.children[parentId];
			const parent = vars.childRecords[Number(parentId)];
			if (!parent || !record?.adult) throw new Error("无法找到孕期所属的孩子。");
			if (!["human", "wolf", "hawk"].includes(legacy.type)) throw new Error(`不支持转换 ${legacy.type} 孕期。`);
			if (!Number.isFinite(legacy.timer) || !Number.isFinite(legacy.timerEnd) || legacy.timerEnd <= 0) {
				throw new Error("模组孕期进度无效，旧数据已保留。");
			}
			if (legacy.fetus.some(fetus => !hasId(fetus.childId) || fetus.type !== legacy.type) ||
				new Set(legacy.fetus.map(fetus => String(fetus.childId))).size !== legacy.fetus.length) {
				throw new Error("同胎孩子的编号或种族资料不完整。");
			}
			const carrier = descriptionPrefix + parentId;
			const existingIds = legacy.fetus.map(fetus => transaction.childMap[String(fetus.childId)]);
			let pregnancyId;
			if (existingIds.some(id => id !== undefined)) {
				if (existingIds.some(id => id === undefined)) throw new Error("一胎中的孩子只完成了部分转换。");
				pregnancyId = vars.childRecords[existingIds[0]].pregnancyId;
				if (existingIds.some(id => vars.childRecords[id].pregnancyId !== pregnancyId)) throw new Error("同胎孩子的孕期关联不一致。");
				const pregnancy = vars.pregnancies[pregnancyId];
				if (pregnancy.deliveredDate !== null || vars.childRecords.filter(child => child.pregnancyId === pregnancyId).length !== existingIds.length) {
					throw new Error("已有孕期的生产状态或胎数与旧资料不一致。");
				}
				const storedCarrier = vars.storedNPCs?.[pregnancy.carrier];
				if (pregnancy.carrier !== carrier && storedCarrier?.npc?.fullDescription !== carrier) {
					throw new Error("已有孕期属于另一名角色。");
				}
				if (storedCarrier) delete vars.storedNPCs[pregnancy.carrier];
				pregnancy.carrier = carrier;
			} else {
				if (vars.pregnancies.some(pregnancy => pregnancy.carrier === carrier && pregnancy.deliveredDate === null)) {
					throw new Error("角色已经存在另一份未完成孕期。");
				}
				const donor = legacy.fetus[0].father;
				if (!hasId(donor)) throw new Error("孕期缺少另一方父母资料。");
				pregnancyId = window.pushPregnancyRecord({
					carrier, carrierSpecies: parent.species, donor: mappedIdentity(donor), donorSpecies: legacy.type,
					possibleDonors: (legacy.potentialFathers || []).map(father => ({ name: mappedIdentity(father.source), species: father.type })),
					conceivedDate: window.inflightConceivedDate(legacy.timer, legacy.timerEnd, legacy.type),
					conceivedLocation: legacy.fetus[0].conceivedLocation ?? "eden_home", orifice: "vagina",
					awareOfPregnancy: ["pc"], awareOfCarrier: ["pc"], awareOfDonor: legacy.fetus[0].fatherKnown ? ["pc"] : [],
					...(legacy.type === "hawk" ? { hatchDelay: 0, layCare: 0 } : {}),
					waterBreaking: Boolean(legacy.waterBreaking),
				});
				for (const fetus of legacy.fetus) {
					pushLegacyChild(fetus, {
						pregnancyId, species: fetus.type, features: window.migrateChildFeatures(fetus.features || {}),
						gender: fetus.gender, identical: fetus.features?.identical ? pregnancyId : null, name: fetus.name ?? null,
					});
				}
			}
			vars.pregnancies[pregnancyId].edenParentChildId = parentId;
			for (const child of vars.childRecords.filter(child => child.pregnancyId === pregnancyId)) child.edenGeneticParentId = parentId;
			record.adult.pregnancy = {
				edenDataVersion: 2, pregnancyId, edenParentChildId: parentId,
				givenBirth: legacy.givenBirth ?? 0, totalBirthEvents: legacy.totalBirthEvents ?? 0,
				due: legacy.due === true, deliveryBlocked: legacy.deliveryBlocked === true,
				...(legacy.lastDeliveryError !== undefined ? { lastDeliveryError: legacy.lastDeliveryError } : {}),
			};
			count++;
		}
		return count;
	}

	function restoreGeneticLinks(vars, legacyEden) {
		for (const [newId, legacy] of Object.entries(transaction.legacyByNewId)) {
			let oldParentId = legacy.edenGeneticParentId;
			if (!hasId(oldParentId)) {
				for (const name of [legacy.mother, legacy.father]) {
					const description = transaction.snapshot.storedNPCs?.[name]?.npc?.fullDescription || name;
					oldParentId = legacyEden.breeding?.parentsByDescription?.[description];
					if (hasId(oldParentId)) break;
				}
			}
			if (hasId(oldParentId)) {
				const parentId = mappedId(oldParentId);
				vars.childRecords[newId].edenGeneticParentId = parentId;
				if (vars.eden.children[newId]) vars.eden.children[newId].geneticParentId = parentId;
			}
		}
	}

	function migrateEden(vars) {
		const legacyEden = transaction.snapshot.eden;
		const children = {};
		for (const [oldId, record] of Object.entries(vars.eden.children || {})) {
			const newId = mappedId(oldId);
			if (!vars.childRecords[Number(newId)] || Object.hasOwn(children, newId)) throw new Error("孩子资料关联发生冲突。");
			if (!record || typeof record !== "object" || (record.childId !== undefined && String(record.childId) !== oldId)) {
				throw new Error("孩子记录的内部编号与索引不一致。");
			}
			children[newId] = record;
		}
		vars.eden.children = children;
		migratePersistentNpcs(vars);
		// Adult pregnancy child IDs must be captured before rewriting all remaining references.
		const adultPregnancies = migrateAdultPregnancies(vars, legacyEden);
		// Newly converted pregnancy references are already numeric-system IDs.
		const adultStates = Object.values(children).map(record => [record, record.adult?.pregnancy]);
		for (const [record] of adultStates) if (record.adult) delete record.adult.pregnancy;
		rewriteReferences(vars.eden);
		for (const [record, pregnancy] of adultStates) if (record.adult && pregnancy !== undefined) record.adult.pregnancy = pregnancy;
		for (const [id, record] of Object.entries(children)) record.childId = id;
		restoreGeneticLinks(vars, legacyEden);
		vars.eden.recordsMigration = {
			version, status: "complete", source: "0.5.11", childMap: { ...transaction.childMap }, adultPregnancies,
			legacyBackup: { eden: copy(legacyEden), children: copy(transaction.snapshot.children || {}) },
		};
		delete vars.eden.recordsMigration.legacyBackup.eden.recordsMigration;
	}

	function runNativeMigration(original) {
		const vars = variables();
		if (!vars?.eden || vars.eden.recordsMigration?.version >= version || vars.objectVersion?.pregnancyRecords >= 1) return original();
		if (transaction) throw new Error("伊甸园迁移不能重复进入。");
		const snapshot = copy(vars);
		transaction = { snapshot, childMap: Object.create(null), legacyByNewId: Object.create(null) };
		try {
			const result = original();
			if ((vars.objectVersion?.pregnancyRecords ?? 0) < 1 || !Array.isArray(vars.childRecords) || !Array.isArray(vars.pregnancies)) {
				throw new Error("原版存档转换没有完成。");
			}
			migrateEden(vars);
			return result;
		} catch (error) {
			for (const key of Object.keys(vars)) delete vars[key];
			Object.assign(vars, snapshot);
			vars.eden.recordsMigration = { version: 0, status: "failed", error: String(error.message || error) };
			throw new Error(`生育拓展旧存档迁移未完成，已恢复转换前的数据：${error.message || error}`);
		} finally {
			transaction = null;
		}
	}

	function hasReferences(root, seen = new WeakSet()) {
		if (!root || typeof root !== "object" || seen.has(root)) return false;
		seen.add(root);
		return Object.entries(root).some(([key, value]) => {
			if (["recordsMigration", "inputSnapshot", "content"].includes(key)) return false;
			if (idFields.has(key)) return hasId(value);
			if (key === "childIds" && Array.isArray(value)) return value.some(hasId);
			if (key === "parentsByDescription") return Object.keys(value || {}).length > 0;
			return hasReferences(value, seen);
		});
	}

	function ensureReady() {
		const vars = variables();
		if (!vars?.eden || !Array.isArray(vars.childRecords)) return true; // 0.5.11 remains unchanged.
		if (vars.eden.recordsMigration?.version >= version) return true;
		if (vars.children !== undefined) return false; // Native conversion has not run yet.
		if (Object.keys(vars.eden.children || {}).length === 0 && !hasReferences(vars.eden)) {
			vars.eden.recordsMigration = { version, status: "complete", source: "new-save", childMap: {}, adultPregnancies: 0 };
			return true;
		}
		vars.eden.recordsMigration = {
			version: 0, status: "needsRecovery",
			error: "原版已转换孩子资料，但没有伊甸园的旧编号对应记录。请载入升级前的存档备份。",
		};
		return false;
	}

	function patchSource(code) {
		if (code.includes(marker) || !code.includes("function migratePregnancyData(")) return code;
		const mapAnchor = "\treturn oldBirthIdToNewPregnancyId;\n}\nwindow.migrateChildrenToRecords = migrateChildrenToRecords;";
		const fetusAnchor = "pushChildRecord({\n\t\t\t\tpregnancyId,\n\t\t\t\tspecies: fetus.type,";
		const supported = code.split(mapAnchor).length === 2 && code.split(fetusAnchor).length === 3;
		let patched = code;
		if (supported) {
			patched = patched.replace(mapAnchor, "\twindow.EdenSaveMigration.captureChildMap(oldKeyToNewId);\n" + mapAnchor);
			patched = patched.split(fetusAnchor).join(fetusAnchor.replace("pushChildRecord({", "window.EdenSaveMigration.pushLegacyChild(fetus, {"));
		}
		const guard = supported ? "" : 'if (V.eden) throw new Error("原版迁移接口发生变化，无法安全转换伊甸园旧存档。");';
		return `${patched}\n${marker}\nconst edenNativeMigratePregnancyData = migratePregnancyData;\nmigratePregnancyData = function () {\n return window.EdenSaveMigration.runNativeMigration(() => {\n ${guard}\n return edenNativeMigratePregnancyData();\n });\n};\nwindow.migratePregnancyData = migratePregnancyData;\n`;
	}

	window.EdenSaveMigration = Object.freeze({ version, captureChildMap, pushLegacyChild, runNativeMigration, ensureReady, patchSource });

	function install() {
		const script = document.getElementById("twine-user-script");
		if (!script || !script.textContent) return false;
		const patched = patchSource(script.textContent);
		if (patched !== script.textContent) script.textContent = patched;
		return true;
	}

	if (install()) return;
	const observer = new MutationObserver(() => {
		if (install()) observer.disconnect();
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
})();
