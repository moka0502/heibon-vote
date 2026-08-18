# heibon-vote 仕様書

現行動作の正確な記述。コードと乖離したら都度ここを更新する(「あるべき姿」の議論は各ファイルのコメント/CLAUDE.mdへ、ここは「今こう動く」だけを書く)。

作成: 2026-08-15。対象コミット: `00ed25d`時点。

## 概要

ランダムに10問(二択)出題し、各問で「世間の多数派」と何問一致できるかを競うクイズアプリ。属性(年代・性別・血液型・利き手)は各投票にタグ付けするが、多数派判定・平凡度スコア自体には使わない(属性別内訳の表示にのみ使う)。

## 技術構成

- サーバー: Node.js + Express (`server/index.js`)。ポート4322固定
- DB: better-sqlite3、ファイルは`server/data/heibon-vote.db`(gitignore対象、起動時に自動作成・自動seed)
- フロント: ビルドツールなしVanilla HTML/CSS/JS(ESモジュール)。`www/js/app.js`が画面遷移・状態管理、`www/js/render.js`が各画面のDOM生成、`www/js/api.js`がAPIクライアント
- 静的配信とAPIを同一Expressプロセスが両方担う(`app.use(express.static(...))`)

## データモデル(`server/db/schema.sql`)

| テーブル | 役割 | 備考 |
|---|---|---|
| `categories` | お題のカテゴリ | `id`/`label`/`sort_order`/`launched`(初回リリースのスコープ絞り込み、下記) |
| `topics` | お題本体 | `category`は`categories(id)`参照、`status`は`active`/`stock`(下記) |
| `options` | お題ごとの選択肢(2つ) | PK `(topic_id, id)`、`sort_order`で表示順・タイブレーク順を決める |
| `attributes` / `attribute_values` | 属性(年代・性別・血液型・利き手)とその選択肢 | 投票には使うが多数派判定には使わない |
| `quiz_sessions` | 10問1セット完了時に確定するセッション記録 | `match_count`/`total_count`/`session_tier`をセッション確定時点のスナップショットとして保存。`voter_id`で端末ごとの履歴に絞り込む(下記) |
| `votes` | 1問への1回答 | `is_dummy`(1=シード投入の初期データ)、`voter_id`(端末識別、下記)、`majority_option_id_at_vote`(投票時点の多数派スナップショット、下記) |
| `suggestions` | ユーザーからのお題投稿 | 審査・採用は手動、管理画面なし |

`topics.status`:
- `active`: ランダム出題・カテゴリ選択・お題一覧(内訳閲覧)のいずれにも出る
- `stock`: 上記どこにも出ない。データはあるが温存中。カテゴリ内で取捨選択した際、削除ではなくここに落とす運用

`categories.launched`(2026-08-16追加): 初回リリースのスコープ絞り込み用。`0`のカテゴリは`GET /api/categories`・`GET /api/topics`・カテゴリ非指定の`GET /api/topics/random`のいずれにも出ない。カテゴリ指定ありの`GET /api/topics/random`(`part`込み)は`launched`を見ない(カテゴリ選択画面が`launched=1`のカテゴリしか選択肢に出さないため、通常到達しない)。データは削除せず残し、公開範囲を広げる際は`categories-seed.json`の値を変えるだけで反映される(`topics.status`と同じ考え方)。

マイグレーション(`server/db.js`の`migrate()`): `CREATE TABLE IF NOT EXISTS`では既存テーブルへの列追加ができないため、`votes.voter_id`・`topics.category`・`quiz_sessions.voter_id`・`categories.launched`は起動時に個別に`ALTER TABLE`で追いかけている。本番データが増えたら正式なマイグレーション手順に切り替える想定。

## シード(`server/seed.js`)

起動のたびに`server/data/{attributes,categories,questions}-seed.json`を読み込んで反映する。

- `categories`・`attributes`・`attribute_values`: UPSERTで同期(`label`の変更もJSON編集だけでDBに反映される)
- `topics`: `question`/`category`/`status`は毎回UPSERTで最新化(JSON追記だけで既存の実票・履歴を壊さず反映できる)
- `options`: `INSERT OR IGNORE`(一度作った選択肢の`label`は変えない)
- 初期データ(`dummyVotes`): そのお題に一件も初期データがなければ`questions-seed.json`の`dummyVotes`比率通りに`is_dummy=1`の票を投入。既に入っていれば再投入しない(再起動のたびに水増しされるのを防ぐ)

## 多数派判定ロジック(`server/majority.js`)

- 母集団は「初期データ + 実票」を合算するのが基本(自己増殖的に育つ設計)
- **実データ閾値(`REAL_VOTE_MAJORITY_THRESHOLD = 100`)**: あるお題について実データ(`is_dummy=0`、同一`voter_id`は最新1票のみ、`server/votes-dedup.js`)が100件を超えたら、以後そのお題は実データのみを多数派判定の母集団とし、不要になった初期データ(`is_dummy=1`)を`DELETE`する。一度100件を超えたら二度と初期データには戻らない(削除済みのため)
- **同数タイブレーク**: 得票数が同じ場合は`options.sort_order`が小さい方(お題定義で先に書かれた選択肢)を多数派とみなす。乱数は使わない、決定的

## 投票の正誤判定(`server/routes/votes.js` / `server/routes/sessions.js`)

- `POST /api/votes`時点で、その一票を数える**前**の多数派を`majority_option_id_at_vote`としてスナップショットし、`votes`テーブルに保存する
- クライアントには、その一票を含めた最新の内訳(`percentages`)と、その一票が多数派と一致したか(`isMajorityMatch`)を返す。`percentages`は`server/majority.js`の`percentagesFor()`で計算し、最後の選択肢だけ「残り」として算出することで合計が必ず100%になるようにしている(各選択肢を独立に`Math.round`すると101%等になる実例が確認されたため、2026-08-16に修正)
- `POST /api/sessions`(10問終わった時点)では、クライアントの自己申告を一切信用せず、`votes.majority_option_id_at_vote`と`votes.option_id`をサーバー側で突き合わせて`match_count`を再計算する。`voteIds`はちょうど10件でないと400、既に別のセッションに使われたvoteIdが含まれる場合も400(2026-08-16、大規模テストで発見した不具合への対応。以前はどちらも未検証で、他セッションのvoteIdを再送すると元セッションの内訳が消える不具合があった)

## 重複投票の扱い(`server/votes-dedup.js`)

- `localStorage`に`voterId`(UUID、`www/js/storage.js`の`getVoterId()`)を持たせ、投票に添付する
- 集計(多数派判定・属性別内訳)は常に`voter_id`ごとの最新1票のみを使う(`ROW_NUMBER() OVER (PARTITION BY voter_id ORDER BY id DESC)`)
- `voter_id`がNULLの行(初期データ・旧データ)はそれぞれ個別の1票としてそのまま数える

## 属性別内訳(`server/routes/topics.js`)

- `GET /api/topics/:id/breakdown`は、**選択肢ごとの全体%(`percentages`/`majorityOptionId`/`totalVotes`、多数派判定と同じ母集団=初期データ+実データ)を常に返す**。クライアント(`renderTopicBreakdown`)はこの全体%を実データ件数によらず常に表示する(2026-08-17、マーケレビュー: %まで隠すとローンチ初期は「何も見せない機能」に見えるという指摘)
- **属性別クロス集計(`breakdown`)のみ**、そのお題の実データ(`voter_id`最新1票のみ)が`BREAKDOWN_MIN_REAL_VOTES = 100`件に届いていなければ`realVoteCount < breakdownMinRealVotes`で出し分け、クライアントは「属性別の傾向はまだ表示できません」に倒す(サンプルが少ない属性別分析は誤読を招くため)。100件に届いていれば、投票時の`profile_json`を属性ID×選択肢ごとに集計して返す

## 平凡度ランク・通算称号(`server/tiers.js`)

セッション単位のランク(`sessionTierFor(matchCount, totalCount)`、`ratio = matchCount/totalCount`):

| 条件 | ランク |
|---|---|
| `matchCount === totalCount` | 真の平凡 |
| `ratio >= 0.8` | 平凡寄り |
| `ratio >= 0.5` | 個性あり |
| `ratio >= 0.3` | 個性派 |
| それ以外 | 唯一無二 |

満点の段階ラベルは**素の「真の平凡」を保存・履歴表示する**(2026-08-18、CX担当ペルソナ指摘: 以前は`真の平凡(今回)`をそのまま`quiz_sessions.session_tier`に保存しており、履歴一覧で「真の平凡(今回)」と過去分にも`(今回)`が残っていた)。結果画面(`renderResult`)だけは、同画面に出る**通算称号**「真の平凡」(下記)との混同を避けるため、表示時に`(今回)`を添える。

閾値は2026-08-15、`questions-seed.json`の初期データの比率を使ったモンテカルロシミュレーション(2万セッション試算)で検証済み。元は個性派境界0.2だったが「唯一無二」到達率が0.02%(実質到達不能)だったため0.3に引き上げ、約0.4%まで緩和した。ラベル文言は2026-08-16、「平凡=つまらない」ではなく「平凡=共感力があって王道」というアプリの主張に一貫させる形で言い換えた(閾値の数字自体は変更なし)。結果画面には`server/tiers.js`と同じ閾値で5段階に区切ったゲージ(`.tier-meter`)も表示し、段階ラベルだけでは伝わらない連続的なスコア位置を補う。

通算称号(`lifetimeTitleFor(perfectSessionCount)`、全セッション中`match_count === total_count`の回数):

| 条件 | 称号 |
|---|---|
| `>= 10` | 真の平凡 |
| `>= 3` | 平凡上級者 |
| `>= 1` | 平凡の卵 |
| `0` | (称号なし、`null`) |

## API一覧

| メソッド/パス | 概要 |
|---|---|
| `GET /api/attributes` | 属性一覧(年代・性別・血液型・利き手)と各選択肢 |
| `GET /api/categories` | `launched=1`かつactive問題が1問以上あるカテゴリのみ、`sort_order`順 |
| `GET /api/topics/random?count=10&category=xxx&part=N` | ランダムにactive問題を出題。`category`省略で全カテゴリから。`category`とセットで`part=1`を指定すると、そのカテゴリの中で常に同じ固定10問(`topics`の`rowid`順)。`part=2`は固定10問を除いた残り全部からランダムに10問。`part`省略時はカテゴリ全体からランダム(従来通り) |
| `GET /api/topics` | active問題の一覧(お題の内訳を見る画面用)。カテゴリの`sort_order`→お題の`question`昇順。各お題に`category`/`categoryLabel`を含み、クライアント側でカテゴリ見出しを挟んで表示する |
| `GET /api/topics/:id/breakdown` | `{topic, percentages, majorityOptionId, totalVotes, breakdown, realVoteCount, breakdownMinRealVotes}`。全体%は常に、属性別`breakdown`は実データ100件未満だと非表示扱い |
| `POST /api/votes` | `{topicId, optionId, profile, voterId}` → `{voteId, isMajorityMatch, majorityOptionId, percentages, totalVotes}`。`totalVotes`はその時点の母集団総数(初期データ+実データ、または実データのみ、`server/majority.js`の閾値ロジックに従う)。`topicId`/`optionId`/`voterId`は文字列でなければ400(`voterId`はnull/未指定は可)。`profile`はオブジェクトのうち既知の属性キー(`age`/`gender`/`blood_type`/`handedness`)かつ文字列値のみ採用し、それ以外(配列・巨大JSON・未知キー)は無視して空扱い(2026-08-18、開発運用者ペルソナの意地悪テストで、voterId非文字列が500・profile無検証で1MB級JSON保存できた点への対応) |
| `POST /api/sessions` | `{voteIds, voterId}` → 10問分のvoteIdを1セッションに束ね、サーバー側で正誤を再計算・確定 → `{sessionId, matchCount, totalCount, tier, moreCommonCount, totalSessions}`。`voterId`は必須(空/未指定は400)。`moreCommonCount`はあなたより一致数が多かった(=あなたより平凡だった)セッション数で、過去のセッション数が`MIN_SESSIONS_FOR_PERCENTILE`(20件)未満の場合`null`。この`totalSessions`・`moreCommonCount`の母数は個人ではなく全員のセッション(「これまでの挑戦者」との比較のため) |
| `GET /api/sessions?voterId=xxx` | 履歴一覧(新しい順)。`voterId`はその端末の`localStorage`の匿名ID(`voter_id`)で絞り込む個人別の履歴。未指定/空は空配列 |
| `GET /api/sessions/:id` | セッション詳細+各問の内訳(%バー用) |
| `GET /api/sessions/stats?voterId=xxx` | `{perfectCount, lifetimeTitle}`。`voterId`で絞り込んだ個人の通算満点(`/:id`より先に登録、ルーティング順の都合)。未指定/空は`{perfectCount: 0, lifetimeTitle: null}` |
| `POST /api/suggestions` | `{text}`(最大500文字) → お題投稿を保存、審査は手動 |

## フロントエンド動作(`www/js/app.js`)

- 画面遷移はSPA的に`appEl.replaceChildren(node)`で行い、`mount(node, backTo)`が`history.pushState`/`popstate`と連動する。各画面は「戻ったらどこに行くか」を`backTo`として渡す。`popstate`発火時は`currentBack`(なければ`showHome`)を呼ぶ
- **プロフィール**: `localStorage`の`heibonVote.profile`に保存。未設定ならイントロ→属性設定を強制。属性設定フォーム(`renderProfileForm`)は各属性を**初期状態「未選択」**で表示し、ユーザーが選ばなかった属性はプロフィールに含めない(送信可能・必須ではない)。以前は先頭の選択肢を常に選択済み扱いにしており、未入力のつもりのユーザーの属性まで事実と異なる値で保存され、`privacy.html`の「未入力の場合は取得しません」という記述と矛盾していた(2026-08-17修正)。サーバー側(`GET /api/topics/:id/breakdown`の集計)は元々欠損した属性キーを`if (!valueId) continue`で無視する設計のため、この変更に追随済み
- **クイズ進行状態の永続化**: `localStorage`の`heibonVote.quizState`に1問答えるたびに保存。`init()`起動時、未完了のクイズがあれば`runQuiz()`で直接再開する。`showHome()`に到達する経路(戻るボタン含む)では毎回`clearQuizState()`を呼び、離脱=中断とみなして状態を破棄する(2026-08-15修正: 以前はここが抜けており、離脱後のリロードで中断したクイズに強制的に戻される不具合があった)
- **voter_id**: `localStorage`の`heibonVote.voterId`に`crypto.randomUUID()`で生成、初回アクセス時に一度だけ払い出す

## レート制限・タイムアウト・バックアップ(2026-08-16実装)

- **レート制限**(`server/index.js`、`express-rate-limit`): ログイン機能がないアプリのため「認証」は実装せず、連打・bot対策のレート制限のみ実装。`/api`全体に一般APIリミッター(1分100回/IP)、`/api/votes`・`/api/sessions`に書き込み系リミッター(1分60回/IP。1周=書き込み11回のため4〜5周の余裕。以前は30回で約2.7周で頭打ちだった)、`/api/suggestions`に専用リミッター(1分5回/IP)を重ねて適用。超過時は429と`{error: "..."}`を返す。**書き込み系リミッターはPOST等の書き込みメソッドのみに適用し、GET/HEAD(結果取得・統計取得)は対象外にする**(`writeMethodsOnly`ラッパー)。GETまで数えると、1クイズ(投票10回+セッション保存1回)だけでバケットを消費し、連続プレイの2周目で結果取得まで429になり進行中クイズが失われるため(2026-08-17修正)
- **fetchタイムアウト**(`www/js/api.js`の`request()`): `AbortController`で15秒(`REQUEST_TIMEOUT_MS`)のタイムアウトを実装。タイムアウト時は既存の`mountError`にそのまま乗る
- **DBバックアップ**(`server/backup.js`): サーバー起動時に1回+以後24時間ごとに`server/data/backups/`へタイムスタンプ付きでコピー、直近14世代のみ保持。手動実行は`npm run backup`。**コピー前に、稼働中の`db`ハンドルで`wal_checkpoint(TRUNCATE)`を実行してWALを主`.db`へflushする**(2026-08-18、CX担当ペルソナ指摘: このアプリは`journal_mode=WAL`のため、単純な`fs.copyFileSync`(主`.db`のみ)だとチェックポイント前の投票・セッションが`-wal`に残り欠落したバックアップになる。別プロセスで`openDb()`し直すとWAL競合でデータ喪失しうるため、必ず既存ハンドルを使う)。ホスト側と同じディスク上のため、ホスト障害には無力(誤操作・バグからの復旧用)。常時ホスティング移行後、本格的なバックアップ(別ストレージへの定期スナップショット等)への切り替えを想定

## セキュリティヘッダー(`server/index.js`、2026-08-16実装)

- **X-Frame-Options: DENY**: クリックジャッキング対策
- **Content-Security-Policy**: `script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'` を全レスポンスに付与。`www/index.html`が外部scriptタグのみ(インラインscript/styleなし)、GSAPはCDNでなくローカル同梱のため`'self'`のみで機能を壊さず適用できている
- **ペイロードサイズ上限**: `express.json({ limit: '1mb' })`。このアプリのAPIは短文フィールドのみ扱うため十分な余裕を持たせた値
- **CORS**: 明示的な設定はなし。Capacitorの「リモートURL型」構成ではWebViewが本番URLを直接開くため実質同一オリジンになり、CORS制約が発生しない前提(ネイティブ埋め込み型に変える場合は要再検討)

## プライバシーポリシー

`www/privacy.html`(静的ページ、Homeフッターからリンク)。収集する情報(匿名`voterId`・回答内容・属性情報(任意)・お題提案文)を`schema.sql`の実データに即して記載。個人を特定できる情報(氏名・メール等)は取得しない。

## iOS化(Capacitor)の準備状況(2026-08-16)

- `capacitor.config.json`(リポジトリ直下)を作成済み。`server.url`は本番ドメイン未確定のためプレースホルダ。`@capacitor/core`・`@capacitor/cli`を`devDependencies`に追加済み
- `npx cap add ios`はまだ実行していない(CocoaPods/Xcodeが必要でLinux devcontainer上では完結しないため)。macOS環境が用意でき次第、`cap add ios`→`@capacitor/assets generate`→Xcodeでビルドの順で進める
- App Store掲載用マスターアイコン(`www/icons/icon-1024.png`、1024x1024)を用意済み。iOS各サイズ(@2x/@3x等)への展開は`ios/`プロジェクト作成後に`@capacitor/assets`で行う

## 未確定・保留事項

- 広告・アフィリエイト実装は優先度低として保留中
- 常時稼働の公開ホスティング(Oracle Cloud Always Free VPS想定)・Apple Developer Program登録・App Store Connect提出はユーザー本人のアカウント操作が必要なため未着手
