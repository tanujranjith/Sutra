(function (global) {
  'use strict';
  var activePageId = '';
  var activeSlideId = '';
  var selectedElementId = '';
  var contentTimelineTokens = new WeakMap();
  var closePresentation = null;
  var root = null;
  var undoStack = [];
  var redoStack = [];
  var elementClipboard = null;
  var dragState = null;
  var stageZoom = 1;
  var themes = {
    sutra: { bg: '#fbfaf5', ink: '#173d2b', accent: '#635bdf' },
    nature: { bg: '#fbfaf5', ink: '#1f4d38', accent: '#3f7c52' },
    midnight: { bg: '#18222d', ink: '#f3f5f7', accent: '#8b82ff' },
    paper: { bg: '#ffffff', ink: '#243141', accent: '#4169a8' }
  };

  function id() { return 'slide_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function appBridge() {
    var bridge = global.flowAtelier;
    if (!bridge || !Array.isArray(bridge.pages) || typeof bridge.persistAppData !== 'function') {
      throw new Error('Slides requires the canonical Sutra workspace bridge.');
    }
    return bridge;
  }
  function workspace() {
    var bridge = appBridge();
    return { pages: bridge.pages, ui: { lastOpenedPageId: bridge.currentPageId || '' } };
  }
  function pageFrom(data) { var page = (data.pages || []).find(function (item) { return item && item.id === activePageId; }) || null; return page && pageContentAuthorized(page) ? page : null; }
  function deckFor(page) { return page && page.slides && Array.isArray(page.slides.slides) ? page.slides : null; }
  function pageContentAuthorized(page) {
    if (document.documentElement.getAttribute('data-sutra-workspace-locked') === 'true') return false;
    var bridge = appBridge();
    if (typeof bridge.isPageContentAuthorized === 'function') return bridge.isPageContentAuthorized(page);
    var unlocked = bridge.unlockedPageIds;
    return !!(page && !(page.isLocked && page.lockHash && !(unlocked && unlocked.has && unlocked.has(page.id))));
  }
  function pageCanWrite(page) {
    if (!page || !pageContentAuthorized(page)) return false;
    var bridge = appBridge();
    if (typeof bridge.canWritePageContent === 'function') {
      try { return bridge.canWritePageContent(page) === true; } catch (_) { return false; }
    }
    return true;
  }
  function contentTimelineHelper() {
    var helper = global.SutraContentTimeline;
    return helper && typeof helper.inspect === 'function' && typeof helper.normalize === 'function' ? helper : null;
  }
  function normalizeContentTimeline(value) {
    var helper = contentTimelineHelper();
    if (!helper) return value;
    try {
      var status = helper.inspect(value);
      return status && status.supported && !status.readOnly ? helper.normalize(value) : value;
    } catch (_) { return value; }
  }
  function contentTimelineText(model) {
    var helper = contentTimelineHelper();
    if (!helper || typeof helper.toPlainText !== 'function') return '';
    try { return String(helper.toPlainText(model) || ''); } catch (_) { return ''; }
  }
  function contentTimelineTitle(model) {
    var helper = contentTimelineHelper();
    if (!helper) return 'Timeline';
    try {
      var status = helper.inspect(model);
      return status && status.supported ? String(model.title || 'Timeline') : 'Timeline';
    } catch (_) { return 'Timeline'; }
  }
  function activeSlide(deck) { return deck && deck.slides.find(function (slide) { return slide.id === activeSlideId; }) || (deck && deck.slides[0]) || null; }
  function updateStageSize() {
    if (!root) return;
    var center = root.querySelector('.slides-center');
    var stage = root.querySelector('.slides-stage');
    var context = root.querySelector('.slides-center-head');
    var notes = root.querySelector('.slides-notes-panel');
    if (!center || !stage || !context || !notes || !center.clientWidth) return;
    var ratio = root.dataset.size === 'standard' ? 4 / 3 : 16 / 9;
    var noteHeight = notes.open ? notes.offsetHeight : notes.querySelector('summary').offsetHeight;
    var gap = 10;
    var availableHeight = Math.max(180, center.clientHeight - context.offsetHeight - noteHeight - gap * 2 - 10);
    var maximumWidth = root.dataset.size === 'standard' ? 760 : 940;
    var fitWidth = Math.min(maximumWidth, center.clientWidth, availableHeight * ratio);
    stage.style.maxWidth = 'none';
    stage.style.width = Math.round(Math.max(180, fitWidth * stageZoom)) + 'px';
    var zoomLabel = root.querySelector('[data-zoom-level]');
    if (zoomLabel) zoomLabel.textContent = stageZoom === 1 ? 'Fit' : Math.round(stageZoom * 100) + '%';
  }
  function setStageZoom(value) {
    stageZoom = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10));
    updateStageSize();
  }
  function renderThumbnail(item, theme, size) {
    var preview = document.createElement('span');
    preview.className = 'slides-thumbnail-preview';
    preview.dataset.size = size === 'standard' ? 'standard' : 'widescreen';
    preview.setAttribute('aria-hidden', 'true');
    preview.style.background = item.background || theme.bg;
    (Array.isArray(item.elements) ? item.elements : []).slice(0, 8).forEach(function (element) {
      var object = document.createElement('span');
      object.className = 'slides-thumbnail-object slides-thumbnail-object-' + element.type;
      object.style.left = Math.max(0, Math.min(100, Number(element.x) || 0)) + '%';
      object.style.top = Math.max(0, Math.min(100, Number(element.y) || 0)) + '%';
      object.style.width = Math.max(1, Math.min(100, Number(element.width) || 1)) + '%';
      object.style.height = Math.max(1, Math.min(100, Number(element.height) || 1)) + '%';
      if (element.type === 'shape') {
        object.style.background = element.fill || '#e8eaf0';
        object.style.borderColor = element.borderColor || 'transparent';
      } else if (element.type === 'image') {
        object.textContent = '▧';
      } else if (element.type === 'chart') {
        object.textContent = '▂ ▅ ▃';
      } else if (element.type === 'table') {
        object.textContent = '▦';
      } else {
        object.textContent = element.type === 'content-timeline'
          ? contentTimelineTitle(element.contentTimeline)
          : String(element.text || '').slice(0, 90);
        object.style.color = element.color || theme.ink;
        object.style.fontSize = Math.max(1, Math.min(6, Number(element.fontSize) || 3)) + 'cqw';
        object.style.fontWeight = element.fontWeight === 'bold' ? '700' : '400';
        object.style.textAlign = element.textAlign || 'left';
      }
      preview.appendChild(object);
    });
    return preview;
  }
  function setEditorVisible(visible) {
    if (!root) return;
    if (!visible) closeToolbarMenus(false);
    root.hidden = !visible;
    root.toggleAttribute('inert', !visible);
    root.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  function scheduleSave() { appBridge().persistAppData(); }
  function escapeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function escapeHtml(value) { return escapeText(value).replace(/[&<>"']/g, function (character) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]; }); }
  function makeElement(type, fields) { return Object.assign({ id: id(), type: type, x: 10, y: 12, width: type === 'text' ? 42 : 24, height: type === 'text' ? 12 : 20, text: '', fontSize: 3, fontWeight: 'normal', fill: 'transparent', color: '#173d2b', borderColor: '#d7d3c7', borderWidth: 0, assetFileId: '' }, fields || {}); }
  function makeSlide(layout, title) {
    var elements = [];
    if (layout === 'title') {
      elements.push(makeElement('text', { x: 10, y: 25, width: 76, height: 25, text: title || 'Untitled presentation', fontSize: 6, fontWeight: 'bold' }));
      elements.push(makeElement('text', { x: 10, y: 54, width: 72, height: 10, text: 'Add a concise subtitle or guiding question.', fontSize: 2.5 }));
    } else if (layout === 'three-card') {
      elements.push(makeElement('text', { x: 8, y: 7, width: 84, height: 18, text: title || 'Untitled slide', fontSize: 5, fontWeight: 'bold' }));
      ['First idea', 'Why it matters', 'Key detail'].forEach(function (text, index) { var x = 8 + index * 30; elements.push(makeElement('shape', { x: x, y: 31, width: 25, height: 38, fill: '#ffffff', borderWidth: 1 })); elements.push(makeElement('text', { x: x + 3, y: 38, width: 19, height: 8, text: text, fontWeight: 'bold' })); });
    } else if (layout !== 'blank') {
      elements.push(makeElement('text', { x: 8, y: 8, width: 84, height: 18, text: title || 'New slide', fontSize: 5, fontWeight: 'bold' }));
      elements.push(makeElement('text', { x: 10, y: 25, width: 62, height: 40, text: layout === 'two-column' ? 'First idea\n\nSecond idea' : '• Add your first point\n• Keep each point focused\n• Use notes for detail', fontSize: 3 }));
    }
    return { id: id(), layout: layout || 'title-body', title: title || 'New slide', speakerNotes: '', elements: elements };
  }
  function normalizeDeck(raw, title) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var slides = (Array.isArray(source.slides) ? source.slides : []).map(function (rawSlide) {
      var slide = rawSlide && typeof rawSlide === 'object' ? rawSlide : {};
      return Object.assign({}, slide, {
        id: String(slide.id || id()),
        layout: String(slide.layout || 'blank'),
        title: String(slide.title || 'Untitled slide').slice(0, 500),
        speakerNotes: String(slide.speakerNotes || '').slice(0, 50000),
        background: typeof slide.background === 'string' ? slide.background.slice(0, 128) : '',
        elements: (Array.isArray(slide.elements) ? slide.elements : []).map(function (rawElement) {
          var element = rawElement && typeof rawElement === 'object' ? rawElement : {};
          var normalizedElement = Object.assign({}, element, {
            id: String(element.id || id()), type: ['text', 'shape', 'image', 'chart', 'table', 'content-timeline'].indexOf(element.type) >= 0 ? element.type : 'text',
            x: Math.max(0, Math.min(100, Number(element.x) || 0)), y: Math.max(0, Math.min(100, Number(element.y) || 0)),
            width: Math.max(1, Math.min(100, Number(element.width) || 20)), height: Math.max(1, Math.min(100, Number(element.height) || 10)),
            zIndex: Number(element.zIndex) || 0, text: String(element.text || '').slice(0, 20000),
            textAlign: ['left', 'center', 'right'].indexOf(element.textAlign) >= 0 ? element.textAlign : 'left',
            imageFit: ['contain', 'cover'].indexOf(element.imageFit) >= 0 ? element.imageFit : 'contain'
          });
          if (element.type === 'content-timeline') normalizedElement.contentTimeline = normalizeContentTimeline(element.contentTimeline);
          return normalizedElement;
        })
      });
    });
    if (!slides.length) slides = [makeSlide('title', title || 'Untitled presentation')];
    return Object.assign({}, source, { version: 2, size: source.size === 'standard' ? 'standard' : 'widescreen', theme: themes[source.theme] ? source.theme : 'sutra', slides: slides, importWarnings: Array.isArray(source.importWarnings) ? source.importWarnings.map(String).slice(0, 100) : [] });
  }
  function ensureDeck(page) {
    if (!page.slides || !Array.isArray(page.slides.slides) || page.slides.version !== 2) page.slides = normalizeDeck(page.slides, page.title);
    if (!page.slides.slides.length) page.slides.slides.push(makeSlide('title', page.title || 'Untitled presentation'));
    return page.slides;
  }
  function button(label, icon, action, title) { var b = document.createElement('button'); b.type = 'button'; b.className = 'slides-toolbar-btn'; b.title = title || label; b.setAttribute('aria-label', label); if (icon) { var glyph = document.createElement('i'); glyph.className = 'fas ' + icon; glyph.setAttribute('aria-hidden', 'true'); b.appendChild(glyph); var labelNode = document.createElement('span'); labelNode.textContent = label; b.appendChild(labelNode); } else b.textContent = label; b.addEventListener('click', action); return b; }
  function addElement(type) { mutate(function (deck) { var slide = activeSlide(deck); var element = type === 'chart' ? makeElement('chart', { x: 32, y: 30, width: 38, height: 35, text: 'Chart', chart: { labels: ['A', 'B', 'C'], values: [5, 8, 4] } }) : type === 'table' ? makeElement('table', { x: 12, y: 28, width: 76, height: 42, text: 'Header 1\tHeader 2\nValue 1\tValue 2', rows: [['Header 1', 'Header 2'], ['Value 1', 'Value 2']], fill: '#ffffff', borderWidth: 1 }) : makeElement(type, type === 'shape' ? { x: 35, y: 35, width: 24, height: 18, text: 'Shape', fill: '#e9e6db', borderWidth: 1 } : { x: 15, y: 35, text: 'Add text', fontSize: 4 }); slide.elements.push(element); selectedElementId = element.id; }); var objectDisclosure = root && root.querySelector('[data-object-disclosure]'); if (objectDisclosure) objectDisclosure.open = true; }
  function duplicateSlide() { mutate(function (deck) { var current = activeSlide(deck); var copy = JSON.parse(JSON.stringify(current)); copy.id = id(); copy.title = (copy.title || 'Slide') + ' copy'; copy.elements.forEach(function (element) { element.id = id(); }); deck.slides.splice(deck.slides.indexOf(current) + 1, 0, copy); activeSlideId = copy.id; selectedElementId = ''; }); }
  function deleteSlide() { mutate(function (deck) { if (deck.slides.length < 2) { showToast('A deck needs at least one slide.'); return; } var i = deck.slides.indexOf(activeSlide(deck)); deck.slides.splice(i, 1); activeSlideId = deck.slides[Math.max(0, i - 1)].id; }); }
  function chooseImage() { var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif'; input.addEventListener('change', function () { var file = input.files && input.files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { showToast('Slide images must be 10MB or smaller.'); return; } var reader = new FileReader(); reader.onload = function () { mutate(function (deck) { activeSlide(deck).elements.push(makeElement('image', { x: 54, y: 15, width: 37, height: 57, dataUrl: reader.result, alt: file.name })); }); }; reader.readAsDataURL(file); }); input.click(); }
  function escapePrintableText(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]; }); }
  function exportElementText(element) { return element && element.type === 'content-timeline' ? contentTimelineText(element.contentTimeline) : String(element && element.text || ''); }
  function printablePercent(value, fallback) { var number = Number(value); if (!isFinite(number)) number = fallback; return Math.max(0, Math.min(100, number)) + '%'; }
  function printableColor(value, fallback) { return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '')) ? value : fallback; }
  function printPdf() {
    var data = workspace(); var page = pageFrom(data); if (!page) return; var popup = global.open('', '_blank', 'noopener,noreferrer'); if (!popup) { showToast('Allow pop-ups to print Slides as PDF.'); return; }
    var deck = deckFor(page); var theme = themes[deck.theme] || themes.sutra; var slideWidth = deck.size === 'standard' ? '10in' : '13.333in';
    var pages = deck.slides.map(function (slide) {
      var objects = slide.elements.filter(function (element) { return element.type !== 'image'; }).map(function (element) {
        var fill = printableColor(element.fill, 'transparent'); var color = printableColor(element.color, theme.ink); var borderColor = printableColor(element.borderColor, '#d7d3c7'); var borderWidth = Math.max(0, Math.min(20, Number(element.borderWidth) || 0));
        var fontWeight = element.fontWeight === 'bold' || element.fontWeight === '700' ? '700' : '400'; var align = ['left', 'center', 'right'].indexOf(element.textAlign) >= 0 ? element.textAlign : 'left';
        var style = 'left:' + printablePercent(element.x, 0) + ';top:' + printablePercent(element.y, 0) + ';width:' + printablePercent(element.width, 20) + ';height:' + printablePercent(element.height, 10) + ';font-size:' + fitSlideTextFontSize(element, deck) + 'cqw;font-weight:' + fontWeight + ';text-align:' + align + ';color:' + color + ';background:' + fill + ';border:' + borderWidth + 'px solid ' + borderColor + ';';
        return '<div class="slide-object" style="' + style + '">' + escapePrintableText(exportElementText(element)) + '</div>';
      }).join('');
      return '<section class="slide" style="background:' + printableColor(slide.background, theme.bg) + '">' + objects + '</section>';
    }).join('');
    popup.document.write('<!doctype html><title>' + escapeHtml(page.title) + '</title><style>@page{size:landscape;margin:0}*{box-sizing:border-box}.slide{position:relative;width:' + slideWidth + ';height:7.5in;margin:0 auto;page-break-after:always;overflow:hidden;container-type:inline-size;font-family:Arial,sans-serif}.slide-object{position:absolute;overflow:hidden;white-space:pre-wrap;line-height:1.15}</style>' + pages + '<script>addEventListener("load",function(){print()})<\/script>'); popup.document.close(); // sutra-allow-html: escaped deck text, validated hex colors, bounded numeric geometry, and static print script.
  } // sutra-allow-html: printable text and colors are escaped or validated; geometry and font sizes use normalized numeric values.
  async function exportPptx() { var page = pageFrom(workspace()); if (!page || !global.SutraOfficeInterop) { showToast('PPTX export is unavailable in this browser.'); return false; } try { var deck = cloneDeck(deckFor(page)); deck.slides.forEach(function (slide) { slide.elements.forEach(function (element) { if (element.type === 'content-timeline') element.text = contentTimelineText(element.contentTimeline); else if (element.type === 'text' || element.type === 'shape') element.fontSize = fitSlideTextFontSize(element, deck, 16 / 9) * 9.6; }); }); await global.SutraOfficeInterop.downloadPptx(deck, page.title || 'presentation'); showToast('PowerPoint file exported.'); return true; } catch (error) { showToast(error && error.message || 'PPTX export failed.'); return false; } }
  async function importPptx(file) { var page = pageFrom(workspace()); if (!page || !file || !global.SutraOfficeInterop) return { ok: false, error: 'Choose a PPTX file to import.' }; try { var imported = await global.SutraOfficeInterop.importPptx(file); mutate(function (_, currentPage) { currentPage.slides = normalizeDeck(imported.deck, currentPage.title); activeSlideId = currentPage.slides.slides[0].id; selectedElementId = ''; }); var warnings = imported.report && imported.report.warnings || []; if (warnings.length) global.alert('Presentation imported with warnings:\n\n• ' + warnings.join('\n• ')); else showToast('PowerPoint file imported.'); return { ok: true, deck: imported.deck, report: imported.report }; } catch (error) { showToast(error && error.message || 'PPTX import failed.'); return { ok: false, error: error && error.message || 'PPTX import failed.' }; } }
  function getContext() {
    var data = workspace(); var page = pageFrom(data); var deck = page && deckFor(page);
    if (!page || !deck) return null;
    return {
      id: page.id, title: page.title || 'Untitled presentation', type: 'slides',
      theme: deck.theme || 'sutra', size: deck.size || 'widescreen', slideCount: deck.slides.length,
      slides: deck.slides.slice(0, 10).map(function (slide) {
        return {
          id: slide.id, title: String(slide.title || '').slice(0, 300), layout: slide.layout || 'blank',
          background: String(slide.background || '').slice(0, 64), speakerNotes: String(slide.speakerNotes || '').slice(0, 500),
          elements: (Array.isArray(slide.elements) ? slide.elements : []).slice(0, 10).map(function (element) {
            return {
              id: element.id, type: element.type, x: Number(element.x) || 0, y: Number(element.y) || 0,
              width: Number(element.width) || 0, height: Number(element.height) || 0, zIndex: Number(element.zIndex) || 0,
              fontSize: Number(element.fontSize) || 0, fontWeight: String(element.fontWeight || '').slice(0, 32),
              fill: String(element.fill || '').slice(0, 64), color: String(element.color || '').slice(0, 64),
              borderColor: String(element.borderColor || '').slice(0, 64), borderWidth: Number(element.borderWidth) || 0,
              text: String(element.text || '').slice(0, 240), alt: String(element.alt || '').slice(0, 160),
              chart: element.type === 'chart' && element.chart ? {
                labels: (element.chart.labels || []).slice(0, 12).map(function (label) { return String(label).slice(0, 100); }),
                values: (element.chart.values || []).slice(0, 12).map(Number)
              } : undefined
            };
          })
        };
      })
    };
  }
  function assistantEngine() { return global.SutraSurfaceAssistantActions || null; }
  function validateAssistantOperations(operations, options) {
    var engine = assistantEngine();
    if (!engine || typeof engine.applySlides !== 'function') return { ok: false, error: 'Slides Assistant engine is unavailable.' };
    var page = pageFrom(workspace());
    var deck = options && options.create ? { version: 2, size: 'widescreen', theme: 'sutra', slides: [] } : (page && deckFor(page));
    if (!deck) return { ok: false, error: 'Open an unlocked Slides deck first.' };
    var sequence = 0;
    return engine.applySlides(deck, operations, { idFactory: function () { sequence += 1; return 'slides-preview-' + sequence; }, now: 'preview' });
  }
  function createAssistantDeck(spec) {
    var input = spec && typeof spec === 'object' ? spec : {};
    var engine = assistantEngine();
    if (!engine || typeof engine.applySlides !== 'function') return { ok: false, error: 'Slides Assistant engine is unavailable.' };
    var operations = (Array.isArray(input.slides) ? input.slides : []).map(function (slide) { return Object.assign({}, slide, { type: 'add_slide' }); });
    if (input.theme) operations.push({ type: 'theme', theme: input.theme });
    if (input.size) operations.push({ type: 'size', size: input.size });
    var applied = engine.applySlides({ version: 2, size: 'widescreen', theme: 'sutra', slides: [] }, operations, { idFactory: id, now: new Date().toISOString() });
    if (!applied.ok) return applied;
    var page = createPage(String(input.title || 'Presentation').slice(0, 180), { deck: applied.model });
    return { ok: !!page, page: page, slideCount: applied.model.slides.length };
  }
  function applyAssistantOperations(operations) {
    var page = pageFrom(workspace());
    var engine = assistantEngine();
    if (!page || !deckFor(page)) return { ok: false, error: 'Open an unlocked Slides deck first.' };
    if (!engine || typeof engine.applySlides !== 'function') return { ok: false, error: 'Slides Assistant engine is unavailable.' };
    var applied = engine.applySlides(page.slides, operations, { idFactory: id, now: new Date().toISOString() });
    if (!applied.ok) return applied;
    page.slides = applied.model;
    page.updatedAt = new Date().toISOString();
    applied.undo.pageId = page.id;
    if (applied.createdSlideIds.length) activeSlideId = applied.createdSlideIds[applied.createdSlideIds.length - 1];
    scheduleSave();
    render();
    return Object.assign(applied, { pageId: page.id });
  }
  function undoAssistantMutation(payload) {
    var engine = assistantEngine();
    if (!engine || typeof engine.undoSlides !== 'function' || !payload || !payload.pageId) return { ok: false, error: 'Slides undo is unavailable.' };
    var bridge = appBridge();
    var page = bridge.pages.find(function (item) { return item && item.id === payload.pageId; }) || null;
    if (!page || !pageContentAuthorized(page) || !deckFor(page)) return { ok: false, error: 'Unlock the Slides deck before undoing this edit.' };
    var restored = engine.undoSlides(page.slides, payload);
    if (!restored.ok) return restored;
    page.slides = restored.model;
    page.updatedAt = new Date().toISOString();
    bridge.persistAppData();
    if (page.id === activePageId) render();
    if (typeof bridge.renderPagesList === 'function') bridge.renderPagesList();
    return { ok: true, pageId: page.id };
  }
  function refresh() {
    var data;
    try { data = workspace(); } catch (error) { return; }
    var pageId = data.ui && data.ui.lastOpenedPageId || '';
    if (activePageId !== pageId) stageZoom = 1;
    var page = (data.pages || []).find(function (item) { return item && item.id === pageId; });
    if (activePageId !== pageId || !page || !pageContentAuthorized(page)) {
      closeSlideAction(false);
      if (closePresentation) closePresentation(false);
    }
    if (!page || !pageContentAuthorized(page)) {
      undoStack = []; redoStack = []; elementClipboard = null; dragState = null; selectedElementId = '';
      if (root) {
        root.querySelector('.slides-stage').replaceChildren();
        root.querySelector('.slides-thumbnail-list').replaceChildren();
        root.querySelector('.slides-notes-panel textarea').value = '';
        root.querySelector('[data-element-name]').textContent = '';
      }
    }
    activePageId = pageId;
    var visible = !!(page && pageContentAuthorized(page) && page.slides && Array.isArray(page.slides.slides));
    if (visible) { if (page.slides.version !== 2) { page.slides = normalizeDeck(page.slides, page.title); appBridge().persistAppData(); } mount(); render(); } else setEditorVisible(false);
    document.body.classList.toggle('slides-page-active', visible);
  }
  function createPage(title, options) { var bridge = appBridge(); var now = new Date().toISOString(); var deck = options && options.deck && Array.isArray(options.deck.slides) ? normalizeDeck(options.deck, title) : { version: 2, size: 'widescreen', theme: 'sutra', slides: [makeSlide(options && options.layout === 'blank' ? 'blank' : 'title', title || 'Untitled presentation')] }; var page = { id: id(), title: title || 'Presentation', type: 'note', content: '', blocks: [], icon: '🖼️', spaceId: bridge.getActiveSpaceId ? bridge.getActiveSpaceId() : 'default', createdAt: now, updatedAt: now, slides: deck }; bridge.pages.push(page); bridge.persistAppData(); if (typeof bridge.renderPagesList === 'function') bridge.renderPagesList(); if (typeof global.loadPage === 'function') global.loadPage(page.id); return page; }
  function cloneDeck(deck) { return JSON.parse(JSON.stringify(deck)); }
  function createFromNewPageDialog() { var titleInput = document.getElementById('newPageName'); var title = titleInput && titleInput.value || 'Presentation'; var modal = document.getElementById('newPageModal'); if (modal) modal.classList.remove('active'); createPage(title); }

  // Workbench layer: session undo/redo, direct object manipulation, and a focused
  // inspector. It stays within the canonical page.slides record; no second store.
  function historySnapshot(page) { return { pageId: page.id, deck: cloneDeck(ensureDeck(page)) }; }
  function pushHistory(page) { undoStack.push(historySnapshot(page)); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
  function mutate(change, rerender, options) {
    var data = workspace(); var page = pageFrom(data); if (!page || !pageContentAuthorized(page)) return;
    var deck = ensureDeck(page); if (!options || options.history !== false) pushHistory(page);
    change(deck, page); page.updatedAt = new Date().toISOString(); scheduleSave(); if (rerender !== false) render();
  }
  function currentContentTimelineContext() {
    var bridge = appBridge();
    var page = pageFrom(workspace());
    var deck = page && deckFor(page);
    var slide = deck && activeSlide(deck);
    if (!page || !deck || !slide || !pageCanWrite(page) || String(bridge.currentPageId || '') !== String(page.id)) return null;
    return { page: page, deck: deck, slide: slide };
  }
  function captureContentTimelineInsertion() {
    var context = currentContentTimelineContext();
    if (!context) return null;
    var token = {};
    contentTimelineTokens.set(token, {
      kind: 'insert', page: context.page, deck: context.deck, slide: context.slide,
      pageId: context.page.id, slideId: context.slide.id, updatedAt: context.page.updatedAt,
      selectedElementId: selectedElementId
    });
    return token;
  }
  function captureContentTimelineSelection(element) {
    var context = currentContentTimelineContext();
    if (!context || !element || element.type !== 'content-timeline') return null;
    var modelSnapshot;
    try { modelSnapshot = JSON.stringify(element.contentTimeline); } catch (_) { return null; }
    var token = {};
    contentTimelineTokens.set(token, {
      kind: 'update', page: context.page, deck: context.deck, slide: context.slide,
      element: element, elementId: element.id, pageId: context.page.id, slideId: context.slide.id,
      updatedAt: context.page.updatedAt, modelSnapshot: modelSnapshot
    });
    return token;
  }
  function contentTimelineTokenState(token, kind) {
    if (!token || typeof token !== 'object' || !contentTimelineTokens.has(token)) return null;
    var state = contentTimelineTokens.get(token);
    if (kind && state.kind !== kind) return null;
    var context = currentContentTimelineContext();
    if (!context || context.page !== state.page || context.deck !== state.deck || context.slide !== state.slide ||
        String(context.page.id) !== String(state.pageId) || String(context.slide.id) !== String(state.slideId) ||
        context.page.updatedAt !== state.updatedAt) return null;
    if (state.kind === 'insert' && selectedElementId !== state.selectedElementId) return null;
    if (state.kind === 'update') {
      var selected = selectedElement(context.deck);
      if (selected !== state.element || !selected || selected.id !== state.elementId) return null;
      var snapshot;
      try { snapshot = JSON.stringify(selected.contentTimeline); } catch (_) { return null; }
      if (snapshot !== state.modelSnapshot) return null;
    }
    return state;
  }
  function insertContentTimeline(model, token) {
    var helper = contentTimelineHelper();
    var state;
    if (!helper) return false;
    try { var status = helper.inspect(model); if (!status || !status.supported || status.readOnly) return false; } catch (_) { return false; }
    if (token == null) token = captureContentTimelineInsertion();
    state = contentTimelineTokenState(token, 'insert');
    if (!state) return false;
    contentTimelineTokens.delete(token);
    var normalized;
    try { normalized = helper.normalize(model); } catch (_) { return false; }
    var inserted = false;
    mutate(function (deck, page) {
      var slide = activeSlide(deck);
      if (page !== state.page || deck !== state.deck || slide !== state.slide || page.updatedAt !== state.updatedAt || !pageCanWrite(page)) return;
      var element = makeElement('content-timeline', { x: 8, y: 18, width: 84, height: 64, text: contentTimelineTitle(normalized), contentTimeline: normalized, fill: '#ffffff', borderWidth: 1 });
      slide.elements.push(element);
      selectedElementId = element.id;
      inserted = true;
    });
    return inserted;
  }
  function getContentTimelineSelection() {
    var context = currentContentTimelineContext();
    var element = context && selectedElement(context.deck);
    var token = captureContentTimelineSelection(element);
    return token ? { model: element.contentTimeline, token: token } : null;
  }
  function updateContentTimeline(token, model) {
    var helper = contentTimelineHelper();
    var state = contentTimelineTokenState(token, 'update');
    if (!state || !helper) return false;
    try { if (!helper.inspect(state.element.contentTimeline).supported) return false; } catch (_) { return false; }
    try { var status = helper.inspect(model); if (!status || !status.supported || status.readOnly) return false; } catch (_) { return false; }
    var normalized;
    try { normalized = helper.normalize(model); } catch (_) { return false; }
    contentTimelineTokens.delete(token);
    var updated = false;
    mutate(function (deck, page) {
      var slide = activeSlide(deck);
      var element = slide && slide.elements.find(function (item) { return item && item.id === state.elementId; });
      if (page !== state.page || deck !== state.deck || slide !== state.slide || element !== state.element ||
          page.updatedAt !== state.updatedAt || !pageCanWrite(page)) return;
      element.contentTimeline = normalized;
      element.text = contentTimelineTitle(normalized);
      updated = true;
    });
    return updated;
  }
  function restoreHistory(from, to) {
    var page = pageFrom(workspace()); if (!page || !pageCanWrite(page) || !from.length) return false;
    var entry = from.pop(); if (!entry || entry.pageId !== page.id) return false;
    to.push(historySnapshot(page)); page.slides = cloneDeck(entry.deck); page.updatedAt = new Date().toISOString(); scheduleSave();
    var deck = ensureDeck(page); if (!deck.slides.some(function (slide) { return slide.id === activeSlideId; })) activeSlideId = deck.slides[0].id;
    selectedElementId = ''; render(); return true;
  }
  function slidesUndo() { if (!restoreHistory(undoStack, redoStack)) showToast('Nothing to undo in this deck.'); else root.querySelector('.slides-stage').focus({ preventScroll: true }); }
  function slidesRedo() { if (!restoreHistory(redoStack, undoStack)) showToast('Nothing to redo in this deck.'); else root.querySelector('.slides-stage').focus({ preventScroll: true }); }
  function selectedElement(deck) { var slide = activeSlide(deck); return slide && (slide.elements || []).find(function (element) { return element.id === selectedElementId; }) || null; }
  function updateSelectedElement(patch, options) { mutate(function (deck) { var element = selectedElement(deck); if (element) Object.assign(element, patch || {}); }, true, options); }
  function duplicateElement() { mutate(function (deck) { var slide = activeSlide(deck); var element = selectedElement(deck); if (!slide || !element) { showToast('Select a slide object first.'); return; } var copy = JSON.parse(JSON.stringify(element)); copy.id = id(); copy.x = Math.min(94 - Number(copy.width || 0), Number(copy.x || 0) + 3); copy.y = Math.min(94 - Number(copy.height || 0), Number(copy.y || 0) + 3); copy.zIndex = Math.max.apply(Math, slide.elements.map(function (item) { return Number(item.zIndex || 0); }).concat([0])) + 1; slide.elements.push(copy); selectedElementId = copy.id; }); }
  function deleteElement() { mutate(function (deck) { var slide = activeSlide(deck); if (!slide || !selectedElementId) { showToast('Select a slide object first.'); return; } slide.elements = slide.elements.filter(function (element) { return element.id !== selectedElementId; }); selectedElementId = ''; }); }
  function copyElement() { var page = pageFrom(workspace()); var deck = page && deckFor(page); var element = deck && selectedElement(deck); if (!element) { showToast('Select a slide object first.'); return false; } elementClipboard = JSON.parse(JSON.stringify(element)); showToast('Slide object copied'); return true; }
  function pasteElement() { if (!elementClipboard) { showToast('Slide clipboard is empty.'); return false; } mutate(function (deck) { var slide = activeSlide(deck); var copy = JSON.parse(JSON.stringify(elementClipboard)); copy.id = id(); copy.x = Math.min(94 - Number(copy.width || 0), Number(copy.x || 0) + 4); copy.y = Math.min(94 - Number(copy.height || 0), Number(copy.y || 0) + 4); copy.zIndex = Math.max.apply(Math, slide.elements.map(function (item) { return Number(item.zIndex || 0); }).concat([0])) + 1; slide.elements.push(copy); selectedElementId = copy.id; }); return true; }
  function shiftElementLayer(direction) { mutate(function (deck) { var slide = activeSlide(deck); var element = selectedElement(deck); if (!slide || !element) return; var ordered = slide.elements.slice().sort(function (a, b) { return Number(a.zIndex || 0) - Number(b.zIndex || 0); }); var index = ordered.indexOf(element); var target = Math.max(0, Math.min(ordered.length - 1, index + direction)); if (target === index) return; var moved = ordered.splice(index, 1)[0]; ordered.splice(target, 0, moved); ordered.forEach(function (item, i) { item.zIndex = i + 1; }); }); }
  function moveSlide(direction) { mutate(function (deck) { var current = activeSlide(deck); var index = deck.slides.indexOf(current); var target = Math.max(0, Math.min(deck.slides.length - 1, index + direction)); if (target === index) return; deck.slides.splice(index, 1); deck.slides.splice(target, 0, current); }); }
  function closeSlideAction(returnFocus) {
    var panel = root && root.querySelector('.slides-action-panel'); if (!panel) return;
    var trigger = panel._trigger; panel.remove();
    if (returnFocus && trigger && trigger.isConnected) trigger.focus();
  }
  function slideActionPanel(label, withInput, initialValue, confirmLabel, onApply) {
    closeSlideAction(false);
    var trigger = document.activeElement; var panel = document.createElement('form'); panel.className = 'slides-action-panel'; panel._trigger = trigger; panel.setAttribute('aria-label', label);
    var heading = document.createElement('label'); heading.textContent = label; panel.appendChild(heading);
    var input = null; if (withInput) { input = document.createElement('input'); input.value = initialValue; input.setAttribute('aria-label', label); heading.appendChild(input); }
    var apply = document.createElement('button'); apply.type = 'submit'; apply.textContent = confirmLabel; panel.appendChild(apply);
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.onclick = function () { closeSlideAction(true); render(); }; panel.appendChild(cancel);
    var status = document.createElement('span'); status.className = 'slides-action-status'; status.setAttribute('role', 'status'); panel.appendChild(status);
    panel.addEventListener('submit', function (event) { event.preventDefault(); var error = onApply(input ? input.value : ''); if (error) { status.textContent = error; if (input) input.focus(); } else closeSlideAction(true); });
    panel.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSlideAction(true); render(); } });
    root.insertBefore(panel, root.querySelector('.slides-toolbar')); (input || apply).focus(); if (input) input.select();
  }
  function renameSlide() {
    var owner = pageFrom(workspace()); var current = activeSlide(deckFor(owner)); if (!owner || !current) return;
    slideActionPanel('Slide title', true, current.title || 'Untitled slide', 'Save title', function (value) {
      if (pageFrom(workspace()) !== owner || activeSlide(deckFor(owner)) !== current) return 'The selected slide changed. Cancel and try again.';
      var title = value.trim(); if (!title || title.length > 500) return 'Use a title between 1 and 500 characters.';
      if (title !== current.title) mutate(function () { var previousTitle = current.title; current.title = title; var titleElement = current.elements.find(function (element) { return element.type === 'text' && String(element.text || '').trim() === previousTitle; }); if (titleElement) titleElement.text = title; });
      return '';
    });
  }
  function changeSlideLayout(layout) {
    var owner = pageFrom(workspace()); var current = activeSlide(deckFor(owner)); if (!owner || !current) return;
    function apply() {
      if (pageFrom(workspace()) !== owner || activeSlide(deckFor(owner)) !== current) return 'The selected slide changed. Cancel and try again.';
      mutate(function (deck) { var replacement = Object.assign({}, current, makeSlide(layout, current.title || 'Slide')); replacement.id = current.id; replacement.speakerNotes = current.speakerNotes; replacement.background = current.background; deck.slides[deck.slides.indexOf(current)] = replacement; selectedElementId = ''; });
      return '';
    }
    if (!current.elements.length) { apply(); return; }
    root.querySelector('[data-layout]').value = current.layout || 'blank';
    slideActionPanel('Replace this slide’s objects with the selected layout? You can undo this change.', false, '', 'Replace objects', apply);
  }
  function nudgeElement(dx, dy) { var page = pageFrom(workspace()); var deck = page && deckFor(page); var element = deck && selectedElement(deck); if (!element || !pageCanWrite(page)) return; updateSelectedElement({ x: Math.max(0, Math.min(100 - element.width, Number(element.x || 0) + dx)), y: Math.max(0, Math.min(100 - element.height, Number(element.y || 0) + dy)) }); focusSelectedObject(); }
  function focusSelectedObject() {
    var stage = root && root.querySelector('.slides-stage');
    var node = stage && Array.from(stage.querySelectorAll('[data-slide-element-id]')).find(function (item) { return item.dataset.slideElementId === selectedElementId; });
    if (node) node.focus({ preventScroll: true });
  }
  function selectSlideObject(node, element, deck) {
    selectedElementId = element.id;
    root.querySelectorAll('.slides-stage > .slides-element.selected').forEach(function (item) { item.classList.remove('selected'); });
    node.classList.add('selected');
    root.querySelector('[data-object-disclosure]').open = true;
    syncElementInspector(deck);
    syncObjectTools(element);
    root.querySelector('[data-selection-context]').textContent = 'Drag to move · handles resize · double-click or Enter to edit';
  }
  function startObjectTextEdit(node, target) {
    var page = pageFrom(workspace());
    if (!page || !pageCanWrite(page)) return;
    var field = target && target.closest('.slides-element-text, td, th');
    if (!field || field === node || !node.contains(field)) field = node.querySelector('.slides-element-text, td, th');
    if (!field) return;
    field.contentEditable = 'true'; node.classList.add('is-editing'); field.focus();
    root.querySelector('[data-selection-context]').textContent = 'Editing text · Escape returns to object selection';
  }
  function wireObjectText(field, node, element, update) {
    field.contentEditable = 'false';
    field.setAttribute('aria-label', 'Edit ' + element.type + ' text');
    var owner = pageFrom(workspace()); var slide = owner && activeSlide(deckFor(owner)); var history = false;
    function current() { return node.isConnected && owner === pageFrom(workspace()) && pageCanWrite(owner) && activeSlide(deckFor(owner)) === slide && slide.elements.indexOf(element) >= 0; }
    field.addEventListener('input', function () {
      if (!current()) return;
      if (!history) { pushHistory(owner); history = true; }
      // Native Enter/Shift+Enter use block nodes or BRs, which textContent
      // concatenates. Read rendered plain text without storing editable HTML.
      var value = typeof field.innerText === 'string' ? field.innerText : field.textContent;
      mutate(function () { update(String(value || '').replace(/\r\n?/g, '\n')); }, false, { history: false });
      node.setAttribute('aria-label', element.type + ' object: ' + String(element.text || element.alt || '').slice(0, 120));
    });
    field.addEventListener('blur', function () { field.contentEditable = 'false'; node.classList.remove('is-editing'); history = false; });
    field.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); field.blur(); node.focus({ preventScroll: true });
    });
  }
  function beginElementDrag(event, element, mode) {
    var page = pageFrom(workspace()); var deck = page && deckFor(page); var slide = deck && activeSlide(deck);
    var stage = root && root.querySelector('.slides-stage'); if (!stage || !pageCanWrite(page) || !slide || slide.elements.indexOf(element) < 0) return;
    var rect = stage.getBoundingClientRect(); selectedElementId = element.id;
    var geometry = { x: Number(element.x || 0), y: Number(element.y || 0), width: Number(element.width || 1), height: Number(element.height || 1) };
    dragState = { id: element.id, page: page, updatedAt: page.updatedAt, deck: deck, slide: slide, element: element, pointerId: event.pointerId, mode: mode, startX: event.clientX, startY: event.clientY, original: geometry, pending: Object.assign({}, geometry), rect: rect, changed: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (error) { /* no-op */ }
  }
  function snapSlidePosition(value, size) { var bounded = Math.max(0, Math.min(100 - size, value)); var targets = [0, (100 - size) / 2, 100 - size]; var nearest = targets.reduce(function (best, target) { return Math.abs(target - bounded) < Math.abs(best - bounded) ? target : best; }, targets[0]); return Math.abs(nearest - bounded) <= 1.25 ? nearest : Math.round(bounded * 4) / 4; }
  function moveElementDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    var page = pageFrom(workspace()); var deck = page && deckFor(page); var element = dragState.element;
    if (page !== dragState.page || deck !== dragState.deck || activeSlide(deck) !== dragState.slide || page.updatedAt !== dragState.updatedAt || !pageCanWrite(page) || dragState.slide.elements.indexOf(element) < 0) { dragState = null; var staleStage = root && root.querySelector('.slides-stage'); if (staleStage) staleStage.classList.remove('guide-x', 'guide-y'); render(); return; }
    var dx = (event.clientX - dragState.startX) / Math.max(1, dragState.rect.width) * 100; var dy = (event.clientY - dragState.startY) / Math.max(1, dragState.rect.height) * 100;
    if (!dragState.changed && Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 3) return;
    dragState.changed = true;
    element = dragState.pending;
    var original = dragState.original; var mode = dragState.mode;
    if (mode !== 'move') {
      var left = original.x; var right = left + original.width; var top = original.y; var bottom = top + original.height;
      if (mode.indexOf('w') >= 0) left = Math.max(0, Math.min(right - 4, left + dx));
      if (mode.indexOf('e') >= 0) right = Math.min(100, Math.max(left + 4, right + dx));
      if (mode.indexOf('n') >= 0) top = Math.max(0, Math.min(bottom - 4, top + dy));
      if (mode.indexOf('s') >= 0) bottom = Math.min(100, Math.max(top + 4, bottom + dy));
      element.x = left; element.y = top; element.width = right - left; element.height = bottom - top;
    } else {
      if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      element.x = snapSlidePosition(original.x + dx, original.width); element.y = snapSlidePosition(original.y + dy, original.height);
    }
    var stage = root.querySelector('.slides-stage');
    stage.classList.toggle('guide-x', mode === 'move' && Math.abs(element.x + element.width / 2 - 50) < .01);
    stage.classList.toggle('guide-y', mode === 'move' && Math.abs(element.y + element.height / 2 - 50) < .01);
    var node = root.querySelector('[data-slide-element-id="' + dragState.id + '"]'); if (node) { node.style.left = element.x + '%'; node.style.top = element.y + '%'; node.style.width = element.width + '%'; node.style.height = element.height + '%'; }
  }
  function endElementDrag(event) {
    if (!dragState || event && event.pointerId !== dragState.pointerId) return;
    var state = dragState; dragState = null;
    var stage = root && root.querySelector('.slides-stage'); if (stage) stage.classList.remove('guide-x', 'guide-y');
    if (event && event.type !== 'pointerup') { if (state.changed) render(); return; }
    if (state.page !== pageFrom(workspace()) || state.deck !== deckFor(state.page) || activeSlide(state.deck) !== state.slide || state.page.updatedAt !== state.updatedAt || !pageCanWrite(state.page) || state.slide.elements.indexOf(state.element) < 0) { if (state.changed) render(); return; }
    if (state.changed) { pushHistory(state.page); Object.assign(state.element, state.pending); state.page.updatedAt = new Date().toISOString(); scheduleSave(); render(); focusSelectedObject(); }
  }
  function fitSlideTextFontSize(element, deck, ratioOverride) {
    var requested = Number(element && element.fontSize); if (!isFinite(requested) || requested <= 0) requested = 3;
    if (!element || (element.type !== 'text' && element.type !== 'shape')) return requested;
    var sourceText = element.text == null ? (element.type === 'shape' ? 'Shape' : 'Add text') : String(element.text);
    if (!sourceText) return requested;
    var width = Math.max(1, Number(element.width) || 1); var height = Math.max(1, Number(element.height) || 1);
    var ratio = ratioOverride || (deck && deck.size === 'standard' ? 4 / 3 : 16 / 9); var averageCharacterWidth = element.fontWeight === 'bold' || element.fontWeight === '700' ? 0.59 : 0.55;
    function lineCountAt(size) {
      var charactersPerLine = Math.max(1, width / (size * averageCharacterWidth));
      return sourceText.split(/\r?\n/).reduce(function (count, line) { return count + Math.max(1, Math.ceil(line.length / charactersPerLine)); }, 0);
    }
    function fits(size) { return size * lineCountAt(size) * 1.15 * ratio <= height; }
    if (fits(requested)) return requested;
    var low = 0; var explicitLines = sourceText.split(/\r?\n/).length; var high = Math.min(requested, height / (ratio * explicitLines * 1.15));
    for (var pass = 0; pass < 24; pass += 1) {
      var middle = (low + high) / 2;
      if (fits(middle)) low = middle; else high = middle;
    }
    return low;
  }
  function renderElement(element, deck, options) {
    var readonly = options && options.readonly; var node = document.createElement('div'); node.className = 'slides-element slides-element-' + element.type + (element.id === selectedElementId && !readonly ? ' selected' : ''); node.dataset.slideElementId = element.id;
    var objectFontSize = fitSlideTextFontSize(element, deck);
    node.style.cssText = 'left:' + element.x + '%;top:' + element.y + '%;width:' + element.width + '%;height:' + element.height + '%;font-size:' + objectFontSize + 'cqw;font-weight:' + (element.fontWeight === 'bold' || element.fontWeight === '700' ? '700' : '400') + ';color:' + (element.color || themes[deck.theme].ink) + ';background:' + (element.fill || 'transparent') + ';border:' + (element.borderWidth || 0) + 'px solid ' + (element.borderColor || '#d7d3c7') + ';z-index:' + (element.zIndex || 0) + ';';
    if (element.type === 'image') { var image = document.createElement('img'); image.src = element.dataUrl || ''; image.alt = element.alt || 'Slide image'; image.style.objectFit = element.imageFit || 'contain'; node.appendChild(image); }
    else if (element.type === 'chart') { var chart = document.createElement('div'); chart.className = 'slides-chart'; var values = element.chart && element.chart.values || [5, 8, 4]; var max = Math.max.apply(Math, values.concat([1])); values.forEach(function (value) { var bar = document.createElement('span'); bar.style.height = Math.max(6, value / max * 100) + '%'; chart.appendChild(bar); }); node.appendChild(chart); }
    else if (element.type === 'table') { var table = document.createElement('table'); var tableRows = Array.isArray(element.rows) && element.rows.length ? element.rows : String(element.text || '').split(/\r?\n/).map(function (line) { return line.split('\t'); }); tableRows.forEach(function (values, rowIndex) { var tr = document.createElement('tr'); values.forEach(function (value, colIndex) { var cell = document.createElement(rowIndex === 0 ? 'th' : 'td'); cell.textContent = value; if (!readonly) wireObjectText(cell, node, element, function (value) { if (!Array.isArray(element.rows)) element.rows = tableRows.map(function (row) { return row.slice(); }); if (!Array.isArray(element.rows[rowIndex])) element.rows[rowIndex] = []; element.rows[rowIndex][colIndex] = value.slice(0, 2000); element.text = element.rows.map(function (row) { return row.join('\t'); }).join('\n'); }); tr.appendChild(cell); }); table.appendChild(tr); }); node.appendChild(table); }
    else if (element.type === 'content-timeline') {
      var timelineHost = global.SutraContentTimelineHosts;
      var renderedTimeline = timelineHost && typeof timelineHost.renderDOM === 'function' ? timelineHost.renderDOM(element.contentTimeline) : null;
      if (renderedTimeline) node.appendChild(renderedTimeline);
      else { var timelineFallback = document.createElement('div'); timelineFallback.className = 'slides-element-text'; timelineFallback.textContent = contentTimelineText(element.contentTimeline) || String(element.text || 'Timeline content is unavailable.'); node.appendChild(timelineFallback); }
      var helper = contentTimelineHelper(); var title = '';
      try { title = helper && helper.inspect(element.contentTimeline).supported ? helper.normalize(element.contentTimeline).title : ''; } catch (_) { title = ''; }
      node.setAttribute('role', 'group'); node.setAttribute('aria-label', 'Timeline' + (title ? ': ' + title : ''));
      if (!readonly) {
        node.tabIndex = 0;
        node.addEventListener('focus', function () {
          selectedElementId = element.id;
          if (root) root.querySelectorAll('.slides-element.selected').forEach(function (selectedNode) { selectedNode.classList.remove('selected'); });
          node.classList.add('selected');
          var objectDisclosure = root && root.querySelector('[data-object-disclosure]'); if (objectDisclosure) objectDisclosure.open = true;
          syncElementInspector(deck);
          var context = root && root.querySelector('[data-selection-context]');
          if (context) context.textContent = 'Selected timeline object · use Edit selected timeline to change its events.';
        });
      }
    }
    else { var text = document.createElement('div'); text.className = 'slides-element-text'; text.style.textAlign = element.textAlign || 'left'; text.textContent = element.text == null ? (element.type === 'shape' ? 'Shape' : 'Add text') : String(element.text); if (!readonly) wireObjectText(text, node, element, function (value) { element.text = value.slice(0, 8000); }); node.appendChild(text); }
    if (!readonly) {
      node.tabIndex = 0; node.setAttribute('role', 'group');
      node.setAttribute('aria-label', element.type + ' object: ' + String(element.text || element.alt || '').slice(0, 120));
      node.addEventListener('focus', function () { selectSlideObject(node, element, deck); });
      [['nw', 'top left'], ['n', 'top'], ['ne', 'top right'], ['e', 'right'], ['se', 'bottom right'], ['s', 'bottom'], ['sw', 'bottom left'], ['w', 'left']].forEach(function (item) {
        var handle = document.createElement('button'); handle.type = 'button'; handle.className = 'slides-element-resize'; handle.dataset.resize = item[0];
        handle.setAttribute('aria-label', 'Resize object from ' + item[1]);
        node.appendChild(handle);
      });
      node.addEventListener('dblclick', function (event) { if (event.target.closest('.slides-element-resize')) return; event.preventDefault(); startObjectTextEdit(node, event.target); });
      node.addEventListener('keydown', function (event) {
        if (event.target.isContentEditable || event.target.closest('button')) return;
        if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); startObjectTextEdit(node); }
      });
      node.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || event.target.isContentEditable) return;
        event.preventDefault(); selectSlideObject(node, element, deck); node.focus({ preventScroll: true });
        var handle = event.target.closest('.slides-element-resize'); beginElementDrag(event, element, handle ? handle.dataset.resize : 'move');
      });
      node.addEventListener('pointermove', moveElementDrag); node.addEventListener('pointerup', endElementDrag); node.addEventListener('pointercancel', endElementDrag);
      node.addEventListener('lostpointercapture', endElementDrag);
    }
    return node;
  }
  function syncElementInspector(deck) {
    var panel = root.querySelector('[data-element-inspector]'); var element = selectedElement(deck); if (!panel) return; panel.hidden = !element; var summary = root.querySelector('[data-object-summary]'); if (summary) summary.textContent = element ? '· ' + String(element.type || 'object') : 'No selection'; if (!element) return;
    var isTimeline = element.type === 'content-timeline';
    var helper = contentTimelineHelper(); var timelineTitle = '';
    try { timelineTitle = isTimeline && helper && helper.inspect(element.contentTimeline).supported ? helper.normalize(element.contentTimeline).title : ''; } catch (_) { timelineTitle = ''; }
    var inspectorHint = panel.querySelector('.slides-inspector-hint');
    if (inspectorHint) inspectorHint.textContent = isTimeline
      ? 'Drag to move or resize. Use Edit selected timeline to change its events.'
      : 'Drag on the slide to move; use the controls below to adjust its appearance.';
    panel.querySelector('[data-element-name]').textContent = isTimeline ? 'Timeline' + (timelineTitle ? ': ' + timelineTitle : '') : (element.type === 'image' ? (element.alt || 'Image') : (element.text || element.type));
    panel.querySelector('[data-element-font]').closest('label').hidden = isTimeline;
    panel.querySelector('[data-element-bold]').closest('label').hidden = isTimeline;
    panel.querySelector('[data-element-align]').closest('label').hidden = isTimeline;
    panel.querySelector('[data-element-fit]').closest('label').hidden = isTimeline || element.type !== 'image';
    panel.querySelector('[data-element-font]').value = Math.max(1, Math.min(10, Number(element.fontSize || 3)));
    panel.querySelector('[data-element-bold]').checked = element.fontWeight === 'bold';
    panel.querySelector('[data-element-align]').value = element.textAlign || 'left';
    ['x', 'y', 'width', 'height'].forEach(function (field) { var control = panel.querySelector('[data-geometry="' + field + '"]'); if (control) control.value = Math.round(Number(element[field]) * 100) / 100; });
    panel.querySelector('[data-element-fit]').value = element.imageFit || 'contain';
    panel.querySelector('[data-element-color]').closest('label').hidden = isTimeline;
    panel.querySelector('[data-element-fill]').closest('label').hidden = isTimeline;
    panel.querySelector('[data-element-fill]').value = /^#[0-9a-f]{6}$/i.test(element.fill || '') ? element.fill : '#ffffff';
    panel.querySelector('[data-element-color]').value = /^#[0-9a-f]{6}$/i.test(element.color || '') ? element.color : '#173d2b';
  }
  function alignElement(position) { mutate(function (deck) { var element = selectedElement(deck); if (!element) { showToast('Select a slide object first.'); return; } if (position === 'left') element.x = 0; if (position === 'center') element.x = Math.max(0, (100 - element.width) / 2); if (position === 'right') element.x = Math.max(0, 100 - element.width); if (position === 'top') element.y = 0; if (position === 'middle') element.y = Math.max(0, (100 - element.height) / 2); if (position === 'bottom') element.y = Math.max(0, 100 - element.height); }); }
  function syncObjectTools(element) {
    var tools = root && root.querySelector('[data-object-tools]'); if (!tools) return;
    tools.hidden = !element;
    tools.querySelector('[data-edit-object-text]').disabled = !element || ['text', 'shape', 'table'].indexOf(element.type) < 0;
  }
  function render() {
    if (!root || !activePageId) return; var data = workspace(); var page = pageFrom(data); var deck = page && deckFor(page); if (!deck) { setEditorVisible(false); return; }
    var restoreThumbnailFocus = document.activeElement && document.activeElement.classList.contains('slides-thumbnail');
    if (!activeSlideId || !deck.slides.some(function (slide) { return slide.id === activeSlideId; })) activeSlideId = deck.slides[0].id;
    var slide = activeSlide(deck); var theme = themes[deck.theme] || themes.sutra; var slideIndex = deck.slides.indexOf(slide); var selected = selectedElement(deck); setEditorVisible(true); root.dataset.size = deck.size; root.querySelector('[data-deck-title]').textContent = String(page.title || 'Untitled presentation'); root.querySelector('[data-slide-heading]').textContent = 'Slide ' + (slideIndex + 1) + ' of ' + deck.slides.length + ' · ' + (slide.title || 'Untitled slide'); root.querySelector('[data-count]').textContent = (slideIndex + 1) + ' of ' + deck.slides.length; root.querySelector('[data-status-count]').textContent = deck.slides.length + ' ' + (deck.slides.length === 1 ? 'slide' : 'slides');
    var context = selected
      ? (selected.type === 'content-timeline' ? 'Drag to move · handles resize · Edit selected timeline changes events' : 'Drag to move · handles resize · double-click or Enter to edit')
      : (slide.elements.length ? 'Click to select · drag to move · double-click to edit text' : 'No objects yet. Add content or choose a layout.'); root.querySelector('[data-selection-context]').textContent = context;
    syncObjectTools(selected);
    root.querySelector('[data-slide-context]').textContent = slide.title || 'Untitled slide';
    root.querySelector('[data-theme]').value = deck.theme; root.querySelector('[data-layout]').value = slide.layout || 'blank'; root.querySelector('[data-size]').value = deck.size || 'widescreen'; root.querySelector('[data-slide-background]').value = /^#[0-9a-f]{6}$/i.test(slide.background || '') ? slide.background : theme.bg;
    var list = root.querySelector('.slides-thumbnail-list'); list.replaceChildren(); deck.slides.forEach(function (item, index) {
      var thumb = document.createElement('button');
      var title = item.title || item.elements[0] && item.elements[0].text || 'Untitled slide';
      thumb.type = 'button'; thumb.className = 'slides-thumbnail' + (item.id === slide.id ? ' active' : '');
      thumb.title = 'Slide ' + (index + 1) + ': ' + title;
      thumb.setAttribute('aria-label', 'Open slide ' + (index + 1) + ': ' + title);
      thumb.setAttribute('aria-pressed', item.id === slide.id ? 'true' : 'false');
      if (item.id === slide.id) thumb.setAttribute('aria-current', 'true');
      thumb.appendChild(renderThumbnail(item, theme, deck.size));
      var caption = document.createElement('span'); caption.className = 'slides-thumbnail-caption';
      var number = document.createElement('span'); number.className = 'slides-thumbnail-number'; number.textContent = String(index + 1); caption.appendChild(number);
      var captionTitle = document.createElement('span'); captionTitle.className = 'slides-thumbnail-title'; captionTitle.textContent = String(title).replace(/\s+/g, ' ').trim(); caption.appendChild(captionTitle);
      thumb.appendChild(caption);
      thumb.addEventListener('click', function () { activeSlideId = item.id; selectedElementId = ''; render(); });
      list.appendChild(thumb);
    });
    root.querySelector('[data-move-slide-up]').disabled = slideIndex === 0; root.querySelector('[data-move-slide-down]').disabled = slideIndex === deck.slides.length - 1;
    var stage = root.querySelector('.slides-stage'); stage.replaceChildren(); stage.classList.remove('guide-x', 'guide-y'); stage.style.background = slide.background || theme.bg; stage.style.color = theme.ink; stage.setAttribute('aria-label', 'Editable slide ' + (slideIndex + 1) + ' of ' + deck.slides.length); slide.elements.slice().sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); }).forEach(function (element) { stage.appendChild(renderElement(element, deck)); });
    if (!slide.elements.length) {
      var empty = document.createElement('div'); empty.className = 'slides-empty-state';
      var emptyTitle = document.createElement('strong'); emptyTitle.textContent = 'This slide is blank'; empty.appendChild(emptyTitle);
      var emptyHelp = document.createElement('span'); emptyHelp.textContent = 'Add an object or choose a layout to get started.'; empty.appendChild(emptyHelp);
      var emptyActions = document.createElement('div'); emptyActions.className = 'slides-empty-actions';
      var addText = document.createElement('button'); addText.type = 'button'; addText.className = 'slides-empty-action is-primary'; addText.textContent = 'Add text'; addText.addEventListener('click', function () { addElement('text'); }); emptyActions.appendChild(addText);
      var chooseLayout = document.createElement('button'); chooseLayout.type = 'button'; chooseLayout.className = 'slides-empty-action'; chooseLayout.textContent = 'Choose a layout'; chooseLayout.addEventListener('click', function () { var inspector = root.querySelector('[data-inspector-disclosure]'); inspector.open = true; root.querySelector('[data-layout]').focus(); }); emptyActions.appendChild(chooseLayout);
      empty.appendChild(emptyActions); stage.appendChild(empty);
    }
    stage.onclick = function (event) { if (event.target === stage) { selectedElementId = ''; render(); } };
    root.querySelector('.slides-notes-panel textarea').value = slide.speakerNotes || ''; syncElementInspector(deck);
    if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(updateStageSize); else global.setTimeout(updateStageSize, 0);
    if (restoreThumbnailFocus) { var activeThumbnail = root.querySelector('.slides-thumbnail.active'); if (activeThumbnail) activeThumbnail.focus(); }
  }
  function present() {
    if (closePresentation) closePresentation(false);
    var opener = document.activeElement;
    var data = workspace(); var page = pageFrom(data); var deck = page && deckFor(page); if (!deck) return; var overlay = document.createElement('div'); overlay.className = 'slides-present-overlay'; var stage = document.createElement('div'); stage.className = 'slides-present-stage'; stage.setAttribute('role', 'region'); stage.setAttribute('aria-label', 'Presentation slide'); var notes = document.createElement('aside'); notes.className = 'slides-present-notes'; var close = document.createElement('button'); close.type = 'button'; close.textContent = 'Exit presentation'; overlay.append(stage, notes, close); document.body.appendChild(overlay); var index = deck.slides.indexOf(activeSlide(deck)); var showNotes = true;
    function draw() { var slide = deck.slides[index]; stage.dataset.size = deck.size || 'widescreen'; stage.replaceChildren(); stage.style.background = slide.background || (themes[deck.theme] || themes.sutra).bg; stage.style.color = (themes[deck.theme] || themes.sutra).ink; slide.elements.forEach(function (element) { stage.appendChild(renderElement(Object.assign({}, element), deck, { readonly: true })); }); notes.hidden = !showNotes; notes.textContent = slide.speakerNotes || 'No speaker notes for this slide.'; }
    function key(event) { if (event.key === 'Escape') close.click(); if ((event.key === 'ArrowRight' || event.key === ' ') && index < deck.slides.length - 1) { index++; draw(); event.preventDefault(); } if (event.key === 'ArrowLeft' && index > 0) { index--; draw(); event.preventDefault(); } if (String(event.key || '').toLowerCase() === 'n') { showNotes = !showNotes; draw(); } }
    var closed = false;
    function finish(restoreFocus) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', key, true);
      global.removeEventListener('noteflow:view-changed', onViewChanged);
      overlay.remove();
      if (closePresentation === finish) closePresentation = null;
      if (restoreFocus !== false && pageContentAuthorized(page) && opener && opener.isConnected) opener.focus();
    }
    function onViewChanged(event) { if (!event.detail || event.detail.view !== 'notes') finish(false); }
    closePresentation = finish;
    close.onclick = function () { finish(true); };
    global.addEventListener('noteflow:view-changed', onViewChanged);
    document.addEventListener('keydown', key, true); draw(); close.focus();
  }
  function closeToolbarMenus(restoreFocus, preferredMenu) {
    if (!root) return;
    var groups = root.querySelectorAll('.slides-toolbar-main .slides-toolbar-group'); var active = document.activeElement; var focusTarget = null;
    groups.forEach(function (group) {
      if (!group.open) return;
      if (restoreFocus && ((preferredMenu && preferredMenu === group) || (!preferredMenu && group.contains(active)))) focusTarget = group.querySelector('summary');
      group.open = false;
    });
    if (focusTarget) focusTarget.focus();
  }
  function wireToolbarMenuLifecycle() {
    var toolbar = root.querySelector('.slides-toolbar'); var groups = Array.prototype.slice.call(toolbar.querySelectorAll('.slides-toolbar-main .slides-toolbar-group'));
    function positionMenus() {
      if (root.hidden) return;
      var bounds = root.getBoundingClientRect();
      var left = Math.max(8, bounds.left + 8);
      var right = Math.min(document.documentElement.clientWidth - 8, bounds.right - 8);
      if (right <= left) return;
      groups.forEach(function (group) {
        if (!group.open) return;
        var menu = group.querySelector('.slides-toolbar-actions');
        var anchor = group.getBoundingClientRect();
        menu.style.setProperty('--slides-menu-width', (right - left) + 'px');
        var width = menu.getBoundingClientRect().width;
        var menuLeft = Math.max(left, Math.min(anchor.left, right - width));
        menu.style.setProperty('--slides-menu-left', (menuLeft - anchor.left) + 'px');
        var bottom = Math.min(document.documentElement.clientHeight - 8, bounds.bottom - 8);
        menu.style.setProperty('--slides-menu-height', Math.max(0, bottom - anchor.bottom - 6) + 'px');
      });
    }
    groups.forEach(function (group) {
      group.addEventListener('toggle', function () {
        if (!group.open) return;
        groups.forEach(function (other) { if (other !== group && other.open) other.open = false; });
        positionMenus();
      });
    });
    global.addEventListener('resize', positionMenus);
    if (typeof global.ResizeObserver === 'function') {
      var menuObserver = new global.ResizeObserver(positionMenus);
      menuObserver.observe(root); menuObserver.observe(toolbar);
    }
    toolbar.addEventListener('click', function (event) {
      var summary = event.target && event.target.closest && event.target.closest('summary');
      if (summary) {
        var summaryMenu = summary.closest('.slides-toolbar-main .slides-toolbar-group');
        if (summaryMenu && !summaryMenu.open) groups.forEach(function (other) { if (other !== summaryMenu && other.open) other.open = false; });
        return;
      }
      var action = event.target && event.target.closest && event.target.closest('button');
      if (!action) return;
      var menu = action.closest('.slides-toolbar-group');
      closeToolbarMenus(!!(menu && menu.open), menu && menu.open ? menu : null);
    }, true);
    root.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !event.target || !event.target.closest) return;
      var group = event.target.closest('.slides-toolbar-main .slides-toolbar-group');
      if (!group || !group.open) return;
      event.preventDefault(); event.stopPropagation(); closeToolbarMenus(true, group);
    }, true);
    document.addEventListener('pointerdown', function (event) {
      if (!root || root.hidden || toolbar.contains(event.target)) return;
      closeToolbarMenus(false);
    }, true);
  }
  function mount() {
    if (root) return root;
    root = document.createElement('section'); root.id = 'slidesEditor'; root.className = 'slides-editor'; root.hidden = true; root.setAttribute('inert', ''); root.setAttribute('aria-hidden', 'true'); root.setAttribute('aria-label', 'Slides editor');
    root.innerHTML = [ // sutra-allow-html: static Slides chrome; user content uses textContent.
      '<header class="slides-context"><div class="slides-context-title"><span>CREATE / SLIDES</span><strong data-deck-title>Presentation</strong></div><span data-slide-heading aria-live="polite"></span></header>',
      '<div class="slides-toolbar" role="toolbar" aria-label="Slide creation and editing tools"><div class="slides-toolbar-main">',
      '<details class="slides-toolbar-group"><summary><i class="fas fa-plus" aria-hidden="true"></i> Insert</summary><div class="slides-toolbar-actions" data-insert-tools></div></details>',
      '<details class="slides-toolbar-group"><summary><i class="fas fa-clock-rotate-left" aria-hidden="true"></i> History</summary><div class="slides-toolbar-actions" data-history-tools></div></details>',
      '<details class="slides-toolbar-group"><summary><i class="fas fa-sliders" aria-hidden="true"></i> Slide</summary><div class="slides-toolbar-actions" data-slide-tools></div></details>',
      '<div class="slides-object-tools" data-object-tools hidden role="group" aria-label="Selected object actions"><button type="button" data-edit-object-text aria-label="Edit object text" title="Edit text (Enter)"><i class="fas fa-pen" aria-hidden="true"></i></button><button type="button" data-quick-duplicate aria-label="Duplicate selected object" title="Duplicate (Ctrl/Cmd+D)"><i class="fas fa-copy" aria-hidden="true"></i></button><button type="button" data-quick-delete aria-label="Delete selected object" title="Delete object"><i class="fas fa-trash" aria-hidden="true"></i></button><details class="slides-toolbar-group"><summary>Arrange</summary><div class="slides-toolbar-actions" data-arrange-tools></div></details></div>',
      '</div><div class="slides-toolbar-primary" data-primary-present role="group" aria-label="Deck actions"></div></div>',
      '<div class="slides-workspace"><aside class="slides-thumbnails" aria-label="Slide order"><div class="slides-filmstrip-heading"><strong>Slides</strong><span data-count></span></div><div class="slides-thumbnail-list" role="group" aria-label="Choose a slide"></div><button type="button" class="slides-add-thumbnail" aria-label="Add slide">+ Add slide</button></aside>',
      '<main class="slides-center"><div class="slides-center-head"><div class="slides-selection-context"><strong data-slide-context></strong><span data-selection-context aria-live="polite"></span></div><div class="slides-view-controls" role="group" aria-label="Slide zoom"><button type="button" data-zoom-fit aria-label="Fit slide to workspace">Fit</button><button type="button" data-zoom-out aria-label="Zoom out"><i class="fas fa-minus" aria-hidden="true"></i></button><output data-zoom-level aria-live="polite">Fit</output><button type="button" data-zoom-in aria-label="Zoom in"><i class="fas fa-plus" aria-hidden="true"></i></button></div></div><div class="slides-stage" tabindex="0" aria-label="Editable current slide"></div><details class="slides-notes-panel"><summary>Speaker notes</summary><textarea aria-label="Speaker notes"></textarea></details></main>',
      '<aside class="slides-inspector" aria-label="Slide design, selected object, and import or export"><details class="slides-inspector-disclosure" data-inspector-disclosure open><summary>Slide design</summary><div class="slides-inspector-content"><section class="slides-inspector-section">',
      '<label>Theme<select data-theme><option value="sutra">Sutra</option><option value="nature">Sutra Nature</option><option value="midnight">Midnight</option><option value="paper">Paper</option></select></label><label>Layout<select data-layout><option value="title">Title</option><option value="title-body">Title &amp; body</option><option value="two-column">Two column</option><option value="three-card">Title &amp; three cards</option><option value="image-caption">Image &amp; caption</option><option value="blank">Blank</option></select></label><label>Slide size<select data-size><option value="widescreen">16:9 (Widescreen)</option><option value="standard">4:3 (Standard)</option></select></label><label>Background<input type="color" data-slide-background></label></section>',
      '</div></details><details class="slides-inspector-disclosure" data-object-disclosure><summary>Selected object <span data-object-summary>No selection</span></summary><div class="slides-inspector-content"><section class="slides-element-inspector" data-element-inspector hidden><p data-element-name></p><p class="slides-inspector-hint">Drag on the slide to move; use the controls below to adjust its appearance.</p><label>Text size<input type="range" min="1" max="10" step=".5" data-element-font></label><label class="slides-toggle"><input type="checkbox" data-element-bold> Bold text</label><label>Text alignment<select data-element-align><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Image fit<select data-element-fit><option value="contain">Fit</option><option value="cover">Crop to fill</option></select></label><label>Text color<input type="color" data-element-color></label><label>Fill color<input type="color" data-element-fill></label><div class="slides-inspector-grid"><button type="button" data-element-back>Send back</button><button type="button" data-element-forward>Bring forward</button><button type="button" data-element-copy>Copy object</button><button type="button" data-element-duplicate>Duplicate object</button><button type="button" data-element-delete>Delete object</button></div></section></div></details>',
      '<details class="slides-inspector-disclosure"><summary>Import and export</summary><div class="slides-inspector-content"><section class="slides-export-actions"><button type="button" data-export-pdf>Print / PDF</button><button type="button" data-import-pptx>Import PPTX</button><button type="button" data-export-pptx>Export PPTX</button><input type="file" data-import-pptx-file accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden></section></div></details></aside></div>',
      '<div class="slides-status"><span data-status-count></span><span>Changes use workspace autosave</span></div>'
    ].join(''); // sutra-allow-html: reviewed static Slides workbench chrome; deck content is assigned with textContent.
    var container = document.getElementById('notesPrimaryPane'); if (container) container.appendChild(root);
    wireToolbarMenuLifecycle();
    var wideLayout = !global.matchMedia || global.matchMedia('(min-width: 701px)').matches; root.querySelector('[data-inspector-disclosure]').open = wideLayout; root.querySelector('[data-object-disclosure]').open = false; root.querySelector('.slides-notes-panel').open = false;
    root.querySelector('[data-zoom-fit]').addEventListener('click', function () { setStageZoom(1); });
    root.querySelector('[data-zoom-out]').addEventListener('click', function () { setStageZoom(stageZoom - 0.1); });
    root.querySelector('[data-zoom-in]').addEventListener('click', function () { setStageZoom(stageZoom + 0.1); });
    root.querySelector('[data-edit-object-text]').addEventListener('click', function () { focusSelectedObject(); var node = document.activeElement; if (node && node.classList.contains('slides-element')) startObjectTextEdit(node); });
    root.querySelector('[data-quick-duplicate]').addEventListener('click', function () { duplicateElement(); focusSelectedObject(); });
    root.querySelector('[data-quick-delete]').addEventListener('click', deleteElement);
    var geometry = document.createElement('div'); geometry.className = 'slides-geometry-grid';
    [['x', 'Left (%)'], ['y', 'Top (%)'], ['width', 'Width (%)'], ['height', 'Height (%)']].forEach(function (item) {
      var label = document.createElement('label'); label.textContent = item[1];
      var control = document.createElement('input'); control.type = 'number'; control.min = item[0] === 'x' || item[0] === 'y' ? '0' : '4'; control.max = '100'; control.step = '.25'; control.dataset.geometry = item[0]; label.appendChild(control); geometry.appendChild(label);
      function applyGeometry() {
        var page = pageFrom(workspace()); var element = page && selectedElement(deckFor(page)); var value = Number(control.value);
        if (!element || !pageCanWrite(page) || !control.value.trim() || !isFinite(value)) { if (page) syncElementInspector(deckFor(page)); return; }
        var field = item[0]; var maximum = field === 'x' ? 100 - element.width : field === 'y' ? 100 - element.height : field === 'width' ? 100 - element.x : 100 - element.y;
        var patch = {}; patch[field] = Math.max(field === 'x' || field === 'y' ? 0 : 4, Math.min(maximum, value));
        if (Math.abs(Number(element[field]) - patch[field]) < .005) return;
        updateSelectedElement(patch);
      }
      control.addEventListener('change', applyGeometry);
      control.addEventListener('blur', applyGeometry);
      control.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); applyGeometry(); control.blur(); } });
    });
    var inspector = root.querySelector('[data-element-inspector]'); inspector.insertBefore(geometry, inspector.querySelector('[data-element-font]').closest('label'));
    var arrangeTools = root.querySelector('[data-arrange-tools]');
    [['Align left', 'left'], ['Center horizontally', 'center'], ['Align right', 'right'], ['Align top', 'top'], ['Center vertically', 'middle'], ['Align bottom', 'bottom']].forEach(function (item) { arrangeTools.appendChild(button(item[0], '', function () { alignElement(item[1]); focusSelectedObject(); })); });
    arrangeTools.appendChild(button('Bring forward', 'fa-arrow-up', function () { shiftElementLayer(1); focusSelectedObject(); }));
    arrangeTools.appendChild(button('Send backward', 'fa-arrow-down', function () { shiftElementLayer(-1); focusSelectedObject(); }));
    root.querySelector('.slides-notes-panel').addEventListener('toggle', updateStageSize);
    global.addEventListener('resize', updateStageSize);
    var insertTools = root.querySelector('[data-insert-tools]'); var historyTools = root.querySelector('[data-history-tools]'); var slideTools = root.querySelector('[data-slide-tools]');
    var addSlideButton = button('New slide', 'fa-plus', function () { mutate(function (deck) { var next = makeSlide('title-body', 'New slide'); deck.slides.push(next); activeSlideId = next.id; selectedElementId = ''; }); }); addSlideButton.classList.add('is-primary'); root.querySelector('[data-primary-present]').append(addSlideButton); insertTools.append(button('Text', 'fa-font', function () { addElement('text'); })); insertTools.append(button('Shape', 'fa-shapes', function () { addElement('shape'); })); insertTools.append(button('Image', 'fa-image', chooseImage)); insertTools.append(button('Table', 'fa-table', function () { addElement('table'); })); insertTools.append(button('Chart', 'fa-chart-bar', function () { addElement('chart'); }));
    historyTools.append(button('Undo', 'fa-undo', slidesUndo)); historyTools.append(button('Redo', 'fa-redo', slidesRedo));
    var moveUp = button('Slide up', 'fa-arrow-up', function () { moveSlide(-1); }); moveUp.setAttribute('data-move-slide-up', ''); slideTools.append(moveUp); var moveDown = button('Slide down', 'fa-arrow-down', function () { moveSlide(1); }); moveDown.setAttribute('data-move-slide-down', ''); slideTools.append(moveDown); slideTools.append(button('Duplicate slide', 'fa-copy', duplicateSlide)); slideTools.append(button('Rename slide', 'fa-pen', renameSlide)); slideTools.append(button('Delete slide', 'fa-trash', deleteSlide));
    var presentButton = button('Present', 'fa-play', present); presentButton.classList.add('is-primary'); root.querySelector('[data-primary-present]').append(presentButton);
    root.querySelector('.slides-add-thumbnail').addEventListener('click', function () { mutate(function (deck) { var next = makeSlide('title-body', 'New slide'); deck.slides.push(next); activeSlideId = next.id; selectedElementId = ''; }); }); root.querySelector('[data-theme]').addEventListener('change', function (event) { mutate(function (deck) { deck.theme = event.target.value; }); }); root.querySelector('[data-layout]').addEventListener('change', function (event) { changeSlideLayout(event.target.value); }); root.querySelector('[data-size]').addEventListener('change', function (event) { mutate(function (deck) { deck.size = event.target.value; }); }); root.querySelector('[data-slide-background]').addEventListener('input', function (event) { mutate(function (deck) { activeSlide(deck).background = event.target.value; }, true, { history: false }); }); root.querySelector('.slides-notes-panel textarea').addEventListener('focus', function () { var page = pageFrom(workspace()); if (page) pushHistory(page); }); root.querySelector('.slides-notes-panel textarea').addEventListener('input', function (event) { mutate(function (deck) { activeSlide(deck).speakerNotes = event.target.value; }, false, { history: false }); }); root.querySelector('[data-export-pdf]').addEventListener('click', printPdf); root.querySelector('[data-import-pptx]').addEventListener('click', function () { root.querySelector('[data-import-pptx-file]').click(); }); root.querySelector('[data-import-pptx-file]').addEventListener('change', function (event) { importPptx(event.target.files && event.target.files[0]); event.target.value = ''; }); root.querySelector('[data-export-pptx]').addEventListener('click', exportPptx);
    root.querySelector('[data-element-font]').addEventListener('input', function (event) { updateSelectedElement({ fontSize: Number(event.target.value) }, { history: false }); }); root.querySelector('[data-element-bold]').addEventListener('change', function (event) { updateSelectedElement({ fontWeight: event.target.checked ? 'bold' : 'normal' }); }); root.querySelector('[data-element-color]').addEventListener('input', function (event) { updateSelectedElement({ color: event.target.value }, { history: false }); }); root.querySelector('[data-element-fill]').addEventListener('input', function (event) { updateSelectedElement({ fill: event.target.value }, { history: false }); }); root.querySelector('[data-element-back]').addEventListener('click', function () { shiftElementLayer(-1); }); root.querySelector('[data-element-forward]').addEventListener('click', function () { shiftElementLayer(1); }); root.querySelector('[data-element-copy]').addEventListener('click', copyElement); root.querySelector('[data-element-duplicate]').addEventListener('click', duplicateElement); root.querySelector('[data-element-delete]').addEventListener('click', deleteElement);
    root.querySelector('[data-element-align]').addEventListener('change', function (event) { updateSelectedElement({ textAlign: event.target.value }); }); root.querySelector('[data-element-fit]').addEventListener('change', function (event) { updateSelectedElement({ imageFit: event.target.value }); });
    var alignGrid = root.querySelector('.slides-inspector-grid'); [['Align left', 'left'], ['Center horizontally', 'center'], ['Align right', 'right'], ['Align top', 'top'], ['Center vertically', 'middle'], ['Align bottom', 'bottom']].forEach(function (item) { var alignButton = document.createElement('button'); alignButton.type = 'button'; alignButton.textContent = item[0]; alignButton.addEventListener('click', function () { alignElement(item[1]); }); alignGrid.appendChild(alignButton); });
    root.addEventListener('keydown', function (event) { var target = event.target; var nativeControl = target && (target.isContentEditable || (target.closest && target.closest('input, textarea, select, button, summary, a[href], [role="button"], [role="menuitem"], [contenteditable="true"]'))); if (nativeControl) return; var command = event.ctrlKey || event.metaKey; var key = String(event.key || '').toLowerCase(); if (command && key === 'z' && !event.shiftKey) { event.preventDefault(); slidesUndo(); } else if (command && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); slidesRedo(); } else if (command && key === 'c') { event.preventDefault(); copyElement(); } else if (command && key === 'v') { event.preventDefault(); pasteElement(); } else if (command && key === 'd') { event.preventDefault(); duplicateElement(); } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteElement(); } else if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeElement(event.shiftKey ? -2 : -0.5, 0); } else if (event.key === 'ArrowRight') { event.preventDefault(); nudgeElement(event.shiftKey ? 2 : 0.5, 0); } else if (event.key === 'ArrowUp') { event.preventDefault(); nudgeElement(0, event.shiftKey ? -2 : -0.5); } else if (event.key === 'ArrowDown') { event.preventDefault(); nudgeElement(0, event.shiftKey ? 2 : 0.5); } else if (event.key === 'PageUp') { event.preventDefault(); moveSlide(-1); } else if (event.key === 'PageDown') { event.preventDefault(); moveSlide(1); } });
    return root;
  }
  // Lifecycle (audit remediation): refresh on the canonical note-page signal
  // that the core now actually dispatches from loadPage()/imports, plus the
  // cross-tab commit notice — no polling interval.
  global.addEventListener('sutra:note-page-loaded', refresh);
  global.addEventListener('sutra:note-page-locked', refresh);
  global.addEventListener('sutra:workspace-lock-changed', refresh);
  global.addEventListener('sutra:workspace-remote-commit', refresh);
  global.SutraSlides = { createPage: createPage, createFromNewPageDialog: createFromNewPageDialog, getCurrentPage: function () { return pageFrom(workspace()); }, getContext: getContext, addSlide: function () { mutate(function (deck) { var slide = makeSlide('title-body', 'New slide'); deck.slides.push(slide); activeSlideId = slide.id; }); }, captureContentTimelineInsertion: captureContentTimelineInsertion, insertContentTimeline: insertContentTimeline, getContentTimelineSelection: getContentTimelineSelection, updateContentTimeline: updateContentTimeline, undo: slidesUndo, redo: slidesRedo, duplicateSelectedElement: duplicateElement, deleteSelectedElement: deleteElement, copySelectedElement: copyElement, pasteElement: pasteElement, moveSlide: moveSlide, validateAssistantOperations: validateAssistantOperations, createAssistantDeck: createAssistantDeck, applyAssistantOperations: applyAssistantOperations, undoAssistantMutation: undoAssistantMutation, present: present, exportPdf: printPdf, exportPptx: exportPptx, importPptx: importPptx, normalizeDeck: normalizeDeck };
}(window));
