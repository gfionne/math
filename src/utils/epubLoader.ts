import JSZip from 'jszip';

export interface EpubChapter {
  index: number;
  id: string;
  href: string;
  title: string;
}

export interface LoadedEbookEpub {
  title: string;
  creator: string;
  chapters: EpubChapter[];
  renderChapterSrcDoc: (chapterHref: string, fontSizePx: number) => Promise<string>;
}

function stripFragmentAndQuery(raw: string): string {
  return raw.split('#')[0].split('?')[0];
}

function safeDecodeUri(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalizeZipPath(baseDir: string, relativeHref: string): string {
  const cleanRel = safeDecodeUri(stripFragmentAndQuery(relativeHref)).trim();
  if (!cleanRel) return '';
  if (cleanRel.startsWith('/')) {
    return cleanRel.replace(/^\/+/, '');
  }
  const combined = baseDir ? `${baseDir}/${cleanRel}` : cleanRel;
  const parts = combined.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function getDirName(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? '' : filePath.slice(0, idx);
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

function findZipEntry(zip: JSZip, targetPath: string): JSZip.JSZipObject | null {
  const direct = zip.file(targetPath);
  if (direct) return direct;
  const lowerTarget = targetPath.toLowerCase();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir && name.toLowerCase() === lowerTarget) {
      return zip.file(name);
    }
  }
  return null;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function parseEpubBuffer(buffer: ArrayBuffer): Promise<LoadedEbookEpub> {
  const zip = await JSZip.loadAsync(buffer);

  const containerEntry = findZipEntry(zip, 'META-INF/container.xml');
  if (!containerEntry) {
    throw new Error('無效的 EPUB 檔案：找不到 META-INF/container.xml');
  }

  const containerXml = await containerEntry.async('text');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfileEl =
    containerDoc.querySelector('rootfile[full-path]') ||
    containerDoc.getElementsByTagName('rootfile')[0];
  const opfPath = rootfileEl?.getAttribute('full-path')?.trim();

  if (!opfPath) {
    throw new Error('無效的 EPUB 檔案：找不到 OPF 套件描述路徑');
  }

  const opfEntry = findZipEntry(zip, opfPath);
  if (!opfEntry) {
    throw new Error(`找不到 EPUB 內容描述檔：${opfPath}`);
  }

  const opfDir = getDirName(opfPath);
  const opfXml = await opfEntry.async('text');
  const opfDoc = parser.parseFromString(opfXml, 'application/xml');

  const titleEl =
    opfDoc.getElementsByTagName('dc:title')[0] ||
    opfDoc.querySelector('metadata title');
  const creatorEl =
    opfDoc.getElementsByTagName('dc:creator')[0] ||
    opfDoc.querySelector('metadata creator');

  const bookTitle = titleEl?.textContent?.trim() || 'EPUB 電子書';
  const bookCreator = creatorEl?.textContent?.trim() || '';

  const manifestMap = new Map<
    string,
    {id: string; href: string; mediaType: string; properties: string}
  >();

  Array.from(opfDoc.getElementsByTagName('item')).forEach((item) => {
    const id = item.getAttribute('id')?.trim();
    const rawHref = item.getAttribute('href')?.trim();
    if (!id || !rawHref) return;
    manifestMap.set(id, {
      id,
      href: normalizeZipPath(opfDir, rawHref),
      mediaType: item.getAttribute('media-type')?.trim() || '',
      properties: item.getAttribute('properties')?.trim() || '',
    });
  });

  // Parse TOC titles from EPUB 3 nav or EPUB 2 toc.ncx
  const tocTitleByHref = new Map<string, string>();

  const navItem = Array.from(manifestMap.values()).find((m) =>
    m.properties.split(/\s+/).includes('nav'),
  );
  if (navItem) {
    const navEntry = findZipEntry(zip, navItem.href);
    if (navEntry) {
      const navHtml = await navEntry.async('text');
      const navDoc = parser.parseFromString(navHtml, 'text/html');
      const navDir = getDirName(navItem.href);
      const navLinks = Array.from(navDoc.querySelectorAll('nav a[href]'));
      for (const a of navLinks) {
        const href = a.getAttribute('href') || '';
        const label = a.textContent?.replace(/\s+/g, ' ').trim();
        if (!href || !label) continue;
        const normalized = normalizeZipPath(navDir, href);
        if (normalized && !tocTitleByHref.has(normalized)) {
          tocTitleByHref.set(normalized, label);
        }
      }
    }
  }

  if (tocTitleByHref.size === 0) {
    const spineEl = opfDoc.getElementsByTagName('spine')[0];
    const tocId = spineEl?.getAttribute('toc')?.trim();
    const ncxItem =
      (tocId && manifestMap.get(tocId)) ||
      Array.from(manifestMap.values()).find(
        (m) => m.mediaType === 'application/x-dtbncx+xml',
      );
    if (ncxItem) {
      const ncxEntry = findZipEntry(zip, ncxItem.href);
      if (ncxEntry) {
        const ncxXml = await ncxEntry.async('text');
        const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
        const ncxDir = getDirName(ncxItem.href);
        const navPoints = Array.from(ncxDoc.getElementsByTagName('navPoint'));
        for (const np of navPoints) {
          const textNode = np.getElementsByTagName('text')[0];
          const contentNode = np.getElementsByTagName('content')[0];
          const label = textNode?.textContent?.replace(/\s+/g, ' ').trim();
          const src = contentNode?.getAttribute('src')?.trim();
          if (!label || !src) continue;
          const normalized = normalizeZipPath(ncxDir, src);
          if (normalized && !tocTitleByHref.has(normalized)) {
            tocTitleByHref.set(normalized, label);
          }
        }
      }
    }
  }

  // Build ordered chapters from spine
  const spineRefs = Array.from(opfDoc.getElementsByTagName('itemref'));
  const chapters: EpubChapter[] = [];

  spineRefs.forEach((ref) => {
    const idref = ref.getAttribute('idref')?.trim();
    if (!idref) return;
    const item = manifestMap.get(idref);
    if (!item) return;
    const isHtml =
      item.mediaType.includes('html') ||
      /\.(xhtml|html|htm)$/i.test(item.href);
    if (!isHtml) return;
    const idx = chapters.length;
    chapters.push({
      index: idx,
      id: item.id,
      href: item.href,
      title: tocTitleByHref.get(item.href) || `第 ${idx + 1} 節`,
    });
  });

  if (chapters.length === 0) {
    throw new Error('此 EPUB 檔案未包含可閱讀的章節內容');
  }

  const assetDataUrlCache = new Map<string, string>();

  const loadAssetAsDataUrl = async (
    zipPath: string,
  ): Promise<string | null> => {
    if (!zipPath) return null;
    const cached = assetDataUrlCache.get(zipPath);
    if (cached) return cached;
    const entry = findZipEntry(zip, zipPath);
    if (!entry) return null;
    const mime = guessMimeType(zipPath);
    const b64 = await entry.async('base64');
    const dataUrl = `data:${mime};base64,${b64}`;
    assetDataUrlCache.set(zipPath, dataUrl);
    return dataUrl;
  };

  const renderChapterSrcDoc = async (
    chapterHref: string,
    fontSizePx: number,
  ): Promise<string> => {
    const entry = findZipEntry(zip, chapterHref);
    if (!entry) {
      return '<!doctype html><html><body><p>找不到此章節內容。</p></body></html>';
    }

    const rawText = await entry.async('text');
    const chapterDir = getDirName(chapterHref);

    // Strip scripts and inline event handlers before DOM parsing
    const cleanedRaw = rawText
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<noscript[\s\S]*?>[\s\S]*?<\/noscript>/gi, '');

    const doc = parser.parseFromString(cleanedRaw, 'text/html');

    // Remove dangerous nodes and attributes
    doc
      .querySelectorAll('script, noscript, iframe, object, embed')
      .forEach((el) => el.remove());

    doc.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          /^javascript:/i.test(val)
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // Inline local CSS stylesheets from EPUB zip
    const cssBlocks: string[] = [];
    const linkEls = Array.from(
      doc.querySelectorAll('link[rel="stylesheet"][href]'),
    );
    for (const link of linkEls) {
      const href = link.getAttribute('href') || '';
      const cssZipPath = normalizeZipPath(chapterDir, href);
      const cssEntry = cssZipPath ? findZipEntry(zip, cssZipPath) : null;
      if (cssEntry) {
        const cssText = await cssEntry.async('text');
        const safeCss = cssText
          .replace(/@import[^;]*;/gi, '')
          .replace(/expression\s*\([^)]*\)/gi, '');
        cssBlocks.push(safeCss);
      }
      link.remove();
    }

    doc.querySelectorAll('style').forEach((styleEl) => {
      if (styleEl.textContent) {
        cssBlocks.push(
          styleEl.textContent
            .replace(/@import[^;]*;/gi, '')
            .replace(/expression\s*\([^)]*\)/gi, ''),
        );
      }
      styleEl.remove();
    });

    // Resolve images to data URLs so they load cleanly inside sandboxed srcDoc iframe
    const imgEls = Array.from(doc.querySelectorAll('img[src]'));
    for (const img of imgEls) {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:') || /^https?:\/\//i.test(src)) continue;
      const assetPath = normalizeZipPath(chapterDir, src);
      const dataUrl = await loadAssetAsDataUrl(assetPath);
      if (dataUrl) {
        img.setAttribute('src', dataUrl);
      }
    }

    // Resolve SVG <image> elements as well
    const svgImages = Array.from(doc.querySelectorAll('image'));
    for (const svgImg of svgImages) {
      const hrefAttr = svgImg.hasAttribute('xlink:href')
        ? 'xlink:href'
        : 'href';
      const src = svgImg.getAttribute(hrefAttr) || '';
      if (!src || src.startsWith('data:') || /^https?:\/\//i.test(src)) continue;
      const assetPath = normalizeZipPath(chapterDir, src);
      const dataUrl = await loadAssetAsDataUrl(assetPath);
      if (dataUrl) {
        svgImg.setAttribute('href', dataUrl);
        if (svgImg.hasAttribute('xlink:href')) {
          svgImg.setAttribute('xlink:href', dataUrl);
        }
      }
    }

    // Make external links open safely if clicked, or neutralize broken internal links
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });

    const bodyHtml = doc.body?.innerHTML || escapeHtmlText(rawText);

    return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
${cssBlocks.join('\n')}
:root { color-scheme: light; }
html, body {
  margin: 0;
  padding: 0;
  background-color: #FFFFFF;
  color: #1C1917;
  font-family: "Noto Serif TC", "PingFang TC", "Microsoft JhengHei", Georgia, serif;
  font-size: ${fontSizePx}px;
  line-height: 1.85;
  word-break: break-word;
}
body {
  max-width: 72ch;
  margin: 0 auto;
  padding: 28px 24px 56px;
  box-sizing: border-box;
}
img, svg {
  max-width: 100% !important;
  height: auto !important;
  display: block;
  margin: 1rem auto;
}
h1, h2, h3, h4 {
  color: #0C1D47;
  line-height: 1.35;
  margin-top: 1.5em;
  margin-bottom: 0.6em;
}
p { margin: 0.85em 0; }
table {
  max-width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.92em;
}
th, td {
  border: 1px solid #E7E5E4;
  padding: 6px 10px;
}
pre, code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #F5F2EB;
  border-radius: 4px;
}
pre {
  padding: 12px;
  overflow-x: auto;
}
blockquote {
  margin: 1rem 0;
  padding: 0.5rem 1rem;
  border-top: 1px solid #E7E5E4;
  border-bottom: 1px solid #E7E5E4;
  color: #44403C;
}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
  };

  return {
    title: bookTitle,
    creator: bookCreator,
    chapters,
    renderChapterSrcDoc,
  };
}
