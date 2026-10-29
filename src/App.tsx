import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { LecturePage } from './pages/LecturePage';
import { StudioPage } from './pages/StudioPage';
import { StructurePage } from './pages/StructurePage';
import { SkillsPage } from './pages/SkillsPage';
import { EnginesPage } from './pages/EnginesPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CoursesPage } from './pages/CoursesPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { LearnCoursePage, LearnPage } from './pages/LearnPage';
import { WatchPage } from './pages/WatchPage';
import { UnitPage } from './pages/UnitPage';
import { LoaderCircle, PlugZap } from 'lucide-react';

function AppRoutes() {
  const { loading, error, refresh } = useApp();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="loading-mark">
          <span />
          <span />
        </span>
        <p>正在打开讲义轴</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <span className="error-code">SERVICE / OFFLINE</span>
        <h1>讲义轴服务未连接</h1>
        <p>{error}</p>
        <button className="button button-primary button-md" onClick={() => void refresh()}>
          <PlugZap size={16} />
          重新连接
        </button>
        <p className="app-error-hint">
          请先运行 <code>npm start</code>，服务默认监听 127.0.0.1:8790。
        </p>
      </div>
    );
  }

  return (
    <Routes>
      {/* 学生端与播放台独立于开发外壳：发布之后看到的界面 */}
      <Route path='/learn' element={<LearnPage />} />
      <Route path='/learn/:courseId' element={<LearnCoursePage />} />
      <Route path='/learn/:courseId/watch/:lessonId' element={<UnitPage />} />
      <Route path='/watch/:lectureId' element={<WatchPage mode='author' />} />
      <Route path='/*' element={<ShellRoutes />} />
    </Routes>
  );
}

function ShellRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/lecture" element={<LecturePage />} />
        <Route path="/structure" element={<StructurePage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/engines" element={<EnginesPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

export const Loader = LoaderCircle;
