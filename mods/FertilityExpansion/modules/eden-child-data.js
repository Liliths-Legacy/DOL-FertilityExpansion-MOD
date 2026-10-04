(() => {
	"use strict";

	const monthNames = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
	const hasId = id => (typeof id === "string" && id.trim() !== "") || (typeof id === "number" && Number.isSafeInteger(id) && id >= 0);
	const variables = () => window.SugarCube?.State?.variables || {};
	const usesRecords = (vars = variables()) => Array.isArray(vars.childRecords);
	const isRecord = child => Boolean(child && Object.hasOwn(child, "bornDate"));

	function indexOf(id) {
		if (!hasId(id) || !/^(0|[1-9]\d*)$/.test(String(id))) return null;
		const index = Number(id);
		return Number.isSafeInteger(index) ? index : null;
	}

	// Look up the current State on every call; do not cache records across load/undo.
	function get(id, vars = variables()) {
		if (!hasId(id)) return undefined;
		if (usesRecords(vars)) {
			const index = indexOf(id);
			if (index === null) return undefined;
			const child = vars.childRecords[index];
			return child && typeof child === "object" && child.childId === index ? child : undefined;
		}
		return vars.children && Object.hasOwn(vars.children, id) ? vars.children[id] : undefined;
	}

	function pregnancyOf(child, vars = variables()) {
		if (!isRecord(child)) return null;
		const index = indexOf(child.pregnancyId);
		return index === null ? null : vars.pregnancies?.[index] ?? null;
	}

	function baseSpecies(child) {
		const type = child?.species ?? child?.type;
		if (["wolf", "wolfboy", "wolfgirl"].includes(type)) return "wolf";
		if (["hawk", "harpy"].includes(type)) return "hawk";
		return type || "human";
	}

	function typeOf(child) {
		if (!isRecord(child)) return child?.type || "human";
		const species = baseSpecies(child);
		if (child.features?.monster !== "monster") return species;
		if (species === "hawk") return "harpy";
		if (species === "wolf") return child.gender === "f" ? "wolfgirl" : "wolfboy";
		return species;
	}

	function phaseOf(child, vars = variables()) {
		if (!child) return "missing";
		if (!isRecord(child)) return child.eggTimer !== undefined ? "egg" : "born";
		const pregnancy = pregnancyOf(child, vars);
		if (pregnancy?.carrier === "cleared") return "removed";
		if (Number.isFinite(child.bornDate)) return "born";
		if (baseSpecies(child) === "hawk" && Number.isFinite(pregnancy?.deliveredDate)) return "egg";
		return "unborn";
	}

	function parentsOf(child, vars = variables()) {
		if (!isRecord(child)) return {
			mother: child?.mother ?? null, father: child?.father ?? null,
			motherKnown: Boolean(child?.motherKnown), fatherKnown: Boolean(child?.fatherKnown),
		};
		const pregnancy = pregnancyOf(child, vars);
		return {
			mother: pregnancy?.carrier ?? null, father: pregnancy?.donor ?? null,
			motherKnown: pregnancy?.awareOfCarrier?.includes("pc") === true,
			fatherKnown: pregnancy?.awareOfDonor?.includes("pc") === true,
		};
	}

	function isAdopted(child) {
		return isRecord(child) ? Number.isFinite(child.development?.adoptedDate) : Boolean(child?.adopted);
	}

	function locationOf(child) {
		return isRecord(child) ? child.development?.location ?? null : child?.location ?? null;
	}

	function setLocation(child, location, vars = variables()) {
		if (!child || typeof location !== "string" || !location.trim()) return false;
		if (!["born", "egg"].includes(phaseOf(child, vars))) return false;
		if (isRecord(child)) {
			child.development ??= {};
			child.development.location = location;
		} else child.location = location;
		return true;
	}

	function calendarDate(value) {
		if (!value) return null;
		const year = Number(value.year);
		const month = typeof value.month === "string" ? monthNames.indexOf(value.month) + 1 : Number(value.month);
		const day = Number(value.day ?? value.monthDay);
		if (![year, month, day].every(Number.isInteger) || year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
		const date = new Date(0);
		date.setUTCFullYear(year, month - 1, day);
		date.setUTCHours(0, 0, 0, 0);
		if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
		return { year, month: monthNames[month - 1], day };
	}

	function dateFromTimestamp(timestamp) {
		if (!Number.isFinite(timestamp) || typeof window.DateTime !== "function") return null;
		try {
			return calendarDate(new window.DateTime(timestamp));
		} catch (_) {
			return null;
		}
	}

	function bornOf(child) {
		return isRecord(child) ? dateFromTimestamp(child.bornDate) : calendarDate(child?.born);
	}

	function conceivedOf(child, vars = variables()) {
		return isRecord(child) ? dateFromTimestamp(pregnancyOf(child, vars)?.conceivedDate) : calendarDate(child?.conceived);
	}

	function laidOf(child, vars = variables()) {
		if (!isRecord(child)) return calendarDate(child?.laid);
		return baseSpecies(child) === "hawk" ? dateFromTimestamp(pregnancyOf(child, vars)?.deliveredDate) : null;
	}

	function adoptedOf(child) {
		return isRecord(child) ? dateFromTimestamp(child.development?.adoptedDate) : calendarDate(child?.adopted);
	}

	function developmentOf(child) {
		return (isRecord(child) ? child?.development : child?.localVariables) || {};
	}

	function serialDay(value) {
		const calendar = calendarDate(value);
		if (!calendar) return null;
		const date = new Date(0);
		date.setUTCFullYear(calendar.year, monthNames.indexOf(calendar.month), calendar.day);
		date.setUTCHours(0, 0, 0, 0);
		return Math.floor(date.getTime() / 86400000);
	}

	function currentSerialDay() {
		return serialDay(window.Time);
	}

	function ageDays(child, record, vars = variables()) {
		if (phaseOf(child, vars) !== "born") return 0;
		const current = currentSerialDay();
		const start = Number.isFinite(record?.growthStartSerialDay) ? record.growthStartSerialDay : serialDay(bornOf(child));
		return current === null || start === null ? 0 : Math.max(0, current - start);
	}

	function identicalGroup(child) {
		if (!child) return null;
		if (isRecord(child)) return indexOf(child.identical);
		return child.features?.identical || null;
	}

	function isIdentical(child) {
		return identicalGroup(child) !== null;
	}

	// Default enumeration matches the native world list: born children and laid eggs.
	function entries({ scope = "world", location } = {}, vars = variables()) {
		if (!["world", "born", "egg", "unborn", "all"].includes(scope)) throw new Error(`Unknown child scope: ${scope}`);
		const source = usesRecords(vars) ? vars.childRecords : vars.children || {};
		return Object.keys(source).flatMap(id => {
			const child = get(id, vars);
			if (!child || typeof child !== "object") return [];
			const phase = phaseOf(child, vars);
			const included = scope === "all" ? phase !== "removed" : scope === "world" ? ["born", "egg"].includes(phase) : phase === scope;
			return included && (location === undefined || locationOf(child) === location) ? [[id, child]] : [];
		});
	}

	// This dictionary is temporary. Values are native references, never copied into $children.
	function collection(options, vars = variables()) {
		return Object.fromEntries(entries(options, vars));
	}

	function syncRegistry(eden, vars = variables()) {
		if (!eden || typeof eden !== "object") return;
		eden.children ??= {};
		for (const [id, child] of entries({}, vars)) {
			const parents = parentsOf(child, vars);
			if (parents.mother !== "pc" && parents.father !== "pc" && !isAdopted(child)) continue;
			let record = eden.children[id];
			if (!record || typeof record !== "object" || Array.isArray(record)) record = eden.children[id] = { childId: id };
			if (typeof record.profile !== "string") record.profile = "";
			if (!record.status) record.status = "active";
			record.dataVersion = 6;
		}
	}

	window.EdenChildData = Object.freeze({
		version: 1, hasId, usesRecords, isRecord, get, pregnancyOf, baseSpecies, typeOf,
		phaseOf, parentsOf, isAdopted, locationOf, setLocation, bornOf, conceivedOf, laidOf, adoptedOf, developmentOf,
		serialDay, currentSerialDay, ageDays, identicalGroup, isIdentical, entries, collection, syncRegistry,
	});
})();
