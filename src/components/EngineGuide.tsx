import { useMemo, useState } from 'react';
import { Check, Copy, Play, Save, Trash2, X } from 'lucide-react';
import {
  ENGINE_KIND_LABELS,
  ENGINE_STEPS,
  configFields,
  skillCandidates,
  type EngineDraft,
  type EngineStepId
} from '../lib/enginePlan';
import { Badge, Field, Toggle } from './ui';
import type { AgentSkill, EngineKind, ProductionEngine, ProductionStage } from '../types';

export interface EngineRunResult {
  output: unknown;
  fallback: boolean;
  provider: string;
  model: string;
  warning?: string;
}

interface EngineGuideProps {
  mode: 'create' | 'edit';
  draft: EngineDraft;
  onChange: (patch: Partial<EngineDraft>) => void;
  skills: AgentSkill[];
  engines: ProductionEngine[];
  stageLabels: Record<string, string>;
  step: EngineStepId;
  onStep: (step: EngineStepId) => void;
  onClose: () => void;
  onSubmit: (advance: boolean) => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onClone: () => void;
  onRun: (skillId: string, input: string) => Promise<EngineRunResult>;
  busy?: boolean;
}

/** 引擎配置向导：新建之后按定位 → 技能 → 参数 → 启用试跑走完。 */
export function EngineGuide({
  mode,
  draft,
  onChange,
  skills,
  engines,
  stageLabels,
  step,
  onStep,
  onClose,
  onSubmit,
  onSetDefault,
  onDelete,
  onClone,
  onRun,
  busy
}: EngineGuideProps) {
  const [runInput, setRunInput] = useState('');
  const [runResult, setRunResult] = useState<EngineRunResult | null>(null);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);

  const candidates = useMemo(() => skillCandidates(draft.stage, skills), [draft.stage, skills]);
  const fields = useMemo(() => configFields(draft, skills), [draft, skills]);
  const stageDefault = engines.find((engine) => engine.stage === draft.stage && engine.isDefault);
  const boundSkills = draft.skillIds
    .map((id) => skills.find((skill) => skill.id === id))
    .filter((skill): skill is AgentSkill => Boolean(skill));
  const skillUsage = (id: string) => engines.filter((engine) => engine.skillIds.includes(id)).length;

  const stepIndex = ENGINE_STEPS.findIndex((item) => item.id === step);
  const isLast = stepIndex === ENGINE_STEPS.length - 1;

  const toggleSkill = (id: string) => {
    onChange({
      skillIds: draft.skillIds.includes(id)
        ? draft.skillIds.filter((item) => item !== id)
        : [...draft.skillIds, id]
    });
  };

  const setConfig = (key: string, value: string | number | boolean) => {
    onChange({ config: { ...draft.config, [key]: value } });
  };

  const runTrial = async () => {
    const skill = boundSkills[0];
    if (!skill) return;
    setRunning(true);
    setRunError('');
    try {
      const result = await onRun(skill.id, runInput);
      setRunResult(result);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : '试运行失败');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="engine-guide" role="dialog" aria-modal='true' aria-label='引擎配置向导'>
      <div className="engine-guide-scrim" onClick={onClose} />
      <section className="engine-guide-panel">
        <header className="engine-guide-head">
          <div>
            <div className="course-kicker">
              {mode === 'create' ? '新建介质引擎' : '配置介质引擎'}
            </div>
            <h2>{draft.name.trim() || '未命名引擎'}</h2>
            <p className="muted-text">
              {stageLabels[draft.stage]} · {ENGINE_KIND_LABELS[draft.kind]}
              {mode === 'create' ? ' · 走完四步即可保存' : ''}
            </p>
          </div>
          <button className='icon-button' type='button' title='关闭向导' onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <nav className='engine-guide-steps'>
          {ENGINE_STEPS.map((item, index) => {
            const isDone = stepIndex > index;
            return (
              <button
                key={item.id}
                type='button'
                className={`engine-guide-step ${item.id === step ? 'is-current' : ''} ${
                  isDone ? 'is-done' : ''
                }`}
                onClick={() => onStep(item.id)}
              >
                <span className='engine-guide-step-index'>{isDone ? <Check size={12} /> : index + 1}</span>
                <span className='engine-guide-step-label'>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className='engine-guide-body'>
          {step === 'scope' ? (
            <div className='engine-guide-step-body'>
              <p className='engine-guide-hint'>
                引擎决定“在什么阶段、用什么技能、按什么参数产出内容”。先把归属说清楚，后面的技能才会对得上。
              </p>
              <div className='engine-config-grid'>
                <Field label='引擎名称' hint='给同阶段的其他引擎一个区分'>
                  <input
                    value={draft.name}
                    placeholder='例如：结论收束介质引擎'
                    onChange={(event) => onChange({ name: event.target.value })}
                  />
                </Field>
                <Field label='所属阶段'>
                  <select
                    value={draft.stage}
                    onChange={(event) =>
                      onChange({
                        stage: event.target.value as ProductionStage,
                        skillIds: draft.skillIds.filter((id) =>
                          skills.some((skill) => skill.id === id && skill.stage === event.target.value)
                        )
                      })
                    }
                  >
                    {Object.entries(stageLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label='引擎类型'>
                  <select
                    value={draft.kind}
                    onChange={(event) => onChange({ kind: event.target.value as EngineKind })}
                  >
                    {Object.entries(ENGINE_KIND_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label='说明' hint='一句话说明它解决什么问题'>
                  <input
                    value={draft.description}
                    placeholder='例如：为结论收束生成速查表或闪卡'
                    onChange={(event) => onChange({ description: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 'skills' ? (
            <div className='engine-guide-step-body'>
              <p className='engine-guide-hint'>
                引擎靠技能干活。{stageLabels[draft.stage]}阶段以下技能最合适，跨阶段技能也能用，但要先确认它输出的是同类内容。
              </p>
              <div className='engine-guide-skill-group'>
                <span className='engine-guide-group-title'>本阶段技能</span>
                <div className='engine-skill-picker'>
                  {candidates.same.map((skill) => (
                    <button
                      key={skill.id}
                      type='button'
                      className={`engine-skill-chip ${draft.skillIds.includes(skill.id) ? 'is-on' : ''}`}
                      onClick={() => toggleSkill(skill.id)}
                    >
                      {skill.name}
                      <em>{skill.id} · {skillUsage(skill.id)} 个引擎在用</em>
                    </button>
                  ))}
                </div>
                <p className='engine-guide-skill-desc'>
                  {candidates.same.find((skill) => draft.skillIds.includes(skill.id))?.description ??
                    '还没有选技能。点一个技能名即可绑定。'}
                </p>
              </div>
              {candidates.other.length ? (
                <details className='engine-guide-fold'>
                  <summary>其他阶段的技能（{candidates.other.length}）</summary>
                  <div className='engine-skill-picker'>
                    {candidates.other.map((skill) => (
                      <button
                        key={skill.id}
                        type='button'
                        className={`engine-skill-chip ${draft.skillIds.includes(skill.id) ? 'is-on' : ''}`}
                        onClick={() => toggleSkill(skill.id)}
                      >
                        {skill.name}
                        <em>{stageLabels[skill.stage]}</em>
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
              <div className='engine-guide-quick'>
                <button
                  className='button button-secondary button-sm'
                  type='button'
                  disabled={!stageDefault || !stageDefault.skillIds.length}
                  onClick={() => onChange({ skillIds: [...(stageDefault?.skillIds ?? [])] })}
                >
                  <Copy size={14} />
                  沿用默认引擎的技能
                </button>
                <span className='muted-text'>
                  {stageDefault ? `当前默认：${stageDefault.name}` : '本阶段还没有默认引擎'}
                </span>
              </div>
            </div>
          ) : null}

          {step === 'params' ? (
            <div className='engine-guide-step-body'>
              <p className='engine-guide-hint'>
                参数决定产出规模与风格。技能自带的旋钮已经预填在这里，改完立刻生效。
              </p>
              {fields.length ? (
                <div className='engine-config-grid'>
                  {fields.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      hint={field.hint ?? (field.source === 'skill' ? '来自绑定技能的默认旋钮' : '引擎自有参数')}
                    >
                      {field.type === 'boolean' ? (
                        <Toggle
                          checked={Boolean(field.value)}
                          label={`${field.label} 开关`}
                          onChange={(next) => setConfig(field.key, next)}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={String(field.value)}
                          onChange={(event) => setConfig(field.key, event.target.value)}
                        >
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'number' ? (
                        <input
                          type='number'
                          value={Number(field.value)}
                          onChange={(event) => setConfig(field.key, Number(event.target.value))}
                        />
                      ) : (
                        <input
                          value={String(field.value)}
                          onChange={(event) => setConfig(field.key, event.target.value)}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              ) : (
                <p className='muted-text'>先在上一步绑定技能，参数会跟着技能一起出现。</p>
              )}
              <div className='engine-guide-quick'>
                <button
                  className='button button-secondary button-sm'
                  type='button'
                  disabled={!stageDefault || !Object.keys(stageDefault.config).length}
                  onClick={() => onChange({ config: { ...(stageDefault?.config ?? {}) } })}
                >
                  <Copy size={14} />
                  沿用默认引擎的参数
                </button>
                <span className='muted-text'>
                  {stageDefault ? `当前默认：${stageDefault.name}` : '本阶段还没有默认引擎'}
                </span>
              </div>
            </div>
          ) : null}

          {step === 'activate' ? (
            <div className='engine-guide-step-body'>
              <p className='engine-guide-hint'>
                最后一步：确认引擎是否启用、是否作为本阶段默认，并先跑一次看看产出。
              </p>
              <div className='engine-guide-toggle-row'>
                <span>启用引擎</span>
                <Toggle
                  checked={draft.enabled}
                  label='启用这个引擎'
                  onChange={(next) => onChange({ enabled: next })}
                />
              </div>
              <div className='engine-guide-quick'>
                <button className='button button-secondary button-sm' type='button' onClick={onSetDefault}>
                  <Check size={14} />
                  设为本阶段默认
                </button>
                <span className='muted-text'>
                  {stageDefault ? `当前默认：${stageDefault.name}` : '本阶段还没有默认引擎'}
                </span>
              </div>

              <div className='engine-guide-trial'>
                <span className='engine-guide-group-title'>试运行</span>
                {boundSkills.length ? (
                  <>
                    <p className='muted-text'>用「{boundSkills[0].name}」跑一段讲稿，看看引擎实际产出什么。</p>
                    <textarea
                      rows={4}
                      value={runInput}
                      placeholder='粘贴一段讲稿原文'
                      onChange={(event) => setRunInput(event.target.value)}
                    />
                    <div className='engine-guide-quick'>
                      <button
                        className='button button-primary button-sm'
                        type='button'
                        disabled={running || !runInput.trim()}
                        onClick={() => void runTrial()}
                      >
                        <Play size={14} />
                        {running ? '运行中…' : '试运行'}
                      </button>
                      {running ? <span className='muted-text'>模型生成中，通常 10 到 30 秒。</span> : null}
                      {runError ? <span className='engine-guide-error'>{runError}</span> : null}
                      {runResult ? (
                        <Badge tone={runResult.fallback ? 'warn' : 'ok'}>
                          {runResult.fallback ? '本地回落' : `${runResult.provider} · ${runResult.model}`}
                        </Badge>
                      ) : null}
                    </div>
                    {runResult ? (
                      <pre className='engine-guide-output'>
                        {JSON.stringify(runResult.output, null, 2)}
                      </pre>
                    ) : null}
                  </>
                ) : (
                  <p className='muted-text'>还没有绑定技能，无法试运行。回到第二步选一个技能。</p>
                )}
              </div>

              <div className='engine-guide-danger'>
                <button className='button button-ghost button-sm' type='button' onClick={onClone}>
                  <Copy size={14} />
                  复制这个引擎
                </button>
                <button className='button button-ghost button-sm is-danger' type='button' onClick={onDelete}>
                  <Trash2 size={14} />
                  删除这个引擎
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <footer className='engine-guide-foot'>
          <button
            className='button button-ghost button-md'
            type='button'
            disabled={stepIndex === 0}
            onClick={() => onStep(ENGINE_STEPS[Math.max(0, stepIndex - 1)].id)}
          >
            上一步
          </button>
          <span className='engine-guide-foot-note'>
            第 {stepIndex + 1} / {ENGINE_STEPS.length} 步 · {ENGINE_STEPS[stepIndex].hint}
          </span>
          <button
            className='button button-primary button-md'
            type='button'
            disabled={busy}
            onClick={() => onSubmit(!isLast)}
          >
            <Save size={15} />
            {isLast ? '保存并完成' : '保存并下一步'}
          </button>
        </footer>
      </section>
    </div>
  );
}