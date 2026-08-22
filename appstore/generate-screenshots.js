// App Store 提出用スクリーンショット生成
//  - raw/    : 実機ピクセル等倍のアプリ画面 (1290x2796 = 6.9インチ iPhone / 提出必須サイズ)
//  - framed/ : 上記にキャッチコピーを添えた App Store 掲載用(同サイズ)
//
// 使い方(devcontainer / Linux):
//   1) 別ターミナルで `npm run dev` (http://localhost:4322)
//   2) `npm install --no-save playwright-core`
//   3) `node appstore/generate-screenshots.js`
//      ※ chromium のパスは CHROMIUM_PATH で上書きできる(既定は /usr/bin/chromium)
//
// CSS 430x932 を deviceScaleFactor 3 で撮ると 1290x2796 ちょうどになる。
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = process.env.SHOT_DIR || path.join(__dirname, 'screenshots');
const RAW = path.join(OUT, 'raw');
const FRAMED = path.join(OUT, 'framed');
const BASE = process.env.BASE_URL || 'http://localhost:4322';

const CAPTIONS = {
  '01-intro': ['「平凡」は、実はすごい', '世間の多数派と何問一致できる?'],
  '02-category': ['気になるテーマを選ぶ', '10問ぴったりで気軽に挑戦'],
  '03-question': ['2つから選ぶだけ', '難しいことは考えなくていい'],
  '04-feedback': ['その場でみんなの答えが出る', '実データにもとづく本物の割合'],
  '05-result': ['あなたの"平凡度"を判定', '満点なら「真の平凡」'],
  '06-breakdown': ['どこで外したかも一目で', '少数派だったお題ほど個性が見える'],
};

const newPhone = async (browser) =>
  browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    locale: 'ja-JP',
    isMobile: true,
    hasTouch: true,
  });

const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(RAW, `${name}.png`) });
  console.log('raw:', name);
};

// 「食事」の「その2」のように、カテゴリ名と束番号でボタンを指す。
const pickBundle = (page, categoryLabel, part) =>
  page
    .locator('.category-group')
    .filter({ hasText: categoryLabel })
    .first()
    .locator('button.category-option')
    .nth(part - 1);

const seedProfile = (page) =>
  page.evaluate(() => {
    localStorage.setItem('heibonVote.voterId', 'appstore-shot-0001');
    localStorage.setItem(
      'heibonVote.profile',
      JSON.stringify({ version: 1, values: { age: '30s', gender: 'male', blood_type: 'a', handedness: 'right' } })
    );
    localStorage.setItem('heibonVote.playedParts', JSON.stringify(['food:1']));
  });

// missIndices に含まれる設問だけ 2番目の選択肢(=少数派になりやすい)を選ぶ
async function playQuiz(page, { missIndices = [], onQuestion = null, onFeedback = null } = {}) {
  for (let q = 0; q < 10; q++) {
    if (onQuestion && q === 0) await onQuestion();
    const choices = page.locator('.card button.btn:not(.btn-primary):not(.btn-outline)');
    const n = await choices.count();
    if (!n) break;
    await choices.nth(missIndices.includes(q) && n > 1 ? 1 : 0).click();
    await page.waitForTimeout(1300);
    if (onFeedback && q === 0) await onFeedback();
    const next = page.getByRole('button', { name: '次へ' });
    if (await next.count()) {
      await next.click();
      await page.waitForTimeout(700);
    }
  }
  await page.waitForTimeout(2000);
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(FRAMED, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });

  // ===== ラン1: 初回起動 → カテゴリ選択 → 出題 → フィードバック → 満点の結果 =====
  const ctx1 = await newPhone(browser);
  const page = await ctx1.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // スプラッシュが消えるのを待つ
  await shot(page, '01-intro');

  await seedProfile(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: '挑戦する' }).click();
  await page.waitForTimeout(800);
  await shot(page, '02-category');

  // カテゴリ名は .category-group の見出しに移り、ボタンは「その1/その2」だけになった
  // (2026-08-22のUI変更)。以前は 'food Part2' のテキストで探しており、該当なしのまま
  // .first() にフォールバックして意図と違うカテゴリを撮っていた。
  const start = pickBundle(page, '食事', 2);
  await ((await start.count()) ? start : page.locator('button.category-option').first()).click();
  await page.waitForTimeout(1800);

  await playQuiz(page, {
    onQuestion: () => shot(page, '03-question'),
    onFeedback: () => shot(page, '04-feedback'),
  });
  await shot(page, '05-result');
  await ctx1.close();

  // ===== ラン2: あえて2問外して、○✕が混じった内訳を見せる =====
  const ctx2 = await newPhone(browser);
  const page2 = await ctx2.newPage();
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1200);
  await page2.evaluate(() => {
    localStorage.setItem('heibonVote.voterId', 'appstore-shot-0002');
    localStorage.setItem(
      'heibonVote.profile',
      JSON.stringify({ version: 1, values: { age: '30s', gender: 'female', blood: 'o', hand: 'right' } })
    );
  });
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1200);
  await page2.getByRole('button', { name: '挑戦する' }).click();
  await page2.waitForTimeout(800);
  const start2 = pickBundle(page2, '恋愛', 1);
  await ((await start2.count()) ? start2 : page2.locator('button.category-option').first()).click();
  await page2.waitForTimeout(1800);
  await playQuiz(page2, { missIndices: [1, 4] });

  // 「くわしい内訳を見る」を開いて、○✕が並ぶところまでスクロール
  await page2.evaluate(() => {
    const d = document.querySelector('details');
    if (d) d.open = true;
  });
  await page2.waitForTimeout(900);
  const y = await page2.evaluate(() => {
    const d = document.querySelector('details');
    return d ? window.scrollY + d.getBoundingClientRect().top - 12 : 0;
  });
  await page2.evaluate((v) => window.scrollTo(0, v), y);
  await shot(page2, '06-breakdown');
  await ctx2.close();

  // ===== キャプション付きフレーム版を生成 =====
  const ctx3 = await browser.newContext({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 });
  const framePage = await ctx3.newPage();
  for (const [name, [title, sub]] of Object.entries(CAPTIONS)) {
    const src = path.join(RAW, `${name}.png`);
    if (!fs.existsSync(src)) continue;
    const dataUri = `data:image/png;base64,${fs.readFileSync(src).toString('base64')}`;
    await framePage.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1290px; height:2796px; overflow:hidden;
    background:linear-gradient(165deg,#6b6bdd 0%,#5b5bd6 45%,#4a4ab5 100%);
    font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;
    display:flex; flex-direction:column; align-items:center;
  }
  .caption { padding:150px 80px 0; text-align:center; color:#fff; }
  .caption h1 { font-size:82px; font-weight:800; line-height:1.28; letter-spacing:.01em; }
  .caption p { margin-top:28px; font-size:42px; font-weight:500; line-height:1.5; color:rgba(255,255,255,.82); }
  .device {
    margin-top:74px; width:1010px; border-radius:64px; overflow:hidden;
    box-shadow:0 46px 90px rgba(20,20,60,.42); border:10px solid rgba(255,255,255,.92);
  }
  .device img { display:block; width:100%; }
</style></head><body>
  <div class="caption"><h1>${title}</h1><p>${sub}</p></div>
  <div class="device"><img src="${dataUri}"></div>
</body></html>`);
    await framePage.waitForTimeout(500);
    await framePage.screenshot({ path: path.join(FRAMED, `${name}.png`) });
    console.log('framed:', name);
  }
  await ctx3.close();
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
