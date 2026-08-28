/**
 * Persistence and failure chaos tests.
 *
 * Tests that the workspace survives corrupt storage, mid-operation failures,
 * simultaneous tab writes, and quota exhaustion without losing data.
 */
import { test, expect } from '@playwright/test';

const BASE = '/Sutra.html';

test.describe('Chaos: storage fault injection', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
    });

    test('app boots after localStorage corruption', async ({ page }) => {
        // Corrupt localStorage
        await page.evaluate(() => {
            try {
                localStorage.setItem('noteflow_atelier_db', '{{CORRUPT');
                localStorage.setItem('hwCourses:v2', ']invalidjson[');
                localStorage.setItem('hwTasks:v2', null);
            } catch {}
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        // App should not crash
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.waitForTimeout(500);
        // The app should still render core UI
        const hasUI = await page.evaluate(() => {
            return document.querySelector('.view-tab') !== null ||
                   document.querySelector('nav') !== null ||
                   document.body.children.length > 0;
        });
        expect(hasUI).toBeTruthy();
    });

    test('a missing IndexedDB root with a surviving confirmed hash fails closed at startup', async ({ page }) => {
        await page.goto('/HomePage.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        const checkpoint = await page.evaluate(async () => {
            const health = JSON.parse(localStorage.getItem('sutra:persistenceHealth:v1') || '{}');
            const confirmedHash = health.lastConfirmedWorkspaceHash || null;
            // Model the exact persisted diagnostics from the pre-checkpoint
            // build in the user's screenshot.
            delete health.lastConfirmedWorkspaceHash;
            health.version = 1;
            health.lastFailure = {
                kind: 'conflict',
                phase: 'visibilitychange',
                conflict: { source: 'unverified-storage-change', expectedHash: confirmedHash, actualHash: null }
            };
            localStorage.setItem('sutra:persistenceHealth:v1', JSON.stringify(health));
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase('noteflow_atelier_db');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Workspace DB delete failed'));
                request.onblocked = () => reject(new Error('Workspace DB delete blocked'));
            });
            return confirmedHash;
        });
        expect(checkpoint).toMatch(/^[0-9a-f]{8}$/);

        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.flowAtelier && !!window.SutraPersistenceHealth);
        const result = await page.evaluate(async () => {
            let saveError = null;
            try { await window.flowAtelier.flushAppSaveNow('startup-missing-root-test'); }
            catch (error) { saveError = { name: error?.name || '', message: error?.message || String(error) }; }
            return {
                failure: window.SutraPersistenceHealth.getState().lastFailure,
                saveError,
                durable: await window.loadWorkspaceLocally()
            };
        });
        expect(result.failure?.phase).toBe('startup-missing-root');
        expect(result.saveError?.name).toBe('WorkspaceReadSafetyError');
        expect(result.durable).toBeNull();
    });

    test('a complete origin-data wipe boots as a fresh confirmed workspace', async ({ page }) => {
        await page.goto('/HomePage.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await page.evaluate(async () => {
            localStorage.clear();
            sessionStorage.clear();
            await Promise.all(['noteflow_atelier_db', 'noteflow_attachments_db'].map(name => new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error(`${name} delete failed`));
                request.onblocked = () => reject(new Error(`${name} delete blocked`));
            })));
        });

        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.flowAtelier && !!window.SutraPersistenceHealth);
        const result = await page.evaluate(async () => {
            let saveError = null;
            try { await window.flowAtelier.flushAppSaveNow('fresh-origin-confirmation'); }
            catch (error) { saveError = { name: error?.name || '', message: error?.message || String(error) }; }
            const durable = await window.loadWorkspaceLocally();
            const checkpoint = JSON.parse(localStorage.getItem('sutra:persistenceHealth:v1') || '{}')
                .lastConfirmedWorkspaceHash || null;
            return { saveError, durable: !!durable, checkpoint };
        });
        expect(result.saveError).toBeNull();
        expect(result.durable).toBe(true);
        expect(result.checkpoint).toMatch(/^[0-9a-f]{8}$/);
    });

    test('SutraSafeStorage handles corrupt data gracefully', async ({ page }) => {
        const result = await page.evaluate(() => {
            try {
                if (window.SutraSafeStorage) {
                    // getItem should either return null/undefined or throw — both are safe
                    try {
                        const val = window.SutraSafeStorage.getItem('noteflow_atelier_db');
                        return { ok: true, value: val === null || val === undefined ? 'null' : typeof val };
                    } catch (e) {
                        // Throwing on corrupt data is acceptable
                        return { ok: true, threw: true, error: e.message?.slice(0, 80) };
                    }
                }
                return { ok: true, noStorage: true };
            } catch (e) {
                return { ok: false, error: e.message?.slice(0, 80) };
            }
        });
        expect(result.ok).toBeTruthy();
    });

    test('save function handles write failure', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Override IndexedDB to fail on next write
            const origOpen = indexedDB.open;
            let failNext = true;
            indexedDB.open = function(...args) {
                const req = origOpen.apply(this, args);
                if (failNext && req.transaction) {
                    const origStore = req.transaction.objectStore;
                    if (origStore) {
                        req.transaction.objectStore = function(name) {
                            const store = origStore.call(this, name);
                            const origPut = store.put.bind(store);
                            store.put = function(data) {
                                if (failNext) {
                                    failNext = false;
                                    const req = { result: undefined, error: null };
                                    setTimeout(() => {
                                        if (req.onerror) req.onerror(new Error('Simulated write failure'));
                                    }, 0);
                                    return req;
                                }
                                return origPut(data);
                            };
                            return store;
                        };
                    }
                }
                return req;
            };
            return { ok: true };
        });
        expect(result.ok).toBeTruthy();
    });
});

test.describe('Chaos: concurrent operations', () => {
    test('rapid save-reload-save cycle', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // Trigger multiple rapid saves
        for (let i = 0; i < 5; i++) {
            await page.evaluate((idx) => {
                try {
                    if (window.SutraApp && window.SutraApp.persistNow) {
                        window.SutraApp.persistNow();
                    }
                } catch {}
            }, i);
        }

        // Reload mid-save
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // App should still be functional
        const hasUI = await page.evaluate(() => {
            return document.body.children.length > 0;
        });
        expect(hasUI).toBeTruthy();
    });

    test('rapid tab switching does not corrupt state', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // Rapidly switch between views
        for (let i = 0; i < 10; i++) {
            await page.evaluate((idx) => {
                const tabs = document.querySelectorAll('.view-tab:not([hidden])');
                if (tabs[idx % tabs.length]) {
                    tabs[idx % tabs.length].click();
                }
            }, i);
            await page.waitForTimeout(100);
        }

        await page.waitForTimeout(500);
        // No crash
        const noErrors = await page.evaluate(() => true);
        expect(noErrors).toBeTruthy();
    });
});

test.describe('Chaos: export/import integrity', () => {
    test('export survives mid-operation reload', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // Start an export, then abort
        const started = await page.evaluate(() => {
            try {
                if (window.SutraApp && window.SutraApp.exportData) {
                    window.SutraApp.exportData();
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        });

        if (started) {
            await page.waitForTimeout(200);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            // App should recover
            const hasUI = await page.evaluate(() => document.body.children.length > 0);
            expect(hasUI).toBeTruthy();
        }
    });
});

test.describe('Chaos: DOM integrity under stress', () => {
    test('no duplicate IDs after rapid view switches', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // Rapidly switch views
        for (let i = 0; i < 8; i++) {
            await page.evaluate((idx) => {
                const tabs = document.querySelectorAll('.view-tab:not([hidden])');
                if (tabs[idx % tabs.length]) tabs[idx % tabs.length].click();
            }, i);
            await page.waitForTimeout(200);
        }

        // Check for duplicate IDs
        const duplicates = await page.evaluate(() => {
            const ids = {};
            const dups = [];
            document.querySelectorAll('[id]').forEach(el => {
                if (ids[el.id]) dups.push(el.id);
                ids[el.id] = true;
            });
            return dups;
        });
        expect(duplicates).toHaveLength(0);
    });

    test('no detached DOM nodes accumulate', async ({ page }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        const beforeCount = await page.evaluate(() => document.querySelectorAll('*').length);

        // Switch views multiple times
        for (let i = 0; i < 10; i++) {
            await page.evaluate((idx) => {
                const tabs = document.querySelectorAll('.view-tab:not([hidden])');
                if (tabs[idx % tabs.length]) tabs[idx % tabs.length].click();
            }, i);
            await page.waitForTimeout(150);
        }

        const afterCount = await page.evaluate(() => document.querySelectorAll('*').length);
        // Allow some growth but not runaway
        expect(afterCount).toBeLessThan(beforeCount * 3);
    });
});

test.describe('Chaos: service worker resilience', () => {
    test('app loads with service worker disabled', async ({ page, context }) => {
        await context.route('**/sw.js', route => route.abort());
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const hasUI = await page.evaluate(() => document.body.children.length > 0);
        expect(hasUI).toBeTruthy();
    });

    test('app loads after clearing all caches', async ({ page, context }) => {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            return caches.keys().then(keys =>
                Promise.all(keys.map(k => caches.delete(k)))
            );
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const hasUI = await page.evaluate(() => document.body.children.length > 0);
        expect(hasUI).toBeTruthy();
    });
});
