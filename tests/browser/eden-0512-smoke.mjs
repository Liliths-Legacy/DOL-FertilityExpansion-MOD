// Run against an isolated Chrome profile and the local development server.
// Save paths are explicit inputs. Original files are never written; browser state uses a temporary profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const endpoint = process.env.EDEN_CDP_URL || 'http://127.0.0.1:9227';
const base = process.env.EDEN_GAME_URL || 'http://127.0.0.1:52525/';
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find(t => t.type === 'page' && t.url === base) || targets.find(t => t.type === 'page');
assert.ok(target, 'Start Chrome with an isolated temporary profile and a debugging port.');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once: true}));
let serial = 0;
const pending = new Map();
const exceptions = [];
ws.addEventListener('message', event => {
 const message = JSON.parse(event.data);
 if (message.id) {
  const callback = pending.get(message.id);
  if (callback) { pending.delete(message.id); clearTimeout(callback.timer); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
 } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
 const id = ++serial;
 const timer = setTimeout(() => {pending.delete(id); reject(new Error(`Browser timeout: ${method}`));}, 35000);
 pending.set(id, {resolve, reject, timer}); ws.send(JSON.stringify({id, method, params}));
});
const evaluate = async expression => {
 const response = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, timeout: 30000});
 assert.ok(!response.exceptionDetails, response.exceptionDetails?.exception?.description);
 return response.result.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
 await call('Runtime.enable');
 if (target.url !== base) await call('Page.navigate', {url: base});
 for (let attempt = 0; attempt < 120; attempt++) {
  if (await evaluate('Boolean(window.SugarCube && window.EdenChildData && document.querySelector("#textbox-savename"))')) break;
  await delay(250);
 }
 const initial = JSON.parse(await evaluate(`JSON.stringify({version:StartConfig.version,bridge:EdenBirthBridgeStatus,mods:modUtils.getModListName(),migration:window.migratePregnancyData.toString().includes('runNativeMigration'),patches:[
 ['StoryCaption','<<edenSetup>>'],['Children Activity Events','<<edenRecordChildInteraction'],['Widgets children','EdenInteractions.usesStagePool'],['Widgets Sleep','EdenBedVisit.trySleepInterrupt'],['Bird Tower','EdenChildData.entries({ scope: "born", location: "tower" })'],['Widgets Combat','recordGwylanFairyContact(_args[0], $_type, "hand")'],['Widgets Combat','recordGwylanFairyContact(_args[0], $_type, "kiss")']
 ].map(([name,needle])=>modUtils.getPassageData(name).content.includes(needle))})`));
 assert.equal(initial.version, '0.5.12.13');
 assert.equal(initial.bridge, 'native-records');
 assert.ok(initial.migration && initial.mods.includes('Lyra') && initial.mods.includes('ModI18N') && initial.mods.includes('FertilityExpansion'));
 assert.deepEqual(initial.patches, Array(7).fill(true));
 console.log('PASS: native early hooks and all seven final passage injections coexist with Lyra/i18n');
 await evaluate(`(() => {const verify=document.getElementById('checkbox--verify');if(verify && !verify.checked) verify.click(); Array.from(document.querySelectorAll('button')).find(e=>e.innerText.endsWith('进入游戏'))?.click(); Array.from(document.querySelectorAll('button')).find(e=>e.innerText.endsWith('开始游戏！'))?.click();})()`);
 await delay(150);
 const fresh = JSON.parse(await evaluate(`JSON.stringify({errors:Array.from(document.querySelectorAll('#passages .error')).map(e=>e.innerText),children:SugarCube.State.variables.childRecords?.length,marker:SugarCube.State.variables.eden?.recordsMigration?.source})`));
 assert.deepEqual(fresh.errors, []);
 assert.equal(fresh.children, 0);
 assert.equal(fresh.marker, 'new-save');
 console.log('PASS: fresh game initializes the native record schema and Eden');
 await evaluate(`SugarCube.Save.onLoad.add(save => {window.edenAuditBefore = structuredClone(save.state.history[save.state.index].variables);})`);
 for (const filename of process.argv.slice(2)) {
  const encoded = await fs.readFile(filename, 'utf8');
  const result = JSON.parse(await evaluate(`(() => {
   SugarCube.Save.deserialize(${JSON.stringify(encoded)});
   const v=SugarCube.State.variables, before=window.edenAuditBefore, m=v.eden?.recordsMigration;
   const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   const failures=[];
   for(const [oldId,oldRecord] of Object.entries(before.eden?.children||{})) {
    const id=m?.childMap?.[oldId], current=v.eden?.children?.[id];
    if(!current) {failures.push('missing mapped record');continue;}
    for(const field of ['profile','growthStartSerialDay','affection']) if(!equal(oldRecord[field],current[field])) failures.push(field);
    for(const [field,value] of Object.entries(oldRecord.innate||{})) {
     const expected=field==='inheritedFrom' && Object.hasOwn(m.childMap,value) ? String(m.childMap[value]) : value;
     if(!equal(expected,current.innate?.[field])) failures.push('innate '+field);
    }
    if(!equal(oldRecord.training?.skills,current.training?.skills)) failures.push('training skills');
    for(const field of ['content','inputSnapshot','dueDay','generatedDay','readDay','discoveredDay','status']) {
     if(oldRecord.adult?.lifeStory?.[field]!==undefined && !equal(oldRecord.adult.lifeStory[field],current.adult?.lifeStory?.[field])) failures.push('historical letter '+field);
    }
    if(!equal(oldRecord.adult?.lastRemittanceMonth,current.adult?.lastRemittanceMonth)) failures.push('remittance');
   }
   return JSON.stringify({version:before.saveVersions?.last?.(),beforeHasEden:!!before.eden,status:m?.status,mapped:Object.keys(m?.childMap||{}).length,beforeChildren:Object.keys(before.eden?.children||{}).length,afterChildren:Object.keys(v.eden?.children||{}).length,nativeChildren:v.childRecords?.length,legacyDeleted:v.children===undefined,backupMatches:equal(before.eden,m?.legacyBackup?.eden),failures,errors:Array.from(document.querySelectorAll('#passages .error')).map(e=>e.innerText)});
  })()`));
  assert.equal(result.status, 'complete');
  assert.ok(result.legacyDeleted);
  if (result.beforeHasEden) {
   assert.ok(result.backupMatches);
   assert.ok(result.afterChildren >= result.beforeChildren, 'Old records must survive; native sync may register additional children.');
  } else assert.ok(result.afterChildren > 0);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.errors, []);
  console.log(`PASS: ${filename.split('/').pop()} migration: ${result.beforeHasEden ? `${result.mapped} mapped, ${result.afterChildren} Eden records retained, profiles/traits/training/letters/remittances preserved` : `${result.afterChildren} newly registered from vanilla save`}`);
  const reload = JSON.parse(await evaluate(`(() => {
   const v=SugarCube.State.variables, marker=JSON.stringify(v.eden.recordsMigration), count=v.childRecords.length;
   const encoded=SugarCube.Save.serialize(); SugarCube.Save.deserialize(encoded);
   return JSON.stringify({sameMarker:JSON.stringify(SugarCube.State.variables.eden.recordsMigration)===marker,sameCount:SugarCube.State.variables.childRecords.length===count,errors:Array.from(document.querySelectorAll('#passages .error')).map(e=>e.innerText)});
  })()`));
  assert.ok(reload.sameMarker && reload.sameCount);
  assert.deepEqual(reload.errors, []);
  console.log('PASS: migrated save serialization and reload do not repeat conversion');
 }
 if (process.argv.length > 2) {
  await evaluate(`(() => {const v=SugarCube.State.variables;v.eden.lifeStoryVisitHandled=true;v.eden.selectedChildId=Object.keys(v.eden.children)[0];v.eden.returnPassage='Eden Home';})()`);
  const pages=['Eden Home','Eden Nursery','Eden Contacts','Eden Child Info','Eden Journal Index','Eden Child Journal','Eden Training','Eden Renovation Catalogue','Eden Decoration Catalogue','Eden Safehouse Bedroom','Eden Safehouse Bed','Eden Safehouse Wardrobe','Eden Safehouse Mirror','Eden Safehouse Bathroom','Eden Safehouse Settings','Childrens Home'];
  for(const page of pages) {
   const output=JSON.parse(await evaluate(`(()=>{SugarCube.Engine.play(${JSON.stringify(page)});return JSON.stringify({errors:Array.from(document.querySelectorAll('#passages .error')).map(e=>e.innerText),exists:SugarCube.Story.has(${JSON.stringify(page)}),length:document.querySelector('#passages')?.innerText.length});})()`));
   assert.ok(output.exists && output.length > 0, page);
   assert.deepEqual(output.errors, [], page);
   console.log(`PASS: ${page} renders with translated native widgets`);
  }
 }
 assert.deepEqual(exceptions, []);
 console.log('PASS: no uncaught JavaScript exceptions');
} finally { ws.close(); }
