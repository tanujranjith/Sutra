/* ==========================================================================
   Sutra Planning Engine — deterministic, conflict-aware plan & repair
   ==========================================================================
   Pure functions (no AI, no DOM) that turn open work + free time into a
   PREVIEW of timeline blocks the student approves block-by-block, and that
   inspect an existing plan for problems ("Repair my plan").

   The core takes plain data so it runs in Node for tests:
     - work items:        [{id,kind,title,courseName?,dueDate,dueTime?,priority,
                            difficulty,estimateMinutes?}]
     - freeWindowsByDate: { 'YYYY-MM-DD': [{start,end}] }   (minutes from midnight)
     - prefs:             { studyBlockMinutes, breakMinutes, maxDailyBlocks,
                            maxBlockMinutes }
   The browser adapter (bottom) gathers the real inputs from the existing app
   helpers (getFreeWindowsForDateKey, deriveStudentContext, studentPreferences)
   and renders the preview. Nothing is written until the student approves.
   ========================================================================== */

/* global window, document */

(function (global) {
    'use strict';

    // ---- time helpers (minutes-from-midnight) ----------------------------------
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function minutesToHHMM(min) {
        var m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
        return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
    }
    function hhmmToMinutes(str) {
        var match = /^(\d{1,2}):(\d{2})$/.exec(String(str || ''));
        if (!match) return null;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    function parseISO(iso) { var d = new Date(String(iso) + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; }
    function isoLocal(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function daysBetween(a, b) {
        var da = parseISO(a), db = parseISO(b);
        if (!da || !db) return null;
        return Math.round((db.getTime() - da.getTime()) / 86400000);
    }

    var DEFAULT_PREFS = {
        studyBlockMinutes: 45,
        breakMinutes: 10,
        maxDailyBlocks: 4,
        maxBlockMinutes: 90
    };

    function resolvePrefs(prefs) {
        prefs = prefs || {};
        return {
            studyBlockMinutes: clampInt(prefs.studyBlockMinutes, 10, 180, DEFAULT_PREFS.studyBlockMinutes),
            breakMinutes: clampInt(prefs.breakMinutes, 0, 60, DEFAULT_PREFS.breakMinutes),
            maxDailyBlocks: clampInt(prefs.maxDailyBlocks, 1, 12, DEFAULT_PREFS.maxDailyBlocks),
            maxBlockMinutes: clampInt(prefs.maxBlockMinutes, 30, 240, DEFAULT_PREFS.maxBlockMinutes),
            // Spread an item's chunks across the available days before its due date
            // instead of cramming them into the earliest slots (anti-clustering).
            spread: prefs.spread !== false
        };
    }
    function clampInt(v, lo, hi, dflt) {
        var n = Number(v);
        if (!Number.isFinite(n)) return dflt;
        return Math.max(lo, Math.min(hi, Math.round(n)));
    }

    // Urgency score for ordering — overdue first, then soonest due, then priority/difficulty.
    function itemScore(item, today) {
        var score = 0;
        var d = daysBetween(today, item.dueDate);
        if (item.dueDate && d !== null) {
            if (d < 0) score += 200 + Math.min(50, -d * 5);   // overdue
            else if (d === 0) score += 150;
            else if (d === 1) score += 110;
            else if (d <= 3) score += 80;
            else if (d <= 7) score += 55;
            else score += 30;
        } else {
            score += 20;
        }
        if (item.priority === 'high') score += 30; else if (item.priority === 'low') score -= 10;
        if (item.difficulty === 'hard') score += 16; else if (item.difficulty === 'easy') score -= 6;
        return score;
    }

    // Split a total estimate into block-sized chunks (prefer milestone-sized pieces,
    // never one huge block for a hard assignment).
    function chunkMinutes(total, prefs, preferred) {
        var t = Number(total);
        if (!Number.isFinite(t) || t <= 0) t = prefs.studyBlockMinutes;
        t = Math.max(15, Math.min(12 * 60, Math.round(t)));
        // A `preferred` chunk size (e.g. one exam-study session) splits the work
        // into more, smaller pieces that the spreader can distribute across days.
        var max = (preferred && preferred > 0)
            ? Math.max(15, Math.min(prefs.maxBlockMinutes, Math.round(preferred)))
            : prefs.maxBlockMinutes;
        var maxChunks = preferred ? 12 : 6;
        var chunks = [];
        while (t > 0) {
            var c = Math.min(max, t);
            // avoid leaving a tiny sliver — merge if remainder is small
            if (t - c > 0 && t - c < 15) c = t;
            chunks.push(c);
            t -= c;
            if (chunks.length >= maxChunks) { // cap blocks per item
                if (t > 0) chunks[chunks.length - 1] += t;
                break;
            }
        }
        return chunks;
    }

    // Turn upcoming exams into spread-out study work: one item per exam, split
    // into session-sized chunks so the planner distributes review across the days
    // BEFORE the exam (reverse scheduling). More runway / lower confidence => more
    // sessions. Pure; returns planWork-shaped items.
    function expandExamPrep(exams, options) {
        options = options || {};
        var today = options.today || isoLocal(new Date());
        var sessionMinutes = clampInt(options.sessionMinutes, 15, 120, 45);
        var out = [];
        (Array.isArray(exams) ? exams : []).forEach(function (ex) {
            if (!ex) return;
            var examDate = ex.examDate || ex.dueDate || '';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(examDate))) return;
            var days = daysBetween(today, examDate);
            if (days === null || days < 0) return; // past or invalid
            var conf = Number(ex.confidence);
            var confFactor = Number.isFinite(conf) ? (conf <= 2 ? 1.5 : (conf >= 4 ? 0.7 : 1)) : 1;
            var base = Math.min(8, Math.max(1, Math.ceil((days + 1) / 2)));
            var sessions = Math.max(1, Math.round(base * confFactor));
            sessions = Math.min(sessions, Math.max(1, days + 1)); // at most ~one per day
            out.push({
                id: (ex.id || ex.name || 'exam') + ':prep',
                kind: 'review',
                title: 'Study ' + (ex.name || 'exam'),
                courseName: ex.name || '',
                dueDate: examDate,
                priority: (Number.isFinite(conf) && conf <= 2) ? 'high' : 'medium',
                difficulty: 'medium',
                estimateMinutes: sessions * sessionMinutes,
                preferredChunkMinutes: sessionMinutes,
                examPrep: true
            });
        });
        return out;
    }

    // Subtract [s, e] (plus trailing buffer) from a list of free windows in place,
    // returning a new windows array. Guarantees later placements never overlap.
    function carveWindow(windows, s, e, buffer) {
        var out = [];
        var blockEnd = e + (buffer || 0);
        windows.forEach(function (w) {
            if (blockEnd <= w.start || s >= w.end) { out.push({ start: w.start, end: w.end }); return; }
            if (s > w.start) out.push({ start: w.start, end: Math.min(s, w.end) });
            if (blockEnd < w.end) out.push({ start: Math.max(blockEnd, w.start), end: w.end });
        });
        return out.filter(function (w) { return w.end - w.start >= 15; });
    }

    // Find the earliest free slot of `duration` minutes in a day's windows. When
    // `maxEnd` is given (the due-time cap on a due date), the slot must finish by it.
    function findSlot(windows, duration, maxEnd) {
        for (var i = 0; i < windows.length; i++) {
            var w = windows[i];
            var limit = (typeof maxEnd === 'number') ? Math.min(w.end, maxEnd) : w.end;
            if (limit - w.start >= duration) {
                return { start: w.start, end: w.start + duration };
            }
        }
        return null;
    }

    function reasonFor(item, today, placedDate) {
        var bits = [];
        var d = item.dueDate ? daysBetween(today, item.dueDate) : null;
        if (d !== null && d < 0) bits.push('overdue by ' + (-d) + ' day' + (-d === 1 ? '' : 's'));
        else if (d === 0) bits.push('due today');
        else if (d === 1) bits.push('due tomorrow');
        else if (d !== null && d <= 7) bits.push('due in ' + d + ' days');
        else if (item.dueDate) bits.push('due ' + item.dueDate);
        if (item.priority === 'high') bits.push('high priority');
        if (item.difficulty === 'hard') bits.push('hard');
        if (item.calibrated) bits.push('sized from your logged times');
        if (placedDate && item.dueDate && placedDate < item.dueDate) bits.push('placed early to leave a buffer');
        return bits.length ? bits.join(', ') : 'open work';
    }

    function validDateKey(value) {
        var key = String(value || '').slice(0, 10);
        var parsed = /^\d{4}-\d{2}-\d{2}$/.test(key) ? parseISO(key) : null;
        return parsed && isoLocal(parsed) === key ? key : '';
    }

    function sourceKind(value) {
        var kind = String(value || '').toLowerCase().trim();
        if (kind === 'task' || kind === 'tasks') return 'task';
        if (kind === 'homework' || kind === 'hw' || kind === 'assignment') return 'homework';
        return '';
    }

    function isOpenSourceItem(item, kind) {
        if (!item || typeof item !== 'object') return false;
        var status = String(item.status || '').toLowerCase();
        // Only Homework defines Boolean done as authoritative over retained
        // legacy completion aliases. Tasks and Timeline keep their own rules.
        var complete = kind === 'homework' && typeof item.done === 'boolean'
            ? item.done : item.completed === true || item.done === true || ['done', 'completed'].indexOf(status) !== -1;
        return !complete && item.deleted !== true
            && item.isDeleted !== true && !item.deletedAt && item.isActive !== false
            && item.archived !== true
            && ['deleted', 'trashed', 'archived'].indexOf(status) === -1;
    }

    function legacyPlannerBlockMatches(block, item) {
        if (String(block.source || '').toLowerCase() !== 'planner_preview'
            || String(block.sourceNoteId || '') !== String(item.id || '')) return false;
        var name = String(block.name || '').trim();
        var title = String(item.title || '').trim();
        if (!name || !title) return false;
        // Older previews stored only sourceNoteId, without the work type. Match
        // their exact title (including the planner's chunk suffix) to avoid
        // treating equal IDs from task and homework as the same source.
        return name === title || name.indexOf(title + ' (') === 0;
    }

    function hasScheduledSource(item, blocks, today) {
        var kind = sourceKind(item.kind);
        var id = String(item.id || '');
        if (!kind || !id) return false;
        return (Array.isArray(blocks) ? blocks : []).some(function (block) {
            if (!isOpenSourceItem(block)) return false;
            var date = validDateKey(block.date);
            if (date && today && date < today) return false;
            var blockKind = sourceKind(block.sourceType) || sourceKind(block.sourceKind) || sourceKind(block.source);
            var source = String(block.source || '').toLowerCase();
            var sourceMatch = /^planner_preview:(task|homework)$/.exec(source);
            if (!blockKind && sourceMatch) blockKind = sourceMatch[1];
            var sourceKeyMatch = /^(task|homework):(.+)$/i.exec(String(block.sourceKey || ''));
            if (!blockKind && sourceKeyMatch) blockKind = sourceKind(sourceKeyMatch[1]);
            if (blockKind && blockKind !== kind) return false;

            var linkedIds = kind === 'task'
                ? [block.taskId, block.linkedTaskId]
                : [block.homeworkId, block.assignmentId, block.linkedHomeworkId];
            if (linkedIds.some(function (linkedId) { return linkedId != null && String(linkedId) === id; })) return true;
            if (blockKind === kind) {
                if (block.sourceId != null && String(block.sourceId) === id) return true;
                if (block.sourceNoteId != null && String(block.sourceNoteId) === id) return true;
                if (sourceKeyMatch && sourceKind(sourceKeyMatch[1]) === kind && sourceKeyMatch[2] === id) return true;
            }
            return !blockKind && legacyPlannerBlockMatches(block, item);
        });
    }

    // Convert the canonical workspace rows into the bounded planner input.
    // This stays pure so date-range, identity, completion, and schedule-link
    // behavior can be checked without booting the browser adapter.
    function collectPlanningItems(input) {
        input = input || {};
        var dates = (Array.isArray(input.dates) ? input.dates : []).map(validDateKey).filter(Boolean).sort();
        var lastDate = dates.length ? dates[dates.length - 1] : '';
        if (!lastDate) return [];
        var items = [];
        var seen = Object.create(null);
        function addRows(rows, kind) {
            (Array.isArray(rows) ? rows : []).forEach(function (raw) {
                if (!isOpenSourceItem(raw, kind)) return;
                // The app task array also contains homework mirrors. The
                // authoritative homework store below supplies those rows.
                if (kind === 'task' && (raw.origin === 'homework' || raw.homeworkSourceId)) return;
                var id = raw.id == null ? '' : String(raw.id);
                var title = String(raw.title || raw.text || raw.task || '').trim();
                var rawDate = raw.dueDate || raw.date || raw.due;
                var dueDate = validDateKey(rawDate);
                if (!id || !title || (rawDate && !dueDate) || dueDate > lastDate) return;
                if (!dueDate && String(raw.priority || '').toLowerCase() !== 'high') return;
                var key = kind + ':' + id;
                if (seen[key]) return;
                var item = {
                    id: id,
                    kind: kind,
                    title: title,
                    courseName: String(raw.courseName || raw.course || raw.subject || raw.className || ''),
                    dueDate: dueDate,
                    dueTime: raw.dueTime || raw.time || '',
                    priority: raw.priority || 'medium',
                    difficulty: raw.difficulty || 'medium',
                    estimateMinutes: Number(raw.estimateMinutes || raw.estimatedMinutes || raw.effortMinutes || raw.estimate) || 0
                };
                if (hasScheduledSource(item, input.timeBlocks, validDateKey(input.today))) return;
                seen[key] = true;
                items.push(item);
            });
        }
        addRows(input.tasks, 'task');
        addRows(input.homeworkTasks, 'homework');
        return items;
    }

    /**
     * Build a non-overlapping plan PREVIEW. Does not mutate inputs, writes nothing.
     * @returns { blocks:[{date,start,end,startMin,endMin,title,category,sourceKind,
     *           sourceId,reason,conflict,estimateMinutes}], unplaced:[{item,reason}] }
     */
    function planWork(input) {
        input = input || {};
        var prefs = resolvePrefs(input.prefs);
        var today = input.today || isoLocal(new Date());
        var dates = (Array.isArray(input.dates) && input.dates.length)
            ? input.dates.filter(function (dk) { return dk >= today; }).sort()
            : [today];
        // The caller supplies the clock boundary, keeping this engine pure.
        // Future days retain their full windows; today starts at the next
        // available minute rather than the beginning of working hours.
        var notBeforeMinute = Number.isFinite(input.notBeforeMinute)
            ? Math.max(0, Math.min(1440, Math.ceil(input.notBeforeMinute))) : 0;
        // working copy of free windows so carving doesn't touch caller data
        var freeByDate = {};
        dates.forEach(function (dk) {
            var src = (input.freeWindowsByDate && input.freeWindowsByDate[dk]) || [];
            // Clamp window bounds into [0, 1439] so a placed slot's HH:MM string can
            // never desync from its minute value (minutesToHHMM caps at 23:59).
            freeByDate[dk] = src.map(function (w) {
                return { start: Math.max(dk === today ? notBeforeMinute : 0, Math.round(w.start)), end: Math.min(24 * 60 - 1, Math.round(w.end)) };
            })
                .filter(function (w) { return w.end > w.start; })
                .sort(function (a, b) { return a.start - b.start; });
        });
        var blocksPerDay = {};
        dates.forEach(function (dk) { blocksPerDay[dk] = 0; });

        var items = (Array.isArray(input.items) ? input.items : []).slice()
            .sort(function (a, b) { return itemScore(b, today) - itemScore(a, today); });

        var blocks = [];
        var unplaced = [];

        items.forEach(function (item) {
            var chunks = chunkMinutes(item.estimateMinutes, prefs, item.preferredChunkMinutes);
            var due = /^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate || '')) ? String(item.dueDate) : '';
            // Due time caps how late work can be scheduled ON the due date.
            var dueMin = hhmmToMinutes(item.dueTime);
            var overdue = due && due < today;
            // candidate dates: never after the due date; soonest-first so work lands early.
            var candidates = dates.filter(function (dk) { return !due || dk <= due; });
            if (!candidates.length) candidates = dates.filter(function (dk) { return dk <= today; }).length ? [today] : dates.slice(0, 1);
            // When spreading, each chunk starts scanning one day later than the
            // previous one landed, so a multi-session item fans out across the
            // runway instead of clustering in the first day's free slots.
            var spread = prefs.spread && candidates.length > 1 && chunks.length > 1;
            var scanStart = 0;
            var placedAny = false;
            chunks.forEach(function (dur, idx) {
                var placed = false;
                for (var k = 0; k < candidates.length; k++) {
                    var c = spread ? ((scanStart + k) % candidates.length) : k;
                    var dk = candidates[c];
                    if (blocksPerDay[dk] >= prefs.maxDailyBlocks) continue;
                    // On the due date, the slot must finish by the due time.
                    var cap = (dueMin !== null && dk === due) ? dueMin : undefined;
                    var slot = findSlot(freeByDate[dk], dur, cap);
                    if (!slot) continue;
                    freeByDate[dk] = carveWindow(freeByDate[dk], slot.start, slot.end, prefs.breakMinutes);
                    blocksPerDay[dk] += 1;
                    blocks.push({
                        date: dk,
                        start: minutesToHHMM(slot.start),
                        end: minutesToHHMM(slot.end),
                        startMin: slot.start,
                        endMin: slot.end,
                        title: (chunks.length > 1 ? (item.title + ' (' + (idx + 1) + '/' + chunks.length + ')') : item.title),
                        category: item.kind === 'review' ? 'review' : 'study',
                        sourceKind: item.kind || 'task',
                        sourceId: item.id || '',
                        courseName: item.courseName || '',
                        reason: reasonFor(item, today, dk),
                        // Overdue work can only be placed after its (past) due date —
                        // flag it so the preview can show it's catch-up, not on-time.
                        conflict: !!overdue,
                        estimateMinutes: dur
                    });
                    if (spread) scanStart = (c + 1) % candidates.length;
                    placed = true;
                    placedAny = true;
                    break;
                }
                if (!placed) unplaced.push({ item: item, reason: 'No free ' + dur + '-min slot before the due date' });
            });
            if (!placedAny && !chunks.length) unplaced.push({ item: item, reason: 'Nothing to schedule' });
        });

        blocks.sort(function (a, b) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return a.startMin - b.startMin;
        });
        return { blocks: blocks, unplaced: unplaced };
    }

    /**
     * Inspect an existing plan for problems. Pure.
     * @param input { blocks:[{id,date,start,end,name,category}], items, signals, prefs, today }
     *   blocks use 'HH:MM' strings; items = open work; signals = optional
     *   { reviewDue, apExams:[{name,examDate,daysUntil}], highPriorityUnscheduled }
     * @returns { issues:[{kind,severity,title,detail,suggestion,refIds}] }
     */
    function analyzePlan(input) {
        input = input || {};
        var prefs = resolvePrefs(input.prefs);
        var today = input.today || isoLocal(new Date());
        var issues = [];
        var byDate = {};
        (Array.isArray(input.blocks) ? input.blocks : []).forEach(function (b) {
            var s = hhmmToMinutes(b.start), e = hhmmToMinutes(b.end);
            if (s === null || e === null || e <= s) return;
            var dk = String(b.date || '');
            if (!byDate[dk]) byDate[dk] = [];
            byDate[dk].push({ id: b.id || (b.name + ':' + b.start), name: b.name || 'Block', start: s, end: e, category: b.category || '' });
        });

        Object.keys(byDate).forEach(function (dk) {
            var day = byDate[dk].slice().sort(function (a, b) { return a.start - b.start; });
            var totalMin = 0;
            day.forEach(function (b) { totalMin += b.end - b.start; });
            for (var i = 1; i < day.length; i++) {
                var prev = day[i - 1], cur = day[i];
                if (cur.start < prev.end) {
                    issues.push({
                        kind: 'overlap', severity: 'high', date: dk,
                        title: 'Overlapping blocks on ' + dk,
                        detail: '"' + prev.name + '" and "' + cur.name + '" overlap.',
                        suggestion: 'Move one block to a free slot or shorten the earlier one.',
                        refIds: [prev.id, cur.id]
                    });
                } else if (cur.start - prev.end < prefs.breakMinutes) {
                    issues.push({
                        kind: 'no_buffer', severity: 'medium', date: dk,
                        title: 'No break between blocks on ' + dk,
                        detail: '"' + prev.name + '" runs into "' + cur.name + '" with under ' + prefs.breakMinutes + ' min between them.',
                        suggestion: 'Add a ' + prefs.breakMinutes + '-minute buffer or shorten one block.',
                        refIds: [prev.id, cur.id]
                    });
                }
            }
            var dueCount = (input.dueCountByDate && input.dueCountByDate[dk]) || 0;
            if (day.length + dueCount >= (input.overloadThreshold || 5) || totalMin >= 360) {
                issues.push({
                    kind: 'overloaded', severity: 'medium', date: dk,
                    title: 'Heavy day on ' + dk,
                    detail: day.length + ' block' + (day.length === 1 ? '' : 's') + (dueCount ? ' + ' + dueCount + ' due item' + (dueCount === 1 ? '' : 's') : '') + ' (' + Math.round(totalMin / 60 * 10) / 10 + 'h scheduled).',
                    suggestion: 'Move lower-priority work to a lighter day.',
                    refIds: day.map(function (b) { return b.id; })
                });
            }
        });

        var sig = input.signals || {};
        (Array.isArray(sig.highPriorityUnscheduled) ? sig.highPriorityUnscheduled : []).forEach(function (it) {
            issues.push({
                kind: 'unscheduled_priority', severity: 'high',
                title: 'High-priority work has no time set aside',
                detail: '"' + (it.title || 'A task') + '"' + (it.dueDate ? ' (due ' + it.dueDate + ')' : '') + ' is not on the timeline.',
                suggestion: 'Plan a study block for it.',
                refIds: [it.id]
            });
        });
        (Array.isArray(sig.apExams) ? sig.apExams : []).forEach(function (ex) {
            if (ex.daysUntil !== undefined && ex.daysUntil <= 21 && !ex.hasStudyBlock) {
                issues.push({
                    kind: 'ap_no_study', severity: 'high',
                    title: (ex.name || 'An AP exam') + ' is ' + ex.daysUntil + ' days away with no study blocks',
                    detail: 'No study time is scheduled before the exam.',
                    suggestion: 'Add review/study blocks before ' + (ex.examDate || 'the exam') + '.',
                    refIds: [ex.id || ex.name]
                });
            }
        });
        if (sig.reviewDue && sig.reviewDue > 0 && !sig.hasReviewSession) {
            issues.push({
                kind: 'review_no_session', severity: 'medium',
                title: sig.reviewDue + ' review cards are due with no session planned',
                detail: 'Spaced review is backing up.',
                suggestion: 'Schedule a short review session today or tomorrow.',
                refIds: ['review']
            });
        }
        issues.sort(function (a, b) {
            var rank = { high: 1, medium: 2, low: 3 };
            return (rank[a.severity] || 4) - (rank[b.severity] || 4);
        });
        return { issues: issues };
    }

    var Engine = {
        planWork: planWork,
        analyzePlan: analyzePlan,
        expandExamPrep: expandExamPrep,
        collectPlanningItems: collectPlanningItems,
        minutesToHHMM: minutesToHHMM,
        hhmmToMinutes: hhmmToMinutes,
        DEFAULT_PREFS: DEFAULT_PREFS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
    if (typeof window === 'undefined') return;

    // ===== Browser adapter ======================================================
    function gatherPrefs() {
        var p = {};
        try {
            var fa = global.flowAtelier;
            var sp = (fa && typeof fa.getStudentPreferences === 'function') ? fa.getStudentPreferences() : null;
            if (!sp && global.appSettings && global.appSettings.studentPreferences) sp = global.appSettings.studentPreferences;
            if (sp) {
                p.studyBlockMinutes = sp.studyBlockMinutes;
                p.breakMinutes = sp.breakMinutes;
                p.maxDailyBlocks = sp.maxDailyBlocks;
            }
        } catch (e) { /* defaults */ }
        return p;
    }

    function isoLocalToday() { return isoLocal(new Date()); }

    function gatherFreeWindows(dates) {
        var out = {};
        var fa = global.flowAtelier;
        dates.forEach(function (dk) {
            var wins = [];
            try {
                if (fa && typeof fa.getFreeWindowsForDateKey === 'function') {
                    wins = fa.getFreeWindowsForDateKey(dk) || [];
                }
            } catch (e) { wins = []; }
            out[dk] = wins;
        });
        return out;
    }

    // Gather all open canonical work rows; intelligence summaries are capped
    // and intentionally optimized for attention signals, not planning inputs.
    function gatherItems(dates) {
        var items = [];
        try {
            var fa = global.flowAtelier;
            var hw = global.SutraHomework;
            var homeworkTasks = null;
            var homeworkCourses = [];
            if (hw && typeof hw.getTasks === 'function') homeworkTasks = hw.getTasks();
            if (hw && typeof hw.getCourses === 'function') homeworkCourses = hw.getCourses() || [];
            if (!Array.isArray(homeworkTasks)) {
                var store = global.SutraHomeworkStore;
                var snapshot = store && typeof store.getSnapshot === 'function' ? store.getSnapshot() : null;
                homeworkTasks = snapshot && Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
                if (!homeworkCourses.length && snapshot && Array.isArray(snapshot.courses)) homeworkCourses = snapshot.courses;
            }
            var courseNames = Object.create(null);
            homeworkCourses.forEach(function (course) {
                if (course && course.id != null) courseNames[String(course.id)] = String(course.name || '');
            });
            items = collectPlanningItems({
                today: isoLocalToday(),
                dates: dates,
                tasks: fa && Array.isArray(fa.tasks) ? fa.tasks : [],
                homeworkTasks: homeworkTasks,
                timeBlocks: fa && Array.isArray(fa.timeBlocks) ? fa.timeBlocks : []
            });
            var hwById = Object.create(null);
            homeworkTasks.forEach(function (task) { if (task && task.id != null) hwById[String(task.id)] = task; });
            items.forEach(function (item) {
                var raw = item.kind === 'homework' ? hwById[item.id] : null;
                if (raw) item.courseName = item.courseName || courseNames[String(raw.courseId || '')] || '';
                // Use the Homework module's calibration so block sizes reflect
                // the student's logged times rather than a generic default.
                if (item.kind === 'homework' && !item.estimateMinutes && hw
                    && typeof hw.getTaskById === 'function'
                    && typeof hw.calibratedEstimateMinutes === 'function') {
                    try {
                        var task = hw.getTaskById(item.id) || raw;
                        var estimate = task && hw.calibratedEstimateMinutes(task);
                        if (estimate && estimate.minutes > 0) {
                            item.estimateMinutes = estimate.minutes;
                            item.calibrated = !!estimate.adjusted;
                        }
                    } catch (e) { /* keep default sizing */ }
                }
            });

            var intel = global.sutraIntelligence || global.flowIntelligence;
            var ctx = intel && typeof intel.deriveStudentContext === 'function' ? intel.deriveStudentContext() : null;
            if (ctx) {
                // Reverse-plan study sessions backward from upcoming exams.
                var examSrc = (ctx.missingExamBlocks || []).concat(ctx.lowConfidenceApSubjects || []);
                var seenExam = Object.create(null);
                var exams = [];
                examSrc.forEach(function (ex) {
                    var key = ex.name || ex.id;
                    if (!key || seenExam[key]) return;
                    seenExam[key] = true;
                    exams.push({ id: ex.id || key, name: ex.name, examDate: ex.examDate, confidence: ex.confidence });
                });
                expandExamPrep(exams, { today: isoLocalToday() }).forEach(function (it) {
                    var isPresent = items.some(function (item) { return item.kind === it.kind && String(item.id) === String(it.id); });
                    if (!isPresent) items.push(it);
                });
            }
        } catch (e) { /* none */ }
        return items;
    }

    function nextDates(count, now) {
        var dates = [];
        var base = now || new Date();
        for (var i = 0; i < count; i++) {
            var d = new Date(base.getTime());
            d.setDate(d.getDate() + i);
            dates.push(isoLocal(d));
        }
        return dates;
    }

    // Build a preview for day or week. Returns the plan object (no writes).
    function buildPreview(scope) {
        var now = new Date();
        var today = isoLocal(now);
        var dates = scope === 'week' ? nextDates(7, now) : [today];
        return planWork({
            today: today,
            notBeforeMinute: now.getHours() * 60 + now.getMinutes() + 1,
            dates: dates,
            items: gatherItems(dates),
            freeWindowsByDate: gatherFreeWindows(dates),
            prefs: gatherPrefs()
        });
    }

    function esc(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(msg) { if (typeof global.showToast === 'function') global.showToast(msg); }

    // Apply a single previewed block to the real timeline via the existing helper.
    function applyBlock(block) {
        var now = new Date();
        var today = isoLocal(now);
        var start = hhmmToMinutes(block.start);
        // A preview can sit open past its start time or across midnight.
        // Recheck immediately before writing, including Add all.
        if (block.date < today || (block.date === today
            && (start === null || start * 60000 <= now.getHours() * 3600000
                + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds()))) {
            toast('This suggested time has passed. Close the preview and plan again.');
            return false;
        }
        var fa = global.flowAtelier;
        if (!fa || typeof fa.addCalendarBlockForTemplate !== 'function') { toast('Scheduling is not available.'); return false; }
        var id = fa.addCalendarBlockForTemplate({
            date: block.date, start: block.start, end: block.end,
            name: block.title, category: block.category || 'study',
            source: block.sourceKind ? 'planner_preview:' + block.sourceKind : 'planner_preview',
            sourceNoteId: block.sourceId || ''
        });
        if (id) { try { global.SutraActivation && global.SutraActivation.record('plan'); } catch (e) { /* non-critical */ } }
        return !!id;
    }

    var lastPreview = null;

    function renderPreviewModal(plan, scope) {
        lastPreview = plan;
        var modal = document.getElementById('sutraPlanPreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sutraPlanPreviewModal';
            modal.className = 'sutra-academic-modal';
            modal.hidden = true;
            document.body.appendChild(modal);
            modal.addEventListener('click', function (e) {
                if (e.target === modal || e.target.closest('[data-plan-close]')) { closeModal(); return; }
                var apply = e.target.closest('[data-plan-apply]');
                if (apply) {
                    var idx = parseInt(apply.getAttribute('data-plan-apply'), 10);
                    if (lastPreview && lastPreview.blocks[idx]) {
                        if (applyBlock(lastPreview.blocks[idx])) {
                            apply.textContent = 'Added ✓';
                            apply.disabled = true;
                            apply.classList.add('is-applied');
                        }
                    }
                    return;
                }
                if (e.target.closest('[data-plan-apply-all]')) {
                    var n = 0;
                    var attempted = 0;
                    (lastPreview ? lastPreview.blocks : []).forEach(function (b, i) {
                        var btn = modal.querySelector('[data-plan-apply="' + i + '"]');
                        if (btn && !btn.disabled) {
                            attempted++;
                            if (applyBlock(b)) { btn.textContent = 'Added ✓'; btn.disabled = true; btn.classList.add('is-applied'); n++; }
                        }
                    });
                    if (n) toast('Added ' + n + ' block' + (n === 1 ? '' : 's') + ' to your timeline.'
                        + (attempted > n ? ' Replan the blocks that could not be added.' : ''));
                    else if (!attempted) toast('Nothing left to add.');
                }
            });
        }
        var rows = plan.blocks.map(function (b, i) {
            return '<div class="plan-preview-row">'
                + '<div class="plan-preview-when"><strong>' + esc(b.date) + '</strong><span>' + esc(b.start) + '–' + esc(b.end) + '</span></div>'
                + '<div class="plan-preview-what"><div class="plan-preview-title">' + esc(b.title) + (b.courseName ? ' <span class="plan-preview-course">' + esc(b.courseName) + '</span>' : '') + '</div>'
                + '<div class="plan-preview-reason">' + esc(b.reason) + '</div></div>'
                + '<button type="button" class="neumo-btn plan-apply-btn" data-plan-apply="' + i + '">Add</button>'
                + '</div>';
        }).join('');
        var unplaced = plan.unplaced.length
            ? '<div class="plan-preview-unplaced"><strong>Couldn’t fit ' + plan.unplaced.length + ' item' + (plan.unplaced.length === 1 ? '' : 's') + ':</strong> '
                + plan.unplaced.slice(0, 6).map(function (u) { return esc(u.item.title); }).join(', ') + '. Free up time or extend your working hours.</div>'
            : '';
        var body = plan.blocks.length
            ? '<div class="plan-preview-list">' + rows + '</div>'
                + '<div class="plan-preview-actions"><button type="button" class="neumo-btn primary" data-plan-apply-all>Add all ' + plan.blocks.length + ' blocks</button></div>'
                + unplaced
            : '<div class="studio-empty-line">Nothing to schedule — either you have no open work, or there’s no free time in your working hours. Adjust your study hours in Settings to open up more slots.' + (unplaced ? '<br>' + unplaced : '') + '</div>';
        var markup = '<div class="sutra-academic-card" role="dialog" aria-modal="true" aria-labelledby="planPreviewTitle">'
            + '<div class="sutra-academic-head"><h3 id="planPreviewTitle">Suggested plan — ' + (scope === 'week' ? 'this week' : 'today') + '</h3>'
            + '<button type="button" class="sutra-academic-close" data-plan-close aria-label="Close">&times;</button></div>'
            + '<div class="sutra-academic-body">'
            + '<p class="plan-preview-intro">Review each block. Nothing is added until you choose. Blocks avoid your classes and anything already on your timeline.</p>'
            + body + '</div></div>';
        modal.innerHTML = markup; // sutra-allow-html: every interpolated value passes through esc(); the rest is static developer markup.
        modal.hidden = false;
        modal.classList.add('is-visible');
        if (global.SutraModalManager && typeof global.SutraModalManager.sync === 'function') { try { global.SutraModalManager.sync(); } catch (e) { /* nc */ } }
    }

    function closeModal() {
        var modal = document.getElementById('sutraPlanPreviewModal');
        if (!modal) return;
        modal.hidden = true;
        modal.classList.remove('is-visible');
        if (global.SutraModalManager && typeof global.SutraModalManager.sync === 'function') { try { global.SutraModalManager.sync(); } catch (e) { /* nc */ } }
    }

    function planDay() { renderPreviewModal(buildPreview('day'), 'day'); }
    function planWeek() { renderPreviewModal(buildPreview('week'), 'week'); }

    // Gather the real timeline + intelligence signals and run the repair analysis.
    function analyzeCurrent() {
        var dates = nextDates(7);
        var dateSet = {};
        dates.forEach(function (d) { dateSet[d] = true; });
        var fa = global.flowAtelier;
        var blocks = [];
        try {
            (fa && Array.isArray(fa.timeBlocks) ? fa.timeBlocks : []).forEach(function (b) {
                if (b && b.date && dateSet[b.date] && b.start && b.end) {
                    blocks.push({ id: b.id || (b.name + ':' + b.date + ':' + b.start), date: b.date, start: b.start, end: b.end, name: b.name || 'Block', category: b.category || '' });
                }
            });
        } catch (e) { /* none */ }
        var hasReviewSession = blocks.some(function (b) { return b.category === 'review'; });
        var signals = { reviewDue: 0, hasReviewSession: hasReviewSession, apExams: [], highPriorityUnscheduled: [] };
        var dueCountByDate = {};
        try {
            var intel = global.sutraIntelligence || global.flowIntelligence;
            var ctx = intel && typeof intel.deriveStudentContext === 'function' ? intel.deriveStudentContext() : null;
            if (ctx) {
                signals.reviewDue = (ctx.reviewDebt && (ctx.reviewDebt.overdue || ctx.reviewDebt.due)) || 0;
                signals.highPriorityUnscheduled = (ctx.unscheduledHighPriority || []).map(function (it) {
                    return { id: it.id, title: it.title, dueDate: it.dueDate };
                });
                var examSources = (ctx.missingExamBlocks || []).concat(ctx.lowConfidenceApSubjects || []);
                var seenExam = {};
                examSources.forEach(function (ex) {
                    var key = ex.name || ex.id;
                    if (seenExam[key]) return;
                    seenExam[key] = true;
                    signals.apExams.push({ id: ex.id || key, name: ex.name, examDate: ex.examDate, daysUntil: ex.daysUntilExam, hasStudyBlock: false });
                });
                (ctx.overdue || []).concat(ctx.dueSoon || []).forEach(function (it) {
                    if (it.dueDate && dateSet[it.dueDate]) dueCountByDate[it.dueDate] = (dueCountByDate[it.dueDate] || 0) + 1;
                });
            }
        } catch (e) { /* none */ }
        var prefs = gatherPrefs();
        var overloadThreshold = 5;
        try { var sp = fa && fa.getStudentPreferences && fa.getStudentPreferences(); if (sp && sp.overloadThreshold) overloadThreshold = sp.overloadThreshold; } catch (e) { /* default */ }
        return analyzePlan({ today: isoLocalToday(), blocks: blocks, signals: signals, prefs: prefs, dueCountByDate: dueCountByDate, overloadThreshold: overloadThreshold });
    }

    function renderRepairModal(report) {
        var modal = document.getElementById('sutraPlanRepairModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sutraPlanRepairModal';
            modal.className = 'sutra-academic-modal';
            modal.hidden = true;
            document.body.appendChild(modal);
            modal.addEventListener('click', function (e) {
                if (e.target === modal || e.target.closest('[data-repair-close]')) {
                    modal.hidden = true; modal.classList.remove('is-visible');
                    if (global.SutraModalManager && global.SutraModalManager.sync) { try { global.SutraModalManager.sync(); } catch (er) { /* nc */ } }
                    return;
                }
                if (e.target.closest('[data-repair-plan-now]')) {
                    modal.hidden = true; modal.classList.remove('is-visible');
                    planDay();
                }
            });
        }
        var sevLabel = { high: 'Needs attention', medium: 'Worth a look', low: 'Minor' };
        var rows = (report.issues || []).map(function (i) {
            return '<div class="plan-repair-row sev-' + esc(i.severity) + '">'
                + '<div class="plan-repair-head"><span class="plan-repair-sev">' + esc(sevLabel[i.severity] || i.severity) + '</span>'
                + '<strong>' + esc(i.title) + '</strong></div>'
                + '<div class="plan-repair-detail">' + esc(i.detail) + '</div>'
                + '<div class="plan-repair-fix">→ ' + esc(i.suggestion) + '</div></div>';
        }).join('');
        var body = (report.issues && report.issues.length)
            ? '<div class="plan-repair-list">' + rows + '</div>'
                + '<div class="plan-preview-actions"><button type="button" class="neumo-btn primary" data-repair-plan-now>Suggest fixes for today</button></div>'
            : '<div class="studio-empty-line">Your plan looks healthy — no overlaps, buffers respected, and nothing high-priority is left unscheduled.</div>';
        var markup = '<div class="sutra-academic-card" role="dialog" aria-modal="true" aria-labelledby="planRepairTitle">'
            + '<div class="sutra-academic-head"><h3 id="planRepairTitle">Plan check</h3>'
            + '<button type="button" class="sutra-academic-close" data-repair-close aria-label="Close">&times;</button></div>'
            + '<div class="sutra-academic-body">'
            + '<p class="plan-preview-intro">A deterministic look at the next 7 days — overlaps, missing buffers, overloaded days, and unscheduled priorities.</p>'
            + body + '</div></div>';
        modal.innerHTML = markup; // sutra-allow-html: every interpolated value passes through esc(); the rest is static developer markup.
        modal.hidden = false;
        modal.classList.add('is-visible');
        if (global.SutraModalManager && global.SutraModalManager.sync) { try { global.SutraModalManager.sync(); } catch (e) { /* nc */ } }
    }

    function repairPlan() { renderRepairModal(analyzeCurrent()); }

    global.SutraPlanningEngine = {
        VERSION: 1,
        engine: Engine,
        planWork: planWork,
        analyzePlan: analyzePlan,
        buildPreview: buildPreview,
        planDay: planDay,
        planWeek: planWeek,
        analyzeCurrent: analyzeCurrent,
        repairPlan: repairPlan
    };

    function init() {
        document.addEventListener('click', function (e) {
            var t = e.target.closest('[data-plan-preview]');
            if (t) {
                e.preventDefault();
                if (t.getAttribute('data-plan-preview') === 'week') planWeek(); else planDay();
                return;
            }
            var r = e.target.closest('[data-plan-repair]');
            if (r) { e.preventDefault(); repairPlan(); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

}(typeof window !== 'undefined' ? window : globalThis));
