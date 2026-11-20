import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Automatically synchronize index.html <title> and meta tags from site-config.json
      {
        name: 'inject-site-config-html-title',
        transformIndexHtml(html) {
          try {
            const configPath = path.resolve(__dirname, 'site-config.json');
            if (!fs.existsSync(configPath)) return html;
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const titleText = [cfg.siteTitle, cfg.siteSubtitle]
              .filter(Boolean)
              .join(' | ');
            const descText = cfg.heroDescription || '';

            const escapeHtmlAttr = (val: string) =>
              val
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

            let updated = html;
            if (titleText) {
              const safeTitle = escapeHtmlAttr(titleText);
              updated = updated.replace(
                /<title>[\s\S]*?<\/title>/,
                `<title>${safeTitle}</title>`,
              );
              updated = updated.replace(
                /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
                `<meta property="og:title" content="${safeTitle}" />`,
              );
            }
            if (descText) {
              const safeDesc = escapeHtmlAttr(descText);
              updated = updated.replace(
                /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
                `<meta name="description" content="${safeDesc}" />`,
              );
              updated = updated.replace(
                /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
                `<meta property="og:description" content="${safeDesc}" />`,
              );
            }
            return updated;
          } catch {
            return html;
          }
        },
      },
      // Dev middleware allowing developers in AI Studio to update site-config.json
      // with a single click in the UI before committing/deploying.
      {
        name: 'site-config-api',
        configureServer(server) {
          server.middlewares.use('/api/save-site-config', (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({error: 'Method Not Allowed'}));
              return;
            }

            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const targetPath = path.resolve(__dirname, 'site-config.json');
                const existing = fs.existsSync(targetPath)
                  ? JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
                  : {};
                const parsed = JSON.parse(body || '{}');

                const nextConfig = {
                  spreadsheetId:
                    parsed.spreadsheetId !== undefined
                      ? String(parsed.spreadsheetId).trim()
                      : existing.spreadsheetId || '',
                  tabName:
                    (parsed.tabName !== undefined
                      ? String(parsed.tabName).trim()
                      : existing.tabName) || 'Posts',
                  siteTitle:
                    (parsed.siteTitle !== undefined
                      ? String(parsed.siteTitle).trim()
                      : existing.siteTitle) || 'PesMath 數學期刊',
                  siteSubtitle:
                    (parsed.siteSubtitle !== undefined
                      ? String(parsed.siteSubtitle).trim()
                      : existing.siteSubtitle) ||
                    'PesMath 數學教學社群 · 期刊與知識專欄',
                  heroHeading:
                    (parsed.heroHeading !== undefined
                      ? String(parsed.heroHeading).trim()
                      : existing.heroHeading) || 'AI領航 徜徉酷數',
                  heroDescription:
                    (parsed.heroDescription !== undefined
                      ? String(parsed.heroDescription).trim()
                      : existing.heroDescription) ||
                    '網站彙整pes在數學教育上的設計、開發與研究，結合數位學習工具、ＡＩ模組規劃而建立雲端教案資源；供西門社群教師及班級親師生使用為主。',
                  autoDynamicTitle:
                    typeof parsed.autoDynamicTitle === 'boolean'
                      ? parsed.autoDynamicTitle
                      : existing.autoDynamicTitle ?? true,
                  autoTitleFromSheet:
                    typeof parsed.autoTitleFromSheet === 'boolean'
                      ? parsed.autoTitleFromSheet
                      : existing.autoTitleFromSheet ?? true,
                };

                const content = JSON.stringify(nextConfig, null, 2) + '\n';
                fs.writeFileSync(targetPath, content, 'utf-8');

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    success: true,
                    ...nextConfig,
                  }),
                );
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({error: err?.message || 'Failed to save'}));
              }
            });
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
