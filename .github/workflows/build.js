const fs = require('fs').promises;
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../', 'config.json'); // Correct path to config.json
const BUILD_DIR = path.join(__dirname, '../../', 'build'); // Correct path for the build directory

const fixedHash = (path) => {
  let hash = 0n;
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 131n + BigInt(path.charCodeAt(i))) & 0x1fffffffffffffn;
  }
  return hash.toString(36);
};

const normalizeVariant = (variant) => {
  if (variant === 'regular') return { wght: 400, ital: 0 };
  if (variant === 'italic')  return { wght: 400, ital: 1 };
  if (variant.endsWith('italic')) return { wght: variant === 'italic' ? '400' : parseInt(variant, 10) || '400', ital: 1 };
  return { wght: parseInt(variant, 10) || '400', ital: 0 };
};
const buildApiString = (family, variants) => {
  const parsed = Array.from(variants).map(normalizeVariant);
  const hasItalic = parsed.some((v) => v.ital === 1);
  if (hasItalic) {
    const parts = parsed.sort((a, b) => a.ital - b.ital || a.wght - b.wght).map((v) => `${v.ital},${v.wght}`).join(';');
    return parts === '1,400' ? `${family.replace(/\s+/g, '+')}:ital@1` : `${family.replace(/\s+/g, '+')}:ital,wght@${parts}`;
  }
  const weights = parsed.map((v) => v.wght).sort((a, b) => a - b).join(';');
  return weights === '400' ? family.replace(/\s+/g, '+') : `${family.replace(/\s+/g, '+')}:wght@${weights}`;
};
const fontString = (fonts) => Object.keys(fonts).reduce((url, family, index) =>
  url + (index > 0 ? "&" : '') + "family=" + buildApiString(family, fonts[family]), "https://fonts.googleapis.com/css2?") + "&display=swap";

async function main() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);

  // clean build dir
  await fs.rm(BUILD_DIR, { recursive: true, force: true });
  await fs.mkdir(BUILD_DIR, { recursive: true });

  // write global assets
  await fs.writeFile(path.join(BUILD_DIR, `${cfg.sid}.css`), cfg.css, 'utf8');
  await fs.writeFile(path.join(BUILD_DIR, `${cfg.sid}.js`), cfg.js, 'utf8');

  const headTags = (cfg.meta.headTags || []).join('\n    ');
  const fontURL = fontString(cfg.fonts);
  const fonts = fontURL.length > 50 ? `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="${fontURL}">` : '';
  const nav = cfg.pages.reduce((acc, page) => page.path.split('/').length < 4 ? `${acc}<a href="${page.path}">${page.title}</a>` : acc, '');

  // generate pages
  for (const page of cfg.pages) {
    // derive output folder
    let rel = page.path.replace(/^\/|\/$/g, ''); // "" for root
    const outDir = path.join(BUILD_DIR, rel);
    await fs.mkdir(outDir, { recursive: true });

    // build HTML
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${page.title}</title>
    <meta name="description" content="${cfg.meta.description}">${fonts}
    <link rel="stylesheet" href="/${cfg.sid}.css">
    <link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
    <link rel="canonical" href="${cfg.meta.canonical}${page.path.slice(1)}">
    ${headTags}
  </head>
  <body class="_${fixedHash(page.path)}">${cfg.header?.content ? `
    <header>${cfg.header.content.replaceAll('<nav></nav>', `<nav>${nav}</nav>`)}</header>` : ''}
    <main>${page.content}</main>${cfg.footer?.content ? `
    <footer>${cfg.footer.content.replaceAll('<nav></nav>', `<nav>${nav}</nav>`)}</footer>` : ''}
    <script src="/${cfg.sid}.js"></script>
  </body>
</html>`;

    await fs.writeFile(path.join(outDir, 'index.html'), html, 'utf8');
  }

  // write robots.txt & sitemap.xml if provided
  if (cfg.project.robots) {
    await fs.writeFile(path.join(BUILD_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${cfg.project.sitemap}`, 'utf8');
  }
  if (cfg.project.sitemap) {
    // dummy sitemap; replace with real generation if needed
    // optimize: move sitemape list generation to cfg.pages creation loop
    const urls = cfg.pages.map(p => `<url><loc>${cfg.meta.canonical}${p.path}</loc></url>`).join('\n  ');
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`;
    await fs.writeFile(path.join(BUILD_DIR, 'sitemap.xml'), sitemap, 'utf8');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
