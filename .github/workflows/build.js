const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, '../../', 'config.json'); // Correct path to config.json
const BUILD_DIR = path.join(__dirname, '../../', 'build'); // Correct path for the build directory

async function main() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw);

  // clean build dir
  await fs.rm(BUILD_DIR, { recursive: true, force: true });
  await fs.mkdir(BUILD_DIR, { recursive: true });

  // write global assets
  await fs.writeFile(path.join(BUILD_DIR, 'styles.css'), cfg.css, 'utf8');
  await fs.writeFile(path.join(BUILD_DIR, 'main.js'), cfg.js, 'utf8');

  // generate pages
  for (const page of cfg.pages) {
    // derive output folder
    let rel = page.path.replace(/^\/|\/$/g, ''); // "" for root
    const outDir = path.join(BUILD_DIR, rel);
    await fs.mkdir(outDir, { recursive: true });

    // build HTML
    const headTags = (cfg.meta.headTags || []).join('\n    ');
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${page.title}</title>
    <meta name="description" content="${cfg.meta.description}">
    <link rel="canonical" href="${cfg.meta.canonical}${page.path}">
    <link rel="stylesheet" href="/styles.css">
    ${headTags}
  </head>
  <body>
    ${page.content}
    <script src="/main.js"></script>
  </body>
</html>`;

    await fs.writeFile(path.join(outDir, 'index.html'), html, 'utf8');
  }

  // write robots.txt & sitemap.xml if provided
  if (cfg.project.robots) {
    await fs.writeFile(path.join(BUILD_DIR, 'robots.txt'),
      `User-agent: *\nAllow: /\nSitemap: ${cfg.project.sitemap}`, 'utf8');
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
