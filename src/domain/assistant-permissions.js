/* Privacy boundary for assistant context and actions. */
(function (global) {
  'use strict';

  var MODES = ['off', 'read_only', 'ask_per_area', 'approved_actions'];
  var adapter = null;
  var KEY_AREAS = {
    activeNote: 'notes', selection: 'notes', canvas: 'notes', staleNotes: 'notes',
    tasks: 'planning', homework: 'planning', timelineUpcoming: 'planning', timelineToday: 'planning', timeline: 'planning', deadlines: 'planning', allDue: 'planning', derived: 'planning',
    review: 'learning', apStudy: 'learning', cram: 'learning', testingHub: 'learning',
    college: 'college', courses: 'courses', life: 'life', business: 'business', assistantMemory: 'memory'
  };
  var ALWAYS = new Set(['schema', 'view', 'depth', 'now', 'timeOfDay', 'summary', 'customTab']);

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }
  function normalize(input) {
    var source = input && typeof input === 'object' ? input : {};
    var mode = MODES.indexOf(String(source.mode)) >= 0 ? String(source.mode) : 'off';
    var areas = {};
    Object.keys(source.areas && typeof source.areas === 'object' ? source.areas : {}).forEach(function (key) {
      var value = source.areas[key];
      areas[key] = value === true || value === 'approved' ? 'approved' : value === false || value === 'denied' ? 'denied' : 'ask';
    });
    return {
      version: 1,
      mode: mode,
      areas: areas,
      allowLockedNotes: source.allowLockedNotes === true,
      allowWellness: source.allowWellness === true,
      allowFinancial: source.allowFinancial === true,
      allowPrivateDocuments: source.allowPrivateDocuments === true
    };
  }
  function configure(nextAdapter) { adapter = nextAdapter || null; return api; }
  function getPermissions() {
    try { return normalize(adapter && typeof adapter.getPermissions === 'function' ? adapter.getPermissions() : {}); }
    catch (_) { return normalize({}); }
  }
  function canRead(area, options) {
    var permissions = getPermissions(), opts = options || {};
    if (permissions.mode === 'off') return false;
    var state = permissions.areas[area];
    if (state === 'denied') return false;
    if (permissions.mode === 'ask_per_area') {
      return state === 'approved' || (Array.isArray(opts.approvedAreas) && opts.approvedAreas.indexOf(area) >= 0);
    }
    return state !== 'denied';
  }
  function recordIds(value) {
    if (Array.isArray(value)) return value.map(function (row) { return row && row.id != null ? String(row.id) : ''; }).filter(Boolean).slice(0, 100);
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.items)) return recordIds(value.items);
    if (Array.isArray(value.exams)) return recordIds(value.exams);
    if (Array.isArray(value.courses)) return recordIds(value.courses);
    return value.id != null ? [String(value.id)] : [];
  }
  function stripSensitive(key, value, permissions) {
    if (!value || typeof value !== 'object') return value;
    var out = clone(value);
    if (key === 'activeNote' && out.locked && !permissions.allowLockedNotes) {
      Object.keys(out).forEach(function (field) { if (!['id', 'title', 'locked', 'type'].includes(field)) delete out[field]; });
    }
    if (key === 'life' && !permissions.allowWellness) {
      delete out.wellness; delete out.wellnessTrends; delete out.sleep; delete out.mood; delete out.stress;
    }
    if (key === 'college' && !permissions.allowFinancial) {
      ['applicationCosts', 'costs', 'financialAid', 'financialAidDeadlines', 'scholarships', 'runway', 'spending', 'income', 'tuition'].forEach(function (field) { delete out[field]; });
    }
    delete out.privateDocuments;
    return out;
  }
  function filterContext(context, options) {
    var source = context && typeof context === 'object' ? context : {}, permissions = getPermissions(), out = {}, areasRead = [], recordsRead = [];
    Object.keys(source).forEach(function (key) {
      if (ALWAYS.has(key)) { out[key] = clone(source[key]); return; }
      var area = KEY_AREAS[key] || 'workspace';
      if (!canRead(area, options)) return;
      var value = stripSensitive(key, source[key], permissions);
      out[key] = value;
      if (areasRead.indexOf(area) < 0) areasRead.push(area);
      recordIds(value).forEach(function (id) { recordsRead.push({ area: area, kind: key, id: id }); });
    });
    out.accessReport = {
      mode: permissions.mode,
      areasRead: areasRead.sort(),
      recordsRead: recordsRead.slice(0, 200),
      excludedSensitiveAreas: [
        !permissions.allowLockedNotes && 'locked_notes', !permissions.allowWellness && 'wellness',
        !permissions.allowFinancial && 'financial', !permissions.allowPrivateDocuments && 'private_documents'
      ].filter(Boolean)
    };
    return out;
  }
  function getActionPermissions(options) {
    var permissions = getPermissions(), opts = options || {}, granted = [];
    if (permissions.mode !== 'off') granted.push('workspace.read');
    if (permissions.mode === 'approved_actions' && opts.approved === true) granted.push('workspace.write');
    if (permissions.mode === 'approved_actions' && opts.approved === true && opts.destructiveApproved === true) granted.push('workspace.delete');
    if (opts.pluginApproved === true) granted.push('plugin.execute');
    return granted;
  }
  function describeClaim(kind, value, sources) {
    var types = ['workspace_fact', 'deterministic_inference', 'generative_suggestion'];
    var type = types.indexOf(kind) >= 0 ? kind : 'generative_suggestion';
    return { type: type, value: value, sources: Array.isArray(sources) ? sources.map(function (source) { return clone(source); }).slice(0, 20) : [] };
  }

  var api = { VERSION: '1.0.0', MODES: MODES.slice(), configure: configure, normalize: normalize, getPermissions: getPermissions, canRead: canRead, filterContext: filterContext, getActionPermissions: getActionPermissions, describeClaim: describeClaim };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraAssistantPrivacy = api;
}(typeof window !== 'undefined' ? window : globalThis));
