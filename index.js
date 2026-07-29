
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const WORKER_PATH = path.join(__dirname, 'worker.js');
const os = require('node:os');
const { generateReply, streamReply, compactMessages, estimateMessagesTokens } = require('./ai');
const { executeTool, getToolDisplayName } = require('./tools');
const bm = require('./browser-manager');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const WORKER_TIMEOUT = 30000;
const POOL_SIZE = Math.max(2, os.cpus().length);
const workers = [];
let serverHandle = null;
let taskId = 0;
const pending = {};

function initWorkers() {
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(WORKER_PATH);
    w.on('message', (msg) => {
      const cb = pending[msg.id];
      if (cb) {
        delete pending[msg.id];
        cb(msg.result);
      }
    });
    w.on('error', (err) => {
      console.error('Worker error:', err);
      notifyClients('Worker error: ' + (err.message || err), 'error');
      for (const [id, cb] of Object.entries(pending)) {
        delete pending[id];
        cb({ error: 'Worker crashed' });
      }
    });
    workers.push(w);
  }
}

function shutdownWorkers() {
  for (const w of workers) {
    w.terminate();
  }
  workers.length = 0;
}

function workerTask(type, payload) {
  return new Promise((resolve, reject) => {
    const id = ++taskId;
    const timer = setTimeout(() => {
      if (pending[id]) {
        delete pending[id];
        reject(new Error(`Worker task timed out: ${type}`));
      }
    }, WORKER_TIMEOUT);
    pending[id] = (result) => {
      clearTimeout(timer);
      resolve(result);
    };
    const worker = workers[id % workers.length];
    worker.postMessage({ id, type, payload });
  });
}

const app = express();
app.use(express.json());

const pendingApprovals = {};
const pendingAsks = {};
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/threads', async (req, res) => {
  const list = await workerTask('list');
  res.json(list);
});

app.post('/api/threads', async (req, res) => {
  try {
    const thread = await workerTask('create', { name: req.body.name, modelType: req.body.modelType || 'normal' });
    res.json(thread);
  } catch (e) {
    console.error('POST /api/threads:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/threads/:id', async (req, res) => {
  const thread = await workerTask('get', { threadId: req.params.id });
  if (!thread) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(thread);
});

app.delete('/api/threads/:id', async (req, res) => {
  await workerTask('delete', { threadId: req.params.id });
  res.json({ ok: true });
});

app.post('/api/threads/:id/messages', async (req, res) => {
  try {
    if (!req.body.role || !req.body.content) {
      res.status(400).json({ error: 'role and content are required' });
      return;
    }
    const msg = await workerTask('append', {
      threadId: req.params.id,
      role: req.body.role,
      content: req.body.content,
    });
    if (!msg) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(msg);
  } catch (e) {
    console.error('POST /api/threads/:id/messages:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/threads/:id/rename', async (req, res) => {
  try {
    if (!req.body.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const result = await workerTask('rename', {
      threadId: req.params.id,
      name: req.body.name,
    });
    if (!result) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result);
  } catch (e) {
    console.error('POST /api/threads/:id/rename:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/threads/:id/chat', async (req, res) => {
  const thread = await workerTask('get', { threadId: req.params.id });
  if (!thread) { res.status(404).json({ error: 'Not found' }); return; }
  const modelType = thread.modelType || 'normal';
  const settings = readSettings();
  let result;
  try {
    result = await generateReply(thread.messages, modelType, settings.defaultProvider);
  } catch (err) {
    result = { content: 'Error: ' + err.message, thinking: '' };
  }
  const msg = await workerTask('append', {
    threadId: req.params.id,
    role: 'assistant',
    content: result.content,
    thinking: result.thinking || '',
  });
  res.json(msg);
});

app.post('/api/threads/:id/stream', async (req, res) => {
  const thread = await workerTask('get', { threadId: req.params.id });
  if (!thread) { res.status(404).json({ error: 'Not found' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  function sse(data) {
    if (!res.destroyed) {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (e) { console.error('SSE write error:', e.message); }
    }
  }

  const messages = [...thread.messages];
  let turnCount = 0;
  let loopWarningSent = false;
  const settings = readSettings();

  const modelType = thread.modelType || 'normal';

  async function callAI(msgs) {
    let fullContent = '';
    let fullThinking = '';
    let toolCall = null;

    for await (const chunk of streamReply(msgs, modelType, settings.defaultProvider)) {
      if (chunk.type === 'content') {
        fullContent += chunk.content;
        if (chunk.thinking) fullThinking += chunk.thinking;
        sse({ content: chunk.content, thinking: chunk.thinking });
      }
      if (chunk.type === 'tool_call') {
        toolCall = { name: chunk.name, id: chunk.id || '', arguments: chunk.arguments || {} };
      }
      if (chunk.type === 'done') {
        if (chunk.finish_reason === 'tool_calls') toolCall = toolCall || { name: 'unknown', id: '' };
        break;
      }
    }
    return { fullContent, fullThinking, toolCall };
  }

  function requestApproval(toolCall, settings) {
    return new Promise((resolve) => {
      const approvalId = 'ap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      pendingApprovals[approvalId] = resolve;
      const warnings = [];
      if (isToolUnsafe(toolCall.name, toolCall.arguments || {}, thread.rootPath, settings)) {
        warnings.push('Operation may access files outside the project root or sensitive files.');
      }
      sse({ toolPending: { id: approvalId, name: getToolDisplayName(toolCall.name, toolCall.arguments), args: toolCall.arguments || {}, warnings } });
      setTimeout(() => {
        if (pendingApprovals[approvalId]) {
          delete pendingApprovals[approvalId];
          resolve(false);
        }
      }, 120000);
    });
  }

  const COMPACT_THRESHOLD = 200000;

  while (true) {
    turnCount++;

    if (turnCount === 41 && !thread.ignoreLoopWarning && !loopWarningSent) {
      loopWarningSent = true;
      sse({ loopWarning: true, turnCount });
    }

    if (!thread.ignoreLoopWarning && estimateMessagesTokens(messages) > COMPACT_THRESHOLD) {
      sse({ compacting: true });
      try {
        const { summary, summaryTokens } = await compactMessages(messages, modelType);
        const recentMessages = messages.slice(-15);
        const now = new Date();
        const compactSystemMsg = {
          role: 'assistant',
          content: `[System: The conversation was compacted at this point to save context space. Previous messages before this point no longer exist in the conversation — they have been replaced by the summary below. If you were working on specific files or tasks, you should re-read any relevant files or re-check their state before continuing, as the original context is no longer available.]

## Compacted Summary
${summary}

*Last compacted: ${now.toLocaleString()}*`,
          timestamp: now.getTime(),
        };
        const newMessages = [compactSystemMsg, ...recentMessages];
        await workerTask('compact_messages', { threadId: req.params.id, messages: newMessages });
        messages.length = 0;
        messages.push(...newMessages);
        sse({ compacted: true, summaryTokens, totalMessages: newMessages.length });
      } catch (err) {
        sse({ compactError: err.message });
      }
    }

    let fullContent, fullThinking, toolCall;
    try {
      const result = await callAI(messages);
      fullContent = result.fullContent; fullThinking = result.fullThinking; toolCall = result.toolCall;
    } catch (err) {
      sse({ error: `AI call failed (${err.message}). Compacting and retrying...` });
      try {
        const { summary, summaryTokens } = await compactMessages(messages, modelType);
        const recentMessages = messages.slice(-15);
        const now = new Date();
        const compactSystemMsg = {
          role: 'assistant',
          content: `[System: The conversation was compacted at this point to save context space. Previous messages before this point no longer exist in the conversation — they have been replaced by the summary below. If you were working on specific files or tasks, you should re-read any relevant files or re-check their state before continuing, as the original context is no longer available.]

## Compacted Summary
${summary}

*Last compacted: ${now.toLocaleString()}*`,
          timestamp: now.getTime(),
        };
        const newMessages = [compactSystemMsg, ...recentMessages];
        await workerTask('compact_messages', { threadId: req.params.id, messages: newMessages });
        messages.length = 0;
        messages.push(...newMessages);
        sse({ compacted: true, summaryTokens, totalMessages: newMessages.length });
        ({ fullContent, fullThinking, toolCall } = await callAI(messages));
      } catch (err2) {
        sse({ error: `AI call failed after compaction: ${err2.message}. Stopping.` });
        break;
      }
    }

    if (toolCall && toolCall.name === 'request_turn') {
      if (fullContent || fullThinking) {
        const saved = await workerTask('append', {
          threadId: req.params.id, role: 'assistant', content: fullContent, thinking: fullThinking,
        });
        const msg = { role: 'assistant', content: fullContent, timestamp: saved.timestamp, tool_calls: [{ id: '', type: 'function', function: { name: 'request_turn', arguments: '{}' } }] };
        messages.push(msg);
      }
      const toolResult = { role: 'tool', content: 'completed', tool_call_id: toolCall.id || '' };
      messages.push(toolResult);
      sse({ turnEnd: true });
      continue;
    }

    if (toolCall) {
      if (fullContent || fullThinking) {
        const saved = await workerTask('append', {
          threadId: req.params.id, role: 'assistant', content: fullContent, thinking: fullThinking,
        });
        const msg = { role: 'assistant', content: fullContent, timestamp: saved.timestamp, tool_calls: [{ id: toolCall.id, type: 'function', function: { name: toolCall.name, arguments: '{}' } }] };
        messages.push(msg);
      }

      if (toolCall.name === 'ask') {
        sse({ toolStart: getToolDisplayName('ask'), toolArgs: toolCall.arguments || {} });

        const validation = await executeTool('ask', toolCall.arguments || {}, settings, thread.rootPath);
        if (validation.error) {
          const resultStr = JSON.stringify({ error: validation.error });
          const toolMsg = { role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: 'ask' };
          await workerTask('append', { threadId: req.params.id, role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: 'ask' });
          messages.push(toolMsg);
          sse({ toolResult: { name: getToolDisplayName('ask'), success: false, error: validation.error } });
          sse({ turnEnd: true });
          continue;
        }

        const askId = 'ask_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const answers = await new Promise((resolve) => {
          pendingAsks[askId] = resolve;
          sse({ askPending: { id: askId, questions: validation.questions } });
          setTimeout(() => {
            if (pendingAsks[askId]) {
              delete pendingAsks[askId];
              resolve(null);
            }
          }, 300000);
        });

        if (!answers) {
          const resultStr = JSON.stringify({ error: 'User did not respond to questions' });
          const toolMsg = { role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: 'ask' };
          await workerTask('append', { threadId: req.params.id, role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: 'ask' });
          messages.push(toolMsg);
          sse({ toolResult: { name: getToolDisplayName('ask'), success: false, error: 'User did not respond' } });
          sse({ turnEnd: true });
          continue;
        }

        const resultStr = JSON.stringify(answers, null, 2);
        const toolMsg = { role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: 'ask' };
        await workerTask('append', { threadId: req.params.id, role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: 'ask' });
        messages.push(toolMsg);
        sse({ toolResult: { name: getToolDisplayName('ask'), success: true } });
        sse({ turnEnd: true });
        continue;
      }

      const toolDisplayName = getToolDisplayName(toolCall.name, toolCall.arguments);

      sse({ toolStart: toolDisplayName, toolArgs: toolCall.arguments });

      const toolCfg = settings.tools?.[toolCall.name] || {};
      let approved = true;

      if (settings.yoloMode) {
        // YOLO: skip all approvals
      } else if (toolCfg.autoApprove) {
        // Per-tool auto-approve: skip approval
      } else if (settings.autoApprove) {
        // Auto-Approve mode: only block unsafe operations
        if (isToolUnsafe(toolCall.name, toolCall.arguments || {}, thread.rootPath, settings)) {
          approved = await requestApproval(toolCall, settings);
        }
      } else {
        // Manual mode: every tool needs approval
        approved = await requestApproval(toolCall, settings);
      }

      if (!approved) {
        const resultStr = JSON.stringify({ error: 'Rejected by user' });
        const toolMsg = { role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: toolCall.name };
        await workerTask('append', {
          threadId: req.params.id, role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: toolCall.name,
        });
        messages.push(toolMsg);
        sse({ toolResult: { name: toolDisplayName, success: false, error: 'Rejected by user' } });
        sse({ turnEnd: true });
        continue;
      }

      let result;
      try {
        result = await executeTool(toolCall.name, toolCall.arguments || {}, settings, thread.rootPath);
      } catch (err) {
        result = { error: err.message };
      }

      const success = !(result && result.error);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const toolMsg = { role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: toolCall.name };
      await workerTask('append', {
        threadId: req.params.id, role: 'tool', content: resultStr, tool_call_id: toolCall.id || '', tool_name: toolCall.name,
      });
      messages.push(toolMsg);

      sse({ toolResult: { name: toolDisplayName, success, error: result?.error || null, data: result } });
      sse({ turnEnd: true });
      continue;
    }

    if (fullContent || fullThinking) {
      await workerTask('append', {
        threadId: req.params.id, role: 'assistant', content: fullContent, thinking: fullThinking,
      });
    }
    break;
  }

  sse({ saved: true });
  if (!res.destroyed) res.end();
});

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
let settingsCache = null;

function readSettings() {
  if (settingsCache) return settingsCache;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    delete data.allowedPaths;
    data.openrouterKey = data.openrouterKey || process.env.OPENROUTER_API_KEY || '';
    data.openrouterModel = data.openrouterModel || process.env.OPENROUTER_MODEL || '';
    data.geminiKey = data.geminiKey || process.env.GEMINI_API_KEY || '';
    data.geminiModel = data.geminiModel || process.env.GEMINI_MODEL || '';
    settingsCache = data;
    return data;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Error reading settings.json:', e.message);
    const defaults = {
      yoloMode: false,
      autoApprove: false,
      elevatedPermissions: false,
      tools: {},
      openrouterKey: process.env.OPENROUTER_API_KEY || '',
      openrouterModel: process.env.OPENROUTER_MODEL || '',
      geminiKey: process.env.GEMINI_API_KEY || '',
      geminiModel: process.env.GEMINI_MODEL || '',
      releaseChannel: 'stable',
      defaultProvider: 'openrouter',
    };
    writeSettings(defaults);
    return defaults;
  }
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  settingsCache = null;
}

app.get('/api/settings', (req, res) => {
  res.json(readSettings());
});

app.put('/api/settings', (req, res) => {
  const current = readSettings();
  const updated = { ...current, ...req.body };
  delete updated.allowedPaths;
  writeSettings(updated);
  if (updated.openrouterKey) process.env.OPENROUTER_API_KEY = updated.openrouterKey;
  if (updated.openrouterModel) process.env.OPENROUTER_MODEL = updated.openrouterModel;
  if (updated.geminiKey) process.env.GEMINI_API_KEY = updated.geminiKey;
  if (updated.geminiModel) process.env.GEMINI_MODEL = updated.geminiModel;
  res.json(updated);
});

app.get('/api/browser-status', (req, res) => {
  res.json({ open: bm.isOpen() });
});

app.post('/api/browser-close', async (req, res) => {
  await bm.closeBrowser();
  res.json({ ok: true });
});

app.post('/api/restart', (req, res) => {
  res.json({ ok: true });
  const script = path.resolve(process.argv[1]);
  const existingArgs = process.argv.slice(2);
  const child = spawn(process.execPath, [script, ...existingArgs], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  setTimeout(() => process.exit(0), 500);
});

app.post('/api/autocomplete', (req, res) => {
  const partial = req.body.path || '';
  if (!partial) return res.json([]);
  const endsSep = partial.endsWith('\\') || partial.endsWith('/');
  const dir = endsSep ? partial : path.dirname(partial);
  const prefix = endsSep ? '' : path.basename(partial).toLowerCase();
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return res.json([]); }
  const matches = entries
    .filter(e => e.toLowerCase().startsWith(prefix))
    .sort()
    .slice(0, 100)
    .filter(e => {
      try { return fs.statSync(path.join(dir, e)).isDirectory(); } catch { return false; }
    })
    .map(e => e + path.sep);
  res.json(matches);
});

app.post('/api/file-search', (req, res) => {
  const query = (req.body.query || '').trim();
  if (!query || query.length < 1) return res.json([]);
  const results = [];
  const root = path.resolve(req.body.root || (process.env.SystemDrive + '\\'));
  const maxResults = 20;

  function walk(dir) {
    if (results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (entry.toLowerCase().includes(query.toLowerCase())) {
        results.push({ name: entry + (stat.isDirectory() ? path.sep : ''), path: full, size: stat.size, isDir: stat.isDirectory() });
      }
      if (stat.isDirectory()) walk(full);
    }
  }

  walk(root);
  res.json(results);
});

app.post('/api/file-batch', (req, res) => {
  const paths = (req.body.paths || []).map(p => path.resolve(p));
  const contents = [];
  for (const fp of paths) {
    try {
      const stat = fs.statSync(fp);
      const isText = stat.size < 102400;
      contents.push({ path: fp, exists: true, content: isText ? fs.readFileSync(fp, 'utf-8').slice(0, 50000) : null, binary: !isText, size: stat.size });
    } catch {
      contents.push({ path: fp, exists: false });
    }
  }
  res.json({ files: contents });
});

app.post('/api/threads/:id/root-path', async (req, res) => {
  try {
    const result = await workerTask('set_root', {
      threadId: req.params.id,
      rootPath: req.body.rootPath ? path.resolve(req.body.rootPath) : '',
    });
    if (!result) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result);
  } catch (e) {
    console.error('POST /api/threads/:id/root-path:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/threads/:id/model-type', async (req, res) => {
  try {
    const result = await workerTask('set_model_type', {
      threadId: req.params.id,
      modelType: req.body.modelType || 'normal',
    });
    if (!result) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result);
  } catch (e) {
    console.error('POST /api/threads/:id/model-type:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/threads/:id/truncate', async (req, res) => {
  try {
    if (typeof req.body.upToIndex !== 'number' || req.body.upToIndex < 0) {
      res.status(400).json({ error: 'upToIndex must be a non-negative number' });
      return;
    }
    const result = await workerTask('truncate', {
      threadId: req.params.id,
      upToIndex: req.body.upToIndex,
    });
    if (!result) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result);
  } catch (e) {
    console.error('POST /api/threads/:id/truncate:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/threads/:id/clear', async (req, res) => {
  try {
    const result = await workerTask('clear', { threadId: req.params.id });
    if (!result) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result);
  } catch (e) {
    console.error('POST /api/threads/:id/clear:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

function isToolUnsafe(name, args, rootPath, settings) {
  if (name === 'run_command' || name === 'read_env') return true;
  if (name === 'browser_evaluate') return true;
  if (name === 'db_execute') return true;
  const sensitivePaths = ['.env', '.env.local', '.env.production', 'config/.env'];
  const pathArgs = ['path', 'dir', 'input', 'output', 'source', 'destination'];
  for (const key of pathArgs) {
    if (args[key]) {
      const p = path.resolve(args[key]).toLowerCase().replace(/\\/g, '/');
      if (rootPath && !settings?.elevatedPermissions) {
        const root = path.resolve(rootPath).toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
        if (!p.startsWith(root + '/')) {
          return true;
        }
      }
      for (const sens of sensitivePaths) {
        if (p.includes(sens)) return true;
      }
    }
  }
  return false;
}

app.post('/api/threads/:id/compact', async (req, res) => {
  const thread = await workerTask('get', { threadId: req.params.id });
  if (!thread) { res.status(404).json({ error: 'Not found' }); return; }
  const modelType = thread.modelType || 'normal';
  try {
    const { summary, summaryTokens, recentCount } = await compactMessages(thread.messages, modelType);
    if (!summary) {
      res.status(400).json({ error: 'Nothing to compact — 15 or fewer messages.' });
      return;
    }
    const recentMessages = thread.messages.slice(-15);
    const now = new Date();
    const compactSystemMsg = {
      role: 'assistant',
      content: `[System: The conversation was compacted at this point to save context space. Previous messages before this point no longer exist in the conversation — they have been replaced by the summary below. If you were working on specific files or tasks, you should re-read any relevant files or re-check their state before continuing, as the original context is no longer available.]

## Compacted Summary
${summary}

*Last compacted: ${now.toLocaleString()}*`,
      timestamp: now.getTime(),
    };
    const newMessages = [compactSystemMsg, ...recentMessages];
    await workerTask('compact_messages', { threadId: req.params.id, messages: newMessages });
    res.json({ ok: true, summaryTokens, totalMessages: newMessages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/approve-tool/:id', (req, res) => {
  const resolver = pendingApprovals[req.params.id];
  if (resolver) {
    delete pendingApprovals[req.params.id];
    resolver(req.body.approved);
    res.json({ ok: true });
  } else {
    res.status(410).json({ error: 'Approval expired or not found' });
  }
});

app.post('/api/answer-ask/:id', (req, res) => {
  const resolver = pendingAsks[req.params.id];
  if (resolver) {
    delete pendingAsks[req.params.id];
    resolver(req.body.answers || null);
    res.json({ ok: true });
  } else {
    res.status(410).json({ error: 'Question expired or not found' });
  }
});

app.post('/api/threads/:id/ignore-loop-warning', async (req, res) => {
  try {
    const result = await workerTask('set_ignore_loop', { threadId: req.params.id });
    if (!result) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/threads/:id/ignore-loop-warning:', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

/* ---- Server notification system ---- */

let sseClients = [];
let sseHeartbeat = null;

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    if (sseClients.length === 0 && sseHeartbeat) {
      clearInterval(sseHeartbeat);
      sseHeartbeat = null;
    }
  });
  if (!sseHeartbeat) {
    sseHeartbeat = setInterval(() => {
      const now = Date.now();
      sseClients = sseClients.filter(c => {
        try { c.write(':heartbeat\n\n'); return true; } catch { return false; }
      });
      if (sseClients.length === 0) {
        clearInterval(sseHeartbeat);
        sseHeartbeat = null;
      }
    }, 30000);
  }
});

function notifyClients(message, type) {
  type = type || 'error';
  const data = `event: notify\ndata: ${JSON.stringify({ message, type })}\n\n`;
  sseClients = sseClients.filter(c => {
    try { c.write(data); return true; } catch { return false; }
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  notifyClients(err.message || 'Internal server error', 'error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function start(port) {
  port = port || PORT;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  initWorkers();
  const settings = readSettings();
  if (settings.openrouterKey) process.env.OPENROUTER_API_KEY = settings.openrouterKey;
  if (settings.openrouterModel) process.env.OPENROUTER_MODEL = settings.openrouterModel;
  if (settings.geminiKey) process.env.GEMINI_API_KEY = settings.geminiKey;
  if (settings.geminiModel) process.env.GEMINI_MODEL = settings.geminiModel;
  if (settings.defaultProvider) process.env.DEFAULT_PROVIDER = settings.defaultProvider;
  return new Promise((resolve) => {
    serverHandle = app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/ (${POOL_SIZE} workers, data: ${DATA_DIR})`);
      resolve(port);
    });
  });
}

async function stop() {
  return new Promise((resolve) => {
    shutdownWorkers();
    if (serverHandle) {
      serverHandle.close(() => resolve());
      serverHandle = null;
    } else {
      resolve();
    }
  });
}

module.exports = { start, stop, app };

if (require.main === module) {
  start();
}
