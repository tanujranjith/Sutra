/* Bridges the device-local credential vault into the existing app seams. */
(function (global) {
  'use strict';

  var ASSISTANT_PROVIDERS = [
    'groq', 'openai', 'anthropic', 'gemini', 'openrouter', 'nvidia',
    'mistral', 'together', 'deepseek', 'xai', 'perplexity', 'local'
  ];
  var CLOUD_SESSION_KEY = 'sutra:supabaseSession:v1';
  var CLOUD_VAULT_KEY = 'cloud:supabaseSession:v1';
  var ASSISTANT_VAULT_PREFIX = 'assistant:';
  var assistantRemember = false;
  var cloudRemember = false;
  var cloudHydration = null;

  function vault() {
    return global.SutraCredentialVault && typeof global.SutraCredentialVault.get === 'function'
      ? global.SutraCredentialVault
      : null;
  }

  function safeStorage() {
    return global.SutraSafeStorage || null;
  }

  function readSession(key) {
    try {
      var storage = safeStorage();
      return storage && typeof storage.sessionGet === 'function'
        ? storage.sessionGet(key, { fallback: null, parseJson: true })
        : null;
    } catch (error) {
      return null;
    }
  }

  function writeSession(key, value) {
    try {
      var storage = safeStorage();
      return storage && typeof storage.session === 'function'
        ? storage.session(key, value)
        : { ok: false };
    } catch (error) {
      return { ok: false, error: error };
    }
  }

  function removeSession(key) {
    try {
      var storage = safeStorage();
      if (storage && typeof storage.sessionRemove === 'function') return storage.sessionRemove(key);
    } catch (error) {}
    return { ok: false };
  }

  function getInput(provider) {
    return document.getElementById(provider + 'ApiKeyInput');
  }

  function assistantVaultKey(provider) {
    return ASSISTANT_VAULT_PREFIX + provider;
  }

  async function clearAssistantVault() {
    var store = vault();
    if (!store) return;
    await Promise.all(ASSISTANT_PROVIDERS.map(function (provider) {
      return store.remove(assistantVaultKey(provider)).catch(function () {});
    }));
  }

  async function hydrateAssistantKeys() {
    var store = vault();
    if (!store) return false;
    assistantRemember = await store.getPreference('assistantRemember', false).catch(function () { return false; });
    var rememberInput = document.getElementById('assistantRememberKeysInput');
    if (rememberInput && rememberInput.dataset.userChanged !== 'true') rememberInput.checked = assistantRemember;
    if (!assistantRemember) return false;
    var restored = 0;
    for (var i = 0; i < ASSISTANT_PROVIDERS.length; i += 1) {
      var provider = ASSISTANT_PROVIDERS[i];
      var key = await store.get(assistantVaultKey(provider)).catch(function () { return null; });
      if (typeof key !== 'string' || !key) continue;
      var config = global.CHAT_PROVIDER_CONFIG;
      var storageKey = config && config[provider] && config[provider].keyStorage;
      if (!storageKey) storageKey = provider + '_api_key';
      if (!readSession(storageKey)) writeSession(storageKey, key);
      var input = getInput(provider);
      if (input) input.value = key;
      restored += 1;
    }
    if (restored) {
      try { global.dispatchEvent(new CustomEvent('sutra:assistant-credentials-restored', { detail: { count: restored } })); } catch (error) {}
    }
    return restored > 0;
  }

  async function saveAssistantKeys() {
    var store = vault();
    if (!store) return false;
    assistantRemember = !!(document.getElementById('assistantRememberKeysInput') || {}).checked;
    await store.setPreference('assistantRemember', assistantRemember).catch(function () {});
    if (!assistantRemember) {
      await clearAssistantVault();
      return true;
    }
    for (var i = 0; i < ASSISTANT_PROVIDERS.length; i += 1) {
      var provider = ASSISTANT_PROVIDERS[i];
      var input = getInput(provider);
      var value = input ? String(input.value || '').trim() : '';
      if (value) await store.set(assistantVaultKey(provider), value).catch(function () {});
      else await store.remove(assistantVaultKey(provider)).catch(function () {});
    }
    return true;
  }

  function cloudBackendUrl() {
    try {
      var storage = safeStorage();
      var backend = storage && typeof storage.get === 'function'
        ? storage.get('sutra:supabaseCustomBackend:v1', { fallback: null })
        : null;
      if (backend && backend.mode === 'custom') return String(backend.customSupabaseUrl || '').replace(/\/+$/, '');
    } catch (error) {}
    var config = global.SUTRA_CONFIG || {};
    return String(config.supabaseUrl || '').replace(/\/+$/, '');
  }

  async function hydrateCloudSession() {
    if (cloudHydration) return cloudHydration;
    var store = vault();
    if (!store) return false;
    cloudHydration = (async function () {
      cloudRemember = await store.getPreference('cloudRemember', false).catch(function () { return false; });
      if (!cloudRemember || readSession(CLOUD_SESSION_KEY)) return false;
      var saved = await store.get(CLOUD_VAULT_KEY).catch(function () { return null; });
      if (!saved || saved.version !== 1 || !saved.refreshToken || !saved.user || !saved.user.id
          || String(saved.backendUrl || '') !== cloudBackendUrl()) {
        if (saved) await store.remove(CLOUD_VAULT_KEY).catch(function () {});
        return false;
      }
      writeSession(CLOUD_SESSION_KEY, {
        accessToken: '',
        refreshToken: String(saved.refreshToken),
        expiresAtMs: 0,
        user: { id: String(saved.user.id), email: String(saved.user.email || '') }
      });
      return true;
    })().finally(function () { cloudHydration = null; });
    return cloudHydration;
  }

  async function captureCloudSession() {
    var store = vault();
    if (!store) return false;
    if (!cloudRemember) {
      await store.remove(CLOUD_VAULT_KEY).catch(function () {});
      return false;
    }
    var session = readSession(CLOUD_SESSION_KEY);
    if (!session || !session.refreshToken || !session.user || !session.user.id) return false;
    await store.set(CLOUD_VAULT_KEY, {
      version: 1,
      backendUrl: cloudBackendUrl(),
      refreshToken: String(session.refreshToken),
      user: { id: String(session.user.id), email: String(session.user.email || '') },
      savedAt: new Date().toISOString()
    }).catch(function () {});
    return true;
  }

  function cloudRememberInput() {
    return document.getElementById('sutraCloudRememberSessionInput');
  }

  function mountCloudRememberControl() {
    var area = document.getElementById('sutraCloudSetupArea');
    if (!area || document.getElementById('sutraCloudRememberSessionInput')) return;
    var label = document.createElement('label');
    label.className = 'sutra-cloud-remember';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'sutraCloudRememberSessionInput';
    input.checked = cloudRemember;
    var copy = document.createElement('span');
    copy.textContent = 'Remember me on this device (encrypted, never exported)';
    label.appendChild(input);
    label.appendChild(copy);
    input.addEventListener('change', async function () {
      cloudRemember = input.checked;
      var store = vault();
      if (!store) return;
      await store.setPreference('cloudRemember', cloudRemember).catch(function () {});
      if (cloudRemember) await captureCloudSession();
      else await store.remove(CLOUD_VAULT_KEY).catch(function () {});
    });
    area.appendChild(label);
    area.addEventListener('click', function () {
      settleCloudVaultAfterInteraction();
    });
  }

  function settleCloudVaultAfterInteraction() {
    var attempts = 0;
    function check() {
      var session = readSession(CLOUD_SESSION_KEY);
      if (session && session.refreshToken) {
        captureCloudSession().catch(function () {});
        return;
      }
      var store = vault();
      if (store) store.remove(CLOUD_VAULT_KEY).catch(function () {});
      attempts += 1;
      if (attempts < 20) setTimeout(check, 100);
    }
    setTimeout(check, 0);
  }

  function wrapCloudApi() {
    var api = global.SutraCloudSync;
    if (!api || api.__credentialVaultWrapped) return;
    api.__credentialVaultWrapped = true;
    var originalOpen = api.open;
    api.open = async function () {
      await hydrateCloudSession();
      var result = typeof originalOpen === 'function' ? originalOpen.apply(this, arguments) : undefined;
      mountCloudRememberControl();
      return result;
    };

    var originalVerify = api.verifyCode;
    if (typeof originalVerify === 'function') {
      api.verifyCode = async function () {
        var result = await originalVerify.apply(this, arguments);
        await captureCloudSession();
        return result;
      };
    }
    var originalSignOut = api.signOut;
    if (typeof originalSignOut === 'function') {
      api.signOut = async function () {
        var result = await originalSignOut.apply(this, arguments);
        var store = vault();
        if (store) await store.remove(CLOUD_VAULT_KEY).catch(function () {});
        return result;
      };
    }
    ['backupNow', 'listBackups', 'refreshBackupList', 'restore', 'deleteBackup'].forEach(function (name) {
      var original = api[name];
      if (typeof original !== 'function') return;
      api[name] = async function () {
        var result = await original.apply(this, arguments);
        await captureCloudSession();
        return result;
      };
    });
  }

  function bindAssistantUi() {
    var input = document.getElementById('assistantRememberKeysInput');
    if (input) {
      input.checked = assistantRemember;
      if (input.dataset.bound !== 'true') {
        input.dataset.bound = 'true';
        input.addEventListener('change', function () {
          input.dataset.userChanged = 'true';
          if (input.checked) {
            saveAssistantKeys().catch(function () {});
          } else {
            saveAssistantKeys().catch(function () {});
          }
        });
      }
    }
    var save = document.getElementById('saveChatKeysBtn');
    if (save && save.dataset.vaultBound !== 'true') {
      save.dataset.vaultBound = 'true';
      save.addEventListener('click', function () {
        setTimeout(function () {
          saveAssistantKeys().then(function () {
            if (assistantRemember && typeof global.showToast === 'function') global.showToast('API keys saved on this device.');
          }).catch(function () {});
        }, 0);
      });
    }
  }

  function bindCloudButton() {
    var button = document.getElementById('sutraCloudOpenBtn');
    if (!button || button.dataset.vaultBound === 'true') return;
    button.dataset.vaultBound = 'true';
    button.addEventListener('click', function () {
      setTimeout(function () {
        hydrateCloudSession().then(function () { mountCloudRememberControl(); }).catch(function () {});
      }, 0);
    });
  }

  async function initialize() {
    if (!vault()) return;
    // Bind synchronously so a user can save a key immediately after the shell
    // becomes visible, while the IndexedDB hydration continues in parallel.
    bindAssistantUi();
    wrapCloudApi();
    bindCloudButton();
    await hydrateAssistantKeys();
    await hydrateCloudSession();
  }

  function start() {
    initialize().catch(function (error) {
      try { console.warn('Device credential vault unavailable:', error); } catch (ignored) {}
    });
  }

  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}(typeof window !== 'undefined' ? window : globalThis));
