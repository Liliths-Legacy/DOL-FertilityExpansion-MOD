(() => {
	"use strict";

	const dataVersion = 1;
	const gradeRanges = Object.freeze([
		Object.freeze({ min: 95, grade: "S" }),
		Object.freeze({ min: 80, grade: "A" }),
		Object.freeze({ min: 60, grade: "B" }),
		Object.freeze({ min: 40, grade: "C" }),
		Object.freeze({ min: 1, grade: "D" }),
	]);
	const fitnessCategories = Object.freeze({
		weak: Object.freeze({ min: 15, max: 34, label: "瘦弱体格" }),
		light: Object.freeze({ min: 30, max: 49, label: "纤细体格" }),
		average: Object.freeze({ min: 45, max: 64, label: "普通体格" }),
		fit: Object.freeze({ min: 60, max: 79, label: "健壮体格" }),
		strong: Object.freeze({ min: 75, max: 100, label: "强壮体格" }),
	});
	const physiqueDescriptions = Object.freeze({
		weak: Object.freeze(["slight", "petite", "thin", "slender", "slim", "mousy"]),
		light: Object.freeze(["lithe", "lean", "lanky", "lissome", "graceful", "trim", "cute"]),
		fit: Object.freeze(["taut", "fit", "toned", "shapely", "robust", "rugged", "broad", "large", "fierce"]),
		strong: Object.freeze([
			"muscular",
			"bulky",
			"burly",
			"brutish",
			"enormous",
			"huge",
			"mighty",
			"hefty",
			"colossal",
			"humongous",
			"girthy",
			"demon",
		]),
	});

	function clamp(value, min = 1, max = 100) {
		return Math.min(max, Math.max(min, Math.round(Number(value) || min)));
	}

	function hash32(value) {
		let hash = 2166136261;
		for (const character of String(value)) {
			hash ^= character.codePointAt(0);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}

	function stableInteger(key, min, max) {
		return min + (hash32(key) % (max - min + 1));
	}

	function grade(value) {
		const numericValue = clamp(value);
		return gradeRanges.find(range => numericValue >= range.min).grade;
	}

	function dateKey(date) {
		return date ? `${date.year || "?"}-${date.month || "?"}-${date.day || "?"}` : "unknown-date";
	}

	function getGroupKey(childId, child) {
		if (!child?.features?.identical) return `child:${childId}`;
		return ["identical", child.mother, child.father, child.birthId, child.type, dateKey(child.conceived), dateKey(child.born)].join("|");
	}

	function getVariables() {
		return window.SugarCube?.State?.variables || {};
	}

	function isNamedParent(parentName, variables = getVariables()) {
		if (!parentName || parentName === "pc") return false;
		const runtimeNames = Array.isArray(variables.NPCNameList) ? variables.NPCNameList : [];
		const setupNames = window.SugarCube?.setup?.NPCNameList || [];
		return runtimeNames.includes(parentName) || setupNames.includes(parentName) || Boolean(window.C?.npc?.[parentName]);
	}

	function hasNamedParent(child, variables = getVariables()) {
		return isNamedParent(child?.mother, variables) || isNamedParent(child?.father, variables);
	}

	function findFatherRecord(fatherName, variables = getVariables()) {
		const fathers = variables.parentList?.fathers;
		if (!Array.isArray(fathers)) return null;
		return fathers.find(parent => parent?.name === fatherName) || null;
	}

	function categorizeDescription(description) {
		const normalized = String(description || "").toLowerCase();
		for (const category of ["strong", "fit", "light", "weak"]) {
			if (physiqueDescriptions[category].some(word => normalized === word || normalized.startsWith(`${word} `))) return category;
		}
		return "average";
	}

	function getFitnessBasis(child, variables = getVariables()) {
		if (child?.father === "pc") {
			const physique = Number(variables.physique);
			const physiqueSize = Number(variables.physiquesize);
			if (Number.isFinite(physique) && Number.isFinite(physiqueSize) && physiqueSize > 0) {
				return {
					fixed: clamp((physique / physiqueSize) * 100),
					label: "PC体格",
					kind: "pc",
				};
			}
		}

		const father = findFatherRecord(child?.father, variables);
		const description = father?.npc?.description || father?.npc?.fullDescription || father?.name || child?.father;
		const categoryKey = categorizeDescription(description);
		const category = fitnessCategories[categoryKey];
		const named = isNamedParent(child?.father, variables);
		return {
			min: category.min,
			max: category.max,
			label: named && categoryKey === "average" ? "普通体格（命名NPC）" : category.label,
			kind: named ? "namedNpc" : father ? "recordedNpc" : "fallback",
			description: description || null,
		};
	}

	function individualOffset(childId, field, range) {
		return stableInteger(`eden-traits|individual|${childId}|${field}`, -range, range);
	}

	function generateInnate(childId, child, variables = getVariables(), shared = null) {
		const groupKey = getGroupKey(childId, child);
		const seedPrefix = `eden-traits|v${dataVersion}|${groupKey}`;
		const identical = Boolean(child?.features?.identical);
		const namedParent = hasNamedParent(child, variables);
		const appearanceMinimum = namedParent ? 60 : 1;
		const fitnessBasis = getFitnessBasis(child, variables);
		const base = shared?.base || {
			appearance: stableInteger(`${seedPrefix}|appearance`, appearanceMinimum, 100),
			fitness: fitnessBasis.fixed ?? stableInteger(`${seedPrefix}|fitness`, fitnessBasis.min, fitnessBasis.max),
			intelligence: stableInteger(`${seedPrefix}|intelligence`, 1, 100),
			temperament: stableInteger(`${seedPrefix}|temperament`, 1, 100),
		};
		const fitnessSource = shared?.fitnessSource || {
			kind: fitnessBasis.kind,
			label: fitnessBasis.label,
			description: fitnessBasis.description || null,
		};

		const appearance = clamp(base.appearance + (identical ? individualOffset(childId, "appearance", 3) : 0), appearanceMinimum, 100);
		const fitness = clamp(base.fitness + (identical ? individualOffset(childId, "fitness", 3) : 0));
		const intelligence = clamp(base.intelligence + (identical ? individualOffset(childId, "intelligence", 4) : 0));
		const temperament = clamp(base.temperament + (identical ? individualOffset(childId, "temperament", 8) : 0));

		return {
			dataVersion,
			appearance,
			fitness,
			intelligence,
			temperament,
			personality: temperament <= 50 ? "quiet" : "active",
			groupKey,
			identical,
			namedParentAppearanceFloor: namedParent,
			base: { ...base },
			fitnessSource: { ...fitnessSource },
		};
	}

	function generateInheritedInnate(childId, child, parentRecord, variables = getVariables(), shared = null) {
		const groupKey = getGroupKey(childId, child);
		const seedPrefix = `eden-traits|inherit|v${dataVersion}|${groupKey}|${parentRecord?.childId || "unknown"}`;
		const identical = Boolean(child?.features?.identical);
		const parent = parentRecord?.innate;
		if (!isValidInnate(parent)) return generateInnate(childId, child, variables, shared);
		const base = shared?.base || {
			appearance: clamp(parent.appearance + stableInteger(`${seedPrefix}|appearance`, -10, 10)),
			fitness: clamp(parent.fitness + stableInteger(`${seedPrefix}|fitness`, -10, 10)),
			intelligence: clamp(parent.intelligence + stableInteger(`${seedPrefix}|intelligence`, -10, 10)),
			temperament: clamp(parent.temperament + stableInteger(`${seedPrefix}|temperament`, -15, 15)),
		};
		const appearance = clamp(base.appearance + (identical ? individualOffset(childId, "appearance", 3) : 0));
		const fitness = clamp(base.fitness + (identical ? individualOffset(childId, "fitness", 3) : 0));
		const intelligence = clamp(base.intelligence + (identical ? individualOffset(childId, "intelligence", 4) : 0));
		const temperament = clamp(base.temperament + (identical ? individualOffset(childId, "temperament", 8) : 0));
		return {
			dataVersion,
			appearance,
			fitness,
			intelligence,
			temperament,
			personality: temperament <= 50 ? "quiet" : "active",
			groupKey,
			identical,
			namedParentAppearanceFloor: false,
			base: { ...base },
			fitnessSource: { kind: "edenParent", label: "成年孩子遗传", description: null },
			inheritedFrom: String(parentRecord.childId),
		};
	}

	function isValidInnate(innate) {
		return (
			innate?.dataVersion === dataVersion &&
			[innate.appearance, innate.fitness, innate.intelligence, innate.temperament].every(value => Number.isFinite(value)) &&
			[innate.base?.appearance, innate.base?.fitness, innate.base?.intelligence, innate.base?.temperament].every(value => Number.isFinite(value)) &&
			["quiet", "active"].includes(innate.personality)
		);
	}

	function syncRecord(record, child, childId, variables = getVariables(), shared = null) {
		if (!record || !child || !childId) return null;
		if (!isValidInnate(record.innate)) {
			const parentRecord = record.geneticParentId ? variables.eden?.children?.[record.geneticParentId] : null;
			record.innate = parentRecord
				? generateInheritedInnate(childId, child, parentRecord, variables, shared)
				: generateInnate(childId, child, variables, shared);
		}
		return record.innate;
	}

	function syncAll(eden, children, variables = getVariables()) {
		if (!eden?.children || !children) return;
		const sharedGroups = new Map();
		Object.values(eden.children).forEach(record => {
			const innate = record?.innate;
			if (isValidInnate(innate) && innate.identical) {
				sharedGroups.set(innate.groupKey, { base: innate.base, fitnessSource: innate.fitnessSource });
			}
		});
		Object.entries(eden.children).forEach(([childId, record]) => {
			const child = children[childId];
			const groupKey = getGroupKey(childId, child);
			const innate = syncRecord(record, child, childId, variables, sharedGroups.get(groupKey));
			if (innate?.identical && !sharedGroups.has(groupKey)) {
				sharedGroups.set(groupKey, { base: innate.base, fitnessSource: innate.fitnessSource });
			}
		});
	}

	function personalityLabel(personality) {
		return personality === "active" ? "活泼" : "安静";
	}

	window.EdenTraits = Object.freeze({
		dataVersion,
		gradeRanges,
		fitnessCategories,
		grade,
		getGroupKey,
		isNamedParent,
		hasNamedParent,
		categorizeDescription,
		getFitnessBasis,
		generateInnate,
		generateInheritedInnate,
		syncRecord,
		syncAll,
		personalityLabel,
	});
})();
