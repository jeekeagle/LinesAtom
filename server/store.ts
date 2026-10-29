import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityEvent,
  AgentSkill,
  Database,
  EngineRunResult,
  LectureProject,
  LectureWorkflow,
  ProductionEngine,
  RuntimeSettings
} from '../src/types';
import { normalizeSkills } from './skills';
import { normalizeEngines } from './engines';
import { normalizeWorkflows } from './workflows';
import { seedDatabase, seedServices, DEFAULT_SETTINGS } from './seed';
import { dataDir, storePath } from './paths';

let database: Database | null = null;

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(seedDatabase(), null, 2), 'utf8');
  }
}

export function readDb(): Database {
  if (database) return database;
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Database;
    if (!Array.isArray(parsed.courses) || !parsed.courses.length) {
      // 早于课程结构的旧数据没有章节与课时，按种子重建，保证课程→章节→微课齐全。
      throw new Error('legacy-store');
    }
    const lectures = Array.isArray(parsed.lectures) && parsed.lectures.length
      ? parsed.lectures
      : parsed.project
        ? [parsed.project]
        : [];
    const activeLectureId = lectures.some((item) => item.id === parsed.activeLectureId)
      ? (parsed.activeLectureId as string)
      : (lectures[0]?.id ?? '');
    database = {
      project: lectures.find((item) => item.id === activeLectureId) ?? lectures[0],
      lectures,
      activeLectureId,
      courses: parsed.courses,
      services: Array.isArray(parsed.services) ? parsed.services : seedServices(),
      skills: normalizeSkills(parsed.skills),
      engines: normalizeEngines(parsed.engines),
      workflows: normalizeWorkflows(parsed.workflows),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : []
    };
  } catch {
    database = seedDatabase();
    writeDb(database);
  }
  return database;
}

export function writeDb(next: Database) {
  ensureStore();
  // project 是讲稿库中的当前编辑条目：改完写回同一处，避免两份数据分叉。
  if (next.project) {
    const index = next.lectures.findIndex((item) => item.id === next.project.id);
    if (index >= 0) next.lectures[index] = next.project;
    else {
      next.lectures = [...next.lectures, next.project];
      next.activeLectureId = next.project.id;
    }
  }
  database = next;
  const target = path.join(dataDir, 'store.json');
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(temp, target);
}

export function mutateDb(mutator: (db: Database) => void) {
  const db = readDb();
  mutator(db);
  writeDb(db);
  return db;
}

export function resetDb() {
  database = seedDatabase();
  writeDb(database);
  return database;
}

export function pushActivity(
  db: Database,
  event: Omit<ActivityEvent, 'id' | 'at'> & { id?: string; at?: string }
) {
  db.activity = [
    {
      id: event.id || `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      at: event.at || new Date().toISOString(),
      kind: event.kind,
      title: event.title,
      detail: event.detail
    },
    ...db.activity
  ].slice(0, 60);
}

export function pushRun(db: Database, run: EngineRunResult) {
  db.runs = [run, ...db.runs].slice(0, 30);
}

export type { AgentSkill, Database, EngineRunResult, LectureProject, LectureWorkflow, ProductionEngine, RuntimeSettings };
