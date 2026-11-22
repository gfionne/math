import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AudienceStyle = 'teaching' | 'co-prep' | 'executive';

interface GenerateSlidesRequestBody {
  title?: string;
  summary?: string;
  content?: string;
  author?: string;
  academicYear?: string;
  category?: string;
  publishedAt?: string;
  embedLabel?: string;
  audienceStyle?: AudienceStyle;
}

interface GeneratedSlide {
  slideType: 'cover' | 'overview' | 'steps' | 'highlights' | 'takeaway';
  kicker: string;
  heading: string;
  bullets: string[];
  highlightBox: string;
  speakerNotes: string;
}

interface GeneratedDeck {
  deckTitle: string;
  deckSubtitle: string;
  slides: GeneratedSlide[];
}

function stripNoisyHtmlToReadableText(raw: string): string {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' [內嵌互動網頁資源] ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getStyleDirective(style: AudienceStyle): string {
  switch (style) {
    case 'co-prep':
      return '對象為「校內數學領域共備教師社群」。請特別強調教材單元脈絡、學生常見迷思概念、教學策略設計理由與課堂觀察重點，產出 6 至 8 張投影片。';
    case 'executive':
      return '對象為「快速瀏覽與會後重點回顧」。請濃縮為 5 至 6 張高密度重點投影片，條理分明呈現核心主軸、關鍵做法與成果亮點。';
    case 'teaching':
    default:
      return '對象為「公開授課觀課教師／教學分享現場」。請依序整理為 6 至 8 張投影片，涵蓋：單元主題封面、教學脈絡與目標、課堂教學流程拆解、學生互動與任務設計、評量檢核與課堂省思總結。';
  }
}

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const OWNER_ADMIN_EMAIL = 'g.fionne@gmail.com';

function loadFirebaseConfig(): FirebaseAppletConfig | null {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = JSON.parse(
      fs.readFileSync(cfgPath, 'utf-8'),
    ) as Partial<FirebaseAppletConfig>;
    if (!raw.apiKey || !raw.projectId || !raw.firestoreDatabaseId) return null;
    return {
      apiKey: raw.apiKey,
      projectId: raw.projectId,
      firestoreDatabaseId: raw.firestoreDatabaseId,
    };
  } catch {
    return null;
  }
}

async function verifyAdminRequest(
  req: Request,
): Promise<
  | {ok: true; email: string; uid: string}
  | {ok: false; status: number; error: string}
> {
  const authHeader = String(req.headers.authorization || '').trim();
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = match?.[1]?.trim();
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: '此功能僅限已登入之管理者使用，請先登入管理者帳號。',
    };
  }

  const fbConfig = loadFirebaseConfig();
  if (!fbConfig) {
    return {
      ok: false,
      status: 500,
      error: '伺服器尚未完成 Firebase 設定，無法驗證管理者身分。',
    };
  }

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbConfig.apiKey)}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({idToken}),
      },
    );

    if (!lookupRes.ok) {
      return {
        ok: false,
        status: 401,
        error: '登入憑證已過期或無效，請重新登入管理者帳號。',
      };
    }

    const lookupData = (await lookupRes.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
      }>;
    };
    const fbUser = lookupData.users?.[0];
    const uid = String(fbUser?.localId || '').trim();
    const email = String(fbUser?.email || '').trim().toLowerCase();
    const emailVerified = Boolean(fbUser?.emailVerified);

    if (!uid || !email || !emailVerified) {
      return {
        ok: false,
        status: 403,
        error: '帳號尚未完成電子郵件驗證，無權使用管理者 AI 簡報生成功能。',
      };
    }

    if (email === OWNER_ADMIN_EMAIL) {
      return {ok: true, email, uid};
    }

    const adminDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(fbConfig.projectId)}/databases/${encodeURIComponent(fbConfig.firestoreDatabaseId)}/documents/admins/${encodeURIComponent(uid)}`;
    const adminDocRes = await fetch(adminDocUrl, {
      headers: {Authorization: `Bearer ${idToken}`},
    });

    if (adminDocRes.ok) {
      return {ok: true, email, uid};
    }

    return {
      ok: false,
      status: 403,
      error: '目前登入的帳號不具管理者權限，僅限網站管理者使用 AI 生成簡報功能。',
    };
  } catch {
    return {
      ok: false,
      status: 502,
      error: '驗證管理者身分時連線失敗，請稍後再試。',
    };
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({limit: '1mb'}));

  app.post('/api/ai/generate-slides', async (req: Request, res: Response) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({error: authCheck.error});
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error:
          '尚未偵測到伺服器端 GEMINI_API_KEY，請於 AI Studio 的 Settings > Secrets 面板確認金鑰設定。',
      });
      return;
    }

    const body = (req.body || {}) as GenerateSlidesRequestBody;
    const title = String(body.title ?? '').trim();
    const summary = String(body.summary ?? '').trim();
    const cleanedContent = stripNoisyHtmlToReadableText(
      String(body.content ?? ''),
    ).slice(0, 24000);
    const author = String(body.author ?? '').trim();
    const academicYear = String(body.academicYear ?? '').trim();
    const category = String(body.category ?? '').trim();
    const publishedAt = String(body.publishedAt ?? '').trim();
    const embedLabel = String(body.embedLabel ?? '').trim();
    const audienceStyle: AudienceStyle =
      body.audienceStyle === 'co-prep' || body.audienceStyle === 'executive'
        ? body.audienceStyle
        : 'teaching';

    if (!title && !cleanedContent && !summary) {
      res.status(400).json({
        error: '這篇文章目前沒有足夠的文字內容可供整理為簡報。',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const userPrompt = [
      `簡報風格定位：${getStyleDirective(audienceStyle)}`,
      '',
      '【期刊文章基本資料】',
      `標題：${title || '未命名文章'}`,
      academicYear ? `學年度：${academicYear}` : '',
      category ? `分類：${category}` : '',
      author ? `撰稿與彙整：${author}` : '',
      publishedAt ? `發布日期：${publishedAt}` : '',
      embedLabel ? `隨附數位資源：${embedLabel}` : '',
      summary ? `文章摘要：${summary}` : '',
      '',
      '【期刊全文內容】',
      cleanedContent || summary || title,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          systemInstruction:
            '你是一位專精於台灣國小數學教學與公開授課的教學設計顧問與簡報架構師。' +
            '請使用繁體中文（台灣教育用語），將提供的單篇教學期刊內容，提煉成適合現場大螢幕投影的教學簡報結構。' +
            '規則：\n' +
            '1. 第 1 張投影片必須是 slideType="cover" 的封面頁，heading 為精煉簡報主標題，bullets 放入 2 至 3 個關鍵核心聚焦詞句（不要冗長句子）。\n' +
            '2. 後續投影片請依教學邏輯編排（overview / steps / highlights / takeaway），每張只講一個明確主題。\n' +
            '3. 每張投影片的 bullets 陣列放 3 至 5 條重點，每條建議控制在 12 至 34 個中文字內，適合教室與研習現場從遠處投影閱讀，切忌直接複製貼上大段文章。\n' +
            '4. 若原文有具體課堂流程、分組任務、教具／數位工具或評量方式，請務必轉化為條理清晰的步驟與亮點。\n' +
            '5. highlightBox 請填入一句畫龍點睛的教學提問、核心概念或課堂金句（若該頁不需特別框選可留空字串）。\n' +
            '6. speakerNotes 提供 2 至 3 句給主講者在講台上口頭說明的提示講稿。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              deckTitle: {
                type: Type.STRING,
                description: '整份簡報的精簡主標題',
              },
              deckSubtitle: {
                type: Type.STRING,
                description: '簡報副標題，點出單元對象或核心教學主軸',
              },
              slides: {
                type: Type.ARRAY,
                description: '依照報告順序排列的投影片陣列（5 至 8 張）',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    slideType: {
                      type: Type.STRING,
                      description:
                        '投影片版型類型，必須為 cover, overview, steps, highlights, takeaway 其一',
                    },
                    kicker: {
                      type: Type.STRING,
                      description: '投影片頂部的簡短段落標籤（2 至 8 字）',
                    },
                    heading: {
                      type: Type.STRING,
                      description: '該張投影片的清晰大標題',
                    },
                    bullets: {
                      type: Type.ARRAY,
                      items: {type: Type.STRING},
                      description: '3 至 5 條精簡投影重點，每條不超過 36 字',
                    },
                    highlightBox: {
                      type: Type.STRING,
                      description:
                        '該頁的一句核心提示、教學金句或學生思考提問（選填，可為空字串）',
                    },
                    speakerNotes: {
                      type: Type.STRING,
                      description: '給主講者參考的 2 至 3 句口頭講稿',
                    },
                  },
                  required: [
                    'slideType',
                    'kicker',
                    'heading',
                    'bullets',
                    'highlightBox',
                    'speakerNotes',
                  ],
                },
              },
            },
            required: ['deckTitle', 'deckSubtitle', 'slides'],
          },
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        res.status(502).json({
          error: 'AI 未回傳有效簡報內容，請再試一次。',
        });
        return;
      }

      const parsed = JSON.parse(rawJson) as Partial<GeneratedDeck>;
      const validTypes = new Set([
        'cover',
        'overview',
        'steps',
        'highlights',
        'takeaway',
      ]);

      const slides: GeneratedSlide[] = Array.isArray(parsed.slides)
        ? parsed.slides
            .filter((s) => s && (s.heading || (s.bullets && s.bullets.length)))
            .map((s, idx) => ({
              slideType:
                idx === 0
                  ? 'cover'
                  : validTypes.has(String(s.slideType))
                    ? (s.slideType as GeneratedSlide['slideType'])
                    : 'highlights',
              kicker: String(s.kicker ?? '').trim() || `第 ${idx + 1} 頁`,
              heading: String(s.heading ?? '').trim() || title || '教學重點',
              bullets: Array.isArray(s.bullets)
                ? s.bullets
                    .map((b) => String(b ?? '').trim())
                    .filter(Boolean)
                    .slice(0, 6)
                : [],
              highlightBox: String(s.highlightBox ?? '').trim(),
              speakerNotes: String(s.speakerNotes ?? '').trim(),
            }))
        : [];

      if (slides.length === 0) {
        res.status(502).json({
          error: 'AI 回傳的投影片格式不完整，請點擊「重新生成」再試一次。',
        });
        return;
      }

      const result: GeneratedDeck = {
        deckTitle: String(parsed.deckTitle ?? '').trim() || title,
        deckSubtitle:
          String(parsed.deckSubtitle ?? '').trim() ||
          summary ||
          'PesMath 數學教學社群 · 單篇精華簡報',
        slides,
      };

      res.status(200).json(result);
    } catch (err: unknown) {
      const errorObj = err as {status?: number; message?: string};
      const status =
        typeof errorObj?.status === 'number' && errorObj.status >= 400
          ? errorObj.status
          : 500;
      const rawMessage = errorObj?.message || 'AI 生成簡報時發生未知錯誤';

      let friendlyError = `生成簡報失敗：${rawMessage}`;
      if (status === 403 || rawMessage.includes('API_KEY')) {
        friendlyError =
          'Gemini API 金鑰權限驗證失敗，請在 AI Studio 的 Settings > Secrets 檢查 GEMINI_API_KEY。';
      } else if (status === 429) {
        friendlyError =
          '目前 AI 請求次數已達暫時上限，請稍候幾秒後再試一次。';
      }

      console.error('Gemini generate-slides error:', err);
      res.status(status).json({error: friendlyError});
    }
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
