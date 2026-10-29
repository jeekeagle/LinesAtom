import type {
  Course,
  CourseLesson,
  CourseSummary,
  LectureProject,
  PublishedCourse,
  PublishedLesson
} from '../src/types';

const nowIso = () => new Date().toISOString();

/** 讲稿字数按自然语速 240 字/分钟倒推，与播放器 TTS 节奏一致。 */
export function estimateLectureSeconds(lecture: LectureProject | null | undefined): number {
  if (!lecture) return 0;
  const chars = lecture.blocks.reduce((sum, block) => sum + Array.from(block.text.trim()).length, 0);
  const pauses = lecture.blocks.length * 0.45;
  return Math.max(30, Math.round(chars / 4 + pauses));
}

export function summarizeCourse(course: Course): CourseSummary {
  return {
    id: course.id,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    audience: course.audience,
    lessonCount: course.lessons.length,
    readyCount: course.lessons.filter((lesson) => lesson.status === 'ready').length,
    chapters: course.chapters,
    publishedVersion: course.publishedVersion,
    publishedAt: course.publishedAt,
    dirty: course.dirty,
    seconds: course.lessons.reduce((sum, lesson) => sum + (lesson.seconds || 0), 0),
    updatedAt: course.updatedAt
  };
}

/** 发布即冻结：把 ready 课时的讲稿整份拷进快照，开发稿之后怎么改都不影响学生端。 */
export function publishCourse(course: Course, lectures: LectureProject[]): Course {
  const lessons: PublishedLesson[] = [];

  for (const lesson of [...course.lessons].sort((a, b) => a.order - b.order)) {
    if (!lesson.lectureId) continue;
    const lecture = lectures.find((item) => item.id === lesson.lectureId);
    if (!lecture || !lecture.blocks.length) continue;
    const frozen: LectureProject = JSON.parse(JSON.stringify(lecture));
    frozen.name = lesson.title;
    frozen.meta.title = lesson.title;
    frozen.meta.subtitle = lesson.summary || frozen.meta.subtitle;
    lessons.push({
      id: lesson.id,
      order: lesson.order,
      title: lesson.title,
      summary: lesson.summary,
      chapterId: lesson.chapterId ?? null,
      seconds: estimateLectureSeconds(lecture),
      blocks: lecture.blocks.length,
      concepts: lecture.concepts.length,
      lecture: frozen
    });
  }

  if (!lessons.length) {
    throw new Error('至少要有一个已生成讲稿的课时，才能发布课程。');
  }

  const timestamp = nowIso();
  const snapshot: PublishedCourse = {
    version: course.publishedVersion + 1,
    publishedAt: timestamp,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    audience: course.audience,
    chapters: course.chapters,
    lessons
  };

  return {
    ...course,
    publishedVersion: snapshot.version,
    publishedAt: snapshot.publishedAt,
    snapshot,
    dirty: false,
    updatedAt: timestamp
  };
}

export function makeLesson(input: {
  id: string;
  order: number;
  title: string;
  summary: string;
  chapterId?: string | null;
  lectureId: string | null;
  seconds?: number;
}): CourseLesson {
  return {
    id: input.id,
    order: input.order,
    title: input.title,
    summary: input.summary,
    chapterId: input.chapterId ?? null,
    lectureId: input.lectureId,
    status: input.lectureId && input.seconds ? 'ready' : 'draft',
    seconds: input.seconds ?? 0,
    updatedAt: nowIso()
  };
}

export function nextLectureId(existing: LectureProject[]): string {
  let index = existing.length + 1;
  const used = new Set(existing.map((item) => item.id));
  let candidate = `lec-${String(index).padStart(2, '0')}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `lec-${String(index).padStart(2, '0')}`;
  }
  return candidate;
}

export function resequenceLessons(lessons: CourseLesson[]): CourseLesson[] {
  return lessons
    .sort((a, b) => a.order - b.order)
    .map((lesson, index) => ({ ...lesson, order: index + 1 }));
}

/** 按章节切出一个独立微课：块、概念、指针与介质一起裁剪，保证单元自洽。 */
export function sliceLecture(
  source: LectureProject,
  sectionIds: string[],
  options: { id: string; title: string; summary?: string; course?: string }
): LectureProject {
  const keepSections = new Set(sectionIds);
  const now = new Date().toISOString();
  const sections = source.sections.filter((section) => keepSections.has(section.id));
  const blocks = source.blocks.filter((block) => keepSections.has(block.sectionId));
  const blockIds = new Set(blocks.map((block) => block.id));

  let concepts = source.concepts
    .map((concept) => {
      const recurrences = concept.recurrences.filter((id) => blockIds.has(id));
      const anchorInSlice = blockIds.has(concept.anchorBlockId);
      return {
        ...concept,
        anchorBlockId: anchorInSlice ? concept.anchorBlockId : (recurrences[0] ?? ''),
        recurrences: anchorInSlice ? recurrences : recurrences.slice(1)
      };
    })
    .filter((concept) => concept.anchorBlockId);
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  concepts = concepts.map((concept) => ({
    ...concept,
    parentId: concept.parentId && conceptIds.has(concept.parentId) ? concept.parentId : null
  }));

  const pointers = source.pointers.filter(
    (pointer) =>
      blockIds.has(pointer.blockId) &&
      (pointer.mediaType === 'concept'
        ? conceptIds.has(pointer.targetId)
        : mediaTargetExists(source, pointer.mediaType, pointer.targetId))
  );

  const sliceMedia = <T extends { id: string; sourceBlockId?: string }>(
    items: T[],
    type: Parameters<typeof mediaTargetExists>[1]
  ): T[] =>
    items.filter(
      (item) =>
        blockIds.has(item.sourceBlockId ?? '') ||
        pointers.some((pointer) => pointer.mediaType === type && pointer.targetId === item.id)
    );

  const keep = {
    cases: sliceMedia(source.media.cases, 'case'),
    qas: sliceMedia(source.media.qas, 'qa'),
    cheatsheets: sliceMedia(source.media.cheatsheets, 'cheatsheet'),
    slides: sliceMedia(source.media.slides, 'slide'),
    maps: sliceMedia(source.media.maps, 'map')
  };

  return {
    ...JSON.parse(JSON.stringify(source)),
    id: options.id,
    name: options.title,
    topic: source.topic,
    meta: {
      ...source.meta,
      title: options.title,
      subtitle: options.summary || source.meta.subtitle,
      course: options.course || source.meta.course,
      revision: 1,
      generatedAt: now,
      source: `slice:${sectionIds.join('+')}`
    },
    sections,
    blocks,
    concepts,
    pointers,
    suggestions: [],
    media: keep,
    createdAt: now,
    updatedAt: now
  };
}

function mediaTargetExists(
  source: LectureProject,
  type: 'case' | 'qa' | 'cheatsheet' | 'slide' | 'map',
  id: string
): boolean {
  const map: Record<typeof type, { id: string }[]> = {
    case: source.media.cases,
    qa: source.media.qas,
    cheatsheet: source.media.cheatsheets,
    slide: source.media.slides,
    map: source.media.maps
  };
  return Boolean(map[type]?.some((item) => item.id === id));
}
