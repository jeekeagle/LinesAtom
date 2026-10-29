import { useState } from 'react';
import { Play, Save, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Badge, Section, Toggle } from '../components/ui';
import { formatTime } from '../lib/format';
import type { AgentSkill } from '../types';

export function SkillsPage() {
  const { data, setData, showToast } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ prompt: string; config: string }>({ prompt: '', config: '{}' });
  const [runInput, setRunInput] = useState<Record<string, string>>({});
  const [runOutput, setRunOutput] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  const toggle = async (skill: AgentSkill, enabled: boolean) => {
    try {
      const result = await api.updateSkill(skill.id, { enabled });
      setData((prev) => (prev ? { ...prev, skills: result.skills } : prev));
      showToast(`${skill.name} 已${enabled ? '启用' : '停用'}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新失败', 'error');
    }
  };

  const startEdit = (skill: AgentSkill) => {
    setEditing(skill.id);
    setDraft({ prompt: skill.prompt, config: JSON.stringify(skill.config, null, 2) });
  };

  const save = async (skill: AgentSkill) => {
    let config: Record<string, string | number | boolean>;
    try {
      config = JSON.parse(draft.config || '{}') as Record<string, string | number | boolean>;
    } catch {
      showToast('配置不是合法 JSON', 'error');
      return;
    }
    try {
      const result = await api.updateSkill(skill.id, { prompt: draft.prompt, config });
      setData((prev) => (prev ? { ...prev, skills: result.skills } : prev));
      showToast(`${skill.name} 已保存`);
      setEditing(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    }
  };

  const run = async (skill: AgentSkill) => {
    const input = runInput[skill.id] ?? '';
    if (!input.trim()) {
      showToast('先给技能一段输入', 'info');
      return;
    }
    setBusy(true);
    try {
      const result = await api.runSkill(skill.id, input);
      setRunOutput((prev) => ({ ...prev, [skill.id]: result }));
      const updated = await api.skills();
      setData((prev) => (prev ? { ...prev, skills: updated.skills } : prev));
      showToast(result.fallback ? '模型未配置，已回落本地确定性引擎' : `${skill.name} 执行完成`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '技能执行失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const stages = Array.from(new Set(data.skills.map((skill) => skill.stage)));

  return (
    <div className="workspace">
      <div className="workspace-inner">
        <header className="workspace-head">
          <div>
            <div className="course-kicker">SKILLS · 技能台</div>
            <h1>介质引擎的技能底座</h1>
            <p>
              每一类分析、每一类介质都由技能产出。技能可以单独停用、改参数、改提示词，引擎会按启用状态重新编排。
            </p>
          </div>
        </header>

        {stages.map((stage) => (
          <Section key={stage} title={data.stageLabels[stage as keyof typeof data.stageLabels]} meta={`${data.skills.filter((skill) => skill.stage === stage).length} 个技能`}>
            <div className="skill-grid">
              {data.skills
                .filter((skill) => skill.stage === stage)
                .map((skill) => (
                  <article className="skill-card" key={skill.id}>
                    <div className="skill-card-top">
                      <div>
                        <div className="skill-name">{skill.name}</div>
                        <div className="skill-id">
                          {skill.id} · v{skill.version}
                        </div>
                      </div>
                      <Badge tone={skill.enabled ? 'ok' : 'neutral'}>
                        {skill.enabled ? '启用' : '停用'}
                      </Badge>
                    </div>
                    <p>{skill.description}</p>
                    <div className="skill-config-preview">
                      {Object.entries(skill.config)
                        .slice(0, 4)
                        .map(([key, value]) => (
                          <span key={key}>
                            {key} = {String(value)}
                          </span>
                        ))}
                    </div>
                    <div className="skill-toggle">
                      <span>
                        运行 {skill.runs} 次 · {skill.lastRun === '尚未运行' ? '尚未运行' : formatTime(skill.lastRun)}
                      </span>
                      <Toggle
                        checked={skill.enabled}
                        label={`${skill.name} 启用开关`}
                        onChange={(next) => void toggle(skill, next)}
                      />
                    </div>

                    {editing === skill.id ? (
                      <div className="skill-editor">
                        <label className="field">
                          <span className="field-label">提示词</span>
                          <textarea
                            value={draft.prompt}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, prompt: event.target.value }))
                            }
                            rows={5}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">配置</span>
                          <textarea
                            value={draft.config}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, config: event.target.value }))
                            }
                            rows={4}
                          />
                        </label>
                        <div className="config-actions">
                          <button className="button button-primary button-sm" type="button" onClick={() => void save(skill)}>
                            <Save size={14} />
                            保存
                          </button>
                          <button className="button button-ghost button-sm" type="button" onClick={() => setEditing(null)}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="config-actions">
                        <button className="button button-secondary button-sm" type="button" onClick={() => startEdit(skill)}>
                          <Sparkles size={14} />
                          调整参数
                        </button>
                      </div>
                    )}

                    <div className="skill-run">
                      <textarea
                        placeholder="给技能一段输入，例如：记录权是把事实写进系统的权力。"
                        value={runInput[skill.id] ?? ''}
                        onChange={(event) =>
                          setRunInput((prev) => ({ ...prev, [skill.id]: event.target.value }))
                        }
                        rows={2}
                      />
                      <button
                        className="button button-ghost button-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void run(skill)}
                      >
                        <Play size={14} />
                        试运行
                      </button>
                    </div>

                    {runOutput[skill.id] ? (
                      <pre className="skill-output">
                        {JSON.stringify(runOutput[skill.id], null, 2)}
                      </pre>
                    ) : null}
                  </article>
                ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}