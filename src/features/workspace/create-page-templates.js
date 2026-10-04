(function (global) {
  'use strict';

  // The New Page dialog owns selection and confirmation. This module only
  // describes the choices and returns fresh canonical surface models.
  var sequence = 0;
  var catalog = {
    slides: [
      { id: 'title', name: 'Title slide', description: 'Start with a title and subtitle.', preview: 'Title · subtitle' },
      { id: 'blank', name: 'Blank slide', description: 'Start with one empty slide.', preview: 'One empty slide' },
      { id: 'class_presentation', name: 'Class presentation', description: 'Plan a clear class presentation with a learning goal, main ideas, an example, and a recap.', preview: 'Title · learning goal · main ideas · example · recap' },
      { id: 'research_report', name: 'Research report', description: 'Organize a research question, background, method, findings, conclusion, and sources.', preview: 'Question · background · method · findings · conclusion · sources' },
      { id: 'project_pitch', name: 'Project pitch', description: 'Explain a problem, your idea, how it works, its impact, and the next step.', preview: 'Problem · idea · plan · impact · next step' }
    ],
    sheets: [
      { id: 'blank', name: 'Blank workbook', description: 'Start with an empty workbook.', preview: 'One empty sheet' },
      { id: 'study', name: 'Study tracker', description: 'Track tasks, due dates, and status.', preview: 'Task · due date · status' },
      { id: 'assignment_tracker', name: 'Assignment tracker', description: 'Track assignments across classes, with due dates, status, and priority.', preview: 'Assignment · class · due date · status · priority · notes' },
      { id: 'grade_calculator', name: 'Grade calculator', description: 'Enter points earned and possible to calculate each score and the overall points-based percentage.', preview: 'Assignment · earned · possible · score · total' },
      { id: 'study_planner', name: 'Study planner', description: 'Plan one study goal for each day, track progress, and total your planned minutes.', preview: 'Day · class · study goal · minutes · status · total minutes' }
    ]
  };

  function newId(prefix) {
    sequence += 1;
    var random = '';
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        random = global.crypto.randomUUID().replace(/-/g, '');
      }
    } catch (_) { /* Use the local fallback below. */ }
    if (!random) random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return String(prefix || 'template') + '_' + Date.now().toString(36) + '_' + sequence.toString(36) + '_' + random;
  }

  function list(type) {
    var key = String(type || '').toLowerCase();
    return (catalog[key] || []).map(function (item) { return Object.assign({}, item); });
  }

  function get(type, id) {
    var key = String(type || '').toLowerCase();
    var item = (catalog[key] || []).find(function (candidate) { return candidate.id === String(id || ''); });
    return item ? Object.assign({}, item) : null;
  }

  function slideText(text, x, y, width, height, options) {
    var extra = options || {};
    return Object.assign({
      id: newId('element'), type: 'text', x: x, y: y, width: width, height: height,
      text: String(text || ''), fontSize: 3, fontWeight: 'normal', color: '#173d2b',
      fill: 'transparent', borderColor: '#d7d3c7', borderWidth: 0, textAlign: 'left'
    }, extra);
  }

  function slide(layout, title, body, notes, isCover) {
    var elements = [];
    if (isCover) {
      elements.push(slideText(title, 9, 25, 76, 22, { fontSize: 8, fontWeight: 'bold' }));
      elements.push(slideText(body, 10, 50, 72, 12, { fontSize: 3 }));
    } else {
      elements.push(slideText(title, 8, 8, 82, 14, { fontSize: 6, fontWeight: 'bold' }));
      elements.push(slideText(body, 10, 27, 78, 52, { fontSize: 3 }));
    }
    return { id: newId('slide'), layout: layout, title: String(title || 'Untitled slide'), speakerNotes: String(notes || ''), elements: elements };
  }

  function createSlidesDeck(templateId, title) {
    var item = get('slides', templateId);
    if (!item) return null;
    var pageTitle = String(title || 'Presentation').slice(0, 180);
    var slides;
    if (item.id === 'blank') {
      slides = [{ id: newId('slide'), layout: 'blank', title: pageTitle, speakerNotes: '', elements: [] }];
    } else if (item.id === 'title') {
      slides = [slide('title', pageTitle, 'Add a concise subtitle or guiding question.', '', true)];
    } else if (item.id === 'class_presentation') {
      slides = [
        slide('title', pageTitle, 'Class · presenter · date', 'Use a short title and tell the class what to listen for.', true),
        slide('title-body', 'Learning goal', 'By the end, the class will understand…\n\nGuiding question: …', 'State one clear learning goal. Turn it into a question the audience can answer.', false),
        slide('title-body', 'Main ideas', '1. First idea and why it matters\n\n2. Second idea and how it connects\n\n3. One detail to remember', 'Keep each point focused. Move extra explanation into speaker notes.', false),
        slide('title-body', 'Example or evidence', 'Example: …\n\nEvidence or source: …\n\nWhat it shows: …', 'Use a specific example, quotation, data point, or demonstration. Credit its source.', false),
        slide('title-body', 'Recap', 'One takeaway: …\n\nQuestion for the class: …\n\nSources: …', 'End with the main takeaway and list the sources you used.', false)
      ];
    } else if (item.id === 'research_report') {
      slides = [
        slide('title', pageTitle, 'Research report · author · class · date', 'Give the topic and the main question in plain language.', true),
        slide('title-body', 'Research question', 'Question: …\n\nWhy it matters: …', 'Make the question specific enough to investigate with the evidence you have.', false),
        slide('title-body', 'Background', 'What is already known?\n\nKey terms or context: …\n\nWhat is still uncertain? …', 'Summarize only the background the audience needs.', false),
        slide('title-body', 'Method', 'Sources or data: …\n\nHow I investigated: …\n\nLimits to keep in mind: …', 'Describe how you gathered and checked the information.', false),
        slide('title-body', 'Findings', 'Finding 1: …\n\nFinding 2: …\n\nEvidence that supports them: …', 'Connect each claim to evidence. Add charts or tables when they help explain the result.', false),
        slide('title-body', 'Conclusion and sources', 'Answer to the question: …\n\nWhat I learned: …\n\nSources: …', 'State what the evidence supports and list the sources in the format your class requires.', false)
      ];
    } else {
      slides = [
        slide('title', pageTitle, 'Project pitch · presenter · date', 'Describe the project in one sentence before presenting the details.', true),
        slide('title-body', 'The problem', 'Who needs help? …\n\nWhat is difficult today? …\n\nWhy does it matter? …', 'Use a concrete example to show the problem.', false),
        slide('title-body', 'Our idea', 'Proposed solution: …\n\nWhat makes it useful? …', 'Explain the idea simply. Avoid claiming results you have not measured.', false),
        slide('title-body', 'How it works', 'Step 1: …\n\nStep 2: …\n\nWhat we need: …', 'Show the smallest useful version and the resources it needs.', false),
        slide('title-body', 'Impact and next step', 'How we will tell if it works: …\n\nExpected impact: …\n\nNext step or request: …', 'Make a clear, realistic request and name one way to measure progress.', false)
      ];
    }
    return { version: 2, size: 'widescreen', theme: 'sutra', slides: slides };
  }

  function engine() { return global.SutraSheetsEngine || null; }
  function setValue(api, sheet, row, col, value, styleId, validation) {
    var cell = { value: value == null ? '' : value, formula: '', styleId: styleId || '', note: '', validation: validation || null };
    api.setCell(sheet, row, col, cell);
  }
  function setFormula(api, sheet, row, col, formula, styleId) {
    api.setCell(sheet, row, col, { value: '', formula: formula, styleId: styleId || '', note: '', validation: null });
  }
  function prepareSheet(sheet, widths) {
    (widths || []).forEach(function (width, index) {
      if (sheet.columns[index]) sheet.columns[index].width = width;
    });
  }
  function prepareBook(title, sheetName, widths) {
    var api = engine();
    if (!api || typeof api.createWorkbook !== 'function' || typeof api.setCell !== 'function') return null;
    var workbook = api.createWorkbook(String(title || 'Spreadsheet').slice(0, 200));
    var sheet = workbook.sheets[0];
    sheet.name = sheetName;
    sheet.frozen.rows = 1;
    prepareSheet(sheet, widths);
    workbook.styles = {
      template_header: { fontWeight: '700', backgroundColor: '#e9f2ec', color: '#173d2b' },
      template_total: { fontWeight: '700', backgroundColor: '#f3f4f6' },
      template_percent: { numberFormat: 'percent' },
      template_total_percent: { numberFormat: 'percent', fontWeight: '700', backgroundColor: '#f3f4f6' }
    };
    return { workbook: workbook, sheet: sheet, api: api };
  }
  function writeHeaders(api, sheet, values) {
    values.forEach(function (value, column) { setValue(api, sheet, 0, column, value, 'template_header'); });
  }

  function createSheetsWorkbook(templateId, title) {
    var item = get('sheets', templateId);
    if (!item) return null;
    var setup;
    if (item.id === 'blank') {
      var api = engine();
      return api && typeof api.createWorkbook === 'function' ? api.createWorkbook(String(title || 'Spreadsheet').slice(0, 200)) : null;
    }
    if (item.id === 'study') {
      setup = prepareBook(title, 'Study tracker', [260, 150, 180]);
      if (!setup) return null;
      writeHeaders(setup.api, setup.sheet, ['Task', 'Due date', 'Status']);
      for (var studyRow = 1; studyRow < 40; studyRow += 1) setValue(setup.api, setup.sheet, studyRow, 2, '', '', { type: 'list', values: ['Not started', 'In progress', 'Done'] });
      setup.workbook.title = String(title || 'Spreadsheet').slice(0, 200);
      return setup.workbook;
    }
    if (item.id === 'assignment_tracker') {
      setup = prepareBook(title, 'Assignments', [240, 160, 130, 140, 110, 280]);
      if (!setup) return null;
      writeHeaders(setup.api, setup.sheet, ['Assignment', 'Class', 'Due date', 'Status', 'Priority', 'Notes or link']);
      for (var assignmentRow = 1; assignmentRow < 40; assignmentRow += 1) {
        setValue(setup.api, setup.sheet, assignmentRow, 3, '', '', { type: 'list', values: ['Not started', 'In progress', 'Done'] });
        setValue(setup.api, setup.sheet, assignmentRow, 4, '', '', { type: 'list', values: ['Low', 'Medium', 'High'] });
      }
      return setup.workbook;
    }
    if (item.id === 'grade_calculator') {
      setup = prepareBook(title, 'Grades', [260, 140, 150, 140]);
      if (!setup) return null;
      writeHeaders(setup.api, setup.sheet, ['Assignment', 'Points earned', 'Points possible', 'Score']);
      for (var gradeRow = 1; gradeRow <= 20; gradeRow += 1) setFormula(setup.api, setup.sheet, gradeRow, 3, '=IFERROR(B' + (gradeRow + 1) + '/C' + (gradeRow + 1) + ',"")', 'template_percent');
      setValue(setup.api, setup.sheet, 21, 0, 'Total points', 'template_total');
      setFormula(setup.api, setup.sheet, 21, 1, '=SUM(B2:B21)', 'template_total');
      setFormula(setup.api, setup.sheet, 21, 2, '=SUM(C2:C21)', 'template_total');
      setFormula(setup.api, setup.sheet, 21, 3, '=IFERROR(B22/C22,"")', 'template_total_percent');
      return setup.workbook;
    }
    setup = prepareBook(title, 'Study plan', [130, 180, 290, 120, 150]);
    if (!setup) return null;
    writeHeaders(setup.api, setup.sheet, ['Day', 'Class', 'Study goal', 'Minutes', 'Status']);
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach(function (day, index) {
      var row = index + 1;
      setValue(setup.api, setup.sheet, row, 0, day);
      setValue(setup.api, setup.sheet, row, 4, 'Not started', '', { type: 'list', values: ['Not started', 'In progress', 'Done'] });
    });
    setValue(setup.api, setup.sheet, 8, 0, 'Total minutes', 'template_total');
    setFormula(setup.api, setup.sheet, 8, 3, '=SUM(D2:D8)', 'template_total');
    return setup.workbook;
  }

  var api = {
    list: list,
    get: get,
    createSlidesDeck: createSlidesDeck,
    createSheetsWorkbook: createSheetsWorkbook
  };

  // The dialog consumes this catalog; its confirmation handler remains the
  // only code that creates a workspace page.
  global.SutraCreatePageTemplates = api;
}(typeof window !== 'undefined' ? window : globalThis));
