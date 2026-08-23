const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { OFFICIAL_SOURCES, VIDEO_CANARY_ARGS, FINGERPRINT_SCHEMA_VERSION, normalizedFingerprint, isYouTubeUrl, classifyReport, reportMarkdown, runWatch } = require('../scripts/check-youtube-runtime');

test('daily watch covers the three official YouTube sources', () => {
  assert.deepEqual(OFFICIAL_SOURCES.map((source) => source.url), [
    'https://developers.google.com/youtube/v3/revision_history',
    'https://developers.google.com/youtube/v3/live/revision_history',
    'https://developers.google.com/youtube/terms/revision-history'
  ]);
});

test('revision fingerprint ignores dynamic HTML while preserving visible revision text', () => {
  const firstRender = `
    <html data-build="alpha"><script nonce="one">window.requestId = 'A'</script><main>
      <article class="devsite-article" data-render="100">
        <h1 id="revision-history">Revision History</h1>
        <h2>Page Summary</h2><p>Generated summary request A.</p>
        <h2 id="august-6-2026">August 6, 2026</h2>
        <p>The API added support for a new field &amp; updated its documentation.</p>
        <devsite-page-rating>Request A</devsite-page-rating>
        <footer>Last updated 2026-08-23 UTC.</footer>
      </article>
    </main></html>`;
  const secondRender = `
    <html data-build="beta"><script nonce="two">window.requestId = 'B'</script><main>
      <article class="devsite-article compact" data-render="200">
        <h1 data-tracking-id="changed">Revision History</h1>
        <h2>Page Summary</h2><p>Generated summary request B with different visible text.</p>
        <h2 id="generated-984">August 6, 2026</h2>
        <p>The API added support for a new field &amp; updated its documentation.</p>
        <devsite-page-rating>Request B</devsite-page-rating>
        <footer>Last updated 2026-08-24 UTC.</footer>
      </article>
    </main></html>`;

  assert.equal(normalizedFingerprint(firstRender), normalizedFingerprint(secondRender));
});

test('revision fingerprint changes when the visible revision content changes', () => {
  const before = '<article><h2>August 6, 2026</h2><p>The API added support for field A.</p></article>';
  const after = '<article><h2>August 6, 2026</h2><p>The API added support for field B.</p></article>';
  assert.notEqual(normalizedFingerprint(before), normalizedFingerprint(after));
});

test('semantic fingerprint schema starts a clean baseline instead of comparing legacy HTML hashes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-fingerprint-schema-'));
  const outputPath = path.join(root, 'report.md');
  const statePath = path.join(root, 'state.json');
  await fs.writeFile(statePath, JSON.stringify({
    latestStableVersion: '2026.08.19',
    sourceFingerprints: Object.fromEntries(OFFICIAL_SOURCES.map((source) => [source.id, 'a'.repeat(64)]))
  }));
  try {
    const result = await runWatch({
      outputPath,
      statePath,
      approvedPath: path.resolve(__dirname, '..', 'src', 'runtime', 'yt-dlp-approved.json'),
      fetchTextImpl: async () => '<article><h2>August 6, 2026</h2><p>Stable revision content.</p></article>',
      fetchJsonImpl: async () => ({ tag_name: '2026.08.19', body: '', assets: [{ name: 'yt-dlp.exe', digest: `sha256:${'b'.repeat(64)}` }] }),
      canaryCheckImpl: async () => ({ status: 'omitida' }),
      videoCanaryUrl: '',
      playlistCanaryUrl: ''
    });
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.equal(result.classification, 'VERDE');
    assert.equal(state.fingerprintSchemaVersion, FINGERPRINT_SCHEMA_VERSION);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
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
