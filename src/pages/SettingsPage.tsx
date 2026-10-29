import { useState } from 'react';
import {
  AudioLines,
  BrainCircuit,
  Database,
  Download,
  KeyRound,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  TestTube2,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Badge, Field, Section } from '../components/ui';
import type { ServiceKind, ServiceProfile } from '../types';
import { relativeTime } from '../lib/format';

const SERVICE_TABS: { kind: ServiceKind; label: string; icon: typeof Zap; hint: string }[] = [
  { kind: 'chat', label: '模型服务', icon: BrainCircuit, hint: '切换 · 新建 · 测速' },
  { kind: 'tts', label: '声音服务', icon: AudioLines, hint: '音色 · 风格 · 试听' },
  { kind: 'asr', label: '语音识别', icon: Mic, hint: '转写 · 口播校验' }
];

type TabId = ServiceKind | 'pipeline' | 'data';

const b64Blob = (base64: string, mime: string) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
};

export function SettingsPage() {
  const { data, showToast, refresh } = useApp();
  const [tab, setTab] = useState<TabId>('chat');
  const [catalog, setCatalog] = useState<{
    voices: string[];
    ttsModels: string[];
    asrModels: string[];
  } | null>(null);
  const [editing, setEditing] = useState<{ kind: ServiceKind; id?: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: '',
    voice: '冰糖',
    style: '',
    language: 'zh'
  });
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [draft, setDraft] = useState(() => ({
    modelBaseUrl: data?.settings.modelBaseUrl ?? '',
    modelName: data?.settings.modelName ?? '',
    temperature: data?.settings.temperature ?? 0.4,
    maxTokens: data?.settings.maxTokens ?? 3000,
    charsPerMinute: data?.settings.charsPerMinute ?? 112,
    blockTargetChars: data?.settings.blockTargetChars ?? 150,
    cognitiveLoadCap: data?.settings.cognitiveLoadCap ?? 14,
    questionRatioFloor: data?.settings.questionRatioFloor ?? 0.08,
    durationTolerance: data?.settings.durationTolerance ?? 0.25
  }));
  if (!data) return null;

  const services = data.services ?? [];
  const activeOf = (kind: ServiceKind) => services.find((item) => item.kind === kind && item.active);
  const listOf = (kind: ServiceKind) => services.filter((item) => item.kind === kind);

  const loadCatalog = async () => {
    if (catalog) return;
    try {
      const result = await api.services();
      setCatalog({
        voices: result.voices,
        ttsModels: result.ttsModels,
        asrModels: result.asrModels
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '音色清单获取失败', 'error');
    }
  };

  const openCreate = async (kind: ServiceKind) => {
    setEditing({ kind });
    setForm({
      name: kind === 'chat' ? '新模型服务' : kind === 'tts' ? '新声音服务' : '新语音识别',
      baseUrl: 'https://api.xiaomimimo.com/v1',
      model: kind === 'chat' ? 'mimo-v2.6-flash' : kind === 'tts' ? 'mimo-v2.5-tts' : 'mimo-v2.5-asr',
      voice: '冰糖',
      style: '清晰、沉稳的中文课程讲解口吻，语速适中。',
      language: 'zh'
    });
    setModelOptions([]);
    if (kind !== 'chat') await loadCatalog();
  };

  const openEdit = async (service: ServiceProfile) => {
    setEditing({ kind: service.kind, id: service.id });
    setForm({
      name: service.name,
      baseUrl: service.baseUrl,
      model: service.model,
      voice: service.voice ?? '冰糖',
      style: service.style ?? '',
      language: service.language ?? 'zh'
    });
    setModelOptions([]);
    if (service.kind !== 'chat') await loadCatalog();
  };

  const saveService = async () => {
    if (!editing) return;
    setBusy('save-service');
    try {
      if (editing.id) {
        await api.updateService(editing.id, form);
        showToast('服务已更新');
      } else {
        await api.createService({ kind: editing.kind, ...form });
        showToast('服务已新建');
      }
      setEditing(null);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const saveKey = async (id: string) => {
    const value = (keyDrafts[id] ?? '').trim();
    if (!value) {
      showToast('请先粘贴 API Key', 'error');
      return;
    }
    setBusy(`key-${id}`);
    try {
      await api.setServiceKey(id, value);
      setKeyDrafts((prev) => ({ ...prev, [id]: '' }));
      await refresh();
      showToast('API Key 已保存到 secrets');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeKey = async (id: string) => {
    await api.clearServiceKey(id);
    await refresh();
    showToast('API Key 已清除');
  };

  const activate = async (id: string) => {
    setBusy(`active-${id}`);
    try {
      await api.activateService(id);
      await refresh();
      showToast('已切换为默认服务');
    } finally {
      setBusy(null);
    }
  };

  const testService = async (service: ServiceProfile) => {
    setBusy(`test-${service.id}`);
    try {
      const result = await api.testService(service.id);
      showToast(
        `${result.message ?? '测速通过'} · ${result.latencyMs}ms${result.text ? ` · “${result.text.slice(0, 20)}”` : ''}`
      );
      if (result.previewBase64) {
        const url = URL.createObjectURL(
          b64Blob(result.previewBase64, result.format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
        );
        const audio = new Audio(url);
        void audio.play().catch(() => undefined);
        audio.onended = () => URL.revokeObjectURL(url);
      }
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '测速失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeService = async (service: ServiceProfile) => {
    if (!window.confirm(`删除服务「${service.name}」？其 API Key 会一并清除。`)) return;
    await api.deleteService(service.id);
    await refresh();
    showToast('服务已删除');
  };

  const fetchModels = async () => {
    if (!editing?.id) return;
    setBusy('models');
    try {
      const result = await api.serviceModels(editing.id);
      setModelOptions(result.models);
      showToast(`已拉取 ${result.models.length} 个模型`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模型清单获取失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    try {
      await api.updateSettings(draft);
      await refresh();
      showToast('流水线参数已保存');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    }
  };

  const exportProject = () => {
    const payload = {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      project: data.project,
      skills: data.skills,
      engines: data.engines,
      workflows: data.workflows,
      validation: data.validation
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lecture-axis-' + data.project.meta.revision + '.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('结构化数据已导出');
  };

  const reset = async () => {
    if (!window.confirm('恢复初始状态会清空当前开发稿与服务档案，确定继续？')) return;
    await api.reset();
    await refresh();
    showToast('系统已恢复到初始状态');
  };

  const SERVICE_META: Record<ServiceKind, { title: string; desc: string }> = {
    chat: {
      title: '模型服务',
      desc: '给技能与流水线用的对话模型。可新建多个档案、一键切换默认、单独测速，密钥各自独立保存。'
    },
    tts: {
      title: '声音服务',
      desc: '播放台与单元页的旁白来源。可选音色与讲解风格，测速会直接播一段试听。'
    },
    asr: {
      title: '语音识别',
      desc: '把音频转回文字，用于口播校验与素材转写。测速会先用声音服务合成一段再识别。'
    }
  };

  const renderServiceForm = (kind: ServiceKind) => {
    if (!editing || editing.kind !== kind) return null;
    return (
      <div className='service-form'>
        <div className='service-form-head'>
          <h3>{editing.id ? '编辑服务' : '新建服务'}</h3>
          <button className='icon-button' type='button' title='关闭' onClick={() => setEditing(null)}>
            <X size={15} />
          </button>
        </div>
        <div className='engine-config-grid'>
          <Field label='服务名称'>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>
          <Field label='服务地址' hint='OpenAI 兼容接口，如 https://api.xiaomimimo.com/v1'>
            <input
              value={form.baseUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
            />
          </Field>
          {kind === 'chat' ? (
            <Field label='模型名称' hint='可拉取服务端模型清单直接切换'>
              <input
                list='service-model-options'
                value={form.model}
                placeholder='例如 mimo-v2.6-flash'
                onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
              />
              <datalist id='service-model-options'>
                {modelOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
          ) : (
            <Field label='模型'>
              <select
                value={form.model}
                onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
              >
                {(kind === 'tts' ? (catalog?.ttsModels ?? []) : (catalog?.asrModels ?? [])).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                {!catalog ? <option value={form.model}>{form.model}</option> : null}
              </select>
            </Field>
          )}
          {kind === 'tts' ? (
            <Field label='音色'>
              <select
                value={form.voice}
                onChange={(event) => setForm((prev) => ({ ...prev, voice: event.target.value }))}
              >
                {(catalog?.voices ?? [form.voice]).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {kind === 'asr' ? (
            <Field label='识别语言'>
              <select
                value={form.language}
                onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))}
              >
                <option value='auto'>auto · 自动检测</option>
                <option value='zh'>zh · 中文</option>
                <option value='en'>en · English</option>
              </select>
            </Field>
          ) : null}
        </div>
        {kind === 'tts' ? (
          <Field label='讲解风格指令' hint='作为 user 消息下发，决定语气与节奏'>
            <textarea
              rows={3}
              value={form.style}
              onChange={(event) => setForm((prev) => ({ ...prev, style: event.target.value }))}
            />
          </Field>
        ) : null}
        <div className='config-actions'>
          <button
            className='button button-primary button-sm'
            type='button'
            disabled={busy === 'save-service'}
            onClick={() => void saveService()}
          >
            <Save size={14} />
            {busy === 'save-service' ? '保存中…' : '保存服务'}
          </button>
          {kind === 'chat' && editing.id ? (
            <button
              className='button button-secondary button-sm'
              type='button'
              disabled={busy === 'models'}
              onClick={() => void fetchModels()}
            >
              <RefreshCw size={14} />
              拉取模型清单
            </button>
          ) : null}
          <button className='button button-ghost button-sm' type='button' onClick={() => setEditing(null)}>
            取消
          </button>
        </div>
      </div>
    );
  };

  const renderServiceTab = (kind: ServiceKind) => {
    const list = listOf(kind);
    const active = activeOf(kind);
    const meta = SERVICE_META[kind];
    return (
      <Section
        title={meta.title}
        meta={`${list.length} 个档案 · 默认：${active?.name ?? '未设置'}`}
        action={
          <button className='button button-secondary button-sm' type='button' onClick={() => void openCreate(kind)}>
            <Plus size={14} />
            新建服务
          </button>
        }
      >
        <p className='panel-note'>{meta.desc}</p>
        {renderServiceForm(kind)}
        <div className='service-list'>
          {list.map((service) => (
            <div className={`service-card ${service.active ? 'is-active' : ''}`} key={service.id}>
              <div className='service-card-main'>
                <div className='service-card-title'>
                  <strong>{service.name}</strong>
                  {service.active ? <Badge tone='ok'>默认</Badge> : null}
                  <Badge tone={service.apiKeyConfigured ? 'neutral' : 'warn'}>
                    {service.apiKeyConfigured ? '密钥已配置' : '未配置密钥'}
                  </Badge>
                </div>
                <div className='service-card-meta'>
                  <span>{service.model || '未填模型'}</span>
                  <span>{service.baseUrl}</span>
                  {service.voice ? <span>音色 {service.voice}</span> : null}
                  {service.language ? <span>语言 {service.language}</span> : null}
                </div>
                <div className='service-card-meta'>
                  <span className='service-latency'>
                    {service.latencyMs ? `最近测速 ${service.latencyMs}ms` : '尚未测速'}
                  </span>
                  {service.lastTestAt ? <span>{relativeTime(service.lastTestAt)}</span> : null}
                  {service.lastResult &&
                  !service.lastResult.startsWith(`${service.latencyMs}ms`) ? (
                    <span>{service.lastResult}</span>
                  ) : null}
                </div>
              </div>
              <div className='service-card-actions'>
                {!service.active ? (
                  <button
                    className='button button-secondary button-sm'
                    type='button'
                    disabled={busy === `active-${service.id}`}
                    onClick={() => void activate(service.id)}
                  >
                    <Zap size={14} />
                    设为默认
                  </button>
                ) : null}
                <button
                  className='button button-secondary button-sm'
                  type='button'
                  disabled={!service.apiKeyConfigured || busy === `test-${service.id}`}
                  onClick={() => void testService(service)}
                >
                  <TestTube2 size={14} />
                  {busy === `test-${service.id}` ? '测速中…' : '测速'}
                </button>
                <button className='icon-button' type='button' title='编辑' onClick={() => void openEdit(service)}>
                  <Pencil size={14} />
                </button>
                <button
                  className='icon-button is-danger'
                  type='button'
                  title='删除服务'
                  onClick={() => void removeService(service)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {!service.apiKeyConfigured ? (
                <div className='service-key-row'>
                  <input
                    type='password'
                    value={keyDrafts[service.id] ?? ''}
                    placeholder='粘贴该服务的 API Key，只写入 data/secrets.json'
                    onChange={(event) =>
                      setKeyDrafts((prev) => ({ ...prev, [service.id]: event.target.value }))
                    }
                  />
                  <button
                    className='button button-primary button-sm'
                    type='button'
                    disabled={busy === `key-${service.id}`}
                    onClick={() => void saveKey(service.id)}
                  >
                    <KeyRound size={14} />
                    保存密钥
                  </button>
                </div>
              ) : (
                <div className='service-key-row is-set'>
                  <span>
                    <KeyRound size={13} />
                    密钥已写入 data/secrets.json，不随导出外发
                  </span>
                  <button
                    className='button button-ghost button-sm'
                    type='button'
                    onClick={() => void removeKey(service.id)}
                  >
                    清除密钥
                  </button>
                </div>
              )}
            </div>
          ))}
          {!list.length ? (
            <div className='empty-state'>
              <strong>还没有{meta.title}</strong>
              <p>点右上角「新建服务」，填地址、模型与密钥即可启用。</p>
            </div>
          ) : null}
        </div>
      </Section>
    );
  };

  const navTabs: { id: TabId; label: string; icon: typeof Zap; hint: string }[] = [
    ...SERVICE_TABS.map((item) => ({
      id: item.kind as TabId,
      label: item.label,
      icon: item.icon,
      hint: item.hint
    })),
    { id: 'pipeline' as TabId, label: '流水线参数', icon: SlidersHorizontal, hint: '切分 · 负荷 · 验收' },
    { id: 'data' as TabId, label: '数据与系统', icon: Database, hint: '导出 · 恢复 · 版本' }
  ];

  return (
    <div className='workspace'>
      <div className='workspace-inner'>
        <header className='workspace-head'>
          <div>
            <div className='course-kicker'>SETTINGS · 设置台</div>
            <h1>运行设置</h1>
            <p>
              模型、声音、语音识别都按服务档案管理：可新建、切换默认、测速与删除；密钥独立存放在
              data/secrets.json。
            </p>
          </div>
        </header>

        <div className='settings-layout'>
          <nav className='settings-subnav' aria-label='设置二级导航'>
            {navTabs.map((item) => {
              const Icon = item.icon;
              const isService = item.id === 'chat' || item.id === 'tts' || item.id === 'asr';
              const active = isService ? activeOf(item.id as ServiceKind) : null;
              return (
                <button
                  key={item.id}
                  type='button'
                  className={`settings-subnav-item ${tab === item.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setTab(item.id);
                    setEditing(null);
                    if (item.id === 'tts' || item.id === 'asr') void loadCatalog();
                  }}
                >
                  <Icon size={16} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{isService ? (active ? `默认 ${active.name}` : item.hint) : item.hint}</small>
                  </span>
                  {isService ? (
                    <i className={active ? (active.apiKeyConfigured ? 'is-on' : 'is-warn') : ''} />
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className='settings-panel'>
            {tab === 'chat' ? renderServiceTab('chat') : null}
            {tab === 'tts' ? renderServiceTab('tts') : null}
            {tab === 'asr' ? renderServiceTab('asr') : null}
            {tab === 'pipeline' ? (
              <Section title='流水线参数' meta='影响切分与验收'>
                <div className='engine-config-grid'>
                  <Field label='字数每分钟'>
                    <input
                      type='number'
                      value={draft.charsPerMinute}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, charsPerMinute: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label='块目标字数'>
                    <input
                      type='number'
                      value={draft.blockTargetChars}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, blockTargetChars: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label='认知负荷上限'>
                    <input
                      type='number'
                      value={draft.cognitiveLoadCap}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, cognitiveLoadCap: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label='设问占比下限'>
                    <input
                      type='number'
                      step='0.01'
                      value={draft.questionRatioFloor}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, questionRatioFloor: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label='时长容差'>
                    <input
                      type='number'
                      step='0.05'
                      value={draft.durationTolerance}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, durationTolerance: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label='温度'>
                    <input
                      type='number'
                      step='0.1'
                      value={draft.temperature}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, temperature: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <Field label='最大输出 tokens'>
                    <input
                      type='number'
                      value={draft.maxTokens}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, maxTokens: Number(event.target.value) }))
                      }
                    />
                  </Field>
                </div>
                <div className='config-actions'>
                  <button className='button button-primary button-sm' type='button' onClick={() => void save()}>
                    <Save size={14} />
                    保存设置
                  </button>
                </div>
              </Section>
            ) : null}

            {tab === 'data' ? (
              <>
                <Section title='数据' meta={data.server.dataDir}>
                  <ul className='insight-list'>
                    <li>
                      <Badge tone='accent'>数据</Badge>
                      <span>讲稿、挂载指针、介质内容、课程与服务档案都存在 data/store.json</span>
                    </li>
                    <li>
                      <Badge tone='neutral'>密钥</Badge>
                      <span>每个服务的 API Key 单独存在 data/secrets.json，不随导出与备份外发</span>
                    </li>
                    <li>
                      <Badge tone='neutral'>种子</Badge>
                      <span>data/seed-lecture.json 是首版讲稿的出厂内容</span>
                    </li>
                  </ul>
                  <div className='config-actions'>
                    <button className='button button-secondary button-sm' type='button' onClick={exportProject}>
                      <Download size={14} />
                      导出结构化数据
                    </button>
                    <button className='button button-ghost button-sm' type='button' onClick={() => void reset()}>
                      <RotateCcw size={14} />
                      恢复初始状态
                    </button>
                  </div>
                </Section>

                <Section title='系统'>
                  <ul className='insight-list'>
                    <li>
                      <Badge tone='ok'>服务</Badge>
                      <span>
                        版本 {data.server.version} · 启动于{' '}
                        {new Date(data.server.startedAt).toLocaleTimeString('zh-CN')}
                      </span>
                    </li>
                    <li>
                      <Badge tone='ok'>技能</Badge>
                      <span>
                        {data.skills.filter((skill) => skill.enabled).length} / {data.skills.length} 个技能启用
                      </span>
                    </li>
                    <li>
                      <Badge tone='ok'>引擎</Badge>
                      <span>
                        {data.engines.length} 个引擎 · {data.workflows.length} 条流程 · {services.length} 个服务档案
                      </span>
                    </li>
                  </ul>
                </Section>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
