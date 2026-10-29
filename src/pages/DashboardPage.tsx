import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Layers,
  ListTree,
  Play,
  Quote,
  ScrollText,
  Table2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Section, Stat } from '../components/ui';
import { formatTime, percent } from '../lib/format';

export function DashboardPage() {
  const { data } = useApp();
  if (!data) return null;
  const { project, validation, activity } = data;
  const engineSnapshot = project.engineSnapshot;
  const accepted = validation.checks.slice(0, 4).filter((check) => check.pass).length;

  return (
    <div className="workspace">
      <div className="workspace-inner">
        <header className="workspace-head">
          <div>
            <div className="course-kicker">LECTURE AXIS · 讲义轴</div>
            <h1>{project.meta.title}</h1>
            <p>{project.meta.subtitle}</p>
          </div>
          <div className="button-row">
            <Link className="button button-secondary button-md" to="/lecture">
              <ScrollText size={15} />
              进入阅读台
            </Link>
            <Link className="button button-primary button-md" to="/engines">
              <Play size={15} />
              运行流水线
            </Link>
          </div>
        </header>

        <div className="stat-strip">
          <Stat value={project.blocks.length} label="讲稿块" />
          <Stat value={project.concepts.length} label="概念条目" />
          <Stat value={project.pointers.length} label="挂载指针" />
          <Stat
            value={percent(validation.metrics.questionRatio)}
            label="设问互动占比"
            tone={validation.metrics.questionRatio >= project.meta.questionRatioFloor ? 'ok' : 'warn'}
          />
          <Stat
            value={`${accepted}/4`}
            label="首版验收通过"
            tone={accepted === 4 ? 'ok' : 'warn'}
          />
        </div>

        <div className="content-split">
          <div>
            <Section title="首版验收" meta={`修订 ${project.meta.revision}`}>
              <div className="validation-list">
                {validation.checks.slice(0, 4).map((check) => (
                  <div className="validation-row" key={check.id}>
                    <span className={`check-mark ${check.pass ? '' : 'is-fail'}`}>
                      {check.pass ? <Check size={15} /> : <CircleAlert size={15} />}
                    </span>
                    <div className="validation-main">
                      <h3>{check.title}</h3>
                      <p>{check.detail}</p>
                    </div>
                    <div className="validation-evidence">
                      <strong>{check.value}</strong>
                      {check.evidence}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="介质分布" meta="按标签一一对应挂载">
              <div className="type-summary">
                {(
                  [
                    ['概念卡', 'concept', project.concepts.length],
                    ['案例', 'case', project.media.cases.length],
                    ['问答', 'qa', project.media.qas.length],
                    ['速查表', 'cheatsheet', project.media.cheatsheets.length],
                    ['课件页', 'slide', project.media.slides.length],
                    ['导图', 'map', project.media.maps.length]
                  ] as const
                ).map(([label, kind, count]) => (
                  <div className="type-row" key={kind}>
                    <div>
                      <div className="type-name">{label}</div>
                      <div className="type-desc">
                        {data.mountRules[
                          (kind === 'case'
                            ? 'example'
                            : kind === 'qa'
                              ? 'question'
                              : kind === 'cheatsheet'
                                ? 'conclusion'
                                : kind === 'concept'
                                  ? 'core'
                                  : 'global') as keyof typeof data.mountRules
                        ]
                          ? `挂载于「${
                              data.labels[
                                (kind === 'case'
                                  ? 'example'
                                  : kind === 'qa'
                                    ? 'question'
                                    : kind === 'cheatsheet'
                                      ? 'conclusion'
                                      : kind === 'concept'
                                        ? 'core'
                                        : 'global') as keyof typeof data.labels
                            ]
                          }」`
                          : '全局定位按章节导航或课件页挂载'}
                      </div>
                    </div>
                    <span className="type-count">{count}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <div>
            <Section title="流水线状态" meta={engineSnapshot.runId || 'seed'}>
              <div className="pipeline">
                {engineSnapshot.pipeline.map((step, index) => (
                  <div className="pipeline-step is-completed" key={step.id}>
                    <span className="pipeline-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="pipeline-name">{step.name}</div>
                      <div className="pipeline-meta">{step.state}</div>
                    </div>
                    <span className="pipeline-count">{step.count || '—'}</span>
                  </div>
                ))}
              </div>
              <Link className="inline-link" to="/engines">
              打开介质引擎重新运行 <ArrowUpRight size={13} />
              </Link>
            </Section>

            <Section title="结构速览">
              <ul className="insight-list">
                <li>
                  <ListTree size={15} />
                  <span>
                    概念关系网 {project.concepts.length} 个节点，
                    {project.concepts.filter((item) => item.parentId).length} 个有上位类
                  </span>
                </li>
                <li>
                  <Layers size={15} />
                  <span>
                    挂载 {project.pointers.length} 处，回指位置只标跳转不重复挂载
                  </span>
                </li>
                <li>
                  <Quote size={15} />
                  <span>正文 {validation.metrics.chars} 字，按 {project.meta.charsPerMinute} 字每分钟倒推</span>
                </li>
                <li>
                  <Table2 size={15} />
                  <span>预计讲述 {validation.metrics.estimatedMinutes} 分钟</span>
                </li>
              </ul>
            </Section>

            <Section title="最近活动">
              <ul className="activity-list">
                {activity.slice(0, 6).map((event) => (
                  <li key={event.id}>
                    <Badge tone={event.kind === 'engine' ? 'accent' : 'neutral'}>{event.kind}</Badge>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.detail}</p>
                    </div>
                    <span className="activity-time">{formatTime(event.at)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
