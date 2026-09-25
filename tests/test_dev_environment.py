import json
import unittest
from zipfile import ZipFile

from src.consts import DIR_RESULTS_ROOT
from src.server.flask import app
from src.validator import validate_all


class DevelopmentEnvironmentTest(unittest.TestCase):
    def assert_endpoint(self, client, method, path):
        response = client.open(path, method=method)
        try:
            self.assertEqual(200, response.status_code)
        finally:
            response.close()

    def test_environment_and_mod_sources(self):
        errors, _ = validate_all()
        self.assertEqual([], errors)

    def test_runtime_endpoints(self):
        with app.test_client() as client:
            self.assert_endpoint(client, "GET", "/health")
            self.assert_endpoint(client, "HEAD", "/")
            self.assert_endpoint(client, "GET", "/modList.json")
            self.assert_endpoint(client, "HEAD", "/mods/FertilityExpansion.mod.zip")
            self.assert_endpoint(client, "HEAD", "/img/misc/banner.png")

    def test_fertility_expansion_package(self):
        package = DIR_RESULTS_ROOT / "FertilityExpansion.mod.zip"
        with ZipFile(package) as archive:
            self.assertIsNone(archive.testzip())
            boot = json.loads(archive.read("boot.json"))
            self.assertEqual("FertilityExpansion", boot["name"])
            self.assertEqual("0.8.11", boot["version"])
            self.assertIn("game/eden.twee", boot["tweeFileList"])
            self.assertIn("game/eden-age.twee", boot["tweeFileList"])
            self.assertIn("game/eden-facility.twee", boot["tweeFileList"])
            self.assertIn("game/eden-training.twee", boot["tweeFileList"])
            self.assertIn("game/eden-adult.twee", boot["tweeFileList"])
            self.assertIn("game/eden-encounter.twee", boot["tweeFileList"])
            self.assertIn("game/eden-encounter-dialogue.twee", boot["tweeFileList"])
            self.assertIn("game/eden-interactions.twee", boot["tweeFileList"])
            self.assertIn("modules/eden-age.js", boot["scriptFileList"])
            self.assertIn("modules/eden-options.js", boot["scriptFileList"])
            self.assertIn("modules/eden-profile.js", boot["scriptFileList"])
            self.assertIn("modules/eden-traits.js", boot["scriptFileList"])
            self.assertIn("modules/eden-training.js", boot["scriptFileList"])
            self.assertIn("modules/eden-adult.js", boot["scriptFileList"])
            self.assertIn("modules/eden-breeding.js", boot["scriptFileList"])
            self.assertIn("modules/eden-interactions.js", boot["scriptFileList"])
            self.assertIn("modules/eden-location.js", boot["scriptFileList"])
            self.assertIn("modules/css/eden.css", boot["styleFileList"])
            self.assertIn("img/misc/icon/eden.png", boot["imgFileList"])

            eden_icon = archive.read("img/misc/icon/eden.png")
            self.assertTrue(eden_icon.startswith(b"\x89PNG\r\n\x1a\n"))

            css = archive.read("modules/css/eden.css").decode("utf-8")
            self.assertIn("color: var(--link);", css)
            self.assertIn("max-width: 100%;", css)
            self.assertIn("min-width: 0;", css)
            self.assertIn('button[data-eden-options-tab]::before', css)
            self.assertIn('content: "生育拓展";', css)
            self.assertNotIn("max-width: 48rem;", css)
            self.assertNotIn("background: var(--850);", css)

            twee = archive.read("game/eden.twee").decode("utf-8")
            self.assertIn('<<widget "edenSetup">>', twee)
            self.assertIn('<<widget "edenSyncChildren">>', twee)
            self.assertIn(":: Eden Child Journal", twee)
            self.assertIn("$eden.children[$eden.selectedChildId].profile", twee)
            self.assertIn("<<link [[返回|$eden.returnPassage]]>>", twee)
            self.assertNotIn('<<link "返回">>', twee)
            self.assertNotIn('<<widget "edenMenu">>', twee)
            self.assertIn("schemaVersion: 9", twee)
            self.assertIn("maturityDays: 90", twee)
            self.assertIn("neverAutoAdult: false", twee)
            self.assertNotIn("<h2>", twee)

            age_widgets = archive.read("game/eden-age.twee").decode("utf-8")
            self.assertIn('<<widget "edenSettings">>', age_widgets)
            self.assertIn("成年基准天数", age_widgets)
            self.assertIn("不会自动成年", age_widgets)
            self.assertIn('$options.eden.maturityDays', age_widgets)
            self.assertIn('$options.eden.neverAutoAdult', age_widgets)

            age = archive.read("modules/eden-age.js").decode("utf-8")
            for species_key, factor in (
                ("bird", "0.75"),
                ("cat", "0.9"),
                ("fox", "1"),
                ("wolf", "1.1"),
                ("cow", "1.25"),
            ):
                self.assertIn(f'{species_key}: Object.freeze({{ label:', age)
                self.assertIn(f"factor: {factor}", age)
            self.assertIn("rawMaturity * 0.1", age)
            self.assertIn("rawMaturity * 0.3", age)
            self.assertIn("rawMaturity * 0.6", age)
            self.assertIn("function getAgeDays(child)", age)

            traits = archive.read("modules/eden-traits.js").decode("utf-8")
            self.assertIn('Object.freeze({ min: 95, grade: "S" })', traits)
            self.assertIn('Object.freeze({ min: 80, grade: "A" })', traits)
            self.assertIn('Object.freeze({ min: 60, grade: "B" })', traits)
            self.assertIn('Object.freeze({ min: 40, grade: "C" })', traits)
            self.assertIn('Object.freeze({ min: 1, grade: "D" })', traits)
            self.assertIn('individualOffset(childId, "appearance", 3)', traits)
            self.assertIn('individualOffset(childId, "fitness", 3)', traits)
            self.assertIn('individualOffset(childId, "intelligence", 4)', traits)
            self.assertIn('individualOffset(childId, "temperament", 8)', traits)
            self.assertIn('temperament <= 50 ? "quiet" : "active"', traits)
            self.assertIn("if (!isValidInnate(record.innate))", traits)
            self.assertIn("function generateInheritedInnate", traits)
            self.assertIn('stableInteger(`${seedPrefix}|appearance`, -10, 10)', traits)
            self.assertIn('stableInteger(`${seedPrefix}|temperament`, -15, 15)', traits)

            facility = archive.read("game/eden-facility.twee").decode("utf-8")
            for passage in (
                ":: Eden Property",
                ":: Eden Home",
                ":: Eden Expansion",
                ":: Eden Nursery",
                ":: Eden Bailey Negotiation",
            ):
                self.assertIn(passage, facility)
            self.assertIn("35000000", facility)
            self.assertIn("5000000", facility)
            self.assertIn("10000000", facility)
            self.assertIn('$children[$eden.selectedChildId].location to "eden_home"', facility)
            self.assertNotIn('$children[_edenChildId].location to "eden_home"', facility)
            self.assertIn('$storedChildrenToys["eden_home"] to []', facility)
            self.assertNotIn("<h2>", facility)
            self.assertIn("_edenOtherParentPronoun", facility)
            self.assertIn("C.npc.Bailey.pronoun", facility)
            self.assertIn("[[查看通讯录|Eden Contacts]]", facility)
            self.assertIn('$eden.children[$eden.selectedChildId].affection to 40', facility)
            self.assertIn('<<widget "edenLocationIcon">>', facility)
            self.assertIn('src="data:image/png;base64,', facility)
            self.assertEqual(2, facility.count('<<edenLocationIcon>>'))
            self.assertNotIn('<<icon "eden.png">>', facility)

            location = archive.read("modules/eden-location.js").decode("utf-8")
            self.assertIn("const state = sugarCube?.State;", location)
            self.assertIn('state.variables?.location !== "eden_home"', location)
            self.assertIn("[[Next|Eden Nursery]]", location)
            self.assertIn('data-passage="Meadow"', location)

            profile = archive.read("modules/eden-profile.js").decode("utf-8")
            self.assertIn("childListReturn", profile)
            self.assertIn("<<childViewerPageUpdate>>", profile)
            self.assertIn("成长：", profile)
            self.assertIn("天生属性：", profile)
            self.assertIn("体能来源：", profile)
            self.assertIn("养成技能：", profile)
            self.assertIn("安排活动", profile)
            self.assertIn("和孩子谈谈未来", profile)
            self.assertIn("window.EdenAdult?.syncRecord", profile)

            training = archive.read("modules/eden-training.js").decode("utf-8")
            self.assertIn("referenceMaturityDays: 90", training)
            self.assertIn("settlementHour: 8", training)
            self.assertIn("slotsPerDay: 3", training)
            self.assertIn("aptitudeBase: 0.8", training)
            self.assertIn("aptitudeDivisor: 250", training)
            self.assertIn("diminishingDivisor: 200", training)
            self.assertIn('pictureBook: Object.freeze({ label: "看图画书"', training)
            self.assertIn('textbook: Object.freeze({ label: "看教材"', training)
            self.assertIn('novel: Object.freeze({ label: "看小说"', training)
            self.assertIn('history: Object.freeze({ label: "看历史"', training)
            self.assertIn('toys: Object.freeze({ label: "玩玩具"', training)
            self.assertIn('outdoors: Object.freeze({ label: "户外玩耍"', training)
            self.assertIn("baseValue *", training)
            self.assertIn("aptitudeFor(skill, record.innate)", training)
            self.assertIn("personalityMultiplier(skill, record.innate)", training)
            self.assertIn("diminishingMultiplier(before)", training)
            self.assertIn("const dataVersion = 3", training)
            self.assertIn("repeatSchedule: defaultSchedule()", training)
            self.assertIn("training.repeatSchedule = [...normalized]", training)
            self.assertIn("return [...normalized.repeatSchedule]", training)
            self.assertIn('communitySchool: Object.freeze({', training)
            self.assertIn('privateTutor: Object.freeze({', training)
            self.assertIn('socialWork: Object.freeze({', training)
            self.assertIn('talk: Object.freeze({', training)
            self.assertIn('cost: 2000', training)
            self.assertIn('cost: 10000', training)
            self.assertIn('function spendActivityCost', training)
            self.assertIn('failedActivities', training)
            self.assertNotIn('affection: 0.35', training)
            self.assertNotIn('applyCareDay(record', training)

            interactions = archive.read("modules/eden-interactions.js").decode("utf-8")
            self.assertIn('companionship: 0.2', interactions)
            self.assertIn('care: 0.35', interactions)
            self.assertIn('play: 0.45', interactions)
            self.assertIn('comfort: 0.6', interactions)
            self.assertIn('function recordInteraction', interactions)
            self.assertIn('window.EdenTraining?.getTimeScale', interactions)
            self.assertIn('const dataVersion = 2', interactions)
            self.assertIn('refreshHours: 4', interactions)
            self.assertIn('stagePools: Object.freeze({', interactions)
            self.assertIn('function usesStagePool', interactions)
            self.assertIn('function prepareStageActivity', interactions)
            self.assertIn('function completeStageInteraction', interactions)
            self.assertIn('"toddlerCuddle"', interactions)
            self.assertIn('"childHomework"', interactions)
            self.assertIn('"adolescentFuture"', interactions)

            interaction_widgets = archive.read("game/eden-interactions.twee").decode("utf-8")
            self.assertIn('<<widget "edenRecordChildInteraction">>', interaction_widgets)
            self.assertIn('<<widget "edenStageChildActivity">>', interaction_widgets)
            self.assertIn(':: Eden Child Interaction Event', interaction_widgets)
            self.assertIn('<<capture _edenStageChildId _edenStageActivityId _edenActionText _edenActionMinutes>>', interaction_widgets)
            self.assertIn('createStageEvent($eden, _edenStageChildId, _edenStageActivityId, _edenActionMinutes)', interaction_widgets)
            self.assertIn('<<case "toddlerCuddle">>', interaction_widgets)
            self.assertIn('<<case "childHomework">>', interaction_widgets)
            self.assertIn('<<case "adolescentFuture">>', interaction_widgets)

            training_page = archive.read("game/eden-training.twee").decode("utf-8")
            self.assertIn(":: Eden Training", training_page)
            self.assertIn('<<button "保存安排">>', training_page)
            self.assertIn("window.EdenTraining.setPlan", training_page)
            self.assertIn("window.EdenTraining.getActivityOptions(_edenCurrentStage)", training_page)
            self.assertIn("window.EdenTraining.sanitizePlanForStage", training_page)
            self.assertIn("<<optionsfrom _edenActivityOptions>>", training_page)
            self.assertNotIn('<<option "看小说"', training_page)
            self.assertNotIn("<h2>", training_page)

            adult = archive.read("modules/eden-adult.js").decode("utf-8")
            self.assertIn("minimumAwareness: 70", adult)
            self.assertIn("maximumAffection: 40", adult)
            self.assertIn("minimumScore: 65", adult)
            self.assertIn('label: "教师"', adult)
            self.assertIn('label: "工人"', adult)
            self.assertIn('label: "职员"', adult)
            self.assertIn('label: "犯罪者"', adult)
            self.assertIn('label: "卖淫"', adult)
            self.assertIn('label: "勉强求生"', adult)
            self.assertIn('normal: Object.freeze(["teacher", "clerk", "worker"])', adult)
            self.assertIn('risky: Object.freeze(["criminal", "sexWorker"])', adult)
            self.assertIn("awarenessDifficulty: 50", adult)
            self.assertIn("affectionScale: 40", adult)
            self.assertIn("function claimRemittance", adult)
            self.assertIn("function checkIntimacy", adult)
            self.assertIn("function prepareEncounterNpc", adult)
            self.assertIn("function completeEncounter", adult)

            breeding = archive.read("modules/eden-breeding.js").decode("utf-8")
            self.assertIn("function parentDisplayName", breeding)
            self.assertIn("function installPregnancyNameCorrection", breeding)
            self.assertIn("corrected.edenParentNames = true", breeding)

            adult_page = archive.read("game/eden-adult.twee").decode("utf-8")
            for passage in (
                ":: Eden Adult Settlement",
                ":: Eden Adult Release Confirm",
                ":: Eden Adult Result",
                ":: Eden Contacts",
                ":: Eden Contact Detail",
                ":: Eden Child Info",
            ):
                self.assertIn(passage, adult_page)
            self.assertIn("window.EdenAdult.claimRemittance", adult_page)
            self.assertIn("window.EdenAdult.checkIntimacy", adult_page)
            self.assertIn('class="eden-contact-row"', adult_page)
            self.assertIn('@id="_edenResponseId"', adult_page)
            self.assertIn('<<link "聊天">>', adult_page)
            self.assertIn('<<link "查收汇款">>', adult_page)
            self.assertIn('<<link "发出亲密邀请">>', adult_page)
            self.assertIn('<<link "孩子信息" "Eden Child Info">>', adult_page)
            self.assertIn('<<link "编辑简介" "Eden Child Journal">>', adult_page)
            self.assertIn('<span class="gold">简介：</span>', adult_page)
            self.assertIn(":: Eden Adult Birth", adult_page)
            self.assertIn("window.EdenBreeding.pregnancyStatus", adult_page)
            self.assertNotIn('`Util.escapeMarkup(_edenContactChild?.name || "未命名的孩子")` "Eden Contact Detail"', adult_page)
            self.assertNotIn("<h2>", adult_page)

            encounter_page = archive.read("game/eden-encounter.twee").decode("utf-8")
            self.assertIn(":: Eden Adult Encounter Start", encounter_page)
            self.assertIn(":: Eden Adult Encounter Finish", encounter_page)
            self.assertIn("<<consensual true>>", encounter_page)
            self.assertIn("<<set $consensual to 1>>", encounter_page)
            self.assertNotIn("<<set $disableImpregnation to 1>>", encounter_page)
            self.assertIn("window.EdenBreeding.captureEncounterPregnancy", encounter_page)
            self.assertIn("<<maninit>>", encounter_page)
            self.assertIn("<<effectsman>>", encounter_page)
            self.assertIn("<<actionsman>>", encounter_page)
            self.assertIn("<<endcombat>>", encounter_page)
            self.assertNotIn("<<controlloss>>", encounter_page)

            dialogue_page = archive.read("game/eden-encounter-dialogue.twee").decode("utf-8")
            self.assertIn('<<widget "edenAdultCombatSpeech">>', dialogue_page)
            self.assertIn("_edenDialogueRecord.affection gte 80", dialogue_page)
            self.assertIn('species is "bird"', dialogue_page)
            self.assertIn('_edenDialogueChild?.mother is "pc" ? "妈妈" : "爸爸"', dialogue_page)
            self.assertIn('<<= _edenDialogueParentTitle>>', dialogue_page)
            self.assertIn('<<set _edenDialoguePool to [', dialogue_page)
            self.assertIn('_edenDialoguePool.push(', dialogue_page)
            self.assertIn('<<print _edenDialoguePool.random()>>', dialogue_page)
            self.assertLess(dialogue_page.index('$speechaskrough is 1'), dialogue_page.index('random(1, 100) lte '))

            options = archive.read("modules/eden-options.js").decode("utf-8")
            self.assertIn('overlay.dataset.overlay !== "options"', options)
            self.assertIn('new Wikifier(content, "<<edenSettings>>")', options)
            self.assertIn('button.setAttribute("aria-label", "生育拓展")', options)
            self.assertIn("new MutationObserver(ensureOptionsTab)", options)

            replacements = boot["addonPlugin"][0]["params"]
            self.assertEqual({"StoryCaption", "Widgets Orgasm", "Children Activity Events", "Widgets children"}, {replacement["passage"] for replacement in replacements})
            story_caption = next(item for item in replacements if item["passage"] == "StoryCaption")
            self.assertIn("<<edenSetup>>", story_caption["replace"])
            self.assertNotIn("<<edenMenu>>", story_caption["replace"])
            self.assertNotIn("Widgets Settings", json.dumps(replacements))
            self.assertNotIn("overlayReplace", json.dumps(replacements))
            interaction_replacement = next(item for item in replacements if item["passage"] == "Children Activity Events")
            self.assertIn("<<edenRecordChildInteraction", interaction_replacement["replace"])
            stage_pool_replacement = next(item for item in replacements if item["passage"] == "Widgets children")
            self.assertIn("window.EdenInteractions.usesStagePool", stage_pool_replacement["replace"])
            self.assertIn("<<edenStageChildActivity", stage_pool_replacement["replace"])

            breeding = archive.read("modules/eden-breeding.js").decode("utf-8")
            self.assertIn("function captureStoredPregnancy", breeding)
            self.assertIn("function syncPlayerPregnancies", breeding)
            self.assertIn("function progressPregnancy", breeding)
            self.assertIn("function deliver", breeding)
            self.assertIn('destination = eden.facility?.owned && free >= pregnancy.fetus.length ? "eden_home" : "home"', breeding)

            self.assertEqual({"StoryCaption", "Widgets Orgasm", "Children Activity Events", "Widgets children"}, {replacement["passage"] for replacement in replacements})
            orgasm_replacements = [item for item in replacements if item["passage"] == "Widgets Orgasm"]
            self.assertEqual(2, len(orgasm_replacements))
            self.assertTrue(any("edenChildId" in item["replace"] for item in orgasm_replacements))
            self.assertTrue(any('pregnancyGenerator.hawk' in item["replace"] for item in orgasm_replacements))


if __name__ == "__main__":
    unittest.main()
