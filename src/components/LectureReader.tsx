import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CornerUpLeft, Search } from 'lucide-react';
import type { LectureProject, MediaKind } from '../types';
import { SupportPanel, type ActiveSupport } from './SupportPanel';
import { SearchOverlay } from './SearchOverlay';
import { formatClock } from '../lib/format';

interface Anchor {
  blockId: string;
  offset: number;
  scrollTop: number;
}

const MEDIA_LABEL: Record<MediaKind, string> = {
  concept: '概念卡',
  case: '案例',
  qa: '问答',
  cheatsheet: '速查表',
  slide: '课件页',
  map: '导图'
};

const LABEL_TEXT: Record<string, string> = {
  core: '核心概念',
  example: '理解性例子',
  question: '设问互动',
  transition: '过渡衔接',
  global: '全局定位',
  conclusion: '结论收束'
};

export function LectureReader({ project }: { project: LectureProject }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Anchor | null>(null);
  const restoreTimer = useRef<number | null>(null);
  const [active, setActive] = useState<ActiveSupport | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashBlock, setFlashBlock] = useState<string | null>(null);

  const times = useMemo(() => {
    const map = new Map<string, number>();
    let seconds = 0;
    project.blocks.forEach((block) => {
      const chars = Array.from(block.text.replace(/\s/g, '')).length;
      seconds += Math.max(12, Math.round((chars / project.meta.charsPerMinute) * 60));
      map.set(block.id, seconds);
    });
    return map;
  }, [project]);

  const captureAnchor = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>('.lecture-block')
    );
    let current: { id: string; top: number } | null = null;
    for (const node of nodes) {
      const top = node.getBoundingClientRect().top - containerRect.top + scrollTop;
      if (top <= scrollTop + 4) {
        current = { id: node.dataset.blockId ?? '', top };
      } else {
        break;
      }
    }
    const fallback = nodes[0];
    if (!current && fallback) {
      current = {
        id: fallback.dataset.blockId ?? '',
        top: fallback.getBoundingClientRect().top - containerRect.top + scrollTop
      };
    }
    anchorRef.current = current
      ? { blockId: current.id, offset: scrollTop - current.top, scrollTop }
      : { blockId: '', offset: 0, scrollTop };
  }, []);

  const restoreAnchor = useCallback(() => {
    const container = scrollRef.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return;
    if (!anchor.blockId) {
      container.scrollTop = anchor.scrollTop;
      return;
    }
    const node = container.querySelector<HTMLElement>(
      `[data-block-id="${anchor.blockId}"]`
    );
    if (!node) {
      container.scrollTop = anchor.scrollTop;
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const top = node.getBoundingClientRect().top - containerRect.top + container.scrollTop;
    container.scrollTop = Math.max(0, Math.round(top + anchor.offset));
  }, []);

  const openSupport = useCallback(
    (mediaType: MediaKind, targetId: string, pointerId?: string, blockId?: string) => {
      captureAnchor();
      setActive({ mediaType, targetId, pointerId, blockId });
    },
    [captureAnchor]
  );

  const closeSupport = useCallback(() => {
    if (!active) return;
    setActive(null);
    if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
    // 面板收起会改变正文栏宽并触发重排：先按块锚点在当前布局下钉回原位，
    // 栏宽动画结束后再精确回写一次，保证回到的是同一段文字而不是同一个数值。
    restoreAnchor();
    restoreTimer.current = window.setTimeout(() => {
      restoreAnchor();
      restoreTimer.current = null;
    }, 380);
  }, [active, restoreAnchor]);

  const jumpToBlock = useCallback(
    (blockId: string) => {
      const container = scrollRef.current;
      if (!container) return;
      const node = container.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
      if (!node) return;
      const containerRect = container.getBoundingClientRect();
      const top = node.getBoundingClientRect().top - containerRect.top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
      setFlashBlock(blockId);
      window.setTimeout(() => setFlashBlock((prev) => (prev === blockId ? null : prev)), 1200);
    },
    []
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const max = container.scrollHeight - container.clientHeight;
      setProgress(max > 0 ? Math.min(1, container.scrollTop / max) : 0);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [project.blocks.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }
      if (event.key === 'Escape' && active) {
        closeSupport();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, closeSupport]);

  const mediaTitle = (mediaType: MediaKind, targetId: string) => {
    if (mediaType === 'concept') {
      return project.concepts.find((item) => item.id === targetId)?.name ?? '概念';
    }
    const bucket =
      mediaType === 'case'
        ? project.media.cases
        : mediaType === 'qa'
          ? project.media.qas
          : mediaType === 'cheatsheet'
            ? project.media.cheatsheets
            : mediaType === 'slide'
              ? project.media.slides
              : project.media.maps;
    const found = bucket.find((item) => item.id === targetId) as { title?: string } | undefined;
    return found?.title ?? '介质';
  };

  return (
    <div className={`reader-layout ${active ? 'has-support' : ''}`}>
      <div className="reader-scroll" ref={scrollRef}>
        <div className="reader-progress" style={{ transform: `scaleX(${progress})` }} />
        <article className="reader-inner">
          <header className="chapter-header">
            <div className="course-kicker">{project.meta.course}</div>
            <h1>{project.meta.title}</h1>
            <p className="chapter-deck">{project.meta.subtitle}</p>
            <div className="chapter-meta">
              <span>
                <strong>{String(project.blocks.length).padStart(2, '0')}</strong> 讲稿块
              </span>
              <span>
                <strong>{project.concepts.length}</strong> 概念
              </span>
              <span>
                <strong>{project.pointers.length}</strong> 挂载
              </span>
              <span>
                <strong>{project.meta.durationMinutes}</strong> 分钟
              </span>
              <span>
                引擎运行 <strong>{project.meta.engineRunId || 'seed'}</strong>
              </span>
            </div>
            <div className="reader-note">
              <ArrowRight size={16} />
              <span>
                读到哪里，就挂什么。点开任一挂载点后关闭，阅读位置会精确回到原处。
              </span>
            </div>
          </header>

          {project.sections.map((section, sectionIndex) => {
            const blocks = project.blocks.filter((block) => block.sectionId === section.id);
            return (
              <section className="lecture-section" key={section.id}>
                <header className="section-heading">
                  <span className="section-number">
                    SECTION {String(sectionIndex + 1).padStart(2, '0')}
                  </span>
                  <h2>{section.title}</h2>
                </header>
                {blocks.map((block) => {
                  const pointers = project.pointers.filter(
                    (pointer) => pointer.blockId === block.id
                  );
                  const backrefs = project.concepts.filter((concept) =>
                    concept.recurrences.includes(block.id)
                  );
                  return (
                    <article
                      key={block.id}
                      className={`lecture-block ${flashBlock === block.id ? 'block-is-target' : ''}`}
                      data-block-id={block.id}
                      data-label={block.label}
                    >
                      <div className="block-rail" aria-hidden="true">
                        <span className="block-dot" />
                      </div>
                      <div className="block-meta">
                        <span className="block-index">
                          {String(block.order).padStart(3, '0')}
                        </span>
                        <span className={`label-chip label-${block.label}`}>
                          {LABEL_TEXT[block.label] ?? block.label}
                        </span>
                        <span className="block-time">{formatClock(times.get(block.id) ?? 0)}</span>
                      </div>
                      <p className="block-text">{block.text}</p>
                      {pointers.length || backrefs.length ? (
                        <div className="block-actions">
                          {pointers.map((pointer) => (
                            <button
                              key={pointer.id}
                              className="mount-button"
                              type="button"
                              onClick={() =>
                                openSupport(
                                  pointer.mediaType,
                                  pointer.targetId,
                                  pointer.id,
                                  block.id
                                )
                              }
                              title={`打开${MEDIA_LABEL[pointer.mediaType]}`}
                            >
                              <span className="mount-type">{MEDIA_LABEL[pointer.mediaType]}</span>
                              <span>{mediaTitle(pointer.mediaType, pointer.targetId)}</span>
                              <ArrowRight size={12} />
                            </button>
                          ))}
                          {backrefs.map((concept) => (
                            <button
                              key={concept.id}
                              className="backref-button"
                              type="button"
                              onClick={() => jumpToBlock(concept.anchorBlockId)}
                              title="跳回首次定义"
                            >
                              <CornerUpLeft size={12} />
                              <span>回指 · {concept.name}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </section>
            );
          })}

          <div className="end-mark">
            END OF CHAPTER · {String(project.blocks.length).padStart(2, '0')} BLOCKS
          </div>
        </article>
      </div>

      <SupportPanel
        project={project}
        active={active}
        onClose={closeSupport}
        onJumpBlock={(blockId) => {
          closeSupport();
          window.setTimeout(() => jumpToBlock(blockId), 120);
        }}
      />

      <button className="panel-scrim" type="button" aria-label="关闭支架" onClick={closeSupport} />

      <button
        className="reader-search-fab"
        type="button"
        onClick={() => setSearchOpen(true)}
        title="搜索讲稿（Ctrl+K）"
      >
        <Search size={15} />
        <span>搜索</span>
      </button>

      <SearchOverlay
        project={project}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPickBlock={jumpToBlock}
        onPickMedia={(mediaType, targetId, blockId) => {
          if (blockId) jumpToBlock(blockId);
          openSupport(mediaType as MediaKind, targetId, undefined, blockId);
        }}
      />
    </div>
  );
}