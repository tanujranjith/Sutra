/* =============================================================================
   Sutra Intelligence — Model Capability Registry
   =============================================================================
   Single source of truth for what the IMPLEMENTED provider adapters in
   src/core/app.js can actually submit to each provider/model, and for how a
   user-selected file will be processed (sent natively, extracted locally, or
   blocked). UI surfaces (assistant composer, study-material generator,
   Testing Hub entry points, model selector hints) must consult this registry
   instead of hard-coding provider/model behavior.

   Honesty rules (enforced here, relied on everywhere):
   - A modality is marked supported ONLY when the in-repo adapter actually
     builds a request payload for it (image_url / image / document /
     inline_data blocks). Provider marketing support does not count.
   - Unknown providers/models default to UNSUPPORTED for native attachments.
   - Local text extraction never claims to be native file analysis.
   - Archives are always blocked (no extraction workflow exists).
   - Executables / installers / macro-enabled docs are always blocked.

   No DOM access, no network access — pure data + functions, exposed as
   window.SutraModelCapabilities. Loaded before flow-assistant.js and app.js.
   ============================================================================= */
(function () {
    'use strict';

    /* ---------------------------------------------------------------------
       File classification
       --------------------------------------------------------------------- */

    var TEXT_EXTENSIONS = [
        'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml',
        'log', 'ini', 'toml', 'tex', 'rst', 'srt', 'vtt'
    ];
    var CODE_EXTENSIONS = [
        'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css', 'scss',
        'less', 'py', 'java', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'go', 'rs',
        'rb', 'php', 'swift', 'kt', 'kts', 'sql', 'sh', 'bash', 'zsh', 'ps1',
        'psm1', 'bat'
    ];
    var IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'];
    var ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'iso'];
    var EXECUTABLE_EXTENSIONS = [
        'exe', 'msi', 'dmg', 'pkg', 'apk', 'app', 'com', 'scr', 'jar', 'deb',
        'rpm', 'dll', 'so', 'dylib', 'crx', 'xpi'
    ];
    // Macro-enabled Office formats are blocked outright (macro payload risk).
    var MACRO_DOC_EXTENSIONS = ['docm', 'xlsm', 'pptm'];
    var AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
    var VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'];
    var DOCX_LIKE = { docx: 'document', pptx: 'presentation', odt: 'document', odp: 'presentation', ods: 'spreadsheet', xlsx: 'spreadsheet', xls: 'spreadsheet', doc: 'document', ppt: 'presentation', rtf: 'document' };

    function fileExtension(name) {
        var n = String(name || '').toLowerCase();
        var idx = n.lastIndexOf('.');
        return idx >= 0 ? n.slice(idx + 1) : '';
    }

    /**
     * Classify a file by extension + declared MIME type into a processing
     * category. MIME mismatches with risky categories resolve to the RISKIER
     * classification (extension spoofing defense).
     */
    function classifyFile(meta) {
        var name = meta && meta.name ? String(meta.name) : '';
        var mime = (meta && meta.mimeType ? String(meta.mimeType) : (meta && meta.type ? String(meta.type) : '')).toLowerCase();
        var ext = fileExtension(name);

        // Hard blocks first — extension takes precedence so a renamed MIME
        // cannot smuggle a blocked type through.
        if (EXECUTABLE_EXTENSIONS.indexOf(ext) !== -1) return { category: 'executable', ext: ext, mime: mime };
        if (MACRO_DOC_EXTENSIONS.indexOf(ext) !== -1) return { category: 'macro-document', ext: ext, mime: mime };
        if (ARCHIVE_EXTENSIONS.indexOf(ext) !== -1) return { category: 'archive', ext: ext, mime: mime };
        if (/(zip|rar|7z|x-tar|gzip|compressed)/.test(mime) && ext !== 'docx' && ext !== 'pptx' && ext !== 'xlsx' && ext !== 'odt' && ext !== 'odp' && ext !== 'ods') {
            return { category: 'archive', ext: ext, mime: mime };
        }
        if (/(msdownload|x-msdos|x-executable|java-archive)/.test(mime)) return { category: 'executable', ext: ext, mime: mime };

        if (ext === 'pdf' || mime === 'application/pdf') return { category: 'pdf', ext: ext, mime: mime || 'application/pdf' };
        if (ext === 'svg' || mime === 'image/svg+xml') {
            // SVG can carry scripts — treated as inert text, never as an image.
            return { category: 'svg', ext: ext, mime: mime || 'image/svg+xml' };
        }
        if (IMAGE_EXTENSIONS.indexOf(ext) !== -1 || /^image\//.test(mime)) return { category: 'image', ext: ext, mime: mime };
        if (AUDIO_EXTENSIONS.indexOf(ext) !== -1 || /^audio\//.test(mime)) return { category: 'audio', ext: ext, mime: mime };
        if (VIDEO_EXTENSIONS.indexOf(ext) !== -1 || /^video\//.test(mime)) return { category: 'video', ext: ext, mime: mime };
        if (TEXT_EXTENSIONS.indexOf(ext) !== -1 || /^text\//.test(mime) || mime === 'application/json') {
            return { category: 'text', ext: ext, mime: mime };
        }
        if (CODE_EXTENSIONS.indexOf(ext) !== -1) return { category: 'code', ext: ext, mime: mime };
        if (DOCX_LIKE[ext]) return { category: DOCX_LIKE[ext], ext: ext, mime: mime };
        return { category: 'unknown', ext: ext, mime: mime };
    }

    /* ---------------------------------------------------------------------
       Capability registry
       ---------------------------------------------------------------------
       Provider-level adapter truth + model-name rules. The adapter column
       reflects what src/core/app.js performIntelligenceRequest() can BUILD,
       the model rules reflect which models can ACCEPT it.
       --------------------------------------------------------------------- */

    // What each implemented adapter can place into a request payload.
    var ADAPTER_SUPPORT = {
        openai_compatible: { images: true, pdf: false, documents: false, audio: false, video: false },
        anthropic: { images: true, pdf: true, documents: false, audio: false, video: false },
        gemini: { images: true, pdf: true, documents: false, audio: false, video: false }
    };

    var PROVIDER_TYPE = {
        groq: 'openai_compatible',
        openai: 'openai_compatible',
        openrouter: 'openai_compatible',
        local: 'openai_compatible',
        anthropic: 'anthropic',
        gemini: 'gemini'
    };

    // Model-name pattern rules (most-specific provider first). Conservative:
    // unknown models fall through to "text-only".
    var VISION_MODEL_PATTERN = /(gpt-4o|gpt-4\.1|gpt-5|o[134](-|$)|claude-3|claude-4|claude-(opus|sonnet|haiku)|gemini-1\.5|gemini-2|gemini-flash|gemini-pro|vision|llava|scout|maverick|pixtral|qwen[^a-z]*vl)/i;
    // Anthropic models that accept the `document` content block (PDF input).
    var ANTHROPIC_PDF_PATTERN = /^claude-(3(\.|-)[57]|3-5|3-7|sonnet-4|opus-4|haiku-4|4)/i;
    var ANTHROPIC_PDF_FALLBACK = /claude-3\.5|claude-3-5|claude-3\.7|claude-3-7|claude-sonnet|claude-opus|claude-haiku|claude-4/i;
    // Gemini models that accept inline PDF parts.
    var GEMINI_PDF_PATTERN = /gemini-(1\.5|2|2\.5|exp|flash|pro)/i;
    var LONG_CONTEXT_PATTERN = /(gemini-1\.5|gemini-2|claude-3|claude-4|claude-(opus|sonnet|haiku)|gpt-4\.1|gpt-4o|gpt-5|128k|200k|1m)/i;

    // Conservative request-size budgets the UI enforces BEFORE building a
    // request. Providers differ; these floors avoid guaranteed failures.
    var PROVIDER_LIMITS = {
        anthropic: { maxFileBytes: 32 * 1024 * 1024, maxTotalAttachmentBytes: 32 * 1024 * 1024, maxPdfPages: 100, maxFilesPerRequest: 5 },
        gemini: { maxFileBytes: 19 * 1024 * 1024, maxTotalAttachmentBytes: 19 * 1024 * 1024, maxPdfPages: 300, maxFilesPerRequest: 8 },
        openai: { maxFileBytes: 20 * 1024 * 1024, maxTotalAttachmentBytes: 20 * 1024 * 1024, maxPdfPages: 0, maxFilesPerRequest: 8 },
        groq: { maxFileBytes: 8 * 1024 * 1024, maxTotalAttachmentBytes: 16 * 1024 * 1024, maxPdfPages: 0, maxFilesPerRequest: 4 },
        openrouter: { maxFileBytes: 16 * 1024 * 1024, maxTotalAttachmentBytes: 24 * 1024 * 1024, maxPdfPages: 0, maxFilesPerRequest: 6 },
        local: { maxFileBytes: 8 * 1024 * 1024, maxTotalAttachmentBytes: 16 * 1024 * 1024, maxPdfPages: 0, maxFilesPerRequest: 4 }
    };

    // Bounds for the safe local-extraction layer (see flow-assistant.js).
    var LOCAL_EXTRACTION_LIMITS = {
        maxSourceBytes: 20 * 1024 * 1024,   // refuse to parse bigger sources
        maxOutputChars: 400000,             // hard cap on extracted text
        maxZipEntries: 400,                 // docx/pptx internal entry cap
        maxZipEntryBytes: 8 * 1024 * 1024   // per-entry uncompressed cap
    };

    // Categories the local-extraction layer can convert to inert text.
    var LOCAL_EXTRACTION_CATEGORIES = ['text', 'code', 'svg', 'document', 'presentation'];
    // Of those, the zip-based Office formats that need JSZip:
    var ZIP_EXTRACTION_EXTENSIONS = ['docx', 'pptx'];
    // Doc-like formats we deliberately do NOT extract (unreliable without a
    // real parser): binary .doc/.ppt/.xls, RTF, OpenDocument, xlsx sheets.
    var EXTRACTION_UNSUPPORTED_EXTENSIONS = ['doc', 'ppt', 'xls', 'xlsx', 'rtf', 'odt', 'odp', 'ods'];

    function providerLimits(provider) {
        return PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.local;
    }

    /**
     * Resolve the full normalized capability object for a provider + model.
     * Conservative: anything not provably supported is reported unsupported.
     */
    function resolveModelCapabilities(provider, model) {
        var p = String(provider || '').toLowerCase();
        var m = String(model || '').trim();
        var type = PROVIDER_TYPE[p] || 'openai_compatible';
        var adapter = ADAPTER_SUPPORT[type] || ADAPTER_SUPPORT.openai_compatible;
        var limits = providerLimits(p);

        var images = !!(adapter.images && m && VISION_MODEL_PATTERN.test(m));
        if (p === 'local') {
            // Local endpoints only get vision when the user explicitly marked
            // the endpoint vision-capable (read by the caller, not here).
            images = false;
        }
        var pdf = false;
        if (adapter.pdf && m) {
            if (type === 'anthropic') pdf = ANTHROPIC_PDF_PATTERN.test(m) || ANTHROPIC_PDF_FALLBACK.test(m);
            else if (type === 'gemini') pdf = GEMINI_PDF_PATTERN.test(m);
        }

        return {
            provider: p,
            providerType: type,
            model: m,
            displayName: m || '(no model selected)',
            known: !!m,
            modalities: {
                text: true,
                images: images,
                pdf: pdf,
                documents: false,
                spreadsheets: false,
                presentations: false,
                audio: false,
                video: false
            },
            nativeAttachmentSupport: {
                pdf: pdf,
                images: images,
                documents: false,
                spreadsheets: false,
                presentations: false,
                audio: false,
                video: false
            },
            structuredOutput: !!m,           // prompt-enforced JSON + app-side validation
            streaming: false,                // adapters are non-streaming today
            toolUse: false,
            longContext: !!(m && LONG_CONTEXT_PATTERN.test(m)),
            maxContextTokens: m && LONG_CONTEXT_PATTERN.test(m) ? 200000 : 16000,
            maxFilesPerRequest: limits.maxFilesPerRequest,
            maxFileBytes: limits.maxFileBytes,
            maxTotalAttachmentBytes: limits.maxTotalAttachmentBytes,
            maxPdfPages: limits.maxPdfPages,
            localExtractionCompatibility: LOCAL_EXTRACTION_CATEGORIES.slice()
        };
    }

    /* ---------------------------------------------------------------------
       Attachment processing plans
       --------------------------------------------------------------------- */

    var PLAN_LABELS = {
        'native-pdf': 'Sent as PDF',
        'native-image': 'Analyzed as image',
        'local-extraction': 'Text extracted locally',
        'unsupported-model': 'Unsupported by selected model',
        'too-large': 'Exceeds selected model limit',
        'blocked-archive': 'Archive blocked for safety',
        'blocked-executable': 'File type blocked for safety',
        'blocked-macro': 'Macro-enabled file blocked for safety',
        'unsupported-format': 'Format not supported',
        'extraction-failed': 'Could not read file content'
    };

    /**
     * Decide how ONE file would be processed for the given provider/model.
     * Returns { plan, label, compatible, blocked, reason }.
     * `compatible === false` must block the send (never silently dropped).
     */
    function determineAttachmentProcessingPlan(provider, model, fileMeta) {
        var caps = resolveModelCapabilities(provider, model);
        var cls = classifyFile(fileMeta);
        var size = Number(fileMeta && (fileMeta.sizeBytes != null ? fileMeta.sizeBytes : fileMeta.size)) || 0;

        function out(plan, compatible, blocked, reason) {
            return {
                plan: plan,
                label: PLAN_LABELS[plan] || plan,
                compatible: compatible,
                blocked: !!blocked,
                reason: reason || '',
                category: cls.category,
                capabilities: caps
            };
        }

        if (cls.category === 'archive') {
            return out('blocked-archive', false, true, 'Archives are never unpacked. Extract the file you need and attach it directly.');
        }
        if (cls.category === 'executable') {
            return out('blocked-executable', false, true, 'Executables and installers are never processed.');
        }
        if (cls.category === 'macro-document') {
            return out('blocked-macro', false, true, 'Macro-enabled Office files are blocked. Save a macro-free copy (.docx/.pptx) and attach that.');
        }

        if (size > caps.maxFileBytes) {
            return out('too-large', false, false, 'This file is ' + Math.round(size / 1024 / 1024) + ' MB; the ' + (caps.provider || 'selected') + ' limit here is ' + Math.round(caps.maxFileBytes / 1024 / 1024) + ' MB. Attach a smaller file or split it.');
        }

        if (cls.category === 'pdf') {
            if (caps.nativeAttachmentSupport.pdf) return out('native-pdf', true, false, 'The selected model analyzes the PDF directly.');
            return out('unsupported-model', false, false, 'The selected model cannot read PDFs through Sutra. Switch to a PDF-capable model (Claude 3.5+/Claude 4 or Gemini 1.5+).');
        }
        if (cls.category === 'image') {
            if (caps.nativeAttachmentSupport.images) return out('native-image', true, false, 'The selected model analyzes the image directly.');
            return out('unsupported-model', false, false, 'The selected model is text-only. Switch to a vision-capable model to attach images.');
        }
        if (cls.category === 'text' || cls.category === 'code' || cls.category === 'svg') {
            if (size > LOCAL_EXTRACTION_LIMITS.maxSourceBytes) {
                return out('too-large', false, false, 'Too large for local text extraction (limit ' + Math.round(LOCAL_EXTRACTION_LIMITS.maxSourceBytes / 1024 / 1024) + ' MB).');
            }
            return out('local-extraction', true, false, cls.category === 'svg'
                ? 'SVG is treated as inert markup text (never rendered or executed).'
                : (cls.category === 'code' ? 'Analyzed as inert source text on-device; the code is never executed.' : 'Converted to plain text on this device; only the text is sent.'));
        }
        if (cls.category === 'document' || cls.category === 'presentation') {
            if (ZIP_EXTRACTION_EXTENSIONS.indexOf(cls.ext) !== -1) {
                if (size > LOCAL_EXTRACTION_LIMITS.maxSourceBytes) {
                    return out('too-large', false, false, 'Too large for local text extraction (limit ' + Math.round(LOCAL_EXTRACTION_LIMITS.maxSourceBytes / 1024 / 1024) + ' MB).');
                }
                return out('local-extraction', true, false, 'Text is extracted from the ' + cls.ext.toUpperCase() + ' on this device; only that text is sent. Layout, images, and embedded objects are not included.');
            }
            return out('unsupported-format', false, false, 'No safe on-device extractor exists for .' + cls.ext + ' yet. Export it as PDF (best), .docx/.pptx, or plain text and attach that.');
        }
        if (cls.category === 'spreadsheet') {
            return out('unsupported-format', false, false, 'Spreadsheets are not supported natively here. Export the sheet as CSV and attach that instead.');
        }
        if (cls.category === 'audio' || cls.category === 'video') {
            return out('unsupported-format', false, false, 'No Sutra Intelligence model connection supports ' + cls.category + ' input yet.');
        }
        return out('unsupported-format', false, false, 'Unrecognized file type. Attach PDFs, images, or text-based files.');
    }

    /**
     * Validate a whole attachment set against provider/model limits.
     * Returns { ok, problems: [{index, name, plan}], totals }.
     */
    function validateAttachmentSet(provider, model, files) {
        var caps = resolveModelCapabilities(provider, model);
        var list = Array.isArray(files) ? files : [];
        var problems = [];
        var totalBytes = 0;
        list.forEach(function (f, idx) {
            var plan = determineAttachmentProcessingPlan(provider, model, f);
            totalBytes += Number(f && (f.sizeBytes != null ? f.sizeBytes : f.size)) || 0;
            if (!plan.compatible) problems.push({ index: idx, name: f && f.name, plan: plan });
        });
        if (list.length > caps.maxFilesPerRequest) {
            problems.push({ index: -1, name: '(count)', plan: { plan: 'too-many', label: 'Too many attachments', compatible: false, reason: 'At most ' + caps.maxFilesPerRequest + ' attachments per request for this model.' } });
        }
        if (totalBytes > caps.maxTotalAttachmentBytes) {
            problems.push({ index: -1, name: '(total size)', plan: { plan: 'too-large', label: 'Combined attachments too large', compatible: false, reason: 'Attachments total ' + Math.round(totalBytes / 1024 / 1024) + ' MB; the combined limit is ' + Math.round(caps.maxTotalAttachmentBytes / 1024 / 1024) + ' MB.' } });
        }
        return { ok: problems.length === 0, problems: problems, totals: { count: list.length, bytes: totalBytes } };
    }

    /**
     * Suggest provider/model combos (from those the app ships adapters for)
     * that can natively handle the given file category.
     */
    function suggestCompatibleModels(category) {
        if (category === 'pdf') {
            return [
                { provider: 'anthropic', hint: 'Claude Sonnet 4 / Claude 3.5+ (Anthropic)' },
                { provider: 'gemini', hint: 'Gemini 2.x / 1.5 (Google)' }
            ];
        }
        if (category === 'image') {
            return [
                { provider: 'anthropic', hint: 'Claude 3.5+ / Claude 4 (Anthropic)' },
                { provider: 'gemini', hint: 'Gemini 1.5+ (Google)' },
                { provider: 'openai', hint: 'GPT-4o / GPT-4.1 (OpenAI)' }
            ];
        }
        return [];
    }

    window.SutraModelCapabilities = {
        VERSION: 1,
        classifyFile: classifyFile,
        resolveModelCapabilities: resolveModelCapabilities,
        determineAttachmentProcessingPlan: determineAttachmentProcessingPlan,
        validateAttachmentSet: validateAttachmentSet,
        suggestCompatibleModels: suggestCompatibleModels,
        LOCAL_EXTRACTION_LIMITS: LOCAL_EXTRACTION_LIMITS,
        PLAN_LABELS: PLAN_LABELS
    };
})();
