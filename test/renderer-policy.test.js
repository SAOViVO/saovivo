const test = require('node:test');
const assert = require('node:assert/strict');
const queuePolicy = require('../src/renderer/queue-policy');
const packageJson = require('../package.json');
const fs = require('node:fs');
const path = require('node:path');

test('removing the last item exits editing and leaves an empty usable queue', () => {
  const queue = [{ id: 'only' }];
  queue.splice(0, 1);
  assert.equal(queuePolicy.editingAfterRemoval(queue), false);
  assert.deepEqual(queue, []);
});

test('remove all during a stream retains only the active item', () => {
  const queue = [{ id: 'a' }, { id: 'live' }, { id: 'c' }];
  assert.deepEqual(queuePolicy.removeAll(queue, { streaming: true, activeIndex: 1 }).map((item) => item.id), ['live']);
  assert.deepEqual(queuePolicy.removeAll(queue, { streaming: false, activeIndex: 1 }), []);
});

test('queue source labels distinguish local, YouTube, Shorts and Live', () => {
  assert.equal(queuePolicy.sourceLabel({ sourceType: 'local' }), 'LOCAL');
  assert.equal(queuePolicy.sourceLabel({ sourceType: 'youtube' }), 'YOUTUBE');
  assert.equal(queuePolicy.sourceLabel({ sourceType: 'youtube', isVertical: true }), 'YOUTUBE SHORT');
  assert.equal(queuePolicy.sourceLabel({ sourceType: 'youtube', isLive: true, isVertical: true }), 'YOUTUBE LIVE');
});

test('queue summary exposes Live separately and keeps the known queue duration', () => {
  assert.deepEqual(queuePolicy.queueSummary([
    { duration: 120 },
    { duration: 0, isLive: true },
    { duration: 75 }
  ]), { hasLive: true, duration: 195 });
  assert.deepEqual(queuePolicy.queueSummary([{ duration: 120 }, { duration: 75 }]), { hasLive: false, duration: 195 });
});

test('queue durations are available before streaming, while editing, and for Live sources', () => {
  assert.equal(queuePolicy.durationLabel({ duration: 39 }), '0:39');
  assert.equal(queuePolicy.durationLabel({ duration: 3675 }), '1:01:15');
  assert.equal(queuePolicy.durationLabel({ duration: 0, isLive: true }), 'VIVO');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(renderer, /class="editing-end"><span class="duration">\$\{durationLabel\}<\/span>/);
});

test('mixed VOD and Live footer uses clock notation in the requested order', () => {
  assert.equal(queuePolicy.formatClock(1836), '30:36');
  assert.equal(queuePolicy.formatClock(5436), '1:30:36');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(renderer, /summary-live-plus">\+<\/b><b class="summary-live-badge">LIVE<\/b><b class="summary-live-separator">-<\/b>/);
});

test('stream key supports a native Paste context menu', () => {
  const root = path.join(__dirname, '..');
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  assert.match(renderer, /streamKeyInput\.addEventListener\('contextmenu'/);
  assert.match(preload, /showStreamKeyContextMenu/);
  assert.match(main, /label: 'Pegar', role: 'paste'/);
});

test('OUTPUT explains the required SAOViVO stop after ending a broadcast in Studio', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(renderer, /Si terminás el vivo desde YouTube Studio, usá STOP STREAM también en SAOViVO antes de volver a comenzar\./);
});

test('stop stream requires the explicit confirmation dialog', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(html, /id="stopConfirmModal"/);
  assert.match(html, /id="continueStream"/);
  assert.match(html, /id="confirmStop"/);
  assert.match(renderer, /if \(state\.streaming\) \{\s*openStopConfirmation\(\);\s*return;\s*\}/);
  assert.match(renderer, /elements\.confirmStop\.addEventListener\('click',[\s\S]*window\.saovivo\.stopStream\(\)/);
});

test('settings brand lockup uses the approved turquoise outlined composition and dynamic app version', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  assert.match(html, /SAOViVO_Logo_Turquesa\.svg/);
  assert.match(html, /SAOViVO_Leyenda_Turquesa_Outlined\.svg/);
  assert.match(css, /\.brand-version-strip \{[^}]*width: 392px;[^}]*height: 126px;[^}]*gap: 16px;[^}]*background: transparent;/);
  assert.match(css, /\.brand-signature \{[^}]*width: 240px;[^}]*height: 126px;[^}]*overflow: hidden;/);
  assert.match(css, /\.brand-signature img \{[^}]*left: -241\.13px;[^}]*top: -141\.019px;[^}]*width: 723\.391px;[^}]*height: 406\.907px;/);
  assert.match(css, /\.brand-version \{[^}]*width: 136px;[^}]*padding-top: 105\.5px;[^}]*color: #fff;[^}]*font-size: 11px;[^}]*line-height: 14px;[^}]*letter-spacing: \.08em;/);
  const outlined = fs.readFileSync(path.join(root, 'src', 'renderer', 'assets', 'brand', 'SAOViVO_Leyenda_Turquesa_Outlined.svg'), 'utf8');
  assert.doesNotMatch(outlined, /<text\b/i);
  assert.match(outlined, /<path\b/);
  assert.match(renderer, /getAppVersion\(\)/);
  assert.match(preload, /ipcRenderer\.invoke\('app:version'\)/);
  assert.match(main, /ipcMain\.handle\('app:version', \(\) => app\.getVersion\(\)\)/);
});

test('NSIS deletes app state on real uninstall while electron-builder preserves updates', () => {
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, true);
});
