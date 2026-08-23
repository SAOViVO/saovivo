# Incidente YouTube 403 — agosto de 2026

Fecha del diagnóstico: 2026-08-23.

## Resumen

SAOViVO podía leer metadata de los videos de YouTube, pero fallaba al descargar el archivo reproducible. Los videos quedaban en estado de reintento y YouTube devolvía `HTTP Error 403: Forbidden`.

## Capa afectada

**Entrada / descarga de YouTube.** No fue una falla de normalización local, FFmpeg, RTMPS ni YouTube Studio.

## Evidencia

- Runtime instalado en el equipo afectado: `yt-dlp 2026.07.04`.
- Respuesta repetida durante la descarga: `403 Forbidden`.
- Release estable que incorpora mantenimiento de clientes YouTube: `yt-dlp 2026.08.19`.
- El release elimina `android_vr` de los clientes predeterminados, agrega fallbacks y actualiza versiones de los clientes del reproductor.
- SHA-256 oficial del asset `yt-dlp.exe` 2026.08.19: `66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a`.

Fuentes upstream:

- https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19
- https://github.com/yt-dlp/yt-dlp/issues/17456
- https://github.com/yt-dlp/yt-dlp/pull/17461

## Causa confirmada

SAOViVO descargaba `yt-dlp.exe` solamente cuando el archivo no existía. Una vez instalado, no comprobaba su versión ni buscaba una versión estable aprobada. El runtime de julio quedó guardado indefinidamente aunque YouTube había cambiado el modo de entregar ciertos formatos.

## Alcance

- Afecta videos y playlists que requieren descarga mediante `yt-dlp`.
- No afecta archivos MP4 locales: ese pipeline no instala ni ejecuta `yt-dlp`.
- No cambia el transporte RTMPS.
- Las fuentes YouTube Live no pasan por el reintento de descarga de VOD; conservan su resolución al llegar su turno.

## Mitigación y corrección 2.0.1

1. Manifiesto versionado de runtime estable aprobado.
2. Comprobación diaria al primer uso de YouTube, con fallback al manifiesto incluido en la aplicación.
3. Descarga exclusiva desde el release oficial y verificación del SHA-256 y de `--version` antes y después de instalar.
4. Reemplazo atómico con una copia anterior verificada.
5. Rollback automático si la nueva copia no supera la verificación.
6. Un único reintento de una descarga VOD cuando el error es compatible con runtime obsoleto, después de forzar el control de actualización.

## Riesgo residual

`yt-dlp` es un proyecto independiente y no garantiza que cada cambio interno de YouTube tenga una corrección inmediata. Si YouTube cambia antes de que exista y se apruebe un runtime estable, SAOViVO puede detectar el patrón y reintentar una vez, pero no puede fabricar una solución segura. El monitor diario reduce el tiempo de detección; no elimina esa dependencia externa.
