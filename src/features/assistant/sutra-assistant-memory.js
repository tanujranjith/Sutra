// Sutra Assistant Memory — persistent, local, user-controlled long-term memory.
//
// This is SEPARATE from short-term conversation memory (which is session-only
// and lives in flow-assistant). Assistant Memory persists across sessions as
// part of the Sutra workspace and rides along inside .sutra exports via the
// localStorage key below (registered in ATELIER_RAW_LOCALSTORAGE_KEYS).
//
// Responsibilities:
//   - A consent-first store of stable facts the user asked Sutra to remember
//     (study hours, planning style, goals, course preferences, etc.).
//   - A deterministic sensitivity classifier that BLOCKS secrets/credentials/
//     financial/medical/precise-location content from ever being saved.
//   - Deterministic, explainable retrieval/ranking (keyword + category + link +
//     recency + confidence) — no embeddings, no network, no telemetry.
//   - Core CRUD that returns undo payloads so the assistant's unified Activity
//     + Undo pipeline can reverse memory changes.
//   - A keyboard-accessible Memory Manager UI.
//
// The CRUD/retrieval/classifier core is pure and Node-testable (module.exports);
// the UI is browser-only and guarded. The action plumbing (validate/preview/
// confirm/apply/log) lives in flow-assistant.js, which calls into this module —
// keeping one action pipeline for the whole assistant.
(function () {
    'use strict';

    const VERSION = '1.0.0';
    const STORAGE_KEY = 'sutra:assistantMemory:v1';
    const SCHEMA_VERSION = 1;

    const MAX_CONTENT = 2000;
    const MAX_TITLE = 160;
    const MAX_RECORDS = 500;        // hard ceiling — prevents unbounded growth
    const TEMP_DEFAULT_DAYS = 7;    // default expiry for temporary_context

    const CATEGORIES = [
        'profile_preferences',
        'study_preferences',
        'schedule_constraints',
        'academic_goals',
        'course_context',
        'recurring_commitments',
        'assistant_preferences',
        'project_context',
        'user_notes',
        'temporary_context'
    ];

    const CATEGORY_LABEL = {
        profile_preferences: 'Profile & preferences',
        study_preferences: 'Study preferences',
        schedule_constraints: 'Schedule constraints',
        academic_goals: 'Academic goals',
        course_context: 'Course context',
        recurring_commitments: 'Recurring commitments',
        assistant_preferences: 'Assistant preferences',
        project_context: 'Project context',
        user_notes: 'Notes about you',
        temporary_context: 'Temporary (auto-expires)'
    };

    const SOURCES = ['user_explicit', 'assistant_suggested', 'imported', 'system_generated'];
    const SENSITIVITY = ['normal', 'sensitive', 'blocked'];

    // --------------------------------------------------------------
    // Storage adapter — SutraSafeStorage in the browser, in-memory in Node/tests.
    // No raw localStorage access (keeps architecture guardrails happy).
    // --------------------------------------------------------------
    const memFallback = (function () {
        let data = {};
        return {
            get(key, fb) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fb; },
            set(key, value) { data[key] = value; return { ok: true }; },
            remove(key) { delete data[key]; return { ok: true }; },
            _clear() { data = {}; }
        };
    })();

    let injectedStorage = null;

    function store() {
        if (injectedStorage) return injectedStorage;
        if (typeof window !== 'undefined' && window.SutraSafeStorage
            && typeof window.SutraSafeStorage.get === 'function') {
            const ss = window.SutraSafeStorage;
            return {
                get: (k, fb) => ss.get(k, { fallback: fb }),
                set: (k, v) => ss.set(k, v, { importance: 'important', label: 'Assistant Memory' }),
                remove: (k) => ss.remove(k)
            };
        }
        return memFallback;
    }

    // --------------------------------------------------------------
    // Tiny helpers
    // --------------------------------------------------------------
    function nowIso() { return new Date().toISOString(); }

    function makeId() {
        try {
            if (typeof window !== 'undefined' && typeof window.generateId === 'function') {
                return 'mem_' + window.generateId();
            }
        } catch (e) { /* ignore */ }
        return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function clampStr(value, max) {
        const s = String(value == null ? '' : value).trim();
        return s.length > max ? s.slice(0, max) : s;
    }

    function toIsoDateOrNull(value) {
        if (!value) return null;
        try {
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                const d = new Date(value);
                return Number.isNaN(d.getTime()) ? null : value.slice(0, 10);
            }
            const d = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch (e) { return null; }
    }

    function normalizeForMatch(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function tokenize(text) {
        const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'i', 'my', 'me', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'with', 'that', 'this', 'it', 'you', 'your', 'do', 'does']);
        return normalizeForMatch(text).split(' ').filter(t => t && t.length > 1 && !STOP.has(t));
    }

    // --------------------------------------------------------------
    // Sensitivity classifier — deterministic. 'blocked' must NEVER be stored.
    // --------------------------------------------------------------
    function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

    function classifySensitivity(text) {
        const s = String(text || '');
        const lc = s.toLowerCase();

        // ---- BLOCKED: secrets, credentials, financial, medical, precise GPS ----
        const blocked = [
            /\bpass(?:word|code|phrase)\b/, /\bpin\b\s*(?:is|=|:)/,
            /\bapi[\s_-]?key\b/, /\bsecret\b/, /\b(?:access|refresh|auth|bearer|session)[\s_-]?token\b/,
            /\bsk-[a-z0-9]{8,}/i, /\bghp_[a-z0-9]{8,}/i, /\bxox[bap]-[a-z0-9-]{8,}/i,
            /\bcvv\b|\bcvc\b|\brouting (?:number|no)\b|\biban\b|\bswift code\b/,
            /\bssn\b|\bsocial security\b/,
            /\b(?:diagnos(?:is|ed)|prescription|medication|antidepressant|chemotherapy|blood type|medical record|mental health diagnosis)\b/,
            /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/ // lat,long
        ];
        for (const re of blocked) { if (re.test(lc)) return 'blocked'; }

        // Credit-card / bank-account style long digit runs.
        const longNum = lc.match(/\b[\d][\d -]{11,21}[\d]\b/);
        if (longNum) {
            const d = digitsOnly(longNum[0]);
            if (d.length >= 13 && d.length <= 19) return 'blocked';
        }
        if (/\b(?:bank|card|credit card|debit card) (?:number|no|#)\b/.test(lc)) return 'blocked';

        // ---- SENSITIVE: allowed but flagged (home address, phone, DOB) ----
        const sensitive = [
            /\b\d{1,5}\s+[a-z0-9.\s]{2,40}\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way)\b/,
            /\b\+?\d[\d\s().-]{8,}\d\b/,
            /\b(?:date of birth|dob|birthday)\b/
        ];
        for (const re of sensitive) { if (re.test(lc)) return 'sensitive'; }

        return 'normal';
    }

    // --------------------------------------------------------------
    // Persistence
    // --------------------------------------------------------------
    function readState() {
        const raw = store().get(STORAGE_KEY, null);
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.records)) {
            return { version: SCHEMA_VERSION, records: [] };
        }
        // Normalize each record defensively (old/partial shapes).
        const records = raw.records
            .filter(r => r && typeof r === 'object' && r.id && typeof r.content === 'string')
            .map(normalizeRecord);
        return { version: SCHEMA_VERSION, records };
    }

    function writeState(state) {
        const trimmed = {
            version: SCHEMA_VERSION,
            records: (state.records || []).slice(0, MAX_RECORDS)
        };
        store().set(STORAGE_KEY, trimmed);
        return trimmed;
    }

    function normalizeRecord(r) {
        return {
            id: String(r.id),
            category: CATEGORIES.includes(r.category) ? r.category : 'user_notes',
            title: clampStr(r.title || '', MAX_TITLE),
            content: clampStr(r.content || '', MAX_CONTENT),
            source: SOURCES.includes(r.source) ? r.source : 'user_explicit',
            confidence: typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : 0.8,
            createdAt: r.createdAt || nowIso(),
            updatedAt: r.updatedAt || r.createdAt || nowIso(),
            lastUsedAt: r.lastUsedAt || null,
            expiresAt: toIsoDateOrNull(r.expiresAt),
            links: (r.links && typeof r.links === 'object') ? r.links : {},
            sensitivity: SENSITIVITY.includes(r.sensitivity) ? r.sensitivity : 'normal',
            enabled: r.enabled !== false,
            history: Array.isArray(r.history) ? r.history.slice(-20) : []
        };
    }

    function isExpired(record, ref) {
        if (!record.expiresAt) return false;
        const today = ref || toIsoDateOrNull(new Date());
        return record.expiresAt < today;
    }

    // --------------------------------------------------------------
    // Read API
    // --------------------------------------------------------------
    function getAll() { return readState().records; }

    function get(id) {
        return readState().records.find(r => r.id === id) || null;
    }

    function list(options) {
        const opts = options || {};
        let records = readState().records;
        if (!opts.includeDisabled) records = records.filter(r => r.enabled);
        if (!opts.includeExpired) records = records.filter(r => !isExpired(r));
        if (opts.category) records = records.filter(r => r.category === opts.category);
        if (opts.query) {
            const q = normalizeForMatch(opts.query);
            records = records.filter(r => normalizeForMatch(r.title + ' ' + r.content + ' ' + (CATEGORY_LABEL[r.category] || '')).includes(q));
        }
        return records.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    function stats() {
        const all = getAll();
        return {
            total: all.length,
            enabled: all.filter(r => r.enabled && !isExpired(r)).length,
            disabled: all.filter(r => !r.enabled).length,
            expired: all.filter(r => isExpired(r)).length,
            temporary: all.filter(r => r.category === 'temporary_context').length
        };
    }

    // --------------------------------------------------------------
    // Validation
    // --------------------------------------------------------------
    function validateInput(input, opts) {
        const o = opts || {};
        const i = input || {};
        if (!i.content || !String(i.content).trim()) return { ok: false, error: 'A memory needs some content to remember.' };
        if (String(i.content).length > MAX_CONTENT) return { ok: false, error: `Memory content is too long (max ${MAX_CONTENT} characters).` };
        if (i.category && !CATEGORIES.includes(i.category)) return { ok: false, error: `Unknown memory category: ${i.category}.` };
        if (i.expiresAt && !toIsoDateOrNull(i.expiresAt)) return { ok: false, error: 'Expiry date is not a valid date.' };
        if (i.source && !SOURCES.includes(i.source)) return { ok: false, error: `Unknown memory source: ${i.source}.` };
        const titleSens = i.title ? classifySensitivity(i.title) : 'normal';
        const sens = classifySensitivity(i.content);
        const worst = (titleSens === 'blocked' || sens === 'blocked') ? 'blocked'
            : (titleSens === 'sensitive' || sens === 'sensitive') ? 'sensitive' : 'normal';
        if (worst === 'blocked' && !o.allowBlocked) {
            return { ok: false, blocked: true, error: 'That looks like sensitive or secret information (a credential, financial, medical, or precise-location detail). For your safety, Sutra will not save it to memory.' };
        }
        return { ok: true, sensitivity: worst };
    }

    // --------------------------------------------------------------
    // Mutations — each returns { ok, ... , undo } so the assistant's unified
    // Activity/Undo pipeline can reverse them via applyUndo().
    // --------------------------------------------------------------
    function create(input, options) {
        const opts = options || {};
        const v = validateInput(input, opts);
        if (!v.ok) return v;

        const state = readState();
        const category = CATEGORIES.includes(input.category) ? input.category : 'user_notes';
        const content = clampStr(input.content, MAX_CONTENT);

        // Light dedupe: an enabled record in the same category with identical
        // normalized content is updated in place rather than duplicated.
        const norm = normalizeForMatch(content);
        const dup = state.records.find(r => r.enabled && r.category === category && normalizeForMatch(r.content) === norm);
        if (dup) {
            const before = JSON.parse(JSON.stringify(dup));
            dup.updatedAt = nowIso();
            if (input.title) dup.title = clampStr(input.title, MAX_TITLE);
            dup.history = (dup.history || []).concat([{ at: nowIso(), action: 'reaffirmed' }]).slice(-20);
            writeState(state);
            return { ok: true, record: dup, deduped: true, message: 'Already remembered — kept it up to date.', undo: { kind: 'memory', op: 'update', id: dup.id, before } };
        }

        let expiresAt = toIsoDateOrNull(input.expiresAt);
        if (!expiresAt && Number(input.expiresInDays) > 0) {
            const d = new Date(); d.setDate(d.getDate() + Number(input.expiresInDays));
            expiresAt = toIsoDateOrNull(d);
        }
        if (!expiresAt && category === 'temporary_context') {
            const d = new Date(); d.setDate(d.getDate() + TEMP_DEFAULT_DAYS);
            expiresAt = toIsoDateOrNull(d);
        }

        const links = {};
        ['courseId', 'courseName', 'feature', 'noteId', 'taskId', 'projectId'].forEach(k => {
            if (input[k]) links[k] = String(input[k]).slice(0, 120);
            if (input.links && input.links[k]) links[k] = String(input.links[k]).slice(0, 120);
        });

        const source = SOURCES.includes(input.source) ? input.source : 'user_explicit';
        let confidence = Number(input.confidence);
        if (!(confidence >= 0 && confidence <= 1)) confidence = source === 'user_explicit' ? 0.95 : 0.6;

        const record = normalizeRecord({
            id: makeId(),
            category,
            title: input.title || deriveTitle(content),
            content,
            source,
            confidence,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            lastUsedAt: null,
            expiresAt,
            links,
            sensitivity: v.sensitivity,
            enabled: true,
            history: [{ at: nowIso(), action: 'created', source }]
        });
        state.records.unshift(record);
        writeState(state);
        return { ok: true, record, message: 'Saved to memory.', undo: { kind: 'memory', op: 'create', id: record.id } };
    }

    function deriveTitle(content) {
        const s = String(content || '').trim().replace(/\s+/g, ' ');
        if (s.length <= 60) return s;
        return s.slice(0, 57).trimEnd() + '…';
    }

    function update(id, patch, options) {
        const opts = options || {};
        const state = readState();
        const rec = state.records.find(r => r.id === id);
        if (!rec) return { ok: false, error: 'That memory no longer exists.' };
        const before = JSON.parse(JSON.stringify(rec));

        const next = Object.assign({}, rec);
        if (patch.content != null) next.content = clampStr(patch.content, MAX_CONTENT);
        if (patch.title != null) next.title = clampStr(patch.title, MAX_TITLE);
        if (patch.category != null) next.category = patch.category;
        if (patch.confidence != null) next.confidence = patch.confidence;
        if (patch.expiresAt !== undefined) next.expiresAt = patch.expiresAt;
        if (patch.links) next.links = Object.assign({}, rec.links, patch.links);
        if (patch.enabled != null) next.enabled = !!patch.enabled;

        const v = validateInput({ content: next.content, title: next.title, category: next.category, expiresAt: next.expiresAt }, opts);
        if (!v.ok) return v;
        next.sensitivity = v.sensitivity;
        next.updatedAt = nowIso();
        next.history = (rec.history || []).concat([{ at: nowIso(), action: 'updated' }]).slice(-20);

        Object.assign(rec, normalizeRecord(next));
        writeState(state);
        return { ok: true, record: rec, message: 'Memory updated.', undo: { kind: 'memory', op: 'update', id: rec.id, before } };
    }

    // A memory's content is treated as a list of "details" (one per line) so the
    // user can add or remove individual items without rewriting the whole thing.
    function splitLines(content) {
        return String(content || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }
    function memoryLines(id) {
        const rec = get(id);
        return rec ? splitLines(rec.content) : [];
    }

    // Append one detail (line) to an existing memory. Re-runs the sensitivity
    // guard on the addition and reuses update() so undo + validation are free.
    function appendDetail(id, text, options) {
        const rec = get(id);
        if (!rec) return { ok: false, error: 'That memory no longer exists.' };
        const addition = String(text == null ? '' : text).trim();
        if (!addition) return { ok: false, error: 'Type a detail to add.' };
        if (classifySensitivity(addition) === 'blocked' && !(options && options.allowBlocked)) {
            return { ok: false, blocked: true, error: 'That detail looks sensitive or secret (a credential, financial, medical, or precise-location detail). Sutra won\'t add it to memory.' };
        }
        const lines = splitLines(rec.content);
        if (lines.some(l => normalizeForMatch(l) === normalizeForMatch(addition))) {
            return { ok: true, record: rec, message: 'Already noted in this memory.', undo: null };
        }
        const newContent = lines.concat([addition]).join('\n');
        if (newContent.length > MAX_CONTENT) return { ok: false, error: `That would make the memory too long (max ${MAX_CONTENT} characters).` };
        const res = update(id, { content: newContent }, options);
        if (res.ok) res.message = 'Added that detail.';
        return res;
    }

    // Remove one detail (line) from a memory, by exact/loose text match or index.
    function removeDetail(id, target, options) {
        const rec = get(id);
        if (!rec) return { ok: false, error: 'That memory no longer exists.' };
        const lines = splitLines(rec.content);
        let idx = -1;
        if (typeof target === 'number') {
            idx = target;
        } else {
            const norm = normalizeForMatch(target);
            idx = lines.findIndex(l => normalizeForMatch(l) === norm);
            if (idx === -1 && norm.length > 2) idx = lines.findIndex(l => normalizeForMatch(l).includes(norm));
        }
        if (idx < 0 || idx >= lines.length) return { ok: false, error: 'That detail isn\'t in this memory.' };
        if (lines.length <= 1) return { ok: false, error: 'This memory has a single detail — edit its text or forget it instead.' };
        lines.splice(idx, 1);
        const res = update(id, { content: lines.join('\n') }, options);
        if (res.ok) res.message = 'Removed that detail.';
        return res;
    }

    function setEnabled(id, enabled) {
        const state = readState();
        const rec = state.records.find(r => r.id === id);
        if (!rec) return { ok: false, error: 'That memory no longer exists.' };
        const before = rec.enabled;
        if (before === !!enabled) return { ok: true, record: rec, message: enabled ? 'Already enabled.' : 'Already disabled.', undo: null };
        rec.enabled = !!enabled;
        rec.updatedAt = nowIso();
        rec.history = (rec.history || []).concat([{ at: nowIso(), action: enabled ? 'enabled' : 'disabled' }]).slice(-20);
        writeState(state);
        return { ok: true, record: rec, message: enabled ? 'Memory re-enabled.' : 'Memory disabled (kept, but no longer used).', undo: { kind: 'memory', op: enabled ? 'disable' : 'enable', id: rec.id } };
    }

    function enable(id) { return setEnabled(id, true); }
    function disable(id) { return setEnabled(id, false); }

    function remove(id) {
        const state = readState();
        const idx = state.records.findIndex(r => r.id === id);
        if (idx === -1) return { ok: false, error: 'That memory no longer exists.' };
        const [removed] = state.records.splice(idx, 1);
        writeState(state);
        return { ok: true, removed, message: 'Memory forgotten.', undo: { kind: 'memory', op: 'delete', records: [removed] } };
    }

    function removeMany(ids) {
        const set = new Set((ids || []).map(String));
        const state = readState();
        const removed = state.records.filter(r => set.has(r.id));
        if (!removed.length) return { ok: false, error: 'No matching memories to forget.' };
        state.records = state.records.filter(r => !set.has(r.id));
        writeState(state);
        return { ok: true, removed, count: removed.length, message: `Forgot ${removed.length} ${removed.length === 1 ? 'memory' : 'memories'}.`, undo: { kind: 'memory', op: 'delete', records: removed } };
    }

    function clearExpired() {
        const state = readState();
        const removed = state.records.filter(r => isExpired(r));
        if (!removed.length) return { ok: true, removed: [], count: 0, message: 'No expired memories to clear.', undo: null };
        state.records = state.records.filter(r => !isExpired(r));
        writeState(state);
        return { ok: true, removed, count: removed.length, message: `Cleared ${removed.length} expired ${removed.length === 1 ? 'memory' : 'memories'}.`, undo: { kind: 'memory', op: 'delete', records: removed } };
    }

    function clearTemporary() {
        const state = readState();
        const removed = state.records.filter(r => r.category === 'temporary_context');
        if (!removed.length) return { ok: true, removed: [], count: 0, message: 'No temporary memories to clear.', undo: null };
        state.records = state.records.filter(r => r.category !== 'temporary_context');
        writeState(state);
        return { ok: true, removed, count: removed.length, message: `Cleared ${removed.length} temporary ${removed.length === 1 ? 'memory' : 'memories'}.`, undo: { kind: 'memory', op: 'delete', records: removed } };
    }

    // Reverse a previously-returned undo payload. Used by the assistant's
    // unified undo (applyUndoPayload in flow-assistant delegates here).
    function applyUndo(undoPayload) {
        if (!undoPayload || undoPayload.kind !== 'memory') return 0;
        const state = readState();
        let n = 0;
        if (undoPayload.op === 'create') {
            const idx = state.records.findIndex(r => r.id === undoPayload.id);
            if (idx >= 0) { state.records.splice(idx, 1); n = 1; }
        } else if (undoPayload.op === 'delete' && Array.isArray(undoPayload.records)) {
            undoPayload.records.forEach(r => {
                if (!state.records.some(x => x.id === r.id)) { state.records.push(normalizeRecord(r)); n += 1; }
            });
        } else if (undoPayload.op === 'update' && undoPayload.before) {
            const rec = state.records.find(r => r.id === undoPayload.id);
            if (rec) { Object.assign(rec, normalizeRecord(undoPayload.before)); n = 1; }
        } else if (undoPayload.op === 'enable' || undoPayload.op === 'disable') {
            // op names the inverse to apply: 'enable' means "re-enable" (it was disabled).
            const rec = state.records.find(r => r.id === undoPayload.id);
            if (rec) { rec.enabled = undoPayload.op === 'enable'; n = 1; }
        }
        if (n) writeState(state);
        return n;
    }

    // --------------------------------------------------------------
    // Retrieval — deterministic, explainable. Returns a SMALL relevant set.
    // --------------------------------------------------------------
    const CATEGORY_HINTS = {
        study_preferences: ['study', 'studying', 'review', 'focus', 'flashcard', 'homework', 'learn'],
        schedule_constraints: ['schedule', 'time', 'busy', 'free', 'available', 'morning', 'evening', 'night', 'weekend', 'plan', 'when'],
        academic_goals: ['goal', 'gpa', 'grade', 'target', 'college', 'aim', 'want'],
        course_context: ['class', 'course', 'teacher', 'subject', 'exam', 'test', 'ap'],
        recurring_commitments: ['practice', 'club', 'work', 'shift', 'every', 'weekly', 'commitment', 'meeting'],
        assistant_preferences: ['explain', 'tone', 'style', 'concise', 'detailed', 'answer', 'response'],
        project_context: ['project', 'essay', 'paper', 'build', 'app', 'research'],
        profile_preferences: ['name', 'call me', 'prefer', 'pronoun'],
        temporary_context: ['today', 'this week', 'reminder', 'temporarily']
    };

    function inferCategories(query, context) {
        const q = normalizeForMatch(query);
        const set = new Set();
        Object.keys(CATEGORY_HINTS).forEach(cat => {
            if (CATEGORY_HINTS[cat].some(h => q.includes(h))) set.add(cat);
        });
        if (context && context.feature) {
            if (/grade/.test(context.feature)) set.add('academic_goals');
            if (/review|study|ap/.test(context.feature)) set.add('study_preferences');
            if (/timeline|plan/.test(context.feature)) set.add('schedule_constraints');
            if (/course/.test(context.feature)) set.add('course_context');
        }
        return set;
    }

    function daysSince(iso, ref) {
        if (!iso) return Infinity;
        const a = new Date(iso).getTime();
        const b = (ref ? new Date(ref) : new Date()).getTime();
        if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
        return Math.max(0, Math.round((b - a) / 86400000));
    }

    // retrieve(query, context, options) → [{ record, score, reasons }]
    function retrieve(query, context, options) {
        const opts = options || {};
        const ctx = context || {};
        const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
        const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 1;

        const candidates = readState().records.filter(r => r.enabled && !isExpired(r));
        const qTokens = tokenize(query);
        const inferred = inferCategories(query, ctx);

        const scored = candidates.map(r => {
            let score = 0;
            const reasons = [];
            const hay = normalizeForMatch(r.title + ' ' + r.content + ' ' + (CATEGORY_LABEL[r.category] || ''));

            // Keyword overlap.
            if (qTokens.length) {
                let hits = 0;
                qTokens.forEach(t => { if (hay.includes(t)) hits += 1; });
                if (hits) { score += hits * 2; reasons.push(`matches "${qTokens.filter(t => hay.includes(t)).slice(0, 3).join(', ')}"`); }
            }
            // Category relevance.
            if (inferred.has(r.category)) { score += 2; reasons.push(`relevant ${CATEGORY_LABEL[r.category] || r.category}`); }
            // Link relevance.
            if (ctx.courseId && r.links && r.links.courseId && String(r.links.courseId) === String(ctx.courseId)) { score += 3; reasons.push('linked to this course'); }
            if (ctx.feature && r.links && r.links.feature && String(r.links.feature) === String(ctx.feature)) { score += 2; reasons.push('linked to this area'); }
            if (ctx.projectId && r.links && r.links.projectId && String(r.links.projectId) === String(ctx.projectId)) { score += 3; reasons.push('linked to this project'); }
            // Recency.
            const age = daysSince(r.updatedAt);
            if (age <= 7) score += 1.5; else if (age <= 30) score += 0.5;
            // Confidence + source.
            score += (r.confidence || 0);
            if (r.source === 'user_explicit') score += 0.5;

            return { record: r, score: Math.round(score * 100) / 100, reasons };
        });

        return scored
            .filter(x => x.score >= minScore)
            .sort((a, b) => b.score - a.score || String(b.record.updatedAt).localeCompare(String(a.record.updatedAt)))
            .slice(0, limit);
    }

    // Compact snippets for provider prompt injection (never dump everything).
    function buildPromptSnippets(query, context, options) {
        const opts = options || {};
        const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 5;
        const hits = retrieve(query, context, { limit });
        return hits.map(h => ({
            id: h.record.id,
            text: `(${CATEGORY_LABEL[h.record.category] || h.record.category}) ${h.record.title ? h.record.title + ': ' : ''}${h.record.content}`.slice(0, 220)
        }));
    }

    function recordUsed(ids) {
        const set = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
        if (!set.size) return 0;
        const state = readState();
        let n = 0;
        state.records.forEach(r => { if (set.has(r.id)) { r.lastUsedAt = nowIso(); n += 1; } });
        if (n) writeState(state);
        return n;
    }

    // "What do you remember about me?" — accurate, grouped, manageable view.
    function describeAll() {
        const enabled = list({});
        if (!enabled.length) {
            return 'I don\'t have any saved memories about you yet. Tell me something to remember (for example "remember that I study best in the morning"), and I\'ll keep it — you can manage or delete it anytime.';
        }
        const byCat = {};
        enabled.forEach(r => { (byCat[r.category] = byCat[r.category] || []).push(r); });
        const lines = [`Here's what I remember about you (${enabled.length} ${enabled.length === 1 ? 'memory' : 'memories'}). You can edit, disable, or forget any of these in the Memory manager:`, ''];
        CATEGORIES.forEach(cat => {
            const items = byCat[cat];
            if (!items || !items.length) return;
            lines.push(`**${CATEGORY_LABEL[cat] || cat}**`);
            items.forEach(r => lines.push(`- ${r.title || r.content}${r.expiresAt ? ` _(expires ${r.expiresAt})_` : ''}`));
            lines.push('');
        });
        return lines.join('\n').trim();
    }

    // --------------------------------------------------------------
    // Memory Manager UI (browser-only). Built with createElement/textContent
    // (no innerHTML) so user content can never inject markup.
    // --------------------------------------------------------------
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    let managerState = { query: '', category: '', editingId: null };

    function openManager(options) {
        if (typeof document === 'undefined') return null;
        const opts = options || {};
        managerState = { query: '', category: opts.category || '', editingId: null };
        let overlay = document.getElementById('sutraMemoryOverlay');
        if (overlay) overlay.remove();
        overlay = el('div', 'flow-modal-overlay sutra-memory-overlay');
        overlay.id = 'sutraMemoryOverlay';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });

        const modal = el('div', 'flow-modal sutra-memory-modal');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Assistant Memory');

        const head = el('div', 'flow-modal-head');
        head.appendChild(el('strong', null, 'Assistant Memory'));
        const headBtns = el('div');
        const addBtn = el('button', 'sutra-mem-add', '+ Add memory');
        addBtn.type = 'button';
        addBtn.addEventListener('click', () => { managerState.editingId = '__new__'; renderBody(); });
        const closeBtn = el('button', 'flow-modal-close', 'Close');
        closeBtn.type = 'button';
        closeBtn.setAttribute('data-modal-close', '');
        closeBtn.addEventListener('click', () => overlay.remove());
        headBtns.appendChild(addBtn);
        headBtns.appendChild(closeBtn);
        head.appendChild(headBtns);
        modal.appendChild(head);

        const body = el('div', 'flow-modal-body sutra-memory-body');
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function renderBody() {
            body.textContent = '';

            // Explainer
            const note = el('p', 'sutra-mem-explain');
            note.textContent = 'Sutra Assistant remembers stable facts you ask it to keep (study habits, goals, preferences) to personalize help across sessions. It never saves passwords, keys, financial, medical, precise-location, or locked-note content. Everything here is local and travels inside encrypted .sutra backups.';
            body.appendChild(note);

            // Controls
            const controls = el('div', 'sutra-mem-controls');
            const searchWrap = el('div', 'sutra-mem-search');
            const search = el('input', 'sutra-mem-search-input');
            search.type = 'search';
            search.placeholder = 'Search memories…';
            search.value = managerState.query;
            search.setAttribute('aria-label', 'Search memories');
            search.addEventListener('input', () => { managerState.query = search.value; renderList(); });
            searchWrap.appendChild(search);

            const filter = el('select', 'sutra-mem-filter');
            filter.setAttribute('aria-label', 'Filter by category');
            const allOpt = el('option', null, 'All categories'); allOpt.value = '';
            filter.appendChild(allOpt);
            CATEGORIES.forEach(c => { const o = el('option', null, CATEGORY_LABEL[c] || c); o.value = c; if (c === managerState.category) o.selected = true; filter.appendChild(o); });
            filter.addEventListener('change', () => { managerState.category = filter.value; renderList(); });

            controls.appendChild(searchWrap);
            controls.appendChild(filter);

            const clearTemp = el('button', 'sutra-mem-clear', 'Clear temporary');
            clearTemp.type = 'button';
            clearTemp.title = 'Forget all auto-expiring temporary memories';
            clearTemp.addEventListener('click', () => { const r = clearTemporary(); toast(r.message); renderBody(); });
            controls.appendChild(clearTemp);

            const clearExp = el('button', 'sutra-mem-clear', 'Clear expired');
            clearExp.type = 'button';
            clearExp.addEventListener('click', () => { const r = clearExpired(); toast(r.message); renderBody(); });
            controls.appendChild(clearExp);

            body.appendChild(controls);

            // Editor (new / edit)
            if (managerState.editingId) {
                body.appendChild(buildEditor(managerState.editingId === '__new__' ? null : get(managerState.editingId), renderBody));
            }

            const listHost = el('div', 'sutra-mem-list');
            listHost.id = 'sutraMemListHost';
            body.appendChild(listHost);
            renderList();

            function renderList() {
                const host = document.getElementById('sutraMemListHost');
                if (!host) return;
                host.textContent = '';
                const records = list({ includeDisabled: true, includeExpired: true, query: managerState.query, category: managerState.category });
                if (!records.length) {
                    host.appendChild(el('div', 'flow-act-empty', 'No memories yet. Use “+ Add memory”, or tell the assistant “remember that…”.'));
                    return;
                }
                records.forEach(r => host.appendChild(buildRow(r, renderBody)));
            }
        }

        function buildRow(r, rerender) {
            const row = el('div', 'sutra-mem-row');
            if (!r.enabled) row.classList.add('is-disabled');
            if (isExpired(r)) row.classList.add('is-expired');

            const main = el('div', 'sutra-mem-row-main');
            const title = el('div', 'sutra-mem-title', r.title || r.content);
            main.appendChild(title);
            const meta = el('div', 'sutra-mem-meta');
            meta.appendChild(el('span', 'sutra-mem-cat', CATEGORY_LABEL[r.category] || r.category));
            if (r.sensitivity === 'sensitive') meta.appendChild(el('span', 'sutra-mem-flag', 'sensitive'));
            if (r.expiresAt) meta.appendChild(el('span', 'sutra-mem-exp', (isExpired(r) ? 'expired ' : 'expires ') + r.expiresAt));
            if (!r.enabled) meta.appendChild(el('span', 'sutra-mem-off', 'disabled'));
            main.appendChild(meta);
            if (r.content && r.content !== r.title) main.appendChild(el('div', 'sutra-mem-content', r.content));
            row.appendChild(main);

            const acts = el('div', 'sutra-mem-actions');
            const toggle = el('button', 'sutra-mem-btn', r.enabled ? 'Disable' : 'Enable');
            toggle.type = 'button';
            toggle.addEventListener('click', () => { setEnabled(r.id, !r.enabled); rerender(); });
            acts.appendChild(toggle);

            const edit = el('button', 'sutra-mem-btn', 'Edit');
            edit.type = 'button';
            edit.addEventListener('click', () => { managerState.editingId = r.id; rerender(); });
            acts.appendChild(edit);

            const del = el('button', 'sutra-mem-btn sutra-mem-danger', 'Forget');
            del.type = 'button';
            del.addEventListener('click', () => {
                if (del.dataset.confirm === '1') { remove(r.id); rerender(); }
                else { del.dataset.confirm = '1'; del.textContent = 'Confirm forget'; setTimeout(() => { del.dataset.confirm = ''; del.textContent = 'Forget'; }, 3500); }
            });
            acts.appendChild(del);
            row.appendChild(acts);
            return row;
        }

        function buildEditor(record, rerender) {
            const form = el('form', 'sutra-mem-editor');
            form.appendChild(el('div', 'sutra-mem-editor-title', record ? 'Edit memory' : 'New memory'));

            const catSel = el('select', 'sutra-mem-editor-cat');
            catSel.setAttribute('aria-label', 'Memory category');
            CATEGORIES.forEach(c => { const o = el('option', null, CATEGORY_LABEL[c] || c); o.value = c; if (record && record.category === c) o.selected = true; if (!record && c === 'user_notes') o.selected = true; catSel.appendChild(o); });

            const titleIn = el('input', 'sutra-mem-editor-input');
            titleIn.type = 'text'; titleIn.placeholder = 'Short label (optional)'; titleIn.maxLength = MAX_TITLE;
            titleIn.setAttribute('aria-label', 'Memory label');
            if (record) titleIn.value = record.title || '';

            const contentIn = el('textarea', 'sutra-mem-editor-textarea');
            contentIn.placeholder = 'What should Sutra remember?'; contentIn.rows = 3; contentIn.maxLength = MAX_CONTENT;
            contentIn.setAttribute('aria-label', 'Memory content');
            if (record) contentIn.value = record.content || '';

            const err = el('div', 'sutra-mem-editor-err');
            err.setAttribute('role', 'alert');

            const btns = el('div', 'sutra-mem-editor-btns');
            const save = el('button', 'sutra-mem-btn sutra-mem-primary', 'Save');
            save.type = 'submit';
            const cancel = el('button', 'sutra-mem-btn', 'Cancel');
            cancel.type = 'button';
            cancel.addEventListener('click', () => { managerState.editingId = null; rerender(); });
            btns.appendChild(save); btns.appendChild(cancel);

            form.appendChild(catSel);
            form.appendChild(titleIn);
            form.appendChild(contentIn);

            // Per-detail add/remove (existing memories only). Lets the user grow
            // or prune a memory item-by-item without rewriting the whole text.
            // These persist immediately, so they live below the deferred Save.
            if (record) {
                const details = el('div', 'sutra-mem-details');
                details.appendChild(el('div', 'sutra-mem-details-title', 'Details — add or remove individually'));
                const lines = memoryLines(record.id);
                const listEl = el('div', 'sutra-mem-details-list');
                if (lines.length <= 1) {
                    listEl.appendChild(el('div', 'sutra-mem-details-hint', 'This memory is a single detail. Add another below to manage them as a list.'));
                }
                lines.forEach((line, i) => {
                    const row = el('div', 'sutra-mem-detail-row');
                    row.appendChild(el('span', 'sutra-mem-detail-text', line));
                    const rm = el('button', 'sutra-mem-detail-x', '✕');
                    rm.type = 'button';
                    rm.setAttribute('aria-label', 'Remove detail: ' + line);
                    rm.title = 'Remove this detail';
                    rm.addEventListener('click', () => {
                        const res = removeDetail(record.id, i);
                        if (!res.ok) { err.textContent = res.error || 'Could not remove.'; return; }
                        rerender(); toast(res.message || 'Removed.');
                    });
                    row.appendChild(rm);
                    listEl.appendChild(row);
                });
                details.appendChild(listEl);

                const addWrap = el('div', 'sutra-mem-detail-add');
                const addIn = el('input', 'sutra-mem-editor-input');
                addIn.type = 'text'; addIn.placeholder = 'Add a detail…'; addIn.maxLength = MAX_CONTENT;
                addIn.setAttribute('aria-label', 'Add a detail to this memory');
                const addBtn = el('button', 'sutra-mem-btn', 'Add');
                addBtn.type = 'button';
                const doAdd = () => {
                    const val = addIn.value.trim();
                    if (!val) { addIn.focus(); return; }
                    const res = appendDetail(record.id, val);
                    if (!res.ok) { err.textContent = res.error || 'Could not add.'; return; }
                    rerender(); toast(res.message || 'Added.');
                };
                addBtn.addEventListener('click', doAdd);
                addIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
                addWrap.appendChild(addIn); addWrap.appendChild(addBtn);
                details.appendChild(addWrap);
                form.appendChild(details);
            }

            form.appendChild(err);
            form.appendChild(btns);

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                err.textContent = '';
                const payload = { category: catSel.value, title: titleIn.value, content: contentIn.value, source: 'user_explicit' };
                const res = record ? update(record.id, payload) : create(payload);
                if (!res.ok) { err.textContent = res.error || 'Could not save.'; return; }
                managerState.editingId = null;
                rerender();
                toast(res.message || 'Saved.');
            });

            setTimeout(() => contentIn.focus(), 10);
            return form;
        }

        renderBody();
        setTimeout(() => { const c = overlay.querySelector('.flow-modal-close'); if (c) c.focus(); }, 20);
        return overlay;
    }

    function toast(msg) {
        try { if (typeof window !== 'undefined' && typeof window.showToast === 'function') window.showToast(msg); } catch (e) { /* ignore */ }
    }

    // --------------------------------------------------------------
    // Public surface
    // --------------------------------------------------------------
    const api = {
        VERSION, STORAGE_KEY, SCHEMA_VERSION,
        CATEGORIES: CATEGORIES.slice(),
        CATEGORY_LABEL,
        SOURCES: SOURCES.slice(),
        SENSITIVITY: SENSITIVITY.slice(),
        MAX_CONTENT, MAX_TITLE,
        // read
        getAll, get, list, stats,
        // validate / classify
        validateInput, classifySensitivity,
        // mutate (each returns an undo payload)
        create, update, enable, disable, setEnabled, remove, removeMany,
        clearExpired, clearTemporary, applyUndo,
        // per-detail editing (add / remove individual lines)
        appendDetail, removeDetail, memoryLines,
        // retrieval
        retrieve, buildPromptSnippets, recordUsed, inferCategories, describeAll,
        // UI
        openManager,
        // test hooks
        __setStorageForTests(stub) { injectedStorage = stub || null; },
        __resetForTests() { injectedStorage = null; memFallback._clear(); }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.SutraAssistantMemory = api;
    }
})();
