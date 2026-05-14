# PyPoints — Python API Tester, REST Client & Endpoint Explorer for VS Code

PyPoints es una extensión para Visual Studio Code que funciona como un **Python API tester, REST client y endpoint explorer todo en uno**.

Escanea automáticamente proyectos Flask, FastAPI y Django, analiza endpoints y permite probar APIs (GET, POST, PUT, DELETE) directamente desde VS Code sin herramientas externas.

---

## Python API Tester & REST Client for VS Code

PyPoints permite:

- Testear APIs directamente desde VS Code
- Enviar requests HTTP (GET, POST, PUT, DELETE)
- Explorar endpoints automáticamente
- Analizar rutas y detectar errores
- Funcionar como alternativa a Postman o REST Client

---

## Características clave

- Escaneo automático de endpoints en proyectos Python
- Explorador visual de APIs dentro de VS Code
- Prueba de endpoints (GET, POST, etc.) tipo REST client
- Generación automática de cURL
- Detección de errores, duplicados y malas prácticas
- Filtros avanzados y búsqueda inteligente
- Exportación a JSON y Markdown
- **CodeLens integrado** con acciones Run | Copy Route | Copy cURL sobre cada endpoint
- **Panel AI Context** con resumen inteligente, optimización y análisis de tokens con Claude
- **Project Structure** visualizador interactivo del árbol del proyecto
- **Files panel** con navegación y resumen IA de archivos
- **Context Manager** para seleccionar, optimizar y copiar archivos al portapapeles

---

## Beneficios

| Beneficio | Descripción |
|----------|------------|
| Ahorro de tiempo | Encuentra y prueba endpoints en segundos |
| Todo en un solo lugar | No necesitas herramientas externas |
| Mejor calidad de código | Detecta errores antes de producción |
| Mayor productividad | Navegación rápida entre endpoints |
| Visibilidad total | Entiende tu API completa al instante |
| IA integrada | Resume y optimiza tu código con Claude sin salir del editor |

---

## Preview (API Explorer & REST Testing in action)

![Explorer Demo](media/INICIO.gif)

---

## ¿Por qué usar PyPoints?

A diferencia de otras herramientas como clientes REST externos, PyPoints integra todo el flujo directamente en tu editor:

- No necesitas salir de VS Code
- Puedes analizar y probar endpoints en tiempo real
- Detectas errores antes de ejecutar el servidor
- Visualizas toda tu API en segundos
- Obtienes resúmenes y optimizaciones con IA directamente en el panel

> [!TIP]
> PyPoints combina exploración + testing + análisis + IA en una sola herramienta.

---

## Visión general

En proyectos backend reales, los endpoints suelen estar dispersos en múltiples archivos, lo que dificulta:

- Entender la arquitectura completa de la API
- Detectar errores antes de producción
- Mantener consistencia en rutas y métodos
- Navegar rápidamente entre funcionalidades

PyPoints resuelve este problema con análisis estático inteligente, centralizando toda tu API en una vista clara y accionable.

> [!TIP]
> Ideal para desarrolladores backend que trabajan con Flask, FastAPI o Django.

---

## Capacidades principales

### Exploración centralizada de endpoints

Visualiza todos los endpoints de tu API en un explorador integrado dentro de VS Code.

- Estructura clara y jerárquica
- Agrupación por archivo o categoría
- Acceso directo al código fuente
- Escalable para proyectos grandes

> [!IMPORTANT]
> Esto elimina la necesidad de buscar manualmente rutas en múltiples archivos.

---

### Búsqueda y filtrado avanzado

![Explorer Demo](media/funcionalidades_barra.gif)

Permite encontrar cualquier endpoint en segundos.

Incluye:

- Búsqueda por nombre, ruta, método o archivo
- Filtro por método HTTP (GET, POST, etc.)
- Vista exclusiva de endpoints con problemas

> [!NOTE]
> En proyectos grandes, esta función reduce drásticamente el tiempo de navegación.

---

### CodeLens integrado

PyPoints inyecta acciones directamente sobre cada endpoint en el editor, sin necesidad de abrir ningún panel.

Sobre cada ruta aparecen tres acciones en línea:

- **Run** — ejecuta una prueba del endpoint al instante
- **Copy Route** — copia la ruta al portapapeles
- **Copy cURL** — genera y copia el comando cURL completo

![CodeLens Demo](media/codelens.gif)

> [!TIP]
> Puedes desactivar el CodeLens desde la configuración `pypoints.enableCodeLens` si prefieres una vista más limpia.

---

### Análisis estático y validación

PyPoints no solo detecta endpoints, también evalúa su calidad.

Detecta automáticamente:

- Rutas mal formadas
- Parámetros inválidos
- Uso de `print()` (debug en producción)
- Funciones sin `return`
- Nombres poco descriptivos

![Explorer Demo](media/advertencia.png)

> [!WARNING]
> Estos problemas pueden causar fallos en producción o dificultar el mantenimiento.

---

### Detección de duplicados y conflictos

Identifica errores críticos en tu API:

- Rutas duplicadas con el mismo método
- Funciones repetidas en diferentes archivos
- Posibles colisiones de comportamiento

![Explorer Demo](media/error.png)

> [!IMPORTANT]
> Este tipo de errores suele pasar desapercibido hasta producción.

---

### Vista detallada de endpoints (Preview interactivo)

![Explorer Demo](media/preview.gif)

Cada endpoint tiene un panel completo con:

- Código fuente formateado
- Información estructurada
- Indicadores visuales de estado
- Generación automática de cURL
- Pruebas de endpoints directamente desde VS Code

> [!TIP]
> Usa esta vista como alternativa integrada a herramientas como Postman o clientes REST externos.

---

### Project Structure — Visualizador del árbol del proyecto

Accede a una vista interactiva de toda la estructura de tu proyecto directamente desde el panel lateral de VS Code.

- Árbol visual del proyecto con archivos y carpetas
- Disponible desde el explorador y desde el panel PyPoints Explorer
- **Copy Structure** — copia la estructura completa al portapapeles con un clic desde el menú contextual

> [!TIP]
> Usa `PyPoints: 🌳 Ver árbol del proyecto` desde la barra del explorador para abrir la vista instantáneamente.

---

### Files Panel — Navegación y resumen de archivos con IA

El panel **Files** dentro de PyPoints Explorer centraliza la navegación por los archivos de tu proyecto.

- Lista de archivos relevantes del workspace
- Botón ** IA (Claude)** para resumir cualquier archivo con inteligencia artificial
- Integración directa con la API de Anthropic sin salir de VS Code

Para habilitar el resumen con IA, configura tu API key en:

```
pypoints.anthropicApiKey
```

> [!NOTE]
> Tu API key se guarda en la configuración local de VS Code y nunca se comparte.

---

### AI Context — Gestión de contexto para IAs

El panel **AI Context** te permite seleccionar archivos de tu proyecto, optimizarlos y copiarlos listos para pegarlos en cualquier herramienta de IA (Claude, ChatGPT, Cursor, etc.).

#### Gestión de archivos en el contexto

- **Add to PyPoints Context** — agrega archivos al contexto desde el explorador de VS Code
- **Remove from Context** — elimina archivos individuales del contexto
- **Clear Selection** — limpia todos los archivos seleccionados
- **Exclude / Include** — excluye archivos específicos sin eliminarlos de la lista
- **Clear All Exclusions** — reactiva todos los archivos excluidos

#### Optimización y copia

- **Copy Selected Files** — copia el contenido de los archivos seleccionados al portapapeles
- **Optimize & Copy** — comprime y optimiza el contenido antes de copiarlo, reduciendo tokens innecesarios
- **Preview Optimization** — previsualiza el resultado de la optimización antes de copiar
- **Copy Optimized** — copia la versión optimizada de un archivo individual

#### Análisis con IA (Claude)

- **Summarize with Claude** — genera un resumen inteligente de los archivos seleccionados usando Claude
- **Analyze Token Usage** — muestra cuántos tokens consume cada archivo
- **Show Token Usage** — vista global del uso de tokens del contexto actual
- **Analyze Dependencies** — detecta dependencias entre los archivos seleccionados

Para habilitar las funciones de IA, configura tu API key en:

```
pypoints.claudeApiKey
```

> [!TIP]
> Si ya tienes configurado `pypoints.anthropicApiKey`, también funciona en este panel.

---

### Perfiles de optimización

PyPoints incluye tres perfiles para controlar el nivel de compresión al copiar contexto para IA:

| Perfil | Descripción |
|--------|------------|
| `fast` | Elimina comentarios, líneas vacías y espacios extra |
| `balanced` | Fast + JSON compacto, detección de patrones, truncado inteligente |
| `ai_max` | Balanced + resumen de logs y compresión agresiva |

Selecciona el perfil con **Select Optimization Profile** desde el panel AI Context, o configura el predeterminado en:

```
pypoints.defaultProfile
```

> [!TIP]
> Usa `ai_max` cuando necesites enviar mucho código a una IA con límite de tokens.

---

### Clasificación de complejidad

PyPoints analiza automáticamente la complejidad del endpoint:
```python
Simple   (I)
Medio    (II)
Complejo (III)
```

Esto se basa en la cantidad de líneas de la función.

> [!TIP]
> Los endpoints complejos suelen ser los principales candidatos a refactorización.

---

### Exportación de endpoints

Genera documentación automáticamente:

- Exportación a JSON
- Exportación a Markdown

> [!NOTE]
> Ideal para documentación técnica, auditorías o trabajo en equipo.

---

## Flujo de uso

1. Abre tu proyecto Python en Visual Studio Code
2. Accede al panel de PyPoints
3. Ejecuta "Scan Workspace"
4. Explora, filtra y analiza tus endpoints
5. Usa el panel **AI Context** para seleccionar archivos, optimizarlos y copiarlos a tu IA favorita

> [!TIP]
> Usa la búsqueda para ubicar endpoints específicos en segundos.

---

## Ejemplo

```python
@app.get("/users")
def get_users():
    return {"users": []}
```

Resultado:

- Método: GET
- Ruta: /users
- Función: get_users
- Complejidad: simple

> [!TIP]
> Mantén el cursor sobre un endpoint para ver su información detallada.

![Explorer Demo](media/focus_mouse.png)

---

## Configuración

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `pypoints.baseUrl` | string | URL base para construir los cURLs desde el CodeLens (default: `http://localhost:5000`) |
| `pypoints.enableCodeLens` | boolean | Mostrar CodeLens (Run \| Copy Route \| Copy cURL) sobre cada endpoint (default: `true`) |
| `pypoints.anthropicApiKey` | string | API key de Anthropic para el botón  IA en el panel Files |
| `pypoints.claudeApiKey` | string | API key de Anthropic para el panel AI Context |
| `pypoints.defaultProfile` | string | Perfil de optimización por defecto: `fast`, `balanced` o `ai_max` (default: `balanced`) |

---

## Casos de uso

- Auditoría de APIs existentes
- Revisión de código backend
- Identificación de errores antes de despliegue
- Generación de documentación técnica
- Onboarding en proyectos complejos
- Preparación de contexto optimizado para herramientas de IA

---

## Requisitos

- Visual Studio Code ≥ 1.85
- Proyecto en Python (Flask, FastAPI o Django)

No requiere configuración adicional para las funciones base. Las funciones de IA requieren una API key de Anthropic.
