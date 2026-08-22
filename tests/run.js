// heibon-vote のUIスモーク/回帰テスト。`npm test` で実行する。
//
// 方針(共通標準「3. 品質保証」より):
//  - 外部サービス・秘密情報なしで動く
//  - 本番/開発のDBを一切触らない(HEIBON_DATA_DIRで使い捨てディレクトリに隔離する)
//  - 開発サーバー(4322)と衝突しない別ポートで起動する
//  - 1コマンドで全部走る
//
// 実行環境: devcontainer内。ブラウザはシステムのchromiumを使う
// (CHROMIUM_PATHで差し替え可)。playwright-coreはdevDependenciesに宣言済み。
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const PORT = Number(process.env.TEST_PORT) || 4399;
const BASE = `http://localhost:${PORT}`;
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
// 起動スプラッシュと画面遷移アニメの分。実測3.5秒で安定していた。
const SETTLE_MS = 3500;

const PROFILE_SEED = () => {
  localStorage.setItem(
    'heibonVote.profile',
    JSON.stringify({ version: 1, values: { age: '40s', gender: 'male', blood_type: 'a', handedness: 'right' } })
  );
};

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

async function waitForServer(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heibon-test-'));
  let server;
  let browser;
  try {
    server = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
      env: { ...process.env, HEIBON_DATA_DIR: dataDir, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const serverLog = [];
    server.stdout.on('data', (d) => serverLog.push(d.toString()));
    server.stderr.on('data', (d) => serverLog.push(d.toString()));

    if (!(await waitForServer())) {
      throw new Error('サーバーが起動しませんでした:\n' + serverLog.join(''));
    }

    // --- APIスモーク ---
    for (const p of ['/', '/privacy.html', '/api/topics', '/api/categories', '/api/attributes']) {
      const res = await fetch(BASE + p);
      check(`API ${p} が200を返す`, res.status === 200, `status=${res.status}`);
    }

    // 回帰: 未公開カテゴリ(launched=0)のお題が配信されないこと。
    // 以前はカテゴリを明示指定した経路がlaunchedを見ておらず、URLを直接叩けば
    // 未公開のお題が取れた(2026-08-22に発見)。公開カテゴリ側も同時に確認して、
    // 「常に0件になっただけ」の見せかけの成功を防ぐ。
    for (const [cat, expectEmpty] of [['home-routine', true], ['leisure', true], ['food', false]]) {
      for (const q of [`?category=${cat}&part=1`, `?category=${cat}&part=2`, `?category=${cat}&count=10`]) {
        const res = await fetch(`${BASE}/api/topics/random${q}`);
        const body = await res.json().catch(() => ({}));
        const n = (body.topics || []).length;
        check(
          `${expectEmpty ? '未公開' : '公開'}カテゴリ ${cat}${q.replace(`?category=${cat}`, '')} が${expectEmpty ? '0件' : '出題される'}`,
          expectEmpty ? n === 0 : n > 0,
          `${n}件`
        );
      }
    }

    browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
    await ctx.addInitScript(PROFILE_SEED);
    const page = await ctx.newPage();

    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

    const goHome = async () => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(SETTLE_MS);
    };
    const toPicker = async () => {
      await page.locator('button.btn-primary').first().click();
      await page.locator('.category-option').first().waitFor({ timeout: 15000 });
    };
    const badges = () => page.locator('.played-badge').count();

    await goHome();

    // --- ホームの一貫性: 全リンクがアイコンを持つ ---
    const links = page.locator('.btn-link');
    const n = await links.count();
    let withIcon = 0;
    const names = [];
    for (let i = 0; i < n; i++) {
      const c = await links.nth(i).locator('span.icon svg').count();
      if (c) withIcon++;
      names.push(`${(await links.nth(i).innerText()).trim()}${c ? '' : '(アイコン無)'}`);
    }
    check('ホームの全リンクがアイコンを持つ', n > 0 && withIcon === n, `${withIcon}/${n} : ${names.join(', ')}`);

    // --- 回帰: 1問も答えず離脱しても「回答済」にならない ---
    await toPicker();
    check('開始前は「回答済」バッジが0個', (await badges()) === 0);

    const firstCat = page.locator('.category-option').first();
    const catName = (await firstCat.innerText()).trim().replace(/\n/g, ' ');
    await firstCat.click();
    await page.waitForTimeout(SETTLE_MS);
    const playedAtAbort = await page.evaluate(() => localStorage.getItem('heibonVote.playedParts'));
    check('0問回答の時点で playedParts が未記録', !playedAtAbort || playedAtAbort === '[]', `値=${playedAtAbort}`);

    // アプリ仕様: 途中状態が残っているとリロードでホームを飛ばしてクイズに直行する(app.js)。
    // 「離脱」を再現するには途中状態を捨てる必要がある。
    await page.evaluate(() => localStorage.removeItem('heibonVote.quizState'));
    await goHome();
    await toPicker();
    check(`離脱後も「回答済」バッジが0個 (${catName})`, (await badges()) === 0);

    // --- ランダム挑戦はカテゴリを記録しない(markPlayedのガード) ---
    const playedAfter = await page.evaluate(() => localStorage.getItem('heibonVote.playedParts'));
    check('ランダム/離脱を経ても playedParts が空のまま', !playedAfter || playedAfter === '[]', `値=${playedAfter}`);

    check('JSエラーが発生していない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' / '));

    // 回帰: サーバーのエラー文言の出し分け(2026-08-22)。
    // 英語の技術文言(invalid JSON 等)は画面に出してはいけないが、レート制限のように
    // 利用者向けに書いた日本語は出さないと「通信がうまくいきませんでした」としか伝わらず、
    // 待てば直ることも分からない。サーバーが userFacing を立てたものだけ通す契約にした。
    // 提案APIは60秒5回制限なので、6回投げて429を引き出す。テストの最後に置くこと。
    {
      const bad = await fetch(`${BASE}/api/suggestions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const badBody = await bad.json().catch(() => ({}));
      check(
        '英語の技術文言には userFacing が付かない(画面では伏せられる)',
        bad.status === 400 && badBody.userFacing !== true,
        `status=${bad.status} error=${badBody.error} userFacing=${badBody.userFacing}`
      );

      let limited = null;
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${BASE}/api/suggestions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: `レート制限の回帰テスト ${i}` }),
        });
        if (res.status === 429) {
          limited = await res.json().catch(() => ({}));
          break;
        }
      }
      check(
        'レート制限(429)は userFacing 付きの日本語で返る',
        !!limited && limited.userFacing === true && /しばらく|待って/.test(limited.error || ''),
        limited ? `error=${limited.error} userFacing=${limited.userFacing}` : '429に到達しなかった'
      );
    }

    await browser.close();
    browser = null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
    // 後片付け: 使い捨てDBを消し、消えたことを確認する
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dataDir, { recursive: true, force: true });
    check('使い捨てデータディレクトリを削除した', !fs.existsSync(dataDir), dataDir);
  }

  const failed = results.filter((r) => !r.pass);
  console.log('=== テスト結果 ===');
  for (const r of results) {
    console.log(`  ${r.pass ? '[OK]' : '[NG]'} ${r.name}${r.detail ? ` -- ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length}件中 ${results.length - failed.length}件 成功 / ${failed.length}件 失敗`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('テストの実行自体が失敗しました:', e.message);
  process.exit(2);
});
