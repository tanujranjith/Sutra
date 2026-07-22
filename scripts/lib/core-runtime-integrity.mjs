import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const MIN_APP_BYTES = 4_500_000;
const MIN_APP_LINES = 80_000;

const REQUIRED_FRAGMENTS = [
  ['workspace serializer', 'function serializeWorkspace('],
  ['workspace deserializer', 'function deserializeWorkspace('],
  ['canonical local save', 'async function saveWorkspaceLocally('],
  ['canonical local load', 'async function loadWorkspaceLocally('],
  ['encrypted workspace export', 'async function exportWorkspaceAsAtelierPackage('],
  ['workspace import seam', 'function importWorkspacePayload('],
  ['round-trip verifier', 'window.verifyWorkspaceRoundTrip'],
  ['persistence public save API', 'window.saveWorkspaceLocally = saveWorkspaceLocally'],
  ['export failures survive unrelated saves', 'if (SUTRA_EXPORT_FAILURE_PHASES.has(failurePhase)) return false;'],
  ['successful exports resolve export failures', 'clearResolvedExportFailure();'],
  ['Drive mutation revision guard', 'const localMutationRevision = Math.max('],
  ['Drive restore action', 'async function restoreSutraDriveSnapshotAction('],
  ['Drive conflict chooser', 'enterSutraDriveConflict('],
  ['Sync engine creation', 'window.SutraSyncEngine.create('],
  ['Sync projection', 'window.SutraSyncProjection.buildProjection('],
  ['Sync public bridge', 'window.SutraSync = {'],
  ['cloud sign-out pauses Sync', "if (window.SutraSync && typeof window.SutraSync.pause === 'function') window.SutraSync.pause();"],
  ['public beta test hooks', 'window.__sutraPublicBetaTestHooks = {'],
  ['sidebar renderer', 'function renderPagesList()'],
  ['Help page render priority', '...topLevelPages.filter(isHelpDocsPage)'],
  ['Help page ordered render', 'orderedTopLevelPages.forEach(page => renderTree(page.id, 0, null))'],
  ['application DOM boot', "document.addEventListener('DOMContentLoaded', async () => {"]
];

const REQUIRED_ORDER = [
  'function renderPagesList()',
  'const localMutationRevision = Math.max(',
  'async function restoreSutraDriveSnapshotAction(',
  'async function exportWorkspaceAsAtelierPackage(',
  'function serializeWorkspace(',
  'async function saveWorkspaceLocally(',
  'window.__sutraPublicBetaTestHooks = {',
  'window.SutraSync = {'
];

export function checkCoreRuntime(options = {}) {
  const appPath = resolve(options.appPath || 'src/core/app.js');
  let source;
  try {
    source = readFileSync(appPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      appPath,
      bytes: 0,
      lines: 0,
      failures: [`cannot read ${appPath}: ${error.message}`],
      passes: []
    };
  }

  return checkCoreRuntimeSource(source, {
    appPath,
    bytes: statSync(appPath).size,
    readLabel: `read ${appPath}`
  });
}

export function checkCoreRuntimeSource(source, options = {}) {
  const appPath = options.appPath || '<in-memory core runtime>';
  const failures = [];
  const passes = [];
  const text = String(source || '');
  const bytes = Number.isFinite(options.bytes) ? options.bytes : Buffer.byteLength(text, 'utf8');
  const lines = text.split(/\r?\n/).length;
  if (options.readLabel) passes.push(options.readLabel);

  try {
    // Sutra's core is a classic browser script. vm.Script invokes Node's
    // JavaScript parser without executing the source or requiring a child
    // process, so this also works in restricted CI and coding sandboxes.
    new Script(text, { filename: appPath });
    passes.push('JavaScript parser accepted the core runtime');
  } catch (error) {
    failures.push(`JavaScript parser rejected the core runtime:\n${error.stack || error.message}`);
  }

  if (bytes >= MIN_APP_BYTES) passes.push(`runtime size floor (${bytes} bytes)`);
  else failures.push(`runtime is unexpectedly small (${bytes} bytes; expected at least ${MIN_APP_BYTES})`);

  if (lines >= MIN_APP_LINES) passes.push(`runtime line-count floor (${lines} lines)`);
  else failures.push(`runtime is unexpectedly short (${lines} lines; expected at least ${MIN_APP_LINES})`);

  for (const [label, fragment] of REQUIRED_FRAGMENTS) {
    if (text.includes(fragment)) passes.push(label);
    else failures.push(`${label} is missing: ${fragment}`);
  }

  let previousIndex = -1;
  for (const fragment of REQUIRED_ORDER) {
    const index = text.indexOf(fragment);
    if (index === -1) continue;
    if (index <= previousIndex) {
      failures.push(`critical runtime section is out of order: ${fragment}`);
      break;
    }
    previousIndex = index;
  }
  if (!failures.some((item) => item.includes('out of order'))) {
    passes.push('critical runtime sections retain their expected order');
  }

  return { ok: failures.length === 0, appPath, bytes, lines, failures, passes };
}

export function assertCoreRuntimeIntegrity(options = {}) {
  const result = checkCoreRuntime(options);
  if (result.ok) return result;
  const error = new Error(`Core runtime integrity check failed:\n- ${result.failures.join('\n- ')}`);
  error.name = 'CoreRuntimeIntegrityError';
  error.result = result;
  throw error;
}

export const coreRuntimeContract = Object.freeze({
  minimumBytes: MIN_APP_BYTES,
  minimumLines: MIN_APP_LINES,
  requiredFragments: REQUIRED_FRAGMENTS.map(([label, fragment]) => ({ label, fragment })),
  requiredOrder: [...REQUIRED_ORDER]
});
