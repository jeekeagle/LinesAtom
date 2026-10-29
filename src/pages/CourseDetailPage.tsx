import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Pencil,
  Play,
  Plus,
  Radio,
  Save,
  Scissors,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, type LectureBrief } from '../lib/api';
import { Section, Stat } from '../components/ui';
import { formatClock, relativeTime } from '../lib/format';
import type { Course } from '../types';

export function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { showToast, refresh } = useApp();
  const [course, setCourse] = useState<Course | null>(null);
  const [lectures, setLectures] = useState<LectureBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'material' | 'current'>('material');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [lessonForm, setLessonForm] = useState({
    title: '',
    summary: '',
    chapterId: '',
    durationMinutes: 9,
    material: ''
  });
  const [chapterTitle, setChapterTitle] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.course(courseId);
      setCourse(result.course);
      setLectures(result.lectures);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '载入失败');
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lessonBrief = (lectureId: string | null) =>
    lectureId ? lectures.find((item) => item.id === lectureId) : undefined;

  const createLesson = async () => {
    if (!lessonForm.title.trim() || !lessonForm.material.trim()) {
      showToast('标题和讲稿素材都要填', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api.createLesson(courseId, lessonForm);
      showToast(`微课已生成：${result.lesson.title}`, 'success');
      setLessonForm({ title: '', summary: '', chapterId: '', durationMinutes: 9, material: '' });
      await load();
      await refresh();
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '生成失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addCurrent = async () => {
    const title = lessonForm.title.trim() || '未命名微课';
    setBusy(true);
    try {
      await api.lessonFromCurrent(courseId, title);
      showToast('当前讲稿已另存为微课', 'success');
      setLessonForm({ title: '', summary: '', chapterId: '', durationMinutes: 9, material: '' });
      await load();
      await refresh();
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '保存失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const result = await api.publishCourse(courseId);
      showToast(`已发布 v${result.course.publishedVersion}，学生端已更新`, 'success');
      await load();
      await refresh();
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '发布失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openStudio = async (lectureId: string) => {
    try {
      await api.activateLecture(lectureId);
      await refresh();
      navigate('/studio');
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '切换失败', 'error');
    }
  };

  const saveTitle = async (lessonId: string) => {
    if (!editingTitle.trim()) return;
    try {
      await api.updateLesson(courseId, lessonId, { title: editingTitle.trim() });
      setEditingId(null);
      await load();
      await refresh();
      showToast('课时标题已更新', 'success');
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '更新失败', 'error');
    }
  };

  const removeLesson = async (lessonId: string, title: string) => {
    if (!window.confirm(`删除课时「${title}」及其讲稿？发布版本中的快照不受影响。`)) return;
    try {
      await api.deleteLesson(courseId, lessonId);
      await load();
      await refresh();
      showToast('课时已删除', 'success');
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  const addChapter = async () => {
    if (!chapterTitle.trim()) {
      showToast('章节需要标题', 'error');
      return;
    }
    try {
      const result = await api.createChapter(courseId, { title: chapterTitle.trim() });
      setChapterTitle('');
      setLessonForm((prev) => ({
        ...prev,
        chapterId: result.course.chapters[result.course.chapters.length - 1]?.id ?? ''
      }));
      await load();
      showToast('章节已新增', 'success');
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '新增失败', 'error');
    }
  };

  const removeChapter = async (chapterId: string, title: string) => {
    if (!window.confirm(`删除章节「${title}」？其中的单元会变成未分章。`)) return;
    try {
      await api.deleteChapter(courseId, chapterId);
      await load();
      showToast('章节已删除', 'success');
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  if (error) {
    return (
      <div className='workspace'>
        <div className='workspace-inner'>
          <div className='empty-state'>
            <strong>课程载入失败</strong>
            <p>{error}</p>
            <Link className='button button-secondary button-md' to='/courses'>
              返回课程台
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!course) return null;

  const readyCount = course.lessons.filter((lesson) => lesson.status === 'ready').length;
  const totalSeconds = course.lessons.reduce((sum, lesson) => sum + lesson.seconds, 0);
  const chapters = course.chapters ?? [];
  const chapterName = (id: string | null) =>
    (chapters.find((chapter) => chapter.id === id)?.title) ?? '';

  return (
    <div className='workspace'>
      <div className='workspace-inner'>
        <header className='workspace-head'>
          <div>
            <Link className='course-back' to='/courses'>
              <ArrowLeft size={14} />
              课程台
            </Link>
            <div className='course-kicker'>COURSE · 课程开发</div>
            <h1>{course.title}</h1>
            <p>{course.subtitle || course.description || '还没有课程简介'}</p>
            <div className='badge-row'>
              {course.publishedVersion > 0 ? (
                <span className='badge badge-ok'>
                  <Radio size={12} />
                  已发布 v{course.publishedVersion}
                </span>
              ) : (
                <span className='badge badge-warn'>未发布 · 学生不可见</span>
              )}
              {course.dirty ? <span className='badge badge-accent'>有未发布改动</span> : null}
              <span className='badge badge-neutral'>{course.audience || '未填写受众'}</span>
            </div>
          </div>
          <div className='button-row'>
            {course.publishedVersion > 0 ? (
              <Link className='button button-secondary button-md' to={`/learn/${course.id}`}>
                <Eye size={15} />
                学生端预览
              </Link>
            ) : null}
            <button
              className='button button-primary button-md'
              type='button'
              disabled={busy || !readyCount}
              onClick={() => void publish()}
              title={readyCount ? '把 ready 课时冻结成快照' : '至少要有一个已生成讲稿的课时'}
            >
              <Radio size={15} />
              {course.publishedVersion ? '重新发布' : '发布课程'}
            </button>
          </div>
        </header>

        <div className='stat-strip'>
          <Stat value={course.lessons.length} label='课时' />
          <Stat value={`${readyCount}/${course.lessons.length}`} label='讲稿就绪' tone={readyCount === course.lessons.length ? 'ok' : 'warn'} />
          <Stat value={formatClock(totalSeconds)} label='预计总时长' />
          <Stat value={`v${course.publishedVersion}`} label='发布版本' />
          <Stat value={relativeTime(course.updatedAt)} label='最近改动' />
        </div>

        <div className='content-split'>
          <div>
            <Section title='课时列表' meta={`${course.lessons.length} 节 · 每节一条讲义轴`}>
              <div className='lesson-list'>
                {course.lessons.map((lesson) => {
                  const brief = lessonBrief(lesson.lectureId);
                  return (
                    <div className='lesson-row' key={lesson.id}>
                      <span className='lesson-order'>{String(lesson.order).padStart(2, '0')}</span>
                      <div className='lesson-main'>
                        {editingId === lesson.id ? (
                          <div className='lesson-edit'>
                            <input
                              value={editingTitle}
                              autoFocus
                              onChange={(event) => setEditingTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void saveTitle(lesson.id);
                                if (event.key === 'Escape') setEditingId(null);
                              }}
                            />
                            <button
                              className='icon-button'
                              type='button'
                              title='保存标题'
                              onClick={() => void saveTitle(lesson.id)}
                            >
                              <Save size={14} />
                            </button>
                          </div>
                        ) : (
                          <h3>{lesson.title}</h3>
                        )}
                        <p>{lesson.summary || '暂无简介'}</p>
                        <div className='lesson-meta'>
                          {chapterName(lesson.chapterId) ? (
                            <span className='badge badge-neutral'>{chapterName(lesson.chapterId)}</span>
                          ) : (
                            <span className='badge badge-warn'>未分章</span>
                          )}
                          <span className={`badge ${lesson.status === 'ready' ? 'badge-ok' : 'badge-warn'}`}>
                            {lesson.status === 'ready' ? '讲稿就绪' : '待开发'}
                          </span>
                          {brief ? (
                            <span>
                              {brief.blocks} 块 · {brief.concepts} 概念 · {brief.pointers} 挂载 · 修订 {brief.revision}
                            </span>
                          ) : (
                            <span>尚未生成讲稿</span>
                          )}
                          <span>{lesson.seconds ? formatClock(lesson.seconds) : '—'}</span>
                        </div>
                      </div>
                      <div className='lesson-actions'>
                        {lesson.lectureId ? (
                          <>
                            <button
                              className='icon-button'
                              type='button'
                              title='在剪辑台继续开发'
                              onClick={() => void openStudio(lesson.lectureId!)}
                            >
                              <Scissors size={14} />
                            </button>
                            <Link className='icon-button' to={`/watch/${lesson.lectureId}`} title='播放预览'>
                              <Play size={14} />
                            </Link>
                          </>
                        ) : (
                          <span className='badge badge-warn'>不可播放</span>
                        )}
                        <button
                          className='icon-button'
                          type='button'
                          title='改标题'
                          onClick={() => {
                            setEditingId(lesson.id);
                            setEditingTitle(lesson.title);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className='icon-button is-danger'
                          type='button'
                          title='删除课时'
                          onClick={() => void removeLesson(lesson.id, lesson.title)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!course.lessons.length ? (
                  <div className='empty-state'>
                    <strong>课程还没有课时</strong>
                    <p>在右侧贴一段素材生成微课，或把当前讲稿存为第一节课。</p>
                  </div>
                ) : null}
              </div>
            </Section>
          </div>

          <div>
            <Section title='新增微课' meta='生成即入课'>
              <div className='segmented lesson-tabs'>
                <button
                  type='button'
                  className={panel === 'material' ? 'is-active' : ''}
                  onClick={() => setPanel('material')}
                >
                  <Sparkles size={14} />
                  贴素材生成
                </button>
                <button
                  type='button'
                  className={panel === 'current' ? 'is-active' : ''}
                  onClick={() => setPanel('current')}
                >
                  <Save size={14} />
                  存当前讲稿
                </button>
              </div>

              <label className='field'>
                <span className='field-label'>课时标题</span>
                <input
                  value={lessonForm.title}
                  onChange={(event) => setLessonForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder='例如：数据孤岛：同一个客户，两套编码'
                />
              </label>

              <label className='field'>
                <span className='field-label'>所属章节</span>
                <select
                  value={lessonForm.chapterId}
                  onChange={(event) =>
                    setLessonForm((prev) => ({ ...prev, chapterId: event.target.value }))
                  }
                >
                  <option value=''>未分章</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </option>
                  ))}
                </select>
              </label>

              {panel === 'material' ? (
                <>
                  <label className='field'>
                    <span className='field-label'>讲稿素材</span>
                    <textarea
                      rows={8}
                      value={lessonForm.material}
                      onChange={(event) =>
                        setLessonForm((prev) => ({ ...prev, material: event.target.value }))
                      }
                      placeholder={'粘贴素材，用 ## 分章节：\n\n## 第一节\n……'}
                    />
                    <span className='field-hint'>不填标题时按素材首行切分；六标签与挂载同批生成。</span>
                  </label>
                  <label className='field'>
                    <span className='field-label'>目标时长（分钟）</span>
                    <input
                      type='number'
                      min={3}
                      max={60}
                      value={lessonForm.durationMinutes}
                      onChange={(event) =>
                        setLessonForm((prev) => ({
                          ...prev,
                          durationMinutes: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <button
                    className='button button-primary button-md is-full'
                    type='button'
                    disabled={busy}
                    onClick={() => void createLesson()}
                  >
                    <Sparkles size={15} />
                    {busy ? '生成中…' : '生成微课并挂入课程'}
                  </button>
                </>
              ) : (
                <>
                  <p className='panel-note'>
                    把当前正在开发的讲稿另存为本课程的一个独立微课：原讲稿保留，副本各自继续开发。
                  </p>
                  <button
                    className='button button-primary button-md is-full'
                    type='button'
                    disabled={busy}
                    onClick={() => void addCurrent()}
                  >
                    <Plus size={15} />
                    {busy ? '保存中…' : '另存为微课'}
                  </button>
                </>
              )}
            </Section>

            <Section title='章节结构' meta={`${chapters.length} 章 · 课程 → 章节 → 微课`}>
              <div className='chapter-manage'>
                {chapters.map((chapter) => (
                  <div className='chapter-manage-row' key={chapter.id}>
                    <span>{String(chapter.order).padStart(2, '0')}</span>
                    <div>
                      <strong>{chapter.title}</strong>
                      <small>
                        {course.lessons.filter((lesson) => lesson.chapterId === chapter.id).length} 个单元
                      </small>
                    </div>
                    <button
                      className='icon-button is-danger'
                      type='button'
                      title='删除章节'
                      onClick={() => void removeChapter(chapter.id, chapter.title)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {!chapters.length ? <p className='panel-note'>还没有章节，先建一个章节再放微课。</p> : null}
                <div className='chapter-add'>
                  <input
                    value={chapterTitle}
                    placeholder='新增章节，例如：第三章 三级让权'
                    onChange={(event) => setChapterTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void addChapter();
                    }}
                  />
                  <button
                    className='button button-secondary button-md'
                    type='button'
                    onClick={() => void addChapter()}
                  >
                    <Plus size={14} />
                    建章节
                  </button>
                </div>
              </div>
            </Section>

            <Section
              title='发布'
              meta={course.publishedAt ? `上次发布 ${relativeTime(course.publishedAt)}` : '从未发布'}
            >
              <div className='publish-panel'>
                <div className='publish-rule'>
                  <CheckCircle2 size={15} />
                  <span>ready 课时 {readyCount} 节会冻结进快照</span>
                </div>
                <div className='publish-rule'>
                  <CheckCircle2 size={15} />
                  <span>草稿课时不发布，学生看不到</span>
                </div>
                <div className='publish-rule'>
                  <CheckCircle2 size={15} />
                  <span>发布后继续改稿，只影响开发视图</span>
                </div>
                <button
                  className='button button-primary button-md is-full'
                  type='button'
                  disabled={busy || !readyCount}
                  onClick={() => void publish()}
                >
                  <Radio size={15} />
                  {busy ? '发布中…' : course.publishedVersion ? '重新发布' : '发布课程'}
                </button>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
