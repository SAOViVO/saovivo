const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');

const DEFAULT_REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/SAOViVO/saovivo/main/src/runtime/yt-dlp-approved.json';
const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const VERSION_PATTERN = /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

function compareVersions(left, right) {
  const a = String(left || '').split('.').map((part) => Number(part) || 0);
  const b = String(right || '').split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

function validateApprovedManifest(input, { minimumVersion = null } = {}) {
  const manifest = input && typeof input === 'object' ? input : {};
  if (manifest.schemaVersion !== 1) throw new Error('El manifiesto de yt-dlp usa un esquema no aprobado.');
  if (manifest.channel !== 'stable') throw new Error('SAOViVO sólo acepta el canal estable de yt-dlp.');
  if (!VERSION_PATTERN.test(String(manifest.version || ''))) throw new Error('La versión aprobada de yt-dlp no es válida.');
  if (minimumVersion && compareVersions(manifest.version, minimumVersion) < 0) throw new Error('El manifiesto intenta volver a una versión anterior de yt-dlp.');
  if (manifest.assetName !== 'yt-dlp.exe') throw new Error('El manifiesto no apunta al ejecutable Windows aprobado.');
  const expectedUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${manifest.version}/yt-dlp.exe`;
  if (manifest.url !== expectedUrl) throw new Error('La URL aprobada de yt-dlp no coincide con su release oficial.');
  if (!SHA256_PATTERN.test(String(manifest.sha256 || ''))) throw new Error('El manifiesto no contiene un SHA-256 válido.');
  return Object.freeze({
    schemaVersion: 1,
    channel: 'stable',
    version: manifest.version,
    assetName: 'yt-dlp.exe',
    url: manifest.url,
    sha256: manifest.sha256.toLowerCase(),
    releasedAt: manifest.releasedAt || null,
    approvedAt: manifest.approvedAt || null,
    notesUrl: manifest.notesUrl || null
  });
}

async function fileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function requestBuffer(url, { redirects = 0, maxBytes = 64 * 1024 * 1024, allowedHosts = null, userAgent = 'SAOViVO/2.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('La descarga superó el límite de redirecciones.'));
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('La URL de actualización no es válida.')); }
    if (parsed.protocol !== 'https:') return reject(new Error('La actualización requiere HTTPS.'));
    if (allowedHosts && !allowedHosts.has(parsed.hostname.toLowerCase())) return reject(new Error('La actualización salió de los servidores aprobados.'));
    const request = https.get(parsed, { headers: { 'User-Agent': userAgent, Accept: 'application/json, application/octet-stream' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, parsed).toString();
        return requestBuffer(next, { redirects: redirects + 1, maxBytes, allowedHosts, userAgent }).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`El servidor de actualización respondió ${response.statusCode}.`));
      }
      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) request.destroy(new Error('La actualización excede el tamaño permitido.'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
    request.setTimeout(30000, () => request.destroy(new Error('La actualización tardó demasiado.')));
  });
}

async function fetchJson(url) {
  const allowedHosts = new Set(['raw.githubusercontent.com']);
  const body = await requestBuffer(url, { maxBytes: 128 * 1024, allowedHosts });
  return JSON.parse(body.toString('utf8'));
}

async function downloadFile(url, destination) {
  const body = await requestBuffer(url, { allowedHosts: ALLOWED_DOWNLOAD_HOSTS });
  await fsp.writeFile(destination, body, { flag: 'wx' });
}

class YtDlpRuntimeManager {
  constructor({
    basePath,
    binaryPath,
    bundledManifestPath,
    remoteManifestUrl = DEFAULT_REMOTE_MANIFEST_URL,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    runCommand,
    logger = () => {},
    onStatus = () => {},
    now = () => Date.now(),
    fetchManifest = fetchJson,
    download = downloadFile
  }) {
    this.basePath = basePath;
    this.binaryPath = binaryPath;
    this.bundledManifestPath = bundledManifestPath;
    this.remoteManifestUrl = remoteManifestUrl;
    this.checkIntervalMs = checkIntervalMs;
    this.runCommand = runCommand;
    this.logger = logger;
    this.onStatus = onStatus;
    this.now = now;
    this.fetchManifest = fetchManifest;
    this.download = download;
    this.statePath = path.join(basePath, 'yt-dlp-state.json');
    this.backupPath = path.join(basePath, 'yt-dlp.previous.exe');
    this.pending = null;
  }

  async readJson(filePath, fallback = null) {
    try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); } catch { return fallback; }
  }

  async writeState(state) {
    const temp = `${this.statePath}.new`;
    await fsp.writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
    await fsp.rename(temp, this.statePath);
  }

  async inspectBinary(filePath) {
    try { await fsp.access(filePath); } catch { return { exists: false, valid: false, version: null, sha256: null }; }
    const sha256 = await fileSha256(filePath);
    try {
      const result = await this.runCommand(filePath, ['--version'], { timeout: 15000, timeoutMessage: 'yt-dlp no respondió al verificar su versión.' });
      const version = String(result.stdout || '').trim().split(/\s+/)[0] || '';
      return { exists: true, valid: VERSION_PATTERN.test(version), version, sha256 };
    } catch (error) {
      return { exists: true, valid: false, version: null, sha256, error: error.message };
    }
  }

  async resolveApprovedManifest({ forceCheck = false } = {}) {
    const bundled = validateApprovedManifest(await this.readJson(this.bundledManifestPath));
    const state = await this.readJson(this.statePath, {}) || {};
    let approved = bundled;
    let source = 'bundled';
    if (state.approvedManifest) {
      try {
        const persisted = validateApprovedManifest(state.approvedManifest, { minimumVersion: bundled.version });
        if (compareVersions(persisted.version, approved.version) >= 0) {
          approved = persisted;
          source = 'persisted';
        }
      } catch (error) {
        this.logger('YOUTUBE RUNTIME MANIFIESTO PERSISTIDO IGNORADO', error.message);
      }
    }
    const lastCheck = Date.parse(state.lastManifestCheckAt || '') || 0;
    const due = forceCheck || !lastCheck || this.now() - lastCheck >= this.checkIntervalMs;
    if (!due) return { approved, source, state };
    const nextState = { ...state, lastManifestCheckAt: new Date(this.now()).toISOString() };
    try {
      const remote = validateApprovedManifest(await this.fetchManifest(this.remoteManifestUrl), { minimumVersion: approved.version });
      approved = remote;
      source = 'remote';
      nextState.approvedManifest = remote;
      nextState.highestApprovedVersion = remote.version;
      delete nextState.lastManifestError;
      this.logger('YOUTUBE RUNTIME MANIFIESTO VERIFICADO', JSON.stringify({ version: remote.version, channel: remote.channel, source }));
    } catch (error) {
      nextState.lastManifestError = error.message;
      this.logger('YOUTUBE RUNTIME MANIFIESTO REMOTO NO DISPONIBLE', error.message);
    }
    await this.writeState(nextState);
    return { approved, source, state: nextState };
  }

  async install(approved, state = {}) {
    const tempPath = `${this.binaryPath}.${process.pid}.${this.now()}.new`;
    await fsp.unlink(tempPath).catch(() => {});
    this.onStatus({ type: 'download', version: approved.version });
    let previous = null;
    let currentMoved = false;
    try {
      await this.download(approved.url, tempPath);
      const downloadedHash = await fileSha256(tempPath);
      if (downloadedHash !== approved.sha256) throw new Error('El SHA-256 de yt-dlp no coincide con la versión aprobada.');
      const candidate = await this.inspectBinary(tempPath);
      if (!candidate.valid || candidate.version !== approved.version || candidate.sha256 !== approved.sha256) {
        throw new Error('El ejecutable descargado no coincide con la versión aprobada de yt-dlp.');
      }
      previous = await this.inspectBinary(this.binaryPath);
      await fsp.unlink(this.backupPath).catch(() => {});
      if (previous.exists) {
        await fsp.rename(this.binaryPath, this.backupPath);
        currentMoved = true;
      }
      await fsp.rename(tempPath, this.binaryPath);
      const installed = await this.inspectBinary(this.binaryPath);
      if (!installed.valid || installed.version !== approved.version || installed.sha256 !== approved.sha256) {
        throw new Error('yt-dlp no superó la verificación después de instalarse.');
      }
      const nextState = {
        ...state,
        approvedManifest: approved,
        highestApprovedVersion: approved.version,
        installed: { version: installed.version, sha256: installed.sha256, installedAt: new Date(this.now()).toISOString() },
        rollback: previous?.valid ? { version: previous.version, sha256: previous.sha256 } : null
      };
      delete nextState.blockedVersion;
      await this.writeState(nextState);
      this.logger('YOUTUBE RUNTIME ACTUALIZADO', JSON.stringify({ from: previous?.version || null, to: installed.version, sha256: installed.sha256 }));
      this.onStatus({ type: 'ready', version: installed.version, previousVersion: previous?.version || null });
      return { updated: true, version: installed.version, previousVersion: previous?.version || null, manifest: approved };
    } catch (error) {
      await fsp.unlink(tempPath).catch(() => {});
      if (currentMoved) {
        await fsp.unlink(this.binaryPath).catch(() => {});
        await fsp.rename(this.backupPath, this.binaryPath).catch(() => {});
        this.logger('YOUTUBE RUNTIME ROLLBACK AUTOMÁTICO', JSON.stringify({ restored: previous?.version || null, reason: error.message }));
        if (previous?.valid) {
          await this.writeState({
            ...state,
            blockedVersion: approved.version,
            installed: { version: previous.version, sha256: previous.sha256, installedAt: new Date(this.now()).toISOString(), rolledBack: true },
            rollback: null
          }).catch(() => {});
        }
      }
      throw error;
    }
  }

  async ensure(options = {}) {
    if (this.pending) return this.pending;
    this.pending = this.ensureUnlocked(options).finally(() => { this.pending = null; });
    return this.pending;
  }

  async ensureUnlocked({ forceCheck = false } = {}) {
    await fsp.mkdir(this.basePath, { recursive: true });
    const { approved, source, state } = await this.resolveApprovedManifest({ forceCheck });
    const current = await this.inspectBinary(this.binaryPath);
    const matches = current.valid && current.version === approved.version && current.sha256 === approved.sha256;
    this.logger('YOUTUBE RUNTIME VERIFICADO', JSON.stringify({ currentVersion: current.version, approvedVersion: approved.version, currentHash: current.sha256, source, matches }));
    if (matches) return { updated: false, version: current.version, manifest: approved };
    const rollbackHeld = state.blockedVersion === approved.version && current.valid &&
      state.installed?.version === current.version && state.installed?.sha256 === current.sha256;
    if (rollbackHeld) {
      this.logger('YOUTUBE RUNTIME EN ROLLBACK', JSON.stringify({ version: current.version, blockedVersion: state.blockedVersion }));
      return { updated: false, version: current.version, manifest: approved, rollbackHeld: true };
    }
    return this.install(approved, state);
  }

  async rollback() {
    const state = await this.readJson(this.statePath, {}) || {};
    const expected = state.rollback;
    if (!expected || !VERSION_PATTERN.test(String(expected.version || '')) || !SHA256_PATTERN.test(String(expected.sha256 || ''))) {
      throw new Error('No hay una versión anterior verificada para restaurar.');
    }
    const backup = await this.inspectBinary(this.backupPath);
    if (!backup.valid || backup.version !== expected.version || backup.sha256 !== expected.sha256) {
      throw new Error('La copia anterior de yt-dlp no superó la verificación.');
    }
    const failedPath = `${this.binaryPath}.failed-${this.now()}`;
    const blockedVersion = state.installed?.version || state.approvedManifest?.version || null;
    if (fs.existsSync(this.binaryPath)) await fsp.rename(this.binaryPath, failedPath);
    try {
      await fsp.rename(this.backupPath, this.binaryPath);
      const restored = await this.inspectBinary(this.binaryPath);
      if (!restored.valid || restored.version !== expected.version || restored.sha256 !== expected.sha256) throw new Error('La versión anterior no pudo restaurarse.');
      await fsp.unlink(failedPath).catch(() => {});
      state.installed = { version: restored.version, sha256: restored.sha256, installedAt: new Date(this.now()).toISOString(), rolledBack: true };
      state.rollback = null;
      if (blockedVersion) state.blockedVersion = blockedVersion;
      await this.writeState(state);
      this.logger('YOUTUBE RUNTIME ROLLBACK MANUAL', JSON.stringify({ restored: restored.version, sha256: restored.sha256 }));
      return restored;
    } catch (error) {
      await fsp.unlink(this.binaryPath).catch(() => {});
      if (fs.existsSync(failedPath)) await fsp.rename(failedPath, this.binaryPath).catch(() => {});
      throw error;
    }
  }
}

module.exports = {
  YtDlpRuntimeManager,
  DEFAULT_REMOTE_MANIFEST_URL,
  DEFAULT_CHECK_INTERVAL_MS,
  compareVersions,
  validateApprovedManifest,
  fileSha256,
  requestBuffer
};
