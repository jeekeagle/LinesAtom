import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpenCheck, GraduationCap, Layers3, Plus, Radio, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Section, Stat } from '../components/ui';
import { formatClock, relativeTime } from '../lib/format';

export function CoursesPage() {
  const { data, refresh, showToast } = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    audience: ''
  });

  const courses = data?.courses ?? [];
  const lessonTotal = courses.reduce((sum, course) => sum + course.lessonCount, 0);
  const published = courses.filter((course) => course.publishedVersion > 0);
  const publishedLessons = published.reduce((sum, course) => sum + course.readyCount, 0);

  const submit = async () => {
    if (!form.title.trim()) {
      showToast('课程需要标题', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api.createCourse(form);
      showToast('课程已创建', 'success');
      setCreating(false);
      setForm({ title: '', subtitle: '', description: '', audience: '' });
      await refresh();
      navigate(`/courses/${result.course.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='workspace'>
      <div className='workspace-inner'>
        <header className='workspace-head'>
          <div>
            <div className='course-kicker'>COURSES · 课程台</div>
            <h1>一门课，很多条讲义轴</h1>
            <p>课程是开发容器：每个微课都是一条独立讲义轴；开发、保存、发布之后，学生端才会更新。</p>
          </div>
          <div className='button-row'>
            <Link className='button button-secondary button-md' to='/learn'>
              <GraduationCap size={15} />
              学生端
            </Link>
            <button className='button button-primary button-md' type='button' onClick={() => setCreating(true)}>
              <Plus size={15} />
              新建课程
            </button>
          </div>
        </header>

        <div className='stat-strip'>
          <Stat value={courses.length} label='课程' />
          <Stat value={lessonTotal} label='微课总数' />
          <Stat value={publishedLessons} label='已发布课时' tone='ok' />
          <Stat value={courses.filter((course) => course.dirty).length} label='有未发布改动' tone='warn' />
          <Stat
            value={formatClock(courses.reduce((sum, course) => sum + course.seconds, 0))}
            label='累计时长'
          />
        </div>

        {creating ? (
          <div className='course-form' role='dialog' aria-label='新建课程'>
            <div className='course-form-head'>
              <h2>新建课程</h2>
              <button className='icon-button' type='button' title='关闭' onClick={() => setCreating(false)}>
                <X size={15} />
              </button>
            </div>
            <div className='field-grid'>
              <label className='field'>
                <span className='field-label'>课程标题</span>
                <input
                  value={form.title}
                  autoFocus
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder='例如：Agent 设计与应用'
                />
              </label>
              <label className='field'>
                <span className='field-label'>副标题</span>
                <input
                  value={form.subtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                  placeholder='一句话说清这门课解决什么'
                />
              </label>
              <label className='field'>
                <span className='field-label'>受众</span>
                <input
                  value={form.audience}
                  onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
                  placeholder='谁来看'
                />
              </label>
            </div>
            <label className='field'>
              <span className='field-label'>课程简介</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder='学生在课程页看到的第一段说明'
              />
            </label>
            <div className='button-row is-end'>
              <button className='button button-secondary button-md' type='button' onClick={() => setCreating(false)}>
                取消
              </button>
              <button className='button button-primary button-md' type='button' disabled={busy} onClick={() => void submit()}>
                {busy ? '创建中…' : '创建并进入'}
              </button>
            </div>
          </div>
        ) : null}

        <Section title='课程列表' meta={`${courses.length} 门 · 发布后学生可见`}>
          <div className='course-grid'>
            {courses.map((course) => {
              const percent = course.lessonCount
                ? Math.round((course.readyCount / course.lessonCount) * 100)
                : 0;
              return (
                <article className='course-card' key={course.id}>
                  <div className='course-card-head'>
                    <span className='course-card-icon'>
                      <Layers3 size={18} />
                    </span>
                    <div>
                      <h3>{course.title}</h3>
                      <p>{course.subtitle || '尚未填写副标题'}</p>
                    </div>
                  </div>
                  <div className='course-card-meta'>
                    <span>
                      <BookOpenCheck size={14} />
                      {course.readyCount}/{course.lessonCount} 课时就绪
                    </span>
                    <span>{relativeTime(course.updatedAt)}</span>
                  </div>
                  <div className='course-progress'>
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className='course-card-foot'>
                    {course.publishedVersion > 0 ? (
                      <span className='badge badge-ok'>
                        <Radio size={12} />
                        已发布 v{course.publishedVersion}
                      </span>
                    ) : (
                      <span className='badge badge-warn'>未发布 · 草稿</span>
                    )}
                    {course.dirty ? <span className='badge badge-accent'>有未发布改动</span> : null}
                    <Link className='button button-secondary button-sm' to={`/courses/${course.id}`}>
                      进入开发
                    </Link>
                  </div>
                </article>
              );
            })}
            {!courses.length ? (
              <div className='empty-state'>
                <strong>还没有课程</strong>
                <p>先建课程，再往里面加微课；每个微课就是一条讲义轴。</p>
              </div>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
