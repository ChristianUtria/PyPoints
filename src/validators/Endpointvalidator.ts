import { Endpoint, ValidationIssue } from '../types';

export function validateEndpoint(ep: Endpoint, _allEndpoints: Endpoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!ep.route.startsWith('/'))
    issues.push({ type: 'error', message: `La ruta no comienza con "/": "${ep.route}"` });

  if (/\s/.test(ep.route))
    issues.push({ type: 'error', message: `La ruta contiene espacios: "${ep.route}"` });

  if (ep.framework !== 'Django') {
    const badParam = ep.route.match(/<[^>]*\s[^>]*>|<[^>]*[^A-Za-z0-9_:>][^>]*>/);
    if (badParam)
      issues.push({ type: 'error', message: `Parámetro de ruta con formato inválido: ${badParam[0]}` });
  }

  if (ep.sourceCode && ep.framework !== 'Django' && !/\breturn\b/.test(ep.sourceCode))
    issues.push({ type: 'warning', message: `La función "${ep.functionName}" no tiene sentencia return` });

  const genericNames = ['handler', 'view', 'endpoint', 'api', 'index', 'handle', 'process'];
  if (genericNames.includes(ep.functionName.toLowerCase()))
    issues.push({ type: 'warning', message: `Nombre de función genérico: "${ep.functionName}"` });

  if (ep.route.includes('//'))
    issues.push({ type: 'error', message: `La ruta contiene doble slash: "${ep.route}"` });

  if (ep.sourceCode && /\bprint\s*\(/.test(ep.sourceCode))
    issues.push({ type: 'warning', message: `La función contiene llamadas a print() — posible código de debug` });

  return issues;
}