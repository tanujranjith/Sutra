import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';
import { extractFunction } from '../helpers/extract-function.mjs';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../../src/features/assistant/flow-assistant.js', import.meta.url), 'utf8');
const noteCore = require('../../src/domain/notes-knowledge-core.js');
const privacy = require('../../src/features/assistant/assistant-permissions.js');
const safety = require('../../src/features/assistant/assistant-safety.js');
const capabilities = require('../../src/features/assistant/sutra-capability-registry.js');

function compileFunction(name, parameters = [], values = []) {
  const declaration = extractFunction(source, name);
  assert.ok(declaration, `could not extract ${name}`);
  return new Function(...parameters, `${declaration.body}; return ${name};`)(...values);
}

function extractArrayConstant(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`const ${escapedName} = (\\[[\\s\\S]*?\\n    \\]);`));
  assert.ok(match, `could not extract ${name}`);
  return new Function(`return ${match[1]};`)();
}

const actionCatalog = extractArrayConstant('ACTION_CATALOG');
const hardAgentRules = extractArrayConstant('HARD_AGENT_RULES');
const domainForActionType = compileFunction('domainForActionType', ['window'], [{ SutraCapabilityRegistry: capabilities }]);
const buildActionsBank = compileFunction('buildActionsBank', ['ACTION_CATALOG', 'domainForActionType', 'UNDOABLE_TYPES'], [actionCatalog, domainForActionType, new Set()]);
const selectPromptActionBank = compileFunction('selectPromptActionBank', ['buildActionsBank'], [buildActionsBank]);
const renderActionsBankText = compileFunction('renderActionsBankText');
const promptWindow = { SutraAssistantSafety: safety };
const buildSystemPromptParts = compileFunction('buildSystemPromptParts', [
  'selectPromptActionBank', 'renderActionsBankText', 'buildActionsBank', 'HARD_AGENT_RULES', 'buildPersonalizationLines', 'window'
], [
  selectPromptActionBank,
  renderActionsBankText,
  buildActionsBank,
  hardAgentRules,
  () => [],
  promptWindow
]);

function noteRetriever(pages, core = noteCore, authorizedPageIds = []) {
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: {} }) });
  const window = { SutraAssistantPrivacy: privacy, SutraNotesKnowledgeCore: core };
  return compileFunction('retrieveNoteSources', [
    'window', 'scopedAssistantContextOptions', 'currentLockedPageAccessIds', 'bridge',
    'buildNotesKnowledgeSignature', 'getActiveNoteSummary', 'notesKnowledgeCache'
  ], [
    window,
    options => options || {},
    () => authorizedPageIds,
    () => ({ pages }),
    rows => rows.map(page => `${page.id}:${page.updatedAt || ''}`).join('|'),
    () => null,
    { signature: '', index: null }
  ]);
}

function createEnrichment({
  depth = 'minimal', noteSources = [], onNotesRead = () => {}, onMemoryRead = () => {},
  contextOverrides = {}, chatMemoryMode = 'stateless', conversationMessages = [], attachments = [],
  promptBuilder = buildSystemPromptParts, memoryAllowed = true,
  memoryPrivacy = { canRead: () => memoryAllowed }, memorySnippets = [], onMemoryUsed = () => {},
  lockedTicket = null, onTicketConsumed = () => {}, contextProvider = null, contextFilter = ctx => ctx
} = {}) {
  const context = {
    schema: 'flow-context/1', view: 'today', depth, summary: 'User is on the today view.',
    accessReport: { mode: 'read_only', areasRead: [], recordsRead: [] },
    ...contextOverrides
  };
  const window = {
    SutraAssistantSafety: safety,
    SutraAssistantPrivacy: memoryPrivacy,
    SutraProductKnowledge: { search: () => [] }
  };
  const enrich = compileFunction('buildRequestEnrichment', [
    'isConversationHistoryQuestion', 'resolveRequestScope',
    'shouldInvestigateWorkspace', 'getPref', 'currentLockedPageAccessTicket', 'currentLockedPageAccessIds',
    'applyRelevantWorkspaceContext', 'getFlowAssistantContext', 'memStore', 'getActiveViewName',
    'retrieveNoteSources', 'window', 'getChatMemoryMode', 'buildConversationMessages',
    'getAttachments', 'buildSystemPromptParts', 'filterAssistantContext',
    'getActiveTutoringContract', 'getVisionCapability', 'consumeLockedPageAccess'
  ], [
    compileFunction('isConversationHistoryQuestion'),
    options => options.conversationScope || options.scope || {},
    () => false,
    (_key, fallback) => fallback,
    options => lockedTicket && options?.lockedPageAccessTicket === lockedTicket ? lockedTicket : null,
    options => lockedTicket && options?.lockedPageAccessTicket === lockedTicket ? lockedTicket.pageIds : [],
    ctx => ctx,
    options => contextProvider ? contextProvider(options) : structuredClone({ ...context, depth: options && options.depth || context.depth }),
    () => ({
      buildPromptSnippets: () => { onMemoryRead(); return memorySnippets; },
      recordUsed: onMemoryUsed
    }),
    () => 'today',
    (...args) => { onNotesRead(); return { sources: noteSources, evidenceStatus: 'supported', args }; },
    window,
    () => chatMemoryMode,
    () => conversationMessages,
    () => attachments,
    promptBuilder,
    contextFilter,
    () => null,
    () => null,
    onTicketConsumed
  ]);
  return enrich;
}

// Exercise the actual selection/Canvas collection and final prompt builder,
// including the identity-based, expiring one-request ticket checks.
function editorContextFixture({ primaryLocked = false, canvasLocked = false, canvasId = 'canvas', ticket = null, legacy = false } = {}) {
  const primary = { id: 'primary', isLocked: primaryLocked };
  const canvas = { id: 'canvas', isLocked: canvasLocked };
  const pages = [primary, canvas];
  const selectionNode = { nodeType: 1 };
  const host = { dataset: { pageId: primary.id }, contains: node => node === selectionNode };
  const fakeDocument = { getElementById: id => legacy ? (id === 'editor' ? host : null) : (id === 'editorV2Host' ? host : null) };
  const fakeWindow = {
    getSelection: () => ({ rangeCount: 1, toString: () => 'SELECTION_SENTINEL', getRangeAt: () => ({ commonAncestorContainer: selectionNode }) }),
    SutraCanvas: { getContext: () => ({ pageId: canvasId, objects: [{ text: 'CANVAS_SENTINEL' }] }) }
  };
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: { notes: 'approved' } }) });
  const names = ['lockedPageAccessTicketIsValid', 'currentLockedPageAccessTicket', 'currentLockedPageAccessIds',
    'scopedAssistantContextOptions', 'rangeInsideElement', 'assistantPageContextAllowed', 'getEditorSelection',
    'getCanvasContextSummary', 'getFlowAssistantContext'];
  const declarations = names.map(name => {
    const found = extractFunction(source, name);
    assert.ok(found, `could not extract ${name}`);
    return found.body;
  }).join('\n');
  const context = new Function('window', 'document', 'Node', 'bridge', 'filterAssistantContext', 'initialTicket',
    `let activeLockedPageAccessTicket = initialTicket;
     const normalizeDepth = depth => depth || 'currentView';
     const getActiveViewName = () => 'notes';
     const getPref = (_key, fallback) => fallback;
     const intel = () => null;
     const getActiveNoteSummary = () => null;
     const getSlidesContextSummary = () => null;
     const summarizeTasksFor = () => [], summarizeHomework = () => [], summarizeTimeline = () => [], summarizeDeadlines = () => [];
     const summarizeReviewDue = () => null, summarizeApStudy = () => null, summarizeCollege = () => null;
     const summarizeLife = () => null, summarizeBusiness = () => null, summarizeCram = () => null;
     const summarizeCourses = () => null, summarizeAllDue = () => null, summarizeTestingHub = () => null;
     const truncate = (text, max) => text.slice(0, max);
     ${declarations}
     return getFlowAssistantContext;`)(fakeWindow, fakeDocument, { TEXT_NODE: 3 }, () => ({ pages, currentPageId: primary.id }),
    (value, options) => privacy.filterContext(value, options), ticket);
  return { context, host };
}

test('provider prompts exclude selection and split Canvas from locked pages without their scoped ticket', () => {
  const validTicket = { pageIds: ['primary'], expiresAt: Date.now() + 60000 };
  const wrongTicket = { pageIds: ['canvas'], expiresAt: Date.now() + 60000 };
  const forgedTicket = { ...validTicket };
  for (const depth of ['minimal', 'currentView']) {
    const fixture = editorContextFixture({ primaryLocked: true, canvasLocked: true, ticket: validTicket });
    for (const ticket of [null, forgedTicket, wrongTicket]) {
      const context = fixture.context({ depth, lockedPageAccessTicket: ticket });
      const enrichment = createEnrichment({ depth, contextProvider: fixture.context, memoryPrivacy: privacy,
        contextFilter: (value, options) => privacy.filterContext(value, options) })('hello', 'openai', { depth, lockedPageAccessTicket: ticket });
      const payload = JSON.stringify({ systemPrompt: enrichment.systemPrompt, messages: enrichment.requestMessages });
      assert.ok(!JSON.stringify(context).includes('SELECTION_SENTINEL'));
      assert.ok(!payload.includes('SELECTION_SENTINEL'));
      assert.ok(!payload.includes('CANVAS_SENTINEL'));
    }
    // Explicit page access still identifies exactly one page; the send path
    // deliberately suppresses editor selection even for a verified ticket.
    assert.equal(fixture.context({ depth, lockedPageAccessTicket: validTicket }).selection, 'SELECTION_SENTINEL');
    assert.equal(fixture.context({ depth, lockedPageAccessTicket: validTicket }).canvas, undefined);
    const scoped = createEnrichment({ depth, lockedTicket: validTicket, contextProvider: fixture.context, memoryPrivacy: privacy,
      contextFilter: (value, options) => privacy.filterContext(value, options) })('hello', 'openai', { depth, lockedPageAccessTicket: validTicket });
    assert.ok(!JSON.stringify({ systemPrompt: scoped.systemPrompt, messages: scoped.requestMessages }).includes('SELECTION_SENTINEL'));
    assert.ok(!JSON.stringify(scoped.context).includes('CANVAS_SENTINEL'));
  }
});

test('ordinary editor selection and ordinary Canvas remain available; unknown or stale owners fail closed', () => {
  const fixture = editorContextFixture();
  const enrichment = createEnrichment({ depth: 'currentView', contextProvider: fixture.context, memoryPrivacy: privacy,
    contextFilter: (value, options) => privacy.filterContext(value, options) })('hello', 'openai', { depth: 'currentView' });
  assert.match(enrichment.systemPrompt, /SELECTION_SENTINEL/);
  assert.match(enrichment.systemPrompt, /CANVAS_SENTINEL/);
  fixture.host.dataset.pageId = 'stale-page';
  assert.equal(fixture.context({ depth: 'minimal' }).selection, undefined);
  const unknownCanvas = editorContextFixture({ canvasId: 'missing-page' });
  assert.equal(unknownCanvas.context({ depth: 'currentView' }).canvas, undefined);
  const canvasTicket = { pageIds: ['canvas'], expiresAt: Date.now() + 60000 };
  const lockedCanvas = editorContextFixture({ primaryLocked: true, canvasLocked: true, ticket: canvasTicket });
  const canvasContext = lockedCanvas.context({ depth: 'currentView', lockedPageAccessTicket: canvasTicket });
  assert.equal(canvasContext.canvas.pageId, 'canvas');
  assert.equal(canvasContext.selection, undefined);
  const expired = { pageIds: ['primary'], expiresAt: Date.now() - 1000 };
  const expiredFixture = editorContextFixture({ primaryLocked: true, ticket: expired });
  assert.equal(expiredFixture.context({ depth: 'minimal', lockedPageAccessTicket: expired }).selection, undefined);
  const legacyLock = editorContextFixture({ primaryLocked: 'true' });
  assert.equal(legacyLock.context({ depth: 'minimal' }).selection, undefined);
});

test('classic editor selection requires the current visible page owner', () => {
  const fixture = editorContextFixture({ legacy: true });
  assert.equal(fixture.context({ depth: 'minimal' }).selection, 'SELECTION_SENTINEL');
  fixture.host.hidden = true;
  assert.equal(fixture.context({ depth: 'minimal' }).selection, undefined);
  fixture.host.hidden = false;
  fixture.host.dataset.pageId = 'previous-protected-page';
  assert.equal(fixture.context({ depth: 'minimal' }).selection, undefined);
  delete fixture.host.dataset.pageId;
  assert.equal(fixture.context({ depth: 'minimal' }).selection, undefined);
  assert.equal(editorContextFixture({ legacy: true, primaryLocked: true }).context({ depth: 'minimal' }).selection, undefined);
});

test('Slides summaries use the requested owner, not a stale protected editor deck', () => {
  const pages = [
    { id: 'ordinary', title: 'Ordinary', slides: { slides: [{ title: 'ORDINARY_SLIDE', speakerNotes: 'ORDINARY_NOTES', elements: [{ text: 'ORDINARY_CONTENT' }] }] } },
    { id: 'protected', title: 'Protected', isLocked: true, slides: { slides: [{ title: 'PROTECTED_SLIDE', speakerNotes: 'PROTECTED_NOTES', elements: [{ text: 'PROTECTED_CONTENT' }] }] } }
  ];
  const state = { currentPageId: 'protected', liveId: 'protected' };
  const ticket = { pageIds: ['protected'], expiresAt: Date.now() + 60000 };
  const win = { getSelection: () => null, SutraSlides: { getContext() {
    const page = pages.find(item => item.id === state.liveId);
    return page ? { id: page.id, type: 'slides', slideCount: page.slides.slides.length, slides: page.slides.slides } : null;
  } } };
  privacy.configure({ getPermissions: () => ({ mode: 'read_only', areas: { notes: 'approved' } }) });
  const names = ['lockedPageAccessTicketIsValid', 'currentLockedPageAccessTicket', 'currentLockedPageAccessIds',
    'scopedAssistantContextOptions', 'rangeInsideElement', 'assistantPageContextAllowed', 'getEditorSelection',
    'getActiveNoteSummary', 'getCanvasContextSummary', 'getSlidesContextSummary', 'getFlowAssistantContext'];
  const declarations = names.map(name => {
    const found = extractFunction(source, name);
    assert.ok(found, `could not extract ${name}`);
    return found.body;
  }).join('\n');
  const context = new Function('window', 'document', 'Node', 'bridge', 'filterAssistantContext', 'initialTicket',
    `let activeLockedPageAccessTicket = initialTicket;
     const normalizeDepth = depth => depth || 'currentView';
     const getActiveViewName = () => 'notes';
     const getPref = (_key, fallback) => fallback;
     const intel = () => null;
     const syncActiveV2NoteForContext = () => {};
     const summarizeTasksFor = () => [], summarizeHomework = () => [], summarizeTimeline = () => [], summarizeDeadlines = () => [];
     const summarizeReviewDue = () => null, summarizeApStudy = () => null, summarizeCollege = () => null;
     const summarizeLife = () => null, summarizeBusiness = () => null, summarizeCram = () => null;
     const summarizeCourses = () => null, summarizeAllDue = () => null, summarizeTestingHub = () => null;
     const truncate = (text, max) => text.slice(0, max);
     ${declarations}
     return getFlowAssistantContext;`)(win, { getElementById: () => null }, { TEXT_NODE: 3 },
    () => ({ pages, currentPageId: state.currentPageId }), (value, options) => privacy.filterContext(value, options), ticket);

  const scoped = { depth: 'currentView', scope: { type: 'note', noteId: 'ordinary' } };
  const scopedResult = context(scoped);
  assert.match(scopedResult.activeNote.excerpt, /ORDINARY_CONTENT/);
  assert.equal(scopedResult.slides, undefined);
  assert.ok(!JSON.stringify(scopedResult).includes('PROTECTED_'));
  const enrichment = createEnrichment({ depth: 'currentView', contextProvider: context, memoryPrivacy: privacy,
    contextFilter: (value, options) => privacy.filterContext(value, options) })('Summarize this note', 'openai', scoped);
  assert.ok(!JSON.stringify({ systemPrompt: enrichment.systemPrompt, messages: enrichment.requestMessages }).includes('PROTECTED_'));

  // Navigation changes the current page before the Slides editor refreshes.
  state.currentPageId = 'ordinary';
  const transition = context({ depth: 'currentView' });
  assert.match(transition.activeNote.excerpt, /ORDINARY_CONTENT/);
  assert.equal(transition.slides, undefined);
  assert.ok(!JSON.stringify(transition).includes('PROTECTED_'));
  state.liveId = 'ordinary';
  const ready = context({ depth: 'currentView' });
  assert.equal(ready.slides.id, 'ordinary');
  assert.match(JSON.stringify(ready), /ORDINARY_CONTENT/);

  state.currentPageId = state.liveId = 'protected';
  assert.ok(!JSON.stringify(context({ depth: 'currentView' })).includes('PROTECTED_CONTENT'));
  const authorized = context({ depth: 'currentView', lockedPageAccessTicket: ticket });
  assert.match(authorized.activeNote.excerpt, /PROTECTED_CONTENT/);
  assert.equal(authorized.slides.id, 'protected');
});

test('generic prompts omit the action catalog while preserving the core safety rules', () => {
  const generic = buildSystemPromptParts({ view: 'today', depth: 'minimal' }, 'hello');
  const action = buildSystemPromptParts({ view: 'today', depth: 'minimal' }, 'Create a task');

  assert.ok(!generic.static.includes('ACTIONS AVAILABLE FOR THIS REQUEST'));
  assert.ok(!generic.static.includes('create_task:'));
  assert.ok(generic.static.includes('YOU CANNOT CHANGE ANYTHING YOURSELF'));
  assert.ok(generic.static.includes('NEVER invent, assume, or guess data'));
  assert.ok(action.static.includes('ACTIONS AVAILABLE FOR THIS REQUEST'));
  assert.ok(action.static.includes('create_task:'));
  assert.ok(action.static.length > generic.static.length);
});

test('natural revise-and-put-back requests include the canonical anchored note edit action', () => {
  for (const prompt of ['revise it and then put it in there', 'Improve the writing in my current note while keeping my voice', 'rephrase this essay']) {
    const selected = selectPromptActionBank(prompt);
    assert.ok(selected.domains.flatMap(domain => domain.actions).some(action => action.type === 'edit_note_patch'), prompt);
    assert.ok(selected.totalActions <= 12);
  }
});

test('chat-history questions use Minimal context instead of unrelated note retrieval', () => {
  let notesRead = 0;
  const turns = [{ role: 'user', content: 'Please revise my Orchid essay' }, { role: 'assistant', content: 'I can propose an edit' }];
  const result = createEnrichment({ depth: 'workspace', chatMemoryMode: 'stateful', conversationMessages: turns, onNotesRead: () => notesRead++ })('what has this chat been talking about', 'openai');
  assert.equal(result.context.depth, 'minimal');
  assert.equal(notesRead, 0);
  assert.ok(result.requestMessages.some(message => message.content.includes('Orchid essay')));
});

test('recent conversation wins over ambient workspace evidence under the context budget', () => {
  const turns = [{ role: 'user', content: 'Our topic is the Orchid essay' }, { role: 'assistant', content: 'The Orchid essay needs revision' }];
  const result = createEnrichment({ depth: 'workspace', chatMemoryMode: 'stateful', conversationMessages: turns,
    contextOverrides: { tasks: Array.from({length: 30}, (_, i) => ({id: 'task'+i, title: 'Unrelated '+i, notes: 'x'.repeat(1000)})) }
  })('revise it and then put it in there', 'openai');
  assert.ok(result.requestMessages.some(message => message.content.includes('Our topic is the Orchid essay')));
  assert.ok(result.context.contextBudget.estimatedInputTokens <= result.context.contextBudget.inputLimitTokens);
});

test('legacy chip recovery uses an exact unique canonical note and respects Stateless mode', () => {
  const pages = [{ id: 'orchid', title: 'Orchid essay' }];
  let mode = 'stateful';
  const resolve = compileFunction('resolveRequestScope', ['getChatMemoryMode', 'bridge'], [() => mode, () => ({pages})]);
  const options = { conversationScope: {type: 'workspace'}, conversation: [{role:'user',content:'here',contextTags:[{icon:'fa-file-lines',label:'Orchid essay'}]}] };
  assert.equal(resolve(options).noteId, 'orchid');
  pages.push({id:'other',title:'Orchid essay'});
  assert.equal(resolve(options).type, 'workspace');
  pages.pop(); mode = 'stateless';
  assert.equal(resolve(options).type, 'workspace');
});

test('prompt action selection includes create_task with its catalog fields and stays bounded across domains', () => {
  const selected = selectPromptActionBank('Create a task and schedule a review deck');
  const actions = selected.domains.flatMap(domain => domain.actions);
  const task = actions.find(action => action.type === 'create_task');

  assert.ok(task, 'create_task should be available for a task-creation request');
  assert.deepEqual(task.fields, actionCatalog.find(action => action.type === 'create_task').fields);
  assert.ok(actions.length <= 12);
  assert.ok(selected.domains.length > 1, 'the selected bank should preserve domain groupings');
  assert.equal(selected.totalActions, actions.length);
  assert.equal(selectPromptActionBank('hello').totalActions, 0);
});

test('natural to-do and classroom test requests expose the real task-creation schema', () => {
  for (const prompt of [
    'can you add that i have a math and physics test on tesuday',
    'add math and physics tests on Tuesday',
    'put buy a binder on my to-do list',
    'create a reminder to return my textbook',
    'add my biology homework due Friday'
  ]) {
    const bank = selectPromptActionBank(prompt);
    const actions = bank.domains.flatMap(domain => domain.actions);
    assert.ok(actions.some(action => action.type === 'create_task'), prompt);
    assert.ok(actions.length <= 12);
  }
  assert.ok(buildSystemPromptParts({ view: 'assistantview', depth: 'workspace' },
    'can you add that i have a math and physics test on tesuday').static.includes('create_task:'));
});

test('task schemas survive short clarifications using retained user history only', () => {
  const original = { role: 'user', content: 'can you add that i have a math and physics test on tesuday in my todos' };
  const history = [original,
    { role: 'assistant', content: 'Separate tests?' },
    { role: 'user', content: 'seperate' },
    { role: 'assistant', content: 'No todo action is available. Which Tuesday?' }
  ];
  for (const answer of ['separate', 'seperate', 'both', 'this tuesday', '2026-10-27']) {
    assert.ok(selectPromptActionBank(answer, history).domains.flatMap(domain => domain.actions).some(action => action.type === 'create_task'), answer);
  }
  assert.equal(selectPromptActionBank('this tuesday').totalActions, 0, 'Stateless mode has no previous request');
  assert.equal(selectPromptActionBank('this tuesday', [{ role: 'assistant', content: original.content }]).totalActions, 0);
  assert.equal(selectPromptActionBank('this tuesday', [original, { role: 'user', content: 'cancel that' }]).totalActions, 0);
  assert.equal(selectPromptActionBank('thanks', history).totalActions, 0);
  const enrichment = createEnrichment({ chatMemoryMode: 'stateful', conversationMessages: history })('this tuesday', 'openai');
  assert.ok(enrichment.systemPromptParts.static.includes('create_task:'));
  const stateless = createEnrichment({ chatMemoryMode: 'stateless', conversationMessages: history })('this tuesday', 'openai');
  assert.ok(!stateless.systemPromptParts.static.includes('create_task:'));
});

test('ordinary note retrieval excludes Help & Docs but an explicit Help & Docs request can retrieve it', () => {
  const pages = [
    {
      id: 'help_page', title: 'Help & Docs', isSystemPage: true, builtInId: 'help-docs', systemRole: 'help-docs',
      content: '<h1>Focus timer</h1><p>Focus timer guidance explains how to start and use a focus session.</p>'
    },
    {
      id: 'student-note', title: 'Focus timer notes', content: '<h1>Focus timer</h1><p>Focus timer helps me stay with my biology study session.</p>'
    }
  ];
  const retrieve = noteRetriever(pages);
  const ordinary = retrieve('focus timer');
  const explicit = retrieve('What does Help & Docs say about the focus timer?');
  const homeworkHelp = retrieve('help me with homework');
  const planWeek = retrieve('Sutra, plan my week');

  assert.ok(ordinary.sources.some(source => source.noteId === 'student-note'));
  assert.ok(ordinary.sources.every(source => source.noteId !== 'help_page'));
  assert.ok(explicit.sources.some(source => source.noteId === 'help_page'));
  assert.ok(homeworkHelp.sources.every(source => source.noteId !== 'help_page'));
  assert.ok(planWeek.sources.every(source => source.noteId !== 'help_page'));
});

test('note retrieval returns at most two excerpts per note and four distinct chunks overall', () => {
  const pages = [{ id: 'one' }, { id: 'two' }, { id: 'three' }, { id: 'four' }];
  const hits = [
    ['one', 'one:0:0'], ['one', 'one:0:0'], ['one', 'one:2:0'],
    ['two', 'two:0:0'], ['two', 'two:1:0'], ['three', 'three:0:0'], ['four', 'four:0:0']
  ].map(([noteId, id], index) => ({
    id, noteId, title: noteId, quote: `orchid excerpt ${index}`, score: 8, confidence: 'medium',
    href: `sutra://page/${noteId}`
  }));
  let searchOptions;
  const core = {
    buildIndex: rows => rows,
    search: (_index, _query, options) => {
      searchOptions = options;
      return { sources: hits.slice(0, options.limit), evidenceStatus: 'supported' };
    }
  };
  const sources = noteRetriever(pages, core)('orchid', { limit: 8 }).sources;
  const perNote = new Map();
  for (const source of sources) perNote.set(source.noteId, (perNote.get(source.noteId) || 0) + 1);

  assert.equal(searchOptions.quoteLength, 700);
  assert.ok(sources.length <= 4);
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
  assert.ok([...perNote.values()].every(count => count <= 2));
});

test('Minimal enrichment does not read saved memory or retrieve note excerpts', () => {
  let noteReads = 0;
  let memoryReads = 0;
  const enrichment = createEnrichment({
    depth: 'minimal',
    onNotesRead: () => { noteReads += 1; },
    onMemoryRead: () => { memoryReads += 1; }
  })('hello', 'openai');

  assert.equal(noteReads, 0);
  assert.equal(memoryReads, 0);
  assert.deepEqual(enrichment.sources, []);
  assert.deepEqual(enrichment.context.retrievedNotes || [], []);
  assert.equal(enrichment.context.notesEvidenceStatus, 'not_requested');
});

test('a verified page read searches only its target, including generic prompts, and retains exclusions', () => {
  const pages = [
    { id: 'sealed-atlas', title: 'Sealed Atlas', isLocked: true, content: '<p>Violet folders at eight.</p>' },
    { id: 'other-atlas', title: 'Sealed Atlas ordinary notes', content: '<p>UNRELATED_RECORD must not be selected.</p>' }
  ];
  const retrieve = noteRetriever(pages, noteCore, ['sealed-atlas']);
  const named = retrieve('Read the Sealed Atlas note.');
  assert.ok(named.sources.length > 0);
  assert.ok(named.sources.every(row => row.noteId === 'sealed-atlas'));
  assert.doesNotMatch(JSON.stringify(named.sources), /UNRELATED_RECORD/);

  const generic = retrieve('Read this note.');
  assert.ok(generic.sources.some(row => row.quote.includes('Violet folders')));
  assert.deepEqual(retrieve('Read this note.', { scope: { type: 'all', excludedNoteIds: ['sealed-atlas'] } }).sources, []);
  assert.deepEqual(retrieve('Read this note.', { scope: { type: 'all', excludedSourceIds: named.sources.map(row => row.id) } }).sources, []);
  assert.deepEqual(retrieve('Read this note.', { scope: { type: 'note', noteId: 'other-atlas' } }).sources, []);
  assert.ok(noteRetriever(pages)('Sealed Atlas').sources.every(row => row.noteId !== 'sealed-atlas'));
});

test('Minimal permits a verified explicit page read without automatic memory and reports only its retained source', () => {
  const ticket = { pageIds: ['sealed-atlas'] };
  let consumed;
  let memoryReads = 0;
  let noteReads = 0;
  const enrichment = createEnrichment({
    depth: 'minimal', lockedTicket: ticket,
    noteSources: [{ id: 'sealed-atlas:0:0', noteId: 'sealed-atlas', title: 'Sealed Atlas', quote: 'Violet folders at eight.', score: 12 }],
    onNotesRead: () => { noteReads++; },
    onMemoryRead: () => { memoryReads++; },
    onTicketConsumed: value => { consumed = value; }
  })('Read the Sealed Atlas note.', 'gemini', { lockedPageAccessTicket: ticket });
  assert.equal(noteReads, 1);
  assert.equal(memoryReads, 0);
  assert.equal(consumed, ticket);
  assert.match(enrichment.systemPrompt, /Violet folders/);
  assert.deepEqual(enrichment.sources.map(row => [row.noteId, row.readOnce]), [['sealed-atlas', true]]);
  assert.equal(enrichment.context.notesEvidenceStatus, 'supported');
});

test('denied memory is not read before budgeting or included in selection metadata', () => {
  let memoryReads = 0;
  const enrichment = createEnrichment({
    depth: 'workspace', memoryAllowed: false,
    onMemoryRead: () => { memoryReads += 1; }
  })('Help me plan', 'openai');
  assert.equal(memoryReads, 0);
  assert.equal(enrichment.context.memory, undefined);
  assert.equal(enrichment.context.memoryUsedIds, undefined);
  assert.ok(!(enrichment.context.contextSelectionReasons || []).some(reason => reason.kind === 'memory'));
});

test('missing or throwing memory permission APIs fail closed before retrieval', () => {
  for (const memoryPrivacy of [{}, { canRead: () => { throw new Error('policy unavailable'); } }]) {
    let reads = 0;
    const enrichment = createEnrichment({
      depth: 'workspace', memoryPrivacy,
      onMemoryRead: () => { reads++; }
    })('Help me plan', 'openai');
    assert.equal(reads, 0);
    assert.equal(enrichment.context.memoryUsedIds, undefined);
    assert.ok(!(enrichment.context.contextSelectionReasons || []).some(reason => reason.kind === 'memory'));
  }
});

test('memory usage and source IDs track only evidence retained after serialized pruning', () => {
  const used = [];
  const enrichment = createEnrichment({
    depth: 'workspace',
    memorySnippets: [{ id: 'memory-large', text: 'saved preference '.repeat(4000) }],
    onMemoryUsed: ids => used.push(...ids)
  })('hello', 'openai', { contextLimitTokens: 2200, reserveResponseTokens: 512 });
  const retained = enrichment.context.memoryUsedIds || [];
  assert.deepEqual(used, retained);
  assert.equal(retained.length, (enrichment.context.memory || []).length);
  if (!retained.length) {
    assert.ok(!JSON.stringify(enrichment.context).includes('memory-large'));
    assert.ok(!enrichment.systemPrompt.includes('memory-large'));
  }
});

test('literal-only replies skip enrichment unless the request names workspace evidence', () => {
  let literalNoteReads = 0;
  let literalMemoryReads = 0;
  const literal = createEnrichment({
    depth: 'workspace',
    onNotesRead: () => { literalNoteReads += 1; },
    onMemoryRead: () => { literalMemoryReads += 1; }
  })('Reply with exactly HELLO', 'openai');

  assert.equal(literal.context.depth, 'minimal');
  assert.equal(literalNoteReads, 0);
  assert.equal(literalMemoryReads, 0);
  assert.equal(literal.context.notesEvidenceStatus, 'not_requested');

  let evidenceNoteReads = 0;
  let evidenceMemoryReads = 0;
  const evidence = createEnrichment({
    depth: 'workspace',
    onNotesRead: () => { evidenceNoteReads += 1; },
    onMemoryRead: () => { evidenceMemoryReads += 1; }
  })('Answer with exactly my task count', 'openai');

  assert.equal(evidence.context.depth, 'workspace');
  assert.equal(evidenceNoteReads, 1);
  assert.equal(evidenceMemoryReads, 1);
});

test('context reconstruction keeps separate chunks from the same note by chunk id', () => {
  const noteSources = [
    { id: 'page-a:0:0', noteId: 'page-a', title: 'Lab note', quote: 'first orchid excerpt', href: 'sutra://page/page-a', score: 8 },
    { id: 'page-a:1:0', noteId: 'page-a', title: 'Lab note', quote: 'second orchid excerpt', href: 'sutra://page/page-a', score: 7 }
  ];
  const enrichment = createEnrichment({ depth: 'workspace', noteSources })('summarize orchid', 'openai');

  assert.deepEqual(enrichment.context.retrievedNotes.map(source => source.id), ['page-a:0:0', 'page-a:1:0']);
  assert.deepEqual(enrichment.context.retrievedNotes.map(source => source.quote), ['first orchid excerpt', 'second orchid excerpt']);
});

test('serialized prompt with giant note excerpts is reduced and stays within its input budget', () => {
  const noteSources = Array.from({ length: 4 }, (_, index) => ({
    id: `lab-note:${index}:0`, noteId: 'lab-note', title: 'Lab note',
    quote: `orchid excerpt ${index} ${'x'.repeat(12000)}`,
    href: 'sutra://page/lab-note', score: 9, confidence: 'high'
  }));
  const enrichment = createEnrichment({ depth: 'workspace', noteSources })('explain orchid', 'openai', {
    contextLimitTokens: 3000,
    reserveResponseTokens: 512
  });
  const serializedTokens = safety.estimateTokens(enrichment.systemPromptParts.static + '\n' + enrichment.systemPromptParts.dynamic)
    + safety.estimateTokens(enrichment.requestMessages);

  assert.ok(enrichment.context.contextBudget.reduced, 'large excerpts should report context reduction');
  assert.ok(enrichment.context.contextBudget.inputLimitTokens > 0);
  assert.ok(serializedTokens <= enrichment.context.contextBudget.inputLimitTokens);
  assert.ok((enrichment.context.retrievedNotes || []).length <= 4);
  assert.equal(enrichment.systemPrompt, enrichment.systemPromptParts.static + '\n' + enrichment.systemPromptParts.dynamic);
});

test('final serialization prunes oversized current-view context outside the candidate selector', () => {
  const timelineToday = Array.from({ length: 12 }, (_, index) => ({
    id: `block-${index}`, name: `Study block ${index}`, details: `TIMELINE_SENTINEL_${index}_${'x'.repeat(3000)}`
  }));
  const enrichment = createEnrichment({
    depth: 'currentView', contextOverrides: { timelineToday }
  })('hello', 'openai', { contextLimitTokens: 1600, reserveResponseTokens: 512 });
  const serializedTokens = safety.estimateTokens(enrichment.systemPromptParts.static + '\n' + enrichment.systemPromptParts.dynamic)
    + safety.estimateTokens(enrichment.requestMessages);
  const remainingTimeline = enrichment.context.timelineToday || [];

  assert.ok(enrichment.context.contextBudget.reduced);
  assert.ok(remainingTimeline.length < timelineToday.length);
  assert.ok(!enrichment.systemPrompt.includes('TIMELINE_SENTINEL_11_'));
  assert.ok(serializedTokens <= enrichment.context.contextBudget.inputLimitTokens);
});

test('conversation compaction preserves message roles and the latest user message', () => {
  const conversationMessages = [{ role: 'assistant', content: `earlier assistant reply ${'x'.repeat(12000)}` }];
  const latestUserText = 'Keep this newest question in the provider request.';
  const enrichment = createEnrichment({
    depth: 'minimal', chatMemoryMode: 'stateful', conversationMessages
  })(latestUserText, 'openai', { contextLimitTokens: 2600, reserveResponseTokens: 512 });

  assert.equal(enrichment.requestMessages.at(-1).role, 'user');
  assert.equal(enrichment.requestMessages.at(-1).content, latestUserText);
  assert.equal(enrichment.requestMessages[0].role, 'assistant');
  assert.ok(enrichment.requestMessages[0].content.length < conversationMessages[0].content.length);
  assert.ok(enrichment.context.contextBudget.reduced, 'discarded or compressed history should be disclosed as a reduction');
});

test('source disclosures are rebuilt from retained workspace records rather than the initial broad context', () => {
  const enrichment = createEnrichment({ depth: 'workspace', contextOverrides: {
    homework: [{ id: 'robotics', key: 'homework:robotics', type: 'homework', title: 'Robotics demo', notes: 'Use the blue sensor', citationUrl: 'sutra://entity/homework%3Arobotics' }],
    workspaceLearning: [{ id: 'sat', key: 'testing_exam:sat', type: 'testing_exam', title: 'SAT', dueDate: '2026-12-05', citationUrl: 'sutra://entity/testing_exam%3Asat' }]
  } })('Show my Robotics notes and SAT date', 'gemini');
  assert.equal(enrichment.context.homework[0].notes, 'Use the blue sensor');
  assert.deepEqual(enrichment.sources.map(row => row.kind).sort(), ['homework', 'testing_exam']);
  assert.equal(enrichment.retrieval.evidenceStatus, 'supported');
  assert.ok(enrichment.sources.every(row => !('notes' in row) && !('excerpt' in row)));
});
