const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const packageJson = require('../package.json');

const root = path.join(__dirname, '..');

function readBmp(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.toString('ascii', 0, 2), 'BM');
  return {
    width: buffer.readInt32LE(18),
    height: buffer.readInt32LE(22),
    bitsPerPixel: buffer.readUInt16LE(28)
  };
}

function readIco(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.readUInt16LE(0), 0);
  assert.equal(buffer.readUInt16LE(2), 1);
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    entries.push({
      width: buffer[offset] || 256,
      height: buffer[offset + 1] || 256,
      bitsPerPixel: buffer.readUInt16LE(offset + 6)
    });
  }
  return entries;
}

test('Windows packaging uses the approved SAOViVO installer assets and Spanish assistant', () => {
  assert.equal(packageJson.build.win.icon, 'build/SAOViVO.ico');
  assert.equal(packageJson.build.nsis.installerIcon, 'build/SAOViVO.ico');
  assert.equal(packageJson.build.nsis.uninstallerIcon, 'build/SAOViVO.ico');
  assert.equal(packageJson.build.nsis.installerSidebar, 'build/installerSidebar.bmp');
  assert.equal(packageJson.build.nsis.uninstallerSidebar, 'build/uninstallerSidebar.bmp');
  assert.deepEqual(packageJson.build.nsis.installerLanguages, ['es_ES']);
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
});

test('installer storytelling preserves the revised canonical copy and capitalization', () => {
  const nsis = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
  assert.match(nsis, /MUI_WELCOMEPAGE_TITLE "Vas a instalar SAOViVO"/);
  assert.match(nsis, /El programa prepara links de YouTube y archivos locales para transmitirlos como un stream continuo\./);
  assert.match(nsis, /Cómo funciona/);
  assert.match(nsis, /01 · Elegí tus videos/);
  assert.match(nsis, /02 · Prepará tu canal/);
  assert.match(nsis, /03 · Transmití/);
  assert.match(nsis, /MUI_FINISHPAGE_TITLE "SAOViVO está listo"/);
  assert.match(nsis, /MUI_FINISHPAGE_RUN_TEXT "Abrir SAOViVO"/);
});

test('installer icon contains every approved opaque 32-bit resolution', () => {
  const entries = readIco(path.join(root, 'build', 'SAOViVO.ico'));
  assert.deepEqual(entries.map((entry) => entry.width), [16, 20, 24, 32, 40, 48, 64, 128, 256]);
  assert.deepEqual(entries.map((entry) => entry.height), [16, 20, 24, 32, 40, 48, 64, 128, 256]);
  assert.equal(entries.every((entry) => entry.bitsPerPixel === 32), true);
});

test('NSIS sidebars use the exact RGB24 dimensions', () => {
  assert.deepEqual(readBmp(path.join(root, 'build', 'installerSidebar.bmp')), { width: 164, height: 314, bitsPerPixel: 24 });
  assert.deepEqual(readBmp(path.join(root, 'build', 'uninstallerSidebar.bmp')), { width: 164, height: 314, bitsPerPixel: 24 });
});
