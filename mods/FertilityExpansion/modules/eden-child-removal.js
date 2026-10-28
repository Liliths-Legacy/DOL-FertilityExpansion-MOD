;(() => {
	"use strict";
	const idFields = new Set(["selectedChildId", "activeEncounterChildId", "activeChildId", "interactionMenuChildId", "geneticParentId", "edenGeneticParentId", "edenParentChildId", "edenChildId", "inheritedFrom", "activeBirthParentId", "parentId"]);
	const idLists = new Set(["childIds", "eggsHatched", "eggsMoved"]);
	const identityLists = new Set(["coParents", "awareOfPregnancy", "awareOfCarrier", "awareOfDonor", "awareOfChild", "awareOfGender"]);
	const parentFields = new Set(["mother", "father", "carrier", "donor"]);
	const has = (ids, value) => value !== null && value !== undefined && ids.has(String(value));
	const description = id => `Eden child ${id}`;
	// Keep array slots reserved: native IDs are indices, and null/hole entries break
	// native filters after saving. These placeholders contain no personal data.
	function tombstone(childId) {
		return { childId, edenDeleted: true, pregnancyId: -1, bornDate: null, species: "human", development: {} };
	}
	function clearPregnancy(root, id) {
		root.pregnancies[id] = { pregnancyId: Number(id), carrier: "cleared", donor: "unknown", conceivedDate: 0,
			deliveredDate: null, awareOfPregnancy: [], awareOfCarrier: [], awareOfDonor: [], possibleDonors: [], talkedAbout: {} };
	}
	function purgeReferences(root, ids, seen = new WeakSet()) {
		if (!root || typeof root !== "object" || seen.has(root) || root.edenDeleted) return;
		seen.add(root);
		const names = new Set([...ids].flatMap(id => [description(id), `eden_child:${id}`]));
		for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(root))) {
			if (!("value" in descriptor) || !descriptor.writable) continue;
			const value = descriptor.value;
			if (key === "recordsMigration") continue; // old IDs are handled separately
			if (names.has(key) || (idFields.has(key) && has(ids, value))) { delete root[key]; continue; }
			if (["childSelected", "childActivityEvent", "interactionEvent", "lastBirthResult"].includes(key)
				&& (has(ids, value?.childId) || has(ids, value?.childid) || has(ids, value?.parentId))) {
				delete root[key]; continue;
			}
			if (value && typeof value === "object" && (has(ids, value.edenChildId) || has(ids, value.npc?.edenChildId)
				|| names.has(value.fullDescription) || names.has(value.npc?.fullDescription) || names.has(value.persistentKey))) {
				if (Array.isArray(root)) root[key] = {}; else delete root[key];
				continue;
			}
			if (parentFields.has(key) && names.has(value)) { root[key] = "unknown"; continue; }
			if (idLists.has(key) && Array.isArray(value)) root[key] = value.filter(id => !has(ids, id));
			else if (identityLists.has(key) && Array.isArray(value)) root[key] = value.filter(item => !names.has(item));
			else if (key === "possibleDonors" && Array.isArray(value)) root[key] = value.filter(item => !names.has(item?.name));
			purgeReferences(root[key], ids, seen);
		}
	}
	function purgeRecords(root, ids) {
		if (!root || typeof root !== "object") return;
		const affected = new Set();
		for (const id of ids) {
			if (Array.isArray(root.childRecords) && root.childRecords[id] && !root.childRecords[id].edenDeleted) {
				affected.add(root.childRecords[id].pregnancyId);
				root.childRecords[id] = tombstone(Number(id));
			}
			if (root.children) delete root.children[id];
			if (root.eden?.children) delete root.eden.children[id];
		}
		for (const id of affected) {
			const remaining = root.childRecords.filter(child => child.pregnancyId === id);
			if (!remaining.length && root.pregnancies?.[id]) clearPregnancy(root, id);
			for (const [who, intros] of Object.entries(root.babyIntros || {})) {
				root.babyIntros[who] = intros.filter(entry => entry.birthId !== id || remaining.length).map(entry =>
					entry.birthId === id ? { ...entry, children: remaining.length } : entry);
			}
			if (!remaining.length && root.recentBirthId === id) delete root.recentBirthId;
		}
		if (has(ids, root.orphanHawkChildId)) delete root.orphanHawkChildId;
		purgeReferences(root, ids);
	}
	function remove(vars, childId) {
		const ids = new Set([String(childId)]);
		// A deleted carrier's unborn litter disappears with the ongoing pregnancy.
		// Born descendants survive; their parent identity becomes unknown.
		for (const pregnancy of vars.pregnancies || []) {
			if (pregnancy.carrier !== description(childId) || pregnancy.deliveredDate !== null) continue;
			for (const child of vars.childRecords || []) if (child.pregnancyId === pregnancy.pregnancyId && child.bornDate === null) ids.add(String(child.childId));
			clearPregnancy(vars, pregnancy.pregnancyId);
		}
		const migration = vars.eden?.recordsMigration;
		if (migration) {
			const oldIds = new Set([...ids]);
			for (const [oldId, newId] of Object.entries(migration.childMap || {})) {
				if (has(ids, newId)) { oldIds.add(oldId); delete migration.childMap[oldId]; }
			}
			const backup = migration.legacyBackup;
			if (backup) {
				purgeRecords(backup.records, ids);
				purgeRecords(backup, oldIds);
			}
		}
		purgeRecords(vars, ids);
	}
	function clearAdultPregnancy(vars, childId) {
		const names = new Set([description(childId), `eden_child:${childId}`]);
		const matches = value => value && (String(value.edenChildId) === childId || names.has(value.fullDescription) || names.has(value.per));
		const storedKeys = Object.entries(vars.storedNPCs || {}).filter(([key, value]) => names.has(key) || matches(value?.npc)).map(([key]) => key);
		const carriers = new Set([description(childId), ...storedKeys]);
		const unborn = new Set();
		for (const pregnancy of vars.pregnancies || []) {
			if (!carriers.has(pregnancy.carrier) || pregnancy.deliveredDate !== null) continue;
			for (const child of vars.childRecords || []) if (child.pregnancyId === pregnancy.pregnancyId && child.bornDate === null) unborn.add(String(child.childId));
			clearPregnancy(vars, pregnancy.pregnancyId);
		}
		if (unborn.size) purgeRecords(vars, unborn);
		for (const key of storedKeys) delete vars.storedNPCs[key];
		// Discard cached adult NPC bodies so setup cannot
		// capture the cleared pregnancy again after the child has been reset.
		for (const collection of [vars.per_npc, vars.persistentNPCs, vars.NPCList]) {
			for (const [key, value] of Object.entries(collection || {})) if (names.has(key) || matches(value) || matches(value?.npc)) {
				if (Array.isArray(collection)) collection[key] = {}; else delete collection[key];
			}
		}
		const eden = vars.eden;
		if (eden?.breeding) {
			delete eden.breeding.parentsByDescription?.[description(childId)];
			if (String(eden.breeding.activeBirthParentId) === childId) eden.breeding.activeBirthParentId = null;
			if (String(eden.breeding.lastBirthResult?.parentId) === childId) delete eden.breeding.lastBirthResult;
		}
		if (String(eden?.bedVisit?.activeChildId) === childId) Object.assign(eden.bedVisit, { activeChildId: null, variant: null, interruptedSleep: false });
		if (String(eden?.activeEncounterChildId) === childId) { delete eden.activeEncounterChildId; delete eden.encounterContext; }
		const migration = eden?.recordsMigration;
		if (migration?.legacyBackup?.records) clearAdultPregnancy(migration.legacyBackup.records, childId);
		for (const oldId of [childId, ...Object.keys(migration?.childMap || {}).filter(key => String(migration.childMap[key]) === childId)]) {
			const saved = migration?.legacyBackup?.eden?.children?.[oldId];
			if (saved?.adult) delete saved.adult.pregnancy;
		}
	}
	window.EdenChildRemoval = Object.freeze({ remove, clearAdultPregnancy });
})();
