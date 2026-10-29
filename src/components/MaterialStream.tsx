import { useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  ChevronRight,
  Layers,
  Map as MapIcon,
  MessageCircleQuestion,
  Presentation,
  Radio,
  Table2,
  X
} from 'lucide-react';
import type { Label, MediaKind } from '../types';
import type { Scene, SceneKind, SceneMedia } from '../lib/score';
import { SceneMediaView } from './Theater';

export interface StreamItem {
  id: string;
  lane: 'mount' | 'related' | 'chapter';
  kind: MediaKind;
  title: string;
  subtitle: string;
  blockLabel?: string;
  media?: SceneMedia;
}

const LANES: { id: StreamItem['lane']; label: string; hint: string }[] = [
  { id: 'mount', label: '当前挂载', hint: '讲到哪儿，推到哪儿' },
  { id: 'related', label: '关联概念', hint: '上位类与下位概念' },
  { id: 'chapter', label: '同章素材', hint: '本章其余介质随时可看' }
];

const KIND_ICON: Record<MediaKind, typeof BookOpen> = {
  concept: BookOpen,
  case: Layers,
  qa: MessageCircleQuestion,
  cheatsheet: Table2,
  slide: Presentation,
  map: MapIcon
};

const KIND_LABEL: Record<MediaKind, string> = {
  concept: '知识卡片',
  case: '案例',
  qa: '问答',
  cheatsheet: '速查表',
  slide: '课件页',
  map: '章节导图'
};

const LABEL_FOR_KIND: Record<SceneKind, Label> = {
  concept: 'core',
  case: 'example',
  qa: 'question',
  cheatsheet: 'conclusion',
  slide: 'global',
  map: 'global',
  section: 'transition',
  plain: 'transition'
};

function viewerScene(item: StreamItem): Scene {
  return {
    index: -1,
    blockId: item.blockLabel ?? '',
    order: 0,
    label: item.media ? LABEL_FOR_KIND[item.media.kind] : 'global',
    sectionId: '',
    sectionTitle: '',
    sectionIndex: 0,
    start: 0,
    end: 0,
    lead: item.subtitle,
    headline: item.title,
    media: item.media ?? null,
    captions: []
  };
}

function LaneTrack({
  items,
  readIds,
  activeId,
  onOpen
}: {
  items: StreamItem[];
  readIds: Set<string>;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = trackRef.current;
    if (node) node.scrollTo({ left: node.scrollWidth, behavior: 'smooth' });
  }, [items.length]);

  return (
    <div className='material-track' ref={trackRef}>
      {!items.length ? <span className='material-track-empty'>等待推送…</span> : null}
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        const read = readIds.has(item.id);
        return (
          <button
            className={`material-card ${activeId === item.id ? 'is-active' : ''} ${read ? 'is-read' : ''}`}
            key={item.id}
            type='button'
            onClick={() => onOpen(item.id)}
          >
            <span className='material-icon'>
              <Icon size={16} />
            </span>
            <span className='material-text'>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
            {read ? (
              <ChevronRight className='material-go' size={15} />
            ) : (
              <i className='material-dot' aria-label='未读' />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MaterialStream({
  items,
  readIds,
  activeId,
  onOpen,
  onClose
}: {
  items: StreamItem[];
  readIds: Set<string>;
  activeId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const active = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [items, activeId]
  );

  return (
    <section className='material-stream'>
      <header className='material-head'>
        <div>
          <span className='material-live'>
            <Radio size={13} />
            推送中
          </span>
          <h2>素材窗口</h2>
          <p>三条线持续把材料推到这里，打开任意一张都可以反复查看。</p>
        </div>
        <div className='material-stat'>
          <strong>{items.length}</strong>
          <span>已推送</span>
          <em>{readIds.size} 已读</em>
        </div>
      </header>

      <div className='material-lanes'>
        {LANES.map((lane) => {
          const laneItems = items.filter((item) => item.lane === lane.id);
          return (
            <div className='material-lane' key={lane.id}>
              <div className='material-lane-head'>
                <span>{lane.label}</span>
                <em>{lane.hint}</em>
                <b>{laneItems.length}</b>
              </div>
              <LaneTrack
                items={laneItems}
                readIds={readIds}
                activeId={activeId}
                onOpen={onOpen}
              />
            </div>
          );
        })}
      </div>

      {active ? (
        <div className='material-viewer'>
          <header className='material-viewer-head'>
            <div>
              <span>{active.blockLabel ? `讲稿块 ${active.blockLabel} · ` : ''}{KIND_LABEL[active.kind]}</span>
              <h3>{active.title}</h3>
            </div>
            <button className='icon-button' type='button' title='收起素材' onClick={onClose}>
              <X size={15} />
            </button>
          </header>
          <div className='material-viewer-stage'>
            <SceneMediaView scene={viewerScene(active)} />
          </div>
        </div>
      ) : (
        <div className='material-viewer is-empty'>
          <span>点开上面任意一张素材，详情会在这里展开。</span>
        </div>
      )}
    </section>
  );
}
