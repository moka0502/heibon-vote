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

- `GET /api/topics/:id/breakdown`は、そのお題の実データ(`voter_id`最新1票のみ)が`BREAKDOWN_MIN_REAL_VOTES = 100`件に届いていなければ、`realVoteCount < breakdownMinRealVotes`をクライアントに返し、クライアント側は「属性別の傾向はまだ表示できません」に倒す
- 100件に届いていれば、投票時の`profile_json`を属性ID×選択肢ごとに集計して返す

## 平凡度ランク・通算称号(`server/tiers.js`)

セッション単位のランク(`sessionTierFor(matchCount, totalCount)`、`ratio = matchCount/totalCount`):

| 条件 | ランク |
|---|---|
| `matchCount === totalCount` | 真の平凡(今回) |
| `ratio >= 0.8` | 平凡寄り |
| `ratio >= 0.5` | 個性あり |
| `ratio >= 0.3` | 個性派 |
| それ以外 | 唯一無二 |

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
| `GET /api/topics/:id/breakdown` | 属性別内訳(100件未満は非表示扱い) |
| `POST /api/votes` | `{topicId, optionId, profile, voterId}` → `{voteId, isMajorityMatch, majorityOptionId, percentages, totalVotes}`。`totalVotes`はその時点の母集団総数(初期データ+実データ、または実データのみ、`server/majority.js`の閾値ロジックに従う) |
| `POST /api/sessions` | `{voteIds, voterId}` → 10問分のvoteIdを1セッションに束ね、サーバー側で正誤を再計算・確定 → `{sessionId, matchCount, totalCount, tier, moreCommonCount, totalSessions}`。`voterId`は必須(空/未指定は400)。`moreCommonCount`はあなたより一致数が多かった(=あなたより平凡だった)セッション数で、過去のセッション数が`MIN_SESSIONS_FOR_PERCENTILE`(20件)未満の場合`null`。この`totalSessions`・`moreCommonCount`の母数は個人ではなく全員のセッション(「これまでの挑戦者」との比較のため) |
| `GET /api/sessions?voterId=xxx` | 履歴一覧(新しい順)。`voterId`はその端末の`localStorage`の匿名ID(`voter_id`)で絞り込む個人別の履歴。未指定/空は空配列 |
| `GET /api/sessions/:id` | セッション詳細+各問の内訳(%バー用) |
| `GET /api/sessions/stats?voterId=xxx` | `{perfectCount, lifetimeTitle}`。`voterId`で絞り込んだ個人の通算満点(`/:id`より先に登録、ルーティング順の都合)。未指定/空は`{perfectCount: 0, lifetimeTitle: null}` |
| `POST /api/suggestions` | `{text}`(最大500文字) → お題投稿を保存、審査は手動 |

## フロントエンド動作(`www/js/app.js`)

- 画面遷移はSPA的に`appEl.replaceChildren(node)`で行い、`mount(node, backTo)`が`history.pushState`/`popstate`と連動する。各画面は「戻ったらどこに行くか」を`backTo`として渡す。`popstate`発火時は`currentBack`(なければ`showHome`)を呼ぶ
- **プロフィール**: `localStorage`の`heibonVote.profile`に保存。未設定ならイントロ→属性設定を強制
- **クイズ進行状態の永続化**: `localStorage`の`heibonVote.quizState`に1問答えるたびに保存。`init()`起動時、未完了のクイズがあれば`runQuiz()`で直接再開する。`showHome()`に到達する経路(戻るボタン含む)では毎回`clearQuizState()`を呼び、離脱=中断とみなして状態を破棄する(2026-08-15修正: 以前はここが抜けており、離脱後のリロードで中断したクイズに強制的に戻される不具合があった)
- **voter_id**: `localStorage`の`heibonVote.voterId`に`crypto.randomUUID()`で生成、初回アクセス時に一度だけ払い出す

## セキュリティ・堅牢性の既知のギャップ

- API認証・レート制限は未実装
- グローバル例外ハンドラ・fetchタイムアウト処理は未実装
- `express.json()`のボディサイズ上限はデフォルトのまま(明示的な制限なし)

## 未確定・保留事項

- 広告・アフィリエイト実装は優先度低として保留中
