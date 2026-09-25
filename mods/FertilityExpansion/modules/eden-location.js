(() => {
	"use strict";

	function injectFarmlandEntry() {
		const sugarCube = window.SugarCube;
		const state = sugarCube?.State;
		const variables = state?.variables;
		if (!state || state.passage !== "Farmland") return;
		if (variables?.farm_stage === undefined) return;

		const passage = document.querySelector("#passages .passage");
		if (!passage || passage.querySelector("[data-eden-farmland-entry]")) return;
		if (!passage.querySelector('a.link-internal[data-passage="Meadow"]')) return;

		const entry = document.createElement("div");
		entry.dataset.edenFarmlandEntry = "true";
		new sugarCube.Wikifier(entry, "<<edenFarmlandLink>>");
		passage.append(entry);
		window.Links?.generate?.();
	}

	function fixNurseryActivityReturn() {
		const sugarCube = window.SugarCube;
		const state = sugarCube?.State;
		if (!state || state.passage !== "Children Activity Events") return;
		if (state.variables?.location !== "eden_home") return;

		document.querySelectorAll('#passages a.link-internal[data-passage="Childrens Home"]').forEach(link => {
			const replacement = document.createElement("span");
			new sugarCube.Wikifier(
				replacement,
				'<<link [[Next|Eden Nursery]]>><<unset $childActivityEvent>><<endevent>><</link>>'
			);
			link.replaceWith(...replacement.childNodes);
		});
	}

	window.EdenLocationUi = Object.freeze({ injectFarmlandEntry, fixNurseryActivityReturn });
	$(document).on(":passagedisplay.edenLocation", () => {
		injectFarmlandEntry();
		fixNurseryActivityReturn();
	});
})();
