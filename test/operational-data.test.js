const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StreamEngine } = require('../src/stream-engine');

test('keeps logs and removes only the owned temporary directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-data-test-'));
  const appDataPath = path.join(root, 'profile');
  const operationalPath = path.join(root, 'SAOViVO Data');
  const engine = new StreamEngine({
    appDataPath,
    operationalPath,
    ffmpegPath: __filename,
    notify: () => {}
  });

  await engine.initialize();
  await fs.writeFile(path.join(engine.mediaPath, 'temporary-video.mp4'), 'test');
  engine.logTechnical('PRUEBA', 'El log debe sobrevivir.');
  await engine.cleanupTemporary();

  await assert.rejects(fs.access(engine.tempPath));
  const logs = await fs.readdir(engine.logsPath);
  assert.ok(logs.some((name) => name.startsWith('app-') && name.endsWith('.log')));
  assert.equal(await fs.readFile(path.join(operationalPath, 'README.txt'), 'utf8').then((text) => text.includes('SAOViVO DATA')), true);

  await fs.rm(root, { recursive: true, force: true });
});

test('releases the initial three-video buffer while later items continue', async () => {
  const completed = [];
  const engine = new StreamEngine({
    appDataPath: path.join(os.tmpdir(), 'saovivo-buffer-profile'),
    operationalPath: path.join(os.tmpdir(), 'saovivo-buffer-data'),
    ffmpegPath: __filename,
    notify: () => {}
  });
  engine.ensureRuntime = async () => {};
  engine.normalizedPath = (item) => path.join(os.tmpdir(), `missing-${item.id}-${Date.now()}.mp4`);
  engine.downloadVideo = async (item) => {
    await new Promise((resolve) => setTimeout(resolve, Number(item.id) <= 3 ? 5 : 80));
    completed.push(item.id);
    return `${item.id}.mp4`;
  };
  const items = [1, 2, 3, 4, 5].map((id) => ({ id: String(id), title: `Video ${id}` }));

  const all = engine.prepare(items);
  const buffer = await Promise.all(items.slice(0, 3).map((item, index) => engine.enqueuePreparation(item, index, items.length)));

  assert.deepEqual(buffer.map((result) => result.ready), [true, true, true]);
  assert.deepEqual(completed, ['1', '2', '3']);
  assert.equal(completed.includes('5'), false);
  await all;
  assert.deepEqual(completed, ['1', '2', '3', '4', '5']);
});

test('turning loop off schedules the end of the current cycle', () => {
  const events = [];
  const engine = new StreamEngine({
    appDataPath: os.tmpdir(),
    operationalPath: path.join(os.tmpdir(), 'saovivo-loop-data'),
    ffmpegPath: __filename,
    notify: (event) => events.push(event)
  });
  engine.totalDuration = 100;
  engine.lastTotalElapsed = 126;

  engine.updateLoop(false);
  assert.equal(engine.loop, false);
  assert.equal(engine.loopStopAt, null);
  assert.equal(events.at(-1).attention, 'scheduled');
  assert.equal(events.at(-1).type, 'warning');

  engine.updateLoop(true);
  assert.equal(engine.loop, true);
  assert.equal(engine.loopStopAt, null);
  assert.equal(events.at(-1).attention, 'clear');
});

test('shutdown terminates an active preparation worker before deleting temporary files', { skip: process.platform !== 'win32' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-shutdown-worker-'));
  const engine = new StreamEngine({
    appDataPath: path.join(root, 'profile'),
    operationalPath: path.join(root, 'SAOViVO Data'),
    ffmpegPath: __filename,
    notify: () => {}
  });
  await engine.initialize();
  await fs.writeFile(path.join(engine.mediaPath, 'descarga-activa.part'), 'partial');
  const running = engine.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 30000 }).catch((error) => error);
  for (let attempt = 0; attempt < 30 && !engine.workers.size; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(engine.workers.size, 1);

  await engine.shutdown();
  await running;

  assert.equal(engine.workers.size, 0);
  await assert.rejects(fs.access(engine.tempPath));
  const logName = (await fs.readdir(engine.logsPath)).find((name) => name.startsWith('app-'));
  const log = await fs.readFile(path.join(engine.logsPath, logName), 'utf8');
  assert.match(log, /CANCELANDO PROCESOS/);
  assert.match(log, /CIERRE LIMPIO/);
  await fs.rm(root, { recursive: true, force: true });
});

test('a locked temporary cleanup is logged as deferred without a user notification', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-deferred-cleanup-'));
  const events = [];
  const engine = new StreamEngine({
    appDataPath: path.join(root, 'profile'),
    operationalPath: path.join(root, 'SAOViVO Data'),
    ffmpegPath: __filename,
    notify: (event) => events.push(event)
  });
  await engine.initialize();
  engine.cleanupTemporary = async () => { throw new Error('EPERM locked .part'); };

  await engine.shutdown();

  assert.deepEqual(events, []);
  const logName = (await fs.readdir(engine.logsPath)).find((name) => name.startsWith('app-'));
  const log = await fs.readFile(path.join(engine.logsPath, logName), 'utf8');
  assert.match(log, /LIMPIEZA DIFERIDA/);
  assert.match(log, /EPERM locked \.part/);
  await fs.rm(root, { recursive: true, force: true });
});
