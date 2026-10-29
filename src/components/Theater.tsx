import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { LectureProject } from '../types';
import { MEDIA_LABEL, SCENE_LABEL, buildScore, captionAt, sceneAt, type Scene } from '../lib/score';
import { formatClock } from '../lib/format';
import { api } from '../lib/api';

const RATES = [0.75, 1, 1.25, 1.5];

interface TheaterProps {
  lecture: LectureProject;
  courseLabel?: string;
  lessonLabel?: string;
  onExit?: () => void;
  progressKey?: string;
  initialTime?: number;
  /** embed：装进单元页的视频窗口；full：整屏播放。 */
  variant?: 'full' | 'embed';
  onScene?: (scene: Scene | null) => void;
  /** 设置台里已配置密钥的声音服务，作为远端音色选项 */
  voiceSources?: { id: string; label: string }[];
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const chinese = voices.filter((voice) => /^zh/i.test(voice.lang));
  if (!chinese.length) return null;
  const preferred = chinese.find((voice) =>
    /xiaoxiao|yunxi|yunyang|huihui|kangkang|tingting|mei|kaka/i.test(voice.name)
  );
  return preferred ?? chinese.find((voice) => /zh-CN/i.test(voice.lang)) ?? chinese[0];
}

export function Theater({
  lecture,
  courseLabel,
  lessonLabel,
  onExit,
  progressKey,
  initialTime = 0,
  variant = 'full',
  onScene,
  voiceSources = []
}: TheaterProps) {
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [voiceSource, setVoiceSource] = useState('local');
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState({ time: 0, scene: 0, caption: 0, progress: 0 });

  const score = useMemo(() => buildScore(lecture, rate), [lecture, rate]);
  const timeRef = useRef(initialTime);
  const speakingRef = useRef(false);
  const captionRef = useRef(0);
  const voiceRef = useRef(true);
  const rateRef = useRef(1);
  const voiceHandleRef = useRef<SpeechSynthesisVoice | null>(null);
  const resumeCaptionRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const savedAtRef = useRef(initialTime);
  const viewportRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef(new Map<string, string>());
  const prefetchingRef = useRef(new Set<string>());

  const scenes = score.scenes;
  const scene: Scene | null = scenes[Math.min(position.scene, Math.max(0, scenes.length - 1))] ?? null;
  const caption = scene
    ? (scene.captions.find((item) => item.globalIndex === position.caption) ?? scene.captions[0])
    : null;
  const previousCaption = useMemo(() => {
    if (!caption || caption.globalIndex === 0) return '';
    const target = caption.globalIndex - 1;
    for (const item of scenes) {
      const found = item.captions.find((entry) => entry.globalIndex === target);
      if (found) return found.text;
    }
    return '';
  }, [caption, scenes]);

  /* 默认优先使用设置台配置好的远端音色（MiMo 等）。 */
  useEffect(() => {
    if (voiceSource === 'local' && voiceSources.length) setVoiceSource(voiceSources[0].id);
  }, [voiceSources, voiceSource]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      for (const url of audioCacheRef.current.values()) URL.revokeObjectURL(url);
      audioCacheRef.current.clear();
    },
    []
  );

  const audioUrl = (base64: string, format: string) => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const blob = new Blob([bytes], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  const rememberAudio = (key: string, url: string) => {
    const cache = audioCacheRef.current;
    if (cache.size > 120) {
      const oldest = cache.keys().next();
      if (!oldest.done) {
        URL.revokeObjectURL(oldest.value);
        cache.delete(oldest.value);
      }
    }
    cache.set(key, url);
  };

  /** 预取下一句，尽量不让远端合成阻塞讲解节奏。 */
  const prefetchCaption = async (globalIndex: number) => {
    if (voiceSource === 'local') return;
    const flat = scenes.flatMap((item) => item.captions);
    const target = flat[globalIndex];
    if (!target) return;
    const key = `${voiceSource}|${target.text}`;
    if (audioCacheRef.current.has(key) || prefetchingRef.current.has(key)) return;
    prefetchingRef.current.add(key);
    try {
      const result = await api.tts({ text: target.text, serviceId: voiceSource });
      rememberAudio(key, audioUrl(result.audioBase64, result.format));
    } catch {
      /* 预取失败不影响讲解，播放时会再试一次 */
    } finally {
      prefetchingRef.current.delete(key);
    }
  };

  const publish = useCallback(() => {
    const time = timeRef.current;
    const current = sceneAt(scenes, time);
    const currentCaption = captionAt(current, time);
    setPosition((prev) => {
      const nextScene = current?.index ?? 0;
      const nextCaption = currentCaption?.globalIndex ?? 0;
      const timeShift = Math.abs(prev.time - time) >= 0.4;
      const fullTick = Math.floor(prev.time) !== Math.floor(time);
      if (prev.scene !== nextScene || prev.caption !== nextCaption || timeShift || fullTick) {
        return {
          time,
          scene: nextScene,
          caption: nextCaption,
          progress: score.total ? time / score.total : 0
        };
      }
      return prev;
    });
  }, [scenes, score.total]);

  useEffect(() => {
    publish();
    return () => {
      if (progressKey) {
        try {
          window.localStorage.setItem(progressKey, String(Math.round(timeRef.current)));
        } catch {
          /* 本地存储不可用时忽略 */
        }
      }
    };
  }, [progressKey, publish]);

  useEffect(() => {
    onScene?.(scene);
  }, [scene, onScene]);

  /* 切句即发声：本地走浏览器语音，远端走声音服务；读完把时钟顶到句尾。 */
  useEffect(() => {
    captionRef.current = position.caption;
    voiceRef.current = voiceOn;
    if (!playing || !voiceOn) return;
    const target = scenes
      .flatMap((item) => item.captions)
      .find((item) => item.globalIndex === position.caption);
    if (!target) return;
    let cancelled = false;

    if (voiceSource === 'local') {
      if (!('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      audioRef.current?.pause();
      const timer = window.setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(target.text);
        const voice = voiceHandleRef.current ?? pickVoice();
        utterance.voice = voice;
        utterance.lang = voice?.lang ?? 'zh-CN';
        utterance.rate = rateRef.current;
        utterance.onstart = () => {
          speakingRef.current = true;
        };
        utterance.onend = () => {
          speakingRef.current = false;
          if (captionRef.current === target.globalIndex) {
            timeRef.current = Math.max(timeRef.current, target.end);
            publish();
          }
        };
        utterance.onerror = () => {
          speakingRef.current = false;
        };
        speakingRef.current = true;
        synth.speak(utterance);
      }, 30);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        speakingRef.current = false;
        synth.cancel();
      };
    }

    // 远端音色：按句合成、命中缓存即复用；缓冲期按住时钟，避免跳句。
    window.speechSynthesis?.cancel();
    const key = `${voiceSource}|${target.text}`;
    setBuffering(true);
    speakingRef.current = true;
    const settle = () => {
      if (cancelled) return;
      speakingRef.current = false;
      setBuffering(false);
      if (captionRef.current === target.globalIndex) {
        timeRef.current = Math.max(timeRef.current, target.end);
        publish();
      }
    };
    const run = async () => {
      try {
        let url = audioCacheRef.current.get(key);
        if (!url) {
          const result = await api.tts({ text: target.text, serviceId: voiceSource });
          if (cancelled) return;
          url = audioUrl(result.audioBase64, result.format);
          rememberAudio(key, url);
        }
        if (cancelled || captionRef.current !== target.globalIndex) return;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.playbackRate = rateRef.current;
        audio.onplay = () => {
          if (!cancelled) {
            speakingRef.current = true;
            setBuffering(false);
          }
        };
        audio.onended = () => {
          settle();
          if (!cancelled) void prefetchCaption(target.globalIndex + 1);
        };
        audio.onerror = settle;
        await audio.play();
      } catch {
        settle();
      }
    };
    void run();
    void prefetchCaption(position.caption + 1);

    return () => {
      cancelled = true;
      speakingRef.current = false;
      setBuffering(false);
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audioRef.current = null;
      }
    };
  }, [position.caption, playing, voiceOn, scenes, publish, voiceSource]);

  /* 播放时钟：开声音以句尾为节拍，关声音按语速估计推进。 */
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const delta = Math.min(0.25, (now - last) / 1000);
      last = now;
      let next = timeRef.current + delta;
      if (voiceOn && speakingRef.current) {
        const currentCaption = scenes
          .flatMap((item) => item.captions)
          .find((item) => item.globalIndex === captionRef.current);
        if (currentCaption) next = Math.min(next, currentCaption.end - 0.04);
      }
      if (next >= score.total) {
        timeRef.current = score.total;
        window.speechSynthesis?.cancel();
        publish();
        setPlaying(false);
        return;
      }
      timeRef.current = next;
      if (progressKey && timeRef.current - savedAtRef.current >= 5) {
        savedAtRef.current = timeRef.current;
        try {
          window.localStorage.setItem(progressKey, String(Math.round(timeRef.current)));
        } catch {
          /* 本地存储不可用时忽略 */
        }
      }
      publish();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, voiceOn, scenes, score.total, publish, progressKey]);

  /* 首次拿不到音色时等 voiceschanged 再取。 */
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const assign = () => {
      voiceHandleRef.current = pickVoice();
    };
    assign();
    window.speechSynthesis.addEventListener('voiceschanged', assign);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', assign);
  }, []);

  /* 换语速：以当前字幕为锚点重建时间轴，不跳行。 */
  useEffect(() => {
    if (resumeCaptionRef.current === null) return;
    const index = resumeCaptionRef.current;
    resumeCaptionRef.current = null;
    const target = scenes.flatMap((item) => item.captions).find((item) => item.globalIndex === index);
    if (target) {
      timeRef.current = target.start;
      publish();
    }
  }, [scenes, publish]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  /* 1920×1080 画布按窗口等比缩放，四周留黑边，像播放视频一样。 */
  useEffect(() => {
    const fit = () => {
      const node = viewportRef.current;
      if (!node) return;
      setScale(Math.min(node.clientWidth / 1920, node.clientHeight / 1080));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const seek = useCallback(
    (time: number) => {
      timeRef.current = Math.max(0, Math.min(score.total - 0.01, time));
      speakingRef.current = false;
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      publish();
      if (playing && voiceOn) {
        setPosition((prev) => ({ ...prev, caption: -1 }));
        window.setTimeout(() => publish(), 20);
      }
    },
    [playing, publish, score.total, voiceOn]
  );

  const gotoScene = useCallback(
    (index: number) => {
      const target = scenes[Math.max(0, Math.min(scenes.length - 1, index))];
      if (target) seek(target.start);
    },
    [scenes, seek]
  );

  const togglePlay = useCallback(() => {
    setPlaying((prev) => {
      const next = !prev;
      if (!next) {
        window.speechSynthesis?.cancel();
        audioRef.current?.pause();
        speakingRef.current = false;
      }
      if (next && timeRef.current >= score.total - 0.2) {
        timeRef.current = 0;
        publish();
      }
      return next;
    });
  }, [publish, score.total]);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), 2600);
  }, []);

  useEffect(() => {
    if (!playing) {
      setChromeVisible(true);
      return;
    }
    showChrome();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [playing, showChrome]);

  const changeRate = useCallback(
    (next: number) => {
      resumeCaptionRef.current = position.caption;
      rateRef.current = next;
      setRate(next);
      window.speechSynthesis?.cancel();
    },
    [position.caption]
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        gotoScene((scene?.index ?? 0) + 1);
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        gotoScene((scene?.index ?? 0) - 1);
      } else if (event.key.toLowerCase() === 'c') {
        setCaptionsOn((prev) => !prev);
      } else if (event.key.toLowerCase() === 'v') {
        setVoiceOn((prev) => !prev);
        window.speechSynthesis?.cancel();
      } else if (event.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (event.key === 'Escape' && !document.fullscreenElement && onExit) {
        onExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gotoScene, onExit, scene, togglePlay, toggleFullscreen]);

  const seekByPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seek(ratio * score.total);
  };

  return (
    <div
      className={`theater ${variant === 'embed' ? 'is-embed' : ''}`}
      onPointerMove={showChrome}
      onPointerDown={showChrome}
    >
      <div className="theater-viewport" ref={viewportRef}>
        <div
          className="theater-frame"
          style={{ ['--theater-scale' as string]: String(scale) }}
        >
          <header className="theater-head">
            <div className="theater-head-left">
              <span className="theater-brand">讲义轴 · 播放</span>
              <span className="theater-course">{courseLabel ?? score.course}</span>
              <strong>{lessonLabel ?? score.title}</strong>
            </div>
            <div className="theater-head-right">
              <span>
                {scene ? scene.sectionIndex + 1 : 0}/{score.sections.length} ·{' '}
                {scene?.sectionTitle ?? '—'}
              </span>
              <span className="theater-head-count">
                第 {scene ? String(scene.order).padStart(2, '0') : '00'} 块 / 共 {scenes.length} 块
              </span>
            </div>
          </header>

          <div className="theater-body">
            <aside className="theater-rail">
              <div className="theater-counter">
                {scene ? String(scene.order).padStart(3, '0') : '000'}
              </div>
              <div className="theater-counter-label">讲稿块 · 确定性时间轴</div>
              <ol className="theater-sections">
                {score.sections.map((section) => {
                  const active = scene?.sectionId === section.id;
                  const done = scene ? section.index < scene.sectionIndex : false;
                  const ratio = Math.max(
                    0,
                    Math.min(
                      100,
                      ((position.time - section.start) /
                        Math.max(1, section.end - section.start)) *
                        100
                    )
                  );
                  return (
                    <li key={section.id} className={active ? 'is-active' : done ? 'is-done' : ''}>
                      <span className="theater-section-index">
                        {String(section.index + 1).padStart(2, '0')}
                      </span>
                      <span className="theater-section-title">{section.title}</span>
                      <i>
                        <b style={{ width: active ? `${ratio}%` : done ? '100%' : '0%' }} />
                      </i>
                    </li>
                  );
                })}
              </ol>
              <div className="theater-rail-foot">
                <span>{formatClock(position.time)}</span>
                <em>/ {formatClock(score.total)}</em>
              </div>
            </aside>

            <main className="theater-stage" key={scene?.index ?? 'empty'}>
              <div className="theater-kicker">
                <span>{scene ? SCENE_LABEL[scene.label] : '讲稿'}</span>
                <em>{scene?.media ? MEDIA_LABEL[scene.media.kind] : '正文'}</em>
              </div>
              <h1 className="theater-headline">{scene?.headline ?? score.title}</h1>
              <div className="theater-media">
                {scene ? <SceneMediaView scene={scene} /> : null}
              </div>
            </main>
          </div>

          <footer className={`theater-subtitles ${captionsOn ? '' : 'is-hidden'}`}>
            <p className="theater-sub-prev">{previousCaption}</p>
            <p className="theater-sub-now" key={caption?.globalIndex ?? 'none'}>
              {caption?.text ?? ''}
            </p>
          </footer>

          {variant === 'embed' && !playing ? (
            <button
              className="theater-play-overlay"
              type="button"
              aria-label="播放本节微课"
              onClick={togglePlay}
            >
              <Play size={54} />
            </button>
          ) : null}

          <div className={`theater-chrome ${chromeVisible || !playing ? 'is-visible' : ''}`}>
            <div className="theater-seek" onClick={seekByPointer} role="presentation">
              <div className="theater-seek-track">
                <span style={{ width: `${position.progress * 100}%` }} />
                {score.sections.map((section) => (
                  <i
                    key={section.id}
                    title={section.title}
                    style={{ left: `${(section.start / Math.max(1, score.total)) * 100}%` }}
                  />
                ))}
              </div>
            </div>
        <div className="theater-controls">
          <div className="theater-controls-side">
            <button
              className="theater-btn"
              type="button"
              title="上一块"
              onClick={() => gotoScene((scene?.index ?? 0) - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="theater-btn theater-btn-main"
              type="button"
              title={playing ? '暂停' : '播放'}
              onClick={togglePlay}
            >
              {playing ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button
              className="theater-btn"
              type="button"
              title="下一块"
              onClick={() => gotoScene((scene?.index ?? 0) + 1)}
            >
              <ChevronRight size={20} />
            </button>
            <span className="theater-time">
              {formatClock(position.time)} <em>/ {formatClock(score.total)}</em>
            </span>
          </div>
          <div className="theater-controls-side is-right">
            {voiceSources.length ? (
              <select
                className={`theater-voice ${buffering ? 'is-busy' : ''}`}
                value={voiceSource}
                aria-label="朗读音色"
                title={buffering ? '正在合成当前句…' : '选择朗读来源'}
                onChange={(event) => {
                  setVoiceSource(event.target.value);
                  window.speechSynthesis?.cancel();
                  audioRef.current?.pause();
                  speakingRef.current = false;
                  if (playing) setPosition((prev) => ({ ...prev, caption: prev.caption }));
                }}
              >
                <option value="local">本地语音</option>
                {voiceSources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className="theater-rate"
              value={rate}
              aria-label="播放速度"
              onChange={(event) => changeRate(Number(event.target.value))}
            >
              {RATES.map((item) => (
                <option key={item} value={item}>
                  {item.toFixed(2).replace(/0$/, '')}×
                </option>
              ))}
            </select>
            <button
              className={`theater-btn ${captionsOn ? 'is-on' : ''}`}
              type="button"
              title="字幕"
              onClick={() => setCaptionsOn((prev) => !prev)}
            >
              <Captions size={20} />
            </button>
            <button
              className={`theater-btn ${voiceOn ? 'is-on' : ''}`}
              type="button"
              title={voiceOn ? '关闭朗读' : '开启朗读'}
              onClick={() => {
                setVoiceOn((prev) => !prev);
                window.speechSynthesis?.cancel();
              }}
            >
              {voiceOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button className="theater-btn" type="button" title="全屏" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            {onExit ? (
              <button className="theater-btn" type="button" title="退出播放" onClick={onExit}>
                <X size={20} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
  );
}

function StageRows({ rows }: { rows: { key: string; value: string; delay: number }[] }) {
  return (
    <div className="stage-rows">
      {rows.map((row) => (
        <div className="stage-row" key={row.key} style={{ animationDelay: `${row.delay}s` }}>
          <span className="stage-row-key">{row.key}</span>
          <p>{row.value}</p>
        </div>
      ))}
    </div>
  );
}

export function SceneMediaView({ scene }: { scene: Scene }) {
  const media = scene.media;

  if (scene.label === 'transition' || (scene.label === 'global' && !media)) {
    return (
      <div className="stage-section">
        <span className="stage-section-eyebrow">
          章节 {String(scene.sectionIndex + 1).padStart(2, '0')}
        </span>
        <h2>{scene.sectionTitle}</h2>
        <p>{scene.lead}</p>
      </div>
    );
  }

  if (media?.kind === 'concept' && media.concept) {
    const concept = media.concept;
    const rows = [
      media.parentName ? { key: '上位类', value: media.parentName, delay: 0.3 } : null,
      { key: '同层差异', value: concept.difference || '与最相近概念的区别见同层关系。', delay: 0.45 },
      ...concept.misconceptions.slice(0, 3).map((item, index) => ({
        key: `易混 ${index + 1}`,
        value: item,
        delay: 0.6 + index * 0.15
      })),
      media.children?.length
        ? { key: '下位概念', value: media.children.join(' · '), delay: 0.9 }
        : null
    ].filter(Boolean) as { key: string; value: string; delay: number }[];

    return (
      <div className={`stage-concept ${media.recurrence ? 'is-recurrence' : ''}`}>
        <div className="stage-concept-head">
          {media.recurrence ? (
            <span className="stage-chip is-recurrence">回指 · 锚点 {concept.anchorBlockId}</span>
          ) : (
            <span className="stage-chip">首次出现 · 锚点 {concept.anchorBlockId}</span>
          )}
        </div>
        <p className="stage-concept-def">{concept.definition}</p>
        <StageRows rows={rows} />
      </div>
    );
  }

  if (media?.kind === 'case' && media.caseItem) {
    const item = media.caseItem;
    const steps = [
      { no: '01', label: '背景', text: item.background, delay: 0.3 },
      { no: '02', label: '做法', text: item.action, delay: 0.55 },
      { no: '03', label: '结果', text: item.result, delay: 0.8 }
    ];
    return (
      <div className="stage-case">
        <span className="stage-case-eyebrow">{item.eyebrow || '理解性例子'}</span>
        <div className="stage-case-steps">
          {steps.map((step) => (
            <div className="stage-case-step" key={step.no} style={{ animationDelay: `${step.delay}s` }}>
              <b>{step.no}</b>
              <span>{step.label}</span>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (media?.kind === 'qa' && media.qa) {
    const item = media.qa;
    return (
      <div className="stage-qa">
        <div className="stage-q" style={{ animationDelay: '0.3s' }}>
          <span>问</span>
          <p>{item.question}</p>
        </div>
        <div className="stage-a" style={{ animationDelay: '0.75s' }}>
          <span>答 · 先给结论</span>
          <p>{item.answer}</p>
        </div>
      </div>
    );
  }

  if (media?.kind === 'cheatsheet' && media.cheatsheet) {
    const item = media.cheatsheet;
    const cards = item.cards ?? [];
    return (
      <div className="stage-sheet">
        <span className="stage-sheet-eyebrow">{item.intro || '本段落点'}</span>
        {item.mode === 'flashcard' && cards.length ? (
          <div className="stage-cards">
            {cards.slice(0, 4).map((card, index) => (
              <div className="stage-card" key={card.front} style={{ animationDelay: `${0.3 + index * 0.18}s` }}>
                <strong>{card.front}</strong>
                <p>{card.back}</p>
              </div>
            ))}
          </div>
        ) : (
          <table className="stage-table">
            <thead>
              <tr>
                {item.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.slice(0, 6).map((row, index) => (
                <tr key={`${item.id}-${index}`} style={{ animationDelay: `${0.3 + index * 0.12}s` }}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${item.id}-${index}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="stage-note">{item.note}</p>
      </div>
    );
  }

  if (media?.kind === 'slide' && media.slide) {
    const item = media.slide;
    return (
      <div className="stage-slide">
        <p className="stage-slide-lead">{item.lead}</p>
        <div className="stage-slide-frames">
          {item.slides.slice(0, 3).map((slide, index) => (
            <div
              className="stage-slide-frame"
              key={`${item.id}-${index}`}
              style={{ animationDelay: `${0.3 + index * 0.2}s` }}
            >
              <span className="stage-slide-marker">{slide.marker || `0${index + 1}`}</span>
              <h3>{slide.title}</h3>
              <p>{slide.body}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (media?.kind === 'map' && media.map) {
    const item = media.map;
    return (
      <div className="stage-map">
        <span className="stage-map-root">{item.root}</span>
        <div className="stage-map-branches">
          {item.branches.slice(0, 4).map((branch, index) => (
            <div
              className="stage-map-branch"
              key={branch.title}
              style={{ animationDelay: `${0.35 + index * 0.18}s` }}
            >
              <strong>{branch.title}</strong>
              <ul>
                {branch.items.slice(0, 4).map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="stage-note">{item.note}</p>
      </div>
    );
  }

  return (
    <div className="stage-plain">
      <span className="stage-plain-eyebrow">讲稿原文 · 无挂载介质</span>
      <p>{scene.lead}</p>
    </div>
  );
}
