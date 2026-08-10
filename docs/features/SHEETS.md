# Sutra Sheets

Sutra Sheets is a local-first spreadsheet surface inside a normal Notes page.
It is for grade trackers, lab tables, budgets, study logs, and compact class data—not a hosted collaboration product. Create a Sheets page from Notes and the workbook is stored at `page.spreadsheet`; no account, network request, or second database is required.

## Durable model and privacy

Workbooks are versioned (`version: 1`) and contain ordered sheets, stable row and column IDs, sparse cells, deduplicated styles, merge/filter/freeze metadata, and named-range space. A cell's durable identity is `rowId:columnId`; A1 is derived from current row and column order. Empty cells are never stored.

Selection, clipboard, scroll position, formula-bar edit state, and undo/redo are session-only. Ordinary edits mutate the owning page, update `updatedAt`, and use `flowAtelier.persistAppData()`. This gives the workbook normal reload, page duplication, encrypted `.sutra` backup/restore, and JSON recovery parity.

Like every content-bearing Notes mode, Sheets checks the canonical `isPageContentAuthorized` boundary before rendering or exposing a workbook. Locked workbooks are not mounted, so their cells and formulas cannot enter the grid, formula bar, clipboard, or the `window.SutraSheets` bridge.

## Engine

`src/features/workspace/sheets-engine.js` is DOM-independent and is safe to exercise from Node tests. It normalizes the sparse model, converts A1 notation, parses formulas without `eval`, evaluates formulas deterministically, detects circular references, supports cross-sheet references, and translates relative, absolute, and mixed references for fill/copy behavior.

The initial formula library covers arithmetic, `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, rounding, common logical/text/date functions, `COUNTIF`, `SUMIF`, `AVERAGEIF`, and a basic `VLOOKUP` path. It reports `#REF!`, `#VALUE!`, `#DIV/0!`, `#NAME?`, `#N/A`, and `#CYCLE!` rather than executing arbitrary code.

## Editor and limitations

The native editor virtualizes the visible grid and a small overscan region; it does not create thousands of off-screen cells. It supports direct/formula-bar editing, arrows, Shift selection, Tab, Enter, Delete, F2, command copy/paste, session undo/redo, row/column insertion, basic bold formatting, frozen top row, and adding, switching, and renaming sheets. Clipboard transport is TSV, so regular tabular paste from Excel or Google Sheets works offline.

This is an incremental V1. Advanced conditional formatting, charts, data validation, CSV/XLSX import/export, structural formula rewrites, and Assistant mutations are not exposed yet. Sutra Sync carries the page record using its normal field-aware page merge path: non-overlapping spreadsheet leaf fields merge when the generic page merge can do so; concurrent edits of the same leaf remain a normal Sync conflict rather than live collaboration.
