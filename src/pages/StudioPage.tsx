import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, PlayCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { TimelineStudio, type StudioActions } from '../components/TimelineStudio';
import type { MountSuggestion } from '../types';

export function StudioPage() {
  const { data, setData, showToast, pushRuntime } = useApp();
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  const applyProject = (project: typeof data.project) => {
    setData((prev) => (prev ? { ...prev, project } : prev));
  };

  const actions: StudioActions = {
    busy,
    onGenerateSuggestions: async () => {
      setBusy(true);
      try {
        const result = await api.generateSuggestions();
        applyProject(result.project);
        showToast(
          `已生成 ${result.suggestions.length} 条挂载建议${
            result.warnings.length ? ` · ${result.warnings[0]}` : ''
          }`
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : '生成失败', 'error');
      } finally {
        setBusy(false);
      }
    },
    onApplySuggestion: async (id: string, edit?: Partial<MountSuggestion>) => {
      setBusy(true);
      try {
        const result = await api.applySuggestion(id, edit);
        applyProject(result.project);
        showToast('挂载已确认');
      } catch (error) {
        showToast(error instanceof Error ? error.message : '挂载失败', 'error');
      } finally {
        setBusy(false);
      }
    },
    onRejectSuggestion: async (id: string) => {
      setBusy(true);
      try {
        const result = await api.rejectSuggestion(id);
        applyProject(result.project);
        showToast('已拒绝这条建议');
      } catch (error) {
        showToast(error instanceof Error ? error.message : '操作失败', 'error');
      } finally {
        setBusy(false);
      }
    },
    onApplyAll: async () => {
      setBusy(true);
      try {
        const result = await api.applyAllSuggestions();
        applyProject(result.project);
        showToast(
          `已确认 ${result.applied} 条挂载建议${result.skipped ? `，${result.skipped} 条低置信建议保留待定` : ''}`
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : '批量确认失败', 'error');
      } finally {
        setBusy(false);
      }
    }
  };

  const pending = (data.project.suggestions ?? []).filter((item) => item.status === 'pending').length;

  return (
    <div className="page-studio">
      <header className="studio-page-head">
        <div>
          <div className="course-kicker">STUDIO · 剪辑台</div>
          <h1>{data.project.meta.title}</h1>
          <p>
            讲稿是一条确定的时间轴。Agent 逐行给出挂载建议，你负责确认、修改或拒绝。
          </p>
        </div>
        <div className="button-row">
          <span className="studio-pending">
            {pending > 0 ? `${pending} 条建议待确认` : '挂载建议已处理完'}
          </span>
          <Link className="button button-primary button-md" to="/watch/active">
            <PlayCircle size={15} />
            播放讲稿
          </Link>
          <Link className="button button-secondary button-md" to="/lecture">
            <BookOpen size={15} />
            打开阅读台
          </Link>
        </div>
      </header>

      <TimelineStudio project={data.project} actions={actions} />

      <footer className="studio-foot">
        <span>空格播放 / 暂停</span>
        <span>← → 切换行</span>
        <span>点击时间尺或轨道可定位</span>
        <span>滚轮或滑块缩放时间线</span>
      </footer>
      {void pushRuntime}
    </div>
  );
}
