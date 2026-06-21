const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const { execSync } = require('child_process');

console.log('Compilando...');
execSync('npx tsc', { stdio: 'inherit' });

console.log('Ofuscando extension.js...');
const code = fs.readFileSync('out/extension.js', 'utf8');

const result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,
  disableConsoleOutput: false,
  splitStrings: false,
  transformObjectKeys: false,
  stringArrayCallsTransform: false,
});

fs.writeFileSync('out/extension.js', result.getObfuscatedCode());
console.log('¡Build completo!');