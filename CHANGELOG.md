# Changelog

Todas las diferencias relevantes entre versiones de SAOViVO se registran aquí.

## 2.0.1 — 2026-08-23

- Runtime `yt-dlp` estable aprobado `2026.08.19`, con manifiesto versionado y control diario.
- Verificación de URL oficial, canal, SHA-256 y versión antes y después de actualizar.
- Backup verificable y rollback automático ante una instalación fallida.
- Reintento único de descargas YouTube afectadas por `403` u otra señal compatible con runtime obsoleto.
- Monitor diario de fuentes oficiales de YouTube y releases de `yt-dlp`, con clasificación y artefacto accionable sin publicación automática.
- Los archivos locales continúan sin instalar ni ejecutar `yt-dlp`; las fuentes Live no pasan por el reintento de descarga VOD.

## 2.0.0 — 2026-08-04

- Nueva aplicación de escritorio autocontenida para Windows, reimplementada en Electron.
- Cola continua con archivos MP4 locales, videos, playlists, Shorts y fuentes Live de YouTube.
- Colas mixtas, edición durante el vivo, navegación, loop, preparación en segundo plano y continuidad RTMPS.
- Instalador y portable con la identidad actual de SAOViVO.
- Logs operativos sanitizados, reconexión y mensajes accionables para fallas de YouTube.
- El proyecto pasa a `GPL-3.0-or-later`, con privacidad, seguridad, terceros y autoría documentados.
- La arquitectura Go/React anterior queda preservada en el historial como antecedente y no representa el código vigente.

## 0.4.1 RC — actualización 2026-08-04

- El instalador usa el copy revisado `Vas a instalar SAOViVO`, capitalización normal y cierre `SAOViVO está listo` / `Abrir SAOViVO`.
- Cada elemento de la cola muestra su duración antes y durante el stream, incluso dentro de `MODIFY STACK`; las fuentes Live muestran `VIVO`.
- El resumen de una cola mixta usa `X VIDEOS + LIVE - M:SS` y pasa automáticamente a `H:MM:SS` al superar una hora.
- Configuración elimina por completo la franja blanca y los assets negros: firma turquesa directa sobre el fondo oscuro y versión separada.
- La Leyenda turquesa se genera como SVG outlined desde Carbon Bold, sin texto vivo ni dependencia de fuentes instaladas.
- El campo de stream key incorpora menú contextual nativo con `Pegar` y `Seleccionar todo`.
- OUTPUT explica que, si el vivo se termina desde YouTube Studio, también debe usarse `STOP STREAM` en SAOViVO antes de volver a comenzar.

## 0.4.1 RC — actualización 2026-08-03 (instalador de marca)

- Instalador asistido y desinstalador completamente en español.
- Bienvenida narrativa con el storytelling canónico de SAOViVO y cierre exacto `SAOViVO ESTÁ LISTO`.
- Icono oficial para ejecutable, instalador, desinstalador y accesos directos: Logo turquesa sobre fondo opaco `#232322`, con nueve resoluciones entre 16 y 256 px.
- Firma turquesa completa sobre negro en las pantallas de bienvenida y finalización, aplicando el recorte y las medidas aprobadas en `docs/brand/IDENTIDAD_BASE.md`.
- Activos reproducibles mediante `npm run assets:installer`, con validación automática de opacidad, dimensiones, profundidad de color, resoluciones y copy.
- No se cambió el número de versión ni se realizó una publicación pública.

## 0.4.1 RC — actualización 2026-07-31

- `STOP STREAM` abre una confirmación antes de terminar el vivo; continuar transmitiendo es la opción segura y enfocada por defecto.
- Las colas con una fuente en vivo muestran `LIVE +` la suma conocida del resto de los videos, conservando el rojo operativo de `YOUTUBE LIVE`.
- Configuración incorpora al pie la firma oficial negra de SAOViVO y la versión real tomada dinámicamente del ejecutable.
- La composición de marca del modal sigue la decisión cerrada del manual: franja blanca de 392 px, recorte maestro no destructivo y versión separada del SVG.

## 0.4.1 RC — 2026-07-29

- Módulo operativo fijo al pie de la cola con `MODIFY STACK`, anterior, `START/STOP STREAM`, siguiente, `LOOP`, cantidad de videos y duración total.
- Duración total alineada con el borde derecho de las duraciones individuales; ambas usan la misma familia monoespaciada, con mayor tamaño y peso para el total.
- Cada video pendiente funciona como una barra de progreso de bloque completo: contenido atenuado, relleno de 0 a 99% y recuperación de brillo al quedar listo.
- Progreso combinado real: descarga de YouTube en el primer 70% y normalización FFmpeg en el tramo final; los MP4 locales informan el progreso de normalización completo.
- Fuentes verticales/Shorts identificadas en la cola como `YOUTUBE SHORT`.

## 0.4.0 RC — 2026-07-28

- Controles de transmisión trasladados a la barra superior: `START/STOP STREAM`, `LOOP`, anterior y siguiente permanecen visibles con colas largas.
- `MODIFY STACK`, agregado de enlaces y selección de MP4 continúan disponibles durante una transmisión.
- `REMOVE ALL` vacía la cola fuera del vivo; durante el vivo conserva el video activo y programa el cierre al finalizarlo.
- Reproducción dinámica sobre una sola salida continua: permite reordenar, agregar y recorrer fuentes sin reiniciar deliberadamente la conexión RTMPS.
- Detección y confirmación previa para videos verticales. Se muestran completos dentro de 16:9 con bandas laterales, sin recorte.
- Detección y confirmación previa para YouTube Live, identificación roja en la cola y aviso operativo importante al comenzar su reproducción.
- Una fuente YouTube Live mantiene la cola en espera mientras sigue activa; avanza al terminar y puede omitirse manualmente con `SIGUIENTE`.
- La duración total indica `DURACIÓN ABIERTA` cuando la cola contiene una fuente en vivo de final desconocido.
- La desinstalación elimina estado, cola y stream key de `%APPDATA%`; una actualización conserva esos datos y los logs operativos no se eliminan.
- Al quitar el último elemento se abandona automáticamente `MODIFY STACK`, dejando habilitado el agregado de contenido.
- Cierre de sesión idempotente con invalidación de reconexiones, callbacks y progreso pertenecientes a una transmisión terminada.

- Archivos MP4 locales con selección múltiple, metadata, persistencia y recuperación de rutas faltantes.
- Colas mixtas `local`/`youtube` mediante un pipeline común de archivos temporales reproducibles.
- Separación de FFmpeg y `yt-dlp`: las colas locales puras no dependen de componentes de YouTube.
- Normalización local hacia una copia temporal 720p30 H.264/AAC, incluyendo audio silencioso cuando el original no tiene audio.
- Protección comprobada del archivo original mediante tests de integridad antes y después de preparar y limpiar.
- Detección inmediata de playlists privadas `LL`/`WL`, con rescate del video individual cuando el enlace también contiene `watch?v=`.
- Ingesta incremental de playlists: los videos válidos aparecen y comienzan a prepararse sin esperar la lectura completa.
- Omisión aislada de videos privados, eliminados o no disponibles; los problemas transitorios quedan marcados para reintentar.
- Problemas operativos de YouTube visibles en `OUTPUT`; los avisos inferiores quedan reservados para validaciones breves.
- Estado honesto de transporte: `SALIDA RTMPS ACTIVA` requiere confirmación posterior en YouTube Studio.
- Copy específico al rescatar un `watch?v=` incluido en `Vídeos que me gustan`: confirma el video actual y explica por qué el resto no puede enumerarse.
- Logging forense sanitizado de metadata y playlists con URL fuente, inicio/fin, exit code, stderr, totales y causas de omisión.
- Cierre robusto del árbol de procesos de descarga/preparación antes de limpiar temporales, con reintentos y registro técnico de limpieza diferida.
- `Late SEI` y `Failed to update header` permanecen exclusivamente en el log de FFmpeg mientras no corten el flujo.

## 0.3.1 — 2026-07-19

### Interfaz operativa

- Eliminación del contador duplicado junto al título `QUEUE`; la cantidad se muestra únicamente en la barra inferior.
- Cantidad de videos y duración total con el mismo tamaño tipográfico para equilibrar la lectura del resumen.
- `SAOViVO Data` convertido en una sección independiente de datos y diagnóstico dentro de Configuración.
- Banner persistente de alta visibilidad para fin programado, cierre en curso, riesgo de corte y transmisión finalizada.
- Estados críticos identificados semánticamente desde el motor de streaming, sin depender del texto de las notificaciones.

## 0.3.0 — 2026-07-19

### Experiencia

- Rediseño visual completo basado en la arquitectura y los patrones de VS Code: Activity Bar, View Toolbar, Output y Status Bar.
- Eliminación del encabezado de branding y del indicador redundante de estado.
- Barra de título oscura integrada con la interfaz.
- Preview del video activo en proporción 16:9 completa, sin recorte.
- Duración total y cantidad de videos trasladadas a la barra inferior.
- Loop editable durante una transmisión activa.

### Streaming

- Buffer inicial de hasta tres videos: el botón de inicio se habilita sin esperar toda la playlist.
- Preparación secuencial del resto de la cola en segundo plano mientras el stream ya está activo.
- El archivo de concatenación incluye la cola completa y abre cada video cuando llega su turno.
- Loop dinámico: al apagarlo, la transmisión termina al completar la vuelta actual; al reactivarlo, continúa indefinidamente.

### Diagnóstico y distribución

- Carpeta visible `Documentos/SAOViVO Data` con logs permanentes por transmisión.
- Log independiente de FFmpeg y checkpoints periódicos de salud, video activo y salida RTMPS.
- Limpieza de archivos temporales al cerrar y recuperación automática de residuos después de un cierre inesperado.
- Instalador NSIS para probar en otras computadoras, además del ejecutable portable.

## 0.2.0 — 2026-07-18

- Preparación automática al agregar videos.
- Corrección de descarga separada de audio y video mediante ubicación explícita de FFmpeg.
- RTMPS por puerto 443 y confirmación de salida basada en el progreso real de FFmpeg.
- Controles inferiores fijos y estados de preparación accionables.

## 0.1.0 — 2026-07-18

- Primer demo Electron.
- Cola de videos y playlists, edición, loop, stream RTMP y notificaciones.
- Persistencia local de cola y stream key cifrada por Windows.
