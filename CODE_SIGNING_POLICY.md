# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## Alcance

Esta política se aplica a las publicaciones oficiales de SAOViVO para Windows. Los artefactos elegibles son el instalador y la versión portable construidos desde el repositorio público [`SAOViVO/saovivo`](https://github.com/SAOViVO/saovivo).

Los binarios de proyectos upstream incluidos como dependencias, como FFmpeg, no deben firmarse con el certificado de SAOViVO. La configuración de artefactos debe limitar la firma a los ejecutables propios del proyecto y a sus contenedores de distribución.

## Roles

- **Authors and committers:** [Nicolás Russo (`@IKSNicoR`)](https://github.com/IKSNicoR), mantenedor y CODEOWNER del código vigente.
- **Reviewers:** [Nicolás Russo (`@IKSNicoR`)](https://github.com/IKSNicoR) revisa los cambios propuestos por personas sin acceso directo antes de integrarlos.
- **Approvers:** [Nicolás Russo (`@IKSNicoR`)](https://github.com/IKSNicoR) aprueba manualmente cada solicitud de firma de una publicación.

Las cuentas que ejerzan estos roles deben tener autenticación multifactor habilitada tanto en GitHub como en SignPath.

## Controles de compilación y firma

- El código fuente, las dependencias declaradas y los scripts de compilación deben estar versionados públicamente.
- Los artefactos se construyen con [GitHub Actions](https://github.com/SAOViVO/saovivo/actions/workflows/windows-build.yml) en runners alojados por GitHub.
- La política de release usa la rama protegida `main` o tags públicos de versión derivados de ella.
- Cada solicitud de firma requiere aprobación manual del Approver.
- El nombre de producto debe ser `SAOViVO` y la versión del producto debe coincidir en todos los ejecutables de una misma publicación.
- Los hashes de los artefactos publicados deben estar disponibles junto a cada Release.

## Privacidad y seguridad

SAOViVO no incorpora telemetría ni analítica de uso. Las conexiones iniciadas por la aplicación y el tratamiento de datos locales se describen en la [política de privacidad](PRIVACY.md). Los reportes de vulnerabilidades se gestionan según la [política de seguridad](SECURITY.md).

Contacto: `saovivoapp@gmail.com`.
