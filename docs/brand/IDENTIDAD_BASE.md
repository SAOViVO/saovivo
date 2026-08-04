# Manual de marca SAOViVO

Estado: documento rector en construcción.

Responsable: tarea de Codex **SAOViVO — Marca y look** (la conversación en la que se creó y se mantiene este manual).

Última actualización: 4 de agosto de 2026.

## Alcance y autoridad

Este archivo es la fuente única de verdad para la identidad visual y verbal de SAOViVO. Rige la aplicación, el instalador, el sitio, las publicaciones, las capturas, los documentos, las presentaciones y cualquier pieza futura.

Ante una duda, contradicción o propuesta nueva:

1. no improvisar una variante;
2. conservar los SVG maestros sin modificarlos;
3. llevar la consulta a la tarea **SAOViVO — Marca y look**, con contexto y una captura o maqueta;
4. actualizar este manual solamente después de la decisión.

Una referencia anterior, una implementación existente o una preferencia técnica no reemplazan estas reglas.

## 1. Escritura de la marca

La marca se escribe siempre:

```text
SAOViVO
```

Todas las letras son mayúsculas salvo la `i`, que es minúscula. La regla se mantiene aun dentro de un párrafo escrito con capitalización normal.

Formas incorrectas, entre otras:

```text
SAOVIVO
Saovivo
SaoVivo
saovivo
SAOVivo
```

La regla alcanza títulos, párrafos, botones, menús, instaladores, metadatos visibles, créditos y comunicaciones. Un identificador técnico heredado que no pueda cambiarse no debe trasladar su grafía incorrecta a ninguna superficie visible para el usuario.

## 2. Componentes de la marca

### Logo

`Logo` es exclusivamente la figura geométrica grande. No incluye texto.

### Leyenda

`Leyenda` es exclusivamente el nombre `SAOViVO` compuesto en Carbon. No incluye bajada, claim, descriptor ni número de versión.

### Firma o lockup

La firma es la convivencia del Logo y la Leyenda en su relación oficial. Aunque los originales se entregan como SVG separados, no deben tratarse como dos elementos independientes de layout.

## 3. Relación invariable entre Logo y Leyenda

Los SVG de Logo y Leyenda comparten un `viewBox` de `0 0 1920 1080`. Para reconstruir la firma deben colocarse superpuestos, con exactamente el mismo tamaño de caja y la misma transformación.

La alineación oficial es:

- el borde derecho visual de `SAOViVO` coincide con el último punto —el vértice más a la derecha— del Logo;
- la línea base de la Leyenda coincide con la base inferior del Logo;
- la Leyenda queda dentro del extremo inferior derecho de la huella visual del Logo;
- la Leyenda conserva siempre el tamaño definido por el maestro;
- Logo y Leyenda se escalan juntos, nunca por separado.

En las coordenadas maestras, el último punto derecho del Logo está en `x = 1261.02` y la base está en `y = 691.58`. La Leyenda usa una línea base en `y = 691.5828`. Estas cifras documentan la intención; para producción se deben superponer los SVG maestros y no recomponer la palabra manualmente.

Nunca:

- agrandar o achicar solamente la Leyenda;
- moverla arriba, al costado, al centro o fuera de esa posición;
- distribuir Logo y Leyenda como una fila o columna de interfaz;
- agregar un claim al lockup;
- tipear una nueva Leyenda para sustituir el SVG oficial.

## 4. Paleta institucional

La paleta base tiene exactamente tres colores:

| Color | Hex | RGB |
| --- | --- | --- |
| Negro SAOViVO | `#232322` | `35, 35, 34` |
| Blanco pleno | `#FFFFFF` | `255, 255, 255` |
| Turquesa SAOViVO | `#03AFBA` | `3, 175, 186` |

Los tres colores conviven siempre en la marca y asumen los roles de fondo, sombra intermedia y cuerpo del Logo/Leyenda. No se aprueban firmas de uno o dos colores.

### Combinaciones oficiales

| Fondo | Logo | Sombra intermedia | Leyenda | Maestros |
| --- | --- | --- | --- | --- |
| Blanco pleno | Negro con degradé | Turquesa | Negro | `SAOViVO_Logo_Negro.svg` + `SAOViVO_Leyenda_Negro.svg` |
| Negro SAOViVO | Turquesa con degradé | Blanco | Turquesa | `SAOViVO_Logo_Turquesa.svg` + `SAOViVO_Leyenda_Turquesa.svg` |
| Turquesa SAOViVO | Blanco con degradé | Negro | Blanco | `SAOViVO_Logo_Blanco.svg` + `SAOViVO_Leyenda_Blanco.svg` |

No intercambiar fondos, sombras o Leyendas entre estas tres combinaciones sin aprobación de Marca y look.

### Degradé del Logo

El Logo nunca es un color plano. Su degradé es parte de la pieza y debe conservarse desde el SVG maestro.

Cada familia de color tiene un valor canónico y, cuando corresponde, un tono auxiliar más claro u oscuro que produce el degradé:

| Familia | Color canónico | Tono auxiliar | Uso del auxiliar |
| --- | --- | --- | --- |
| Negro | `#232322` | `#000000` | Extremo oscuro del degradé negro |
| Blanco | `#FFFFFF` | `#CCCCCC` | Extremo de sombra del degradé blanco |
| Turquesa | `#03AFBA` | `#00EDFF` | Extremo luminoso del degradé turquesa |

Los valores auxiliares son derivados tonales, no colores institucionales adicionales. La dirección y distribución de cada degradé se conserva desde el SVG maestro; no se reemplaza por un degradé genérico ni se invierten sus extremos.

### Resolución del turquesa

`#03AFBA` es el único turquesa canónico de SAOViVO. Es el valor para fondos turquesa, acentos de marca en la aplicación y toda aplicación plana nueva.

`#00EDFF` es el brillo del degradé turquesa. También se conserva como color de la Leyenda turquesa sobre fondo negro porque, al tamaño reducido de la palabra, ofrece una legibilidad considerablemente mayor y mantiene continuidad visual con la zona luminosa del Logo. Ésta es una excepción cerrada: no habilita a usar `#00EDFF` como acento general de la interfaz.

El turquesa anterior de la aplicación, `#00B7C3`, deja de ser un valor de marca. Las superficies de identidad nuevas deben usar `#03AFBA`; las existentes se migrarán cuando sean intervenidas y después de una revisión visual, sin hacer un reemplazo global ciego sobre colores que puedan cumplir una función operativa.

### Contraste y legibilidad

Las relaciones de contraste de las combinaciones principales son:

| Primer plano | Fondo | Contraste | Decisión |
| --- | --- | --- | --- |
| `#232322` | `#FFFFFF` | `15.73:1` | Texto y elementos negros sobre blanco |
| `#03AFBA` | `#232322` | `5.88:1` | Acentos y texto turquesa normal sobre negro |
| `#00EDFF` | `#232322` | `10.90:1` | Leyenda turquesa oficial sobre negro |
| `#232322` | `#03AFBA` | `5.88:1` | Texto de interfaz sobre superficies turquesa |
| `#FFFFFF` | `#03AFBA` | `2.68:1` | No usar para texto normal de interfaz |

Por lo tanto, una superficie turquesa de interfaz lleva texto negro, no blanco. La firma oficial blanca sobre turquesa se conserva como marca y no debe reutilizarse como criterio para textos, controles o párrafos. Hasta definir un tamaño mínimo, esa variante debe revisarse visualmente cuando se use en dimensiones pequeñas.

## 5. Tipografía

### Marca

La Leyenda usa **Carbon**, disponible en Adobe Fonts. Los SVG entregados especifican `Carbon Bold`, peso `700`.

Para una firma siempre se usa el arte oficial. Carbon no se reemplaza por una fuente parecida ni se recompone la Leyenda desde texto vivo.

### Textos que acompañan a la marca

La familia de acompañamiento es **ITC Franklin Gothic**.

- Títulos: ITC Franklin Gothic en MAYÚSCULAS.
- Párrafos: ITC Franklin Gothic con mayúsculas y minúsculas normales.
- La grafía `SAOViVO` conserva siempre su `i` minúscula, incluso dentro de un título en mayúsculas.

Los pesos y cortes exactos para títulos, párrafos y UI quedan pendientes de definición. No establecer una sustitución oficial sin consultarlo en Marca y look.

### Excepción web temporal para Tilda

Esta excepción rige únicamente el borrador no publicado de Tilda, `pageid 167110603`, mientras ITC Franklin Gothic no esté activada mediante un kit web autorizado ni exista un archivo webfont con licencia apto para subir.

La sustitución temporal se divide por función:

| Uso | Fuente temporal | Tratamiento |
| --- | --- | --- |
| Hero y títulos | Mongoose Medium | MAYÚSCULAS; no usar falsa negrita |
| Párrafos | Arial Regular (`400`) | Mayúsculas y minúsculas normales |
| Navegación, botones y etiquetas | Arial Bold (`700`) o Regular (`400`) según jerarquía | Respetar la capitalización definida para cada componente |

Reglas de esta excepción:

- Mongoose Medium no se usa para párrafos, navegación extensa ni textos pequeños porque su condensación reduce legibilidad.
- Arial no se convierte en tipografía institucional: es solamente el fallback neutro y legible disponible en el proyecto Tilda.
- La Leyenda oficial continúa dentro de su SVG maestro en Carbon; nunca se recompone con Mongoose ni Arial.
- Al activar ITC Franklin Gothic, deben reemplazarse ambos fallbacks y revisarse saltos de línea, anchos, alturas y espaciados antes de publicar.
- La excepción no se traslada automáticamente a la aplicación, el instalador, documentos, redes ni otras páginas.

Para este borrador queda autorizado el hero:

```text
SÓLO NECESITÁS UNA COLA DE VIDEOS PARA TU STREAM
```

El texto se compone en Mongoose Medium y mayúsculas. La grafía de `SAOViVO` sigue conservando su `i` minúscula donde aparezca, aunque el resto del bloque esté en mayúsculas.

### Header web sobre fondo blanco

En un header con fondo `#FFFFFF` se usa exclusivamente la combinación negra oficial:

- `SAOViVO_Logo_Negro.svg` y `SAOViVO_Leyenda_Negro.svg` superpuestos;
- Logo con su degradé negro original;
- sombra intermedia turquesa;
- Leyenda negra;
- relación, escala conjunta y alineación definidas en la sección 3.

El CSS de la página utiliza como colores de marca únicamente `#232322`, `#FFFFFF` y `#03AFBA`. Los tonos auxiliares `#000000` y `#00EDFF` pueden aparecer dentro de los SVG maestros para producir sus degradés y excepciones ya documentadas; no deben extraerse de los SVG ni aplicarse a otros elementos web.

No colocar la firma negra directamente sobre un header gris, transparente, fotográfico o turquesa. Si el fondo deja de ser blanco debe elegirse otra combinación oficial según la sección 4 y volver a revisar el contexto.

## 6. Storytelling canónico del instalador

Copy revisado y aprobado por Nico el 4 de agosto de 2026. Esta versión reemplaza íntegramente el storytelling aprobado el día anterior.

### Bienvenida

Título:

> Vas a instalar SAOViVO

Texto inicial:

> El programa prepara links de YouTube y archivos locales para transmitirlos como un stream continuo.

La frase no lleva coma después de `programa`: no se separa el sujeto del predicado.

### Cómo funciona

> 01 · Elegí tus videos
>
> 02 · Prepará tu canal
>
> 03 · Transmití

### Finalización

Título:

> SAOViVO está listo

Checkbox o botón de salida:

> Abrir SAOViVO

Reglas de uso:

- usar capitalización normal en todos los textos del instalador;
- conservar siempre la grafía `SAOViVO`, aun cuando el resto de la frase use capitalización normal;
- conservar voseo, numeración, orden, palabras y puntuación del copy aprobado;
- adaptar únicamente saltos de línea cuando lo exija el ancho disponible;
- no recuperar títulos, descripciones ni frases de versiones anteriores;
- cualquier acortamiento, extensión, traducción o variante requiere una nueva decisión de Marca y look.

La aprobación del copy cubre únicamente el contenido verbal y el storytelling; no define por sí sola layout, fondo, tipografía aplicada, ilustraciones, animaciones, Logo, Leyenda, icono, banner ni imágenes laterales. La decisión visual aprobada se documenta por separado a continuación y no permite reescribir el copy.

### Decisión visual del instalador de Windows

Decisión aprobada por Nico el 3 de agosto de 2026. Su alcance se limita a la aplicación de escritorio para Windows, su instalador, desinstalador y accesos directos. No autoriza usos nuevos del Logo solo ni de la firma completa en web, redes, documentos u otras superficies.

#### Idioma y secuencia

El instalador es un asistente íntegramente en español. Los textos estándar, botones, estados, errores y confirmaciones visibles deben estar en español; el nombre `SAOViVO` y el storytelling de esta sección se conservan exactamente.

La secuencia verbal y visual es:

1. **Bienvenida narrativa:** presenta `Vas a instalar SAOViVO`, el texto inicial y `Cómo funciona` con sus tres pasos, en ese orden. Sólo pueden adaptarse sus saltos de línea.
2. **Configuración asistida:** usa las páginas estrictamente necesarias para aceptar condiciones, elegir destino u opciones reales. No agrega storytelling alternativo.
3. **Progreso convencional:** informa operaciones verdaderas —por ejemplo, preparar la instalación, copiar archivos, crear accesos directos y finalizar— sin frases promocionales ni estados adelantados.
4. **Finalización:** usa el título exacto `SAOViVO está listo` y la opción `Abrir SAOViVO`. No afirma que una transmisión ya esté configurada ni activa.

No debe quedar texto estándar de NSIS en inglés. El desinstalador y sus confirmaciones también usan español cuando el framework permita definirlas.

Los controles y textos nativos del asistente usan la fuente de interfaz que Windows resuelva mediante `MS Shell Dlg`/Segoe UI. Esta es una excepción técnica limitada a NSIS: evita instalar o incrustar una fuente sin licencia y no convierte Segoe UI en tipografía institucional. No sustituye la regla de ITC Franklin Gothic en piezas gráficas editables.

#### Excepción autorizada para el icono de Windows

El icono usa exclusivamente la figura del Logo, sin Leyenda, por su necesidad de funcionar en tamaños pequeños. Esta es una excepción cerrada a la prohibición general de usar el Logo solo.

Composición:

- lienzo cuadrado, opaco y de esquinas rectas;
- superficie completa en Negro SAOViVO `#232322`;
- `SAOViVO_Logo_Turquesa.svg`, sin `SAOViVO_Leyenda_Turquesa.svg`;
- degradé turquesa y sombra blanca preservados íntegramente desde el maestro;
- sin redibujo, simplificación, contorno, borde, radio, transparencia, relieve, sombra agregada ni ornamentación;
- la misma composición se usa en el ejecutable, instalador, desinstalador y accesos directos.

##### Recorte y área de protección

El master de exportación es un PNG cuadrado de `1024 × 1024 px`, sRGB y completamente opaco.

- El recorte no destructivo del SVG usa `x = 640`, `y = 375`, `width = 637`, `height = 333` sobre el `viewBox 0 0 1920 1080`.
- Ese recorte se renderiza a `896 × 468.40 px`, sin deformación.
- Se ubica en `x = 64 px` y `y = 277.80 px` del lienzo de `1024 × 1024 px`.
- El área de protección exterior mínima es, por lo tanto, `64 px` a izquierda y derecha, equivalente al `6.25 %` del lado. No se reduce en ninguna exportación.
- El aire vertical mayor es intencional y surge de centrar una figura horizontal dentro del cuadrado; no se compensa estirando ni rotando el Logo.
- El recorte incluye aproximadamente `16` unidades maestras de resguardo alrededor de la figura para evitar cortar antialiasing en los extremos.

Todas las resoluciones se derivan del master de `1024 px` con reducción de alta calidad en sRGB. No se crean variantes ópticas ni se reposiciona el Logo según el tamaño.

##### ICO multirresolución

El archivo `.ico` debe contener estas nueve resoluciones, todas a `32-bit` y con la superficie negra completamente opaca:

```text
16 × 16
20 × 20
24 × 24
32 × 32
40 × 40
48 × 48
64 × 64
128 × 128
256 × 256
```

La entrada de `256 × 256` se almacena comprimida como PNG dentro del ICO. Las demás pueden almacenarse como PNG o BMP de 32 bits si la herramienta conserva el color y no introduce halos. No incluir una máscara que vuelva transparente el fondo Negro SAOViVO.

El control mínimo obligatorio se realiza a `16`, `24`, `32`, `48` y `256 px` sobre fondos claro y oscuro de Windows. Se rechaza una exportación con bordes claros, píxeles transparentes, banding visible o pérdida de la sombra blanca.

#### Firma en bienvenida y finalización

La firma completa queda autorizada únicamente en las páginas de bienvenida y finalización del instalador.

- Fondo de marca: Negro SAOViVO `#232322`.
- Logo: `SAOViVO_Logo_Turquesa.svg`.
- Leyenda: `SAOViVO_Leyenda_Turquesa.svg`.
- Ambos SVG se superponen con idéntica escala, posición y transformación.
- Se conserva el degradé turquesa, la sombra blanca y la Leyenda turquesa oficial.
- La firma aparece una sola vez por página. No se duplica en el panel de contenido.

Esta autorización no se extiende a las páginas de configuración o progreso, al desinstalador, a ventanas de la aplicación ni a otra pieza.

#### Gráfica lateral NSIS

La bienvenida y la finalización usan una única gráfica lateral, asignada como `MUI_WELCOMEFINISHPAGE_BITMAP`:

- archivo BMP de `164 × 314 px` exactos;
- RGB de `24-bit`, sRGB, sin canal alpha;
- fondo completo `#232322`;
- sin borde, radio, marco, textura, texto adicional ni efecto;
- firma oficial turquesa superpuesta sobre el fondo negro.

La caja común de Logo y Leyenda dentro del BMP mide `140 × 74 px` y se ubica en `x = 12 px`, `y = 24 px`.

- Ambos maestros usan el recorte no destructivo `x = 640`, `y = 375`, `width = 637`, `height = 333`.
- El contenido conserva la proporción `637:333`, se renderiza a `140 × 73.19 px` y se centra verticalmente dentro de la caja de `140 × 74 px`.
- La caja usa recorte, no deformación. El espacio negro restante debajo de la firma es deliberado y forma parte de la composición austera.

La gráfica lateral constituye la única aparición de la firma en esas páginas. No habilitar `MUI_HEADERIMAGE`, no agregar un header bitmap y no repetir el Logo o la Leyenda en el área derecha.

Las superficies y controles nativos del asistente pueden conservar sus colores funcionales del sistema operativo; no se presentan como paleta de marca. Ninguna decoración adicional puede introducir colores fuera de la combinación oficial.

#### Dirección visual cerrada

- composición austera, estructural y de campos planos;
- sin header decorativo adicional;
- sin tarjetas, sombras blandas, glassmorphism, ilustraciones ni ornamento;
- sin claims alternativos ni recursos visuales que compitan con la firma;
- la pantalla de progreso prioriza legibilidad y estado real;
- el cierre `SAOViVO está listo` funciona como conclusión verbal, no como una nueva Leyenda.

## 7. Uso especial dentro de la aplicación

Hay una única aplicación especial autorizada: en el panel de Configuración, junto a la versión del programa, puede aparecer la firma turquesa completa.

Este permiso:

- se limita a ese panel y a esa relación con la versión;
- conserva la alineación y proporción oficiales entre Logo y Leyenda;
- no habilita a ubicar esa firma en otras zonas de la interfaz;
- no habilita una cabecera de marca, una marca de agua ni una repetición decorativa del Logo;
- no convierte el número de versión en parte de la Leyenda.

### Decisión cerrada para el modal de 440 px

Esta especificación, aprobada por Nico el 4 de agosto de 2026, reemplaza íntegramente la decisión del 31 de julio. La franja blanca y la firma negra quedan rechazadas y no deben conservarse en ninguna implementación.

Rige el modal de Configuración de `440 px` de ancho y fondo operativo `#252526`.

#### Fondo y combinación

- El fondo general del modal se conserva en `#252526`; es una superficie operativa oscura, no un nuevo color institucional.
- No se agrega franja, isla, placa, tarjeta, borde, sombra ni fondo detrás de la firma.
- Se superponen `SAOViVO_Logo_Turquesa.svg` y `SAOViVO_Leyenda_Turquesa.svg` directamente sobre el fondo del modal.
- El Logo conserva su degradé turquesa y su sombra blanca; la Leyenda conserva el turquesa luminoso oficial.
- La proximidad entre `#252526` y el Negro SAOViVO `#232322`, sumada al contraste alto de la Leyenda `#00EDFF`, permite esta aplicación especial sin reclasificar el gris operativo como color de marca.
- Debe haber `24 px` entre el último control de Configuración y el comienzo de la fila de firma y versión.

#### Caja común y recorte

- La fila completa usa los `392 px` interiores del modal: `240 px` de firma, `16 px` de separación y `136 px` para la versión.
- Logo y Leyenda ocupan una misma caja visible de `240 × 126 px`.
- Ambos SVG se superponen con idéntica escala, posición y transformación.
- El Logo ocupa la capa inferior y la Leyenda la capa superior.
- La caja recorta el lienzo maestro, pero no modifica los archivos. El recorte de referencia sobre el `viewBox 0 0 1920 1080` es `x = 640`, `y = 375`, `width = 637`, `height = 333`.
- El contenido conserva la proporción `637:333`. Dentro de la caja de `240 × 126 px` se renderiza a `240 × 125.46 px`, centrado verticalmente; no se estira para completar el espacio restante.
- El recorte deja alrededor de `16` unidades maestras de resguardo a derecha y abajo. Esas unidades son obligatorias: no ajustar el crop al borde visible de las letras.
- La caja puede usar `overflow: hidden` solamente con el recorte completo indicado. Ningún elemento de la versión puede superponerse o invadir sus `240 px`.
- Esta escala es exclusiva de este modal. No establece el tamaño mínimo general de la marca.

#### Integridad tipográfica de la Leyenda

Los SVG maestros de Leyenda contienen texto vivo en Carbon Bold. Si el sistema no dispone de Carbon, el motor puede sustituir la fuente y alterar tanto la forma como el ancho de `SAOViVO`; eso explica la apariencia incorrecta observada en la implementación rechazada.

Para una build empaquetada:

- no depender de la resolución local de `font-family` dentro del SVG;
- generar desde `SAOViVO_Leyenda_Turquesa.svg` un derivado con Carbon Bold `700` convertido a contornos;
- conservar coordenadas, tamaño, color y alineación del maestro;
- nombrar el derivado `SAOViVO_Leyenda_Turquesa_Outlined.svg`;
- no sobrescribir ni modificar el SVG maestro;
- verificar antes de empaquetar que el derivado no contiene elementos `<text>` y que muestra completa la `O` final.

El Logo continúa usando su SVG maestro. Logo y Leyenda outlined se superponen con la misma transformación y el mismo recorte. No se autoriza recomponer la palabra con HTML, CSS, una fuente fallback ni texto de interfaz.

#### Versión, separación y alineación

- La firma va a la izquierda y el texto de versión a la derecha, en una sola fila.
- La separación horizontal entre la caja de la firma y el bloque de versión es de `16 px`.
- El bloque de versión dispone de los `136 px` restantes del ancho interior del modal y se alinea a la izquierda.
- El texto se escribe `VERSIÓN 0.4.1`, o con el número vigente, en ITC Franklin Gothic Regular (`400`), mayúsculas, `11 px`, `line-height: 14 px`, tracking `0.08em` y color `#FFFFFF`.
- La línea base de `VERSIÓN 0.4.1` se alinea con la línea base de la Leyenda oficial, no con el centro óptico del Logo.
- Con el recorte y la escala anteriores, esa línea base cae a `119.28 px` desde el borde superior de la caja común. Se admite redondearla a `119.25 px` o `119.5 px` según el rasterizador, pero Logo y Leyenda no se mueven.
- La versión permanece como texto independiente: no se incorpora al SVG, no usa Carbon y no se pega a la palabra `SAOViVO`.
- La fila se alinea con el borde izquierdo del contenido del modal, a `24 px` del borde exterior, y termina a `24 px` del borde derecho.
- En coordenadas del modal, la firma ocupa `x = 24–264 px`, la separación `x = 264–280 px` y la versión `x = 280–416 px`.
- El modal conserva `24 px` de espacio inferior después de la fila.

La implementación se rechaza si aparece cualquier fondo claro, si la versión invade la caja de la firma, si falta o se corta la `O` final, si la Leyenda parece compuesta en otra fuente o si Logo y Leyenda dejan de compartir transformación.

## 8. Superficies públicas de GitHub

Decisión aprobada el 4 de agosto de 2026 para reemplazar la identidad anterior visible en la organización de GitHub SAOViVO y configurar la vista social del repositorio del lanzamiento.

Esta es una autorización propia y limitada. No deriva automáticamente del icono de Windows ni amplía sus usos.

### Avatar de la organización

El avatar usa solamente la figura del Logo porque GitHub lo muestra en tamaños pequeños y con recorte circular. Esta es una excepción específica a la regla general que exige Logo y Leyenda.

Composición aprobada:

- fuente: `SAOViVO_Logo_Turquesa.svg`;
- sin Leyenda;
- fondo cuadrado, sólido y opaco en Negro SAOViVO `#232322`;
- Logo Turquesa oficial con su degradé y sombra blanca íntegros;
- sin borde, radio, máscara circular, transparencia, texto ni efectos;
- GitHub aplica el recorte circular; el archivo entregado permanece cuadrado.

Exportación:

- PNG sRGB de `500 × 500 px`;
- menos de `1 MB`; el archivo aprobado pesa `20 427 bytes`;
- crop fuente `x = 640`, `y = 375`, `width = 637`, `height = 333` sobre el `viewBox 0 0 1920 1080`;
- render del crop a `440 × 230.02 px`;
- ubicación `x = 30 px`, `y = 134.99 px`;
- protección visual mínima aproximada de `39 px` respecto del círculo inscrito;
- al cargarlo, centrarlo sin zoom ni reposicionamiento manual.

Activo aprobado:

```text
assets/brand/github/SAOViVO-GitHub-avatar-500.png
```

No usar el ICO, el PNG master de Windows ni una captura del ejecutable como avatar de GitHub, aunque compartan la misma fuente visual.

### Vista social del repositorio

Para el repositorio público del lanzamiento corresponde configurar una imagen social propia. Usa la firma completa porque el formato horizontal permite conservar la Leyenda con legibilidad.

Composición aprobada:

- lienzo sólido y opaco en Negro SAOViVO `#232322`;
- `SAOViVO_Logo_Turquesa.svg` como capa inferior;
- `SAOViVO_Leyenda_Turquesa_Outlined.svg` como capa superior;
- ambos con idéntica escala, posición, transformación y crop;
- sin claim, número de versión, nombre de repositorio, marco, textura ni texto adicional.

Exportación:

- PNG sRGB de `1280 × 640 px`;
- menos de `1 MB`; el archivo aprobado pesa `86 067 bytes`;
- crop fuente `x = 640`, `y = 375`, `width = 637`, `height = 333`;
- render del crop a `1024 × 535.35 px`;
- ubicación `x = 128 px`, `y = 52.32 px`;
- fondo siempre opaco para conservar la combinación en plataformas claras y oscuras.

Activo aprobado:

```text
assets/brand/github/SAOViVO-GitHub-social-preview-1280x640.png
```

### Generación y control

Los activos se regeneran con:

```powershell
npm.cmd run assets:github
```

El generador usa el Logo maestro y la Leyenda outlined; no recompone la marca ni modifica los SVG originales. Antes de cargar los archivos se comprueban dimensiones, opacidad, fondo `#232322`, peso menor a `1 MB`, legibilidad a tamaño pequeño y conservación del degradé y la sombra blanca.

GitHub admite PNG, JPG o GIF de menos de `1 MB`; recomienda aproximadamente `500 × 500 px` para perfil y `1280 × 640 px` para la mejor vista social. Referencias: [profile picture requirements](https://docs.github.com/en/enterprise-cloud@latest/account-and-profile/reference/profile-reference) y [repository social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).

### Restricción de uso

Estas dos exportaciones sólo se autorizan para:

- avatar de la organización SAOViVO en GitHub;
- imagen social del repositorio oficial de SAOViVO.

No se reutilizan como favicon, icono de aplicación, icono de Windows, avatar de cuentas personales, imagen de instalador, pieza de redes, header web ni plantilla general. Cualquier otra superficie requiere su propia decisión de Marca y look.

## 9. Norte estético

El brutalismo japonés es el norte estético para considerar en el trabajo futuro. Es una dirección, no una licencia para alterar el Logo ni las reglas anteriores.

Principios a explorar:

- estructura visible y composición intencional;
- geometría contundente, tensión y asimetría controlada;
- grandes campos de color y contraste directo;
- materialidad franca, sin ornamento innecesario;
- jerarquía tipográfica fuerte;
- función y legibilidad antes que decoración;
- detalle preciso dentro de una apariencia austera.

Evitar convertir esa referencia en clichés culturales, ornamentos “japoneses” literales o una colección superficial de recursos de moda. También evitar que el producto derive por defecto hacia la estética SaaS genérica: tarjetas redondeadas, sombras blandas, glassmorphism y decoración sin función.

## 10. Usos no autorizados

- Cambiar la grafía de `SAOViVO`.
- Redibujar, simplificar, recortar o deformar el Logo.
- Usar el Logo a color plano.
- Separar, recolocar o redimensionar la Leyenda respecto del Logo.
- Crear nuevas combinaciones de color.
- Aplicar degradés decorativos fuera del Logo como si fueran parte de la paleta.
- Agregar contornos, brillos, volumen, sombras nuevas, transparencias o efectos.
- Encerrar la firma en una forma no aprobada.
- Usar solamente la Leyenda o solamente el Logo fuera de una excepción explícita; el Logo solo está autorizado para el icono de Windows definido en la sección 6 y el avatar de GitHub definido en la sección 8.
- Convertir colores anteriores de la interfaz, como `#181818`, `#00B7C3` o `#007ACC`, en colores institucionales.
- Usar `#00EDFF` fuera del degradé turquesa o de la Leyenda turquesa oficial sobre negro.
- Derivar íconos, monogramas, avatares o favicons nuevos fuera del icono de Windows aprobado en la sección 6 y el avatar de GitHub aprobado en la sección 8.

## 11. Archivos maestros

Ubicación actual de los originales:

```text
C:\+CLIENTES\SAOVIVO VIbe LOGO\IL\SVG
```

Inventario:

```text
SAOViVO_Logo_Negro.svg
SAOViVO_Logo_Blanco.svg
SAOViVO_Logo_Turquesa.svg
SAOViVO_Leyenda_Negro.svg
SAOViVO_Leyenda_Blanco.svg
SAOViVO_Leyenda_Turquesa.svg
```

Los nombres internos heredados de capas o carpetas no establecen una grafía alternativa de la marca.

Las builds empaquetadas no deben depender de fuentes instaladas para renderizar la Leyenda. Los derivados autocontenidos convierten Carbon a contornos sin sobrescribir los maestros editables. Para el panel de Configuración es obligatorio generar `SAOViVO_Leyenda_Turquesa_Outlined.svg` según la sección 7; hasta que exista y pase la verificación visual, esa aplicación de marca no está lista para distribuirse.

## 12. Gobierno de cambios visuales

Cualquier tarea que proponga modificar UI, web, instalador, iconos, capturas, documentación visual, redes o piezas promocionales debe:

1. leer este manual antes de diseñar o editar;
2. describir el soporte, contexto, dimensiones y objetivo;
3. adjuntar captura, maqueta o comparación cuando corresponda;
4. indicar qué regla existente aplica o qué excepción solicita;
5. consultar a **SAOViVO — Marca y look** antes de implementar una excepción o crear una regla nueva.

Las demás tareas pueden detectar problemas visuales y preparar propuestas, pero no deben crear una identidad paralela ni aprobar por sí mismas cambios de marca.

Corregir una aparición mal escrita de `SAOViVO` no requiere inventar una regla nueva: es cumplimiento directo de este manual.

## 13. Checklist de salida

- [ ] La marca está escrita exactamente `SAOViVO`.
- [ ] Se usaron SVG maestros, no una reconstrucción.
- [ ] Logo y Leyenda mantienen la superposición, escala y alineación oficiales.
- [ ] La composición usa una de las tres combinaciones autorizadas.
- [ ] Los tres colores institucionales conviven en sus roles correspondientes.
- [ ] El Logo conserva su degradé.
- [ ] Los tonos auxiliares se limitan al degradé y a la excepción documentada de la Leyenda turquesa.
- [ ] El texto de interfaz sobre fondo turquesa usa negro, no blanco.
- [ ] Los títulos están en ITC Franklin Gothic y mayúsculas.
- [ ] Los párrafos están en ITC Franklin Gothic y capitalización normal.
- [ ] El instalador reproduce el storytelling canónico sin reescrituras, si corresponde.
- [ ] El instalador está íntegramente en español y usa exactamente `Vas a instalar SAOViVO`, `Cómo funciona`, los tres pasos, `SAOViVO está listo` y `Abrir SAOViVO`.
- [ ] El icono de Windows usa sólo el Logo Turquesa sobre `#232322`, con el recorte y las nueve resoluciones aprobadas.
- [ ] La gráfica lateral NSIS mide `164 × 314 px`, es BMP RGB de 24 bits sin alpha y no incluye decoración adicional.
- [ ] La firma completa del instalador aparece sólo en bienvenida y finalización.
- [ ] Configuración muestra la firma turquesa directamente sobre el fondo oscuro, sin franja ni isla.
- [ ] La Leyenda de Configuración usa el derivado outlined, conserva la `O` final y no invade la versión.
- [ ] El avatar de GitHub usa el PNG `500 × 500` aprobado, sin zoom ni recorte manual adicional.
- [ ] La vista social usa el PNG `1280 × 640` aprobado, sin texto ni versión agregados.
- [ ] No se agregó una aplicación especial no aprobada.
- [ ] La pieza respeta el norte austero, estructural y funcional.
- [ ] Una novedad o excepción fue consultada en Marca y look y documentada aquí.

## 14. Definiciones pendientes

- Confirmar familia exacta, cortes y pesos de ITC Franklin Gothic.
- Definir área de protección y tamaño mínimo para pantalla e impresión.
- Crear los demás derivados autocontenidos con tipografías convertidas a contornos; el derivado turquesa de Configuración ya es requisito de implementación en la sección 7.
- Definir favicon e iconos para plataformas o superficies distintas de Windows. El icono de Windows, la identidad gráfica del instalador y las dos superficies de GitHub ya resueltas no se extrapolan a otros usos.

## 15. Discrepancias registradas

Esta sección conserva diferencias detectadas entre el canon y archivos o implementaciones existentes. Una discrepancia no crea una variante autorizada.

| Elemento existente | Diferencia | Definición canónica | Acción futura |
| --- | --- | --- | --- |
| Acento de la aplicación | Usa `#00B7C3` en partes de la UI | El turquesa de marca es `#03AFBA` | Migrar superficies de identidad al intervenirlas, con QA visual |
| `SAOViVO_Leyenda_Turquesa.svg` | Usa `#00EDFF` como color plano | Excepción aprobada por legibilidad sobre negro | Conservar |
| `SAOViVO_Logo_Turquesa.svg` | Usa `#03AFBA` y `#00EDFF` | `#03AFBA` es canon; `#00EDFF`, brillo del degradé | Conservar |
| `SAOViVO_Logo_Negro.svg` | Usa `#232322` y `#000000` | `#232322` es canon; `#000000`, profundidad del degradé | Conservar |
| `SAOViVO_Logo_Blanco.svg` | Usa `#FFFFFF` y `#CCCCCC` | `#FFFFFF` es canon; `#CCCCCC`, sombra del degradé | Conservar |
| Sombra de `SAOViVO_Logo_Blanco.svg` | No declara `fill` y se renderiza `#000000` | La sombra negra institucional debe ser `#232322` | Corregir al normalizar el maestro; no tratar `#000000` plano como variante |
| Tilda `pageid 167110603` | No dispone de ITC Franklin Gothic ni de un kit web activo | ITC Franklin Gothic sigue siendo la familia institucional | Usar temporalmente Mongoose Medium en títulos y Arial en el resto; reemplazar y revisar antes de publicar |
| Configuración anterior al 4 de agosto | Presenta una franja blanca con firma negra | Firma turquesa directa sobre el fondo `#252526`, sin superficie añadida | Retirar por completo la franja y no conservar su layout |
| Leyenda de Configuración | Se corta y cambia de apariencia cuando Carbon no está disponible | Leyenda turquesa completa, derivada del maestro y convertida a contornos | Usar `SAOViVO_Leyenda_Turquesa_Outlined.svg` y verificar la `O` final |
| Organización SAOViVO en GitHub | Muestra una marca anterior | Avatar oficial `SAOViVO-GitHub-avatar-500.png` | Reemplazar manualmente en GitHub; no reutilizar el icono de Windows |
