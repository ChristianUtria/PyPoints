export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

export interface Endpoint {
  category: string;
  functionName: string;
  method: string;
  route: string;
  lineStart: number;
  lineEnd: number;
  lineCount: number;
  filePath: string;
  fileName: string;
  framework: 'Flask' | 'FastAPI' | 'Django' | 'Unknown';
  sourceCode?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  issues?: ValidationIssue[];
  isDuplicate?: boolean;
  duplicateOf?: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  useSSL: boolean;
  baseUrl: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export type ItemKind = 'file' | 'category' | 'endpoint' | 'summary';