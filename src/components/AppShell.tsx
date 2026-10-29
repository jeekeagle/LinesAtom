import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Cog,
  Cpu,
  LayoutDashboard,
  LibraryBig,
  Menu,
  Network,
  Scissors,
  Sparkles,
  Workflow
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RuntimeDrawer } from './RuntimeDrawer';
import { EndSwitch } from './EndSwitch';

/** 三层导航：课程是入口，开发是工作台，系统是配置层。 */
const NAV_GROUPS: {
  title: string;
  items: { to: string; label: string; icon: typeof Cog; end?: boolean }[];
}[] = [
  {
    title: '课程',
    items: [
      { to: '/courses', label: '课程台', icon: LibraryBig },
      { to: '/', label: '讲稿总览', icon: LayoutDashboard, end: true }
    ]
  },
  {
    title: '开发',
    items: [
      { to: '/studio', label: '剪辑台', icon: Scissors },
      { to: '/lecture', label: '阅读台', icon: BookOpen },
      { to: '/structure', label: '结构台', icon: Network },
      { to: '/workflows', label: '流程台', icon: Workflow },
      { to: '/skills', label: '技能台', icon: Sparkles },
      { to: '/engines', label: '介质引擎', icon: Cpu }
    ]
  },
  {
    title: '系统',
    items: [{ to: '/settings', label: '设置台', icon: Cog }]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data, setRuntimeOpen, runtimeOpen } = useApp();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const project = data?.project;
  const enabledSkills = data?.skills.filter((skill) => skill.enabled).length ?? 0;

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="shell">
      <aside className={`shell-sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="shell-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>讲义轴</strong>
            <small>LECTURE AXIS</small>
          </span>
        </div>

        <nav className="shell-nav" aria-label="主导航">
          {NAV_GROUPS.map((group) => (
            <div className="shell-nav-group" key={group.title}>
              <span className="shell-nav-title">{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) => `shell-nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shell-sidebar-foot">
          <div className="shell-foot-row">
            <span>介质引擎</span>
            <span className="engine-status-dot" aria-label="引擎就绪" />
          </div>
          <p>
            {project?.engineSnapshot?.provider ?? 'local-deterministic'}
            <br />
            {project?.meta?.engineRunId || 'seed'}
          </p>
          <div className="shell-foot-row">
            <span>启用技能</span>
            <strong>
              {enabledSkills}/{data?.skills.length ?? 0}
            </strong>
          </div>
        </div>
      </aside>
      <button
        className={`shell-scrim ${navOpen ? 'is-visible' : ''}`}
        type='button'
        aria-label='关闭导航'
        onClick={() => setNavOpen(false)}
      />

      <div className="shell-main">
        <header className="shell-topbar">
          <button
            className='shell-nav-toggle'
            type='button'
            aria-label='打开导航'
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <Menu size={18} />
          </button>
          <div className="shell-topbar-title">
            <span className="shell-course">{project?.meta?.course ?? '结构化讲稿'}</span>
            <strong>{project?.meta?.title ?? '未命名讲稿'}</strong>
          </div>
          <div className="shell-topbar-actions">
            <span className="shell-revision">
              修订 {project?.meta?.revision ?? 1} · {project?.blocks.length ?? 0} 块 ·{' '}
              {project?.pointers.length ?? 0} 挂载
            </span>
            <button
              className={`button button-ghost button-md ${runtimeOpen ? 'is-on' : ''}`}
              onClick={() => setRuntimeOpen(!runtimeOpen)}
              type="button"
              title='运行记录'
            >
              <Activity size={15} />
              <span className='topbar-action-label'>运行记录</span>
            </button>
            <EndSwitch current='author' />
          </div>
        </header>
        <main className="shell-content">{children}</main>
      </div>

      <RuntimeDrawer />
    </div>
  );
}
