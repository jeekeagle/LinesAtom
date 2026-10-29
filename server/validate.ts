import type {
  LectureProject,
  MediaKind,
  ValidationCheck,
  ValidationReport
} from '../src/types';
import { charCount } from './text';

const MEDIA_KEYS: Record<MediaKind, keyof LectureProject['media']> = {
  concept: 'cases',
  case: 'cases',
  qa: 'qas',
  cheatsheet: 'cheatsheets',
  slide: 'slides',
  map: 'maps'
};

export function validateProject(project: LectureProject): ValidationReport {
  const { blocks, concepts, pointers, media, meta } = project;
  const issues: string[] = [];

  const unlabeled = blocks.filter((block) => !block.label);
  const labelCheck: ValidationCheck = {
    id: 'label-completeness',
    title: '标注完整性',
    pass: unlabeled.length === 0,
    value: `${blocks.length - unlabeled.length}/${blocks.length} 块已标注`,
    detail: '每个讲稿块必须且只能有一个标签，标签与讲稿同批产出。',
    evidence: unlabeled.length ? `未标注块：${unlabeled.map((item) => item.id).join('、')}` : '无未标注块'
  };

  const questionCount = blocks.filter((block) => block.label === 'question').length;
  const questionRatio = blocks.length ? questionCount / blocks.length : 0;
  const questionCheck: ValidationCheck = {
    id: 'question-ratio',
    title: '标签分布合理',
    pass: questionRatio >= meta.questionRatioFloor,
    value: `设问互动 ${(questionRatio * 100).toFixed(1)}%`,
    detail: `设问互动类占比不低于 ${(meta.questionRatioFloor * 100).toFixed(0)}%，低于此值说明讲稿偏陈述，需改稿而非改标注。`,
    evidence: `${questionCount} / ${blocks.length} 块`
  };

  const anchorsWithCard = concepts.filter((concept) =>
    pointers.some(
      (pointer) =>
        pointer.mediaType === 'concept' &&
        pointer.targetId === concept.id &&
        pointer.blockId === concept.anchorBlockId
    )
  ).length;
  const conceptCheck: ValidationCheck = {
    id: 'concept-coverage',
    title: '概念卡覆盖',
    pass: anchorsWithCard === concepts.length,
    value: `${anchorsWithCard}/${concepts.length} 概念有卡片`,
    detail: '每个核心概念的首次出现处挂知识卡片，回指处不重复弹出。',
    evidence:
      anchorsWithCard === concepts.length
        ? '锚点与卡片一一对应'
        : `缺少卡片：${concepts
            .filter(
              (concept) =>
                !pointers.some(
                  (pointer) =>
                    pointer.mediaType === 'concept' &&
                    pointer.targetId === concept.id &&
                    pointer.blockId === concept.anchorBlockId
                )
            )
            .map((concept) => concept.name)
            .join('、')}`
  };

  const duplicatePointers = pointers.filter(
    (pointer, index) =>
      pointers.findIndex(
        (item) =>
          item.blockId === pointer.blockId &&
          item.mediaType === pointer.mediaType &&
          item.targetId === pointer.targetId
      ) !== index
  ).length;

  const brokenPointers = pointers.filter((pointer) => {
    if (pointer.mediaType === 'concept') {
      return !concepts.some((concept) => concept.id === pointer.targetId);
    }
    const key = MEDIA_KEYS[pointer.mediaType];
    const list = media[key] as { id: string }[];
    return !list.some((item) => item.id === pointer.targetId);
  });

  const orphanBlocks = pointers.filter(
    (pointer) => !blocks.some((block) => block.id === pointer.blockId)
  ).length;

  const jumpCheck: ValidationCheck = {
    id: 'jump-integrity',
    title: '跳转不丢位',
    pass: brokenPointers.length === 0 && orphanPointers(orphanBlocks) === 0 && duplicatePointers === 0,
    value: brokenPointers.length
      ? `${brokenPointers} 个挂载目标缺失`
      : `${pointers.length} 个挂载均可解析`,
    detail: '挂载指针只存目标编号，介质内容独立存放；打开后关闭回到讲稿原位置。',
    evidence: brokenPointers.length
      ? `失效目标：${brokenPointers.map((item) => item.targetId).join('、')}`
      : '指针与介质一一对应，无重复挂载'
  };

  const coreBlocks = blocks.filter((block) => block.label === 'core').length;
  const loadCheck: ValidationCheck = {
    id: 'cognitive-load',
    title: '认知负荷上限',
    pass: coreBlocks <= meta.cognitiveLoadCap,
    value: `${coreBlocks} 个核心概念`,
    detail: `核心概念标签数量不超过 ${meta.cognitiveLoadCap}，超出说明这一讲承载过多新术语。`,
    evidence: coreBlocks > meta.cognitiveLoadCap ? '超出上限，建议拆讲' : '在上限之内'
  };

  const chars = blocks.reduce((sum, block) => sum + charCount(block.text), 0);
  const estimatedMinutes = Math.round((chars / Math.max(1, meta.charsPerMinute)) * 10) / 10;
  const durationCheck: ValidationCheck = {
    id: 'duration-fit',
    title: '时长倒推',
    pass: Math.abs(estimatedMinutes - meta.durationMinutes) / Math.max(1, meta.durationMinutes) <= 0.25,
    value: `${estimatedMinutes} 分钟 / 目标 ${meta.durationMinutes} 分钟`,
    detail: `按 ${meta.charsPerMinute} 字每分钟倒推，正文时长与目标时长的偏差不超过 25%。`,
    evidence: `${chars} 字`
  };

  const orphanConcepts = concepts.filter(
    (concept) => !concept.anchorBlockId || !blocks.some((block) => block.id === concept.anchorBlockId)
  ).length;

  if (unlabeled.length) issues.push(`存在 ${unlabeled.length} 个未标注块。`);
  if (!questionCheck.pass) issues.push('设问互动占比偏低，需要改稿而不是改标注。');
  if (!conceptCheck.pass) issues.push('部分核心概念没有卡片覆盖。');
  if (coreBlocks > meta.cognitiveLoadCap) issues.push('核心概念数量超出认知负荷上限。');
  if (orphanConcepts) issues.push(`存在 ${orphanConcepts} 个没有锚点的孤立概念。`);

  return {
    checks: [labelCheck, questionCheck, conceptCheck, jumpCheck, loadCheck, durationCheck],
    metrics: {
      blocks: blocks.length,
      concepts: concepts.length,
      pointers: pointers.length,
      coreBlocks,
      questionRatio: Math.round(questionRatio * 1000) / 1000,
      unlabeled: unlabeled.length,
      anchorsWithCard,
      duplicatePointers,
      orphanConcepts,
      chars,
      estimatedMinutes,
      mediaCount:
        media.cases.length +
        media.qas.length +
        media.cheatsheets.length +
        media.slides.length +
        media.maps.length
    },
    issues
  };
}

const orphanPointers = (count: number) => count;