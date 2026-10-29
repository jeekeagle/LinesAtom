import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, GraduationCap, Layers3, PlayCircle, Radio, Signal } from 'lucide-react';
import { EndSwitch } from '../components/EndSwitch';
import { api, type LearnCourse } from '../lib/api';
import { formatClock } from '../lib/format';
import type { PublishedCourse } from '../types';

function useLearn() {
  const [courses, setCourses] = useState<LearnCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .learn()
      .then((result) => setCourses(result.courses))
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : '载入失败')
      );
  }, []);
  return { courses, error };
}

const progressKey = (courseId: string, lessonId: string) =>
  `lecture-axis-progress:${courseId}:${lessonId}`;

const readProgress = (courseId: string, lessonId: string) => {
  const raw = window.localStorage.getItem(progressKey(courseId, lessonId));
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
};

/** 学生端首页：只列已发布课程。 */
export function LearnPage() {
  const { courses, error } = useLearn();
  const navigate = useNavigate();

  return (
    <div className='learn'>
      <header className='learn-top'>
        <div className='learn-brand'>
          <span className='brand-mark' aria-hidden='true'>
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>讲义轴 · 学习端</strong>
            <small>LECTURE AXIS FOR STUDENTS</small>
          </span>
        </div>
        <EndSwitch current='student' />
      </header>

      <main className='learn-main'>
        <section className='learn-hero'>
          <div className='eyebrow'>
            <Radio size={14} />
            已发布课程
          </div>
          <h1>把讲稿变成可以看的时间轴</h1>
          <p>每一节都在固定位置挂着对应的学习介质；点播放，讲到哪、就展到哪。</p>
        </section>

        <div className='learn-grid'>
          {courses.map((course) => (
            <Link className='learn-card' key={course.id} to={`/learn/${course.id}`}>
              <div className='learn-card-top'>
                <span className='learn-card-icon'>
                  <GraduationCap size={20} />
                </span>
                <span className='badge badge-ok'>
                  <Radio size={12} />
                  v{course.version}
                </span>
              </div>
              <h2>{course.title}</h2>
              <p>{course.subtitle || course.description}</p>
              <div className='learn-card-meta'>
                <span>
                  <Layers3 size={14} />
                  {course.lessonCount} 节
                </span>
                <span>
                  <Clock3 size={14} />
                  {formatClock(course.seconds)}
                </span>
                <span>
                  <Signal size={14} />
                  {course.audience || '所有学习者'}
                </span>
              </div>
              <div className='learn-card-cta'>进入课程</div>
            </Link>
          ))}
          {!courses.length && !error ? (
            <div className='empty-state'>
              <strong>还没有可看的课程</strong>
              <p>在开发端完成开发并点“发布课程”后，这里就会出现。</p>
            </div>
          ) : null}
          {error ? <div className='empty-state'><strong>学生端载入失败</strong><p>{error}</p></div> : null}
        </div>
      </main>
    </div>
  );
}

/** 学生端课程页：课时清单 + 继续学习入口。 */
export function LearnCoursePage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<PublishedCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    api
      .learnCourse(courseId)
      .then((result) => setCourse(result.course))
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : '载入失败')
      );
  }, [courseId]);

  useEffect(() => {
    const onStorage = () => setProgressTick((prev) => prev + 1);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (error) {
    return (
      <div className='learn'>
        <main className='learn-main'>
          <div className='empty-state'>
            <strong>课程不可用</strong>
            <p>{error}</p>
            <Link className='button button-secondary button-md' to='/learn'>
              返回课程列表
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!course) return null;
  void progressTick;

  const watched = course.lessons.filter((lesson) => readProgress(courseId, lesson.id) > 0).length;
  const resume = course.lessons.find((lesson) => readProgress(courseId, lesson.id) < 1);
  const startLesson = resume ?? course.lessons[0];
  const chapterGroups: {
    key: string;
    no: string;
    title: string;
    summary: string;
    lessons: PublishedCourse['lessons'];
  }[] = (course.chapters ?? []).map((chapter) => ({
    key: chapter.id,
    no: String(chapter.order).padStart(2, '0'),
    title: chapter.title,
    summary: chapter.summary,
    lessons: course.lessons.filter((lesson) => lesson.chapterId === chapter.id)
  }));
  const loose = course.lessons.filter(
    (lesson) => !lesson.chapterId || !(course.chapters ?? []).some((item) => item.id === lesson.chapterId)
  );
  if (loose.length) {
    chapterGroups.push({ key: 'loose', no: '—', title: '未分章单元', summary: '尚未归入章节的微课。', lessons: loose });
  }
  const visibleGroups = chapterGroups.filter((group) => group.lessons.length > 0);

  return (
    <div className='learn'>
      <header className='learn-top'>
        <div className='learn-brand'>
          <span className='brand-mark' aria-hidden='true'>
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>讲义轴 · 学习端</strong>
            <small>LECTURE AXIS FOR STUDENTS</small>
          </span>
        </div>
        <div className='button-row'>
          <Link className='button button-secondary button-md' to='/learn'>
            <ArrowLeft size={15} />
            全部课程
          </Link>
          <EndSwitch current='student' />
        </div>
      </header>

      <main className='learn-main'>
        <section className='learn-hero is-detail'>
          <div className='eyebrow'>
            <Radio size={14} />
            已发布 · v{course.version}
          </div>
          <h1>{course.title}</h1>
          <p>{course.description || course.subtitle}</p>
          <div className='learn-hero-meta'>
            <span>{course.lessons.length} 节微课</span>
            <span>已看 {watched} 节</span>
            <span>{formatClock(course.lessons.reduce((sum, lesson) => sum + lesson.seconds, 0))}</span>
            <span>{course.audience || '所有学习者'}</span>
          </div>
          {startLesson ? (
            <button
              className='button button-primary button-md'
              type='button'
              onClick={() => navigate(`/learn/${courseId}/watch/${startLesson.id}`)}
            >
              <PlayCircle size={16} />
              {watched ? '继续学习' : '开始学习'}
            </button>
          ) : null}
        </section>

        <div className='learn-chapters'>
          {visibleGroups.map((group) => (
            <section className='learn-chapter' key={group.key}>
              <header className='learn-chapter-head'>
                <span className='learn-chapter-no'>{group.no}</span>
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.summary}</p>
                </div>
                <em>
                  {group.lessons.length} 节 ·{' '}
                  {formatClock(group.lessons.reduce((sum, lesson) => sum + lesson.seconds, 0))}
                </em>
              </header>
              <div className='learn-lessons'>
                {group.lessons.map((lesson) => {
                  const progress = Math.min(
                    100,
                    Math.round((readProgress(courseId, lesson.id) / Math.max(1, lesson.seconds)) * 100)
                  );
                  return (
                    <button
                      className='learn-lesson'
                      key={lesson.id}
                      type='button'
                      onClick={() => navigate(`/learn/${courseId}/watch/${lesson.id}`)}
                    >
                      <span className='learn-lesson-order'>{String(lesson.order).padStart(2, '0')}</span>
                      <span className='learn-lesson-main'>
                        <strong>{lesson.title}</strong>
                        <small>
                          {lesson.summary || `${lesson.blocks} 讲稿块 · ${lesson.concepts} 概念`}
                        </small>
                        <i>
                          <b style={{ width: `${progress}%` }} />
                        </i>
                      </span>
                      <span className='learn-lesson-side'>
                        <em>{formatClock(lesson.seconds)}</em>
                        <span className='learn-lesson-play'>
                          <PlayCircle size={22} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
