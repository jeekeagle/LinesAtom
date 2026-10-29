import type {
  AgentSkill,
  BootstrapData,
  Course,
  CourseLesson,
  EngineRunResult,
  LectureMode,
  LectureProject,
  LectureWorkflow,
  ProductionEngine,
  RuntimeSettings,
  ServiceProfile,
  TraceStep,
  ValidationReport
} from '../types';

export interface LectureBrief {
  id: string;
  name: string;
  title: string;
  blocks: number;
  concepts: number;
  pointers: number;
  revision: number;
  updatedAt: string;
}

export interface LearnCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  audience: string;
  version: number;
  publishedAt: string;
  chapters: { id: string; order: number; title: string; summary: string }[];
  lessonCount: number;
  seconds: number;
  lessons: {
    id: string;
    order: number;
    title: string;
    summary: string;
    chapterId: string | null;
    seconds: number;
    blocks: number;
    concepts: number;
  }[];
}

const BASE = '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.message || `请求失败（${response.status}）`);
  }
  return payload as T;
}

export interface LectureRunPayload {
  topic: string;
  title?: string;
  subtitle?: string;
  course?: string;
  material: string;
  skeleton?: string;
  mode: LectureMode;
  durationMinutes: number;
  charsPerMinute: number;
  cognitiveLoadCap: number;
  blockTargetChars: number;
  questionRatioFloor: number;
}

export interface EngineParamPlan {
  key: string;
  label: string;
  value: number;
  source: string;
}

export interface EngineRunUsage {
  analysis: string;
  script: string;
  mount: string;
  quality: string;
  media: string[];
}
export const api = {
  bootstrap: () => request<BootstrapData>('/api/bootstrap'),

  /* 服务档案：模型 / 声音 / 语音识别，均可新建、切换、测速、管理 */
  services: () =>
    request<{
      services: ServiceProfile[];
      voices: string[];
      ttsModels: string[];
      asrModels: string[];
    }>('/api/services'),

  createService: (
    payload: Partial<ServiceProfile> & { kind: 'chat' | 'tts' | 'asr'; name: string }
  ) => request<{ service: ServiceProfile }>('/api/services', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  updateService: (id: string, payload: Partial<ServiceProfile>) =>
    request<{ service: ServiceProfile }>(`/api/services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteService: (id: string) =>
    request<{ services: ServiceProfile[] }>(`/api/services/${id}`, { method: 'DELETE' }),

  setServiceKey: (id: string, apiKey: string) =>
    request<{ ok: boolean; service: ServiceProfile }>(`/api/services/${id}/api-key`, {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),

  clearServiceKey: (id: string) =>
    request<{ ok: boolean; service: ServiceProfile }>(`/api/services/${id}/api-key`, {
      method: 'DELETE'
    }),

  activateService: (id: string) =>
    request<{ services: ServiceProfile[] }>(`/api/services/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  testService: (id: string) =>
    request<{
      ok: boolean;
      latencyMs: number;
      message?: string;
      model?: string;
      voice?: string;
      text?: string;
      previewBase64?: string;
      format?: 'wav' | 'mp3';
    }>(`/api/services/${id}/test`, { method: 'POST', body: JSON.stringify({}) }),

  serviceModels: (serviceId: string) =>
    request<{ models: string[] }>('/api/services/models', {
      method: 'POST',
      body: JSON.stringify({ serviceId })
    }),

  tts: (payload: {
    text: string;
    serviceId?: string;
    voice?: string;
    style?: string | null;
    model?: string;
  }) =>
    request<{
      audioBase64: string;
      format: 'wav' | 'mp3';
      voice: string;
      model: string;
      latencyMs: number;
    }>('/api/audio/tts', { method: 'POST', body: JSON.stringify(payload) }),

  asr: (payload: { audioBase64: string; format?: 'wav' | 'mp3'; serviceId?: string; language?: string }) =>
    request<{ text: string; model: string; latencyMs: number }>('/api/audio/asr', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  /* 课程与微课 */
  courses: () => request<{ courses: Course[]; lectures: LectureBrief[] }>('/api/courses'),

  course: (id: string) =>
    request<{ course: Course; lectures: LectureBrief[] }>(`/api/courses/${id}`),

  createCourse: (payload: Partial<Pick<Course, 'title' | 'subtitle' | 'description' | 'audience'>>) =>
    request<{ course: Course }>('/api/courses', { method: 'POST', body: JSON.stringify(payload) }),

  updateCourse: (id: string, payload: Partial<Pick<Course, 'title' | 'subtitle' | 'description' | 'audience'>>) =>
    request<{ course: Course }>(`/api/courses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  createLesson: (
    courseId: string,
    payload: {
      title: string;
      material: string;
      summary?: string;
      chapterId?: string;
      durationMinutes?: number;
      mode?: 'script' | 'material' | 'skeleton';
    }
  ) =>
    request<{ course: Course; lesson: CourseLesson; lectureId: string; trace: TraceStep[]; warnings: string[] }>(
      `/api/courses/${courseId}/lessons`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  lessonFromCurrent: (courseId: string, title: string) =>
    request<{ course: Course; lectureId: string }>(
      `/api/courses/${courseId}/lessons/from-current`,
      { method: 'POST', body: JSON.stringify({ title }) }
    ),

  createChapter: (courseId: string, payload: { title: string; summary?: string }) =>
    request<{ course: Course }>(`/api/courses/${courseId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  deleteChapter: (courseId: string, chapterId: string) =>
    request<{ course: Course }>(`/api/courses/${courseId}/chapters/${chapterId}`, {
      method: 'DELETE'
    }),

  updateLesson: (courseId: string, lessonId: string, payload: Partial<CourseLesson>) =>
    request<{ course: Course; lesson: CourseLesson }>(
      `/api/courses/${courseId}/lessons/${lessonId}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ),

  deleteLesson: (courseId: string, lessonId: string) =>
    request<{ course: Course }>(`/api/courses/${courseId}/lessons/${lessonId}`, {
      method: 'DELETE'
    }),

  publishCourse: (courseId: string) =>
    request<{ course: Course }>(`/api/courses/${courseId}/publish`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  lecture: (lectureId: string) =>
    request<{ lecture: import('../types').LectureProject }>(`/api/lectures/${lectureId}`),

  activateLecture: (lectureId: string) =>
    request<{ lecture: import('../types').LectureProject }>(
      `/api/lectures/${lectureId}/activate`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  /* 学生端只读已发布快照 */
  learn: () => request<{ courses: LearnCourse[] }>('/api/learn'),

  learnCourse: (courseId: string) =>
    request<{ course: import('../types').PublishedCourse }>(`/api/learn/${courseId}`),

  health: () => request<{ ok: boolean; version: string }>('/api/health'),

  runLecture: (payload: LectureRunPayload) =>
    request<{
      project: LectureProject;
      validation: ValidationReport;
      trace: TraceStep[];
      warnings: string[];
      enginesUsed: EngineRunUsage;
      effective: EngineParamPlan[];
    }>('/api/lecture/run', { method: 'POST', body: JSON.stringify(payload) }),

  enginePlan: () =>
    request<{
      effective: EngineParamPlan[];
      enginesUsed: EngineRunUsage;
    }>('/api/engines/plan'),

  relabel: () =>
    request<{
      project: LectureProject;
      validation: ValidationReport;
      trace: TraceStep[];
      warnings: string[];
    }>('/api/lecture/relabel', { method: 'POST', body: JSON.stringify({}) }),

  updateBlock: (id: string, payload: { text?: string; label?: string }) =>
    request<{ project: LectureProject; validation: ValidationReport }>(
      `/api/lecture/blocks/${id}`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  suggestions: () =>
    request<{ suggestions: import('../types').MountSuggestion[] }>('/api/lecture/suggestions'),

  generateSuggestions: () =>
    request<{
      suggestions: import('../types').MountSuggestion[];
      provider: string;
      warnings: string[];
      project: LectureProject;
    }>('/api/lecture/suggestions', { method: 'POST', body: JSON.stringify({}) }),

  applySuggestion: (id: string, edit?: Partial<import('../types').MountSuggestion>) =>
    request<{ project: LectureProject; validation: ValidationReport }>(
      `/api/lecture/suggestions/${id}/apply`,
      { method: 'POST', body: JSON.stringify(edit ?? {}) }
    ),

  rejectSuggestion: (id: string) =>
    request<{ project: LectureProject; validation: ValidationReport }>(
      `/api/lecture/suggestions/${id}/reject`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  applyAllSuggestions: () =>
    request<{ project: LectureProject; validation: ValidationReport; applied: number; skipped: number }>(
      '/api/lecture/suggestions/apply-all',
      { method: 'POST', body: JSON.stringify({}) }
    ),

  skills: () => request<{ skills: AgentSkill[] }>('/api/skills'),

  updateSkill: (id: string, payload: Partial<AgentSkill>) =>
    request<{ skills: AgentSkill[] }>(`/api/skills/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  runSkill: (id: string, input: string) =>
    request<{
      skill: AgentSkill;
      output: unknown;
      provider: string;
      model: string;
      fallback: boolean;
      warning?: string;
    }>(`/api/skills/${id}/run`, { method: 'POST', body: JSON.stringify({ input }) }),

  engines: () =>
    request<{ engines: ProductionEngine[]; stageLabels: Record<string, string> }>('/api/engines'),

  createEngine: (payload: Partial<ProductionEngine> & { name: string }) =>
    request<{ engines: ProductionEngine[] }>('/api/engines', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  trialEngine: (id: string, input: string) =>
    request<{
      skill: AgentSkill;
      skills: AgentSkill[];
      engines: ProductionEngine[];
      output: unknown;
      provider: string;
      model: string;
      fallback: boolean;
      warning?: string;
    }>(`/api/engines/${id}/trial`, { method: 'POST', body: JSON.stringify({ input }) }),
  cloneEngine: (id: string) =>
    request<{ engines: ProductionEngine[] }>(`/api/engines/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  deleteEngine: (id: string) =>
    request<{ engines: ProductionEngine[] }>(`/api/engines/${id}`, { method: 'DELETE' }),

  updateEngine: (id: string, payload: Partial<ProductionEngine>) =>
    request<{ engines: ProductionEngine[] }>(`/api/engines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  setDefaultEngine: (id: string) =>
    request<{ engines: ProductionEngine[] }>(`/api/engines/${id}/default`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  workflows: () =>
    request<{ workflows: LectureWorkflow[]; modeLabels: Record<string, string> }>('/api/workflows'),

  updateWorkflow: (id: string, payload: Partial<LectureWorkflow>) =>
    request<{ workflows: LectureWorkflow[] }>(`/api/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  setDefaultWorkflow: (id: string) =>
    request<{ workflows: LectureWorkflow[] }>(`/api/workflows/${id}/default`, {
      method: 'POST',
      body: JSON.stringify({})
    }),

  updateSettings: (payload: Partial<RuntimeSettings>) =>
    request<{ settings: RuntimeSettings }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  setApiKey: (apiKey: string) =>
    request<{ ok: boolean; apiKeyConfigured: boolean }>('/api/settings/model/api-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),

  clearApiKey: () =>
    request<{ ok: boolean; apiKeyConfigured: boolean }>('/api/settings/model/api-key', {
      method: 'DELETE'
    }),

  testModel: () =>
    request<{ ok: boolean; latencyMs: number; model: string; provider: string; message: string }>(
      '/api/settings/model/test',
      { method: 'POST', body: JSON.stringify({}) }
    ),

  activity: () =>
    request<{ activity: BootstrapData['activity'] }>('/api/activity'),

  reset: () => request<{ ok: boolean }>('/api/system/reset', { method: 'POST', body: JSON.stringify({}) }),

  runs: (): Promise<{ runs: EngineRunResult[] }> =>
    request<BootstrapData>('/api/bootstrap').then((data) => ({ runs: data.runs }))
};
