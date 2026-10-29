import type { EngineKind, ProductionEngine, ProductionStage } from '../src/types';

const BUILT_AT = '2026-10-29T00:00:00.000Z';

const engine = (
  id: string,
  name: string,
  stage: ProductionStage,
  kind: EngineKind,
  description: string,
  skillIds: string[],
  config: Record<string, string | number | boolean> = {},
  isDefault = false
): ProductionEngine => ({
  id,
  name,
  stage,
  kind,
  description,
  skillIds,
  config,
  enabled: true,
  isDefault,
  builtIn: true,
  runs: 0,
  lastRun: '尚未运行',
  createdAt: BUILT_AT,
  updatedAt: BUILT_AT
});

export const DEFAULT_ENGINES: ProductionEngine[] = [
  engine(
    'engine-analysis-default',
    '内容基座分析引擎',
    'analysis',
    'analysis',
    '读取主题与讲稿素材，产出概念表与关系网，保证每个概念都有定义与上位类。',
    ['concept-extract'],
    { depth: 'standard', maxConcepts: 14 },
    true
  ),
  engine(
    'engine-script-default',
    '讲稿切分与标注引擎',
    'script',
    'text',
    '把讲稿切成确定性块，并按六标签方法同步标注，块编号是讲稿与标注的唯一纽带。',
    ['block-label', 'concept-extract'],
    { blockTargetChars: 150, fallback: true },
    true
  ),
  engine(
    'engine-mount-default',
    '挂载编排引擎',
    'mount',
    'structure',
    '按标签与挂载规则一一对应生成挂载指针，处理回指与重复挂载。',
    ['mount-planner'],
    { preloadAll: true, dedupeByConcept: true },
    true
  ),
  engine(
    'engine-media-concept-card',
    '概念卡介质引擎',
    'media',
    'media',
    '为核心概念生成知识卡片，内容取自概念条目，不在挂载位重复存储。',
    ['concept-card'],
    { mediaKind: 'concept' }
  ),
  engine(
    'engine-media-case',
    '案例介质引擎',
    'media',
    'media',
    '为理解性例子生成背景、做法、结果三段式案例。',
    ['case-study'],
    { mediaKind: 'case' }
  ),
  engine(
    'engine-media-qa',
    '问答介质引擎',
    'media',
    'media',
    '为设问互动生成真实疑问与先给结论的答案。',
    ['qa-pair'],
    { mediaKind: 'qa' }
  ),
  engine(
    'engine-media-cheatsheet',
    '速查表介质引擎',
    'media',
    'media',
    '为结论收束生成速查表或闪卡，内容性质二选一。',
    ['cheat-sheet'],
    { mediaKind: 'cheatsheet' }
  ),
  engine(
    'engine-media-slide',
    '课件页介质引擎',
    'media',
    'media',
    '为全局定位生成一页课件页。',
    ['slide-deck'],
    { mediaKind: 'slide' }
  ),
  engine(
    'engine-media-map',
    '章节导图介质引擎',
    'media',
    'media',
    '为章节位置生成章节导图。',
    ['chapter-map'],
    { mediaKind: 'map' }
  ),
  engine(
    'engine-quality-default',
    '验收分析引擎',
    'quality',
    'quality',
    '按首版四项验收标准逐项检查并给出证据。',
    ['validation'],
    { questionRatioFloor: 0.08, durationTolerance: 0.25 },
    true
  )
];

const stages: ProductionStage[] = ['analysis', 'script', 'mount', 'media', 'quality'];

const safeString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const safeConfig = (value: unknown): Record<string, string | number | boolean> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, item]) =>
          ['string', 'number', 'boolean'].includes(typeof item)
        )
      ) as Record<string, string | number | boolean>)
    : {};

export function normalizeEngines(input: unknown): ProductionEngine[] {
  const existing = Array.isArray(input) ? (input as ProductionEngine[]) : [];
  const byId = new Map<string, ProductionEngine>();
  for (const item of existing) {
    if (!item || typeof item !== 'object' || !safeString(item.id)) continue;
    byId.set(item.id, {
      id: safeString(item.id),
      name: safeString(item.name, '未命名引擎'),
      stage: stages.includes(item.stage) ? item.stage : 'script',
      kind: (['analysis', 'text', 'structure', 'media', 'quality'] as const).includes(item.kind)
        ? item.kind
        : 'text',
      description: safeString(item.description),
      skillIds: Array.isArray(item.skillIds)
        ? item.skillIds.filter((id) => typeof id === 'string')
        : [],
      config: safeConfig(item.config),
      enabled: item.enabled !== false,
      isDefault: Boolean(item.isDefault),
      builtIn: Boolean(item.builtIn),
      runs: Number.isFinite(Number(item.runs)) ? Number(item.runs) : 0,
      lastRun: safeString(item.lastRun, '尚未运行'),
      createdAt: safeString(item.createdAt, BUILT_AT),
      updatedAt: safeString(item.updatedAt, BUILT_AT)
    });
  }
  for (const fallback of DEFAULT_ENGINES) {
    if (!byId.has(fallback.id)) byId.set(fallback.id, { ...fallback, config: { ...fallback.config } });
  }
  const engines = [...byId.values()];
  for (const stage of stages) {
    if (engines.some((item) => item.stage === stage && item.isDefault)) continue;
    const fallback = DEFAULT_ENGINES.find((item) => item.stage === stage && item.isDefault);
    const target = fallback ? engines.find((item) => item.id === fallback.id) : undefined;
    if (target) target.isDefault = true;
  }
  return engines;
}

export function defaultEngineForStage(
  engines: ProductionEngine[],
  stage: ProductionStage
): ProductionEngine | undefined {
  return (
    engines.find((item) => item.stage === stage && item.enabled && item.isDefault) ??
    engines.find((item) => item.stage === stage && item.enabled)
  );
}

export function mediaEngineForKind(
  engines: ProductionEngine[],
  kind: string
): ProductionEngine | undefined {
  return (
    engines.find(
      (item) => item.stage === 'media' && item.enabled && item.config.mediaKind === kind
    ) ?? defaultEngineForStage(engines, 'media')
  );
}

export function setEngineDefault(engines: ProductionEngine[], engineId: string): boolean {
  const target = engines.find((item) => item.id === engineId);
  if (!target) return false;
  for (const item of engines) {
    if (item.stage === target.stage) item.isDefault = item.id === target.id;
  }
  target.enabled = true;
  target.updatedAt = new Date().toISOString();
  return true;
}
/** 流水线参数由各阶段默认引擎决定，页面只提供兜底值。 */
export interface EngineParamPlan {
  key: string;
  label: string;
  value: number;
  source: string;
}

export interface EngineRunPlan {
  effective: EngineParamPlan[];
  enginesUsed: {
    analysis: string;
    script: string;
    mount: string;
    quality: string;
    media: string[];
  };
  stageEngines: Partial<Record<ProductionStage, ProductionEngine>>;
}

const PARAM_SOURCES: { key: string; label: string; stages: ProductionStage[] }[] = [
  { key: 'blockTargetChars', label: '块目标字数', stages: ['script'] },
  { key: 'questionRatioFloor', label: '设问占比下限', stages: ['quality', 'script'] },
  { key: 'cognitiveLoadCap', label: '认知负荷上限', stages: ['script', 'analysis'] },
  { key: 'charsPerMinute', label: '字数每分钟', stages: ['script'] },
  { key: 'durationMinutes', label: '目标时长（分钟）', stages: ['script'] }
];

const numOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function planEngineRun(
  engines: ProductionEngine[],
  fallback: Record<string, number>
): EngineRunPlan {
  const stageEngine = (stage: ProductionStage) => defaultEngineForStage(engines, stage);
  const stageEngines: Partial<Record<ProductionStage, ProductionEngine>> = {
    analysis: stageEngine('analysis'),
    script: stageEngine('script'),
    mount: stageEngine('mount'),
    quality: stageEngine('quality')
  };
  const effective = PARAM_SOURCES.map((item) => {
    for (const stage of item.stages) {
      const engine = stageEngines[stage];
      const value = numOf(engine?.config[item.key]);
      if (engine && value !== undefined) {
        return { key: item.key, label: item.label, value, source: engine.name };
      }
    }
    return {
      key: item.key,
      label: item.label,
      value: fallback[item.key] ?? 0,
      source: '流水线兜底值'
    };
  });
  return {
    effective,
    stageEngines,
    enginesUsed: {
      analysis: stageEngines.analysis?.name ?? '未配置',
      script: stageEngines.script?.name ?? '未配置',
      mount: stageEngines.mount?.name ?? '未配置',
      quality: stageEngines.quality?.name ?? '未配置',
      media: engines.filter((engine) => engine.stage === 'media' && engine.enabled).map((engine) => engine.name)
    }
  };
}