import {
  ResourceGradeBand,
  ResourceSourceOrigin,
  ResourceType,
  TeachingResource,
} from '../types/journal';

export const RESOURCE_GRADE_BANDS: ResourceGradeBand[] = [
  '低年級 (1-2)',
  '中年級 (3-4)',
  '高年級 (5-6)',
  '跨年級通用',
];

export const RESOURCE_TYPES: ResourceType[] = [
  '自製教案 / 學習單',
  '數位互動工具',
  '研習心得筆記',
  '公開好站精選',
];

export const RESOURCE_SOURCE_ORIGINS: ResourceSourceOrigin[] = [
  '原創自製',
  '研習筆記',
  '公開精選',
];

export const SUGGESTED_TOPIC_TAGS = [
  '分數與小數',
  '幾何與空間',
  '因數與倍數',
  '時間與測量',
  '數學桌遊',
  '數位工具',
  'AI 融入教學',
  '素養導向',
  '差異化學習',
  '跨領域 STEAM',
];

export const SEED_TEACHING_RESOURCES: TeachingResource[] = [
  {
    id: 'res-ximen-scratch-tool',
    title: '百年西門 Scratch 舞台秀跨領域互動學習網',
    gradeBand: '中年級 (3-4)',
    resourceType: '數位互動工具',
    sourceOrigin: '原創自製',
    topicTags: '座標概念, Scratch, 跨領域 STEAM, 數位工具',
    summary:
      '結合街區平面座標與角色移動積木的課堂互動平台，含標準圖庫素材匯出、分組命名檢核與教師拖曳示範模式。',
    content: `## 教學應用說明

本工具原本為四年級跨領域資訊與數學「位置與座標」延伸實作設計，適合教師在課堂投影示範，或讓學生分組操作。

### 課堂引導建議
1. 先從「互動商圈地圖」觀察不同地標的 \`(x, y)\` 座標象限位置，建立正向與負向移動的空間直覺。
2. 利用「專案圖庫中心」匯出符合 Scratch 畫布比例的圖片素材，減少學生美編搜尋時間。
3. 最後搭配「命名規範與檢核」培養檔案管理與任務自我檢核習慣。`,
    resourceUrl: './ximen-scratch.html',
    author: '黃佩詩 老師 (PesMath)',
    publishedAt: '2026-11-19',
    isPublic: true,
    isPinned: true,
  },
  {
    id: 'res-fraction-division-worksheet',
    title: '高年級「異分母分數與分數除法」視覺化圖解任務學習單',
    gradeBand: '高年級 (5-6)',
    resourceType: '自製教案 / 學習單',
    sourceOrigin: '原創自製',
    topicTags: '分數與小數, 視覺表徵, 差異化學習, 學習單',
    summary:
      '從「單位分數的個數」與線段圖切割出發，拆解高年級學生最容易混淆的通分與顛倒相乘迷思概念，附三段式提問鷹架。',
    content: `## 設計理念

學生在計算「除以一個分數等於乘以它的倒數」時，往往只背誦口訣而無法解釋為什麼商會變大。本學習單透過「分裝情境」與「單位分數轉換」，讓學生用畫圖方式說出算式背後的意義。

### 課室實施三步驟
* **步驟一（具體分裝）**：先用 \`2 ÷ 1/2\` 與 \`3 ÷ 3/4\` 畫出線段圖，確認「包含除」的意義。
* **步驟二（對齊單位）**：引導學生將被除數與除數通分至相同分母，觀察「同分母後只需比較分子」的規律。
* **步驟三（雙向檢核）**：鼓勵學生口語發表圖解策略，再對照標準算式步驟。`,
    resourceUrl: '',
    author: 'PesMath 數學領域社群',
    publishedAt: '2026-09-18',
    isPublic: true,
    isPinned: true,
  },
  {
    id: 'res-ai-prompt-workshop-note',
    title: '研習筆記：運用生成式 AI 設計國小數學素養題組與誘答選項',
    gradeBand: '跨年級通用',
    resourceType: '研習心得筆記',
    sourceOrigin: '研習筆記',
    topicTags: 'AI 融入教學, 素養導向, 命題診斷',
    summary:
      '整理市級數學領域研習實作重點：如何透過「迷思概念角色設定」與「條件限制提示詞」，產出貼近國小生活情境的多層次試題。',
    content: `## 研習核心收穫

在設計評量或課堂暖身題時，AI 最大的價值不只是快速出題，而是協助教師系統化檢查「錯誤選項是否對應到真實的學生迷思」。

### 實務提示詞結構（可直接複製微調）
1. **年級與單元**：明確指定適用年段（例如：國小四年級下學期「周長與面積」）。
2. **生活情境限制**：要求使用校園或日常購物情境，避免超出該年段字彙量。
3. **誘答選項規範**：請為每個錯誤選項標註其對應的常見迷思（如「周長與面積公式混淆」、「忘記單位換算」）。

### 教師人工審題檢核點
* 數字設計是否刻意出現「整除假象」或過度繁瑣的小數運算。
* 圖形輔助標註是否精準無歧義（幾何圖形建議由教師用 GeoGebra 自行截圖補上）。`,
    resourceUrl: '',
    author: '黃佩詩 老師',
    publishedAt: '2026-08-25',
    isPublic: true,
    isPinned: false,
  },
  {
    id: 'res-geogebra-elementary-collection',
    title: 'GeoGebra 國小數學幾何與分數動態操作精選集',
    gradeBand: '跨年級通用',
    resourceType: '公開好站精選',
    sourceOrigin: '公開精選',
    topicTags: '幾何與空間, 分數與小數, 數位工具',
    summary:
      '精選免登入即可於平板或大屏直接拖曳操作的公開 GeoGebra 數學模組，涵蓋角度量測、三角形內角和剪拼、分數牆與立體展開圖。',
    content: `## 課堂大屏與平板使用建議

GeoGebra 網頁版支援觸控拖曳，非常適合教師在課堂上先請學生猜測結果，再拖曳滑桿驗證：
* **量角器與角度估測**：可隱藏刻度先讓學生估測銳角／鈍角，再開啟量角器檢核。
* **正方體 11 種展開圖**：支援 3D 摺疊動畫，解決部分學生無法在腦中翻轉平面的困難。`,
    resourceUrl: 'https://www.geogebra.org/m/h4k4w7z9',
    author: '公開資源策展',
    publishedAt: '2026-05-12',
    isPublic: true,
    isPinned: false,
  },
  {
    id: 'res-low-grade-clock-boardgame',
    title: '低年級「幾點幾分大富翁」桌遊卡與時間線操作教案',
    gradeBand: '低年級 (1-2)',
    resourceType: '自製教案 / 學習單',
    sourceOrigin: '原創自製',
    topicTags: '時間與測量, 數學桌遊, 差異化學習',
    summary:
      '針對一、二年級學生常在鐘面「接近整點時誤讀時針」設計的配對桌遊，搭配可撕式時間線卡條練習經過時間計算。',
    content: `## 常見迷思對策

例如「7 時 55 分」，低年級學生常因為時針已經非常靠近 8，而誤讀為「8 時 55 分」。透過先撥「7 時 00 分」再一格一格轉動分針觀察時針微幅移動，配合桌遊搶答卡片，能有效建立聯動概念。`,
    resourceUrl: '',
    author: '低年級共備小組',
    publishedAt: '2025-11-04',
    isPublic: true,
    isPinned: false,
  },
  {
    id: 'res-junyi-elementary-diagnostics',
    title: '均一教育平台・國小數學分年級補救與預習單元索引',
    gradeBand: '跨年級通用',
    resourceType: '公開好站精選',
    sourceOrigin: '公開精選',
    topicTags: '差異化學習, 數位工具, 素養導向',
    summary:
      '彙整公開免費影片與基礎練習題庫入口，適合教師派發課後自主複習或針對落後單元進行一對一補救練習。',
    resourceUrl: 'https://www.junyiacademy.org/course-compare/math-elem',
    author: '公開資源策展',
    publishedAt: '2025-09-01',
    isPublic: true,
    isPinned: false,
  },
];
