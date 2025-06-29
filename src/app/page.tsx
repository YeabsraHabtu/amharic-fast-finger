"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./page.module.css";
import { getRandomWords } from "../utils/words";
import { getPhonetic, getFullPhoneticWord } from "../utils/reverse_geezime";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { getTranslation, Language } from "../utils/translations";

export interface WordStat {
  word: string;
  expectedPhonetic: string;
  submittedPhonetic: string;
  isCorrect: boolean;
  timeMs: number;
  wpm: number;
  keystrokes: number;
}

// Cookie helpers for persistent preferences
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

const setCookie = (name: string, value: string, days = 365) => {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

export default function Home() {
  const [words, setWords] = useState<string[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [results, setResults] = useState<string[]>([]);
  
  const { data: session } = useSession();
  const [onlineUsers, setOnlineUsers] = useState<number | null>(null);

  const [wordStats, setWordStats] = useState<WordStat[]>([]);
  const [activeTab, setActiveTab] = useState<'chart' | 'stats' | 'history'>('chart');
  const currentWordStartTimeRef = useRef<number>(0);
  const currentWordKeystrokesRef = useRef<number>(0);
  
  const [status, setStatus] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [timeLeft, setTimeLeft] = useState(60);
  const [showPhonetics, setShowPhonetics] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  const [lang, setLang] = useState<Language>('en');
  const [mode, setMode] = useState<'normal' | 'advanced'>('normal');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(lang, key);
  
  // Per-second tracking for chart
  const [wpmHistory, setWpmHistory] = useState<number[]>([]);
  const [errorHistory, setErrorHistory] = useState<number[]>([]);
  const [modHistory, setModHistory] = useState<number[]>([]);
  const correctCountRef = useRef(0);
  const errorCountRef = useRef(0);
  const modCountRef = useRef(0);
  const rawKeystrokesRef = useRef(0);
  const lastSecondCorrectRef = useRef(0);
  const lastSecondErrorRef = useRef(0);
  const lastSecondModRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playKeystrokeSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
         const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
         if (AudioContextClass) {
             audioCtxRef.current = new AudioContextClass();
         }
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
          ctx.resume();
      }
      
      // Create a realistic plastic keyboard click (filtered white noise)
      const bufferSize = ctx.sampleRate * 0.015; // 15ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
      }
      
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 3500; // High pitch plastic click
      filter.Q.value = 1.0;
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime); 
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);
      
      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noiseSource.start(ctx.currentTime);
    } catch (e) {
      // Ignore audio errors gracefully
    }
  }, []);
  
  const gameAreaRef = useRef<HTMLElement>(null);
  const wordsContainerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLDivElement>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);

  // Preference Loader from Cookies & LocalStorage
  useEffect(() => {
    // Theme preference
    const savedTheme = (getCookie('aff_theme') || localStorage.getItem('amharic-ff-theme')) as 'dark' | 'light' | null;
    const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);

    // Language preference
    const savedLang = (getCookie('aff_lang') || localStorage.getItem('aff_lang')) as Language | null;
    if (savedLang === 'am' || savedLang === 'en') {
      setLang(savedLang);
    }

    // Mode preference (normal / advanced)
    const savedMode = (getCookie('aff_mode') || localStorage.getItem('aff_mode')) as 'normal' | 'advanced' | null;
    if (savedMode === 'normal' || savedMode === 'advanced') {
      setMode(savedMode);
    }

    // Key hints preference
    const savedHints = getCookie('aff_key_hints') ?? localStorage.getItem('aff_key_hints');
    if (savedHints !== null && savedHints !== undefined) {
      setShowPhonetics(savedHints === 'true');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    setCookie('aff_theme', newTheme);
    localStorage.setItem('amharic-ff-theme', newTheme);
  };

  const handleSelectLang = (newLang: Language) => {
    setLang(newLang);
    setCookie('aff_lang', newLang);
    localStorage.setItem('aff_lang', newLang);
    setShowLangDropdown(false);
  };

  const handleToggleMode = (newMode: 'normal' | 'advanced') => {
    if (status === 'playing') return;
    setMode(newMode);
    setCookie('aff_mode', newMode);
    localStorage.setItem('aff_mode', newMode);
    setTimeout(focusGame, 10);
  };

  const handleTogglePhonetics = (enabled: boolean) => {
    setShowPhonetics(enabled);
    setCookie('aff_key_hints', enabled ? 'true' : 'false');
    localStorage.setItem('aff_key_hints', enabled ? 'true' : 'false');
    setTimeout(focusGame, 10);
  };

  useEffect(() => {
    setWords(getRandomWords(50, mode));
  }, [mode]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'playing' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        
        // Track WPM per second
        const currentCorrect = correctCountRef.current;
        const currentErrors = errorCountRef.current;
        const currentMods = modCountRef.current;
        
        const newErrors = currentErrors - lastSecondErrorRef.current;
        const newMods = currentMods - lastSecondModRef.current;
        
        lastSecondCorrectRef.current = currentCorrect;
        lastSecondErrorRef.current = currentErrors;
        lastSecondModRef.current = currentMods;
        
        // WPM = correct words so far * (60 / elapsed seconds)
        const elapsed = 60 - (timeLeft - 1);
        const wpm = elapsed > 0 ? Math.round((currentCorrect / elapsed) * 60) : 0;
        
        setWpmHistory(prev => [...prev, wpm]);
        setErrorHistory(prev => [...prev, newErrors]);
        setModHistory(prev => [...prev, newMods]);
      }, 1000);
    } else if (timeLeft === 0 && status === 'playing') {
      setStatus('finished');
    }
    return () => clearInterval(timer);
  }, [status, timeLeft]);

  // Stable visitor ID for accurate visitor counting
  const getVisitorId = useCallback(() => {
    if (typeof window === 'undefined') return 'server';
    let vid = sessionStorage.getItem('aff_visitor_id');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      sessionStorage.setItem('aff_visitor_id', vid);
    }
    return vid;
  }, []);

  // Live Users Polling & Heartbeat (works for guests AND logged-in users)
  useEffect(() => {
    const vid = getVisitorId();

    const fetchOnlineUsers = async () => {
      try {
        const res = await fetch(`/api/online-users?visitorId=${vid}`);
        if (res.ok) {
          const data = await res.json();
          setOnlineUsers(data.count);
        }
      } catch (err) {
        console.error("Failed to fetch online users", err);
      }
    };

    const sendHeartbeat = async (isTyping = false) => {
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId: vid, isTyping })
        });
      } catch (e) {}
    };

    fetchOnlineUsers();
    sendHeartbeat(false);

    const pollInterval = setInterval(fetchOnlineUsers, 8000);
    const heartbeatInterval = setInterval(() => sendHeartbeat(status === 'playing'), 25000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(heartbeatInterval);
    };
  }, [getVisitorId, status]);

  // Instant trigger when user starts typing (status === 'playing')
  useEffect(() => {
    if (status === 'playing') {
      const vid = getVisitorId();
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: vid, isTyping: true })
      }).then(() => {
        return fetch(`/api/online-users?visitorId=${vid}`);
      }).then(res => res.json())
        .then(data => setOnlineUsers(data.count))
        .catch(() => {});
    }
  }, [status, getVisitorId]);

  const focusGame = () => {
    if (gameAreaRef.current) {
      gameAreaRef.current.focus();
    }
  };

  useEffect(() => {
    focusGame();
  }, [status]);

  // Auto-scroll logic
  useEffect(() => {
    if (activeWordRef.current && wordsContainerRef.current) {
      const activeTop = activeWordRef.current.offsetTop;
      const containerScroll = wordsContainerRef.current.scrollTop;
      
      if (activeTop > containerScroll + 10) {
        wordsContainerRef.current.scrollTo({
          top: activeTop,
          behavior: 'smooth'
        });
      }
      
      if (activeWordIndex === 0) {
        wordsContainerRef.current.scrollTop = 0;
      }
    }
  }, [activeWordIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status === 'finished') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const currentTargetPhonetic = words[activeWordIndex] ? getFullPhoneticWord(words[activeWordIndex]) : "";

      if (status === 'idle' && e.key.length === 1) {
        setStatus('playing');
        currentWordStartTimeRef.current = performance.now();
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (currentInput.trim() === "" && currentTargetPhonetic !== "") return;
        playKeystrokeSound();
        const now = performance.now();
        const timeSpentMs = now - currentWordStartTimeRef.current;
        currentWordStartTimeRef.current = now;
        
        // Calculate exact WPM for this word. (characters / 5) / minutes
        const wpmForWord = timeSpentMs > 0 ? (currentInput.length / 5) / (timeSpentMs / 60000) : 0;
        
        const isCorrect = currentInput === currentTargetPhonetic;
        if (isCorrect) {
          correctCountRef.current += 1;
        } else {
          errorCountRef.current += 1;
        }
        
        setWordStats(prev => [...prev, {
          word: words[activeWordIndex],
          expectedPhonetic: currentTargetPhonetic,
          submittedPhonetic: currentInput,
          isCorrect,
          timeMs: timeSpentMs,
          wpm: Math.round(wpmForWord),
          keystrokes: currentWordKeystrokesRef.current + 1 // +1 for the spacebar itself
        }]);
        
        currentWordKeystrokesRef.current = 0;
        
        setResults(prev => [...prev, currentInput]);
        setActiveWordIndex(prev => prev + 1);
        setCurrentInput("");
        
        if (activeWordIndex > words.length - 10) {
          setWords(prev => [...prev, ...getRandomWords(20)]);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (currentInput.length > 0) {
          playKeystrokeSound();
          modCountRef.current += 1; // Track modification
          const chars = getPhonetic(words[activeWordIndex]);
          const boundaries: number[] = [0];
          let pos = 0;
          for (const charObj of chars) {
            pos += charObj.phonetic.length;
            boundaries.push(pos);
          }
          let deleteToIndex = 0;
          for (const b of boundaries) {
            if (b < currentInput.length) {
              deleteToIndex = b;
            }
          }
          setCurrentInput(prev => prev.slice(0, deleteToIndex));
        }
      } else if (e.key.length === 1) {
        e.preventDefault();
        if (currentInput.length < currentTargetPhonetic.length + 5) {
          playKeystrokeSound();
          setCurrentInput(prev => prev + e.key);
          rawKeystrokesRef.current += 1;
          currentWordKeystrokesRef.current += 1;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, words, activeWordIndex, currentInput]);

  const restart = useCallback(() => {
    setWords(getRandomWords(50));
    setActiveWordIndex(0);
    setCurrentInput("");
    setResults([]);
    setStatus('idle');
    setTimeLeft(60);
    setWpmHistory([]);
    setErrorHistory([]);
    setModHistory([]);
    setWordStats([]);
    setActiveTab('chart');
    correctCountRef.current = 0;
    errorCountRef.current = 0;
    modCountRef.current = 0;
    rawKeystrokesRef.current = 0;
    lastSecondCorrectRef.current = 0;
    lastSecondErrorRef.current = 0;
    lastSecondModRef.current = 0;
    setTimeout(focusGame, 100);
  }, []);

  useEffect(() => {
    const handleEnterToRestart = (e: KeyboardEvent) => {
      if (status === 'finished' && e.key === 'Enter') {
        e.preventDefault();
        restart();
      }
    };
    
    if (status === 'finished') {
      window.addEventListener('keydown', handleEnterToRestart);
    }
    
    return () => window.removeEventListener('keydown', handleEnterToRestart);
  }, [status, restart]);

  const calculateWPM = () => {
    return results.filter((input, i) => input === getFullPhoneticWord(words[i])).length;
  };

  const calculateAccuracy = () => {
    const totalKeys = rawKeystrokesRef.current + results.length;
    if (totalKeys === 0) return 0;
    
    let uncorrectedErrors = 0;
    
    // Calculate uncorrected errors in submitted words
    results.forEach((input, i) => {
      const target = getFullPhoneticWord(words[i]);
      const maxLen = Math.max(input.length, target.length);
      for (let j = 0; j < maxLen; j++) {
        if (input[j] !== target[j]) {
          uncorrectedErrors++;
        }
      }
    });

    // Calculate uncorrected errors in the current active word
    if (status !== 'finished') {
      const activeTarget = getFullPhoneticWord(words[activeWordIndex]);
      for (let j = 0; j < currentInput.length; j++) {
          if (currentInput[j] !== activeTarget[j]) {
              uncorrectedErrors++;
          }
      }
    }

    const totalErrors = modCountRef.current + uncorrectedErrors;
    const accuracy = Math.max(0, Math.round(((totalKeys - totalErrors) / totalKeys) * 100));
    return accuracy;
  };

  // Draw chart when finished
  const drawChart = useCallback(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || wpmHistory.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padLeft = 45;
    const padRight = 20;
    const padTop = 15;
    const padBottom = 30;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const computedStyle = getComputedStyle(document.documentElement);
    const lineColor = computedStyle.getPropertyValue('--chart-line').trim() || '#facc15';
    const bgColor = computedStyle.getPropertyValue('--chart-bg').trim() || 'rgba(250, 204, 21, 0.08)';
    const gridColor = computedStyle.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';
    const labelColor = computedStyle.getPropertyValue('--chart-label').trim() || '#64748b';

    const maxWPM = Math.max(...wpmHistory, 20);
    const yMax = Math.ceil(maxWPM / 20) * 20 + 20;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let v = 0; v <= yMax; v += 20) {
      const y = padTop + chartH - (v / yMax) * chartH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
      
      ctx.fillStyle = labelColor;
      ctx.font = '12px Inter';
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padLeft - 8, y + 4);
    }
    ctx.setLineDash([]);

    // X-axis labels
    const totalSeconds = wpmHistory.length;
    const step = Math.max(1, Math.floor(totalSeconds / 12));
    ctx.fillStyle = labelColor;
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    for (let i = 0; i < totalSeconds; i += step) {
      const x = padLeft + (i / (totalSeconds - 1 || 1)) * chartW;
      ctx.fillText(String(i), x, height - 8);
    }
    // Always show last label
    if (totalSeconds > 1) {
      const x = padLeft + chartW;
      ctx.fillText(String(totalSeconds - 1), x, height - 8);
    }

    if (totalSeconds < 2) return;

    // Draw area fill
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + chartH);
    for (let i = 0; i < totalSeconds; i++) {
      const x = padLeft + (i / (totalSeconds - 1)) * chartW;
      const y = padTop + chartH - (wpmHistory[i] / yMax) * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padLeft + chartW, padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    for (let i = 0; i < totalSeconds; i++) {
      const x = padLeft + (i / (totalSeconds - 1)) * chartW;
      const y = padTop + chartH - (wpmHistory[i] / yMax) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw error dots
    for (let i = 0; i < totalSeconds; i++) {
      if (errorHistory[i] > 0) {
        const x = padLeft + (i / (totalSeconds - 1)) * chartW;
        const wpmVal = wpmHistory[i];
        const y = padTop + chartH - (wpmVal / yMax) * chartH;
        ctx.beginPath();
        ctx.arc(x, y - 15, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
      }
    }

    // Draw modification dots (orange)
    for (let i = 0; i < totalSeconds; i++) {
      if (modHistory[i] > 0) {
        const x = padLeft + (i / (totalSeconds - 1)) * chartW;
        const wpmVal = wpmHistory[i];
        const y = padTop + chartH - (wpmVal / yMax) * chartH;
        ctx.beginPath();
        ctx.arc(x, y + 15, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f97316';
        ctx.fill();
      }
    }
  }, [wpmHistory, errorHistory, modHistory]);

  useEffect(() => {
    if (status === 'finished') {
      // Small delay to let DOM render
      setTimeout(drawChart, 100);
    }
  }, [status, drawChart]);

  // Redraw chart on theme change or tab switch when finished
  useEffect(() => {
    if (status === 'finished' && activeTab === 'chart') {
      setTimeout(drawChart, 50);
    }
  }, [theme, status, activeTab, drawChart]);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <nav className={styles.navbar}>
          <div className={styles.navLeft}>
            <div className={styles.navLogo}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              Amharic<span>FastFinger</span>
            </div>
          </div>
          <div className={styles.navRight}>
            <div className={styles.navItem} title="Online Users">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              {onlineUsers !== null ? onlineUsers : "..."}
            </div>
            <div className={styles.navItem} title={t("typingTest")}>
              {t("typingTest")}
            </div>
            <button className={styles.navIconBtn} onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <div 
              className={styles.navItem} 
              title="Language" 
              style={{ position: 'relative', cursor: 'pointer' }}
              onMouseEnter={() => setShowLangDropdown(true)}
              onMouseLeave={() => setShowLangDropdown(false)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{lang === 'am' ? 'አማ' : 'EN'}</span>
              </div>
              
              {showLangDropdown && (
                <div style={{ position: 'absolute', top: '100%', right: 0, paddingTop: '0.5rem', zIndex: 50, minWidth: '120px' }}>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}>
                    <div 
                      onClick={() => handleSelectLang('en')} 
                      style={{ padding: '0.5rem', borderRadius: '0.25rem', backgroundColor: lang === 'en' ? 'var(--bg-primary)' : 'transparent', fontWeight: lang === 'en' ? 'bold' : 'normal', transition: 'background-color 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = lang === 'en' ? 'var(--bg-primary)' : 'transparent')}
                    >
                      🇺🇸 English
                    </div>
                    <div 
                      onClick={() => handleSelectLang('am')} 
                      style={{ padding: '0.5rem', borderRadius: '0.25rem', backgroundColor: lang === 'am' ? 'var(--bg-primary)' : 'transparent', fontWeight: lang === 'am' ? 'bold' : 'normal', transition: 'background-color 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = lang === 'am' ? 'var(--bg-primary)' : 'transparent')}
                    >
                      🇪🇹 አማርኛ
                    </div>
                  </div>
                </div>
              )}
            </div>
            {session ? (
              <>
                <div className={styles.navItem}>{t("hi")}, {session.user?.name || session.user?.email?.split('@')[0]}</div>
                <div className={styles.navItem} onClick={() => signOut()} style={{ color: 'var(--error)' }}>{t("signOut")}</div>
              </>
            ) : (
              <>
                <Link href="/login" className={styles.navItem} style={{ textDecoration: 'none' }}>{t("signIn")}</Link>
                <Link href="/signup" className={styles.navItem} style={{ textDecoration: 'none' }}>{t("signUp")}</Link>
              </>
            )}
          </div>
        </nav>

      {status !== 'finished' ? (
        <main 
          className={`${styles.gameArea} ${!showPhonetics ? styles.hidePhonetics : ''}`}
          ref={gameAreaRef}
        >
          <div className={styles.stats}>
            <div>{timeLeft}s</div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label className={styles.switchLabel} onClick={(e) => {
                e.stopPropagation();
                if (status === 'playing') {
                  e.preventDefault(); // Prevent changing mode if playing
                }
              }} style={{ opacity: status === 'playing' ? 0.5 : 1, cursor: status === 'playing' ? 'not-allowed' : 'pointer' }} title={status === 'playing' ? 'Cannot change mode during test' : ''}>
                <span className={styles.switchText}>{mode === 'normal' ? t("normal") : t("advanced")}</span>
                <div className={styles.switch}>
                  <input 
                    type="checkbox" 
                    checked={mode === 'advanced'} 
                    disabled={status === 'playing'}
                    onChange={(e) => {
                      handleToggleMode(e.target.checked ? 'advanced' : 'normal');
                    }} 
                  />
                  <span className={styles.slider}></span>
                </div>
              </label>
              <label className={styles.switchLabel} onClick={(e) => e.stopPropagation()}>
                <span className={styles.switchText}>{t("keyHints")}</span>
                <div className={styles.switch}>
                  <input 
                    type="checkbox" 
                    checked={showPhonetics} 
                    onChange={(e) => {
                      handleTogglePhonetics(e.target.checked);
                    }} 
                  />
                  <span className={styles.slider}></span>
                </div>
              </label>
            </div>
          </div>

          <div className={styles.wordsContainer} ref={wordsContainerRef}>
            {words.map((word, wIndex) => {
              const isActiveWord = wIndex === activeWordIndex;
              const isPastWord = wIndex < activeWordIndex;
              const isFutureWord = wIndex > activeWordIndex;
              const submittedInput = isPastWord ? results[wIndex] : (isActiveWord ? currentInput : "");
              
              const chars = getPhonetic(word);
              const targetPhonetic = getFullPhoneticWord(word);
              
              let amharicGlobalPhoneticIndex = 0;
              let phoneticGlobalPhoneticIndex = 0;
              
              return (
                <div 
                  key={wIndex} 
                  ref={isActiveWord ? activeWordRef : null}
                  className={`${styles.wordBlock} ${isActiveWord ? styles.active : ''}`}
                >
                  {/* Row 1: The Amharic Word */}
                  <div className={styles.amharicWord}>
                    {chars.map((charObj, cIndex) => {
                      const phoneticLength = charObj.phonetic.length;
                      const charStartIndex = amharicGlobalPhoneticIndex;
                      const charEndIndex = amharicGlobalPhoneticIndex + phoneticLength;
                      amharicGlobalPhoneticIndex += phoneticLength;

                      let amharicClass = styles.amharicChar;
                      const charInput = submittedInput.substring(charStartIndex, charEndIndex);
                      const expected = targetPhonetic.substring(charStartIndex, charEndIndex);
                      
                      if (isActiveWord && submittedInput.length >= charStartIndex && submittedInput.length < charEndIndex) {
                          amharicClass += ` ${styles.cursor}`;
                          if (charInput.length > 0 && charInput !== expected.substring(0, charInput.length)) {
                              amharicClass += ` ${styles.incorrect}`;
                          }
                      } else if (submittedInput.length >= charEndIndex) {
                          amharicClass += (charInput === expected) ? ` ${styles.correct}` : ` ${styles.incorrect}`;
                      } else if (isPastWord) {
                          amharicClass += ` ${styles.incorrect}`;
                      }

                      return (
                        <span key={cIndex} className={amharicClass}>
                          {charObj.char}
                        </span>
                      );
                    })}
                  </div>

                  {/* Row 2: The English Phonetics */}
                  <div className={styles.phoneticWord}>
                    {chars.map((charObj, cIndex) => {
                      return charObj.phonetic.split('').map((pLetter, pIndex) => {
                        const pGlobalIndex = phoneticGlobalPhoneticIndex++;
                        let pClass = styles.phoneticLetter;
                        
                        if (isActiveWord && pGlobalIndex === submittedInput.length) {
                            pClass += ` ${styles.active}`;
                        } else if (pGlobalIndex < submittedInput.length) {
                            if (submittedInput[pGlobalIndex] === targetPhonetic[pGlobalIndex]) {
                                pClass += ` ${styles.correct}`;
                            } else {
                                pClass += ` ${styles.incorrect}`;
                            }
                        } else if (isPastWord) {
                            pClass += ` ${styles.incorrect}`;
                        }

                        return (
                          <span key={`${cIndex}-${pIndex}`} className={pClass}>
                            {pLetter}
                          </span>
                        );
                      });
                    })}
                  </div>
                  
                  {/* The space cursor */}
                  {isActiveWord && submittedInput.length >= targetPhonetic.length && (
                    <div className={styles.wordSpaceCursor} />
                  )}

                </div>
              );
            })}
          </div>
          
        </main>
      ) : (
        <div className={styles.results}>
          {/* Top Toolbar */}
          <div className={styles.resultsToolbar}>
            <div className={styles.resultsTabs}>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'chart' ? styles.activeTab : ''}`} 
                onClick={() => setActiveTab('chart')}
                title={t("chartTab")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'stats' ? styles.activeTab : ''}`} 
                onClick={() => setActiveTab('stats')}
                title={t("detailedStatsTab")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'history' ? styles.activeTab : ''}`} 
                onClick={() => setActiveTab('history')}
                title={t("wordHistoryTab")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>
            </div>
            <button className={styles.restartIconBtn} onClick={restart} title={`${t("tryAgain")} (Enter)`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>

          {/* Header with WPM + Accuracy */}
          <div className={styles.resultsHeader}>
            <div className={styles.resultsTopRow}>
              <div className={styles.resultsStatGroup}>
                <div className={styles.resultsStat}>
                  <span className={styles.resultsStatLabel}>{t("wpm")}</span>
                  <span className={styles.resultsStatValue}>
                    {calculateWPM()}
                    <span className={styles.resultsStatUnit}>wpm</span>
                  </span>
                </div>
                <div className={styles.resultsStat}>
                  <span className={styles.resultsStatLabel}>{t("accuracy")}</span>
                  <span className={styles.resultsStatValue}>
                    {calculateAccuracy()}
                    <span className={styles.resultsStatUnit}>%</span>
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.resultsInfoRow}>
              <div className={styles.resultsTestInfo}>
                {t("testInfo")}
              </div>
            </div>
          </div>

          {activeTab === 'chart' && (
            <div className={styles.chartContainer}>
              <div className={styles.chartLegend}>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ backgroundColor: 'var(--chart-line)' }}></span>
                  {t("wpmLegend")}
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ backgroundColor: '#ef4444' }}></span>
                  {t("errorLegend")}
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ backgroundColor: '#f97316' }}></span>
                  {t("modificationsLegend")}
                </div>
              </div>
              <div className={styles.chartWrapper}>
                <canvas ref={chartCanvasRef} className={styles.chartCanvas} />
              </div>
            </div>
          )}

          {activeTab === 'stats' && (() => {
            const totalCorrectWords = wordStats.filter(w => w.isCorrect).length;
            const totalWrongWords = wordStats.filter(w => !w.isCorrect).length;
            const totalKeystrokes = wordStats.reduce((sum, w) => sum + w.keystrokes, 0);
            const correctKeystrokes = wordStats.filter(w => w.isCorrect).reduce((sum, w) => sum + w.keystrokes, 0);
            const rawWPM = totalKeystrokes > 0 ? Math.round((totalKeystrokes / 5) / (60 / 60)) : 0;
            
            const wpmArr = wpmHistory.filter(w => w > 0);
            let consistency = 0;
            if (wpmArr.length > 0) {
              const mean = wpmArr.reduce((a,b) => a+b, 0) / wpmArr.length;
              const variance = wpmArr.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / wpmArr.length;
              const stdDev = Math.sqrt(variance);
              consistency = Math.max(0, Math.min(100, Math.round((1 - stdDev/mean) * 100)));
            }

            return (
              <div className={styles.detailedStatsGrid}>
                <div className={styles.statRow}><span className={styles.statName}>{t("correctWords")}</span><span className={styles.statVal}>{totalCorrectWords}</span></div>
                <div className={styles.statRow}><span className={styles.statName}>{t("wrongWords")}</span><span className={styles.statVal}>{totalWrongWords}</span></div>
                <div className={styles.statRow}><span className={styles.statName}>{t("correctKeystrokes")}</span><span className={styles.statVal}>{correctKeystrokes}</span></div>
                <div className={styles.statRow}><span className={styles.statName}>{t("totalKeystrokes")}</span><span className={styles.statVal}>{totalKeystrokes}</span></div>
                <div className={styles.statRow}><span className={styles.statName}>{t("rawWpm")}</span><span className={styles.statVal}>{rawWPM}</span></div>
                <div className={styles.statRow}><span className={styles.statName}>{t("consistency")}</span><span className={styles.statVal}>{consistency}%</span></div>
                <div className={styles.statRow}><span className={styles.statName}>{t("pace")}</span><span className={styles.statVal}>{Math.round(totalKeystrokes / 60 * 60)} CPM</span></div>
              </div>
            );
          })()}

          {activeTab === 'history' && (
            <div className={styles.heatmapContainer}>
              <div className={styles.heatmapLegend}>
                <span style={{color: '#ef4444'}}>0 - 20 WPM</span>
                <span style={{color: '#f97316'}}>20 - 40 WPM</span>
                <span style={{color: 'var(--accent)'}}>40 - 60 WPM</span>
                <span style={{color: '#10b981'}}>60+ WPM</span>
              </div>
              <div className={styles.heatmapWords}>
                {wordStats.map((ws, i) => {
                  let wpmColor = '#ef4444'; // default slow (red)
                  if (ws.wpm > 60) wpmColor = '#10b981'; // fast (green)
                  else if (ws.wpm > 40) wpmColor = 'var(--accent)'; // medium (yellow)
                  else if (ws.wpm > 20) wpmColor = '#f97316'; // slow-med (orange)
                  
                  if (!ws.isCorrect) wpmColor = 'var(--incorrect)';

                  return (
                    <div key={i} className={styles.heatmapWord} style={{ color: wpmColor }}>
                      {ws.word}
                      <div className={styles.tooltip}>
                        <div className={styles.tooltipTitle}>{ws.expectedPhonetic}</div>
                        <div className={styles.tooltipStats}>
                          {Math.round(ws.timeMs)}ms · {ws.wpm} WPM · {ws.keystrokes} ks
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
      </div>

      <section className={styles.infoSection}>
        <div className={styles.infoSectionHeader}>
          <h2>{t("infoTitle")}</h2>
          <p>{t("infoSubtitle")}</p>
        </div>
        <div className={styles.infoCards}>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>⌨️</div>
            <h3>{t("aboutTest")}</h3>
            <p>{t("aboutTestDesc")}</p>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>📈</div>
            <h3>{t("whatMeasures")}</h3>
            <p>{t("whatMeasuresDesc")}</p>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>⚡</div>
            <h3>{t("goodSpeed")}</h3>
            <p>{t("goodSpeedDesc")}</p>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoCardIcon}>🧮</div>
            <h3>{t("howWpmCalculated")}</h3>
            <p>{t("howWpmCalculatedDesc")}</p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerGrid}>
            <div className={styles.footerLogo}>
              <h3>Amharic Fast Finger</h3>
              <p>Test and improve your Typing Speed with our free Typing Games.</p>
            </div>
            <div className={styles.footerColumn}>
              <h4>Games</h4>
              <ul>
                <li><a href="#">Typing Test</a></li>
                <li><a href="#">Competition</a></li>
                <li><a href="#">Text Practice</a></li>
              </ul>
            </div>
            <div className={styles.footerColumn}>
              <h4>Support</h4>
              <ul>
                <li><a href="#">Blog</a></li>
                <li><a href="#">FAQ</a></li>
                <li><a href="#">Feedback</a></li>
              </ul>
            </div>
            <div className={styles.footerColumn}>
              <h4>Legal</h4>
              <ul>
                <li><a href="#">Imprint</a></li>
                <li><a href="#">Privacy</a></li>
                <li><a href="#">Cookie Policy</a></li>
              </ul>
            </div>
            <div className={styles.footerColumn}>
              <h4>Links</h4>
              <ul>
                <li><a href="#">Build, Launch and Grow</a></li>
                <li><a href="#">Mobile Typing App</a></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
