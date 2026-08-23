# SAOViVO 2.0.1

Actualización correctiva del acceso a videos de YouTube después del incidente general `403 Forbidden` de agosto de 2026.

## Correcciones

- Actualiza de forma controlada el runtime `yt-dlp` de `2026.07.04` al estable aprobado `2026.08.19`.
- Verifica URL oficial, canal estable, SHA-256 y versión antes de activar el ejecutable.
- Conserva la versión anterior y realiza rollback automático si la nueva copia falla al instalarse.
- Revisa una vez por día si existe un manifiesto estable aprobado más reciente; no instala nightly ni el último release sin aprobación.
- Reintenta una sola vez una descarga VOD cuando el error es compatible con un runtime obsoleto.
- Mantiene aisladas las colas locales y las fuentes YouTube Live del reintento de descarga VOD.

## Operación

El monitor diario de GitHub revisa las tres fuentes oficiales de YouTube y los releases de `yt-dlp`, clasifica el resultado y deja un informe como artefacto. No modifica código, no aprueba versiones y no publica automáticamente.

## Limitación conocida

Si YouTube cambia antes de que `yt-dlp` publique una corrección estable y SAOViVO la apruebe, los links pueden seguir fallando temporalmente. Los archivos locales permanecen disponibles.
