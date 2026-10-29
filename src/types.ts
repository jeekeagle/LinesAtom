/* 讲义轴 · 全系统共享类型契约（服务端与前端同源） */

export type Label =
  | 'core'
  | 'example'
  | 'question'
  | 'transition'
  | 'global'
  | 'conclusion';

export type MediaKind = 'concept' | 'case' | 'qa' | 'cheatsheet' | 'slide' | 'map';

export type TriggerMode = 'preload' | 'entry';

export type ProductionStage = 'analysis' | 'script' | 'mount' | 'media' | 'quality';

export type EngineKind = 'analysis' | 'text' | 'structure' | 'media' | 'quality';

export type LectureMode = 'script' | 'material' | 'skeleton';

export interface ConceptEntry {
  id: string;
  name: string;
  definition: string;
  parentId: string | null;
  difference: string;
  misconceptions: string[];
  anchorBlockId: string;
  recurrences: string[];
}

export interface LectureBlock {
  id: string;
  order: number;
  sectionId: string;
  text: string;
  label: Label;
  labelEvidence: string;
}

export interface LectureSection {
  id: string;
  order: number;
  title: string;
  short: string;
}

export interface MountPointer {
  id: string;
  blockId: string;
  mediaType: MediaKind;
  targetId: string;
  trigger: TriggerMode;
  status?: 'confirmed' | 'suggested';
  note?: string;
}

export interface MountSuggestion {
  id: string;
  blockId: string;
  mediaType: MediaKind;
  targetId: string | null;
  targetLabel: string;
  rationale: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
  source: 'engine' | 'model';
  createdAt: string;
}

export interface MediaCase {
  id: string;
  title: string;
  eyebrow: string;
  background: string;
  action: string;
  result: string;
  sourceBlockId?: string;
  generatedBy: string;
}

export interface MediaQa {
  id: string;
  title: string;
  question: string;
  answer: string;
  sourceBlockId?: string;
  generatedBy: string;
}

export interface MediaCheatsheet {
  id: string;
  title: string;
  intro: string;
  columns: string[];
  rows: string[][];
  note: string;
  mode: 'table' | 'flashcard';
  cards?: { front: string; back: string }[];
  sourceBlockId?: string;
  generatedBy: string;
}

export interface MediaSlide {
  id: string;
  title: string;
  eyebrow: string;
  lead: string;
  slides: { kicker: string; title: string; body: string; marker: string }[];
  sourceBlockId?: string;
  generatedBy: string;
}

export interface MediaMap {
  id: string;
  title: string;
  eyebrow: string;
  root: string;
  branches: { title: string; items: string[] }[];
  note: string;
  sourceBlockId?: string;
  generatedBy: string;
}

export interface MediaStore {
  cases: MediaCase[];
  qas: MediaQa[];
  cheatsheets: MediaCheatsheet[];
  slides: MediaSlide[];
  maps: MediaMap[];
}

export interface EngineSnapshot {
  status: 'idle' | 'running' | 'ready' | 'failed';
  provider: string;
  runId: string;
  pipeline: { id: string; name: string; state: string; count: number }[];
  skills: { id: string; name: string; stage: string; enabled: boolean; version: string }[];
}

export interface LectureMeta {
  product: string;
  course: string;
  title: string;
  subtitle: string;
  durationMinutes: number;
  charsPerMinute: number;
  cognitiveLoadCap: number;
  questionRatioFloor: number;
  version: string;
  schemaVersion: string;
  revision: number;
  generatedAt: string;
  source: string;
  engineRunId: string;
}

/** 课程下面的章节：慕课结构为 课程 → 章节 → 微课单元。 */
export interface CourseChapter {
  id: string;
  order: number;
  title: string;
  summary: string;
}

/** 课程中的一个微课单元：每个微课都是一条独立的讲义轴。 */
export interface CourseLesson {
  id: string;
  order: number;
  title: string;
  summary: string;
  chapterId: string | null;
  /** 未生成讲稿时为空，草稿课时不可发布。 */
  lectureId: string | null;
  status: 'draft' | 'ready';
  seconds: number;
  updatedAt: string;
}

/** 发布时冻结的课时快照：学生只读，开发稿改动不影响它。 */
export interface PublishedLesson {
  id: string;
  order: number;
  title: string;
  summary: string;
  seconds: number;
  blocks: number;
  concepts: number;
  chapterId: string | null;
  lecture: LectureProject;
}

export interface PublishedCourse {
  version: number;
  publishedAt: string;
  title: string;
  subtitle: string;
  description: string;
  audience: string;
  chapters: CourseChapter[];
  lessons: PublishedLesson[];
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  audience: string;
  chapters: CourseChapter[];
  lessons: CourseLesson[];
  /** 0 表示从未发布；学生端只读取 snapshot。 */
  publishedVersion: number;
  publishedAt: string | null;
  snapshot: PublishedCourse | null;
  /** 发布后又改动了课时或讲稿。 */
  dirty: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseSummary {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  audience: string;
  chapters: CourseChapter[];
  lessonCount: number;
  readyCount: number;
  publishedVersion: number;
  publishedAt: string | null;
  dirty: boolean;
  seconds: number;
  updatedAt: string;
}

export interface LectureProject {
  id: string;
  name: string;
  topic: string;
  meta: LectureMeta;
  sections: LectureSection[];
  blocks: LectureBlock[];
  concepts: ConceptEntry[];
  pointers: MountPointer[];
  suggestions: MountSuggestion[];
  media: MediaStore;
  engineSnapshot: EngineSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  stage: ProductionStage;
  kind: EngineKind;
  description: string;
  prompt: string;
  schema: string;
  config: Record<string, string | number | boolean>;
  enabled: boolean;
  builtIn: boolean;
  version: string;
  runs: number;
  lastRun: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionEngine {
  id: string;
  name: string;
  stage: ProductionStage;
  kind: EngineKind;
  description: string;
  skillIds: string[];
  config: Record<string, string | number | boolean>;
  enabled: boolean;
  isDefault: boolean;
  builtIn: boolean;
  runs: number;
  lastRun: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  key: string;
  label: string;
  shortLabel: string;
  stage: ProductionStage;
  engineId?: string;
  skillIds: string[];
  dependsOn: string[];
  description: string;
}

export interface LectureWorkflow {
  id: string;
  name: string;
  mode: LectureMode;
  description: string;
  steps: WorkflowStep[];
  enabled: boolean;
  isDefault: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeSettings {
  modelBaseUrl: string;
  modelName: string;
  apiKeyConfigured: boolean;
  temperature: number;
  maxTokens: number;
  charsPerMinute: number;
  blockTargetChars: number;
  cognitiveLoadCap: number;
  questionRatioFloor: number;
  durationTolerance: number;
  updatedAt: string;
}

/** 服务档案：模型服务 / 声音服务 / 语音识别，各自可新建、切换、测速、管理。 */
export type ServiceKind = 'chat' | 'tts' | 'asr';

export interface ServiceProfile {
  id: string;
  kind: ServiceKind;
  name: string;
  baseUrl: string;
  model: string;
  /** 声音服务：内置音色 ID */
  voice?: string;
  /** 声音服务：风格指令，作为 user 消息下发 */
  style?: string;
  /** 语音识别：auto / zh / en */
  language?: string;
  active: boolean;
  /** 仅由服务端填充，密钥本身不返回 */
  apiKeyConfigured: boolean;
  latencyMs?: number;
  lastTestAt?: string;
  lastResult?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  kind: 'engine' | 'skill' | 'project' | 'system';
  title: string;
  detail: string;
}

export interface TraceStep {
  id: string;
  label: string;
  state: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  detail: string;
  durationMs: number;
}

export interface EngineRunResult {
  runId: string;
  engineId: string;
  mode: LectureMode;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  provider: string;
  trace: TraceStep[];
  warnings: string[];
  output: string;
}

export interface ValidationCheck {
  id: string;
  title: string;
  pass: boolean;
  value: string;
  detail: string;
  evidence: string;
}

export interface ValidationReport {
  checks: ValidationCheck[];
  metrics: {
    blocks: number;
    concepts: number;
    pointers: number;
    coreBlocks: number;
    questionRatio: number;
    unlabeled: number;
    anchorsWithCard: number;
    duplicatePointers: number;
    orphanConcepts: number;
    chars: number;
    estimatedMinutes: number;
    mediaCount: number;
  };
  issues: string[];
}

export interface Database {
  project: LectureProject;
  /** 讲稿库：每个微课一条，project 是当前正在开发的那条。 */
  lectures: LectureProject[];
  activeLectureId: string;
  courses: Course[];
  services: ServiceProfile[];
  skills: AgentSkill[];
  engines: ProductionEngine[];
  workflows: LectureWorkflow[];
  settings: RuntimeSettings;
  activity: ActivityEvent[];
  runs: EngineRunResult[];
}

export interface BootstrapData {
  project: LectureProject;
  courses: CourseSummary[];
  services: ServiceProfile[];
  skills: AgentSkill[];
  engines: ProductionEngine[];
  workflows: LectureWorkflow[];
  settings: RuntimeSettings;
  activity: ActivityEvent[];
  runs: EngineRunResult[];
  validation: ValidationReport;
  labels: Record<Label, string>;
  mediaLabels: Record<MediaKind, string>;
  mountRules: Record<Label, MediaKind | null>;
  modeLabels: Record<LectureMode, string>;
  stageLabels: Record<ProductionStage, string>;
  server: { online: boolean; version: string; startedAt: string; dataDir: string };
}
