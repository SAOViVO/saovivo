const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { powerSaveBlocker } = require('electron');
const { sourceTypeOf, isSupportedLocalPath, localItemId } = require('./media-source');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const RTMP_URL = 'rtmps://a.rtmps.youtube.com:443/live2';
const PRIVATE_ACCOUNT_PLAYLIST_MESSAGE = 'Esta playlist es privada de tu cuenta de YouTube. SAOViVO no accede a tu cuenta. Creá una playlist pública o no listada y pegá ese enlace.';

class StreamEngine {
  constructor({ appDataPath, operationalPath, ffmpegPath, notify, powerManager = powerSaveBlocker, streamTarget = null }) {
    this.basePath = path.join(appDataPath, 'runtime');
    this.legacyMediaPath = path.join(this.basePath, 'media');
    this.operationalPath = operationalPath;
    this.tempPath = path.join(operationalPath, 'temp');
    this.mediaPath = path.join(this.tempPath, 'media');
    this.logsPath = path.join(operationalPath, 'logs');
    this.ytDlpPath = path.join(this.basePath, 'yt-dlp.exe');
    this.ffmpegPath = ffmpegPath;
    this.notify = notify;
    this.powerManager = powerManager;
    this.streamTargetOverride = streamTarget;
    this.ffmpeg = null;
    this.playbackWorker = null;
    this.prearmedPlayback = null;
    this.prearmPromise = null;
    this.prearmTargetId = null;
    this.prearmRequestId = 0;
    this.preResolvedSources = new Map();
    this.sourcePrearmPromises = new Map();
    this.switchRequestId = 0;
    this.playbackToken = 0;
    this.playbackStartedAt = 0;
    this.playbackOffset = 0;
    this.activeIndex = -1;
    this.activeItemId = null;
    this.progressTimer = null;
    this.isStreaming = false;
    this.stopping = false;
    this.queue = [];
    this.loop = true;
    this.retryCount = 0;
    this.powerBlockerId = null;
    this.totalDuration = 0;
    this.progressBuffer = '';
    this.publisherMetrics = {};
    this.lastPublisherProgressAt = 0;
    this.lastPublisherOutTime = 0;
    this.lastPublisherHealthLogAt = 0;
    this.publisherHealthTimer = null;
    this.publisherStallLogged = false;
    this.retryTimer = null;
    this.liveRetryTimer = null;
    this.liveRetryCount = 0;
    this.sessionGeneration = 0;
    this.stopPromise = null;
    this.finishedGeneration = null;
    this.ffmpegHandled = false;
    this.preparationChain = Promise.resolve();
    this.preparationById = new Map();
    this.liveConfirmed = false;
    this.lastTotalElapsed = 0;
    this.loopStopAt = null;
    this.loopEnding = false;
    this.streamLogPath = null;
    this.ffmpegLogPath = null;
    this.lastStreamLogPath = null;
    this.lastFfmpegLogPath = null;
    this.lastHealthLog = 0;
    this.lastLoggedVideo = -1;
    this.workers = new Set();
    this.shuttingDown = false;
  }

  status() {
    return { streaming: this.isStreaming, retryCount: this.retryCount, activeIndex: this.activeIndex, activeItemId: this.activeItemId };
  }

  emit(type, message, extra = {}) {
    this.notify({ type, message, at: new Date().toISOString(), ...extra });
  }

  async initialize() {
    await this.cleanupTemporary();
    await fsp.rm(this.legacyMediaPath, { recursive: true, force: true });
    await Promise.all([
      fsp.mkdir(this.mediaPath, { recursive: true }),
      fsp.mkdir(this.logsPath, { recursive: true }),
      fsp.mkdir(this.basePath, { recursive: true })
    ]);
    await fsp.writeFile(path.join(this.operationalPath, 'README.txt'), [
      'SAOViVO DATA',
      '',
      'logs/  Historial operativo permanente, separado por transmisión.',
      'temp/  Archivos de trabajo. SAOViVO elimina esta carpeta al cerrar.',
      '',
      'La stream key no se guarda aquí: Windows la protege en el perfil del usuario.'
    ].join('\r\n'), 'utf8');
    this.logTechnical('Aplicación iniciada', `Versión ${require('../package.json').version}`);
  }

  async cleanupTemporary() {
    const resolvedTemp = path.resolve(this.tempPath);
    const resolvedRoot = path.resolve(this.operationalPath);
    if (!resolvedTemp.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('La carpeta temporal no es segura.');
    await fsp.rm(resolvedTemp, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }

  waitForWorkerExit(worker, timeout = 8000) {
    if (!worker || worker.exitCode !== null || worker.signalCode) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, timeout);
      worker.once('close', finish);
      worker.once('error', finish);
    });
  }

  async terminateWorkerTree(worker) {
    if (!worker || worker.exitCode !== null || worker.signalCode) return;
    const exited = this.waitForWorkerExit(worker);
    try {
      if (process.platform === 'win32' && worker.pid) {
        await new Promise((resolve) => {
          const killer = spawn('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          const timer = setTimeout(() => { try { killer.kill(); } catch {} resolve(); }, 5000);
          killer.once('close', () => { clearTimeout(timer); resolve(); });
          killer.once('error', () => { clearTimeout(timer); resolve(); });
        });
      } else {
        worker.kill('SIGTERM');
      }
    } catch {}
    await exited;
  }

  async cancelActiveWorkers() {
    for (let pass = 0; pass < 3; pass += 1) {
      const active = [...this.workers].filter((worker) => worker.exitCode === null && !worker.signalCode);
      if (!active.length) return;
      this.logTechnical('CANCELANDO PROCESOS', `${active.length} proceso(s) de descarga/preparación activos.`);
      await Promise.all(active.map((worker) => this.terminateWorkerTree(worker)));
    }
  }

  async shutdown(streamMessage = 'El vivo terminó porque se cerró SAOViVO.') {
    this.shuttingDown = true;
    if (this.isStreaming || this.ffmpeg) {
      await this.stop(streamMessage, 'success', { origin: 'application', reason: 'application_shutdown' });
    }
    await this.cancelActiveWorkers();
    const preparations = Promise.allSettled([...this.preparationById.values()]);
    let preparationsFinished = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      preparationsFinished = await Promise.race([
        preparations.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 500))
      ]);
      if (preparationsFinished) break;
      await this.cancelActiveWorkers();
    }
    await this.cancelActiveWorkers();
    if (!preparationsFinished && this.preparationById.size) {
      this.logTechnical('LIMPIEZA DIFERIDA', `${this.preparationById.size} preparación(es) todavía no liberaron sus archivos.`);
      return;
    }
    try {
      await this.cleanupTemporary();
      this.logTechnical('CIERRE LIMPIO', 'Archivos temporales eliminados.');
    } catch (error) {
      let leftovers = [];
      try { leftovers = (await fsp.readdir(this.mediaPath)).filter((name) => name.endsWith('.part') || name.includes('.part.')); } catch {}
      this.logTechnical('LIMPIEZA DIFERIDA', JSON.stringify({ error: error.message, leftovers }, null, 2));
    }
  }

  makeSessionId() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  }

  startSessionLog() {
    fs.mkdirSync(this.logsPath, { recursive: true });
    const id = this.makeSessionId();
    this.streamLogPath = path.join(this.logsPath, `stream-${id}.log`);
    this.ffmpegLogPath = path.join(this.logsPath, `stream-${id}-ffmpeg.log`);
    this.lastStreamLogPath = this.streamLogPath;
    this.lastFfmpegLogPath = this.ffmpegLogPath;
    fs.writeFileSync(this.ffmpegLogPath, '', { flag: 'a' });
    this.lastHealthLog = 0;
    this.lastLoggedVideo = -1;
    this.logTechnical('STREAM CREADO', JSON.stringify({
      videos: this.queue.map((item) => ({
        id: item.id,
        sourceType: sourceTypeOf(item),
        source: sourceTypeOf(item) === 'local' ? item.localPath : item.url,
        title: item.title,
        duration: item.duration
      })),
      loop: this.loop,
      totalSeconds: this.totalDuration
    }, null, 2));
  }

  sanitizeYouTubeUrl(value) {
    try {
      const source = new URL(String(value || ''));
      const safe = new URL(`${source.protocol}//${source.host}${source.pathname}`);
      for (const name of ['v', 'list']) {
        const parameter = source.searchParams.get(name);
        if (parameter) safe.searchParams.set(name, parameter.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100));
      }
      return safe.toString();
    } catch { return '[URL NO VÁLIDA]'; }
  }

  sanitizeDiagnostic(detail) {
    let safe = String(detail || 'Sin detalle');
    if (this.streamKey) safe = safe.split(this.streamKey).join('[STREAM_KEY]');
    safe = safe
      .replace(/https?:\/\/[^\s"'<>]*(?:googlevideo\.com|youtube\.com\/(?:api\/manifest|videoplayback))[^\s"'<>]*/gi, '[LIVE_URL_REDACTED]')
      .replace(/(rtmps?:\/\/[^\s/]+\/live2\/)[^\s]+/gi, '$1[STREAM_KEY]')
      .replace(/\b(authorization|cookie|cookies|token|access[_-]?token|refresh[_-]?token|signature|stream[_ -]?key)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
      .replace(/([?&])(token|access_token|refresh_token|sig|signature|auth|key|cookie)=[^&\s]+/gi, '$1$2=[REDACTED]');
    return safe;
  }

  logTechnical(scope, detail) {
    try {
      fs.mkdirSync(this.logsPath, { recursive: true });
      const safeDetail = this.sanitizeDiagnostic(detail);
      const daily = `app-${new Date().toISOString().slice(0, 10)}.log`;
      fs.appendFileSync(this.streamLogPath || path.join(this.logsPath, daily), `[${new Date().toISOString()}] ${scope}\n${safeDetail}\n\n`);
    } catch {}
  }

  logFfmpeg(detail) {
    if (!this.ffmpegLogPath) return;
    try {
      let safe = String(detail || '');
      if (this.streamKey) safe = safe.split(this.streamKey).join('[STREAM_KEY]');
      fs.appendFileSync(this.ffmpegLogPath, safe);
    } catch {}
  }

  actionSnapshot(extra = {}) {
    const activeIndex = this.queue.findIndex((item) => item.id === this.activeItemId);
    return {
      session: this.sessionGeneration,
      activeItemId: this.activeItemId || null,
      activeIndex,
      playedSeconds: Number(this.playbackElapsed().toFixed(3)),
      publisherOutTime: Number((this.lastPublisherOutTime || 0).toFixed(3)),
      loop: this.loop,
      queueItemIds: this.queue.map((item) => item.id),
      ...extra
    };
  }

  logActionRequested(action, extra = {}) {
    this.logTechnical('ACCIÓN DE STREAM SOLICITADA', JSON.stringify(this.actionSnapshot({ action, ...extra }), null, 2));
  }

  logActionCompleted(action, extra = {}) {
    this.logTechnical('ACCIÓN DE STREAM COMPLETADA', JSON.stringify(this.actionSnapshot({ action, ...extra }), null, 2));
  }

  async ensureCoreRuntime() {
    await Promise.all([fsp.mkdir(this.mediaPath, { recursive: true }), fsp.mkdir(this.logsPath, { recursive: true })]);
    if (!this.ffmpegPath || !fs.existsSync(this.ffmpegPath)) {
      throw new Error('No se encontró el motor de video FFmpeg. Reinstalá la aplicación.');
    }
  }

  async ensureYouTubeRuntime() {
    await this.ensureCoreRuntime();
    if (!fs.existsSync(this.ytDlpPath)) {
      this.emit('download', 'Preparando el acceso a YouTube por primera vez…');
      await this.downloadFile(YTDLP_URL, this.ytDlpPath);
      this.emit('success', 'SAOViVO ya puede leer tus videos de YouTube.');
    }
  }

  downloadFile(url, destination, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 8) return reject(new Error('No se pudo completar la descarga inicial.'));
      const temp = `${destination}.download`;
      const request = https.get(url, { headers: { 'User-Agent': 'SAOViVO/0.1' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          return this.downloadFile(response.headers.location, destination, redirects + 1).then(resolve, reject);
        }
        if (response.statusCode !== 200) {
          response.resume();
          return reject(new Error('No se pudo descargar el componente de YouTube.'));
        }
        const file = fs.createWriteStream(temp);
        response.pipe(file);
        file.on('finish', () => file.close(async () => {
          try {
            await fsp.rename(temp, destination);
            resolve();
          } catch (error) { reject(error); }
        }));
        file.on('error', reject);
      });
      request.on('error', reject);
      request.setTimeout(30000, () => request.destroy(new Error('La descarga inicial tardó demasiado.')));
    });
  }

  validateYouTubeUrl(value) {
    let parsed;
    try { parsed = new URL(String(value || '').replace(/&amp;/gi, '&')); } catch { throw new Error('Pegá un link válido de YouTube.'); }
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const valid = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    if (!valid || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Por seguridad, la cola acepta solamente links de YouTube.');
    }
    return parsed.toString();
  }

  youtubeItem(entry, fallbackUrl) {
    if (!entry || !entry.id) return null;
    const directUrl = typeof entry.url === 'string' && entry.url.startsWith('http') ? entry.url : '';
    const width = Math.max(0, Number(entry.width) || 0);
    const height = Math.max(0, Number(entry.height) || 0);
    const aspectRatio = Number(entry.aspect_ratio) || (width && height ? width / height : 0);
    const sourceUrl = entry.webpage_url || directUrl || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : fallbackUrl);
    const isLive = Boolean(entry.is_live) || entry.live_status === 'is_live';
    const isShort = /youtube\.com\/shorts\//i.test(String(sourceUrl)) || /youtube\.com\/shorts\//i.test(String(fallbackUrl));
    const isVertical = Boolean((aspectRatio && aspectRatio < 1) || (width && height && height > width) || isShort);
    return {
      id: String(entry.id),
      sourceType: 'youtube',
      title: entry.title || 'Video sin título',
      duration: Math.max(0, Number(entry.duration) || 0),
      thumbnail: entry.thumbnail || entry.thumbnails?.at(-1)?.url || '',
      url: sourceUrl,
      width,
      height,
      aspectRatio,
      isShort,
      isVertical,
      isLive,
      liveStatus: entry.live_status || (isLive ? 'is_live' : 'not_live')
    };
  }

  classifyYouTubeError(detail, { playlist = false } = {}) {
    const text = String(detail || '');
    if (playlist && /private|sign in|login|members-only/i.test(text)) {
      return { code: 'PLAYLIST_PRIVATE', permanent: true, message: PRIVATE_ACCOUNT_PLAYLIST_MESSAGE };
    }
    if (/private|sign in|login|members-only/i.test(text)) {
      return { code: 'VIDEO_PRIVATE', permanent: true, message: 'El video es privado.' };
    }
    if (/deleted|removed|unavailable|copyright|blocked|not available/i.test(text)) {
      return { code: 'VIDEO_UNAVAILABLE', permanent: true, message: 'El video fue eliminado o no está disponible.' };
    }
    if (/network|timed out|timeout|connection|resolve|temporary|429|\b5\d\d\b/i.test(text)) {
      return { code: 'YOUTUBE_NETWORK', permanent: false, message: 'YouTube no respondió. Podés reintentar sin perder lo que ya se agregó.' };
    }
    return { code: 'YOUTUBE_TECHNICAL', permanent: false, message: 'YouTube no pudo procesar este contenido. Podés reintentar.' };
  }

  classifyPlaylistEntry(entry) {
    if (!entry) return { code: 'VIDEO_UNAVAILABLE', permanent: true, message: 'El video fue eliminado o no está disponible.' };
    const detail = [entry.availability, entry.title, entry.description, entry.live_status].filter(Boolean).join(' ');
    if (entry.availability === 'private' || /\[private video\]|private video/i.test(detail)) {
      return { code: 'VIDEO_PRIVATE', permanent: true, message: 'es privado' };
    }
    if (!entry.id || /\[deleted video\]|deleted video|removed|unavailable/i.test(detail)) {
      return { code: 'VIDEO_UNAVAILABLE', permanent: true, message: 'fue eliminado o no está disponible' };
    }
    return null;
  }

  async readSingleYouTube(url) {
    const source = this.sanitizeYouTubeUrl(url);
    this.logTechnical('YOUTUBE METADATA INICIO', JSON.stringify({ source }));
    let toolResult;
    try {
      toolResult = await this.run(this.ytDlpPath, [
        '--dump-single-json', '--skip-download', '--no-playlist', '--no-warnings', url
      ], { timeout: 90000, timeoutMessage: 'YouTube tardó demasiado en responder. Probá otra vez.' });
      let data;
      try { data = JSON.parse(toolResult.stdout); } catch { throw new Error('YouTube no devolvió información para ese video.'); }
      const item = this.youtubeItem(data, url);
      if (!item) throw new Error('Ese video fue eliminado o no está disponible.');
      this.logTechnical('YOUTUBE METADATA FIN', JSON.stringify({
        source, exitCode: toolResult.exitCode, stderr: toolResult.stderr || '', found: 1
      }, null, 2));
      return item;
    } catch (error) {
      this.logTechnical('YOUTUBE METADATA ERROR', JSON.stringify({
        source,
        exitCode: error.exitCode ?? toolResult?.exitCode ?? null,
        stderr: error.details || toolResult?.stderr || '',
        found: 0,
        error: error.message
      }, null, 2));
      throw error;
    }
  }

  async ingestYouTube(rawUrl, { knownIds = [] } = {}) {
    const url = this.validateYouTubeUrl(String(rawUrl || '').trim());
    const parsed = new URL(url);
    const playlistId = parsed.searchParams.get('list') || '';
    const videoId = parsed.searchParams.get('v') || (parsed.hostname.replace(/^www\./, '').toLowerCase() === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] : '');
    const privateAccountPlaylist = /^(LL|WL)$/i.test(playlistId);
    const known = new Set((knownIds || []).map(String));
    const summary = { added: 0, omitted: 0, pending: 0, playlist: Boolean(playlistId) };
    const safeSource = this.sanitizeYouTubeUrl(url);

    if (playlistId) this.logTechnical('YOUTUBE PLAYLIST INICIO', JSON.stringify({ source: safeSource, playlistId }));

    if (privateAccountPlaylist && !videoId) {
      this.emit('error', PRIVATE_ACCOUNT_PLAYLIST_MESSAGE, { errorCode: 'PLAYLIST_PRIVATE', source: 'youtube' });
      this.logTechnical('YOUTUBE PLAYLIST FIN', JSON.stringify({ source: safeSource, exitCode: 'not-started', found: 0, added: 0, omitted: 1, omissionReasons: ['PLAYLIST_PRIVATE'] }, null, 2));
      return { ...summary, omitted: 1, errorCode: 'PLAYLIST_PRIVATE' };
    }

    try {
      await this.ensureYouTubeRuntime();
    } catch (error) {
      this.logTechnical('YOUTUBE RUNTIME ERROR', JSON.stringify({ source: safeSource, exitCode: null, stderr: error.message }, null, 2));
      throw error;
    }

    if (privateAccountPlaylist && videoId) {
      const singleUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      try {
        const item = await this.readSingleYouTube(singleUrl);
        if (!known.has(item.id)) {
          this.emit('youtube-item', 'Video actual agregado y preparándose. No pudimos acceder al resto de “Vídeos que me gustan” porque es una playlist privada.', { item, position: 1, total: 1, source: 'youtube', errorCode: 'PLAYLIST_PRIVATE' });
          summary.added = 1;
        } else {
          this.emit('warning', 'El video actual ya estaba en la cola. No pudimos acceder al resto de “Vídeos que me gustan” porque es una playlist privada.', { source: 'youtube', errorCode: 'PLAYLIST_PRIVATE' });
        }
      } catch (error) {
        const classified = this.classifyYouTubeError(error.details || error.message);
        this.emit(classified.permanent ? 'error' : 'warning', `No se pudo rescatar el video individual. ${classified.message}`, { errorCode: classified.code, retryable: !classified.permanent, source: 'youtube' });
        summary.omitted = classified.permanent ? 1 : 0;
        summary.pending = classified.permanent ? 0 : 1;
      }
      this.logTechnical('YOUTUBE PLAYLIST FIN', JSON.stringify({
        source: safeSource, exitCode: summary.pending ? 'retryable-error' : 0, found: summary.added, ...summary,
        omissionReasons: ['PLAYLIST_PRIVATE_REST']
      }, null, 2));
      return summary;
    }

    if (!playlistId) {
      this.emit('info', 'Leyendo el video de YouTube…', { source: 'youtube' });
      try {
        const item = await this.readSingleYouTube(url);
        if (!known.has(item.id)) {
          this.emit('youtube-item', 'Video 1 agregado. Preparándolo para el vivo…', { item, position: 1, total: 1, source: 'youtube' });
          summary.added = 1;
        }
      } catch (error) {
        const classified = this.classifyYouTubeError(error.details || error.message);
        this.emit(classified.permanent ? 'error' : 'warning', classified.message, { errorCode: classified.code, retryable: !classified.permanent, source: 'youtube' });
        summary.omitted = classified.permanent ? 1 : 0;
        summary.pending = classified.permanent ? 0 : 1;
      }
      this.logTechnical('YOUTUBE INGESTA FIN', JSON.stringify({ source: safeSource, found: summary.added + summary.omitted, ...summary }, null, 2));
      return summary;
    }

    this.emit('info', 'Leyendo playlist…', { source: 'youtube' });
    let inspected = 0;
    let reportedTotal = 0;
    let toolResult;
    try {
      toolResult = await this.run(this.ytDlpPath, [
        '--flat-playlist', '--dump-json', '--yes-playlist', '--no-warnings', '--ignore-errors', url
      ], {
        timeout: 180000,
        timeoutMessage: 'YouTube tardó demasiado en leer la playlist. Podés reintentar.',
        onLine: (line) => {
          let entry;
          try { entry = JSON.parse(line); } catch { return; }
          inspected += 1;
          const position = Math.max(1, Number(entry.playlist_index) || inspected);
          reportedTotal = Math.max(reportedTotal, Number(entry.playlist_count) || Number(entry.n_entries) || position);
          this.emit('info', `Revisando ${position} de ${reportedTotal || '…'}…`, { source: 'youtube', position, total: reportedTotal || null });
          const unavailable = this.classifyPlaylistEntry(entry);
          if (unavailable) {
            summary.omitted += 1;
            this.logTechnical('YOUTUBE ITEM OMITIDO', JSON.stringify({ source: safeSource, position, code: unavailable.code, reason: unavailable.message }));
            this.emit('warning', `Video ${position} omitido: ${unavailable.message}. Seguimos con el resto.`, { errorCode: unavailable.code, source: 'youtube', position });
            return;
          }
          const item = this.youtubeItem(entry, url);
          if (!item || known.has(item.id)) return;
          known.add(item.id);
          summary.added += 1;
          this.emit('youtube-item', `Video ${position} agregado. Preparándolo para el vivo…`, { item, position, total: reportedTotal || null, source: 'youtube' });
        }
      });
    } catch (error) {
      const classified = this.classifyYouTubeError(error.details || error.message, { playlist: true });
      if (classified.permanent) summary.omitted += 1;
      else summary.pending += 1;
      this.logTechnical('YOUTUBE PLAYLIST ERROR', JSON.stringify({
        source: safeSource, exitCode: error.exitCode ?? null, stderr: error.details || '', found: inspected,
        added: summary.added, omitted: summary.omitted, reason: classified.code
      }, null, 2));
      this.emit(classified.permanent ? 'error' : 'warning', classified.message, { errorCode: classified.code, retryable: !classified.permanent, source: 'youtube' });
    }
    this.emit(summary.pending ? 'warning' : 'success', `Playlist lista: ${summary.added} agregados · ${summary.omitted} omitidos${summary.pending ? ` · ${summary.pending} pendiente para reintentar` : ''}.`, { source: 'youtube', summary });
    this.logTechnical('YOUTUBE PLAYLIST FIN', JSON.stringify({
      source: safeSource,
      exitCode: toolResult?.exitCode ?? (summary.pending ? 'retryable-error' : null),
      stderr: toolResult?.stderr || '',
      found: inspected,
      ...summary,
      reportedTotal
    }, null, 2));
    return summary;
  }

  async getMetadata(rawUrl) {
    const url = this.validateYouTubeUrl(rawUrl.trim());
    await this.ensureYouTubeRuntime();
    this.emit('info', 'Leyendo el link de YouTube…');
    const item = await this.readSingleYouTube(url);
    this.emit('success', 'Video agregado a la cola.');
    return [item];
  }

  localSourceError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.userMessage = message;
    return error;
  }

  async validateLocalFile(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!isSupportedLocalPath(resolved)) {
      throw this.localSourceError('LOCAL_UNSUPPORTED', 'Ese archivo no es MP4. Elegí un video MP4 para agregarlo a la cola.');
    }
    let stat;
    try { stat = await fsp.stat(resolved); }
    catch { throw this.localSourceError('LOCAL_MISSING', `No encuentro “${path.basename(resolved)}”. Volvé a seleccionarlo o quitá ese elemento.`); }
    if (!stat.isFile()) throw this.localSourceError('LOCAL_INVALID', 'La selección no corresponde a un archivo de video.');
    return resolved;
  }

  async getLocalMetadata(filePaths) {
    await this.ensureCoreRuntime();
    const items = [];
    for (const candidate of filePaths || []) {
      const localPath = await this.validateLocalFile(candidate);
      const media = await this.inspectMedia(localPath);
      if (!media.hasVideo || !media.duration) {
        throw this.localSourceError('LOCAL_INVALID', `“${path.basename(localPath)}” no contiene un video MP4 válido.`);
      }
      items.push({
        id: localItemId(localPath),
        sourceType: 'local',
        title: path.basename(localPath, path.extname(localPath)),
        duration: media.duration,
        thumbnail: '',
        localPath
      });
    }
    if (items.length) {
      this.logTechnical('ARCHIVOS LOCALES LEÍDOS', JSON.stringify(items.map(({ id, title, duration, localPath }) => ({ id, title, duration, localPath })), null, 2));
      this.emit('success', items.length === 1
        ? 'Archivo local agregado a la cola.'
        : `${items.length} archivos locales agregados en el orden mostrado por Windows.`);
    }
    return items;
  }

  run(command, args, { timeout = 0, onLine, timeoutMessage = 'El procesamiento del video tardó demasiado. Probá otra vez.' } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true });
      this.workers.add(child);
      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      let settled = false;
      let timer;
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (onLine) {
          lineBuffer += text;
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() || '';
          lines.filter(Boolean).forEach(onLine);
        } else stdout += text;
      });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-250000); });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        this.workers.delete(child);
        if (timer) clearTimeout(timer);
        error.details = error.details || error.message;
        error.exitCode = error.exitCode ?? null;
        reject(error);
      });
      child.on('close', (code) => {
        this.workers.delete(child);
        if (timer) clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (onLine && lineBuffer.trim()) onLine(lineBuffer.trim());
        if (code === 0) resolve({ stdout, stderr, exitCode: code });
        else {
          const error = new Error(this.friendlyToolError(stderr));
          error.details = stderr;
          error.exitCode = code;
          reject(error);
        }
      });
      if (timeout) timer = setTimeout(() => {
        child.kill();
        if (settled) return;
        settled = true;
        const error = new Error(timeoutMessage);
        error.details = timeoutMessage;
        error.exitCode = 'timeout';
        reject(error);
      }, timeout);
    });
  }

  friendlyToolError(stderr) {
    return this.classifyYouTubeError(stderr).message;
  }

  async start({ queue, streamKey, loop }) {
    if (this.isStreaming) return { ok: true };
    if (!Array.isArray(queue) || !queue.length) throw new Error('Agregá al menos un video antes de empezar.');
    if (!streamKey || streamKey.trim().length < 8) throw new Error('Guardá tu stream key de YouTube en Configuración.');
    await this.ensureCoreRuntime();
    const generation = ++this.sessionGeneration;
    this.queue = queue.map((item) => ({ ...item }));
    this.loop = Boolean(loop);
    this.streamKey = streamKey.trim();
    this.totalDuration = queue.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    this.stopping = false;
    this.retryCount = 0;
    this.lastTotalElapsed = 0;
    this.loopStopAt = this.loop ? null : this.totalDuration;
    this.loopEnding = false;
    this.finishedGeneration = null;
    this.stopPromise = null;
    this.activeIndex = -1;
    this.activeItemId = null;
    this.playbackOffset = 0;
    this.playbackToken += 1;
    this.liveRetryCount = 0;
    this.preResolvedSources.clear();
    this.sourcePrearmPromises.clear();
    this.startSessionLog();
    this.logActionRequested('START STREAM', { origin: 'user', transitionReason: 'manual_start' });
    const allPreparation = this.prepare(this.queue);
    const bufferItems = this.queue.slice(0, Math.min(3, this.queue.length));
    const prepared = await Promise.all(bufferItems.map((item, index) => this.enqueuePreparation(item, index, this.queue.length)));
    if (generation !== this.sessionGeneration || this.stopping) throw new Error('El inicio fue cancelado.');
    const failed = prepared.filter((result) => !result.ready);
    if (failed.length) {
      this.logActionCompleted('START STREAM', {
        origin: 'user', result: 'rejected', transitionReason: 'source_error', failedItemIds: failed.map((item) => item.id)
      });
      throw new Error('Uno de los primeros videos no está listo. Usá “Reintentar” o quitá ese video para comenzar.');
    }
    allPreparation.then((results) => {
      const backgroundFailures = results.filter((result) => !result.ready);
      if (backgroundFailures.length) this.logTechnical('Preparación en segundo plano incompleta', `${backgroundFailures.length} videos fallaron.`);
    }).catch((error) => this.logTechnical('Preparación en segundo plano interrumpida', error.stack || error.message));
    this.isStreaming = true;
    if (this.powerBlockerId === null) this.powerBlockerId = this.powerManager.start('prevent-app-suspension');
    const launched = this.launchFfmpeg(generation);
    this.logActionCompleted('START STREAM', {
      origin: 'user', result: launched ? 'accepted' : 'rejected', transitionReason: launched ? 'manual_start' : 'source_error'
    });
    return { ok: true };
  }

  prepare(items) {
    return Promise.all(items.map((item, index) => this.enqueuePreparation(item, index, items.length)));
  }

  enqueuePreparation(item, index = 0, total = 1) {
    if (this.shuttingDown) return Promise.resolve({ id: item.id, ready: false, error: 'La aplicación se está cerrando.' });
    if (item.isLive) {
      this.emit('prepare', `YouTube Live listo para su turno: ${item.title}`, { status: 'ready', itemId: item.id, live: true, cached: true });
      return Promise.resolve({ id: item.id, ready: true, live: true });
    }
    const normalized = this.normalizedPath(item);
    if (fs.existsSync(normalized)) {
      this.emit('prepare', `Listo: ${item.title}`, { status: 'ready', itemId: item.id, cached: true });
      return Promise.resolve({ id: item.id, ready: true, file: normalized });
    }
    if (this.preparationById.has(item.id)) return this.preparationById.get(item.id);
    const task = this.preparationChain.then(() => this.prepareOne(item, index, total));
    this.preparationChain = task.catch(() => {});
    this.preparationById.set(item.id, task);
    task.finally(() => this.preparationById.delete(item.id)).catch(() => {});
    return task;
  }

  async prepareOne(item, index, total) {
    if (this.shuttingDown) return { id: item.id, ready: false, error: 'Cierre en curso.', errorCode: 'SHUTDOWN' };
    await this.ensureCoreRuntime();
    const sourceType = sourceTypeOf(item);
    this.logTechnical('PREPARACIÓN INICIADA', `${index + 1}/${total} [${sourceType}] ${item.id} ${item.title}`);
    if (item.isLive) {
      this.logTechnical('YOUTUBE LIVE LISTO', `${item.id} ${item.title}. La fuente se resolverá al llegar su turno.`);
      this.emit('prepare', `YouTube Live listo para su turno: ${item.title}`, { status: 'ready', itemId: item.id, live: true });
      return { id: item.id, ready: true, live: true };
    }
    this.emit('prepare', `Preparando ${index + 1} de ${total}: ${item.title}`, { status: 'preparing', itemId: item.id });
    try {
      const file = await this.resolveSource(item);
      this.logTechnical('PREPARACIÓN COMPLETA', `${item.id} ${item.title} -> ${file}`);
      this.emit('prepare', `Video listo: ${item.title}`, { status: 'ready', itemId: item.id });
      return { id: item.id, ready: true, file };
    } catch (error) {
      if (this.shuttingDown) return { id: item.id, ready: false, error: 'Cierre en curso.', errorCode: 'SHUTDOWN' };
      this.logTechnical(`Preparación fallida: ${item.id} ${item.title}`, error.details || error.stack || error.message);
      const message = error.userMessage || `No se pudo preparar “${item.title}”. Usá Reintentar en la cola; si vuelve a fallar, quitá ese video.`;
      this.emit('prepare', message, { status: 'error', itemId: item.id, errorCode: error.code || 'PREPARE_FAILED', permanent: Boolean(error.permanent), retryable: !error.permanent });
      return { id: item.id, ready: false, error: message, errorCode: error.code || 'PREPARE_FAILED', permanent: Boolean(error.permanent) };
    }
  }

  async resolveSource(item) {
    if (sourceTypeOf(item) === 'local') return this.prepareLocalVideo(item);
    return this.downloadVideo(item);
  }

  normalizedPath(item) {
    const safeId = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.mediaPath, `${safeId}.stream-v3.mp4`);
  }

  async downloadVideo(item) {
    await this.ensureYouTubeRuntime();
    const safeId = String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const normalized = this.normalizedPath(item);
    if (fs.existsSync(normalized)) return normalized;

    const output = path.join(this.mediaPath, `${safeId}.source.%(ext)s`);
    let downloadProgress = 0;
    try {
      await this.run(this.ytDlpPath, [
        '--no-playlist', '--newline', '--no-warnings',
        '--ffmpeg-location', this.ffmpegPath,
        '-f', 'bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/b[vcodec^=avc1][height<=720]/b[height<=720]',
        '--merge-output-format', 'mp4', '--remux-video', 'mp4',
        '-o', output, item.url
      ], {
        timeout: 60 * 60 * 1000,
        timeoutMessage: 'La descarga desde YouTube tardó demasiado. Probá otra vez.',
        onLine: (line) => {
          const match = line.match(/\[download\]\s+([\d.]+)%/i);
          if (match) {
            downloadProgress = Math.max(downloadProgress, Math.min(70, Number(match[1]) * .7));
            this.notify({ type: 'prepare-progress', status: 'preparing', phase: 'downloading', itemId: item.id, progress: downloadProgress });
          }
        }
      });
    } catch (error) {
      this.logTechnical(`Descarga fallida: ${item.id} ${item.title}`, error.details || error.stack || error.message);
      error.details = error.details || error.message;
      const classified = this.classifyYouTubeError(error.details);
      error.code = classified.code;
      error.userMessage = classified.message;
      error.permanent = classified.permanent;
      throw error;
    }
    const rawName = (await fsp.readdir(this.mediaPath)).find((name) =>
      name.startsWith(`${safeId}.source.`) && !name.endsWith('.part') && !/\.f\d+\./i.test(name)
    );
    if (!rawName) {
      const error = new Error(`No se pudo unir el audio y el video de “${item.title}”.`);
      error.details = 'yt-dlp terminó sin crear un archivo source unido.';
      throw error;
    }
    const rawPath = path.join(this.mediaPath, rawName);
    const media = await this.inspectMedia(rawPath);
    if (media.videoH264 && media.audioAac && media.width === 1280 && media.height === 720 && Math.abs(media.frameRate - 30) < 0.1) {
      await fsp.rename(rawPath, normalized);
    } else {
      this.emit('prepare', `Ajustando el formato de video: ${item.title}`, { status: 'preparing', itemId: item.id, phase: 'adjusting' });
      await this.normalizeVideo(rawPath, normalized, item, media.hasAudio, 70);
      await fsp.unlink(rawPath).catch(() => {});
    }
    const obsolete = (await fsp.readdir(this.mediaPath)).filter((name) =>
      name === `${safeId}.stream.mp4` || name === `${safeId}.stream-v2.mp4` || name.startsWith(`${safeId}.raw.`)
    );
    await Promise.all(obsolete.map((name) => fsp.unlink(path.join(this.mediaPath, name)).catch(() => {})));
    return normalized;
  }

  async prepareLocalVideo(item) {
    const localPath = await this.validateLocalFile(item.localPath);
    const normalized = this.normalizedPath(item);
    if (fs.existsSync(normalized)) return normalized;
    const media = await this.inspectMedia(localPath);
    if (this.shuttingDown) throw this.localSourceError('SHUTDOWN', 'Cierre en curso.');
    if (!media.hasVideo) {
      throw this.localSourceError('LOCAL_INVALID', `“${path.basename(localPath)}” no contiene una pista de video válida.`);
    }
    this.emit('prepare', `Ajustando el archivo local: ${item.title}`, { status: 'preparing', itemId: item.id, phase: 'adjusting' });
    await this.normalizeVideo(localPath, normalized, item, media.hasAudio, 0);
    return normalized;
  }

  inspectMedia(file) {
    if (this.shuttingDown) return Promise.resolve({ hasVideo: false, hasAudio: false, videoH264: false, audioAac: false, width: 0, height: 0, frameRate: 0, duration: 0 });
    return new Promise((resolve) => {
      const child = spawn(this.ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
      this.workers.add(child);
      let output = '';
      let settled = false;
      const finish = (fallback = false) => {
        if (settled) return;
        settled = true;
        this.workers.delete(child);
        const durationMatch = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/i);
        const duration = durationMatch
          ? Math.max(0, Math.round(Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])))
          : 0;
        const dimensions = output.match(/Video:\s*[^\r\n]*?\b(\d{2,5})x(\d{2,5})\b/i);
        const frameRate = output.match(/(?:,|\s)([\d.]+)\s+fps\b/i);
        resolve({
          hasVideo: !fallback && /Video:/i.test(output),
          hasAudio: !fallback && /Audio:/i.test(output),
          videoH264: !fallback && /Video:\s*h264/i.test(output),
          audioAac: !fallback && /Audio:\s*aac/i.test(output),
          width: dimensions ? Number(dimensions[1]) : 0,
          height: dimensions ? Number(dimensions[2]) : 0,
          frameRate: frameRate ? Number(frameRate[1]) : 0,
          duration
        });
      };
      child.stderr.on('data', (chunk) => { output += chunk.toString(); });
      child.on('error', () => finish(true));
      child.on('close', () => finish(false));
    });
  }

  async normalizeVideo(input, output, item, knownHasAudio, startProgress = 0) {
    if (this.shuttingDown) throw this.localSourceError('SHUTDOWN', 'Cierre en curso.');
    const title = item?.title || 'video';
    const itemId = item?.id || '';
    const duration = Math.max(0, Number(item?.duration) || 0);
    const temp = `${output}.part.mp4`;
    const hasAudio = typeof knownHasAudio === 'boolean' ? knownHasAudio : (await this.inspectMedia(input)).hasAudio;
    const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', input];
    if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    args.push('-map', '0:v:0', '-map', hasAudio ? '0:a:0' : '1:a:0');
    args.push(
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '4000k', '-maxrate', '4500k', '-bufsize', '9000k',
      '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-af', 'aresample=async=1:first_pts=0',
      '-movflags', '+faststart'
    );
    if (!hasAudio) args.push('-shortest');
    args.push('-progress', 'pipe:1', '-nostats', temp);
    let lastProgress = Math.max(0, Math.min(99, startProgress));
    if (itemId) this.notify({ type: 'prepare-progress', status: 'preparing', phase: 'adjusting', itemId, progress: lastProgress });
    try {
      await this.run(this.ffmpegPath, args, {
        timeout: 12 * 60 * 60 * 1000,
        onLine: (line) => {
          if (!itemId || !duration) return;
          const match = line.match(/^out_time_(?:us|ms)=(\d+)/i);
          if (!match) return;
          const fraction = Math.max(0, Math.min(1, Number(match[1]) / 1_000_000 / duration));
          const progress = Math.min(99, startProgress + fraction * (99 - startProgress));
          if (progress < lastProgress + .2) return;
          lastProgress = progress;
          this.notify({ type: 'prepare-progress', status: 'preparing', phase: 'adjusting', itemId, progress });
        }
      });
      await fsp.rename(temp, output);
    } catch (error) {
      await fsp.unlink(temp).catch(() => {});
      const wrapped = new Error(`No se pudo ajustar “${title}” para el vivo.`);
      wrapped.details = error.details || error.stack || error.message;
      throw wrapped;
    }
  }

  async writeConcat(files) {
    const escape = (value) => value.replace(/'/g, "'\\''");
    const body = files.map((file) => `file '${escape(file.replace(/\\/g, '/'))}'`).join('\n');
    this.concatPath = path.join(this.basePath, 'current-queue.txt');
    await fsp.writeFile(this.concatPath, `${body}\n`, 'utf8');
  }

  launchFfmpeg(generation = this.sessionGeneration) {
    if (this.stopping || !this.isStreaming || generation !== this.sessionGeneration) return false;
    const args = [
      '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts+igndts+discardcorrupt',
      '-f', 'mpegts', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0',
      '-vf', 'setpts=N/(30*TB),fps=30,format=yuv420p',
      '-af', 'asetpts=N/SR/TB,aresample=async=1:first_pts=0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-b:v', '4000k', '-minrate', '4000k', '-maxrate', '4000k', '-bufsize', '8000k', '-x264-params', 'nal-hrd=cbr:force-cfr=1',
      '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2',
      '-progress', 'pipe:1', '-nostats', '-flush_packets', '1', '-flvflags', 'no_duration_filesize',
      '-f', 'flv', this.streamTargetOverride || `${RTMP_URL}/${this.streamKey}`
    ];
    this.progressBuffer = '';
    this.liveConfirmed = false;
    this.publisherMetrics = {};
    this.lastPublisherProgressAt = 0;
    this.lastPublisherOutTime = 0;
    this.lastPublisherHealthLogAt = Date.now();
    this.publisherStallLogged = false;
    const publisher = spawn(this.ffmpegPath, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.ffmpeg = publisher;
    this.emit('connecting', 'Conectando con YouTube…');
    publisher.stdout.on('data', (chunk) => this.handleProgress(chunk.toString(), generation));
    publisher.stdin.on('error', () => {});
    let stderr = '';
    publisher.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-12000);
      this.logFfmpeg(text);
    });
    let handled = false;
    const finalize = (code, detail) => {
      if (handled) return;
      handled = true;
      this.handleFfmpegExit(code, detail, generation, publisher);
    };
    publisher.on('error', (error) => finalize(-1, error.message));
    publisher.on('close', (code) => finalize(code, stderr));
    this.startPublisherHealthMonitor(generation);
    const startIndex = this.activeIndex >= 0 ? this.activeIndex : 0;
    this.startPlaybackAt(startIndex, generation).catch((error) => {
      if (generation === this.sessionGeneration && !this.stopping) {
        this.logTechnical('PLAYOUT NO INICIADO', error.stack || error.message);
        this.stop('No se pudo iniciar el reproductor de la cola.', 'error', { origin: 'system', reason: 'source_error' });
      }
    });
    return true;
  }

  async resolveLivePlaybackUrl(item) {
    await this.ensureYouTubeRuntime();
    const { stdout } = await this.run(this.ytDlpPath, [
      '--no-playlist', '--no-warnings', '-g', '-f', 'b[height<=720]/best[height<=720]/best', item.url
    ], { timeout: 90000, timeoutMessage: 'YouTube tardó demasiado en abrir el video en vivo.' });
    const liveUrl = stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => /^https?:\/\//i.test(line));
    if (!liveUrl) throw new Error('YouTube no devolvió una fuente reproducible para este vivo.');
    return liveUrl;
  }

  playbackElapsed() {
    return this.playbackStartedAt ? Math.max(0, (Date.now() - this.playbackStartedAt) / 1000) : 0;
  }

  startProgressClock(generation, token) {
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => {
      if (generation !== this.sessionGeneration || token !== this.playbackToken || this.stopping) return;
      const elapsed = this.playbackElapsed();
      this.lastTotalElapsed = this.playbackOffset + elapsed;
      this.notify({ type: 'progress', activeIndex: this.activeIndex, activeItemId: this.activeItemId, elapsed, totalElapsed: this.lastTotalElapsed, liveSource: Boolean(this.queue[this.activeIndex]?.isLive) });
      const active = this.queue[this.activeIndex];
      const remaining = active && !active.isLive ? Number(active.duration) - elapsed : Infinity;
      if (remaining <= 12) this.preResolveNextPlayback(generation).catch(() => {});
      if (remaining <= .4) this.prearmNextPlayback(generation).catch(() => {});
    }, 100);
  }

  playbackIndexAfter(index) {
    if (!this.queue.length) return -1;
    const next = index + 1;
    if (next < this.queue.length) return next;
    return this.loop ? 0 : -1;
  }

  waitForPlaybackReadable(candidate, timeout = 30000) {
    if (candidate.worker.stdout.readableLength > 0) return Promise.resolve(candidate);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        candidate.worker.stdout.off('readable', ready);
        candidate.worker.off('close', closed);
        candidate.worker.off('error', failed);
        if (error) reject(error);
        else resolve(candidate);
      };
      const ready = () => finish();
      const closed = (code) => finish(new Error(`El reproductor terminó antes de entregar video (código ${code}).`));
      const failed = (error) => finish(error);
      const timer = setTimeout(() => finish(new Error('La fuente tardó demasiado en entregar el primer cuadro.')), timeout);
      candidate.worker.stdout.once('readable', ready);
      candidate.worker.once('close', closed);
      candidate.worker.once('error', failed);
    });
  }

  async resolvePlaybackSource(index, generation = this.sessionGeneration) {
    if (!this.queue.length) return null;
    const normalizedIndex = Math.max(0, Math.min(index, this.queue.length - 1));
    const item = this.queue[normalizedIndex];
    const cached = this.preResolvedSources.get(item.id);
    if (cached?.generation === generation) return { item, index: normalizedIndex, source: cached.source };
    if (this.sourcePrearmPromises.has(item.id)) return this.sourcePrearmPromises.get(item.id);
    const task = (async () => {
      let source;
      if (item.isLive) source = await this.resolveLivePlaybackUrl(item);
      else {
        const prepared = await this.enqueuePreparation(item, normalizedIndex, this.queue.length);
        if (!prepared.ready) {
          const error = new Error(`“${item.title}” no está listo para reproducirse.`);
          error.code = prepared.errorCode || 'PLAYBACK_NOT_READY';
          throw error;
        }
        source = prepared.file;
      }
      if (generation !== this.sessionGeneration || this.stopping) return null;
      this.preResolvedSources.set(item.id, { source, generation });
      return { item, index: normalizedIndex, source };
    })().finally(() => {
      if (this.sourcePrearmPromises.get(item.id) === task) this.sourcePrearmPromises.delete(item.id);
    });
    this.sourcePrearmPromises.set(item.id, task);
    return task;
  }

  async preResolveNextPlayback(generation = this.sessionGeneration) {
    if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return null;
    const currentIndex = this.queue.findIndex((item) => item.id === this.activeItemId);
    const nextIndex = this.playbackIndexAfter(currentIndex);
    if (nextIndex < 0) return null;
    const target = this.queue[nextIndex];
    if (this.preResolvedSources.get(target.id)?.generation === generation) return this.preResolvedSources.get(target.id);
    if (!this.sourcePrearmPromises.has(target.id)) {
      this.logTechnical('RESOLVIENDO PRÓXIMA FUENTE', JSON.stringify({ fromItemId: this.activeItemId, toItemId: target.id, toIndex: nextIndex }));
    }
    try {
      const resolved = await this.resolvePlaybackSource(nextIndex, generation);
      if (resolved) this.logTechnical('PRÓXIMA FUENTE RESUELTA', JSON.stringify({ itemId: target.id, index: nextIndex }));
      return resolved;
    } catch (error) {
      this.logTechnical('PRÓXIMA FUENTE NO PUDO RESOLVERSE', JSON.stringify({ itemId: target.id, message: error.message }));
      return null;
    }
  }

  async createPlaybackCandidate(index, generation = this.sessionGeneration) {
    if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return;
    if (!this.ffmpeg?.stdin || this.ffmpeg.stdin.destroyed) return;
    if (!this.queue.length) return null;
    const normalizedIndex = Math.max(0, Math.min(index, this.queue.length - 1));
    const resolved = await this.resolvePlaybackSource(normalizedIndex, generation);
    if (!resolved) return null;
    const { item, source } = resolved;
    this.preResolvedSources.delete(item.id);
    if (generation !== this.sessionGeneration || this.stopping) return null;

    const args = ['-hide_banner', '-loglevel', 'warning'];
    if (!item.isLive || !/^https?:\/\//i.test(String(source))) args.push('-re');
    else {
      args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    }
    args.push('-i', source, '-map', '0:v:0', '-map', '0:a:0?');
    if (item.isLive) {
      args.push(
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', '4000k', '-maxrate', '4500k', '-bufsize', '9000k',
        '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2'
      );
    } else args.push('-c', 'copy');
    args.push('-mpegts_flags', '+resend_headers+initial_discontinuity', '-muxdelay', '0', '-f', 'mpegts', 'pipe:1');

    const worker = spawn(this.ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.workers.add(worker);
    const candidate = { worker, item, index: normalizedIndex, generation, stderr: '', activated: false, closed: false };
    worker.stdout.on('error', () => {});
    worker.stderr.on('data', (chunk) => { candidate.stderr = (candidate.stderr + chunk.toString()).slice(-12000); });
    worker.on('error', (error) => this.logTechnical('ERROR DE REPRODUCCIÓN', JSON.stringify({ itemId: item.id, message: error.message })));
    worker.on('close', (code) => { candidate.closed = true; candidate.closeCode = code; });
    try {
      await this.waitForPlaybackReadable(candidate);
    } catch (error) {
      await this.terminateWorkerTree(worker);
      this.workers.delete(worker);
      throw error;
    }
    if (candidate.closed || generation !== this.sessionGeneration || this.stopping) {
      await this.terminateWorkerTree(worker);
      this.workers.delete(worker);
      return null;
    }
    return candidate;
  }

  async cancelPrearmedPlayback(reason = 'queue_changed') {
    this.prearmRequestId += 1;
    const candidate = this.prearmedPlayback;
    this.prearmedPlayback = null;
    this.prearmPromise = null;
    this.prearmTargetId = null;
    if (!candidate?.worker) return;
    this.logTechnical('FUENTE PREPARADA DESCARTADA', JSON.stringify({ itemId: candidate.item.id, reason }));
    await this.terminateWorkerTree(candidate.worker);
    this.workers.delete(candidate.worker);
  }

  async prearmNextPlayback(generation = this.sessionGeneration) {
    if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming || this.prearmPromise || this.prearmedPlayback) return;
    const currentIndex = this.queue.findIndex((item) => item.id === this.activeItemId);
    const nextIndex = this.playbackIndexAfter(currentIndex);
    if (nextIndex < 0) return;
    const target = this.queue[nextIndex];
    const requestId = ++this.prearmRequestId;
    this.prearmTargetId = target.id;
    this.logTechnical('PREPARANDO PRÓXIMA FUENTE', JSON.stringify({ fromItemId: this.activeItemId, toItemId: target.id, toIndex: nextIndex }));
    this.prearmPromise = this.createPlaybackCandidate(nextIndex, generation)
      .then((candidate) => {
        if (requestId === this.prearmRequestId) this.prearmPromise = null;
        if (!candidate) {
          if (requestId === this.prearmRequestId) this.prearmTargetId = null;
          return null;
        }
        const stillTarget = requestId === this.prearmRequestId && generation === this.sessionGeneration && !this.stopping && this.queue[nextIndex]?.id === target.id;
        if (!stillTarget) {
          this.terminateWorkerTree(candidate.worker).catch(() => {});
          this.workers.delete(candidate.worker);
          return null;
        }
        this.prearmedPlayback = candidate;
        this.logTechnical('PRÓXIMA FUENTE LISTA', JSON.stringify({ itemId: target.id, index: nextIndex }));
        return candidate;
      })
      .catch((error) => {
        if (requestId === this.prearmRequestId) {
          this.prearmPromise = null;
          this.prearmTargetId = null;
        }
        this.logTechnical('PRÓXIMA FUENTE NO PUDO PREPARARSE', JSON.stringify({ itemId: target.id, message: error.message }));
        return null;
      });
    return this.prearmPromise;
  }

  async activatePlaybackCandidate(candidate, generation = this.sessionGeneration, transitionReason = 'natural_end') {
    if (!candidate || candidate.closed || generation !== this.sessionGeneration || this.stopping || !this.ffmpeg?.stdin || this.ffmpeg.stdin.destroyed) return false;
    const { worker, item, index: normalizedIndex } = candidate;
    const previousWorker = this.playbackWorker;
    const previousItemId = this.activeItemId;
    const previousElapsed = this.playbackElapsed();
    const token = ++this.playbackToken;
    if (previousWorker && previousWorker !== worker) {
      try { previousWorker.stdout.unpipe(this.ffmpeg.stdin); } catch {}
      this.playbackOffset += previousElapsed;
      this.playbackStartedAt = 0;
    }
    candidate.activated = true;
    this.playbackWorker = worker;
    this.activeIndex = normalizedIndex;
    if (this.activeItemId !== item.id) this.liveRetryCount = 0;
    this.activeItemId = item.id;
    this.playbackStartedAt = Date.now();
    this.lastLoggedVideo = normalizedIndex;
    this.logTechnical('VIDEO ACTIVO', `${normalizedIndex + 1}/${this.queue.length} ${item.isLive ? '[YOUTUBE LIVE] ' : ''}${item.title}`);
    this.notify({ type: 'progress', activeIndex: normalizedIndex, activeItemId: item.id, elapsed: 0, totalElapsed: this.playbackOffset, liveSource: Boolean(item.isLive) });
    if (item.isLive) {
      this.emit('warning', 'Comenzó un video de YouTube en vivo. La cola continuará cuando termine el vivo o cuando elijas SIGUIENTE.', { attention: 'live-source', itemId: item.id });
    } else this.emit('attention-clear', '', { attention: 'clear' });
    this.startProgressClock(generation, token);
    worker.stdout.pipe(this.ffmpeg.stdin, { end: false });
    worker.on('close', (code) => {
      this.workers.delete(worker);
      if (this.playbackWorker === worker) this.playbackWorker = null;
      if (generation !== this.sessionGeneration || token !== this.playbackToken || this.stopping) return;
      if (this.progressTimer) clearInterval(this.progressTimer);
      this.progressTimer = null;
      const playedSeconds = this.playbackElapsed();
      this.playbackOffset += !item.isLive && code === 0 ? Math.max(playedSeconds, Number(item.duration) || 0) : playedSeconds;
      this.playbackStartedAt = 0;
      if (code && code !== 0) this.logTechnical(`REPRODUCTOR FINALIZÓ (código ${code})`, candidate.stderr);
      this.handlePlaybackCompletion(item, generation, code !== 0, playedSeconds).catch((error) => this.stop(error.message, 'error', { origin: 'system', reason: 'source_error' }));
    });
    if (previousWorker && previousWorker !== worker) {
      this.terminateWorkerTree(previousWorker).catch(() => {});
      this.workers.delete(previousWorker);
    }
    this.logTechnical('TRANSICIÓN DE FUENTE', JSON.stringify({
      transitionReason,
      fromItemId: previousItemId || null,
      toItemId: item.id,
      toIndex: normalizedIndex,
      previousPlayedSeconds: Number(previousElapsed.toFixed(3)),
      publisherOutTime: Number((this.lastPublisherOutTime || 0).toFixed(3))
    }, null, 2));
    return true;
  }

  async startPlaybackAt(index, generation = this.sessionGeneration, { transitionReason = 'natural_end' } = {}) {
    if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return false;
    if (!this.ffmpeg?.stdin || this.ffmpeg.stdin.destroyed) return false;
    if (!this.queue.length) return this.stop('La cola quedó vacía y el vivo terminó.', 'success', { origin: 'system', reason: 'automatic_stop' });
    const normalizedIndex = Math.max(0, Math.min(index, this.queue.length - 1));
    const item = this.queue[normalizedIndex];
    const requestId = ++this.switchRequestId;
    let candidate = null;
    if (this.prearmTargetId === item.id && this.prearmPromise) await this.prearmPromise;
    if (this.prearmedPlayback?.item.id === item.id) {
      candidate = this.prearmedPlayback;
      this.prearmedPlayback = null;
      this.prearmTargetId = null;
    } else {
      if (this.prearmedPlayback) await this.cancelPrearmedPlayback('different_target');
      candidate = await this.createPlaybackCandidate(normalizedIndex, generation);
    }
    if (!candidate || requestId !== this.switchRequestId || generation !== this.sessionGeneration || this.stopping) {
      if (candidate?.worker && !candidate.activated) await this.terminateWorkerTree(candidate.worker);
      return false;
    }
    return this.activatePlaybackCandidate(candidate, generation, transitionReason);
  }

  async handlePlaybackCompletion(item, generation, failed, playedSeconds = 0) {
    if (generation !== this.sessionGeneration || this.stopping) return;
    if (item.isLive && failed) {
      let stillLive = true;
      try {
        const metadata = await this.readSingleYouTube(item.url);
        stillLive = metadata.isLive;
      } catch (error) {
        this.logTechnical('YOUTUBE LIVE ESTADO INCIERTO', error.details || error.message);
      }
      if (stillLive) {
        this.liveRetryCount += 1;
        const wait = Math.min(30, 3 + this.liveRetryCount * 2);
        this.emit('warning', `Se interrumpió el video de YouTube en vivo. Reintentamos en ${wait} segundos; la cola queda esperando.`, { attention: 'danger' });
        this.liveRetryTimer = setTimeout(() => {
          this.liveRetryTimer = null;
          if (generation === this.sessionGeneration && !this.stopping) this.startPlaybackAt(this.queue.findIndex((queued) => queued.id === item.id), generation, { transitionReason: 'source_error' }).catch((error) => this.stop(error.message, 'error', { origin: 'system', reason: 'source_error' }));
        }, wait * 1000);
        return;
      }
      this.emit('success', 'El video de YouTube en vivo terminó. Seguimos con el próximo de la cola.', { attention: 'clear' });
      return this.advancePlayback(item.id, generation, { reason: 'live_ended', playedSeconds });
    }
    if (item.isLive) this.emit('success', 'El video de YouTube en vivo terminó. Seguimos con el próximo de la cola.', { attention: 'clear' });
    return this.advancePlayback(item.id, generation, { failed, playedSeconds, reason: item.isLive ? 'live_ended' : failed ? 'source_error' : 'natural_end' });
  }

  async advancePlayback(previousItemId, generation = this.sessionGeneration, { failed = false, playedSeconds = 0, reason = failed ? 'source_error' : 'natural_end' } = {}) {
    if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return;
    let currentIndex = this.queue.findIndex((item) => item.id === previousItemId);
    if (currentIndex < 0) currentIndex = -1;
    let nextIndex = currentIndex + 1;
    if (nextIndex >= this.queue.length) {
      if (!this.loop) return this.stop('La cola terminó y el vivo se cerró correctamente.', 'success', { origin: 'system', reason: 'automatic_stop' });
      nextIndex = 0;
      reason = 'loop_restart';
    }
    if (failed) this.emit('warning', 'El video actual se interrumpió. Seguimos con el próximo de la cola.', { attention: 'danger' });
    this.logActionRequested('ADVANCE', { origin: 'system', fromItemId: previousItemId, toItemId: this.queue[nextIndex]?.id || null, playedSeconds: Number(playedSeconds.toFixed(3)), transitionReason: reason });
    try {
      const accepted = await this.startPlaybackAt(nextIndex, generation, { transitionReason: reason });
      this.logActionCompleted('ADVANCE', { origin: 'system', result: accepted ? 'accepted' : 'rejected', fromItemId: previousItemId, toItemId: this.queue[nextIndex]?.id || null, toIndex: nextIndex, playedSeconds: Number(playedSeconds.toFixed(3)), transitionReason: reason });
      return accepted;
    } catch (error) {
      this.logActionCompleted('ADVANCE', {
        origin: 'system', result: 'rejected', fromItemId: previousItemId, toItemId: this.queue[nextIndex]?.id || null,
        toIndex: nextIndex, playedSeconds: Number(playedSeconds.toFixed(3)),
        transitionReason: error.code === 'PLAYBACK_NOT_READY' ? 'source_unavailable' : 'source_error', error: error.message
      });
      throw error;
    }
  }

  async stopPlaybackWorker() {
    const worker = this.playbackWorker;
    this.playbackToken += 1;
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.progressTimer = null;
    if (!worker) return;
    try { worker.stdout?.unpipe(this.ffmpeg?.stdin); } catch {}
    this.playbackOffset += this.playbackElapsed();
    this.playbackStartedAt = 0;
    this.playbackWorker = null;
    await this.terminateWorkerTree(worker);
    this.workers.delete(worker);
  }

  async stopPublisherGracefully(publisher) {
    if (!publisher) return;
    if (typeof publisher.once !== 'function') return this.terminateWorkerTree(publisher);
    let closed = publisher.exitCode !== null || Boolean(publisher.signalCode);
    const closePromise = new Promise((resolve) => {
      if (closed) return resolve(true);
      const finish = () => { closed = true; resolve(true); };
      publisher.once('close', finish);
      publisher.once('error', finish);
    });
    try { publisher.stdin?.end(); } catch {}
    let timeoutId;
    await Promise.race([
      closePromise,
      new Promise((resolve) => { timeoutId = setTimeout(resolve, 5000); })
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    if (!closed) await this.terminateWorkerTree(publisher);
  }

  async navigate(direction) {
    if (!this.isStreaming || this.stopping || !this.queue.length) return { ok: false };
    if (this.liveRetryTimer) clearTimeout(this.liveRetryTimer);
    this.liveRetryTimer = null;
    const currentIndex = this.queue.findIndex((item) => item.id === this.activeItemId);
    let target = Math.max(0, currentIndex);
    if (direction === 'next') target += 1;
    else target -= 1;
    if (target >= this.queue.length) target = this.loop ? 0 : this.queue.length - 1;
    if (target < 0) target = this.loop ? this.queue.length - 1 : 0;
    if (target === currentIndex && this.queue.length === 1) return { ok: true, activeIndex: currentIndex };
    const action = direction === 'next' ? 'NEXT' : 'PREVIOUS';
    const transitionReason = direction === 'next' ? 'manual_next' : 'manual_previous';
    const fromItemId = this.activeItemId;
    const toItemId = this.queue[target]?.id || null;
    const title = this.queue[target]?.title || 'siguiente video';
    this.logActionRequested(action, { origin: 'user', fromItemId, fromIndex: currentIndex, toItemId, toIndex: target, transitionReason });
    this.emit('info', `${direction === 'next' ? 'Avanzando' : 'Volviendo'} a “${title}”…`);
    try {
      const accepted = await this.startPlaybackAt(target, this.sessionGeneration, { transitionReason });
      this.logActionCompleted(action, { origin: 'user', result: accepted ? 'accepted' : 'rejected', fromItemId, fromIndex: currentIndex, toItemId, toIndex: target, transitionReason });
      return { ok: Boolean(accepted), activeIndex: accepted ? target : currentIndex };
    } catch (error) {
      this.logActionCompleted(action, {
        origin: 'user', result: 'rejected', fromItemId, fromIndex: currentIndex, toItemId, toIndex: target,
        transitionReason: error.code === 'PLAYBACK_NOT_READY' ? 'source_unavailable' : 'source_error', error: error.message
      });
      throw error;
    }
  }

  updateQueue(queue, context = {}) {
    if (!Array.isArray(queue)) throw new Error('La cola actualizada no es válida.');
    const beforeIds = this.queue.map((item) => item.id);
    const requestedIds = queue.map((item) => item.id);
    const addedIds = requestedIds.filter((id) => !beforeIds.includes(id));
    const removedIds = beforeIds.filter((id) => !requestedIds.includes(id));
    const action = context.action || (addedIds.length
      ? 'ADD_CONTENT'
      : removedIds.length === beforeIds.length && beforeIds.length
        ? 'REMOVE_ALL'
        : removedIds.length
          ? 'REMOVE_ITEM'
          : 'REORDER');
    const transitionReason = context.reason || (action === 'REMOVE_ALL' ? 'remove_all' : action === 'REMOVE_ITEM' ? 'queue_removed' : 'queue_updated');
    this.logActionRequested(action, {
      origin: context.origin || 'user', transitionReason, beforeIds, requestedIds, addedIds, removedIds,
      sourceType: context.sourceType || null
    });
    this.cancelPrearmedPlayback('queue_updated').catch(() => {});
    const active = this.queue.find((item) => item.id === this.activeItemId);
    const nextQueue = queue.map((item) => ({ ...item }));
    if (this.isStreaming && active && !nextQueue.some((item) => item.id === active.id)) nextQueue.unshift(active);
    this.queue = nextQueue;
    this.totalDuration = nextQueue.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    this.activeIndex = this.activeItemId ? nextQueue.findIndex((item) => item.id === this.activeItemId) : -1;
    this.logTechnical('COLA ACTUALIZADA', JSON.stringify({ videos: nextQueue.map((item) => item.id), activeItemId: this.activeItemId }));
    this.logActionCompleted(action, {
      origin: context.origin || 'user', result: 'accepted', transitionReason,
      beforeIds, queueItemIds: nextQueue.map((item) => item.id), addedIds, removedIds,
      activeItemRetained: Boolean(active && nextQueue.some((item) => item.id === active.id))
    });
    return { ok: true, activeIndex: this.activeIndex, queue: nextQueue };
  }

  publisherHealthSnapshot() {
    const now = Date.now();
    return {
      session: this.sessionGeneration,
      outTimeSeconds: Number((this.lastPublisherOutTime || 0).toFixed(3)),
      frame: Number(this.publisherMetrics.frame) || 0,
      fps: Number(this.publisherMetrics.fps) || 0,
      bitrate: this.publisherMetrics.bitrate || 'N/A',
      duplicatedFrames: Number(this.publisherMetrics.dup_frames) || 0,
      droppedFrames: Number(this.publisherMetrics.drop_frames) || 0,
      speed: this.publisherMetrics.speed || 'N/A',
      millisecondsSinceProgress: this.lastPublisherProgressAt ? now - this.lastPublisherProgressAt : null,
      activeItemId: this.activeItemId || null,
      activeIndex: this.activeIndex
    };
  }

  stopPublisherHealthMonitor() {
    if (this.publisherHealthTimer) clearInterval(this.publisherHealthTimer);
    this.publisherHealthTimer = null;
  }

  startPublisherHealthMonitor(generation) {
    this.stopPublisherHealthMonitor();
    this.publisherHealthTimer = setInterval(() => {
      if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return;
      const now = Date.now();
      const stalledFor = this.lastPublisherProgressAt ? now - this.lastPublisherProgressAt : 0;
      if (this.liveConfirmed && stalledFor >= 6000 && !this.publisherStallLogged) {
        this.publisherStallLogged = true;
        this.logTechnical('RIESGO DE BUFFERING — PUBLICADOR SIN AVANCE', JSON.stringify(this.publisherHealthSnapshot(), null, 2));
      } else if (this.publisherStallLogged && stalledFor < 3000) {
        this.publisherStallLogged = false;
        this.logTechnical('PUBLICADOR RECUPERÓ EL AVANCE', JSON.stringify(this.publisherHealthSnapshot(), null, 2));
      }
      if (now - this.lastPublisherHealthLogAt >= 60000) {
        this.lastPublisherHealthLogAt = now;
        this.logTechnical('HEALTH PUBLICADOR', JSON.stringify(this.publisherHealthSnapshot(), null, 2));
      }
    }, 2000);
  }

  handleProgress(chunk, generation = this.sessionGeneration) {
    if (generation !== this.sessionGeneration || this.stopping) return;
    this.progressBuffer += chunk;
    const lines = this.progressBuffer.split(/\r?\n/);
    this.progressBuffer = lines.pop() || '';
    for (const line of lines) {
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator);
      const rawValue = line.slice(separator + 1);
      this.publisherMetrics[key] = rawValue;
      if (key !== 'out_time_us' && key !== 'out_time_ms') continue;
      const seconds = Math.max(0, Number(rawValue) / 1_000_000);
      if (!Number.isFinite(seconds)) continue;
      if (seconds > this.lastPublisherOutTime + .001) {
        this.lastPublisherOutTime = seconds;
        this.lastPublisherProgressAt = Date.now();
      }
      if (this.publisherStallLogged && Date.now() - this.lastPublisherProgressAt < 3000) {
        this.publisherStallLogged = false;
        this.logTechnical('PUBLICADOR RECUPERÓ EL AVANCE', JSON.stringify(this.publisherHealthSnapshot(), null, 2));
      }
      if (this.liveConfirmed) continue;
      this.liveConfirmed = true;
      this.retryCount = 0;
      this.logTechnical('SALIDA RTMPS ACTIVA', JSON.stringify(this.publisherHealthSnapshot(), null, 2));
      this.emit('live', 'Salida RTMPS activa. Confirmá la señal en YouTube Studio.');
    }
  }

  updateLoop(enabled) {
    const previous = this.loop;
    this.logActionRequested('LOOP', { origin: 'user', transitionReason: 'manual_loop_change', from: previous, to: Boolean(enabled) });
    this.loop = Boolean(enabled);
    this.loopStopAt = null;
    this.loopEnding = false;
    if (this.loop) this.emit('info', 'Loop activado. La cola volverá a comenzar al terminar.', { attention: 'clear' });
    else this.emit('warning', 'Loop desactivado. El vivo terminará al final de esta vuelta.', { attention: 'scheduled' });
    this.logTechnical('LOOP ACTUALIZADO', this.loop ? 'ON' : 'OFF');
    this.logActionCompleted('LOOP', { origin: 'user', result: 'accepted', transitionReason: 'manual_loop_change', from: previous, to: this.loop });
    return { ok: true, loop: this.loop };
  }

  handleFfmpegExit(code, detail, generation = this.sessionGeneration, publisher = this.ffmpeg) {
    if (this.ffmpeg === publisher) this.ffmpeg = null;
    if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return;
    this.stopPublisherHealthMonitor();
    this.stopPlaybackWorker().catch(() => {});
    this.retryCount += 1;
    this.logTechnical(`Salida de transmisión (código ${code})`, `session=${generation}\n${detail || ''}`);
    if (this.retryCount > 12) {
      this.stop('La conexión con YouTube no pudo recuperarse. Revisá internet y tu stream key.', 'error', { origin: 'system', reason: 'source_error' });
      return;
    }
    const wait = Math.min(30, 3 + this.retryCount * 2);
    const keyProblem = /403|unauthorized|authentication|invalid.{0,20}key|already publishing|server error/i.test(String(detail || ''));
    const message = keyProblem
      ? `YouTube rechazó la conexión. Revisá la stream key y que no haya otro programa transmitiendo. Reintentamos en ${wait} segundos…`
      : `Se cortó la conexión con YouTube. Revisá internet; reintentamos en ${wait} segundos…`;
    this.emit('warning', message, { attention: 'danger' });
    this.logActionRequested('RECONNECT', { origin: 'system', transitionReason: 'source_error', exitCode: code, attempt: this.retryCount, waitSeconds: wait });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (generation !== this.sessionGeneration || this.stopping || !this.isStreaming) return;
      const launched = this.launchFfmpeg(generation);
      this.logActionCompleted('RECONNECT', {
        origin: 'system', result: launched ? 'attempt_started' : 'rejected', transitionReason: 'source_error', attempt: this.retryCount
      });
    }, wait * 1000);
  }

  finish(message, type = 'success', generation = this.sessionGeneration) {
    if (this.finishedGeneration === generation) return;
    this.finishedGeneration = generation;
    this.isStreaming = false;
    if (this.powerBlockerId !== null && this.powerManager.isStarted(this.powerBlockerId)) this.powerManager.stop(this.powerBlockerId);
    this.powerBlockerId = null;
    this.activeIndex = -1;
    this.activeItemId = null;
    this.emit(type, message, { stopped: true, attention: type === 'error' ? 'danger' : 'done' });
    this.streamLogPath = null;
    this.ffmpegLogPath = null;
  }

  async stop(finalMessage = 'El vivo terminó.', type = 'success', { origin = 'user', reason = 'manual_stop' } = {}) {
    if (this.stopPromise) return this.stopPromise;
    if (!this.isStreaming && !this.ffmpeg && !this.playbackWorker) return { ok: true };
    const endingGeneration = this.sessionGeneration;
    this.logActionRequested('STOP STREAM', { session: endingGeneration, origin, transitionReason: reason });
    this.stopPromise = (async () => {
      this.sessionGeneration += 1;
      this.stopping = true;
      this.stopPublisherHealthMonitor();
      await this.cancelPrearmedPlayback('stream_stopped');
      this.preResolvedSources.clear();
      this.sourcePrearmPromises.clear();
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      if (this.liveRetryTimer) clearTimeout(this.liveRetryTimer);
      this.liveRetryTimer = null;
      this.emit('info', 'Terminando el vivo…', { attention: 'stopping' });
      await this.stopPlaybackWorker();
      const publisher = this.ffmpeg;
      this.ffmpeg = null;
      if (publisher) await this.stopPublisherGracefully(publisher);
      this.logTechnical('STREAM FINALIZADO', `session=${endingGeneration} ${finalMessage}`);
      this.logActionCompleted('STOP STREAM', {
        session: endingGeneration, origin, result: 'accepted', transitionReason: reason,
        finalPublisherOutTime: Number((this.lastPublisherOutTime || 0).toFixed(3))
      });
      this.finish(finalMessage, type, endingGeneration);
      this.stopping = false;
      return { ok: true };
    })().finally(() => { this.stopPromise = null; });
    return this.stopPromise;
  }
}

module.exports = { StreamEngine };
