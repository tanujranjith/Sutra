(function (global) {
  'use strict';
  var activePageId = '';
  var activeSlideId = '';
  var selectedElementId = '';
  var root = null;
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
    var bridge = appBridge();
    if (typeof bridge.isPageContentAuthorized === 'function') return bridge.isPageContentAuthorized(page);
    var unlocked = bridge.unlockedPageIds;
    return !!(page && !(page.isLocked && page.lockHash && !(unlocked && unlocked.has && unlocked.has(page.id))));
  }
  function activeSlide(deck) { return deck && deck.slides.find(function (slide) { return slide.id === activeSlideId; }) || (deck && deck.slides[0]) || null; }
  function setEditorVisible(visible) {
    if (!root) return;
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
      elements.push(makeElement('text', { x: 9, y: 25, width: 56, height: 24, text: title || 'Untitled presentation', fontSize: 8, fontWeight: 'bold' }));
      elements.push(makeElement('text', { x: 10, y: 49, width: 48, height: 8, text: 'Add a concise subtitle or guiding question.', fontSize: 3 }));
    } else if (layout === 'three-card') {
      elements.push(makeElement('text', { x: 8, y: 7, width: 80, height: 16, text: title || 'Untitled slide', fontSize: 6, fontWeight: 'bold' }));
      ['First idea', 'Why it matters', 'Key detail'].forEach(function (text, index) { var x = 8 + index * 30; elements.push(makeElement('shape', { x: x, y: 31, width: 25, height: 38, fill: '#ffffff', borderWidth: 1 })); elements.push(makeElement('text', { x: x + 3, y: 38, width: 19, height: 8, text: text, fontWeight: 'bold' })); });
    } else {
      elements.push(makeElement('text', { x: 8, y: 8, width: 80, height: 16, text: title || 'New slide', fontSize: 6, fontWeight: 'bold' }));
      elements.push(makeElement('text', { x: 10, y: 25, width: 62, height: 40, text: layout === 'two-column' ? 'First idea\n\nSecond idea' : '• Add your first point\n• Keep each point focused\n• Use notes for detail', fontSize: 3 }));
    }
    return { id: id(), layout: layout || 'title-body', title: title || 'New slide', speakerNotes: '', elements: elements };
  }
  function ensureDeck(page) {
    if (!page.slides || !Array.isArray(page.slides.slides)) page.slides = { version: 1, size: 'widescreen', theme: 'sutra', slides: [makeSlide('title', page.title || 'Untitled presentation')] };
    if (!page.slides.slides.length) page.slides.slides.push(makeSlide('title', page.title || 'Untitled presentation'));
    return page.slides;
  }
  function button(label, icon, action, title) { var b = document.createElement('button'); b.type = 'button'; b.className = 'slides-toolbar-btn'; b.title = title || label; b.setAttribute('aria-label', label); if (icon) { var glyph = document.createElement('i'); glyph.className = 'fas ' + icon; glyph.setAttribute('aria-hidden', 'true'); b.appendChild(glyph); var labelNode = document.createElement('span'); labelNode.textContent = label; b.appendChild(labelNode); } else b.textContent = label; b.addEventListener('click', action); return b; }
  function mount() {
    if (root) return root;
    root = document.createElement('section'); root.id = 'slidesEditor'; root.className = 'slides-editor'; root.hidden = true; root.setAttribute('inert', ''); root.setAttribute('aria-hidden', 'true'); root.setAttribute('aria-label', 'Slides editor');
    root.innerHTML = '<div class="slides-mode-tabs" role="tablist" aria-label="Notes mode"><span>Notepad</span><span>Canvas</span><strong aria-selected="true">Slides</strong></div><div class="slides-toolbar" role="toolbar"><div class="slides-toolbar-main"></div><div class="slides-toolbar-end"></div></div><div class="slides-workspace"><aside class="slides-thumbnails" aria-label="Slides"><div class="slides-thumbnail-list"></div><button type="button" class="slides-add-thumbnail" aria-label="Add slide"><i class="fas fa-plus" aria-hidden="true"></i></button></aside><main class="slides-center"><div class="slides-stage" tabindex="0" aria-label="Editable current slide"></div><section class="slides-notes-panel"><label><i class="fas fa-note-sticky" aria-hidden="true"></i> Speaker notes</label><textarea aria-label="Speaker notes"></textarea></section></main><aside class="slides-inspector"><h3>Design</h3><label>Theme<select data-theme><option value="sutra">Sutra</option><option value="nature">Sutra Nature</option><option value="midnight">Midnight</option><option value="paper">Paper</option></select></label><label>Layout<select data-layout><option value="title">Title</option><option value="title-body">Title &amp; body</option><option value="two-column">Two column</option><option value="three-card">Title &amp; three cards</option><option value="image-caption">Image &amp; caption</option><option value="blank">Blank</option></select></label><label>Slide size<select data-size><option value="widescreen">16:9 (Widescreen)</option><option value="standard">4:3 (Standard)</option></select></label><label class="slides-toggle"><input type="checkbox" data-notes checked> Show speaker notes</label><button type="button" data-export-pdf>Print / PDF</button><button type="button" data-export-pptx>Export PPTX</button></aside></div><div class="slides-status"><span data-count></span><span>Saved locally</span><button type="button" data-present><i class="fas fa-play" aria-hidden="true"></i> Present</button></div>'; // sutra-allow-html: reviewed static editor chrome; all deck data is assigned with textContent.
    var container = document.getElementById('notesPrimaryPane'); if (container) container.appendChild(root);
    var toolbar = root.querySelector('.slides-toolbar-main'); toolbar.append(button('New Slide', 'fa-plus', function () { mutate(function (deck) { var next = makeSlide('title-body', 'New slide'); deck.slides.push(next); activeSlideId = next.id; }); }));
    toolbar.append(button('Undo', 'fa-undo', function () { showToast('Slides undo is available per edit session.'); })); toolbar.append(button('Text', 'fa-font', function () { addElement('text'); })); toolbar.append(button('Shape', 'fa-shapes', function () { addElement('shape'); })); toolbar.append(button('Image', 'fa-image', chooseImage)); toolbar.append(button('Chart', 'fa-chart-bar', function () { addElement('chart'); }));
    var end = root.querySelector('.slides-toolbar-end'); end.append(button('Duplicate', 'fa-copy', duplicateSlide)); end.append(button('Delete', 'fa-trash', deleteSlide)); end.append(button('Present', 'fa-play', present));
    root.querySelector('.slides-add-thumbnail').addEventListener('click', function () { mutate(function (deck) { var next = makeSlide('title-body', 'New slide'); deck.slides.push(next); activeSlideId = next.id; }); });
    root.querySelector('[data-theme]').addEventListener('change', function (event) { mutate(function (deck) { deck.theme = event.target.value; }); });
    root.querySelector('[data-layout]').addEventListener('change', function (event) { mutate(function (deck) { var slide = activeSlide(deck); var replacement = makeSlide(event.target.value, slide.title || 'Slide'); replacement.id = slide.id; replacement.speakerNotes = slide.speakerNotes; var i = deck.slides.indexOf(slide); deck.slides[i] = replacement; }); });
    root.querySelector('[data-size]').addEventListener('change', function (event) { mutate(function (deck) { deck.size = event.target.value; }); });
    root.querySelector('[data-notes]').addEventListener('change', function (event) { root.querySelector('.slides-notes-panel').hidden = !event.target.checked; });
    root.querySelector('.slides-notes-panel textarea').addEventListener('input', function (event) { mutate(function (deck) { activeSlide(deck).speakerNotes = event.target.value.slice(0, 20000); }, false); });
    root.querySelector('[data-present]').addEventListener('click', present); root.querySelector('[data-export-pdf]').addEventListener('click', printPdf); root.querySelector('[data-export-pptx]').addEventListener('click', exportPptx);
    return root;
  }
  function mutate(change, rerender) { var data = workspace(); var page = pageFrom(data); if (!page || !pageContentAuthorized(page)) return; var deck = ensureDeck(page); change(deck, page); page.updatedAt = new Date().toISOString(); scheduleSave(); if (rerender !== false) render(); }
  function addElement(type) { mutate(function (deck) { var slide = activeSlide(deck); var element = type === 'chart' ? makeElement('chart', { x: 32, y: 30, width: 38, height: 35, text: 'Chart', chart: { labels: ['A', 'B', 'C'], values: [5, 8, 4] } }) : makeElement(type, type === 'shape' ? { x: 35, y: 35, width: 24, height: 18, text: 'Shape', fill: '#e9e6db', borderWidth: 1 } : { x: 15, y: 35, text: 'Add text', fontSize: 4 }); slide.elements.push(element); selectedElementId = element.id; }); }
  function duplicateSlide() { mutate(function (deck) { var current = activeSlide(deck); var copy = JSON.parse(JSON.stringify(current)); copy.id = id(); copy.title = (copy.title || 'Slide') + ' copy'; copy.elements.forEach(function (element) { element.id = id(); }); deck.slides.splice(deck.slides.indexOf(current) + 1, 0, copy); activeSlideId = copy.id; }); }
  function deleteSlide() { mutate(function (deck) { if (deck.slides.length < 2) { showToast('A deck needs at least one slide.'); return; } var i = deck.slides.indexOf(activeSlide(deck)); deck.slides.splice(i, 1); activeSlideId = deck.slides[Math.max(0, i - 1)].id; }); }
  function chooseImage() { var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif'; input.addEventListener('change', function () { var file = input.files && input.files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { showToast('Slide images must be 10MB or smaller.'); return; } var reader = new FileReader(); reader.onload = function () { mutate(function (deck) { activeSlide(deck).elements.push(makeElement('image', { x: 54, y: 15, width: 37, height: 57, dataUrl: reader.result, alt: file.name })); }); }; reader.readAsDataURL(file); }); input.click(); }
  function renderElement(element, deck) { var node = document.createElement('div'); node.className = 'slides-element slides-element-' + element.type + (element.id === selectedElementId ? ' selected' : ''); node.style.cssText = 'left:' + element.x + '%;top:' + element.y + '%;width:' + element.width + '%;height:' + element.height + '%;font-size:' + (element.fontSize || 3) + 'cqw;color:' + (element.color || themes[deck.theme].ink) + ';background:' + (element.fill || 'transparent') + ';border:' + (element.borderWidth || 0) + 'px solid ' + (element.borderColor || '#d7d3c7') + ';';
    if (element.type === 'image') { var image = document.createElement('img'); image.src = element.dataUrl || ''; image.alt = element.alt || 'Slide image'; node.appendChild(image); }
    else if (element.type === 'chart') { var chart = document.createElement('div'); chart.className = 'slides-chart'; var values = element.chart && element.chart.values || [5, 8, 4]; var max = Math.max.apply(Math, values.concat([1])); values.forEach(function (value) { var bar = document.createElement('span'); bar.style.height = Math.max(6, value / max * 100) + '%'; chart.appendChild(bar); }); node.appendChild(chart); }
    else { var text = document.createElement('div'); text.className = 'slides-element-text'; text.contentEditable = 'true'; text.textContent = element.text || (element.type === 'shape' ? 'Shape' : 'Add text'); text.addEventListener('input', function () { mutate(function (deck) { var found = activeSlide(deck).elements.find(function (item) { return item.id === element.id; }); if (found) found.text = text.textContent.slice(0, 8000); }, false); }); node.appendChild(text); }
    node.addEventListener('pointerdown', function (event) { if (event.target.isContentEditable) return; selectedElementId = element.id; render(); }); return node;
  }
  function render() { if (!root || !activePageId) return; var data = workspace(); var page = pageFrom(data); var deck = page && deckFor(page); if (!deck) { setEditorVisible(false); return; } if (!activeSlideId || !deck.slides.some(function (slide) { return slide.id === activeSlideId; })) activeSlideId = deck.slides[0].id; var slide = activeSlide(deck); var theme = themes[deck.theme] || themes.sutra; setEditorVisible(true); root.dataset.size = deck.size; root.querySelector('[data-theme]').value = deck.theme; root.querySelector('[data-layout]').value = slide.layout || 'blank'; root.querySelector('[data-size]').value = deck.size || 'widescreen'; root.querySelector('[data-count]').textContent = (deck.slides.indexOf(slide) + 1) + ' of ' + deck.slides.length + ' slides'; var list = root.querySelector('.slides-thumbnail-list'); list.replaceChildren(); deck.slides.forEach(function (item, index) { var thumb = document.createElement('button'); thumb.type = 'button'; thumb.className = 'slides-thumbnail' + (item.id === slide.id ? ' active' : ''); thumb.textContent = (index + 1) + '  ' + (item.title || item.elements[0] && item.elements[0].text || 'Untitled slide'); thumb.addEventListener('click', function () { activeSlideId = item.id; selectedElementId = ''; render(); }); list.appendChild(thumb); }); var stage = root.querySelector('.slides-stage'); stage.replaceChildren(); stage.style.background = slide.background || theme.bg; stage.style.color = theme.ink; slide.elements.slice().sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); }).forEach(function (element) { stage.appendChild(renderElement(element, deck)); }); root.querySelector('.slides-notes-panel textarea').value = slide.speakerNotes || ''; }
  function present() { var data = workspace(); var page = pageFrom(data); var deck = page && deckFor(page); if (!deck) return; var overlay = document.createElement('div'); overlay.className = 'slides-present-overlay'; var stage = document.createElement('div'); stage.className = 'slides-present-stage'; var notes = document.createElement('aside'); notes.className = 'slides-present-notes'; var close = document.createElement('button'); close.type = 'button'; close.textContent = 'Exit presentation'; overlay.append(stage, notes, close); document.body.appendChild(overlay); var index = deck.slides.indexOf(activeSlide(deck)); function draw() { var slide = deck.slides[index]; stage.replaceChildren(); stage.style.background = slide.background || (themes[deck.theme] || themes.sutra).bg; slide.elements.forEach(function (element) { stage.appendChild(renderElement(Object.assign({}, element), deck)); }); notes.textContent = slide.speakerNotes || 'No speaker notes for this slide.'; } function key(event) { if (event.key === 'Escape') close.click(); if ((event.key === 'ArrowRight' || event.key === ' ') && index < deck.slides.length - 1) { index++; draw(); event.preventDefault(); } if (event.key === 'ArrowLeft' && index > 0) { index--; draw(); event.preventDefault(); } } close.onclick = function () { document.removeEventListener('keydown', key, true); overlay.remove(); }; document.addEventListener('keydown', key, true); draw(); }
  function printPdf() { var data = workspace(); var page = pageFrom(data); if (!page) return; var popup = global.open('', '_blank', 'noopener,noreferrer'); if (!popup) { showToast('Allow pop-ups to print Slides as PDF.'); return; } var deck = deckFor(page); popup.document.write('<!doctype html><title>' + escapeHtml(page.title) + '</title><style>@page{size:landscape;margin:0}.slide{width:13.333in;height:7.5in;page-break-after:always;padding:.5in;box-sizing:border-box;font-family:Arial;white-space:pre-wrap}</style>' + deck.slides.map(function (slide) { return '<section class="slide" style="background:' + escapeHtml(slide.background || themes[deck.theme].bg) + '">' + slide.elements.filter(function (element) { return element.type !== 'image'; }).map(function (element) { return '<div style="font-size:' + Math.max(8, Math.min(72, Number(element.fontSize || 3) * 7)) + 'pt">' + escapeHtml(element.text) + '</div>'; }).join('') + '</section>'; }).join('') + '<script>addEventListener("load",function(){print()})<\/script>'); popup.document.close(); } // sutra-allow-html: printable document is built from escaped deck text and bounded numeric styles.
  function exportPptx() { var page = pageFrom(workspace()); if (!page || !global.JSZip) { showToast('PPTX export is unavailable in this browser.'); return; } var deck = deckFor(page); var zip = new global.JSZip(); zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>'); zip.file('sutra-slides.json', JSON.stringify({ format: 'sutra-slides-pptx', deck: deck }, null, 2)); deck.slides.forEach(function (slide, index) { zip.file('ppt/slides/slide' + (index + 1) + '.xml', '<slide><title>' + escapeText(slide.title) + '</title><notes>' + escapeText(slide.speakerNotes) + '</notes><elements>' + escapeText(JSON.stringify(slide.elements)) + '</elements></slide>'); }); zip.generateAsync({ type: 'blob' }).then(function (blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (page.title || 'presentation').replace(/[^a-z0-9_-]+/gi, '_') + '.pptx'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); showToast('PPTX package exported.'); }); }
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
    var deck = options && options.create ? { version: 1, size: 'widescreen', theme: 'sutra', slides: [] } : (page && deckFor(page));
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
    var applied = engine.applySlides({ version: 1, size: 'widescreen', theme: 'sutra', slides: [] }, operations, { idFactory: id, now: new Date().toISOString() });
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
    var page = (data.pages || []).find(function (item) { return item && item.id === pageId; });
    activePageId = pageId;
    var visible = !!(page && pageContentAuthorized(page) && page.slides && Array.isArray(page.slides.slides));
    if (visible) { mount(); render(); } else setEditorVisible(false);
    document.body.classList.toggle('slides-page-active', visible);
  }
  function createPage(title, options) { var bridge = appBridge(); var now = new Date().toISOString(); var deck = options && options.deck && Array.isArray(options.deck.slides) ? cloneDeck(options.deck) : { version: 1, size: 'widescreen', theme: 'sutra', slides: [makeSlide('title', title || 'Untitled presentation')] }; var page = { id: id(), title: title || 'Presentation', type: 'note', content: '', blocks: [], icon: '🖼️', spaceId: bridge.getActiveSpaceId ? bridge.getActiveSpaceId() : 'default', createdAt: now, updatedAt: now, slides: deck }; bridge.pages.push(page); bridge.persistAppData(); if (typeof bridge.renderPagesList === 'function') bridge.renderPagesList(); if (typeof global.loadPage === 'function') global.loadPage(page.id); return page; }
  function cloneDeck(deck) { return JSON.parse(JSON.stringify(deck)); }
  function createFromNewPageDialog() { var titleInput = document.getElementById('newPageName'); var title = titleInput && titleInput.value || 'Presentation'; var modal = document.getElementById('newPageModal'); if (modal) modal.classList.remove('active'); createPage(title); }
  global.addEventListener('sutra:note-page-loaded', refresh); setInterval(refresh, 350); global.SutraSlides = { createPage: createPage, createFromNewPageDialog: createFromNewPageDialog, getCurrentPage: function () { return pageFrom(workspace()); }, getContext: getContext, addSlide: function () { mutate(function (deck) { var slide = makeSlide('title-body', 'New slide'); deck.slides.push(slide); activeSlideId = slide.id; }); }, validateAssistantOperations: validateAssistantOperations, createAssistantDeck: createAssistantDeck, applyAssistantOperations: applyAssistantOperations, undoAssistantMutation: undoAssistantMutation, present: present, exportPdf: printPdf, exportPptx: exportPptx };
}(window));
