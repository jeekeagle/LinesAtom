import type {
  LectureMode,
  LectureWorkflow,
  ProductionStage,
  WorkflowStep
} from '../src/types';

const BUILT_AT = '2026-10-29T00:00:00.000Z';
const MODES: LectureMode[] = ['script', 'material', 'skeleton'];

const step = (
  id: string,
  key: string,
  label: string,
  shortLabel: string,
  stage: ProductionStage,
  engineId: string,
  skillIds: string[],
  description: string,
  dependsOn: string[] = []
): WorkflowStep => ({
  id,
  key,
  label,
  shortLabel,
  stage,
  engineId,
  skillIds,
  dependsOn,
  description
});

export const DEFAULT_WORKFLOWS: LectureWorkflow[] = [
  {
    id: 'workflow-script-default',
    name: '讲稿驱动',
    mode: 'script',
    description: '给出主题与素材，系统一路推进：内容基座 → 讲稿切分 → 同步标注 → 介质生成 → 挂载编排 → 验收分析。',
    steps: [
      step('base', 'base', '内容基座构建', '基座', 'analysis', 'engine-analysis-default', ['concept-extract'], '产出概念表、关系网与素材池。'),
      step('segment', 'segment', '讲稿切分', '切分', 'script', 'engine-script-default', ['block-label'], '把讲稿切成确定性块，块编号为唯一纽带。'),
      step('label', 'label', '同步标注', '标注', 'script', 'engine-script-default', ['block-label', 'concept-extract'], '按六标签方法同步判定，保证无未标注块。'),
      step('media', 'media', '介质生成', '介质', 'media', 'engine-media-concept-card', ['concept-card', 'case-study', 'qa-pair', 'cheat-sheet', 'slide-deck', 'chapter-map'], '由技能生成概念卡、案例、问答、速查表、课件页与导图。'),
      step('mount', 'mount', '挂载编排', '挂载', 'mount', 'engine-mount-default', ['mount-planner'], '按标签一一对应生成挂载指针，回指不重复挂载。'),
      step('validate', 'validate', '验收分析', '验收', 'quality', 'engine-quality-default', ['validation'], '四项首版验收逐项出证据。')
    ],
    enabled: true,
    isDefault: true,
    builtIn: true,
    createdAt: BUILT_AT,
    updatedAt: BUILT_AT
  },
  {
    id: 'workflow-material-default',
    name: '素材驱动',
    mode: 'material',
    description: '教师已有成稿，系统按语义边界归位为块，先判定位置再判定标签。',
    steps: [
      step('material', 'material', '素材归位', '归位', 'analysis', 'engine-analysis-default', ['concept-extract'], '按标题与语义边界把素材切成章节。'),
      step('base', 'base', '内容基座构建', '基座', 'analysis', 'engine-analysis-default', ['concept-extract'], '产出概念表与关系网。'),
      step('segment', 'segment', '讲稿切分', '切分', 'script', 'engine-script-default', ['block-label'], '把成稿切成确定性块。'),
      step('label', 'label', '同步标注', '标注', 'script', 'engine-script-default', ['block-label'], '按六标签方法同步判定。'),
      step('media', 'media', '介质生成', '介质', 'media', 'engine-media-concept-card', ['concept-card', 'case-study', 'qa-pair', 'cheat-sheet', 'slide-deck', 'chapter-map'], '生成挂载位上的全部介质。'),
      step('mount', 'mount', '挂载编排', '挂载', 'mount', 'engine-mount-default', ['mount-planner'], '生成挂载指针与回指。'),
      step('validate', 'validate', '验收分析', '验收', 'quality', 'engine-quality-default', ['validation'], '四项首版验收逐项出证据。')
    ],
    enabled: true,
    isDefault: true,
    builtIn: true,
    createdAt: BUILT_AT,
    updatedAt: BUILT_AT
  },
  {
    id: 'workflow-skeleton-default',
    name: '骨架驱动',
    mode: 'skeleton',
    description: '教师给出概念骨架，系统围绕骨架组织讲稿，先建关系网再填讲稿。',
    steps: [
      step('skeleton', 'skeleton', '骨架装载', '骨架', 'analysis', 'engine-analysis-default', ['concept-extract'], '装载概念清单与上位类关系。'),
      step('base', 'base', '内容基座构建', '基座', 'analysis', 'engine-analysis-default', ['concept-extract'], '校验每个概念都有定义与上位类，关系网无孤立节点。'),
      step('segment', 'segment', '讲稿切分', '切分', 'script', 'engine-script-default', ['block-label'], '按骨架顺序切分讲稿。'),
      step('label', 'label', '同步标注', '标注', 'script', 'engine-script-default', ['block-label', 'concept-extract'], '同步判定标签与锚点。'),
      step('media', 'media', '介质生成', '介质', 'media', 'engine-media-concept-card', ['concept-card', 'case-study', 'qa-pair', 'cheat-sheet', 'slide-deck', 'chapter-map'], '生成全部介质。'),
      step('mount', 'mount', '挂载编排', '挂载', 'mount', 'engine-mount-default', ['mount-planner'], '生成挂载指针与回指。'),
      step('validate', 'validate', '验收分析', '验收', 'quality', 'engine-quality-default', ['validation'], '四项首版验收逐项出证据。')
    ],
    enabled: true,
    isDefault: true,
    builtIn: true,
    createdAt: BUILT_AT,
    updatedAt: BUILT_AT
  }
];

const safeString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

export function normalizeWorkflows(input: unknown): LectureWorkflow[] {
  const existing = Array.isArray(input) ? (input as LectureWorkflow[]) : [];
  const byId = new Map<string, LectureWorkflow>();
  for (const item of existing) {
    if (!item || typeof item !== 'object' || !safeString(item.id)) continue;
    byId.set(item.id, {
      id: safeString(item.id),
      name: safeString(item.name, '未命名流程'),
      mode: (MODES as string[]).includes(item.mode) ? item.mode : 'script',
      description: safeString(item.description),
      steps: Array.isArray(item.steps)
        ? item.steps.map((stepItem) => ({
            id: safeString(stepItem.id),
            key: safeString(stepItem.key),
            label: safeString(stepItem.label),
            shortLabel: safeString(stepItem.shortLabel),
            stage: stepItem.stage,
            engineId: safeString(stepItem.engineId) || undefined,
            skillIds: Array.isArray(stepItem.skillIds) ? stepItem.skillIds : [],
            dependsOn: Array.isArray(stepItem.dependsOn) ? stepItem.dependsOn : [],
            description: safeString(stepItem.description)
          }))
        : [],
      enabled: item.enabled !== false,
      isDefault: Boolean(item.isDefault),
      builtIn: Boolean(item.builtIn),
      createdAt: safeString(item.createdAt, BUILT_AT),
      updatedAt: safeString(item.updatedAt, BUILT_AT)
    });
  }
  for (const fallback of DEFAULT_WORKFLOWS) {
    if (!byId.has(fallback.id)) byId.set(fallback.id, { ...fallback });
  }
  const workflows = [...byId.values()];
  for (const mode of MODES) {
    const candidates = workflows.filter((item) => item.mode === mode);
    const current = candidates.find((item) => item.isDefault && item.enabled);
    if (current) {
      for (const item of candidates) item.isDefault = item.id === current.id;
      continue;
    }
    const fallback =
      candidates.find((item) => item.builtIn) ??
      candidates.find((item) => item.enabled) ??
      candidates[0];
    if (fallback) {
      fallback.isDefault = true;
      fallback.enabled = true;
    }
  }
  return workflows;
}

export function defaultWorkflowForMode(
  workflows: LectureWorkflow[],
  mode: LectureMode
): LectureWorkflow | undefined {
  return (
    workflows.find((item) => item.mode === mode && item.enabled && item.isDefault) ??
    workflows.find((item) => item.mode === mode && item.enabled) ??
    workflows.find((item) => item.mode === mode)
  );
}

export function workflowProgress(workflow: LectureWorkflow, project: unknown): number {
  if (!workflow.steps.length) return 0;
  const done = workflow.steps.filter((item) => {
    if (item.key === 'base' || item.key === 'skeleton' || item.key === 'material') return true;
    if (item.key === 'segment') return Boolean((project as { blocks?: unknown[] })?.blocks?.length);
    if (item.key === 'label') return Boolean((project as { blocks?: unknown[] })?.blocks?.length);
    if (item.key === 'media') return Boolean((project as { media?: unknown })?.media);
    if (item.key === 'mount') return Boolean((project as { pointers?: unknown[] })?.pointers?.length);
    if (item.key === 'validate') return true;
    return false;
  }).length;
  return Math.round((done / workflow.steps.length) * 100);
}