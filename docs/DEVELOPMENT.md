# Desarrollo de SAOViVO

## Gobierno visual

Antes de tocar la apariencia del producto, leer `docs/brand/IDENTIDAD_BASE.md`. Cualquier cambio de UI, layout, color, tipografía, Logo, Leyenda, iconos, instalador o capturas debe respetar ese manual. Las excepciones y reglas nuevas se consultan y deciden en la tarea de Codex **SAOViVO — Marca y look**; no se establecen desde una tarea técnica.

## Arquitectura

- `src/main.js`: ciclo de vida de Electron, persistencia cifrada e IPC.
- `src/stream-engine.js`: metadata, preparación, cola, RTMPS, recuperación y logs.
- `src/media-source.js`: modelo y migración de fuentes `local`/`youtube`.
- `src/renderer/`: interfaz aislada mediante `contextIsolation` y preload.
- `Documentos/SAOViVO Data/logs`: evidencia operativa generada en ejecución.

## Pipeline de fuentes

1. Cada elemento declara `sourceType: local | youtube`; las colas anteriores sin tipo migran a YouTube.
2. Una fuente local se valida con FFmpeg y se normaliza desde el original de solo lectura hacia una copia temporal 720p30 H.264/AAC. Si no tiene audio, se agrega silencio.
3. Una fuente YouTube conserva el flujo existente de metadata/descarga con `yt-dlp` y normalización cuando hace falta.
4. La preparación se agenda secuencialmente, respetando cualquier mezcla y orden de fuentes.
5. Cuando los primeros tres videos están listos, se habilita el stream y el resto continúa en segundo plano.
6. FFmpeg concatena los archivos temporales reproducibles y mantiene una conexión RTMPS continua.
7. Al cerrar, se elimina `SAOViVO Data/temp`; los originales y los logs permanentes quedan intactos.

`ensureCoreRuntime()` valida únicamente FFmpeg. `ensureYouTubeRuntime()` descarga `yt-dlp` bajo demanda y solo puede alcanzarse desde metadata o preparación de fuentes YouTube.

## Comandos

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
npm.cmd run dist
npm.cmd run dist:installer
```

## Criterio de publicación

- Pruebas unitarias y `node --check` sin errores.
- Captura visual normal y MODIFY STACK con ocho videos.
- Identidad aplicada de acuerdo con `docs/brand/IDENTIDAD_BASE.md`; cualquier excepción o activo nuevo cuenta con decisión previa de **SAOViVO — Marca y look**.
- Transición local entre al menos dos archivos a través del pipeline FLV.
- Prueba de metadata desde el ejecutable empaquetado.
- Pruebas automatizadas de fuente local, preservación del original, audio silencioso, archivo faltante y cola mixta.
- Para distribución pública, todos los binarios deben firmarse con un certificado de firma de código reconocido por Windows.
- GitHub debe quedar preparado para la solicitud de SignPath según `docs/SIGNPATH_POST_GITHUB.md`.
- Inmediatamente después de publicar `v2.0.0`, enviar la solicitud a SignPath Foundation y registrar su estado como parte del cierre del release.

## Limitaciones conocidas

- La build de desarrollo no tiene certificado comercial y Smart App Control puede bloquearla.
- Si los tres primeros videos son extremadamente cortos y la conexión de descarga es muy lenta, FFmpeg puede alcanzar un archivo todavía no preparado; el motor conserva logs y reintenta la conexión.
- Por ahora solo se anuncia MP4 como formato local soportado.
- La validación de una transmisión real/no listada con dos transiciones y la prueba en otra computadora siguen siendo manuales.
