const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { YtDlpRuntimeManager, validateApprovedManifest } = require('../src/ytdlp-runtime');
const { StreamEngine } = require('../src/stream-engine');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function manifestFor(version, content) {
  return {
    schemaVersion: 1,
    channel: 'stable',
    version,
    assetName: 'yt-dlp.exe',
    url: `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp.exe`,
    sha256: hash(content),
    releasedAt: `${version.replace(/\./g, '-')}T00:00:00Z`,
    approvedAt: '2026-08-23T00:00:00Z'
  };
}

async function makeManager({ oldContent = null, newContent = 'runtime-2026.08.19', postInstallFailure = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-ytdlp-runtime-'));
  const binaryPath = path.join(root, 'yt-dlp.exe');
  const bundledManifestPath = path.join(root, 'approved.json');
  const approved = manifestFor('2026.08.19', newContent);
  await fs.writeFile(bundledManifestPath, JSON.stringify(approved));
  if (oldContent !== null) await fs.writeFile(binaryPath, oldContent);
  let downloads = 0;
  let remoteChecks = 0;
  const manager = new YtDlpRuntimeManager({
    basePath: root,
    binaryPath,
    bundledManifestPath,
    now: () => Date.parse('2026-08-23T12:00:00Z'),
    fetchManifest: async () => { remoteChecks += 1; throw new Error('offline fixture'); },
    download: async (_url, destination) => { downloads += 1; await fs.writeFile(destination, newContent); },
    runCommand: async (command) => {
      const content = await fs.readFile(command, 'utf8');
      if (content === newContent) {
        if (postInstallFailure && command === binaryPath) throw new Error('post-install fixture failure');
        return { stdout: '2026.08.19\n', stderr: '', exitCode: 0 };
      }
      if (content === oldContent) return { stdout: '2026.07.04\n', stderr: '', exitCode: 0 };
      throw new Error('unknown fixture runtime');
    }
  });
  return { root, binaryPath, approved, manager, downloads: () => downloads, remoteChecks: () => remoteChecks };
}

test('approved manifest accepts only pinned stable yt-dlp Windows releases', () => {
  const valid = manifestFor('2026.08.19', 'runtime');
  assert.equal(validateApprovedManifest(valid).version, '2026.08.19');
  assert.throws(() => validateApprovedManifest({ ...valid, channel: 'nightly' }), /canal estable/);
  assert.throws(() => validateApprovedManifest({ ...valid, url: 'https://example.com/yt-dlp.exe' }), /release oficial/);
  assert.throws(() => validateApprovedManifest({ ...valid, sha256: '1234' }), /SHA-256/);
  assert.throws(() => validateApprovedManifest(valid, { minimumVersion: '2026.08.20' }), /versión anterior/);
});

test('outdated runtime is replaced by the bundled approved stable and keeps a verified rollback', async () => {
  const fixture = await makeManager({ oldContent: 'runtime-2026.07.04' });
  try {
    const result = await fixture.manager.ensure();
    assert.equal(result.updated, true);
    assert.equal(result.version, '2026.08.19');
    assert.equal(await fs.readFile(fixture.binaryPath, 'utf8'), 'runtime-2026.08.19');
    assert.equal(await fs.readFile(path.join(fixture.root, 'yt-dlp.previous.exe'), 'utf8'), 'runtime-2026.07.04');
    const state = JSON.parse(await fs.readFile(path.join(fixture.root, 'yt-dlp-state.json'), 'utf8'));
    assert.equal(state.installed.version, '2026.08.19');
    assert.equal(state.rollback.version, '2026.07.04');
    assert.equal(fixture.downloads(), 1);
    assert.equal(fixture.remoteChecks(), 1);

    const second = await fixture.manager.ensure();
    assert.equal(second.updated, false);
    assert.equal(fixture.downloads(), 1);
    assert.equal(fixture.remoteChecks(), 1, 'el manifiesto remoto no debe consultarse más de una vez por día');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('manual rollback restores the verified previous runtime and holds the failed version', async () => {
  const fixture = await makeManager({ oldContent: 'runtime-2026.07.04' });
  try {
    await fixture.manager.ensure();
    const restored = await fixture.manager.rollback();
    assert.equal(restored.version, '2026.07.04');
    assert.equal(await fs.readFile(fixture.binaryPath, 'utf8'), 'runtime-2026.07.04');

    const held = await fixture.manager.ensure();
    assert.equal(held.rollbackHeld, true);
    assert.equal(held.version, '2026.07.04');
    assert.equal(fixture.downloads(), 1, 'no debe reinstalar una versión que el rollback dejó bloqueada');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('hash mismatch rejects the download without replacing the current runtime', async () => {
  const fixture = await makeManager({ oldContent: 'runtime-2026.07.04' });
  fixture.manager.download = async (_url, destination) => fs.writeFile(destination, 'tampered-runtime');
  try {
    await assert.rejects(fixture.manager.ensure(), /SHA-256/);
    assert.equal(await fs.readFile(fixture.binaryPath, 'utf8'), 'runtime-2026.07.04');
    await assert.rejects(fs.access(path.join(fixture.root, 'yt-dlp.previous.exe')));
    assert.deepEqual((await fs.readdir(fixture.root)).filter((name) => name.endsWith('.new')), []);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('failed post-install verification automatically restores the previous runtime', async () => {
  const fixture = await makeManager({ oldContent: 'runtime-2026.07.04', postInstallFailure: true });
  try {
    await assert.rejects(fixture.manager.ensure(), /después de instalarse/);
    assert.equal(await fs.readFile(fixture.binaryPath, 'utf8'), 'runtime-2026.07.04');
    assert.deepEqual((await fs.readdir(fixture.root)).filter((name) => name.endsWith('.new')), []);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('a 403-compatible YouTube download updates and retries exactly once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-ytdlp-retry-'));
  const engine = new StreamEngine({
    appDataPath: path.join(root, 'profile'),
    operationalPath: path.join(root, 'data'),
    ffmpegPath: __filename,
    notify: () => {},
    powerManager: { start: () => 1, isStarted: () => true, stop: () => {} }
  });
  await fs.mkdir(engine.mediaPath, { recursive: true });
  const safeId = 'video-403';
  await fs.writeFile(path.join(engine.mediaPath, `${safeId}.source.mp4.part`), 'partial');
  let runs = 0;
  let forcedChecks = 0;
  engine.run = async () => {
    runs += 1;
    if (runs === 1) {
      const error = new Error('HTTP Error 403: Forbidden');
      error.details = 'ERROR: unable to download video data: HTTP Error 403: Forbidden';
      error.exitCode = 1;
      throw error;
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  };
  engine.ensureYouTubeRuntime = async (options) => { if (options.forceCheck) forcedChecks += 1; };

  try {
    await engine.runYouTubeDownloadWithRecovery({ id: safeId }, [], {}, safeId);
    assert.equal(runs, 2);
    assert.equal(forcedChecks, 1);
    await assert.rejects(fs.access(path.join(engine.mediaPath, `${safeId}.source.mp4.part`)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('non-runtime download errors are not retried', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saovivo-ytdlp-no-retry-'));
  const engine = new StreamEngine({
    appDataPath: path.join(root, 'profile'),
    operationalPath: path.join(root, 'data'),
    ffmpegPath: __filename,
    notify: () => {},
    powerManager: { start: () => 1, isStarted: () => true, stop: () => {} }
  });
  let runs = 0;
  let forcedChecks = 0;
  engine.run = async () => {
    runs += 1;
    const error = new Error('network timed out');
    error.details = 'network timed out';
    throw error;
  };
  engine.ensureYouTubeRuntime = async () => { forcedChecks += 1; };
  try {
    await assert.rejects(engine.runYouTubeDownloadWithRecovery({ id: 'network' }, [], {}, 'network'), /network timed out/);
    assert.equal(runs, 1);
    assert.equal(forcedChecks, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
