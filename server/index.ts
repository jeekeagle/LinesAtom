import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type {
  BootstrapData,
  LectureMode,
  LectureProject,
  ProductionEngine,
  ValidationReport
} from '../src/types';
import { APP_VERSION, DEFAULT_PORT, LABEL_TEXT, MEDIA_TEXT, MOUNT_RULES, MODE_TEXT, STAGE_TEXT } from './constants';
import { dataDir, distRoot } from './paths';
import { mutateDb, pushActivity, pushRun, readDb, resetDb, writeDb } from './store';
import { runLecturePipeline, type LectureRunInput } from './lecture';
import { validateProject } from './validate';
import {
  clearApiKey,
  clearServiceKey,
  getServiceKey,
  readSecrets,
  setApiKey,
  setServiceKey,
  testModel
} from './llm';
import { DEFAULT_SETTINGS } from './seed';
import { runSkillWithModel } from './skills';
import { applySuggestion, confidenceFloor, generateSuggestions, rejectSuggestion } from './suggest';
import {
  estimateLectureSeconds,
  makeLesson,
  nextLectureId,
  publishCourse,
  resequenceLessons,
  summarizeCourse
} from './courses';
import {
  MIMO_ASR_MODELS,
  MIMO_TTS_MODELS,
  MIMO_TTS_VOICES,
  listModels,
  synthesizeSpeech,
  transcribeSpeech
} from './audio';

const app = express();
app.use(express.json({ limit: '4mb' }));

const startedAt = new Date().toISOString();

const bootstrapPayload = (): BootstrapData => {
  const db = readDb();
  return {
    project: db.project,
    courses: db.courses.map(summarizeCourse),
    services: db.services.map(decorateService),
    skills: db.skills,
    engines: db.engines,
    workflows: db.workflows,
    settings: {
      ...db.settings,
      apiKeyConfigured: Boolean(readSecrets().modelApiKey)
    },
    activity: db.activity,
    runs: db.runs,
    validation: validateProject(db.project),
    labels: LABEL_TEXT,
    mediaLabels: MEDIA_TEXT,
    mountRules: MOUNT_RULES,
    modeLabels: MODE_TEXT,
    stageLabels: STAGE_TEXT,
    server: {
      online: true,
      version: APP_VERSION,
      startedAt,
      dataDir
    }
  };
};

const api = express.Router();

const decorateService = (profile: import('../src/types').ServiceProfile) => ({
  ...profile,
  apiKeyConfigured: Boolean(getServiceKey(profile.id))
});

const serviceOf = (id: string) => readDb().services.find((item) => item.id === id);

const requireKey = (profile: import('../src/types').ServiceProfile | undefined) => {
  if (!profile) throw new Error('服务不存在');
  const key = getServiceKey(profile.id);
  if (!key) throw new Error(`「${profile.name}」尚未配置 API Key。`);
  return key;
};

/** 服务管理：模型 / 声音 / 语音识别三类档案，各自新建、切换、测速、管理。 */
api.get('/services', (_req, res) => {
  const db = readDb();
  res.json({
    services: db.services.map(decorateService),
    voices: MIMO_TTS_VOICES,
    ttsModels: MIMO_TTS_MODELS,
    asrModels: MIMO_ASR_MODELS
  });
});

api.post('/services', (req, res) => {
  const body = req.body ?? {};
  const kind = ['chat', 'tts', 'asr'].includes(body.kind) ? body.kind : '';
  const name = String(body.name ?? '').trim();
  if (!kind || !name) {
    res.status(400).json({ message: '服务需要类型与名称。' });
    return;
  }
  const timestamp = new Date().toISOString();
  const profile: import('../src/types').ServiceProfile = {
    id: `svc-${Date.now().toString(36)}`,
    kind: kind as import('../src/types').ServiceKind,
    name,
    baseUrl: String(body.baseUrl ?? 'https://api.xiaomimimo.com/v1').trim(),
    model: String(body.model ?? '').trim(),
    voice: body.voice ? String(body.voice) : undefined,
    style: body.style ? String(body.style) : undefined,
    language: body.language ? String(body.language) : undefined,
    active: false,
    apiKeyConfigured: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const db = mutateDb((store) => {
    store.services = [profile, ...store.services];
    pushActivity(store, {
      kind: 'system',
      title: `新建${kind === 'chat' ? '模型' : kind === 'tts' ? '声音' : '语音识别'}服务：${name}`,
      detail: profile.model || profile.baseUrl
    });
  });
  res.json({ service: decorateService(db.services.find((item) => item.id === profile.id)!) });
});

api.patch('/services/:id', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    const target = store.services.find((item) => item.id === req.params.id);
    if (!target) return;
    for (const key of ['name', 'baseUrl', 'model', 'voice', 'style', 'language'] as const) {
      if (typeof payload[key] === 'string') target[key] = (payload[key] as string).trim();
    }
    target.updatedAt = new Date().toISOString();
    if (target.kind === 'chat' && target.active) {
      store.settings.modelBaseUrl = target.baseUrl;
      store.settings.modelName = target.model;
      store.settings.updatedAt = target.updatedAt;
    }
  });
  const service = db.services.find((item) => item.id === req.params.id);
  if (!service) {
    res.status(404).json({ message: '服务不存在' });
    return;
  }
  res.json({ service: decorateService(service) });
});

api.delete('/services/:id', (req, res) => {
  clearServiceKey(req.params.id);
  const db = mutateDb((store) => {
    store.services = store.services.filter((item) => item.id !== req.params.id);
  });
  res.json({ services: db.services.map(decorateService) });
});

api.post('/services/:id/api-key', (req, res) => {
  const value = String(req.body?.apiKey ?? '').trim();
  if (!value) {
    res.status(400).json({ message: '请填写 API Key。' });
    return;
  }
  setServiceKey(req.params.id, value);
  const service = serviceOf(req.params.id);
  if (!service) {
    res.status(404).json({ message: '服务不存在' });
    return;
  }
  if (service.kind === 'chat' && service.active) setApiKey(value);
  res.json({ ok: true, service: decorateService(service) });
});

api.delete('/services/:id/api-key', (req, res) => {
  clearServiceKey(req.params.id);
  const service = serviceOf(req.params.id);
  if (!service) {
    res.status(404).json({ message: '服务不存在' });
    return;
  }
  res.json({ ok: true, service: decorateService(service) });
});

api.post('/services/:id/activate', (req, res) => {
  const db = mutateDb((store) => {
    const target = store.services.find((item) => item.id === req.params.id);
    if (!target) return;
    store.services = store.services.map((item) =>
      item.kind === target.kind ? { ...item, active: item.id === target.id } : item
    );
    target.updatedAt = new Date().toISOString();
    if (target.kind === 'chat') {
      store.settings.modelBaseUrl = target.baseUrl;
      store.settings.modelName = target.model;
      store.settings.updatedAt = target.updatedAt;
    }
    pushActivity(store, { kind: 'system', title: `切换默认服务：${target.name}`, detail: target.model });
  });
  const service = db.services.find((item) => item.id === req.params.id);
  if (!service) {
    res.status(404).json({ message: '服务不存在' });
    return;
  }
  res.json({ services: db.services.map(decorateService) });
});

/** 测速：模型问一句话；声音合成一句并回传试听；识别用声音服务先合成再转写。 */
api.post('/services/:id/test', async (req, res) => {
  const service = serviceOf(req.params.id);
  if (!service) {
    res.status(404).json({ message: '服务不存在' });
    return;
  }
  try {
    const key = requireKey(service);
    if (service.kind === 'chat') {
      const result = await testModel(
        { modelBaseUrl: service.baseUrl, modelName: service.model, apiKey: key },
      );
      mutateDb((store) => {
        const target = store.services.find((item) => item.id === service.id);
        if (!target) return;
        target.latencyMs = result.latencyMs;
        target.lastTestAt = new Date().toISOString();
        target.lastResult = `${result.latencyMs}ms · ${result.model}`;
        target.updatedAt = target.lastTestAt;
      });
      res.json({ ...result });
      return;
    }
    if (service.kind === 'tts') {
      const result = await synthesizeSpeech({
        baseUrl: service.baseUrl,
        apiKey: key,
        model: service.model,
        voice: service.voice,
        style: service.style,
        text: '声音服务测速：讲义轴，语音合成已就绪。'
      });
      mutateDb((store) => {
        const target = store.services.find((item) => item.id === service.id);
        if (!target) return;
        target.latencyMs = result.latencyMs;
        target.lastTestAt = new Date().toISOString();
        target.lastResult = `${result.latencyMs}ms · ${result.voice}`;
        target.updatedAt = target.lastTestAt;
      });
      res.json({
        ok: true,
        latencyMs: result.latencyMs,
        voice: result.voice,
        model: result.model,
        previewBase64: result.audioBase64,
        format: result.format,
        message: '声音服务可用'
      });
      return;
    }
    const tts = readDb().services.find((item) => item.kind === 'tts' && item.active);
    const ttsKey = tts ? getServiceKey(tts.id) : undefined;
    if (!tts || !ttsKey) throw new Error('识别测速需要一个已配置密钥的声音服务。');
    const audio = await synthesizeSpeech({
      baseUrl: tts.baseUrl,
      apiKey: ttsKey,
      model: tts.model,
      voice: tts.voice,
      style: tts.style,
      text: '这是一次语音识别连通性测试。'
    });
    const result = await transcribeSpeech({
      baseUrl: service.baseUrl,
      apiKey: key,
      model: service.model,
      language: service.language,
      audioBase64: audio.audioBase64,
      format: audio.format
    });
    mutateDb((store) => {
      const target = store.services.find((item) => item.id === service.id);
      if (!target) return;
      target.latencyMs = result.latencyMs;
      target.lastTestAt = new Date().toISOString();
      target.lastResult = `${result.latencyMs}ms · ${result.text.slice(0, 24)}`;
      target.updatedAt = target.lastTestAt;
    });
    res.json({ ok: true, latencyMs: result.latencyMs, text: result.text, message: '语音识别可用' });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : '测速失败' });
  }
});

api.post('/services/models', async (req, res) => {
  const service = req.body?.serviceId ? serviceOf(String(req.body.serviceId)) : undefined;
  try {
    const key = requireKey(service);
    const models = await listModels(service!.baseUrl, key);
    res.json({ models });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : '模型清单获取失败' });
  }
});

/* 音频接口：播放台按句调用，密钥只在服务端使用 */
api.post('/audio/tts', async (req, res) => {
  const text = String(req.body?.text ?? '');
  const service = req.body?.serviceId
    ? serviceOf(String(req.body.serviceId))
    : readDb().services.find((item) => item.kind === 'tts' && item.active);
  try {
    const key = requireKey(service);
    const result = await synthesizeSpeech({
      baseUrl: service!.baseUrl,
      apiKey: key,
      model: String(req.body?.model ?? service!.model),
      voice: String(req.body?.voice ?? service!.voice ?? '冰糖'),
      style: req.body?.style === null ? '' : String(req.body?.style ?? service!.style ?? ''),
      text
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : '语音合成失败' });
  }
});

api.post('/audio/asr', async (req, res) => {
  const service = req.body?.serviceId
    ? serviceOf(String(req.body.serviceId))
    : readDb().services.find((item) => item.kind === 'asr' && item.active);
  try {
    const key = requireKey(service);
    const result = await transcribeSpeech({
      baseUrl: service!.baseUrl,
      apiKey: key,
      model: service!.model,
      language: String(req.body?.language ?? service!.language ?? 'auto'),
      audioBase64: String(req.body?.audioBase64 ?? ''),
      format: req.body?.format === 'mp3' ? 'mp3' : 'wav'
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : '语音识别失败' });
  }
});

api.get('/health', (_req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    version: APP_VERSION,
    project: db.project.name,
    blocks: db.project.blocks.length,
    courses: db.courses.length,
    skills: db.skills.length,
    engines: db.engines.length,
    time: new Date().toISOString()
  });
});

api.get('/bootstrap', (_req, res) => {
  res.json(bootstrapPayload());
});

api.patch('/settings', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    store.settings = {
      ...store.settings,
      ...pick(payload, [
        'modelBaseUrl',
        'modelName',
        'temperature',
        'maxTokens',
        'charsPerMinute',
        'blockTargetChars',
        'cognitiveLoadCap',
        'questionRatioFloor',
        'durationTolerance'
      ]),
      apiKeyConfigured: Boolean(readSecrets().modelApiKey),
      updatedAt: new Date().toISOString()
    };
    pushActivity(store, {
      kind: 'system',
      title: '运行设置已更新',
      detail: `参数变更：${Object.keys(payload).join('、') || '无'}`
    });
  });
  res.json({ settings: db.settings });
});

api.post('/settings/model/api-key', (req, res) => {
  const value = String(req.body?.apiKey ?? '').trim();
  if (value) setApiKey(value);
  else clearApiKey();
  const db = readDb();
  db.settings.apiKeyConfigured = Boolean(readSecrets().modelApiKey);
  writeDb(db);
  res.json({ ok: true, apiKeyConfigured: db.settings.apiKeyConfigured });
});

api.delete('/settings/model/api-key', (_req, res) => {
  clearApiKey();
  const db = readDb();
  db.settings.apiKeyConfigured = false;
  writeDb(db);
  res.json({ ok: true, apiKeyConfigured: false });
});

api.post('/settings/model/test', async (_req, res) => {
  const db = readDb();
  try {
    const result = await testModel({
      modelBaseUrl: db.settings.modelBaseUrl,
      modelName: db.settings.modelName
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '模型服务不可用'
    });
  }
});

api.get('/skills', (_req, res) => {
  res.json({ skills: readDb().skills });
});

api.patch('/skills/:id', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    const target = store.skills.find((skill) => skill.id === req.params.id);
    if (!target) return;
    if (typeof payload.enabled === 'boolean') target.enabled = payload.enabled;
    if (typeof payload.prompt === 'string') target.prompt = payload.prompt;
    if (typeof payload.name === 'string' && payload.name.trim()) target.name = payload.name.trim();
    if (payload.config && typeof payload.config === 'object') {
      target.config = { ...target.config, ...(payload.config as Record<string, never>) };
    }
    target.updatedAt = new Date().toISOString();
    pushActivity(store, {
      kind: 'skill',
      title: `技能配置更新：${target.name}`,
      detail: payload.enabled === false ? '技能已停用' : '技能参数或提示词已调整'
    });
  });
  res.json({ skills: db.skills });
});

api.post('/skills/:id/run', async (req, res) => {
  const db = readDb();
  const skill = db.skills.find((item) => item.id === req.params.id);
  if (!skill) {
    res.status(404).json({ message: '技能不存在' });
    return;
  }
  const input = String(req.body?.input ?? '').trim();
  if (!input) {
    res.status(400).json({ message: '缺少技能输入' });
    return;
  }
  try {
    const result = await runSkillWithModel(skill, input, db.settings);
    const updated = mutateDb((store) => {
      const target = store.skills.find((item) => item.id === skill.id);
      if (!target) return;
      target.runs += 1;
      target.lastRun = new Date().toISOString();
    });
    res.json({
      skill: updated.skills.find((item) => item.id === skill.id),
      output: result.parsed ?? '本地确定性引擎处理完成。',
      provider: result.provider,
      model: result.model,
      fallback: result.fallback,
      warning: result.warning
    });
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : '技能执行失败'
    });
  }
});

api.get('/engines', (_req, res) => {
  res.json({ engines: readDb().engines, stageLabels: STAGE_TEXT });
});

api.patch('/engines/:id', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    const target = store.engines.find((engine) => engine.id === req.params.id);
    if (!target) return;
    if (typeof payload.enabled === 'boolean') target.enabled = payload.enabled;
    if (typeof payload.description === 'string') target.description = payload.description;
    if (payload.config && typeof payload.config === 'object') {
      target.config = { ...target.config, ...(payload.config as Record<string, never>) };
    }
    target.updatedAt = new Date().toISOString();
  });
  res.json({ engines: db.engines });
});

api.post('/engines/:id/default', (req, res) => {
  const db = mutateDb((store) => {
    const target = store.engines.find((engine) => engine.id === req.params.id);
    if (!target) return;
    target.isDefault = true;
    target.enabled = true;
    for (const engine of store.engines) {
      if (engine.stage === target.stage && engine.id !== target.id) engine.isDefault = false;
    }
  });
  res.json({ engines: db.engines });
});

api.get('/workflows', (_req, res) => {
  res.json({ workflows: readDb().workflows, modeLabels: MODE_TEXT });
});

api.patch('/workflows/:id', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    const target = store.workflows.find((workflow) => workflow.id === req.params.id);
    if (!target) return;
    if (typeof payload.enabled === 'boolean') target.enabled = payload.enabled;
    if (typeof payload.description === 'string') target.description = payload.description;
    target.updatedAt = new Date().toISOString();
  });
  res.json({ workflows: db.workflows });
});

api.post('/workflows/:id/default', (req, res) => {
  const db = mutateDb((store) => {
    const target = store.workflows.find((workflow) => workflow.id === req.params.id);
    if (!target) return;
    target.isDefault = true;
    target.enabled = true;
    for (const workflow of store.workflows) {
      if (workflow.mode === target.mode && workflow.id !== target.id) workflow.isDefault = false;
    }
  });
  res.json({ workflows: db.workflows });
});

/* ---------- 课程：一门课包含多个微课，开发完成后再发布 ---------- */

const lectureIndex = (store: import('../src/types').Database) =>
  store.lectures.map((item) => ({
    id: item.id,
    name: item.name,
    title: item.meta.title,
    blocks: item.blocks.length,
    concepts: item.concepts.length,
    pointers: item.pointers.length,
    revision: item.meta.revision,
    updatedAt: item.updatedAt
  }));

api.get('/courses', (_req, res) => {
  const db = readDb();
  res.json({ courses: db.courses, lectures: lectureIndex(db) });
});

api.post('/courses', (req, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  if (!title) {
    res.status(400).json({ message: '课程需要一个标题。' });
    return;
  }
  const timestamp = new Date().toISOString();
  const course: import('../src/types').Course = {
    id: `course-${Date.now().toString(36)}`,
    title,
    subtitle: String(body.subtitle ?? '').trim(),
    description: String(body.description ?? '').trim(),
    audience: String(body.audience ?? '').trim(),
    chapters: [],
    lessons: [],
    publishedVersion: 0,
    publishedAt: null,
    snapshot: null,
    dirty: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const db = mutateDb((store) => {
    store.courses = [course, ...store.courses];
    pushActivity(store, {
      kind: 'project',
      title: `新建课程：${course.title}`,
      detail: '等待添加微课'
    });
  });
  res.json({ course: db.courses.find((item) => item.id === course.id) });
});

api.patch('/courses/:id', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    const course = store.courses.find((item) => item.id === req.params.id);
    if (!course) return;
    for (const key of ['title', 'subtitle', 'description', 'audience'] as const) {
      if (typeof payload[key] === 'string') course[key] = (payload[key] as string).trim();
    }
    course.dirty = course.publishedVersion > 0;
    course.updatedAt = new Date().toISOString();
  });
  const course = db.courses.find((item) => item.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }
  res.json({ course });
});

api.get('/courses/:id', (_req, res) => {
  const db = readDb();
  const course = db.courses.find((item) => item.id === _req.params.id);
  if (!course) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }
  res.json({ course, lectures: lectureIndex(db) });
});

/** 生成一个新微课：走既有讲稿流水线，产出独立讲义轴。 */
api.post('/courses/:id/lessons', async (req, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  const material = String(body.material ?? '').trim();
  if (!title) {
    res.status(400).json({ message: '课时需要标题。' });
    return;
  }
  if (!material) {
    res.status(400).json({ message: '缺少讲稿素材，无法生成微课。' });
    return;
  }
  const db = readDb();
  const seedCourse = db.courses.find((item) => item.id === req.params.id);
  if (!seedCourse) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }

  try {
    const result = await runLecturePipeline(
      {
        topic: title,
        title,
        subtitle: String(body.summary ?? '').trim() || undefined,
        course: seedCourse.title,
        material,
        skeleton: body.skeleton ? String(body.skeleton) : undefined,
        mode: (body.mode as LectureMode) ?? 'script',
        durationMinutes: Number(body.durationMinutes ?? 9),
        charsPerMinute: db.settings.charsPerMinute,
        cognitiveLoadCap: db.settings.cognitiveLoadCap,
        blockTargetChars: db.settings.blockTargetChars,
        questionRatioFloor: db.settings.questionRatioFloor
      },
      db.skills,
      db.settings
    );
    const lectureId = nextLectureId(db.lectures);
    const timestamp = new Date().toISOString();
    const lecture = {
      ...result.project,
      id: lectureId,
      name: title,
      meta: {
        ...result.project.meta,
        course: seedCourse.title,
        title,
        engineRunId: `run-${Date.now()}`
      },
      updatedAt: timestamp
    };
    let created: import('../src/types').CourseLesson | null = null;
    const updated = mutateDb((store) => {
      store.lectures = [...store.lectures, lecture];
      const course = store.courses.find((item) => item.id === seedCourse.id);
      if (!course) return;
      created = makeLesson({
        id: `lsn-${Date.now().toString(36)}`,
        order: (course.lessons.at(-1)?.order ?? 0) + 1,
        title,
        summary: String(body.summary ?? '').trim() || lecture.meta.subtitle,
        chapterId:
          typeof body.chapterId === 'string' && body.chapterId
            ? body.chapterId
            : (course.chapters[0]?.id ?? null),
        lectureId,
        seconds: estimateLectureSeconds(lecture)
      });
      course.lessons.push(created);
      course.dirty = course.publishedVersion > 0;
      course.updatedAt = timestamp;
      pushActivity(store, {
        kind: 'engine',
        title: `微课已生成：${title}`,
        detail: `${lecture.blocks.length} 块 · ${lecture.concepts.length} 概念 · ${lecture.pointers.length} 挂载`
      });
    });
    const course = updated.courses.find((item) => item.id === seedCourse.id);
    res.json({ course, lesson: created, lectureId, trace: result.trace, warnings: result.warnings });
  } catch (error) {
    res.status(422).json({ message: error instanceof Error ? error.message : '微课生成失败' });
  }
});

/** 把当前正在开发的讲稿另存为本课程的一个微课。 */
api.post('/courses/:id/lessons/from-current', (req, res) => {
  const db = readDb();
  const title = String(req.body?.title ?? db.project.meta.title).trim() || '未命名微课';
  const course = db.courses.find((item) => item.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }
  const lectureId = nextLectureId(db.lectures);
  const timestamp = new Date().toISOString();
  const source = db.project;
  const lecture: LectureProject = {
    ...JSON.parse(JSON.stringify(source)),
    id: lectureId,
    name: title,
    meta: { ...source.meta, title, course: course.title, revision: 1, generatedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const updated = mutateDb((store) => {
    store.lectures = [...store.lectures, lecture];
    const target = store.courses.find((item) => item.id === course.id);
    if (!target) return;
    target.lessons.push(
      makeLesson({
        id: `lsn-${Date.now().toString(36)}`,
        order: (target.lessons.at(-1)?.order ?? 0) + 1,
        title,
        summary: lecture.meta.subtitle,
        chapterId:
          typeof req.body?.chapterId === 'string' && req.body.chapterId
            ? req.body.chapterId
            : (course.chapters[0]?.id ?? null),
        lectureId,
        seconds: estimateLectureSeconds(lecture)
      })
    );
    target.dirty = target.publishedVersion > 0;
    target.updatedAt = timestamp;
    pushActivity(store, {
      kind: 'project',
 title: `微课已加入课程：${title}`,
      detail: `当前讲稿另存为独立微课 · ${lecture.blocks.length} 块`
    });
  });
  res.json({ course: updated.courses.find((item) => item.id === course.id), lectureId });
});

api.patch('/courses/:id/lessons/:lessonId', (req, res) => {
  const payload = req.body ?? {};
  const db = mutateDb((store) => {
    const course = store.courses.find((item) => item.id === req.params.id);
    const lesson = course?.lessons.find((item) => item.id === req.params.lessonId);
    if (!course || !lesson) return;
    if (typeof payload.title === 'string' && payload.title.trim()) {
      lesson.title = payload.title.trim();
      const lecture = store.lectures.find((item) => item.id === lesson.lectureId);
      if (lecture) {
        lecture.name = lesson.title;
        lecture.meta.title = lesson.title;
        lecture.updatedAt = new Date().toISOString();
      }
    }
    if (typeof payload.summary === 'string') lesson.summary = payload.summary.trim();
    if (typeof payload.order === 'number') {
      const target = Math.max(1, Math.min(course.lessons.length, payload.order));
      const others = course.lessons.filter((item) => item.id !== lesson.id);
      others.splice(target - 1, 0, { ...lesson, order: target });
      course.lessons = resequenceLessons(others);
    }
    lesson.updatedAt = new Date().toISOString();
    course.dirty = course.publishedVersion > 0;
    course.updatedAt = new Date().toISOString();
  });
  const course = db.courses.find((item) => item.id === req.params.id);
  const lesson = course?.lessons.find((item) => item.id === req.params.lessonId);
  if (!course || !lesson) {
    res.status(404).json({ message: '课时不存在' });
    return;
  }
  res.json({ course, lesson });
});

api.delete('/courses/:id/lessons/:lessonId', (req, res) => {
  const db = mutateDb((store) => {
    const course = store.courses.find((item) => item.id === req.params.id);
    if (!course) return;
    const removed = course.lessons.find((item) => item.id === req.params.lessonId);
    course.lessons = resequenceLessons(
      course.lessons.filter((item) => item.id !== req.params.lessonId)
    );
    if (removed?.lectureId && !course.lessons.some((item) => item.lectureId === removed.lectureId)) {
      store.lectures = store.lectures.filter((item) => item.id !== removed.lectureId);
      if (store.activeLectureId === removed.lectureId && store.lectures.length) {
        store.activeLectureId = store.lectures[0].id;
        store.project = store.lectures[0];
      }
    }
    course.dirty = course.publishedVersion > 0;
    course.updatedAt = new Date().toISOString();
    pushActivity(store, {
      kind: 'project',
      title: '课时已删除',
      detail: removed?.title ?? ''
    });
  });
  const course = db.courses.find((item) => item.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }
  res.json({ course });
});

/* 章节：课程 → 章节 → 微课单元 */
api.post('/courses/:id/chapters', (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) {
    res.status(400).json({ message: '章节需要标题。' });
    return;
  }
  const db = mutateDb((store) => {
    const course = store.courses.find((item) => item.id === req.params.id);
    if (!course) return;
    course.chapters = [
      ...(course.chapters ?? []),
      {
        id: `ch-${Date.now().toString(36)}`,
        order: (course.chapters?.length ?? 0) + 1,
        title,
        summary: String(req.body?.summary ?? '').trim()
      }
    ];
    course.dirty = course.publishedVersion > 0;
    course.updatedAt = new Date().toISOString();
    pushActivity(store, { kind: 'project', title: `新增章节：${title}`, detail: course.title });
  });
  const course = db.courses.find((item) => item.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }
  res.json({ course });
});

api.delete('/courses/:id/chapters/:chapterId', (req, res) => {
  const db = mutateDb((store) => {
    const course = store.courses.find((item) => item.id === req.params.id);
    if (!course) return;
    course.chapters = (course.chapters ?? [])
      .filter((chapter) => chapter.id !== req.params.chapterId)
      .map((chapter, index) => ({ ...chapter, order: index + 1 }));
    course.lessons = course.lessons.map((lesson) =>
      lesson.chapterId === req.params.chapterId ? { ...lesson, chapterId: null } : lesson
    );
    course.dirty = course.publishedVersion > 0;
    course.updatedAt = new Date().toISOString();
  });
  const course = db.courses.find((item) => item.id === req.params.id);
  if (!course) {
    res.status(404).json({ message: '课程不存在' });
    return;
  }
  res.json({ course });
});

/** 发布即冻结快照：发布之后的开发稿改动只影响开发者，不影响学生。 */
api.post('/courses/:id/publish', (_req, res) => {
  try {
    const db = mutateDb((store) => {
      const course = store.courses.find((item) => item.id === _req.params.id);
      if (!course) return;
      const next = publishCourse(course, store.lectures);
      Object.assign(course, next);
      pushActivity(store, {
        kind: 'project',
        title: `课程已发布：${next.title}`,
        detail: `v${next.publishedVersion} · ${next.snapshot?.lessons.length ?? 0} 节可看`
      });
    });
    const course = db.courses.find((item) => item.id === _req.params.id);
    if (!course) {
      res.status(404).json({ message: '课程不存在' });
      return;
    }
    res.json({ course });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : '发布失败' });
  }
});

/* ---------- 讲稿库：切换当前开发中的讲义轴 ---------- */

api.get('/lectures/:id', (req, res) => {
  const db = readDb();
  const lecture =
    req.params.id === 'active'
      ? db.project
      : (db.lectures.find((item) => item.id === req.params.id) ?? null);
  if (!lecture) {
    res.status(404).json({ message: '讲稿不存在' });
    return;
  }
  res.json({ lecture });
});

api.post('/lectures/:id/activate', (req, res) => {
  const db = mutateDb((store) => {
    const target = store.lectures.find((item) => item.id === req.params.id);
    if (!target) return;
    store.activeLectureId = target.id;
    store.project = target;
    pushActivity(store, {
      kind: 'project',
      title: `切换开发讲稿：${target.meta.title}`,
      detail: `${target.blocks.length} 块 · 修订 ${target.meta.revision}`
    });
  });
  const lecture = db.lectures.find((item) => item.id === req.params.id);
  if (!lecture) {
    res.status(404).json({ message: '讲稿不存在' });
    return;
  }
  res.json({ lecture, validation: validateProject(lecture) });
});

/* ---------- 学生端：只读取已发布的快照 ---------- */

api.get('/learn', (_req, res) => {
  const db = readDb();
  const courses = db.courses
    .filter((course) => course.snapshot)
    .map((course) => {
      const snapshot = course.snapshot!;
      return {
        id: course.id,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        description: snapshot.description,
        audience: snapshot.audience,
        version: snapshot.version,
        publishedAt: snapshot.publishedAt,
        chapters: snapshot.chapters ?? [],
        lessonCount: snapshot.lessons.length,
        seconds: snapshot.lessons.reduce((sum, lesson) => sum + lesson.seconds, 0),
        lessons: snapshot.lessons.map((lesson) => ({
          id: lesson.id,
          order: lesson.order,
          title: lesson.title,
          summary: lesson.summary,
          chapterId: lesson.chapterId ?? null,
          seconds: lesson.seconds,
          blocks: lesson.blocks,
          concepts: lesson.concepts
        }))
      };
    });
  res.json({ courses });
});

api.get('/learn/:courseId', (req, res) => {
  const db = readDb();
  const course = db.courses.find((item) => item.id === req.params.courseId);
  if (!course?.snapshot) {
    res.status(404).json({ message: '课程尚未发布' });
    return;
  }
  res.json({ course: course.snapshot });
});

api.get('/lecture', (_req, res) => {
  const db = readDb();
  res.json({ project: db.project, validation: validateProject(db.project) });
});

api.get('/lecture/validation', (_req, res) => {
  const db = readDb();
  res.json({ validation: validateProject(db.project) });
});

api.post('/lecture/run', async (req, res) => {
  const body = req.body ?? {};
  const db = readDb();
  const input: LectureRunInput = {
    topic: String(body.topic ?? db.project.topic ?? '未命名主题'),
    title: body.title ? String(body.title) : undefined,
    subtitle: body.subtitle ? String(body.subtitle) : undefined,
    course: body.course ? String(body.course) : undefined,
    material: String(body.material ?? ''),
    skeleton: body.skeleton ? String(body.skeleton) : undefined,
    mode: (body.mode as LectureMode) ?? 'script',
    durationMinutes: Number(body.durationMinutes ?? db.project.meta.durationMinutes ?? 28),
    charsPerMinute: Number(body.charsPerMinute ?? db.settings.charsPerMinute),
    cognitiveLoadCap: Number(body.cognitiveLoadCap ?? db.settings.cognitiveLoadCap),
    blockTargetChars: Number(body.blockTargetChars ?? db.settings.blockTargetChars),
    questionRatioFloor: Number(body.questionRatioFloor ?? db.settings.questionRatioFloor)
  };

  if (!input.material.trim()) {
    res.status(400).json({ message: '缺少讲稿素材，无法运行流水线。' });
    return;
  }

  try {
    const result = await runLecturePipeline(input, db.skills, db.settings);
    const runId = `run-${Date.now()}`;
    result.project.meta.engineRunId = runId;
    result.project.meta.generatedAt = new Date().toISOString();
    result.project.meta.revision = (db.project.meta.revision ?? 0) + 1;
    result.project.engineSnapshot.runId = runId;
    result.project.engineSnapshot.status = 'ready';
    result.project.engineSnapshot.pipeline = result.trace.map((step) => ({
      id: step.id,
      name: step.label,
      state: step.state,
      count: 0
    }));

    const updated = mutateDb((store) => {
      store.project = result.project;
      store.engines = store.engines.map((engine) => ({
        ...engine,
        runs: engine.runs + 1,
        lastRun: new Date().toISOString()
      }));
      pushRun(store, {
        runId,
        engineId: 'engine-script-default',
        mode: input.mode,
        startedAt: new Date(Date.now() - result.durationMs).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        provider: 'local-deterministic',
        trace: result.trace,
        warnings: result.warnings,
        output: `${result.project.blocks.length} 块 · ${result.project.concepts.length} 概念 · ${result.project.pointers.length} 挂载`
      });
      pushActivity(store, {
        kind: 'engine',
        title: '讲稿流水线完成',
        detail: `${input.mode} 模式 · ${result.project.blocks.length} 块 · ${result.project.pointers.length} 挂载`
      });
    });

    const validation = validateProject(updated.project);
    res.json({ project: updated.project, validation, trace: result.trace, warnings: result.warnings });
  } catch (error) {
    res.status(422).json({
      message: error instanceof Error ? error.message : '流水线执行失败'
    });
  }
});

api.post('/lecture/relabel', async (req, res) => {
  const db = readDb();
  const project = db.project;
  const material = project.sections
    .map((section) => {
      const text = project.blocks
        .filter((block) => block.sectionId === section.id)
        .map((block) => block.text)
        .join('');
      return `## ${section.title}\n${text}`;
    })
    .join('\n\n');
  const skeleton = project.concepts
    .map((concept) => {
      const parent = project.concepts.find((item) => item.id === concept.parentId);
      return `${concept.name} | ${concept.definition} | ${parent?.name ?? ''}`;
    })
    .join('\n');

  try {
    const result = await runLecturePipeline(
      {
        topic: project.topic,
        title: project.meta.title,
        subtitle: project.meta.subtitle,
        course: project.meta.course,
        material,
        skeleton,
        mode: 'material',
        durationMinutes: project.meta.durationMinutes,
        charsPerMinute: project.meta.charsPerMinute,
        cognitiveLoadCap: project.meta.cognitiveLoadCap,
        blockTargetChars: db.settings.blockTargetChars,
        questionRatioFloor: project.meta.questionRatioFloor
      },
      db.skills,
      db.settings
    );
    const updated = mutateDb((store) => {
      store.project = {
        ...result.project,
        id: store.project.id,
        meta: {
          ...result.project.meta,
          revision: (store.project.meta.revision ?? 0) + 1
        }
      };
      pushActivity(store, {
        kind: 'engine',
        title: '标注与挂载已重算',
        detail: `${result.project.blocks.length} 块 · ${result.project.pointers.length} 挂载`
      });
    });
    res.json({
      project: updated.project,
      validation: validateProject(updated.project),
      trace: result.trace,
      warnings: result.warnings
    });
  } catch (error) {
    res.status(422).json({
      message: error instanceof Error ? error.message : '重算失败'
    });
  }
});

api.get('/lecture/suggestions', (_req, res) => {
  const db = readDb();
  res.json({ suggestions: db.project.suggestions ?? [] });
});

api.post('/lecture/suggestions', async (_req, res) => {
  const db = readDb();
  try {
    const result = await generateSuggestions(db.project, db.skills, db.settings);
    const updated = mutateDb((store) => {
      store.project = { ...store.project, suggestions: result.suggestions };
      pushActivity(store, {
        kind: 'engine',
        title: '逐行挂载建议已生成',
        detail: `${result.suggestions.length} 条建议 · ${result.suggestions.filter((item) => item.status === 'pending').length} 条待确认`
      });
    });
    res.json({
      suggestions: updated.project.suggestions,
      provider: result.provider,
      warnings: result.warnings,
      project: updated.project
    });
  } catch (error) {
    res.status(500).json({
      message: error instanceof Error ? error.message : '挂载建议生成失败'
    });
  }
});

api.post('/lecture/suggestions/apply-all', (_req, res) => {
  const db = readDb();
  const floor = confidenceFloor(db.skills);
  const pending = (db.project.suggestions ?? []).filter((item) => item.status === 'pending');
  const applicable = pending.filter((item) => item.confidence >= floor);
  const skipped = pending.length - applicable.length;
  let project = db.project;
  applicable.forEach((suggestion) => {
    project = applySuggestion(project, suggestion);
  });
  const updated = mutateDb((store) => {
    store.project = project;
    pushActivity(store, {
      kind: 'project',
      title: '挂载建议已全部确认',
      detail: `确认 ${pending.length} 条建议`
    });
  });
  res.json({
    project: updated.project,
    validation: validateProject(updated.project),
    applied: applicable.length,
    skipped
  });
});

api.post('/lecture/suggestions/:id/apply', (req, res) => {
  const db = readDb();
  const suggestion = (db.project.suggestions ?? []).find((item) => item.id === req.params.id);
  if (!suggestion) {
    res.status(404).json({ message: '挂载建议不存在' });
    return;
  }
  const edit = {
    mediaType: req.body?.mediaType,
    targetId: req.body?.targetId,
    rationale: req.body?.rationale,
    targetLabel: req.body?.targetLabel
  };
  const project = applySuggestion(db.project, suggestion, edit);
  const updated = mutateDb((store) => {
    store.project = project;
    pushActivity(store, {
      kind: 'project',
      title: '挂载建议已确认',
      detail: `${suggestion.blockId} · ${edit.mediaType ?? suggestion.mediaType}`
    });
  });
  res.json({ project: updated.project, validation: validateProject(updated.project) });
});

api.post('/lecture/suggestions/:id/reject', (req, res) => {
  const db = readDb();
  const project = rejectSuggestion(db.project, req.params.id);
  const updated = mutateDb((store) => {
    store.project = project;
    pushActivity(store, {
      kind: 'project',
      title: '挂载建议已拒绝',
      detail: req.params.id
    });
  });
  res.json({ project: updated.project, validation: validateProject(updated.project) });
});

api.patch('/lecture/suggestions/:id', (req, res) => {
  const db = mutateDb((store) => {
    const target = (store.project.suggestions ?? []).find((item) => item.id === req.params.id);
    if (!target) return;
    if (typeof req.body?.rationale === 'string') target.rationale = req.body.rationale;
    if (typeof req.body?.targetLabel === 'string') target.targetLabel = req.body.targetLabel;
    if (typeof req.body?.mediaType === 'string') target.mediaType = req.body.mediaType;
    if (req.body?.targetId === null || typeof req.body?.targetId === 'string') {
      target.targetId = req.body.targetId;
    }
    target.status = 'edited';
  });
  res.json({ project: db.project, validation: validateProject(db.project) });
});

api.post('/lecture/blocks/:id', (req, res) => {
  const db = mutateDb((store) => {
    const block = store.project.blocks.find((item) => item.id === req.params.id);
    if (!block) return;
    if (typeof req.body?.text === 'string' && req.body.text.trim()) {
      block.text = req.body.text.trim();
    }
    if (typeof req.body?.label === 'string') {
      block.label = req.body.label;
      block.labelEvidence = '人工指定，块编号为唯一纽带。';
    }
    store.project.updatedAt = new Date().toISOString();
    pushActivity(store, {
      kind: 'project',
      title: `讲稿块已修改：${block.id}`,
      detail: '标注需随讲稿重算，请在引擎台执行重算。'
    });
  });
  res.json({ project: db.project, validation: validateProject(db.project) });
});

api.get('/activity', (_req, res) => {
  res.json({ activity: readDb().activity });
});

api.post('/system/reset', (_req, res) => {
  resetDb();
  res.json({ ok: true });
});

app.use('/api', api);

if (fs.existsSync(distRoot)) {
  app.use(express.static(distRoot));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distRoot, 'index.html'));
  });
}

const port = Number(process.env.LECTURE_AXIS_PORT || DEFAULT_PORT);
const host = process.env.LECTURE_AXIS_HOST || '127.0.0.1';

app.listen(port, host, () => {
  console.log(`讲义轴服务已启动：http://${host}:${port}`);
  console.log(`数据目录：${dataDir}`);
});

const pick = (source: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
