;(() => {
	"use strict";

	function injectFarmlandEntry() {
		const sugarCube = window.SugarCube;
		const state = sugarCube?.State;
		const variables = state?.variables;
		if (!state || state.passage !== "Farmland") return;
		if (variables?.farm_stage === undefined) return;

		const passage = document.querySelector("#passages .passage");
		if (!passage) return;
		if (!passage.querySelector('a.link-internal[data-passage="Meadow"]')) return;

		let entry = passage.querySelector("[data-eden-farmland-entry]");
		if (!entry) {
			entry = document.createElement("div");
			entry.dataset.edenFarmlandEntry = "true";
			new sugarCube.Wikifier(entry, "<<edenFarmlandLink>>");
			/* The source passage already leaves a blank line above the moor group. */
			entry.append(document.createElement("br"));
		}
		/* Keep Eden with the upper farm options; the moor and town links start the lower group. */
		const moorLink = passage.querySelector('a[data-passage="Moor"]');
		if (moorLink) {
			/* Numberify may wrap all choices in one container, so never climb to a passage-level ancestor. */
			const icon = moorLink.previousElementSibling;
			const anchor = icon?.matches("img, .icon") ? icon : moorLink;
			if (anchor.previousElementSibling !== entry) anchor.before(entry);
		} else {
			passage.append(entry);
		}
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

	function injectFurnitureShopEntry() {
		const sugarCube = window.SugarCube;
		if (sugarCube?.State?.passage !== "Furniture Shop") return;
		const passage = document.querySelector("#passages .passage");
		if (!passage || passage.querySelector("[data-eden-furniture-entry]")) return;
		/* Passage IDs survive translation; only show when normal shopping is available. */
		if (!passage.querySelector('a.link-internal[data-passage="Furniture Shop Catalogue"]')) return;
		const leave = passage.querySelector('a.link-internal[data-passage="Shopping Centre"]');
		if (!leave) return;
		let anchor = leave;
		while (anchor.parentElement && anchor.parentElement !== passage) anchor = anchor.parentElement;
		/* Keep the exit icon beside its link when they are separate siblings. */
		const previous = anchor.previousElementSibling;
		if (previous?.matches("img, .icon")) anchor = previous;
		const entry = document.createElement("div");
		entry.dataset.edenFurnitureEntry = "true";
		new sugarCube.Wikifier(entry, "<<edenFurnitureShopEntry>>");
		anchor.before(entry);
		window.Links?.generate?.();
	}

	window.EdenLocationUi = Object.freeze({ injectFarmlandEntry, fixNurseryActivityReturn, injectFurnitureShopEntry });
	$(document).on(":passagedisplay.edenLocation", () => {
		injectFarmlandEntry();
		fixNurseryActivityReturn();
		injectFurnitureShopEntry();
	});
	/* Reposition an existing entry after other passage-display handlers finish. */
	$(document).on(":passageend.edenLocation", injectFarmlandEntry);
})();
