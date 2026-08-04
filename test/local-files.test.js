const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');
const { StreamEngine } = require('../src/stream-engine');
const { normalizeQueueItem, sourceTypeOf } = require('../src/media-source');

function makeEngine(root, notify = () => {}, extra = {}) {
  return new StreamEngine({
    appDataPath: path.join(root, 'profile'),
    operationalPath: path.join(root, 'SAOViVO Data'),
    ffmpegPath,
    notify,
    powerManager: { start: () => 1, isStarted: () => true, stop: () => {} },
    ...extra
  });
}

async function fileHash(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

function createSilentMp4(filePath, color = '0x245a78', size = '320x180', rate = 24, duration = 0.5) {
  const result = spawnSync(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=${rate}:d=${duration}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', filePath
  ], { windowsHide: true, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'No se pudo crear el MP4 de prueba.');
}

test('migrates persisted YouTube items and preserves explicit local sources', () => {
  const legacy = normalizeQueueItem({ id: 'yt-1', url: 'https://youtu.be/example' });
  const local = normalizeQueueItem({ id: 'local-1', localPath: 'C:\\Videos\\clip.mp4' });

  assert.equal(legacy.sourceType, 'youtube');
  assert.equal(sourceTypeOf(legacy), 'youtube');
  assert.equal(local.sourceType, 'local');
  assert.equal(sourceTypeOf(local), 'local');
});

test('reads local MP4 metadata without downloading or invoking yt-dlp', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-local-metadata-'));
  const first = path.join(root, 'Segundo seleccionado.mp4');
  const second = path.join(root, 'Primero alfabéticamente.mp4');
  await fs.writeFile(first, 'fixture');
  await fs.writeFile(second, 'fixture');
  const engine = makeEngine(root);
  let youtubeRuntimeCalls = 0;
  engine.ensureYouTubeRuntime = async () => { youtubeRuntimeCalls += 1; };
  engine.inspectMedia = async () => ({ hasVideo: true, hasAudio: true, duration: 91 });

  const items = await engine.getLocalMetadata([first, second]);
  const [item] = items;

  assert.equal(item.sourceType, 'local');
  assert.deepEqual(items.map((candidate) => candidate.title), ['Segundo seleccionado', 'Primero alfabéticamente']);
  assert.equal(item.duration, 91);
  assert.equal(item.localPath, path.resolve(first));
  assert.equal(youtubeRuntimeCalls, 0);
  assert.equal(await fs.access(engine.ytDlpPath).then(() => true, () => false), false);
  await fs.rm(root, { recursive: true, force: true });
});

test('normalizes a silent local MP4, adds audio and never changes the original', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-local-original-'));
  const input = path.join(root, 'original-sin-audio.mp4');
  createSilentMp4(input);
  const beforeHash = await fileHash(input);
  const beforeStat = await fs.stat(input);
  const events = [];
  const engine = makeEngine(root, (event) => events.push(event));
  let youtubeRuntimeCalls = 0;
  engine.ensureYouTubeRuntime = async () => { youtubeRuntimeCalls += 1; };
  await engine.initialize();
  const [item] = await engine.getLocalMetadata([input]);

  const [result] = await engine.prepare([item]);

  assert.equal(result.ready, true);
  assert.equal(youtubeRuntimeCalls, 0);
  assert.equal(await fileHash(input), beforeHash);
  assert.equal((await fs.stat(input)).size, beforeStat.size);
  const normalized = await engine.inspectMedia(result.file);
  assert.equal(normalized.hasVideo, true);
  assert.equal(normalized.hasAudio, true);
  const progress = events.filter((event) => event.type === 'prepare-progress' && event.itemId === item.id).map((event) => event.progress);
  assert.ok(progress.length >= 2, 'La normalización debe informar avance visible.');
  assert.equal(progress[0], 0);
  assert.ok(progress.some((value) => value > 0 && value <= 99));
  assert.equal(events.some((event) => event.type === 'prepare' && event.itemId === item.id && event.status === 'ready'), true);
  await engine.cleanupTemporary();
  assert.equal(await fileHash(input), beforeHash);
  await fs.rm(root, { recursive: true, force: true });
});

test('resolves a mixed local, YouTube, local queue in its original order', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-mixed-'));
  const engine = makeEngine(root);
  const resolved = [];
  engine.ensureCoreRuntime = async () => {};
  engine.normalizedPath = (item) => path.join(root, `${item.id}.missing`);
  engine.prepareLocalVideo = async (item) => { resolved.push(`local:${item.id}`); return `${item.id}.mp4`; };
  engine.downloadVideo = async (item) => { resolved.push(`youtube:${item.id}`); return `${item.id}.mp4`; };
  const items = [
    { id: 'a', sourceType: 'local', localPath: 'A.mp4', title: 'A' },
    { id: 'b', sourceType: 'youtube', url: 'https://youtu.be/b', title: 'B' },
    { id: 'c', sourceType: 'local', localPath: 'C.mp4', title: 'C' }
  ];

  const results = await engine.prepare(items);

  assert.deepEqual(results.map((item) => item.ready), [true, true, true]);
  assert.deepEqual(resolved, ['local:a', 'youtube:b', 'local:c']);
  await fs.rm(root, { recursive: true, force: true });
});

test('normalizes three local clips and FFmpeg crosses two concat transitions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-local-transitions-'));
  const inputs = [
    path.join(root, 'a.mp4'),
    path.join(root, 'b.mp4'),
    path.join(root, 'c.mp4')
  ];
  createSilentMp4(inputs[0], 'red', '320x180', 24);
  createSilentMp4(inputs[1], 'green', '640x360', 25);
  createSilentMp4(inputs[2], 'blue', '480x270', 30);
  const hashes = await Promise.all(inputs.map(fileHash));
  const engine = makeEngine(root);
  await engine.initialize();
  const items = await engine.getLocalMetadata(inputs);
  const results = await engine.prepare(items);
  assert.deepEqual(results.map((result) => result.ready), [true, true, true]);
  await engine.writeConcat(results.map((result) => result.file));

  const transition = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', engine.concatPath,
    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'
  ], { windowsHide: true, encoding: 'utf8' });

  assert.equal(transition.status, 0, transition.stderr || 'Falló la lectura de la cola concatenada.');
  assert.deepEqual(await Promise.all(inputs.map(fileHash)), hashes);
  await fs.rm(root, { recursive: true, force: true });
});

test('dynamic playout crosses horizontal and vertical clips and honors a live queue reorder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-dynamic-playout-'));
  const inputs = [path.join(root, 'one.mp4'), path.join(root, 'two.mp4'), path.join(root, 'three.mp4')];
  createSilentMp4(inputs[0], 'red', '320x180', 24, 2);
  createSilentMp4(inputs[1], 'green', '360x640', 24, 2);
  createSilentMp4(inputs[2], 'blue', '320x180', 24, 2);
  const hashes = await Promise.all(inputs.map(fileHash));
  const events = [];
  const output = path.join(root, 'dynamic-output.flv');
  const engine = makeEngine(root, (event) => events.push(event), { streamTarget: output });
  await engine.initialize();
  const items = await engine.getLocalMetadata(inputs);
  const prepared = await engine.prepare(items);
  assert.deepEqual(prepared.map((result) => result.ready), [true, true, true]);

  await engine.start({ queue: items, streamKey: 'local-test-key', loop: false });
  for (let attempt = 0; attempt < 50 && !events.some((event) => event.type === 'progress' && event.activeItemId === items[0].id); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  engine.updateQueue([items[0], items[2], items[1]]);
  for (let attempt = 0; attempt < 120 && !events.some((event) => event.stopped); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(events.some((event) => event.stopped), true);
  assert.deepEqual(events.filter((event) => event.type === 'progress' && event.elapsed === 0).map((event) => event.activeItemId), [items[0].id, items[2].id, items[1].id]);
  const media = await engine.inspectMedia(output);
  assert.equal(media.hasVideo, true);
  assert.equal(media.hasAudio, true);
  assert.ok(media.duration >= 1, `Duración inesperada: ${media.duration}`);
  assert.deepEqual(await Promise.all(inputs.map(fileHash)), hashes);
  await engine.shutdown();
  await fs.rm(root, { recursive: true, force: true });
});

test('starts a local-only queue while yt-dlp is absent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-local-start-'));
  const engine = makeEngine(root);
  const preparedFile = path.join(root, 'prepared.mp4');
  await fs.writeFile(preparedFile, 'prepared');
  let youtubeRuntimeCalls = 0;
  let launched = false;
  engine.ensureCoreRuntime = async () => {};
  engine.ensureYouTubeRuntime = async () => { youtubeRuntimeCalls += 1; };
  engine.normalizedPath = () => preparedFile;
  engine.launchFfmpeg = (generation) => { launched = true; engine.launchedGenerationForTest = generation; };
  const queue = [{
    id: 'local-start',
    sourceType: 'local',
    localPath: path.join(root, 'original.mp4'),
    title: 'Inicio local',
    duration: 20
  }];

  const result = await engine.start({ queue, streamKey: 'test-key-123', loop: true });

  assert.equal(result.ok, true);
  assert.equal(launched, true);
  assert.equal(youtubeRuntimeCalls, 0);
  assert.equal(engine.launchedGenerationForTest, engine.sessionGeneration);
  assert.deepEqual(engine.queue.map((item) => item.id), ['local-start']);
  await fs.rm(root, { recursive: true, force: true });
});

test('reports a missing persisted local file with an actionable error code', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-local-missing-'));
  const events = [];
  const engine = makeEngine(root, (event) => events.push(event));
  await engine.initialize();
  const item = {
    id: 'missing-local',
    sourceType: 'local',
    localPath: path.join(root, 'movido.mp4'),
    title: 'Video movido',
    duration: 30
  };

  const [result] = await engine.prepare([item]);

  assert.equal(result.ready, false);
  assert.equal(result.errorCode, 'LOCAL_MISSING');
  assert.match(result.error, /Volvé a seleccionarlo|quitá ese elemento/);
  assert.equal(events.some((event) => event.itemId === item.id && event.errorCode === 'LOCAL_MISSING'), true);
  await fs.rm(root, { recursive: true, force: true });
});

test('rejects local formats that are not declared as supported', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-local-format-'));
  const input = path.join(root, 'clip.mov');
  await fs.writeFile(input, 'fixture');
  const engine = makeEngine(root);

  await assert.rejects(engine.getLocalMetadata([input]), (error) => error.code === 'LOCAL_UNSUPPORTED');
  await fs.rm(root, { recursive: true, force: true });
});
