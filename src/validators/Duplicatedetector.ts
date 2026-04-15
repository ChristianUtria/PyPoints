import { Endpoint } from '../types';

export function detectDuplicates(endpoints: Endpoint[]): void {
  const seenRoutes = new Map<string, Endpoint>();

  for (const ep of endpoints) {
    const key = `${ep.method.toUpperCase()}:${ep.route}`;
    if (seenRoutes.has(key)) {
      const orig = seenRoutes.get(key)!;
      ep.isDuplicate = true;
      ep.duplicateOf =
        (ep.duplicateOf ? ep.duplicateOf + ', ' : '') +
        `ruta duplicada → ${orig.functionName} (${orig.fileName})`;
      if (!orig.isDuplicate) {
        orig.isDuplicate = true;
        orig.duplicateOf = `ruta duplicada → ${ep.functionName} (${ep.fileName})`;
      } else {
        orig.duplicateOf += `, ${ep.functionName} (${ep.fileName})`;
      }
    } else {
      seenRoutes.set(key, ep);
    }
  }

  const seenNames = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    const key = ep.functionName.toLowerCase();
    if (seenNames.has(key)) {
      const orig = seenNames.get(key)!;
      if (orig.filePath !== ep.filePath || orig.lineStart !== ep.lineStart) {
        ep.isDuplicate = true;
        ep.duplicateOf =
          (ep.duplicateOf ? ep.duplicateOf + ', ' : '') +
          `nombre duplicado → ${orig.functionName} (${orig.fileName})`;
        if (!orig.isDuplicate) {
          orig.isDuplicate = true;
          orig.duplicateOf =
            (orig.duplicateOf ? orig.duplicateOf + ', ' : '') +
            `nombre duplicado → ${ep.functionName} (${ep.fileName})`;
        } else {
          orig.duplicateOf += `, nombre dup. → ${ep.functionName} (${ep.fileName})`;
        }
      }
    } else {
      seenNames.set(key, ep);
    }
  }
}