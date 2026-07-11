/* Declarative optional feature packs. Runtime code consumes this as data only. */
(function (global) {
  'use strict';
  global.SUTRA_FEATURE_MANIFEST = Object.freeze({
    business: Object.freeze({
      id: 'business', displayName: 'Business Pack', pack: 'work', defaultEnabled: false,
      dependencies: [],
      scripts: ['./src/features/workspace/business-workspace.js?v=20260705-clb3'],
      styles: [],
      initialization: 'NoteFlowBusiness.init', teardown: 'NoteFlowBusiness.teardown',
      navigationEntries: ['business'], persistenceNamespace: 'businessWorkspace',
      assistantCapabilities: ['business'], searchIntegration: ['business'], commandIntegration: ['open-business']
    }),
    assistant: Object.freeze({
      id: 'assistant', displayName: 'Sutra Assistant', pack: 'assistant', defaultEnabled: false,
      dependencies: [],
      scripts: [
        './src/features/assistant/model-capabilities.js?v=20260610-intel1',
        './src/features/assistant/sutra-product-knowledge.js?v=20260629-intel2',
        './src/features/assistant/sutra-capability-registry.js?v=20260707-batch7',
        './src/features/assistant/action-system.js?v=20260709-actions2',
        './src/features/assistant/flow-intelligence.js?v=20260614-storage1',
        './src/features/assistant/flow-assistant.js?v=20260707-batch7',
        './src/features/assistant/sutra-assistant-memory.js?v=20260629-intel3',
        './src/features/assistant/sutra-local-help.js?v=20260630-assist-hw8'
      ],
      styles: [
        './styles/features/sutra-assistant-help.css?v=20260629-intel3',
        './styles/features/sutra-intelligence.css?v=20260610-intel1',
        './styles/views/assistant-view.css?v=20260703-voice1'
      ],
      initialization: 'sutraAssistant.init', teardown: 'sutraAssistant.teardown',
      navigationEntries: ['assistantview'], persistenceNamespace: 'assistantChatHistory',
      assistantCapabilities: ['*'], searchIntegration: ['assistant'], commandIntegration: ['open-assistant']
    })
  });
}(typeof window !== 'undefined' ? window : globalThis));
