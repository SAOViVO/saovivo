const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');
const { StreamEngine } = require('../src/stream-engine');

function createClip(filePath, color, size = '320x180', duration = 2) {
  const result = spawnSync(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=24:d=${duration}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', filePath
  ], { windowsHide: true, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'No se pudo crear el video de prueba.');
}

function makeEngine(root, events, output) {
  return new StreamEngine({
    appDataPath: path.join(root, 'profile'),
    operationalPath: path.join(root, 'SAOViVO Data'),
    ffmpegPath,
    streamTarget: output,
    notify: (event) => events.push(event),
    powerManager: { start: () => 1, isStarted: () => true, stop: () => {} }
  });
}

async function waitFor(predicate, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('La condición de prueba no se cumplió a tiempo.');
}

function mediaTimestamps(filePath, kind) {
  const filter = kind === 'video' ? ['-vf', 'showinfo', '-an'] : ['-af', 'ashowinfo', '-vn'];
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'info', '-i', filePath,
    ...filter, '-f', 'null', '-'
  ], { windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || `No se pudo revisar el ${kind}.`);
  return [...result.stderr.matchAll(/pts_time:([\d.-]+)/g)].map((match) => Number(match[1]));
}

function assertContinuous(values, maximumGap, label) {
  assert.ok(values.length > 5, `Faltan muestras de ${label}.`);
  for (let index = 1; index < values.length; index += 1) {
    const gap = values[index] - values[index - 1];
    assert.ok(gap > 0, `${label}: timestamp no creciente en ${index}: ${values[index - 1]} -> ${values[index]}`);
    assert.ok(gap <= maximumGap, `${label}: hueco de ${gap.toFixed(3)} segundos en ${index}.`);
  }
}

test('publisher keeps monotonic timestamps through rapid next, previous and simulated Live transitions', { timeout: 45000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-continuity-'));
  const sourcePaths = [path.join(root, 'one.mp4'), path.join(root, 'two.mp4'), path.join(root, 'three.mp4')];
  createClip(sourcePaths[0], 'red');
  createClip(sourcePaths[1], 'green', '180x320');
  createClip(sourcePaths[2], 'blue');
  const events = [];
  const output = path.join(root, 'continuous-output.flv');
  const engine = makeEngine(root, events, output);
  await engine.initialize();
  const localItems = await engine.getLocalMetadata(sourcePaths);
  const prepared = await engine.prepare(localItems);
  const liveItem = {
    ...localItems[1], id: 'simulated-youtube-live', sourceType: 'youtube',
    url: 'https://www.youtube.com/watch?v=simulated', isLive: true, duration: 0
  };
  engine.resolveLivePlaybackUrl = async () => prepared[1].file;
  const queue = [localItems[0], liveItem, localItems[2]];

  await engine.start({ queue, streamKey: 'integration-test-key', loop: true });
  await waitFor(() => engine.activeItemId === queue[0].id);
  const directions = ['next', 'next', 'previous', 'previous', 'next', 'next', 'previous', 'next', 'previous', 'previous'];
  for (const direction of directions) {
    const result = await engine.navigate(direction);
    assert.equal(result.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  const firstStartsBeforeLoop = events.filter((event) => event.type === 'progress' && event.elapsed === 0 && event.activeItemId === queue[0].id).length;
  await engine.navigate('previous');
  await waitFor(() => events.filter((event) => event.type === 'progress' && event.elapsed === 0 && event.activeItemId === queue[0].id).length > firstStartsBeforeLoop, 8000);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const streamLogPath = engine.streamLogPath;
  const ffmpegLogPath = engine.ffmpegLogPath;
  await engine.stop('Fin de prueba.', 'success', { origin: 'test', reason: 'manual_stop' });

  const videoPts = mediaTimestamps(output, 'video');
  const audioPts = mediaTimestamps(output, 'audio');
  assertContinuous(videoPts, 0.05, 'video');
  assertContinuous(audioPts, 0.05, 'audio');
  const integrity = spawnSync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'warning', '-i', output, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'
  ], { windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.equal(integrity.status, 0, integrity.stderr || 'La salida publicada no pudo decodificarse completa.');
  assert.doesNotMatch(integrity.stderr, /packet corrupt|timestamp discontinuity|non-monotonous dts|non monotonically increasing dts/i);
  const ffmpegLog = await fs.readFile(ffmpegLogPath, 'utf8');
  assert.doesNotMatch(ffmpegLog, /packet corrupt|timestamp discontinuity|non-monotonous dts|non monotonically increasing dts/i);
  const streamLog = await fs.readFile(streamLogPath, 'utf8');
  const sections = streamLog.split(/\r?\n\r?\n/);
  const actionCount = (scope, action) => sections.filter((section) => section.includes(scope) && section.includes(`"action": "${action}"`)).length;
  assert.match(streamLog, /"action": "NEXT"/);
  assert.match(streamLog, /"action": "PREVIOUS"/);
  assert.match(streamLog, /"transitionReason": "manual_next"/);
  assert.match(streamLog, /"transitionReason": "manual_previous"/);
  assert.match(streamLog, /"transitionReason": "loop_restart"/);
  assert.match(streamLog, /"toItemId": "simulated-youtube-live"/);
  assert.equal(actionCount('ACCIÓN DE STREAM SOLICITADA', 'NEXT'), 5);
  assert.equal(actionCount('ACCIÓN DE STREAM COMPLETADA', 'NEXT'), 5);
  assert.equal(actionCount('ACCIÓN DE STREAM SOLICITADA', 'PREVIOUS'), 6);
  assert.equal(actionCount('ACCIÓN DE STREAM COMPLETADA', 'PREVIOUS'), 6);
  assert.equal(actionCount('ACCIÓN DE STREAM SOLICITADA', 'ADVANCE'), 1);
  assert.equal(actionCount('ACCIÓN DE STREAM COMPLETADA', 'ADVANCE'), 1);
  const loopAdvance = sections.find((section) => section.includes('ACCIÓN DE STREAM SOLICITADA') && section.includes('"transitionReason": "loop_restart"'));
  assert.ok(Number(loopAdvance?.match(/"playedSeconds": ([\d.]+)/)?.[1]) >= 1.3, 'El prearmado no debe adelantar de forma material el final del video activo.');
  assert.doesNotMatch(streamLog, /integration-test-key/);

  await engine.shutdown();
  await fs.rm(root, { recursive: true, force: true });
});

test('idempotent stop logs one requested/completed pair with a normalized reason', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-action-log-'));
  const engine = makeEngine(root, [], path.join(root, 'unused.flv'));
  await engine.initialize();
  engine.queue = [{ id: 'active', title: 'Activo' }];
  engine.activeItemId = 'active';
  engine.isStreaming = true;
  engine.sessionGeneration = 8;
  engine.startSessionLog();
  const streamLogPath = engine.streamLogPath;
  engine.ffmpeg = { exitCode: null, signalCode: null };
  engine.terminateWorkerTree = async () => {};

  await Promise.all([
    engine.stop('Fin manual.', 'success', { origin: 'user', reason: 'manual_stop' }),
    engine.stop('Fin manual.', 'success', { origin: 'user', reason: 'manual_stop' })
  ]);

  const log = await fs.readFile(streamLogPath, 'utf8');
  assert.equal((log.match(/ACCIÓN DE STREAM SOLICITADA/g) || []).length, 1);
  assert.equal((log.match(/ACCIÓN DE STREAM COMPLETADA/g) || []).length, 1);
  assert.match(log, /"transitionReason": "manual_stop"/);
  await fs.rm(root, { recursive: true, force: true });
});
