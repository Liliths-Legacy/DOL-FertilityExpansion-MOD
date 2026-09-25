(() => {
	"use strict";

	const hiddenElementPrefix = "childViewerHidden-";
	let observer;

	function getSugarCube() {
		return window.SugarCube;
	}

	function rememberChildListReturn(variables, state) {
		const listPage = Number(state.temporary?.listPage);
		if (document.getElementById("childViewer") && Number.isInteger(listPage) && listPage > 0) {
			variables.eden.childListReturn = {
				passage: state.passage,
				page: listPage,
			};
		} else {
			delete variables.eden.childListReturn;
		}
	}

	function openProfile(childId) {
		const sugarCube = getSugarCube();
		const state = sugarCube?.State;
		const variables = state?.variables;
		if (!variables?.eden?.children?.[childId]) return;

		variables.eden.selectedChildId = childId;
		variables.eden.returnPassage = state.passage || "Eden Journal Index";
		rememberChildListReturn(variables, state);
		sugarCube.Engine.play("Eden Child Journal");
	}

	function openTraining(childId) {
		const sugarCube = getSugarCube();
		const state = sugarCube?.State;
		const variables = state?.variables;
		const record = variables?.eden?.children?.[childId];
		const child = variables?.children?.[childId];
		if (!window.EdenTraining?.isEligible(record, child)) return;

		variables.eden.selectedChildId = childId;
		variables.eden.returnPassage = state.passage || "Eden Nursery";
		rememberChildListReturn(variables, state);
		sugarCube.Engine.play("Eden Training");
	}

	function openAdultSettlement(childId) {
		const sugarCube = getSugarCube();
		const state = sugarCube?.State;
		const variables = state?.variables;
		const record = variables?.eden?.children?.[childId];
		const child = variables?.children?.[childId];
		if (!window.EdenAdult?.needsSettlement(record, child)) return;

		variables.eden.selectedChildId = childId;
		variables.eden.returnPassage = state.passage || "Eden Nursery";
		rememberChildListReturn(variables, state);
		sugarCube.Engine.play("Eden Adult Settlement");
	}

	function restoreChildListPage() {
		const sugarCube = getSugarCube();
		const state = sugarCube?.State;
		const variables = state?.variables;
		const listReturn = variables?.eden?.childListReturn;
		if (!state || !listReturn || listReturn.passage !== state.passage) return;

		const page = Number(listReturn.page);
		const pageMax = Number(state.temporary?.listPageMax);
		delete variables.eden.childListReturn;
		if (!document.getElementById("childViewer") || !Number.isInteger(page) || page <= 1) return;
		if (!Number.isInteger(pageMax) || pageMax < 1) return;

		state.temporary.listPage = Math.min(page, pageMax);
		new sugarCube.Wikifier(document.createDocumentFragment(), "<<childViewerPageUpdate>>");
	}

	function openBaileyNegotiation(childId) {
		const sugarCube = getSugarCube();
		const variables = sugarCube?.State?.variables;
		const child = variables?.children?.[childId];
		if (!variables?.eden?.facility?.owned || child?.location !== "home") return;

		variables.eden.selectedChildId = childId;
		variables.eden.returnPassage = sugarCube.State.passage || "Childrens Home";
		sugarCube.Engine.play("Eden Bailey Negotiation");
	}

	function buildProfileBlock(childId, record, child, variables) {
		const row = document.createElement("div");
		row.className = "eden-child-profile";
		row.dataset.edenChildProfile = childId;

		const age = document.createElement("div");
		age.className = "eden-child-age";
		const ageLabel = document.createElement("span");
		ageLabel.className = "gold";
		ageLabel.textContent = "成长：";
		const ageText = document.createElement("span");
		ageText.textContent = `${record.speciesLabel || "其他"} · ${record.ageDays || 0}天 · ${record.lifeStageLabel || "婴儿期"}`;
		age.append(ageLabel, ageText);

		const traits = document.createElement("div");
		traits.className = "eden-child-traits";
		const traitsLabel = document.createElement("span");
		traitsLabel.className = "gold";
		traitsLabel.textContent = "天生属性：";
		const innate = record.innate;
		const traitsText = document.createElement("span");
		if (innate && window.EdenTraits) {
			traitsText.textContent = [
				`容貌 ${window.EdenTraits.grade(innate.appearance)}`,
				`体格 ${window.EdenTraits.grade(innate.fitness)}`,
				`智力 ${window.EdenTraits.grade(innate.intelligence)}`,
				`性格 ${window.EdenTraits.personalityLabel(innate.personality)}`,
			].join("｜");
		} else {
			traitsText.className = "grey";
			traitsText.textContent = "尚未生成";
		}
		traits.append(traitsLabel, traitsText);

		const training = document.createElement("div");
		training.className = "eden-child-training";
		const supportsTraining = window.EdenTraining?.eligibleSpecies.includes(record.species);
		const trainingLabel = document.createElement("span");
		trainingLabel.className = "gold";
		trainingLabel.textContent = "养成：";
		const trainingText = document.createElement("span");
		if (record.training?.skills && window.EdenTraits && window.EdenTraining) {
			trainingText.textContent = Object.entries(window.EdenTraining.skillLabels)
				.map(([key, text]) => `${text} ${window.EdenTraits.grade(record.training.skills[key])}`)
				.join("｜");
		} else {
			trainingText.className = "grey";
			trainingText.textContent = "尚未开始";
		}
		training.append(trainingLabel, trainingText);

		const label = document.createElement("span");
		label.className = "gold";
		label.textContent = "简介：";

		const content = document.createElement("span");
		content.className = record.profile ? "eden-child-profile-content" : "eden-child-profile-content grey";
		content.textContent = record.profile || "（尚未填写）";

		const link = document.createElement("button");
		link.type = "button";
		link.className = "link-internal eden-child-profile-button";
		link.textContent = "编辑简介";
		link.addEventListener("click", () => openProfile(childId));

		row.append(age, traits);
		if (supportsTraining) row.append(training);
		if (supportsTraining && Number.isFinite(record.affection)) {
			const affection = document.createElement("div");
			const affectionLabel = document.createElement("span");
			affectionLabel.className = "gold";
			affectionLabel.textContent = "好感：";
			affection.append(affectionLabel, document.createTextNode(String(Math.round(record.affection))));
			row.append(affection);
		}
		row.append(label, content, document.createTextNode(" "), link);

		if (window.EdenTraining?.isEligible(record, child)) {
			const trainingLink = document.createElement("button");
			trainingLink.type = "button";
			trainingLink.className = "link-internal eden-child-profile-button";
			trainingLink.textContent = "安排活动";
			trainingLink.addEventListener("click", () => openTraining(childId));
			row.append(document.createTextNode(" | "), trainingLink);
		}

		if (window.EdenAdult?.needsSettlement(record, child)) {
			const adultLink = document.createElement("button");
			adultLink.type = "button";
			adultLink.className = "link-internal eden-child-profile-button";
			adultLink.textContent = "和孩子谈谈未来";
			adultLink.addEventListener("click", () => openAdultSettlement(childId));
			row.append(document.createTextNode(" | "), adultLink);
		}

		if (variables.eden.facility?.owned && child?.location === "home") {
			const transferLink = document.createElement("button");
			transferLink.type = "button";
			transferLink.className = "link-internal eden-child-profile-button";
			transferLink.textContent = "向贝利要求带走孩子";
			transferLink.addEventListener("click", () => openBaileyNegotiation(childId));
			row.append(document.createTextNode(" | "), transferLink);
		}
		return row;
	}

	function buildTraitDetails(childId, record) {
		const innate = record.innate;
		if (!innate || !window.EdenTraits) return null;
		const block = document.createElement("div");
		block.className = "eden-child-trait-details";
		block.dataset.edenChildTraitDetails = childId;

		const label = document.createElement("span");
		label.className = "gold";
		label.textContent = "天生属性：";
		const values = document.createElement("span");
		values.textContent = [
			`容貌 ${innate.appearance}（${window.EdenTraits.grade(innate.appearance)}）`,
			`体能 ${innate.fitness}（${window.EdenTraits.grade(innate.fitness)}）`,
			`智力 ${innate.intelligence}（${window.EdenTraits.grade(innate.intelligence)}）`,
			`性格 ${window.EdenTraits.personalityLabel(innate.personality)}`,
		].join("｜");
		block.append(label, values);

		if (innate.fitnessSource?.label) {
			const source = document.createElement("div");
			const sourceLabel = document.createElement("span");
			sourceLabel.className = "gold";
			sourceLabel.textContent = "体能来源：";
			source.append(sourceLabel, document.createTextNode(innate.fitnessSource.label));
			block.append(source);
		}
		if (record.training?.skills && window.EdenTraining?.eligibleSpecies.includes(record.species)) {
			const skills = document.createElement("div");
			const skillsLabel = document.createElement("span");
			skillsLabel.className = "gold";
			skillsLabel.textContent = "养成技能：";
			const values = document.createElement("span");
			values.textContent = Object.entries(window.EdenTraining.skillLabels)
				.map(([key, text]) => {
					const value = window.EdenTraining.displayValue(record.training.skills[key]);
					return `${text} ${value}（${window.EdenTraits.grade(value)}）`;
				})
				.join("｜");
			skills.append(skillsLabel, values);
			block.append(skills);
		}
		return block;
	}

	function inject(root = document) {
		const variables = getSugarCube()?.State?.variables;
		if (!variables?.eden?.children) return;

		const selector = `[id^="${hiddenElementPrefix}"]`;
		const elements = [];
		if (root.matches?.(selector)) elements.push(root);
		root.querySelectorAll?.(selector).forEach(element => elements.push(element));

		elements.forEach(element => {
			const childId = element.id.slice(hiddenElementPrefix.length);
			const record = variables.eden.children[childId];
			const child = variables.children?.[childId];
			if (!childId || !record) return;
			window.EdenAge?.syncRecord(record, child, variables.eden.settings);
			window.EdenTraits?.syncRecord(record, child, childId, variables);
			window.EdenTraining?.syncRecord(record, child, variables.eden.settings);
			window.EdenAdult?.syncRecord(record, child);
			const details = element.parentElement;
			if (!details) return;
			if (!details.querySelector(":scope > [data-eden-child-profile]")) {
				details.insertBefore(buildProfileBlock(childId, record, child, variables), element);
			}
			if (!element.querySelector(":scope > [data-eden-child-trait-details]")) {
				const traitDetails = buildTraitDetails(childId, record);
				if (traitDetails) element.append(traitDetails);
			}
		});
	}

	function observeChildViewer() {
		const passages = document.getElementById("passages");
		if (!passages || observer) return;

		observer = new MutationObserver(mutations => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType === Node.ELEMENT_NODE) inject(node);
				}
			}
		});
		observer.observe(passages, { childList: true, subtree: true });
		inject(passages);
	}

	window.EdenProfileUi = Object.freeze({ inject, openProfile, openTraining, openAdultSettlement, restoreChildListPage, openBaileyNegotiation });

	$(document).on(":storyready.edenProfile :passagedisplay.edenProfile", () => {
		observeChildViewer();
		restoreChildListPage();
		inject(document);
	});

	observeChildViewer();
})();
