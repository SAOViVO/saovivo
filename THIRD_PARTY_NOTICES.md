# Componentes de terceros

SAOViVO 2.0 incorpora o utiliza los siguientes componentes principales. El detalle completo y las versiones exactas están en `package-lock.json`.

## FFmpeg y `ffmpeg-static`

- `ffmpeg-static` 5.3.0: `GPL-3.0-or-later`.
- Binario incluido en Windows: FFmpeg 6.1.1 `essentials_build`, construido por Gyan.dev con opciones GPL y Version 3.
- Build upstream: [`GyanD/codexffmpeg` 6.1.1](https://github.com/GyanD/codexffmpeg/releases/tag/6.1.1).
- Código fuente correspondiente de FFmpeg: commit [`e38092ef93`](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93).

El texto GPL aplicable se incluye en `LICENSE`. Las bibliotecas integradas por esa build conservan sus avisos y licencias upstream.

## yt-dlp

- Descargado bajo demanda desde [`yt-dlp/yt-dlp`](https://github.com/yt-dlp/yt-dlp).
- Licencia: The Unlicense.
- No se incluye dentro del repositorio ni se descarga cuando la cola utiliza solamente archivos locales.

## Electron

- Electron 37.2.0: MIT.
- El paquete de Electron incluye Chromium, Node.js y sus avisos de terceros correspondientes.

## Herramientas de desarrollo

- electron-builder 26.0.12: MIT.
- opentype.js 1.3.4: MIT.

Las marcas YouTube, GitHub, Windows y las restantes marcas de terceros pertenecen a sus respectivos titulares. SAOViVO no está afiliado ni respaldado por YouTube o Google.
