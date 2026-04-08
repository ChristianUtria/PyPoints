# PyPoints — Python API Endpoint Explorer

Herramienta avanzada para analizar, visualizar y entender endpoints de APIs en proyectos Python directamente desde Visual Studio Code.

PyPoints convierte tu código backend en una representación clara, estructurada y navegable, permitiéndote detectar errores, duplicados y problemas de diseño en segundos.

## Visión general

En proyectos backend modernos, los endpoints suelen estar distribuidos en múltiples archivos, frameworks y capas. Esto dificulta comprender la estructura completa de la API, detectar errores antes de producción, mantener consistencia en rutas y métodos y navegar rápidamente entre funcionalidades.

PyPoints resuelve este problema proporcionando un análisis estático inteligente que transforma tu código en un mapa interactivo de tu API.

> [!TIP]
> Diseñado para desarrolladores backend que trabajan con Flask, FastAPI o Django y necesitan visibilidad inmediata sobre su API.

## PREVIEW
### Explorador de endpoints en tiempo real
![Explorer Demo](media/INICIO.gif)


## Capacidades principales

### Exploración centralizada de endpoints

Visualiza todos los endpoints detectados en un único panel dentro de Visual Studio Code.

* Listado completo y estructurado
* Agrupación por archivo o categoría
* Navegación directa al código fuente
* Vista jerárquica clara y escalable

Aquí puedes insertar una imagen o GIF del panel principal.

### Búsqueda y filtrado avanzado
### Funcionalidad, buscador, filtros, limpiar filtros, actualizar

![Explorer Demo](media/funcionalidades_barra.gif)

Reduce el tiempo de localización de endpoints de minutos a segundos.

* Búsqueda por nombre, ruta, método o archivo
* Filtro por método HTTP
* Visualización exclusiva de endpoints con problemas

> [!NOTE]
> Especialmente útil en proyectos grandes donde la navegación manual no es eficiente.

### Análisis estático y validación

PyPoints no solo detecta endpoints, sino que evalúa su calidad.

Incluye validaciones como:

* Rutas mal definidas
* Parámetros inválidos
* Uso de código de depuración (`print`)
* Funciones sin retorno
* Nombres poco descriptivos

### Ejemplo de uno de los varios casos de advertencias 
![Explorer Demo](media/advertencia.png)

> [!WARNING]
> Estos problemas pueden generar fallos en producción o dificultar el mantenimiento del sistema.

### Detección de conflictos y duplicados

Identifica inconsistencias críticas en tu API:

* Endpoints con misma ruta y método
* Funciones duplicadas en distintos archivos
* Posibles colisiones de comportamiento

### Ejemplo de uno de los varios casos de errores
![Explorer Demo](media/error.png)

### Vista detallada de endpoints

Cada endpoint cuenta con un panel de análisis completo:

* Código fuente formateado
* Información estructurada del endpoint
* Indicadores visuales de estado
* Generación automática de comandos cURL

![Explorer Demo](media/preview.gif)

### Clasificación de complejidad

Evaluación automática del nivel de complejidad del endpoint:

```python
* Simple (I)
* Medio (II)
* Complejo (III)
```

> [!TIP]
> Los endpoints complejos suelen ser los principales candidatos a optimización.

![Explorer Demo](media/focus_mouse.png)


### Integración con el editor

PyPoints se integra directamente en tu flujo de trabajo:

* Decoraciones visuales en el código
* Indicadores de errores y advertencias en línea
* Navegación inmediata al endpoint

### Exportación de información

Permite generar documentación estructurada de tu API:

* Exportación en formato JSON
* Exportación en formato Markdown

> [!NOTE]
> Útil para documentación técnica, auditorías o colaboración en equipo.

## Flujo de uso

1. Abre tu proyecto Python en Visual Studio Code
2. Accede al panel de PyPoints
3. Ejecuta Scan Workspace
4. Explora, filtra y analiza tus endpoints

> [!TIP]
> Utiliza la búsqueda integrada para localizar endpoints específicos en proyectos grandes.

## Ejemplo

```python
@app.get("/users")
def get_users():
    return {"users": []}
```

Resultado del análisis:

* Método HTTP: GET
* Ruta: /users
* Función: get_users
* Complejidad: simple

> [!TIP]
> dejar el mouse fijo en un endpoint hace que puedas ver su informacion como se muestra a continuacion:



## Casos de uso

* Auditoría de APIs existentes
* Revisión de código backend
* Identificación de errores antes de despliegue
* Generación de documentación técnica
* Comprensión de proyectos complejos

## Limitaciones actuales

* No detecta endpoints dinámicos altamente abstractos
* En Django, el análisis se centra en archivos de rutas
* Funciones con múltiples flujos complejos pueden requerir revisión manual

> [!WARNING]
> PyPoints es una herramienta de análisis estático y no reemplaza pruebas funcionales o de integración.

## Roadmap

* Soporte para Java (Spring Boot)
* Soporte para Node.js (Express)
* Exportación a OpenAPI / Swagger
* Testing de endpoints dentro de VS Code
* Métricas avanzadas de calidad de API

## Requisitos

* Visual Studio Code ≥ 1.85
* Proyecto en Python

No se requieren configuraciones adicionales.

## Licencia

MIT

## Autor

Desarrollado con enfoque en productividad, calidad de código y análisis real de APIs.
