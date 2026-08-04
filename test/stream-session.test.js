const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { StreamEngine } = require('../src/stream-engine');

function makeEngine(events = []) {
  return new StreamEngine({
    appDataPath: path.join(os.tmpdir(), 'saovivo-session-profile'),
    operationalPath: path.join(os.tmpdir(), `saovivo-session-${Math.random().toString(16).slice(2)}`),
    ffmpegPath: __filename,
    notify: (event) => events.push(event),
    powerManager: { start: () => 1, isStarted: () => true, stop: () => {} }
  });
}

test('stop is idempotent and finalizes one session exactly once', async () => {
  const events = [];
  const engine = makeEngine(events);
  engine.isStreaming = true;
  engine.sessionGeneration = 7;
  engine.ffmpeg = { exitCode: null, signalCode: null };
  let terminations = 0;
  engine.terminateWorkerTree = async () => { terminations += 1; };
  const logs = [];
  engine.logTechnical = (scope) => logs.push(scope);

  const [first, second] = await Promise.all([engine.stop('Final manual.'), engine.stop('Final manual.')]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(terminations, 1);
  assert.equal(logs.filter((scope) => scope === 'STREAM FINALIZADO').length, 1);
  assert.equal(events.filter((event) => event.stopped).length, 1);
});

test('stop invalidates a pending reconnect timer', async () => {
  const engine = makeEngine();
  engine.isStreaming = true;
  engine.sessionGeneration = 3;
  let launches = 0;
  engine.launchFfmpeg = () => { launches += 1; };
  engine.retryTimer = setTimeout(() => engine.launchFfmpeg(3), 30);

  await engine.stop();
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(launches, 0);
  assert.equal(engine.retryTimer, null);
});

test('late FFmpeg exit and progress from an ended generation are ignored', async () => {
  const events = [];
  const engine = makeEngine(events);
  engine.isStreaming = true;
  engine.sessionGeneration = 11;
  const oldPublisher = { exitCode: null, signalCode: null };
  engine.ffmpeg = oldPublisher;
  engine.terminateWorkerTree = async () => {};
  await engine.stop();
  const eventCount = events.length;

  engine.handleFfmpegExit(null, 'late close', 11, oldPublisher);
  engine.handleProgress('out_time_us=2000000\n', 11);

  assert.equal(events.length, eventCount);
  assert.equal(engine.retryTimer, null);
  assert.equal(engine.liveConfirmed, false);
});

test('real transport failures still schedule reconnect while the session is active', () => {
  const events = [];
  const engine = makeEngine(events);
  engine.isStreaming = true;
  engine.sessionGeneration = 5;
  engine.stopPlaybackWorker = async () => {};
  const publisher = {};
  engine.ffmpeg = publisher;
  let launches = 0;
  engine.launchFfmpeg = (generation) => { if (generation === 5) launches += 1; };

  engine.handleFfmpegExit(1, 'network connection lost', 5, publisher);
  assert.ok(engine.retryTimer);
  engine.retryTimer._onTimeout();
  clearTimeout(engine.retryTimer);

  assert.equal(launches, 1);
  assert.equal(events.some((event) => /reintentamos/i.test(event.message)), true);
});

test('queue updates retain the active clip but reorder pending clips', () => {
  const engine = makeEngine();
  engine.isStreaming = true;
  engine.queue = [{ id: 'active' }, { id: 'b' }, { id: 'c' }];
  engine.activeItemId = 'active';

  const result = engine.updateQueue([{ id: 'c' }, { id: 'b' }]);

  assert.deepEqual(result.queue.map((item) => item.id), ['active', 'c', 'b']);
  assert.equal(result.activeIndex, 0);
});

test('manual next and previous navigation switch the active source without ending the publisher', async () => {
  const engine = makeEngine();
  engine.isStreaming = true;
  engine.sessionGeneration = 4;
  engine.queue = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }];
  engine.activeItemId = 'b';
  const starts = [];
  engine.stopPlaybackWorker = async () => {};
  engine.startPlaybackAt = async (index, generation) => {
    starts.push({ index, generation });
    engine.activeItemId = engine.queue[index].id;
  };

  await engine.navigate('next');
  await engine.navigate('previous');

  assert.deepEqual(starts, [{ index: 2, generation: 4 }, { index: 1, generation: 4 }]);
  assert.equal(engine.isStreaming, true);
});

test('a YouTube Live source advances automatically after a clean end', async () => {
  const engine = makeEngine();
  engine.isStreaming = true;
  engine.sessionGeneration = 9;
  const live = { id: 'live', title: 'Vivo', isLive: true };
  engine.queue = [live, { id: 'next', title: 'Siguiente' }];
  let advanced = null;
  engine.advancePlayback = async (itemId, generation) => { advanced = { itemId, generation }; };

  await engine.handlePlaybackCompletion(live, 9, false);

  assert.deepEqual(advanced, { itemId: 'live', generation: 9 });
});

test('a temporarily interrupted YouTube Live source waits and retries instead of skipping it', async () => {
  const events = [];
  const engine = makeEngine(events);
  engine.isStreaming = true;
  engine.sessionGeneration = 12;
  const live = { id: 'live', title: 'Vivo', isLive: true, url: 'https://youtube.test/live' };
  engine.queue = [live, { id: 'next', title: 'Siguiente' }];
  engine.readSingleYouTube = async () => ({ isLive: true });
  const retries = [];
  engine.startPlaybackAt = async (index, generation) => { retries.push({ index, generation }); };

  await engine.handlePlaybackCompletion(live, 12, true);
  assert.ok(engine.liveRetryTimer);
  engine.liveRetryTimer._onTimeout();
  clearTimeout(engine.liveRetryTimer);

  assert.deepEqual(retries, [{ index: 0, generation: 12 }]);
  assert.equal(events.some((event) => /cola queda esperando/i.test(event.message)), true);
});

test('publisher health uses real FFmpeg progress and records a buffering risk when output stalls', () => {
  const engine = makeEngine();
  engine.isStreaming = true;
  engine.sessionGeneration = 21;
  const logs = [];
  engine.logTechnical = (scope, detail) => logs.push({ scope, detail });

  engine.handleProgress([
    'frame=900', 'fps=29.97', 'bitrate=4160.0kbits/s',
    'dup_frames=3', 'drop_frames=1', 'speed=1.00x', 'out_time_us=30000000', ''
  ].join('\n'), 21);
  const health = engine.publisherHealthSnapshot();
  assert.equal(health.outTimeSeconds, 30);
  assert.equal(health.frame, 900);
  assert.equal(health.fps, 29.97);
  assert.equal(health.duplicatedFrames, 3);
  assert.equal(health.droppedFrames, 1);

  engine.lastPublisherProgressAt = Date.now() - 7000;
  engine.startPublisherHealthMonitor(21);
  engine.publisherHealthTimer._onTimeout();
  engine.stopPublisherHealthMonitor();

  assert.equal(logs.some(({ scope }) => /RIESGO DE BUFFERING/.test(scope)), true);
  assert.equal(logs.some(({ detail }) => /"outTimeSeconds": 30/.test(detail)), true);
});

test('technical sanitization removes stream keys and signed Live playback URLs', () => {
  const engine = makeEngine();
  engine.streamKey = 'secret-stream-key';
  const safe = engine.sanitizeDiagnostic('secret-stream-key https://rr1---sn.test.googlevideo.com/videoplayback?expire=1&sig=secret');

  assert.doesNotMatch(safe, /secret-stream-key|googlevideo|sig=secret/i);
  assert.match(safe, /\[STREAM_KEY\]/);
  assert.match(safe, /\[LIVE_URL_REDACTED\]/);
});

test('automatic transition logs distinguish natural end, source error and Live end', async () => {
  const engine = makeEngine();
  engine.isStreaming = true;
  engine.sessionGeneration = 31;
  engine.queue = [{ id: 'from', title: 'Origen' }, { id: 'to', title: 'Destino' }];
  engine.activeItemId = 'from';
  engine.startPlaybackAt = async () => true;
  const details = [];
  engine.logTechnical = (scope, detail) => {
    if (/ACCIÓN DE STREAM/.test(scope)) details.push(detail);
  };

  await engine.advancePlayback('from', 31, { playedSeconds: 12, reason: 'natural_end' });
  await engine.advancePlayback('from', 31, { failed: true, playedSeconds: 7, reason: 'source_error' });
  await engine.advancePlayback('from', 31, { playedSeconds: 25, reason: 'live_ended' });

  const joined = details.join('\n');
  assert.match(joined, /"transitionReason": "natural_end"/);
  assert.match(joined, /"transitionReason": "source_error"/);
  assert.match(joined, /"transitionReason": "live_ended"/);
  assert.match(joined, /"playedSeconds": 25/);
});
