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

---

## Beneficios

| Beneficio | Descripción |
|----------|------------|
| Ahorro de tiempo | Encuentra y prueba endpoints en segundos |
| Todo en un solo lugar | No necesitas herramientas externas |
| Mejor calidad de código | Detecta errores antes de producción |
| Mayor productividad | Navegación rápida entre endpoints |
| Visibilidad total | Entiende tu API completa al instante |

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

> [!TIP]
> PyPoints combina exploración + testing + análisis en una sola herramienta.

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

* Método: GET  
* Ruta: /users  
* Función: get_users  
* Complejidad: simple  

> [!TIP]
> Mantén el cursor sobre un endpoint para ver su información detallada.
![Explorer Demo](media/focus_mouse.png)

# Casos de uso

* Auditoría de APIs existentes  
* Revisión de código backend  
* Identificación de errores antes de despliegue  
* Generación de documentación técnica  
* Onboarding en proyectos complejos  



## Requisitos

* Visual Studio Code ≥ 1.85  
* Proyecto en Python  

No requiere configuración adicional.

