import type {
  EngineKind,
  Label,
  LectureMode,
  MediaKind,
  ProductionStage
} from '../src/types';

export const APP_VERSION = '1.0.0';
export const DEFAULT_PORT = 8790;

export const LABEL_TEXT: Record<Label, string> = {
  core: '核心概念',
  example: '理解性例子',
  question: '设问互动',
  transition: '过渡衔接',
  global: '全局定位',
  conclusion: '结论收束'
};

/** 标签决定挂载类型，一一对应，不做多对多。 */
export const MOUNT_RULES: Record<Label, MediaKind | null> = {
  core: 'concept',
  example: 'case',
  question: 'qa',
  conclusion: 'cheatsheet',
  global: 'slide',
  transition: null
};

export const MEDIA_TEXT: Record<MediaKind, string> = {
  concept: '概念卡',
  case: '案例',
  qa: '问答',
  cheatsheet: '速查表',
  slide: '课件页',
  map: '导图'
};

export const MODE_TEXT: Record<LectureMode, string> = {
  script: '讲稿驱动',
  material: '素材驱动',
  skeleton: '骨架驱动'
};

export const STAGE_TEXT: Record<ProductionStage, string> = {
  analysis: '析课',
  script: '讲稿',
  mount: '挂载',
  media: '介质',
  quality: '验收'
};

export const ENGINE_KIND_TEXT: Record<EngineKind, string> = {
  analysis: '分析',
  text: '文本',
  structure: '结构',
  media: '介质',
  quality: '质量'
};

/** 标签判定说明：删掉这一块，会发生什么。 */
export const LABEL_CRITERIA: Record<Label, string> = {
  core: '删掉后，后文某个术语失去来源。',
  example: '删掉后概念仍成立，理解难度上升。',
  question: '删掉后，该段由互动转为陈述。',
  transition: '删掉后，前后段之间出现跳跃。',
  global: '删掉后，听众失去当前所处位置的判断。',
  conclusion: '删掉后，该段没有落点。'
};

export const PIPELINE_STEPS = [
  { id: 'base', name: '内容基座构建' },
  { id: 'segment', name: '讲稿切分' },
  { id: 'label', name: '同步标注' },
  { id: 'media', name: '介质生成' },
  { id: 'mount', name: '挂载编排' },
  { id: 'validate', name: '验收分析' }
] as const;
