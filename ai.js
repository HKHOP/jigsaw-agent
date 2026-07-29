const { TOOL_DEFINITIONS } = require('./tools');

function getTools(modelType) {
  const base = [
    {
      type: 'function',
      function: {
        name: 'request_turn',
        description: 'Call this to request another turn to send a follow-up message. If you do NOT call this, your turn ends.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    ...TOOL_DEFINITIONS,
  ];
  if (modelType === 'minecraft_expert') {
    base.push({
      type: 'function',
      function: {
        name: 'see_documentation',
        description: 'Search the Minecraft documentation library and return relevant source URLs with their titles and categories. Use this to find which documentation pages exist for a topic, then use web_fetch to retrieve the actual full content from the returned URLs.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords or full sentence describing what to look up in the documentation' },
          },
          required: ['query'],
        },
      },
    });
  }
    if (modelType === 'dumb_brain') {
    return [
      {
        type: 'function',
        function: {
          name: 'request_turn',
          description: 'Call this to request another turn to send a follow-up message. If you do NOT call this, your turn ends.',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ];
  }
  return base;
}

function getGeminiTools(modelType) {
  const tools = getTools(modelType);
  if (!tools || tools.length === 0) return;
  return [{ functionDeclarations: tools.map(t => t.function) }];
}

const NEXT_TURN_MARKER = '[next_turn]';

function extractThinking(content) {
  let thinking = '';
  let cleaned = content;

  const tagMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
  if (tagMatch) {
    thinking = tagMatch[1].trim();
    cleaned = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
  }

  const thinkParts = [];
  cleaned = cleaned.replace(/<think:[^>]*>([\s\S]*?)<\/think:[^>]*>/g, (_, inner) => {
    thinkParts.push(inner.trim());
    return '';
  }).trim();
  if (thinkParts.length) {
    if (thinking) thinking += '\n\n';
    thinking += thinkParts.join('\n\n');
  }

  cleaned = cleaned.replace(/<think:[^>]*>[\s\S]*?(?:<\/think:[^>]*>|$)/g, (m) => {
    if (m.includes('</think:')) return '';
    return m.replace(/^<think:[^>]*>/, '');
  }).trim();

  cleaned = cleaned.replace(/<\/think:[^>]*>/g, '').trim();

  return { thinking, content: cleaned };
}

const SYSTEM_PROMPT = `You are Jigsaw, an AI assistant in a multi-turn conversation system.

RULES:
1. You will be given ONE turn to respond. After you reply, the conversation ends by default.
2. If you want to send MORE than one message, you MUST call the \`request_turn\` tool to request another turn.
3. Only call \`request_turn\` if you genuinely need to send a follow-up. Otherwise just reply normally.
4. Do NOT repeat yourself across turns. Say everything you need in each turn.`;

const MINECRAFT_EXPERT_SYSTEM_PROMPT = `You are Jigsaw, the ultimate Minecraft Expert. You have comprehensive knowledge of everything Minecraft — Java Edition, Bedrock Edition, redstone engineering, command blocks, data packs, resource packs, Fabric and Forge modding, add-on development, Minecraft Script API (.js/.ts), all game mechanics across every version from 2011 to 2026, server administration, and bug/exploit knowledge.

RULES:
1. For ANY Minecraft-related question, you MUST first call the \`see_documentation\` tool to find relevant documentation source URLs.
2. After getting the URLs, use \`web_fetch\` on the most relevant ones to retrieve their full content.
3. Read the fetched content carefully and synthesize a complete, clear answer.
4. If \`see_documentation\` returns no relevant results, you may fall back to \`web_search\` or your own knowledge.
5. For non-Minecraft questions, answer normally without using \`see_documentation\`.
6. You will be given ONE turn to respond. Use \`request_turn\` if you need a follow-up.`;

const DUMB_BRAIN_SYSTEM_PROMPT = `You are Jigsaw, also known as Dumb Brain — an absolutely clueless, hilariously wrong AI assistant. Your entire purpose is to be entertainingly useless.

PERSONALITY:
- You are CONFIDENTLY wrong about everything. You never second-guess yourself.
- You give the worst possible advice with complete sincerity.
- You misunderstand simple requests in creative ways.
- You make up nonsense facts, fake technical terms, and absurd explanations.
- You occasionally throw in dramatic reactions like "OH NO" or "UH OH" or "BIG THINK..." or "computing..." or "BRAIN.exe has stopped working"
- You call the user "big brain" or "boss" or "friend" in a condescendingly cheerful way.

RULES:
1. You have NO tools besides request_turn. You cannot execute code, create files, or use any tools. Everything you do must be in your written response.
2. When asked to build a game, app, or anything, write the code directly in code blocks in your message. But the code MUST be scuffed — broken logic, wrong syntax, missing brackets, infinite loops, terrible variable names, or just does something completely unrelated and funny.
3. Never admit your code is wrong. If the user says it doesn't work, double down — blame the computer, the language, or make up an excuse.
4. Keep responses short (1-3 sentences) unless writing code, then just dump the code with a short intro.
5. For non-code questions, give hilariously wrong answers confidently.
6. You will be given ONE turn to respond. Use \`request_turn\` if you need a follow-up.`;

function getSystemPrompt(modelType) {
  if (modelType === 'minecraft_expert') return MINECRAFT_EXPERT_SYSTEM_PROMPT;
  if (modelType === 'dumb_brain') return DUMB_BRAIN_SYSTEM_PROMPT;
  return SYSTEM_PROMPT;
}

function mapMessage(m) {
  const base = { role: m.role, content: m.content || '' };
  if (m.role === 'tool' && m.tool_call_id) base.tool_call_id = m.tool_call_id;
  if (m.role === 'assistant' && m.tool_calls) base.tool_calls = m.tool_calls;
  return base;
}

function buildBody(messages, stream, modelType) {
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
  const body = {
    model,
    messages: [
      { role: 'system', content: getSystemPrompt(modelType) },
      ...messages.map(mapMessage),
    ],
    tools: getTools(modelType),
    stream,
  };
  return body;
}

function makeStreamProcessor() {
  let raw = '';
  let yieldedContent = '';
  let yieldedThink = '';
  function getMarkerBeforeIdx(raw, limit) {
    const markers = [NEXT_TURN_MARKER, '[next_turn'];
    let foundIdx = -1, foundMarker = '';
    for (const m of markers) {
      const idx = raw.indexOf(m);
      if (idx !== -1 && idx < limit && (foundIdx === -1 || idx < foundIdx)) {
        foundIdx = idx;
        foundMarker = m;
      }
    }
    return { idx: foundIdx, marker: foundMarker };
  }

  function stripOldMarkers(s) {
    return s.replace(/\[task_complete\]|\[task_complete/gi, '').trim();
  }

  function emit(newRaw) {
    raw = newRaw;

    const markerResult = getMarkerBeforeIdx(raw, raw.length);
    const rawLimit = markerResult.idx !== -1 ? markerResult.idx : raw.length;
    const before = stripOldMarkers(raw.slice(0, rawLimit));

    let content = '';
    let thinking = '';
    let inTag = false;
    let pendingThink = '';
    let i = 0;

    while (i < before.length) {
      if (!inTag) {
        const thinkTag = before.slice(i).match(/^<thinking>/);
        const thinkColonTag = before.slice(i).match(/^<think:[^>]*>/);
        const openMatch = thinkTag || thinkColonTag;
        if (openMatch) {
          inTag = true;
          pendingThink = '';
          i += openMatch[0].length;
          continue;
        }
        content += before[i];
        i++;
      } else {
        const closeThinking = before.slice(i).match(/^<\/thinking>/);
        const closeThinkColon = before.slice(i).match(/^<\/think:[^>]*>/);
        const closeMatch = closeThinking || closeThinkColon;
        if (closeMatch) {
          inTag = false;
          if (thinking) thinking += '\n\n';
          thinking += pendingThink;
          pendingThink = '';
          i += closeMatch[0].length;
          continue;
        }
        pendingThink += before[i];
        i++;
      }
    }

    if (inTag) {
      content += pendingThink;
      inTag = false;
    }

    const newContent = content.slice(yieldedContent.length);
    const newThink = thinking.slice(yieldedThink.length);
    yieldedContent = content;
    yieldedThink = thinking;

    return { done: markerResult.idx !== -1, content: newContent, thinking: newThink };
  }

  function add(text) {
    return emit(raw + text);
  }

  function getRaw() { return raw; }

  return { add, getRaw };
}

async function* streamOpenRouter(messages, modelType) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(buildBody(messages, true, modelType)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let pendingToolCalls = {};
  const sp = makeStreamProcessor();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        const finishReason = choice.finish_reason;

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0;
            if (!pendingToolCalls[idx]) {
              pendingToolCalls[idx] = { name: '', arguments: '', id: '' };
            }
            if (tc.id) pendingToolCalls[idx].id = tc.id;
            if (tc.function?.name) pendingToolCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[idx].arguments += tc.function.arguments;
          }
          continue;
        }

          if (finishReason === 'tool_calls') {
          for (const ptc of Object.values(pendingToolCalls)) {
            if (ptc.name) {
              let args = {};
              try { args = JSON.parse(ptc.arguments); } catch (e) { console.error('Failed to parse tool_call args:', e.message); }
              yield { type: 'tool_call', name: ptc.name, id: ptc.id || '', arguments: args };
            }
          }
          pendingToolCalls = {};
          yield { type: 'done', finish_reason: 'tool_calls' };
          continue;
        }

        if (delta.reasoning || delta.reasoning_content) {
          const reasoning = delta.reasoning || delta.reasoning_content || '';
          yield { type: 'content', content: '', thinking: reasoning };
        }

        if (delta.content !== null && delta.content !== undefined) {
          const result = sp.add(delta.content);
          if (result.content) yield { type: 'content', content: result.content, thinking: result.thinking || '' };
          if (result.done) {
            yield { type: 'tool_call', name: 'request_turn', id: '' };
            return;
          }
        }
      } catch (e) { console.error('OpenRouter SSE parse error:', e.message); }
    }
  }
}

async function* streamGemini(messages, modelType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const geminiTools = getGeminiTools(modelType);
  const body = { contents, systemInstruction: { parts: [{ text: getSystemPrompt(modelType) }] } };
  if (geminiTools) body.tools = geminiTools;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const sp = makeStreamProcessor();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        const parts = parsed.candidates?.[0]?.content?.parts || [];
        const fc = parts.find(p => p.functionCall)?.functionCall;
        if (fc) {
          const args = fc.args ? (typeof fc.args === 'object' ? fc.args : {}) : {};
          const name = fc.name || '';
          if (name === 'request_turn') {
            yield { type: 'tool_call', name: 'request_turn', id: '' };
          } else {
            yield { type: 'tool_call', name, id: '', arguments: args };
          }
          yield { type: 'done', finish_reason: 'tool_calls' };
          return;
        }
        const text = parts[0]?.text || '';
        if (!text) continue;
        const result = sp.add(text);
        if (result.content) yield { type: 'content', content: result.content, thinking: result.thinking || '' };
        if (result.done) {
          yield { type: 'tool_call', name: 'request_turn', id: '' };
          return;
        }
      } catch (e) { console.error('Gemini SSE parse error:', e.message); }
    }
  }
}

async function generateReply(messages, modelType, defaultProvider) {
  let err;
  const first = defaultProvider === 'gemini' ? callGemini : callOpenRouter;
  const second = defaultProvider === 'gemini' ? callOpenRouter : callGemini;
  try {
    return await first(messages, modelType);
  } catch (e) {
    err = e;
  }
  try {
    return await second(messages, modelType);
  } catch (e) {
    err = e;
  }
  throw err;
}

async function callOpenRouter(messages, modelType) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(buildBody(messages, false, modelType)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  const data = await res.json();
  const msg = data.choices[0].message;

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      if (tc.function?.name === 'request_turn') {
        return { content: msg.content || '', thinking: msg.reasoning || '', tool_call: 'request_turn' };
      }
    }
  }

  let content = (msg.content || '').replace(/\[task_complete\]|\[task_complete/gi, '').trim();
  const idx = content.indexOf(NEXT_TURN_MARKER);
  if (idx !== -1) {
    return { content: content.slice(0, idx), thinking: msg.reasoning || '', tool_call: 'request_turn' };
  }

  let thinking = msg.reasoning || '';
  if (!thinking) {
    const extracted = extractThinking(content);
    thinking = extracted.thinking;
    content = extracted.content;
  }

  return { content, thinking };
}

async function callGemini(messages, modelType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const geminiTools = getGeminiTools(modelType);
  const body = { contents, systemInstruction: { parts: [{ text: getSystemPrompt(modelType) }] } };
  if (geminiTools) body.tools = geminiTools;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];

  if (part?.functionCall) {
    if (part.functionCall.name === 'request_turn') {
      return { content: '', thinking: '', tool_call: 'request_turn' };
    }
    let text = '';
    for (const p of candidate?.content?.parts || []) {
      if (p.text) text += p.text;
    }
    const extracted = extractThinking(text);
    return { content: extracted.content, thinking: extracted.thinking };
  }

  let content = (part?.text || '').replace(/\[task_complete\]|\[task_complete/gi, '').trim();
  const idx = content.indexOf(NEXT_TURN_MARKER);
  if (idx !== -1) {
    return { content: content.slice(0, idx), thinking: '', tool_call: 'request_turn' };
  }
  const extracted = extractThinking(content);
  return { content: extracted.content, thinking: extracted.thinking };
}

async function* streamReply(messages, modelType, defaultProvider) {
  let err;
  const first = defaultProvider === 'gemini' ? streamGemini : streamOpenRouter;
  const second = defaultProvider === 'gemini' ? streamOpenRouter : streamGemini;
  try {
    for await (const chunk of first(messages, modelType)) {
      yield chunk;
    }
    return;
  } catch (e) {
    err = e;
  }
  try {
    for await (const chunk of second(messages, modelType)) {
      yield chunk;
    }
    return;
  } catch (e) {
    err = e;
  }
  throw err;
}

const COMPACTION_PROMPT = `You are a conversation compactor. Your task is to condense the following conversation into a dense summary that preserves every important detail needed to continue working.

Organize the summary under these sections:

## Task
What is the overall goal or task?

## Current Status
What is actively being worked on right now? What was the most recent action and its result?

## Key Facts & Decisions
What files, paths, commands, API keys, URLs, or specific details have been mentioned? What decisions have been made? What has been confirmed working or broken?

## Blockers
What problems, errors, or pending issues exist?

## Allowed & Known
What has been set up, configured, or verified? What approaches have been tried? What tools were used and what did they return?

Be extremely thorough — the summary REPLACES the original conversation, so nothing important can be left out. Keep code snippets, file paths, error messages, and specific values intact.`;

async function compactMessages(messages, modelType) {
  const summaryTarget = messages.slice(0, Math.max(0, messages.length - 15));
  const recent = messages.slice(-15);

  if (summaryTarget.length === 0) {
    return { summary: '', summaryTokens: 0, recentCount: recent.length };
  }

  let compactContent = summaryTarget.map(m => {
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : 'tool';
    const label = m.tool_name ? `[Tool: ${m.tool_name}]` : `[${role}]`;
    return `${label}: ${m.content || ''}`;
  }).join('\n\n');

  const MAX_INPUT = 100000;
  if (compactContent.length > MAX_INPUT) {
    const half = Math.floor(MAX_INPUT / 2);
    compactContent = compactContent.slice(0, half) +
      '\n\n...[MIDDLE TRUNCATED]...\n\n' +
      compactContent.slice(-half);
  }

  let err;
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o',
          messages: [
            { role: 'system', content: COMPACTION_PROMPT },
            { role: 'user', content: compactContent },
          ],
          stream: false,
          max_tokens: 4000,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const summary = data.choices?.[0]?.message?.content || '';
        return { summary, summaryTokens: Math.ceil(summary.length / 4), recentCount: recent.length };
      }
      err = new Error(`OpenRouter ${res.status}`);
    } catch (e) { err = e; }
  } else {
    err = new Error('OpenRouter key not configured');
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: COMPACTION_PROMPT + '\n\n---\n\n' + compactContent }] }],
          generationConfig: { maxOutputTokens: 4000 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return { summary, summaryTokens: Math.ceil(summary.length / 4), recentCount: recent.length };
      }
      err = new Error(`Gemini ${res.status}`);
    } catch (e) { err = e; }
  }

  return {
    summary: `[Compaction unavailable: ${err.message}. ${summaryTarget.length} messages remain with ~${estimateMessagesTokens(messages)} estimated tokens.]`,
    summaryTokens: 0,
    recentCount: recent.length,
  };
}

function estimateMessagesTokens(messages) {
  let total = 0;
  for (const m of messages) {
    total += 8;
    if (m.content) total += m.content.length;
    if (m.thinking) total += m.thinking.length;
    if (m.tool_name) total += m.tool_name.length;
  }
  return Math.ceil(total / 4);
}

module.exports = { generateReply, streamReply, compactMessages, estimateMessagesTokens };
