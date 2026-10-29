import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Theater } from '../components/Theater';
import type { LectureProject } from '../types';
import { useApp } from '../context/AppContext';

/** 播放页：作者预览与学生观看共用同一套舞台，数据来源不同。 */
export function WatchPage({ mode }: { mode: 'author' | 'student' }) {
  const { data } = useApp();
  const params = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<LectureProject | null>(null);
  const [courseLabel, setCourseLabel] = useState<string | undefined>();
  const [lessonLabel, setLessonLabel] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [initialTime, setInitialTime] = useState(0);
  const voiceSources = useMemo(
    () =>
      (data?.services ?? [])
        .filter((item) => item.kind === 'tts' && item.apiKeyConfigured)
        .map((item) => ({ id: item.id, label: `音色 · ${item.name}` })),
    [data]
  );

  useEffect(() => {
    let cancelled = false;
    setLecture(null);
    setError(null);
    setInitialTime(0);
    const load = async () => {
      try {
        if (mode === 'student') {
          const result = await api.learnCourse(params.courseId ?? '');
          const lesson = result.course.lessons.find((item) => item.id === params.lessonId);
          if (!lesson) throw new Error('该课时不在已发布版本中');
          if (cancelled) return;
          setCourseLabel(result.course.title);
          setLessonLabel(lesson.title);
          setLecture(lesson.lecture);
          const saved = Number(
            window.localStorage.getItem(
              `lecture-axis-progress:${params.courseId ?? ''}:${params.lessonId ?? ''}`
            ) ?? 0
          );
          setInitialTime(Number.isFinite(saved) ? Math.min(saved, lesson.seconds - 5) : 0);
        } else {
          const result = await api.lecture(params.lectureId ?? 'active');
          if (cancelled) return;
          setLecture(result.lecture);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : '载入失败');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, params.courseId, params.lectureId, params.lessonId]);

  useEffect(() => {
    document.documentElement.style.background = '#0d0e0d';
    return () => {
      document.documentElement.style.background = '';
    };
  }, []);

  const exit = () => {
    if (mode === 'student') navigate(`/learn/${params.courseId ?? ''}`);
    else navigate('/studio');
  };

  if (error) {
    return (
      <div className="watch-state">
        <strong>无法播放</strong>
        <p>{error}</p>
        <button className="button button-primary button-md" type="button" onClick={exit}>
          返回
        </button>
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="watch-state is-loading">
        <span className="loading-mark">
          <span />
          <span />
        </span>
        <p>正在装配讲义轴</p>
      </div>
    );
  }

  return (
    <Theater
      lecture={lecture}
      courseLabel={courseLabel ?? lecture.meta.course}
      lessonLabel={lessonLabel ?? lecture.meta.title}
      onExit={exit}
      voiceSources={voiceSources}
      initialTime={initialTime}
      progressKey={
        mode === 'student'
          ? `lecture-axis-progress:${params.courseId ?? ''}:${params.lessonId ?? ''}`
          : undefined
      }
    />
  );
}
