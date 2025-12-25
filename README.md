# PyPoints README

PyPoints is a Visual Studio Code extension that allows you to **analyze and visualize all your Flask and FastAPI endpoints** in your Python projects.  
With PyPoints, you can clearly see the **function name, HTTP method, number of lines, and full code of each endpoint**, grouped by categories using `# name` comments.  
Its Postman-style interface makes it easy to navigate and review your APIs directly within VS Code.

## Features

- Automatically detects **Flask** and **FastAPI** endpoints.  
- Groups endpoints by categories using `# name` comments.  
- Shows detailed information for each endpoint:  
  - Function name  
  - HTTP method (GET, POST, PUT, DELETE)  
  - Number of lines, start line, and end line  
  - Full code of the endpoint  
- VS Code interface with collapsible categories and color-coded methods.  
- Easy to use: just open a Python file with endpoints and run the command `PyPoints: Analyze Endpoints`.

![PyPoints Example](images/pypoints-screenshot.png)  

> This is where images would go if we had any 

## Requirements

- VS Code ≥ 1.80  
- Node.js ≥ 18 (for extension development)  
- Python ≥ 3.8 (for your Flask or FastAPI projects)  

No additional dependencies are needed on the user’s machine, just have VS Code and open Python projects.

## Extension Settings

This extension does not require additional settings for now, but future updates may allow customization of the interface and HTTP method colors.

## Known Issues

- Does not detect dynamic endpoints created using variables in `@app.route`.  
- Currently counts only up to the last `return` in the function; very complex functions with multiple returns may require manual review.  
- The Webview interface may have limited scrolling if there are many endpoints.

## Release Notes

### 1.0.0

- First release of PyPoints.  
- Detection of Flask and FastAPI endpoints.  
- Postman-style Webview interface with categories and endpoint details.

### 1.1.0

- Improved detection of HTTP methods and accurate line counting.  
- Color-coded methods and collapsible category cards.  

---

## Following Extension Guidelines

Make sure you have read the **extension guidelines** and follow best practices to keep your project clean and professional.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## For More Information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)  
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy using PyPoints!**
