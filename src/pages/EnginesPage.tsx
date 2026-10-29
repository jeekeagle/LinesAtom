import { useState } from 'react';
import { Pencil, Play, Plus, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Badge, Field, Section, Toggle } from '../components/ui';
import type { EngineKind, LectureMode, ProductionStage } from '../types';

interface EngineDraft {
  name: string;
  description: string;
  stage: ProductionStage;
  kind: EngineKind;
  skillIds: string[];
}

const EMPTY_ENGINE: EngineDraft = {
  name: '',
  description: '',
  stage: 'media',
  kind: 'media',
  skillIds: []
};

const KIND_TEXT: Record<EngineKind, string> = {
  analysis: '分析',
  text: '文本',
  structure: '结构',
  media: '介质',
  quality: '质量'
};

export function EnginesPage() {
  const { data, setData, showToast, pushRuntime, runMode, setRunMode } = useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ summary: string; warnings: string[] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [engineDraft, setEngineDraft] = useState<EngineDraft>(EMPTY_ENGINE);
  const [savingEngine, setSavingEngine] = useState(false);
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

  if (!data) return null;
  const { engines, settings } = data;

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
    setEditingId(null);
    setEngineDraft(EMPTY_ENGINE);
    setCreating(true);
  };

  const openEdit = (engine: (typeof engines)[number]) => {
    setCreating(false);
    setEditingId(engine.id);
    setEngineDraft({
      name: engine.name,
      description: engine.description,
      stage: engine.stage,
      kind: engine.kind,
      skillIds: [...engine.skillIds]
    });
  };

  const closeEditor = () => {
    setCreating(false);
    setEditingId(null);
  };

  const saveEngine = async () => {
    if (!engineDraft.name.trim()) {
      showToast('介质引擎需要名称', 'error');
      return;
    }
    setSavingEngine(true);
    try {
      const result = creating
        ? await api.createEngine(engineDraft)
        : await api.updateEngine(editingId!, engineDraft);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      showToast(creating ? '介质引擎已新建' : '介质引擎已更新');
      closeEditor();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSavingEngine(false);
    }
  };

  const removeEngine = async (engine: (typeof engines)[number]) => {
    if (!window.confirm(`删除介质引擎「${engine.name}」？`)) return;
    try {
      const result = await api.deleteEngine(engine.id);
      setData((prev) => (prev ? { ...prev, engines: result.engines } : prev));
      if (editingId === engine.id) closeEditor();
      showToast('介质引擎已删除');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
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
      pushRuntime(
        '讲稿流水线',
        response.trace
      );
      setResult({
        summary: `${response.project.blocks.length} 块 · ${response.project.concepts.length} 概念 · ${response.project.pointers.length} 挂载`,
        warnings: response.warnings
      });
      showToast('流水线运行完成');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '运行失败', 'error');
    } finally {
      setRunning(false);
    }
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

  const stages = Array.from(new Set(engines.map((engine) => engine.stage)));

  return (
    <div className="workspace">
      <div className="workspace-inner">
        <header className="workspace-head">
          <div>
            <div className="course-kicker">MEDIUM ENGINES · 介质引擎</div>
            <h1>介质引擎</h1>
            <p>
              每个引擎按阶段编排一组技能：析课、切分标注、介质生成、挂载编排与验收。点击引擎可修改，也可以新建。
            </p>
          </div>
          <div className="button-row">
            <button className="button button-secondary button-md" type="button" onClick={openCreate}>
              <Plus size={15} />
              新建引擎
            </button>
            <button className="button button-secondary button-md" type="button" onClick={() => void relabel()} disabled={running}>
              <RefreshCw size={15} />
              重算标注与挂载
            </button>
            <button className="button button-primary button-md" type="button" onClick={() => void run()} disabled={running}>
              <Play size={15} />
              运行流水线
            </button>
          </div>
        </header>

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
            <Field label="目标时长（分钟）">
              <input
                type="number"
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, durationMinutes: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="认知负荷上限">
              <input
                type="number"
                value={form.cognitiveLoadCap}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cognitiveLoadCap: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="字数每分钟">
              <input
                type="number"
                value={form.charsPerMinute}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, charsPerMinute: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="块目标字数">
              <input
                type="number"
                value={form.blockTargetChars}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, blockTargetChars: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="设问占比下限">
              <input
                type="number"
                step="0.01"
                value={form.questionRatioFloor}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, questionRatioFloor: Number(event.target.value) }))
                }
              />
            </Field>
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
          {result?.warnings.length ? (
            <ul className="run-warnings is-open">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </Section>

        {creating ? (
          <Section title="新建介质引擎" meta="编排一组技能，按阶段参与流水线">
            <EngineEditor
              draft={engineDraft}
              onChange={(patch) => setEngineDraft((prev) => ({ ...prev, ...patch }))}
              skills={data.skills}
              stageLabels={data.stageLabels}
              creating
              busy={savingEngine}
              onSave={() => void saveEngine()}
              onCancel={closeEditor}
            />
          </Section>
        ) : null}

        {stages.map((stage) => (
          <Section
            key={stage}
            title={data.stageLabels[stage as keyof typeof data.stageLabels]}
            meta={`${engines.filter((engine) => engine.stage === stage).length} 个引擎`}
          >
            <div className="engine-grid">
              {engines
                .filter((engine) => engine.stage === stage)
                .map((engine) => (
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
                    <div className="engine-skills">
                      {engine.skillIds.map((skillId) => (
                        <span key={skillId}>{skillId}</span>
                      ))}
                    </div>
                    <details className="engine-config-detail">
                      <summary>配置</summary>
                      <ConfigEditor
                        engineId={engine.id}
                        config={engine.config}
                        onSave={(config) => void update(engine.id, { config })}
                      />
                    </details>
                    <div className="config-actions">
                      <button
                        className="button button-ghost button-sm"
                        type="button"
                        onClick={() => void setDefault(engine.id)}
                      >
                        <Star size={14} />
                        {engine.isDefault ? '默认引擎' : '设为默认'}
                      </button>
                      {engine.isDefault ? <Badge tone="ok">默认</Badge> : null}
                      <button
                        className="button button-ghost button-sm"
                        type="button"
                        onClick={() => openEdit(engine)}
                      >
                        <Pencil size={14} />
                        {editingId === engine.id ? '收起' : '编辑'}
                      </button>
                      <button
                        className="icon-button is-danger"
                        type="button"
                        title="删除引擎"
                        onClick={() => void removeEngine(engine)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {editingId === engine.id ? (
                      <EngineEditor
                        draft={engineDraft}
                        onChange={(patch) => setEngineDraft((prev) => ({ ...prev, ...patch }))}
                        skills={data.skills}
                        stageLabels={data.stageLabels}
                        busy={savingEngine}
                        onSave={() => void saveEngine()}
                        onCancel={closeEditor}
                      />
                    ) : null}
                  </article>
                ))}
            </div>
          </Section>
        ))}

        <Section title="运行环境" meta={`模型 ${settings.modelName || '未配置'}`}>
          <p className="muted-text">
            未配置模型服务时，全部流水线由本地确定性引擎完成；配置后，技能提示词会直接发给模型执行。
          </p>
        </Section>
      </div>
    </div>
  );
}

function ConfigEditor({
  engineId,
  config,
  onSave
}: {
  engineId: string;
  config: Record<string, string | number | boolean>;
  onSave: (config: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(JSON.stringify(config, null, 2));
  return (
    <div className="engine-config-editor">
      <textarea rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button
        className="button button-secondary button-sm"
        type="button"
        onClick={() => {
          try {
            onSave(JSON.parse(draft || '{}'));
          } catch {
            onSave(config);
          }
        }}
      >
        <Save size={14} />
        保存 {engineId}
      </button>
    </div>
  );
}

/** 引擎编辑器：改名、换阶段与类型、增删绑定技能。 */
function EngineEditor({
  draft,
  onChange,
  skills,
  stageLabels,
  creating,
  busy,
  onSave,
  onCancel
}: {
  draft: EngineDraft;
  onChange: (patch: Partial<EngineDraft>) => void;
  skills: { id: string; name: string }[];
  stageLabels: Record<string, string>;
  creating?: boolean;
  busy?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const toggleSkill = (id: string) => {
    onChange({
      skillIds: draft.skillIds.includes(id)
        ? draft.skillIds.filter((item) => item !== id)
        : [...draft.skillIds, id]
    });
  };

  return (
    <div className="engine-editor">
      <div className="engine-editor-head">
        <h4>{creating ? '填写引擎信息' : '编辑介质引擎'}</h4>
        <button className="icon-button" type="button" title="收起编辑" onClick={onCancel}>
          <X size={15} />
        </button>
      </div>
      <div className="engine-config-grid">
        <Field label="引擎名称">
          <input
            value={draft.name}
            placeholder="例如：介质生成引擎"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field label="所属阶段">
          <select
            value={draft.stage}
            onChange={(event) => onChange({ stage: event.target.value as ProductionStage })}
          >
            {Object.entries(stageLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="引擎类型">
          <select
            value={draft.kind}
            onChange={(event) => onChange({ kind: event.target.value as EngineKind })}
          >
            {(Object.keys(KIND_TEXT) as EngineKind[]).map((key) => (
              <option key={key} value={key}>
                {KIND_TEXT[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="说明">
          <input
            value={draft.description}
            placeholder="这个引擎负责什么"
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">绑定技能（已选 {draft.skillIds.length} / 共 {skills.length}）</span>
        <div className="engine-skill-picker">
          {skills.map((skill) => {
            const on = draft.skillIds.includes(skill.id);
            return (
              <button
                key={skill.id}
                type="button"
                className={`engine-skill-chip ${on ? 'is-on' : ''}`}
                onClick={() => toggleSkill(skill.id)}
              >
                {skill.name}
                <em>{skill.id}</em>
              </button>
            );
          })}
        </div>
      </div>
      <div className="config-actions">
        <button
          className="button button-primary button-sm"
          type="button"
          disabled={busy}
          onClick={onSave}
        >
          <Save size={14} />
          {busy ? '保存中…' : '保存引擎'}
        </button>
        <button className="button button-ghost button-sm" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
