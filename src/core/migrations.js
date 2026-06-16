/*
 * migrations.js - versioned, lossless workspace migrations.
 *
 * The core owns persistence; this registry owns only pure object-to-object
 * schema upgrades. Migrations must preserve unknown fields so old backups,
 * plugins, and forward-compatible data are never silently discarded.
 */
(function (global) {
  'use strict';

  var CURRENT_VERSION = 2;
  var registry = Object.create(null);

  function clone(value) {
    if (value === undefined) return undefined;
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (error) {
      /* JSON fallback below */
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeVersion(value) {
    var parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return parsed;
  }

  function register(fromVersion, migrate) {
    var from = normalizeVersion(fromVersion);
    if (typeof migrate !== 'function') throw new TypeError('Migration must be a function.');
    registry[from] = migrate;
  }

  register(1, function migrateV1ToV2(workspace) {
    var next = workspace && typeof workspace === 'object' ? workspace : {};
    var legacyStreaks = next.streaks && typeof next.streaks === 'object' ? next.streaks : {};
    next.streaks = Object.assign({}, legacyStreaks);

    if (!next.streaks.dayStates && next.dayStates) next.streaks.dayStates = next.dayStates;
    if (!next.streaks.taskStreaks && next.taskStreaks) next.streaks.taskStreaks = next.taskStreaks;
    if (!next.streaks.streakState && next.streakState) next.streaks.streakState = next.streakState;
    if (!next.settings || typeof next.settings !== 'object') next.settings = {};

    next.version = 2;
    return next;
  });

  function migrateWorkspace(input, options) {
    var opts = options || {};
    var targetVersion = normalizeVersion(opts.targetVersion || CURRENT_VERSION);
    var workspace = clone(input && typeof input === 'object' ? input : {});
    var fromVersion = normalizeVersion(workspace.version);
    var applied = [];

    if (fromVersion > targetVersion) {
      return {
        workspace: workspace,
        fromVersion: fromVersion,
        toVersion: fromVersion,
        applied: applied,
        futureVersion: true
      };
    }

    var version = fromVersion;
    while (version < targetVersion) {
      var migration = registry[version];
      if (typeof migration !== 'function') {
        throw new Error('Missing Sutra workspace migration v' + version + ' -> v' + (version + 1));
      }
      workspace = migration(workspace);
      version += 1;
      workspace.version = version;
      applied.push('v' + (version - 1) + '->v' + version);
    }

    return {
      workspace: workspace,
      fromVersion: fromVersion,
      toVersion: version,
      applied: applied,
      futureVersion: false
    };
  }

  var api = {
    CURRENT_VERSION: CURRENT_VERSION,
    register: register,
    migrateWorkspace: migrateWorkspace,
    list: function () { return Object.keys(registry).map(Number).sort(function (a, b) { return a - b; }); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraMigrations = api;
}(typeof window !== 'undefined' ? window : globalThis));
