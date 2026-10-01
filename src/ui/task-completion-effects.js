(function taskCompletionEffectsModule() {
  'use strict';

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const MAX_ACTIVE_EFFECTS = 3;
  const FALLBACK_LIFETIME_MS = 980;
  const PIECES = [
    { kind: 'shred', x: -15, y: -9, dx: -74, dy: 82, rotate: -168, width: 7, height: 19, delay: 0, duration: 660 },
    { kind: 'shred', x: 12, y: -12, dx: 56, dy: 112, rotate: 142, width: 9, height: 17, delay: 18, duration: 730 },
    { kind: 'shred', x: -28, y: 4, dx: -104, dy: 42, rotate: -224, width: 6, height: 15, delay: 34, duration: 700 },
    { kind: 'shred', x: 24, y: 6, dx: 98, dy: 60, rotate: 192, width: 8, height: 21, delay: 48, duration: 760 },
    { kind: 'shred', x: -4, y: -15, dx: -26, dy: 136, rotate: 115, width: 6, height: 18, delay: 65, duration: 790 },
    { kind: 'shred', x: 5, y: 11, dx: 34, dy: 96, rotate: -132, width: 9, height: 16, delay: 82, duration: 710 },
    { kind: 'particle', x: -21, y: -7, dx: -88, dy: 8, rotate: 0, width: 5, height: 5, delay: 12, duration: 600 },
    { kind: 'particle', x: 19, y: -5, dx: 76, dy: 22, rotate: 0, width: 4, height: 4, delay: 38, duration: 640 },
    { kind: 'particle', x: -7, y: 9, dx: -47, dy: 74, rotate: 0, width: 5, height: 5, delay: 70, duration: 680 },
    { kind: 'particle', x: 9, y: -10, dx: 52, dy: 91, rotate: 0, width: 4, height: 4, delay: 96, duration: 720 }
  ];
  const COLORS = [
    'var(--accent, #7c6dff)',
    'var(--accent-strong, var(--accent, #7c6dff))',
    'var(--accent-gold, var(--accent, #7c6dff))'
  ];
  const activeEffects = new Map();

  function motionIsAllowed() {
    if (document.hidden || document.visibilityState === 'hidden') return false;
    if (document.body && document.body.classList.contains('motion-off')) return false;

    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch (_) { /* the body motion class remains the app-level fallback */ }

    try {
      if (typeof appSettings !== 'undefined' && appSettings && appSettings.motionEnabled === false) return false;
      if (typeof appSettings !== 'undefined'
          && appSettings
          && appSettings.preferences
          && appSettings.preferences.appearance
          && appSettings.preferences.appearance.motionIntensity === 'off') return false;
    } catch (_) { /* tolerate hosts that do not expose the preference binding */ }

    return true;
  }

  function visibleAnchor(rawRect) {
    if (!rawRect || typeof rawRect !== 'object') return null;
    const left = rawRect.left;
    const top = rawRect.top;
    const width = rawRect.width;
    const height = rawRect.height;
    if (![left, top, width, height].every(Number.isFinite)) return null;
    if (width < 8 || height < 8 || width > 10000 || height > 10000) return null;
    if (Math.abs(left) > 100000 || Math.abs(top) > 100000) return null;

    const viewportWidth = Math.max(0, document.documentElement && document.documentElement.clientWidth, window.innerWidth || 0);
    const viewportHeight = Math.max(0, document.documentElement && document.documentElement.clientHeight, window.innerHeight || 0);
    if (!viewportWidth || !viewportHeight) return null;

    const right = left + width;
    const bottom = top + height;
    if (!Number.isFinite(right) || !Number.isFinite(bottom)) return null;

    const visibleLeft = Math.max(0, left);
    const visibleTop = Math.max(0, top);
    const visibleRight = Math.min(viewportWidth, right);
    const visibleBottom = Math.min(viewportHeight, bottom);
    if (visibleRight - visibleLeft < 8 || visibleBottom - visibleTop < 8) return null;

    return {
      x: (visibleLeft + visibleRight) / 2,
      y: (visibleTop + visibleBottom) / 2
    };
  }

  function removeEffect(effect) {
    if (!effect) return;
    const timer = activeEffects.get(effect);
    if (timer !== undefined) window.clearTimeout(timer);
    activeEffects.delete(effect);
    if (effect.parentNode) effect.parentNode.removeChild(effect);
  }

  function clearEffects() {
    Array.from(activeEffects.keys()).forEach(removeEffect);
  }

  function makeEffect(anchor) {
    const effect = document.createElement('div');
    effect.className = 'sutra-task-completion-effect';
    effect.setAttribute('aria-hidden', 'true');
    const origin = document.createElement('div');
    origin.className = 'sutra-task-completion-effect__origin';
    origin.style.left = `${anchor.x}px`;
    origin.style.top = `${anchor.y}px`;
    effect.appendChild(origin);

    PIECES.forEach((design, index) => {
      const piece = document.createElement('span');
      piece.className = `sutra-task-completion-effect__piece sutra-task-completion-effect__piece--${design.kind}`;
      piece.style.left = `${design.x}px`;
      piece.style.top = `${design.y}px`;
      piece.style.width = `${design.width}px`;
      piece.style.height = `${design.height}px`;
      piece.style.setProperty('--task-effect-dx', `${design.dx}px`);
      piece.style.setProperty('--task-effect-dy', `${design.dy}px`);
      piece.style.setProperty('--task-effect-rotate', `${design.rotate}deg`);
      piece.style.setProperty('--task-effect-delay', `${design.delay}ms`);
      piece.style.setProperty('--task-effect-duration', `${design.duration}ms`);
      piece.style.setProperty('--task-effect-color', COLORS[index % COLORS.length]);
      origin.appendChild(piece);
    });

    return effect;
  }

  function onTaskCompleted(event) {
    const detail = event && event.detail;
    if (!detail || typeof detail.taskId !== 'string' || !detail.taskId.trim()) return;
    if (!document.body || !motionIsAllowed()) return;

    const anchor = visibleAnchor(detail.rect);
    if (!anchor) return;

    while (activeEffects.size >= MAX_ACTIVE_EFFECTS) {
      removeEffect(activeEffects.keys().next().value);
    }

    const effect = makeEffect(anchor);
    document.body.appendChild(effect);
    const timer = window.setTimeout(() => removeEffect(effect), FALLBACK_LIFETIME_MS);
    activeEffects.set(effect, timer);
  }

  document.addEventListener('sutra:task-completed', onTaskCompleted);
  window.addEventListener('noteflow:view-changed', clearEffects);
  window.addEventListener('pagehide', clearEffects);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || document.visibilityState === 'hidden') clearEffects();
  });
})();
