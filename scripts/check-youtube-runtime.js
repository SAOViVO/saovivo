const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateApprovedManifest, compareVersions } = require('../src/ytdlp-runtime');

const OFFICIAL_SOURCES = [
  { id: 'youtube-data-api', name: 'YouTube Data API', url: 'https://developers.google.com/youtube/v3/revision_history' },
  { id: 'youtube-live-api', name: 'YouTube Live Streaming API', url: 'https://developers.google.com/youtube/v3/live/revision_history' },
  { id: 'youtube-terms', name: 'YouTube API Services Terms', url: 'https://developers.google.com/youtube/terms/revision-history' }
];
const VIDEO_CANARY_ARGS = ['--test', '--no-playlist', '--no-warnings', '-f', 'bv*[height<=720]/bv*/ba'];
const FINGERPRINT_SCHEMA_VERSION = 2;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hexadecimal = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      try { return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match; } catch { return match; }
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function semanticRevisionText(value) {
  const html = String(value || '');
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  let revisionScope = article?.[1] || main?.[1] || html;
  for (const heading of revisionScope.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]\s*>/gi)) {
    const headingText = decodeHtmlEntities(heading[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i.test(headingText)) {
      revisionScope = revisionScope.slice(heading.index);
      break;
    }
  }
  const visibleText = revisionScope
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(script|style|template|noscript|svg|footer|devsite-page-rating|devsite-feedback)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(visibleText)
    .replace(/\bLast updated\s+\d{4}-\d{2}-\d{2}\s+UTC\.?/gi, ' ')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedFingerprint(value) {
  return sha256(semanticRevisionText(value));
}

function isYouTubeUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return parsed.protocol === 'https:' && (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be');
  } catch { return false; }
}

function classifyReport({ officialChanges = [], latestVersion, approvedVersion, releaseBody = '', canary = {}, failedSources = [] }) {
  const youtubeRelease = /youtube|403|player client|signature|nsig|ejs/i.test(releaseBody);
  const newerStable = compareVersions(latestVersion, approvedVersion) > 0;
  const failedCanaries = Object.values(canary).filter((entry) => entry?.status === 'failed');
  if (failedSources.length || failedCanaries.length || (newerStable && youtubeRelease)) return 'ROJO';
  if (newerStable || officialChanges.length) return 'AMARILLO';
  return 'VERDE';
}

function reportMarkdown(data) {
  const lines = [
    '# Control diario de YouTube y yt-dlp',
    '',
    `Fecha UTC: ${data.checkedAt}`,
    `Clasificación: **${data.classification}**`,
    '',
    '## Runtime yt-dlp',
    '',
    `- Estable aprobado por SAOViVO: \`${data.approved.version}\``,
    `- Último estable upstream: \`${data.latest.version || 'no disponible'}\``,
    `- Consulta de GitHub Releases: ${data.latest.status === 'failed' ? '**fallida** — no se pudo consultar la fuente oficial.' : 'correcta'}`,
    `- Release: ${data.latest.htmlUrl || 'no disponible'}`,
    `- SHA-256 Windows upstream: \`${data.latest.windowsSha256 || 'no informado'}\``,
    `- Cambio posterior pendiente de aprobación: ${data.latest.status === 'failed' ? 'no se pudo determinar' : compareVersions(data.latest.version, data.approved.version) > 0 ? 'sí' : 'no'}`,
    '',
    '## Fuentes oficiales de YouTube',
    ''
  ];
  for (const source of data.sources) {
    const sourceStatus = source.status === 'failed'
      ? '**fallida** — no se pudo consultar esta fuente.'
      : source.changed ? '**cambió desde el control anterior**' : 'sin cambio detectado';
    lines.push(`- ${source.name}: ${sourceStatus} — ${source.url}`);
  }
  lines.push('', '## Prueba controlada', '');
  for (const [name, result] of Object.entries(data.canary)) lines.push(`- ${name}: ${result.status}${result.detail ? ` — ${result.detail}` : ''}`);
  lines.push(
    '',
    '## Acción',
    '',
    data.classification === 'ROJO'
      ? '- Abrir incidente prioritario y validar en SAOViVO antes de aprobar un nuevo runtime.'
      : data.classification === 'AMARILLO'
        ? '- Revisar los cambios; no actualizar ni publicar automáticamente.'
        : '- Registrar el control. No se requiere publicación.',
    '- Este workflow nunca modifica el manifiesto aprobado, crea releases ni publica binarios.',
    ''
  );
  return `${lines.join('\n')}\n`;
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': 'SAOViVO-youtube-runtime-watch/2.0.1', ...headers } });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return response.text();
}

async function fetchJson(url, headers = {}) {
  return JSON.parse(await fetchText(url, { Accept: 'application/vnd.github+json', ...headers }));
}

async function canaryCheck(approved, name, url, args) {
  if (!url) return { status: 'omitida', detail: 'configurá una URL propia en las variables del repositorio' };
  if (!isYouTubeUrl(url)) return { status: 'failed', detail: 'la variable no contiene una URL HTTPS de YouTube' };
  const binDir = path.resolve('.youtube-runtime-watch-bin');
  const binary = path.join(binDir, 'yt-dlp.exe');
  await fsp.mkdir(binDir, { recursive: true });
  if (!fs.existsSync(binary) || sha256(await fsp.readFile(binary)) !== approved.sha256) {
    const response = await fetch(approved.url, { headers: { 'User-Agent': 'SAOViVO-youtube-runtime-watch/2.0.1' } });
    if (!response.ok) return { status: 'failed', detail: `no se pudo descargar el runtime aprobado (${response.status})` };
    const body = Buffer.from(await response.arrayBuffer());
    if (sha256(body) !== approved.sha256) return { status: 'failed', detail: 'el SHA-256 del runtime no coincide' };
    await fsp.writeFile(binary, body);
  }
  const canaryOutput = path.join(binDir, `${name}-canary.%(ext)s`);
  const outputArgs = name === 'video' ? ['-o', canaryOutput] : [];
  const result = spawnSync(binary, [...args, ...outputArgs, url], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (name === 'video') {
    const created = (await fsp.readdir(binDir)).filter((entry) => entry.startsWith('video-canary.'));
    await Promise.all(created.map((entry) => fsp.unlink(path.join(binDir, entry)).catch(() => {})));
  }
  if (result.status === 0) return { status: 'ok' };
  return { status: 'failed', detail: `yt-dlp terminó con código ${result.status ?? 'sin código'}` };
}

async function runWatch(options = {}) {
  const outputPath = path.resolve(options.outputPath || process.env.SAOVIVO_WATCH_REPORT || 'youtube-runtime-report.md');
  const statePath = path.resolve(options.statePath || process.env.SAOVIVO_WATCH_STATE || '.youtube-runtime-watch-state/state.json');
  const approvedPath = path.resolve(options.approvedPath || process.env.SAOVIVO_YTDLP_MANIFEST || 'src/runtime/yt-dlp-approved.json');
  const fetchTextImpl = options.fetchTextImpl || fetchText;
  const fetchJsonImpl = options.fetchJsonImpl || fetchJson;
  const canaryCheckImpl = options.canaryCheckImpl || canaryCheck;
  const approved = validateApprovedManifest(JSON.parse(await fsp.readFile(approvedPath, 'utf8')));
  let previous = {};
  try { previous = JSON.parse(await fsp.readFile(statePath, 'utf8')); } catch {}
  const previousFingerprints = previous.fingerprintSchemaVersion === FINGERPRINT_SCHEMA_VERSION
    ? previous.sourceFingerprints || {}
    : {};
  const sources = [];
  const failedSources = [];
  for (const source of OFFICIAL_SOURCES) {
    try {
      const content = await fetchTextImpl(source.url);
      const fingerprint = normalizedFingerprint(content);
      sources.push({ ...source, status: 'ok', fingerprint, changed: Boolean(previousFingerprints[source.id] && previousFingerprints[source.id] !== fingerprint) });
    } catch {
      failedSources.push(source.id);
      const savedFingerprint = String(previousFingerprints[source.id] || '').toLowerCase();
      sources.push({ ...source, status: 'failed', fingerprint: /^[a-f0-9]{64}$/.test(savedFingerprint) ? savedFingerprint : null, changed: false });
    }
  }
  const savedLatestVersion = String(previous.latestStableVersion || '');
  let latest = { status: 'failed', version: /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(savedLatestVersion) ? savedLatestVersion : approved.version, htmlUrl: null, body: '', windowsSha256: null };
  try {
    const release = await fetchJsonImpl('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {});
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(version)) throw new Error('invalid release fixture');
    const windowsAsset = (release.assets || []).find((asset) => asset.name === 'yt-dlp.exe');
    const digest = String(windowsAsset?.digest || '').replace(/^sha256:/, '').toLowerCase();
    latest = {
      status: 'ok',
      version,
      htmlUrl: `https://github.com/yt-dlp/yt-dlp/releases/tag/${encodeURIComponent(version)}`,
      body: release.body || '',
      windowsSha256: /^[a-f0-9]{64}$/.test(digest) ? digest : null
    };
  } catch {
    failedSources.push('yt-dlp-github-releases');
  }
  const safeCanary = async (name, url, args) => {
    try { return await canaryCheckImpl(approved, name, url, args); }
    catch { return { status: 'failed', detail: 'no se pudo completar la prueba controlada' }; }
  };
  const canary = {
    'Video propio': await safeCanary('video', options.videoCanaryUrl ?? process.env.SAOVIVO_YOUTUBE_CANARY_URL ?? '', VIDEO_CANARY_ARGS),
    'Playlist propia': await safeCanary('playlist', options.playlistCanaryUrl ?? process.env.SAOVIVO_YOUTUBE_CANARY_PLAYLIST_URL ?? '', ['--flat-playlist', '--playlist-end', '3', '--dump-json', '--no-warnings'])
  };
  const officialChanges = sources.filter((source) => source.changed);
  const classification = classifyReport({ officialChanges, latestVersion: latest.version, approvedVersion: approved.version, releaseBody: latest.body, canary, failedSources });
  const data = { checkedAt: new Date().toISOString(), classification, approved, latest, sources, canary };
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, reportMarkdown(data), 'utf8');
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, JSON.stringify({
    checkedAt: data.checkedAt,
    classification,
    fingerprintSchemaVersion: FINGERPRINT_SCHEMA_VERSION,
    latestStableVersion: latest.version,
    failedSources,
    sourceFingerprints: Object.fromEntries(sources.filter((source) => source.fingerprint).map((source) => [source.id, source.fingerprint]))
  }, null, 2), 'utf8');
  process.stdout.write(`${classification}\n${outputPath}\n`);
  return { classification, failedSources, outputPath, statePath, exitCode: failedSources.length ? 1 : 0 };
}

if (require.main === module) runWatch()
  .then((result) => { process.exitCode = result.exitCode; })
  .catch(() => {
    process.stderr.write('El monitor no pudo generar su informe operativo.\n');
    process.exitCode = 1;
  });

module.exports = { OFFICIAL_SOURCES, VIDEO_CANARY_ARGS, FINGERPRINT_SCHEMA_VERSION, semanticRevisionText, normalizedFingerprint, isYouTubeUrl, classifyReport, reportMarkdown, runWatch };
