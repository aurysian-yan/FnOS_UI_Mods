#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const url = require('url');
const { spawn, execFileSync } = require('child_process');

const APP_DEST = process.env.TRIM_APPDEST || path.resolve(__dirname, '..');
const WWW_ROOT = path.join(APP_DEST, 'www');
const PORT = Number(process.env.TRIM_SERVICE_PORT || process.env.PORT || 8964);

const TARGET_DIR = '/usr/trim/www';
const INDEX_FILE = path.join(TARGET_DIR, 'index.html');
const BACKUP_DIR = '/usr/cqshbak';
const BACKUP_FILE = path.join(BACKUP_DIR, 'index.html.original');
const PRESET_STORE_DIR = process.env.TRIM_PKGVAR
  ? path.join(process.env.TRIM_PKGVAR, 'preset-assets')
  : path.join(APP_DEST, 'server', 'preset-assets');
const PRESET_CSS_TARGET = path.join(PRESET_STORE_DIR, 'mod.css');
const PRESET_JS_TARGET = path.join(PRESET_STORE_DIR, 'mod.js');
const LAUNCHPAD_REPORT_FILE = process.env.TRIM_PKGVAR
  ? path.join(process.env.TRIM_PKGVAR, 'launchpad-apps.json')
  : path.join(APP_DEST, 'server', 'launchpad-apps.json');

const PRESET_TEMPLATE_DIR = path.join(WWW_ROOT, 'assets', 'templates');
const PRESET_FILES = {
  js: path.join(PRESET_TEMPLATE_DIR, 'mod.js'),
  basicCss: path.join(PRESET_TEMPLATE_DIR, 'basic_mod.css'),
  windowsTitlebarCss: path.join(PRESET_TEMPLATE_DIR, 'windows_titlebar_mod.css'),
  macTitlebarCss: path.join(PRESET_TEMPLATE_DIR, 'mac_titlebar_mod.css'),
  classicLaunchpadCss: path.join(PRESET_TEMPLATE_DIR, 'classic_launchpad_mod.css'),
  spotlightLaunchpadCss: path.join(PRESET_TEMPLATE_DIR, 'spotlight_launchpad_mod.css'),
};

const INLINE_CSS_MARKER = '/* Injected CSS */';
const INLINE_JS_MARKER = '// Injected JS';
const TAG_CSS_MARKER = '<!-- Injected CSS -->';
const TAG_JS_MARKER = '<!-- Injected JS -->';

const DEFAULT_BRAND = '#0066ff';
const BRAND_LIGHTNESS_MIN = 0.3;
const BRAND_LIGHTNESS_MAX = 0.7;
const DEFAULT_PRESET_CONFIG = {
  titlebarStyle: 'windows',
  launchpadStyle: 'classic',
  launchpadIconScaleEnabled: false,
  launchpadIconScaleSelectedKeys: [],
  brandColor: DEFAULT_BRAND,
  fontOverrideEnabled: false,
  fontFamily: '',
  fontUrl: '',
  fontWeight: '',
  fontFeatureSettings: '',
  customCodeEnabled: false,
  customCss: '',
  customJs: '',
};

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

let lastPayload = { css: null, js: null, cssMode: 'inline', jsMode: 'inline' };
let stabilizeTimer = null;
let stabilizeState = null;
let nsenterChecked = false;
let nsenterAvailable = false;
let mntSelf = null;
let mntInit = null;
let atAvailable = false;
let launchpadAppsReport = {
  items: [],
  updatedAt: '',
  source: '',
};
let cliInstalledAppsCache = {
  fetchedAt: 0,
  items: [],
};

function loadLaunchpadAppsReport() {
  try {
    const raw = fs.readFileSync(LAUNCHPAD_REPORT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    launchpadAppsReport = {
      items: normalizeLaunchpadAppItems(parsed.items),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      source: typeof parsed.source === 'string' ? parsed.source : '',
    };
  } catch (_) {
    // ignore
  }
}

loadLaunchpadAppsReport();

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
log(`Preset asset target(store): css=${PRESET_CSS_TARGET} js=${PRESET_JS_TARGET}`);

function shellQuote(value) {
  if (!value) return "''";
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function normalizeInjectMode(mode) {
  return mode === 'tag' ? 'tag' : 'inline';
}

function normalizeAssetBaseUrl(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch (_) {
    return '';
  }
}

function buildPresetCssLinkBlock(assetBaseUrl) {
  const base = normalizeAssetBaseUrl(assetBaseUrl);
  const href = base ? `${base}/preset/mod.css` : '/preset/mod.css';
  return `${TAG_CSS_MARKER}<link rel="stylesheet" href="${href}">`;
}

function buildPresetJsLinkBlock(assetBaseUrl) {
  const base = normalizeAssetBaseUrl(assetBaseUrl);
  const src = base ? `${base}/preset/mod.js` : '/preset/mod.js';
  return `${TAG_JS_MARKER}<script src="${src}"></script>`;
}

function cssMarkerForMode(mode) {
  return normalizeInjectMode(mode) === 'tag' ? TAG_CSS_MARKER : INLINE_CSS_MARKER;
}

function jsMarkerForMode(mode) {
  return normalizeInjectMode(mode) === 'tag' ? TAG_JS_MARKER : INLINE_JS_MARKER;
}

function hasCssMarker(html, mode) {
  return html.includes(cssMarkerForMode(mode));
}

function hasJsMarker(html, mode) {
  return html.includes(jsMarkerForMode(mode));
}

function selectRunner() {
  const runner = INJECT_RUNNER.toLowerCase();
  if (runner === 'direct' || runner === 'nsenter' || runner === 'at') return runner;
  if (runner === 'auto') {
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

async function runShellInject(
  cssPath,
  jsPath,
  delaySec = 0,
  cssMode = 'inline',
  jsMode = 'inline',
  assetCssPath = '',
  assetJsPath = '',
) {
  return new Promise((resolve, reject) => {
    const runner = selectRunner();
    const delayArg = delaySec > 0 ? String(delaySec) : '0';
    const normalizedCssMode = normalizeInjectMode(cssMode);
    const normalizedJsMode = normalizeInjectMode(jsMode);
    const baseArgs = [
      SHELL_INJECT_SCRIPT,
      cssPath || '',
      jsPath || '',
      delayArg,
      normalizedCssMode,
      normalizedJsMode,
      assetCssPath || '',
      assetJsPath || '',
    ];

    if (runner === 'at') {
      const command =
        `bash ${shellQuote(SHELL_INJECT_SCRIPT)} ` +
        `${shellQuote(cssPath || '')} ${shellQuote(jsPath || '')} ${shellQuote(delayArg)} ` +
        `${shellQuote(normalizedCssMode)} ${shellQuote(normalizedJsMode)} ` +
        `${shellQuote(assetCssPath || '')} ${shellQuote(assetJsPath || '')} ` +
        `>> ${shellQuote(LOG_FILE || '/tmp/fnos-ui-mods.log')} 2>&1`;
      log(`Shell inject (at): ${command}`);
      runAtCommand(command).then(() => resolve('at')).catch(reject);
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
      if (code === 0) return resolve(useNsenter ? 'nsenter' : 'direct');
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

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
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

function buildCssBlockLines(finalCss, cssMode) {
  if (!finalCss) return [];
  if (normalizeInjectMode(cssMode) === 'tag') {
    return [finalCss];
  }
  return ['<style>', INLINE_CSS_MARKER, finalCss, '</style>'];
}

function buildJsBlockLines(finalJs, jsMode) {
  if (!finalJs) return [];
  if (normalizeInjectMode(jsMode) === 'tag') {
    return [finalJs];
  }
  return ['<script>', INLINE_JS_MARKER, finalJs, '</script>'];
}

function buildInjectedHtml(html, finalCss, finalJs, { cssMode = 'inline', jsMode = 'inline' } = {}) {
  let next = html;
  if (finalCss) {
    next = insertBeforeTag(next, /<\/\s*head\s*>/i, buildCssBlockLines(finalCss, cssMode), '</head>');
  }
  if (finalJs) {
    next = insertBeforeTag(next, /<\/\s*body\s*>/i, buildJsBlockLines(finalJs, jsMode), '</body>');
  }
  return next;
}

async function writeIndexHtml(html, { cssMode = 'inline', jsMode = 'inline' } = {}) {
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
    readbackCss = hasCssMarker(verify, cssMode);
    readbackJs = hasJsMarker(verify, jsMode);
  } catch (err) {
    log(`Inject readback failed: ${err.message}`);
  }

  return {
    readbackCss,
    readbackJs,
    size: Buffer.byteLength(html),
  };
}

async function performInjection(finalCss, finalJs, {
  restoreFromBackup,
  logPrefix,
  cssMode = 'inline',
  jsMode = 'inline',
} = {}) {
  if (restoreFromBackup) {
    await ensureBackup();
    await fsp.copyFile(BACKUP_FILE, INDEX_FILE);
  }

  let html = await fsp.readFile(INDEX_FILE, 'utf8');
  const hasHead = /<\/\s*head\s*>/i.test(html);
  const hasBody = /<\/\s*body\s*>/i.test(html);
  log(`${logPrefix} target markers: </head> ${hasHead ? 'found' : 'missing'}, </body> ${hasBody ? 'found' : 'missing'}`);

  html = buildInjectedHtml(html, finalCss, finalJs, { cssMode, jsMode });

  const cssInserted = finalCss ? hasCssMarker(html, cssMode) : true;
  const jsInserted = finalJs ? hasJsMarker(html, jsMode) : true;
  const { readbackCss, readbackJs, size } = await writeIndexHtml(html, { cssMode, jsMode });

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
      const cssPresent = lastPayload.css ? hasCssMarker(verify, lastPayload.cssMode) : true;
      const jsPresent = lastPayload.js ? hasJsMarker(verify, lastPayload.jsMode) : true;
      const needsCss = Boolean(lastPayload.css) && !cssPresent;
      const needsJs = Boolean(lastPayload.js) && !jsPresent;

      if (needsCss || needsJs) {
        stabilizeState.stableCount = 0;
        log(`Stabilize tick ${stabilizeState.tick}: missing markers (css=${cssPresent}, js=${jsPresent}), reapplying...`);
        const cssToApply = needsCss ? lastPayload.css : null;
        const jsToApply = needsJs ? lastPayload.js : null;
        await performInjection(cssToApply, jsToApply, {
          restoreFromBackup: false,
          logPrefix: `Stabilize reapply ${stabilizeState.tick}`,
          cssMode: lastPayload.cssMode,
          jsMode: lastPayload.jsMode,
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

function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return null;
  if (hex.length === 4) {
    return `#${hex
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')}`;
  }
  return hex;
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;

  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }

  h /= 6;
  return { h, s, l };
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = clampChannel(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clampChannel(hue2rgb(p, q, h + 1 / 3) * 255),
    g: clampChannel(hue2rgb(p, q, h) * 255),
    b: clampChannel(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function rgbToHex({ r, g, b }) {
  return (
    '#' +
    [r, g, b]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase()
  );
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const intValue = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function clampBrandLightness(hex) {
  const rgb = hexToRgb(hex) || hexToRgb(DEFAULT_BRAND);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const clampedL = Math.min(BRAND_LIGHTNESS_MAX, Math.max(BRAND_LIGHTNESS_MIN, hsl.l));
  return rgbToHex(hslToRgb(hsl.h, hsl.s, clampedL));
}

function formatRgb(rgb) {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function mixWithBlack(rgb, factor) {
  return {
    r: clampChannel(rgb.r * factor),
    g: clampChannel(rgb.g * factor),
    b: clampChannel(rgb.b * factor),
  };
}

function mixWithWhite(rgb, mix) {
  const keep = 1 - mix;
  return {
    r: clampChannel(rgb.r * keep + 255 * mix),
    g: clampChannel(rgb.g * keep + 255 * mix),
    b: clampChannel(rgb.b * keep + 255 * mix),
  };
}

function generateBrandPalette(brandHex) {
  const base = hexToRgb(brandHex) || hexToRgb(DEFAULT_BRAND);
  const darkFactors = [0.4, 0.55, 0.7, 0.85, 1];
  const lightMix = [0.2, 0.4, 0.6, 0.8, 0.92];

  const palette = [];
  darkFactors.forEach((factor) => palette.push(formatRgb(mixWithBlack(base, factor))));
  lightMix.forEach((mix) => palette.push(formatRgb(mixWithWhite(base, mix))));
  return palette;
}

function buildThemeCss(brandHex) {
  const clamped = clampBrandLightness(brandHex);
  const palette = generateBrandPalette(clamped);
  const selectors = [
    ':root',
    'body',
    '#root',
    '.semi-theme-default',
    '.semi-theme-dark',
    '.semi-theme',
    '[data-theme]',
    '*',
  ].join(', ');

  const lines = palette
    .map((value, index) => `  --semi-brand-${index}: ${value} !important;`)
    .join('\n');

  return `${selectors} {\n${lines}\n}`;
}

function normalizeTextContent(content) {
  return String(content || '').replace(/\r\n/g, '\n').trimEnd() + '\n';
}

function normalizePresetString(value, maxLength = 120000) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

function normalizePresetUrl(value) {
  const raw = normalizePresetString(value, 1000).trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function normalizeFontWeight(value) {
  const raw = normalizePresetString(value, 16).trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (/^(normal|bold|bolder|lighter)$/.test(lowered)) {
    return lowered;
  }
  if (/^\d{1,4}$/.test(raw)) {
    const numeric = Math.max(1, Math.min(1000, Number(raw)));
    return String(numeric);
  }
  return '';
}

function normalizeLaunchpadKeyList(value, maxLength = 320) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const key = item.trim().slice(0, maxLength);
    if (!key) return;
    unique.add(key);
  });
  return Array.from(unique);
}

function normalizeLaunchpadPreviewSource(rawSource) {
  if (typeof rawSource !== 'string') return '';
  const source = rawSource.trim();
  if (!source) return '';
  try {
    const parsed = new URL(source);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function normalizeLaunchpadAppItems(items) {
  if (!Array.isArray(items)) return [];
  const keyMap = new Map();

  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = normalizePresetString(item.key, 320).trim();
    if (!key) return;

    const titleRaw = normalizePresetString(item.title, 200).trim();
    const title = titleRaw || key.split('/').pop() || key;
    const iconSrc = normalizeLaunchpadPreviewSource(item.iconSrc);
    keyMap.set(key, { key, title, iconSrc });
  });

  return Array.from(keyMap.values()).slice(0, 800);
}

async function persistLaunchpadAppsReport() {
  const payload = {
    items: launchpadAppsReport.items,
    updatedAt: launchpadAppsReport.updatedAt,
    source: launchpadAppsReport.source,
  };
  const body = JSON.stringify(payload, null, 2);
  try {
    await fsp.mkdir(path.dirname(LAUNCHPAD_REPORT_FILE), { recursive: true });
    await fsp.writeFile(LAUNCHPAD_REPORT_FILE, body, 'utf8');
  } catch (err) {
    log(`Persist launchpad report failed: ${err.message}`);
  }
}

function parseAppcenterCliListOutput(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const appNames = new Set();
  lines.forEach((line) => {
    if (/^(appname|应用|name|\||-+|\+)/i.test(line)) return;
    const matched = line.match(/[A-Za-z0-9._-]+/);
    if (!matched || !matched[0]) return;
    const appname = matched[0];
    if (appname.length < 2) return;
    appNames.add(appname);
  });

  return Array.from(appNames).slice(0, 500).map((appname) => ({
    key: `/static/app/icons/${appname}/icon.png`,
    title: appname,
    iconSrc: '',
  }));
}

function getInstalledAppsFromCli() {
  const now = Date.now();
  if (now - cliInstalledAppsCache.fetchedAt < 30000 && Array.isArray(cliInstalledAppsCache.items)) {
    return cliInstalledAppsCache.items;
  }

  try {
    const output = execFileSync('appcenter-cli', ['list'], {
      encoding: 'utf8',
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const items = parseAppcenterCliListOutput(output);
    cliInstalledAppsCache = {
      fetchedAt: now,
      items,
    };
    return items;
  } catch (err) {
    log(`appcenter-cli list unavailable: ${err.message}`);
    cliInstalledAppsCache = {
      fetchedAt: now,
      items: [],
    };
    return [];
  }
}

function normalizePresetConfig(raw) {
  const merged = { ...DEFAULT_PRESET_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) };

  return {
    titlebarStyle: merged.titlebarStyle === 'mac' ? 'mac' : 'windows',
    launchpadStyle: merged.launchpadStyle === 'spotlight' ? 'spotlight' : 'classic',
    launchpadIconScaleEnabled: Boolean(merged.launchpadIconScaleEnabled),
    launchpadIconScaleSelectedKeys: normalizeLaunchpadKeyList(merged.launchpadIconScaleSelectedKeys),
    brandColor: clampBrandLightness(merged.brandColor),
    fontOverrideEnabled: Boolean(merged.fontOverrideEnabled),
    fontFamily: normalizePresetString(merged.fontFamily, 400).trim(),
    fontUrl: normalizePresetUrl(merged.fontUrl),
    fontWeight: normalizeFontWeight(merged.fontWeight),
    fontFeatureSettings: normalizePresetString(merged.fontFeatureSettings, 200).trim(),
    customCodeEnabled: Boolean(merged.customCodeEnabled),
    customCss: normalizePresetString(merged.customCss, 240000),
    customJs: normalizePresetString(merged.customJs, 240000),
  };
}

function buildFontCss(presetConfig) {
  if (!presetConfig.fontOverrideEnabled) return '';

  const declarations = [];
  const family = presetConfig.fontFamily;
  const urlValue = presetConfig.fontUrl;

  if (urlValue) {
    declarations.push(
      '@font-face {',
      '  font-family: "FnOSCustomFont";',
      `  src: url("${urlValue.replace(/"/g, '\\"')}");`,
      '  font-display: swap;',
      '}',
      ''
    );
  }

  const familyParts = [];
  if (urlValue) {
    familyParts.push('"FnOSCustomFont"');
  }
  if (family) {
    familyParts.push(family);
  }

  if (!familyParts.length) return declarations.join('\n');

  declarations.push(':root, body, #root, #root *, .semi-theme, .semi-theme * {');
  declarations.push(`  font-family: ${familyParts.join(', ')} !important;`);
  if (presetConfig.fontWeight) {
    declarations.push(`  font-weight: ${presetConfig.fontWeight} !important;`);
  }
  if (presetConfig.fontFeatureSettings) {
    declarations.push(`  font-feature-settings: ${presetConfig.fontFeatureSettings} !important;`);
  }
  declarations.push('}');

  return declarations.join('\n');
}

function buildBanner() {
  const timestamp = new Date().toISOString();
  return [
    '/* ============================================= */',
    '/* Auto-generated by FnOS_UI_Mods fpk preset     */',
    `/* Build time: ${timestamp} */`,
    '/* ============================================= */',
    '',
  ].join('\n');
}

async function ensurePresetTemplates() {
  const requiredFiles = Object.values(PRESET_FILES);
  await Promise.all(
    requiredFiles.map(async (filePath) => {
      try {
        await fsp.access(filePath, fs.constants.R_OK);
      } catch (_) {
        throw new Error(`缺少预设模板文件: ${filePath}`);
      }
    })
  );
}

async function readPresetTemplates() {
  await ensurePresetTemplates();
  const [
    js,
    basicCss,
    windowsTitlebarCss,
    macTitlebarCss,
    classicLaunchpadCss,
    spotlightLaunchpadCss,
  ] = await Promise.all([
    fsp.readFile(PRESET_FILES.js, 'utf8'),
    fsp.readFile(PRESET_FILES.basicCss, 'utf8'),
    fsp.readFile(PRESET_FILES.windowsTitlebarCss, 'utf8'),
    fsp.readFile(PRESET_FILES.macTitlebarCss, 'utf8'),
    fsp.readFile(PRESET_FILES.classicLaunchpadCss, 'utf8'),
    fsp.readFile(PRESET_FILES.spotlightLaunchpadCss, 'utf8'),
  ]);

  return {
    js,
    basicCss,
    windowsTitlebarCss,
    macTitlebarCss,
    classicLaunchpadCss,
    spotlightLaunchpadCss,
  };
}

function buildPresetCss(presetConfig, templates) {
  const titlebarCss = presetConfig.titlebarStyle === 'mac' ? templates.macTitlebarCss : templates.windowsTitlebarCss;
  const launchpadCss = presetConfig.launchpadStyle === 'spotlight'
    ? templates.spotlightLaunchpadCss
    : templates.classicLaunchpadCss;

  const parts = [
    `/* ----- basic_mod.css ----- */\n${normalizeTextContent(templates.basicCss)}`,
    `/* ----- ${presetConfig.titlebarStyle === 'mac' ? 'mac_titlebar_mod.css' : 'windows_titlebar_mod.css'} ----- */\n${normalizeTextContent(titlebarCss)}`,
    `/* ----- ${presetConfig.launchpadStyle === 'spotlight' ? 'spotlight_launchpad_mod.css' : 'classic_launchpad_mod.css'} ----- */\n${normalizeTextContent(launchpadCss)}`,
    `/* ----- generated.theme.css ----- */\n${normalizeTextContent(buildThemeCss(presetConfig.brandColor))}`,
  ];

  const fontCss = buildFontCss(presetConfig);
  if (fontCss) {
    parts.push(`/* ----- generated.font.css ----- */\n${normalizeTextContent(fontCss)}`);
  }

  if (presetConfig.customCodeEnabled && presetConfig.customCss.trim()) {
    parts.push(`/* ----- generated.custom.css ----- */\n${normalizeTextContent(presetConfig.customCss)}`);
  }

  return buildBanner() + parts.join('\n');
}

function buildLaunchpadBridgeJs(presetConfig) {
  const enabled = presetConfig.launchpadIconScaleEnabled ? 'true' : 'false';
  const selectedKeys = JSON.stringify(
    normalizeLaunchpadKeyList(presetConfig.launchpadIconScaleSelectedKeys),
  );

  return [
    '(function () {',
    '  if (window.__fnosFpkLaunchpadBridgeInitialized) return;',
    '  window.__fnosFpkLaunchpadBridgeInitialized = true;',
    `  const config = { enabled: ${enabled}, selectedKeys: ${selectedKeys} };`,
    '  const selectedSet = new Set(Array.isArray(config.selectedKeys) ? config.selectedKeys : []);',
    "  const STYLE_ID = 'fnos-ui-mods-launchpad-icon-scale-style';",
    "  const BASE_CLASS = 'fnos-launchpad-icon-box--processed';",
    "  const BOX_CLASS = 'fnos-launchpad-icon-box--scaled';",
    "  const MASK_ONLY_CLASS = 'fnos-launchpad-icon-box--mask-only';",
    "  const BLUR_CLONE_CLASS = 'fnos-launchpad-icon-blur-clone';",
    "  const BLUR_CLONE_IMG_CLASS = 'fnos-launchpad-icon-blur-clone-img';",
    '  const DESKTOP_CARD_TOKENS = ["flex", "h-[124px]", "w-[130px]", "cursor-pointer", "flex-col", "items-center", "justify-center", "gap-4"];',
    '  const PANEL_CARD_TOKENS = ["flex", "flex-col", "justify-center", "items-center", "w-[172px]", "h-[156px]", "cursor-pointer"];',
    '  const ICON_BOX_TOKENS = ["box-border", "size-[80px]", "p-[15%]"];',
    "  const ICON_PREFIXES = ['/static/app/icons/', '/app-center-static/serviceicon/'];",
    '  let reportTimer = 0;',
    "  let lastReportFingerprint = '';",
    '',
    '  function hasAllClasses(el, classTokens) {',
    '    if (!(el instanceof HTMLElement)) return false;',
    '    return classTokens.every((token) => el.classList.contains(token));',
    '  }',
    '',
    '  function normalizeIconKey(rawValue) {',
    "    if (typeof rawValue !== 'string') return '';",
    '    const raw = rawValue.trim();',
    "    if (!raw) return '';",
    '    try {',
    '      const parsed = new URL(raw, window.location.origin);',
    '      return parsed.pathname.toLowerCase();',
    '    } catch (_) {',
    "      return raw.split('?')[0].toLowerCase();",
    '    }',
    '  }',
    '',
    '  function isLaunchpadIconKey(key) {',
    "    if (!key) return false;",
    '    return ICON_PREFIXES.some((prefix) => key.includes(prefix));',
    '  }',
    '',
    '  function getIconImageEl(cardEl) {',
    '    if (!(cardEl instanceof HTMLElement)) return null;',
    "    const imageEl = cardEl.querySelector('.semi-image img, img');",
    '    return imageEl instanceof HTMLImageElement ? imageEl : null;',
    '  }',
    '',
    '  function extractCardKey(cardEl) {',
    '    const imageEl = getIconImageEl(cardEl);',
    '    if (!(imageEl instanceof HTMLImageElement)) return "";',
    "    const key = normalizeIconKey(imageEl.getAttribute('data-src') || imageEl.getAttribute('src') || '');",
    '    return isLaunchpadIconKey(key) ? key : "";',
    '  }',
    '',
    '  function extractCardTitle(cardEl) {',
    '    if (!(cardEl instanceof HTMLElement)) return "";',
    "    const titleNodes = cardEl.querySelectorAll('.line-clamp-1[title], div[title], span[title]');",
    '    for (const node of titleNodes) {',
    '      if (!(node instanceof HTMLElement)) continue;',
    "      const title = (node.getAttribute('title') || '').trim();",
    '      if (title) return title;',
    '    }',
    "    const fallback = cardEl.textContent ? cardEl.textContent.trim().replace(/\\s+/g, ' ') : '';",
    "    return fallback || '';",
    '  }',
    '',
    '  function collectCards() {',
    '    const cards = [];',
    "    document.querySelectorAll('div.cursor-pointer').forEach((candidate) => {",
    '      if (!(candidate instanceof HTMLElement)) return;',
    '      if (!hasAllClasses(candidate, DESKTOP_CARD_TOKENS) && !hasAllClasses(candidate, PANEL_CARD_TOKENS)) return;',
    '      const key = extractCardKey(candidate);',
    '      if (!key) return;',
    '      cards.push(candidate);',
    '    });',
    '    return cards;',
    '  }',
    '',
    '  function findIconBox(cardEl) {',
    '    if (!(cardEl instanceof HTMLElement)) return null;',
    "    const candidates = cardEl.querySelectorAll('div.box-border');",
    '    for (const candidate of candidates) {',
    '      if (!(candidate instanceof HTMLElement)) continue;',
    '      if (!hasAllClasses(candidate, ICON_BOX_TOKENS)) continue;',
    "      if (!candidate.querySelector('.semi-image')) continue;",
    '      return candidate;',
    '    }',
    '    return null;',
    '  }',
    '',
    '  function ensureScaleStyle() {',
    '    let styleEl = document.getElementById(STYLE_ID);',
    '    if (!styleEl) {',
    "      styleEl = document.createElement('style');",
    '      styleEl.id = STYLE_ID;',
    '      (document.head || document.documentElement).appendChild(styleEl);',
    '    }',
    '    const css = [',
    '      `.${BASE_CLASS}{position:relative;overflow:visible;}` ,',
    '      `.${BASE_CLASS} .semi-image{transform-origin:center center;position:relative;z-index:1;}` ,',
    '      `.${BLUR_CLONE_CLASS}{position:absolute;inset:0;z-index:0;pointer-events:none;transform:scale(1.25);transform-origin:center center;filter:blur(8px) saturate(115%);opacity:.42;}` ,',
    '      `.${BLUR_CLONE_CLASS} .${BLUR_CLONE_IMG_CLASS}{width:100%;height:100%;object-fit:contain;display:block;}` ,',
    '      `.${BOX_CLASS} .semi-image{transform:scale(.75)!important;}` ,',
    '      `.${MASK_ONLY_CLASS}:not(.${BOX_CLASS}) .semi-image{transform:none!important;}` ,',
    "    ].join('\\n');",
    '    if (styleEl.textContent !== css) styleEl.textContent = css;',
    '  }',
    '',
    '  function ensureBlurClone(boxEl, cardEl) {',
    '    if (!(boxEl instanceof HTMLElement)) return;',
    '    const imageEl = getIconImageEl(cardEl);',
    '    if (!(imageEl instanceof HTMLImageElement)) return;',
    "    const src = imageEl.getAttribute('src') || imageEl.getAttribute('data-src') || '';",
    '    if (!src) return;',
    '    let cloneEl = boxEl.querySelector(`:scope > .${BLUR_CLONE_CLASS}`);',
    '    if (!(cloneEl instanceof HTMLElement)) {',
    "      cloneEl = document.createElement('div');",
    '      cloneEl.className = BLUR_CLONE_CLASS;',
    "      const cloneImg = document.createElement('img');",
    '      cloneImg.className = BLUR_CLONE_IMG_CLASS;',
    "      cloneImg.alt = '';",
    '      cloneEl.appendChild(cloneImg);',
    '      boxEl.insertBefore(cloneEl, boxEl.firstChild);',
    '    }',
    '    const cloneImg = cloneEl.querySelector(`img.${BLUR_CLONE_IMG_CLASS}`);',
    '    if (!(cloneImg instanceof HTMLImageElement)) return;',
    "    if (cloneImg.getAttribute('src') !== src) cloneImg.setAttribute('src', src);",
    '  }',
    '',
    '  function removeBlurClone(boxEl) {',
    '    if (!(boxEl instanceof HTMLElement)) return;',
    '    boxEl.querySelectorAll(`:scope > .${BLUR_CLONE_CLASS}`).forEach((node) => {',
    '      if (!(node instanceof HTMLElement)) return;',
    '      node.remove();',
    '    });',
    '  }',
    '',
    '  function applyScaleState() {',
    '    const cards = collectCards();',
    '    const matchedBoxes = new Set();',
    '    cards.forEach((cardEl) => {',
    '      const boxEl = findIconBox(cardEl);',
    '      if (!(boxEl instanceof HTMLElement)) return;',
    '      const key = extractCardKey(cardEl);',
    '      if (!key) return;',
    '      matchedBoxes.add(boxEl);',
    '      const shouldScale = config.enabled && selectedSet.size > 0 && selectedSet.has(key);',
    '      boxEl.classList.toggle(BASE_CLASS, shouldScale);',
    '      boxEl.classList.toggle(BOX_CLASS, shouldScale);',
    '      boxEl.classList.remove(MASK_ONLY_CLASS);',
    '      if (shouldScale) {',
    '        ensureBlurClone(boxEl, cardEl);',
    '      } else {',
    '        removeBlurClone(boxEl);',
    '      }',
    '    });',
    '    document',
    '      .querySelectorAll(`.${BASE_CLASS}, .${BOX_CLASS}, .${MASK_ONLY_CLASS}`)',
    '      .forEach((boxEl) => {',
    '        if (!(boxEl instanceof HTMLElement)) return;',
    '        if (config.enabled && matchedBoxes.has(boxEl)) return;',
    '        boxEl.classList.remove(BASE_CLASS);',
    '        boxEl.classList.remove(BOX_CLASS);',
    '        boxEl.classList.remove(MASK_ONLY_CLASS);',
    '        removeBlurClone(boxEl);',
    '      });',
    '  }',
    '',
    '  function collectLaunchpadItems() {',
    '    const map = new Map();',
    '    collectCards().forEach((cardEl) => {',
    '      const key = extractCardKey(cardEl);',
    '      if (!key || map.has(key)) return;',
    '      const imageEl = getIconImageEl(cardEl);',
    "      const iconSrc = imageEl ? (imageEl.getAttribute('src') || imageEl.getAttribute('data-src') || '') : '';",
    '      map.set(key, {',
    '        key,',
    "        title: extractCardTitle(cardEl) || key.split('/').pop() || key,",
    '        iconSrc,',
    '      });',
    '    });',
    '    return Array.from(map.values());',
    '  }',
    '',
    '  function getReportEndpoint() {',
    "    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';",
    "    return `${protocol}//${window.location.hostname}:8964/api/launchpad/apps`;",
    '  }',
    '',
    '  function reportLaunchpadItems() {',
    '    const items = collectLaunchpadItems();',
    '    const fingerprint = JSON.stringify(items.map((item) => [item.key, item.title, item.iconSrc]));',
    '    if (fingerprint === lastReportFingerprint) return;',
    '    lastReportFingerprint = fingerprint;',
    '',
    '    fetch(getReportEndpoint(), {',
    "      method: 'POST',",
    "      mode: 'cors',",
    "      headers: { 'Content-Type': 'application/json' },",
    '      body: JSON.stringify({',
    "        source: window.location.origin || '',",
    '        items,',
    '      }),',
    '    }).catch(() => {});',
    '  }',
    '',
    '  function refreshAll() {',
    '    if (config.enabled) ensureScaleStyle();',
    '    applyScaleState();',
    '    reportLaunchpadItems();',
    '  }',
    '',
    '  function scheduleRefresh() {',
    '    if (reportTimer) return;',
    '    reportTimer = window.setTimeout(() => {',
    '      reportTimer = 0;',
    '      refreshAll();',
    '    }, 160);',
    '  }',
    '',
    '  function startObserve() {',
    '    if (!(document.body instanceof HTMLElement)) return;',
    '    const observer = new MutationObserver(() => scheduleRefresh());',
    '    observer.observe(document.body, {',
    "      childList: true,",
    "      subtree: true,",
    "      attributes: true,",
    "      attributeFilter: ['class', 'title', 'src', 'data-src'],",
    '    });',
    "    window.setInterval(() => scheduleRefresh(), 4000);",
    '  }',
    '',
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', () => { refreshAll(); startObserve(); }, { once: true });",
    '  } else {',
    '    refreshAll();',
    '    startObserve();',
    '  }',
    '})();',
    '',
  ].join('\n');
}

function buildPresetJs(presetConfig, templates) {
  const parts = [
    buildBanner(),
    normalizeTextContent(templates.js),
    '\n/* ----- generated.launchpad.bridge.js ----- */\n',
    normalizeTextContent(buildLaunchpadBridgeJs(presetConfig)),
  ];
  if (presetConfig.customCodeEnabled && presetConfig.customJs.trim()) {
    parts.push('\n/* ----- generated.custom.js ----- */\n');
    parts.push(normalizeTextContent(presetConfig.customJs));
  }
  return parts.join('');
}

async function buildPresetAssets(presetConfig) {
  const templates = await readPresetTemplates();
  const cssContent = buildPresetCss(presetConfig, templates);
  const jsContent = buildPresetJs(presetConfig, templates);

  return { cssContent, jsContent };
}

async function writePresetAssetsToTarget(cssContent, jsContent) {
  await fsp.mkdir(PRESET_STORE_DIR, { recursive: true });
  await Promise.all([
    fsp.writeFile(PRESET_CSS_TARGET, cssContent, 'utf8'),
    fsp.writeFile(PRESET_JS_TARGET, jsContent, 'utf8'),
  ]);
  await Promise.all([
    fsp.chmod(PRESET_CSS_TARGET, 0o644).catch(() => {}),
    fsp.chmod(PRESET_JS_TARGET, 0o644).catch(() => {}),
  ]);

  log(`Preset assets written: css=${PRESET_CSS_TARGET} (${Buffer.byteLength(cssContent)} bytes), js=${PRESET_JS_TARGET} (${Buffer.byteLength(jsContent)} bytes)`);
}

async function injectCode({
  injectMode,
  presetConfig,
  assetBaseUrl,
  cssText,
  jsText,
  cssPath,
  jsPath,
  injectDelaySec,
}) {
  const mode = injectMode === 'preset' ? 'preset' : 'custom';
  const delaySec = Number.isFinite(Number(injectDelaySec)) ? Number(injectDelaySec) : 0;

  log(
    `Inject request: mode=${mode}, cssText=${cssText ? cssText.length : 0} chars, jsText=${jsText ? jsText.length : 0} chars, cssPath=${cssPath || '-'}, jsPath=${jsPath || '-'}, delay=${delaySec}s`,
  );

  let finalCss = null;
  let finalJs = null;
  let cssMode = 'inline';
  let jsMode = 'inline';
  let presetAssetCssContent = '';
  let presetAssetJsContent = '';

  if (mode === 'preset') {
    const normalizedPresetConfig = normalizePresetConfig(presetConfig);
    const builtAssets = await buildPresetAssets(normalizedPresetConfig);
    presetAssetCssContent = builtAssets.cssContent;
    presetAssetJsContent = builtAssets.jsContent;
    finalCss = buildPresetCssLinkBlock(assetBaseUrl);
    finalJs = buildPresetJsLinkBlock(assetBaseUrl);
    cssMode = 'tag';
    jsMode = 'tag';
  } else {
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
  }

  lastPayload = { css: finalCss, js: finalJs, cssMode, jsMode };

  if (USE_SHELL_INJECT) {
    let cssTemp = '';
    let jsTemp = '';
    let runnerUsed = 'direct';
    const pathCssInput = mode === 'custom' ? (cssPath || '') : '';
    const pathJsInput = mode === 'custom' ? (jsPath || '') : '';
    try {
      if (mode === 'preset') {
        // Prefer direct write when namespace is shared; shell copy remains as fallback.
        await writePresetAssetsToTarget(presetAssetCssContent, presetAssetJsContent);
      }
      const cssInputPath = pathCssInput || (finalCss ? await writeTempFile('.css', finalCss) : '');
      const jsInputPath = pathJsInput || (finalJs ? await writeTempFile('.js', finalJs) : '');
      cssTemp = pathCssInput ? '' : cssInputPath;
      jsTemp = pathJsInput ? '' : jsInputPath;
      runnerUsed = await runShellInject(cssInputPath, jsInputPath, delaySec, cssMode, jsMode, '', '');
    } finally {
      const allowCleanup = runnerUsed !== 'at';
      if (cssTemp && allowCleanup) {
        await fsp.unlink(cssTemp).catch(() => {});
      }
      if (jsTemp && allowCleanup) {
        await fsp.unlink(jsTemp).catch(() => {});
      }
      if (!allowCleanup) {
        log(`Shell inject runner is at; temp files retained for async execution: css=${cssTemp || '-'}, js=${jsTemp || '-'}`);
      }
    }
  } else {
    if (delaySec > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
    }
    if (mode === 'preset') {
      await writePresetAssetsToTarget(presetAssetCssContent, presetAssetJsContent);
    }
    await performInjection(finalCss, finalJs, {
      restoreFromBackup: true,
      logPrefix: 'Inject',
      cssMode,
      jsMode,
    });
  }

  if (ENABLE_GUARD) {
    startStabilizeGuard();
  }

  if (mode === 'preset') {
    return { injected: true, message: '预设资源已生成并注入成功，请强制刷新浏览器 (Ctrl+F5) 查看效果。' };
  }

  return { injected: true, message: '注入成功，请强制刷新浏览器 (Ctrl+F5) 查看效果。' };
}

async function getStatus() {
  const result = {
    indexPath: INDEX_FILE,
    backupPath: BACKUP_FILE,
    assetsCssPath: PRESET_CSS_TARGET,
    assetsJsPath: PRESET_JS_TARGET,
    indexExists: false,
    backupExists: false,
    assetsCssExists: false,
    assetsJsExists: false,
    indexMtime: null,
    backupMtime: null,
    assetsCssMtime: null,
    assetsJsMtime: null,
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

  try {
    const stat = await fsp.stat(PRESET_CSS_TARGET);
    result.assetsCssExists = true;
    result.assetsCssMtime = stat.mtime.toISOString();
  } catch (_) {}

  try {
    const stat = await fsp.stat(PRESET_JS_TARGET);
    result.assetsJsExists = true;
    result.assetsJsMtime = stat.mtime.toISOString();
  } catch (_) {}

  return result;
}

function getLaunchpadAppsReport() {
  const currentItems = Array.isArray(launchpadAppsReport.items) ? launchpadAppsReport.items : [];
  if (currentItems.length > 0) {
    return {
      items: currentItems,
      updatedAt: typeof launchpadAppsReport.updatedAt === 'string' ? launchpadAppsReport.updatedAt : '',
      source: typeof launchpadAppsReport.source === 'string' ? launchpadAppsReport.source : '',
    };
  }

  const cliItems = getInstalledAppsFromCli();
  return {
    items: cliItems,
    updatedAt: typeof launchpadAppsReport.updatedAt === 'string' ? launchpadAppsReport.updatedAt : '',
    source: cliItems.length > 0 ? 'appcenter-cli:list' : '',
  };
}

async function updateLaunchpadAppsReport(body) {
  const source = body && typeof body.source === 'string' ? normalizePresetString(body.source, 400).trim() : '';
  const items = normalizeLaunchpadAppItems(body && body.items);

  if (items.length === 0 && Array.isArray(launchpadAppsReport.items) && launchpadAppsReport.items.length > 0) {
    return getLaunchpadAppsReport();
  }

  launchpadAppsReport = {
    items,
    updatedAt: new Date().toISOString(),
    source,
  };

  await persistLaunchpadAppsReport();
  return getLaunchpadAppsReport();
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

async function handlePresetAsset(req, res, pathname) {
  const target = pathname === '/preset/mod.css' ? PRESET_CSS_TARGET : PRESET_JS_TARGET;
  try {
    const data = await fsp.readFile(target);
    res.writeHead(200, {
      'Content-Type': mimeFor(target),
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (err) {
    return sendText(res, 404, 'Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '/', true);
  const pathname = parsedUrl.pathname || '/';
  const isLaunchpadApi = pathname === '/api/launchpad/apps';

  if (isLaunchpadApi) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
  }

  if (req.method === 'GET' && (pathname === '/preset/mod.css' || pathname === '/preset/mod.js')) {
    return handlePresetAsset(req, res, pathname);
  }

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
        const injectMode = typeof body.injectMode === 'string' ? body.injectMode.trim() : 'custom';
        const assetBaseUrl = typeof body.assetBaseUrl === 'string' ? body.assetBaseUrl.trim() : '';
        const cssText = typeof body.cssText === 'string' ? body.cssText.trim() : '';
        const jsText = typeof body.jsText === 'string' ? body.jsText.trim() : '';
        const cssPath = typeof body.cssPath === 'string' ? body.cssPath.trim() : '';
        const jsPath = typeof body.jsPath === 'string' ? body.jsPath.trim() : '';
        const injectDelaySec = typeof body.injectDelaySec !== 'undefined' ? body.injectDelaySec : 0;
        const presetConfig = body && typeof body.presetConfig === 'object' ? body.presetConfig : null;

        const result = await injectCode({
          injectMode,
          presetConfig,
          assetBaseUrl,
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

      if (req.method === 'GET' && pathname === '/api/launchpad/apps') {
        const report = getLaunchpadAppsReport();
        return sendJson(res, 200, { ok: true, data: report });
      }

      if (req.method === 'POST' && pathname === '/api/launchpad/apps') {
        const body = await readJsonBody(req);
        const report = await updateLaunchpadAppsReport(body);
        return sendJson(res, 200, {
          ok: true,
          message: `已接收 ${report.items.length} 条应用图标数据`,
          data: report,
        });
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
