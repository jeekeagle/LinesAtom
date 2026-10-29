import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { api } from '../lib/api';
import type { BootstrapData, LectureMode } from '../types';

type ToastTone = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  tone: ToastTone;
}

interface AppContextValue {
  data: BootstrapData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (updater: BootstrapData | ((prev: BootstrapData) => BootstrapData)) => void;
  showToast: (message: string, tone?: ToastTone) => void;
  runtimeOpen: boolean;
  setRuntimeOpen: (open: boolean) => void;
  runtimeTrace: { title: string; steps: BootstrapData['runs'][number]['trace'] } | null;
  pushRuntime: (title: string, steps: BootstrapData['runs'][number]['trace']) => void;
  runMode: LectureMode;
  setRunMode: (mode: LectureMode) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [runtimeTrace, setRuntimeTrace] = useState<AppContextValue['runtimeTrace']>(null);
  const [runMode, setRunMode] = useState<LectureMode>('script');

  const refresh = useCallback(async () => {
    try {
      const next = await api.bootstrap();
      setDataState(next);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法连接讲义轴服务');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const setData = useCallback(
    (updater: BootstrapData | ((prev: BootstrapData) => BootstrapData)) => {
      setDataState((prev) => {
        if (!prev) return prev;
        const next = typeof updater === 'function' ? updater(prev) : updater;
        // 局部接口响应只覆盖它自己那几个字段，其余字段一律沿用上一份，
        // 避免某个响应少带一个集合就把整页数据打成 undefined。
        const patched = { ...next } as Record<string, unknown>;
        const previous = prev as unknown as Record<string, unknown>;
        for (const key of Object.keys(previous)) {
          if (patched[key] === undefined && previous[key] !== undefined) patched[key] = previous[key];
        }
        return patched as unknown as BootstrapData;
      });
    },
    []
  );

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ message, tone });
  }, []);

  const pushRuntime = useCallback(
    (title: string, steps: BootstrapData['runs'][number]['trace']) => {
      setRuntimeTrace({ title, steps });
      setRuntimeOpen(true);
    },
    []
  );

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      loading,
      error,
      refresh,
      setData,
      showToast,
      runtimeOpen,
      setRuntimeOpen,
      runtimeTrace,
      pushRuntime,
      runMode,
      setRunMode
    }),
    [data, loading, error, refresh, setData, showToast, runtimeOpen, runtimeTrace, pushRuntime, runMode]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className={`toast ${toast ? 'is-visible' : ''} tone-${toast?.tone ?? 'info'}`}>
        {toast?.message}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}