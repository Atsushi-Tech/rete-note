# レ点ノート

内部監査・IT統制・情報セキュリティのブログ。Markdown で書いた記事を GitHub に置くと、GitHub Actions が自動でビルドして GitHub Pages に公開します（無料）。

## フォルダ構成

| パス | 内容 |
| --- | --- |
| `posts/` | 記事（1記事 = 1つの .md ファイル） |
| `pages/` | 固定ページ（このブログについて、プライバシーポリシー） |
| `automation/` | 自動生成する記事のテーマ一覧と執筆ルール |
| `static/` | CSS・ファビコンなど、そのまま公開されるファイル |
| `site.config.json` | ブログ名、URL、分類、AdSense などの設定 |
| `build.mjs` | サイトを生成するスクリプト |
| `.github/workflows/deploy.yml` | 自動公開の設定（push 時と毎朝6:20） |
| `.github/workflows/draft.yml` | 記事の自動生成（毎晩21:10） |

## 公開までの手順

1. GitHub で新しいリポジトリを作り（例: `rete-note`）、このフォルダの中身をすべてアップロードする
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
3. `site.config.json` の `url` と `basePath` を設定する
   - `https://ユーザー名.github.io/rete-note/` で公開する場合: `"url": "https://ユーザー名.github.io"`, `"basePath": "/rete-note"`
   - 独自ドメインの場合: `"url": "https://example.com"`, `"basePath": ""`
4. main ブランチに push すると、数分で公開される（**Actions** タブで進行状況を確認できます）

## 記事の書き方

`posts/YYYY-MM-DD-英数字のslug.md` という名前でファイルを作ります。URL は `/posts/slug/` になります。

```markdown
---
title: 記事タイトル
date: 2026-11-12
category: IT統制
tags: [アクセス管理, ITGC]
description: 検索結果に出る120字程度の要約
---

本文（Markdown）
```

- `category` は `site.config.json` の `categories` にある名前（内部監査 / IT統制 / 情報セキュリティ）
- `draft: true` を付けると公開されません
- **未来の日付の記事は、その日の朝6:20のビルドで自動公開されます**（予約投稿）
- ひな形の作成: `npm run new -- access-review 2026-11-12 IT統制`

## 記事の自動生成（毎晩21:10）

起動は Claude の定期タスクが行います（毎晩21:10に下書き生成、毎朝6:20に公開ビルド）。GitHub の定時実行は数時間遅れることがあるため、下書き生成には使っていません。

`.github/workflows/draft.yml` が毎晩、翌日分の記事を Claude API で書き、プルリクエストとして提出します。内容を確認してマージすれば、翌朝6:20に公開されます。

```
21:10 下書き生成 → プルリクエスト → あなたが確認・マージ → 翌朝6:20 公開
```

### 初期設定（1回だけ）

1. [Anthropic Console](https://console.anthropic.com/) でAPIキーを発行し、利用料金のクレジットを購入する
2. GitHub のリポジトリで **Settings → Secrets and variables → Actions → New repository secret** を開き、名前 `ANTHROPIC_API_KEY` でキーを登録する
3. **Settings → Actions → General → Workflow permissions** で「Read and write permissions」を選び、「Allow GitHub Actions to create and approve pull requests」にチェックを入れる
4. **Actions → Draft daily post → Run workflow** で手動実行し、プルリクエストができることを確認する

### 4コマ漫画

記事と同じ名前の `posts/YYYY-MM-DD-slug.comic.json`（台本）があると、記事の導入文のあとに4コマ漫画が表示されます。自動生成では記事と一緒に台本も作られ、プルリクエストに台詞の一覧が載ります。

- 登場人物：レ点さん（reten・内部監査人）、守屋さん（moriya・情報セキュリティ担当）、ITくん（it）、部長（bucho）、マスコットのネコ「メモ」（neko）。毎回、女性（レ点さんか守屋さん）が必ず1人以上登場します
- 台詞を直すときは `.comic.json` の `says` を編集（`\n` で改行）
- 絵の描き方は `scripts/comic.mjs`、台本のルールは `automation/style.md` の後半

### 書く内容を調整する

| ファイル | 内容 |
| --- | --- |
| `automation/topics.json` | 記事テーマの一覧（41本分。うち11本は「AIと監査」）。上から順に使われる。使い切ると Claude が新しいテーマを選ぶ |
| `automation/style.md` | 執筆ルール（読者、文字数、正確さ、文体） |

### オプション（Settings → Secrets and variables → Actions → Variables）

| 変数 | 効果 |
| --- | --- |
| `AUTO_PUBLISH` = `true` | 確認なしで main に直接追加する（おすすめしません。下の注意を参照） |
| `ANTHROPIC_MODEL` | 使うモデルを変える（既定は `claude-sonnet-5-5`） |

### 確認のときに見ること

- 基準・法令の名称、公表年、数字が正しいか（AIは誤ることがあります）
- 自分の経験や意見を1〜2文足す。Google はAI生成かどうかより、独自の価値がある記事かを評価するため、AdSense 審査と検索順位の両方に効きます
- 公開しない記事はプルリクエストを閉じる。同じテーマで作り直したいときは `draft/日付` ブランチも削除する

## 手元で確認する

```bash
npm install
npm run build          # dist/ に出力（予約記事は除外）
npm run build:future   # 予約記事も含めて出力
npx serve dist         # http://localhost:3000 で表示
npm run draft -- --mock   # APIを使わずに自動生成の流れを試す（ダミー記事ができるので確認後に削除）
```

## 収益化（Google AdSense）

1. 記事が10〜20本ほどたまったら AdSense に申請する（プライバシーポリシーは `pages/privacy.md` に用意済み）
2. 発行されたパブリッシャーID（`ca-pub-...`）を `site.config.json` の `adsense.client` に入れる → 全ページに自動広告のコードと `ads.txt` が出力される
3. 記事内広告のユニットを作ったら、そのスロットIDを `adsense.slotInArticle` に入れる → 本文の2つ目の見出しの前と記事末尾に表示される

アクセス解析は `googleAnalyticsId`（`G-...`）を入れると有効になります。
Google Search Console の所有権確認は、HTMLタグの `content` の値を `googleSiteVerification` に入れると全ページの `<head>` に出力されます。サイトマップは `https://atsushi-tech.github.io/rete-note/sitemap.xml` です。

## 注意

- 毎日のスケジュール実行は、リポジトリに60日間コミットがないと GitHub に自動停止されます（毎日記事を追加していれば問題ありません）
- 読了マーク（レ点）は読者のブラウザ内にだけ保存されます
