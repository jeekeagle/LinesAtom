import type {
  AgentSkill,
  ConceptEntry,
  Label,
  LectureBlock,
  LectureMode,
  LectureProject,
  LectureSection,
  MediaKind,
  MountPointer,
  RuntimeSettings,
  TraceStep
} from '../src/types';
import { MOUNT_RULES, PIPELINE_STEPS } from './constants';
import {
  buildCase,
  buildCheatsheet,
  buildMap,
  buildQa,
  buildSlide,
  emptyMediaStore,
  type MediaContext
} from './media';
import {
  charCount,
  clampText,
  extractCandidates,
  isConclusion,
  isExample,
  isGlobal,
  isQuestion,
  isTransition,
  parseSections,
  parseSkeleton,
  type ParsedSection
} from './text';

export interface LectureRunInput {
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

export interface PipelineResult {
  project: LectureProject;
  trace: TraceStep[];
  warnings: string[];
  durationMs: number;
}

const skillOf = (skills: AgentSkill[], id: string) => skills.find((item) => item.id === id);
const skillEnabled = (skills: AgentSkill[], id: string) =>
  Boolean(skillOf(skills, id)?.enabled);

function mkTrace(id: string, label: string, state: TraceStep['state'], detail: string, durationMs = 0): TraceStep {
  return { id, label, state, detail, durationMs };
}

function segmentBlocks(sections: ParsedSection[], targetChars: number): LectureBlock[] {
  const blocks: LectureBlock[] = [];
  let index = 0;
  for (const section of sections) {
    let buffer = '';
    let bufferSentences = 0;
    const flush = () => {
      const text = buffer.trim();
      if (!text) return;
      index += 1;
      blocks.push({
        id: `b${String(index).padStart(2, '0')}`,
        order: index,
        sectionId: section.id,
        text,
        label: 'transition',
        labelEvidence: ''
      });
      buffer = '';
      bufferSentences = 0;
    };
    for (const sentence of section.sentences) {
      const length = charCount(sentence);
      if (buffer && charCount(buffer) + length > Math.max(targetChars * 1.6, targetChars + 60)) {
        flush();
      }
      buffer += sentence;
      bufferSentences += 1;
      if (charCount(buffer) >= targetChars && bufferSentences >= 2) flush();
    }
    flush();
  }
  return blocks;
}

interface ConceptDraft {
  name: string;
  definition: string;
  parentName: string | null;
  difference: string;
  misconceptions: string[];
  source: 'skeleton' | 'material';
  anchorText: string;
}

function buildConceptDrafts(
  sections: ParsedSection[],
  skeletonRaw: string,
  cap: number
): ConceptDraft[] {
  const sentences = sections.flatMap((item) => item.sentences);
  const drafts = new Map<string, ConceptDraft>();

  for (const item of parseSkeleton(skeletonRaw)) {
    drafts.set(item.name, {
      name: item.name,
      definition: clampText(item.definition, 40),
      parentName: item.parent || null,
      difference: '',
      misconceptions: [],
      source: 'skeleton',
      anchorText: item.name
    });
  }

  for (const candidate of extractCandidates(sentences)) {
    if (drafts.has(candidate.name)) continue;
    const differenceSentence = sentences.find(
      (sentence) =>
        sentence.includes(candidate.name) &&
        /(区别|不同|不同于|关键在于|不是.+而是|边界)/.test(sentence)
    );
    const misconceptionSentence = sentences.find(
      (sentence) =>
        sentence.includes(candidate.name) &&
        /(误解|误以为|常被|容易|不等于|不是|混淆)/.test(sentence)
    );
    drafts.set(candidate.name, {
      name: candidate.name,
      definition: candidate.definition,
      parentName: null,
      difference: differenceSentence ? clampText(differenceSentence, 60) : '',
      misconceptions: misconceptionSentence
        ? [clampText(misconceptionSentence.replace(/[。！？!?]$/, ''), 46)]
        : [],
      source: 'material',
      anchorText: candidate.sentence
    });
  }

  const ordered = [...drafts.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'skeleton' ? -1 : 1;
    return 0;
  });

  const kept = ordered.slice(0, Math.max(1, cap));
  const dropped = ordered.slice(Math.max(1, cap));

  const names = new Set(kept.map((item) => item.name));
  for (const draft of kept) {
    if (draft.difference) continue;
    const parent = draft.parentName && names.has(draft.parentName) ? draft.parentName : null;
    draft.difference = parent
      ? `与「${parent}」同层，区别在于它处理的对象与落点不同。`
      : '同层差异未在素材中给出，按本讲定义理解。';
    if (!draft.misconceptions.length) {
      draft.misconceptions = [
        parent ? `容易与「${parent}」混为一谈。` : `容易把「${draft.name}」当成口号而不是判定依据。`
      ];
    }
  }

  return kept.map((draft) => draft).concat(dropped.map((draft) => ({ ...draft, source: draft.source })));
}

function resolveParents(drafts: ConceptDraft[]): ConceptEntry[] {
  const concepts: ConceptEntry[] = [];
  drafts.forEach((draft, index) => {
    let parentId: string | null = null;
    if (draft.parentName && drafts.some((item) => item.name === draft.parentName) && draft.parentName !== draft.name) {
      const parentIndex = drafts.findIndex((item) => item.name === draft.parentName);
      parentId = `c${String(parentIndex + 1).padStart(2, '0')}`;
    } else {
      const earlier = drafts.slice(0, index).reverse().find((item) => item.name !== draft.name);
      if (earlier) {
        const earlierIndex = drafts.findIndex((item) => item.name === earlier.name);
        parentId = `c${String(earlierIndex + 1).padStart(2, '0')}`;
      }
    }
    concepts.push({
      id: `c${String(index + 1).padStart(2, '0')}`,
      name: draft.name,
      definition: draft.definition,
      parentId,
      difference: draft.difference,
      misconceptions: draft.misconceptions.length ? draft.misconceptions : [],
      anchorBlockId: '',
      recurrences: []
    });
  });
  return concepts;
}

function assignAnchors(concepts: ConceptEntry[], blocks: LectureBlock[], drafts: ConceptDraft[]) {
  const usedBlocks = new Set<string>();
  concepts.forEach((concept, index) => {
    const draft = drafts[index];
    const anchorText = draft?.anchorText ?? concept.name;
    const exact = blocks.find((block) => block.text.includes(anchorText));
    const byName = blocks.find((block) => block.text.includes(concept.name));
    const anchor = exact ?? byName;
    if (anchor && !usedBlocks.has(anchor.id)) {
      concept.anchorBlockId = anchor.id;
      usedBlocks.add(anchor.id);
    }
  });
  concepts.forEach((concept) => {
    const anchorIndex = blocks.findIndex((block) => block.id === concept.anchorBlockId);
    concept.recurrences = blocks
      .slice(anchorIndex + 1)
      .filter((block) => block.text.includes(concept.name))
      .map((block) => block.id);
  });
}

function labelBlocks(blocks: LectureBlock[], concepts: ConceptEntry[]) {
  const anchorMap = new Map(concepts.map((concept) => [concept.anchorBlockId, concept]));
  blocks.forEach((block, index) => {
    const sectionBlocks = blocks.filter((item) => item.sectionId === block.sectionId);
    const isFirst = sectionBlocks[0]?.id === block.id;
    const isLast = sectionBlocks[sectionBlocks.length - 1]?.id === block.id;
    const anchor = anchorMap.get(block.id);
    const text = block.text;

    if (anchor) {
      block.label = 'core';
      block.labelEvidence = `删掉后，术语「${anchor.name}」失去来源。`;
      return;
    }
    if (isQuestion(text)) {
      block.label = 'question';
      block.labelEvidence = '删掉后，该段由互动转为陈述。';
      return;
    }
    if (isConclusion(text, isLast)) {
      block.label = 'conclusion';
      block.labelEvidence = '删掉后，该段没有落点。';
      return;
    }
    if (isGlobal(text, isFirst)) {
      block.label = 'global';
      block.labelEvidence = '删掉后，听众失去当前所处位置的判断。';
      return;
    }
    if (isExample(text)) {
      block.label = 'example';
      block.labelEvidence = '删掉后概念仍成立，理解难度上升。';
      return;
    }
    if (isTransition(text)) {
      block.label = 'transition';
      block.labelEvidence = '删掉后，前后段之间出现跳跃。';
      return;
    }
    const mentioned = concepts.find((concept) => concept.name && text.includes(concept.name));
    if (mentioned) {
      block.label = 'example';
      block.labelEvidence = `回指「${mentioned.name}」，删掉后概念仍成立，理解难度上升。`;
      return;
    }
    block.label = 'transition';
    block.labelEvidence = '默认按衔接处理，建议人工复核。';
  });
}

export async function runLecturePipeline(
  input: LectureRunInput,
  skills: AgentSkill[],
  settings: RuntimeSettings
): Promise<PipelineResult> {
  const trace: TraceStep[] = [];
  const warnings: string[] = [];
  const started = Date.now();

  // 01 内容基座构建
  const baseStart = Date.now();
  const sections = parseSections(input.material, input.topic);
  if (!sections.length) throw new Error('素材为空，无法构建内容基座。');
  const cap = Math.max(1, input.cognitiveLoadCap);
  const drafts = buildConceptDrafts(sections, input.skeleton ?? '', cap);
  let concepts = resolveParents(drafts);
  if (!concepts.length) {
    concepts = [
      {
        id: 'c01',
        name: input.topic || '本讲主题',
        definition: clampText(`围绕${input.topic || '本讲主题'}建立判定依据。`, 40),
        parentId: null,
        difference: '素材中未给出同层差异，按本讲定义理解。',
        misconceptions: [`容易把「${input.topic || '本讲主题'}」当成口号而不是判定依据。`],
        anchorBlockId: '',
        recurrences: []
      }
    ];
    warnings.push('素材中没有提取到概念条目，已用主题占位。');
  }
  if (drafts.length > cap) {
    warnings.push(`概念数量 ${drafts.length} 超过认知负荷上限 ${cap}，已按骨架优先级保留前 ${cap} 个。`);
  }
  trace.push(mkTrace('base', '内容基座构建', 'done', `${sections.length} 章 · ${concepts.length} 概念`, Date.now() - baseStart));

  // 02 讲稿切分
  const segmentStart = Date.now();
  const blocks = segmentBlocks(sections, Math.max(60, input.blockTargetChars));
  if (!blocks.length) throw new Error('讲稿切分结果为空。');
  trace.push(mkTrace('segment', '讲稿切分', 'done', `${blocks.length} 块`, Date.now() - segmentStart));

  // 03 同步标注
  const labelStart = Date.now();
  assignAnchors(concepts, blocks, drafts);
  const anchored = concepts.filter((concept) => concept.anchorBlockId);
  concepts = anchored.length ? anchored : concepts.slice(0, 1);
  concepts.forEach((concept, index) => {
    concept.id = `c${String(index + 1).padStart(2, '0')}`;
  });
  const parentFix = new Map(concepts.map((concept) => [concept.name, concept.parentId]));
  concepts.forEach((concept) => {
    const parentName = concepts.find((item) => item.id === concept.parentId)?.name;
    concept.parentId = parentName ? concept.parentId : null;
    void parentFix;
  });
  labelBlocks(blocks, concepts);
  const coreCount = blocks.filter((block) => block.label === 'core').length;
  if (coreCount > cap) {
    warnings.push(`核心概念标签 ${coreCount} 个，超过认知负荷上限 ${cap}。`);
  }
  const questionCount = blocks.filter((block) => block.label === 'question').length;
  const questionRatio = blocks.length ? questionCount / blocks.length : 0;
  if (questionRatio < input.questionRatioFloor) {
    warnings.push(
      `设问互动占比 ${(questionRatio * 100).toFixed(1)}%，低于 ${(input.questionRatioFloor * 100).toFixed(0)}%，需要改稿而不是改标注。`
    );
  }
  trace.push(
    mkTrace('label', '同步标注', 'done', `${coreCount} 核心 · ${questionCount} 设问`, Date.now() - labelStart)
  );

  // 04 介质生成
  const mediaStart = Date.now();
  const media = emptyMediaStore();
  const pointers: MountPointer[] = [];
  let pointerIndex = 0;
  const mediaContext: MediaContext = {
    sections,
    blocks,
    concepts,
    generatedBy: 'media-engine@1.0.0'
  };

  blocks.forEach((block) => {
    const rule = MOUNT_RULES[block.label];
    if (!rule) return;
    const concept = concepts.find((item) => item.anchorBlockId === block.id);
    if (block.label === 'core') {
      if (!concept) return;
      if (!skillEnabled(skills, 'concept-card')) {
        warnings.push('概念卡技能已关闭，核心概念处没有挂载卡片。');
        return;
      }
      pointerIndex += 1;
      pointers.push({
        id: `p${String(pointerIndex).padStart(2, '0')}`,
        blockId: block.id,
        mediaType: 'concept',
        targetId: concept.id,
        trigger: 'preload'
      });
      return;
    }
    if (block.label === 'example') {
      if (!skillEnabled(skills, 'case-study')) {
        warnings.push('案例技能已关闭，理解性例子处没有挂载案例。');
        return;
      }
      const item = buildCase(block, mediaContext, skillOf(skills, 'case-study')?.config ?? {});
      media.cases.push(item);
      pointerIndex += 1;
      pointers.push({
        id: `p${String(pointerIndex).padStart(2, '0')}`,
        blockId: block.id,
        mediaType: 'case',
        targetId: item.id,
        trigger: 'preload'
      });
      return;
    }
    if (block.label === 'question') {
      if (!skillEnabled(skills, 'qa-pair')) {
        warnings.push('问答技能已关闭，设问互动处没有挂载问答。');
        return;
      }
      const item = buildQa(block, mediaContext, skillOf(skills, 'qa-pair')?.config ?? {});
      media.qas.push(item);
      pointerIndex += 1;
      pointers.push({
        id: `p${String(pointerIndex).padStart(2, '0')}`,
        blockId: block.id,
        mediaType: 'qa',
        targetId: item.id,
        trigger: 'preload'
      });
      return;
    }
    if (block.label === 'conclusion') {
      if (!skillEnabled(skills, 'cheat-sheet')) {
        warnings.push('速查表技能已关闭，结论收束处没有挂载介质。');
        return;
      }
      const item = buildCheatsheet(block, mediaContext, skillOf(skills, 'cheat-sheet')?.config ?? {});
      media.cheatsheets.push(item);
      pointerIndex += 1;
      pointers.push({
        id: `p${String(pointerIndex).padStart(2, '0')}`,
        blockId: block.id,
        mediaType: 'cheatsheet',
        targetId: item.id,
        trigger: 'preload'
      });
      return;
    }
    if (block.label === 'global') {
      const sectionBlocks = blocks.filter((item) => item.sectionId === block.sectionId);
      const isSectionHead = sectionBlocks[0]?.id === block.id;
      const wantMap = isSectionHead && skillEnabled(skills, 'chapter-map');
      const wantSlide = !wantMap && skillEnabled(skills, 'slide-deck');
      if (!wantMap && !wantSlide) {
        warnings.push('课件页与章节导图技能都已关闭，全局定位处没有挂载介质。');
        return;
      }
      if (wantMap) {
        const item = buildMap(
          block,
          mediaContext,
          concepts
            .filter((concept) => {
              const anchor = blocks.find((entry) => entry.id === concept.anchorBlockId);
              return anchor?.sectionId === block.sectionId;
            })
            .map((concept) => concept.id)
        );
        media.maps.push(item);
        pointerIndex += 1;
        pointers.push({
          id: `p${String(pointerIndex).padStart(2, '0')}`,
          blockId: block.id,
          mediaType: 'map',
          targetId: item.id,
          trigger: 'preload'
        });
      } else {
        const item = buildSlide(block, mediaContext);
        media.slides.push(item);
        pointerIndex += 1;
        pointers.push({
          id: `p${String(pointerIndex).padStart(2, '0')}`,
          blockId: block.id,
          mediaType: 'slide',
          targetId: item.id,
          trigger: 'preload'
        });
      }
    }
  });

  const seenPointers = new Set<string>();
  const uniquePointers: MountPointer[] = [];
  for (const pointer of pointers) {
    const key = `${pointer.blockId}:${pointer.mediaType}:${pointer.targetId}`;
    if (seenPointers.has(key)) continue;
    seenPointers.add(key);
    uniquePointers.push(pointer);
  }
  trace.push(
    mkTrace(
      'media',
      '介质生成',
      'done',
      `${media.cases.length} 案例 · ${media.qas.length} 问答 · ${media.cheatsheets.length} 速查表`,
      Date.now() - mediaStart
    )
  );

  // 05 挂载编排
  const mountStart = Date.now();
  trace.push(mkTrace('mount', '挂载编排', 'done', `${uniquePointers.length} 挂载`, Date.now() - mountStart));

  // 06 呈现渲染
  const renderStart = Date.now();
  const now = new Date().toISOString();
  const project: LectureProject = {
    id: 'lecture-current',
    name: input.title || input.topic || '未命名讲稿',
    topic: input.topic,
    meta: {
      product: '讲义轴',
      course: input.course || '结构化讲稿',
      title: input.title || input.topic || '未命名讲稿',
      subtitle:
        input.subtitle ||
        clampText(sections[0]?.sentences[0] ?? '一份讲稿，一条确定性时间轴。', 40),
      durationMinutes: input.durationMinutes,
      charsPerMinute: input.charsPerMinute,
      cognitiveLoadCap: input.cognitiveLoadCap,
      questionRatioFloor: input.questionRatioFloor,
      version: '0.1.0',
      schemaVersion: '1.0',
      revision: 1,
      generatedAt: now,
      source: 'engine',
      engineRunId: ''
    },
    sections: sections.map((section) => ({
      id: section.id,
      order: section.order,
      title: section.title,
      short: section.short
    })),
    blocks,
    concepts,
    pointers: uniquePointers,
    suggestions: [],
    media,
    engineSnapshot: {
      status: 'ready',
      provider: 'local-deterministic',
      runId: '',
      pipeline: PIPELINE_STEPS.map((item) => ({ ...item, state: 'completed', count: 0 })),
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        stage: skill.stage,
        enabled: skill.enabled,
        version: skill.version
      }))
    },
    createdAt: now,
    updatedAt: now
  };
  trace.push(mkTrace('render', '呈现渲染', 'done', `${blocks.length} 块 · ${uniquePointers.length} 挂载`, Date.now() - renderStart));

  return { project, trace, warnings, durationMs: Date.now() - started };
}

export const labelCounts = (blocks: LectureBlock[]) =>
  blocks.reduce<Record<string, number>>((acc, block) => {
    acc[block.label] = (acc[block.label] ?? 0) + 1;
    return acc;
  }, {});

export const mediaKindOfLabel = (label: Label): MediaKind | null => MOUNT_RULES[label];