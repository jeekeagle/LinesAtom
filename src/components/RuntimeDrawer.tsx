import { X, History, CircleDot } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatTime } from '../lib/format';

const stateLabel: Record<string, string> = {
  pending: '等待',
  running: '执行中',
  done: '完成',
  skipped: '跳过',
  failed: '失败'
};

export function RuntimeDrawer() {
  const { data, runtimeOpen, setRuntimeOpen, runtimeTrace } = useApp();
  if (!runtimeOpen) return null;

  return (
    <>
      <button
        className="drawer-scrim"
        type="button"
        aria-label="关闭运行记录"
        onClick={() => setRuntimeOpen(false)}
      />
      <aside className="runtime-drawer" aria-label="运行记录">
        <header className="drawer-head">
          <div>
            <span className="drawer-kicker">
              <History size={13} /> 运行记录
            </span>
            <h2>{runtimeTrace?.title ?? '引擎运行轨迹'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => setRuntimeOpen(false)}>
            <X size={16} />
          </button>
        </header>

        <div className="drawer-body">
          {runtimeTrace?.steps?.length ? (
            <ol className="trace-list">
              {runtimeTrace.steps.map((step) => (
                <li key={step.id} className={`trace-item is-${step.state}`}>
                  <CircleDot size={13} />
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <em>{step.durationMs}ms</em>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="drawer-section">
            <h3>历史运行</h3>
            {data?.runs?.length ? (
              <ul className="run-list">
                {data.runs.map((run) => (
                  <li key={run.runId}>
                    <div className="run-line">
                      <strong>{run.output}</strong>
                      <span>{formatTime(run.finishedAt)}</span>
                    </div>
                    <p>
                      {run.mode} · {run.provider} · {run.durationMs}ms
                    </p>
                    {run.warnings.length ? (
                      <ul className="run-warnings">
                        {run.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
          <p className="muted-text">还没有运行记录。到介质引擎跑一次流水线。</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
