import {
  AssessmentCognitiveLevel,
  AssessmentDifficulty,
  AssessmentQuestion,
  AssessmentQuestionType,
  SpreadsheetTabInfo,
} from '../types/journal';
import {normalizeDriveImageUrl} from '../utils/postFormatting';

export const DEFAULT_ASSESSMENT_TAB_NAME = 'AssessmentBank';

export const ASSESSMENT_TAB_ALIASES = [
  'assessmentbank',
  'assessment',
  'assessments',
  'quizbank',
  '學力檢測題庫',
  '題庫',
  '檢測題庫',
] as const;

export const ASSESSMENT_SHEET_HEADERS = [
  'Id',
  'AcademicYear',
  'Grade',
  'DomainTopic',
  'UnitTitle',
  'CognitiveLevel',
  'QuestionType',
  'Stem',
  'OptionA',
  'OptionB',
  'OptionC',
  'OptionD',
  'CorrectAnswer',
  'Explanation',
  'Hint',
  'ImageUrl',
  'Difficulty',
  'Author',
  'IsPublished',
] as const;

const LOCAL_ASSESSMENTS_STORAGE_PREFIX = 'pesmath_assessment_bank_v1';
const LOCAL_ASSESSMENT_TAB_PREF_PREFIX = 'pesmath_assessment_tab_pref_v1';

function escapeA1SheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function normalizeHeaderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function parseBool(val: unknown, defaultVal = true): boolean {
  if (val === undefined || val === null || String(val).trim() === '') {
    return defaultVal;
  }
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no' || s === '否' || s === '草稿') {
    return false;
  }
  return s === 'true' || s === '1' || s === 'yes' || s === '是' || s === '已發布';
}

function parseCognitiveLevel(raw: string): AssessmentCognitiveLevel {
  const s = raw.trim();
  if (s.includes('程序') || s.includes('計算') || s.includes('演算')) {
    return '程序執行';
  }
  if (s.includes('情境') || s.includes('應用') || s.includes('解題')) {
    return '情境應用';
  }
  return '概念理解';
}

function parseQuestionType(
  raw: string,
  options: string[],
): AssessmentQuestionType {
  const s = raw.trim().toLowerCase();
  if (
    s.includes('建構') ||
    s.includes('簡答') ||
    s.includes('非選') ||
    s.includes('constructed') ||
    s.includes('open') ||
    s.includes('short')
  ) {
    return 'constructed-response';
  }
  if (
    s.includes('選擇') ||
    s.includes('單選') ||
    s.includes('choice') ||
    s.includes('mcq')
  ) {
    return 'single-choice';
  }
  return options.length >= 2 ? 'single-choice' : 'constructed-response';
}

function parseDifficulty(raw: string): AssessmentDifficulty {
  const s = raw.trim();
  if (s.includes('進階') || s.includes('難') || s.includes('挑戰')) return '進階';
  if (s.includes('基礎') || s.includes('易') || s.includes('基本')) return '基礎';
  return '中等';
}

function normalizeGrade(raw: string): string {
  const s = raw.trim();
  if (!s) return '四年級';
  if (/[一1]年級|小一/.test(s)) return '一年級';
  if (/[二2]年級|小二/.test(s)) return '二年級';
  if (/[三3]年級|小三/.test(s)) return '三年級';
  if (/[四4]年級|小四/.test(s)) return '四年級';
  if (/[五5]年級|小五/.test(s)) return '五年級';
  if (/[六6]年級|小六/.test(s)) return '六年級';
  return s;
}

function questionToRow(q: AssessmentQuestion): string[] {
  const optA = q.options[0] ?? '';
  const optB = q.options[1] ?? '';
  const optC = q.options[2] ?? '';
  const optD = q.options[3] ?? '';
  return [
    q.id,
    q.academicYear,
    q.grade,
    q.domainTopic,
    q.unitTitle,
    q.cognitiveLevel,
    q.questionType,
    q.stem,
    optA,
    optB,
    optC,
    optD,
    q.correctAnswer,
    q.explanation,
    q.hint || '',
    q.imageUrl ? normalizeDriveImageUrl(q.imageUrl) : '',
    q.difficulty,
    q.author,
    q.isPublished ? 'TRUE' : 'FALSE',
  ];
}

function getColumnLetter(colIndexZeroBased: number): string {
  let n = colIndexZeroBased + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col || 'A';
}

function getFieldForNormalizedHeader(
  q: AssessmentQuestion,
  normHeader: string,
): string | null {
  if (['id', '題號', '代碼'].includes(normHeader)) return q.id;
  if (['academicyear', '學年度', '年度'].includes(normHeader)) {
    return q.academicYear;
  }
  if (['grade', '年級', '適用年級'].includes(normHeader)) return q.grade;
  if (['domaintopic', 'domain', '數學領域', '領域主題', '主題'].includes(normHeader)) {
    return q.domainTopic;
  }
  if (['unittitle', 'unit', '單元', '單元名稱', '數學單元'].includes(normHeader)) {
    return q.unitTitle;
  }
  if (['cognitivelevel', '認知層次', '層次'].includes(normHeader)) {
    return q.cognitiveLevel;
  }
  if (['questiontype', 'type', '題型'].includes(normHeader)) {
    return q.questionType;
  }
  if (['stem', 'question', '題幹', '題目', '題目內容'].includes(normHeader)) {
    return q.stem;
  }
  if (['optiona', 'a', '選項a'].includes(normHeader)) return q.options[0] ?? '';
  if (['optionb', 'b', '選項b'].includes(normHeader)) return q.options[1] ?? '';
  if (['optionc', 'c', '選項c'].includes(normHeader)) return q.options[2] ?? '';
  if (['optiond', 'd', '選項d'].includes(normHeader)) return q.options[3] ?? '';
  if (
    ['correctanswer', 'answer', '正解', '正確答案', '參考解答'].includes(
      normHeader,
    )
  ) {
    return q.correctAnswer;
  }
  if (
    ['explanation', '詳解', '解析', '迷思診斷', '回饋說明'].includes(normHeader)
  ) {
    return q.explanation;
  }
  if (['hint', '提示', '作答提示'].includes(normHeader)) return q.hint || '';
  if (['imageurl', 'image', '圖檔', '圖片網址', '附圖'].includes(normHeader)) {
    return q.imageUrl ? normalizeDriveImageUrl(q.imageUrl) : '';
  }
  if (['difficulty', '難度', '難易度'].includes(normHeader)) {
    return q.difficulty;
  }
  if (['author', '命題者', '作者', '提供者'].includes(normHeader)) {
    return q.author;
  }
  if (['ispublished', 'published', '公開', '發布狀態', '啟用'].includes(normHeader)) {
    return q.isPublished ? 'TRUE' : 'FALSE';
  }
  return null;
}

function questionToAlignedRow(
  q: AssessmentQuestion,
  headerRow?: unknown[],
): string[] {
  if (!headerRow || headerRow.length === 0) {
    return questionToRow(q);
  }
  const normalized = headerRow.map((h) => normalizeHeaderKey(String(h ?? '')));
  const mappedCount = normalized.filter(
    (k) => k && getFieldForNormalizedHeader(q, k) !== null,
  ).length;
  if (mappedCount < 4) {
    return questionToRow(q);
  }
  return normalized.map((k) => {
    const val = k ? getFieldForNormalizedHeader(q, k) : null;
    return val ?? '';
  });
}

function buildHeaderMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeaderKey(String(cell ?? ''));
    if (norm) map[norm] = idx;
  });
  return map;
}

function isAssessmentHeaderMap(headerMap: Record<string, number>): boolean {
  const keys = Object.keys(headerMap);
  if (
    keys.includes('slug') ||
    keys.includes('coverimageurl') ||
    keys.includes('resourceurl')
  ) {
    return false;
  }
  return keys.some((k) =>
    [
      'stem',
      '題幹',
      '題目',
      '題目內容',
      'correctanswer',
      '正解',
      '正確答案',
      'optiona',
      '選項a',
      'cognitivelevel',
      '認知層次',
    ].includes(k),
  );
}

function rowToQuestion(
  row: unknown[],
  headerMap: Record<string, number>,
  rowIndex: number,
): AssessmentQuestion | null {
  const getCell = (keys: string[]): string => {
    for (const k of keys) {
      const idx = headerMap[k];
      if (idx !== undefined && row[idx] !== undefined && row[idx] !== null) {
        return String(row[idx]).trim();
      }
    }
    return '';
  };

  const stem = getCell(['stem', 'question', '題幹', '題目', '題目內容']);
  if (!stem) return null;

  const rawId = getCell(['id', '題號', '代碼']);
  const id = rawId || `aq-r${rowIndex}`;

  const options = [
    getCell(['optiona', 'a', '選項a']),
    getCell(['optionb', 'b', '選項b']),
    getCell(['optionc', 'c', '選項c']),
    getCell(['optiond', 'd', '選項d']),
  ].filter(Boolean);

  const questionType = parseQuestionType(
    getCell(['questiontype', 'type', '題型']),
    options,
  );

  const rawAnswer = getCell([
    'correctanswer',
    'answer',
    '正解',
    '正確答案',
    '參考解答',
  ]);
  const correctAnswer =
    questionType === 'single-choice' && /^[a-d]$/i.test(rawAnswer)
      ? rawAnswer.toUpperCase()
      : rawAnswer || (questionType === 'single-choice' ? 'A' : '');

  const rawImage = getCell(['imageurl', 'image', '圖檔', '圖片網址', '附圖']);

  return {
    id,
    academicYear: getCell(['academicyear', '學年度', '年度']) || '113 學年度',
    grade: normalizeGrade(getCell(['grade', '年級', '適用年級'])),
    domainTopic:
      getCell(['domaintopic', 'domain', '數學領域', '領域主題', '主題']) ||
      '數與量',
    unitTitle:
      getCell(['unittitle', 'unit', '單元', '單元名稱', '數學單元']) ||
      '綜合素養',
    cognitiveLevel: parseCognitiveLevel(
      getCell(['cognitivelevel', '認知層次', '層次']),
    ),
    questionType,
    stem,
    options,
    correctAnswer,
    explanation:
      getCell(['explanation', '詳解', '解析', '迷思診斷', '回饋說明']) ||
      '本題已完成作答。',
    hint: getCell(['hint', '提示', '作答提示']) || undefined,
    imageUrl: rawImage ? normalizeDriveImageUrl(rawImage) : undefined,
    difficulty: parseDifficulty(getCell(['difficulty', '難度', '難易度'])),
    author:
      getCell(['author', '命題者', '作者', '提供者']) || 'PesMath 數學領域社群',
    isPublished: parseBool(
      getCell(['ispublished', 'published', '公開', '發布狀態', '啟用']),
      true,
    ),
    rowIndex,
  };
}

function deduplicateQuestionIds(
  items: AssessmentQuestion[],
): AssessmentQuestion[] {
  const seen = new Set<string>();
  return items.map((item, idx) => {
    let uniqueId = item.id;
    if (seen.has(uniqueId)) {
      const suffix = item.rowIndex ? `r${item.rowIndex}` : `${idx + 1}`;
      let candidate = `${item.id}-${suffix}`;
      let counter = 2;
      while (seen.has(candidate)) {
        candidate = `${item.id}-${suffix}-${counter}`;
        counter++;
      }
      uniqueId = candidate;
    }
    seen.add(uniqueId);
    return uniqueId === item.id ? item : {...item, id: uniqueId};
  });
}

export function isAssessmentTabName(tabTitle: string): boolean {
  const norm = tabTitle.trim().toLowerCase();
  return (ASSESSMENT_TAB_ALIASES as readonly string[]).includes(norm);
}

export function findAssessmentTab(
  tabs: SpreadsheetTabInfo[],
  preferredTabName?: string,
): SpreadsheetTabInfo | undefined {
  if (preferredTabName?.trim()) {
    const exact = tabs.find(
      (t) =>
        t.title.trim().toLowerCase() === preferredTabName.trim().toLowerCase(),
    );
    if (exact) return exact;
  }
  return tabs.find((t) => isAssessmentTabName(t.title));
}

export async function fetchAssessmentHeaderRow(
  spreadsheetId: string,
  tabName: string,
  accessToken: string,
): Promise<unknown[] | undefined> {
  try {
    const range = encodeURIComponent(`${escapeA1SheetName(tabName)}!A1:Z1`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId,
      )}/values/${range}`,
      {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const firstRow = data.values?.[0];
    return Array.isArray(firstRow) ? firstRow : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchAssessmentFromSheetsApi(
  spreadsheetId: string,
  tabs: SpreadsheetTabInfo[],
  accessToken: string,
  preferredTabName?: string,
): Promise<{
  hasTab: boolean;
  tabName: string;
  questions: AssessmentQuestion[];
  headerRow?: unknown[];
}> {
  const targetTab = findAssessmentTab(tabs, preferredTabName);
  const fallbackName = preferredTabName?.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
  if (!targetTab) {
    return {hasTab: false, tabName: fallbackName, questions: []};
  }

  const range = encodeURIComponent(
    `${escapeA1SheetName(targetTab.title)}!A1:Z1000`,
  );
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}`,
    {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `讀取「${targetTab.title}」題庫分頁失敗 (${res.status})`,
    );
  }

  const data = await res.json();
  const values: unknown[][] = data.values || [];
  if (values.length === 0) {
    return {hasTab: true, tabName: targetTab.title, questions: []};
  }
  if (values.length < 2) {
    return {
      hasTab: true,
      tabName: targetTab.title,
      questions: [],
      headerRow: values[0],
    };
  }

  const headerMap = buildHeaderMap(values[0]);
  if (!isAssessmentHeaderMap(headerMap)) {
    return {
      hasTab: true,
      tabName: targetTab.title,
      questions: [],
      headerRow: values[0],
    };
  }

  const parsed: AssessmentQuestion[] = [];
  for (let i = 1; i < values.length; i++) {
    const item = rowToQuestion(values[i], headerMap, i + 1);
    if (item) parsed.push(item);
  }

  return {
    hasTab: true,
    tabName: targetTab.title,
    questions: deduplicateQuestionIds(parsed),
    headerRow: values[0],
  };
}

async function fetchAssessmentGvizByTabName(
  spreadsheetId: string,
  sheetName: string,
): Promise<{hasTab: boolean; tabName: string; questions: AssessmentQuestion[]}> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId,
  )}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, {cache: 'no-store'});
  if (!res.ok) {
    return {hasTab: false, tabName: sheetName, questions: []};
  }

  const text = await res.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return {hasTab: false, tabName: sheetName, questions: []};
  }

  const json = JSON.parse(text.slice(start, end + 1));
  if (json.status === 'error') {
    return {hasTab: false, tabName: sheetName, questions: []};
  }

  const cols: Array<{label?: string; id?: string}> = json.table?.cols || [];
  const rows: Array<{c: Array<{v: unknown; f?: string} | null>}> =
    json.table?.rows || [];

  const headerLabels = cols.map((c) => c.label || c.id || '');
  let headerMap = buildHeaderMap(headerLabels);
  let dataRows = rows.map((r) =>
    (r.c || []).map((cell) => (cell ? cell.f ?? cell.v ?? '' : '')),
  );

  if (!isAssessmentHeaderMap(headerMap)) {
    if (dataRows.length > 0) {
      const firstRowMap = buildHeaderMap(dataRows[0]);
      if (isAssessmentHeaderMap(firstRowMap)) {
        headerMap = firstRowMap;
        dataRows = dataRows.slice(1);
      } else {
        return {hasTab: false, tabName: sheetName, questions: []};
      }
    } else {
      return {hasTab: false, tabName: sheetName, questions: []};
    }
  }

  const parsed: AssessmentQuestion[] = [];
  dataRows.forEach((row, idx) => {
    const item = rowToQuestion(row, headerMap, idx + 2);
    if (item) parsed.push(item);
  });

  return {
    hasTab: true,
    tabName: sheetName,
    questions: deduplicateQuestionIds(parsed),
  };
}

export async function fetchAssessmentFromPublicGviz(
  spreadsheetId: string,
  preferredTabName?: string,
): Promise<{hasTab: boolean; tabName: string; questions: AssessmentQuestion[]}> {
  const candidates = Array.from(
    new Set(
      [
        preferredTabName?.trim(),
        DEFAULT_ASSESSMENT_TAB_NAME,
        '學力檢測題庫',
        '題庫',
      ].filter((v): v is string => Boolean(v)),
    ),
  );

  for (const tabName of candidates) {
    try {
      const result = await fetchAssessmentGvizByTabName(spreadsheetId, tabName);
      if (result.hasTab) return result;
    } catch {
      // try next candidate tab name
    }
  }

  return {
    hasTab: false,
    tabName: preferredTabName?.trim() || DEFAULT_ASSESSMENT_TAB_NAME,
    questions: [],
  };
}

export async function ensureAssessmentTabExists(
  spreadsheetId: string,
  existingTabs: SpreadsheetTabInfo[],
  targetTabName: string,
  accessToken: string,
): Promise<{tabs: SpreadsheetTabInfo[]; tabName: string; createdNow: boolean}> {
  const cleanName = targetTabName.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
  const existing = existingTabs.find(
    (t) => t.title.trim().toLowerCase() === cleanName.toLowerCase(),
  );
  if (existing) {
    return {tabs: existingTabs, tabName: existing.title, createdNow: false};
  }

  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: cleanName,
                gridProperties: {frozenRowCount: 1},
              },
            },
          },
        ],
      }),
    },
  );

  if (!addRes.ok) {
    const errBody = await addRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `建立「${cleanName}」題庫分頁失敗 (${addRes.status})`,
    );
  }

  const addJson = await addRes.json();
  const addedProps = addJson?.replies?.[0]?.addSheet?.properties;
  const updatedTabs = [...existingTabs];
  const createdTabName = addedProps?.title || cleanName;
  if (addedProps) {
    updatedTabs.push({
      sheetId: addedProps.sheetId,
      title: createdTabName,
    });
  }

  const endCol = getColumnLetter(ASSESSMENT_SHEET_HEADERS.length - 1);
  const headerRange = encodeURIComponent(
    `${escapeA1SheetName(createdTabName)}!A1:${endCol}1`,
  );
  const writeHeaderRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${headerRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({values: [[...ASSESSMENT_SHEET_HEADERS]]}),
    },
  );

  if (!writeHeaderRes.ok) {
    const errBody = await writeHeaderRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `寫入「${createdTabName}」題庫表頭失敗 (${writeHeaderRes.status})`,
    );
  }

  return {tabs: updatedTabs, tabName: createdTabName, createdNow: true};
}

export async function appendAssessmentQuestionToSheet(
  spreadsheetId: string,
  tabName: string,
  question: AssessmentQuestion,
  accessToken: string,
  headerRow?: unknown[],
): Promise<void> {
  const resolvedHeaders =
    headerRow ??
    (await fetchAssessmentHeaderRow(spreadsheetId, tabName, accessToken));
  const row = questionToAlignedRow(question, resolvedHeaders);
  const endCol = getColumnLetter(
    Math.max(row.length - 1, ASSESSMENT_SHEET_HEADERS.length - 1),
  );
  const range = encodeURIComponent(`${escapeA1SheetName(tabName)}!A:${endCol}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `新增試題至 Google Sheet「${tabName}」失敗 (${res.status})`,
    );
  }
}

export async function batchAppendAssessmentQuestionsToSheet(
  spreadsheetId: string,
  tabName: string,
  questions: AssessmentQuestion[],
  accessToken: string,
  headerRow?: unknown[],
): Promise<void> {
  if (questions.length === 0) return;
  const resolvedHeaders =
    headerRow ??
    (await fetchAssessmentHeaderRow(spreadsheetId, tabName, accessToken));
  const rows = questions.map((q) => questionToAlignedRow(q, resolvedHeaders));
  const endCol = getColumnLetter(
    Math.max(
      (rows[0]?.length ?? ASSESSMENT_SHEET_HEADERS.length) - 1,
      ASSESSMENT_SHEET_HEADERS.length - 1,
    ),
  );
  const range = encodeURIComponent(`${escapeA1SheetName(tabName)}!A:${endCol}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `批次寫入試題至 Google Sheet「${tabName}」失敗 (${res.status})`,
    );
  }
}

export async function updateAssessmentQuestionInSheet(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  question: AssessmentQuestion,
  accessToken: string,
  headerRow?: unknown[],
): Promise<void> {
  const resolvedHeaders =
    headerRow ??
    (await fetchAssessmentHeaderRow(spreadsheetId, tabName, accessToken));
  const row = questionToAlignedRow(question, resolvedHeaders);
  const endCol = getColumnLetter(
    Math.max(row.length - 1, ASSESSMENT_SHEET_HEADERS.length - 1),
  );
  const range = encodeURIComponent(
    `${escapeA1SheetName(tabName)}!A${rowIndex}:${endCol}${rowIndex}`,
  );
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `更新 Google Sheet「${tabName}」試題失敗 (${res.status})`,
    );
  }
}

export async function deleteAssessmentQuestionFromSheet(
  spreadsheetId: string,
  sheetId: number,
  rowIndex: number,
  accessToken: string,
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `刪除 Google Sheet 試題失敗 (${res.status})`,
    );
  }
}

export function exportAssessmentsAsCsv(
  questions: AssessmentQuestion[],
): string {
  const escapeCsv = (val: string) => {
    const safe = val.replace(/"/g, '""');
    return `"${safe}"`;
  };
  const header = ASSESSMENT_SHEET_HEADERS.map((h) => escapeCsv(h)).join(',');
  const lines = questions.map((q) =>
    questionToRow(q)
      .map((cell) => escapeCsv(cell))
      .join(','),
  );
  return `\uFEFF${[header, ...lines].join('\n')}`;
}

function getCacheKey(spreadsheetId?: string, tabName?: string): string {
  const sid = spreadsheetId?.trim() || 'default';
  const tab = tabName?.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
  return `${LOCAL_ASSESSMENTS_STORAGE_PREFIX}_${sid}_${tab}`;
}

export function readLocalAssessmentsCache(
  spreadsheetId?: string,
  tabName?: string,
): AssessmentQuestion[] | null {
  try {
    const raw = localStorage.getItem(getCacheKey(spreadsheetId, tabName));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AssessmentQuestion[]) : null;
  } catch {
    return null;
  }
}

export function writeLocalAssessmentsCache(
  spreadsheetId: string | undefined,
  tabName: string | undefined,
  questions: AssessmentQuestion[],
): void {
  try {
    localStorage.setItem(
      getCacheKey(spreadsheetId, tabName),
      JSON.stringify(questions),
    );
  } catch {
    // ignore storage quota errors
  }
}

export function readSelectedAssessmentTabPreference(
  spreadsheetId?: string,
): string {
  try {
    const sid = spreadsheetId?.trim() || 'default';
    return (
      localStorage.getItem(`${LOCAL_ASSESSMENT_TAB_PREF_PREFIX}_${sid}`) ||
      DEFAULT_ASSESSMENT_TAB_NAME
    );
  } catch {
    return DEFAULT_ASSESSMENT_TAB_NAME;
  }
}

export function writeSelectedAssessmentTabPreference(
  spreadsheetId: string | undefined,
  tabName: string,
): void {
  try {
    const sid = spreadsheetId?.trim() || 'default';
    localStorage.setItem(
      `${LOCAL_ASSESSMENT_TAB_PREF_PREFIX}_${sid}`,
      tabName.trim() || DEFAULT_ASSESSMENT_TAB_NAME,
    );
  } catch {
    // ignore storage errors
  }
}
