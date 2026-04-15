import * as path from 'path';
import { Endpoint } from '../types';
import { calcComplexity } from '../utils/complexity';
import { detectFramework } from './Frameworkdetector';

export function parseEndpoints(content: string, filePath: string): Endpoint[] {
  const lines = content.split(/\r?\n/);
  const fileName = path.basename(filePath);
  const framework = detectFramework(content);
  const endpoints: Endpoint[] = [];
  let currentComment = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) { currentComment = line.substring(1).trim(); continue; }

    const flaskMatch = line.match(/@[\w.]+\.route\(["'](.+?)["'](,\s*methods\s*=\s*\[(.*?)\])?\)/i);
    if (flaskMatch) {
      const route = flaskMatch[1];
      const methods = flaskMatch[3]
        ? flaskMatch[3].replace(/["'\s]/g, '').split(',').filter(Boolean)
        : ['GET'];
      const { funcName, lineStart, lineEnd, sourceCode } = findNextFunction(lines, i);
      if (!funcName) continue;
      const lineCount = lineEnd - lineStart + 1;
      for (const method of methods) {
        endpoints.push({
          category: currentComment || 'Sin categoría',
          functionName: funcName,
          method: method.toUpperCase(),
          route,
          lineStart,
          lineEnd,
          lineCount,
          filePath,
          fileName,
          framework: 'Flask',
          sourceCode,
          complexity: calcComplexity(lineCount),
        });
      }
      continue;
    }

    const fastapiMatch = line.match(/@[\w.]+\.(get|post|put|patch|delete|head|options)\(["'](.+?)["']/i);
    if (fastapiMatch) {
      const method = fastapiMatch[1].toUpperCase();
      const route = fastapiMatch[2];
      const { funcName, lineStart, lineEnd, sourceCode } = findNextFunction(lines, i);
      if (!funcName) continue;
      const lineCount = lineEnd - lineStart + 1;
      endpoints.push({
        category: currentComment || 'Sin categoría',
        functionName: funcName,
        method,
        route,
        lineStart,
        lineEnd,
        lineCount,
        filePath,
        fileName,
        framework: 'FastAPI',
        sourceCode,
        complexity: calcComplexity(lineCount),
      });
      continue;
    }

    const djangoMatch = line.match(/(?:re_)?path\(["'](.+?)["'],\s*([\w.]+)/i);
    if (djangoMatch && fileName.includes('url')) {
      const route = djangoMatch[1];
      const viewName = djangoMatch[2].split('.').pop() || djangoMatch[2];
      endpoints.push({
        category: currentComment || 'URLs',
        functionName: viewName,
        method: 'GET/POST',
        route,
        lineStart: i + 1,
        lineEnd: i + 1,
        lineCount: 1,
        filePath,
        fileName,
        framework: 'Django',
        sourceCode: lines[i],
        complexity: 'simple',
      });
    }
  }

  return endpoints;
}

export function findNextFunction(
  lines: string[],
  fromIndex: number
): { funcName: string | null; lineStart: number; lineEnd: number; sourceCode: string } {
  let funcLine = -1;
  for (let j = fromIndex + 1; j < Math.min(fromIndex + 5, lines.length); j++) {
    if (lines[j].trim().startsWith('def ') || lines[j].trim().startsWith('async def ')) {
      funcLine = j;
      break;
    }
  }
  if (funcLine === -1) return { funcName: null, lineStart: 0, lineEnd: 0, sourceCode: '' };

  const funcMatch = lines[funcLine].trim().match(/^(?:async\s+)?def\s+(\w+)/);
  if (!funcMatch) return { funcName: null, lineStart: 0, lineEnd: 0, sourceCode: '' };

  const indent = lines[funcLine].match(/^(\s*)/)?.[1].length ?? 0;
  let lastReturnLine = funcLine;
  for (let k = funcLine + 1; k < lines.length; k++) {
    const cl = lines[k];
    if (cl.trim() === '') continue;
    if ((cl.match(/^(\s*)/)?.[1].length ?? 0) <= indent && cl.trim() !== '') break;
    if (cl.trim().startsWith('return')) lastReturnLine = k;
  }

  return {
    funcName: funcMatch[1],
    lineStart: funcLine + 1,
    lineEnd: lastReturnLine + 1,
    sourceCode: lines.slice(funcLine, lastReturnLine + 1).join('\n'),
  };
}