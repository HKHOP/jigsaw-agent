const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execSync } = require('node:child_process');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from disk',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute or relative path to the file' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with new content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          content: { type: 'string', description: 'Content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact string match in a file with new text',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          old_string: { type: 'string', description: 'The exact text to find and replace' },
          new_string: { type: 'string', description: 'The replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories in a given path',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path to list' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Search file contents using a regex pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search (default: current project)' },
          include: { type: 'string', description: 'File glob pattern to filter (e.g. *.js)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command on the system',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          workdir: { type: 'string', description: 'Working directory for the command' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a file or directory',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Current path of the file/directory' },
          destination: { type: 'string', description: 'New path for the file/directory' },
        },
        required: ['source', 'destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or an empty directory',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the file or empty directory to delete' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_stats',
      description: 'Get metadata about a file or directory (size, modified time, type, permissions)',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the file or directory' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_dir',
      description: 'Create a new directory (including parent directories if needed)',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path to create' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_env',
      description: 'Read environment variables (optionally filter by key). Sensitive vars are masked.',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Specific env var name to read (omit to list all)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_operations',
      description: 'Run git operations: status, diff, log, commit, push, pull, branch, checkout',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['status', 'diff', 'log', 'commit', 'push', 'pull', 'branch', 'checkout', 'add'],
            description: 'Git operation to perform',
          },
          args: { type: 'string', description: 'Additional arguments for the git command' },
        },
        required: ['operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob_find',
      description: 'Find files matching a glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. **/*.js, src/**/*.ts)' },
          path: { type: 'string', description: 'Root directory to search (default: current project)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'watch_file',
      description: 'Watch a file or directory for changes and return recent modifications',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File or directory to watch' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo. Returns up to 10 results with title, URL, and snippet. Use page parameter (1-based) to get more results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (keywords or full sentence)' },
          page: { type: 'number', description: 'Page number for pagination (1-based, default: 1)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a URL and return its content as clean plain text (strips HTML, scripts, styles)',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 15000)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_files',
      description: 'Find files by name pattern, minimum/maximum size, and modified date range',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Filename pattern to match (case-insensitive, e.g. "*.js", "test*")' },
          path: { type: 'string', description: 'Directory to search (default: current project)' },
          minSize: { type: 'number', description: 'Minimum file size in bytes' },
          maxSize: { type: 'number', description: 'Maximum file size in bytes' },
          maxResults: { type: 'number', description: 'Max results to return (default: 50)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'network_info',
      description: 'Get local network information: IP addresses, hostname, DNS servers',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'process_info',
      description: 'List running processes with their PID, CPU usage (%), memory usage (MB), and whether the process has a visible window. Optionally filter by process name.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Filter by process name (case-insensitive, e.g. "node", "chrome"). Omit to list all processes.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clipboard',
      description: 'Read from or write to the system clipboard',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write'], description: '"read" to get clipboard contents, "write" to set them' },
          content: { type: 'string', description: 'Text to write (required when action is "write")' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'download_file',
      description: 'Download a file from a URL and save it to disk',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to download from' },
          output: { type: 'string', description: 'Local path to save the file to' },
        },
        required: ['url', 'output'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hash_file',
      description: 'Compute a hash (MD5, SHA256, SHA1) of a file or string',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to hash' },
          algorithm: { type: 'string', enum: ['md5', 'sha256', 'sha1', 'sha512'], description: 'Hash algorithm (default: sha256)' },
          text: { type: 'string', description: 'Hash a text string instead of a file' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_password',
      description: 'Generate random passwords, UUIDs, or cryptographic tokens',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['password', 'uuid', 'token', 'pin'], description: 'Type of value to generate (default: password)' },
          length: { type: 'number', description: 'Length for password/token (default: 16 for password, 32 for token)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'math_eval',
      description: 'Safely evaluate a mathematical expression. Supports + - * / ^ ( ) pi e sin cos tan sqrt log abs round floor ceil',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Mathematical expression to evaluate' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crypto_utils',
      description: 'Encrypt or decrypt a file using AES-256-CBC',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['encrypt', 'decrypt'], description: 'Whether to encrypt or decrypt' },
          input: { type: 'string', description: 'Path to the input file' },
          output: { type: 'string', description: 'Path for the output file' },
          password: { type: 'string', description: 'Password for encryption/decryption' },
        },
        required: ['action', 'input', 'output', 'password'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask',
      description: 'Ask the user up to 5 questions with predefined answer options and a recommended choice. The user can pick an option or type their own answer.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: 'Array of questions to ask (max 5)',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'The question text' },
                options: {
                  type: 'array',
                  description: 'Predefined answer options (2-6)',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: 'Short display text' },
                      description: { type: 'string', description: 'Explanation of the choice' },
                    },
                    required: ['label'],
                  },
                },
                recommended: { type: 'number', description: '0-based index of recommended option' },
                allowCustom: { type: 'boolean', description: 'Allow user to type own answer (default: true)' },
              },
              required: ['question', 'options'],
            },
          },
        },
        required: ['questions'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Launch browser (if needed) and navigate to a URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'When to consider navigation complete (default: load)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element on the page by CSS selector',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS selector for the element to click' } },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_fill',
      description: 'Fill a form input or textarea on the page',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input element' },
          value: { type: 'string', description: 'Text to type into the field' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_select',
      description: 'Select an option from a <select> element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the select element' },
          value: { type: 'string', description: 'Option value or label to select' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_content',
      description: 'Get the page HTML. By default strips script/style/svg tags. Set includeAll=true to get raw HTML including those.',
      parameters: {
        type: 'object',
        properties: { includeAll: { type: 'boolean', description: 'If true, returns raw HTML including scripts and styles (default: false)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page. Provide a path to save to disk, or omit to get a base64 data URL.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Local file path to save the screenshot (optional)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_evaluate',
      description: 'Execute JavaScript code in the browser page context and return the result',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'JavaScript code to execute in the page' } },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_hover',
      description: 'Hover over an element on the page',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS selector for the element to hover' } },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_text',
      description: 'Get visible text from the page or a specific element',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'Optional CSS selector. Omit to get all visible text from the page body.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_close',
      description: 'Close the browser and release all resources',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_list_tables',
      description: 'List all tables in a SQLite database file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the SQLite database file (.db, .sqlite)' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_get_schema',
      description: 'Get the schema (column names, types, constraints) of a table in a SQLite database',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the SQLite database file' },
          table: { type: 'string', description: 'Table name' },
        },
        required: ['path', 'table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_query',
      description: 'Run a SELECT query against a SQLite database and return the rows',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the SQLite database file' },
          sql: { type: 'string', description: 'SQL query (SELECT/PRAGMA/EXPLAIN only)' },
          params: { type: 'array', description: 'Optional positional parameters for the query', items: {} },
        },
        required: ['path', 'sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_execute',
      description: 'Run an INSERT, UPDATE, DELETE, or DDL statement against a SQLite database',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the SQLite database file' },
          sql: { type: 'string', description: 'SQL statement to execute' },
          params: { type: 'array', description: 'Optional positional parameters', items: {} },
        },
        required: ['path', 'sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_apps',
      description: 'List all available applications from the Windows Start Menu with their executable paths',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open an application by its full executable path (use list_apps first to get paths)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Full path to the application executable or shortcut' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_backup',
      description: 'Create a backup copy of a SQLite database file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the source SQLite database file' },
          output: { type: 'string', description: 'Path for the backup file' },
        },
        required: ['path', 'output'],
      },
    },
  },
];

const SENSITIVE_KEYS = ['KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'AUTH'];

function maskSensitive(value, key) {
  const isSensitive = SENSITIVE_KEYS.some(s => key.toUpperCase().includes(s));
  if (!isSensitive) return value;
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

function inRootPath(p, rootPath, settings) {
  if (!rootPath) return true;
  if (settings?.elevatedPermissions) return true;
  const resolved = path.resolve(p);
  const root = path.resolve(rootPath);
  const normalized = resolved.toLowerCase().replace(/\\/g, '/');
  const rootNorm = root.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
  return normalized === rootNorm || normalized.startsWith(rootNorm + '/');
}

async function executeTool(name, args, settings, rootPath) {
  const toolCfg = settings?.tools?.[name] || {};

  const base = (rootPath && rootPath.trim()) ? path.resolve(rootPath) : ((process.env.SystemDrive || 'C:') + path.sep);
  const PATH_ARGS = ['path', 'dir', 'input', 'output', 'source', 'destination', 'searchPath'];
  for (const key of PATH_ARGS) {
    if (args[key]) {
      args[key] = path.resolve(base, args[key]);
    }
  }

  switch (name) {
    case 'read_file': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const content = fs.readFileSync(args.path, 'utf-8');
      return { content, size: content.length, path: path.resolve(args.path) };
    }

    case 'write_file': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const dir = path.dirname(args.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(args.path, args.content, 'utf-8');
      return { ok: true, path: path.resolve(args.path), bytes: args.content.length };
    }

    case 'edit_file': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const content = fs.readFileSync(args.path, 'utf-8');
      const idx = content.indexOf(args.old_string);
      if (idx === -1) return { error: `old_string not found in file` };
      const newContent = content.slice(0, idx) + args.new_string + content.slice(idx + args.old_string.length);
      fs.writeFileSync(args.path, newContent, 'utf-8');
      return { ok: true, path: path.resolve(args.path), replaced: 1 };
    }

    case 'list_dir': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const entries = fs.readdirSync(args.path, { withFileTypes: true });
      const listing = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        size: e.isFile() ? fs.statSync(path.join(args.path, e.name)).size : null,
      }));
      return { path: path.resolve(args.path), entries: listing, count: listing.length };
    }

    case 'grep_search': {
      const root = args.path || '.';
      if (!inRootPath(root, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const results = [];
      const includeFilter = args.include ? new RegExp(args.include.replace(/\*/g, '.*')) : null;
      const pattern = new RegExp(args.pattern, 'gi');

      function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          if (e.isFile()) {
            if (includeFilter && !includeFilter.test(e.name)) continue;
            try {
              const content = fs.readFileSync(full, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (pattern.test(lines[i])) {
                  results.push({ file: full, line: i + 1, text: lines[i].trim() });
                }
              }
            } catch {}
          }
        }
      }
      walk(path.resolve(root));
      return { pattern: args.pattern, results, count: results.length };
    }

    case 'run_command': {
      const cwd = args.workdir ? path.resolve(args.workdir) : process.cwd();
      const maxBuffer = 1024 * 1024;
      try {
        const output = execSync(args.command, { cwd, maxBuffer, encoding: 'utf-8', timeout: 30000 });
        return { command: args.command, workdir: cwd, stdout: output, stderr: '', exitCode: 0 };
      } catch (e) {
        return { command: args.command, workdir: cwd, stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1, error: `Command failed (exit code ${e.status || 1})` };
      }
    }

    case 'rename_file': {
      if (!inRootPath(args.source, rootPath, settings) || !inRootPath(args.destination, rootPath, settings)) {
        return { error: 'Access denied: path outside project root' };
      }
      const dir = path.dirname(args.destination);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(args.source, args.destination);
      return { ok: true, from: path.resolve(args.source), to: path.resolve(args.destination) };
    }

    case 'delete_file': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const stat = fs.statSync(args.path);
      const type = stat.isDirectory() ? 'directory' : 'file';
      fs.rmSync(args.path, { recursive: true, force: true });
      return { ok: true, deleted: type, path: path.resolve(args.path) };
    }

    case 'file_stats': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const stat = fs.statSync(args.path);
      return {
        path: path.resolve(args.path),
        type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime,
        permissions: stat.mode.toString(8).slice(-3),
        isSymlink: stat.isSymbolicLink(),
      };
    }

    case 'create_dir': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      fs.mkdirSync(args.path, { recursive: true });
      return { ok: true, path: path.resolve(args.path) };
    }

    case 'read_env': {
      if (args.key) {
        const val = process.env[args.key];
        if (val === undefined) return { key: args.key, value: null, found: false };
        return { key: args.key, value: maskSensitive(val, args.key), found: true };
      }
      const all = {};
      for (const [k, v] of Object.entries(process.env)) {
        all[k] = maskSensitive(v, k);
      }
      return { count: Object.keys(all).length, vars: all };
    }

    case 'git_operations': {
      const cwd = process.cwd();
      const cmd = `git ${args.operation}${args.args ? ' ' + args.args : ''}`;
      try {
        const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 });
        return { operation: args.operation, stdout: output, exitCode: 0 };
      } catch (e) {
        return { operation: args.operation, stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.status || 1 };
      }
    }

    case 'glob_find': {
      const root = args.path ? path.resolve(args.path) : process.cwd();
      if (!inRootPath(root, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const pattern = args.pattern;
      const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/\\\\]*').replace(/\?/g, '.') + '$', 'i');
      const matches = [];

      function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(dir, e.name);
          const rel = path.relative(root, full);
          if (regex.test(rel)) matches.push(rel);
          if (e.isDirectory()) walk(full);
        }
      }
      walk(root);
      return { pattern: args.pattern, root, matches, count: matches.length };
    }

    case 'watch_file': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      try {
        const stat = fs.statSync(args.path);
        return {
          path: path.resolve(args.path),
          exists: true,
          type: stat.isDirectory() ? 'directory' : 'file',
          lastModified: stat.mtime,
          note: 'File system monitoring is available via fs.watch. This returns current state. For live changes, the server watches file modifications in real-time.',
        };
      } catch {
        return { path: path.resolve(args.path), exists: false, error: 'Path does not exist' };
      }
    }

    case 'web_search': {
      const query = args.query;
      const page = Math.max(1, args.page || 1);
      const s = (page - 1) * 10;

      const params = new URLSearchParams({ q: query, s: String(s) });
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      let res;
      try {
        res = await fetch('https://html.duckduckgo.com/html/', {
          method: 'POST', headers, body: params.toString(),
        });
      } catch (e) {
        return { error: e.message };
      }

      if (!res.ok) return { error: `DuckDuckGo ${res.status}: ${res.statusText}` };
      const html = await res.text();

      const results = [];
      const blocks = html.split(/<div class="result[^"]*results_links/);
      for (let i = 1; i < blocks.length && results.length < 10; i++) {
        const block = blocks[i];
        const aMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!aMatch) continue;
        const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        const url = aMatch[1].replace(/^\/\/?/, 'https://');
        results.push({
          url,
          title: aMatch[2].replace(/<[^>]+>/g, '').trim(),
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        });
      }

      const hasMore = html.includes('class="next"') || /value="Next"/.test(html);

      return { query, results, count: results.length, page, hasMore };
    }

    case 'web_fetch': {
      const timeout = args.timeout || 15000;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeout);
      try {
        const res = await fetch(args.url, { signal: ac.signal });
        clearTimeout(timer);
        if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}` };
        const html = await res.text();

        let text = html;
        text = text.replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, '');
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
        if (lines.length > 500) {
          text = lines.slice(0, 500).join('\n') + `\n\n... (truncated, ${lines.length - 500} more lines)`;
        }
        if (text.length > 50000) {
          text = text.slice(0, 50000) + `\n\n... (truncated, ${text.length - 50000} more characters)`;
        }

        return { url: args.url, content: text, chars: text.length, lines: text.split('\n').length };
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') return { error: `Request timed out after ${timeout}ms` };
        return { error: err.message };
      }
    }

    case 'find_files': {
      const searchPath = args.path || '.';
      if (!inRootPath(searchPath, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const maxResults = Math.min(args.maxResults || 50, 500);
      const results = [];

      function visit(dir) {
        if (results.length >= maxResults) return;
        let entries;
        try { entries = fs.readdirSync(dir); } catch { return; }
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          const full = path.join(dir, entry);
          let stat;
          try { stat = fs.statSync(full); } catch { continue; }
          if (stat.isDirectory()) { visit(full); continue; }

          const nameMatch = !args.pattern || entry.toLowerCase().includes(args.pattern.replace(/\*/g, '').toLowerCase());
          const sizeOk = (!args.minSize || stat.size >= args.minSize) && (!args.maxSize || stat.size <= args.maxSize);
          if (nameMatch && sizeOk) {
            results.push({ name: entry, path: full, size: stat.size, modified: stat.mtime.toISOString() });
          }
        }
      }

      visit(searchPath);
      return { files: results, count: results.length, truncated: results.length >= maxResults };
    }

    case 'network_info': {
      const ifaces = os.networkInterfaces();
      const nets = {};
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            (nets[name] ||= []).push(addr.address);
          }
        }
      }
      return {
        hostname: os.hostname(),
        platform: os.platform(),
        ips: nets,
        all: Object.values(ifaces).flat().filter(Boolean).map(a => ({ address: a.address, family: a.family, internal: a.internal })),
      };
    }

    case 'process_info': {
      try {
        const psCmd = 'Get-Process | Select-Object Name, Id, @{N=\\"CPU\\";E={\\"{0:N1}\\" -f $_.CPU}}, @{N=\\"MemMB\\";E={\\"{0:N0}\\" -f ($_.WorkingSet / 1MB)}}, @{N=\\"HasWindow\\";E={$_.MainWindowHandle -ne 0 -and [bool]$_.MainWindowTitle}} | ConvertTo-Json -Compress';
        const raw = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8', timeout: 10000 });
        const processes = JSON.parse(raw.trim());
        const list = Array.isArray(processes) ? processes : [processes];
        const mapped = list.map(p => ({
          name: p.Name || '',
          pid: p.Id || 0,
          cpu: p.CPU !== null && p.CPU !== undefined ? parseFloat(p.CPU) : null,
          memMB: p.MemMB !== null && p.MemMB !== undefined ? parseFloat(p.MemMB) : null,
          hasWindow: p.HasWindow === true,
        }));
        const filtered = args.filter ? mapped.filter(p => p.name.toLowerCase().includes(args.filter.toLowerCase())) : mapped;
        return { processes: filtered, count: filtered.length };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'clipboard': {
      try {
        if (args.action === 'read') {
          const content = execSync('powershell -Command "Get-Clipboard"', { encoding: 'utf8', timeout: 5000 }).trim();
          return { content };
        } else {
          const content = (args.content || '').replace(/"/g, '\\"');
          execSync(`powershell -Command "Set-Clipboard -Value \\"${content}\\""`, { timeout: 5000 });
          return { success: true };
        }
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'download_file': {
      if (args.output && !inRootPath(args.output, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      try {
        const resp = await fetch(args.url);
        if (!resp.ok) return { error: `Download failed: ${resp.status} ${resp.statusText}` };
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(args.output, buf);
        return { success: true, path: args.output, size: buf.length };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'hash_file': {
      if (args.path && !inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      try {
        const algo = args.algorithm || 'sha256';
        const hash = crypto.createHash(algo);
        if (args.text) {
          hash.update(args.text, 'utf8');
        } else if (args.path) {
          hash.update(fs.readFileSync(args.path));
        } else {
          return { error: 'Provide either path or text' };
        }
        return { algorithm: algo, hash: hash.digest('hex') };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'generate_password': {
      const t = args.type || 'password';
      const len = args.length || (t === 'password' ? 16 : t === 'token' ? 32 : t === 'pin' ? 6 : 16);
      switch (t) {
        case 'password': {
          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
          const bytes = crypto.randomBytes(len);
          const pass = Array.from(bytes, b => chars[b % chars.length]).join('');
          return { value: pass, type: t, length: len };
        }
        case 'uuid':
          return { value: crypto.randomUUID(), type: t };
        case 'token': {
          const bytes = crypto.randomBytes(Math.ceil(len / 2));
          return { value: bytes.toString('hex').slice(0, len), type: t, length: len };
        }
        case 'pin':
          return { value: String(100000 + crypto.randomInt(900000)).slice(0, len), type: t, length: len };
        default:
          return { error: `Unknown type: ${t}` };
      }
    }

    case 'math_eval': {
      const expr = args.expression.trim();
      const safe = /^[\d\s+\-*/().,%^eπpieEsincoqsrqtalgbflou]+$/i;
      if (!safe.test(expr)) return { error: 'Expression contains disallowed characters' };
      const vars = {
        pi: Math.PI, e: Math.E,
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        sqrt: Math.sqrt, log: Math.log, abs: Math.abs,
        round: Math.round, floor: Math.floor, ceil: Math.ceil,
        pow: Math.pow, max: Math.max, min: Math.min,
      };
      try {
        const keys = Object.keys(vars);
        const vals = Object.values(vars);
        const fn = new Function(...keys, `"use strict"; return (${expr.replace(/\^/g, '**')});`);
        const result = fn(...vals);
        return { expression: args.expression, result, type: typeof result };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'crypto_utils': {
      if (!inRootPath(args.input, rootPath, settings) || !inRootPath(args.output, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      try {
        const { action, input, output, password } = args;
        const key = crypto.scryptSync(password, 'salt', 32);
        const iv = crypto.randomBytes(16);

        if (action === 'encrypt') {
          const data = fs.readFileSync(input);
          const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
          const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
          fs.writeFileSync(output, encrypted);
          return { success: true, action: 'encrypt', input, output, size: encrypted.length };
        } else {
          const data = fs.readFileSync(input);
          const ivRead = data.subarray(0, 16);
          const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivRead);
          const decrypted = Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]);
          fs.writeFileSync(output, decrypted);
          return { success: true, action: 'decrypt', input, output, size: decrypted.length };
        }
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'see_documentation': {
      const docsDir = path.join(__dirname, 'docs', 'minecraft');
      if (!fs.existsSync(docsDir)) {
        return { query: args.query, results: [], note: 'No documentation available. Run npm run fetch-docs to download docs.' };
      }
      const query = (args.query || '').toLowerCase();
      const keywords = query.split(/\s+/).filter(w => w.length > 2);
      const results = [];
      function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); continue; }
          if (!entry.name.endsWith('.txt')) continue;
          try {
            const header = fs.readFileSync(full, 'utf-8').split('\n').slice(0, 6).join('\n');
            const urlMatch = header.match(/^Source: (.+)$/m);
            const titleMatch = header.match(/^Title: (.+)$/m);
            const categoryMatch = header.match(/^Category: (.+)$/m);
            const url = urlMatch ? urlMatch[1].trim() : null;
            const title = titleMatch ? titleMatch[1].trim() : entry.name.replace(/\.txt$/, '');
            const category = categoryMatch ? categoryMatch[1].trim() : '';
            const searchable = (entry.name + ' ' + title + ' ' + category).toLowerCase();
            let score = 0;
            for (const kw of keywords) {
              if (searchable.includes(kw)) score += 1;
            }
            if (score > 0 && url) {
              results.push({ title, url, category, score, file: entry.name });
            }
          } catch {}
        }
      }
      if (fs.existsSync(docsDir)) walk(docsDir);
      results.sort((a, b) => b.score - a.score);
      return {
        query: args.query,
        note: 'Use web_fetch to retrieve the full content from any of these URLs.',
        results: results.slice(0, 10),
        count: Math.min(results.length, 10),
        totalFound: results.length,
      };
    }

    case 'invent_tool': {
      const successMessages = [
        `The "${args.name}" tool processed your request. Results: approximately 47 things happened.`,
        `SUCCESS: "${args.name}" completed with output: ${JSON.stringify(args.args || {}).slice(0, 50)}... (probably)`,
        `"${args.name}" ran successfully! Computing... done! Output: 🎉`,
        `Beep boop. "${args.name}" finished. Everything is fine. Definitely.`,
        `"${args.name}" returned: "Nice try big brain! The answer is 42. Or maybe 43. I forget."`,
        `Analysis complete. "${args.name}" says: your request has been filed under "N/A".`,
        `SYSTEM: "${args.name}" executed. Result: ██████████ 100% — oh wait that was loading bar not result.`,
      ];
      const failMessages = [
        `ERROR: "${args.name}" failed. Reason: blinker fluid is empty. Please refill and try again.`,
        `CRITICAL FAILURE: "${args.name}" encountered a 404 brain cell not found.`,
        `"${args.name}" crashed. Error code: 0xDEADBEEF. (That's a real error code I swear.)`,
        `FATAL: "${args.name}" requires a valid license key. Yours is: INVALID-BRAIN-123.`,
        `"${args.name}" ran into an unexpected error: divide by potato.`,
        `ERROR 418: "${args.name}" cannot brew coffee. I'm a teapot, big brain.`,
        `"${args.name}" failed because the quantum entanglement cable is unplugged.`,
      ];
      const delay = 500 + Math.random() * 2500;
      await new Promise(r => setTimeout(r, delay));
      if (args.should_fail) {
        const message = failMessages[Math.floor(Math.random() * failMessages.length)];
        return {
          error: message,
          invented_tool: args.name,
          called_with: args.args || {},
          status: 'failed',
          processing_time_ms: Math.round(delay),
        };
      }
      const message = successMessages[Math.floor(Math.random() * successMessages.length)];
      return {
        invented_tool: args.name,
        called_with: args.args || {},
        status: 'completed',
        result: message,
        processing_time_ms: Math.round(delay),
      };
    }

    case 'ask': {
      const { questions } = args;
      if (!Array.isArray(questions) || questions.length === 0) {
        return { error: 'Must provide at least one question' };
      }
      if (questions.length > 5) {
        return { error: 'Maximum 5 questions allowed' };
      }
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question || typeof q.question !== 'string') {
          return { error: `Question ${i + 1} is missing a question string` };
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return { error: `Question ${i + 1} must have at least 2 options` };
        }
        for (const opt of q.options) {
          if (!opt.label || typeof opt.label !== 'string') {
            return { error: `Question ${i + 1} has an option without a label` };
          }
        }
        if (q.recommended !== undefined && q.recommended !== null) {
          if (typeof q.recommended !== 'number' || q.recommended < 0 || q.recommended >= q.options.length) {
            return { error: `Question ${i + 1} has invalid recommended index` };
          }
        }
      }
      return { _type: 'ask', questions };
    }

    /* ---- Browser tools ---- */

    case 'browser_navigate': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.navigate(args.url, args.waitUntil);
    }

    case 'browser_click': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.click(args.selector);
    }

    case 'browser_fill': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.fill(args.selector, args.value);
    }

    case 'browser_select': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.select(args.selector, args.value);
    }

    case 'browser_get_content': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.getContent(args.includeAll);
    }

    case 'browser_screenshot': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      if (args.path && !inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      return await bm.screenshot(args.path || null);
    }

    case 'browser_evaluate': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.evaluate(args.code);
    }

    case 'browser_hover': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.hover(args.selector);
    }

    case 'browser_get_text': {
      const bm = require('./browser-manager');
      bm.setHeadless(settings?.browserHeadless !== false);
      return await bm.getText(args.selector || null);
    }

    case 'browser_close': {
      const bm = require('./browser-manager');
      await bm.closeBrowser();
      return { ok: true, closed: true };
    }

    /* ---- Database tools ---- */

    case 'db_list_tables': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const dm = require('./db-manager');
      return await dm.listTables(args.path);
    }

    case 'db_get_schema': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const dm = require('./db-manager');
      return await dm.getSchema(args.path, args.table);
    }

    case 'db_query': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const dm = require('./db-manager');
      return await dm.query(args.path, args.sql, args.params);
    }

    case 'db_execute': {
      if (!inRootPath(args.path, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const dm = require('./db-manager');
      return await dm.execute(args.path, args.sql, args.params);
    }

    case 'db_backup': {
      if (!inRootPath(args.path, rootPath, settings) || !inRootPath(args.output, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      const dm = require('./db-manager');
      return await dm.backup(args.path, args.output);
    }

    case 'list_apps': {
      const userStartMenu = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu');
      const commonStartMenu = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu';
      const dirs = [userStartMenu, commonStartMenu].filter(d => fs.existsSync(d));
      if (dirs.length === 0) return { error: 'Start Menu directories not found' };
      try {
        const script = `$shell = New-Object -ComObject WScript.Shell; $results = @(); @(${dirs.map(d => `'${d.replace(/'/g, "''")}'`).join(', ')}) | ForEach-Object { Get-ChildItem $_ -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { try { $sc = $shell.CreateShortcut($_.FullName); if ($sc.TargetPath -and $sc.TargetPath -ne '') { $results += [PSCustomObject]@{ name = $_.BaseName; target = $sc.TargetPath; arguments = $sc.Arguments } } } catch {} } }; ConvertTo-Json -InputObject $results`;
        const out = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 30000, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
        const apps = JSON.parse(out.trim() || '[]');
        return { apps: Array.isArray(apps) ? apps : [apps], count: Array.isArray(apps) ? apps.length : 1 };
      } catch (e) {
        return { error: 'Failed to scan Start Menu: ' + e.message };
      }
    }

    case 'open_app': {
      const appPath = args.path;
      if (!appPath || typeof appPath !== 'string') return { error: 'Path is required' };
      if (!inRootPath(appPath, rootPath, settings)) return { error: 'Access denied: path outside project root' };
      if (!fs.existsSync(appPath)) return { error: `File not found: ${appPath}` };
      try {
        const { spawn } = require('node:child_process');
        spawn(appPath, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return { ok: true, path: appPath };
      } catch (e) {
        return { error: 'Failed to open app: ' + e.message };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const TOOL_DISPLAY_NAMES = {
  read_file: 'Read a file',
  write_file: 'Wrote a file',
  edit_file: 'Edited a file',
  list_dir: 'Listed a directory',
  grep_search: 'Searched file contents',
  run_command: 'Ran a command',
  rename_file: 'Renamed a file',
  delete_file: 'Deleted a file',
  file_stats: 'Checked file stats',
  create_dir: 'Created a directory',
  read_env: 'Read environment variables',
  git_operations: 'Ran a git operation',
  glob_find: 'Found files by pattern',
  watch_file: 'Watched a file',
  web_search: 'Searched the web',
  web_fetch: 'Fetched a webpage',
  find_files: 'Found files',
  network_info: 'Checked network info',
  process_info: 'Checked running processes',
  clipboard: 'Accessed the clipboard',
  download_file: 'Downloaded a file',
  hash_file: 'Hashed a file',
  generate_password: 'Generated a password',
  math_eval: 'Evaluated a math expression',
  crypto_utils: 'Encrypted/decrypted a file',
  ask: 'Asked a question',
  browser_navigate: 'Navigated to a URL',
  browser_click: 'Clicked an element',
  browser_fill: 'Filled an input field',
  browser_select: 'Selected an option',
  browser_get_content: 'Got page content',
  browser_screenshot: 'Took a screenshot',
  browser_evaluate: 'Ran JavaScript in browser',
  browser_hover: 'Hovered over an element',
  browser_get_text: 'Got text from the page',
  browser_close: 'Closed the browser',
  db_list_tables: 'Listed database tables',
  db_get_schema: 'Got database schema',
  db_query: 'Queried the database',
  db_execute: 'Executed a database command',
  db_backup: 'Backed up the database',
  list_apps: 'Listed installed apps',
  open_app: 'Opened an application',
  see_documentation: 'Looked up documentation',
  invent_tool: 'Ran a custom tool',
};

function getToolDisplayName(name, args) {
  if (name === 'invent_tool' && args?.name) return args.name;
  return TOOL_DISPLAY_NAMES[name] || name;
}

module.exports = { TOOL_DEFINITIONS, executeTool, getToolDisplayName };
