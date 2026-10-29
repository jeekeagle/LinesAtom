import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityEvent,
  Course,
  Database,
  LectureProject,
  RuntimeSettings,
  ServiceProfile
} from '../src/types';
import { estimateLectureSeconds, makeLesson, publishCourse, sliceLecture } from './courses';
import { MIMO_DEFAULT_BASE_URL } from './audio';
import { DEFAULT_SKILLS } from './skills';
import { DEFAULT_ENGINES } from './engines';
import { DEFAULT_WORKFLOWS } from './workflows';
import { dataDir, seedPath } from './paths';
import { PIPELINE_STEPS } from './constants';

export const DEFAULT_SETTINGS: RuntimeSettings = {
  modelBaseUrl: 'http://127.0.0.1:15721/v1',
  modelName: '',
  apiKeyConfigured: false,
  temperature: 0.4,
  maxTokens: 3000,
  charsPerMinute: 112,
  blockTargetChars: 90,
  cognitiveLoadCap: 14,
  questionRatioFloor: 0.08,
  durationTolerance: 0.25,
  updatedAt: '2026-10-29T00:00:00.000Z'
};

const seedCandidates = [seedPath, path.join(dataDir, 'seed-lecture.json')];

export function loadSeedProject(): LectureProject {
  for (const candidate of seedCandidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf8')) as LectureProject;
      const now = new Date().toISOString();
      return {
        ...raw,
        id: raw.id || 'lecture-current',
        name: raw.name || raw.meta?.title || '未命名讲稿',
        topic: raw.topic || raw.meta?.title || '',
        meta: {
          ...raw.meta,
          product: raw.meta?.product || '讲义轴',
          schemaVersion: raw.meta?.schemaVersion || '1.0',
          revision: raw.meta?.revision ?? 1,
          charsPerMinute: raw.meta?.charsPerMinute || DEFAULT_SETTINGS.charsPerMinute,
          cognitiveLoadCap: raw.meta?.cognitiveLoadCap || DEFAULT_SETTINGS.cognitiveLoadCap,
          questionRatioFloor: raw.meta?.questionRatioFloor || DEFAULT_SETTINGS.questionRatioFloor
        },
        sections: raw.sections || [],
        blocks: (raw.blocks || []).map((block) => ({
          ...block,
          labelEvidence: block.labelEvidence || ''
        })),
        concepts: raw.concepts || [],
        pointers: raw.pointers || [],
        suggestions: raw.suggestions || [],
        media: raw.media || { cases: [], qas: [], cheatsheets: [], slides: [], maps: [] },
        engineSnapshot: {
          status: raw.engineSnapshot?.status || 'ready',
          provider: raw.engineSnapshot?.provider || 'local-deterministic',
          runId: raw.engineSnapshot?.runId || raw.meta?.engineRunId || '',
          pipeline:
            raw.engineSnapshot?.pipeline?.length
              ? raw.engineSnapshot.pipeline
              : PIPELINE_STEPS.map((item) => ({ ...item, state: 'completed', count: 0 })),
          skills:
            raw.engineSnapshot?.skills?.length
              ? raw.engineSnapshot.skills
              : DEFAULT_SKILLS.map((skill) => ({
                  id: skill.id,
                  name: skill.name,
                  stage: skill.stage,
                  enabled: skill.enabled,
                  version: skill.version
                }))
        },
        createdAt: raw.createdAt || now,
        updatedAt: raw.updatedAt || now
      };
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('找不到种子讲稿数据，请确认 data/seed-lecture.json 存在。');
}

export const seedActivity: ActivityEvent[] = [
  {
    id: 'evt-seed',
    at: '2026-10-29T00:00:00.000Z',
    kind: 'system',
    title: '系统初始化',
    detail: '讲义轴首版已载入单课讲稿、六标签标注与挂载指针。'
  }
];

/** 三类服务各一张档案卡：模型服务 / 声音服务 / 语音识别，可增删改与切换。 */
export function seedServices(): ServiceProfile[] {
  const now = '2026-10-29T00:00:00.000Z';
  return [
    {
      id: 'svc-chat-mimo',
      kind: 'chat',
      name: 'MiMo 主模型',
      baseUrl: MIMO_DEFAULT_BASE_URL,
      model: 'mimo-v2.6-flash',
      active: true,
      apiKeyConfigured: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'svc-tts-mimo',
      kind: 'tts',
      name: 'MiMo 讲解女声 · 冰糖',
      baseUrl: MIMO_DEFAULT_BASE_URL,
      model: 'mimo-v2.5-tts',
      voice: '冰糖',
      style: '清晰、沉稳的中文课程讲解口吻，语速适中，停顿自然，像老师在讲课。',
      active: true,
      apiKeyConfigured: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'svc-asr-mimo',
      kind: 'asr',
      name: 'MiMo 语音识别',
      baseUrl: MIMO_DEFAULT_BASE_URL,
      model: 'mimo-v2.5-asr',
      language: 'zh',
      active: true,
      apiKeyConfigured: false,
      createdAt: now,
      updatedAt: now
    }
  ];
}

/**
 * 种子课程按慕课结构组织：课程 → 章节 → 微课单元。
 * 每个单元都是从母讲稿切出来的独立讲义轴，块、概念、指针与介质一并裁剪。
 */
export function buildSeedCourse(
  source: LectureProject
): { lectures: LectureProject[]; course: Course } {
  const timestamp = '2026-10-29T00:00:00.000Z';
  const courseTitle = '智能体设计与应用';
  const chapters = [
    { id: 'ch-01', order: 1, title: '第一章 · 三个时代的分界', summary: '从预算现场进到三个词的边界。' },
    { id: 'ch-02', order: 2, title: '第二章 · 数字化与智能化', summary: '让系统算出结论，再让结论自己动起来。' },
    { id: 'ch-03', order: 3, title: '第三章 · 三级让权的真实顺序', summary: '记录、判断、行动，一级都不能跳。' }
  ];
  const chapterFor = (index: number) => (index < 2 ? 'ch-01' : index < 4 ? 'ch-02' : 'ch-03');

  const lectures: LectureProject[] = [];
  const lessons = source.sections.map((section, index) => {
    const lecture = sliceLecture(source, [section.id], {
      id: `lec-u${String(index + 1).padStart(2, '0')}`,
      title: section.title,
      summary: section.short,
      course: courseTitle
    });
    lectures.push(lecture);
    return makeLesson({
      id: `lsn-u${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      title: section.title,
      summary: section.short,
      chapterId: chapterFor(index),
      lectureId: lecture.id,
      seconds: estimateLectureSeconds(lecture)
    });
  });

  const course: Course = {
    id: 'course-agent-design',
    title: courseTitle,
    subtitle: '三个时代，三级让权，一条不能跳过的依赖链',
    description:
      '面向产品与工程团队的结构化微课：每个单元都是一条确定性讲义轴，讲稿、标注与学习介质同批生成，发布后由学生端按章节观看。',
    audience: '产品、工程与业务负责人',
    chapters,
    lessons,
    publishedVersion: 0,
    publishedAt: null,
    snapshot: null,
    dirty: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const all = [source, ...lectures];
  try {
    return { lectures: all, course: publishCourse(course, all) };
  } catch {
    return { lectures: all, course };
  }
}

export function seedDatabase(): Database {
  const project = loadSeedProject();
  const { lectures, course } = buildSeedCourse(project);
  return {
    project,
    lectures,
    activeLectureId: project.id,
    courses: [course],
    services: seedServices(),
    skills: DEFAULT_SKILLS.map((skill) => ({ ...skill, config: { ...skill.config } })),
    engines: DEFAULT_ENGINES.map((engine) => ({ ...engine, config: { ...engine.config } })),
    workflows: DEFAULT_WORKFLOWS.map((workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => ({ ...step, skillIds: [...step.skillIds] }))
    })),
    settings: { ...DEFAULT_SETTINGS },
    activity: seedActivity,
    runs: []
  };
}
