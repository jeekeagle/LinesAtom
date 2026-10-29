import type {
  ConceptEntry,
  LectureBlock,
  LectureSection,
  MediaCase,
  MediaCheatsheet,
  MediaMap,
  MediaQa,
  MediaSlide,
  MediaStore
} from '../src/types';
import { clampText, shortTitle, splitSentences } from './text';

export interface MediaContext {
  sections: LectureSection[];
  blocks: LectureBlock[];
  concepts: ConceptEntry[];
  generatedBy: string;
}

export const emptyMediaStore = (): MediaStore => ({
  cases: [],
  qas: [],
  cheatsheets: [],
  slides: [],
  maps: []
});

function sectionOf(sections: LectureSection[], sectionId: string) {
  return sections.find((item) => item.id === sectionId);
}

export function buildCase(
  block: LectureBlock,
  ctx: MediaContext,
  config: Record<string, string | number | boolean>
): MediaCase {
  const sentences = splitSentences(block.text);
  const section = sectionOf(ctx.sections, block.sectionId);
  const maxChars = Number(config.maxChars) || 90;
  const background = sentences[0] ?? block.text;
  const action = sentences.length >= 3 ? sentences[1] : sentences[0] ?? block.text;
  const result = sentences[sentences.length - 1] ?? block.text;
  return {
    id: `case-${block.id}`,
    title: clampText(background.replace(/[。！？!?]/g, ''), 16),
    eyebrow: section?.short ?? '案例',
    background: clampText(background, maxChars),
    action: clampText(action, maxChars),
    result: clampText(result, maxChars),
    sourceBlockId: block.id,
    generatedBy: ctx.generatedBy
  };
}

export function buildQa(
  block: LectureBlock,
  ctx: MediaContext,
  config: Record<string, string | number | boolean>
): MediaQa {
  const question = block.text.trim();
  const anchorIndex = ctx.blocks.findIndex((item) => item.id === block.id);
  const anchorConcept = [...ctx.concepts]
    .reverse()
    .find(
      (concept) =>
        ctx.blocks.findIndex((item) => item.id === concept.anchorBlockId) < anchorIndex &&
        ctx.blocks.findIndex((item) => item.id === concept.anchorBlockId) >= 0
    );
  const maxChars = Number(config.maxAnswerChars) || 160;
  const conclusion = anchorConcept
    ? `结论：${anchorConcept.definition}。`
    : '结论：先给判断，再给理由。';
  const reason = question.replace(/[？?]$/, '');
  return {
    id: `qa-${block.id}`,
    title: clampText(reason.replace(/[？?]/g, ''), 16),
    question,
    answer: clampText(`${conclusion}${reason}`, maxChars),
    sourceBlockId: block.id,
    generatedBy: ctx.generatedBy
  };
}

export function buildCheatsheet(
  block: LectureBlock,
  ctx: MediaContext,
  config: Record<string, string | number | boolean>
): MediaCheatsheet {
  const sentences = splitSentences(block.text);
  const section = sectionOf(ctx.sections, block.sectionId);
  const maxRows = Number(config.maxRows) || 6;
  const wantFlashcard = config.mode === 'flashcard' || (config.mode === 'auto' && sentences.length <= 1);
  const rows = sentences
    .slice(0, maxRows)
    .map((sentence, index) => [
      `要点 ${String(index + 1).padStart(2, '0')}`,
      clampText(sentence.replace(/[。！？!?]$/, ''), 48)
    ]);
  const cards = sentences.slice(0, maxRows).map((sentence) => ({
    front: clampText(sentence.replace(/[。！？!?]$/, ''), 18),
    back: clampText(sentence, 64)
  }));
  return {
    id: `cs-${block.id}`,
    title: clampText(section?.title ?? block.text, 16),
    intro: clampText(block.text.replace(/[。！？!?]$/, ''), 40),
    columns: ['要点', '说明'],
    rows,
    note: '速查表只保留判定依据，不重复讲稿正文。',
    mode: wantFlashcard ? 'flashcard' : 'table',
    cards,
    sourceBlockId: block.id,
    generatedBy: ctx.generatedBy
  };
}

export function buildSlide(block: LectureBlock, ctx: MediaContext): MediaSlide {
  const sentences = splitSentences(block.text);
  const section = sectionOf(ctx.sections, block.sectionId);
  const markers = ['位置', '推进', '落点'];
  const slides = (sentences.length ? sentences : [block.text])
    .slice(0, 3)
    .map((sentence, index) => ({
      kicker: section?.short ?? '本章',
      title: clampText(sentence.replace(/[。！？!?]/g, ''), 14),
      body: clampText(sentence, 60),
      marker: markers[index] ?? '落点'
    }));
  while (slides.length < 3) {
    slides.push({
      kicker: section?.short ?? '本章',
      title: clampText(block.text, 14),
      body: clampText(block.text, 60),
      marker: markers[slides.length] ?? '落点'
    });
  }
  return {
    id: `slide-${block.id}`,
    title: clampText(section?.title ?? '课件页', 14),
    eyebrow: `${section?.short ?? '本章'} · 课件页`,
    lead: clampText(block.text, 40),
    slides,
    sourceBlockId: block.id,
    generatedBy: ctx.generatedBy
  };
}

export function buildMap(
  block: LectureBlock,
  ctx: MediaContext,
  conceptIds: string[]
): MediaMap {
  const section = sectionOf(ctx.sections, block.sectionId);
  const sectionBlocks = ctx.blocks.filter((item) => item.sectionId === block.sectionId);
  const concepts = ctx.concepts
    .filter((concept) => conceptIds.includes(concept.id))
    .map((concept) => concept.name);
  const examples = sectionBlocks
    .filter((item) => item.label === 'example')
    .map((item) => clampText(item.text, 14))
    .slice(0, 3);
  const landing = sectionBlocks
    .filter((item) => item.label === 'conclusion')
    .map((item) => clampText(item.text, 16))
    .slice(0, 2);
  return {
    id: `map-${block.id}`,
    title: `${shortTitle(section?.title ?? '章节', 10)} · 导图`,
    eyebrow: '章节导图',
    root: section?.title ?? '本节',
    branches: [
      { title: '问题', items: examples.length ? examples : [clampText(block.text, 16)] },
      { title: '机制', items: concepts.length ? concepts.slice(0, 4) : ['待补充'] },
      { title: '落点', items: landing.length ? landing : [clampText(block.text, 16)] }
    ],
    note: '导图回答“人在哪里、卡在哪、下一步去哪”。',
    sourceBlockId: block.id,
    generatedBy: ctx.generatedBy
  };
}