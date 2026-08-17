// Compatibility bridge for workspaces created by pre-IndexedDB Atelier builds.
// It runs before app.js so the canonical adapter never observes an empty root
// while an older localStorage workspace is still available.
(function (global) {
    'use strict';

    if (!global || !global.SutraWorkspaceDB || typeof global.SutraWorkspaceDB.create !== 'function') return;

    const originalApi = global.SutraWorkspaceDB;
    const originalCreate = originalApi.create;
    const DB_NAME = 'noteflow_atelier_db';
    const STORE_NAME = 'workspace';
    const ROOT_KEY = 'root';
    let migrationPromise = null;

    function readLegacyWorkspace() {
        try {
            const raw = global.localStorage && global.localStorage.getItem(DB_NAME);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const source = parsed && parsed.appData && typeof parsed.appData === 'object'
                ? parsed.appData
                : parsed;
            if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
            const workspace = { ...source };
            workspace.settings = {
                ...(source.settings && typeof source.settings === 'object' ? source.settings : {})
            };
            const flags = [
                'studentOnboardingCompleted', 'studentOnboardingCompletedAt',
                'featureSelectionCompleted', 'userMode', 'userModeSetupCompleted',
                'tutorialSeen', 'tutorialCompleted', 'tutorialCompletedAt'
            ];
            flags.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(parsed, key)
                    && !Object.prototype.hasOwnProperty.call(workspace.settings, key)) {
                    workspace.settings[key] = parsed[key];
                }
            });
            return workspace;
        } catch (error) {
            try { console.warn('Unable to inspect legacy workspace storage', error); } catch (_) {}
            return null;
        }
    }

    function hasMeaningfulData(workspace) {
        if (!workspace || typeof workspace !== 'object') return false;
        if (Array.isArray(workspace.pages) && workspace.pages.some(page => page && page.isSystemPage !== true && !page.builtInId)) return true;
        if (Array.isArray(workspace.tasks) && workspace.tasks.length) return true;
        if (Array.isArray(workspace.timeBlocks) && workspace.timeBlocks.length) return true;
        const homework = workspace.homeworkWorkspace;
        if (homework && ((Array.isArray(homework.courses) && homework.courses.length)
            || (Array.isArray(homework.tasks) && homework.tasks.length))) return true;
        return false;
    }

    function healOnboardingState(workspace) {
        if (!hasMeaningfulData(workspace)) return workspace;
        const settings = workspace.settings && typeof workspace.settings === 'object' ? workspace.settings : {};
        const onboarding = settings.onboarding && typeof settings.onboarding === 'object' ? settings.onboarding : {};
        if (onboarding.completed === true || onboarding.skipped === true) return workspace;
        // A versioned, migrated pending state is intentional (for example, the
        // user chose Continue later). Only heal absent or legacy/default state.
        if (onboarding.version === 1 && onboarding.migratedFromLegacy === true) return workspace;
        const healed = {
            ...workspace,
            settings: {
                ...settings,
                onboarding: {
                    ...onboarding,
                    version: 1,
                    completed: true,
                    skipped: false,
                    migratedFromLegacy: true,
                    completedAt: onboarding.completedAt || new Date().toISOString()
                },
                studentOnboardingCompleted: true,
                studentOnboardingCompletedAt: settings.studentOnboardingCompletedAt || new Date().toISOString(),
                featureSelectionCompleted: true,
                userModeSetupCompleted: true
            }
        };
        return healed;
    }

    const migrationAdapter = originalCreate.call(originalApi, {
        dbName: DB_NAME,
        storeName: STORE_NAME,
        version: 7
    });
    migrationPromise = migrationAdapter.read(ROOT_KEY).then(async root => {
        try {
            if (!root) {
                root = readLegacyWorkspace();
                if (root) await migrationAdapter.write(ROOT_KEY, root);
            }
            const healed = healOnboardingState(root);
            if (healed !== root && healed) await migrationAdapter.write(ROOT_KEY, healed);
        } finally {
            try { migrationAdapter.close(); } catch (_) {}
        }
    }).catch(error => {
        try { console.warn('Legacy workspace migration deferred; canonical startup will report storage errors.', error); } catch (_) {}
    });

    global.SutraWorkspaceDB = {
        ...originalApi,
        create(options) {
            const adapter = originalCreate.call(originalApi, options);
            const waitForMigration = () => migrationPromise || Promise.resolve();
            return {
                ...adapter,
                read: async (...args) => { await waitForMigration(); return adapter.read(...args); },
                write: async (...args) => { await waitForMigration(); return adapter.write(...args); },
                writeIf: async (...args) => { await waitForMigration(); return adapter.writeIf(...args); }
            };
        }
    };

    // Onboarding historically queued completion through the ordinary debounce.
    // A reload immediately after Finish could beat that timer and reopen setup.
    // Observe the modal's open -> closed transition and force the public,
    // readback-verified workspace save once the controller has committed its
    // in-memory state. Dismissing midway is safe too: it durably preserves only
    // the user's current progress and still reopens setup next launch.
    function bindOnboardingCompletionFlush() {
        const overlay = global.document && global.document.getElementById('studentOnboardingOverlay');
        if (!overlay || overlay.dataset.storageFlushBound === 'true' || typeof MutationObserver === 'undefined') return;
        overlay.dataset.storageFlushBound = 'true';
        let wasOpen = overlay.classList.contains('active') && overlay.getAttribute('aria-hidden') !== 'true';
        let flushInFlight = false;
        const observer = new MutationObserver(() => {
            const isOpen = overlay.classList.contains('active') && overlay.getAttribute('aria-hidden') !== 'true';
            if (wasOpen && !isOpen && !flushInFlight) {
                flushInFlight = true;
                Promise.resolve().then(async () => {
                    if (typeof global.saveWorkspaceLocally === 'function') {
                        await global.saveWorkspaceLocally();
                    }
                }).catch(error => {
                    try {
                        if (typeof global.SutraReportError === 'function') {
                            global.SutraReportError(error, { where: 'onboarding.completion-flush' }, 'error');
                        }
                    } catch (_) {}
                }).finally(() => { flushInFlight = false; });
            }
            wasOpen = isOpen;
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindOnboardingCompletionFlush, { once: true });
    } else {
        bindOnboardingCompletionFlush();
    }
}(typeof window !== 'undefined' ? window : globalThis));
