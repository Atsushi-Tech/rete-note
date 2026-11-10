// 新しい記事のひな形を作成します。
// 使い方: npm run new -- <slug> [YYYY-MM-DD] [分類名]
// 例:    npm run new -- access-review 2026-11-12 IT統制
import fs from 'node:fs';
import path from 'node:path';

const [slug, dateArg, category = '内部監査'] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('slug を英小文字・数字・ハイフンで指定してください。例: npm run new -- access-review');
  process.exit(1);
}
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 日本時間
const date = dateArg || today;
const file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'posts', `${date}-${slug}.md`);
if (fs.existsSync(file)) { console.error(`すでに存在します: ${file}`); process.exit(1); }

fs.writeFileSync(file, `---
title: タイトルを入力
date: ${date}
category: ${category}
tags: []
description: 検索結果に表示される120字程度の要約
draft: true
---

導入文。

## 見出し

本文。
`);
console.log(`作成しました: posts/${date}-${slug}.md（公開するときは draft: true を削除）`);
