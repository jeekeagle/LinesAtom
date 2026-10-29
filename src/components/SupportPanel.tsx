import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Layers,
  Map as MapIcon,
  MessageCircleQuestion,
  Presentation,
  Table2,
  Target
} from 'lucide-react';
import type { LectureProject, MediaKind } from '../types';

export interface ActiveSupport {
  mediaType: MediaKind;
  targetId: string;
  pointerId?: string;
  blockId?: string;
}

const KIND_ICON: Record<MediaKind, typeof BookOpen> = {
  concept: BookOpen,
  case: Layers,
  qa: MessageCircleQuestion,
  cheatsheet: Table2,
  slide: Presentation,
  map: MapIcon
};

function conceptPath(project: LectureProject, id: string) {
  const chain: { id: string; name: string }[] = [];
  let current = project.concepts.find((item) => item.id === id);
  while (current) {
    chain.unshift({ id: current.id, name: current.name });
    current = project.concepts.find((item) => item.id === current!.parentId);
  }
  return chain;
}

export function SupportPanel({
  project,
  active,
  onClose,
  onJumpBlock
}: {
  project: LectureProject;
  active: ActiveSupport | null;
  onClose: () => void;
  onJumpBlock: (blockId: string) => void;
}) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const content = useMemo(() => {
    if (!active) return null;
    const { mediaType, targetId } = active;

    if (mediaType === 'concept') {
      const concept = project.concepts.find((item) => item.id === targetId);
      if (!concept) return { title: '介质缺失', body: <p className="muted-text">概念条目已被移除。</p> };
      const path = conceptPath(project, concept.id);
      const parent = path.length > 1 ? path[path.length - 2] : null;
      const children = project.concepts.filter((item) => item.parentId === concept.id);
      return {
        title: concept.name,
        body: (
          <>
            <div className="concept-path">
              {path.map((item, index) => (
                <span key={item.id}>
                  {index > 0 ? ' / ' : ''}
                  {item.name}
                </span>
              ))}
            </div>
            <p className="support-definition">{concept.definition}</p>

            <h3>同层差异</h3>
            <p className="support-copy">{concept.difference}</p>

            {concept.misconceptions.length ? (
              <>
                <h3>易混项</h3>
                <ul className="plain-list">
                  {concept.misconceptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {children.length ? (
              <>
                <h3>下位概念</h3>
                <ul className="plain-list">
                  {children.map((item) => (
                    <li key={item.id}>{item.name}</li>
                  ))}
                </ul>
              </>
            ) : null}

            <h3>回指位置</h3>
            <div className="occurrence-list">
              {concept.recurrences.length ? (
                concept.recurrences.map((blockId) => {
                  const block = project.blocks.find((item) => item.id === blockId);
                  const index = block ? String(block.order).padStart(3, '0') : blockId;
                  return (
                    <button
                      key={blockId}
                      className="occurrence-chip"
                      type="button"
                      onClick={() => onJumpBlock(blockId)}
                    >
                      {index}
                    </button>
                  );
                })
              ) : (
                <span className="muted-text">尚无回指位置</span>
              )}
            </div>
            {parent ? (
              <p className="support-provenance">
                上位类 · {parent.name} · 锚点 {concept.anchorBlockId}
              </p>
            ) : (
              <p className="support-provenance">根概念 · 锚点 {concept.anchorBlockId}</p>
            )}
          </>
        )
      };
    }

    if (mediaType === 'case') {
      const item = project.media.cases.find((entry) => entry.id === targetId);
      if (!item) return { title: '介质缺失', body: <p className="muted-text">案例已被移除。</p> };
      return {
        title: item.title,
        body: (
          <>
            <p className="support-copy">{item.eyebrow}</p>
            <div className="case-flow">
              <div className="case-stage">
                <span className="case-stage-label">背景</span>
                <p>{item.background}</p>
              </div>
              <div className="case-stage">
                <span className="case-stage-label">做法</span>
                <p>{item.action}</p>
              </div>
              <div className="case-stage">
                <span className="case-stage-label">结果</span>
                <p>{item.result}</p>
              </div>
            </div>
            <p className="support-provenance">
              {item.generatedBy} · 来源块 {item.sourceBlockId}
            </p>
          </>
        )
      };
    }

    if (mediaType === 'qa') {
      const item = project.media.qas.find((entry) => entry.id === targetId);
      if (!item) return { title: '介质缺失', body: <p className="muted-text">问答已被移除。</p> };
      return {
        title: item.title,
        body: (
          <>
            <p className="qa-question">{item.question}</p>
            <p className="qa-answer">{item.answer}</p>
            <p className="support-provenance">
              {item.generatedBy} · 来源块 {item.sourceBlockId}
            </p>
          </>
        )
      };
    }

    if (mediaType === 'cheatsheet') {
      const item = project.media.cheatsheets.find((entry) => entry.id === targetId);
      if (!item) return { title: '介质缺失', body: <p className="muted-text">速查表已被移除。</p> };
      return {
        title: item.title,
        body: (
          <>
            <p className="support-copy">{item.intro}</p>
            {item.mode === 'flashcard' ? (
              <div className="flashcard-list">
                {(item.cards ?? []).map((card) => {
                  const key = `${item.id}-${card.front}`;
                  const isFlipped = flipped[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`flashcard ${isFlipped ? 'is-flipped' : ''}`}
                      onClick={() => setFlipped((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <span className="flashcard-front">{card.front}</span>
                      <span className="flashcard-back">{card.back}</span>
                      <span className="flashcard-hint">点击翻面</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <table className="cheat-table">
                <thead>
                  <tr>
                    {item.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.rows.map((row, rowIndex) => (
                    <tr key={`${item.id}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${item.id}-${rowIndex}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="cheat-note">{item.note}</p>
            <p className="support-provenance">
              {item.generatedBy} · 来源块 {item.sourceBlockId}
            </p>
          </>
        )
      };
    }

    if (mediaType === 'slide') {
      const item = project.media.slides.find((entry) => entry.id === targetId);
      if (!item) return { title: '介质缺失', body: <p className="muted-text">课件页已被移除。</p> };
      return {
        title: item.title,
        body: (
          <>
            <p className="support-copy">{item.lead}</p>
            <div className="slide-stack">
              {item.slides.map((slide, index) => (
                <div className="slide-frame" key={`${item.id}-${index}`} data-marker={slide.marker}>
                  <span className="slide-kicker">{slide.kicker}</span>
                  <h4>{slide.title}</h4>
                  <p>{slide.body}</p>
                </div>
              ))}
            </div>
            <p className="support-provenance">
              {item.generatedBy} · 来源块 {item.sourceBlockId}
            </p>
          </>
        )
      };
    }

    const item = project.media.maps.find((entry) => entry.id === targetId);
    if (!item) return { title: '介质缺失', body: <p className="muted-text">导图已被移除。</p> };
    return {
      title: item.title,
      body: (
        <>
          <div className="map-tree">
            <span className="map-root">{item.root}</span>
            <div className="map-branches">
              {item.branches.map((branch) => (
                <div className="map-branch" key={branch.title}>
                  <strong>{branch.title}</strong>
                  <ul>
                    {branch.items.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <p className="cheat-note">{item.note}</p>
          <p className="support-provenance">
            {item.generatedBy} · 来源块 {item.sourceBlockId}
          </p>
        </>
      )
    };
  }, [active, project, flipped, onJumpBlock]);

  const Icon = active ? KIND_ICON[active.mediaType] : BookOpen;

  return (
    <aside className="support-panel" aria-label="认知支架">
      <header className="support-head">
        <div className="support-kind">
          <Icon size={15} />
          <span>{active ? mediaLabel(project, active.mediaType) : '认知支架'}</span>
        </div>
        <div className="support-head-actions">
          {active?.blockId ? (
            <button
              className="icon-button"
              type="button"
              title="在讲稿中定位"
              onClick={() => onJumpBlock(active.blockId!)}
            >
              <Target size={15} />
            </button>
          ) : null}
          <button className="icon-button" type="button" title="关闭支架" onClick={onClose}>
            <ArrowLeft size={15} />
          </button>
        </div>
      </header>
      <div className="support-body">
        {content ? (
          <>
            <h2>{content.title}</h2>
            {content.body}
          </>
        ) : (
          <p className="muted-text">从讲稿中选择一个挂载点。</p>
        )}
      </div>
    </aside>
  );
}

function mediaLabel(project: LectureProject, kind: MediaKind): string {
  const map: Record<MediaKind, string> = {
    concept: '概念卡',
    case: '案例',
    qa: '问答',
    cheatsheet: '速查表',
    slide: '课件页',
    map: '导图'
  };
  void project;
  return map[kind];
}