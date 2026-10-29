import type { AgentSkill, EngineKind, ProductionEngine, ProductionStage } from '../types';

/** 引擎配置的四个步骤：新建之后按这条线走完，引擎才真正可用。 */
export type EngineStepId = 'scope' | 'skills' | 'params' | 'activate';

export interface EngineStepDef {
  id: EngineStepId;
  label: string;
  hint: string;
}

export const ENGINE_STEPS: EngineStepDef[] = [
  { id: 'scope', label: '定位', hint: '在哪个阶段、做什么类型、解决什么问题' },
  { id: 'skills', label: '技能', hint: '绑定哪些技能来产出内容' },
  { id: 'params', label: '参数', hint: '运行旋钮：数量、上限、语气、模式' },
  { id: 'activate', label: '启用与试跑', hint: '先跑一次看效果，再决定是否作为默认' }
];

export const ENGINE_KIND_LABELS: Record<EngineKind, string> = {
  analysis: '分析',
  text: '文本',
  structure: '结构',
  media: '介质',
  quality: '质量'
};

export interface EngineDraft {
  name: string;
  description: string;
  stage: ProductionStage;
  kind: EngineKind;
  skillIds: string[];
  config: Record<string, string | number | boolean>;
  enabled: boolean;
}

export function emptyDraft(stage: ProductionStage = 'media'): EngineDraft {
  return {
    name: '',
    description: '',
    stage,
    kind: stage === 'media' ? 'media' : 'text',
    skillIds: [],
    config: {},
    enabled: true
  };
}

export function draftFromEngine(engine: ProductionEngine): EngineDraft {
  return {
    name: engine.name,
    description: engine.description,
    stage: engine.stage,
    kind: engine.kind,
    skillIds: [...engine.skillIds],
    config: { ...engine.config },
    enabled: engine.enabled
  };
}

/** 引擎就绪度：四步里完成了几步，卡在第几步。 */
export interface EngineProgress {
  done: Record<EngineStepId, boolean>;
  current: EngineStepId;
  count: number;
  percent: number;
  ready: boolean;
}

export function engineProgress(engine: ProductionEngine, skills: AgentSkill[]): EngineProgress {
  const bound = engine.skillIds
    .map((id) => skills.find((skill) => skill.id === id))
    .filter((skill): skill is AgentSkill => Boolean(skill));
  const done: Record<EngineStepId, boolean> = {
    scope: Boolean(engine.name.trim() && engine.description.trim()),
    skills: bound.length > 0 && bound.every((skill) => skill.enabled),
    params: Object.keys(engine.config).length > 0,
    activate: engine.enabled && (engine.isDefault || engine.runs > 0)
  };
  const order: EngineStepId[] = ['scope', 'skills', 'params', 'activate'];
  const current = order.find((id) => !done[id]) ?? 'activate';
  const count = order.filter((id) => done[id]).length;
  return { done, current, count, percent: Math.round((count / order.length) * 100), ready: count === order.length };
}

/** 参数表：已知旋钮给中文名与可选值，未知的按键原样呈现。 */
export interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text' | 'select';
  value: string | number | boolean;
  options?: string[];
  hint?: string;
  source: 'skill' | 'engine';
}

const KNOWN_CONFIG: Record<string, { label: string; options?: string[]; hint?: string }> = {
  depth: { label: '分析深度', options: ['standard', 'deep'] },
  maxConcepts: { label: '概念数量上限', hint: '一次最多提炼多少个概念' },
  definitionMaxChars: { label: '定义字数上限' },
  blockTargetChars: { label: '块目标字数', hint: '讲稿切块时的平均长度' },
  questionRatioFloor: { label: '设问占比下限', hint: '低于这个比例说明讲稿偏陈述' },
  cognitiveLoadCap: { label: '认知负荷上限', hint: '核心概念标签数量上限' },
  fallback: { label: '模型不可用时回落本地' },
  preloadAll: { label: '全部预挂载' },
  dedupeByConcept: { label: '同概念去重' },
  mediaKind: { label: '介质类型', options: ['concept', 'case', 'qa', 'cheatsheet', 'slide', 'map'] },
  tone: { label: '语气' },
  showParent: { label: '显示上位类' },
  showMisconceptions: { label: '显示易混项' },
  showRecurrences: { label: '显示回指位置' },
  stages: { label: '案例分段数' },
  maxChars: { label: '单段字数上限' },
  style: { label: '写法风格' },
  answerFirst: { label: '答案先给结论' },
  maxAnswerChars: { label: '答案字数上限' },
  mode: { label: '呈现模式', options: ['auto', 'table', 'flashcard'] },
  maxRows: { label: '速查表行数' },
  slidesPerDeck: { label: '课件页张数' },
  maxBranches: { label: '导图分支数' },
  itemsPerBranch: { label: '每分支条目数' }
};

export function configLabel(key: string): string {
  return KNOWN_CONFIG[key]?.label ?? key;
}

export function configHint(key: string): string | undefined {
  return KNOWN_CONFIG[key]?.hint;
}

/** 参数候选来自绑定技能的默认旋钮，加上引擎自身的参数；技能默认值先给用户当起点。 */
export function configFields(draft: EngineDraft, skills: AgentSkill[]): ConfigField[] {
  const fields = new Map<string, ConfigField>();
  for (const skillId of draft.skillIds) {
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) continue;
    for (const [key, value] of Object.entries(skill.config)) {
      if (fields.has(key)) continue;
      const known = KNOWN_CONFIG[key];
      fields.set(key, {
        key,
        label: known?.label ?? key,
        type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : known?.options ? 'select' : 'text',
        value: draft.config[key] ?? value,
        options: known?.options,
        hint: known?.hint,
        source: 'skill'
      });
    }
  }
  for (const [key, value] of Object.entries(draft.config)) {
    if (fields.has(key)) continue;
    const known = KNOWN_CONFIG[key];
    fields.set(key, {
      key,
      label: known?.label ?? key,
      type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : known?.options ? 'select' : 'text',
      value,
      options: known?.options,
      hint: known?.hint,
      source: 'engine'
    });
  }
  return [...fields.values()];
}

/** 技能选择的候选：本阶段技能优先，其余技能收在「其他阶段」里。 */
export function skillCandidates(stage: ProductionStage, skills: AgentSkill[]) {
  return {
    same: skills.filter((skill) => skill.stage === stage),
    other: skills.filter((skill) => skill.stage !== stage)
  };
}
/** 绑定技能时，把技能自带的默认旋钮带进引擎参数；已改过的值不被覆盖。 */
export function mergeSkillDefaults(
  draft: EngineDraft,
  skills: AgentSkill[]
): EngineDraft {
  const config = { ...draft.config };
  for (const skillId of draft.skillIds) {
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) continue;
    for (const [key, value] of Object.entries(skill.config)) {
      if (config[key] === undefined) config[key] = value;
    }
  }
  return { ...draft, config };
}