const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

console.log('Compilando Previewhtml por separado (sin ofuscar)...');

// Paso 1: compilar Previewhtml.ts → JS legible aparte
execSync('npx tsc src/webview/Previewhtml.ts --outDir out_preview --module commonjs --target es2020 --esModuleInterop --skipLibCheck');

const previewCode = fs.readFileSync('out_preview/webview/Previewhtml.js', 'utf8');

console.log('Iniciando empaquetado con esbuild (sin Previewhtml)...');

// Paso 2: bundle todo el src EXCEPTO Previewhtml
// Previewhtml ya está compilado; lo reemplazamos con un stub vacío temporal
const previewSrcPath = 'src/webview/Previewhtml.ts';
const previewBackup = fs.readFileSync(previewSrcPath, 'utf8');

// Stub temporal: exporta las mismas funciones pero vacías (para que esbuild no falle)
// AJUSTA los nombres de exports según tu archivo real
const stub = `
export function getPreviewHtml(...args: any[]): string { return '__PREVIEW_PLACEHOLDER__'; }
export function getWebviewContent(...args: any[]): string { return '__PREVIEW_PLACEHOLDER__'; }
`;
fs.writeFileSync(previewSrcPath, stub);

try {
  execSync('npx esbuild ./src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --minify --platform=node');
} finally {
  // Restaurar Previewhtml.ts original siempre, aunque falle
  fs.writeFileSync(previewSrcPath, previewBackup);
}

console.log('Esbuild completado. Iniciando ofuscación...');

// Paso 3: ofuscar el bundle (que tiene stubs de Previewhtml)
const code = fs.readFileSync('out/extension.js', 'utf8');
const result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  debugProtection: false,
  selfDefending: false,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  transformObjectKeys: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  rotateStringArray: true,
  stringArrayShuffle: true,
  shuffleStringArray: true,
  stringArrayIndexShift: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayWrappersCount: 5,
  stringArrayWrappersType: 'function',
  splitStrings: true,
  splitStringsChunkLength: 4,
  unicodeEscapeSequence: true,
});

// Paso 4: reinyectar el código real de Previewhtml (sin ofuscar)
let finalCode = result.getObfuscatedCode();
finalCode = finalCode.replace(
  /"__PREVIEW_PLACEHOLDER__"/g,
  // Envuelve el código real como IIFE que retorna el módulo
  `(function(){ ${previewCode}; return module.exports; })()`
);

fs.writeFileSync('out/extension.js', finalCode);
console.log('¡Build completo! Previewhtml sin ofuscar, resto ofuscado.');