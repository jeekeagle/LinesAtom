import type {
  AgentSkill,
  LectureBlock,
  LectureProject,
  MediaKind,
  MountSuggestion,
  RuntimeSettings
} from '../src/types';
import { LABEL_TEXT, MOUNT_RULES } from './constants';
import { buildCase, buildCheatsheet, buildMap, buildQa, buildSlide } from './media';
import { clampText } from './text';
import { runSkillWithModel } from './skills';

const MEDIA_LABEL: Record<MediaKind, string> = {
  concept: '概念卡',
  case: '案例',
  qa: '问答',
  cheatsheet: '速查表',
  slide: '课件页',
  map: '导图'
};

const skillOf = (skills: AgentSkill[], id: string) => skills.find((skill) => skill.id === id);

function suggestMediaType(block: LectureBlock, sectionIsFirst: boolean): MediaKind {
  const rule = MOUNT_RULES[block.label];
  if (block.label === 'global') return sectionIsFirst ? 'map' : 'slide';
  // 过渡衔接默认不挂载，给出低置信的位置提示建议，由人决定要不要接受。
  return rule ?? 'slide';
}

function targetFor(
  project: LectureProject,
  block: LectureBlock,
  mediaType: MediaKind
): { id: string | null; label: string } {
  if (mediaType === 'concept') {
    const anchored = project.concepts.find((concept) => concept.anchorBlockId === block.id);
    if (anchored) return { id: anchored.id, label: anchored.name };
    const mentioned = project.concepts.find((concept) => block.text.includes(concept.name));
    if (mentioned) return { id: mentioned.id, label: mentioned.name };
    return { id: null, label: '新建概念卡' };
  }
  const pointer = project.pointers.find(
    (item) => item.blockId === block.id && item.mediaType === mediaType
  );
  if (pointer) {
    const bucket =
      mediaType === 'case'
        ? project.media.cases
        : mediaType === 'qa'
          ? project.media.qas
          : mediaType === 'cheatsheet'
            ? project.media.cheatsheets
            : mediaType === 'slide'
              ? project.media.slides
              : project.media.maps;
    const found = bucket.find((item) => item.id === pointer.targetId) as { title?: string } | undefined;
    return { id: pointer.targetId, label: found?.title ?? MEDIA_LABEL[mediaType] };
  }
  return { id: null, label: `新建${MEDIA_LABEL[mediaType]}` };
}

function rationaleFor(
  project: LectureProject,
  block: LectureBlock,
  mediaType: MediaKind,
  targetLabel: string
): string {
  const labelName = LABEL_TEXT[block.label];
  switch (mediaType) {
    case 'concept':
      return `${labelName}：此处是「${targetLabel}」的来源，挂概念卡可随时展开定义与易混项。`;
    case 'case':
      return `${labelName}：把这段具体情境挂成案例，听众卡住时可以回看背景、做法与结果。`;
    case 'qa':
      return `${labelName}：这一段本来就在提问，挂了问答可以直接对照结论与理由。`;
    case 'cheatsheet':
      return `${labelName}：把结论压成速查表，便于回看时快速扫读。`;
    case 'slide':
      return `${labelName}：用一页课件把当前位置讲清楚，便于换位理解。`;
    case 'map':
      return `${labelName}：用章节导图交代当前位置，避免听众迷失。`;
    case 'slide':
    default:
      return `${labelName}：按判定规则建议挂载。`;
  }
}

/** 本地确定性建议：按标签规则与已有挂载关系给出逐行挂载建议。 */
export function buildLocalSuggestions(project: LectureProject): MountSuggestion[] {
  const now = new Date().toISOString();
  const out: MountSuggestion[] = [];
  project.blocks.forEach((block) => {
    const sectionBlocks = project.blocks.filter((item) => item.sectionId === block.sectionId);
    const sectionIsFirst = sectionBlocks[0]?.id === block.id;
    const mediaType = suggestMediaType(block, sectionIsFirst);
    const target = targetFor(project, block, mediaType);
    const mounted = project.pointers.some(
      (pointer) => pointer.blockId === block.id && pointer.mediaType === mediaType
    );
    const confidence =
      block.label === 'transition' ? 0.4 : mounted ? 0.92 : block.labelEvidence ? 0.78 : 0.64;
    out.push({
      id: `sg-${block.id}`,
      blockId: block.id,
      mediaType,
      targetId: target.id,
      targetLabel: target.label,
      rationale: rationaleFor(project, block, mediaType, target.label),
      confidence,
      status: 'pending',
      source: 'engine',
      createdAt: now
    });
  });
  return out;
}

const advisorSchema = `{"suggestions":[{"blockId":"","mediaType":"concept|case|qa|cheatsheet|slide|map","target":"","rationale":"","confidence":0.8}]}`;

function parseModelSuggestions(raw: unknown): MountSuggestion[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return [];
  const mapped: MountSuggestion[] = [];
  for (const item of list) {
    const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const mediaType = String(entry.mediaType ?? '') as MediaKind;
    if (!MEDIA_LABEL[mediaType]) continue;
    mapped.push({
      id: `sg-${String(entry.blockId ?? '')}`,
      blockId: String(entry.blockId ?? ''),
      mediaType,
      targetId: null,
      targetLabel: clampText(String(entry.target ?? ''), 24),
      rationale: clampText(String(entry.rationale ?? ''), 80),
      confidence: Number(entry.confidence ?? 0.7),
      status: 'pending',
      source: 'model',
      createdAt: new Date().toISOString()
    });
  }
  return mapped;
}

/**
 * 逐行挂载建议：优先用模型（挂载顾问技能），模型不可用时回落到本地确定性规则。
 */
export async function generateSuggestions(
  project: LectureProject,
  skills: AgentSkill[],
  settings: RuntimeSettings
): Promise<{ suggestions: MountSuggestion[]; provider: string; warnings: string[] }> {
  const warnings: string[] = [];
  const skill = skillOf(skills, 'mount-advisor');
  const local = buildLocalSuggestions(project);

  if (skill && skill.enabled && skill.config.useModel) {
    try {
      const context = project.blocks
        .map((block) => `- ${block.id} | ${LABEL_TEXT[block.label]} | ${block.text.slice(0, 120)}`)
        .join('\n');
      const result = await runSkillWithModel(
        skill,
        project.blocks.map((block) => `${block.id}\t${block.text.slice(0, 100)}`).join('\n'),
        settings,
        `讲稿标签与块内容：\n${context}`
      );
      if (result.parsed) {
        const parsed = parseModelSuggestions(result.parsed);
        if (parsed.length) {
          const localById = new Map(local.map((item) => [item.blockId, item]));
          const merged = parsed.map((item) => {
            const fallback = localById.get(item.blockId);
            return {
              ...item,
              targetId: fallback?.targetId ?? null,
              targetLabel: item.targetLabel || fallback?.targetLabel || '新建介质'
            };
          });
          return { suggestions: merged, provider: result.provider, warnings };
        }
      }
      warnings.push('模型没有返回可用的挂载建议，已回落本地规则。');
    } catch (error) {
      warnings.push(
        `模型调用失败，已回落本地规则：${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  return { suggestions: local, provider: 'local-deterministic', warnings };
}

/** 批量确认的置信度门槛：低于门槛的建议保留待定，避免误挂。 */
export function confidenceFloor(skills: AgentSkill[]): number {
  const skill = skillOf(skills, 'mount-advisor');
  const value = Number(skill?.config.confidenceFloor ?? 0.6);
  return Number.isFinite(value) ? value : 0.6;
}

export interface SuggestionEdit {
  mediaType?: MediaKind;
  targetId?: string | null;
  rationale?: string;
  targetLabel?: string;
}

/** 采纳或修改一条建议：写入真实挂载指针，并保持一块一挂载。 */
export function applySuggestion(
  project: LectureProject,
  suggestion: MountSuggestion,
  edit: SuggestionEdit = {}
): LectureProject {
  const mediaType = edit.mediaType ?? suggestion.mediaType;
  const targetId = edit.targetId ?? suggestion.targetId;
  const next: LectureProject = JSON.parse(JSON.stringify(project));

  const block = next.blocks.find((item) => item.id === suggestion.blockId);
  if (!block) return next;

  const existing = next.pointers.find((pointer) => pointer.blockId === block.id);
  let resolvedTarget = targetId;

  if (!resolvedTarget) {
    // 没有既有目标时，为该块生成对应介质。
    const mediaContext = {
      sections: next.sections,
      blocks: next.blocks,
      concepts: next.concepts,
      generatedBy: `mount-advisor@${skillVersion(next)}`
    };
    if (mediaType === 'concept') {
      const concept =
        next.concepts.find((item) => item.anchorBlockId === block.id) ??
        next.concepts.find((item) => block.text.includes(item.name));
      resolvedTarget = concept?.id ?? null;
    } else if (mediaType === 'case') {
      const item = buildCase(block, mediaContext, {});
      next.media.cases = next.media.cases.filter((entry) => entry.id !== item.id).concat(item);
      resolvedTarget = item.id;
    } else if (mediaType === 'qa') {
      const item = buildQa(block, mediaContext, {});
      next.media.qas = next.media.qas.filter((entry) => entry.id !== item.id).concat(item);
      resolvedTarget = item.id;
    } else if (mediaType === 'cheatsheet') {
      const item = buildCheatsheet(block, mediaContext, {});
      next.media.cheatsheets = next.media.cheatsheets.filter((entry) => entry.id !== item.id).concat(item);
      resolvedTarget = item.id;
    } else if (mediaType === 'slide') {
      const item = buildSlide(block, mediaContext);
      next.media.slides = next.media.slides.filter((entry) => entry.id !== item.id).concat(item);
      resolvedTarget = item.id;
    } else if (mediaType === 'map') {
      const item = buildMap(block, mediaContext, []);
      next.media.maps = next.media.maps.filter((entry) => entry.id !== item.id).concat(item);
      resolvedTarget = item.id;
    }
  }

  if (resolvedTarget) {
    const pointer = {
      id: existing?.id ?? `p${String(next.pointers.length + 1).padStart(2, '0')}`,
      blockId: block.id,
      mediaType,
      targetId: resolvedTarget,
      trigger: 'preload' as const,
      status: 'confirmed' as const,
      note: edit.rationale ?? suggestion.rationale
    };
    if (existing) {
      next.pointers = next.pointers.map((item) => (item.id === existing.id ? pointer : item));
    } else {
      next.pointers.push(pointer);
    }
  }

  next.suggestions = (next.suggestions ?? []).map((item) =>
    item.id === suggestion.id
      ? {
          ...item,
          mediaType,
          targetId: resolvedTarget,
          targetLabel: edit.targetLabel ?? item.targetLabel,
          rationale: edit.rationale ?? item.rationale,
          status: 'accepted',
          createdAt: new Date().toISOString()
        }
      : item
  );

  next.updatedAt = new Date().toISOString();
  return next;
}

export function rejectSuggestion(project: LectureProject, suggestionId: string): LectureProject {
  const next: LectureProject = JSON.parse(JSON.stringify(project));
  next.suggestions = (next.suggestions ?? []).map((item) =>
    item.id === suggestionId ? { ...item, status: 'rejected' } : item
  );
  next.updatedAt = new Date().toISOString();
  return next;
}

function skillVersion(project: LectureProject): string {
  const skill = project.engineSnapshot.skills.find((item) => item.id === 'mount-advisor');
  return skill?.version ?? '1.0.0';
}