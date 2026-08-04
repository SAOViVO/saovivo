const fs = require('node:fs');
const path = require('node:path');
const opentype = require('opentype.js');

const root = path.resolve(__dirname, '..');
const masterPath = path.join(root, 'build', 'brand', 'masters', 'SAOViVO_Leyenda_Turquesa.svg');
const outputPath = path.join(root, 'src', 'renderer', 'assets', 'brand', 'SAOViVO_Leyenda_Turquesa_Outlined.svg');
const carbonPath = path.join(process.env.APPDATA || '', 'Adobe', 'CoreSync', 'plugins', 'livetype', 'w', '5558');

if (!fs.existsSync(masterPath)) throw new Error('Falta el SVG maestro de la Leyenda turquesa.');
if (!fs.existsSync(carbonPath)) throw new Error('Carbon Bold no está activa en Adobe Fonts.');

const master = fs.readFileSync(masterPath, 'utf8');
if (!master.includes('Carbon-Bold') || !master.includes('>SAOViVO</tspan>') || !master.includes('#00edff')) {
  throw new Error('El maestro de Leyenda no coincide con el arte oficial esperado.');
}

const font = opentype.loadSync(carbonPath);
const outline = font.getPath('SAOViVO', 1061.9597, 691.5828, 50.82, { kerning: true });
const bounds = outline.getBoundingBox();
if (bounds.x1 < 640 || bounds.x2 > 1277 || bounds.y1 < 375 || bounds.y2 > 708) {
  throw new Error(`La Leyenda outlined excede el recorte autorizado: ${JSON.stringify(bounds)}`);
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="SAOVIVO_Leyenda_Outlined" data-name="SAOVIVO Leyenda Outlined" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <path id="SAOViVO_turquesa_outlined" data-name="SAOViVO turquesa outlined" fill="#00edff" d="${outline.toPathData(4)}"/>
</svg>
`;

if (/<text\b/i.test(svg)) throw new Error('El derivado no puede contener texto vivo.');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, svg, 'utf8');
console.log(`Leyenda outlined generada: ${path.relative(root, outputPath)} (${bounds.x1.toFixed(2)}–${bounds.x2.toFixed(2)} px).`);
