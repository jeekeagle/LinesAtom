import type {
  ConceptEntry,
  Label,
  LectureBlock,
  LectureProject,
  MediaCase,
  MediaCheatsheet,
  MediaKind,
  MediaMap,
  MediaQa,
  MediaSlide
} from '../types';

export type SceneKind = MediaKind | 'section' | 'plain';

export interface SceneCaption {
  text: string;
  start: number;
  end: number;
  globalIndex: number;
}

export interface SceneMedia {
  kind: SceneKind;
  title: string;
  concept?: ConceptEntry;
  parentName?: string;
  children?: string[];
  recurrence?: boolean;
  caseItem?: MediaCase;
  qa?: MediaQa;
  cheatsheet?: MediaCheatsheet;
  slide?: MediaSlide;
  map?: MediaMap;
}

export interface Scene {
  index: number;
  blockId: string;
  order: number;
  label: Label;
  sectionId: string;
  sectionTitle: string;
  sectionIndex: number;
  start: number;
  end: number;
  lead: string;
  headline: string;
  media: SceneMedia | null;
  captions: SceneCaption[];
}

export interface ScoreSection {
  id: string;
  title: string;
  short: string;
  index: number;
  start: number;
  end: number;
}

export interface Score {
  scenes: Scene[];
  sections: ScoreSection[];
  total: number;
  title: string;
  subtitle: string;
  course: string;
}

/** 一句一段字幕：先按句末标点切，再把过短的段合并，过长的段按逗号切开。 */
export function splitCaptions(text: string, maxLength = 46): string[] {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const pieces: string[] = [];
  let buffer = '';
  for (const char of source) {
    buffer += char;
    if ('。！？；!?'.includes(char)) {
      pieces.push(buffer);
      buffer = '';
    }
  }
  if (buffer.trim()) pieces.push(buffer);

  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && Array.from(last).length + Array.from(piece).length <= maxLength) {
      merged[merged.length - 1] = `${last}${piece}`;
    } else {
      merged.push(piece);
    }
  }

  const split: string[] = [];
  for (const piece of merged) {
    if (Array.from(piece).length <= maxLength) {
      split.push(piece);
      continue;
    }
    let rest = piece;
    while (Array.from(rest).length > maxLength) {
      const head = rest.slice(0, maxLength);
      const cutAt = Math.max(head.lastIndexOf('，'), head.lastIndexOf(','), head.lastIndexOf('：'));
      const size = cutAt > maxLength * 0.5 ? cutAt + 1 : maxLength;
      split.push(rest.slice(0, size));
      rest = rest.slice(size);
    }
    if (rest) split.push(rest);
  }
  return split;
}

/** 自然语速 240 字/分钟（rate=1），句间留 0.25 秒呼吸。 */
export function captionDuration(text: string, rate = 1): number {
  const chars = Array.from(text.replace(/\s/g, '')).length;
  return Math.max(1.8, chars / (4 * Math.max(0.5, rate)) + 0.25);
}

function conceptPath(project: LectureProject, concept: ConceptEntry) {
  const chain: ConceptEntry[] = [concept];
  let guard = 0;
  let current = concept;
  while (current.parentId && guard < 8) {
    const parent = project.concepts.find((item) => item.id === current.parentId);
    if (!parent || parent.id === current.id) break;
    chain.unshift(parent);
    current = parent;
    guard += 1;
  }
  return chain;
}

function resolveConcept(
  project: LectureProject,
  concept: ConceptEntry,
  recurrence = false
): SceneMedia {
  const chain = conceptPath(project, concept);
  const parent = chain.length > 1 ? chain[chain.length - 2] : null;
  const children = project.concepts
    .filter((item) => item.parentId === concept.id)
    .map((item) => item.name);
  return {
    kind: 'concept',
    title: concept.name,
    concept,
    parentName: parent?.name,
    children,
    recurrence
  };
}

/** 素材流里的概念卡片与播放舞台用同一份解析结果。 */
export function makeConceptMedia(
  project: LectureProject,
  concept: ConceptEntry,
  recurrence = false
): SceneMedia {
  return resolveConcept(project, concept, recurrence);
}

function resolveByPointer(project: LectureProject, block: LectureBlock): SceneMedia | null {
  const pointer = project.pointers.find((item) => item.blockId === block.id);
  if (!pointer) return null;
  if (pointer.mediaType === 'concept') {
    const concept = project.concepts.find((item) => item.id === pointer.targetId);
    if (concept) return resolveConcept(project, concept, concept.anchorBlockId !== block.id);
  }
  if (pointer.mediaType === 'case') {
    const item = project.media.cases.find((entry) => entry.id === pointer.targetId);
    if (item) return { kind: 'case', title: item.title, caseItem: item };
  }
  if (pointer.mediaType === 'qa') {
    const item = project.media.qas.find((entry) => entry.id === pointer.targetId);
    if (item) return { kind: 'qa', title: item.title, qa: item };
  }
  if (pointer.mediaType === 'cheatsheet') {
    const item = project.media.cheatsheets.find((entry) => entry.id === pointer.targetId);
    if (item) return { kind: 'cheatsheet', title: item.title, cheatsheet: item };
  }
  if (pointer.mediaType === 'slide') {
    const item = project.media.slides.find((entry) => entry.id === pointer.targetId);
    if (item) return { kind: 'slide', title: item.title, slide: item };
  }
  if (pointer.mediaType === 'map') {
    const item = project.media.maps.find((entry) => entry.id === pointer.targetId);
    if (item) return { kind: 'map', title: item.title, map: item };
  }
  return null;
}

/** 指针优先；缺失时按标签兜底，保证播放画面不会出现空洞。 */
export function resolveSceneMedia(
  project: LectureProject,
  block: LectureBlock
): SceneMedia | null {
  const fromPointer = resolveByPointer(project, block);
  if (fromPointer) return fromPointer;

  const concept =
    project.concepts.find((item) => item.anchorBlockId === block.id) ??
    project.concepts.find((item) => item.recurrences?.includes(block.id));
  if (concept) return resolveConcept(project, concept, concept.anchorBlockId !== block.id);

  if (block.label === 'example') {
    const item = project.media.cases.find((entry) => entry.sourceBlockId === block.id);
    if (item) return { kind: 'case', title: item.title, caseItem: item };
  }
  if (block.label === 'question') {
    const item = project.media.qas.find((entry) => entry.sourceBlockId === block.id);
    if (item) return { kind: 'qa', title: item.title, qa: item };
  }
  if (block.label === 'conclusion') {
    const item = project.media.cheatsheets.find((entry) => entry.sourceBlockId === block.id);
    if (item) return { kind: 'cheatsheet', title: item.title, cheatsheet: item };
  }
  if (block.label === 'global') {
    const slide = project.media.slides.find((entry) => entry.sourceBlockId === block.id);
    if (slide) return { kind: 'slide', title: slide.title, slide };
    const map = project.media.maps.find((entry) => entry.sourceBlockId === block.id);
    if (map) return { kind: 'map', title: map.title, map };
  }
  return null;
}

export function buildScore(project: LectureProject, rate = 1): Score {
  const scenes: Scene[] = [];
  const sections: ScoreSection[] = [];
  let cursor = 0;
  let globalIndex = 0;

  project.sections.forEach((section, index) => {
    const blocks = project.blocks.filter((block) => block.sectionId === section.id);
    const start = cursor;
    blocks.forEach((block) => {
      const media = resolveSceneMedia(project, block);
      const parts = splitCaptions(block.text);
      const captions: SceneCaption[] = parts.map((text) => {
        const duration = captionDuration(text, rate);
        const caption: SceneCaption = {
          text,
          start: cursor,
          end: cursor + duration,
          globalIndex: globalIndex++
        };
        cursor = caption.end;
        return caption;
      });
      const scene: Scene = {
        index: scenes.length,
        blockId: block.id,
        order: block.order,
        label: block.label,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex: index,
        start: captions[0]?.start ?? cursor,
        end: cursor,
        lead: block.text,
        headline: media?.title ?? section.title,
        media,
        captions
      };
      scenes.push(scene);
    });
    sections.push({
      id: section.id,
      title: section.title,
      short: section.short,
      index,
      start,
      end: cursor
    });
  });

  // 未归入章节的块仍然要能播
  const known = new Set(scenes.map((scene) => scene.blockId));
  for (const block of project.blocks.filter((item) => !known.has(item.id))) {
    const parts = splitCaptions(block.text);
    const captions = parts.map((text) => {
      const caption: SceneCaption = {
        text,
        start: cursor,
        end: cursor + captionDuration(text, rate),
        globalIndex: globalIndex++
      };
      cursor = caption.end;
      return caption;
    });
    scenes.push({
      index: scenes.length,
      blockId: block.id,
      order: block.order,
      label: block.label,
      sectionId: block.sectionId,
      sectionTitle: '未分章',
      sectionIndex: sections.length,
      start: captions[0]?.start ?? cursor,
      end: cursor,
      lead: block.text,
      headline: block.text.slice(0, 24),
      media: resolveSceneMedia(project, block),
      captions
    });
  }

  scenes.sort((a, b) => a.start - b.start);
  scenes.forEach((scene, index) => (scene.index = index));

  return {
    scenes,
    sections,
    total: cursor,
    title: project.meta.title,
    subtitle: project.meta.subtitle,
    course: project.meta.course
  };
}

export function sceneAt(scenes: Scene[], time: number): Scene | null {
  if (!scenes.length) return null;
  for (const scene of scenes) {
    if (time >= scene.start && time < scene.end) return scene;
  }
  return time >= scenes[scenes.length - 1].end ? scenes[scenes.length - 1] : scenes[0];
}

export function captionAt(scene: Scene | null, time: number): SceneCaption | null {
  if (!scene) return null;
  for (const caption of scene.captions) {
    if (time >= caption.start && time < caption.end) return caption;
  }
  return scene.captions[scene.captions.length - 1] ?? null;
}

export const SCENE_LABEL: Record<Label, string> = {
  core: '核心概念',
  example: '理解性例子',
  question: '设问互动',
  transition: '过渡衔接',
  global: '全局定位',
  conclusion: '结论收束'
};

export const MEDIA_LABEL: Record<MediaKind | 'section' | 'plain', string> = {
  concept: '知识卡片',
  case: '案例',
  qa: '问答',
  cheatsheet: '速查表',
  slide: '课件页',
  map: '章节导图',
  section: '章节过渡',
  plain: '讲稿'
};
