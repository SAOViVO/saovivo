# SAOViVO

App de escritorio para convertir archivos MP4 locales, videos propios de YouTube o una cola combinada en una transmisión en vivo continua.

**Versión vigente: SAOViVO 2.0 para Windows.**

## Proyecto y mantenimiento

SAOViVO nació en 2022 y esta versión continúa ese recorrido con una reimplementación completa de la aplicación de escritorio. El código vigente está mantenido por [Nicolás Russo (`IKSNicoR`)](https://github.com/IKSNicoR) dentro de la organización [SAOViVO](https://github.com/SAOViVO).

La implementación actual en Electron reemplaza la arquitectura histórica separada en Go y React. El desarrollo anterior se conserva en el historial del proyecto como antecedente, pero no representa el código vigente ni se garantiza una migración automática de colas o configuraciones anteriores. **SAOViVO Cloud 1.0** identifica por separado el prototipo histórico de bloques de datos y clima.

Contacto actual del proyecto: [saovivoapp@gmail.com](mailto:saovivoapp@gmail.com).

## Descargar

La versión vigente se publica en [GitHub Releases](https://github.com/SAOViVO/saovivo/releases/latest):

- `SAOViVO-Setup-2.0.0.exe`: instalador asistido.
- `SAOViVO-2.0.0-portable.exe`: versión portable.

La primera publicación puede no contar todavía con firma digital. En ese caso Windows mostrará `Editor desconocido`; los hashes SHA-256 de cada archivo se publicarán en las notas del Release. La firma gratuita para las siguientes builds se gestionará con SignPath Foundation.

## Identidad de marca

La identidad visual y verbal se rige por `docs/brand/IDENTIDAD_BASE.md`. La marca se escribe siempre `SAOViVO`, con la `i` minúscula. Toda modificación de UI, layout, color, tipografía, Logo, Leyenda, iconos, instalador o piezas visuales debe consultar primero ese manual; una excepción o regla nueva debe decidirse en la tarea de Codex **SAOViVO — Marca y look** antes de implementarse.

## Primera prueba

1. Abrí YouTube Studio y creá o programá una transmisión.
2. Copiá la **clave de transmisión**. No copies la URL del panel.
3. Ejecutá `npm start` (o abrí el `.exe` portable generado en `dist`).
4. Tocá el engranaje de abajo a la izquierda, pegá la clave y guardá.
5. Pegá un link de video/playlist de YouTube o tocá **ARCHIVOS** para seleccionar uno o varios MP4 de la computadora.
6. Cada video empieza a prepararse apenas entra a la cola. Cuando el buffer inicial indique **Listo para transmitir**, tocá **START STREAM**; el resto continúa en segundo plano.
7. Cuando YouTube Studio indique que recibe señal, iniciá la emisión desde Studio si el evento no está configurado para comenzar automáticamente.

El segundo toque sobre el botón (**STOP STREAM**) termina la señal. Con **LOOP ON**, la cola vuelve al primer video sin cerrar la conexión con YouTube. Durante el vivo podés agregar fuentes, reordenar los videos pendientes y usar **ANTERIOR** o **SIGUIENTE** sin detener deliberadamente la salida.

## Requisitos y comportamiento

- Windows 10/11 de 64 bits.
- Conexión estable; se recomienda al menos 8 Mbps de subida.
- Los videos deben ser propios y estar disponibles para la cuenta/ubicación desde la que se ejecuta la app.
- El soporte local declarado en esta etapa es MP4. Los archivos pueden mezclarse libremente con fuentes YouTube y se agregan en el orden mostrado por Windows.
- SAOViVO nunca modifica, mueve ni elimina el archivo local original: genera una copia temporal normalizada para transmitir.
- Si un archivo local fue movido o eliminado al reabrir, la cola permite volver a ubicarlo o quitarlo.
- Una cola exclusivamente local usa FFmpeg y no descarga ni ejecuta `yt-dlp`.
- La computadora no entra en suspensión mientras el stream está activo, pero la app no puede evitar un corte eléctrico o el cierre forzado de Windows.
- La clave queda cifrada mediante la protección de credenciales de Windows y se guarda sólo en la PC.
- Las fuentes se comprueban y preparan en el orden de la cola. Las copias de trabajo son temporales y se eliminan al cerrar SAOViVO.
- Un video vertical se transmite completo dentro del cuadro 16:9, con bandas negras laterales. La app pide confirmación antes de agregarlo.
- Una fuente YouTube Live mantiene su turno hasta que termina o el usuario pulsa **SIGUIENTE**. La app la identifica en rojo y pide confirmación antes de agregarla.
- Los logs permanentes quedan en `Documentos\SAOViVO Data\logs`, separados por fecha y hora de transmisión.

## Desarrollo

```powershell
npm install
npm start
```

Crear el portable:

```powershell
npm run dist
```

Crear el instalador para otra computadora:

```powershell
npm run dist:installer
```

## Alcance de SAOViVO 2.0

La emisión sale a 1280×720, 30 fps, H.264 + AAC y 4.5 Mbps. Un publicador persistente recibe cada fuente de la cola en el orden vigente, lo que permite editar pendientes y navegar durante el vivo. La app muestra **SALIDA RTMPS ACTIVA** cuando FFmpeg está enviando datos; la recepción definitiva se confirma en YouTube Studio. Sin OAuth/API de YouTube, SAOViVO no puede comprobar si el evento fue terminado dentro de Studio. Si la conexión de transporte cae, intenta reconectarse automáticamente con espera progresiva y deja evidencia técnica en el log de esa transmisión.

## Privacidad, seguridad y licencia

- [Privacidad](PRIVACY.md)
- [Política de seguridad](SECURITY.md)
- [Dependencias y licencias de terceros](THIRD_PARTY_NOTICES.md)
- [Autores y mantenimiento](AUTHORS.md)

SAOViVO se distribuye bajo `GPL-3.0-or-later`. Consultá [LICENSE](LICENSE) para ver el texto completo.

## Participar

Los reportes de errores y propuestas pueden abrirse en [GitHub Issues](https://github.com/SAOViVO/saovivo/issues). Las vulnerabilidades o datos sensibles deben enviarse de manera privada según [SECURITY.md](SECURITY.md).
