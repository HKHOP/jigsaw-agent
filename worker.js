const { parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'chats.json');

function read() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { threads: {}, order: [] };
  }
}

function write(data) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf-8');
}

parentPort.on('message', (task) => {
  const { id, type, payload } = task;
  let result;

  switch (type) {
    case 'list': {
      const data = read();
      result = data.order.map(tid => ({
        id: tid,
        name: data.threads[tid].name,
        created: data.threads[tid].created,
        count: data.threads[tid].messages.length,
        rootPath: data.threads[tid].rootPath || '',
        modelType: data.threads[tid].modelType || 'normal',
        useGemini: !!data.threads[tid].useGemini,
      }));
      break;
    }

    case 'get': {
      const data = read();
      result = data.threads[payload.threadId] || null;
      break;
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
        useGemini: false,
      };
      data.order.push(tid);
      write(data);
      result = data.threads[tid];
      break;
    }

    case 'delete': {
      const data = read();
      delete data.threads[payload.threadId];
      data.order = data.order.filter(tid => tid !== payload.threadId);
      write(data);
      result = { ok: true };
      break;
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
        result = thread.messages[thread.messages.length - 1];
      } else {
        result = null;
      }
      break;
    }

    case 'rename': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.name = payload.name;
        write(data);
        result = { ok: true, name: thread.name };
      } else {
        result = null;
      }
      break;
    }

    case 'set_root': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.rootPath = payload.rootPath || '';
        write(data);
        result = { ok: true, rootPath: thread.rootPath };
      } else {
        result = null;
      }
      break;
    }

    case 'clear': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.messages = [];
        write(data);
        result = { ok: true };
      } else {
        result = null;
      }
      break;
    }

    case 'set_use_gemini': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.useGemini = !!payload.useGemini;
        write(data);
        result = { ok: true, useGemini: thread.useGemini };
      } else {
        result = null;
      }
      break;
    }

    case 'truncate': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread && payload.upToIndex >= 0) {
        thread.messages = thread.messages.slice(0, payload.upToIndex + 1);
        write(data);
        result = { ok: true, count: thread.messages.length };
      } else {
        result = null;
      }
      break;
    }

    case 'set_ignore_loop': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.ignoreLoopWarning = true;
        write(data);
        result = { ok: true };
      } else {
        result = null;
      }
      break;
    }

    case 'set_model_type': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.modelType = payload.modelType || 'normal';
        write(data);
        result = { ok: true, modelType: thread.modelType };
      } else {
        result = null;
      }
      break;
    }

    case 'compact_messages': {
      const data = read();
      const thread = data.threads[payload.threadId];
      if (thread) {
        thread.messages = payload.messages;
        thread.lastCompaction = Date.now();
        write(data);
        result = { ok: true, count: thread.messages.length };
      } else {
        result = null;
      }
      break;
    }

    default:
      result = null;
  }

  parentPort.postMessage({ id, result });
});
