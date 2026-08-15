# heibon-vote プロジェクト固有メモ

「真の平凡投票アプリ」。ランダムに10問出題し、各問で「世間の多数派」と何問一致できるかを競うクイズアプリ。属性(年代・性別)は各投票にタグ付けして将来の内訳表示に備えるが、多数派判定・平凡度スコア自体には使わない。将来的にiOS化(まずPWA、必要ならApp Store配信、kusutto-games同様Capacitorでラップする方針)を検討する。

共通の開発標準は `~/.claude/CLAUDE.md`(postCreateCommandで自動配置)を参照。ここにはこのプロジェクト固有の制約・quirksのみ書く。

## 実機確認済み(2026-08-15、devcontainer上でchromium+playwright-coreにより検証)

前回セッション(Windowsホスト直下、`better-sqlite3`のネイティブ差異で未確認だった9項目チェックリスト)をdevcontainer上で実際にブラウザ操作して全項目通過を確認した。過程で見つかった3件のバグは修正・再検証済み:

1. `.btn-link`ボタン(「履歴を見る」等)が連続すると`display:inline-block`で隙間なくくっつき、Home画面・結果画面で読めない一続きのリンクに見えていた → `www/css/style.css`の`.btn-link`を`display:block`に変更
2. `.bar-option-label`が`width:6.5em`固定+`text-overflow:ellipsis`で、内訳バーの「(あなた)」「(多数派)」タグが省略されて見えなくなっていた(今回の目玉機能が実質死んでいた) → `width`→`min-width`、`overflow/text-overflow/white-space`指定を削除
3. クイズ中にブラウザ「戻る」でHomeへ離脱しても`localStorage`のクイズ進行状態がクリアされず、直後にリロードすると中断したクイズへ強制的に戻されていた(「戻るボタン連動」と「リロード時再開」機能が組み合わさって起きた副作用) → `www/js/app.js`の`showHome()`冒頭で`clearQuizState()`を呼ぶように変更

以後、新たな大きめの変更をした際は同様にdevcontainer上での実機確認(可能ならplaywright-core+システムchromiumでのヘッドレス操作)をコミット前に行うこと。

## 現状(2026-08-15)

問題バンクは83問(うち`status:"active"`51問、`status:"stock"`32問)。5カテゴリ(食事11/お金10/恋愛10/季節行事10/健康カラダ10、いずれもactive)がactive10問以上に到達済み(2026-08-15)。残り6カテゴリ(住まい身支度/余暇娯楽/仕事働き方/デジタル習慣/ジンクス運試し/持ち物)は全問status:stock(カテゴリ選択・ランダムどちらにも出さない方針)。「靴下(右足/左足)」の仮置き問題は出典が見つからず削除。全問実データ根拠・2択・11カテゴリ(食事/お金/恋愛/季節行事/住まい・身支度/健康・カラダ/持ち物/デジタル習慣/ジンクス・運試し/余暇・娯楽/仕事・働き方)にタグ付け済み。仮置き(実データなし)の問題は全廃した。目標は各カテゴリ10問。`server/data/questions-seed.json`への追記で継続する運用(追記だけで既存の実票・履歴を壊さず反映されることを確認済み)。

カテゴリは当初「嗜好品・持ち物」「睡眠・生活リズム」の2つが作りづらく伸び悩んだため、健康寄りの問題(酒・タバコ・睡眠系)は「健康・カラダ」に統合し、代わりに「恋愛」「健康・カラダ」「仕事・働き方」「デジタル習慣」「ジンクス・運試し」を新設(2026-08-15)。データが取りやすいテーマ(企業アンケート文化が厚い/恋愛婚活系の調査が多い)を優先する方針に転換した。

`status`は`active`(ランダム出題・お題一覧に出る)/`stock`(優先度を下げて温存中、データはあるが今は出題しない)の2値。カテゴリ内で取捨選択した際に「削除」ではなく`stock`に落とす運用。

母集団は`votes`テーブルに`is_dummy=1`で投入したダミー票と、実際のプレイで貯まる実票を合算して多数派判定に使う(自己増殖的に育つ設計)。ただし**実データ(is_dummy=0、同一voter_idは最新1票のみ)が100件を超えたお題は、以後ダミー票を無視して実データのみを正とし、不要になったダミー票はDELETEする**(`server/majority.js`)。属性別内訳(`/:id/breakdown`)も同じ実データ100件を閾値に、届いていなければ「まだ表示できません」に倒す。

追加で以下を実装、devcontainer上で実機確認済み:
- **属性別内訳表示**: `GET /api/topics`(active一覧)・`GET /api/topics/:id/breakdown`。属性は年代・性別に加え血液型・利き手も追加(`server/data/attributes-seed.json`)。血液型・利き手を「問題」ではなく「属性」にしたのは、選べない/変わらない情報は多数派当てゲームに向かず、属性別の傾向可視化(「A型はこう回答しがち」)にこそ向くと判断したため
- **属性設定画面**: Home→「あなたについての設定」で保存済み属性を編集可能(`renderProfileForm`の編集モード)
- **お題ごとの即時フィードバック**: 回答するとその場で平凡判定+選択肢ごとの%を表示してから次の問題へ(`renderQuestionFeedback`)。`POST /api/votes`のレスポンスに`percentages`を含める
- **お題投稿フォーム**: Home→「お題を提案する」→`POST /api/suggestions`(`suggestions`テーブル、審査は今のところ手動)
- **同一端末の複数回答は最新1票のみ集計**: `localStorage`に`voterId`(UUID)を持たせ、投票に添付。`votes.voter_id`列、集計は`server/votes-dedup.js`の`getLatestRealVoteRows`で常にvoter_idごとの最新行のみ使用
- **PWA化**: `www/manifest.webmanifest` + `www/sw.js`(静的シェルのみcache-first、`/api/*`は素通し)+ アイコン(`www/icons/`、chromiumでのスクリーンショット生成、インディゴ背景に「平」)
- **演出強化**: kusutto-games同様、GSAPをCDNではなくローカル同梱。結果画面のスコアをカウントアップ+ランクをポップインさせる演出のみ(`www/js/effects.js`)

次期ロードマップ(画面遷移図・UI参考アプリ・iOSネイティブ機能候補・セキュリティチェックリスト)はArtifactに整理済み: https://claude.ai/code/artifact/f06b23ca-950b-4854-8798-e36e4b4555b9

**UI洗練化(2026-08-15、マスコットなしの方針で着手)**: 実装済み分・未着手分(70件、効果/難易度つき)は`UX-BACKLOG.md`が一つの事実源。効果高×難易度低の6件+効果高×難易度中の3件(平凡度ランクの閾値調整、ブラウザ戻る/スワイプバック連動、バックグラウンド復帰時のクイズ状態保持)を同日中に実装済み。残りは中〜低効果のものが大半。新しい気づきはそこに追記していく運用。

**平凡度ランクの閾値調整(2026-08-15)**: 実プレイデータがまだない状態で「調整」するため、`questions-seed.json`のdummyVotes比率を使ったモンテカルロシミュレーション(母集団分布どおりに回答する「典型的な人」を2万セッション分試算)で検証。元の閾値だと最低ランク「唯一無二」の出現率が0.02%(実質到達不能)だったため、`server/tiers.js`の個性派/唯一無二境界を0.2→0.3に引き上げ、約0.4%(1/250程度)まで緩和した。「平凡」(0.5〜0.8)は64.8%とちょうど良い塊で妥当と判断、変更なし。

**ブラウザ戻る連動・クイズ状態の永続化(2026-08-15)**: `www/js/app.js`の`mount(node, backTo)`が`history.pushState`/`popstate`と連動し、ブラウザの戻る・スワイプバックが画面遷移として機能するように。`www/js/storage.js`に`saveQuizState`/`getQuizState`/`clearQuizState`を追加し、クイズ進行中は1問ごとに`localStorage`へ保存、`init()`起動時に未完了のクイズがあれば再開する。 Duolingo/Typeform/Slidoの「何がイケているか」を要素分解し、ギャップを埋めた。①即時フィードバックを`.match`/`.mismatch`のテキスト色だけから、○✕アイコン+背景色の`.feedback-banner`に強化(`renderQuestionFeedback`) ②%バーを`width:0%`→目標値へアニメーションさせる`animateBarWidth`ヘルパーを新設、`renderQuestionFeedback`・`renderTopicBreakdown`両方に適用(Slido的な「結果が伸びてくる」演出) ③クイズ画面に進捗バー(`.quiz-progress-track`)を追加、テキストの「3/10問目」だけだったのを視覚化 ④選択肢タップ時に即座に画面遷移せず、選んだボタンを180ms間ハイライトしてから次へ進むよう`renderQuizQuestion`を変更(タップした実感を持たせる)。`prefers-reduced-motion`にも対応済み。画面遷移そのもの(Typeform的なスライド)は未着手で残タスク

残タスク:
- **残り6カテゴリ(住まい身支度6/余暇娯楽4/仕事働き方8/デジタル習慣6/ジンクス運試し1/持ち物2)は全てstatus:stockに落とし、10問に届くかカテゴリ統合が決まるまで非表示**(2026-08-15指示: カテゴリ選択・ランダムどちらにも「10問到達済みの5カテゴリ(食事/お金/恋愛/季節行事/健康カラダ)」のみ出す方針に確定)。持ち物(財布・腕時計2問)は当面保留、伸ばすか吸収するか未定
- ~~ランダム出題に加えて「カテゴリを選んで出題」モードの検討~~ → 2026-08-15実装済み。`categories`テーブル新設(`server/data/categories-seed.json`が一つの事実源)、`topics.category`列を追加(それまでJSONにあるだけでDBに永続化されていなかった)。`GET /api/categories`(active問題が1問以上あるカテゴリのみ返す)・`GET /api/topics/random?category=xxx`。Home→「挑戦する」→カテゴリ選択画面(`renderCategoryPicker`)→ランダム or 特定カテゴリで開始
- **SPEC.md未作成**: 今日決めた仕様(100件閾値、active/stock運用、voter_id方式など)がコード以外に残っていない。次に大きな変更をする前に作るのが望ましい(2026-08-15、着手予定)
- 広告・アフィリエイト実装(優先度低、ユーザー指示により保留)
- 堅牢性: グローバル例外ハンドラ・クイズ途中状態のlocalStorage復元・fetchタイムアウト処理は未実装(iOS化前に対応推奨)
- API認証・レート制限は未実装(公開運用前に要対応)
- 属性「靴下(右足/左足)」の仮置きは意図的に据え置き(靴の統計はあるが靴下そのものの信頼できる出典が見つかっていない)

## 技術方針

- **DB必須**: ローカルNode.js + better-sqlite3。DBファイルは`server/data/heibon-vote.db`(gitignore対象)。スキーマは`server/db/schema.sql`が一つの事実源
- サーバー: `server/index.js`(Express)が静的配信(`www/`)とAPI(`/api/*`)の両方を担う。`npm run dev` → `node server/index.js`、ポート4322(他プロジェクトkusutto-games:4321等との衝突回避のため据え置き)
- フロントは引き続きビルドツールなしVanilla HTML/CSS/JS(ESモジュール)。配色・質感トークン(`www/css/style.css`)は`kusutto-games`/`versant-practice`に合わせた近白背景`#faf9f7`+インディゴ`#5b5bd6`、フラット、`scale(0.96)`押下フィードバック
- 多数派判定の同数タイブレークは`options.sort_order`が小さい方を採用(決定的、乱数不要)
- 平凡度ランク・通算称号のしきい値は`server/tiers.js`に集約。現行の値は初回実装時の提案値であり、実際に遊んでみて閾値の体感が合わなければ調整する
- UI目視確認用に`chromium`+`fonts-noto-cjk`を`postCreate.sh`でインストール済み(素のイメージはCJKフォント無しでテキストがtofu表示になるため)
