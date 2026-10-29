import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Section, Stat } from '../components/ui';

export function StructurePage() {
  const { data } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  if (!data) return null;
  const { project, labels } = data;

  const labelStats = useMemo(() => {
    const counts = project.blocks.reduce<Record<string, number>>((acc, block) => {
      acc[block.label] = (acc[block.label] ?? 0) + 1;
      return acc;
    }, {});
    const total = project.blocks.length || 1;
    return Object.entries(counts).map(([label, count]) => ({
      label,
      name: labels[label as keyof typeof labels] ?? label,
      count,
      ratio: count / total
    }));
  }, [project.blocks, labels]);

  const childrenOf = (parentId: string | null) =>
    project.concepts.filter((concept) => concept.parentId === parentId);

  const renderConcept = (parentId: string | null, depth = 0) =>
    childrenOf(parentId).map((concept) => (
      <div key={concept.id}>
        <button
          className={`concept-row ${depth > 0 ? 'is-child' : ''} ${selected === concept.id ? 'is-active' : ''}`}
          type="button"
          onClick={() => setSelected(concept.id)}
        >
          <span className="concept-index">{concept.id}</span>
          <span className="concept-name">{concept.name}</span>
          <span className="concept-def">{concept.definition}</span>
          <span className="concept-parent">锚点 {concept.anchorBlockId}</span>
        </button>
        {renderConcept(concept.id, depth + 1)}
      </div>
    ));

  const active = project.concepts.find((concept) => concept.id === selected);

  return (
    <div className="workspace">
      <div className="workspace-inner">
        <header className="workspace-head">
          <div>
            <div className="course-kicker">STRUCTURE · 结构台</div>
            <h1>讲稿的结构账本</h1>
            <p>
              概念条目、讲稿块与挂载指针分开维护：指针只存目标编号，内容随概念条目独立存放，可跨课复用。
            </p>
          </div>
        </header>

        <div className="stat-strip">
          <Stat value={project.sections.length} label="章节" />
          <Stat value={project.blocks.length} label="讲稿块" />
          <Stat value={project.concepts.length} label="概念" />
          <Stat value={project.pointers.length} label="挂载" />
          <Stat value={project.media.cases.length + project.media.qas.length} label="案例与问答" />
        </div>

        <div className="content-split">
          <div>
            <Section title="概念表" meta={`${project.concepts.length} 条`}>
              <div className="concept-tree">{renderConcept(null)}</div>
              {active ? (
                <div className="inspector">
                  <div className="inspector-title">
                    概念详情 · {active.name}
                  </div>
                  <p className="support-copy">{active.difference}</p>
                  <ul className="plain-list">
                    {active.misconceptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="support-provenance">
                    回指 {active.recurrences.length} 处 · 上位类{' '}
                    {project.concepts.find((item) => item.id === active.parentId)?.name ?? '根'}
                  </p>
                </div>
              ) : null}
            </Section>

            <Section title="挂载指针表" meta="指针只存目标编号">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>指针</th>
                    <th>块</th>
                    <th>介质</th>
                    <th>目标</th>
                    <th>触发</th>
                  </tr>
                </thead>
                <tbody>
                  {project.pointers.map((pointer) => {
                    const block = project.blocks.find((item) => item.id === pointer.blockId);
                    const target =
                      pointer.mediaType === 'concept'
                        ? project.concepts.find((item) => item.id === pointer.targetId)?.name
                        : (
                            [
                              ...project.media.cases,
                              ...project.media.qas,
                              ...project.media.cheatsheets,
                              ...project.media.slides,
                              ...project.media.maps
                            ] as { id: string; title: string }[]
                          ).find((item) => item.id === pointer.targetId)?.title;
                    return (
                      <tr key={pointer.id}>
                        <td className="pointer-code">{pointer.id}</td>
                        <td>
                          <span className="pointer-code">{pointer.blockId}</span>{' '}
                          <span className="pointer-target">{block?.text.slice(0, 18)}…</span>
                        </td>
                        <td>{data.mediaLabels[pointer.mediaType]}</td>
                        <td className="pointer-target">
                          <strong>{target ?? pointer.targetId}</strong>
                        </td>
                        <td>
                          <Badge tone={pointer.trigger === 'preload' ? 'ok' : 'neutral'}>
                            {pointer.trigger === 'preload' ? '预挂载' : '入口'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          </div>

          <div>
            <Section title="标签分布" meta="六类判定同法">
              <div className="tag-distribution">
                {labelStats.map((item) => (
                  <div className="tag-bar-row" key={item.label}>
                    <span className="tag-bar-label">{item.name}</span>
                    <span className="tag-bar-track">
                      <span
                        className={`tag-bar-fill ${item.label}`}
                        style={{ width: `${Math.round(item.ratio * 100)}%` }}
                      />
                    </span>
                    <span className="tag-bar-value">{item.count}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="挂载规则" meta="一一对应">
              <div className="type-summary">
                {Object.entries(data.mountRules).map(([label, media]) => (
                  <div className="type-row" key={label}>
                    <div>
                      <div className="type-name">{labels[label as keyof typeof labels]}</div>
                      <div className="type-desc">
                        {media ? `挂载 ${data.mediaLabels[media]}` : '不挂载，仅作导航'}
                      </div>
                    </div>
                    <ExternalLink size={14} className="type-icon" />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="讲稿块" meta={`${project.blocks.length} 块`}>
              <div className="block-list">
                {project.blocks.map((block) => (
                  <div className="block-list-row" key={block.id}>
                    <span className="block-index">{String(block.order).padStart(3, '0')}</span>
                    <span className={`label-chip label-${block.label}`}>
                      {labels[block.label as keyof typeof labels]}
                    </span>
                    <span className="block-list-text">{block.text}</span>
                    <span className="block-index">
                      {project.pointers.filter((p) => p.blockId === block.id).length}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}