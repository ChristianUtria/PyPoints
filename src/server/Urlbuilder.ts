import { ServerConfig } from '../types';

export function buildCandidateUrls(config?: ServerConfig): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (u: string) => { if (!seen.has(u)) { seen.add(u); urls.push(u); } };

  if (config) add(config.baseUrl);
  if (config?.baseUrl.includes('localhost')) {
    add(config.baseUrl.replace('localhost', '127.0.0.1'));
  } else if (config?.baseUrl.includes('127.0.0.1')) {
    add(config.baseUrl.replace('127.0.0.1', 'localhost'));
  }

  add('http://localhost:5000');
  add('http://127.0.0.1:5000');
  add('http://localhost:8000');
  add('http://127.0.0.1:8000');
  add('http://localhost:3000');
  add('http://localhost:8080');
  add('https://localhost:5001');
  add('https://localhost:8443');

  return urls;
}