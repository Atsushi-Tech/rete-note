// レ点ノート ビルドスクリプト
// posts/*.md を読み込み、dist/ に静的サイトを出力します。
// 依存は marked のみ。使い方: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { parseFrontMatter } from './scripts/frontmatter.mjs';
import { renderComic } from './scripts/comic.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const includeFuture = process.argv.includes('--future');
const now = new Date();

// ---------- ユーティリティ ----------
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const base = config.basePath.replace(/\/$/, '');
const url = (p = '/') => `${base}${p}`;
const absUrl = (p = '/') => `${config.url.replace(/\/$/, '')}${url(p)}`;
const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const isoDate = (d) => d.toISOString().slice(0, 10);

function write(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); }
    else fs.copyFileSync(s, d);
  }
}

// ---------- 記事の読み込み ----------
const categoryByName = Object.fromEntries(config.categories.map((c) => [c.name, c]));
const postsDir = path.join(ROOT, 'posts');
let posts = fs.readdirSync(postsDir).filter((f) => f.endsWith('.md')).map((f) => {
  const { data, body } = parseFrontMatter(fs.readFileSync(path.join(postsDir, f), 'utf8'), f);
  for (const key of ['title', 'date', 'category']) {
    if (!data[key]) throw new Error(`${f}: ${key} がありません`);
  }
  const category = categoryByName[data.category];
  if (!category) throw new Error(`${f}: category「${data.category}」は site.config.json にありません`);
  const date = new Date(`${data.date}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`${f}: date は YYYY-MM-DD 形式で書いてください`);
  const html = marked.parse(body);
  // 同じ名前の .comic.json があれば4コマ漫画を描く
  const comicFile = path.join(postsDir, f.replace(/\.md$/, '.comic.json'));
  let comic = null;
  if (fs.existsSync(comicFile)) {
    try {
      const script = JSON.parse(fs.readFileSync(comicFile, 'utf8'));
      comic = { svg: renderComic(script), title: script.title };
    }
    catch (e) { throw new Error(`${path.basename(comicFile)}: ${e.message}`); }
  }
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return {
    slug: f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''),
    title: data.title,
    description: data.description || text.slice(0, 110) + '…',
    date, category, html, comic,
    tags: data.tags || [],
    draft: data.draft === true,
    readMinutes: Math.max(1, Math.round(text.length / 500)),
  };
});

// 下書きと未来日付の記事は公開しない（予約投稿として毎日のビルドで自動公開）
posts = posts.filter((p) => !p.draft && (includeFuture || p.date <= now));
posts.sort((a, b) => a.date - b.date || a.slug.localeCompare(b.slug));

// 分類ごとの調書番号（例: IA-003）
const counters = {};
for (const p of posts) {
  counters[p.category.code] = (counters[p.category.code] || 0) + 1;
  p.ref = `${p.category.code}-${String(counters[p.category.code]).padStart(3, '0')}`;
  p.path = `/posts/${p.slug}/`;
}
posts.reverse(); // 新しい順

// ---------- テンプレート ----------
function layout({ title, description, path: pagePath, body, type = 'website', extraHead = '' }) {
  const fullTitle = title ? `${title}｜${config.title}` : `${config.title}｜${config.tagline}`;
  const ads = config.adsense.client
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsense.client)}" crossorigin="anonymous"></script>`
    : '';
  const ga = config.googleAnalyticsId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.googleAnalyticsId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(config.googleAnalyticsId)}');</script>`
    : '';
  const nav = config.categories.map((c) =>
    `<a href="${url(`/category/${c.slug}/`)}"${pagePath.startsWith(`/category/${c.slug}/`) ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('');
  return `<!doctype html>
<html lang="${config.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || config.description)}">
<link rel="canonical" href="${absUrl(pagePath)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title || config.title)}">
<meta property="og:description" content="${esc(description || config.description)}">
<meta property="og:url" content="${absUrl(pagePath)}">
<meta property="og:site_name" content="${esc(config.title)}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="${url('/feed.xml')}">
<link rel="icon" href="${url('/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${url('/apple-touch-icon.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${url('/style.css')}">
${extraHead}${ads}${ga}
</head>
<body>
<a class="skip" href="#main">本文へ移動</a>
<header class="masthead">
  <div class="wrap masthead-inner">
    <a class="brand" href="${url('/')}">
      <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="#1d2a36"/><rect x="17" y="11" width="35" height="43" rx="4" fill="#f3f6f2"/><circle cx="17" cy="19" r="3.2" fill="#1d2a36" stroke="#9fb5a6" stroke-width="1.6"/><circle cx="17" cy="29" r="3.2" fill="#1d2a36" stroke="#9fb5a6" stroke-width="1.6"/><circle cx="17" cy="39" r="3.2" fill="#1d2a36" stroke="#9fb5a6" stroke-width="1.6"/><circle cx="17" cy="48" r="3.2" fill="#1d2a36" stroke="#9fb5a6" stroke-width="1.6"/><line x1="25" y1="20" x2="45" y2="20" stroke="#cfdcd2" stroke-width="2"/><path class="brand-mark-tick" d="M24 34 L31 42 L46 25"/></svg>
      <span class="brand-name">${esc(config.title)}</span>
    </a>
    <p class="brand-tagline">${esc(config.tagline)}</p>
  </div>
  <nav class="wrap catnav" aria-label="分類">
    <a href="${url('/')}"${pagePath === '/' ? ' aria-current="page"' : ''}>新着</a>${nav}<a href="${url('/archive/')}"${pagePath === '/archive/' ? ' aria-current="page"' : ''}>記事台帳</a>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="sitefoot">
  <div class="wrap">
    <p class="foot-name">${esc(config.title)}</p>
    <p>${esc(config.description)}</p>
    <nav class="foot-links" aria-label="サイト情報">
      <a href="${url('/about/')}">このブログについて</a>
      <a href="${url('/privacy/')}">プライバシーポリシー・免責事項</a>
      ${config.contactUrl ? `<a href="${esc(config.contactUrl)}">お問い合わせ</a>` : ''}
      <a href="${url('/feed.xml')}">RSS</a>
    </nav>
    <p class="copy">© ${now.getFullYear()} ${esc(config.author)}</p>
  </div>
</footer>
<script>
// 読んだ記事にレ点を付ける（この端末のブラウザにだけ保存）
(function(){
  var KEY='rete-read';
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return [];}}
  function save(v){try{localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}}
  var read=load();
  var cur=document.body.querySelector('[data-read-slug]');
  if(cur){var s=cur.getAttribute('data-read-slug');if(read.indexOf(s)<0){read.push(s);save(read);}}
  document.querySelectorAll('[data-slug]').forEach(function(el){
    if(read.indexOf(el.getAttribute('data-slug'))>=0)el.classList.add('is-read');
  });
})();
</script>
</body>
</html>
`;
}

const tick = '<svg class="tick" viewBox="0 0 40 32" aria-hidden="true"><path d="M3 15 L14 27 L37 3"/></svg>';

function register(list, { showCategory = true } = {}) {
  if (!list.length) return '<p class="empty">この分類の記事はまだありません。新着一覧から他の記事をお読みください。</p>';
  return `<ol class="register">
${list.map((p) => `<li class="entry" data-slug="${p.slug}">
  <span class="entry-ref">${p.ref}</span>
  <div class="entry-body">
    <a class="entry-title" href="${url(p.path)}">${esc(p.title)}</a>
    <p class="entry-desc">${esc(p.description)}</p>
    <p class="entry-meta"><time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time>${showCategory ? `<span>${esc(p.category.name)}</span>` : ''}<span>約${p.readMinutes}分</span></p>
  </div>
  <span class="entry-mark" title="読了">${tick}<span class="sr">読了</span></span>
</li>`).join('\n')}
</ol>`;
}

function adUnit() {
  if (!config.adsense.client || !config.adsense.slotInArticle) return '';
  return `<aside class="ad" aria-label="広告"><p class="ad-label">広告</p>
<ins class="adsbygoogle" style="display:block; text-align:center;" data-ad-layout="in-article" data-ad-format="fluid" data-ad-client="${esc(config.adsense.client)}" data-ad-slot="${esc(config.adsense.slotInArticle)}"></ins>
<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>`;
}

// 4コマ漫画を導入文のあと（最初の見出しの直前）に置く
function withComic(html, comic) {
  if (!comic) return html;
  const fig = `<figure class="comic">${comic.svg}<figcaption>4コマ「${esc(comic.title)}」</figcaption></figure>\n`;
  const i = html.indexOf('<h2');
  return i >= 0 ? html.slice(0, i) + fig + html.slice(i) : html + fig;
}

// 本文の2つ目の見出しの直前に広告を1つ差し込む
function withInArticleAd(html) {
  const ad = adUnit();
  if (!ad) return html;
  let n = 0;
  const out = html.replace(/<h2/g, (m) => (++n === 2 ? ad + m : m));
  return n >= 2 ? out : html;
}

// ---------- ページ生成 ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyDir(path.join(ROOT, 'static'), DIST);

// トップ（ページ分割）
const per = config.postsPerPage;
const pages = Math.max(1, Math.ceil(posts.length / per));
for (let i = 0; i < pages; i++) {
  const slice = posts.slice(i * per, (i + 1) * per);
  const pagePath = i === 0 ? '/' : `/page/${i + 1}/`;
  const pager = pages > 1 ? `<nav class="pager" aria-label="ページ送り">
    ${i > 0 ? `<a href="${url(i === 1 ? '/' : `/page/${i}/`)}">新しい記事</a>` : '<span></span>'}
    <span>${i + 1} / ${pages}</span>
    ${i < pages - 1 ? `<a href="${url(`/page/${i + 2}/`)}">古い記事</a>` : '<span></span>'}
  </nav>` : '';
  const intro = i === 0 ? `<section class="intro wrap">
    <h1 class="intro-title">監査の現場で使える知識を、<br>一件ずつ照合して書き残す。</h1>
    <p class="intro-text">内部監査、IT全般統制、情報セキュリティ。基準や用語の解説だけでなく、実際にどこを見て、何を証跡として集めるかまで踏み込みます。読み終えた記事には、あなたのブラウザでレ点が付きます。</p>
  </section>` : '';
  write(path.join(pagePath, 'index.html'), layout({
    title: i === 0 ? '' : `新着記事（${i + 1}ページ目）`,
    path: pagePath,
    body: `${intro}<section class="wrap list-section">
  <h2 class="section-title">新着記事</h2>
  ${register(slice)}
  ${pager}
</section>`,
  }));
}

// 記事台帳（全記事）
write('archive/index.html', layout({
  title: '記事台帳', path: '/archive/',
  description: `${config.title}の全記事一覧です。`,
  body: `<section class="wrap list-section">
  <h1 class="page-title">記事台帳</h1>
  <p class="page-lead">公開済みの全${posts.length}件。調書番号は分類コードと通し番号です。</p>
  ${register(posts)}
</section>`,
}));

// 分類ページ
for (const c of config.categories) {
  const list = posts.filter((p) => p.category.slug === c.slug);
  write(`category/${c.slug}/index.html`, layout({
    title: c.name, path: `/category/${c.slug}/`,
    description: `${c.name}に関する記事の一覧です。`,
    body: `<section class="wrap list-section">
  <h1 class="page-title"><span class="code">${c.code}</span>${esc(c.name)}</h1>
  <p class="page-lead">${list.length}件の記事</p>
  ${register(list, { showCategory: false })}
</section>`,
  }));
}

// 記事ページ
posts.forEach((p, idx) => {
  const newer = posts[idx - 1], older = posts[idx + 1];
  const related = posts.filter((q) => q !== p && q.category === p.category).slice(0, 3);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title, description: p.description,
    datePublished: isoDate(p.date), author: { '@type': 'Person', name: config.author },
    mainEntityOfPage: absUrl(p.path),
  };
  write(path.join(p.path, 'index.html'), layout({
    title: p.title, description: p.description, path: p.path, type: 'article',
    extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n`,
    body: `<article class="wrap article" data-read-slug="${p.slug}">
  <header class="article-head">
    <p class="article-ref"><a href="${url(`/category/${p.category.slug}/`)}">${esc(p.category.name)}</a><span>${p.ref}</span></p>
    <h1 class="article-title">${esc(p.title)}</h1>
    <p class="article-meta"><time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time><span>約${p.readMinutes}分で読めます</span></p>
  </header>
  <div class="prose">
${withInArticleAd(withComic(p.html, p.comic))}
  </div>
  ${p.tags.length ? `<ul class="tags" aria-label="タグ">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  ${adUnit()}
  ${related.length ? `<section class="related"><h2 class="section-title">同じ分類の記事</h2>${register(related, { showCategory: false })}</section>` : ''}
  <nav class="postnav" aria-label="前後の記事">
    ${older ? `<a class="prev" href="${url(older.path)}"><span>前の記事</span>${esc(older.title)}</a>` : '<span></span>'}
    ${newer ? `<a class="next" href="${url(newer.path)}"><span>次の記事</span>${esc(newer.title)}</a>` : '<span></span>'}
  </nav>
</article>`,
  }));
});

// 固定ページ（pages/*.md）
const pagesDir = path.join(ROOT, 'pages');
for (const f of fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter((x) => x.endsWith('.md')) : []) {
  const { data, body } = parseFrontMatter(fs.readFileSync(path.join(pagesDir, f), 'utf8'), f);
  const slug = f.replace(/\.md$/, '');
  const filled = body.replace(/\{\{(\w+)\}\}/g, (_, k) => esc(config[k] ?? ''));
  write(`${slug}/index.html`, layout({
    title: data.title, path: `/${slug}/`, description: data.description,
    body: `<article class="wrap article">
  <header class="article-head"><h1 class="article-title">${esc(data.title)}</h1></header>
  <div class="prose">${marked.parse(filled)}</div>
</article>`,
  }));
}

// 404
write('404.html', layout({
  title: 'ページが見つかりません', path: '/404.html',
  body: `<section class="wrap list-section">
  <h1 class="page-title">ページが見つかりません</h1>
  <p class="page-lead">URLが変わったか、記事が非公開になった可能性があります。<a href="${url('/archive/')}">記事台帳</a>から探してください。</p>
</section>`,
}));

// RSS
const rssItems = posts.slice(0, 30).map((p) => `<item>
<title>${esc(p.title)}</title><link>${absUrl(p.path)}</link><guid>${absUrl(p.path)}</guid>
<pubDate>${p.date.toUTCString()}</pubDate><category>${esc(p.category.name)}</category>
<description>${esc(p.description)}</description></item>`).join('\n');
write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(config.title)}</title><link>${absUrl('/')}</link><description>${esc(config.description)}</description><language>ja</language>
${rssItems}
</channel></rss>
`);

// sitemap / robots / ads.txt
const urls = ['/', '/archive/', ...config.categories.map((c) => `/category/${c.slug}/`), ...posts.map((p) => p.path)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${absUrl(u)}</loc></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${absUrl('/sitemap.xml')}\n`);
if (config.adsense.client) {
  write('ads.txt', `google.com, ${config.adsense.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
}

console.log(`ビルド完了: 記事 ${posts.length} 件 → dist/`);
