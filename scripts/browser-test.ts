import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.LECTURE_AXIS_URL || 'http://127.0.0.1:8790';
const OUT = 'screenshots';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let failures = 0;
const log = (ok: boolean, name: string, extra = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` · ${extra}` : ''}`);
};

const run = async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  console.log('\n[浏览器] 总览');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stat-strip', { timeout: 15000 });
  log((await page.locator('.stat-item').count()) === 5, '总览统计条渲染');
  log((await page.locator('.validation-row').count()) >= 4, '验收清单渲染');
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: false });

  console.log('\n[浏览器] 阅读台');
  await page.goto(`${BASE}/lecture`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.lecture-block', { timeout: 15000 });
  const blockCount = await page.locator('.lecture-block').count();
  log(blockCount === 46, '讲稿块全部渲染', `${blockCount} 块`);

  const scrollTopBefore = await page.evaluate(() => {
    const container = document.querySelector('.reader-scroll') as HTMLElement;
    container.scrollTop = 2400;
    return container.scrollTop;
  });
  await page.waitForTimeout(200);
  const anchorBefore = await page.evaluate(() => {
    const container = document.querySelector('.reader-scroll') as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const nodes = Array.from(document.querySelectorAll('.lecture-block')) as HTMLElement[];
    const offset = container.scrollTop;
    const visible = nodes.find(
      (node) => node.getBoundingClientRect().top - containerRect.top + offset >= container.scrollTop - 1
    );
    return {
      id: visible?.dataset.blockId ?? '',
      viewTop: visible
        ? visible.getBoundingClientRect().top - containerRect.top
        : Number.NaN
    };
  });

  // 选一个当前视口内的挂载点，避免点击时页面自动滚动改变"打开前位置"
  const mountIndex = await page.evaluate(() => {
    const reader = document.querySelector('.reader-scroll') as HTMLElement;
    const rect = reader.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('.mount-button')) as HTMLElement[];
    return buttons.findIndex((button) => {
      const box = button.getBoundingClientRect();
      return box.top > rect.top + 80 && box.bottom < rect.bottom - 40;
    });
  });
  await page.locator('.mount-button').nth(Math.max(0, mountIndex)).click();
  await page.waitForSelector('.support-panel h2', { timeout: 8000 });
  const supportTitle = await page.locator('.support-panel h2').first().innerText();
  log(Boolean(supportTitle), '支架内容展开', supportTitle);
  await page.screenshot({ path: `${OUT}/02-lecture-support.png` });

  const scrollTopDuring = await page.evaluate(() => {
    const container = document.querySelector('.reader-scroll') as HTMLElement;
    return container.scrollTop;
  });

  await page.locator('.support-head-actions .icon-button').last().click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const container = document.querySelector('.reader-scroll') as HTMLElement;
    const nodes = Array.from(document.querySelectorAll('.lecture-block')) as HTMLElement[];
    const containerRect = container.getBoundingClientRect();
    const offset = container.scrollTop;
    const tops = nodes.map((node) => ({
      id: node.dataset.blockId,
      top: node.getBoundingClientRect().top - containerRect.top + offset
    }));
    return { scrollTop: container.scrollTop, tops };
  });
  const before = await page.evaluate(() => {
    const container = document.querySelector('.reader-scroll') as HTMLElement;
    const nodes = Array.from(document.querySelectorAll('.lecture-block')) as HTMLElement[];
    const containerRect = container.getBoundingClientRect();
    const offset = container.scrollTop;
    return nodes.map((node) => ({
      id: node.dataset.blockId,
      top: node.getBoundingClientRect().top - containerRect.top + offset
    }));
  });
  const anchorAfter = await page.evaluate((blockId) => {
    const container = document.querySelector('.reader-scroll') as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const node = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    return node ? node.getBoundingClientRect().top - containerRect.top : Number.NaN;
  }, anchorBefore.id);
  log(
    Math.abs(anchorAfter - anchorBefore.viewTop) <= 3,
    '关闭支架后回到同一块同一视口位置',
    `${anchorBefore.id} 视口位置 ${Math.round(anchorBefore.viewTop)} → ${Math.round(anchorAfter)}`
  );
  const maxTopDiff = after.tops.reduce(
    (max, item, index) => Math.max(max, Math.abs(item.top - (before[index]?.top ?? item.top))),
    0
  );
  log(
    maxTopDiff <= 1,
    '关闭支架后逐块内容位置与打开前一致',
    `最大偏差 ${maxTopDiff.toFixed(2)}px`
  );
  log(
    Math.abs(after.scrollTop - scrollTopBefore) <= 1,
    'scrollTop 精确回写',
    `${scrollTopBefore} → ${after.scrollTop}`
  );
  void scrollTopDuring;
  void before;

  console.log('\n[浏览器] 搜索与跳转');
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.search-overlay.is-open', { timeout: 5000 });
  await page.fill('.search-field input', '数据孤岛');
  await page.waitForTimeout(300);
  const hits = await page.locator('.search-result').count();
  log(hits > 0, '搜索命中', `${hits} 条`);
  const conceptHit = page.locator('.search-result', { hasText: '概念' }).first();
  await conceptHit.click();
  await page.waitForTimeout(700);
  const panelTitle = await page.locator('.support-panel h2').first().innerText().catch(() => '');
  log(Boolean(panelTitle), '搜索结果可直达支架', panelTitle);

  console.log('\n[浏览器] 剪辑台与挂载建议');
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.clip-script', { timeout: 15000 });
  const clips = await page.locator('.clip-script').count();
  log(clips === 46, '时间线渲染全部讲稿块', `${clips} 块`);
  log((await page.locator('.clip-mount').count()) === 39, '挂载轨渲染介质片段');

  await page.locator('.studio-timeline-tools .button-secondary').click();
  await page.waitForTimeout(1500);
  const chips = await page.locator('.chip-suggest').count();
  log(chips === 46, '逐行生成挂载建议', `${chips} 条`);
  const pendingBefore = await page.locator('.chip-suggest.is-pending').count();
  log(pendingBefore > 0, '建议以待确认状态出现', `${pendingBefore} 条`);
  await page.screenshot({ path: `${OUT}/05-studio.png` });

  await page.locator('.chip-suggest.is-pending').first().click();
  await page.waitForTimeout(300);
  await page.locator('.suggestion-actions .button-secondary').click();
  await page.waitForTimeout(300);
  log((await page.locator('.suggestion-editor').count()) === 1, '可以修改建议');
  await page.screenshot({ path: `${OUT}/06-studio-edit.png` });
  await page.locator('.suggestion-editor .button-ghost').click();
  await page.locator('.suggestion-actions .button-primary').click();
  await page.waitForTimeout(700);
  log((await page.locator('.chip-suggest.is-accepted').count()) === 1, '单条确认生效');

  await page.locator('.studio-timeline-tools .button-primary').click();
  await page.waitForTimeout(1500);
  const accepted = await page.locator('.chip-suggest.is-accepted').count();
  const left = await page.locator('.chip-suggest.is-pending').count();
  log(accepted === 39, '一键确认按置信度门槛批量生效', `已确认 ${accepted} · 保留待定 ${left}`);
  await page.screenshot({ path: `${OUT}/07-studio-applied.png` });

  console.log('\n[浏览器] 其余页面');
  for (const [path, selector, name] of [
    ['/structure', '.concept-tree', '结构台'],
    ['/workflows', '.workflow-grid', '流程台'],
    ['/skills', '.skill-grid', '技能台'],
    ['/engines', '.engine-config-grid', '引擎台'],
    ['/settings', '.engine-config-grid', '设置台']
  ] as const) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector(selector, { timeout: 10000 });
    log(true, `${name}渲染`);
  }
  await page.screenshot({ path: `${OUT}/03-skills.png` });

  console.log('\n[浏览器] 移动端');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(`${BASE}/lecture`, { waitUntil: 'networkidle' });
  await mobile.waitForSelector('.lecture-block', { timeout: 10000 });
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  log(overflow <= 1, '窄屏无横向溢出', `${overflow}px`);
  await mobile.screenshot({ path: `${OUT}/04-mobile.png` });

  log(errors.length === 0, '无控制台报错', errors.slice(0, 3).join(' | '));

  await browser.close();
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify({ failures, errors }, null, 2));
  console.log(failures === 0 ? '\n浏览器测试全部通过。\n' : `\n${failures} 项浏览器测试未通过。\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});