/* Post-load Help & Docs reconciliation.
 *
 * The generated Help page lives in the classic app runtime. Keep this small
 * compatibility layer separate so documentation can be refreshed without
 * touching the large core-runtime source or changing its load-order contract.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined' || typeof buildHelpPageContentV2 !== 'function') return;

    var original = buildHelpPageContentV2;
    var CURRENT_CONTRACTS = `
<h2 id="current-workspace-contracts">Current Workspace Contracts</h2>
<p>This section reflects the current October 2026 workspace behavior. Advanced features remain available, but the daily loop stays focused on the next useful action.</p>
<ul>
  <li><strong>Daily loop:</strong> Home is the command center; Capture previews tasks, homework, notes, reminders, study sessions, and Timeline blocks; To-do combines Homework and General tasks in one canonical list; Create, Timeline, Review, Focus, and Data remain first-class daily surfaces.</li>
  <li><strong>To-do:</strong> choose All, Homework, or General. Add task creates a general task without requiring a class; Add homework keeps class work separate. Summary counts follow the selected category. Completion uses the existing action and shows a brief decorative effect after a confirmed local save when motion is enabled; reopening remains available.</li>
  <li><strong>Navigation:</strong> desktop More and phone All sections are derived from canonical tabs. Create owns the contextual page tree; other workspaces use the full canvas by default. Hidden feature packs keep their data.</li>
  <li><strong>Shortcuts:</strong> website and page shortcuts always appear in the Create sidebar. Add or edit a name, destination, and icon from Shortcuts or Settings → Web shortcuts. Existing shortcuts previously saved for the tab switcher appear in the sidebar too.</li>
  <li><strong>Page tags:</strong> use Add tag below a page title. Enter or clicking away saves a tag; Escape cancels. Tag names match without case-sensitive duplicates. Choose a tag in the Create sidebar to filter pages; choose All to clear it. The filter stays active when the page tree refreshes.</li>
  <li><strong>Rich links:</strong> Insert link or /link lets you name a web address. Click a link, including a freshly pasted URL, to show its destination and Copy, Edit, or Remove controls; opening the website is explicit. Remove keeps the visible text. Optional title/thumbnail lookup requires starting the local helper and choosing Fetch title. Lookup is off by default.</li>
  <li><strong>Sutra Assistant writing help:</strong> use /ai, the toolbar, or a selected passage. Review the exact context and instruction before Generate; only that text goes to your configured provider after its send confirmation. Review or edit the returned plain-text draft, then Insert or Replace selected text. Cancel preserves the note and slash query. <strong>Sutra Assistant general help</strong> opens the regular mini panel without sending a message or clearing your draft.</li>
  <li><strong>Authored timelines:</strong> Insert timeline builds a custom vertical or horizontal sequence in Notes, Canvas, or Slides. Timing labels are your display text and create no schedule events. Edit the chosen timeline or undo through its editor. HTML Pages have no timeline actions; existing timeline content still renders and exports. Sheets and folders have no timeline insertion action; PDFs can create a separate linked timeline note.</li>
  <li><strong>Icons:</strong> change a page icon from its Create sidebar icon or page actions, including Help & Docs. Help keeps its built-in content and protection. In To-do → By Class, class headers and empty-class rows expose an icon picker; activities use the same picker. Choose a preset or enter one emoji. Help icons stay local to each device and travel in backups; course icons use the existing portable course record.</li>
  <li><strong>Home:</strong> calm, study, everything, and custom presets can reorder, hide, and resize existing cards. The phone Home shell stays compact and touch-friendly.</li>
  <li><strong>Focus timer:</strong> an active or paused timer follows you in a compact player. Pause or resume, open full Focus, or dismiss it with X. It stays hidden until you use Home’s Miniplayer control. Miniplayer opens a small always-on-top browser window where supported, with the same timer and a scrollable list of upcoming tasks. Resetting or finishing clears the in-app player. The player yields to dialogs, All sections, full Focus, and the phone keyboard.</li>
  <li><strong>Create:</strong> choose Notes, Canvas, Slides, Sheets, HTML Page, or Folder before setting a title and location. Selecting a type prepares the dialog; use its Create button to finish. Slides offers title or blank starters, Sheets offers a blank workbook or study tracker, and HTML offers simple or empty source.</li>
  <li><strong>Canvas:</strong> pan/zoom, minimap, selection, drawing, shapes, sticky notes, connectors, groups, tables, layout tools, locking, and local export use the owning page save path.</li>
  <li><strong>Folders:</strong> open a folder title to browse its immediate children and create any supported page type inside it. The tree chevron still expands or collapses its descendants. Child creation uses the existing title hierarchy and parent confirmation.</li>
  <li><strong>Slides:</strong> click to select and drag an object to move it; double-click or press Enter to edit text, then Escape to select again. Resize with the eight handles or exact inspector percentages. Selected objects have Edit, Duplicate, Delete, and Arrange tools. Undo restores moves and text edits. Rename slides, review layout replacements, and use the collapsible Design and speaker notes panels. Present shows the deck; Print / PDF is a simple text print view that omits images.</li>
  <li><strong>Sheets:</strong> common actions stay visible; Format, Data, Structure, and File hold additional tools. The formula area shows the selected range and result. Enter or Apply commits; Escape or Cancel discards the draft. Moving to another control can also commit. Rename sheets inline; recognized formula references follow the renamed sheet.</li>
  <li><strong>HTML Pages:</strong> desktop offers Code, Split, and Preview; phones offer Code and Preview tabs. Insert a section, checklist, callout, or authored timeline; import or export local HTML up to 4 MB. Undo/Redo includes typing and timeline edits within bounded session history. Preview status and save status remain separate. Authored scripts run in an isolated offline sandbox with network and external actions blocked.</li>
  <li><strong>PDFs:</strong> when the PDF workspace preview is enabled, a PDF opens as a contextual offline reader/editor with search, selectable text, forms, Sutra-owned annotations, page organization, and explicit original/clean/annotated exports. Create attaches the exact original by default; Convert to Note is a separate local text-extraction action.</li>
  <li><strong>Timeline:</strong> Month, Planner, Week, and Day views; keyboard calendar controls; local-preview, source-scoped ICS import; no reminders for imported calendar events; and atomic Push time with preview and undo.</li>
  <li><strong>Phone Week:</strong> choose a day in the date strip to see its agenda. Open a block to edit it, or add one on an empty day. Desktop keeps its hour grid and existing scheduling controls.</li>
  <li><strong>Assistant:</strong> OpenAI, Anthropic, Gemini, Groq, OpenRouter, NVIDIA NIM, Mistral AI, Together AI, DeepSeek, xAI, Perplexity, and validated OpenAI-compatible local endpoints are available. Keys and local endpoint settings stay device-local. Canvas/Slides edits are bounded, approval-based, and undoable.</li>
  <li><strong>Backup and Sync:</strong> encrypted <code>.sutra</code> remains the recommended backup. Optional unencrypted <code>.sutra</code> export is explicit and excludes Assistant chats unless opted in. Sutra Sync Beta is off by default, separate from backups, and requires explicit setup plus a passphrase.</li>
  <li><strong>Backup progress:</strong> confirmed manual backups show “Backing up…” with the current stage. Keep Sutra open until it finishes. When a download starts, check your browser downloads; automatic backups and Sync stay in the background.</li>
  <li><strong>Safety:</strong> duress deletion is an optional irreversible locked-note action with honest offline-device and downloaded-backup limits. Generic network failures never authorize Sync wipe.</li>
  <li><strong>Mobile:</strong> More contains the current local save status, Save locally, Export, Import, Data & Backup, Focus timer, and Report a problem. These actions use the same controls as desktop. All sections scrolls as one sheet; the phone writing area no longer has a floating save strip or report button over it.</li>
</ul>
<p>For implementation and privacy contracts, use the repository guides under <code>docs/features/</code>, <code>docs/privacy-security/</code>, and <code>docs/architecture/</code>.</p>
<p><button type="button" class="help-anchor-btn help-anchor-top-btn" data-editor-anchor="top">Back to top</button></p>
`;

    buildHelpPageContentV2 = function () {
        var html = original();
        var tocMarker = '<h2 id="toc">Table of Contents</h2>\n<ol>';
        html = html.replace(tocMarker, tocMarker + '<li><button type="button" class="help-anchor-btn" data-editor-anchor="current-workspace-contracts">Current workspace contracts</button></li>');
        var footerMarker = '<hr style="border: none; border-top: 2px solid var(--border); margin: 24px 0;">\n<p style="text-align: center;';
        html = html.replace(footerMarker, CURRENT_CONTRACTS + '\n<hr style="border: none; border-top: 2px solid var(--border); margin: 24px 0;">\n<p style="text-align: center;');
        return html;
    };

    try {
        if (typeof window.ensureHelpPagesForAllSpaces === 'function') window.ensureHelpPagesForAllSpaces();
        if (typeof window.persistAppData === 'function') window.persistAppData('help-docs-refresh');
    } catch (error) {
        if (typeof window.reportError === 'function') window.reportError(error, { source: 'help-docs-refresh' });
    }
}());
