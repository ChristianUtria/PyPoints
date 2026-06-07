const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

console.log('Iniciando empaquetado con esbuild...');

// Paso 1: bundle + minify con esbuild
execSync('npx esbuild ./src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --minify --platform=node');

console.log('Esbuild completado. Iniciando ofuscación...');

// Paso 2: ofuscar el resultado
const code = fs.readFileSync('out/extension.js', 'utf8');
const result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,

  // ── Control de flujo ──────────────────────────────────────────
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,  // Bajado de 0.6 → menos riesgo de stack overflow en Electron

  // ── Código muerto ─────────────────────────────────────────────
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,      // Bajado de 0.4 → bundle más liviano

  // ── Protecciones desactivadas (rompen VS Code) ────────────────
  debugProtection: false,
  selfDefending: false,

  // ── Consola ───────────────────────────────────────────────────
  disableConsoleOutput: true,

  // ── Identificadores ───────────────────────────────────────────
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,                 // NUNCA cambiar: rompe exports.activate
  transformObjectKeys: false,           // NUNCA cambiar: rompe APIs de VS Code

  // ── String Array (núcleo de la ofuscación) ────────────────────
  stringArray: true,
  stringArrayEncoding: ['base64'],      // rc4 → base64: igual de opaco, sin bugs en Electron
  stringArrayRotate: true,
  rotateStringArray: true,
  stringArrayShuffle: true,
  shuffleStringArray: true,
  stringArrayIndexShift: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayWrappersCount: 5,          // Mantenido en 5
  stringArrayWrappersType: 'function',  // Mantenido

  // ── Split strings ─────────────────────────────────────────────
  splitStrings: true,
  splitStringsChunkLength: 4,           // Bajado de 5 → más fragmentos, más ilegible

  // ── Unicode ───────────────────────────────────────────────────
  unicodeEscapeSequence: true,
});

fs.writeFileSync('out/extension.js', result.getObfuscatedCode());
console.log('¡Build ofuscado completo y listo para producción!');