const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'chats.json');
const LOCK_FILE = DATA_FILE + '.lock';

function acquireLock() {
  const maxRetries = 200;
  const retryDelay = 25;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(LOCK_FILE);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (i < maxRetries - 1) {
        const start = Date.now();
        while (Date.now() - start < retryDelay) { }
      }
    }
  }
  return false;
}

function releaseLock() {
  try {
    fs.rmdirSync(LOCK_FILE);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Failed to release lock:', e.message);
  }
}

function withLock(fn) {
  return () => {
    if (!acquireLock()) {
      console.error('Failed to acquire file lock after retries');
      return null;
    }
    try {
      return fn();
    } finally {
      releaseLock();
    }
  };
}

function read() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Error reading chats.json:', e.message);
    return { threads: {}, order: [] };
  }
}

function write(data) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error('Failed to create data dir:', e.message); }
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

parentPort.on('message', (task) => {
  const { id, type, payload } = task;
  let result;

  const op = withLock(() => {
    switch (type) {
      case 'list': {
        const data = read();
        return data.order.map(tid => ({
          id: tid,
          name: data.threads[tid].name,
          created: data.threads[tid].created,
          count: data.threads[tid].messages.length,
          rootPath: data.threads[tid].rootPath || '',
          modelType: data.threads[tid].modelType || 'normal',
        }));
      }

      case 'get': {
        const data = read();
        return data.threads[payload.threadId] || null;
      }

      case 'create': {
        const data = read();
        const tid = 'thread_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        data.threads[tid] = {
          id: tid,
          name: payload.name || 'Thread ' + (data.order.length + 1),
          created: Date.now(),
          messages: payload.messages || [],
          rootPath: payload.rootPath || '',
          ignoreLoopWarning: false,
          modelType: payload.modelType || 'normal',
        };
        data.order.push(tid);
        write(data);
        return data.threads[tid];
      }

      case 'delete': {
        const data = read();
        delete data.threads[payload.threadId];
        data.order = data.order.filter(tid => tid !== payload.threadId);
        write(data);
        return { ok: true };
      }

      case 'append': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          const entry = {
            role: payload.role,
            content: payload.content,
            timestamp: Date.now(),
          };
          if (payload.thinking) entry.thinking = payload.thinking;
          if (payload.tool_call_id) entry.tool_call_id = payload.tool_call_id;
          if (payload.tool_name) entry.tool_name = payload.tool_name;
          thread.messages.push(entry);
          write(data);
          return thread.messages[thread.messages.length - 1];
        }
        return null;
      }

      case 'rename': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          thread.name = payload.name;
          write(data);
          return { ok: true, name: thread.name };
        }
        return null;
      }

      case 'set_root': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          thread.rootPath = payload.rootPath || '';
          write(data);
          return { ok: true, rootPath: thread.rootPath };
        }
        return null;
      }

      case 'clear': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          thread.messages = [];
          write(data);
          return { ok: true };
        }
        return null;
      }

      case 'truncate': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread && payload.upToIndex >= 0) {
          thread.messages = thread.messages.slice(0, payload.upToIndex + 1);
          write(data);
          return { ok: true, count: thread.messages.length };
        }
        return null;
      }

      case 'set_ignore_loop': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          thread.ignoreLoopWarning = true;
          write(data);
          return { ok: true };
        }
        return null;
      }

      case 'set_model_type': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          thread.modelType = payload.modelType || 'normal';
          write(data);
          return { ok: true, modelType: thread.modelType };
        }
        return null;
      }

      case 'compact_messages': {
        const data = read();
        const thread = data.threads[payload.threadId];
        if (thread) {
          thread.messages = payload.messages;
          thread.lastCompaction = Date.now();
          write(data);
          return { ok: true, count: thread.messages.length };
        }
        return null;
      }

      default:
        return null;
    }
  });

  result = op();
  parentPort.postMessage({ id, result });
});