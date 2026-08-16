#!/bin/bash
set -e

# 共通開発標準・Obsidian連携をコンテナのホームに配置
mkdir -p ~/.claude/scripts
cp .devcontainer/global-standards.md ~/.claude/CLAUDE.md
cp .devcontainer/vault_archive.py ~/.claude/scripts/vault_archive.py
cp .devcontainer/global-settings.json ~/.claude/settings.json

# python3（SessionEndフックのvault_archive.pyが依存。javascript-node系イメージには標準で入っていないため明示インストール）
sudo apt-get update
sudo apt-get install -y python3

# Node.jsはベースイメージに20系が入っているため、Claude Code CLIのインストールのみでよい
sudo npm install -g @anthropic-ai/claude-code

# gh CLI（既存プロジェクトversant-practice/toeic-marksheet-scorer/kusutto-gamesのコンテナ環境で使用していたものを踏襲）
type -p curl >/dev/null || sudo apt-get install -y curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt-get update
sudo apt-get install -y gh

# Tailscale(スマホからのアクセス用。バインドマウントされないコンテナ内state配置のため、
# バイナリのインストールのみここで自動化する。tailscaledの起動・`tailscale up`ログインは
# コンテナ起動ごとの手動/スキル実行に委ねる。手順はPHONE-ACCESS-OPTIONS.md、
# 自動実行は.claude/skills/phone-access/SKILL.mdを参照)
curl -fsSL https://pkgs.tailscale.com/stable/debian/bullseye.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg > /dev/null
curl -fsSL https://pkgs.tailscale.com/stable/debian/bullseye.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list > /dev/null
sudo apt-get update
sudo apt-get install -y tailscale

# ffmpeg/fonts-liberationは今回省略(音声・画像の事前生成が発生しないため)

# UI目視確認用(Playwright等からsystem chromiumを起動してスクリーンショットを撮る)。
# fonts-noto-cjkが無いと日本語テキストがtofu(空白の四角)表示になるため必須で入れておく
sudo apt-get install -y chromium fonts-noto-cjk

# ローカルDB・APIサーバー等(package.jsonのdependencies)
npm install
