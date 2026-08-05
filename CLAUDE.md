# heibon-vote プロジェクト固有メモ

「真の平凡投票アプリ」。ランダムに10問出題し、各問で「世間の多数派」と何問一致できるかを競うクイズアプリ。属性(年代・性別)は各投票にタグ付けして将来の内訳表示に備えるが、多数派判定・平凡度スコア自体には使わない。将来的にiOS化(まずPWA、必要ならApp Store配信、kusutto-games同様Capacitorでラップする方針)を検討する。

共通の開発標準は `~/.claude/CLAUDE.md`(postCreateCommandで自動配置)を参照。ここにはこのプロジェクト固有の制約・quirksのみ書く。

## 現状(2026-08-05)

DB版MVP実装済み(Plan→実装→ブラウザ動作確認まで完了)。問題バンクは12問(実データ根拠6問+仮置き6問)まで拡充済み。目標100問への拡充は`server/data/questions-seed.json`への追記で継続する運用(追記だけで既存の実票・履歴を壊さず反映されることを確認済み)。

母集団は`votes`テーブルに`is_dummy=1`で投入したダミー票と、実際のプレイで貯まる実票を合算して多数派判定に使う(自己増殖的に育つ設計)。

追加で以下3件を実装・動作確認済み:
- **属性別内訳表示**: `GET /api/topics`(全件一覧)・`GET /api/topics/:id/breakdown`(お題ごとに年代/性別で見た多数派の内訳)。ホーム画面「お題の内訳を見る」から入る。ダミー票は`profile_json='{}'`のため内訳には現れず、実プレイ分のみ反映される仕様(データが少ないうちは「まだ十分なデータがありません」表示になる)
- **PWA化**: `www/manifest.webmanifest` + `www/sw.js`(静的シェルのみcache-first、`/api/*`は素通し)+ アイコン(`www/icons/`、chromiumでのスクリーンショット生成、インディゴ背景に「平」)。iOS/Android問わずホーム画面に追加して開ける
- **演出強化**: kusutto-games同様、GSAPをCDNではなくローカル同梱(`node_modules/gsap/dist/gsap.min.js`を`www/js/vendor/gsap.min.js`へ手動vendoring、`package.json`の`devDependencies`にバージョン記録)。結果画面のスコアをカウントアップ+ランクをポップインさせる演出のみ(`www/js/effects.js`)、過剰な演出は入れていない

残タスク: 平凡度ランク・通算称号の閾値調整(`server/tiers.js`)は実プレイデータが貯まってから。

## 技術方針

- **DB必須**: ローカルNode.js + better-sqlite3。DBファイルは`server/data/heibon-vote.db`(gitignore対象)。スキーマは`server/db/schema.sql`が一つの事実源
- サーバー: `server/index.js`(Express)が静的配信(`www/`)とAPI(`/api/*`)の両方を担う。`npm run dev` → `node server/index.js`、ポート4322(他プロジェクトkusutto-games:4321等との衝突回避のため据え置き)
- フロントは引き続きビルドツールなしVanilla HTML/CSS/JS(ESモジュール)。配色・質感トークン(`www/css/style.css`)は`kusutto-games`/`versant-practice`に合わせた近白背景`#faf9f7`+インディゴ`#5b5bd6`、フラット、`scale(0.96)`押下フィードバック
- 多数派判定の同数タイブレークは`options.sort_order`が小さい方を採用(決定的、乱数不要)
- 平凡度ランク・通算称号のしきい値は`server/tiers.js`に集約。現行の値は初回実装時の提案値であり、実際に遊んでみて閾値の体感が合わなければ調整する
- UI目視確認用に`chromium`+`fonts-noto-cjk`を`postCreate.sh`でインストール済み(素のイメージはCJKフォント無しでテキストがtofu表示になるため)
