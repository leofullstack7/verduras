# Prompt para Cursor — Fruver Pedidos: Operarios, Remisiones y Rediseño

## 0. Contexto

Ya existe un prototipo funcional de **Fruver Pedidos** (una sola pantalla HTML/CSS/JS de demostración) para la Distribuidora L y O de Olga. Ahora vamos a construir la aplicación **real**, con base de datos y backend propios (arma la arquitectura que consideres más adecuada: Next.js + una base de datos relacional es una buena opción, pero usa tu criterio). Este documento es la especificación completa de lo que falta por construir en esta fase. Es denso: **impleméntalo por bloques, en el orden en que aparece, y no avances de bloque sin dejar el anterior funcionando.**

Archivos adjuntos que debes usar como referencia exacta (no los reinterpretes libremente):
- `productos_distribuidora_lyo.json` → catálogo real de productos que reemplaza al catálogo de ejemplo actual.
- `remision-reference.html` → referencia visual/estructural de cómo debe verse la remisión digital. Ábrelo en el navegador para verlo. Adáptalo al stack real (componentes, datos dinámicos), no lo copies literal.
- Imagen `@img1` (la hoja de remisión física de Olga) → es la fuente de verdad del formato de remisión y de la lista de productos.

---

## 1. Catálogo de productos real (reemplazar el catálogo de ejemplo)

1. Borra los 10 productos de ejemplo actuales (papa pastusa, cebolla cabezona, etc.) y reemplázalos por los 49 productos de `productos_distribuidora_lyo.json`.
2. Cada producto necesita una **imagen PNG con fondo transparente**, alto contraste, colores vivos, estilo fotográfico consistente entre todos los productos (mismo ángulo/iluminación aproximada, para que la grilla se vea uniforme). Genera tú estas imágenes (con el proveedor de generación de imágenes que tengas disponible en tu entorno) y guárdalas como `/assets/productos/{id}.png` usando el mismo `id` del JSON. Mientras no exista la imagen, usa `emoji_temporal` como respaldo visual.
3. `unidad_sugerida` del JSON es solo el valor por defecto en el catálogo; el admin debe poder cambiarlo desde el panel de Catálogo (esto ya existe en el prototipo, consérvalo).
4. Actualiza los seeds/fixtures de pedidos de ejemplo para que usen productos de esta nueva lista.

---

## 2. Rediseño de la grilla de pedido del cliente

El diseño actual solo muestra 4 productos visibles a la vez en el celular — es muy poco aprovechamiento del espacio. Rediseña la grilla de selección de productos (vista "Pedir" del cliente) así:

- Tarjetas más compactas (reduce padding interno, tamaño de imagen y tipografía manteniendo legibilidad y buen tamaño táctil, mínimo 44×44px de área tocable en los botones +/-).
- Objetivo: que en un celular estándar (375–414px de ancho) se alcancen a ver **entre 6 y 9 tarjetas simultáneamente** sin scroll, repartidas en una grilla de 3 columnas (en vez de 2). En tablet/desktop, aumenta a 5–6 columnas.
- Mantén la paginación por vistas (sin scroll vertical), el indicador de página con puntos, y el orden de productos según historial del cliente (esto ya existe, no lo rompas).
- Mantén el estado "seleccionado" (check verde) y el badge "⭐ frecuente" pero en versión más pequeña, que no rompa el diseño compacto.

---

## 3. Corrección de comportamiento móvil (scroll horizontal y zoom accidental)

Actualmente en celular la página puede hacer scroll horizontal sin querer, y un doble-toque o pellizco puede hacer zoom sobre la pantalla. Corrige esto en todo el proyecto:

- En el `<meta name="viewport">`, usa `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- En CSS global: `html, body { overflow-x: hidden; overscroll-behavior-x: none; }` y `* { touch-action: manipulation; }` (esto evita el zoom por doble-tap sin bloquear scroll vertical ni gestos normales).
- Revisa que ningún contenedor tenga `width` fijo mayor al 100% del viewport que esté generando el scroll horizontal (causa más común: elementos con `white-space: nowrap` sin `overflow-x: auto` explícito, o paddings/márgenes negativos mal calculados).
- Los carruseles/sliders horizontales que sí queremos (como los filtros de la sección 9.2) deben usar `overflow-x: auto` de forma **contenida** dentro de su propio elemento, nunca dejando que el body completo se desplace.

---

## 4. Modelo de datos nuevo

Agrega estas entidades (ajusta nombres a tu convención, pero conserva estos campos):

### 4.1 Usuario operario
```
Operario {
  id, nombre, username, password_hash,
  avatar_emoji (default: "👩‍🌾" o similar), activo: boolean
}
```
Mismo patrón de login (usuario/contraseña) que ya existe para clientes y admin.

### 4.2 Estado del pedido (ampliar el enum actual)
```
EstadoPedido = 
  | "pendiente"     // el cliente lo hizo, ningún operario lo ha tomado (rojo)
  | "acomodando"     // un operario lo está acomodando ahora mismo (amarillo)
  | "acomodado"      // el operario terminó y lo envió al admin (verde, pendiente de precios)
  | "remisionado"     // el admin ya generó la remisión con precios
  | "cerrado"
  | "anulado"
```

### 4.3 Campos nuevos en Pedido
```
Pedido {
  ...campos existentes...,
  operario_id: nullable,          // quién lo está acomodando o lo acomodó
  acomodo_iniciado_en: timestamp nullable,
  acomodo_finalizado_en: timestamp nullable,
  items: [{
     producto_id, cantidad_pedida, unidad_pedida,       // lo que pidió el cliente (kg/g/unidad)
     cantidad_acomodada: nullable, unidad_acomodada: nullable,  // lo que el operario realmente alistó
     precio_unitario: nullable,     // lo que pone el admin (por kg o por g)
     valor_total: nullable          // calculado automáticamente
  }]
}
```

### 4.4 Transferencia / invitación entre operarios
```
InvitacionTransferencia {
  id, pedido_id, operario_origen_id, operario_destino_id,
  estado: "pendiente" | "aceptada" | "rechazada",
  creado_en, resuelto_en
}
```

### 4.5 Remisión
```
Remision {
  id, numero (consecutivo único, ej. autoincremental con prefijo),
  pedido_id, cliente_id,
  fecha, items (snapshot de items con precio y valor_total), valor_total_general,
  enviada_a_operario_id: nullable, enviada_en: nullable,
  vista_por_operario: boolean
}
```

### 4.6 Notificación (para la bandeja del ícono de mujer sonriente)
```
Notificacion {
  id, usuario_id, tipo: "invitacion_transferencia" | "remision_recibida",
  referencia_id (pedido_id o remision_id),
  leida: boolean, creado_en
}
```

---

## 5. Rol Operario — pantalla de inicio

- Login con usuario/contraseña, mismo patrón que clientes/admin (ver sección 4.1).
- Pantalla principal: **tarjetas de tamaño mediano** (ni tan grandes como para no caber varias, ni tan chicas que se pierda legibilidad — apunta a que quepan entre 4 y 6 tarjetas visibles sin scroll en celular), una por cada **cliente que sí hizo pedido hoy** (los clientes sin pedido no aparecen aquí).
- Cada tarjeta debe tener:
  - Fondo de color a **20% de opacidad** (`rgba(color, 0.2)` o equivalente), muy sutil, de fondo completo de la tarjeta:
    - 🔴 rojo si el pedido está `pendiente` (nadie lo ha tomado)
    - 🟡 amarillo si está `acomodando`, con un texto/loader pulsante tipo **"Acomodándose…"**
    - 🟢 verde si ya está `acomodado`
  - Nombre del cliente, hora del pedido.
  - **Vista previa incompleta** del pedido: muestra solo 2–3 productos (ej. "Papa pastusa, Tomate chonto +4 más"), nunca el detalle completo en la tarjeta.
  - Si hay un operario asociado (acomodando o ya acomodado), muestra su nombre en tipografía pequeña y de bajo contraste (ej. gris, 11-12px) — no debe competir visualmente con el nombre del cliente.
- Al tocar una tarjeta `pendiente`: mostrar dos botones, **"Acomodar Pedido"** y **"Solo Ver"**.
- Al tocar una tarjeta `acomodando` o `acomodado`: cualquier operario que **no sea** el operario asignado solo puede entrar en modo **solo lectura** (ve la lista y las cantidades tal cual las está dejando el operario asignado, pero todos los inputs están deshabilitados). El operario asignado sí puede seguir editando.

---

## 6. Flujo de acomodo del pedido (operario)

1. Al tocar **"Acomodar Pedido"**: el pedido pasa a `acomodando`, se guarda `operario_id` y `acomodo_iniciado_en = now()`. La tarjeta en las pantallas de todos los operarios (y en el admin) cambia a amarillo al instante (usa polling o websockets/real-time, lo que tu stack soporte mejor).
2. Se abre el panel de acomodo con la lista de productos pedidos por el cliente, mostrando `cantidad_pedida` + `unidad_pedida` como referencia (ej. "Papa pastusa — pedido: 2 bultos").
3. Por cada producto, el operario tiene:
   - Un input numérico para la cantidad real que está alistando.
   - Un selector de unidad: **kg / g / unidad** (default: **kg**).
4. **Minimizar sin perder el progreso:** el panel de acomodo debe poder minimizarse (ej. un botón que lo colapsa a una burbuja/barra flotante) para que el operario pueda navegar a otras partes de la app (ver otro pedido, notificaciones, etc.) sin perder lo que ya llevaba digitado. Al volver a abrirlo, debe aparecer exactamente como lo dejó. Implementa esto con persistencia real (estado en servidor o localStorage + sincronización), no solo estado de React en memoria que se pierda al desmontar el componente.
5. **Transferir pedido a otro operario:** botón visible mientras el pedido está en `acomodando` y pertenece al operario actual. Al tocarlo, se elige otro operario de una lista, y se crea una `InvitacionTransferencia` con estado `pendiente`. El operario destino recibe una notificación (ver sección 8) del tipo "X te transfirió el pedido de [cliente], ¿aceptas?" con botones **Aceptar** / **Rechazar**.
   - Si acepta: `operario_id` del pedido cambia al operario destino, se conserva todo lo ya acomodado.
   - Si rechaza: el pedido se queda con el operario original, que recibe una notificación de que fue rechazada.
6. **Enviar pedido acomodado:** botón "Enviar al administrador" (o similar). Al confirmarlo:
   - El pedido pasa a `acomodado`, se guarda `acomodo_finalizado_en = now()`.
   - Debajo del formulario (o en una pantalla de confirmación breve) se muestra:
     - El conteo total de pedidos acomodados por ese operario (hoy, o histórico — usa "hoy" por defecto).
     - El tiempo que tomó acomodar este pedido en particular (`acomodo_finalizado_en - acomodo_iniciado_en`, en formato "X min").
     - Un **mensaje motivacional, tono relajado y colombiano, nada formal**, elegido al azar de un banco de frases. Ejemplos para usar como banco inicial (agrega más si quieres, mismo tono):
       - "¡Eso es! Uno más que cae. Vas a full 💪"
       - "De una, quedó liso. Sigue con esa energía 🙌"
       - "¡Otro pedido acomodado como todo un profesional! Dale que vas bien 🔥"
       - "Ese quedó perfecto. Ya llevas [N] hoy, ¡una máquina!"
       - "Bien hecho, parcero. A por el siguiente 🚀"

---

## 7. Flujo de precios y remisión (admin)

1. Cuando un pedido está en `acomodado`, el admin lo abre desde su panel y ve, por cada producto, la `cantidad_acomodada` + `unidad_acomodada` que dejó el operario.
2. El admin escribe el **precio actual del día** por producto (normalmente por kg, pero respeta la unidad que dejó el operario — si acomodó en gramos, el admin puede poner precio por gramo o por kg y el sistema convierte).
3. **Los inputs de precio deben ser un 5% más anchos** que el ancho estándar de input que se usa en el resto de la aplicación (defínelo como variable/token de diseño, no un valor mágico suelto).
4. Al escribir el precio, calcula automáticamente `valor_total = cantidad_acomodada (convertida a la unidad del precio) × precio_unitario`, y muéstralo de inmediato debajo de la tarjeta de ese producto en un **contenedor verde de baja opacidad** (fondo verde suave, no sólido), con un ícono de moneda 🪙 (poco saturado, no muy oscuro), formateado como pesos colombianos sin decimales: `$10.000` (punto como separador de miles, sin "COP", sin decimales).
5. Al final, muestra el total general del pedido sumando todos los productos, en el mismo estilo visual.
6. Cambia el texto del botón final de **"Guardar precios y facturar"** a **"Crear remisión"**.
7. Al tocar "Crear remisión":
   - Se genera un registro `Remision` con número consecutivo único (ej. `Nº 00148`), visible en rojo en la esquina superior derecha del documento — igual que en la hoja física de Olga (campo "REMISIÓN Nº").
   - El pedido pasa a estado `remisionado`.
   - Se abre la vista de la remisión digital (ver sección 7.1).

### 7.1 Diseño de la remisión digital

Usa `remision-reference.html` como base estructural y adáptala a datos reales y al stack de la app. Debe verse **muy similar a la hoja física** de la imagen de referencia:
- Encabezado con nombre del negocio ("DISTRIBUIDORA L y O"), datos de Olga, casillas de Día/Mes/Año, y el número de remisión en rojo arriba a la derecha.
- Datos del cliente: Señor(es), Dirección, Teléfono, Ciudad (autocompletados desde el pedido/cliente, no se digitan a mano).
- Tabla de productos con las columnas Cant. / Artículo / Vr. Unitario / Vr. Total (puede ser en dos columnas como la hoja física para impresión, y una sola columna apilada en pantallas angostas).
- Total general al final, y líneas de Firma / CC-NIT.
- Debe poder **imprimirse / exportarse a PDF** (reutiliza la lógica de impresión que ya existe en el consolidado del admin).

### 7.2 Enviar remisión a operario

- Después de crear la remisión, el admin tiene la opción **"Enviar a operario"**, que abre un selector de operarios activos.
- Al enviarla, se crea una `Notificacion` tipo `remision_recibida` para ese operario (ver sección 8), y se guarda `enviada_a_operario_id` / `enviada_en` en la remisión.
- Tanto el operario como Olga pueden ver la remisión desde su bandeja de notificaciones o desde el pedido. Dentro de la remisión debe haber un botón **"Ver pedido"** que abre el pedido con el mismo formato visual que usa la app normalmente, pero **en modo solo lectura** (sin ningún input editable, sin botones de acción).

---

## 8. Bandeja de notificaciones (operario y admin)

- Botón flotante fijo abajo a la izquierda de la pantalla, visible tanto para operarios como para Olga (admin), con el ícono de una **mujer sonriente de unos 50 años** (representa a Olga / el centro de avisos del sistema).
- Debe tener un **badge numérico pulsante** (animación sutil de "latido", no agresiva) mostrando la cantidad de notificaciones no leídas (invitaciones de transferencia pendientes + remisiones recibidas sin ver).
- Al tocarlo, se abre una lista de notificaciones (más reciente primero), cada una con acción directa según el tipo:
  - `invitacion_transferencia` → botones Aceptar/Rechazar inline.
  - `remision_recibida` → al tocarla, abre la remisión (ver 7.2).
- Marca como leída automáticamente al abrir/resolver.

---

## 9. Rediseño del panel de admin — "Pedidos para despachar"

### 9.1 Título dinámico

Reemplaza el título fijo "Últimos pedidos de hoy" por un título que dependa de la hora actual respecto a la **hora de corte configurada**:
- Si todavía no ha pasado la hora de corte de hoy → `"Pedidos para despachar hoy {díaSemana}"` (ej. "Pedidos para despachar hoy Martes").
- Si ya pasó la hora de corte → `"Pedidos para despachar mañana {díaSemana}"` (el día siguiente).
- Usa nombres de día en español, con mayúscula inicial.

### 9.2 Filtros deslizantes por cliente

Debajo del título, agrega una fila de **chips deslizables horizontalmente** (scroll horizontal contenido, con "snap" para que quede prolijo), donde el primero siempre es **"Todos"** y luego uno por cada cliente que tenga al menos un pedido en el rango de fechas mostrado. Al tocar un chip, la lista de pedidos se filtra a ese cliente únicamente. El chip activo debe destacarse visualmente (ya existe un patrón similar de "tabs" en el prototipo — reutilízalo y hazlo deslizable si no lo es).

### 9.3 Tarjetas de pedido (admin)

Aplica el mismo lenguaje visual que en la pantalla del operario (sección 5):
- Fondo de color a 20% de opacidad: rojo (`pendiente`), amarillo (`acomodando`), verde (`acomodado` / `remisionado`).
- Vista previa incompleta del pedido (2–3 productos + "+N más"), nunca el listado completo dentro de la tarjeta.
- Nombre del operario asignado (si aplica) en tipografía pequeña y discreta, igual que en la vista de operario.
- Al tocar la tarjeta se abre el detalle completo (ahí sí con el flujo de precios de la sección 7).

---

## 10. Confirmación de anulación reforzada

Al anular un pedido, el modal de confirmación actual debe reforzarse: además del botón de confirmar, el admin debe **escribir la palabra exacta "ANULAR"** en un campo de texto para que el botón de confirmar se habilite. Si el texto no coincide exactamente (mayúsculas incluidas), el botón permanece deshabilitado. Mantén el registro en auditoría que ya existe.

---

## 11. Rediseño de las estadísticas del dashboard del admin

Las 4 tarjetas numéricas actuales ("Pedidos hoy", "Pendientes", "Consolidados", "Cerrados") se sienten planas. Reemplázalas por un resumen más útil y visual. Propuesta (impleméntala así, es una decisión ya tomada, no hace falta validarla de nuevo):

1. **Anillo/barra de progreso circular** grande: "X de Y pedidos acomodados hoy" (porcentaje visual, no solo el número).
2. **Valor total estimado del día** (suma de `valor_total` de los pedidos ya con precio puesto; si aún no tienen precio, muestra el valor acumulado hasta el momento y aclara "parcial").
3. **Tiempo promedio de acomodo** de los pedidos completados hoy (promedio de `acomodo_finalizado_en - acomodo_iniciado_en`), en minutos.
4. **Clientes pendientes por pedir** (clientes activos que aún no han hecho pedido hoy, respecto al total de clientes activos), para que Olga sepa a quién le puede hacer falta recordarle.

Consérvalos con el mismo lenguaje visual (colores verde/amarillo/naranja, tarjetas redondeadas) pero con mejor jerarquía: el anillo de progreso debe ser el elemento más grande/destacado de la fila.

---

## 12. Checklist final antes de entregar

- [ ] Catálogo reemplazado con los 49 productos reales + imágenes generadas.
- [ ] Grilla de cliente muestra 6–9 productos visibles en celular sin scroll.
- [ ] No hay scroll horizontal accidental ni zoom por doble-tap en ningún dispositivo probado.
- [ ] Login de operario funcional, con datos de demostración documentados igual que se hizo para clientes/admin.
- [ ] Estados de pedido (rojo/amarillo/verde) sincronizados en tiempo real (o casi) entre operarios y admin.
- [ ] Bloqueo de edición para operarios no asignados, con vista de solo lectura funcionando.
- [ ] Transferencia entre operarios con invitación aceptar/rechazar funcionando de punta a punta.
- [ ] Panel de acomodo minimizable sin pérdida de datos.
- [ ] Contador de pedidos + tiempo + mensaje motivacional al finalizar acomodo.
- [ ] Cálculo automático de valores con precio del día, formateado en pesos colombianos.
- [ ] Botón "Crear remisión" genera remisión con número consecutivo en rojo, visualmente fiel a la hoja física.
- [ ] Envío de remisión a operario + bandeja de notificaciones con ícono de mujer sonriente y badge pulsante.
- [ ] Vista de pedido "solo lectura" accesible desde la remisión.
- [ ] Confirmación de anulación exige escribir "ANULAR".
- [ ] Dashboard de admin con título dinámico hoy/mañana, filtros deslizables por cliente, y las 4 estadísticas rediseñadas.

---

*Este documento junto con `productos_distribuidora_lyo.json` y `remision-reference.html` conforman el paquete completo de esta fase. Cualquier duda de diseño que no esté resuelta aquí, sigue el estilo visual ya establecido en el prototipo actual (blanco de fondo, acentos verde/amarillo/naranja, tarjetas redondeadas, tipografía Fredoka para títulos y Nunito para texto).*
