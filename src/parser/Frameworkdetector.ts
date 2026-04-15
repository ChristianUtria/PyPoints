export function detectFramework(content: string): 'Flask' | 'FastAPI' | 'Django' | 'Unknown' {
  if (/from flask|import flask/i.test(content)) return 'Flask';
  if (/from fastapi|import fastapi/i.test(content)) return 'FastAPI';
  if (/from django|import django/i.test(content)) return 'Django';
  return 'Unknown';
}