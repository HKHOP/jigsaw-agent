const { chromium } = require('playwright');

let browser = null;
let page = null;
let headlessMode = true;

function setHeadless(val) {
  headlessMode = val;
  if (browser) {
    closeBrowser();
  }
}

function isOpen() {
  return browser !== null;
}

async function getPage() {
  if (!browser) {
    const args = ['--no-sandbox', '--disable-setuid-sandbox'];
    if (!headlessMode) {
      args.push('--start-maximized', '--new-window');
    }
    browser = await chromium.launch({
      headless: headlessMode,
      args,
    });
  }
  if (!page || page.isClosed()) {
    const viewport = headlessMode ? { width: 1280, height: 720 } : null;
    page = await browser.newPage({ viewport });
  }
  return page;
}

async function closeBrowser() {
  try {
    if (page && !page.isClosed()) await page.close();
  } catch {}
  try {
    if (browser) await browser.close();
  } catch {}
  page = null;
  browser = null;
}

async function checkLoading(p) {
  try {
    await p.waitForLoadState('networkidle', { timeout: 2000 });
    return { loading: false };
  } catch {
    return { loading: true };
  }
}

function truncateText(text, max) {
  max = max || 8000;
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n... (truncated, ' + (text.length - max) + ' more chars)';
}

async function getPageText(p) {
  const text = await p.locator('body').innerText().catch(() => '');
  return truncateText(text);
}

async function navigate(url, waitUntil) {
  const p = await getPage();
  await p.goto(url, { waitUntil: waitUntil || 'load', timeout: 30000 });
  const title = await p.title();
  const pageText = await getPageText(p);
  const { loading } = await checkLoading(p);
  return { title, url: p.url(), pageText, loading };
}

async function click(selector) {
  const p = await getPage();
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.click(selector, { force: true });
  const pageText = await getPageText(p);
  const { loading } = await checkLoading(p);
  return { clicked: selector, url: p.url(), pageText, loading };
}

async function fill(selector, value) {
  const p = await getPage();
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.fill(selector, value);
  return { filled: selector, value };
}

async function select(selector, value) {
  const p = await getPage();
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.selectOption(selector, value);
  return { selected: selector, value };
}

async function getContent(includeAll) {
  const p = await getPage();
  const html = await p.content();
  if (includeAll) return { html };
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg\s*>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .trim();
  return { html: cleaned };
}

async function screenshot(path) {
  const p = await getPage();
  const buf = await p.screenshot({ type: 'png', fullPage: false });
  if (path) {
    const fs = require('node:fs');
    fs.writeFileSync(path, buf);
    return { saved: path, size: buf.length };
  }
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, size: buf.length };
}

async function evaluate(code) {
  const p = await getPage();
  const result = await p.evaluate(code);
  return { result };
}

async function hover(selector) {
  const p = await getPage();
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.hover(selector);
  return { hovered: selector };
}

async function getText(selector) {
  const p = await getPage();
  if (selector) {
    await p.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
    const el = await p.$(selector);
    if (!el) return { error: `Element not found: ${selector}` };
    return { text: await el.textContent(), selector };
  }
  return { text: await p.locator('body').innerText() };
}

module.exports = {
  setHeadless,
  isOpen,
  navigate,
  click,
  fill,
  select,
  getContent,
  screenshot,
  evaluate,
  hover,
  getText,
  closeBrowser,
};
