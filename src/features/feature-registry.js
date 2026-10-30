/* Lazy optional-feature loader with dependency, init, teardown, and metrics. */
(function (global) {
  'use strict';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function resolvePath(path) {
    var parts = String(path || '').split('.');
    var value = global;
    for (var i = 0; i < parts.length && value; i += 1) value = value[parts[i]];
    return value;
  }
  function browserLoader() {
    var loadedScripts = Object.create(null);
    var loadedStyles = Object.create(null);

    function findExistingStyle(href) {
      var absoluteHref;
      try {
        absoluteHref = new URL(href, document.baseURI).href;
      } catch (error) {
        absoluteHref = href;
      }
      var nodes = document.querySelectorAll('link[rel="stylesheet"]');
      for (var i = 0; i < nodes.length; i += 1) {
        if (nodes[i].href === absoluteHref || nodes[i].getAttribute('href') === href) return nodes[i];
      }
      return null;
    }

    function hasVerifiedStyleRules(node) {
      try { return !!(node && node.sheet && node.sheet.cssRules.length > 0); }
      catch (error) { return false; }
    }

    return {
      script: function (src) {
        if (loadedScripts[src]) return loadedScripts[src];
        var node;
        loadedScripts[src] = new Promise(function (resolve, reject) {
          node = document.createElement('script');
          node.src = src;
          node.async = false;
          node.onload = function () { resolve(src); };
          node.onerror = function () { reject(new Error('Optional feature script failed: ' + src)); };
          document.head.appendChild(node);
        }).catch(function (error) {
          delete loadedScripts[src];
          if (node) node.remove();
          throw error;
        });
        return loadedScripts[src];
      },
      style: function (href) {
        if (loadedStyles[href]) {
          loadedStyles[href].node.disabled = false;
          return loadedStyles[href].promise;
        }
        var record = {};
        var existing = findExistingStyle(href);
        if (hasVerifiedStyleRules(existing)) {
          // A readable, nonempty sheet is ready to reuse. A missing, empty, or
          // unreadable sheet may still be loading or may have failed before
          // we could attach a listener (a failed link can have a sheet object).
          record.node = existing;
          record.promise = Promise.resolve(href);
        } else {
          // Replace it in place and bind our handlers before insertion to
          // observe a load/error event without losing cascade order.
          record.promise = new Promise(function (resolve, reject) {
            var node = existing ? existing.cloneNode(false) : document.createElement('link');
            record.node = node;
            node.rel = 'stylesheet';
            node.href = href;
            node.disabled = false;
            node.onload = function () { resolve(href); };
            node.onerror = function () { reject(new Error('Optional feature style failed: ' + href)); };
            if (existing) existing.replaceWith(node);
            else document.head.appendChild(node);
          });
        }
        record.promise = record.promise.catch(function (error) {
          if (loadedStyles[href] === record) delete loadedStyles[href];
          throw error;
        });
        loadedStyles[href] = record;
        return record.promise;
      },
      enableStyle: function (href) { if (loadedStyles[href]) loadedStyles[href].node.disabled = false; },
      disableStyle: function (href) { if (loadedStyles[href]) loadedStyles[href].node.disabled = true; }
    };
  }

  function createFeatureRegistry(manifest, loader) {
    var definitions = manifest || {};
    var assetLoader = loader || browserLoader();
    var state = Object.create(null);
    var metrics = Object.create(null);
    var loading = Object.create(null);
    var initializing = Object.create(null);
    var disabling = Object.create(null);
    Object.keys(definitions).forEach(function (id) { state[id] = { enabled: false, loaded: false, initialized: false, error: null }; });

    async function enable(id, options) {
      var definition = definitions[id];
      if (!definition) throw new Error('Unknown feature: ' + id);
      var current = state[id];
      if (global.SutraRecoveryMode && typeof global.SutraRecoveryMode.shouldLoadOptionalFeature === 'function'
          && !global.SutraRecoveryMode.shouldLoadOptionalFeature(id)) {
        current.enabled = false;
        current.error = 'Skipped while Recovery Mode is active.';
        return clone(current);
      }
      current.enabled = true;
      var start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (disabling[id]) await disabling[id];
      if (!current.enabled) return clone(current);
      for (var d = 0; d < (definition.dependencies || []).length; d += 1) await enable(definition.dependencies[d], options);
      if (!current.enabled) return clone(current);
      if (!current.loaded) {
        if (!loading[id]) {
          loading[id] = (async function () {
            await Promise.all((definition.styles || []).map(function (href) { return assetLoader.style(href); }));
            for (var s = 0; s < (definition.scripts || []).length; s += 1) await assetLoader.script(definition.scripts[s]);
            current.loaded = true;
          }()).finally(function () { delete loading[id]; });
        }
        await loading[id];
      }
      // A disable can arrive while scripts (including self-initializing legacy
      // scripts) load. Let its cleanup settle before considering a new init.
      if (disabling[id]) await disabling[id];
      if (!current.enabled) return clone(current);
      if (!current.initialized) {
        if (!initializing[id]) {
          initializing[id] = Promise.resolve().then(async function () {
            if (!current.enabled) return;
            if (typeof assetLoader.enableStyle === 'function') (definition.styles || []).forEach(function (href) { assetLoader.enableStyle(href); });
            var initializer = resolvePath(definition.initialization);
            if (typeof initializer === 'function') await initializer(options || {});
            current.initialized = true;
          }).finally(function () { delete initializing[id]; });
        }
        await initializing[id];
      }
      if (!current.enabled && disabling[id]) await disabling[id];
      if (current.enabled && current.initialized) current.error = null;
      metrics[id] = { loadedAt: new Date().toISOString(), durationMs: Math.max(0, (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - start) };
      return clone(current);
    }

    async function disable(id) {
      var definition = definitions[id];
      if (!definition) throw new Error('Unknown feature: ' + id);
      var current = state[id];
      current.enabled = false;
      if (typeof assetLoader.disableStyle === 'function') (definition.styles || []).forEach(function (href) { assetLoader.disableStyle(href); });
      if (!disabling[id]) {
        disabling[id] = (async function () {
          var pendingLoad = loading[id], pendingInit = initializing[id];
          // Loading/initialization cannot be cancelled safely, but neither may
          // outlive the disable cleanup. Failed partial loads need cleanup too.
          if (pendingLoad) await pendingLoad.catch(function () {});
          if (pendingInit) await pendingInit.catch(function () {});
          if (current.initialized || current.loaded || pendingLoad || pendingInit) {
            var teardown = resolvePath(definition.teardown);
            try { if (typeof teardown === 'function') await teardown(); }
            finally {
              current.initialized = false;
              if (typeof assetLoader.disableStyle === 'function') (definition.styles || []).forEach(function (href) { assetLoader.disableStyle(href); });
            }
          }
        }()).finally(function () { delete disabling[id]; });
      }
      await disabling[id];
      return clone(current);
    }

    async function configure(enabledMap, options) {
      var config = enabledMap || {};
      var outcomes = [];
      for (var i = 0; i < Object.keys(definitions).length; i += 1) {
        var id = Object.keys(definitions)[i];
        var shouldEnable = Object.prototype.hasOwnProperty.call(config, id) ? config[id] === true : definitions[id].defaultEnabled === true;
        try { outcomes.push({ id: id, state: shouldEnable ? await enable(id, options) : await disable(id) }); }
        catch (error) { state[id].error = error.message || String(error); outcomes.push({ id: id, error: state[id].error }); }
      }
      return outcomes;
    }

    return {
      list: function () { return Object.keys(definitions).map(function (id) { return clone(definitions[id]); }); },
      get: function (id) { return definitions[id] ? clone(definitions[id]) : null; },
      getState: function (id) { return state[id] ? clone(state[id]) : null; },
      getMetrics: function () { return clone(metrics); },
      enable: enable,
      disable: disable,
      configure: configure
    };
  }

  var api = createFeatureRegistry(global.SUTRA_FEATURE_MANIFEST || {}, null);
  api.createFeatureRegistry = createFeatureRegistry;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SutraFeatureRegistry = api;
}(typeof window !== 'undefined' ? window : globalThis));
