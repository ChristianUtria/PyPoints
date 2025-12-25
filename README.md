# PyPoints README

PyPoints es una extensión de Visual Studio Code que te permite **analizar y visualizar todos tus endpoints de Flask y FastAPI** en tus proyectos Python.  
Con PyPoints podrás ver de manera clara el **nombre, método, número de líneas y código de cada endpoint**, agrupados por categorías usando comentarios `# nombre`.  
Su interfaz estilo Postman facilita navegar y revisar tus APIs directamente desde VS Code.

## Features

- Detecta endpoints de **Flask** y **FastAPI** automáticamente.  
- Agrupa endpoints por categorías usando comentarios `# nombre`.  
- Muestra detalles de cada endpoint:  
  - Nombre de la función  
  - Método HTTP (GET, POST, PUT, DELETE)  
  - Líneas de código, línea inicial y final  
  - Código completo del endpoint  
- Interfaz dentro de VS Code con categorías colapsables y colores por método.  
- Fácil de usar: solo abre un archivo Python con endpoints y ejecuta el comando `PyPoints: Analizar Endpoints`.

![PyPoints Example](images/pypoints-screenshot.png)  

> aqui irrian las imagenes, si es que tuviera AJAJAJAJJAJ

## Requirements

- VS Code ≥ 1.80  
- Node.js ≥ 18 (para desarrollo de la extensión)  
- Python ≥ 3.8 (para tus proyectos con Flask o FastAPI)  

No necesita dependencias adicionales en la máquina del usuario, solo tener VS Code y abrir proyectos Python.

## Extension Settings

Esta extensión no requiere configuraciones adicionales por ahora, pero planea futuras opciones para personalizar la interfaz y los colores de los métodos HTTP.

## Known Issues

- No detecta endpoints dinámicos construidos mediante variables en `@app.route`.  
- Actualmente solo cuenta hasta el último `return` de la función; funciones muy complejas con múltiples retornos pueden requerir revisión manual.  
- La interfaz Webview puede tener scroll limitado si hay muchos endpoints.

## Release Notes

### 1.0.0

- Primera versión de PyPoints.  
- Detección de endpoints Flask y FastAPI.  
- Interfaz Webview estilo Postman con categorías y detalles de endpoints.

### 1.1.0

- Mejorada la detección de métodos HTTP y conteo de líneas reales.  
- Colores por método y tarjetas colapsables para categorías.  

---

## Following extension guidelines

Asegúrate de haber leído las **guidelines** para extensiones y sigue las mejores prácticas para mantener tu proyecto limpio y profesional.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)


## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)  
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**¡Disfruta usando PyPoints!**
