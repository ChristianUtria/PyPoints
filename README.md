# PyPoints — Python API Tester, REST Client & Endpoint Explorer for VS Code

> **Aviso de Migración:** La funcionalidad de mapeo de estructura de proyectos y construcción de contexto para IA ha crecido tanto que la hemos migrado a su propia extensión dedicada: **ArchView**.  
> Si buscas la herramienta para optimizar tokens y enviar contexto a Claude o ChatGPT, busca **ArchView** en la tienda de extensiones. PyPoints ahora se enfoca al 100% en ser el cliente REST y testeador de APIs definitivo para tu editor.
<div align="center">
  <img src="media/archview-banner.png" alt="PyPoints Banner" width="100%">
</div>

## PyPoints es una extensión para Visual Studio Code que funciona como un **Python API tester, REST client y endpoint explorer todo en uno**.

Escanea automáticamente proyectos Flask, FastAPI y Django, analiza endpoints y permite probar APIs (GET, POST, PUT, DELETE) directamente desde VS Code sin necesidad de abrir herramientas externas.

---

## Python API Tester & REST Client for VS Code

PyPoints centraliza tu flujo de trabajo backend. Te permite:

- Testear APIs directamente desde el editor
- Enviar peticiones HTTP completas (GET, POST, PUT, DELETE, PATCH)
- Mantener un **historial permanente** de tus peticiones y respuestas
- Explorar y mapear endpoints de forma automática
- Analizar rutas, detectar vulnerabilidades y malas prácticas
- Reemplazar clientes externos como Postman o Insomnia

---

## Características clave

- **Escaneo inteligente:** Soporte nativo para Flask, FastAPI y Django
- **REST Client Integrado:** Interfaz gráfica para configurar Headers, Query Params y Body (JSON/Form)
- **Historial Permanente:** Tus pruebas de API se guardan entre sesiones. No pierdes tu contexto al cerrar el editor
- **Explorador visual:** Árbol de navegación de APIs dentro del panel lateral de VS Code
- **Linter de Endpoints:** Detección automática de errores, rutas duplicadas y código muerto
- **Snippets automáticos:** Generación de comandos cURL listos para copiar
- **Filtros avanzados:** Búsqueda rápida por método, archivo o estado de la ruta
- **Documentación instantánea:** Exportación de toda la arquitectura a JSON y Markdown

---

## Beneficios

| Beneficio | Descripción |
|-----------|-------------|
| **Ahorro de tiempo** | Encuentra, configura y prueba endpoints en segundos sin cambiar de ventana |
| **Flujo unificado** | Todo ocurre dentro de VS Code, manteniendo tu concentración en el código |
| **Prevención de errores** | Detecta colisiones de rutas y malas prácticas antes de hacer deploy |
| **Trazabilidad** | Recupera pruebas anteriores gracias al historial permanente |
| **Visibilidad total** | Comprende la arquitectura completa de tu API de un solo vistazo |

---

## Preview (API Explorer & REST Testing in action)

![Explorer Demo](media/INICIO.gif)

---

## ¿Por qué usar PyPoints?

En proyectos backend reales, los endpoints suelen estar dispersos en múltiples archivos, lo que dificulta:

- Entender la arquitectura completa de la API
- Detectar errores antes de producción
- Mantener consistencia en rutas y métodos
- Navegar rápidamente entre funcionalidades

A diferencia de otras herramientas, PyPoints resuelve esto con análisis estático inteligente y herramientas de testing integradas. No necesitas levantar el servidor solo para saber qué rutas existen, ni exportar colecciones a un software externo para probarlas.

> **Tip:** PyPoints combina **exploración + testing + análisis estático** en una sola vista accionable. Ideal para desarrolladores backend que trabajan con Flask, FastAPI o Django.

---

## Capacidades principales al detalle

### 1. Cliente REST Nativo y Testing

No es solo un visor. Puedes interactuar con tu código directamente.

- Configuración de variables, cabeceras y cuerpos de petición (JSON)
- Visualización de la respuesta del servidor (Status, Headers, Body, Tiempo de respuesta)
- **Historial Permanente:** Las peticiones realizadas se almacenan de forma persistente. Si cierras VS Code y vuelves mañana, tus pruebas y respuestas anteriores seguirán ahí para que retomes tu trabajo exactamente donde lo dejaste

---

### 2. Exploración centralizada de endpoints

Visualiza todos los endpoints de tu API en un explorador integrado dentro de VS Code.

- Estructura clara y jerárquica
- Agrupación lógica por archivo o categoría
- Acceso directo al código fuente con un solo clic
- Escalable para monolitos y microservicios grandes

> **Importante:** Elimina por completo la necesidad de buscar manualmente decoradores de rutas a través del explorador de archivos tradicional.

---

### 3. Búsqueda y filtrado avanzado

![Explorer Demo](media/funcionalidades_barra.gif)

Encuentra cualquier endpoint en segundos.

- Búsqueda por nombre, ruta, método o archivo
- Filtros rápidos por método HTTP (mostrar solo GET, o solo POST)
- Vista exclusiva de endpoints con problemas

> **Nota:** En proyectos grandes, esta función reduce drásticamente el tiempo de navegación.

---

### 4. Vista detallada (Preview interactivo)

![Explorer Demo](media/preview.gif)

Cada endpoint tiene un panel dedicado que muestra:

- Código fuente formateado y aislado
- Métodos soportados e información estructurada
- Indicadores visuales de estado
- Generación automática del comando cURL
- Botón de ejecución directa hacia el cliente REST

> **Tip:** Usa esta vista como alternativa integrada a herramientas como Postman o clientes REST externos.

---

### 5. Análisis estático (API Linter)

PyPoints evalúa la calidad de tus endpoints sin necesidad de ejecutarlos. Detecta:

- Uso de `print()` (que podría causar fugas de información en producción)
- Funciones sin sentencia `return`
- Parámetros inválidos o rutas mal formadas
- Nombres de funciones poco descriptivos

![Explorer Demo](media/advertencia.png)

> **Advertencia:** Estos problemas pueden causar fallos en producción o dificultar el mantenimiento.

---

### 6. Prevención de colisiones y duplicados

Identifica errores críticos en la arquitectura de la API:

- Rutas duplicadas operando bajo el mismo método HTTP
- Funciones repetidas o sobrescritas accidentalmente
- Posibles colisiones de comportamiento

![Explorer Demo](media/error.png)

> **Importante:** Este tipo de errores suele ser silencioso y pasar desapercibido hasta que causa fallos en producción.

---

### 7. Clasificación de complejidad

Analiza automáticamente la carga cognitiva de cada endpoint:

```
Simple   (I)
Medio    (II)
Complejo (III)
```

> **Tip:** Los endpoints clasificados como "Complejos" (III) son los candidatos ideales para aplicar refactorización y extraer lógica de negocio.

---

### 8. Exportación y Documentación

Genera documentación al vuelo para tu equipo.

- Exporta tu lista de endpoints en formato **Markdown** (ideal para PRs o Wikis)
- Exporta en formato **JSON** para integraciones con otras herramientas

> **Nota:** Ideal para documentación técnica, auditorías o trabajo en equipo.

---

## Flujo de uso básico

1. Abre tu proyecto de Python (Flask, FastAPI o Django) en VS Code
2. Haz clic en el ícono de PyPoints en la barra lateral
3. Ejecuta **"Scan Workspace"** para mapear el proyecto
4. Explora, filtra y analiza tus endpoints

> **Tip:** Usa la búsqueda para ubicar endpoints específicos en segundos.

---

## Ejemplo de Detección

```python
@app.get("/users")
def get_users():
    return {"users": []}
```

**Resultado en el panel de PyPoints:**

| Campo | Valor |
|-------|-------|
| Método | `GET` |
| Ruta | `/users` |
| Función | `get_users` |
| Complejidad | Simple |
| Acciones | `[Test Endpoint]` · `[Copy cURL]` |

> **Tip:** Mantén el cursor sobre un endpoint en el árbol para ver un resumen rápido de su estado.

![Explorer Demo](media/focus_mouse.png)

---

## Casos de uso

- **Desarrollo activo:** Prueba tus rutas a medida que las construyes
- **Auditoría de APIs:** Revisa la calidad y estandarización de APIs legacy
- **Onboarding:** Entiende rápidamente la estructura de un proyecto nuevo
- **Testing rápido:** Evita abrir Postman para probar un simple cambio en una respuesta JSON
- **Prevención:** Detecta rutas duplicadas antes de hacer commit
- **Documentación:** Genera documentación técnica automática para tu equipo

---

## Requisitos

- Visual Studio Code ≥ 1.85
- Proyecto estructurado en Python (soporte activo para Flask, FastAPI, Django)

No requiere configuración adicional. Funciona inmediatamente después de la instalación.
