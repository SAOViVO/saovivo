# Runbook — actualización y rollback de yt-dlp

## Objetivo

Actualizar el runtime de YouTube sin aceptar automáticamente cualquier release upstream y conservar una vuelta atrás verificable.

## Aprobar una nueva versión estable

1. Revisar el artefacto diario `youtube-runtime-watch-*` generado por `.github/workflows/youtube-runtime-watch.yml`.
2. Abrir el release estable oficial y confirmar que el cambio afecta a YouTube o resuelve el incidente observado.
3. Usar únicamente el asset Windows `yt-dlp.exe` y el SHA-256 publicado por GitHub para ese asset.
4. Actualizar `src/runtime/yt-dlp-approved.json` en un PR revisado:
   - `channel` debe seguir siendo `stable`;
   - `version` debe avanzar, nunca retroceder;
   - `url` debe ser `https://github.com/yt-dlp/yt-dlp/releases/download/VERSION/yt-dlp.exe`;
   - `sha256` debe coincidir con el digest oficial;
   - completar `releasedAt`, `approvedAt` y `notesUrl`.
5. Ejecutar `npm test` y la prueba manual con una URL propia configurable. No usar videos ajenos.
6. Publicar la modificación del manifiesto sólo después de QA. El workflow diario no modifica este archivo ni publica releases.

## Qué hace la aplicación

- Consulta como máximo una vez cada 24 horas el manifiesto aprobado de `main`.
- Si no hay red, usa el manifiesto incluido en la aplicación.
- Rechaza canales nightly, URLs ajenas al release oficial, hashes inválidos y downgrades.
- Descarga a un archivo nuevo, valida SHA-256 y `--version`, guarda `yt-dlp.previous.exe` y recién entonces activa el nuevo runtime.
- Si falla la verificación posterior, restaura automáticamente la copia anterior y bloquea esa versión hasta que se apruebe otra.

## Diagnóstico

La carpeta de runtime está bajo el `userData` de Electron, normalmente:

```powershell
$runtime = Join-Path $env:APPDATA 'SAOViVO\runtime'
Get-Content -LiteralPath (Join-Path $runtime 'yt-dlp-state.json')
& (Join-Path $runtime 'yt-dlp.exe') --version
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runtime 'yt-dlp.exe')
```

Nunca copiar al reporte cookies, tokens, stream keys ni URLs firmadas de reproducción.

## Rollback

El rollback normal es automático si una instalación no supera la verificación. Para un rollback operativo posterior:

1. Cerrar SAOViVO y confirmar que no quedan procesos `yt-dlp.exe`.
2. Leer `yt-dlp-state.json` y comprobar que `rollback.version` y `rollback.sha256` existen.
3. Verificar que el SHA-256 de `yt-dlp.previous.exe` coincide exactamente con `rollback.sha256`.
4. Usar `YtDlpRuntimeManager.rollback()` desde una tarea de mantenimiento o una prueba controlada. El método:
   - vuelve a verificar versión y hash;
   - intercambia las copias;
   - conserva el runtime actual hasta completar la restauración;
   - marca la versión fallida como bloqueada para evitar reinstalarla en el siguiente inicio.
5. Repetir la prueba con contenido propio y adjuntar los logs sanitizados.

No hacer rollback copiando archivos a ciegas ni desactivar la verificación de hash.

## Recuperación

Para salir del estado de rollback, aprobar una versión estable posterior en el manifiesto. La aplicación detectará que la versión aprobada cambió, descargará el nuevo asset y volverá a ejecutar toda la verificación.
