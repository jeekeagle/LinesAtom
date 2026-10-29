import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const dataDir = path.resolve(
  process.env.LECTURE_AXIS_DATA_DIR || path.join(appRoot, 'data')
);

export const storePath = path.join(dataDir, 'store.json');
export const secretsPath = path.join(dataDir, 'secrets.json');
export const seedPath = path.join(dataDir, 'seed-lecture.json');
export const distRoot = path.join(appRoot, 'dist');
export const cliRoot = path.join(appRoot, 'cli');