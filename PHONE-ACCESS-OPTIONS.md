# スマホでheibon-voteを見る方法(一覧・比較)

「スマホで見たい」という話がセッションのたびに繰り返されるため、検討結果をここに固定する。**次回この話が出たら、まずこのファイルを読んでから提案すること。**

作成: 2026-08-16。

## 前提(heibon-voteの制約)

heibon-voteはNode.js/Express + better-sqlite3の**サーバーが必須**(投票集計・多数派判定にDBが要る)。そのため、`kusutto-games`(サーバー不要のVanilla JS)で使えた「GitHub Pages」のような**静的ホスティングはそのままでは使えない**。この制約が下の選択肢の分かれ目になる。

## kusutto-gamesの実例(確認済み・事実)

`kusutto-games`は現在GitHubリポジトリが**Public**になっており、**GitHub Pages**が有効(`https://moka0502.github.io/kusutto-games/`が実際に200応答することを確認済み、2026-08-16)。「Publicにした」というユーザーの記憶はこれで正しかった。ただしこれはサーバー不要の構成だからこそ使えた方法で、heibon-voteには転用できない。

## 比較表

| 方法 | Private/Public | 費用 | 安定性・持続性 | 備考 |
|---|---|---|---|---|
| **Tailscale**(✅確認済み・**採用。基本これで行く**) | Private(自分の端末同士のみ) | 無料(個人利用なら制限に掛からない: 2026-04時点で6ユーザー・デバイス数無制限) | 高い。ただしdevcontainerを**rebuild**するとログイン状態ごと消える(**再起動**だけなら残る) | 2026-08-16に実機(iPhone、`iphone-12-pro`名義で既にtailnet参加済み)で動作確認済み。詳細手順は下記セクションと`.claude/skills/phone-access/SKILL.md`参照。「スマホから見たい」と言われたらこのスキルで対応する |
| LAN IP直打ち | Private(同一WiFi限定) | 無料 | 不安定。WSL2のNAT/Windows Firewallの設定次第で届かないことがある(2026-08-16に一度失敗、原因未特定のまま保留) | `ipconfig`でWindowsのIPv4を調べて`http://<IP>:4322`。追加設定なしで繋がるかは環境依存 |
| VS Code Dev Tunnels(Private) | Private(サインインしたアカウントのみ、リモートからも可) | 無料 | 本来は高いはずだが、**この環境では「Port Visibility」メニュー自体が出ない問題が未解決**(2026-08-16確認) | 原因未診断。次回はVS Codeのアカウントサインイン状態を確認するところから始める |
| VS Code Dev Tunnels(Public) | Public | 無料 | 同上、メニュー不在で試せていない | 同上 |
| localtunnel(`npx localtunnel`) | Public(一時URL) | 無料 | 低い。プロセスが頻繁に落ちる(2026-08-16に実際に発生、再起動で復旧)。初回アクセス時に謎のパスワード入力画面が出る | 今回の動作確認で実際に使用。動くが不安定でユーザー体験もよくない |
| Cloudflare Quick Tunnel(`cloudflared tunnel --url`) | Public(一時URL) | 無料 | localtunnelより安定と言われるがheibon-voteでは未検証。ユーザーが「Subincome」で使って以降敬遠している | サインイン不要、パスワード画面なし。ただしセッション限りで毎回URLが変わる点はlocaltunnelと同じ |
| ngrok(無料枠) | Public(一時URL) | 無料(要アカウント登録) | 中程度 | 未検証。認証トークンの設定が要る分、上2つよりひと手間多い |
| **GitHub Pages** | Public(常時・固定URL) | 無料 | 高い(静的サイト限定) | **heibon-voteはサーバー必須のため使えない**。kusutto-gamesはこれで解決済み |
| Cloudflare Named Tunnel | Public(常時・固定URL) | ほぼ無料(独自ドメイン代のみ、年1,000〜1,500円程度) | 高い(PC/devcontainerが起動していれば) | Cloudflareにドメインを登録する必要がある。トンネル自体は無料 |
| Oracle Cloud Always Free VPS | Public(常時・固定URL、自分でIP管理) | 無料(永久) | 高い(24/7稼働の実サーバー) | セットアップは私が代行可能だが、Oracleアカウント作成・SSH鍵発行などユーザー側の作業が一部必要。PC/devcontainerを起動していなくても常時稼働する点が他と違う |
| Render(有料Starter $7/月)+永続ディスク | Public(常時・固定URL) | 有料(月$7〜+ディスク$0.25/GB) | 高い | GitHub連携でクリックデプロイ、コード変更ほぼ不要。一番手間が少ない有料案 |
| Render(無料枠) | Public(常時URLだがデータ消失) | 無料 | 低い(致命的) | **無料枠はディスクが一時的で、再起動・再デプロイのたびに投票データが消える。heibon-voteには不適** |
| Railway | Public(常時・固定URL) | 実質有料($5トライアル後は従量課金) | 高い | 2024年以降、実質無料枠なし |
| Fly.io | Public(常時・固定URL) | 有料(無料枠廃止済み、実質$2〜8/月) | 高い | 同上 |
| DBをPostgres等に移行してRender無料枠を使う | Public(常時・固定URL) | 無料 | 高い | コード変更(`better-sqlite3`→Postgresクライアント)が必要。CLAUDE.mdの技術方針(「DB必須: ローカルNode.js + better-sqlite3」)からの転換になるため、単純な移設ではない |

## 現時点の結論・次にやること

- ユーザーは**有料オプションは今のところ検討しない**方針(2026-08-16時点)
- 「毎回一時的に見られればいい」なら → **Tailscaleに決定・確認済み**(下記「✅採用: Tailscaleでの起動手順」参照)
- 「常時アクセス可能な固定URLがほしい」なら無料での現実的な選択肢は Oracle Cloud Always Free VPS のみ(Cloudflare Named Tunnelは独自ドメイン代が発生するため「無料」ではない)。ただし今のところ「毎回一時的に見られればいい」で足りているため未着手

## ✅採用: Tailscaleでの起動手順(2026-08-16、実機のiPhoneで確認済み)

この環境(Dockerコンテナ)には`/dev/net/tun`が無く`CAP_NET_ADMIN`も落とされているため、標準的なTailscaleの使い方(TUNデバイス経由でtailnet IPに直接アクセス)は使えない。代わりに以下の2点で回避している。これがこの環境固有の要点:

1. **userspace-networkingモード**でtailscaledを起動(TUNデバイス不要、権限不要)
2. ポートの公開は tailnet IPへの直接アクセスではなく **`tailscale serve`**(HTTPSリバースプロキシとして`127.0.0.1:4322`を`https://<マシン名>.<tailnet名>.ts.net/`に橋渡し)を使う

具体的なコマンドは`.claude/skills/phone-access/SKILL.md`に手順化済み。「スマホから見たい」「サーバー落ちてる?」と言われたら、Claudeはこのスキルを実行して対応する。ユーザー側の準備は「iPhoneのTailscaleアプリで同じアカウントにログインしておく」のみ(`iphone-12-pro`として2026-08-16時点で参加済み)。

**注意点(重要)**: Tailscaleの認証状態(`/var/lib/tailscale`)はdevcontainerのバインドマウント対象外の場所に保存されるため、コンテナを**再起動**しただけなら残るが、**rebuild**すると消えて`tailscale up`での再ログイン(ブラウザでの認証URL開封、対話操作)が必要になる。バイナリのインストール自体は`.devcontainer/postCreate.sh`に追加済みなので、rebuild後も`tailscale`コマンド自体は使える状態で立ち上がる。

## 試行中: devcontainer.jsonの`portsAttributes`でPrivate可視性を明示(2026-08-16)

PORTSパネルの右クリックメニューが出ない問題への別アプローチとして、`.devcontainer/devcontainer.json`に以下を追加(コミット`ac7fe38`)。

```json
"portsAttributes": {
  "4322": {
    "label": "heibon-vote",
    "visibility": "private"
  }
}
```

これはGitHub Codespaces由来の設定項目で、ローカルDev Containersでも読まれるかは**未検証**。反映にはVS Codeの「ウィンドウのリロード」または「コンテナの再ビルド」が必要(どちらも現在のセッション・サーバー・トンネルが一旦切れる)。**次回この続きをやるときは、まずこの設定が効いたかどうか(PORTSパネルにPrivate表示が出るか、リモートから`http://<何らかのURL>`でアクセスできるか)を確認するところから始める。**
- VS Code Dev Tunnelsの「Port Visibility」メニューが出ない問題は原因未診断のまま。解決すれば追加設定なしの無料選択肢が増えるので、余裕があれば診断する価値はある
