// アプリアイコン・スプラッシュの元画像を生成する。
// @capacitor/assets がこの assets/ を読んで iOS の Assets.xcassets を作る。
//
//   node appstore/generate-app-assets.js
//
// アイコン: www/icons/icon-1024.png からアルファチャンネルを除去して assets/icon.png へ。
//   Appleはアプリアイコンのアルファチャンネルを許さない(実際の透過が無くても弾かれる)。
// スプラッシュ: ブランド色の地に「平」を置いた 2732x2732 を chromium で描画する。
//   ImageMagick では日本語フォントの有無に左右されるため、確実な chromium 側で焼く。
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BRAND = '#5b5bd6';
const ON_BRAND = '#ffffff';
const SPLASH_SIZE = 2732; // @capacitor/assets が要求する正方形サイズ

const splashHtml = (bg, fg) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{width:${SPLASH_SIZE}px;height:${SPLASH_SIZE}px;background:${bg};
       display:flex;align-items:center;justify-content:center}
  span{color:${fg};font-size:900px;font-weight:700;line-height:1;
       font-family:"Hiragino Sans","Yu Gothic","Noto Sans CJK JP",sans-serif}
</style><span>平</span>`;

(async () => {
  fs.mkdirSync(ASSETS, { recursive: true });

  // --- アイコン(アルファ除去) ---
  const src = path.join(ROOT, 'www', 'icons', 'icon-1024.png');
  const iconOut = path.join(ASSETS, 'icon.png');
  execFileSync('convert', [src, '-background', BRAND, '-alpha', 'remove', '-alpha', 'off',
    '-resize', '1024x1024', `PNG24:${iconOut}`]);
  const iconBuf = fs.readFileSync(iconOut);
  if (iconBuf[25] !== 2) throw new Error(`アイコンにアルファが残っている (colorType=${iconBuf[25]})`);
  console.log(`icon.png ${iconBuf.readUInt32BE(16)}x${iconBuf.readUInt32BE(20)} アルファなし`);

  // --- スプラッシュ ---
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  for (const [name, bg, fg] of [['splash.png', BRAND, ON_BRAND], ['splash-dark.png', BRAND, ON_BRAND]]) {
    const page = await browser.newPage({ viewport: { width: SPLASH_SIZE, height: SPLASH_SIZE } });
    await page.setContent(splashHtml(bg, fg), { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const out = path.join(ASSETS, name);
    await page.screenshot({ path: out });
    await page.close();
    const b = fs.readFileSync(out);
    console.log(`${name} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`);
  }
  await browser.close();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
