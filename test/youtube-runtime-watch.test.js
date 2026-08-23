const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { OFFICIAL_SOURCES, VIDEO_CANARY_ARGS, isYouTubeUrl, classifyReport, reportMarkdown, runWatch } = require('../scripts/check-youtube-runtime');

test('daily watch covers the three official YouTube sources', () => {
  assert.deepEqual(OFFICIAL_SOURCES.map((source) => source.url), [
    'https://developers.google.com/youtube/v3/revision_history',
    'https://developers.google.com/youtube/v3/live/revision_history',
    'https://developers.google.com/youtube/terms/revision-history'
  ]);
});

test('daily watch classifies actionable yt-dlp and canary changes without publishing', () => {
  assert.equal(classifyReport({ officialChanges: [], latestVersion: '2026.08.19', approvedVersion: '2026.08.19', canary: {} }), 'VERDE');
  assert.equal(classifyReport({ officialChanges: [{}], latestVersion: '2026.08.19', approvedVersion: '2026.08.19', canary: {} }), 'AMARILLO');
  assert.equal(classifyReport({ officialChanges: [], latestVersion: '2026.08.20', approvedVersion: '2026.08.19', releaseBody: 'YouTube player client fix', canary: {} }), 'ROJO');
  assert.equal(classifyReport({ officialChanges: [], latestVersion: '2026.08.19', approvedVersion: '2026.08.19', canary: { video: { status: 'failed' } } }), 'ROJO');
});

test('canary accepts only explicit HTTPS YouTube URLs', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=own'), true);
  assert.equal(isYouTubeUrl('https://youtu.be/own'), true);
  assert.equal(isYouTubeUrl('http://youtube.com/watch?v=own'), false);
  assert.equal(isYouTubeUrl('https://youtube.com.example.test/watch?v=own'), false);
});

test('video canary downloads only a minimal sample instead of metadata-only simulation', () => {
  assert.deepEqual(VIDEO_CANARY_ARGS, ['--test', '--no-playlist', '--no-warnings', '-f', 'bv*[height<=720]/bv*/ba']);
  assert.equal(VIDEO_CANARY_ARGS.includes('--simulate'), false);
});

test('report states that monitoring never publishes automatically', () => {
  const report = reportMarkdown({
    checkedAt: '2026-08-23T00:00:00Z',
    classification: 'VERDE',
    approved: { version: '2026.08.19' },
    latest: { version: '2026.08.19', htmlUrl: 'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19', windowsSha256: 'abc' },
    sources: OFFICIAL_SOURCES.map((source) => ({ ...source, changed: false })),
    canary: { 'Video propio': { status: 'omitida' } }
  });
  assert.match(report, /nunca modifica el manifiesto aprobado, crea releases ni publica binarios/);
});

test('network failures still write a sanitized RED report and minimum state before failing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-runtime-watch-'));
  const outputPath = path.join(root, 'report.md');
  const statePath = path.join(root, 'state.json');
  try {
    const result = await runWatch({
      outputPath,
      statePath,
      approvedPath: path.resolve(__dirname, '..', 'src', 'runtime', 'yt-dlp-approved.json'),
      fetchTextImpl: async () => { throw new Error('fetch failed Authorization: Bearer secret-token signed-url=https://private.test'); },
      fetchJsonImpl: async () => { throw new Error('fetch failed Authorization: Bearer secret-token signed-url=https://private.test'); },
      canaryCheckImpl: async () => ({ status: 'omitida' }),
      videoCanaryUrl: '',
      playlistCanaryUrl: ''
    });
    const report = await fs.readFile(outputPath, 'utf8');
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));

    assert.equal(result.classification, 'ROJO');
    assert.equal(result.exitCode, 1);
    assert.equal(state.classification, 'ROJO');
    assert.deepEqual(state.failedSources, [...OFFICIAL_SOURCES.map((source) => source.id), 'yt-dlp-github-releases']);
    assert.match(report, /Clasificación: \*\*ROJO\*\*/);
    assert.equal((report.match(/\*\*fallida\*\*/g) || []).length, 4);
    assert.doesNotMatch(report, /secret-token|private\.test|Authorization|fetch failed/);
    assert.doesNotMatch(JSON.stringify(state), /secret-token|private\.test|Authorization|fetch failed/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
