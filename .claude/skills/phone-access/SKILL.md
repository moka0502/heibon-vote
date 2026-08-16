---
name: phone-access
description: heibon-voteをスマホから見られるようにする(サーバー起動+Tailscale経由の公開)。「スマホから見たい」「サーバー落ちてる?」と言われたら使う。
---

「スマホから見たい」「サーバー落ちてる?」と言われたら、このスキルの手順で対応する。詳細な選択肢比較・経緯は`PHONE-ACCESS-OPTIONS.md`を参照(この手順はそこでの検証結果に基づく確定版)。

このdevcontainerは`/dev/net/tun`がなく`CAP_NET_ADMIN`も無いため、Tailscaleは**userspace-networkingモード**で動かし、ポート公開は`tailscale serve`(HTTPSリバースプロキシ)を使う。この2点が標準的なTailscale導入手順と違う、この環境固有の要点。

## 手順

1. **APIサーバーが動いているか確認、なければ起動**
   ```bash
   ss -tlnp | grep ':4322' || (cd /workspaces/heibon-vote && npm run dev > /tmp/heibon-server.log 2>&1 &)
   ```

2. **tailscaledが動いているか確認、なければuserspace-networkingモードで起動**
   ```bash
   sudo tailscale status >/dev/null 2>&1 || \
     sudo tailscaled --tun=userspace-networking --statedir=/var/lib/tailscale --socket=/var/run/tailscale/tailscaled.sock > /tmp/tailscaled.log 2>&1 &
   ```
   数秒待ってから`sudo tailscale status`で状態を見る。

3. **状態別の分岐**
   - `Logged out`や`NeedsLogin`が出たら、`sudo tailscale up`を実行しユーザーに表示される認証URLをブラウザで開いてもらう(初回、またはコンテナrebuild後は毎回必要。認証状態はコンテナのファイルシステムに保存されるため、コンテナ**再起動**では消えないが、**rebuild**では消える)
   - 既にログイン済みなら次のステップへ

4. **`tailscale serve`でポート4322を公開**
   ```bash
   sudo tailscale serve --bg 4322
   sudo tailscale serve status
   ```
   出力される`https://<マシン名>.<tailnet名>.ts.net/`がスマホからアクセスするURL。

5. **ユーザーに案内**: 「iPhoneのTailscaleアプリをON→SafariでこのURLを開く」と伝える。iPhone側は`iphone-12-pro`という名前でtailnetに既に参加済み(2026-08-16時点)。

## 既知の制約

- コンテナを**再起動**しただけなら、tailscaledのログイン状態は残っているが、tailscaledプロセス自体・`npm run dev`・`tailscale serve`の設定は消えるため、上記1〜4を毎回やり直す必要がある
- コンテナを**rebuild**すると、tailscaleの認証状態ごと消える(手順3から必要)。バイナリ自体は`.devcontainer/postCreate.sh`でインストール済みになる
- `curl https://<マシン名>.ts.net/`はコンテナ自身からは名前解決できないことがある(userspace-networkingモードの制約)。これは異常ではなく、実機のiPhone側では問題なく解決できる
