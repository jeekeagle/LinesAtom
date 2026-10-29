import { ArrowRight, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { Badge, Section, Toggle } from '../components/ui';

export function WorkflowsPage() {
  const { data, setData, showToast } = useApp();
  if (!data) return null;
  const { workflows } = data;

  const toggle = async (id: string, enabled: boolean) => {
    try {
      const result = await api.updateWorkflow(id, { enabled });
      setData((prev) => (prev ? { ...prev, workflows: result.workflows } : prev));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新失败', 'error');
    }
  };

  const setDefault = async (id: string) => {
    try {
      const result = await api.setDefaultWorkflow(id);
      setData((prev) => (prev ? { ...prev, workflows: result.workflows } : prev));
      showToast('默认流程已切换');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换失败', 'error');
    }
  };

  return (
    <div className="workspace">
      <div className="workspace-inner">
        <header className="workspace-head">
          <div>
            <div className="course-kicker">WORKFLOWS · 流程台</div>
            <h1>三种默认生产模式</h1>
            <p>
              流程与技能一样可配置：模块按同一套阶段编排，模式只改变起点与顺序，不改变数据契约。
            </p>
          </div>
        </header>

        <div className="workflow-grid">
          {workflows.map((workflow) => (
            <article className="workflow-card" key={workflow.id}>
              <header className="workflow-card-head">
                <div>
                  <span className="eyebrow">
                    {data.modeLabels[workflow.mode as keyof typeof data.modeLabels]}
                  </span>
                  <h2>{workflow.name}</h2>
                </div>
                <Toggle
                  checked={workflow.enabled}
                  label={`${workflow.name} 启用开关`}
                  onChange={(next) => void toggle(workflow.id, next)}
                />
              </header>
              <p className="workflow-desc">{workflow.description}</p>
              <ol className="workflow-steps">
                {workflow.steps.map((step, index) => (
                  <li key={step.id}>
                    <span className="workflow-step-index">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.description}</p>
                      <div className="workflow-step-meta">
                        <Badge>{data.stageLabels[step.stage as keyof typeof data.stageLabels]}</Badge>
                        {step.skillIds.slice(0, 3).map((skillId) => (
                          <span key={skillId}>{skillId}</span>
                        ))}
                      </div>
                    </div>
                    {index < workflow.steps.length - 1 ? (
                      <ArrowRight size={14} className="workflow-arrow" />
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="config-actions">
                <button className="button button-ghost button-sm" type="button" onClick={() => void setDefault(workflow.id)}>
                  <Star size={14} />
                  {workflow.isDefault ? '默认流程' : '设为默认'}
                </button>
                {workflow.isDefault ? <Badge tone="ok">默认</Badge> : null}
              </div>
            </article>
          ))}
        </div>

        <Section title="阶段契约" meta="四段串行，段段有判定标准">
          <table className="data-table">
            <thead>
              <tr>
                <th>阶段</th>
                <th>输入</th>
                <th>输出</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>内容基座构建</td>
                <td>课程主题、讲解思路、指定知识库与教材材料</td>
                <td>概念表、关系网、素材池</td>
                <td>每个概念均有定义与上位类；关系网无孤立节点</td>
              </tr>
              <tr>
                <td>讲稿生成与同步标注</td>
                <td>内容基座、时长、认知负荷上限、骨架概念清单</td>
                <td>讲稿正文、块切分表、标签表</td>
                <td>总字数符合时长倒推值；核心概念数量不超上限；无未标注块</td>
              </tr>
              <tr>
                <td>挂载编排</td>
                <td>标注表、内容基座</td>
                <td>挂载指针表、待生成介质清单</td>
                <td>每个核心概念锚点均有卡片指针；无重复挂载；回指仅存跳转</td>
              </tr>
              <tr>
                <td>呈现渲染</td>
                <td>讲稿、标注、挂载、介质内容</td>
                <td>单页网页</td>
                <td>跳转即时，上下文连续，返回原位不丢进度</td>
              </tr>
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}