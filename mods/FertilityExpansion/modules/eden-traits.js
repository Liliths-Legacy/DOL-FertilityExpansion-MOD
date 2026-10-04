(() => {
	"use strict";

	const dataVersion = 3;
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
	const speciesInnateModifiers = Object.freeze({
		human: Object.freeze({ appearance: 0, fitness: 0, intelligence: 0, temperament: 0 }),
		other: Object.freeze({ appearance: 0, fitness: 0, intelligence: 0, temperament: 0 }),
		bird: Object.freeze({ appearance: 4, fitness: -3, intelligence: 2, temperament: 5 }),
		cat: Object.freeze({ appearance: 0, fitness: 1, intelligence: 2, temperament: -5 }),
		fox: Object.freeze({ appearance: 3, fitness: -2, intelligence: 2, temperament: 2 }),
		wolf: Object.freeze({ appearance: 0, fitness: 4, intelligence: -1, temperament: 3 }),
		cow: Object.freeze({ appearance: 0, fitness: 5, intelligence: -2, temperament: -4 }),
	});
	const innateFields = Object.freeze(["appearance", "fitness", "intelligence", "temperament"]);
	const physiqueDescriptions = Object.freeze({
		weak: Object.freeze(["slight", "petite", "thin", "slender", "slim", "mousy"]),
		light: Object.freeze(["lithe", "lean", "lanky", "lissome", "graceful", "trim", "cute"]),
		average: Object.freeze(["wide-eyed", "curvy", "plump", "plush", "voluptuous", "lush"]),
		fit: Object.freeze(["taut", "fit", "toned", "shapely", "robust", "rugged", "broad", "large", "fierce"]),
		strong: Object.freeze([
			"muscular",
			"bulky",
			"burly",
			"brutish",
			"vulgar",
			"chubby",
			"heavyset",
			"minor demon",
			"demon",
			"enormous",
			"huge",
			"mighty",
			"hefty",
			"colossal",
			"humongous",
			"girthy",
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
		if (!isIdentical(child)) return `child:${childId}`;
		if (window.EdenChildData?.isRecord(child)) return `identical:${child.pregnancyId}:${window.EdenChildData.identicalGroup(child)}`;
		return ["identical", child.mother, child.father, child.birthId, child.type, dateKey(child.conceived), dateKey(child.born)].join("|");
	}

	function isIdentical(child) {
		return window.EdenChildData?.isIdentical(child) ?? Boolean(child?.features?.identical);
	}

	function parentsOf(child, variables = getVariables()) {
		return window.EdenChildData?.parentsOf(child, variables) ?? { mother: child?.mother, father: child?.father };
	}

	function inferSpecies(child, storedSpecies) {
		const transformation = child?.features?.beastTransform;
		if (["bird", "cat", "fox", "wolf", "cow"].includes(transformation)) return transformation;
		if (typeof transformation === "string" && transformation.trim()) return "other";
		const type = window.EdenChildData?.typeOf(child) ?? child?.type;
		if (["hawk", "harpy"].includes(type)) return "bird";
		if (["wolf", "wolfboy", "wolfgirl"].includes(type)) return "wolf";
		if (speciesInnateModifiers[storedSpecies]) return storedSpecies;
		return "human";
	}

	function getSpeciesModifiers(speciesKey) {
		return speciesInnateModifiers[speciesKey] || speciesInnateModifiers.human;
	}

	function applySpeciesModifiers(values, modifiers, appearanceMinimum = 1) {
		return {
			appearance: clamp(values.appearance + modifiers.appearance, appearanceMinimum, 100),
			fitness: clamp(values.fitness + modifiers.fitness),
			intelligence: clamp(values.intelligence + modifiers.intelligence),
			temperament: clamp(values.temperament + modifiers.temperament),
		};
	}

	function speciesModifierDelta(childModifiers, parentModifiers) {
		return {
			appearance: childModifiers.appearance - parentModifiers.appearance,
			fitness: childModifiers.fitness - parentModifiers.fitness,
			intelligence: childModifiers.intelligence - parentModifiers.intelligence,
			temperament: childModifiers.temperament - parentModifiers.temperament,
		};
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
		const parents = parentsOf(child, variables);
		return isNamedParent(parents.mother, variables) || isNamedParent(parents.father, variables);
	}

	function getNonPcParent(child, variables = getVariables()) {
		const parents = parentsOf(child, variables);
		for (const [role, side] of [
			["mother", "mothers"],
			["father", "fathers"],
		]) {
			const name = parents[role];
			if (name && String(name).toLowerCase() !== "pc") return { name, role, side };
		}
		return null;
	}

	function findParentRecord(parent, variables = getVariables()) {
		if (!parent) return null;
		const primary = variables.parentList?.[parent.side];
		if (Array.isArray(primary)) {
			const match = primary.find(entry => entry?.name === parent.name);
			if (match) return match;
		}
		for (const side of ["mothers", "fathers"]) {
			const list = variables.parentList?.[side];
			if (!Array.isArray(list)) continue;
			const match = list.find(entry => entry?.name === parent.name);
			if (match) return match;
		}
		const stored = variables.storedNPCs?.[parent.name];
		return stored?.npc ? { name: parent.name, npc: stored.npc } : null;
	}

	function categorizeDescription(description) {
		const normalized = String(description || "").toLowerCase();
		for (const category of ["strong", "fit", "average", "light", "weak"]) {
			if (physiqueDescriptions[category].some(word => normalized === word || normalized.startsWith(`${word} `))) return category;
		}
		return "average";
	}

	function getFitnessBasis(child, variables = getVariables()) {
		const nonPcParent = getNonPcParent(child, variables);
		const parentRecord = findParentRecord(nonPcParent, variables);
		const namedNpc = nonPcParent ? window.C?.npc?.[nonPcParent.name] : null;
		const parentNpc = parentRecord?.npc || namedNpc;
		const description = parentNpc?.description || parentNpc?.fullDescription || parentRecord?.name || nonPcParent?.name;
		const categoryKey = categorizeDescription(description);
		const category = fitnessCategories[categoryKey];
		const named = isNamedParent(nonPcParent?.name, variables);
		const roleLabel = nonPcParent?.role === "mother" ? "非PC母亲" : nonPcParent?.role === "father" ? "非PC父亲" : "非PC父母未知";
		const categoryLabel = named && categoryKey === "average" ? "普通体格（命名NPC）" : category.label;
		return {
			min: category.min,
			max: category.max,
			label: `${roleLabel}·${categoryLabel}`,
			kind: named ? "namedNpc" : parentRecord ? "recordedNpc" : "fallback",
			description: description || null,
			parentName: nonPcParent?.name || null,
			parentRole: nonPcParent?.role || null,
		};
	}

	function individualOffset(childId, field, range) {
		return stableInteger(`eden-traits|individual|${childId}|${field}`, -range, range);
	}

	function generateInnate(childId, child, variables = getVariables(), shared = null) {
		const groupKey = getGroupKey(childId, child);
		const seedPrefix = `eden-traits|v${dataVersion}|${groupKey}`;
		const identical = isIdentical(child);
		const namedParent = hasNamedParent(child, variables);
		const appearanceMinimum = namedParent ? 60 : 1;
		const fitnessBasis = getFitnessBasis(child, variables);
		const speciesKey = inferSpecies(child);
		const speciesModifiers = getSpeciesModifiers(speciesKey);
		const rawBase = {
			appearance: stableInteger(`${seedPrefix}|appearance`, appearanceMinimum, 100),
			fitness: fitnessBasis.fixed ?? stableInteger(`${seedPrefix}|fitness`, fitnessBasis.min, fitnessBasis.max),
			intelligence: stableInteger(`${seedPrefix}|intelligence`, 1, 100),
			temperament: stableInteger(`${seedPrefix}|temperament`, 1, 100),
		};
		const base = shared?.base || applySpeciesModifiers(rawBase, speciesModifiers, appearanceMinimum);
		const fitnessSource = shared?.fitnessSource || {
			kind: fitnessBasis.kind,
			label: fitnessBasis.label,
			description: fitnessBasis.description || null,
			parentName: fitnessBasis.parentName || null,
			parentRole: fitnessBasis.parentRole || null,
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
			speciesAtGeneration: speciesKey,
			speciesModifiersApplied: { ...speciesModifiers },
			base: { ...base },
			fitnessSource: { ...fitnessSource },
		};
	}

	function generateInheritedInnate(childId, child, parentRecord, variables = getVariables(), shared = null) {
		const groupKey = getGroupKey(childId, child);
		const seedPrefix = `eden-traits|inherit|v${dataVersion}|${groupKey}|${parentRecord?.childId ?? "unknown"}`;
		const identical = isIdentical(child);
		const parent = parentRecord?.innate;
		if (!isValidInnate(parent)) return generateInnate(childId, child, variables, shared);
		const speciesKey = inferSpecies(child);
		const speciesModifiers = getSpeciesModifiers(speciesKey);
		const parentSpeciesKey = parent.speciesAtGeneration || parentRecord.species || "human";
		const parentSpeciesModifiers = parent.speciesModifiersApplied || getSpeciesModifiers(parentSpeciesKey);
		const modifierDelta = speciesModifierDelta(speciesModifiers, parentSpeciesModifiers);
		const base = shared?.base || {
			appearance: clamp(parent.appearance + stableInteger(`${seedPrefix}|appearance`, -10, 10) + modifierDelta.appearance),
			fitness: clamp(parent.fitness + stableInteger(`${seedPrefix}|fitness`, -10, 10) + modifierDelta.fitness),
			intelligence: clamp(parent.intelligence + stableInteger(`${seedPrefix}|intelligence`, -10, 10) + modifierDelta.intelligence),
			temperament: clamp(parent.temperament + stableInteger(`${seedPrefix}|temperament`, -15, 15) + modifierDelta.temperament),
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
			speciesAtGeneration: speciesKey,
			speciesModifiersApplied: { ...speciesModifiers },
			base: { ...base },
			fitnessSource: { kind: "edenParent", label: "成年孩子遗传", description: null },
			inheritedFrom: String(parentRecord.childId),
		};
	}

	function hasCompleteInnateValues(innate) {
		return (
			[innate?.appearance, innate?.fitness, innate?.intelligence, innate?.temperament].every(value => Number.isFinite(value)) &&
			[innate?.base?.appearance, innate?.base?.fitness, innate?.base?.intelligence, innate?.base?.temperament].every(value => Number.isFinite(value)) &&
			["quiet", "active"].includes(innate?.personality)
		);
	}

	function migrateInnate(record, child, childId, variables = getVariables(), shared = null) {
		const innate = record?.innate;
		if (!hasCompleteInnateValues(innate)) return;
		if (innate.dataVersion === 1) {
			/* Backcross descendants already inherit fitness from the non-PC Eden parent. */
			if (!innate.inheritedFrom) {
				const groupKey = getGroupKey(childId, child);
				const identical = isIdentical(child);
				const fitnessBasis = getFitnessBasis(child, variables);
				const seedPrefix = `eden-traits|v2|${groupKey}`;
				const baseFitness = shared?.base?.fitness ?? stableInteger(`${seedPrefix}|fitness`, fitnessBasis.min, fitnessBasis.max);
				innate.groupKey = groupKey;
				innate.identical = identical;
				innate.base = { ...innate.base, fitness: baseFitness };
				innate.fitness = clamp(baseFitness + (identical ? individualOffset(childId, "fitness", 3) : 0));
				innate.fitnessSource = {
					kind: fitnessBasis.kind,
					label: fitnessBasis.label,
					description: fitnessBasis.description || null,
					parentName: fitnessBasis.parentName || null,
					parentRole: fitnessBasis.parentRole || null,
				};
			}
			innate.dataVersion = 2;
		}
		if (innate.dataVersion !== 2) return;
		const speciesKey = inferSpecies(child, record.species);
		const speciesModifiers = getSpeciesModifiers(speciesKey);
		innate.base = applySpeciesModifiers(innate.base, speciesModifiers, innate.namedParentAppearanceFloor ? 60 : 1);
		const adjusted = applySpeciesModifiers(innate, speciesModifiers, innate.namedParentAppearanceFloor ? 60 : 1);
		for (const field of innateFields) innate[field] = adjusted[field];
		innate.personality = innate.temperament <= 50 ? "quiet" : "active";
		innate.speciesAtGeneration = speciesKey;
		innate.speciesModifiersApplied = { ...speciesModifiers };
		innate.dataVersion = dataVersion;
	}

	function isValidInnate(innate) {
		return innate?.dataVersion === dataVersion && hasCompleteInnateValues(innate);
	}

	function syncRecord(record, child, childId, variables = getVariables(), shared = null) {
		if (!record || !child || childId === null || childId === undefined || childId === "") return null;
		migrateInnate(record, child, childId, variables, shared);
		if (!isValidInnate(record.innate)) {
			const parentRecord = record.geneticParentId !== null && record.geneticParentId !== undefined ? variables.eden?.children?.[record.geneticParentId] : null;
			record.innate = parentRecord
				? generateInheritedInnate(childId, child, parentRecord, variables, shared)
				: generateInnate(childId, child, variables, shared);
		}
		return record.innate;
	}

	function syncAll(eden, children, variables = getVariables()) {
		if (!eden?.children || !children) return;
		Object.entries(eden.children).forEach(([childId, record]) => {
			migrateInnate(record, children[childId], childId, variables);
		});
		const sharedGroups = new Map();
		Object.entries(eden.children).forEach(([childId, record]) => {
			const innate = record?.innate;
			if (isValidInnate(innate) && innate.identical) {
				const groupKey = children[childId] ? getGroupKey(childId, children[childId]) : innate.groupKey;
				sharedGroups.set(groupKey, { base: innate.base, fitnessSource: innate.fitnessSource });
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
		speciesInnateModifiers,
		grade,
		getGroupKey,
		inferSpecies,
		getSpeciesModifiers,
		isNamedParent,
		hasNamedParent,
		getNonPcParent,
		findParentRecord,
		categorizeDescription,
		getFitnessBasis,
		generateInnate,
		generateInheritedInnate,
		migrateInnate,
		syncRecord,
		syncAll,
		personalityLabel,
	});
})();
