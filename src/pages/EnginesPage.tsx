import { useEffect, useState } from 'react';
import { ChevronRight, Copy, Play, Plus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Badge, Field, Section, Toggle } from '../components/ui';
import { EngineGuide } from '../components/EngineGuide';
import {
  ENGINE_KIND_LABELS,
  ENGINE_STEPS,
  draftFromEngine,
  emptyDraft,
  engineProgress,
  mergeSkillDefaults,
  type EngineDraft,
  type EngineStepId
} from '../lib/enginePlan';
import type { LectureMode, ProductionEngine } from '../types';

export function EnginesPage() {
  const { data, setData, showToast, pushRuntime, runMode, setRunMode } = useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    summary: string;
    warnings: string[];
    enginesUsed: {
      analysis: string;
      script: string;
      mount: string;
      quality: string;
      media: string[];
    };
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<'all' | 'todo' | 'ready'>('all');
  const [guide, setGuide] = useState<{
    mode: 'create' | 'edit';
    engineId: string | null;
    step: EngineStepId;
  } | null>(null);
  const [plan, setPlan] = useState<{
    effective: { key: string; label: string; value: number; source: string }[];
    enginesUsed: {
      analysis: string;
      script: string;
      mount: string;
      quality: string;
      media: string[];
    };
  } | null>(null);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EngineDraft>(emptyDraft());
  const [form, setForm] = useState({
    topic: '',
    title: '',
    subtitle: '',
    material: '',
    skeleton: '',
    durationMinutes: 28,
    cognitiveLoadCap: 14,
    charsPerMinute: 112,
    blockTargetChars: 150,
    questionRatioFloor: 0.08
  });

  useEffect(() => {
    let alive = true;
    void api.enginePlan().then((next) => {
      if (alive) setPlan(next);
    });
    return () => {
      alive = false;
    };
  }, [data?.engines]);

  if (!data) return null;
  const { engines, settings } = data;

  const progressOf = (engine: ProductionEngine) => engineProgress(engine, data.skills);
  const allProgress = engines.map(progressOf);
  const overview = {
    total: allProgress.length,
    ready: allProgress.filter((item) => item.ready).length,
    todo: allProgress.filter((item) => !item.ready).length,
    custom: engines.filter((engine) => !engine.builtIn).length
  };

  const update = async (id: string, payload: Record<string, unknown>) => {
    try {
      const result = await api.updateEngine(id, payload);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新失败', 'error');
    }
  };

  const setDefault = async (id: string) => {
    try {
      const result = await api.setDefaultEngine(id);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      showToast('默认引擎已切换');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换失败', 'error');
    }
  };

  const openCreate = () => {
    setDraft(emptyDraft());
    setGuide({ mode: 'create', engineId: null, step: 'scope' });
  };

  const openGuide = (engine: ProductionEngine) => {
    setDraft(draftFromEngine(engine));
    setGuide({ mode: 'edit', engineId: engine.id, step: progressOf(engine).current });
  };

  const closeGuide = () => {
    setGuide(null);
    setDraft(emptyDraft());
  };

  const submitGuide = async (advance: boolean) => {
    if (!draft.name.trim()) {
      showToast('介质引擎需要名称', 'error');
      setGuide((prev) => (prev ? { ...prev, step: 'scope' } : prev));
      return;
    }
    if (!guide) return;
    setSaving(true);
    try {
      const isCreate = guide.mode === 'create';
      const result = isCreate
        ? await api.createEngine(draft)
        : await api.updateEngine(guide.engineId!, draft);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      showToast(isCreate ? '介质引擎已创建' : '介质引擎已更新');
      if (isCreate) {
        const created = result.engines[0];
        setGuide({ mode: 'edit', engineId: created?.id ?? null, step: advance ? 'skills' : 'scope' });
      } else if (advance) {
        const index = ENGINE_STEPS.findIndex((item) => item.id === guide.step);
        const next = ENGINE_STEPS[Math.min(ENGINE_STEPS.length - 1, index + 1)].id;
        setGuide((prev) => (prev ? { ...prev, step: next } : prev));
      } else {
        closeGuide();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const guideSetDefault = async () => {
    if (!guide?.engineId) {
      showToast('先保存引擎，再设为默认', 'info');
      return;
    }
    await setDefault(guide.engineId);
  };

  const guideDelete = async () => {
    if (!guide?.engineId) return;
    const engine = engines.find((item) => item.id === guide.engineId);
    if (!engine) return;
    if (!window.confirm(`删除介质引擎「${engine.name}」？`)) return;
    try {
      const result = await api.deleteEngine(engine.id);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      showToast('介质引擎已删除');
      closeGuide();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  const guideClone = async () => {
    if (!guide?.engineId) return;
    try {
      const result = await api.cloneEngine(guide.engineId);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      const clone = result.engines[0];
      setDraft(clone ? draftFromEngine(clone) : draft);
      setGuide({ mode: 'edit', engineId: clone?.id ?? null, step: 'scope' });
      showToast('已复制一份，可以放心改动');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  };

  const guideRun = async (_skillId: string, input: string) => {
    if (!guide?.engineId) throw new Error('引擎还没保存，先完成前面的步骤');
    const result = await api.trialEngine(guide.engineId, input);
    setData((prev) =>
      prev
        ? { ...prev, engines: result.engines, skills: result.skills ?? prev.skills }
        : prev
    );
    return {
      output: result.output,
      fallback: result.fallback,
      provider: result.provider,
      model: result.model,
      warning: result.warning
    };
  };

  const relabel = async () => {
    setRunning(true);
    try {
      const response = await api.relabel();
      setData((prev) =>
        prev ? { ...prev, project: response.project, validation: response.validation } : prev
      );
      pushRuntime('标注与挂载重算', response.trace);
      showToast('标注与挂载已重算');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重算失败', 'error');
    } finally {
      setRunning(false);
    }
  };

  const run = async () => {
    if (!form.material.trim()) {
      showToast('先粘贴讲稿素材', 'info');
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await api.runLecture({
        ...form,
        topic: form.topic || form.title || '未命名讲稿',
        mode: runMode as LectureMode
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              project: response.project,
              validation: response.validation,
              runs: [
                {
                  runId: response.project.meta.engineRunId,
                  engineId: 'engine-script-default',
                  mode: runMode as LectureMode,
                  startedAt: new Date().toISOString(),
                  finishedAt: new Date().toISOString(),
                  durationMs: 0,
                  provider: 'local-deterministic',
                  trace: response.trace,
                  warnings: response.warnings,
                  output: `${response.project.blocks.length} 块 · ${response.project.pointers.length} 挂载`
                },
                ...prev.runs
              ]
            }
          : prev
      );
      pushRuntime('讲稿流水线', response.trace);
      setResult({
        summary: `${response.project.blocks.length} 块 · ${response.project.concepts.length} 概念 · ${response.project.pointers.length} 挂载`,
        warnings: response.warnings,
        enginesUsed: response.enginesUsed
      });
      showToast('流水线运行完成');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '运行失败', 'error');
    } finally {
      setRunning(false);
    }
  };

  const stages = Array.from(new Set(engines.map((engine) => engine.stage)));
  const keyword = filter.trim().toLowerCase();
  const visibleEngines = engines.filter((engine) => {
    const hit =
      !keyword ||
      engine.name.toLowerCase().includes(keyword) ||
      engine.description.toLowerCase().includes(keyword) ||
      engine.skillIds.some((id) => id.toLowerCase().includes(keyword));
    if (!hit) return false;
    if (status === 'todo') return !progressOf(engine).ready;
    if (status === 'ready') return progressOf(engine).ready;
    return true;
  });

  return (
    <div className="workspace">
      <div className="workspace-inner">
        <header className="workspace-head">
          <div>
            <div className="course-kicker">MEDIUM ENGINES · 介质引擎</div>
            <h1>介质引擎</h1>
            <p>
              引擎决定「在什么阶段、用哪些技能、按什么参数产出内容」。新建后按四步走完，就能在流水线里顶替默认引擎。
            </p>
          </div>
          <div className="button-row">
            <button className="button button-primary button-md" type="button" onClick={openCreate}>
              <Plus size={15} />
              新建引擎
            </button>
            <button className="button button-secondary button-md" type="button" onClick={() => void relabel()} disabled={running}>
              <RefreshCw size={15} />
              重算标注与挂载
            </button>
            <button className="button button-secondary button-md" type="button" onClick={() => void run()} disabled={running}>
              <Play size={15} />
              运行流水线
            </button>
          </div>
        </header>

        <Section
          title="引擎就绪度"
          meta={`${overview.total} 个引擎 · ${overview.ready} 个就绪 · ${overview.todo} 个待配置 · ${overview.custom} 个自定义`}
        >
          <div className="engine-overview">
            <button
              className={`engine-overview-item ${status === 'all' ? 'is-on' : ''}`}
              type="button"
              onClick={() => setStatus('all')}
            >
              <span className="engine-overview-value">{overview.total}</span>
              <span className="engine-overview-label">全部引擎</span>
            </button>
            <button
              className={`engine-overview-item ${status === 'todo' ? 'is-on' : ''}`}
              type="button"
              onClick={() => setStatus('todo')}
            >
              <span className="engine-overview-value">{overview.todo}</span>
              <span className="engine-overview-label">待配置</span>
            </button>
            <button
              className={`engine-overview-item ${status === 'ready' ? 'is-on' : ''}`}
              type="button"
              onClick={() => setStatus('ready')}
            >
              <span className="engine-overview-value">{overview.ready}</span>
              <span className="engine-overview-label">已就绪</span>
            </button>
            <div className="engine-overview-search">
              <Search size={14} />
              <input
                value={filter}
                placeholder="搜引擎名、说明或技能"
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
          </div>
        </Section>

        <Section title="运行流水线" meta={`模式 ${data.modeLabels[runMode as keyof typeof data.modeLabels]}`}>
          <div className="engine-config-grid">
            <Field label="生产模式">
              <select value={runMode} onChange={(event) => setRunMode(event.target.value as LectureMode)}>
                {Object.entries(data.modeLabels).map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="课程主题">
              <input
                value={form.topic}
                onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
                placeholder="例如：结构化讲稿系统"
              />
            </Field>
            <Field label="讲稿标题">
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="留空则用主题"
              />
            </Field>
            <div className="field field-wide">
              <span className="field-label">流水线参数（取自各阶段默认引擎）</span>
              <div className="engine-param-plan">
                {plan?.effective.map((item) => (
                  <span className="engine-param-chip" key={item.key}>
                    <strong>{item.label}</strong>
                    <em>{item.value}</em>
                    <i>{item.source}</i>
                  </span>
                ))}
                <button
                  className="button button-ghost button-sm"
                  type="button"
                  onClick={() => navigate('/engines')}
                >
                  去介质引擎调整
                </button>
              </div>
            </div>
            <Field label="副标题">
              <input
                value={form.subtitle}
                onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                placeholder="留空则取首句"
              />
            </Field>
            <div className="field field-wide">
              <span className="field-label">讲稿素材</span>
              <textarea
                rows={9}
                value={form.material}
                onChange={(event) => setForm((prev) => ({ ...prev, material: event.target.value }))}
                placeholder={'粘贴讲稿原文。可使用 # / 章节标题 / 一、 等标记划分章节。'}
              />
            </div>
            <div className="field field-wide">
              <span className="field-label">骨架概念（可选，每行：名称 | 定义 | 上位类）</span>
              <textarea
                rows={4}
                value={form.skeleton}
                onChange={(event) => setForm((prev) => ({ ...prev, skeleton: event.target.value }))}
                placeholder={'记录权 | 决定一件事以什么方式被记录、由谁记录的权力。 | 三级让权模型'}
              />
            </div>
          </div>
          {result ? (
            <div className="engine-run-line">
              <Play size={15} />
              <span>
                运行完成：{result.summary}
                {result.warnings.length ? ` · ${result.warnings.length} 条提醒` : ''}
              </span>
            </div>
          ) : null}
          {result?.enginesUsed ? (
            <p className="muted-text engine-run-engines">
              本次运行使用：分析 {result.enginesUsed.analysis} · 讲稿 {result.enginesUsed.script} ·
              挂载 {result.enginesUsed.mount} · 介质 {result.enginesUsed.media.length} 个 ·
              验收 {result.enginesUsed.quality}
            </p>
          ) : null}
          {result?.warnings.length ? (
            <ul className="run-warnings is-open">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </Section>

        {stages.map((stage) => {
          const list = visibleEngines.filter((engine) => engine.stage === stage);
          if (!list.length) return null;
          return (
            <Section
              key={stage}
              title={data.stageLabels[stage as keyof typeof data.stageLabels]}
              meta={`${list.length} 个引擎`}
            >
              <div className="engine-grid">
                {list.map((engine) => {
                  const progress = progressOf(engine);
                  const nextStep = ENGINE_STEPS.find((item) => item.id === progress.current);
                  return (
                    <article className="engine-card" key={engine.id}>
                      <div className="skill-card-top">
                        <div>
                          <div className="skill-name">{engine.name}</div>
                          <div className="skill-id">
                            {engine.id} · 运行 {engine.runs} 次
                          </div>
                        </div>
                        <Toggle
                          checked={engine.enabled}
                          label={`${engine.name} 启用开关`}
                          onChange={(next) => void update(engine.id, { enabled: next })}
                        />
                      </div>
                      <p>{engine.description}</p>
                      <div className="engine-badges">
                        <Badge tone="neutral">{data.stageLabels[engine.stage]}</Badge>
                        <Badge tone="neutral">{ENGINE_KIND_LABELS[engine.kind]}</Badge>
                        {engine.isDefault ? <Badge tone="ok">默认</Badge> : null}
                        {!engine.builtIn ? <Badge tone="accent">自定义</Badge> : null}
                      </div>
                      <div className="engine-progress">
                        <div className="engine-progress-bar">
                          {ENGINE_STEPS.map((item) => (
                            <span
                              key={item.id}
                              className={`engine-progress-tick ${progress.done[item.id] ? 'is-done' : ''}`}
                              title={item.label}
                            />
                          ))}
                        </div>
                        <span className="engine-progress-text">
                          {progress.ready
                            ? '四步已走完，可直接参与流水线'
                            : `${progress.count}/4 已配置 · 下一步：${nextStep?.label ?? ''}`}
                        </span>
                      </div>
                      <div className="engine-skills">
                        {engine.skillIds.length ? (
                          engine.skillIds.map((skillId) => <span key={skillId}>{skillId}</span>)
                        ) : (
                          <span className="is-empty">未绑定技能</span>
                        )}
                      </div>
                      {Object.keys(engine.config).length ? (
                        <div className="engine-skills">
                          {Object.entries(engine.config)
                            .slice(0, 4)
                            .map(([key, value]) => (
                              <span key={key}>
                                {key} = {String(value)}
                              </span>
                            ))}
                        </div>
                      ) : null}
                      <div className="config-actions">
                        <button
                          className="button button-primary button-sm"
                          type="button"
                          onClick={() => openGuide(engine)}
                        >
                          {progress.ready ? '查看配置' : '继续配置'}
                          <ChevronRight size={14} />
                        </button>
                        <button
                          className="button button-ghost button-sm"
                          type="button"
                          onClick={() => void setDefault(engine.id)}
                        >
                          <Star size={14} />
                          {engine.isDefault ? '默认引擎' : '设为默认'}
                        </button>
                        <button
                          className="button button-ghost button-sm"
                          type="button"
                          onClick={() => void guideCloneFor(engine)}
                        >
                          <Copy size={14} />
                          复制
                        </button>
                        <button
                          className="icon-button is-danger"
                          type="button"
                          title="删除引擎"
                          onClick={() => void deleteEngine(engine)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </Section>
          );
        })}

        <Section title="运行环境" meta={`模型 ${settings.modelName || '未配置'}`}>
          <p className="muted-text">
            未配置模型服务时，全部流水线由本地确定性引擎完成；配置后，技能提示词会直接发给模型执行。
          </p>
        </Section>
      </div>

      {guide ? (
        <EngineGuide
          mode={guide.mode}
          draft={draft}
          onChange={(patch) =>
            setDraft((prev) => {
              const next = { ...prev, ...patch };
              return patch.skillIds ? mergeSkillDefaults(next, data.skills) : next;
            })
          }
          skills={data.skills}
          engines={engines}
          stageLabels={data.stageLabels}
          step={guide.step}
          onStep={(step) => setGuide((prev) => (prev ? { ...prev, step } : prev))}
          onClose={closeGuide}
          onSubmit={(advance) => void submitGuide(advance)}
          onSetDefault={() => void guideSetDefault()}
          onDelete={() => void guideDelete()}
          onClone={() => void guideClone()}
          onRun={guideRun}
          busy={saving}
        />
      ) : null}
    </div>
  );

  async function guideCloneFor(engine: ProductionEngine) {
    try {
      const result = await api.cloneEngine(engine.id);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      const clone = result.engines[0];
      if (clone) openGuide(clone);
      showToast('已复制一份，可以放心改动');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  }

  async function deleteEngine(engine: ProductionEngine) {
    if (!window.confirm(`删除介质引擎「${engine.name}」？`)) return;
    try {
      const result = await api.deleteEngine(engine.id);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      showToast('介质引擎已删除');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  }
}