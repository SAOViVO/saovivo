const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.on('window-all-closed', (event) => event.preventDefault());

const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const brandDir = path.join(buildDir, 'brand');
const masterDir = path.join(brandDir, 'masters');
const qaDir = path.join(brandDir, 'qa');
const logoPath = path.join(masterDir, 'SAOViVO_Logo_Turquesa.svg');
const legendPath = path.join(masterDir, 'SAOViVO_Leyenda_Turquesa.svg');
const carbonPath = path.join(process.env.APPDATA || '', 'Adobe', 'CoreSync', 'plugins', 'livetype', 'w', '5558');

function readInlineSvg(file) {
  return fs.readFileSync(file, 'utf8').replace(/^<\?xml[^>]*>\s*/i, '');
}

function htmlDocument({ width, height, layers = [], fontData = '' }) {
  const fontCss = fontData
    ? `@font-face{font-family:Carbon;src:url(data:font/otf;base64,${fontData}) format('opentype');font-weight:700;}@font-face{font-family:Carbon-Bold;src:url(data:font/otf;base64,${fontData}) format('opentype');font-weight:700;}`
    : '';
  const markup = layers.map((layer) => `<div class="layer" style="left:${layer.left}px;top:${layer.top}px;width:${layer.width}px;height:${layer.height}px">${layer.svg}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#232322}.layer{position:absolute}.layer svg{display:block;width:100%;height:100%}</style></head><body>${markup}</body></html>`;
}

async function renderPage({ width, height, layers, fontData }) {
  const renderFile = path.join(qaDir, `.installer-render-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
  const window = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#232322',
    webPreferences: { backgroundThrottling: false }
  });
  try {
    const html = htmlDocument({ width, height, layers, fontData });
    fs.writeFileSync(renderFile, html, 'utf8');
    await window.loadFile(renderFile);
    await window.webContents.executeJavaScript('document.fonts.ready');
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    const size = image.getSize();
    if (size.width !== width || size.height !== height) throw new Error(`Render inesperado: ${size.width}x${size.height}; esperado ${width}x${height}`);
    return image;
  } finally {
    window.destroy();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(renderFile, { force: true });
        break;
      } catch (error) {
        if (error.code !== 'EBUSY' || attempt === 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
}

function assertOpaque(image, label) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  for (let index = 3; index < bitmap.length; index += 4) {
    if (bitmap[index] !== 255) throw new Error(`${label} contiene transparencia en ${Math.floor(index / 4)}`);
  }
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  for (const [x, y] of corners) {
    const offset = (y * width + x) * 4;
    const [blue, green, red] = bitmap.subarray(offset, offset + 3);
    if (red !== 35 || green !== 35 || blue !== 34) throw new Error(`${label} no conserva #232322 en ${x},${y}`);
  }
}

function createIco(entries) {
  const directorySize = 6 + entries.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let dataOffset = directorySize;
  entries.forEach(({ size, png }, index) => {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += png.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.png)]);
}

function createBmp24(image) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const bmp = Buffer.alloc(54 + pixelBytes);
  bmp.write('BM', 0, 2, 'ascii');
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(pixelBytes, 34);
  bmp.writeInt32LE(3780, 38);
  bmp.writeInt32LE(3780, 42);
  for (let outputY = 0; outputY < height; outputY += 1) {
    const sourceY = height - 1 - outputY;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4;
      const target = 54 + outputY * rowStride + x * 3;
      bmp[target] = bitmap[source];
      bmp[target + 1] = bitmap[source + 1];
      bmp[target + 2] = bitmap[source + 2];
    }
  }
  return bmp;
}

async function main() {
  fs.mkdirSync(qaDir, { recursive: true });
  for (const file of fs.readdirSync(qaDir)) {
    if (file.startsWith('.installer-render-') && file.endsWith('.html')) {
      fs.rmSync(path.join(qaDir, file), { force: true });
    }
  }
  if (!fs.existsSync(logoPath) || !fs.existsSync(legendPath)) throw new Error('Faltan los SVG maestros turquesa del instalador.');
  if (!fs.existsSync(carbonPath)) throw new Error('Carbon Bold no está activa en Adobe Fonts. Activala antes de regenerar la gráfica lateral.');

  const logoSvg = readInlineSvg(logoPath);
  const legendSvg = readInlineSvg(legendPath);
  const fontData = fs.readFileSync(carbonPath).toString('base64');

  const iconScale = 896 / 637;
  const iconLayer = {
    svg: logoSvg,
    left: 64 - 640 * iconScale,
    top: 277.8 - 375 * iconScale,
    width: 1920 * iconScale,
    height: 1080 * iconScale
  };
  const iconMaster = await renderPage({ width: 1024, height: 1024, layers: [iconLayer] });
  assertOpaque(iconMaster, 'Icon master');
  fs.writeFileSync(path.join(brandDir, 'SAOViVO-icon-master.png'), iconMaster.toPNG());

  const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const iconEntries = iconSizes.map((size) => {
    const resized = iconMaster.resize({ width: size, height: size, quality: 'best' });
    assertOpaque(resized, `Icon ${size}`);
    const png = resized.toPNG();
    fs.writeFileSync(path.join(qaDir, `icon-${size}.png`), png);
    return { size, png };
  });
  fs.writeFileSync(path.join(buildDir, 'SAOViVO.ico'), createIco(iconEntries));

  const sidebarScale = 140 / 637;
  const sidebarLeft = 12 - 640 * sidebarScale;
  const sidebarTop = 24 + (74 - 333 * sidebarScale) / 2 - 375 * sidebarScale;
  const sidebarLayer = {
    left: sidebarLeft,
    top: sidebarTop,
    width: 1920 * sidebarScale,
    height: 1080 * sidebarScale
  };
  const sidebar = await renderPage({
    width: 164,
    height: 314,
    fontData,
    layers: [{ ...sidebarLayer, svg: logoSvg }, { ...sidebarLayer, svg: legendSvg }]
  });
  assertOpaque(sidebar, 'Installer sidebar');
  fs.writeFileSync(path.join(qaDir, 'installerSidebar.png'), sidebar.toPNG());
  fs.writeFileSync(path.join(buildDir, 'installerSidebar.bmp'), createBmp24(sidebar));

  const uninstallerSidebar = await renderPage({ width: 164, height: 314, layers: [] });
  assertOpaque(uninstallerSidebar, 'Uninstaller sidebar');
  fs.writeFileSync(path.join(buildDir, 'uninstallerSidebar.bmp'), createBmp24(uninstallerSidebar));

  console.log(`Generados: SAOViVO.ico (${iconEntries.length} resoluciones), installerSidebar.bmp y uninstallerSidebar.bmp.`);
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
