/* Settings presentation only. Core owns preferences, staging, search and save. */
(function () {
    'use strict';

    function initializeSettingsPresentation() {
        const root = document.getElementById('view-settings');
        const surface = document.getElementById('settingsPreviewSurface');
        const search = document.getElementById('settingsSearchInput');
        if (!root || !surface || !search) return;

        const groups = Array.from(root.querySelectorAll('.cc-appearance-details'));
        const beforeSearch = new Map();
        const titleCase = value => String(value || '').replace(/^./, letter => letter.toUpperCase());
        const summary = document.getElementById('settingsSurfaceSummary');
        function updateSurfaceSummary() {
            if (summary) summary.textContent = `${titleCase(surface.dataset.cardStyle)} · ${titleCase(surface.dataset.cornerStyle)} · ${titleCase(surface.dataset.shadow)} shadow`;
        }
        new MutationObserver(updateSurfaceSummary).observe(surface, { attributes: true });
        updateSurfaceSummary();

        // Search remains core-owned. Open matching native disclosures so its
        // existing results cannot become hidden behind a closed details element.
        function revealSearchResults() {
            const searching = !!search.value.trim();
            groups.forEach(group => {
                if (searching) {
                    if (!beforeSearch.has(group)) beforeSearch.set(group, group.open);
                    group.open = Array.from(group.querySelectorAll('[data-setting-item]')).some(row => row.style.display !== 'none');
                } else if (beforeSearch.has(group)) {
                    group.open = beforeSearch.get(group);
                    beforeSearch.delete(group);
                }
            });
        }
        const main = root.querySelector('.cc-main');
        new MutationObserver(revealSearchResults).observe(main, {
            attributes: true, subtree: true, attributeFilter: ['style', 'class']
        });
        search.addEventListener('input', () => queueMicrotask(revealSearchResults));

        // These samples are copied from the existing preset cards, including
        // their real palette colors. Choosing a theme still uses the theme panel
        // and its established immediate-apply workflow, separate from staging.
        const palette = document.getElementById('settingsThemePalette');
        const current = document.getElementById('settingsThemeCurrent');
        const panel = document.getElementById('themePanel');
        if (!palette || !current || !panel) return;
        const samples = ['dark', 'default', 'heritage', 'botanical', 'ocean'];
        function updateThemeSamples() {
            const selected = panel.querySelector('.preset-card.active');
            const selectedKey = selected ? selected.dataset.theme : document.body.dataset.themeKey;
            current.textContent = selected?.querySelector('.preset-name')?.textContent.trim() || 'Custom theme';
            palette.replaceChildren();
            samples.forEach(key => {
                const card = panel.querySelector(`.preset-card[data-theme="${key}"]`);
                const color = card?.querySelector('.preset-color');
                if (!card || !color) return;
                const sample = document.createElement('span');
                sample.className = 'cc-theme-swatch';
                sample.style.backgroundColor = color.style.backgroundColor;
                sample.classList.toggle('is-selected', selectedKey === key);
                sample.title = card.querySelector('.preset-name')?.textContent.trim() || key;
                palette.appendChild(sample);
            });
        }
        new MutationObserver(updateThemeSamples).observe(panel, {
            attributes: true, subtree: true, attributeFilter: ['class'],
            childList: true, characterData: true
        });
        updateThemeSamples();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSettingsPresentation, { once: true });
    } else {
        initializeSettingsPresentation();
    }
})();
