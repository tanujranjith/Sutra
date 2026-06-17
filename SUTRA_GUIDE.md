# Sutra Guidebook

A friendly, hands-on walkthrough of your **first session** with Sutra - from opening the app to saving your first backup. No required account, no setup files, local by default. Optional Google Drive sync is off unless you enable it.

> Prefer to be taught inside the app? Open the **Help & Docs** page at the top of your sidebar, or run the interactive overlay tour from `Settings -> Advanced`. This guide mirrors and expands them.

---

## Contents

1. [Open the app](#1-open-the-app)
2. [Sutra Setup (onboarding)](#2-sutra-setup-onboarding)
3. [Get your bearings: Today & the Daily Thread](#3-get-your-bearings-today--the-daily-thread)
4. [Capture your first note](#4-capture-your-first-note)
5. [Add homework (and import from your school portal)](#5-add-homework-and-import-from-your-school-portal)
6. [Set up AP Study](#6-set-up-ap-study)
7. [Start a Review deck](#7-start-a-review-deck)
8. [Plan time on the Timeline](#8-plan-time-on-the-timeline)
9. [Protect a block of time with Focus](#9-protect-a-block-of-time-with-focus)
10. [Meet the Sutra Assistant](#10-meet-the-sutra-assistant)
11. [Make it yours: themes & customization](#11-make-it-yours-themes--customization)
12. [Export a `.sutra` backup](#12-export-a-sutra-backup)
13. [Your daily three-minute loop](#13-your-daily-three-minute-loop)

---

## 1. Open the app

Sutra is a single static web app - no installer, no account, no build step.

- **Easiest:** double-click **`Sutra.html`**. It opens in your default browser.
- **From the landing page:** double-click **`HomePage.html`** (or `index.html`, which redirects there) and click **Start your session**.
- **Optional local server** (nicer for some image-upload paths):

  ```bash
  python -m http.server 5173
  # then visit http://localhost:5173/Sutra.html
  ```

On first launch, Sutra creates a welcome page and a built-in **Help & Docs** page in your sidebar. Everything you do from here lives on this device only.

---

## 2. Sutra Setup (onboarding)

The first time you open Sutra, the **Sutra Setup** wizard appears. It's optional, and it's quick. It offers to:

1. Add your **classes**.
2. Add your **AP subjects**.
3. Decide whether to turn on **College** tools.
4. Pick a **Sutra Mode** (which views are front-and-center).
5. Export an immediate **`.sutra`** backup.
6. Drop you on **Today**.

Skip any step you like - you can finish later. To run it again anytime: `Settings -> Advanced -> Restart Sutra Setup`.

> Everything here is local by default. Nothing leaves your browser unless you export it, send it to an AI provider, or explicitly enable encrypted Google Drive sync. Your completed setup is included in your `.sutra` backups.

**Choosing a Sutra Mode:** modes promote the views you actually use and tuck the rest into a *More* menu (they never delete anything).

| Mode | Best for |
| --- | --- |
| **All Tools** | "Show me everything." |
| **Student** | Classes, AP, college, life. |
| **AP Crunch** | The days before an AP exam. |
| **College Apps** | Senior-fall application season. |
| **Writing** | Notes-first, with planning aids. |
| **Life** | Habits, sleep, journal, spending, goals. |
| **Projects & Work** | A full operations dashboard. |

If you're a student, **Student** is a great default.

---

## 3. Get your bearings: Today & the Daily Thread

**Today** is your home base. Three things to notice:

- **Daily Thread** - a summary card showing overdue / today / tomorrow / this-week counts, plus one **Next Step**: the single most useful thing to do right now, computed from your own data. You can run it directly.
- **Shape My Day** - sequences the priorities you've committed against your calendar. Open the *Recommended sequence* disclosure to see the plan, and apply it to the Timeline if you like it.
- **Deadline Radar** - opens a modal that gathers *every* deadline (tasks, homework, AP exams, college, timeline blocks, work) grouped by *overdue / today / tomorrow / this week / later*. Each row has **Open** and **Schedule this**.

Add your first task right here: click **+ Task**, fill in a title (and optionally a due date, priority, and a linked note), and save. Commit a couple of priorities with one click, and the bar at the top of the panel reflects what you've committed.

Want to add a habit? Type a name in the *Add a habit...* input under the **Habits** card and press Enter. Tap it each day; streaks and weekly consistency track themselves.

> The fastest way around the whole app is the **Command Palette**: press **Ctrl/Cmd+K** (anywhere outside an editor) and start typing.

---

## 4. Capture your first note

Open **Notes** (or press `+ New Page` in the sidebar).

1. Click **+ New Page** and give it a title. Use `::` to nest - e.g. `Bio::Unit 3::Cell Energy`.
2. Pick a **template** (Blank, Study Notes, Daily Journal, Weekly Review, and more). Some templates can seed starter tasks - toggle that in the preview.
3. Click **Create**, and start writing.

The editor gives you:

- A **toolbar** (bold, italic, underline, strikethrough, H1-H3, lists, quote, code).
- An **insert** menu (link, table, image, video, audio, embed, checklist, collapsible section, page link).
- A **slash menu** - type `/` and pick a block. Type to filter.
- `Tab` / `Shift+Tab` to indent and outdent list items, and a live **word count**.
- **Autosave** - your note saves continuously; you don't need to think about it.

A few first-session things worth trying:

- **Page Mode** - a clean, document-style presentation of the note surface.
- **Document Background** - click the *Document Background* button in the toolbar to set a per-page background image (`.png`, `.jpg`, `.jpeg`, `.webp`, up to 6 MB). Tune the **Background Blur** (0-32 px) and **Dim Background** (0-80%) sliders so your text stays readable. The background rides along in your `.sutra` backup, and a *locked* page never shows its background behind the PIN screen.
- **Handwriting** - insert a handwriting block to sketch a diagram with your mouse, trackpad, touch, or stylus. Strokes are stored as vectors, so they stay crisp. (Full guide: [`docs/features/HANDWRITING_AND_DRAWING.md`](docs/features/HANDWRITING_AND_DRAWING.md).)
- **Split view** - open a second pane beside your note and use a preset like *Note + Assignment* or *Essay + Research*.

---

## 5. Add homework (and import from your school portal)

Open **Homework**. On first visit you'll see a *Set Up Your Classes* overlay - add your **classes** (chips) and any **activities** (chips), then **Save**. Each class becomes a **Subjects** lane; activities go in the **Activities** lane.

Add an assignment from the *+* control inside a lane. Each one carries a title, due date, due time, priority, difficulty, notes, and a done state. Watch the status chips: *no date / upcoming / due soon (<= 48 h) / overdue*.

### Import from School Portal

Already have your assignments listed in a school portal? Don't retype them.

1. Click **Import from School Portal** in the Homework header.
2. Paste a block of lines copied from the portal (pipe-, tab-, or dash-separated all work).
3. Sutra **previews** each parsed row. Correct any title / class / date / time / difficulty / priority before saving.
4. Save - your assignments land in the right lanes.

Each assignment's **...** menu offers **Schedule this** (drop a prep block on the Timeline) and **Open class dashboard**. By default, homework also shows up in your Today task feed (toggle in `Settings -> Tasks`).

---

## 6. Set up AP Study

Open **AP Study**.

1. Press **+ Add subject**. Fill in the subject, exam date/time, target score, confidence, teacher, current unit, optional notes, and optionally **link a Homework class**.
2. In **Units**, add your units and topics. Flag any weak ones as you go.
3. In **Sessions**, schedule a study session by type (review, FRQ, MCQ, practice test, weak area, mixed).
4. In **Practice**, log score / max score / minutes / confidence-after for each run.
5. Check **Analytics** for coverage, weak-area trends, your study streak, and the exam countdown.

At the top of the workspace, the **AP Battle Plan** card auto-picks your soonest exam, weighs weak units, recent practice, confidence, and days-left, and recommends a concrete next session - with reasoning. From the card you can create a real AP session, open a linked unit note, log a task, or schedule a prep block.

> On the AP Study view, `Ctrl/Cmd+K` is reserved for **Add subject** rather than the Command Palette.

When you want to drill the material, the **Testing Hub** and **Cram** surfaces help you pin exams and run focused last-minute sessions.

---

## 7. Start a Review deck

**Review** is what keeps the material from leaking out between study sessions - spaced repetition and active recall, all local.

1. Open **Review** (top tab, or `Ctrl/Cmd+K -> Start review session`).
2. Hit **+ Deck** and name it (e.g. *"AP Bio * Unit 3"*).
3. In **Create review card**, pick the deck, write a prompt and an answer, optionally add tags, and pick a **source** - a note, an AP class, or a homework class.
4. Save. The card is due immediately and lands in the **Due queue**.

Run a session: **Start review session**, reveal the answer when ready, and grade **Again / Hard / Good / Easy**. Sutra reschedules each card with a local SM-2-lite algorithm - no AI, no backend. Try the other modes too: **Learn**, **Write**, **Test**, and **Match**.

A *Review due* card will start appearing on **Today** whenever cards are waiting.

---

## 8. Plan time on the Timeline

Open **Timeline** and pick a view - **Month**, **Planner**, **Week**, **Day**, or **Year**.

1. Click an empty slot (or **+ Block**) to open the block modal.
2. Fill in name, start/end, category, color, recurrence (none / daily / weekdays / weekly / monthly), and an optional reference URL.
3. Save.

Active blocks light up the **Current Block** card with live progress, and the time-of-day surface tint shifts for morning / afternoon / evening / night.

You don't have to build the day by hand: nearly every dated row across Sutra - homework, AP prep, college deadlines, Deadline Radar items - has a **Schedule this** action that drops a Timeline block for you. To bring in an outside calendar, use ICS import from `Settings -> Advanced`.

---

## 9. Protect a block of time with Focus

The **Focus Timer** lives in the sidebar. Pick a quick preset (15 / 25 / 50 min) or set a custom duration, choose a ringtone and volume, and press play. A *finish at* preview shows when you'll be done, and a completion popup keeps the alarm going until you dismiss it.

Below the presets is a **Focus Templates** strip - reusable rituals like **Deep Work**, **AP Review**, **Homework Sprint**, **Reading Block**, **Project Build**, and **Review Focus**. Click a chip to load its duration and link the session to a subject, project, note, or review deck.

Separately, **Focus Mode** (`Alt+Shift+F`) strips the chrome away from the writing surface so it's just you and the words. Toggle it off the same way.

---

## 10. Meet the Sutra Assistant

The **Sutra Assistant** is the assistant icon button at the bottom-right. It's **optional** and uses **your own API key** - Sutra runs no AI servers and proxies nothing.

### Connect a provider

1. Click the Sutra Assistant icon to open the panel.
2. Pick a provider: OpenAI, Anthropic Claude, Google Gemini, Groq, OpenRouter, or a Custom OpenAI-Compatible Endpoint.
3. Enter the **exact Model ID** for that provider (a wrong ID fails at the provider, not in Sutra).
4. Open `Settings -> Assistant` (or the panel's key field), paste your key, and save. **Keys live in sessionStorage for this browser session only and are never exported.**

### What it knows, and what it can do

Right under the panel header you'll see the **Powered by Sutra Intelligence** badge - *"Local signals from your workspace."* That's the local layer reading your overdue work, workload, schedule conflicts, weak areas, review backlog, and next steps to ground the assistant. It does not call any server itself.

You decide how much it sees with **Workspace Access**: *Current Screen Only*, *Current Area*, or *Full Workspace Context*. Choose **Single Request** or **Conversation Memory** for whether it remembers the thread.

When the assistant wants to *change* something - add a task, schedule a block, create a deck - it never does it silently. It renders **Apply / Decline** cards (and *Apply all* for multi-action replies), and **Confirm Before Applying Changes** keeps you in control. Every applied action is logged under **Assistant Activity** with **undo**, and anything it creates is saved and backed up exactly like work you did by hand.

Try asking it to *plan my day*, *summarize this note*, or *make review cards from this note*.

---

## 11. Make it yours: themes & customization

Open the **theme** panel from the top tab strip.

- **Pick a theme** - Default, Dark, Botanical, Editorial, Luxury, Sepia, Ocean, Sunrise, Graphite, Aurora, Rosewater, macOS 26, Windows 11, ChromeOS, Ubuntu, GitHub, Spotify, Netflix, Slack, Dune.
- **Apply mode** - current page / all pages / a custom subset (yes, per-page theming).
- **Custom themes** - build your own with a saturation/value canvas, hue slider, and HEX entry; import/export as JSON.
- **Typography & motion** - choose a font family, size, and line height, and set motion to full / reduced / off (it also honors your OS *prefers-reduced-motion*).

Power users can go further under `Settings -> Customization`:

- **CSS Overrides** - named CSS snippets with live preview, validation, reorder, and import/export. Custom CSS applies after themes and survives refresh.
- **Plugins** - install local plugin bundles. They run **sandboxed**, install **disabled**, and are **reviewed before they run**.

If a snippet or plugin ever misbehaves, load **Safe Mode** - add `?sutraSafeMode=1` to the URL, hold **Shift** while the app loads, or use the in-app Recovery button. Safe Mode skips all custom CSS and plugins and **never deletes anything**.

---

## 12. Export a `.sutra` backup

This is the single most important habit. Optional Google Drive sync can keep an encrypted cloud snapshot, but a `.sutra` backup you control is still your safety net.

`Settings -> Data` -> **Encrypted Workspace Backup (.sutra)**. Sutra asks for a backup password, then downloads a file named like `sutra_workspace_2026-06-05_21-18-42.sutra` (your local date and time) containing your notes, tasks, timeline, settings, themes, homework, AP, college, life, and work data - including document backgrounds and inline images. You can also export plain **Workspace JSON** for raw interchange; JSON is unencrypted.

To restore, import the file from the same screen. Sutra always writes a **pre-import safety snapshot** first, so if an import looks wrong you can roll back from `Settings -> Data -> Storage Health`.

A few things to know:

- Old unencrypted **`.sutra`** and **`.atelier`** backups still import - nothing is broken.
- **API keys are never in the backup.** Re-enter them after restoring on a new device.
- Sutra cannot recover a forgotten `.sutra` password.
- Optional Google Drive sync lives under **Settings -> Data -> Google Drive Sync**. It is off by default, uses only Drive app-data access, and syncs only while Sutra is open, online, unlocked, and authorized.

> Make a backup now, while your workspace is small. Then make one before any big change.
---

## 13. Your daily three-minute loop

Once you're set up, the whole app collapses into a short daily rhythm:

1. Open **Today** - scan the **Daily Thread** and the *Review due* card.
2. Run the **Next Step**, or start a review session.
3. Commit 1-3 priorities.
4. Run **Shape My Day** and push it to the Timeline.
5. Pick a **Focus Template** and start the timer.

That's the core of Sutra. Everything else - College, Life, Projects & Work, the Assistant, customization - layers on top of those five steps whenever you need it.

---

## Where to next

- The in-app **Help & Docs** page (top of your sidebar) covers the same ground in shorter form, with deep links inside the app.
- The full feature inventory and architecture are in the [README](README.md).
- Moving from NoteFlow Atelier? See [Rebrand & Compatibility](docs/features/REBRAND_AND_COMPATIBILITY.md) - your data loads automatically.

Welcome to Sutra. One workspace, every thread.
