#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const url = require('url');
const { spawn } = require('child_process');

const APP_DEST = process.env.TRIM_APPDEST || path.resolve(__dirname, '..');
const WWW_ROOT = path.join(APP_DEST, 'www');
const PORT = Number(process.env.TRIM_SERVICE_PORT || process.env.PORT || 8964);

const TARGET_DIR = '/usr/trim/www';
const INDEX_FILE = path.join(TARGET_DIR, 'index.html');
const BACKUP_DIR = '/usr/cqshbak';
const BACKUP_FILE = path.join(BACKUP_DIR, 'index.html.original');
const LOG_FILE = process.env.TRIM_PKGVAR ? path.join(process.env.TRIM_PKGVAR, 'info.log') : null;
const TEMP_DIR = process.env.TRIM_PKGVAR ? path.join(process.env.TRIM_PKGVAR, 'tmp') : os.tmpdir();
const SHELL_INJECT_SCRIPT = path.join(APP_DEST, 'server', 'inject_shell.sh');
const USE_SHELL_INJECT = process.env.FNOS_INJECT_USE_SH !== '0';
const FORCE_NSENTER = process.env.FNOS_INJECT_NSENTER === '1';
const DISABLE_NSENTER = process.env.FNOS_INJECT_NSENTER === '0';
const INJECT_RUNNER = process.env.FNOS_INJECT_RUNNER || 'auto'; // auto|direct|nsenter|at
const ENABLE_GUARD = process.env.FNOS_INJECT_GUARD === '1';
const STABILIZE_INTERVAL_MS = 2000;
const STABILIZE_MAX_MS = 30000;
const STABLE_REQUIRED = 3;
let lastPayload = { css: null, js: null };
let stabilizeTimer = null;
let stabilizeState = null;
let nsenterChecked = false;
let nsenterAvailable = false;
let mntSelf = null;
let mntInit = null;
let atAvailable = false;

function detectNamespace() {
  try {
    mntSelf = fs.readlinkSync('/proc/self/ns/mnt');
  } catch (_) {
    mntSelf = null;
  }
  try {
    mntInit = fs.readlinkSync('/proc/1/ns/mnt');
  } catch (_) {
    mntInit = null;
  }
}

function detectNsenter() {
  if (nsenterChecked) return;
  nsenterChecked = true;
  try {
    fs.accessSync('/usr/bin/nsenter', fs.constants.X_OK);
    nsenterAvailable = true;
    return;
  } catch (_) {
    // fallthrough
  }
  try {
    fs.accessSync('/bin/nsenter', fs.constants.X_OK);
    nsenterAvailable = true;
  } catch (_) {
    nsenterAvailable = false;
  }
}

function detectAt() {
  try {
    fs.accessSync('/usr/bin/at', fs.constants.X_OK);
    atAvailable = true;
    return;
  } catch (_) {
    // fallthrough
  }
  try {
    fs.accessSync('/bin/at', fs.constants.X_OK);
    atAvailable = true;
  } catch (_) {
    atAvailable = false;
  }
}

detectNamespace();
detectNsenter();
detectAt();
log(`Namespace mnt: self=${mntSelf || 'unknown'} init=${mntInit || 'unknown'} nsenter=${nsenterAvailable} at=${atAvailable}`);

function shellQuote(value) {
  if (!value) return "''";
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function selectRunner() {
  const runner = INJECT_RUNNER.toLowerCase();
  if (runner === 'direct' || runner === 'nsenter' || runner === 'at') return runner;
  if (runner === 'auto') {
    if (atAvailable) return 'at';
    if (nsenterAvailable && !DISABLE_NSENTER && (FORCE_NSENTER || (mntSelf && mntInit && mntSelf !== mntInit))) {
      return 'nsenter';
    }
    return 'direct';
  }
  return 'direct';
}

async function runAtCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('at', ['-M', 'now'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (stdout.trim()) log(`at stdout: ${stdout.trim()}`);
      if (stderr.trim()) log(`at stderr: ${stderr.trim()}`);
      if (code === 0) return resolve();
      return reject(new Error(`at failed with code ${code}`));
    });
    child.stdin.write(`${command}\n`);
    child.stdin.end();
  });
}

async function writeTempFile(ext, content) {
  await fsp.mkdir(TEMP_DIR, { recursive: true }).catch(() => {});
  const tempFile = path.join(TEMP_DIR, `.fnos-ui-mods-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  await fsp.writeFile(tempFile, content, 'utf8');
  log(`Temp file created: ${tempFile}`);
  return tempFile;
}

async function runShellInject(cssPath, jsPath, delaySec = 0) {
  return new Promise((resolve, reject) => {
    const runner = selectRunner();
    const delayArg = delaySec > 0 ? String(delaySec) : '0';
    const baseArgs = [SHELL_INJECT_SCRIPT, cssPath || '', jsPath || '', delayArg];

    if (runner === 'at') {
      const command = `bash ${shellQuote(SHELL_INJECT_SCRIPT)} ${shellQuote(cssPath || '')} ${shellQuote(jsPath || '')} ${shellQuote(delayArg)} >> ${shellQuote(LOG_FILE || '/tmp/fnos-ui-mods.log')} 2>&1`;
      log(`Shell inject (at): ${command}`);
      runAtCommand(command).then(resolve).catch(reject);
      return;
    }

    const useNsenter = runner === 'nsenter';
    const cmd = useNsenter ? 'nsenter' : 'bash';
    const args = useNsenter ? ['-t', '1', '-m', '--', 'bash', ...baseArgs] : baseArgs;

    log(`Shell inject (${useNsenter ? 'nsenter' : 'direct'}): ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (stdout.trim()) log(`Shell inject stdout: ${stdout.trim()}`);
      if (stderr.trim()) log(`Shell inject stderr: ${stderr.trim()}`);
      if (code === 0) return resolve();
      const stderrLastLine = stderr
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-1)[0];
      const errMsg = stderrLastLine
        ? `Shell inject failed with code ${code}: ${stderrLastLine}`
        : `Shell inject failed with code ${code}`;
      return reject(new Error(errMsg));
    });
  });
}

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  if (LOG_FILE) {
    try {
      fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch (err) {
      // fallback to stderr
      process.stderr.write(line);
    }
  } else {
    process.stderr.write(line);
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function ensureBackup() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  try {
    await fsp.access(BACKUP_FILE, fs.constants.F_OK);
    return { created: false };
  } catch (_) {
    try {
      await fsp.access(INDEX_FILE, fs.constants.F_OK);
    } catch (err) {
      throw new Error(`未找到系统文件: ${INDEX_FILE}`);
    }
    await fsp.copyFile(INDEX_FILE, BACKUP_FILE);
    return { created: true };
  }
}

async function restoreOriginal() {
  try {
    await fsp.access(BACKUP_FILE, fs.constants.F_OK);
  } catch (err) {
    throw new Error('未找到备份文件');
  }
  await fsp.copyFile(BACKUP_FILE, INDEX_FILE);
  await fsp.chmod(INDEX_FILE, 0o644);
}

async function readTextFromPath(filePath) {
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`路径不是文件: ${filePath}`);
  }
  return fsp.readFile(filePath, 'utf8');
}

function insertBeforeTag(html, tagRegex, blockLines, label) {
  const match = html.match(tagRegex);
  if (!match || typeof match.index !== 'number') {
    throw new Error(`未找到插入位置: ${label}`);
  }
  const insert = `${blockLines.join('\n')}\n`;
  return html.slice(0, match.index) + insert + html.slice(match.index);
}

function buildInjectedHtml(html, finalCss, finalJs) {
  let next = html;
  if (finalCss) {
    next = insertBeforeTag(next, /<\/\s*head\s*>/i, [
      '<style>',
      '/* Injected CSS */',
      finalCss,
      '</style>',
    ], '</head>');
  }
  if (finalJs) {
    next = insertBeforeTag(next, /<\/\s*body\s*>/i, [
      '<script>',
      '// Injected JS',
      finalJs,
      '</script>',
    ], '</body>');
  }
  return next;
}

async function writeIndexHtml(html) {
  const tempFile = path.join(TARGET_DIR, `.fnos-ui-mods-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  let originalStat = null;
  try {
    originalStat = await fsp.stat(INDEX_FILE);
  } catch (_) {
    originalStat = null;
  }

  await fsp.writeFile(tempFile, html, 'utf8');
  if (originalStat) {
    await fsp.chown(tempFile, originalStat.uid, originalStat.gid).catch(() => {});
  }
  await fsp.rename(tempFile, INDEX_FILE);
  if (originalStat) {
    await fsp.chmod(INDEX_FILE, originalStat.mode).catch(() => {});
  } else {
    await fsp.chmod(INDEX_FILE, 0o644).catch(() => {});
  }

  let readbackCss = false;
  let readbackJs = false;
  try {
    const verify = await fsp.readFile(INDEX_FILE, 'utf8');
    readbackCss = verify.includes('/* Injected CSS */');
    readbackJs = verify.includes('// Injected JS');
  } catch (err) {
    log(`Inject readback failed: ${err.message}`);
  }

  return {
    readbackCss,
    readbackJs,
    size: Buffer.byteLength(html),
  };
}

async function performInjection(finalCss, finalJs, { restoreFromBackup, logPrefix }) {
  if (restoreFromBackup) {
    await ensureBackup();
    await fsp.copyFile(BACKUP_FILE, INDEX_FILE);
  }

  let html = await fsp.readFile(INDEX_FILE, 'utf8');
  const hasHead = /<\/\s*head\s*>/i.test(html);
  const hasBody = /<\/\s*body\s*>/i.test(html);
  log(`${logPrefix} target markers: </head> ${hasHead ? 'found' : 'missing'}, </body> ${hasBody ? 'found' : 'missing'}`);

  html = buildInjectedHtml(html, finalCss, finalJs);

  const cssInserted = html.includes('/* Injected CSS */');
  const jsInserted = html.includes('// Injected JS');
  const { readbackCss, readbackJs, size } = await writeIndexHtml(html);

  log(`${logPrefix} result: css=${cssInserted}, js=${jsInserted}, readback css=${readbackCss}, readback js=${readbackJs}, size=${size} bytes`);
  return { cssInserted, jsInserted, readbackCss, readbackJs };
}

function clearStabilizeGuard() {
  if (!stabilizeTimer) return;
  clearInterval(stabilizeTimer);
  stabilizeTimer = null;
  stabilizeState = null;
}

function startStabilizeGuard() {
  clearStabilizeGuard();
  if (!lastPayload.css && !lastPayload.js) return;

  stabilizeState = {
    startAt: Date.now(),
    stableCount: 0,
    tick: 0,
  };

  log('Stabilize guard started');
  stabilizeTimer = setInterval(async () => {
    if (!stabilizeState) return;

    stabilizeState.tick += 1;
    const elapsed = Date.now() - stabilizeState.startAt;
    if (elapsed > STABILIZE_MAX_MS) {
      log('Stabilize guard finished (timeout)');
      clearStabilizeGuard();
      return;
    }

    try {
      const verify = await fsp.readFile(INDEX_FILE, 'utf8');
      const cssPresent = verify.includes('/* Injected CSS */');
      const jsPresent = verify.includes('// Injected JS');
      const needsCss = lastPayload.css && !cssPresent;
      const needsJs = lastPayload.js && !jsPresent;

      if (needsCss || needsJs) {
        stabilizeState.stableCount = 0;
        log(`Stabilize tick ${stabilizeState.tick}: missing markers (css=${cssPresent}, js=${jsPresent}), reapplying...`);
        const cssToApply = needsCss ? lastPayload.css : null;
        const jsToApply = needsJs ? lastPayload.js : null;
        await performInjection(cssToApply, jsToApply, {
          restoreFromBackup: false,
          logPrefix: `Stabilize reapply ${stabilizeState.tick}`,
        });
        return;
      }

      stabilizeState.stableCount += 1;
      log(`Stabilize tick ${stabilizeState.tick}: markers present (css=${cssPresent}, js=${jsPresent}), stable=${stabilizeState.stableCount}`);
      if (stabilizeState.stableCount >= STABLE_REQUIRED) {
        log('Stabilize guard finished (stable)');
        clearStabilizeGuard();
      }
    } catch (err) {
      log(`Stabilize tick ${stabilizeState.tick} failed: ${err.message}`);
    }
  }, STABILIZE_INTERVAL_MS);
}

async function injectCode({ cssText, jsText, cssPath, jsPath, injectDelaySec }) {
  const delaySec = Number.isFinite(Number(injectDelaySec)) ? Number(injectDelaySec) : 0;
  log(
    `Inject request: cssText=${cssText ? cssText.length : 0} chars, jsText=${jsText ? jsText.length : 0} chars, cssPath=${cssPath || '-'}, jsPath=${jsPath || '-'}, delay=${delaySec}s`,
  );

  let finalCss = null;
  let finalJs = null;

  if (cssPath) {
    finalCss = await readTextFromPath(cssPath);
  } else if (cssText) {
    finalCss = cssText;
  }

  if (jsPath) {
    finalJs = await readTextFromPath(jsPath);
  } else if (jsText) {
    finalJs = jsText;
  }

  if (!finalCss && !finalJs) {
    log('Inject aborted: no css/js provided');
    return { injected: false, message: '未提供任何 CSS/JS 内容' };
  }

  lastPayload = { css: finalCss, js: finalJs };

  if (USE_SHELL_INJECT) {
    let cssTemp = '';
    let jsTemp = '';
    try {
      const cssInputPath = cssPath || (finalCss ? await writeTempFile('.css', finalCss) : '');
      const jsInputPath = jsPath || (finalJs ? await writeTempFile('.js', finalJs) : '');
      cssTemp = cssPath ? '' : cssInputPath;
      jsTemp = jsPath ? '' : jsInputPath;
      await runShellInject(cssInputPath, jsInputPath, delaySec);
    } finally {
      if (cssTemp) {
        await fsp.unlink(cssTemp).catch(() => {});
      }
      if (jsTemp) {
        await fsp.unlink(jsTemp).catch(() => {});
      }
    }
  } else {
    if (delaySec > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
    }
    await performInjection(finalCss, finalJs, {
      restoreFromBackup: true,
      logPrefix: 'Inject',
    });
  }

  if (ENABLE_GUARD) {
    startStabilizeGuard();
  }
  return { injected: true, message: '注入成功，请强制刷新浏览器 (Ctrl+F5) 查看效果。' };
}

async function getStatus() {
  const result = {
    indexPath: INDEX_FILE,
    backupPath: BACKUP_FILE,
    indexExists: false,
    backupExists: false,
    indexMtime: null,
    backupMtime: null,
  };

  try {
    const stat = await fsp.stat(INDEX_FILE);
    result.indexExists = true;
    result.indexMtime = stat.mtime.toISOString();
  } catch (_) {}

  try {
    const stat = await fsp.stat(BACKUP_FILE);
    result.backupExists = true;
    result.backupMtime = stat.mtime.toISOString();
  } catch (_) {}

  return result;
}

async function readJsonBody(req, limitBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function safeJoin(root, requestPath) {
  const cleanPath = decodeURIComponent(requestPath.split('?')[0]);
  const safePath = cleanPath.replace(/\0/g, '');
  const resolvedPath = path.normalize(path.join(root, safePath));
  if (!resolvedPath.startsWith(root)) {
    return null;
  }
  return resolvedPath;
}

async function handleStatic(req, res, pathname) {
  let filePath = safeJoin(WWW_ROOT, pathname);
  if (!filePath) {
    return sendText(res, 400, 'Bad Request');
  }

  if (pathname === '/' || pathname === '') {
    filePath = path.join(WWW_ROOT, 'index.html');
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (err) {
    return sendText(res, 404, 'Not Found');
  }

  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeFor(filePath),
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (err) {
    return sendText(res, 500, 'Internal Server Error');
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  const pathname = parsedUrl.pathname || '/';

  if (pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET' && pathname === '/api/status') {
        const status = await getStatus();
        return sendJson(res, 200, { ok: true, data: status });
      }

      if (req.method === 'POST' && pathname === '/api/restore') {
        await restoreOriginal();
        return sendJson(res, 200, { ok: true, message: '已还原至官方默认状态' });
      }

      if (req.method === 'POST' && pathname === '/api/inject') {
        const body = await readJsonBody(req);
        const cssText = typeof body.cssText === 'string' ? body.cssText.trim() : '';
        const jsText = typeof body.jsText === 'string' ? body.jsText.trim() : '';
        const cssPath = typeof body.cssPath === 'string' ? body.cssPath.trim() : '';
        const jsPath = typeof body.jsPath === 'string' ? body.jsPath.trim() : '';
        const injectDelaySec = body && typeof body.injectDelaySec !== 'undefined' ? body.injectDelaySec : 0;

        const result = await injectCode({
          cssText: cssText || null,
          jsText: jsText || null,
          cssPath: cssPath || null,
          jsPath: jsPath || null,
          injectDelaySec,
        });

        if (!result.injected) {
          return sendJson(res, 400, { ok: false, message: result.message });
        }

        return sendJson(res, 200, { ok: true, message: result.message });
      }

      return sendJson(res, 404, { ok: false, message: 'Not Found' });
    } catch (err) {
      log(`API error: ${err.message}`);
      return sendJson(res, 500, { ok: false, message: err.message });
    }
  }

  if (req.method !== 'GET') {
    return sendText(res, 405, 'Method Not Allowed');
  }

  return handleStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  log(`FnOS UI Mods server listening on ${PORT}`);
});
