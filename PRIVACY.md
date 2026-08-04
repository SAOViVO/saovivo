# Privacidad de SAOViVO

Última actualización: 4 de agosto de 2026.

## Resumen

SAOViVO funciona localmente, no exige una cuenta propia y no incorpora telemetría ni analítica de uso. No vende ni envía datos personales a servidores de SAOViVO.

## Datos almacenados en la computadora

- La cola y las preferencias se guardan en el perfil local de la aplicación.
- La stream key se cifra mediante la protección de credenciales de Windows.
- Los logs operativos se guardan en `Documentos\SAOViVO Data\logs` y sanitizan stream keys, tokens, cookies y URLs firmadas conocidas.
- Los archivos originales elegidos por el usuario nunca se modifican ni se eliminan. SAOViVO crea copias temporales de trabajo y elimina únicamente su carpeta temporal al cerrar.

## Conexiones externas

- Al usar fuentes de YouTube, SAOViVO se conecta a YouTube y servicios de entrega asociados para consultar metadata y preparar el contenido.
- `yt-dlp` se descarga bajo demanda desde el repositorio oficial de `yt-dlp` en GitHub. Una cola exclusivamente local no lo descarga ni lo ejecuta.
- Al comenzar una transmisión, FFmpeg se conecta al endpoint RTMPS de YouTube usando la stream key configurada por el usuario.
- GitHub, YouTube y sus servicios asociados aplican sus propias políticas de privacidad.

## Contenido y responsabilidad del usuario

El usuario debe transmitir únicamente contenido que tenga derecho a utilizar y respetar los términos de YouTube y de cualquier fuente incorporada.

## Contacto

Consultas sobre privacidad: `saovivoapp@gmail.com`.
