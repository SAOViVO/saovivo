const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.on('window-all-closed', (event) => event.preventDefault());

const projectRoot = path.resolve(__dirname, '..');
const logoPath = path.join(projectRoot, 'build', 'brand', 'masters', 'SAOViVO_Logo_Turquesa.svg');
const legendPath = path.join(projectRoot, 'src', 'renderer', 'assets', 'brand', 'SAOViVO_Leyenda_Turquesa_Outlined.svg');
const outputDir = path.join(projectRoot, 'assets', 'brand', 'github');
const userDataDir = path.join(projectRoot, 'tmp', 'github-brand-electron');
fs.mkdirSync(userDataDir, { recursive: true });
app.setPath('userData', userDataDir);
app.commandLine.appendSwitch('disk-cache-dir', path.join(userDataDir, 'cache'));

function readInlineSvg(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^<\?xml[^>]*>\s*/i, '');
}

function documentFor({ width, height, layers }) {
  const markup = layers.map((layer) => (
    `<div class="layer" style="left:${layer.left}px;top:${layer.top}px;width:${layer.width}px;height:${layer.height}px">${layer.svg}</div>`
  )).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#232322}.layer{position:absolute}.layer svg{display:block;width:100%;height:100%}</style></head><body>${markup}</body></html>`;
}

async function render({ width, height, layers, label }) {
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
    const html = documentFor({ width, height, layers });
    await window.loadURL(`data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`);
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    const size = image.getSize();
    if (size.width !== width || size.height !== height) {
      throw new Error(`${label}: tamaño ${size.width}x${size.height}; esperado ${width}x${height}`);
    }
    assertOpaqueBrandBackground(image, label);
    return image.toPNG();
  } finally {
    window.destroy();
  }
}

function assertOpaqueBrandBackground(image, label) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  for (let index = 3; index < bitmap.length; index += 4) {
    if (bitmap[index] !== 255) throw new Error(`${label}: transparencia en píxel ${Math.floor(index / 4)}`);
  }
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    const offset = (y * width + x) * 4;
    const [blue, green, red] = bitmap.subarray(offset, offset + 3);
    if (red !== 35 || green !== 35 || blue !== 34) throw new Error(`${label}: esquina ${x},${y} no es #232322`);
  }
}

function layerFromCrop(svg, crop, target) {
  const scale = target.width / crop.width;
  return {
    svg,
    left: target.left - crop.x * scale,
    top: target.top - crop.y * scale,
    width: 1920 * scale,
    height: 1080 * scale
  };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(logoPath)) throw new Error(`Falta el Logo maestro: ${logoPath}`);
  if (!fs.existsSync(legendPath)) throw new Error(`Falta la Leyenda outlined: ${legendPath}`);

  const logo = readInlineSvg(logoPath);
  const legend = readInlineSvg(legendPath);
  if (/<text\b/i.test(legend)) throw new Error('La Leyenda para GitHub no puede contener texto vivo.');
  const crop = { x: 640, y: 375, width: 637, height: 333 };

  const avatarTarget = { left: 30, top: (500 - (440 * crop.height / crop.width)) / 2, width: 440 };
  const avatar = await render({
    width: 500,
    height: 500,
    label: 'avatar',
    layers: [layerFromCrop(logo, crop, avatarTarget)]
  });
  const avatarPath = path.join(outputDir, 'SAOViVO-GitHub-avatar-500.png');
  fs.writeFileSync(avatarPath, avatar);

  const socialTarget = { left: 128, top: (640 - (1024 * crop.height / crop.width)) / 2, width: 1024 };
  const socialLayer = layerFromCrop(logo, crop, socialTarget);
  const social = await render({
    width: 1280,
    height: 640,
    label: 'social-preview',
    layers: [socialLayer, { ...socialLayer, svg: legend }]
  });
  const socialPath = path.join(outputDir, 'SAOViVO-GitHub-social-preview-1280x640.png');
  fs.writeFileSync(socialPath, social);

  for (const filePath of [avatarPath, socialPath]) {
    const bytes = fs.statSync(filePath).size;
    if (bytes >= 1024 * 1024) throw new Error(`${path.basename(filePath)} supera 1 MB (${bytes} bytes).`);
    console.log(`${path.relative(projectRoot, filePath)}: ${bytes} bytes`);
  }
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
