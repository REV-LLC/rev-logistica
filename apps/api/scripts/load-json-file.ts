import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadJsonFile<T>(
  defaultFileName: string,
  flag = '--file',
): T {
  const flagIndex = process.argv.indexOf(flag);
  const requestedPath =
    flagIndex >= 0 && process.argv[flagIndex + 1]
      ? path.resolve(process.cwd(), process.argv[flagIndex + 1])
      : path.resolve(__dirname, '..', 'data', defaultFileName);

  if (!fs.existsSync(requestedPath)) {
    throw new Error(
      `Archivo de datos no encontrado: ${requestedPath}. Usa ${flag} <ruta>.`,
    );
  }

  return JSON.parse(fs.readFileSync(requestedPath, 'utf8')) as T;
}
