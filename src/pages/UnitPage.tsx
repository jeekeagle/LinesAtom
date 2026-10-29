import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Layers3 } from 'lucide-react';
import { api } from '../lib/api';
import { Theater } from '../components/Theater';
import { EndSwitch } from '../components/EndSwitch';
import { MaterialStream, type StreamItem } from '../components/MaterialStream';
import {
  MEDIA_LABEL,
  SCENE_LABEL,
  makeConceptMedia,
  resolveSceneMedia,
  type Scene,
  type SceneKind
} from '../lib/score';
import { formatClock } from '../lib/format';
import type { MediaKind, PublishedCourse } from '../types';
import { useApp } from '../context/AppContext';

const mediaKind = (kind: SceneKind): MediaKind =>
  kind === 'section' || kind === 'plain' ? 'slide' : kind;

/**
 * 单元页 = 课程视频窗口 + 素材窗口。
 * 上方像录像一样播放（网页渲染、TTS 讲解、课件随讲稿变化）；
 * 下方三条线持续把当前挂载、关联概念与同章素材推进来，随时点开查看。
 */
export function UnitPage() {
  const { data } = useApp();
  const { courseId = '', lessonId = '' } = useParams();
  const [course, setCourse] = useState<PublishedCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const lesson = useMemo(
    () => course?.lessons.find((item) => item.id === lessonId) ?? null,
    [course, lessonId]
  );
  const lecture = lesson?.lecture ?? null;
  const voiceSources = useMemo(
    () =>
      (data?.services ?? [])
        .filter((item) => item.kind === 'tts' && item.apiKeyConfigured)
        .map((item) => ({ id: item.id, label: `音色 · ${item.name}` })),
    [data]
  );
  const initialTime = useMemo(() => {
    if (!lesson) return 0;
    const raw = Number(
      window.localStorage.getItem(`lecture-axis-progress:${courseId}:${lessonId}`) ?? 0
    );
    return Number.isFinite(raw) && raw > 0
      ? Math.min(raw, Math.max(0, lesson.seconds - 5))
      : 0;
  }, [courseId, lesson, lessonId]);

  useEffect(() => {
    setItems([]);
    setReadIds(new Set());
    setActiveId(null);
    api
      .learnCourse(courseId)
      .then((result) => setCourse(result.course))
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : '载入失败')
      );
  }, [courseId, lessonId]);

  const push = useCallback((list: StreamItem[]) => {
    setItems((prev) => {
      const known = new Set(prev.map((item) => item.id));
      const next = list.filter((item) => !known.has(item.id));
      return next.length ? [...prev, ...next] : prev;
    });
  }, []);

  const handleScene = useCallback(
    (scene: Scene | null) => {
      if (!scene || !lecture) return;
      const stream: StreamItem[] = [];

      if (scene.media) {
        stream.push({
          id: `m:${scene.blockId}`,
          lane: 'mount',
          kind: mediaKind(scene.media.kind),
          title: scene.media.title,
          subtitle: `${SCENE_LABEL[scene.label]} · ${MEDIA_LABEL[scene.media.kind]}`,
          blockLabel: scene.blockId,
          media: scene.media
        });
      }

      const concept = scene.media?.concept;
      if (concept) {
        const related = lecture.concepts.filter(
          (item) => item.id === concept.parentId || item.parentId === concept.id
        );
        related.forEach((item) => {
          stream.push({
            id: `r:${item.id}`,
            lane: 'related',
            kind: 'concept',
            title: item.name,
            subtitle: item.definition,
            blockLabel: item.anchorBlockId,
            media: makeConceptMedia(lecture, item, item.anchorBlockId !== concept.anchorBlockId)
          });
        });
      }

      const sectionBlocks = lecture.blocks.filter((block) => block.sectionId === scene.sectionId);
      sectionBlocks.forEach((block) => {
        if (block.id === scene.blockId) return;
        const media = resolveSceneMedia(lecture, block);
        if (!media) return;
        stream.push({
          id: `c:${block.id}`,
          lane: 'chapter',
          kind: mediaKind(media.kind),
          title: media.title,
          subtitle: `${scene.sectionTitle} · ${MEDIA_LABEL[media.kind]}`,
          blockLabel: block.id,
          media
        });
      });

      push(stream.slice(0, 8));
    },
    [lecture, push]
  );

  const openItem = (id: string) => {
    setActiveId(id);
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  if (error) {
    return (
      <div className='learn'>
        <main className='learn-main'>
          <div className='empty-state'>
            <strong>单元不可用</strong>
            <p>{error}</p>
            <Link className='button button-secondary button-md' to={`/learn/${courseId}`}>
              返回课程
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!course || !lesson || !lecture) return null;

  const chapter = course.chapters.find((item) => item.id === lesson.chapterId);

  return (
    <div className='unit-page'>
      <header className='unit-top'>
        <div className='unit-crumb'>
          <Link className='unit-back' to={`/learn/${courseId}`}>
            <ArrowLeft size={14} />
            {course.title}
          </Link>
          <span className='unit-crumb-dot'>/</span>
          <strong>{chapter?.title ?? '微课单元'}</strong>
        </div>
        <div className='unit-top-right'>
          <span className='unit-index'>
            单元 {String(lesson.order).padStart(2, '0')} / {course.lessons.length}
          </span>
          <EndSwitch current='student' />
        </div>
      </header>

      <main className='unit-main'>
        <div className='unit-screen-wrap'>
          <div className='unit-screen'>
            <Theater
              lecture={lecture}
              courseLabel={course.title}
              lessonLabel={lesson.title}
              variant='embed'
              voiceSources={voiceSources}
              onScene={handleScene}
              initialTime={initialTime}
              progressKey={`lecture-axis-progress:${courseId}:${lessonId}`}
              onExit={() => {
                window.history.back();
              }}
            />
          </div>
          <div className='unit-meta'>
            <div>
              <span className='unit-meta-kicker'>正在学习</span>
              <h1>{lesson.title}</h1>
              <p>{lesson.summary || chapter?.summary || course.description}</p>
            </div>
            <div className='unit-meta-side'>
              <span>
                <Clock3 size={14} />
                {formatClock(lesson.seconds)}
              </span>
              <span>
                <Layers3 size={14} />
                {lesson.blocks} 讲稿块 · {lesson.concepts} 概念
              </span>
            </div>
          </div>
        </div>

        <MaterialStream
          items={items}
          readIds={readIds}
          activeId={activeId}
          onOpen={openItem}
          onClose={() => setActiveId(null)}
        />
      </main>
    </div>
  );
}
