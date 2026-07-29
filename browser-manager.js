const { chromium } = require('playwright');
const fs = require('node:fs');

let browser = null;
let page = null;
let headlessMode = true;
let browserPromise = null;
let closing = false;

function setHeadless(val) {
  headlessMode = val;
  if (browser && !closing) {
    return closeBrowser();
  }
}

function isOpen() {
  return browser !== null;
}

async function getPage() {
  if (closing) return null;
  if (!browser) {
    if (browserPromise) return browserPromise.then(() => getPage());
    browserPromise = (async () => {
      const args = ['--no-sandbox', '--disable-setuid-sandbox'];
      if (!headlessMode) {
        args.push('--start-maximized', '--new-window');
      }
      browser = await chromium.launch({
        headless: headlessMode,
        args,
      });
      browserPromise = null;
    })();
    await browserPromise;
  }
  if (!page || page.isClosed()) {
    const viewport = headlessMode ? { width: 1280, height: 720 } : null;
    page = await browser.newPage({ viewport });
  }
  return page;
}

async function closeBrowser() {
  if (closing) return;
  closing = true;
  try {
    if (page && !page.isClosed()) await page.close();
  } catch (e) { console.error('Error closing page:', e.message); }
  try {
    if (browser) await browser.close();
  } catch (e) { console.error('Error closing browser:', e.message); }
  page = null;
  browser = null;
  browserPromise = null;
  closing = false;
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
  if (!p) return { error: 'Browser is closing' };
  await p.goto(url, { waitUntil: waitUntil || 'load', timeout: 30000 });
  const title = await p.title();
  const pageText = await getPageText(p);
  const { loading } = await checkLoading(p);
  return { title, url: p.url(), pageText, loading };
}

async function click(selector) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.click(selector, { force: true });
  const pageText = await getPageText(p);
  const { loading } = await checkLoading(p);
  return { clicked: selector, url: p.url(), pageText, loading };
}

async function fill(selector, value) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.fill(selector, value);
  return { filled: selector, value };
}

async function select(selector, value) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.selectOption(selector, value);
  return { selected: selector, value };
}

async function getContent(includeAll) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
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

async function screenshot(filePath) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
  const buf = await p.screenshot({ type: 'png', fullPage: false });
  if (filePath) {
    fs.writeFileSync(filePath, buf);
    return { saved: filePath, size: buf.length };
  }
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, size: buf.length };
}

async function evaluate(code) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
  const result = await p.evaluate(code);
  return { result };
}

async function hover(selector) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
  await p.waitForSelector(selector, { timeout: 10000 });
  await p.hover(selector);
  return { hovered: selector };
}

async function getText(selector) {
  const p = await getPage();
  if (!p) return { error: 'Browser is closing' };
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