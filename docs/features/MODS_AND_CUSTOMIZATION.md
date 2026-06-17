# Customization

> **See [docs/CSS_MODS_GUIDE.md](CSS_MODS_GUIDE.md) for the full guide.** It is the
> complete CSS reference — cascade order, design tokens, stable selectors, ~18 safe
> copy-paste examples, and recovery — so you can customize Sutra without reading the
> source.

Sutra ships with a calm, beginner-friendly appearance system (themes, the custom
theme builder, fonts, motion, density). **Customization** is the opt-in
power-user layer on top of it — found under **Settings ▸ Customization**.

It has three sections: **CSS Overrides**, **Plugins**, and **Recovery & Developer
Tools**, plus two master switches (*Enable mods*, *Apply custom CSS*).

> Advanced customization can change how Sutra looks and behaves. Install plugins
> only from sources you trust. **Safe Mode** lets you recover without deleting your
> workspace.

Everything here is **local-first**: nothing is uploaded, there is no remote
marketplace, and all customization travels inside your workspace backup.

---

## CSS Overrides

Write CSS that is injected **after** the built-in and theme styles, so your rules
win — and they are kept **separate** from theme definitions, so they survive theme
switches and refreshes.

### Snippets

- **Add snippet** / **Example** — create a new snippet (the Example is a safe,
  disabled "Compact sidebar" demo).
- **Rename** — edit the name field at the top of a snippet card.
- **Edit** — type in the monospace editor. <kbd>Tab</kbd> inserts indentation.
  An *Unsaved changes* indicator and a live brace-balance check are shown.
- **Enable / disable** — the per-snippet switch. Disabled snippets are removed from
  the page immediately.
- **Preview / Revert** — preview applies the current draft live; Revert restores the
  last saved CSS.
- **Save** — commits the draft (blocked while the brace check fails).
- **Duplicate**, **Move ↑ / ↓** — duplicate or reorder. Order controls the **cascade**
  (later snippets win).
- **Export .css** — download one snippet as a `.css` file.
- **Export all** — download the whole CSS set as portable JSON.
- **Import…** — import a `.css` file (added as a new, disabled snippet) or a
  previously exported CSS-customization JSON.
- **Reset all CSS customization** — removes every snippet. Themes, notes, tasks, and
  plugins are untouched.

### Cascade order

```
built-in styles  →  active theme  →  user CSS snippet #0  →  #1  →  #2 …
```

Each enabled snippet is injected as its own `<style id="atelier-user-css-snippet-…">`
element appended after the `atelier-user-css` anchor, in `order`. Snippet IDs are
generated — your snippet **names are never used as DOM IDs**. (The `atelier-user-css`
anchor is an internal code identifier retained for compatibility.)

### Theme separation

Theme changes only toggle `body[data-theme]` attributes and inline CSS variables;
they never touch your snippet `<style>` elements. Write theme-agnostic CSS (prefer
Sutra's CSS variables) so your overrides look right across themes.

---

## Plugins

Sutra plugins are **local JSON bundles** — exported as **`.sutra-plugin`** (the
legacy **`.atelier-plugin`** extension still imports). There is no remote loader and
no marketplace.

- **Declarative** plugins contribute data — Command Palette commands, sidebar items,
  note templates, quick actions, styles — that Sutra renders itself.
- **Runtime** plugins additionally carry code that runs **only inside a sandboxed
  iframe** (see [PLUGIN_SDK.md](PLUGIN_SDK.md)).

### Installing

1. **Import plugin…** and choose a `.sutra-plugin` (or legacy `.atelier-plugin`) file.
2. A review dialog shows the name, version, author, description, requested
   **permissions**, contributed features, and whether runtime code is present.
3. Confirm. The plugin installs **disabled** — enable it from its card when ready.

Invalid bundles are rejected with a readable error and never crash the workspace.

> Plugins install **disabled** and are **reviewed before they run** — a runtime
> plugin cannot execute until you confirm. See [PLUGIN_SDK.md](PLUGIN_SDK.md).

### Managing

Each plugin card shows its name/version/author/description, enabled state,
permissions, a contribution summary, any error, a **View manifest** disclosure, and
actions: **Enable/disable**, **Export**, **Clear data**, **Uninstall**, and
**Review & trust** (when re-review is required). Disabling or uninstalling removes
the plugin's commands, styles, and runtime immediately.

### Permissions

Plugins declare an allowlisted set of permissions; every sandbox operation is
checked against them at call time. See the full list and risk levels in
[PLUGIN_SDK.md](PLUGIN_SDK.md).

---

## Backup, restore & re-review

- CSS snippets and installed plugin bundles travel inside **JSON backups** and
  **`.sutra` export/import** (and legacy **`.atelier`** import) — they live in
  `settings.customization`.
- **Secrets are never exported** — API keys and tokens are stripped from shared
  exports as usual.
- For safety, **every runtime-capable plugin is restored DISABLED with
  `reviewRequired: true`** on a new device or restored workspace. Plugin code never
  auto-runs after a restore; you must explicitly **Review & trust** and then enable
  it again.
- Imported custom CSS is preserved but can be bypassed by **Safe Mode**, so a
  hostile or broken snippet can't lock you out.

---

## Safe Mode & recovery

If a snippet hides part of the interface or a plugin misbehaves, recover without
losing data:

- **Disable all mods** — master off switch (keeps your snippets and bundles).
- **Reload in Safe Mode** — restarts with all custom CSS and plugins skipped.
- **`?sutraSafeMode=1`** — add this to the URL to launch in Safe Mode directly
  (canonical); the legacy **`?atelierSafeMode=1`** still works too.
- **Hold <kbd>Shift</kbd> while the app loads** — also triggers Safe Mode.

In Safe Mode a banner appears at the bottom of the screen with **Disable all mods**
and **Reload normally**. Safe Mode **never deletes** customization data — it only
skips applying it for that session.

When to use it: anytime custom CSS makes the UI unusable, a plugin throws during
startup, or you just want to confirm whether a problem is caused by a mod.
