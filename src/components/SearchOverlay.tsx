import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { LectureProject } from '../types';

export interface SearchHit {
  id: string;
  kind: string;
  title: string;
  context: string;
  blockId?: string;
  mediaType?: string;
  targetId?: string;
}

export function buildIndex(project: LectureProject): SearchHit[] {
  const hits: SearchHit[] = [];
  project.blocks.forEach((block) => {
    hits.push({
      id: `block-${block.id}`,
      kind: '讲稿块',
      title: `第 ${String(block.order).padStart(3, '0')} 块 · ${block.label}`,
      context: block.text,
      blockId: block.id
    });
  });
  project.concepts.forEach((concept) => {
    hits.push({
      id: `concept-${concept.id}`,
      kind: '概念',
      title: concept.name,
      context: concept.definition,
      blockId: concept.anchorBlockId,
      mediaType: 'concept',
      targetId: concept.id
    });
  });
  const push = (kind: string, id: string, title: string, context: string, mediaType: string) => {
    hits.push({
      id: `${mediaType}-${id}`,
      kind,
      title,
      context,
      mediaType,
      targetId: id
    });
  };
  project.media.cases.forEach((item) =>
    push('案例', item.id, item.title, `${item.background} ${item.result}`, 'case')
  );
  project.media.qas.forEach((item) =>
    push('问答', item.id, item.title, item.question, 'qa')
  );
  project.media.cheatsheets.forEach((item) =>
    push('速查表', item.id, item.title, item.intro, 'cheatsheet')
  );
  project.media.slides.forEach((item) =>
    push('课件页', item.id, item.title, item.lead, 'slide')
  );
  project.media.maps.forEach((item) => push('导图', item.id, item.title, item.root, 'map'));
  return hits;
}

export function SearchOverlay({
  project,
  open,
  onClose,
  onPickBlock,
  onPickMedia
}: {
  project: LectureProject;
  open: boolean;
  onClose: () => void;
  onPickBlock: (blockId: string) => void;
  onPickMedia: (mediaType: string, targetId: string, blockId?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const index = useMemo(() => buildIndex(project), [project]);

  const results = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return index.slice(0, 12);
    return index
      .filter(
        (hit) =>
          hit.title.toLowerCase().includes(key) || hit.context.toLowerCase().includes(key)
      )
      .slice(0, 24);
  }, [index, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelection(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelection(0);
  }, [query]);

  if (!open) return null;

  const pick = (hit: SearchHit) => {
    onClose();
    if (hit.mediaType && hit.targetId) {
      onPickMedia(hit.mediaType, hit.targetId, hit.blockId);
      return;
    }
    if (hit.blockId) onPickBlock(hit.blockId);
  };

  return (
    <div className="search-overlay is-open" role="dialog" aria-modal="true" aria-label="搜索讲稿">
      <button className="search-backdrop" type="button" aria-label="关闭搜索" onClick={onClose} />
      <section className="search-dialog">
        <div className="search-field">
          <Search size={17} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="搜索讲稿、概念或支架"
            aria-label="搜索讲稿、概念或支架"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelection((prev) => Math.min(prev + 1, results.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelection((prev) => Math.max(prev - 1, 0));
              }
              if (event.key === 'Enter' && results[selection]) {
                event.preventDefault();
                pick(results[selection]);
              }
              if (event.key === 'Escape') onClose();
            }}
          />
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭搜索">
            <X size={16} />
          </button>
        </div>
        <div className="search-results">
          {results.length ? (
            results.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                className={`search-result ${index === selection ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelection(index)}
                onClick={() => pick(hit)}
              >
                <span className="search-result-mark">{hit.kind.slice(0, 2)}</span>
                <span className="search-result-main">
                  <span className="search-result-title">{hit.title}</span>
                  <span className="search-result-context">{hit.context}</span>
                </span>
                <span className="search-result-kind">{hit.kind}</span>
              </button>
            ))
          ) : (
            <p className="search-empty">没有命中。试试概念名或挂载介质标题。</p>
          )}
        </div>
        <footer className="search-footer">共 {results.length} 条结果 · ↑↓ 选择 · Enter 打开</footer>
      </section>
    </div>
  );
}