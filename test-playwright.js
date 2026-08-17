const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 375, height: 812 }
  });

  const screenshotsDir = '/tmp/claude-1000/-workspaces-heibon-vote/33478f94-e4e8-49fe-8371-6db84ee39285/scratchpad/screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  let step = 1;

  const takeScreenshot = async (name) => {
    const filename = `${String(step).padStart(2, '0')}_${name}.png`;
    await page.screenshot({ path: path.join(screenshotsDir, filename) });
    console.log(`✓ Screenshot: ${filename}`);
    step++;
  };

  try {
    // 1. Top page (Intro)
    console.log('Loading app...');
    await page.goto('http://localhost:4322', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await takeScreenshot('intro');

    // 2. Click "始める" to go to attribute form
    console.log('Clicking "始める"...');
    const startButton = page.locator('button:has-text("始める")').first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(800);
      await takeScreenshot('attribute_form');
    }

    // 3. Set attributes
    console.log('Setting attributes...');
    
    // 年代 - select "20代"
    await page.locator('button:has-text("20代")').first().click();
    await page.waitForTimeout(300);

    // 性別 - select "女性"
    await page.locator('button:has-text("女性")').first().click();
    await page.waitForTimeout(300);

    // 血液型 - select "O型"
    await page.locator('button:has-text("O型")').first().click();
    await page.waitForTimeout(300);

    // 利き手 - select "右利き"
    await page.locator('button:has-text("右利き")').first().click();
    await page.waitForTimeout(500);
    await takeScreenshot('attributes_set');

    // 4. Click "保存して始める"
    console.log('Clicking "保存して始める"...');
    await page.locator('button:has-text("保存して始める")').first().click();
    await page.waitForTimeout(1000);
    await takeScreenshot('home_screen');

    // 5. Click "挑戦する"
    console.log('Clicking "挑戦する"...');
    await page.locator('button:has-text("挑戦する")').first().click();
    await page.waitForTimeout(800);
    await takeScreenshot('category_picker');

    // 6. Click first category
    console.log('Clicking category...');
    await page.locator('.category-option').first().click();
    await page.waitForTimeout(800);
    await takeScreenshot('part_selector');

    // 7. Click Part1 button
    console.log('Clicking Part1...');
    await page.locator('button:has-text("Part1")').first().click();
    await page.waitForTimeout(1000);
    await takeScreenshot('quiz_start');

    // Answer 10 questions
    for (let i = 0; i < 10; i++) {
      console.log(`Answering question ${i + 1}/10...`);
      await page.locator('.option-button').first().click();
      await page.waitForTimeout(800);
      
      if (i < 9) {
        const nextBtn = page.locator('button:has-text("次へ")').first();
        if (await nextBtn.isVisible()) {
          await nextBtn.click();
          await page.waitForTimeout(600);
        }
      }
      
      if (i === 0) {
        await takeScreenshot('quiz_q1_answered');
      }
    }

    // Result screen
    console.log('Waiting for result screen...');
    await page.waitForTimeout(2000);
    await takeScreenshot('result_screen');

    // Share section
    console.log('Checking share section...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    await takeScreenshot('result_share_section');

    // Full view
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await takeScreenshot('result_full_view');

    console.log('\n✅ All screenshots taken successfully!');
    console.log(`Saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
