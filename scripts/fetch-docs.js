const fs = require('node:fs');
const path = require('node:path');

const DOCS_DIR = path.join(__dirname, '..', 'docs', 'minecraft');
const DELAY_MS = 1500;
const TIMEOUT_MS = 30000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const SOURCES = [
  // --- Microsoft Learn: Bedrock Creator Docs ---
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/', name: 'bedrock-creator-index', category: 'bedrock' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/documents/redstoneguide?view=minecraft-bedrock-stable', name: 'bedrock-redstone-guide', category: 'bedrock' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/introduction?view=minecraft-bedrock-stable', name: 'scripting-introduction', category: 'scriptapi' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/v2-overview?view=minecraft-bedrock-stable', name: 'scripting-v2-overview', category: 'scriptapi' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/?view=minecraft-bedrock-stable', name: 'scriptapi-reference', category: 'scriptapi' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server?view=minecraft-bedrock-stable', name: 'scriptapi-server-module', category: 'scriptapi' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/developer-tools?view=minecraft-bedrock-stable', name: 'scripting-developer-tools', category: 'scriptapi' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/commands/commands?view=minecraft-bedrock-stable', name: 'bedrock-commands', category: 'bedrock' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/commandsreference/examples/commandlist?view=minecraft-bedrock-stable', name: 'bedrock-commands-detailed', category: 'bedrock' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/vanillalistingsreference/items?view=minecraft-bedrock-stable', name: 'bedrock-item-listings', category: 'bedrock' },
  { url: 'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/vanillalistingsreference/blocks?view=minecraft-bedrock-stable', name: 'bedrock-block-listings', category: 'bedrock' },

  // --- Fabric Documentation ---
  { url: 'https://docs.fabricmc.net/develop/', name: 'fabric-developer-guides', category: 'fabric' },
  { url: 'https://docs.fabricmc.net/develop/items/first-item', name: 'fabric-first-item', category: 'fabric' },
  { url: 'https://docs.fabricmc.net/develop/blocks/first-block', name: 'fabric-first-block', category: 'fabric' },
  { url: 'https://docs.fabricmc.net/develop/commands/basics', name: 'fabric-commands', category: 'fabric' },
  { url: 'https://docs.fabricmc.net/develop/blocks/block-models', name: 'fabric-block-models', category: 'fabric' },
  { url: 'https://docs.fabricmc.net/develop/getting-started/setting-up', name: 'fabric-setup', category: 'fabric' },

  // --- Craftdex: Commands & Redstone references ---
  { url: 'https://craftdex.net/commands', name: 'commands-reference', category: 'mechanics' },
  { url: 'https://craftdex.net/redstone', name: 'redstone-components', category: 'redstone' },

  // --- Datapack Wiki: Java commands reference ---
  { url: 'https://datapack.wiki/wiki/command/all', name: 'java-commands', category: 'reference' },

  // --- XGamingServer: Item IDs guide ---
  { url: 'https://xgamingserver.com/blog/minecraft-item-ids/', name: 'item-ids-guide', category: 'reference' },

  // --- Astroworld Redstone Hub ---
  { url: 'https://redstone.astroworldmc.com/', name: 'redstone-reference-hub', category: 'redstone' },

  // --- Redstone Companion: Bedrock redstone guides ---
  { url: 'https://redstone.tools/learn/', name: 'bedrock-redstone-learn', category: 'redstone' },

  // --- Guild Order: Redstone guide ---
  { url: 'https://guildorder.com/games/minecraft/wiki/redstone-guide', name: 'redstone-guide-guildorder', category: 'redstone' },
];

function stripHtml(html) {
  let text = html;

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript\s*>/gi, '');
  text = text.replace(/<svg[^>]*>[\s\S]*?<\/svg\s*>/gi, '');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav\s*>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer\s*>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header\s*>/gi, '');

  text = text.replace(/<[^>]+>/g, ' ');

  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&#x2F;/g, '/');
  text = text.replace(/&#\d+;/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');

  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/^\s*[\r\n]/gm, '\n');

  text = text.trim();

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 3000) {
    text = lines.slice(0, 3000).join('\n') + `\n\n... (truncated, ${lines.length - 3000} more lines)`;
  }
  if (text.length > 150000) {
    text = text.slice(0, 150000) + `\n\n... (truncated, ${text.length - 150000} more characters)`;
  }

  return text;
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal, headers: HEADERS });
      clearTimeout(timer);
      if (res.status === 429) {
        const wait = (attempt + 1) * 5000;
        console.log(`(rate limited, waiting ${wait}ms...)`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        const wait = (attempt + 1) * 3000;
        console.log(`(retry ${attempt + 1}/${retries} in ${wait}ms...)`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

async function run() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  console.log('---');
  console.log('Minecraft Documentation Fetcher');
  console.log(`Output: ${DOCS_DIR}`);
  console.log(`Sources: ${SOURCES.length} pages`);
  console.log('---');

  let success = 0;
  let failed = 0;
  const failedSources = [];

  for (let i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];
    const filename = `${source.category}-${source.name}.txt`;
    const filepath = path.join(DOCS_DIR, filename);

    if (fs.existsSync(filepath)) {
      console.log(`[${i + 1}/${SOURCES.length}] SKIP: ${source.name}`);
      success++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${SOURCES.length}] FETCH: ${source.name}... `);

    try {
      const html = await fetchWithRetry(source.url);
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
      const title = titleMatch ? titleMatch[1].trim() : source.name;

      let body = html;
      const contentSelectors = [
        /<main[^>]*>([\s\S]*?)<\/main\s*>/i,
        /<article[^>]*>([\s\S]*?)<\/article\s*>/i,
        /<div[^>]*id="mw-content-text"[^>]*>([\s\S]*?)<\/div\s*>/i,
        /<div[^>]*class="mw-parser-output"[^>]*>([\s\S]*?)<\/div\s*>/i,
        /<div[^>]*class="content[^"]*"[^>]*>([\s\S]*?)<\/div\s*>/i,
        /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div\s*>/i,
      ];
      for (const sel of contentSelectors) {
        const m = body.match(sel);
        if (m) { body = m[1]; break; }
      }

      const text = stripHtml(body);
      if (text.length < 100) {
        console.log(`SHORT (only ${text.length} chars — may be JS-rendered)`);
      } else {
        console.log(`OK (${text.split('\n').length} lines, ${text.length} chars)`);
      }

      const header = `Source: ${source.url}\nTitle: ${title}\nCategory: ${source.category}\nFetched: ${new Date().toISOString()}\n\n${'='.repeat(60)}\n\n`;
      fs.writeFileSync(filepath, header + text, 'utf-8');
      success++;
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      failed++;
      failedSources.push(`${source.url} (${source.name})`);
    }

    if (i < SOURCES.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log('---');
  console.log(`Done: ${success} succeeded, ${failed} failed out of ${SOURCES.length} total`);

  if (failedSources.length > 0) {
    console.log('\nFailed sources:');
    for (const s of failedSources) {
      console.log(`  - ${s}`);
    }
  }
}

run();
