// アプリアイコン・スプラッシュ・PWA用アイコンを、1つの定義から焼く。
//
//   node appstore/generate-app-assets.js
//
// マーク(縦書き「平凡」)の定義をこのファイル1箇所に置き、
//   assets/       … @capacitor/assets が読む元画像(CIがここから Assets.xcassets を作る)
//   www/icons/    … PWA/Web用(manifest・apple-touch-icon)
// の両方を生成する。二重管理して片方だけ古くなるのを防ぐ(共通標準「一つの事実源」)。
//
// アルファチャンネルは必ず落とす。Appleはアプリアイコンのアルファを許さず、
// 実際の透過が0pxでもチャンネルがあるだけで弾かれる(2026-08-23に実際に該当していた)。
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const WWW_ICONS = path.join(ROOT, 'www', 'icons');
const BRAND = '#5b5bd6';
const ON_BRAND = '#ffffff';

// 縦書き「平凡」。字間は実機のホーム画面(約60px)で2文字と判別できる値を選んだ。
// 詰めすぎると1文字に見え、離しすぎると文字自体が小さくなって潰れる(2026-08-23に比較)。
const MARK_GAP_RATIO = 80 / 1024;
const MARK_FONT_RATIO = 350 / 1024;

const markHtml = (size, { bg = BRAND, fg = ON_BRAND } = {}) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{width:${size}px;height:${size}px;background:${bg};
       display:flex;align-items:center;justify-content:center}
  .col{display:flex;flex-direction:column;align-items:center;
       gap:${Math.round(size * MARK_GAP_RATIO)}px;line-height:0.8}
  span{color:${fg};font-size:${Math.round(size * MARK_FONT_RATIO)}px;font-weight:700;
       font-family:"Hiragino Sans","Yu Gothic","Noto Sans CJK JP",sans-serif}
</style><div class="col"><span>平</span><span>凡</span></div>`;

const stripAlpha = (file) => {
  execFileSync('convert', [file, '-background', BRAND, '-alpha', 'remove', '-alpha', 'off', `PNG24:${file}`]);
  const b = fs.readFileSync(file);
  if (b[25] !== 2) throw new Error(`${path.basename(file)} にアルファが残っている (colorType=${b[25]})`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

(async () => {
  fs.mkdirSync(ASSETS, { recursive: true });
  fs.mkdirSync(WWW_ICONS, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });

  const shoot = async (out, size, opts) => {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(markHtml(size, opts), { waitUntil: 'load' });
    await page.waitForTimeout(250);
    await page.screenshot({ path: out });
    await page.close();
    console.log(`${path.relative(ROOT, out)} ${stripAlpha(out)}`);
  };

  // iOSアプリ用(@capacitor/assets が読む)
  await shoot(path.join(ASSETS, 'icon.png'), 1024);
  // スプラッシュは正方形2732pxが要求サイズ。アイコンと同じマークで揃える。
  await shoot(path.join(ASSETS, 'splash.png'), 2732);
  await shoot(path.join(ASSETS, 'splash-dark.png'), 2732);
  // PWA/Web用
  await shoot(path.join(WWW_ICONS, 'icon-1024.png'), 1024);
  await shoot(path.join(WWW_ICONS, 'icon-512.png'), 512);
  await shoot(path.join(WWW_ICONS, 'icon-192.png'), 192);
  await shoot(path.join(WWW_ICONS, 'apple-touch-icon.png'), 180);

  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
