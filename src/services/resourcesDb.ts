import {
  ResourceGradeBand,
  ResourceSourceOrigin,
  ResourceType,
  SpreadsheetTabInfo,
  TeachingResource,
} from '../types/journal';

export const RESOURCES_TAB_NAME = 'Resources';

export const RESOURCE_SHEET_HEADERS = [
  'Id',
  'Title',
  'GradeBand',
  'ResourceType',
  'SourceOrigin',
  'TopicTags',
  'Summary',
  'Content',
  'ResourceUrl',
  'Author',
  'PublishedAt',
  'IsPublic',
  'IsPinned',
] as const;

const LOCAL_RESOURCES_STORAGE_PREFIX = 'pesmath_teaching_resources_v1';

function escapeA1SheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function normalizeHeaderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function parseBool(val: unknown, defaultVal = false): boolean {
  if (val === undefined || val === null || String(val).trim() === '') {
    return defaultVal;
  }
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no' || s === '否') return false;
  return s === 'true' || s === '1' || s === 'yes' || s === '是';
}

function parseGradeBand(raw: string): ResourceGradeBand {
  const s = raw.trim();
  if (s.includes('低') || s.includes('1-2') || s.includes('一二')) {
    return '低年級 (1-2)';
  }
  if (s.includes('中') || s.includes('3-4') || s.includes('三四')) {
    return '中年級 (3-4)';
  }
  if (s.includes('高') || s.includes('5-6') || s.includes('五六')) {
    return '高年級 (5-6)';
  }
  return '跨年級通用';
}

function parseResourceType(raw: string): ResourceType {
  const s = raw.trim();
  if (
    s.includes('電子書') ||
    s.toLowerCase().includes('ebook') ||
    s.toLowerCase().includes('e-book')
  ) {
    return '電子書';
  }
  if (s.includes('工具') || s.includes('互動') || s.includes('軟體') || s.includes('app')) {
    return '數位互動工具';
  }
  if (s.includes('研習') || s.includes('心得') || s.includes('筆記')) {
    return '研習心得筆記';
  }
  if (s.includes('好站') || s.includes('網站') || s.includes('平台') || s.includes('公開')) {
    return '公開好站精選';
  }
  return '自製教案 / 學習單';
}

function parseSourceOrigin(raw: string, resourceType: ResourceType): ResourceSourceOrigin {
  const s = raw.trim();
  if (s.includes('研習') || s.includes('筆記')) return '研習筆記';
  if (s.includes('公開') || s.includes('精選') || s.includes('外部')) return '公開精選';
  if (s.includes('原創') || s.includes('自製')) return '原創自製';
  if (resourceType === '研習心得筆記') return '研習筆記';
  if (resourceType === '公開好站精選') return '公開精選';
  return '原創自製';
}

function resourceToRow(res: TeachingResource): string[] {
  return [
    res.id,
    res.title,
    res.gradeBand,
    res.resourceType,
    res.sourceOrigin,
    res.topicTags,
    res.summary,
    res.content || '',
    res.resourceUrl || '',
    res.author,
    res.publishedAt,
    res.isPublic ? 'TRUE' : 'FALSE',
    res.isPinned ? 'TRUE' : 'FALSE',
  ];
}

function buildHeaderMap(headerRow: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeaderKey(String(cell ?? ''));
    if (norm) map[norm] = idx;
  });
  return map;
}

function isResourceHeaderMap(headerMap: Record<string, number>): boolean {
  const keys = Object.keys(headerMap);
  return keys.some((k) =>
    [
      'gradeband',
      '年段',
      '適用年段',
      'resourcetype',
      '資源類型',
      'sourceorigin',
      '資源來源',
      'resourceurl',
      '資源連結',
      'topictags',
      '單元標籤',
    ].includes(k),
  );
}

function rowToResource(
  row: unknown[],
  headerMap: Record<string, number>,
  rowIndex: number,
): TeachingResource | null {
  const getCell = (keys: string[]): string => {
    for (const k of keys) {
      const idx = headerMap[k];
      if (idx !== undefined && row[idx] !== undefined && row[idx] !== null) {
        return String(row[idx]).trim();
      }
    }
    return '';
  };

  const title = getCell(['title', '資源標題', '標題', '名稱']);
  if (!title) return null;

  const rawId = getCell(['id', '代碼', 'slug']);
  const id =
    rawId ||
    `res-${rowIndex}-${title.slice(0, 10).replace(/\s+/g, '-').toLowerCase()}`;

  const resourceType = parseResourceType(
    getCell(['resourcetype', '資源類型', '類型', '分類']),
  );
  const gradeBand = parseGradeBand(
    getCell(['gradeband', '年段', '適用年段', '年級']),
  );
  const sourceOrigin = parseSourceOrigin(
    getCell(['sourceorigin', '資源來源', '來源']),
    resourceType,
  );

  return {
    id,
    title,
    gradeBand,
    resourceType,
    sourceOrigin,
    topicTags: getCell(['topictags', '單元標籤', '標籤', '關鍵字']),
    summary: getCell(['summary', '摘要', '簡介', '說明']),
    content: getCell(['content', '詳細心得', '教案內容', '筆記', '內文']) || undefined,
    resourceUrl:
      getCell(['resourceurl', '資源連結', '網址', '連結', 'url']) || undefined,
    author: getCell(['author', '提供者', '作者', '整理者']) || 'PesMath 數學領域社群',
    publishedAt:
      getCell(['publishedat', '發布日期', '更新日期', '日期']) ||
      new Date().toISOString().slice(0, 10),
    isPublic: parseBool(getCell(['ispublic', '公開', '對外公開']), true),
    isPinned: parseBool(getCell(['ispinned', '置頂', '精選']), false),
    rowIndex,
  };
}

function deduplicateResourceIds(items: TeachingResource[]): TeachingResource[] {
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

export function findResourcesTab(
  tabs: SpreadsheetTabInfo[],
): SpreadsheetTabInfo | undefined {
  return tabs.find(
    (t) =>
      t.title.trim().toLowerCase() === RESOURCES_TAB_NAME.toLowerCase() ||
      t.title.trim() === '教學資源',
  );
}

/**
 * Reads the 'Resources' tab via Sheets API v4 when authenticated.
 * Gracefully returns { hasTab: false, resources: [] } if the spreadsheet doesn't have a Resources tab yet.
 */
export async function fetchResourcesFromSheetsApi(
  spreadsheetId: string,
  tabs: SpreadsheetTabInfo[],
  accessToken: string,
): Promise<{hasTab: boolean; tabName: string; resources: TeachingResource[]}> {
  const targetTab = findResourcesTab(tabs);
  if (!targetTab) {
    return {hasTab: false, tabName: RESOURCES_TAB_NAME, resources: []};
  }

  const range = encodeURIComponent(`${escapeA1SheetName(targetTab.title)}!A1:M1000`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    return {hasTab: true, tabName: targetTab.title, resources: []};
  }

  const data = await res.json();
  const values: unknown[][] = data.values || [];
  if (values.length < 2) {
    return {hasTab: true, tabName: targetTab.title, resources: []};
  }

  const headerMap = buildHeaderMap(values[0]);
  const parsed: TeachingResource[] = [];
  for (let i = 1; i < values.length; i++) {
    const item = rowToResource(values[i], headerMap, i + 1);
    if (item) parsed.push(item);
  }

  return {
    hasTab: true,
    tabName: targetTab.title,
    resources: deduplicateResourceIds(parsed),
  };
}

/**
 * Public unauthenticated read of the 'Resources' tab via GViz.
 * Detects and ignores GViz fallback to the first tab ('Posts') when 'Resources' does not exist yet.
 */
export async function fetchResourcesFromPublicGviz(
  spreadsheetId: string,
): Promise<{hasTab: boolean; resources: TeachingResource[]}> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      spreadsheetId,
    )}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(RESOURCES_TAB_NAME)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return {hasTab: false, resources: []};
    }

    const text = await res.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return {hasTab: false, resources: []};
    }

    const json = JSON.parse(text.slice(start, end + 1));
    if (json.status === 'error') {
      return {hasTab: false, resources: []};
    }

    const cols: Array<{label?: string; id?: string}> = json.table?.cols || [];
    const rows: Array<{c: Array<{v: unknown; f?: string} | null>}> =
      json.table?.rows || [];

    const headerLabels = cols.map((c) => c.label || c.id || '');
    let headerMap = buildHeaderMap(headerLabels);
    let dataRows = rows.map((r) =>
      (r.c || []).map((cell) => (cell ? cell.f ?? cell.v ?? '' : '')),
    );

    if (!isResourceHeaderMap(headerMap)) {
      if (dataRows.length > 0) {
        const firstRowMap = buildHeaderMap(dataRows[0]);
        if (isResourceHeaderMap(firstRowMap)) {
          headerMap = firstRowMap;
          dataRows = dataRows.slice(1);
        } else {
          // GViz fell back to another tab (like Posts) because 'Resources' tab does not exist yet
          return {hasTab: false, resources: []};
        }
      } else {
        return {hasTab: false, resources: []};
      }
    }

    const parsed: TeachingResource[] = [];
    dataRows.forEach((row, idx) => {
      const item = rowToResource(row, headerMap, idx + 2);
      if (item) parsed.push(item);
    });

    return {
      hasTab: true,
      resources: deduplicateResourceIds(parsed),
    };
  } catch {
    return {hasTab: false, resources: []};
  }
}

/**
 * Ensures a 'Resources' tab exists inside the connected Google Sheet with standard headers.
 */
export async function ensureResourcesTabExists(
  spreadsheetId: string,
  existingTabs: SpreadsheetTabInfo[],
  accessToken: string,
): Promise<{tabs: SpreadsheetTabInfo[]; tabName: string; createdNow: boolean}> {
  const existing = findResourcesTab(existingTabs);
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
                title: RESOURCES_TAB_NAME,
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
      errBody?.error?.message || `建立 Resources 教學資源分頁失敗 (${addRes.status})`,
    );
  }

  const addJson = await addRes.json();
  const addedProps = addJson?.replies?.[0]?.addSheet?.properties;
  const updatedTabs = [...existingTabs];
  const createdTabName = addedProps?.title || RESOURCES_TAB_NAME;
  if (addedProps) {
    updatedTabs.push({
      sheetId: addedProps.sheetId,
      title: createdTabName,
    });
  }

  const headerRange = encodeURIComponent(`${escapeA1SheetName(createdTabName)}!A1:M1`);
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
      body: JSON.stringify({values: [[...RESOURCE_SHEET_HEADERS]]}),
    },
  );

  if (!writeHeaderRes.ok) {
    const errBody = await writeHeaderRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `寫入 Resources 表頭失敗 (${writeHeaderRes.status})`,
    );
  }

  return {tabs: updatedTabs, tabName: createdTabName, createdNow: true};
}

export async function appendResourceToSheet(
  spreadsheetId: string,
  tabName: string,
  resource: TeachingResource,
  accessToken: string,
): Promise<void> {
  const range = encodeURIComponent(`${escapeA1SheetName(tabName)}!A:M`);
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
        values: [resourceToRow(resource)],
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `新增教學資源至 Google Sheet 失敗 (${res.status})`,
    );
  }
}

export async function batchAppendResourcesToSheet(
  spreadsheetId: string,
  tabName: string,
  resources: TeachingResource[],
  accessToken: string,
): Promise<void> {
  if (resources.length === 0) return;
  const range = encodeURIComponent(`${escapeA1SheetName(tabName)}!A:M`);
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
        values: resources.map(resourceToRow),
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `批次寫入教學資源至 Google Sheet 失敗 (${res.status})`,
    );
  }
}

export async function updateResourceInSheet(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  resource: TeachingResource,
  accessToken: string,
): Promise<void> {
  const range = encodeURIComponent(
    `${escapeA1SheetName(tabName)}!A${rowIndex}:M${rowIndex}`,
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
        values: [resourceToRow(resource)],
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `更新 Google Sheet 教學資源失敗 (${res.status})`,
    );
  }
}

export async function deleteResourceFromSheet(
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
      errBody?.error?.message || `刪除 Google Sheet 教學資源失敗 (${res.status})`,
    );
  }
}

export function exportResourcesAsCsv(resources: TeachingResource[]): string {
  const escapeCsv = (val: string) => {
    const safe = val.replace(/"/g, '""');
    return `"${safe}"`;
  };
  const header = RESOURCE_SHEET_HEADERS.map((h) => escapeCsv(h)).join(',');
  const lines = resources.map((r) =>
    resourceToRow(r)
      .map((cell) => escapeCsv(cell))
      .join(','),
  );
  return `\uFEFF${[header, ...lines].join('\n')}`;
}

function getStorageKey(spreadsheetId?: string): string {
  const suffix = spreadsheetId?.trim() || 'default';
  return `${LOCAL_RESOURCES_STORAGE_PREFIX}_${suffix}`;
}

export function readLocalResourcesCache(
  spreadsheetId?: string,
): TeachingResource[] | null {
  try {
    const raw = localStorage.getItem(getStorageKey(spreadsheetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as TeachingResource[];
  } catch {
    return null;
  }
}

export function writeLocalResourcesCache(
  spreadsheetId: string | undefined,
  resources: TeachingResource[],
): void {
  try {
    localStorage.setItem(getStorageKey(spreadsheetId), JSON.stringify(resources));
  } catch {
    // ignore storage quota errors
  }
}
