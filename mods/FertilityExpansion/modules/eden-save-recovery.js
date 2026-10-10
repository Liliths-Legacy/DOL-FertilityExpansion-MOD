;(() => {
	"use strict";

	const compositeId = /^m(\d+)b(\d+)d(\d+)f(\d+)$/;
	const featureKeys = ["monster", "size", "hairColour", "eyeColour", "skinColour", "beastTransform", "divineTransform"];

	function requireCondition(condition, message) {
		if (!condition) throw new Error(message);
	}

	function parseId(id) {
		const match = String(id).match(compositeId);
		requireCondition(match, "旧孩子编号缺少父母及计数信息。");
		const values = match.slice(1).map(Number);
		requireCondition(values.every(Number.isSafeInteger), "旧孩子编号中的计数无效。");
		return { mother: values[0], maternal: values[1], father: values[2], paternal: values[3] };
	}

	/* Read-only inference. No registry, pregnancy, or native record is changed here. */
	function infer(vars) {
		requireCondition(vars.objectVersion?.pregnancyRecords >= 1 && Array.isArray(vars.pregnancies), "原版孩子转换尚未完成。");
		const parents = {};
		for (const side of ["mothers", "fathers"]) {
			const list = vars.parentList?.[side];
			requireCondition(Array.isArray(list), "存档缺少旧父母表，无法确认原有编号。");
			const byId = new Map(), byName = new Map();
			for (const parent of list) {
				requireCondition(parent && Number.isSafeInteger(parent.id) && parent.id >= 0 &&
					Number.isSafeInteger(parent.kids) && parent.kids >= 0 && typeof parent.name === "string", "旧父母表的编号或计数无效。");
				requireCondition(!byId.has(parent.id) && !byName.has(parent.name), "旧父母表存在重名或重复编号，无法唯一确认身份。");
				const entry = { ...parent, reserved: new Set(), anchored: new Set(), children: [] };
				byId.set(parent.id, entry);
				byName.set(parent.name, entry);
			}
			parents[side] = { byId, byName };
		}
		const oldName = name => {
			const description = vars.storedNPCs?.[name]?.npc?.fullDescription;
			return typeof description === "string" && description.startsWith("Eden child ") ? description : name;
		};
		const childMap = Object.create(null), legacyByNewId = Object.create(null), anchors = new Map();
		const groups = new Map();
		for (let index = 0; index < vars.childRecords.length; index++) {
			const child = vars.childRecords[index];
			const pregnancy = vars.pregnancies[child?.pregnancyId];
			requireCondition(child?.childId === index && pregnancy?.pregnancyId === child.pregnancyId &&
				Number.isFinite(pregnancy.conceivedDate), "新版孩子或孕期记录不完整。");
			if (!groups.has(child.pregnancyId)) groups.set(child.pregnancyId, []);
			groups.get(child.pregnancyId).push(child);
		}

		/* A mod pregnancy may still have its old fetuses, even after the native stored-NPC
		 * copy was converted. Anchor that copy by identity and exact phenotype, or reserve
		 * its old counters if no native copy exists. Never create a second litter here. */
		const fetusIds = new Set();
		for (const [parentId, record] of Object.entries(vars.eden.children || {})) {
			const legacy = record?.adult?.pregnancy;
			if (!legacy?.fetus?.length) continue;
			const fetuses = legacy.fetus;
			const carrier = `Eden child ${parentId}`;
			const candidates = vars.pregnancies.filter(pregnancy => pregnancy.deliveredDate === null && oldName(pregnancy.carrier) === carrier &&
				oldName(pregnancy.donor) === fetuses[0].father);
			requireCondition(candidates.length <= 1, "成年角色存在多份可能对应的孕期。");
			const pregnancy = candidates[0];
			const children = pregnancy ? groups.get(pregnancy.pregnancyId) || [] : [];
			if (pregnancy) requireCondition(pregnancy.deliveredDate === null && children.length === fetuses.length,
				"原版中的成年孕期已经生产或胎数发生变化。");
			for (let index = 0; index < fetuses.length; index++) {
				const fetus = fetuses[index], id = String(fetus.childId), parsed = parseId(id);
				requireCondition(!fetusIds.has(id), "旧孕期存在重复胎儿编号。");
				fetusIds.add(id);
				const mother = parents.mothers.byId.get(parsed.mother), father = parents.fathers.byId.get(parsed.father);
				requireCondition(mother?.name === fetus.mother && father?.name === fetus.father && fetus.mother === carrier &&
					parsed.maternal < mother.kids && parsed.paternal < father.kids, "旧胎儿的父母身份或计数不一致。");
				requireCondition(!mother.reserved.has(parsed.maternal) && !mother.anchored.has(parsed.maternal) &&
					!father.reserved.has(parsed.paternal) && !father.anchored.has(parsed.paternal), "旧胎儿的父母子女计数重复。");
				if (pregnancy) {
					const child = children[index];
					requireCondition(child.bornDate === null && child.species === fetus.type && child.gender === fetus.gender &&
						featureKeys.every(key => child.features?.[key] === fetus.features?.[key]), "原版中的胎儿特征与旧孕期不一致。");
					anchors.set(child.childId, { id, parsed });
					childMap[id] = child.childId;
					legacyByNewId[child.childId] = fetus;
					mother.anchored.add(parsed.maternal);
					father.anchored.add(parsed.paternal);
				} else {
					mother.reserved.add(parsed.maternal);
					father.reserved.add(parsed.paternal);
				}
			}
		}

		const special = [];
		for (const child of vars.childRecords) {
			const pregnancy = vars.pregnancies[child.pregnancyId];
			const mother = parents.mothers.byName.get(oldName(pregnancy.carrier));
			const father = parents.fathers.byName.get(oldName(pregnancy.donor));
			if (!mother || !father) {
				requireCondition(pregnancy.carrier === "unknown hawk" && pregnancy.donor === "unknown hawk" && child.species === "hawk",
					"新版记录中存在旧父母表无法识别的孩子。");
				special.push(child);
				continue;
			}
			requireCondition(pregnancy.deliveredDate !== null || anchors.has(child.childId),
				"原版在途胎儿缺少旧编号，暂时无法确认全部子女计数。");
			mother.children.push(child);
			father.children.push(child);
			const anchor = anchors.get(child.childId);
			if (anchor) requireCondition(anchor.parsed.mother === mother.id && anchor.parsed.father === father.id,
				"已转换胎儿的父母与旧记录不一致。");
		}
		requireCondition(special.length <= 1, "存在多个无法区分的获救鹰崽。");
		if (special.length) childMap.orphanHawk1 = special[0].childId;

		const ranks = { mothers: new Map(), fathers: new Map() };
		for (const side of ["mothers", "fathers"]) {
			for (const parent of parents[side].byId.values()) {
				requireCondition(parent.children.length + parent.reserved.size === parent.kids &&
					parent.anchored.size === parent.children.filter(child => anchors.has(child.childId)).length &&
					![...parent.reserved].some(counter => parent.anchored.has(counter)),
					"旧子女计数与现存资料不一致，可能有缺失记录或升级后新增孩子。");
				const available = [];
				for (let counter = 0; counter < parent.kids; counter++) {
					if (!parent.reserved.has(counter) && !parent.anchored.has(counter)) available.push(counter);
				}
				const children = parent.children.filter(child => !anchors.has(child.childId)).sort((a, b) =>
					vars.pregnancies[a.pregnancyId].conceivedDate - vars.pregnancies[b.pregnancyId].conceivedDate || a.childId - b.childId);
				for (let index = 0; index < children.length; index++) {
					const child = children[index], previous = children[index - 1];
					requireCondition(!previous || previous.pregnancyId === child.pregnancyId ||
						vars.pregnancies[previous.pregnancyId].conceivedDate !== vars.pregnancies[child.pregnancyId].conceivedDate,
						"同一天存在多胎独立孕期，无法确认旧编号先后顺序。");
					ranks[side].set(child.childId, { id: parent.id, counter: available[index] });
				}
			}
		}
		for (const child of vars.childRecords) {
			if (anchors.has(child.childId) || special.includes(child)) continue;
			const mother = ranks.mothers.get(child.childId), father = ranks.fathers.get(child.childId);
			const oldId = `m${mother.id}b${mother.counter}d${father.id}f${father.counter}`;
			requireCondition(!Object.hasOwn(childMap, oldId), "重建后的旧孩子编号发生冲突。");
			const pregnancy = vars.pregnancies[child.pregnancyId];
			const relatedToEden = [oldName(pregnancy.carrier), oldName(pregnancy.donor)]
				.some(name => name === "pc" || String(name).startsWith("Eden child "));
			// Current counts alone cannot distinguish a lost legacy child from a new child
			// that fills its missing counter. Require the old registry to witness these IDs.
			requireCondition(!relatedToEden || Object.hasOwn(vars.eden.children || {}, oldId),
				"现存孩子缺少对应的伊甸园旧登记，无法排除缺失记录或升级后新增孩子。");
			childMap[oldId] = child.childId;
			legacyByNewId[child.childId] = {
				mother: oldName(pregnancy.carrier), father: oldName(pregnancy.donor),
				edenGeneticParentId: vars.eden.children?.[oldId]?.geneticParentId,
			};
		}

		/* Old identical-group dates provide an independent check on the reconstructed
		 * counters. Treat contradiction as failure; historical names and ages aren't IDs. */
		const lastSibling = new Map();
		for (const [oldId, record] of Object.entries(vars.eden.children || {})) {
			requireCondition(Object.hasOwn(childMap, oldId), "无法关联全部伊甸园旧孩子记录。");
			const child = vars.childRecords[childMap[oldId]], pregnancy = vars.pregnancies[child.pregnancyId];
			const previous = lastSibling.get(child.pregnancyId);
			requireCondition(previous === undefined || previous < child.childId, "同胎孩子的旧登记顺序与重建编号不一致。");
			lastSibling.set(child.pregnancyId, child.childId);
			const key = record?.innate?.groupKey;
			if (typeof key !== "string" || !key.startsWith("identical|")) continue;
			const parts = key.split("|");
			const timestamp = text => {
				const date = text.match(/^(\d+)-([A-Za-z]+)-(\d+)$/);
				requireCondition(date && typeof window.oldDateToTimestamp === "function", "同卵记录的历史日期无法解析。");
				return window.oldDateToTimestamp({ year: Number(date[1]), month: date[2], day: Number(date[3]) });
			};
			requireCondition(parts.length === 7 && oldName(pregnancy.carrier) === parts[1] && oldName(pregnancy.donor) === parts[2] &&
				child.species === parts[4] && child.identical !== null && child.identical !== undefined &&
				pregnancy.conceivedDate === timestamp(parts[5]) && child.bornDate === timestamp(parts[6]),
				"重建编号与同卵分组的父母或日期不一致。");
		}
		return { childMap, legacyByNewId, evidence: { method: "parent-census", nativeChildren: vars.childRecords.length,
			edenChildren: Object.keys(vars.eden.children || {}).length, anchoredFetuses: anchors.size, reservedFetuses: fetusIds.size - anchors.size } };
	}

	window.EdenSaveRecovery = Object.freeze({ infer });
})();
