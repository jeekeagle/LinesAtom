import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Lightbulb,
  Pause,
  Play,
  Sliders,
  Sparkles,
  Wand2,
  X
} from 'lucide-react';
import type { LectureProject, MediaKind, MountSuggestion } from '../types';
import { formatClock } from '../lib/format';

const LABEL_TEXT: Record<string, string> = {
  core: '核心概念',
  example: '理解性例子',
  question: '设问互动',
  transition: '过渡衔接',
  global: '全局定位',
  conclusion: '结论收束'
};

const MEDIA_LABEL: Record<MediaKind, string> = {
  concept: '概念卡',
  case: '案例',
  qa: '问答',
  cheatsheet: '速查表',
  slide: '课件页',
  map: '导图'
};

const MEDIA_ICON: Record<MediaKind, string> = {
  concept: '卡',
  case: '例',
  qa: '问',
  cheatsheet: '表',
  slide: '页',
  map: '图'
};

interface TimedBlock {
  id: string;
  order: number;
  sectionId: string;
  text: string;
  label: string;
  start: number;
  end: number;
  sectionTitle: string;
}

export interface StudioActions {
  onGenerateSuggestions: () => Promise<void>;
  onApplySuggestion: (id: string, edit?: Partial<MountSuggestion>) => Promise<void>;
  onRejectSuggestion: (id: string) => Promise<void>;
  onApplyAll: () => Promise<void>;
  busy: boolean;
}

export function TimelineStudio({
  project,
  actions
}: {
  project: LectureProject;
  actions: StudioActions;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(project.blocks[0]?.id ?? '');
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ mediaType: MediaKind; targetId: string | null; rationale: string }>({
    mediaType: 'concept',
    targetId: null,
    rationale: ''
  });
  const playheadRef = useRef(0);

  const timeline = useMemo<TimedBlock[]>(() => {
    const sectionMap = new Map(project.sections.map((section) => [section.id, section.title]));
    let cursor = 0;
    return project.blocks.map((block) => {
      const chars = Array.from(block.text.replace(/\s/g, '')).length;
      const duration = Math.max(12, Math.round((chars / project.meta.charsPerMinute) * 60));
      const start = cursor;
      cursor += duration;
      return {
        id: block.id,
        order: block.order,
        sectionId: block.sectionId,
        text: block.text,
        label: block.label,
        start,
        end: cursor,
        sectionTitle: sectionMap.get(block.sectionId) ?? ''
      };
    });
  }, [project]);

  const totalSeconds = timeline.length ? timeline[timeline.length - 1].end : 0;
  const pxPerSecond = 2.4 * zoom;
  const trackWidth = Math.max(600, totalSeconds * pxPerSecond);

  const selected = timeline.find((item) => item.id === selectedId) ?? timeline[0];
  const selectedBlock = project.blocks.find((item) => item.id === selected?.id);
  const selectedPointer = project.pointers.find((pointer) => pointer.blockId === selected?.id);
  const selectedSuggestion = (project.suggestions ?? []).find(
    (item) => item.blockId === selected?.id && item.status !== 'rejected'
  );
  const suggestions = project.suggestions ?? [];
  const pendingCount = suggestions.filter((item) => item.status === 'pending').length;

  const blockAt = useCallback(
    (seconds: number) => {
      const found = timeline.find((item) => seconds >= item.start && seconds < item.end);
      return found ?? timeline[timeline.length - 1];
    },
    [timeline]
  );

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      playheadRef.current += delta;
      if (playheadRef.current >= totalSeconds) {
        playheadRef.current = 0;
      }
      const current = blockAt(playheadRef.current);
      setSelectedId((prev) => (prev === current.id ? prev : current.id));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalSeconds, blockAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const index = timeline.findIndex((item) => item.id === selectedId);
        setSelectedId(timeline[Math.min(timeline.length - 1, index + 1)]?.id ?? selectedId);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const index = timeline.findIndex((item) => item.id === selectedId);
        setSelectedId(timeline[Math.max(0, index - 1)]?.id ?? selectedId);
      }
      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, timeline]);

  useEffect(() => {
    if (selected) playheadRef.current = selected.start;
  }, [selected?.id, selected]);

  const seek = (event: React.MouseEvent<HTMLElement>) => {
    const clientX = event.clientX;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const seconds = (clientX - rect.left + track.scrollLeft) / pxPerSecond;
    const clamped = Math.max(0, Math.min(totalSeconds, seconds));
    playheadRef.current = clamped;
    const current = blockAt(clamped);
    setSelectedId(current.id);
  };

  const startEdit = (suggestion: MountSuggestion) => {
    setEditing(suggestion.id);
    setDraft({
      mediaType: suggestion.mediaType,
      targetId: suggestion.targetId,
      rationale: suggestion.rationale
    });
  };

  const conceptOptions = project.concepts;

  return (
    <div className="studio">
      <section className="studio-preview">
        <div className="studio-canvas">
          {selectedBlock ? (
            <div className="studio-frame">
              <div className="studio-frame-head">
                <span className={`label-chip label-${selectedBlock.label}`}>
                  {LABEL_TEXT[selectedBlock.label]}
                </span>
                <span className="block-index">
                  {String(selectedBlock.order).padStart(3, '0')} · {selected.sectionTitle}
                </span>
              </div>
              <p className="studio-frame-text">{selectedBlock.text}</p>
              {selectedPointer ? (
                <MountPreview
                  project={project}
                  mediaType={selectedPointer.mediaType}
                  targetId={selectedPointer.targetId}
                />
              ) : (
                <p className="studio-frame-empty">这一行还没有挂载介质</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="studio-transport">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              const index = timeline.findIndex((item) => item.id === selectedId);
              setSelectedId(timeline[Math.max(0, index - 1)]?.id ?? selectedId);
            }}
            title="上一行"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="studio-play"
            type="button"
            onClick={() => setPlaying((prev) => !prev)}
            title="播放 / 暂停（空格）"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              const index = timeline.findIndex((item) => item.id === selectedId);
              setSelectedId(timeline[Math.min(timeline.length - 1, index + 1)]?.id ?? selectedId);
            }}
            title="下一行"
          >
            <ChevronRight size={16} />
          </button>
          <span className="studio-time">
            {formatClock(selected?.start ?? 0)} / {formatClock(totalSeconds)}
          </span>
          <span className="studio-counter">
            {String(selected?.order ?? 0).padStart(3, '0')} / {String(timeline.length).padStart(3, '0')}{' '}
            行
          </span>
        </div>
      </section>

      <section className="studio-timeline">
        <header className="studio-timeline-head">
          <div className="studio-timeline-title">
            <Sparkles size={15} />
            <strong>挂载建议</strong>
            <span>
              {pendingCount > 0 ? `${pendingCount} 条待确认` : '全部已处理'}
            </span>
          </div>
          <div className="studio-timeline-tools">
            <button
              className="button button-secondary button-sm"
              type="button"
              onClick={() => void actions.onGenerateSuggestions()}
              disabled={actions.busy}
            >
              <Wand2 size={14} />
              重新生成建议
            </button>
            <button
              className="button button-primary button-sm"
              type="button"
              onClick={() => void actions.onApplyAll()}
              disabled={actions.busy || pendingCount === 0}
              title="按置信度门槛批量确认，低置信建议保留待定"
            >
              <Check size={14} />
              一键确认
            </button>
            <label className="studio-zoom">
              <Sliders size={13} />
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="时间线缩放"
              />
            </label>
          </div>
        </header>

        <div className="timeline-scroll">
          <div className="timeline-inner" style={{ width: trackWidth }}>
            <div className="timeline-ruler" onClick={seek}>
              {Array.from({ length: Math.ceil(totalSeconds / 60) + 1 }, (_, index) => index * 60).map(
                (second) => (
                  <span
                    key={second}
                    className="timeline-tick"
                    style={{ left: second * pxPerSecond }}
                  >
                    {formatClock(second)}
                  </span>
                )
              )}
            </div>

            <div className="timeline-tracks" ref={trackRef} onClick={seek}>
              <div className="track-row">
                <span className="track-name">文稿</span>
                <div className="track-lane">
                  {timeline.map((block) => (
                    <button
                      key={block.id}
                      type="button"
                      className={`clip clip-script label-${block.label} ${
                        selectedId === block.id ? 'is-selected' : ''
                      }`}
                      style={{ left: block.start * pxPerSecond, width: Math.max(38, (block.end - block.start) * pxPerSecond) }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(block.id);
                        playheadRef.current = block.start;
                      }}
                      title={block.text}
                    >
                      <span className="clip-index">{String(block.order).padStart(3, '0')}</span>
                      <span className="clip-label">{LABEL_TEXT[block.label]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="track-row">
                <span className="track-name">挂载</span>
                <div className="track-lane">
                  {project.pointers.map((pointer) => {
                    const block = timeline.find((item) => item.id === pointer.blockId);
                    if (!block) return null;
                    return (
                      <span
                        key={pointer.id}
                        className={`clip clip-mount media-${pointer.mediaType} ${
                          selectedId === pointer.blockId ? 'is-selected' : ''
                        }`}
                        style={{ left: block.start * pxPerSecond, width: Math.max(38, (block.end - block.start) * pxPerSecond) }}
                        title={`${MEDIA_LABEL[pointer.mediaType]} · ${pointer.targetId}`}
                      >
                        {MEDIA_ICON[pointer.mediaType]} {MEDIA_LABEL[pointer.mediaType]}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="track-row">
                <span className="track-name">建议</span>
                <div className="track-lane">
                  {suggestions.map((suggestion) => {
                    const block = timeline.find((item) => item.id === suggestion.blockId);
                    if (!block) return null;
                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        className={`chip chip-suggest is-${suggestion.status} ${
                          selectedId === suggestion.blockId ? 'is-selected' : ''
                        }`}
                        style={{ left: block.start * pxPerSecond }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(suggestion.blockId);
                        }}
                        title={suggestion.rationale}
                      >
                        {suggestion.status === 'accepted' ? '✓' : suggestion.status === 'rejected' ? '✕' : '＋'}{' '}
                        {MEDIA_LABEL[suggestion.mediaType]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="timeline-playhead"
                style={{ left: (selected?.start ?? 0) * pxPerSecond }}
                aria-hidden="true"
              >
                <span className="playhead-handle" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="studio-inspector">
        <header className="inspector-head">
          <span className="eyebrow">
            <Lightbulb size={12} /> 逐行挂载
          </span>
          <h2>第 {String(selected?.order ?? 0).padStart(3, '0')} 行</h2>
        </header>

        {selectedSuggestion ? (
          <div className={`suggestion-card is-${selectedSuggestion.status}`}>
            <div className="suggestion-head">
              <span className={`media-badge media-${selectedSuggestion.mediaType}`}>
                {MEDIA_ICON[selectedSuggestion.mediaType]}
              </span>
              <div>
                <strong>
                  建议挂{MEDIA_LABEL[selectedSuggestion.mediaType]}
                </strong>
                <p>{selectedSuggestion.targetLabel}</p>
              </div>
              <span className="suggestion-confidence">
                {Math.round(selectedSuggestion.confidence * 100)}%
              </span>
            </div>
            <p className="suggestion-rationale">{selectedSuggestion.rationale}</p>

            {editing === selectedSuggestion.id ? (
              <div className="suggestion-editor">
                <div className="segmented">
                  {(Object.keys(MEDIA_LABEL) as MediaKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={draft.mediaType === kind ? 'is-active' : ''}
                      onClick={() => setDraft((prev) => ({ ...prev, mediaType: kind }))}
                    >
                      {MEDIA_LABEL[kind]}
                    </button>
                  ))}
                </div>
                {draft.mediaType === 'concept' ? (
                  <label className="field">
                    <span className="field-label">挂载目标（概念）</span>
                    <select
                      value={draft.targetId ?? ''}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, targetId: event.target.value || null }))
                      }
                    >
                      <option value="">新建概念卡</option>
                      {conceptOptions.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="field">
                  <span className="field-label">修改理由</span>
                  <textarea
                    rows={3}
                    value={draft.rationale}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, rationale: event.target.value }))
                    }
                  />
                </label>
                <div className="config-actions">
                  <button
                    className="button button-primary button-sm"
                    type="button"
                    disabled={actions.busy}
                    onClick={() => {
                      void actions.onApplySuggestion(selectedSuggestion.id, {
                        mediaType: draft.mediaType,
                        targetId: draft.targetId,
                        rationale: draft.rationale
                      });
                      setEditing(null);
                    }}
                  >
                    <Check size={14} />
                    保存并挂载
                  </button>
                  <button className="button button-ghost button-sm" type="button" onClick={() => setEditing(null)}>
                    <X size={14} />
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="suggestion-actions">
                <button
                  className="button button-primary button-sm"
                  type="button"
                  disabled={actions.busy}
                  onClick={() => void actions.onApplySuggestion(selectedSuggestion.id)}
                >
                  <Check size={14} />
                  确认挂载
                </button>
                <button
                  className="button button-secondary button-sm"
                  type="button"
                  onClick={() => startEdit(selectedSuggestion)}
                >
                  <Sliders size={14} />
                  修改
                </button>
                <button
                  className="button button-ghost button-sm"
                  type="button"
                  disabled={actions.busy}
                  onClick={() => void actions.onRejectSuggestion(selectedSuggestion.id)}
                >
                  <CircleSlash size={14} />
                  拒绝
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="suggestion-empty">
            <Lightbulb size={16} />
            <p>这一行还没有挂载建议。</p>
            <button
              className="button button-secondary button-sm"
              type="button"
              onClick={() => void actions.onGenerateSuggestions()}
              disabled={actions.busy}
            >
              <Wand2 size={14} />
              生成建议
            </button>
          </div>
        )}

        <div className="inspector-section">
          <h3>本行信息</h3>
          <ul className="plain-list">
            <li>标签：{LABEL_TEXT[selectedBlock?.label ?? 'core']}</li>
            <li>判定：{selectedBlock?.labelEvidence || '—'}</li>
            <li>
              时长：{selected ? formatClock(selected.end - selected.start) : '—'} · 累计{' '}
              {selected ? formatClock(selected.start) : '—'}
            </li>
            <li>
              当前挂载：
              {selectedPointer ? MEDIA_LABEL[selectedPointer.mediaType] : '无'}
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function MountPreview({
  project,
  mediaType,
  targetId
}: {
  project: LectureProject;
  mediaType: MediaKind;
  targetId: string;
}) {
  if (mediaType === 'concept') {
    const concept = project.concepts.find((item) => item.id === targetId);
    if (!concept) return null;
    return (
      <div className="preview-media">
        <strong>{concept.name}</strong>
        <p>{concept.definition}</p>
        <span>同层差异：{concept.difference}</span>
      </div>
    );
  }
  if (mediaType === 'case') {
    const item = project.media.cases.find((entry) => entry.id === targetId);
    if (!item) return null;
    return (
      <div className="preview-media">
        <strong>{item.title}</strong>
        <p>背景 · {item.background}</p>
        <p>做法 · {item.action}</p>
        <p>结果 · {item.result}</p>
      </div>
    );
  }
  if (mediaType === 'qa') {
    const item = project.media.qas.find((entry) => entry.id === targetId);
    if (!item) return null;
    return (
      <div className="preview-media">
        <strong>{item.title}</strong>
        <p className="is-question">{item.question}</p>
        <p>{item.answer}</p>
      </div>
    );
  }
  if (mediaType === 'cheatsheet') {
    const item = project.media.cheatsheets.find((entry) => entry.id === targetId);
    if (!item) return null;
    return (
      <div className="preview-media">
        <strong>{item.title}</strong>
        <p>{item.intro}</p>
        <ul>
          {item.rows.slice(0, 3).map((row) => (
            <li key={row.join('-')}>{row.join(' · ')}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (mediaType === 'slide') {
    const item = project.media.slides.find((entry) => entry.id === targetId);
    if (!item) return null;
    return (
      <div className="preview-media">
        <strong>{item.title}</strong>
        <p>{item.lead}</p>
        <ul>
          {item.slides.map((slide) => (
            <li key={slide.title}>{slide.title}</li>
          ))}
        </ul>
      </div>
    );
  }
  const item = project.media.maps.find((entry) => entry.id === targetId);
  if (!item) return null;
  return (
    <div className="preview-media">
      <strong>{item.title}</strong>
      <p>{item.root}</p>
      <ul>
        {item.branches.map((branch) => (
          <li key={branch.title}>
            {branch.title}：{branch.items.join('、')}
          </li>
        ))}
      </ul>
    </div>
  );
}