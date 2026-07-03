#!/usr/bin/env node
/*
 * sutra-intelligence-harness-check.mjs
 *
 * Deterministic, no-browser tests for the Sutra Intelligence Harness:
 *   - Product Knowledge Registry (offline answers, real features only)
 *   - Assistant Memory (consent-first store, sensitivity guard, retrieval, undo,
 *     export/import round-trip, secret exclusion)
 *   - Local Help decision tree (validity, content, triggers, provider gating)
 *   - Capability Registry (parity with the action catalog, scopes, flags)
 *   - flow-assistant + app.js integration (static source assertions: memory
 *     actions wired, intent router present, silent handling, export coverage)
 *
 * Modules are loaded as CommonJS (the same dual-mode pattern as
 * flow-intelligence.js). Run: node scripts/sutra-intelligence-harness-check.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

let failures = 0;
let passed = 0;
function ok(cond, msg, detail) {
    if (cond) { passed += 1; }
    else { failures += 1; console.error('  FAIL ' + msg + (detail != null ? '  →  ' + detail : '')); }
}
function section(name) { console.log('\n' + name); }
function read(rel) { return readFileSync(resolve(repoRoot, rel), 'utf8'); }

const PK = require('../src/features/assistant/sutra-product-knowledge.js');
const MEM = require('../src/features/assistant/sutra-assistant-memory.js');
const LH = require('../src/features/assistant/sutra-local-help.js');
const CAP = require('../src/features/assistant/sutra-capability-registry.js');

// ============================================================
section('Product Knowledge Registry');
// ============================================================
{
    const v = PK.validateRegistry();
    ok(v.ok, 'registry validates (ids, availability, nav targets, related)', JSON.stringify(v.problems));

    // Every required question resolves to the right entry.
    const expects = [
        ['what is sutra', 'what-is-sutra'],
        ['what can sutra do', 'feature-tour'],
        ['how do i make flashcards', 'review-flashcards'],
        ['how do i back up my workspace', 'encrypted-backup'],
        ['where do i change my model', 'change-model'],
        ['does sutra send my data to a server', 'privacy-local-first'],
        ['what is the difference between homework and course hub', 'homework-vs-coursehub'],
        ['how does assistant memory work', 'assistant-memory']
    ];
    expects.forEach(([q, id]) => {
        const a = PK.answer(q);
        ok(a && a.entry.id === id, `answers "${q}" → ${id}`, a ? a.entry.id : '(no match)');
    });

    // Availability values are from the allowed set; offline answers carry no nav to unknown views.
    PK.list().forEach(e => {
        ok(PK.AVAILABILITY.includes(e.availability), `entry ${e.id} has valid availability`, e.availability);
        if (e.nav && e.nav.view) ok(PK.KNOWN_VIEWS.includes(e.nav.view), `entry ${e.id} nav.view is a known view`, e.nav.view);
    });

    // formatEntry returns non-empty, no raw HTML angle brackets.
    const fmt = PK.formatEntry('encrypted-backup');
    ok(fmt.length > 0 && !/<script/i.test(fmt), 'formatEntry renders text content');

    // Unrelated chatter does NOT match (router would fall through to provider).
    ok(PK.answer('write me a haiku about the ocean', { minScore: 5 }) === null, 'non-product chatter does not match product knowledge');
}

// ============================================================
section('Assistant Memory — store, sensitivity, retrieval, undo');
// ============================================================
{
    // Faithful localStorage-like stub (stringifies like SutraSafeStorage).
    function makeStub() {
        const ls = {};
        return {
            ls,
            get: (k, fb) => (k in ls ? JSON.parse(ls[k]) : fb),
            set: (k, v) => { ls[k] = JSON.stringify(v); return { ok: true }; },
            remove: (k) => { delete ls[k]; return { ok: true }; }
        };
    }
    const stub = makeStub();
    MEM.__setStorageForTests(stub);

    // Sensitivity classifier — blocks secrets, allows ordinary facts.
    ['my password is hunter2', 'API key sk-abcdefgh12345', 'my SSN is 123-45-6789',
     'card number 4111 1111 1111 1111', 'I was diagnosed with depression', 'home at 42.3601, -71.0589']
        .forEach(t => ok(MEM.classifySensitivity(t) === 'blocked', 'blocks sensitive: ' + t.slice(0, 28), MEM.classifySensitivity(t)));
    ['I study best in the morning', 'My goal is a 4.0 GPA', 'I have soccer practice on Tuesdays']
        .forEach(t => ok(MEM.classifySensitivity(t) === 'normal', 'allows normal: ' + t.slice(0, 28), MEM.classifySensitivity(t)));

    // Explicit create blocked-content is refused.
    const blocked = MEM.create({ content: 'my password is hunter2' });
    ok(blocked.ok === false && blocked.blocked === true, 'create refuses blocked content');
    ok(MEM.getAll().length === 0, 'refused content never reaches the store');

    // Explicit create works; categories valid.
    const c1 = MEM.create({ category: 'study_preferences', content: 'I study best early in the morning' });
    const c2 = MEM.create({ category: 'academic_goals', content: 'My goal is a 4.0 GPA this semester' });
    const c3 = MEM.create({ category: 'recurring_commitments', content: 'Soccer practice every Tuesday and Thursday at 4pm' });
    ok(c1.ok && c2.ok && c3.ok, 'explicit memories created');
    ok(MEM.CATEGORIES.length === 10, 'ten memory categories defined', MEM.CATEGORIES.length);
    ok(c1.record.source === 'user_explicit', 'default source is user_explicit');

    // Retrieval: relevant enabled records, ranked.
    const hits = MEM.retrieve('when should I study tomorrow morning', { feature: 'timeline' });
    ok(hits.length > 0 && hits[0].record.id === c1.record.id, 'retrieval ranks the study-time memory first', hits[0] && hits[0].record.category);
    ok(hits[0].reasons && hits[0].reasons.length > 0, 'retrieval explains why a record was used');

    // Disabled records are excluded.
    MEM.disable(c1.record.id);
    ok(!MEM.retrieve('when should I study').some(h => h.record.id === c1.record.id), 'disabled memory excluded from retrieval');
    MEM.enable(c1.record.id);
    ok(MEM.retrieve('when should I study').some(h => h.record.id === c1.record.id), 'enabled memory returns to retrieval');

    // Expired records are excluded.
    const exp = MEM.create({ category: 'temporary_context', content: 'temp note', expiresAt: '2000-01-01' });
    ok(!MEM.retrieve('temp note').some(h => h.record.id === exp.record.id), 'expired memory excluded from retrieval');
    MEM.remove(exp.record.id);

    // describeAll reflects manageable enabled records.
    const desc = MEM.describeAll();
    ok(/4\.0 GPA/.test(desc) && /Soccer practice/.test(desc), '"what do you remember" reflects saved memories');

    // Undo: create, delete, update, disable.
    const u1 = MEM.create({ category: 'user_notes', content: 'temporary fact to undo' });
    ok(MEM.applyUndo(u1.undo) === 1 && !MEM.get(u1.record.id), 'undo of create removes the memory');
    const before = MEM.getAll().length;
    const del = MEM.remove(c3.record.id);
    ok(!MEM.get(c3.record.id), 'delete removes the memory');
    MEM.applyUndo(del.undo);
    ok(!!MEM.get(c3.record.id), 'undo of delete restores the memory');
    ok(MEM.getAll().length === before, 'store size restored after delete+undo');
    const upd = MEM.update(c2.record.id, { content: 'My goal is a 3.8 GPA' });
    ok(MEM.get(c2.record.id).content === 'My goal is a 3.8 GPA', 'update changes content');
    MEM.applyUndo(upd.undo);
    ok(/4\.0 GPA/.test(MEM.get(c2.record.id).content), 'undo of update restores prior content');

    // Batch delete + clear temporary.
    const t1 = MEM.create({ category: 'temporary_context', content: 'temp A' });
    const t2 = MEM.create({ category: 'temporary_context', content: 'temp B' });
    const cleared = MEM.clearTemporary();
    ok(cleared.ok && cleared.count >= 2, 'clearTemporary removes temporary memories', cleared.count);
    MEM.applyUndo(cleared.undo);
    ok(MEM.get(t1.record.id) && MEM.get(t2.record.id), 'undo of clearTemporary restores them');

    const batch = MEM.removeMany([t1.record.id, t2.record.id]);
    ok(batch.ok && batch.count === 2, 'removeMany forgets multiple memories');

    // Per-detail editing: add / remove individual lines, with undo + guards.
    const multi = MEM.create({ category: 'study_preferences', content: 'I study best in the morning' });
    const add1 = MEM.appendDetail(multi.record.id, 'I prefer 2-hour blocks');
    ok(add1.ok && MEM.memoryLines(multi.record.id).length === 2, 'appendDetail adds a line');
    ok(MEM.appendDetail(multi.record.id, 'i prefer 2-hour blocks').undo === null, 'appendDetail dedupes (no-op on duplicate)');
    ok(MEM.appendDetail(multi.record.id, 'my password is abc123').blocked === true, 'appendDetail blocks sensitive additions');
    const rmDetail = MEM.removeDetail(multi.record.id, 1);
    ok(rmDetail.ok && MEM.memoryLines(multi.record.id).length === 1, 'removeDetail removes a line');
    MEM.applyUndo(rmDetail.undo);
    ok(MEM.memoryLines(multi.record.id).length === 2, 'undo of removeDetail restores the line');
    const lines = MEM.memoryLines(multi.record.id);
    ok(MEM.removeDetail(multi.record.id, lines[0]).ok, 'removeDetail matches by text');
    ok(MEM.removeDetail(multi.record.id, 0).ok === false, 'removeDetail refuses to empty a single-detail memory');

    // Export/import round-trip: the snapshot string survives a clean session
    // AND contains no secret (the blocked content was never stored).
    const snapshot = stub.ls[MEM.STORAGE_KEY];
    ok(typeof snapshot === 'string' && !/hunter2|sk-abcdefgh/.test(snapshot), 'snapshot contains no secrets');
    const fresh = makeStub();
    MEM.__setStorageForTests(fresh);
    ok(MEM.getAll().length === 0, 'fresh session starts empty');
    fresh.ls[MEM.STORAGE_KEY] = snapshot;                 // simulate .sutra import
    const restored = MEM.getAll();
    ok(restored.length >= 2 && restored.some(r => /4\.0 GPA/.test(r.content)), 'memories survive export/import round-trip', restored.length);

    // Old workspace with no memory store imports cleanly.
    const empty = makeStub();
    MEM.__setStorageForTests(empty);
    ok(Array.isArray(MEM.getAll()) && MEM.getAll().length === 0, 'absent memory store degrades to empty list');

    MEM.__resetForTests();
}

// ============================================================
section('Local Help decision tree');
// ============================================================
{
    const v = LH.validate();
    ok(v.ok, 'decision tree validates (refs resolve, nav targets known)', JSON.stringify(v.problems));

    const root = LH.rootNode();
    ok(root.question && root.choices.length >= 10, 'root menu offers many clickable choices', root.choices.length);

    // Topic nodes pull verified content from Product Knowledge.
    const fc = LH.resolveNode('flashcards');
    ok(fc.answer.length > 0 && fc.nav && fc.nav.view === 'review', 'flashcards node has local answer + Review nav');
    ok(fc.useProvider, 'flashcards node offers a "Use provider instead" follow-up');
    ok(fc.steps.length > 0, 'flashcards node carries numbered steps');

    const mem = LH.resolveNode('memory');
    ok(mem.choices.some(c => c.action && c.action.type === 'open_memory_manager'), 'memory node has a certified open_memory_manager action');

    // Triggers are exact (so phrases route correctly).
    ok(LH.matchTrigger('help') === 'root', 'exact "help" opens Local Help');
    ok(LH.matchTrigger('local help') === 'root', 'exact "local help" opens Local Help');
    ok(LH.matchTrigger('help me plan my week') === null, '"help me plan my week" does NOT hijack to Local Help');
    ok(LH.matchTrigger('how do i make flashcards') === null, '"how do i…" falls through (answered as product Q&A)');

    // Knowledge → node mapping for the router.
    ok(LH.nodeIdForKnowledge('review-flashcards') === 'flashcards', 'maps PK id → help node');

    // Every resolved nav target is a known view.
    LH.listNodeIds().forEach(id => {
        const n = LH.resolveNode(id);
        if (n.nav && n.nav.view) ok(PK.KNOWN_VIEWS.includes(n.nav.view), `node ${id} nav.view is known`, n.nav.view);
    });
}

// ============================================================
section('Capability Registry');
// ============================================================
{
    // Parity with the action catalog in flow-assistant.js.
    const src = read('src/features/assistant/flow-assistant.js');
    const block = src.match(/const ACTION_CATALOG = \[([\s\S]*?)\n    \];/)[1];
    const catalogTypes = [...block.matchAll(/\{\s*type:\s*'([^']+)'/g)].map(m => m[1]);
    const capTypes = new Set(CAP.list());
    const catSet = new Set(catalogTypes);
    catalogTypes.forEach(t => ok(capTypes.has(t), `capability declared for action: ${t}`));
    CAP.list().forEach(t => ok(catSet.has(t), `capability ${t} corresponds to a catalog action`));

    // Scopes are valid; memory deletes/timeline deletes are destructive.
    CAP.list().forEach(t => ok(CAP.SCOPES.includes(CAP.requiredScope(t)), `scope valid for ${t}`, CAP.requiredScope(t)));
    ok(CAP.get('delete_memory').destructive && CAP.get('delete_timeline_block').destructive, 'destructive flag set on deletes');
    ok(CAP.get('run_grade_what_if').readOnly, 'grade what-if is read-only');
    ok(CAP.get('create_memory').reversible, 'create_memory is reversible');

    // Workspace Access gating.
    ok(CAP.isAllowedUnderDepth('navigate', 'minimal'), 'navigation allowed at minimal depth');
    ok(!CAP.isAllowedUnderDepth('reschedule_tasks', 'minimal'), 'workspace-scope action blocked at minimal depth');
    ok(CAP.isAllowedUnderDepth('reschedule_tasks', 'workspace'), 'workspace-scope action allowed at workspace depth');
}

// ============================================================
section('flow-assistant + app.js integration (static)');
// ============================================================
{
    const fa = read('src/features/assistant/flow-assistant.js');
    const app = read('src/core/app.js');

    // Memory actions wired through the one pipeline.
    ['create_memory', 'update_memory', 'enable_memory', 'disable_memory', 'delete_memory',
     'clear_expired_memories', 'clear_temporary_memories', 'open_memory_manager'].forEach(t => {
        ok(fa.includes(`'${t}'`), `memory action ${t} present in flow-assistant`);
    });
    ok(/case 'create_memory': return applyCreateMemory/.test(fa), 'applyAction routes create_memory');
    ok(/case 'delete_memory': return applyDeleteMemory/.test(fa), 'applyAction routes delete_memory');
    ok(/payload\.kind === 'memory'/.test(fa), 'applyUndoPayload handles memory undo');
    ok(/function routeMemoryCommand/.test(fa), 'intent router: routeMemoryCommand present');
    ok(/function routeProductKnowledge/.test(fa), 'intent router: routeProductKnowledge present');
    ok(/function parseRememberIntent/.test(fa), 'intent router: parseRememberIntent present (catches "can you remember…")');
    ok(/function inferActionsFromReply/.test(fa), 'phantom-action safety net present (turns stated scheduling into a real proposal)');
    ok(/inferred: true/.test(fa), 'inferred actions are flagged');

    // Memory preference is registered (default ON) so the toggle persists.
    ok(/useMemory: true/.test(app), 'app.js defaults assistant.useMemory to true (memory on by default)');
    ok(/useMemory: assistantSource\.useMemory !== false/.test(app), 'app.js normalizer preserves assistant.useMemory (toggle persists)');
    ok(/SutraLocalHelp\.matchTrigger/.test(fa), 'intent router consults Local Help triggers');
    ok(/NEVER invent Sutra features/.test(fa), 'system prompt forbids inventing features');
    ok(/Never write or change memory on your own|NEVER write or change memory/.test(fa), 'system prompt forbids writing memory on its own');
    ok(/ctx\.memory =/.test(fa), 'request enrichment attaches relevant memory snippets');
    ok(/ctx\.productKnowledge =/.test(fa), 'request enrichment attaches product knowledge snippets');

    // app.js honors the silent (own-UI) result + exports memory.
    ok(/if \(cmd\.silent\) return;/.test(app), 'app.js honors cmd.silent for own-UI commands');
    ok(/'sutra:assistantMemory:v1'/.test(app), 'app.js includes assistant memory key in export snapshot');

    // Persistence inventory + guardrail registration kept in sync.
    const inv = JSON.parse(read('docs/architecture/persistence-inventory.json'));
    ok(inv.localStorageSnapshotKeys.includes('sutra:assistantMemory:v1'), 'persistence inventory lists the memory key');
    const baseline = JSON.parse(read('scripts/guardrail-baseline.json'));
    ['SutraProductKnowledge', 'SutraAssistantMemory', 'SutraLocalHelp', 'SutraCapabilityRegistry']
        .forEach(g => ok(baseline.knownGlobals.includes(g), `guardrail baseline registers ${g}`));
}

// ============================================================
console.log('\n----------------------------------------');
console.log(`Sutra Intelligence Harness: ${passed} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
console.log('Sutra Intelligence Harness check passed.');
