(() => {
	"use strict";

	const dataVersion = 2;
	const hasId = id => id !== null && id !== undefined && id !== "";

	function variables() {
		return window.SugarCube?.State?.variables || {};
	}

	function currentDay() {
		const time = window.Time;
		if (!time) return 0;
		const value = Date.UTC(Number(time.year) || 0, (Number(time.month) || 1) - 1, Number(time.monthDay) || 1);
		return Math.floor(value / 86400000);
	}

	function descriptionFor(childId) {
		return `Eden child ${String(childId)}`;
	}

	function childIdFromDescription(name) {
		if (typeof name !== "string") return null;
		const prefix = "Eden child ";
		return name.startsWith(prefix) ? name.slice(prefix.length) : null;
	}

	function parentDisplayName(name, children) {
		const childId = childIdFromDescription(name);
		if (childId === null) return null;
		const childName = (children ? children[childId] : window.EdenChildData ? window.EdenChildData.get(childId) : variables().children?.[childId])?.name;
		return typeof childName === "string" && childName.trim() ? childName : "未命名的孩子";
	}

	function installPregnancyNameCorrection() {
		const original = window.pregnancyNameCorrection;
		if (typeof original !== "function" || original.edenParentNames === true) return false;
		const corrected = function edenPregnancyNameCorrection(name, caps = false) {
			const displayName = parentDisplayName(name);
			return displayName === null ? original(name, caps) : displayName;
		};
		corrected.edenParentNames = true;
		corrected.edenOriginal = original;
		window.pregnancyNameCorrection = corrected;
		return true;
	}

	function ensureRoot(eden) {
		if (!eden.breeding || typeof eden.breeding !== "object" || Array.isArray(eden.breeding)) {
			eden.breeding = { dataVersion, parentsByDescription: {}, activeBirthParentId: null, lastBirthResult: null };
		}
		eden.breeding.dataVersion = dataVersion;
		if (!eden.breeding.parentsByDescription || typeof eden.breeding.parentsByDescription !== "object") {
			eden.breeding.parentsByDescription = {};
		}
		return eden.breeding;
	}

	function registerParent(eden, childId) {
		const root = ensureRoot(eden);
		root.parentsByDescription[descriptionFor(childId)] = String(childId);
	}

	function pregnancyMultiplier(type, settings) {
		switch (type) {
			case "human":
				return 9 / (Number(settings?.humanPregnancyMonths) || 9);
			case "wolf":
				return 12 / (Number(settings?.wolfPregnancyWeeks) || 12);
			default:
				return 1;
		}
	}

	function normalizePregnancy(pregnancy, childId) {
		if (!pregnancy || !Array.isArray(pregnancy.fetus) || pregnancy.fetus.length === 0) return null;
		pregnancy.edenDataVersion = 1;
		pregnancy.edenParentChildId = String(childId);
		pregnancy.lastProgressDay = Number.isFinite(pregnancy.lastProgressDay) ? pregnancy.lastProgressDay : currentDay();
		pregnancy.givenBirth = Number.isFinite(pregnancy.givenBirth) ? pregnancy.givenBirth : 0;
		pregnancy.totalBirthEvents = Number.isFinite(pregnancy.totalBirthEvents) ? pregnancy.totalBirthEvents : 0;
		pregnancy.fetus.forEach(fetus => {
			fetus.edenGeneticParentId = String(childId);
		});
		return pregnancy;
	}

	function captureStoredPregnancy(eden, record, childId, storedNPCs) {
		if (!record?.adult || !storedNPCs) return false;
		if (Array.isArray(variables().childRecords)) return captureNativeStoredPregnancy(eden, record, childId, storedNPCs);
		const description = descriptionFor(childId);
		const entry = Object.entries(storedNPCs).find(([, stored]) => stored?.npc?.fullDescription === description && stored?.pregnancy?.fetus?.length);
		if (!entry) return false;
		const [key, stored] = entry;
		if (!record.adult.pregnancy?.fetus?.length) {
			record.adult.pregnancy = normalizePregnancy(stored.pregnancy, childId);
		}
		delete storedNPCs[key];
		registerParent(eden, childId);
		return true;
	}

	function prepareEncounterNpc(record, npc) {
		if (!npc) return;
		npc.pregnancy = pregnancyStatus(record) ? 1 : 0;
	}

	function captureEncounterPregnancy(eden, children, record, childId) {
		if (!eden || !record || !hasId(childId)) return false;
		registerParent(eden, childId);
		const vars = variables();
		const captured = captureStoredPregnancy(eden, record, childId, vars.storedNPCs);
		const activeCaptured = Array.isArray(vars.childRecords) && captureNativeActivePregnancy(eden, record, childId, vars);
		syncPlayerPregnancies(eden, vars);
		syncGeneticLinks(eden, children, vars);
		return captured || activeCaptured;
	}

	function syncPlayerPregnancies(eden, vars = variables()) {
		const root = ensureRoot(eden);
		if (Array.isArray(vars.childRecords)) {
			for (const child of vars.childRecords) linkNativeChild(eden, child, vars);
			return;
		}
		for (const genital of ["vagina", "anus"]) {
			const fetus = vars.sexStats?.[genital]?.pregnancy?.fetus;
			if (!Array.isArray(fetus)) continue;
			fetus.forEach(child => {
				const parentId = root.parentsByDescription[child?.father] || root.parentsByDescription[child?.mother];
				if (parentId) child.edenGeneticParentId = String(parentId);
			});
		}
	}

	function syncGeneticLinks(eden, children, vars = variables()) {
		if (!eden?.children || !children) return;
		const root = ensureRoot(eden);
		Object.entries(children).forEach(([childId, child]) => {
			const parentId = Array.isArray(vars.childRecords) ? linkNativeChild(eden, child, vars) : child?.edenGeneticParentId ?? root.parentsByDescription[child?.father] ?? root.parentsByDescription[child?.mother];
			if (hasId(parentId) && eden.children[childId]) eden.children[childId].geneticParentId = String(parentId);
		});
	}

	function progressPregnancy(record, settings, day = currentDay()) {
		const pregnancy = record?.adult?.pregnancy;
		if (Array.isArray(variables().childRecords)) {
			if (!pregnancy || variables().statFreeze) return false;
			const status = nativePregnancyStatus(record);
			pregnancy.due = status?.due === true;
			return pregnancy.due;
		}
		if (!pregnancy?.fetus?.length || variables().statFreeze) return false;
		const lastDay = Number.isFinite(pregnancy.lastProgressDay) ? pregnancy.lastProgressDay : day;
		const elapsed = Math.max(0, day - lastDay);
		if (elapsed > 0) {
			pregnancy.timer = (Number(pregnancy.timer) || 0) + pregnancyMultiplier(pregnancy.type, settings) * elapsed;
			pregnancy.lastProgressDay = day;
		}
		pregnancy.due = (Number(pregnancy.timer) || 0) >= (Number(pregnancy.timerEnd) || Infinity);
		return pregnancy.due;
	}

	function syncAll(eden, children, vars = variables()) {
		if (!eden?.children) return;
		children = children || window.EdenChildData?.collection({ scope: "all" });
		if (!children) return;
		installPregnancyNameCorrection();
		ensureRoot(eden);
		Object.entries(eden.children).forEach(([childId, record]) => {
			if (record?.adult?.settled) registerParent(eden, childId);
			if (Array.isArray(vars.childRecords)) captureNativeActivePregnancy(eden, record, childId, vars);
			captureStoredPregnancy(eden, record, childId, vars.storedNPCs);
			progressPregnancy(record, vars.settings);
		});
		syncPlayerPregnancies(eden, vars);
		syncGeneticLinks(eden, children, vars);
		syncHatching(eden, vars);
	}

	function nextDue(eden) {
		if (!eden?.children || variables().statFreeze) return null;
		return Object.keys(eden.children).find(childId => {
			const pregnancy = eden.children[childId]?.adult?.pregnancy;
			return (Array.isArray(variables().childRecords) ? nativePregnancyStatus(eden.children[childId])?.due : pregnancy?.due) && pregnancy.deliveryBlocked !== true;
		}) || null;
	}

	function pregnancyStatus(record) {
		if (Array.isArray(variables().childRecords)) return nativePregnancyStatus(record);
		const pregnancy = record?.adult?.pregnancy;
		if (!pregnancy?.fetus?.length) return null;
		const timer = Math.max(0, Number(pregnancy.timer) || 0);
		const end = Math.max(1, Number(pregnancy.timerEnd) || 1);
		return {
			count: pregnancy.fetus.length,
			percent: Math.min(100, Math.floor((timer / end) * 100)),
			due: timer >= end,
		};
	}

	function residentCount(children) {
		return Object.values(children || {}).filter(child => (window.EdenChildData?.locationOf(child) ?? child?.location) === "eden_home" && (!window.EdenChildData || ["born", "egg"].includes(window.EdenChildData.phaseOf(child)))).length;
	}

	function birthLocation(type, destination) {
		if (destination === "eden_home") return "eden_home";
		if (type === "wolf") return "wolf_cave";
		if (type === "hawk") return "tower";
		return "hospital";
	}

	function resolveOriginalGiveBirth() {
		if (typeof window.giveBirthToChildren === "function") return window.giveBirthToChildren;
		/* DoL 0.5.11.9 declares this as a global function but, unlike most
		 * pregnancy helpers, does not explicitly export it on window. */
		if (typeof giveBirthToChildren === "function") return giveBirthToChildren;
		return null;
	}

	function retryDelivery(record) {
		const pregnancy = record?.adult?.pregnancy;
		if (Array.isArray(variables().childRecords) ? !nativePregnancyStatus(record)?.due : !pregnancy?.fetus?.length) return false;
		delete pregnancy.deliveryBlocked;
		delete pregnancy.lastDeliveryError;
		pregnancy.due = true;
		return true;
	}

	function deliver(eden, children, parentId, vars = variables()) {
		if (Array.isArray(vars.childRecords)) return deliverNative(eden, parentId, vars);
		const record = eden?.children?.[parentId];
		const parent = children?.[parentId];
		const pregnancy = record?.adult?.pregnancy;
		const previous = eden?.breeding?.lastBirthResult;
		if (!pregnancy && previous?.ok && previous.parentId === String(parentId) && previous.pregnancyId === undefined && record?.adult && previous.childIds?.every(id => children?.[id])) return previous;
		if (!record || !parent || !pregnancy?.fetus?.length || !pregnancy.due) {
			return { ok: false, message: "现在没有可以结算的生产。" };
		}

		const childIds = pregnancy.fetus.map(fetus => String(fetus.childId));
		pregnancy.fetus.forEach(fetus => {
			fetus.edenGeneticParentId = String(parentId);
		});
		const free = Math.max(0, (Number(eden.facility?.capacity) || 0) - residentCount(children));
		const destination = eden.facility?.owned && free >= pregnancy.fetus.length ? "eden_home" : "home";
		const description = descriptionFor(parentId);
		const giveBirth = resolveOriginalGiveBirth();
		let delivered = false;
		let deliveryError = null;
		try {
			delivered = typeof giveBirth === "function" && giveBirth(description, birthLocation(pregnancy.type, destination), destination, pregnancy) === true;
		} catch (error) {
			deliveryError = error;
		}
		if (!delivered || childIds.some(childId => !children[childId])) {
			pregnancy.deliveryBlocked = true;
			pregnancy.lastDeliveryError = String(deliveryError?.message || (giveBirth ? "child creation failed" : "birth function unavailable"));
			return { ok: false, parentId: String(parentId), message: "原版生产流程未能完成。你可以返回通讯录，稍后再次尝试。" };
		}

		childIds.forEach(childId => {
			if (!eden.children[childId]) {
				eden.children[childId] = { childId, profile: "", status: destination === "eden_home" ? "resident" : "active", dataVersion: 6 };
			}
			eden.children[childId].geneticParentId = String(parentId);
		});
		record.adult.pregnancy = null;
		record.adult.birthEvents = (Number(record.adult.birthEvents) || 0) + 1;
		vars.pregnancyStats.npcTotalBirthEvents = (Number(vars.pregnancyStats.npcTotalBirthEvents) || 0) + 1;
		window.EdenTraits?.syncAll?.(eden, children, vars);
		const result = { ok: true, parentId: String(parentId), childIds, count: childIds.length, destination };
		ensureRoot(eden).lastBirthResult = result;
		return result;
	}

	function pregnancyRecord(descriptor, vars = variables()) {
		const id = descriptor?.pregnancyId;
		if (!Number.isSafeInteger(id) || id < 0) return null;
		const pregnancy = vars.pregnancies?.[id];
		return pregnancy?.pregnancyId === id ? pregnancy : null;
	}

	function nativeLitter(pregnancy, vars = variables()) {
		return (vars.childRecords || []).filter(child => child && child.pregnancyId === pregnancy?.pregnancyId && vars.childRecords[child.childId] === child);
	}

	function ownedActivePregnancy(descriptor, vars = variables()) {
		const pregnancy = pregnancyRecord(descriptor, vars);
		return pregnancy && hasId(descriptor.edenParentChildId) && pregnancy.carrier === descriptionFor(descriptor.edenParentChildId) && pregnancy.deliveredDate === null ? pregnancy : null;
	}

	// Match the stable identity and an existing settled, humanoid adult; names are never keys.
	function encounterCarrier(slot, carrier) {
		const vars = variables();
		const npc = vars.NPCList?.[slot];
		if (!hasId(npc?.edenChildId)) return null;
		const childId = String(npc.edenChildId);
		const record = vars.eden?.children?.[childId];
		const child = window.EdenChildData?.get(childId, vars);
		const name = descriptionFor(childId);
		if (!record?.adult?.settled || record.bodyForm === "beast" || !child || window.EdenChildData.phaseOf(child, vars) !== "born" || npc.fullDescription !== name || (carrier !== undefined && carrier !== name)) return null;
		const species = window.EdenChildData.typeOf(child);
		if (!["human", "wolfboy", "wolfgirl", "harpy"].includes(species)) return null;
		return { childId, name, species };
	}

	function encounterSpecies(npc) {
		const slot = variables().NPCList?.indexOf(npc);
		return slot >= 0 ? encounterCarrier(slot)?.species ?? null : null;
	}

	function nativeParentTraits(name) {
		const id = childIdFromDescription(name);
		const vars = variables();
		const child = id === null ? null : window.EdenChildData?.get(id, vars);
		if (!child || !vars.eden?.children?.[id]?.adult?.settled || window.EdenChildData.phaseOf(child, vars) !== "born") return null;
		return { gender: child.gender, hairColour: child.features?.hairColour ?? null, eyeColour: child.features?.eyeColour ?? null, skinColour: child.features?.skinColour ?? null };
	}

	function captureNativePregnancy(eden, childId, pregnancyId, vars = variables()) {
		const record = eden?.children?.[childId];
		const pregnancy = pregnancyRecord({ pregnancyId }, vars);
		if (!hasId(childId) || String(record?.childId) !== String(childId) || !window.EdenChildData?.get(childId, vars) || !record?.adult?.settled || !pregnancy || pregnancy.carrier !== descriptionFor(childId) || pregnancy.deliveredDate !== null || !nativeLitter(pregnancy, vars).length) return false;
		const existing = record.adult.pregnancy;
		if (ownedActivePregnancy(existing, vars) && existing.pregnancyId !== pregnancyId) return false;
		if (!existing || existing.pregnancyId !== pregnancyId) {
			record.adult.pregnancy = { edenDataVersion: 2, pregnancyId, edenParentChildId: String(childId), due: false };
		} else {
			existing.edenDataVersion = 2;
			existing.edenParentChildId = String(childId);
		}
		pregnancy.edenParentChildId = String(childId);
		registerParent(eden, childId);
		for (const child of nativeLitter(pregnancy, vars)) child.edenGeneticParentId = String(childId);
		return true;
	}

	function captureNativeActivePregnancy(eden, record, childId, vars) {
		if (!record?.adult?.settled) return false;
		const active = (vars.pregnancies || []).filter(p => p?.carrier === descriptionFor(childId) && p.deliveredDate === null);
		if (active.length !== 1) {
			const previous = pregnancyRecord(record.adult.pregnancy, vars);
			if (previous?.carrier === "cleared") record.adult.pregnancy = null;
			return false;
		}
		return captureNativePregnancy(eden, childId, active[0].pregnancyId, vars);
	}

	function captureNativeStoredPregnancy(eden, record, childId, storedNPCs) {
		const vars = variables();
		const name = descriptionFor(childId);
		for (const [key, stored] of Object.entries(storedNPCs)) {
			if (stored?.npc?.fullDescription !== name) continue;
			const active = (vars.pregnancies || []).filter(p => p?.carrier === key && p.deliveredDate === null);
			if (active.length !== 1 || !record.adult?.settled) continue;
			const oldCarrier = active[0].carrier;
			active[0].carrier = name;
			if (captureNativePregnancy(eden, childId, active[0].pregnancyId, vars)) {
				delete storedNPCs[key];
				return true;
			}
			active[0].carrier = oldCarrier;
		}
		return false;
	}

	function linkNativeChild(eden, child, vars) {
		if (!child) return null;
		const pregnancy = pregnancyRecord({ pregnancyId: child.pregnancyId }, vars);
		if (!pregnancy || pregnancy.carrier === "cleared") return null;
		const root = ensureRoot(eden);
		// The actual carrier/donor identifies the parent, never the possible-donor list.
		const parentId = root.parentsByDescription[pregnancy.carrier] ?? root.parentsByDescription[pregnancy.donor] ?? child.edenGeneticParentId;
		if (!hasId(parentId) || !eden.children?.[parentId]) return null;
		child.edenGeneticParentId = String(parentId);
		if (eden.children[child.childId]) eden.children[child.childId].geneticParentId = String(parentId);
		return String(parentId);
	}

	function nativePregnancyStatus(record) {
		const vars = variables();
		const descriptor = record?.adult?.pregnancy;
		if (!descriptor || String(descriptor.edenParentChildId) !== String(record.childId)) return null;
		const pregnancy = ownedActivePregnancy(descriptor, vars);
		const litter = pregnancy ? nativeLitter(pregnancy, vars) : [];
		if (!pregnancy || !litter.length || typeof window.getDueDate !== "function" || typeof window.pregnancyProgress !== "function") return null;
		const dueDate = window.getDueDate(pregnancy);
		const progress = window.pregnancyProgress(pregnancy);
		if (!Number.isFinite(dueDate) || !Number.isFinite(progress)) return null;
		return { pregnancyId: pregnancy.pregnancyId, count: litter.length, percent: Math.floor(progress * 100), due: window.Time?.date?.timeStamp >= dueDate, isEgg: litter.every(child => child.species === "hawk") };
	}

	function copyState(vars) {
		return typeof clone === "function" ? clone(vars) : structuredClone(vars);
	}

	// Restore in place so the current passage's child, adult and pregnancy references stay valid.
	function restoreState(target, snapshot) {
		for (const key of Object.keys(target)) if (!Object.hasOwn(snapshot, key)) delete target[key];
		for (const [key, value] of Object.entries(snapshot)) {
			if (value && typeof value === "object" && target[key] && typeof target[key] === "object" && Array.isArray(value) === Array.isArray(target[key])) restoreState(target[key], value);
			else target[key] = value;
		}
		if (Array.isArray(target)) target.length = snapshot.length;
	}

	function deliverNative(eden, parentId, vars) {
		const record = eden?.children?.[parentId];
		const descriptor = record?.adult?.pregnancy;
		const previous = eden?.breeding?.lastBirthResult;
		if (!descriptor && previous?.ok && previous.parentId === String(parentId) && previous.pregnancyId === record?.adult?.lastDeliveredPregnancyId && Number.isSafeInteger(previous.pregnancyId)) return previous;
		const pregnancy = ownedActivePregnancy(descriptor, vars);
		const status = nativePregnancyStatus(record);
		if (!record || !window.EdenChildData?.get(parentId, vars) || !pregnancy || !status?.due || vars.statFreeze) return { ok: false, message: "现在没有可以结算的生产。" };
		const litter = nativeLitter(pregnancy, vars);
		if (litter.some(child => child.bornDate !== null || Object.keys(child.development || {}).length)) return { ok: false, message: "生产记录不完整，请保留存档并检查记录。" };
		const childIds = litter.map(child => String(child.childId));
		const free = Math.max(0, (Number(eden.facility?.capacity) || 0) - window.EdenChildData.entries({ location: "eden_home" }, vars).length);
		const destination = eden.facility?.owned && free >= litter.length ? "eden_home" : "home";
		const snapshot = copyState(vars);
		try {
			if (typeof window.birthRecordedLitter !== "function") throw new Error("birth function unavailable");
			window.birthRecordedLitter(pregnancy.pregnancyId, birthLocation(litter[0].species, destination), destination);
			if (!Number.isFinite(pregnancy.deliveredDate) || pregnancy.deliveredLocation !== destination || litter.some(child => child.development?.location !== destination || (status.isEgg ? child.bornDate !== null : !Number.isFinite(child.bornDate)))) throw new Error("birth record incomplete");
			window.EdenChildData.syncRegistry(eden, vars);
			for (const child of litter) {
				child.edenGeneticParentId = String(parentId);
				eden.children[child.childId] ??= { childId: String(child.childId), profile: "", status: destination === "eden_home" ? "resident" : "active", dataVersion: 6 };
				eden.children[child.childId].geneticParentId = String(parentId);
			}
			record.adult.pregnancy = null;
			record.adult.lastDeliveredPregnancyId = pregnancy.pregnancyId;
			record.adult.birthEvents = (Number(record.adult.birthEvents) || 0) + 1;
			vars.pregnancyStats.npcTotalBirthEvents = (Number(vars.pregnancyStats.npcTotalBirthEvents) || 0) + 1;
			window.EdenTraits?.syncAll?.(eden, window.EdenChildData.collection(), vars);
			const result = { ok: true, parentId: String(parentId), pregnancyId: pregnancy.pregnancyId, childIds, count: litter.length, destination, isEgg: status.isEgg };
			ensureRoot(eden).lastBirthResult = result;
			return result;
		} catch (error) {
			restoreState(vars, snapshot);
			const restored = record.adult.pregnancy;
			restored.deliveryBlocked = true;
			restored.lastDeliveryError = String(error?.message || error);
			return { ok: false, parentId: String(parentId), message: "原版生产流程未能完成，已恢复生产前的数据。你可以稍后再次尝试。" };
		}
	}

	function syncHatching(eden, vars = variables()) {
		if (!Array.isArray(vars.childRecords) || vars.statFreeze || typeof window.getHatchDate !== "function" || typeof window.recordBirth !== "function" || typeof window.generateBabyName !== "function") return 0;
		const ready = vars.childRecords.filter(child => {
			if (!child || window.EdenChildData.phaseOf(child, vars) !== "egg" || !["eden_home", "home"].includes(child.development?.location)) return false;
			const pregnancy = pregnancyRecord({ pregnancyId: child.pregnancyId }, vars);
			return pregnancy && (eden.children?.[child.childId] || hasId(child.edenGeneticParentId)) && window.Time.date.timeStamp >= window.getHatchDate(pregnancy);
		});
		if (!ready.length) return 0;
		const snapshot = copyState(vars);
		try {
			for (const child of ready) {
				if (!child.name) child.name = window.generateBabyName(undefined, child.gender, child.childId);
				window.recordBirth(child.childId);
			}
			return ready.length;
		} catch (error) {
			restoreState(vars, snapshot);
			return 0;
		}
	}

	window.EdenBreeding = Object.freeze({
		dataVersion,
		descriptionFor,
		parentDisplayName,
		installPregnancyNameCorrection,
		ensureRoot,
		encounterCarrier,
		encounterSpecies,
		nativeParentTraits,
		captureNativePregnancy,
		syncHatching,
		prepareEncounterNpc,
		captureEncounterPregnancy,
		syncAll,
		nextDue,
		pregnancyStatus,
		retryDelivery,
		deliver,
	});
})();
