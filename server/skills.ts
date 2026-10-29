import type { AgentSkill, RuntimeSettings } from '../src/types';
import { callModel, ModelUnavailableError, parseJsonLoose } from './llm';

const BUILT_AT = '2026-10-29T00:00:00.000Z';

const skill = (
  id: string,
  name: string,
  stage: AgentSkill['stage'],
  kind: AgentSkill['kind'],
  description: string,
  prompt: string,
  schema: string,
  config: Record<string, string | number | boolean> = {}
): AgentSkill => ({
  id,
  name,
  stage,
  kind,
  description,
  prompt,
  schema,
  config,
  enabled: true,
  builtIn: true,
  version: '1.0.0',
  runs: 0,
  lastRun: '尚未运行',
  createdAt: BUILT_AT,
  updatedAt: BUILT_AT
});

export const DEFAULT_SKILLS: AgentSkill[] = [
  skill(
    'concept-extract',
    '概念提取',
    'analysis',
    'analysis',
    '从讲稿素材中提炼概念条目：定义、上位类、同层差异、易混项。',
    '你是知识结构分析师。从下面这段讲稿素材中提炼可复用的概念条目，每个条目给出：名称、40 字以内的一句话定义、上位类、与最相近概念的区别、1 到 3 条常见误解。名称必须是讲稿中真实出现的术语。',
    '{"concepts":[{"name":"","definition":"","parent":"","difference":"","misconceptions":[""]}]}',
    { maxConcepts: 14, definitionMaxChars: 40 }
  ),
  skill(
    'block-label',
    '块标注',
    'analysis',
    'analysis',
    '按“删掉这一块会发生什么”的同一方法判定六类标签。',
    '你是讲稿标注员。对每个讲稿块判定且只判定一个标签：核心概念、理解性例子、设问互动、过渡衔接、全局定位、结论收束。判定依据只有一条：删掉这一块，后文某个术语失去来源=核心概念；概念仍成立但理解变难=理解性例子；该段由互动转为陈述=设问互动；前后出现跳跃=过渡衔接；听众失去位置判断=全局定位；该段没有落点=结论收束。',
    '{"blocks":[{"id":"","label":"core|example|question|transition|global|conclusion","evidence":""}]}',
    { questionRatioFloor: 0.08, cognitiveLoadCap: 14 }
  ),
  skill(
    'concept-card',
    '概念卡',
    'media',
    'media',
    '把概念条目渲染为可展开的知识卡：定义、差异、易混项、回指位置。',
    '你是知识卡编辑。卡片内容只来自概念条目本身，不要另起炉灶写新的定义。给出卡片的眉题、一句话定义、与同层概念的差异、易混项与回指提示。',
    '{"eyebrow":"","lead":"","misconceptions":[""]}',
    { tone: '克制', showParent: true, showMisconceptions: true, showRecurrences: true }
  ),
  skill(
    'case-study',
    '案例条目',
    'media',
    'media',
    '把理解性例子整理为背景、做法、结果三段。',
    '你是案例编辑。案例必须来自讲稿原句，不虚构数据。按背景、做法、结果三段写清一件事如何发生、卡在哪里、结果是什么。',
    '{"title":"","eyebrow":"","background":"","action":"","result":""}',
    { stages: 3, maxChars: 90, style: '事实优先' }
  ),
  skill(
    'qa-pair',
    '问答条目',
    'media',
    'media',
    '把设问块整理为真实疑问与先给结论的答案。',
    '你是问答编辑。问题取自讲稿中的真实疑问，答案第一句必须先给结论，再给理由。不要把答案写成讲稿复述。',
    '{"title":"","question":"","answer":""}',
    { answerFirst: true, maxAnswerChars: 160 }
  ),
  skill(
    'cheat-sheet',
    '速查表',
    'media',
    'media',
    '把结论块整理为可扫读的速查表，或内容性质更适合时转成闪卡。',
    '你是速查表编辑。把结论块压成一张能扫读的表：列名稳定、每行一个要点、末行给出适用边界。若内容更适合逐条自测，转成闪卡模式。',
    '{"title":"","intro":"","columns":["",""],"rows":[["",""]],"note":"","mode":"table|flashcard"}',
    { mode: 'auto', maxRows: 6 }
  ),
  skill(
    'slide-deck',
    '课件页',
    'media',
    'media',
    '把全局定位块整理为一页可讲的课件页：三段式画面任务。',
    '你是课件编辑。把一段全局定位整理为一页课件：一句主张、三段递进的画面任务，每段给出标题、正文与一个标记词。',
    '{"title":"","eyebrow":"","lead":"","slides":[{"kicker":"","title":"","body":"","marker":""}]}',
    { slidesPerDeck: 3, tone: '克制' }
  ),
  skill(
    'chapter-map',
    '章节导图',
    'media',
    'media',
    '把章节位置整理为一张导图：根节点、三条分支、落点提示。',
    '你是导图编辑。把一个章节的全局定位整理为导图：一个根节点，三条分支（问题、机制、落点），每个分支三到四个条目。',
    '{"title":"","eyebrow":"","root":"","branches":[{"title":"","items":[""]}],"note":""}',
    { maxBranches: 3, itemsPerBranch: 4 }
  ),
  skill(
    'mount-planner',
    '挂载编排',
    'mount',
    'structure',
    '按标签与挂载规则一一对应地生成挂载指针，并处理回指。',
    '你是挂载编排器。核心概念挂概念卡，理解性例子挂案例，设问互动挂问答，结论收束挂速查表，全局定位挂课件页或章节导图，过渡衔接不挂载。同一概念的后续出现处只标回指，不重复挂载。',
    '{"pointers":[{"blockId":"","mediaType":"concept|case|qa|cheatsheet|slide|map","targetId":"","trigger":"preload|entry"}]}',
    { preloadAll: true, dedupeByConcept: true }
  ),
  skill(
    'mount-advisor',
    '挂载顾问',
    'mount',
    'structure',
    '讲稿定稿后逐行给出挂载建议：挂什么、挂到哪里、为什么，可一键确认或修改。',
    '你是挂载顾问。逐行阅读讲稿块，判断每一行最需要哪一种学习介质（概念卡、案例、问答、速查表、课件页、导图），并说明挂载对象与理由。已经挂好介质的行保持不动，不要重复建议。',
    '{"suggestions":[{"blockId":"","mediaType":"concept|case|qa|cheatsheet|slide|map","target":"","rationale":"","confidence":0.8}]}',
    { useModel: false, confidenceFloor: 0.6 }
  ),
  skill(
    'validation',
    '验收分析',
    'quality',
    'quality',
    '按首版四项验收标准检查讲稿：标注完整性、标签分布、概念卡覆盖、跳转不丢位。',
    '你是验收分析员。逐项检查：是否有未标注块；设问互动占比是否不低于 8%；每个核心概念首次出现处是否有卡片；打开挂载内容后关闭能否回到原位置。只报告事实与证据。',
    '{"checks":[{"id":"","title":"","pass":true,"value":"","detail":"","evidence":""}]}',
    { questionRatioFloor: 0.08, durationTolerance: 0.25 }
  )
];

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

export function normalizeSkills(input: unknown): AgentSkill[] {
  const existing = Array.isArray(input) ? (input as AgentSkill[]) : [];
  const byId = new Map<string, AgentSkill>();
  for (const item of existing) {
    if (!item || typeof item !== 'object' || !safeString(item.id)) continue;
    byId.set(item.id, {
      id: safeString(item.id),
      name: safeString(item.name, '未命名技能'),
      stage: (['analysis', 'script', 'mount', 'media', 'quality'] as const).includes(item.stage)
        ? item.stage
        : 'analysis',
      kind: (['analysis', 'text', 'structure', 'media', 'quality'] as const).includes(item.kind)
        ? item.kind
        : 'text',
      description: safeString(item.description),
      prompt: safeString(item.prompt),
      schema: safeString(item.schema),
      config: safeConfig(item.config),
      enabled: item.enabled !== false,
      builtIn: Boolean(item.builtIn),
      version: safeString(item.version, '1.0.0'),
      runs: Number.isFinite(Number(item.runs)) ? Number(item.runs) : 0,
      lastRun: safeString(item.lastRun, '尚未运行'),
      createdAt: safeString(item.createdAt, BUILT_AT),
      updatedAt: safeString(item.updatedAt, BUILT_AT)
    });
  }
  for (const fallback of DEFAULT_SKILLS) {
    if (!byId.has(fallback.id)) byId.set(fallback.id, { ...fallback, config: { ...fallback.config } });
  }
  return [...byId.values()];
}

export function buildSkillMessages(skill: AgentSkill, input: string, context = '') {
  return [
    {
      role: 'system' as const,
      content: `${skill.prompt}\n只输出 JSON，不要 Markdown，不要解释。输出结构：\n${skill.schema}`
    },
    {
      role: 'user' as const,
      content: `${context ? `${context}\n\n` : ''}输入：\n${input}`
    }
  ];
}

export interface SkillRunOutput {
  skillId: string;
  parsed: unknown;
  provider: string;
  model: string;
  durationMs: number;
  fallback: boolean;
  warning?: string;
}

/** 调用模型执行技能；模型不可用时由调用方回落到本地确定性实现。 */
export async function runSkillWithModel(
  skill: AgentSkill,
  input: string,
  settings: RuntimeSettings,
  context = ''
): Promise<SkillRunOutput> {
  const startedAt = Date.now();
  try {
    const response = await callModel(settings, {
      messages: buildSkillMessages(skill, input, context),
      json: true,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens
    });
    return {
      skillId: skill.id,
      parsed: parseJsonLoose(response.text),
      provider: response.provider,
      model: response.model,
      durationMs: Date.now() - startedAt,
      fallback: false
    };
  } catch (error) {
    if (error instanceof ModelUnavailableError) {
      return {
        skillId: skill.id,
        parsed: null,
        provider: 'local-deterministic',
        model: 'local',
        durationMs: Date.now() - startedAt,
        fallback: true,
        warning: error.message
      };
    }
    throw error;
  }
}