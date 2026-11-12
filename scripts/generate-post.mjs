// Claude API で記事の下書きを1本生成し、posts/ に保存します。
// 使い方: ANTHROPIC_API_KEY=... node scripts/generate-post.mjs [--date YYYY-MM-DD] [--mock]
//   --date  記事の公開日（省略時は日本時間の翌日）
//   --mock  APIを呼ばずにダミー記事で動作確認する
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter, stringifyFrontMatter } from './frontmatter.mjs';
import { validateComic, comicTranscript } from './comic.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const POSTS = path.join(ROOT, 'posts');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'automation', 'topics.json'), 'utf8'));
const style = fs.readFileSync(path.join(ROOT, 'automation', 'style.md'), 'utf8');

const args = process.argv.slice(2);
const mock = args.includes('--mock');
const dateIdx = args.indexOf('--date');
const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
const tomorrow = new Date(jstNow.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const date = dateIdx >= 0 ? args[dateIdx + 1] : tomorrow;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('--date は YYYY-MM-DD 形式で指定してください');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MIN_BODY_CHARS = 1500;

function fail(msg) { console.error(`エラー: ${msg}`); process.exit(1); }
function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

// ---------- 既存記事 ----------
const existing = fs.readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => {
  const { data } = parseFrontMatter(fs.readFileSync(path.join(POSTS, f), 'utf8'), f);
  return { file: f, slug: f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''), title: data.title, date: data.date };
});
// 未マージの下書き（ワークフローが PENDING_POSTS にファイル名を渡す）も使用済みとして扱う
for (const f of (process.env.PENDING_POSTS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
  const m = f.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (m) existing.push({ file: f, slug: m[2], title: `（確認待ちの下書き）${m[2]}`, date: m[1] });
}
if (existing.some((p) => p.date === date)) {
  console.log(`${date} の記事はすでにあります。生成をスキップします。`);
  setOutput('created', 'false');
  process.exit(0);
}

// ---------- テーマ選び（topics.json の上から、未使用のもの） ----------
const used = new Set(existing.map((p) => p.slug));
const next = topics.find((t) => !used.has(t.slug));
const categoryNames = config.categories.map((c) => c.name);

const topicInstruction = next
  ? `今回のテーマ: ${next.topic}\n分類: ${next.category}`
  : `テーマ一覧を使い切りました。既存記事と重複しない、読者に役立つ新しいテーマを1つ選んでください。分類は ${categoryNames.join(' / ')} から選び、slug（英小文字とハイフン、40字以内）も決めてください。`;

const prompt = `${style}

---

${topicInstruction}

公開済み・予定済みの記事（重複を避け、関連があれば本文中で「以前の記事」として軽く触れてよい）:
${existing.map((p) => `- ${p.title}`).join('\n')}

## 出力形式
次の形式のMarkdownだけを出力してください。前置きやコードブロックの囲みは不要です。

---
title: 記事タイトル（40字程度まで。検索されやすい言葉を前半に）
category: ${next ? next.category : '分類名'}
tags: [タグ1, タグ2, タグ3]
description: 検索結果に表示される要約（100〜120字）${next ? '' : '\nslug: english-slug'}
---

本文（最初の見出しの前に導入文）

<!--COMIC-->
{"title": "4コマのタイトル（12字程度）", "panels": [
  {"characters": [{"id": "reten", "position": "left", "expression": "smile", "prop": null, "says": ""}, {"id": "it", "position": "right", "expression": "happy", "prop": "chart_down", "says": "台詞"}]},
  …4コマ分…
]}

記事の最後に <!--COMIC--> の行を置き、その後に4コマの台本を JSON だけで書いてください（コードブロックで囲まない）。`;

// ---------- 生成 ----------
async function callClaude() {
  if (mock) {
    const body = '導入文です。\n\n' + Array.from({ length: 5 }, (_, i) =>
      `## 見出し${i + 1}\n\n${'これは動作確認用のダミー本文です。'.repeat(25)}\n`).join('\n')
      + '\n| 確認項目 | 証跡 |\n| --- | --- |\n| 例 | 例 |\n';
    const mockComic = JSON.stringify({ title: '動作確認', panels: Array.from({ length: 4 }, (_, i) => ({ characters: [
      { id: 'reten', position: 'left', expression: i === 3 ? 'happy' : 'normal', prop: i === 3 ? 'red_tick' : null, says: `${i + 1}コマ目の台詞です` },
      { id: 'it', position: 'right', expression: 'smile', prop: null, says: '' }] })) });
    return `---\ntitle: 【動作確認】${next ? next.topic.split('：')[0] : 'ダミー記事'}\ncategory: ${next ? next.category : '内部監査'}\ntags: [テスト]\ndescription: 動作確認用のダミー記事です。\n${next ? '' : 'slug: mock-post\n'}---\n\n${body}\n<!--COMIC-->\n${mockComic}`;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) fail('ANTHROPIC_API_KEY が設定されていません（GitHub の Settings → Secrets に登録してください）');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, messages: [{ role: 'user', content: prompt }] }),
  });
  const json = await res.json();
  if (!res.ok) fail(`Claude API がエラーを返しました（${res.status}）: ${JSON.stringify(json.error || json)}`);
  if (json.stop_reason === 'max_tokens') fail('記事が長すぎて途中で切れました。もう一度実行してください');
  return json.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

const full = (await callClaude()).trim().replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '');
// 記事と4コマ台本を分ける
const [raw, comicRaw = ''] = full.split(/\n?<!--COMIC-->\n?/);
let comic = null;
let comicNote = '';
try {
  if (!comicRaw.trim()) throw new Error('台本が出力されませんでした');
  comic = JSON.parse(comicRaw.trim().replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, ''));
  const errs = validateComic(comic);
  if (errs.length) throw new Error(errs.join(' / '));
} catch (e) {
  comic = null;
  comicNote = `4コマの台本に問題があったため、今回は漫画なしで作成しました（${e.message}）`;
  console.warn(`注意: ${comicNote}`);
}
let parsed;
try { parsed = parseFrontMatter(raw, '生成結果'); } catch (e) { fail(`生成結果の形式が正しくありません: ${e.message}`); }
const { data, body } = parsed;

// ---------- 検証 ----------
if (!data.title) fail('タイトルがありません');
if (!data.description) fail('description がありません');
if (!categoryNames.includes(data.category)) fail(`分類「${data.category}」は site.config.json にありません`);
if (body.replace(/\s/g, '').length < MIN_BODY_CHARS) fail(`本文が短すぎます（${MIN_BODY_CHARS}字未満）`);
if (!/^##\s/m.test(body)) fail('見出し（##）がありません');
if (/https?:\/\//.test(body)) console.warn('注意: 本文にURLが含まれています。リンク先が実在するか確認してください。');

const slug = next ? next.slug : String(data.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
if (!slug) fail('slug を決められませんでした');
if (used.has(slug)) fail(`slug「${slug}」はすでに使われています`);

const out = stringifyFrontMatter({
  title: data.title,
  date,
  category: data.category,
  tags: Array.isArray(data.tags) ? data.tags : [],
  description: data.description,
}, body);

const file = `${date}-${slug}.md`;
fs.writeFileSync(path.join(POSTS, file), out);
const comicFile = file.replace(/\.md$/, '.comic.json');
if (comic) fs.writeFileSync(path.join(POSTS, comicFile), JSON.stringify(comic, null, 2) + '\n');

// プルリクエスト本文（ワークフローが使う）
const prBody = `自動生成された記事の下書きです。

確認すること:
- [ ] 基準・法令の名称や年、数字が正しい
- [ ] 存在しない事例や統計が書かれていない
- [ ] 自分の経験や意見を1〜2文加えた（オリジナリティのため）
- [ ] 4コマの台詞が不自然でない

問題なければマージしてください。公開日の朝6:20に自動で公開されます。
公開したくない場合は、このプルリクエストを閉じてください。

## 4コマ「${comic ? comic.title : 'なし'}」
${comic ? comicTranscript(comic) : comicNote}
${comic ? `\n台詞を直すときは \`posts/${comicFile}\` の says を編集してください（\\n は改行）。` : ''}
`;
fs.writeFileSync(path.join(process.env.RUNNER_TEMP || '/tmp', 'pr-body.md'), prBody);
setOutput('files', comic ? `posts/${file} posts/${comicFile}` : `posts/${file}`);
console.log(`作成しました: posts/${file}（${data.title}）`);
setOutput('created', 'true');
setOutput('file', `posts/${file}`);
setOutput('title', data.title.replace(/\n/g, ' '));
setOutput('date', date);
