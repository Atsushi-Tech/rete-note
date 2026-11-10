// Claude API で記事の下書きを1本生成し、posts/ に保存します。
// 使い方: ANTHROPIC_API_KEY=... node scripts/generate-post.mjs [--date YYYY-MM-DD] [--mock]
//   --date  記事の公開日（省略時は日本時間の翌日）
//   --mock  APIを呼ばずにダミー記事で動作確認する
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter, stringifyFrontMatter } from './frontmatter.mjs';

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

本文（最初の見出しの前に導入文）`;

// ---------- 生成 ----------
async function callClaude() {
  if (mock) {
    const body = '導入文です。\n\n' + Array.from({ length: 5 }, (_, i) =>
      `## 見出し${i + 1}\n\n${'これは動作確認用のダミー本文です。'.repeat(25)}\n`).join('\n')
      + '\n| 確認項目 | 証跡 |\n| --- | --- |\n| 例 | 例 |\n';
    return `---\ntitle: 【動作確認】${next ? next.topic.split('：')[0] : 'ダミー記事'}\ncategory: ${next ? next.category : '内部監査'}\ntags: [テスト]\ndescription: 動作確認用のダミー記事です。\n${next ? '' : 'slug: mock-post\n'}---\n\n${body}`;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) fail('ANTHROPIC_API_KEY が設定されていません（GitHub の Settings → Secrets に登録してください）');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
  });
  const json = await res.json();
  if (!res.ok) fail(`Claude API がエラーを返しました（${res.status}）: ${JSON.stringify(json.error || json)}`);
  if (json.stop_reason === 'max_tokens') fail('記事が長すぎて途中で切れました。もう一度実行してください');
  return json.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

const raw = (await callClaude()).trim().replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '');
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
console.log(`作成しました: posts/${file}（${data.title}）`);
setOutput('created', 'true');
setOutput('file', `posts/${file}`);
setOutput('title', data.title.replace(/\n/g, ' '));
setOutput('date', date);
