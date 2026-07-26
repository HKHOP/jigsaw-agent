const threadList = document.getElementById('thread-list');
const newThreadBtn = document.getElementById('new-thread-btn');
const modelTypeSelect = document.getElementById('model-type-select');
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusAnimation = document.getElementById('status-animation');
const threadTitle = document.getElementById('thread-title');
const rootPathDisplay = document.getElementById('root-path-display');
const rootPathIcon = document.getElementById('root-path-icon');
const rootPathText = document.getElementById('root-path-text');
const rootPathEditBtn = document.getElementById('root-path-edit-btn');
const rootPathEditor = document.getElementById('root-path-editor');
const rootPathInput = document.getElementById('root-path-input');
const rootPathSave = document.getElementById('root-path-save');
const rootPathCancel = document.getElementById('root-path-cancel');
const contextMenu = document.getElementById('context-menu');
const contextOverlay = document.getElementById('context-overlay');
const chat = document.getElementById('chat');
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
const closeBrowserBtn = document.getElementById('close-browser-btn');
const exportBtn = document.getElementById('export-btn');
const exportModal = document.getElementById('export-modal');
const exportOverlay = document.getElementById('export-overlay');
const exportClose = document.getElementById('export-close');
const exportMarkdown = document.getElementById('export-markdown');
const exportJson = document.getElementById('export-json');
const loopWarning = document.getElementById('loop-warning');
const loopWarningText = document.getElementById('loop-warning-text');
const loopStopBtn = document.getElementById('loop-stop-btn');
const loopIgnoreBtn = document.getElementById('loop-ignore-btn');
const compactBar = document.getElementById('compact-bar');
const compactText = document.getElementById('compact-text');
const showBrowserCheck = document.getElementById('settings-show-browser');
const settingsOrKey = document.getElementById('settings-or-key');
const settingsOrModel = document.getElementById('settings-or-model');
const settingsGeminiKey = document.getElementById('settings-gemini-key');
const settingsGeminiModel = document.getElementById('settings-gemini-model');

let currentThreadId = null;
let threads = [];
let contextMessageIndex = null;
let ready = true;
let messageQueue = [];
let currentAbortController = null;
let lastEscPress = 0;
let userScrolledUp = false;

const EMOJI_MAP = {
  ':smile:': '😄', ':laughing:': '😆', ':joy:': '😂', ':wink:': '😉',
  ':blush:': '😊', ':heart_eyes:': '😍', ':heart:': '❤️', ':fire:': '🔥',
  ':rocket:': '🚀', ':star:': '⭐', ':100:': '💯', ':clap:': '👏',
  ':wave:': '👋', ':ok_hand:': '👌', ':thumbsup:': '👍', ':thumbsdown:': '👎',
  ':pray:': '🙏', ':muscle:': '💪', ':sparkles:': '✨', ':check:': '✅',
  ':x:': '❌', ':warning:': '⚠️', ':bulb:': '💡', ':question:': '❓',
  ':exclamation:': '❗', ':gear:': '⚙️', ':lock:': '🔒', ':key:': '🔑',
  ':link:': '🔗', ':computer:': '💻', ':file:': '📄', ':folder:': '📁',
  ':mag:': '🔍', ':bug:': '🐛', ':memo:': '📝', ':book:': '📖',
  ':mail:': '✉️', ':phone:': '📞', ':calendar:': '📅', ':clock:': '🕐',
  ':green_check:': '✅', ':red_circle:': '🔴', ':blue_circle:': '🔵',
  ':white_circle:': '⚪', ':warning:': '⚠️', ':zap:': '⚡', ':crown:': '👑',
  ':tada:': '🎉', ':party:': '🎊', ':confetti:': '🎉', ':globe:': '🌐',
  ':sun:': '☀️', ':moon:': '🌙', ':rain:': '🌧️', ':snow:': '❄️',
  ':checkered_flag:': '🏁', ':robot:': '🤖', ':brain:': '🧠', ':eyes:': '👀',
  ':point_up:': '☝️', ':point_down:': '👇', ':point_left:': '👈', ':point_right:': '👉',
  ':fist:': '✊', ':hand:': '✋', ':pen:': '🖊️', ':pencil:': '✏️',
  ':paperclip:': '📎', ':scissors:': '✂️', ':trash:': '🗑️', ':recycle:': '♻️',
};

function replaceEmojis(text) {
  return text.replace(/:[a-z_]+:/gi, (match) => EMOJI_MAP[match.toLowerCase()] || match);
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isScrolledToBottom() {
  return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
  scrollBottomBtn.classList.add('hidden');
  userScrolledUp = false;
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined') return replaceEmojis(text);
  const withEmojis = replaceEmojis(text);
  return marked.parse(withEmojis, { breaks: true, gfm: true });
}

function applySyntaxHighlighting() {
  if (typeof hljs === 'undefined') return;
  document.querySelectorAll('.message .content pre code:not(.hljs)').forEach((el) => {
    hljs.highlightElement(el);
  });
}

function addCopyButtons() {
  document.querySelectorAll('.message .content pre').forEach((pre) => {
    if (pre.parentElement.classList.contains('pre-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'pre-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      const code = pre.textContent;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
    wrapper.appendChild(btn);
  });
}

function setStatus(r) {
  ready = r;
  if (r) {
    statusDot.classList.remove('hidden');
    statusText.classList.remove('hidden');
    statusAnimation.classList.add('hidden');
    statusDot.style.background = '#22c55e';
    statusText.textContent = 'Ready';
  } else {
    statusDot.classList.add('hidden');
    statusText.classList.add('hidden');
    statusAnimation.classList.remove('hidden');
  }
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  return res.json();
}

async function loadThreads() {
  threads = await api('GET', '/api/threads');
  renderThreadList();
}

function renderThreadList() {
  threadList.innerHTML = '';
  for (const t of threads) {
    const item = document.createElement('div');
    item.className = 'thread-item' + (t.id === currentThreadId ? ' active' : '');
    item.innerHTML = `
      <span class="thread-name">${esc(t.name)}</span>
      <button class="thread-rename" data-id="${t.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
      <button class="thread-del" data-id="${t.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.thread-del')) return;
      if (e.target.closest('.thread-rename')) return;
      if (e.target.closest('.thread-name') && item.classList.contains('editing')) return;
      switchThread(t.id);
    });

    item.querySelector('.thread-rename').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(item, t);
    });
    item.querySelector('.thread-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api('DELETE', `/api/threads/${t.id}`);
      threads = await api('GET', '/api/threads');
      if (currentThreadId === t.id) {
        currentThreadId = null;
        if (threads.length === 0) {
          showWelcome();
          return;
        }
        switchThread(threads[threads.length - 1].id);
      } else {
        renderThreadList();
      }
    });
    threadList.appendChild(item);
  }
}

function startRename(item, t) {
  item.classList.add('editing');
  const nameSpan = item.querySelector('.thread-name');
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = t.name;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const val = input.value.trim() || t.name;
    await api('POST', `/api/threads/${t.id}/rename`, { name: val });
    const span = document.createElement('span');
    span.className = 'thread-name';
    span.textContent = val;
    input.replaceWith(span);
    item.classList.remove('editing');
    if (currentThreadId === t.id) {
      threadTitle.textContent = val;
    }
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = t.name; input.blur(); }
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function switchThread(id) {
  currentThreadId = id;
  setStatus(false);
  rootPathEditor.classList.add('hidden');
  loopWarning.classList.add('hidden');
  compactBar.classList.add('hidden');
  const thread = await api('GET', `/api/threads/${id}`);
  threadTitle.textContent = thread.name;
  modelTypeSelect.value = thread.modelType || 'normal';
  renderMessages(thread.messages);
  renderThreadList();
  showRootPath(thread.rootPath);
  setStatus(true);
}

function showRootPath(rp) {
  rootPathDisplay.classList.remove('hidden');
  if (rp && rp.trim()) {
    rootPathText.textContent = rp;
    rootPathIcon.textContent = '📁';
  } else {
    rootPathText.textContent = 'C:\\';
    rootPathIcon.textContent = '📁';
  }
}

function showWelcome() {
  messagesEl.innerHTML = '<div class="empty-state">Start a conversation<br>Create a new thread to begin</div>';
  threadTitle.textContent = '';
  currentThreadId = null;
  rootPathDisplay.classList.add('hidden');
  rootPathEditor.classList.add('hidden');
  loopWarning.classList.add('hidden');
  compactBar.classList.add('hidden');
  renderThreadList();
}

function renderMessages(messages) {
  messagesEl.innerHTML = '';
  if (!messages || messages.length === 0) {
    messagesEl.innerHTML = '<div class="empty-state">No messages yet</div>';
    return;
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const wrapper = document.createElement('div');
    wrapper.dataset.index = i;

    if (m.role === 'assistant' && m.thinking) {
      const thinkEl = document.createElement('div');
      thinkEl.className = 'thinking-bubble';
      thinkEl.innerHTML = `<div class="thinking-header">Thinking<svg class="think-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></div><div class="thinking-body hidden" dir="auto">${renderMarkdown(m.thinking)}</div>`;
      thinkEl.querySelector('.thinking-header').addEventListener('click', (e) => {
        const container = e.currentTarget.closest('.thinking-bubble');
        container.querySelector('.thinking-body').classList.toggle('hidden');
        container.querySelector('.think-arrow').classList.toggle('open');
      });
      wrapper.appendChild(thinkEl);
    }

    if (m.role === 'tool') {
      const toolBubble = document.createElement('div');
      toolBubble.className = 'tool-bubble';
      let parsed;
      try { parsed = JSON.parse(m.content); } catch { parsed = null; }
      const success = parsed && !parsed.error;
      toolBubble.classList.add(success ? 'success' : 'error');
      const toolName = m.tool_name || 'tool';
      toolBubble.innerHTML = `
        <div class="tool-bubble-header">
          <span class="tool-bubble-name">${esc(toolName)}</span>
          <span class="tool-bubble-status">${success ? 'Success' : 'Failed'}</span>
        </div>
        <div class="msg-time">${m.timestamp ? formatTime(m.timestamp) : ''}</div>
      `;
      if (parsed && parsed.error) {
        const errEl = document.createElement('div');
        errEl.className = 'tool-bubble-result';
        errEl.textContent = parsed.error;
        toolBubble.appendChild(errEl);
      }
      messagesEl.appendChild(toolBubble);
      continue;
    }

    const el = document.createElement('div');
    el.className = `message ${m.role}`;
    const label = m.role === 'assistant' ? 'Jig' : m.role;
    if (m.role === 'assistant') {
      el.innerHTML = `<div class="label">${label}</div><div class="content" dir="auto">${renderMarkdown(m.content)}</div><div class="msg-time">${m.timestamp ? formatTime(m.timestamp) : ''}</div>`;
    } else {
      el.innerHTML = `<div class="label">${label}</div><div class="content" dir="auto">${esc(m.content)}</div><div class="msg-time">${m.timestamp ? formatTime(m.timestamp) : ''}</div>`;
    }
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMessageIndex = i;
      showContextMenu();
    });
    wrapper.appendChild(el);
    messagesEl.appendChild(wrapper);
  }
  applySyntaxHighlighting();
  addCopyButtons();
  scrollToBottom();
}

function showContextMenu() {
  contextOverlay.classList.remove('hidden');
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  contextOverlay.classList.add('hidden');
  contextMenu.classList.add('hidden');
  contextMessageIndex = null;
}



function processQueue() {
  if (messageQueue.length > 0) {
    input.value = messageQueue.shift();
    updateQueueUI();
    send();
  }
}

function updateQueueUI() {
  const count = messageQueue.length;
  queueCount.textContent = count;
  queueBar.classList.toggle('hidden', count === 0);
}

function attachContextMenu(el, index) {
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMessageIndex = index;
    showContextMenu();
  });
}

async function handleRevert() {
  if (contextMessageIndex === null || !currentThreadId) return;
  setStatus(false);
  await api('POST', `/api/threads/${currentThreadId}/truncate`, {
    upToIndex: contextMessageIndex,
  });
  const thread = await api('GET', `/api/threads/${currentThreadId}`);
  renderMessages(thread.messages);
  await loadThreads();
  setStatus(true);
  hideContextMenu();
}

async function handleFork() {
  if (contextMessageIndex === null || !currentThreadId) return;
  setStatus(false);
  const thread = await api('GET', `/api/threads/${currentThreadId}`);
  const forkedMessages = thread.messages.slice(0, contextMessageIndex + 1);
  const newThread = await api('POST', '/api/threads', {
    name: thread.name + ' (fork)',
    messages: forkedMessages,
  });
  await loadThreads();
  switchThread(newThread.id);
  setStatus(true);
  hideContextMenu();
}

function handleCopy() {
  if (contextMessageIndex === null || !currentThreadId) return;
  const threadEl = messagesEl.querySelectorAll('.message')[contextMessageIndex];
  if (threadEl) {
    const text = threadEl.querySelector('.content').textContent;
    navigator.clipboard.writeText(text);
  }
  hideContextMenu();
}

contextMenu.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === 'cancel') { hideContextMenu(); return; }
  if (action === 'revert') { handleRevert(); return; }
  if (action === 'fork') { handleFork(); return; }
  if (action === 'copy') { handleCopy(); return; }
});

contextOverlay.addEventListener('click', hideContextMenu);

const settingsBtn = document.getElementById('settings-btn');
const settingsPage = document.getElementById('settings-page');
const settingsClose = document.getElementById('settings-close');
const settingsToolsList = document.getElementById('settings-tools-list');
const modeRadios = document.querySelectorAll('input[name="mode-select"]');
const settingsSave = document.getElementById('settings-save');
const settingsCatBtns = document.querySelectorAll('.settings-cat-btn');
const settingsPanels = document.querySelectorAll('.settings-panel');
const mainEl = document.getElementById('main');
const queueBar = document.getElementById('queue-bar');
const queueCount = document.getElementById('queue-count');
const queueClear = document.getElementById('queue-clear');

const TOOL_NAMES = [
  'read_file', 'write_file', 'edit_file', 'list_dir', 'grep_search',
  'run_command', 'rename_file', 'delete_file', 'file_stats', 'create_dir',
  'read_env', 'git_operations', 'glob_find', 'watch_file', 'web_search', 'web_fetch',
  'find_files', 'network_info', 'process_info', 'clipboard', 'download_file',
  'hash_file', 'generate_password', 'math_eval', 'crypto_utils',
  'browser_navigate', 'browser_click', 'browser_fill', 'browser_select',
  'browser_get_content', 'browser_screenshot', 'browser_evaluate',
  'browser_hover', 'browser_get_text', 'browser_close',
  'db_list_tables', 'db_get_schema', 'db_query', 'db_execute', 'db_backup',
];

let settingsCache = null;

function switchSettingsCat(cat) {
  settingsCatBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  settingsPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === 'settings-panel-' + cat);
  });
}

settingsCatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    switchSettingsCat(btn.dataset.cat);
  });
});

document.querySelectorAll('.settings-apikey-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.textContent = isPassword ? 'Hide' : 'Show';
  });
});

async function openSettings() {
  settingsCache = await api('GET', '/api/settings');
  const val = settingsCache.yoloMode ? 'yolo' : settingsCache.autoApprove ? 'auto-approve' : 'manual';
  modeRadios.forEach(r => r.checked = r.value === val);
  showBrowserCheck.checked = settingsCache.browserHeadless !== false;
  settingsOrKey.value = settingsCache.openrouterKey || '';
  settingsOrModel.value = settingsCache.openrouterModel || '';
  settingsGeminiKey.value = settingsCache.geminiKey || '';
  settingsGeminiModel.value = settingsCache.geminiModel || '';
  renderToolSettings(settingsCache.tools || {});
  switchSettingsCat('mode');
  mainEl.classList.add('hidden');
  settingsPage.classList.remove('hidden');
}

function closeSettings() {
  settingsPage.classList.add('hidden');
  mainEl.classList.remove('hidden');
  settingsCache = null;
}

function renderToolSettings(toolConfigs) {
  settingsToolsList.innerHTML = '';
  for (const name of TOOL_NAMES) {
    const cfg = toolConfigs[name] || {};
    const row = document.createElement('div');
    row.className = 'tool-setting-row';
    row.innerHTML = `
      <span class="tool-name">${name}</span>
      <label><input type="checkbox" class="tool-enabled" ${cfg.enabled !== false ? 'checked' : ''}> enable</label>
    `;
    settingsToolsList.appendChild(row);
  }
}

closeBrowserBtn.addEventListener('click', async () => {
  await api('POST', '/api/browser-close');
  closeBrowserBtn.classList.add('hidden');
});

async function pollBrowserStatus() {
  try {
    const status = await api('GET', '/api/browser-status');
    closeBrowserBtn.classList.toggle('hidden', !status.open);
  } catch {}
}
setInterval(pollBrowserStatus, 2000);

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);

if (window.electronAPI) {
  document.getElementById('win-minimize').addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('win-maximize').addEventListener('click', () => window.electronAPI.maximize());
  document.getElementById('win-close').addEventListener('click', () => window.electronAPI.close());
  window.electronAPI.onMaximizeChange((maximized) => {
    document.getElementById('win-maximize').textContent = maximized ? '❐' : '□';
  });
}

settingsSave.addEventListener('click', async () => {
  const toolRows = settingsToolsList.querySelectorAll('.tool-setting-row');
  const tools = {};
  toolRows.forEach((row, i) => {
    const name = TOOL_NAMES[i];
    const enabled = row.querySelector('.tool-enabled').checked;
    tools[name] = { enabled };
  });

  let selected;
  modeRadios.forEach(r => { if (r.checked) selected = r.value; });
  await api('PUT', '/api/settings', {
    yoloMode: selected === 'yolo',
    autoApprove: selected === 'auto-approve',
    browserHeadless: !showBrowserCheck.checked,
    openrouterKey: settingsOrKey.value,
    openrouterModel: settingsOrModel.value,
    geminiKey: settingsGeminiKey.value,
    geminiModel: settingsGeminiModel.value,
    tools,
  });
  closeSettings();
});

function exportAsMarkdown() {
  if (!currentThreadId) return;
  api('GET', `/api/threads/${currentThreadId}`).then(thread => {
    let md = `# ${thread.name}\n\n`;
    for (const m of thread.messages) {
      const time = m.timestamp ? formatTime(m.timestamp) : '';
      if (m.role === 'user') md += `**User** (${time}):\n${m.content}\n\n`;
      else if (m.role === 'assistant') md += `**Assistant** (${time}):\n${m.content}\n\n`;
      else if (m.role === 'tool') md += `**Tool** (${m.tool_name || 'tool'}) (${time}):\n${m.content}\n\n`;
    }
    downloadFile(`${thread.name}.md`, md, 'text/markdown');
    closeExport();
  });
}

function exportAsJson() {
  if (!currentThreadId) return;
  api('GET', `/api/threads/${currentThreadId}`).then(thread => {
    const data = { name: thread.name, created: thread.created, rootPath: thread.rootPath, messages: thread.messages };
    downloadFile(`${thread.name}.json`, JSON.stringify(data, null, 2), 'application/json');
    closeExport();
  });
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function openExport() {
  exportModal.classList.remove('hidden');
  exportOverlay.classList.remove('hidden');
}

function closeExport() {
  exportModal.classList.add('hidden');
  exportOverlay.classList.add('hidden');
}

exportBtn.addEventListener('click', openExport);
exportClose.addEventListener('click', closeExport);
exportOverlay.addEventListener('click', closeExport);
exportMarkdown.addEventListener('click', exportAsMarkdown);
exportJson.addEventListener('click', exportAsJson);

/* --- Approval popup --- */
const approveOverlay = document.getElementById('approve-overlay');
const approveModal = document.getElementById('approve-modal');
const approveToolName = document.getElementById('approve-tool-name');
const approveToolArgs = document.getElementById('approve-tool-args');
const approveWarnings = document.getElementById('approve-warnings');
const approveAccept = document.getElementById('approve-accept');
const approveReject = document.getElementById('approve-reject');
let pendingApprovalId = null;

function showApproval(data) {
  pendingApprovalId = data.id;
  approveToolName.textContent = data.name;
  approveToolArgs.textContent = JSON.stringify(data.args, null, 2);
  approveWarnings.innerHTML = '';
  if (data.warnings && data.warnings.length > 0) {
    for (const w of data.warnings) {
      const el = document.createElement('div');
      el.className = 'approve-warning-item';
      el.textContent = '⚠️ ' + w;
      approveWarnings.appendChild(el);
    }
  }
  approveModal.classList.remove('hidden');
  approveOverlay.classList.remove('hidden');
}

function hideApproval() {
  approveModal.classList.add('hidden');
  approveOverlay.classList.add('hidden');
  pendingApprovalId = null;
}

approveAccept.addEventListener('click', async () => {
  if (!pendingApprovalId) return;
  const id = pendingApprovalId;
  hideApproval();
  await fetch('/api/approve-tool/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: true }),
  });
});

approveReject.addEventListener('click', async () => {
  if (!pendingApprovalId) return;
  const id = pendingApprovalId;
  hideApproval();
  await fetch('/api/approve-tool/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: false }),
  });
});

/* --- Ask modal --- */
const askOverlay = document.getElementById('ask-overlay');
const askModal = document.getElementById('ask-modal');
const askBody = document.getElementById('ask-body');
const askSubmit = document.getElementById('ask-submit');
let pendingAskId = null;

function showAskModal(data) {
  pendingAskId = data.id;
  askBody.innerHTML = '';
  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i];
    const section = document.createElement('div');
    section.className = 'ask-question';
    section.dataset.index = i;

    const qLabel = document.createElement('div');
    qLabel.className = 'ask-question-label';
    qLabel.textContent = (i + 1) + '. ' + q.question;
    section.appendChild(qLabel);

    const optsDiv = document.createElement('div');
    optsDiv.className = 'ask-options';

    for (let j = 0; j < q.options.length; j++) {
      const opt = q.options[j];
      const optRow = document.createElement('label');
      optRow.className = 'ask-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'ask_q_' + i;
      radio.value = opt.label;
      if (j === 0) radio.checked = true;
      radio.addEventListener('change', () => {
        const ci = section.querySelector('.ask-custom-input');
        if (ci) ci.value = '';
      });
      optRow.appendChild(radio);

      const optText = document.createElement('span');
      optText.className = 'ask-option-text';
      optText.textContent = opt.label;
      optRow.appendChild(optText);

      if (opt.description) {
        const optDesc = document.createElement('span');
        optDesc.className = 'ask-option-desc';
        optDesc.textContent = opt.description;
        optRow.appendChild(optDesc);
      }

      if (q.recommended !== undefined && q.recommended !== null && j === q.recommended) {
        const badge = document.createElement('span');
        badge.className = 'ask-recommended-badge';
        badge.textContent = 'Recommended';
        optRow.appendChild(badge);
      }

      optsDiv.appendChild(optRow);
    }

    section.appendChild(optsDiv);

    const allowCustom = q.allowCustom !== false;
    if (allowCustom) {
      const customRow = document.createElement('div');
      customRow.className = 'ask-custom-row';
      const customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.className = 'ask-custom-input';
      customInput.placeholder = 'Or type your own answer...';
      customInput.addEventListener('input', () => {
        const radios = section.querySelectorAll('input[type="radio"]');
        radios.forEach(r => r.checked = false);
      });
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          askSubmit.click();
        }
      });
      customRow.appendChild(customInput);
      section.appendChild(customRow);
    }

    askBody.appendChild(section);
  }

  askModal.classList.remove('hidden');
  askOverlay.classList.remove('hidden');
}

function hideAskModal() {
  askModal.classList.add('hidden');
  askOverlay.classList.add('hidden');
  pendingAskId = null;
}

askSubmit.addEventListener('click', async () => {
  if (!pendingAskId) return;
  const sections = askBody.querySelectorAll('.ask-question');
  const answers = [];
  for (const section of sections) {
    const i = parseInt(section.dataset.index);
    const selected = section.querySelector('input[type="radio"]:checked');
    const customInput = section.querySelector('.ask-custom-input');
    let answer = selected ? selected.value : '';
    let wasCustom = false;
    if (customInput && customInput.value.trim()) {
      answer = customInput.value.trim();
      wasCustom = true;
    }
    answers.push({ questionIndex: i, answer, wasCustom });
  }
  const id = pendingAskId;
  hideAskModal();
  await fetch('/api/answer-ask/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
});

askOverlay.addEventListener('click', hideAskModal);

loopStopBtn.addEventListener('click', () => {
  if (currentAbortController) {
    currentAbortController.abort();
    loopWarning.classList.add('hidden');
  }
});

loopIgnoreBtn.addEventListener('click', async () => {
  if (currentThreadId) {
    await api('POST', `/api/threads/${currentThreadId}/ignore-loop-warning`);
    loopWarning.classList.add('hidden');
  }
});

queueClear.addEventListener('click', () => {
  messageQueue = [];
  updateQueueUI();
});

newThreadBtn.addEventListener('click', async () => {
  const modelType = modelTypeSelect.value;
  const thread = await api('POST', '/api/threads', { name: 'Thread ' + (threads.length + 1), modelType });
  await loadThreads();
  switchThread(thread.id);
});

modelTypeSelect.addEventListener('change', async () => {
  if (!currentThreadId) return;
  const modelType = modelTypeSelect.value;
  await api('POST', `/api/threads/${currentThreadId}/model-type`, { modelType });
  await loadThreads();
});

rootPathEditBtn.addEventListener('click', () => {
  rootPathInput.value = rootPathText.textContent;
  rootPathEditor.classList.remove('hidden');
  rootPathInput.focus();
});

rootPathSave.addEventListener('click', async () => {
  if (!currentThreadId) return;
  const val = rootPathInput.value.trim();
  const result = await api('POST', `/api/threads/${currentThreadId}/root-path`, { rootPath: val });
  if (result.ok) {
    showRootPath(result.rootPath);
  }
  rootPathEditor.classList.add('hidden');
});

rootPathCancel.addEventListener('click', () => {
  rootPathEditor.classList.add('hidden');
});

let tabCompletions = [];
let tabIndex = 0;

function parentDir(p) {
  const i = p.replace(/[\\/]$/, '').lastIndexOf('\\');
  const j = p.replace(/[\\/]$/, '').lastIndexOf('/');
  const idx = Math.max(i, j);
  return idx >= 0 ? p.slice(0, idx + 1) : p;
}

rootPathInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const val = rootPathInput.value;
    if (!val) return;
    if (tabCompletions.length > 0) {
      tabIndex = (tabIndex + 1) % tabCompletions.length;
      rootPathInput.value = parentDir(val) + tabCompletions[tabIndex];
    } else {
      tabCompletions = await api('POST', '/api/autocomplete', { path: val });
      tabIndex = 0;
      if (tabCompletions.length > 0) {
        rootPathInput.value = parentDir(val) + tabCompletions[0];
      }
    }
    return;
  }
  tabCompletions = [];
  if (e.key === 'Enter') { e.preventDefault(); rootPathSave.click(); }
  if (e.key === 'Escape') { rootPathCancel.click(); }
});

/* --- @mention --- */
const COMMANDS = [
  { name: '/export', desc: 'Export thread to Markdown or JSON' },
  { name: '/clear', desc: 'Clear all messages in this thread' },
  { name: '/usefallback', desc: 'Toggle Gemini as primary provider for this thread' },
  { name: '/compact', desc: 'Compact conversation to save context space' },
  { name: '/delete', desc: 'Delete this entire thread' },
];

const mentionDropdown = document.getElementById('mention-dropdown');
const commandDropdown = document.getElementById('command-dropdown');
let mentionState = null;
let commandState = null;

function getMentionAtCursor(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  const after = before.slice(atIdx + 1);
  if (after.includes(' ') || after.includes('\n') || after.includes('\t')) return null;
  return { start: atIdx, query: after };
}

function getMentionRoot() {
  const rpEl = document.getElementById('root-path-text');
  const val = rpEl ? rpEl.textContent : '';
  return val || 'C:\\';
}

async function updateMentionDropdown() {
  const text = input.value;
  const pos = input.selectionStart;
  const m = getMentionAtCursor(text, pos);
  if (!m) { hideMentionDropdown(); return; }
  if (m.query.length < 1) { hideMentionDropdown(); return; }

  const root = getMentionRoot();
  const results = await api('POST', '/api/file-search', { query: m.query, root });

  if (results.length === 0) {
    mentionDropdown.innerHTML = '<div class="mention-empty">No files found</div>';
    mentionDropdown.classList.remove('hidden');
    mentionState = { start: m.start, query: m.query, items: [], index: 0 };
    return;
  }

  mentionState = { start: m.start, query: m.query, items: results, index: 0 };
  renderMentionItems();
  mentionDropdown.classList.remove('hidden');
}

function renderMentionItems() {
  if (!mentionState) return;
  mentionDropdown.innerHTML = '';
  for (let i = 0; i < mentionState.items.length; i++) {
    const item = mentionState.items[i];
    const el = document.createElement('div');
    el.className = 'mention-item' + (i === mentionState.index ? ' active' : '');
    const icon = item.isDir ? '📁' : '📄';
    el.innerHTML = `<span class="mention-name">${icon} ${esc(item.name)}</span><span class="mention-path">${esc(item.path)}</span>`;
    el.addEventListener('click', () => selectMention(i));
    el.addEventListener('mouseenter', () => { mentionState.index = i; renderMentionItems(); });
    mentionDropdown.appendChild(el);
  }
}

function hideMentionDropdown() {
  mentionDropdown.classList.add('hidden');
  mentionState = null;
}

function selectMention(idx) {
  if (!mentionState || idx >= mentionState.items.length) return;
  const item = mentionState.items[idx];
  const before = input.value.slice(0, mentionState.start);
  const after = input.value.slice(input.selectionStart);
  const insert = '@' + item.path + ' ';
  input.value = before + insert + after;
  const pos = before.length + insert.length;
  input.setSelectionRange(pos, pos);
  hideMentionDropdown();
  input.dispatchEvent(new Event('input'));
}

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  updateMentionDropdown();
  updateCommandDropdown();
});

function handleDropdownKeydown(e) {
  const activeDropdown = mentionState ? 'mention' : (commandState ? 'command' : null);
  if (!activeDropdown) return false;

  const state = activeDropdown === 'mention' ? mentionState : commandState;
  const renderFn = activeDropdown === 'mention' ? renderMentionItems : renderCommandItems;
  const selectFn = activeDropdown === 'mention' ? selectMention : selectCommand;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.index = Math.min(state.index + 1, state.items.length - 1);
    renderFn();
    return true;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.index = Math.max(state.index - 1, 0);
    renderFn();
    return true;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (state.items.length > 0) {
      e.preventDefault();
      selectFn(state.index);
      return true;
    }
  } else if (e.key === 'Escape') {
    if (mentionState) hideMentionDropdown();
    if (commandState) hideCommandDropdown();
    return true;
  }
  return false;
}

input.addEventListener('keydown', (e) => {
  if (handleDropdownKeydown(e)) return;
});

function getCommandAtCursor(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  if (before.length === 0) return null;
  if (!before.startsWith('/')) return null;
  if (before.length > 1 && before.includes(' ')) return null;
  return { query: before.slice(1) };
}

function updateCommandDropdown() {
  const text = input.value;
  const pos = input.selectionStart;
  const m = getCommandAtCursor(text, pos);
  if (!m) { hideCommandDropdown(); return; }

  const results = COMMANDS.filter(c => c.name.slice(1).startsWith(m.query.toLowerCase()));
  if (results.length > 0) {
    commandState = { query: m.query, items: results, index: 0 };
    renderCommandItems();
    commandDropdown.classList.remove('hidden');
  } else {
    commandDropdown.innerHTML = '<div class="command-item command-empty">No commands found</div>';
    commandDropdown.classList.remove('hidden');
    commandState = { query: m.query, items: [], index: 0 };
  }
}

function renderCommandItems() {
  if (!commandState) return;
  commandDropdown.innerHTML = '';
  for (let i = 0; i < commandState.items.length; i++) {
    const item = commandState.items[i];
    const el = document.createElement('div');
    el.className = 'command-item' + (i === commandState.index ? ' active' : '');
    el.innerHTML = `<span class="command-name">${esc(item.name)}</span><span class="command-desc">${esc(item.desc)}</span>`;
    el.addEventListener('click', () => selectCommand(i));
    el.addEventListener('mouseenter', () => { commandState.index = i; renderCommandItems(); });
    commandDropdown.appendChild(el);
  }
}

function hideCommandDropdown() {
  commandDropdown.classList.add('hidden');
  commandState = null;
}

function selectCommand(idx) {
  if (!commandState || idx >= commandState.items.length) return;
  const cmd = commandState.items[idx];
  input.value = cmd.name + ' ';
  input.setSelectionRange(cmd.name.length + 1, cmd.name.length + 1);
  hideCommandDropdown();
  input.dispatchEvent(new Event('input'));
  input.focus();
}

function parseFileMentions(text) {
  const mentions = [];
  const re = /@(\S+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

async function handleCommand(cmd, rawText) {
  hideCommandDropdown();
  if (cmd !== 'export' && !currentThreadId) {
    addSystemMessage('No thread selected.');
    return;
  }
  if (cmd === 'export') {
    exportModal.classList.remove('hidden');
    exportOverlay.classList.remove('hidden');
    return;
  }
  if (cmd === 'clear') {
    showConfirmDialog('Clear Thread', 'Are you sure you want to clear all messages in this thread? This cannot be undone.', async () => {
      await api('POST', `/api/threads/${currentThreadId}/clear`);
      await switchThread(currentThreadId);
    });
    return;
  }
  if (cmd === 'usefallback') {
    const thread = await api('GET', `/api/threads/${currentThreadId}`);
    const newVal = !thread.useGemini;
    await api('POST', `/api/threads/${currentThreadId}/use-gemini`, { useGemini: newVal });
    addSystemMessage(`Switched to ${newVal ? 'Gemini-first' : 'OpenRouter-first'} mode for this thread.`);
    return;
  }
  if (cmd === 'compact') {
    compactBar.classList.remove('hidden');
    try {
      const result = await api('POST', `/api/threads/${currentThreadId}/compact`);
      await switchThread(currentThreadId);
      addSystemMessage(`Compacted conversation (${result.summaryTokens} summary tokens, ${result.totalMessages} messages remaining).`);
    } catch (err) {
      addSystemMessage('Compaction failed: ' + err.message);
    }
    compactBar.classList.add('hidden');
    return;
  }
  if (cmd === 'delete') {
    showConfirmDialog('Delete Thread', 'Are you sure you want to permanently delete this thread? This cannot be undone.', async () => {
      await api('DELETE', `/api/threads/${currentThreadId}`);
      threads = await api('GET', '/api/threads');
      if (threads.length === 0) {
        currentThreadId = null;
        showWelcome();
      } else {
        await switchThread(threads[threads.length - 1].id);
      }
    });
    return;
  }
  addSystemMessage(`Unknown command: /${cmd}. Available: /export, /clear, /usefallback, /compact, /delete`);
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message system';
  el.innerHTML = `<div class="label">system</div><div class="content" dir="auto">${esc(text)}</div>`;
  messagesEl.appendChild(el);
  messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
}

const confirmOverlay = document.getElementById('confirm-overlay');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');
let confirmCallback = null;

function showConfirmDialog(title, message, onConfirm) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  confirmOverlay.classList.remove('hidden');
  confirmModal.classList.remove('hidden');
}

function hideConfirmDialog() {
  confirmOverlay.classList.add('hidden');
  confirmModal.classList.add('hidden');
  confirmCallback = null;
}

confirmCancel.addEventListener('click', hideConfirmDialog);
confirmOverlay.addEventListener('click', hideConfirmDialog);
confirmOk.addEventListener('click', () => {
  const cb = confirmCallback;
  hideConfirmDialog();
  if (cb) cb();
});

async function send() {
  const text = input.value.trim();
  if (!text || !currentThreadId) return;

  if (!ready) {
    messageQueue.push(text);
    updateQueueUI();
    input.value = '';
    input.style.height = 'auto';
    return;
  }

  input.value = '';
  input.style.height = 'auto';

  const cmdMatch = text.match(/^\/(\S+)/);
  if (cmdMatch) {
    return handleCommand(cmdMatch[1].toLowerCase(), text);
  }

  setStatus(false);

  const filePaths = parseFileMentions(text);
  let fileContext = null;
  if (filePaths.length > 0) {
    const batch = await api('POST', '/api/file-batch', { paths: filePaths });
    fileContext = batch.files.filter(f => f.exists && !f.binary);
  }

  const thread = await api('GET', `/api/threads/${currentThreadId}`);
  const baseIndex = thread.messages.length;

  const emptyState = messagesEl.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const userEl = document.createElement('div');
  userEl.className = 'message user';
  let userHtml = `<div class="label">user</div>`;
  if (fileContext && fileContext.length > 0) {
    userHtml += `<div class="msg-context-bar">`;
    for (const f of fileContext) {
      userHtml += `<span class="file-chip"><span class="file-chip-icon">📄</span>${esc(f.path)}</span>`;
    }
    userHtml += `</div>`;
  }
  userHtml += `<div class="content" dir="auto">${renderUserContent(text)}</div>`;
  userEl.innerHTML = userHtml;
  attachContextMenu(userEl, baseIndex);
  messagesEl.appendChild(userEl);
  messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;

  let augmentedText = text;
  if (fileContext && fileContext.length > 0) {
    const ctxParts = fileContext.map(f => `File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
    augmentedText += '\n\n---\nReferenced files:\n' + ctxParts.join('\n\n');
  }

  await api('POST', `/api/threads/${currentThreadId}/messages`, {
    role: 'user',
    content: augmentedText,
  });

  /* ---- rest of original send() (streaming, tool bubbles, etc.) ---- */

  let msgIndex = baseIndex + 1;

  function createAssistantBubble() {
    const wrapper = document.createElement('div');
    const msgEl = document.createElement('div');
    msgEl.className = 'message assistant';
    msgEl.innerHTML = '<div class="label">Jig</div><div class="content" dir="auto"></div>';
    attachContextMenu(msgEl, msgIndex);
    wrapper.appendChild(msgEl);
    const loadingBar = document.createElement('div');
    loadingBar.className = 'loading-bar';
    wrapper.appendChild(loadingBar);
    messagesEl.appendChild(wrapper);
    messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
    return { wrapper, msgEl, contentEl: msgEl.querySelector('.content'), thinkEl: null, thinkBody: null, loadingBar };
  }

  let bubble = createAssistantBubble();

  function ensureThinkBubble() {
    if (bubble.thinkEl) return;
    bubble.thinkEl = document.createElement('div');
    bubble.thinkEl.className = 'thinking-bubble';
    bubble.thinkEl.innerHTML = `<div class="thinking-header">Thinking<svg class="think-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></div><div class="thinking-body hidden"></div>`;
    bubble.thinkEl.querySelector('.thinking-header').addEventListener('click', (e) => {
      const container = e.currentTarget.closest('.thinking-bubble');
      container.querySelector('.thinking-body').classList.toggle('hidden');
      container.querySelector('.think-arrow').classList.toggle('open');
    });
    bubble.thinkBody = bubble.thinkEl.querySelector('.thinking-body');
    bubble.wrapper.insertBefore(bubble.thinkEl, bubble.msgEl);
  }

  let accumulatedContent = '';
  let accumulatedThinking = '';
  let toolBubbleEl = null;

  function updateAssistantContent() {
    bubble.contentEl.innerHTML = renderMarkdown(accumulatedContent);
    if (!userScrolledUp) {
      chat.scrollTop = chat.scrollHeight;
    } else {
      scrollBottomBtn.classList.remove('hidden');
    }
  }

  try {
    const ac = new AbortController();
    currentAbortController = ac;
    const res = await fetch(`/api/threads/${currentThreadId}/stream`, { method: 'POST', signal: ac.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.saved) continue;
          if (parsed.loopWarning) {
            loopWarning.classList.remove('hidden');
            continue;
          }
          if (parsed.compacting) {
            compactBar.classList.remove('hidden');
            compactBar.classList.add('compacting');
            compactBar.classList.remove('compacted');
            compactText.textContent = 'Compacting conversation to save context space...';
            continue;
          }
          if (parsed.compacted) {
            compactBar.classList.remove('compacting');
            compactBar.classList.add('compacted');
            compactText.textContent = `Compacted! (~${parsed.summaryTokens} tokens summary, ${parsed.totalMessages} messages)`;
            setTimeout(() => compactBar.classList.add('hidden'), 3000);
            continue;
          }
          if (parsed.compactError) {
            compactBar.classList.remove('compacting');
            compactText.textContent = 'Compaction failed: ' + parsed.compactError;
            setTimeout(() => compactBar.classList.add('hidden'), 5000);
            continue;
          }
          if (parsed.turnEnd) {
            if (!accumulatedContent && !accumulatedThinking && bubble.wrapper.parentNode) {
              bubble.wrapper.remove();
            }
            if (bubble.loadingBar) bubble.loadingBar.classList.add('done');
            applySyntaxHighlighting();
            addCopyButtons();
            accumulatedThinking = '';
            accumulatedContent = '';
            msgIndex++;
            bubble = createAssistantBubble();
            continue;
          }
          if (parsed.toolPending) {
            showApproval(parsed.toolPending);
            continue;
          }
          if (parsed.askPending) {
            showAskModal(parsed.askPending);
            continue;
          }
          if (parsed.toolStart) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tool-bubble executing';
            wrapper.innerHTML = `
              <div class="tool-bubble-header">
                <span class="tool-bubble-name">${esc(parsed.toolStart)}</span>
                <span class="tool-bubble-status">Running...</span>
              </div>
            `;
            messagesEl.appendChild(wrapper);
            if (!userScrolledUp) {
              chat.scrollTop = chat.scrollHeight;
            }
            toolBubbleEl = wrapper;
            continue;
          }
          if (parsed.toolResult) {
            if (toolBubbleEl) {
              toolBubbleEl.className = 'tool-bubble ' + (parsed.toolResult.success ? 'success' : 'error');
              const statusEl = toolBubbleEl.querySelector('.tool-bubble-status');
              if (statusEl) {
                statusEl.textContent = parsed.toolResult.success ? 'Success' : 'Failed';
              }
              if (parsed.toolResult.error) {
                const errEl = document.createElement('div');
                errEl.className = 'tool-bubble-result';
                errEl.textContent = parsed.toolResult.error;
                toolBubbleEl.appendChild(errEl);
              }
              messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
            }
            toolBubbleEl = null;
            continue;
          }
          if (parsed.thinking) {
            accumulatedThinking += parsed.thinking;
            ensureThinkBubble();
            bubble.thinkBody.innerHTML = renderMarkdown(accumulatedThinking);
          }
          if (parsed.content) {
            accumulatedContent += parsed.content;
            updateAssistantContent();
          }
        } catch {}
      }
    }
  } catch (err) {
    currentAbortController = null;
    if (err.name === 'AbortError') {
      if (accumulatedContent) {
        accumulatedContent += '\n\n*Interrupted*';
        updateAssistantContent();
      }
    } else {
      accumulatedContent = 'Error: ' + err.message;
      updateAssistantContent();
    }
  }

  if (bubble.loadingBar) bubble.loadingBar.classList.add('done');
  currentAbortController = null;

  if (bubble.thinkEl) {
    bubble.thinkEl.querySelector('.think-arrow').classList.remove('open');
    bubble.thinkEl.querySelector('.thinking-body').classList.add('hidden');
  }

  applySyntaxHighlighting();
  addCopyButtons();
  await loadThreads();
  setStatus(true);
  processQueue();
}

function renderUserContent(text) {
  return esc(text).replace(/@(\S+)/g, '<span class="file-chip"><span class="file-chip-icon">📄</span>$1</span>');
}

sendBtn.addEventListener('click', send);
input.addEventListener('keydown', (e) => {
  if (mentionState || commandState) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !ready && currentAbortController) {
    const now = Date.now();
    if (now - lastEscPress < 500) {
      currentAbortController.abort();
      lastEscPress = 0;
    } else {
      lastEscPress = now;
    }
  }
});

chat.addEventListener('scroll', () => {
  if (isScrolledToBottom()) {
    scrollBottomBtn.classList.add('hidden');
    userScrolledUp = false;
  } else {
    userScrolledUp = true;
  }
});

scrollBottomBtn.addEventListener('click', scrollToBottom);

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
});

const updateBar = document.getElementById('update-bar');
const updateText = document.getElementById('update-text');
const updateProgress = document.getElementById('update-progress');
const updateDownloadBtn = document.getElementById('update-download-btn');
const updateInstallBtn = document.getElementById('update-install-btn');
const updateCloseBtn = document.getElementById('update-close-btn');

if (window.electronAPI) {
  window.electronAPI.onUpdateAvailable((info) => {
    updateText.textContent = `Version ${info.version} available`;
    updateDownloadBtn.classList.remove('hidden');
    updateInstallBtn.classList.add('hidden');
    updateProgress.classList.add('hidden');
    updateBar.classList.remove('hidden');
  });

  window.electronAPI.onUpdateDownloadProgress((progress) => {
    updateProgress.classList.remove('hidden');
    updateProgress.textContent = `Downloading... ${Math.round(progress.percent)}%`;
  });

  window.electronAPI.onUpdateDownloaded(() => {
    updateProgress.classList.add('hidden');
    updateDownloadBtn.classList.add('hidden');
    updateInstallBtn.classList.remove('hidden');
    updateText.textContent = 'Update downloaded — restart to install';
  });

  updateDownloadBtn.addEventListener('click', () => {
    updateDownloadBtn.disabled = true;
    updateDownloadBtn.textContent = 'Downloading...';
    window.electronAPI.restartAndUpdate();
  });

  updateInstallBtn.addEventListener('click', () => {
    window.electronAPI.restartAndUpdate();
  });

  updateCloseBtn.addEventListener('click', () => {
    updateBar.classList.add('hidden');
  });
}

(async () => {
  await loadThreads();
  if (threads.length > 0) {
    switchThread(threads[threads.length - 1].id);
  } else {
    showWelcome();
  }
})();
