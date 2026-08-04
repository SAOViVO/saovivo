const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StreamEngine } = require('../src/stream-engine');
const feedbackPolicy = require('../src/renderer/feedback-policy');

function makeEngine(notify = () => {}) {
  const unique = `saovivo-youtube-${process.pid}-${Math.random().toString(16).slice(2)}`;
  return new StreamEngine({
    appDataPath: path.join(os.tmpdir(), unique, 'profile'),
    operationalPath: path.join(os.tmpdir(), unique, 'data'),
    ffmpegPath: __filename,
    notify,
    powerManager: { start: () => 1, isStarted: () => true, stop: () => {} }
  });
}

test('list=LL fails fast with the account-private playlist message and without loading yt-dlp', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  let runtimeCalls = 0;
  engine.ensureYouTubeRuntime = async () => { runtimeCalls += 1; };

  const result = await engine.ingestYouTube('https://www.youtube.com/playlist?list=LL');

  assert.equal(runtimeCalls, 0);
  assert.equal(result.errorCode, 'PLAYLIST_PRIVATE');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'error');
  assert.equal(events[0].message, 'Esta playlist es privada de tu cuenta de YouTube. SAOViVO no accede a tu cuenta. Creá una playlist pública o no listada y pegá ese enlace.');
});

test('watch URL with encoded list=LL rescues the individual video', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  let requestedUrl = '';
  engine.ensureYouTubeRuntime = async () => {};
  engine.readSingleYouTube = async (url) => {
    requestedUrl = url;
    return { id: 'video-rescatado', sourceType: 'youtube', title: 'Rescatado', duration: 60, thumbnail: '', url };
  };

  const result = await engine.ingestYouTube('https://www.youtube.com/watch?v=video-rescatado&amp;list=LL');

  assert.equal(result.added, 1);
  assert.equal(requestedUrl, 'https://www.youtube.com/watch?v=video-rescatado');
  assert.equal(events.some((event) => event.errorCode === 'PLAYLIST_PRIVATE'), true);
  const itemEvent = events.find((event) => event.type === 'youtube-item');
  assert.equal(itemEvent.item.id, 'video-rescatado');
  assert.match(itemEvent.message, /Video actual agregado y preparándose/);
  assert.match(itemEvent.message, /resto de “Vídeos que me gustan”.*playlist privada/i);
});

test('playlist emits its first item before yt-dlp enumeration finishes', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  engine.ensureYouTubeRuntime = async () => {};
  let releaseEnumeration;
  const enumerationBlocked = new Promise((resolve) => { releaseEnumeration = resolve; });
  engine.run = async (_command, _args, options) => {
    options.onLine(JSON.stringify({ id: 'first-now', title: 'Primero inmediato', playlist_index: 1, playlist_count: 2 }));
    await enumerationBlocked;
    options.onLine(JSON.stringify({ id: 'second-later', title: 'Segundo posterior', playlist_index: 2, playlist_count: 2 }));
    return { stdout: '', stderr: '', exitCode: 0 };
  };

  let ingestionFinished = false;
  const ingestion = engine.ingestYouTube('https://www.youtube.com/playlist?list=PL-streaming')
    .then((result) => { ingestionFinished = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ingestionFinished, false);
  assert.deepEqual(events.filter((event) => event.type === 'youtube-item').map((event) => event.item.id), ['first-now']);
  releaseEnumeration();
  const result = await ingestion;
  assert.equal(result.added, 2);
  assert.deepEqual(events.filter((event) => event.type === 'youtube-item').map((event) => event.item.id), ['first-now', 'second-later']);
});

test('partially invalid playlist emits valid videos in original order and omits permanent failures', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  engine.ensureYouTubeRuntime = async () => {};
  engine.run = async (_command, _args, options) => {
    const entries = [
      { id: 'first', title: 'Primero', duration: 10, playlist_index: 1, playlist_count: 4 },
      { id: 'private', title: '[Private video]', availability: 'private', playlist_index: 2, playlist_count: 4 },
      { id: 'deleted', title: '[Deleted video]', playlist_index: 3, playlist_count: 4 },
      { id: 'last', title: 'Último', duration: 20, playlist_index: 4, playlist_count: 4 }
    ];
    entries.forEach((entry) => options.onLine(JSON.stringify(entry)));
    return { stdout: '', stderr: '' };
  };

  const result = await engine.ingestYouTube('https://www.youtube.com/playlist?list=PL-publica');

  assert.deepEqual(events.filter((event) => event.type === 'youtube-item').map((event) => event.item.id), ['first', 'last']);
  assert.equal(result.added, 2);
  assert.equal(result.omitted, 2);
  assert.equal(events.some((event) => /Video 2 omitido: es privado/.test(event.message)), true);
  assert.equal(events.some((event) => /Playlist lista: 2 agregados · 2 omitidos/.test(event.message)), true);
});

test('transient playlist failures preserve prior items and are marked retryable', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  engine.ensureYouTubeRuntime = async () => {};
  engine.run = async (_command, _args, options) => {
    options.onLine(JSON.stringify({ id: 'kept', title: 'Ya encontrado', playlist_index: 1, playlist_count: 2 }));
    const error = new Error('network connection timed out');
    error.details = 'network connection timed out';
    throw error;
  };

  const result = await engine.ingestYouTube('https://www.youtube.com/playlist?list=PL-red');

  assert.equal(result.added, 1);
  assert.equal(result.pending, 1);
  assert.equal(events.some((event) => event.type === 'youtube-item' && event.item.id === 'kept'), true);
  assert.equal(events.some((event) => event.errorCode === 'YOUTUBE_NETWORK' && event.retryable), true);
});

test('YouTube metadata and playlist problems route to OUTPUT, while small validation stays in toast', () => {
  assert.equal(feedbackPolicy.destinationFor('Esta playlist es privada de tu cuenta de YouTube.'), 'output');
  assert.equal(feedbackPolicy.destinationFor('YouTube no devolvió información para ese video.'), 'output');
  assert.equal(feedbackPolicy.destinationFor('No pude conectar con YouTube.'), 'output');
  assert.equal(feedbackPolicy.destinationFor('Pegá un link válido de YouTube.'), 'toast');
  assert.equal(feedbackPolicy.destinationFor('Primero guardá tu stream key de YouTube.'), 'toast');
});

test('YouTube failure classification separates permanent and retryable errors', () => {
  const engine = makeEngine();
  assert.deepEqual(engine.classifyYouTubeError('This video is private'), {
    code: 'VIDEO_PRIVATE', permanent: true, message: 'El video es privado.'
  });
  assert.equal(engine.classifyYouTubeError('ERROR 429: connection timed out').code, 'YOUTUBE_NETWORK');
  assert.equal(engine.classifyYouTubeError('ERROR 429: connection timed out').permanent, false);
  assert.equal(engine.classifyYouTubeError('Extractor crashed unexpectedly').code, 'YOUTUBE_TECHNICAL');
});

test('metadata marks vertical and live YouTube items for confirmation and queue badges', () => {
  const engine = makeEngine();
  const vertical = engine.youtubeItem({ id: 'short', title: 'Vertical', width: 720, height: 1280, live_status: 'not_live' }, 'https://youtube.com/shorts/short');
  const live = engine.youtubeItem({ id: 'live', title: 'Live', width: 1280, height: 720, is_live: true, live_status: 'is_live' }, 'https://youtube.com/watch?v=live');

  assert.equal(vertical.isVertical, true);
  assert.equal(vertical.isShort, true);
  assert.equal(vertical.isLive, false);
  assert.equal(live.isLive, true);
  assert.equal(live.liveStatus, 'is_live');
  assert.equal(live.duration, 0);
});

test('a live source is ready without downloading and waits for playout-time resolution', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  let downloads = 0;
  engine.downloadVideo = async () => { downloads += 1; };
  const item = { id: 'live-now', sourceType: 'youtube', title: 'En vivo', url: 'https://youtube.com/watch?v=live-now', isLive: true };

  const [result] = await engine.prepare([item]);

  assert.equal(result.ready, true);
  assert.equal(result.live, true);
  assert.equal(downloads, 0);
  assert.equal(events.some((event) => event.itemId === item.id && event.status === 'ready'), true);
});

test('YouTube download progress is monotonic and reserves the final 30 percent for normalization', async () => {
  const events = [];
  const engine = makeEngine((event) => events.push(event));
  await engine.initialize();
  engine.ensureYouTubeRuntime = async () => {};
  engine.run = async (_command, _args, options) => {
    for (const value of [10, 80, 5, 100]) options.onLine(`[download] ${value}% of 10MiB`);
    await fs.writeFile(path.join(engine.mediaPath, 'progress-video.source.mp4'), 'raw');
    return { stdout: '', stderr: '', exitCode: 0 };
  };
  engine.inspectMedia = async () => ({ videoH264: false, audioAac: false, hasAudio: true, width: 1920, height: 1080, frameRate: 25 });
  let normalizationStart = null;
  engine.normalizeVideo = async (_input, output, _item, _hasAudio, startProgress) => {
    normalizationStart = startProgress;
    await fs.writeFile(output, 'normalized');
  };
  const item = { id: 'progress-video', sourceType: 'youtube', title: 'Progreso', duration: 120, url: 'https://youtube.com/watch?v=progress-video' };

  await engine.downloadVideo(item);

  const progress = events.filter((event) => event.type === 'prepare-progress').map((event) => event.progress);
  assert.equal(progress.at(-1), 70);
  assert.equal(progress.every((value, index) => index === 0 || value >= progress[index - 1]), true);
  assert.equal(normalizationStart, 70);
  await engine.cleanupTemporary();
});

test('metadata failures persist sanitized source, exit code and stderr without credentials', async () => {
  const engine = makeEngine();
  engine.run = async () => {
    const error = new Error('metadata failed');
    error.exitCode = 1;
    error.details = 'ERROR private URL https://youtube.com/watch?v=safe&token=secret Cookie: session-value';
    throw error;
  };

  await assert.rejects(engine.readSingleYouTube('https://youtube.com/watch?v=safe&si=tracking-secret'));
  const logName = (await require('node:fs/promises').readdir(engine.logsPath)).find((name) => name.startsWith('app-'));
  const log = await require('node:fs/promises').readFile(path.join(engine.logsPath, logName), 'utf8');

  assert.match(log, /YOUTUBE METADATA INICIO/);
  assert.match(log, /YOUTUBE METADATA ERROR/);
  assert.match(log, /"exitCode": 1/);
  assert.match(log, /stderr/);
  assert.match(log, /https:\/\/youtube\.com\/watch\?v=safe/);
  assert.doesNotMatch(log, /tracking-secret|session-value|token=secret/);
  assert.match(log, /token=\[REDACTED\]|cookie=\[REDACTED\]/i);
});

test('run forwards complete stdout lines before the child process exits', async () => {
  const engine = makeEngine();
  const lines = [];
  let finished = false;
  const running = engine.run(process.execPath, ['-e', "process.stdout.write('first\\n'); setTimeout(() => process.stdout.write('second\\n'), 120); setTimeout(() => process.exit(0), 220)"], {
    timeout: 3000,
    onLine: (line) => lines.push(line)
  }).then((result) => { finished = true; return result; });

  for (let attempt = 0; attempt < 30 && !lines.length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(lines, ['first']);
  assert.equal(finished, false);
  const result = await running;
  assert.equal(result.exitCode, 0);
  assert.deepEqual(lines, ['first', 'second']);
});
