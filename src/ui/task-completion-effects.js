(function taskCompletionEffectsModule() {
  'use strict';

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const MAX_ACTIVE_EFFECTS = 3;
  const CAPTURE_LIFETIME_MS = 2100;
  const SWEEP_MS = 1100;
  const FALL_MS = 850;
  const COLLAPSE_MS = 180;
  const LIFETIME_MS = SWEEP_MS + FALL_MS + COLLAPSE_MS;
  const activeEffects = new Map();
  const pendingSnapshots = new Map();

  function motionIsAllowed() {
    if (document.hidden || document.visibilityState === 'hidden') return false;
    if (document.body && document.body.classList.contains('motion-off')) return false;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if (typeof appSettings !== 'undefined' && appSettings) {
        if (appSettings.motionEnabled === false) return false;
        if (appSettings.preferences && appSettings.preferences.appearance
            && appSettings.preferences.appearance.motionIntensity === 'off') return false;
      }
    } catch (_) { /* body motion class is the fallback for older hosts */ }
    return true;
  }

  function taskKey(value) {
    return String(value || '').replace(/^hw_v2_/, '').replace(/^(?:hw|task):/, '');
  }

  function visibleRect(raw) {
    if (!raw || ![raw.left, raw.top, raw.width, raw.height].every(Number.isFinite)) return null;
    if (raw.width < 8 || raw.height < 8 || raw.width > 10000 || raw.height > 10000) return null;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const left = Math.max(0, raw.left);
    const top = Math.max(0, raw.top);
    const right = Math.min(width, raw.left + raw.width);
    const bottom = Math.min(height, raw.top + raw.height);
    if (right - left < 8 || bottom - top < 8) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  function forgetSnapshot(key, keepEffect = false) {
    const snapshot = pendingSnapshots.get(key);
    if (snapshot) window.clearTimeout(snapshot.timer);
    pendingSnapshots.delete(key);
    if (snapshot && !keepEffect) removeEffect(snapshot.effect);
  }

  function removeEffect(effect) {
    const state = activeEffects.get(effect);
    if (!state) return;
    window.cancelAnimationFrame(state.frame);
    window.clearTimeout(state.timer);
    if (state.gap) state.gap.remove();
    effect.remove();
    activeEffects.delete(effect);
    const pending = pendingSnapshots.get(state.key);
    if (pending && pending.effect === effect) forgetSnapshot(state.key, true);
  }

  function clearEffects() {
    Array.from(activeEffects.keys()).forEach(removeEffect);
    Array.from(pendingSnapshots.keys()).forEach(key => forgetSnapshot(key));
  }

  function cancelForScrollKey(event) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
    const target = event.target instanceof window.Element ? event.target : null;
    if (target && target.closest('input, textarea, select, [contenteditable], [role="textbox"]')) return;
    if (event.key === ' ' && target && target.closest('button, a, [role="button"]')) return;
    clearEffects();
  }

  function cancelForScrollbar(event) {
    const target = event.target instanceof window.Element ? event.target : null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if ((target.scrollHeight > target.clientHeight && event.clientX >= rect.right - 20)
        || (target.scrollWidth > target.clientWidth && event.clientY >= rect.bottom - 20)) clearEffects();
  }

  function reportVisualError(error) {
    if (typeof window.SutraReportError === 'function') {
      window.SutraReportError(error, { where: 'task-completion-effects' }, 'warn');
    }
  }

  function boxPath(context, x, y, width, height, radius) {
    context.beginPath();
    if (radius && typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
    } else context.rect(x, y, width, height);
  }

  function paintLocalIcon(context, node, box, rect) {
    if (typeof window.Path2D !== 'function') return;
    const view = node.viewBox && node.viewBox.baseVal;
    if (!view || view.width <= 0 || view.height <= 0) return;
    context.save();
    context.translate(box.left - rect.left, box.top - rect.top);
    context.scale(box.width / view.width, box.height / view.height);
    context.translate(-view.x, -view.y);
    let pathBudget = 4000;
    Array.from(node.children).slice(0, 24).forEach(shape => {
      const style = window.getComputedStyle(shape);
      const number = name => parseFloat(shape.getAttribute(name)) || 0;
      const path = new window.Path2D();
      const tag = shape.localName;
      if (tag === 'path') {
        const data = shape.getAttribute('d') || '';
        if (data.length > pathBudget) return;
        pathBudget -= data.length;
        path.addPath(new window.Path2D(data));
      } else if (tag === 'circle') {
        path.arc(number('cx'), number('cy'), Math.max(0, number('r')), 0, Math.PI * 2);
      } else if (tag === 'ellipse') {
        path.ellipse(number('cx'), number('cy'), Math.max(0, number('rx')), Math.max(0, number('ry')),
          0, 0, Math.PI * 2);
      } else if (tag === 'rect') {
        const width = Math.max(0, number('width'));
        const height = Math.max(0, number('height'));
        if (typeof path.roundRect === 'function') path.roundRect(number('x'), number('y'), width, height,
          Math.min(number('rx'), width / 2, height / 2));
        else path.rect(number('x'), number('y'), width, height);
      } else if (tag === 'line') {
        path.moveTo(number('x1'), number('y1'));
        path.lineTo(number('x2'), number('y2'));
      } else return;
      context.lineWidth = parseFloat(style.strokeWidth) || 1.75;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (style.fill !== 'none') { context.fillStyle = style.fill; context.fill(path); }
      if (style.stroke !== 'none') { context.strokeStyle = style.stroke; context.stroke(path); }
    });
    context.restore();
  }

  function paintBox(context, node, rect) {
    if (node.closest('svg') && !node.matches('svg.atelier-icon')) return;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom <= rect.top || box.top >= rect.top + rect.height) return;
    const style = window.getComputedStyle(node);
    if (style.visibility === 'hidden' || style.opacity === '0') return;
    if (node.matches('svg.atelier-icon')) { paintLocalIcon(context, node, box, rect); return; }
    const x = box.left - rect.left;
    const y = box.top - rect.top;
    const radius = parseFloat(style.borderTopLeftRadius) || 0;
    context.fillStyle = style.backgroundColor;
    boxPath(context, x, y, box.width, box.height, radius);
    context.fill();
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const borderWidth = parseFloat(style.borderTopWidth) || 0;
    const uniformBorder = borderWidth && radius && sides.every(side =>
      style[`border${side}Width`] === style.borderTopWidth
      && style[`border${side}Style`] === style.borderTopStyle
      && style[`border${side}Color`] === style.borderTopColor);
    if (uniformBorder && style.borderTopStyle !== 'none') {
      context.lineWidth = borderWidth;
      context.strokeStyle = style.borderTopColor;
      boxPath(context, x + borderWidth / 2, y + borderWidth / 2,
        box.width - borderWidth, box.height - borderWidth, Math.max(0, radius - borderWidth / 2));
      context.stroke();
    }
    sides.forEach((side, index) => {
      if (uniformBorder) return;
      const size = parseFloat(style[`border${side}Width`]) || 0;
      if (!size || style[`border${side}Style`] === 'none') return;
      context.lineWidth = size;
      context.strokeStyle = style[`border${side}Color`];
      context.beginPath();
      const lines = [[x, y, x + box.width, y], [x + box.width, y, x + box.width, y + box.height],
        [x, y + box.height, x + box.width, y + box.height], [x, y, x, y + box.height]];
      const line = lines[index];
      context.moveTo(line[0], line[1]);
      context.lineTo(line[2], line[3]);
      context.stroke();
    });
    // Support legacy local font icons as well as canonical inline SVG icons.
    if (node.matches('i')) {
      const icon = window.getComputedStyle(node, '::before');
      const content = icon.content;
      if (content && /^['"]/.test(content) && content.length < 12) {
        context.font = icon.font || style.font;
        context.fillStyle = icon.color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(content.slice(1, -1), x + box.width / 2, y + box.height / 2);
      }
    }
  }

  function rasterizeRow(source, rect) {
    const canvas = document.createElement('canvas');
    // Bound pixel work without silently skipping wide or tall Home cards.
    const scale = Math.min(1, Math.sqrt(650000 / (rect.width * rect.height)));
    canvas.width = Math.ceil(rect.width * scale);
    canvas.height = Math.ceil(rect.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    // Composite ancestor colors so transparent cells do not reveal the task
    // newly rendered below the decorative snapshot.
    context.fillStyle = '#f4faf9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const ancestors = [];
    for (let node = source.parentElement; node; node = node.parentElement) ancestors.push(node);
    ancestors.reverse().forEach(node => {
      context.fillStyle = window.getComputedStyle(node).backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    });
    context.scale(canvas.width / rect.width, canvas.height / rect.height);
    const nodes = [source, ...source.querySelectorAll('*')].slice(0, 180);
    nodes.forEach(node => {
      if (!node.closest('.hw-task-menu, .task-overflow-menu')) paintBox(context, node, rect);
    });
    const walker = document.createTreeWalker(source, window.NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let textNode;
    let measurements = 0;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    while ((textNode = walker.nextNode()) && measurements < 160) {
      const parent = textNode.parentElement;
      if (!parent || parent.closest('.hw-task-menu, .task-overflow-menu')) continue;
      const style = window.getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.fillStyle = style.color;
      if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
      const text = (textNode.textContent || '').slice(0, 2400);
      const parentBox = parent.getBoundingClientRect();
      context.save();
      context.beginPath();
      context.rect(parentBox.left - rect.left, parentBox.top - rect.top, parentBox.width, parentBox.height);
      context.clip();
      // Measure words rather than every character: completion's click handler
      // must not wait on thousands of synchronous layout reads.
      const words = text.matchAll(/\S+/g);
      for (const word of words) {
        if (measurements++ >= 160) break;
        range.setStart(textNode, word.index);
        range.setEnd(textNode, word.index + word[0].length);
        const boxes = Array.from(range.getClientRects());
        if (!boxes.length) continue;
        const box = boxes[0];
        if (!box.width || !box.height || box.top < rect.top || box.bottom > rect.top + rect.height + 1) continue;
        const label = style.textTransform === 'uppercase' ? word[0].toUpperCase()
          : style.textTransform === 'lowercase' ? word[0].toLowerCase() : word[0];
        const metrics = context.measureText(label);
        const ascent = metrics.actualBoundingBoxAscent || parseFloat(style.fontSize) * 0.8;
        const descent = metrics.actualBoundingBoxDescent || 0;
        const baseline = box.top - rect.top + (box.height + ascent - descent) / 2;
        if (boxes.length > 1) context.fillText(label, box.left - rect.left, baseline, box.width);
        else context.fillText(label, box.left - rect.left, baseline);
      }
      context.restore();
    }
    return canvas;
  }

  function captureBeforeCompletion(event) {
    const target = event.target instanceof window.Element ? event.target : null;
    const control = target && target.closest('[data-task-toggle], [data-task-menu-toggle], [data-donow-done], .task-done-btn');
    if (!control) return;
    const inlineId = (control.getAttribute('onclick') || '').match(/\btoggleComplete\(['"]([^'"]+)['"]\)/);
    const key = taskKey(control.getAttribute('data-task-toggle') || control.getAttribute('data-task-menu-toggle')
      || control.getAttribute('data-donow-done') || (inlineId && inlineId[1]));
    if (!key) return;
    forgetSnapshot(key);
    Array.from(activeEffects).forEach(([effect, state]) => { if (state.key === key) removeEffect(effect); });
    if (!motionIsAllowed() || control.classList.contains('active')
        || /incomplete|as open|undo/i.test(control.getAttribute('aria-label') || control.title || control.textContent)) return;
    const source = control.closest('.hw-assignment-row, .hw-card, .hw-assignment, .task-card, .today-brief-nba') || control;
    const sourceRect = source.getBoundingClientRect();
    const rect = visibleRect(sourceRect);
    if (!rect) return;
    try {
      const canvas = rasterizeRow(source, rect);
      if (!canvas) return;
      while (pendingSnapshots.size >= MAX_ACTIVE_EFFECTS) forgetSnapshot(pendingSnapshots.keys().next().value);
      const siblings = source.parentElement ? Array.from(source.parentElement.children) : [];
      const scrollParents = [];
      for (let node = source.parentElement; node; node = node.parentElement) {
        scrollParents.push({ node, left: node.scrollLeft, top: node.scrollTop });
      }
      const snapshot = {
        canvas, rect, control, scrollParents, layoutHeight: sourceRect.height, key, createdAt: Date.now(), view: document.body.dataset.view,
        inkTone: (window.getComputedStyle(source).color.match(/[\d.]+/g) || []).slice(0, 3).map(Number),
        table: source.matches('.hw-assignment-row'), block: window.getComputedStyle(source).display !== 'table-row',
        columns: source.cells ? source.cells.length : 1,
        cardList: source.matches('.task-card') && source.parentElement.matches('.task-list') ? source.parentElement : null,
        cardIndex: siblings.indexOf(source), cardClick: control.getAttribute('onclick'),
        nextCardClicks: siblings.slice(siblings.indexOf(source) + 1)
          .map(node => node.querySelector('.task-done-btn')?.getAttribute('onclick')).filter(Boolean),
        nextIds: siblings.slice(siblings.indexOf(source) + 1).map(node => node.getAttribute('data-task-id')).filter(Boolean)
      };
      snapshot.timer = window.setTimeout(() => forgetSnapshot(key), CAPTURE_LIFETIME_MS);
      pendingSnapshots.set(key, snapshot);
      prepareEffect(snapshot);
      // The canonical handler is already attached to this button. Run after
      // it in the same click dispatch, before the browser paints its rerender.
      control.addEventListener('click', () => holdAfterCompletionClick(snapshot), { once: true });
    } catch (error) { forgetSnapshot(key); reportVisualError(error); }
  }

  function holdAfterCompletionClick(snapshot) {
    if (pendingSnapshots.get(snapshot.key) !== snapshot) return;
    if (!motionIsAllowed() || snapshot.view !== document.body.dataset.view) return forgetSnapshot(snapshot.key);
    try {
      const store = window.SutraHomeworkStore;
      const task = store && typeof store.getSnapshot === 'function'
        ? store.getSnapshot().tasks.find(row => taskKey(row.id) === snapshot.key) : null;
      // Home's canonical handler updates its day state and replaces the card
      // before the mirrored homework store catches up. Use that local handoff;
      // consulting the stale mirror here would discard a valid Home effect.
      if (snapshot.view === 'today') {
        if (snapshot.control.isConnected) return forgetSnapshot(snapshot.key);
        // Inline Home cards complete today's occurrence. Next Up can instead
        // use Homework's recurring advance, which intentionally remains open.
        if (!snapshot.cardClick && task && !task.done && task.recurrence && task.recurrence !== 'none') {
          return forgetSnapshot(snapshot.key);
        }
      } else if (task && !task.done) {
        // To-do's recurring advance rerenders without completing the task.
        return forgetSnapshot(snapshot.key);
      }
      // Respond to the accepted local action without waiting for disk I/O.
      // Saving and its error reporting stay with the canonical task action.
      startEffect(snapshot);
    } catch (error) { forgetSnapshot(snapshot.key); reportVisualError(error); }
  }

  function makeDust(canvas, inkTone, rect) {
    const context = canvas.getContext('2d');
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    const baseOffset = (Math.min(2, height - 1) * width + Math.min(2, width - 1)) * 4;
    const base = pixels.slice(baseOffset, baseOffset + 3);
    const tone = inkTone && inkTone.length === 3 && inkTone.every(Number.isFinite) ? inkTone : base;
    const dust = [];
    function grain(x, y, offset, surface) {
      const size = surface ? 1.5 + Math.random() * 1.7 : 2 + Math.random() * 2.3;
      // Mix pale surface grains with the row's own ink so dust stays visible
      // on light themes without introducing a separate celebration palette.
      const color = [0, 1, 2].map(channel => Math.round(surface
        ? pixels[offset + channel] * 0.68 + tone[channel] * 0.32 : pixels[offset + channel]));
      dust.push({ x: x / width * rect.width, y: y / height * rect.height, size, born: x / width * SWEEP_MS,
        dx: (Math.random() - 0.45) * 58, fall: 48 + Math.random() * 112,
        color: `rgb(${color.join(',')})`, alpha: surface ? 0.78 : 0.98 });
    }
    const surfaceCount = Math.min(650, Math.max(220, Math.round(width * height / 110)));
    for (let index = 0; index < surfaceCount; index++) {
      const x = (index + Math.random()) / surfaceCount * (width - 1);
      const y = Math.random() * (height - 1);
      grain(x, y, (Math.floor(y) * width + Math.floor(x)) * 4, true);
    }
    // Actual ink/badges keep their own color as they break into dust.
    const ink = new Uint32Array(750);
    let inkSeen = 0;
    const stride = Math.max(2, Math.ceil(Math.sqrt(width * height / 9000)));
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const offset = (y * width + x) * 4;
        if (Math.abs(pixels[offset] - base[0]) + Math.abs(pixels[offset + 1] - base[1])
            + Math.abs(pixels[offset + 2] - base[2]) <= 60) continue;
        // A bounded reservoir samples the whole row without allocating an
        // object for every matching pixel on large cards.
        const slot = inkSeen < ink.length ? inkSeen : Math.floor(Math.random() * (inkSeen + 1));
        if (slot < ink.length) ink[slot] = offset / 4;
        inkSeen++;
      }
    }
    const inkCount = Math.min(ink.length, inkSeen);
    for (let index = 0; index < inkCount; index++) {
      const pixel = ink[index];
      grain(pixel % width, Math.floor(pixel / width), pixel * 4, false);
    }
    return dust;
  }

  function reserveRowGap(snapshot) {
    const list = snapshot.cardList;
    if (list && list.isConnected && list.getClientRects().length) {
      const retained = Array.from(list.querySelectorAll('.task-done-btn'))
        .find(button => button.getAttribute('onclick') === snapshot.cardClick);
      if (retained && Math.abs(retained.closest('.task-card').getBoundingClientRect().top - snapshot.rect.top) < 2) return null;
      // Home's task drawer rerenders its children but retains the list. Hold
      // the vacated slot so another task cannot move beneath the old card.
      const gap = document.createElement('div');
      gap.className = 'sutra-task-completion-gap sutra-task-completion-gap--card';
      gap.setAttribute('aria-hidden', 'true');
      gap.inert = true;
      const space = document.createElement('div');
      space.style.height = `${snapshot.layoutHeight}px`;
      gap.appendChild(space);
      const followingGaps = Array.from(activeEffects.values())
        .filter(state => snapshot.nextCardClicks.includes(state.snapshot.cardClick))
        .map(state => state.gap);
      const next = Array.from(list.children).find(node => followingGaps.includes(node)
        || snapshot.nextCardClicks.includes(node.querySelector('.task-done-btn')?.getAttribute('onclick')));
      list.insertBefore(gap, next || list.children[snapshot.cardIndex] || null);
      return gap;
    }
    if (!snapshot.table || snapshot.view !== 'homework') return null;
    const table = Array.from(document.querySelectorAll('#view-homework .hw-assignment-table')).find(node => node.getClientRects().length);
    if (!table) return null;
    const rows = Array.from(table.querySelectorAll('.hw-assignment-row')).filter(node => node.getClientRects().length);
    // Some views retain completed rows in place; an expanded Completed group
    // instead moves the row elsewhere and still needs the original gap.
    const retained = rows.find(node => taskKey(node.getAttribute('data-task-id')) === snapshot.key);
    if (retained && Math.abs(retained.getBoundingClientRect().top - snapshot.rect.top) < 2) return null;
    const next = snapshot.nextIds.map(id => rows.find(node => node.getAttribute('data-task-id') === id)).find(Boolean);
    const body = next ? next.parentElement : table.querySelector('tbody:not([hidden]):not(.hw-past-heading)');
    if (!body) return null;
    const gap = document.createElement('tr');
    gap.className = 'sutra-task-completion-gap';
    gap.setAttribute('aria-hidden', 'true');
    gap.style.display = snapshot.block ? 'block' : 'table-row';
    const cell = document.createElement('td');
    cell.colSpan = snapshot.columns;
    cell.style.display = snapshot.block ? 'block' : 'table-cell';
    cell.style.height = `${snapshot.layoutHeight}px`;
    gap.appendChild(cell);
    body.insertBefore(gap, next || null);
    return gap;
  }

  function restoreEffectGaps() {
    // A second completion or a late list refresh replaces decorative spacers.
    // Rebuild them without restarting or cancelling the independent canvases.
    activeEffects.forEach(state => {
      if (state.started && state.gap && !state.gap.isConnected) {
        state.gap = reserveRowGap(state.snapshot);
      }
    });
  }

  function prepareEffect(snapshot) {
    while (activeEffects.size >= MAX_ACTIVE_EFFECTS) removeEffect(activeEffects.keys().next().value);
    const effect = document.createElement('div');
    effect.className = 'sutra-task-completion-effect';
    effect.setAttribute('aria-hidden', 'true');
    effect.inert = true;
    const canvas = document.createElement('canvas');
    canvas.className = 'sutra-task-completion-effect__canvas';
    const width = snapshot.rect.width + 80;
    const height = snapshot.rect.height + 170;
    const scale = Math.min(1, Math.sqrt(900000 / (width * height)));
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.left = `${snapshot.rect.left - 40}px`;
    canvas.style.top = `${snapshot.rect.top}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(canvas.width / width, canvas.height / height);
    // Keep the row visible across the synchronous list rerender, then reuse
    // this same canvas for the accepted action's dust animation.
    context.drawImage(snapshot.canvas, 40, 0, snapshot.rect.width, snapshot.rect.height);
    effect.appendChild(canvas);
    snapshot.effect = effect;
    const state = { key: snapshot.key, snapshot, gap: null, canvas, context, started: false, frame: 0, timer: 0 };
    activeEffects.set(effect, state);
    document.body.appendChild(effect);
  }

  function startEffect(snapshot) {
    const effect = snapshot.effect;
    const state = activeEffects.get(effect);
    if (!state || state.started) return;
    state.started = true;
    const { canvas, context } = state;
    const dust = makeDust(snapshot.canvas, snapshot.inkTone, snapshot.rect);
    restoreEffectGaps();
    if (!state.gap || !state.gap.isConnected) state.gap = reserveRowGap(snapshot);
    window.clearTimeout(snapshot.timer);
    state.timer = window.setTimeout(() => removeEffect(effect), CAPTURE_LIFETIME_MS);
    let started = null;
    function frame(now) {
      if (!activeEffects.has(effect)) return;
      if (!motionIsAllowed()) return removeEffect(effect);
      if (started === null) {
        started = now;
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(() => removeEffect(effect), LIFETIME_MS + 250);
      }
      const elapsed = now - started;
      if (elapsed >= LIFETIME_MS) return removeEffect(effect);
      try {
        restoreEffectGaps();
        // A list rerender may adjust an ancestor's scroll offset. Keep the
        // snapshot in its content slot instead of cancelling before it paints.
        let shiftX = 0;
        let shiftY = 0;
        snapshot.scrollParents.forEach(({ node, left, top }) => {
          if (!node.isConnected) return;
          shiftX += node.scrollLeft - left;
          shiftY += node.scrollTop - top;
        });
        canvas.style.left = `${snapshot.rect.left - 40 - shiftX}px`;
        canvas.style.top = `${snapshot.rect.top - shiftY}px`;
        context.clearRect(0, 0, snapshot.rect.width + 80, snapshot.rect.height + 170);
        context.globalAlpha = 1;
        const edge = Math.min(1, elapsed / SWEEP_MS) * snapshot.rect.width;
        const scaleX = snapshot.canvas.width / snapshot.rect.width;
        const scaleY = snapshot.canvas.height / snapshot.rect.height;
        // Staggered strips give the advancing edge a crumbling outline.
        for (let y = 0; elapsed < SWEEP_MS && y < snapshot.rect.height; y += 4) {
          const x = Math.min(snapshot.rect.width, Math.max(0, edge + Math.sin(y * 1.7) * 5));
          const width = snapshot.rect.width - x;
          const height = Math.min(4, snapshot.rect.height - y);
          if (width > 0) context.drawImage(snapshot.canvas, x * scaleX, y * scaleY, width * scaleX, height * scaleY,
            x + 40, y, width, height);
        }
        dust.forEach(piece => {
          const age = (elapsed - piece.born) / FALL_MS;
          if (age < 0 || age >= 1) return;
          context.globalAlpha = piece.alpha * Math.pow(1 - age, 1.4);
          context.fillStyle = piece.color;
          const x = piece.x + 40 + piece.dx * age;
          const y = piece.y + piece.fall * age * age;
          context.fillRect(x, y, piece.size * (1 - age * 0.45), piece.size * (1 - age * 0.45));
        });
        context.globalAlpha = 1;
        if (state.gap && state.gap.isConnected) {
          const collapse = Math.max(0, (elapsed - SWEEP_MS - FALL_MS) / COLLAPSE_MS);
          const eased = collapse * collapse * (3 - 2 * collapse);
          state.gap.firstElementChild.style.height = `${snapshot.layoutHeight * (1 - eased)}px`;
        }
        state.frame = window.requestAnimationFrame(frame);
      } catch (error) { removeEffect(effect); reportVisualError(error); }
    }
    // Start the clock on the first actual paint, after the click's rerenders.
    state.frame = window.requestAnimationFrame(frame);
  }

  function onTaskCompleted(event) {
    const detail = event && event.detail;
    if (!detail || typeof detail.taskId !== 'string' || !visibleRect(detail.rect)) return;
    const key = taskKey(detail.taskId);
    const snapshot = pendingSnapshots.get(key);
    // Consume once; duplicate save callbacks cannot replay an old row.
    forgetSnapshot(key, true);
    // An accepted local action already owns its animation and cleanup.
    // Late persistence confirmation must neither restart nor cancel it.
    if (snapshot && activeEffects.get(snapshot.effect)?.started) return;
    if (!snapshot || !motionIsAllowed() || snapshot.view !== document.body.dataset.view
        || Date.now() - snapshot.createdAt > CAPTURE_LIFETIME_MS) {
      if (snapshot) removeEffect(snapshot.effect);
      return;
    }
    try { startEffect(snapshot); } catch (error) { clearEffects(); reportVisualError(error); }
  }

  document.addEventListener('click', captureBeforeCompletion, true);
  document.addEventListener('sutra:task-completed', onTaskCompleted);
  window.addEventListener('noteflow:view-changed', clearEffects);
  window.addEventListener('sutra:workspace-lock-changed', clearEffects);
  window.addEventListener('sutra:note-page-locked', clearEffects);
  window.addEventListener('pagehide', clearEffects);
  window.addEventListener('resize', clearEffects);
  window.addEventListener('wheel', clearEffects, { capture: true, passive: true });
  window.addEventListener('touchmove', clearEffects, { capture: true, passive: true });
  document.addEventListener('keydown', cancelForScrollKey, true);
  document.addEventListener('pointerdown', cancelForScrollbar, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearEffects(); });
})();
