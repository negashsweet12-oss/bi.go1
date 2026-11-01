'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  Wallet,
  History,
  LayoutGrid,
  Play,
  LogOut,
  Bell,
  AlertTriangle,
  Award,
  KeyRound,
  Send,
  CheckCircle2,
  Phone,
  MessageCircle,
  User,
  Users,
  Loader2,
  Calendar,
  Clock,
  Lock,
  Unlock,
  Hourglass,
} from 'lucide-react';
import { signInWithPopup, getRedirectResult } from 'firebase/auth';
import { auth, googleAuthProvider } from '@/src/lib/firebase';
import {
  formatEtb,
  getBallLetter,
  numberToAmharicWords,
  BingoCardGrid,
  validateClaim,
  BingoPattern,
  getPatternLabel,
  getPatternDescription,
} from '@/src/lib/bingo-engine';
import dynamic from 'next/dynamic';
import { DICT, Lang, soundFx } from '@/src/lib/i18n-sound';

const AdminControlPanel = dynamic<any>(
  () => import('@/app/admin/page'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4 shadow-2xl text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-amber-300">
            🔑 የአድሚን የይለፍ ቃል መጠየቂያ በመከፈት ላይ... (Opening Admin Password Gate...)
          </p>
        </div>
      </div>
    ),
  }
);

type ActiveTab = 'lobby' | 'game' | 'wallet' | 'history' | 'responsible';

const SESSION_STORAGE_KEY = 'habesha_bingo_active_token';

function getDisplayRoomName(rm: any, lang: Lang): string {
  if (!rm) return lang === 'am' ? 'ዋናው ጭዋታ' : 'Main Game';
  if (rm.isPractice) {
    return lang === 'am' ? (rm.nameAm || 'መለማመጃ') : (rm.nameEn || 'Practice Room');
  }
  return lang === 'am' ? 'ዋናው ጭዋታ' : 'Main Game';
}

export default function PlayerBingoApp() {
  const [lang, setLang] = useState<Lang>('am');
  const t = DICT[lang];
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);

  // Strictly in-memory session token so when any user logs out or exits and re-enters, entering their password is mandatory
  const sessionTokenRef = useRef<string | null>(null);

  const setSessionToken = useCallback((token: string | null) => {
    sessionTokenRef.current = token;
    if (typeof window !== 'undefined') {
      try {
        // Never persist auto-login tokens in browser storage so re-entry always requires password
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage restrictions
      }
    }
  }, []);

  const rateLimitedUntilRef = useRef<number>(0);

  const apiFetch = useCallback(async (url: string, init?: RequestInit) => {
    const isGetRequest = !init?.method || init.method.toUpperCase() === 'GET';
    if (isGetRequest && Date.now() < rateLimitedUntilRef.current) {
      return new Response(JSON.stringify({ rateLimited: true }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = sessionTokenRef.current;

    const headers = new Headers(init?.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (res.status === 429) {
      // Back off background polling for 20s if proxy rate limit is hit
      rateLimitedUntilRef.current = Date.now() + 20000;
    }

    return res;
  }, []);

  // Auth State
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [wallet, setWallet] = useState<{
    balanceMinor: number;
    lockedMinor: number;
    playBalanceMinor: number;
  }>({ balanceMinor: 0, lockedMinor: 0, playBalanceMinor: 100000 });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  // Login / Register Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [dobInput, setDobInput] = useState('1998-05-15');
  const [phoneInput, setPhoneInput] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [showGoogleEmailBox, setShowGoogleEmailBox] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googlePasswordInput, setGooglePasswordInput] = useState('');
  const [showGooglePassword, setShowGooglePassword] = useState(false);
  const [googleDisplayNameInput, setGoogleDisplayNameInput] = useState('');
  const [savedGoogleEmails, setSavedGoogleEmails] = useState<string[]>([]);
  const googleEmailInputRef = useRef<HTMLInputElement | null>(null);
  const googlePasswordInputRef = useRef<HTMLInputElement | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotNotes, setForgotNotes] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState<string | null>(null);
  const [forgotErrorMsg, setForgotErrorMsg] = useState<string | null>(null);

  // Navigation & Clock Sync State
  const [activeTab, setActiveTab] = useState<ActiveTab>('lobby');
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [sessionStartMs] = useState<number>(Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const lastAnnouncedBallRef = useRef<string | null>(null);

  // Lobby & Active Room State
  const [onlinePlayersCount, setOnlinePlayersCount] = useState<number>(1);
  const [roomsList, setRoomsList] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [roomState, setRoomState] = useState<any | null>(null);
  const [bettingSchedule, setBettingSchedule] = useState<{
    isBettingOpen: boolean;
    isPracticeModeOpen?: boolean;
    practiceOffReason?: string;
    practiceResumeTime?: string;
    isRealGameModeOpen?: boolean;
    realGameOffReason?: string;
    realGameResumeTime?: string;
    scheduledGameTime: string | null;
    customNoticeEn?: string;
    customNoticeAm?: string;
    updatedAt?: string;
    updatedBy?: string;
  }>({
    isBettingOpen: true,
    isPracticeModeOpen: true,
    isRealGameModeOpen: true,
    scheduledGameTime: null,
  });
  const [selectedCardIndices, setSelectedCardIndices] = useState<number[]>([]);
  const selectedCardIndicesRef = useRef<number[]>([]);
  const lastRoundIdRef = useRef<number | null>(null);
  const [previewCardIndex, setPreviewCardIndex] = useState<number>(1);
  const [activeHeldCardTab, setActiveHeldCardTab] = useState<number>(0);
  const [showAllHeldCards, setShowAllHeldCards] = useState<boolean>(false);
  const [showOpenPhasePicker, setShowOpenPhasePicker] = useState<boolean>(true);
  const [replacingCardIndex, setReplacingCardIndex] = useState<number | null>(null);
  const [gameActionMsg, setGameActionMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [buyingTickets, setBuyingTickets] = useState(false);
  const buyingTicketsRef = useRef(false);
  const isFetchingProfileRef = useRef(false);
  const isFetchingLobbyRef = useRef(false);
  const isFetchingRoomRef = useRef(false);
  const [claimingBingo, setClaimingBingo] = useState(false);
  const [uiScale, setUiScale] = useState<'normal' | 'large' | 'xlarge'>('large');
  const [winnerPopupData, setWinnerPopupData] = useState<{
    roundId: number;
    roomNameEn: string;
    roomNameAm: string;
    isPractice: boolean;
    winnerUsernames: string[];
    winningCardIndices: number[];
    winningTicketsDetails: any[];
    prizeMinor: number;
    potMinor: number;
    winningPattern: string;
    calledNumbers: number[];
    didCurrentUserWin: boolean;
    nextRoundOpensAt: string | null;
  } | null>(null);

  // Wallet & Ledger State
  const [walletHistory, setWalletHistory] = useState<{
    ledger: any[];
    deposits: any[];
    withdrawals: any[];
  }>({ ledger: [], deposits: [], withdrawals: [] });
  const [depAmountBirr, setDepAmountBirr] = useState('100');
  const [depProvider, setDepProvider] = useState<'TELEBIRR' | 'CBE_BIRR' | 'CHAPA' | 'MOCK'>('TELEBIRR');
  const [depRef, setDepRef] = useState('');
  const [depProofDataUrl, setDepProofDataUrl] = useState<string | null>(null);
  const [processingProofImage, setProcessingProofImage] = useState(false);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
  const [depositSentNotice, setDepositSentNotice] = useState<string | null>(null);
  const proofFileInputRef = useRef<HTMLInputElement | null>(null);
  const [wdAmountBirr, setWdAmountBirr] = useState('100');
  const [wdProvider, setWdProvider] = useState<'TELEBIRR' | 'CBE_BIRR' | 'CHAPA'>('TELEBIRR');
  const [wdAccount, setWdAccount] = useState('');
  const [walletMsg, setWalletMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [walletSupportIssue, setWalletSupportIssue] = useState('');

  // History & Fairness Verifier State (Isolated Live vs Practice, Date Filtering & Pagination)
  const [historyMode, setHistoryMode] = useState<'LIVE' | 'PRACTICE'>('LIVE');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } | null>(null);
  const [historyAsOfUtc, setHistoryAsOfUtc] = useState<string | null>(null);
  const [myRounds, setMyRounds] = useState<any[]>([]);
  const [liveHistorySummary, setLiveHistorySummary] = useState<any | null>(null);
  const [practiceHistorySummary, setPracticeHistorySummary] = useState<any | null>(null);
  const [myGames, setMyGames] = useState<any[]>([]);
  const [pastRounds, setPastRounds] = useState<any[]>([]);
  const [verifySeedInput, setVerifySeedInput] = useState('');
  const [verifyHashInput, setVerifyHashInput] = useState('');
  const [verifyRoundIdInput, setVerifyRoundIdInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<any | null>(null);

  // Responsible Gaming & Security State
  const [limitBirrInput, setLimitBirrInput] = useState('5000');
  const [currentPwdInput, setCurrentPwdInput] = useState('');
  const [newPwdInput, setNewPwdInput] = useState('');
  const [rgMsg, setRgMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const userRef = useRef<any | null>(null);
  const userId: number | null = user?.id ?? null;

  const selectedRoomIdRef = useRef<number | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const verifySeedInputRef = useRef<string>(verifySeedInput);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    verifySeedInputRef.current = verifySeedInput;
  }, [verifySeedInput]);

  const syncServerClock = useCallback((serverTimeUtc?: string) => {
    if (!serverTimeUtc) return;
    const srvMs = new Date(serverTimeUtc).getTime();
    if (!Number.isNaN(srvMs)) {
      const nextOffset = srvMs - Date.now();
      setServerOffsetMs((prev) => (Math.abs(nextOffset - prev) > 1500 ? nextOffset : prev));
    }
  }, []);

  const [loginWelcomeBanner, setLoginWelcomeBanner] = useState<{ username: string } | null>(null);

  const applyAuthenticatedPayload = useCallback(
    (data: any, isInteractiveLogin = false) => {
      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
      }
      if (data.serverTimeUtc) {
        syncServerClock(data.serverTimeUtc);
      }
      if (typeof data.onlinePlayersCount === 'number') {
        setOnlinePlayersCount(Math.max(1, data.onlinePlayersCount));
      }
      if (data.user) {
        userRef.current = data.user;
        setUser(data.user);
        setLimitBirrInput(String(Math.floor((data.user.dailyDepositLimitMinor || 500000) / 100)));
        if (isInteractiveLogin) {
          setLoginWelcomeBanner({ username: data.user.username });
          soundFx.playWelcomeGreeting(data.user.username, soundEnabledRef.current);

          // Trigger automated Telegram welcome message on login
          const welcomeText = `ሰላም ${data.user.username}! እንኳን ወደ Winner Bingo በደህና መጣህ/ሽ!`;
          void fetch('/api/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: data.user.username,
              chatId: data.user.telegramChatId || undefined,
              message: welcomeText,
            }),
          }).catch(() => {
            // Non-blocking so login succeeds even if Telegram is unreachable
          });
        }
      }
      if (data.wallet) {
        setWallet(data.wallet);
      }
      if (data.bettingSchedule) {
        setBettingSchedule(data.bettingSchedule);
      }
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    },
    [setSessionToken, syncServerClock]
  );

  // Auto-dismiss the login welcome banner after 12 seconds
  useEffect(() => {
    if (!loginWelcomeBanner) return;
    const timer = setTimeout(() => {
      setLoginWelcomeBanner(null);
    }, 12000);
    return () => clearTimeout(timer);
  }, [loginWelcomeBanner]);

  // 1-second countdown ticker synced to server UTC clock
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load any previously used Google emails from localStorage for 1-tap login
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('habesha_saved_google_emails');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((e) => typeof e === 'string' && e.includes('@'));
          setSavedGoogleEmails(valid);
          if (valid[0]) {
            setGoogleEmailInput((prev) => prev || valid[0]);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    if (isFetchingProfileRef.current || buyingTicketsRef.current) return;
    isFetchingProfileRef.current = true;
    try {
      const res = await apiFetch('/api/auth', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        setSessionToken(null);
        setUser(null);
        if (
          data?.code === 'ACCOUNT_BLOCKED' ||
          data?.code === 'SESSION_REVOKED' ||
          data?.code === 'SESSION_REPLACED'
        ) {
          setAuthError(data.error);
        }
        setAuthLoading(false);
        return;
      }
      if (!res.ok) {
        setAuthLoading(false);
        return;
      }
      const data = await res.json();
      applyAuthenticatedPayload(data);
      setAuthLoading(false);
    } catch {
      setAuthLoading(false);
    } finally {
      isFetchingProfileRef.current = false;
    }
  }, [apiFetch, applyAuthenticatedPayload, setSessionToken]);

  const fetchLobby = useCallback(async () => {
    if (!userRef.current || isFetchingLobbyRef.current || buyingTicketsRef.current) return;
    isFetchingLobbyRef.current = true;
    try {
      const res = await apiFetch('/api/game', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        void fetchProfile();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      syncServerClock(data.serverTimeUtc);
      if (data.bettingSchedule) {
        setBettingSchedule(data.bettingSchedule);
      }
      if (data.wallet) {
        setWallet(data.wallet);
      }
      if (typeof data.onlinePlayersCount === 'number') {
        setOnlinePlayersCount(Math.max(1, data.onlinePlayersCount));
      }
      setRoomsList(data.rooms || []);
      const currentRoomId = selectedRoomIdRef.current;
      if (
        data.rooms?.length > 0 &&
        (!currentRoomId || !data.rooms.some((r: any) => r.id === currentRoomId))
      ) {
        setSelectedRoomId(data.rooms[0].id);
      }
    } catch {
      // Ignore network hiccup
    } finally {
      isFetchingLobbyRef.current = false;
    }
  }, [apiFetch, syncServerClock, fetchProfile]);

  const lastRoomPriceMapRef = useRef<Record<number, number>>({});
  const cachedCardPoolRef = useRef<any[] | null>(null);

  const fetchActiveRoom = useCallback(
    async (roomId: number, force = false) => {
      if (!userRef.current) return;
      if (!force && (isFetchingRoomRef.current || buyingTicketsRef.current)) return;
      isFetchingRoomRef.current = true;
      try {
        const hasCachedPool =
          Array.isArray(cachedCardPoolRef.current) && cachedCardPoolRef.current.length > 0;
        const res = await apiFetch(
          `/api/game?roomId=${roomId}&includePool=${hasCachedPool ? '0' : '1'}`,
          { cache: 'no-store' }
        );
        if (res.status === 401 || res.status === 403) {
          void fetchProfile();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        syncServerClock(data.serverTimeUtc);
        if (data.bettingSchedule) {
          setBettingSchedule(data.bettingSchedule);
        }
        if (data.wallet) {
          setWallet(data.wallet);
        }
        if (typeof data.onlinePlayersCount === 'number') {
          setOnlinePlayersCount(Math.max(1, data.onlinePlayersCount));
        }
        if (Array.isArray(data.cardPool) && data.cardPool.length > 0) {
          cachedCardPoolRef.current = data.cardPool;
        }
        setRoomState((prev: any) => ({
          ...data,
          cardPool: data.cardPool || cachedCardPoolRef.current || prev?.cardPool || [],
        }));

        if (data.room) {
          const rId = data.room.id;
          const newPrice = data.room.ticketPriceMinor;
          if (
            lastRoomPriceMapRef.current[rId] !== undefined &&
            lastRoomPriceMapRef.current[rId] !== newPrice
          ) {
            setGameActionMsg({
              type: 'success',
              text: `💰 አድሚኑ የመወራረጃ ብር መጠኑን ወደ ${formatEtb(newPrice, 'am')} (${formatEtb(newPrice, 'en')}) ቀይሮታል!`,
            });
          }
          lastRoomPriceMapRef.current[rId] = newPrice;
          setRoomsList((prev) =>
            prev.map((r) => (r.id === rId ? { ...r, ...data.room } : r))
          );
        }

        // Voice & chime announcement is handled by the reactive activeRound effect below
      } catch {
        // Ignore transient network error
      } finally {
        isFetchingRoomRef.current = false;
      }
    },
    [apiFetch, syncServerClock, fetchProfile]
  );

  const lastAnnouncedWinRoundRef = useRef<number | null>(null);

  // Announce every newly drawn ball by voice (e.g., "B 23", "I 26", "N 42", "G 56", "O 72")
  // and play the victory sound + show Winner Popup Modal automatically for ALL players when a winner is found!
  useEffect(() => {
    const activeRd = roomState?.activeRound;
    const activeRm = roomState?.room;
    if (
      activeRd &&
      (activeRd.status === 'DRAWING' || activeRd.status === 'SETTLED') &&
      activeRd.currentBall
    ) {
      const ballKey = `${activeRd.id}:${activeRd.drawnCount}:${activeRd.currentBall}`;
      if (lastAnnouncedBallRef.current !== ballKey) {
        lastAnnouncedBallRef.current = ballKey;
        soundFx.playBallDraw(activeRd.currentBall, soundEnabled);
      }
    }

    // Detect newly settled round either on activeRound or the latest recentRounds[0]
    let settledTarget: any = null;
    if (activeRd && activeRd.status === 'SETTLED') {
      settledTarget = activeRd;
    } else if (roomState?.recentRounds?.length > 0) {
      const latestRecent = roomState.recentRounds[0];
      if (latestRecent.status === 'SETTLED' && latestRecent.settledAt) {
        const settledAgoMs = Date.now() + serverOffsetMs - new Date(latestRecent.settledAt).getTime();
        if (settledAgoMs >= -5000 && settledAgoMs < 22000) {
          settledTarget = {
            ...latestRecent,
            calledNumbers: latestRecent.drawnNumbers || [],
            nextRoundOpensAt: new Date(new Date(latestRecent.settledAt).getTime() + 15000).toISOString(),
          };
        }
      }
    }

    if (settledTarget && lastAnnouncedWinRoundRef.current !== settledTarget.id) {
      lastAnnouncedWinRoundRef.current = settledTarget.id;
      const usernames: string[] =
        settledTarget.winnerUsernames?.length > 0
          ? settledTarget.winnerUsernames
          : (settledTarget.winningTicketsDetails || []).map((w: any) => w.username);
      const cardIndices: number[] =
        settledTarget.winningCardIndices?.length > 0
          ? settledTarget.winningCardIndices
          : (settledTarget.winningTicketsDetails || []).map((w: any) => w.cardIndex);

      soundFx.playBingoWin(soundEnabled, {
        usernames,
        cardIndices,
      });

      setWinnerPopupData({
        roundId: settledTarget.id,
        roomNameEn: getDisplayRoomName(activeRm, 'en'),
        roomNameAm: getDisplayRoomName(activeRm, 'am'),
        isPractice: Boolean(activeRm?.isPractice),
        winnerUsernames: usernames,
        winningCardIndices: cardIndices,
        winningTicketsDetails: settledTarget.winningTicketsDetails || [],
        prizeMinor: settledTarget.prizeMinor || 0,
        potMinor: settledTarget.potMinor || 0,
        winningPattern: settledTarget.winningPattern || activeRm?.pattern || 'ONE_LINE',
        calledNumbers: settledTarget.calledNumbers || settledTarget.drawnNumbers || [],
        didCurrentUserWin: Boolean(settledTarget.didCurrentUserWin),
        nextRoundOpensAt: settledTarget.nextRoundOpensAt || null,
      });

      void fetchProfile();
    }
  }, [
    roomState,
    serverOffsetMs,
    soundEnabled,
    fetchProfile,
  ]);

  const fetchWalletDetails = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const res = await apiFetch('/api/wallet', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setWallet(data.wallet);
      setWalletHistory({
        ledger: data.ledger || [],
        deposits: data.deposits || [],
        withdrawals: data.withdrawals || [],
      });
    } catch {
      // Ignore
    }
  }, [apiFetch]);

  const fetchHistoryAndFairness = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const params = new URLSearchParams({
        view: 'history',
        mode: historyMode,
        page: String(historyPage),
        pageSize: '10',
      });
      if (historyDateFrom) params.set('dateFrom', historyDateFrom);
      if (historyDateTo) params.set('dateTo', historyDateTo);

      const res = await apiFetch(`/api/game?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setMyGames(data.myGames || []);
      setMyRounds(data.myRounds || []);
      setPastRounds(data.pastRounds || []);
      if (data.pagination) setHistoryPagination(data.pagination);
      if (data.asOfTimestamp) setHistoryAsOfUtc(data.asOfTimestamp);
      if (data.liveSummary) setLiveHistorySummary(data.liveSummary);
      if (data.practiceSummary) setPracticeHistorySummary(data.practiceSummary);
      if (data.pastRounds?.length > 0 && !verifySeedInputRef.current) {
        const first = data.pastRounds[0];
        setVerifySeedInput(first.serverSeed || '');
        setVerifyHashInput(first.serverSeedHash || '');
        setVerifyRoundIdInput(String(first.roundId || ''));
      }
    } catch {
      // Ignore
    }
  }, [historyMode, historyPage, historyDateFrom, historyDateTo, apiFetch]);

  // Safety watchdog: ensure authLoading is NEVER stuck for more than 2 seconds
  useEffect(() => {
    if (authLoading) {
      const timer = setTimeout(() => {
        setAuthLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [authLoading]);

  // Strictly require every user who exits/logs out and re-enters to enter their password on the Login screen
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage restrictions
      }
    }
    sessionTokenRef.current = null;
    setUser(null);
    setAuthLoading(false);
  }, []);

  // Poll public online player count even when on the login screen (bandwidth-friendly 25s interval, paused when hidden or rate-limited)
  useEffect(() => {
    if (userId) return;
    let active = true;
    const loadPublicStats = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() < rateLimitedUntilRef.current) return;
      try {
        const res = await fetch('/api/auth?publicStats=1', { cache: 'no-store' });
        if (res.status === 429) {
          rateLimitedUntilRef.current = Date.now() + 20000;
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data.onlinePlayersCount === 'number') {
          setOnlinePlayersCount(Math.max(0, data.onlinePlayersCount));
        }
        if (active && data.bettingSchedule) {
          setBettingSchedule(data.bettingSchedule);
        }
      } catch {
        // Ignore transient network error
      }
    };
    loadPublicStats();
    const timer = setInterval(loadPublicStats, 25000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userId]);

  // Smart bandwidth-optimized polling loop for real-time multiplayer synchronization across all connected players
  useEffect(() => {
    if (!userId) return;
    if (activeTab === 'lobby') {
      fetchLobby();
    } else if (activeTab === 'game' && selectedRoomId) {
      fetchActiveRoom(selectedRoomId);
    } else if (activeTab === 'wallet') {
      fetchWalletDetails();
    } else if (activeTab === 'history') {
      fetchHistoryAndFairness();
    }

    const pollIntervalMs =
      activeTab === 'game' ? 3500 : activeTab === 'lobby' ? 7000 : activeTab === 'wallet' ? 12000 : 20000;

    let tickCounter = 0;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() < rateLimitedUntilRef.current) return;
      tickCounter += 1;
      // Only refresh full profile / notifications every ~45 seconds since GET /api/game already syncs wallet & bettingSchedule
      if (tickCounter % Math.max(1, Math.round(45000 / pollIntervalMs)) === 0) {
        fetchProfile();
      }
      if (activeTab === 'lobby') {
        fetchLobby();
      } else if (activeTab === 'game' && selectedRoomId) {
        fetchActiveRoom(selectedRoomId);
      } else if (activeTab === 'wallet') {
        fetchWalletDetails();
      }
    }, pollIntervalMs);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        if (Date.now() < rateLimitedUntilRef.current) return;
        if (activeTab === 'lobby') fetchLobby();
        else if (activeTab === 'game' && selectedRoomId) fetchActiveRoom(selectedRoomId, true);
        else if (activeTab === 'wallet') fetchWalletDetails();
      }
    };

    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === 'winner_bingo_live_config_sync') {
        fetchLobby();
        if (selectedRoomId) {
          fetchActiveRoom(selectedRoomId, true);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageSync);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageSync);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [
    userId,
    activeTab,
    selectedRoomId,
    fetchProfile,
    fetchLobby,
    fetchActiveRoom,
    fetchWalletDetails,
    fetchHistoryAndFairness,
  ]);

  const clearSelection = useCallback(() => {
    selectedCardIndicesRef.current = [];
    setSelectedCardIndices([]);
  }, []);

  // Keep selectedCardIndices clean across round transitions and real-time locks by other players
  const currentRoundId = roomState?.activeRound?.id ?? null;
  const takenCardKey = (roomState?.activeRound?.takenCardIndices || []).join(',');
  useEffect(() => {
    if (currentRoundId !== null && lastRoundIdRef.current !== currentRoundId) {
      lastRoundIdRef.current = currentRoundId;
      clearSelection();
      setReplacingCardIndex(null);
      setActiveHeldCardTab(0);
      setShowOpenPhasePicker(true);
      return;
    }
    const taken: number[] = roomState?.activeRound?.takenCardIndices || [];
    if (taken.length === 0) return;
    setSelectedCardIndices((prev) => {
      const filtered = prev.filter((c) => !taken.includes(c));
      if (filtered.length !== prev.length) {
        selectedCardIndicesRef.current = filtered;
        return filtered;
      }
      return prev;
    });
  }, [currentRoundId, takenCardKey, roomState?.activeRound?.takenCardIndices, clearSelection]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedPassword = passwordInput.trim();
    if (trimmedPassword.length < 4) {
      setAuthError(
        lang === 'am'
          ? 'የይለፍ ቃል ቢያንስ 4 ፊደላት ወይም ቁጥሮች መሆን አለበት'
          : 'Password must be at least 4 characters'
      );
      return;
    }

    if (authMode === 'register') {
      if (passwordInput !== confirmPasswordInput && trimmedPassword !== confirmPasswordInput.trim()) {
        setAuthError(lang === 'am' ? 'የይለፍ ቃሎቹ አይመሳሰሉም' : 'Passwords do not match');
        return;
      }
      const cleanedPhone = phoneInput.replace(/[\s\-\(\)]/g, '').trim();
      const isValidPhone =
        /^(\+?251|0)?[79]\d{8}$/.test(cleanedPhone) || /^\+?[0-9]{9,15}$/.test(cleanedPhone);
      if (!cleanedPhone || !isValidPhone) {
        setAuthError(
          lang === 'am'
            ? 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ (ለምሳሌ፦ 0911223344 ወይም +251911223344 — ስልክ ቁጥር ማስገባት ግዴታ ነው)'
            : 'Please enter a valid phone number (e.g., 0911223344 or +251911223344 — Phone number is mandatory)'
        );
        return;
      }
      if (!termsAccepted) {
        setAuthError(
          lang === 'am'
            ? 'እድሜዎ 18+ መሆኑን እና ደንቦችን መቀበልዎን ማረጋገጥ አለብዎት'
            : 'You must confirm you are 18+ and accept the Terms'
        );
        return;
      }
    }

    setAuthSubmitting(true);
    try {
      // If user entered the Admin username (0918223401@eic) or Admin password (0972728253@eic) on the main login screen, authenticate as Admin
      const candidateAdminUser = usernameInput.trim().toLowerCase().replace(/\s+/g, '');
      const candidateAdminPass = passwordInput.trim();
      const isAdminAttempt =
        authMode === 'login' &&
        (candidateAdminUser === '0918223401@eic' ||
          candidateAdminUser === '0918223401' ||
          candidateAdminUser === '+251918223401' ||
          candidateAdminUser === 'habesha_admin' ||
          candidateAdminUser === 'admin' ||
          candidateAdminUser === '0972728253@eic' ||
          candidateAdminPass.toLowerCase() === '0972728253@eic');

      if (isAdminAttempt) {
        const adminRes = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'admin_login',
            username: candidateAdminUser || '0918223401@eic',
            password: candidateAdminPass,
          }),
        });
        const rawAdminText = await adminRes.text();
        let adminData: any = {};
        try {
          adminData = rawAdminText ? JSON.parse(rawAdminText) : {};
        } catch {
          adminData = {};
        }
        if (adminRes.ok && adminData?.sessionToken) {
          setPasswordInput('');
          setAuthSubmitting(false);
          setShowAdminPanel(true);
          return;
        }
        setAuthError(
          adminData?.error ||
            'የአድሚን የይለፍ ቃል ተሳስቷል (Invalid admin password)'
        );
        setAuthSubmitting(false);
        return;
      }

      const fingerprint = typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 60)}` : 'web';
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          authMode === 'register'
            ? {
                action: 'register',
                username: usernameInput,
                password: passwordInput,
                dob: dobInput,
                phone: phoneInput,
                termsAccepted,
                deviceFingerprint: fingerprint,
              }
            : {
                action: 'login',
                username: usernameInput,
                password: passwordInput,
                deviceFingerprint: fingerprint,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        setAuthSubmitting(false);
        return;
      }
      setPasswordInput('');
      setConfirmPasswordInput('');
      // Immediately set sessionToken and user state from response so iframe cookie policies never bounce the user back
      applyAuthenticatedPayload(data, true);
      setAuthSubmitting(false);
    } catch {
      setAuthError('Network error. Please try again.');
      setAuthSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotSubmitting(true);
    setForgotErrorMsg(null);
    setForgotSuccessMsg(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_password_reset',
          username: forgotUsername.trim(),
          phone: forgotPhone.trim(),
          notes: forgotNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotErrorMsg(
          data?.error ||
            (lang === 'am'
              ? 'ጥያቄውን ማቅረብ አልተቻለም። እባክዎ እንደገና ይሞክሩ።'
              : 'Failed to submit reset request.')
        );
      } else {
        setForgotSuccessMsg(
          data?.message ||
            (lang === 'am'
              ? 'የይለፍ ቃል መቀየሪያ ጥያቄዎ ለአድሚን ደርሷል። አድሚኑ እንደገመገመ አዲስ ጊዜያዊ የይለፍ ቃል ይደርስዎታል!'
              : 'Password reset request submitted to Admin!')
        );
      }
    } catch {
      setForgotErrorMsg(
        lang === 'am'
          ? 'የኔትወርክ ችግር አጋጥሟል። እባክዎ በቴሌግራም @WinnerBingoSupport ያግኙን።'
          : 'Network error. Please contact Telegram support @WinnerBingoSupport.'
      );
    } finally {
      setForgotSubmitting(false);
    }
  };

  const submitDirectGoogleEmailLogin = async (
    emailToUse: string,
    nameToUse?: string,
    passwordToUse?: string
  ) => {
    const cleanEmail = emailToUse.trim().toLowerCase();
    const cleanPassword = (passwordToUse !== undefined ? passwordToUse : googlePasswordInput).trim();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setShowGoogleEmailBox(true);
      setAuthError(
        lang === 'am'
          ? 'እባክዎ ትክክለኛ የ Google Email አድራሻ ያስገቡ (ለምሳሌ፦ name@gmail.com)'
          : 'Please enter a valid Google Email address (e.g., name@gmail.com).'
      );
      setTimeout(() => googleEmailInputRef.current?.focus(), 50);
      return;
    }

    if (!cleanPassword || cleanPassword.length < 4) {
      setShowGoogleEmailBox(true);
      setAuthError(
        lang === 'am'
          ? 'እባክዎ በ Google ለመግባት የይለፍ ቃልዎን (Password) ያስገቡ።'
          : 'Please enter your Password to sign in with Google.'
      );
      setTimeout(() => googlePasswordInputRef.current?.focus(), 50);
      return;
    }

    setAuthError(null);
    setGoogleSubmitting(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'google_email_login',
          email: cleanEmail,
          password: cleanPassword,
          displayName: nameToUse?.trim() || cleanEmail.split('@')[0],
          dob: dobInput || '1998-05-15',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Google Email Sign-In failed');
        setGoogleSubmitting(false);
        return;
      }
      try {
        const nextSaved = [
          cleanEmail,
          ...savedGoogleEmails.filter((item) => item.toLowerCase() !== cleanEmail),
        ].slice(0, 5);
        setSavedGoogleEmails(nextSaved);
        window.localStorage.setItem('habesha_saved_google_emails', JSON.stringify(nextSaved));
      } catch {
        // Ignore storage errors
      }
      setGooglePasswordInput('');
      setShowGoogleEmailBox(false);
      applyAuthenticatedPayload(data, true);
      setGoogleSubmitting(false);
    } catch {
      setAuthError(
        lang === 'am'
          ? 'የኔትወርክ ችግር አጋጥሟል። እባክዎ እንደገና ይሞክሩ።'
          : 'Network error during Google Sign-In. Please try again.'
      );
      setGoogleSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);

    const prefilledEmail =
      googleEmailInput.trim() || (usernameInput.includes('@') ? usernameInput.trim() : '');
    const prefilledPassword = googlePasswordInput.trim() || passwordInput.trim();

    // If the Google box is not open yet, open it and ask for Google Email + Password
    if (!showGoogleEmailBox) {
      setShowGoogleEmailBox(true);
      if (usernameInput.includes('@') && !googleEmailInput.trim()) {
        setGoogleEmailInput(usernameInput.trim());
      }
      setTimeout(() => {
        if (prefilledEmail) {
          googlePasswordInputRef.current?.focus();
        } else {
          googleEmailInputRef.current?.focus();
        }
      }, 50);
      return;
    }

    // If the Google box is open, validate and submit Google Email + Password
    await submitDirectGoogleEmailLogin(prefilledEmail, googleDisplayNameInput, prefilledPassword);
  };

  const handleLogout = async (allDevices = false) => {
    await apiFetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: allDevices ? 'logout_all' : 'logout' }),
    }).catch(() => {});
    await auth.signOut().catch(() => {});
    setSessionToken(null);
    setPasswordInput('');
    setConfirmPasswordInput('');
    setGooglePasswordInput('');
    setAuthMode('login');
    setUser(null);
    setRoomState(null);
  };

  const selectCardDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync helper to lock multiple selected cards on the server in real time (debounced to prevent burst rate limits)
  const syncSelectedCardsWithServer = (nextSelected: number[]) => {
    if (selectCardDebounceRef.current) {
      clearTimeout(selectCardDebounceRef.current);
    }
    selectCardDebounceRef.current = setTimeout(async () => {
      if (!selectedRoomIdRef.current || buyingTicketsRef.current) return;
      try {
        const res = await apiFetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'select_card',
            roomId: selectedRoomIdRef.current,
            cardIndices: nextSelected,
          }),
        });
        if (buyingTicketsRef.current) return;
        const rawText = await res.text();
        let data: any = null;
        try {
          data = rawText ? JSON.parse(rawText) : null;
        } catch {
          return;
        }
        if (data?.state) {
          setRoomState((prev: any) => ({ ...prev, ...data.state }));
        }
        if (Array.isArray(data?.reservedIndices) && !res.ok) {
          selectedCardIndicesRef.current = data.reservedIndices;
          setSelectedCardIndices(data.reservedIndices);
        }
        if (!res.ok && data?.error) {
          setGameActionMsg({ type: 'error', text: data.error });
        }
      } catch {
        // Ignore transient network hiccup during selection preview
      }
    }, 350);
  };

  // Requirement 5: Real-Time Multi-Cartela Selection & Locking — lets a single player select 1 or multiple cartelas, or change an already-selected cartela before the game starts
  const handleSelectCard = async (cardIndex: number, maxCardsPerPlayer: number) => {
    if (!selectedRoomId) return;
    setPreviewCardIndex(cardIndex);
    setGameActionMsg(null);

    const myHeldTicketsList: any[] = roomState?.activeRound?.myTickets || [];
    const isMyHeldCard =
      roomState?.activeRound?.myPurchasedCardIndices?.includes(cardIndex) ||
      myHeldTicketsList.some((t: any) => t.cardIndex === cardIndex);

    const isPracticeRoom = Boolean(roomState?.room?.isPractice);
    const isRoomModeOpen = isPracticeRoom
      ? bettingSchedule.isPracticeModeOpen !== false
      : bettingSchedule.isBettingOpen && bettingSchedule.isRealGameModeOpen !== false;

    if (!isMyHeldCard && !isRoomModeOpen) {
      const modeLabelAm = isPracticeRoom ? 'የመለማመጃ ጨዋታ (Practice Mode)' : 'የእውነተኛ ጨዋታ (Real Game Mode)';
      const modeLabelEn = isPracticeRoom ? 'Practice Mode' : 'Real Game Mode';
      const offReason = isPracticeRoom
        ? bettingSchedule.practiceOffReason
        : bettingSchedule.realGameOffReason;
      const resumeTime = isPracticeRoom
        ? bettingSchedule.practiceResumeTime
        : bettingSchedule.realGameResumeTime ||
          formatScheduledGameDate(bettingSchedule.scheduledGameTime);
      setGameActionMsg({
        type: 'error',
        text:
          lang === 'am'
            ? `🔒 ${modeLabelAm} ለጊዜው ተዘግቷል።${offReason ? ` ምክንያት፦ ${offReason}።` : ''}${resumeTime ? ` የሚከፈትበት ሰዓት፦ ${resumeTime}` : ''}`
            : `🔒 ${modeLabelEn} is currently turned OFF.${offReason ? ` Reason: ${offReason}.` : ''}${resumeTime ? ` Resumes at: ${resumeTime}` : ''}`,
      });
      return;
    }

    // If the player taps one of their own already-held cards while round is OPEN, select it for swapping/changing!
    if (isMyHeldCard) {
      if (roomState?.activeRound?.status === 'OPEN') {
        setReplacingCardIndex((prev) => (prev === cardIndex ? null : cardIndex));
        clearSelection();
        void syncSelectedCardsWithServer([]);
      }
      return;
    }

    const myHeldCount = myHeldTicketsList.length;
    const maxLimit = Math.max(4, maxCardsPerPlayer || 10);
    const remainingSlots = Math.max(0, maxLimit - myHeldCount);

    const current = selectedCardIndicesRef.current;
    const isSelected = current.includes(cardIndex);

    // If the player is in "Change Cartela" mode (replacing an already-locked card), tapping any available card selects that single replacement card
    if (replacingCardIndex !== null) {
      const nextSwapSelection = isSelected ? [] : [cardIndex];
      selectedCardIndicesRef.current = nextSwapSelection;
      setSelectedCardIndices(nextSwapSelection);
      void syncSelectedCardsWithServer(nextSwapSelection);
      return;
    }

    let nextSelected: number[];

    if (isSelected) {
      // Toggle OFF cleanly (even if it was the only selected card)
      nextSelected = current.filter((id) => id !== cardIndex);
    } else if (remainingSlots <= 0) {
      setGameActionMsg({
        type: 'info',
        text:
          lang === 'am'
            ? `በአንድ ዙር እስከ ${maxLimit} ካርቴላዎች ብቻ መያዝ ይቻላል። የያዙትን ለመቀየር ወርቃማውን ካርቴላ ይንኩ።`
            : `Maximum ${maxLimit} cartelas reached. Tap one of your held (gold) cartelas to change it.`,
      });
      return;
    } else if (current.length < remainingSlots) {
      // Add to multi-cartela selection!
      nextSelected = [...current, cardIndex];
    } else {
      setGameActionMsg({
        type: 'info',
        text:
          lang === 'am'
            ? `ከፍተኛው ${maxLimit} ካርቴላ ተመርጧል (${remainingSlots} ቦታ)። ሌላ ለመምረጥ መጀመሪያ ከተመረጡት አንዱን ይንኩ።`
            : `Maximum ${maxLimit} cartelas selected. Tap a selected cartela to unselect it first.`,
      });
      return;
    }

    selectedCardIndicesRef.current = nextSelected;
    setSelectedCardIndices(nextSelected);
    void syncSelectedCardsWithServer(nextSelected);
  };

  // Swap an already-locked cartela (oldCardIndex -> newCardIndex) while the round is still OPEN (before the game starts)
  const handleChangeHeldTicket = async (oldCardIndex: number, newCardIndex: number) => {
    if (!selectedRoomId || buyingTicketsRef.current) return;
    buyingTicketsRef.current = true;
    setBuyingTickets(true);
    setGameActionMsg(null);
    try {
      const res = await apiFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_ticket',
          roomId: selectedRoomId,
          oldCardIndex,
          newCardIndex,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setGameActionMsg({
          type: 'error',
          text:
            data?.error ||
            (lang === 'am'
              ? 'ካርቴላውን መቀየር አልተቻለም። እባክዎ ሌላ ቁጥር ይሞክሩ።'
              : 'Failed to change cartela. Please try another card.'),
        });
        return;
      }
      setPreviewCardIndex(newCardIndex);
      clearSelection();
      setReplacingCardIndex(null);
      setShowOpenPhasePicker(false);
      if (data?.state) {
        setRoomState((prev: any) => ({ ...prev, ...data.state }));
      }
      setGameActionMsg({
        type: 'success',
        text:
          lang === 'am'
            ? `🔄 ካርቴላ #${oldCardIndex} ወደ ካርቴላ #${newCardIndex} በተሳካ ሁኔታ ተቀይሯል!`
            : `🔄 Cartela #${oldCardIndex} successfully changed to Cartela #${newCardIndex}!`,
      });
    } catch {
      setGameActionMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'የኔትወርክ መቆራረጥ አጋጥሟል። እባክዎ እንደገና ይሞክሩ።'
            : 'Network error while changing cartela. Please try again.',
      });
    } finally {
      buyingTicketsRef.current = false;
      setBuyingTickets(false);
      if (selectedRoomId) {
        void fetchActiveRoom(selectedRoomId, true);
      }
      void fetchProfile();
    }
  };

  // Cancel/release an already-locked cartela with an instant full refund while the round is still OPEN (before the game starts)
  const handleCancelHeldTicket = async (cardIndex: number) => {
    if (!selectedRoomId || buyingTicketsRef.current) return;
    buyingTicketsRef.current = true;
    setBuyingTickets(true);
    setGameActionMsg(null);
    try {
      const res = await apiFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_ticket',
          roomId: selectedRoomId,
          cardIndex,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setGameActionMsg({
          type: 'error',
          text:
            data?.error ||
            (lang === 'am'
              ? 'ካርቴላውን መሰረዝ አልተቻለም።'
              : 'Failed to cancel cartela.'),
        });
        return;
      }
      clearSelection();
      setReplacingCardIndex(null);
      setActiveHeldCardTab(0);
      const remainingCount = data?.state?.activeRound?.myTickets?.length ?? 0;
      if (remainingCount === 0) {
        setShowOpenPhasePicker(true);
      }
      if (data?.state) {
        setRoomState((prev: any) => ({ ...prev, ...data.state }));
      }
      setGameActionMsg({
        type: 'info',
        text:
          lang === 'am'
            ? `✕ ካርቴላ #${cardIndex} ተሰርዟል፤ ክፍያው ወደ ሂሳብዎ ተመልሷል — አሁን ሌላ ካርቴላ መምረጥ ይችላሉ!`
            : `✕ Cartela #${cardIndex} cancelled and refunded — you can now select a different cartela!`,
      });
    } catch {
      setGameActionMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'የኔትወርክ መቆራረጥ አጋጥሟል። እባክዎ እንደገና ይሞክሩ።'
            : 'Network error while cancelling cartela. Please try again.',
      });
    } finally {
      buyingTicketsRef.current = false;
      setBuyingTickets(false);
      if (selectedRoomId) {
        void fetchActiveRoom(selectedRoomId, true);
      }
      void fetchProfile();
    }
  };

  // Quick Multi-Cartela Picker (e.g. +1 Random, Pick 2, Pick 3, Pick 4, or Clear)
  const handleQuickSelectCards = async (targetCount: number, maxCardsPerPlayer: number, additive = false) => {
    if (!selectedRoomId) return;
    setGameActionMsg(null);

    if (targetCount <= 0) {
      clearSelection();
      void syncSelectedCardsWithServer([]);
      return;
    }

    const isPracticeRoom = Boolean(roomState?.room?.isPractice);
    const isRoomModeOpen = isPracticeRoom
      ? bettingSchedule.isPracticeModeOpen !== false
      : bettingSchedule.isBettingOpen && bettingSchedule.isRealGameModeOpen !== false;

    if (!isRoomModeOpen) {
      const modeLabelAm = isPracticeRoom ? 'የመለማመጃ ጨዋታ (Practice Mode)' : 'የእውነተኛ ጨዋታ (Real Game Mode)';
      const modeLabelEn = isPracticeRoom ? 'Practice Mode' : 'Real Game Mode';
      const offReason = isPracticeRoom
        ? bettingSchedule.practiceOffReason
        : bettingSchedule.realGameOffReason;
      const resumeTime = isPracticeRoom
        ? bettingSchedule.practiceResumeTime
        : bettingSchedule.realGameResumeTime ||
          formatScheduledGameDate(bettingSchedule.scheduledGameTime);
      setGameActionMsg({
        type: 'error',
        text:
          lang === 'am'
            ? `🔒 ${modeLabelAm} ለጊዜው ተዘግቷል።${offReason ? ` ምክንያት፦ ${offReason}።` : ''}${resumeTime ? ` የሚከፈትበት ሰዓት፦ ${resumeTime}` : ''}`
            : `🔒 ${modeLabelEn} is currently turned OFF.${offReason ? ` Reason: ${offReason}.` : ''}${resumeTime ? ` Resumes at: ${resumeTime}` : ''}`,
      });
      return;
    }

    const myHeldCount = roomState?.activeRound?.myTickets?.length || 0;
    const maxLimit = Math.max(4, maxCardsPerPlayer || 10);
    const remainingSlots = Math.max(0, maxLimit - myHeldCount);
    if (remainingSlots <= 0) return;

    const takenSet = new Set<number>(roomState?.activeRound?.takenCardIndices || []);
    const baseSelected = additive ? [...selectedCardIndicesRef.current] : [];
    const currentSet = new Set<number>(baseSelected);

    const availablePool: number[] = [];
    for (let i = 1; i <= 120; i++) {
      if (!takenSet.has(i) && !currentSet.has(i)) {
        availablePool.push(i);
      }
    }

    // Shuffle available pool for random selection
    for (let i = availablePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePool[i], availablePool[j]] = [availablePool[j], availablePool[i]];
    }

    const desiredTotal = additive
      ? Math.min(remainingSlots, baseSelected.length + targetCount)
      : Math.min(remainingSlots, targetCount);
    const needed = Math.max(0, desiredTotal - baseSelected.length);
    const picked = availablePool.slice(0, needed);
    const nextSelected = [...baseSelected, ...picked];

    if (nextSelected.length > 0) {
      setPreviewCardIndex(nextSelected[nextSelected.length - 1]);
    }

    selectedCardIndicesRef.current = nextSelected;
    setSelectedCardIndices(nextSelected);
    void syncSelectedCardsWithServer(nextSelected);
  };

  const handleBuyTickets = async () => {
    const cardsToBuy =
      selectedCardIndicesRef.current.length > 0 ? [...selectedCardIndicesRef.current] : [...selectedCardIndices];
    if (!selectedRoomId || cardsToBuy.length === 0 || buyingTicketsRef.current) return;

    const isPracticeRoom = Boolean(roomState?.room?.isPractice);
    const isRoomModeOpen = isPracticeRoom
      ? bettingSchedule.isPracticeModeOpen !== false
      : bettingSchedule.isBettingOpen && bettingSchedule.isRealGameModeOpen !== false;

    if (!isRoomModeOpen) {
      const modeLabelAm = isPracticeRoom ? 'የመለማመጃ ጨዋታ (Practice Mode)' : 'የእውነተኛ ጨዋታ (Real Game Mode)';
      const modeLabelEn = isPracticeRoom ? 'Practice Mode' : 'Real Game Mode';
      const offReason = isPracticeRoom
        ? bettingSchedule.practiceOffReason
        : bettingSchedule.realGameOffReason;
      const resumeTime = isPracticeRoom
        ? bettingSchedule.practiceResumeTime
        : bettingSchedule.realGameResumeTime ||
          formatScheduledGameDate(bettingSchedule.scheduledGameTime);
      setGameActionMsg({
        type: 'error',
        text:
          lang === 'am'
            ? `🔒 ${modeLabelAm} ለጊዜው ተዘግቷል።${offReason ? ` ምክንያት፦ ${offReason}።` : ''}${resumeTime ? ` የሚከፈትበት ሰዓት፦ ${resumeTime}` : ''}`
            : `🔒 ${modeLabelEn} is currently turned OFF.${offReason ? ` Reason: ${offReason}.` : ''}${resumeTime ? ` Resumes at: ${resumeTime}` : ''}`,
      });
      return;
    }

    buyingTicketsRef.current = true;
    setBuyingTickets(true);
    setGameActionMsg(null);

    let lastErrorText: string | null = null;
    let succeeded = false;

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 350 * attempt));
          }
          const res = await apiFetch('/api/game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'buy_tickets',
              roomId: selectedRoomId,
              cardIndices: cardsToBuy,
            }),
          });

          const rawText = await res.text();
          let data: any = null;
          try {
            data = rawText ? JSON.parse(rawText) : null;
          } catch {
            if (res.status >= 500 && attempt < 2) {
              continue;
            }
          }

          if (!res.ok) {
            if (res.status >= 500 && attempt < 2) {
              lastErrorText = data?.error || null;
              continue;
            }
            lastErrorText =
              data?.error ||
              (lang === 'am'
                ? 'ካርቴላውን መግዛት አልተቻለም። እባክዎ እንደገና ይሞክሩ።'
                : 'Failed to buy tickets. Please try again.');
            break;
          }

          const boughtList = cardsToBuy.map((c) => `#${c}`).join(', ');
          if (cardsToBuy.length > 0) {
            setPreviewCardIndex(cardsToBuy[0]);
          }
          clearSelection();
          setShowOpenPhasePicker(false);
          if (data?.state) {
            setRoomState((prev: any) => ({ ...prev, ...data.state }));
          }
          const activePlayersNow = data?.state?.activeRound?.playerCount || 1;
          const minPlayersReq = data?.state?.activeRound?.minRequiredPlayers || 2;
          setGameActionMsg({
            type: 'success',
            text:
              activePlayersNow < minPlayersReq
                ? lang === 'am'
                  ? `ካርቴላ ${boughtList} በተሳካ ሁኔታ ተይዟል! አንድ ሰው ብቻውን መጫወት ስለማይችል ሌላ ተጫዋች ካርቴላ እስኪመርጥ ድረስ በመጠበቅ ላይ (${activePlayersNow}/${minPlayersReq} ተጫዋቾች)...`
                  : `Cartela(s) ${boughtList} locked in! Waiting for another player to select a cartela (${activePlayersNow}/${minPlayersReq} players)...`
                : lang === 'am'
                ? `ካርቴላ ${boughtList} በተሳካ ሁኔታ ተይዟል! ${activePlayersNow} ተጫዋቾች ዝግጁ ናቸው — የሰዓት ቆጣሪው 00:00 ሲደርስ ጨዋታው በራሱ ይጀምራል።`
                : `Cartela(s) ${boughtList} locked in! ${activePlayersNow} players ready — game starts automatically when countdown hits 00:00.`,
          });
          succeeded = true;
          break;
        } catch {
          if (attempt < 2) {
            continue;
          }
          lastErrorText =
            lang === 'am'
              ? 'የኔትወርክ መቆራረጥ አጋጥሟል። እባክዎ የመረጡትን ካርቴላ በድጋሚ ይጫኑ።'
              : 'Temporary connection hiccup. Please tap Buy Cartela again.';
        }
      }

      if (!succeeded && lastErrorText) {
        setGameActionMsg({ type: 'error', text: lastErrorText });
      }
    } finally {
      buyingTicketsRef.current = false;
      setBuyingTickets(false);
      if (selectedRoomId) {
        void fetchActiveRoom(selectedRoomId, true);
      }
      void fetchProfile();
    }
  };

  const handleClaimBingo = async () => {
    if (!selectedRoomId) return;
    setClaimingBingo(true);
    setGameActionMsg(null);
    try {
      const res = await apiFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim_bingo',
          roomId: selectedRoomId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGameActionMsg({ type: 'error', text: data.error || 'Claim rejected' });
      } else {
        const st = data.state;
        const settledRd = st?.activeRound;
        const rm = st?.room;
        if (settledRd) {
          lastAnnouncedWinRoundRef.current = settledRd.id;
          soundFx.playBingoWin(soundEnabled, {
            usernames: settledRd.winnerUsernames,
            cardIndices: settledRd.winningCardIndices,
          });
          setWinnerPopupData({
            roundId: settledRd.id,
            roomNameEn: getDisplayRoomName(rm, 'en'),
            roomNameAm: getDisplayRoomName(rm, 'am'),
            isPractice: Boolean(rm?.isPractice),
            winnerUsernames: settledRd.winnerUsernames || [],
            winningCardIndices: settledRd.winningCardIndices || [],
            winningTicketsDetails: settledRd.winningTicketsDetails || [],
            prizeMinor: settledRd.prizeMinor || 0,
            potMinor: settledRd.potMinor || 0,
            winningPattern: settledRd.winningPattern || rm?.pattern || 'ONE_LINE',
            calledNumbers: settledRd.calledNumbers || [],
            didCurrentUserWin: Boolean(settledRd.didCurrentUserWin ?? true),
            nextRoundOpensAt: settledRd.nextRoundOpensAt || null,
          });
        } else {
          soundFx.playBingoWin(soundEnabled);
        }
        setRoomState((prev: any) => ({ ...prev, ...data.state }));
        setGameActionMsg({
          type: 'success',
          text:
            lang === 'am'
              ? 'ቢንጎ! እንኳን ደስ አለዎት! አሸንፈዋል — ሽልማቱ ወደ ቦርሳዎ ገብቷል!'
              : 'BINGO! Congratulations! Your winning claim was verified and paid out!',
        });
        void fetchProfile();
      }
    } catch {
      setGameActionMsg({ type: 'error', text: 'Network error submitting claim' });
    } finally {
      setClaimingBingo(false);
    }
  };

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setDepositSentNotice(null);
    if (!file) {
      setDepProofDataUrl(null);
      return;
    }
    const isImageFile =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name || '');
    if (!isImageFile) {
      setWalletMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'እባክዎ የምስል ፋይል (Screenshot / PNG / JPEG) ብቻ ይምረጡ።'
            : 'Only image files (PNG/JPEG/WebP) are allowed as deposit screenshot.',
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setWalletMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'የScreenshot ምስሉ መጠን ከ 15 MB መብለጥ የለበትም።'
            : 'Screenshot image must be under 15 MB.',
      });
      return;
    }
    setProcessingProofImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setProcessingProofImage(false);
        return;
      }
      const rawDataUrl = reader.result;
      const img = new window.Image();
      img.onload = () => {
        try {
          const maxDim = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL('image/jpeg', 0.68);
            setDepProofDataUrl(compressed);
          } else {
            setDepProofDataUrl(rawDataUrl);
          }
        } catch {
          setDepProofDataUrl(rawDataUrl);
        } finally {
          setProcessingProofImage(false);
        }
      };
      img.onerror = () => {
        setDepProofDataUrl(rawDataUrl);
        setProcessingProofImage(false);
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setProcessingProofImage(false);
      setWalletMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'ምስሉን ማንበብ አልተቻለም። እባክዎ እንደገና ይሞክሩ።'
            : 'Could not read image file. Please try again.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRequestDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingDeposit || processingProofImage) return;
    setWalletMsg(null);
    setDepositSentNotice(null);
    const birr = parseFloat(depAmountBirr);
    if (Number.isNaN(birr) || birr < 10) {
      setWalletMsg({
        type: 'error',
        text: lang === 'am' ? 'ዝቅተኛው የገቢ መጠን 10.00 ብር ነው።' : 'Minimum deposit is 10.00 Birr',
      });
      return;
    }
    if (!depProofDataUrl && (!depRef || depRef.trim().length < 3)) {
      setWalletMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'እባክዎ ብር ገቢ ያደረጉበትን ደረሰኝ (Screenshot) ያያይዙ ወይም የደረሰኝ ቁጥር (Transaction Ref) ያስገቡ።'
            : 'Please upload your payment screenshot or enter the transaction reference.',
      });
      return;
    }
    const amountMinor = Math.round(birr * 100);
    setSubmittingDeposit(true);
    try {
      const res = await apiFetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_deposit',
          amountMinor,
          provider: depProvider,
          transactionRef: depRef.trim() || `SCR${Date.now().toString().slice(-8)}`,
          proofDataUrl: depProofDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWalletMsg({ type: 'error', text: data.error || 'Deposit request failed' });
        return;
      }
      const successText =
        lang === 'am'
          ? 'ወደ አድሚን ተልኳል! የገቢ ጥያቄዎ እና የላኩት Screenshot ወደ አድሚን በተሳካ ሁኔታ ተልኳል። አድሚኑ ሲያጸድቀው ወዲያውኑ ወደ ዋና ሂሳብዎ ይገባል።'
          : data.instructionsEn || 'Sent to Admin! Your deposit request and screenshot have been sent to Admin for approval.';
      setDepRef('');
      setDepProofDataUrl(null);
      if (proofFileInputRef.current) {
        proofFileInputRef.current.value = '';
      }
      setDepositSentNotice(successText);
      setWalletMsg({
        type: 'success',
        text: successText,
      });
      fetchWalletDetails();
    } catch {
      setWalletMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'የኔትወርክ ችግር አጋጥሟል፤ እባክዎ እንደገና ይሞክሩ።'
            : 'Network error submitting deposit request',
      });
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingWithdrawal) return;
    setWalletMsg(null);
    const birr = parseFloat(wdAmountBirr);
    if (Number.isNaN(birr) || birr < 100) {
      setWalletMsg({
        type: 'error',
        text:
          lang === 'am'
            ? 'ዝቅተኛው ወጪ ማዘዝ የሚቻለው መጠን 100.00 ብር ነው።'
            : 'Minimum withdrawal amount is 100.00 Birr.',
      });
      return;
    }
    const amountMinor = Math.round(birr * 100);
    setSubmittingWithdrawal(true);
    try {
      const res = await apiFetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_withdrawal',
          amountMinor,
          provider: wdProvider,
          payoutAccount: wdAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWalletMsg({ type: 'error', text: data.error || 'Withdrawal request failed' });
        return;
      }
      setWdAccount('');
      setWalletMsg({
        type: 'success',
        text:
          lang === 'am'
            ? 'የወጪ ጥያቄዎ ወደ አድሚን ተልኳል! መጠኑ በተያዘ ሂሳብ (Locked) ውስጥ ተቀምጧል፤ አድሚኑ ሲያጸድቀው ወደ አካውንትዎ ይላካል።'
            : 'Withdrawal request sent to Admin! Amount is held awaiting Admin approval.',
      });
      fetchWalletDetails();
      fetchProfile();
    } catch {
      setWalletMsg({ type: 'error', text: 'Network error submitting withdrawal request' });
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const handleVerifyFairness = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_round',
          serverSeed: verifySeedInput,
          publishedSeedHash: verifyHashInput,
          roundId: verifyRoundIdInput,
        }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, reason: 'Failed to run verification' });
    }
  };

  const formatCountdown = (startsAtIso: string) => {
    const serverNow = nowTick + serverOffsetMs;
    const target = new Date(startsAtIso).getTime();
    const diffSec = Math.max(0, Math.ceil((target - serverNow) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${diffSec}s (${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')})`;
  };

  const formatAddisTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'am' ? 'am-ET' : 'en-US', {
        timeZone: 'Africa/Addis_Ababa',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleTimeString();
    }
  };

  const formatScheduledGameDate = (iso: string | null) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat(lang === 'am' ? 'am-ET' : 'en-US', {
        timeZone: 'Africa/Addis_Ababa',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return iso;
    }
  };

  const getScheduledCountdownDetails = (iso: string | null) => {
    if (!iso) return null;
    const targetMs = new Date(iso).getTime();
    if (Number.isNaN(targetMs)) return null;
    const serverNow = nowTick + serverOffsetMs;
    const diffMs = targetMs - serverNow;
    const isPast = diffMs <= 0;
    const absDiff = Math.abs(diffMs);
    const totalSec = Math.floor(absDiff / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return {
      isPast,
      diffMs,
      days,
      hours,
      mins,
      secs,
      formattedText:
        days > 0
          ? `${days}d ${hours}h ${mins}m ${secs}s`
          : hours > 0
          ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
          : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    };
  };

  const handleOpenAdminGate = () => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('habesha_admin_auth_token');
        window.localStorage.removeItem('habesha_admin_auth_token');
      } catch {
        // Ignore storage error
      }
    }
    setShowAdminPanel(true);
  };

  if (showAdminPanel) {
    return <AdminControlPanel onBackToPlayer={() => setShowAdminPanel(false)} />;
  }

  if (authLoading) {
    return (
      <div
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6"
        style={{ backgroundColor: '#020617', minHeight: '100vh', color: '#f8fafc' }}
      >
        <div className="text-center space-y-4 max-w-xs mx-auto">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display font-bold text-white text-base">Winner Bingo</h3>
            <p className="text-xs text-slate-400 font-medium">
              {lang === 'am' ? 'በመጫን ላይ...' : 'Connecting to Winner Bingo...'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAuthLoading(false)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold border border-slate-700 transition-colors"
          >
            {lang === 'am' ? 'ወደ መግቢያ ገጽ እለፍ (ወደ መግቢያ)' : 'Continue to Login'}
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE 3 & 7: MANDATORY LOGIN / REGISTER SCREEN FIRST
  // ============================================================================
  if (!user) {
    return (
      <div className="wb-app-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-8">
        {/* Top bar with Brand, Admin Login & Language Switch */}
        <header className="wb-container max-w-5xl w-full mx-auto flex flex-wrap items-center justify-center sm:justify-between gap-2.5 py-3 border-b border-slate-800">
          <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
            {t.brand} · 75-Ball
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div
              className="px-3 py-1.5 text-xs font-extrabold bg-emerald-950 border border-emerald-500 rounded-lg text-emerald-300 flex items-center gap-1.5 whitespace-nowrap"
              title={lang === 'am' ? 'አሁን በመስመር ላይ ያሉ ተጫዋቾች ብዛት' : 'Players currently online'}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono">{onlinePlayersCount}</span>
              <span>{lang === 'am' ? 'ኦንላይን (Online)' : 'Online'}</span>
            </div>
            <button
              type="button"
              onClick={handleOpenAdminGate}
              className="px-3 py-1.5 text-xs font-bold bg-amber-950 border border-amber-400 rounded-lg text-amber-300 hover:bg-amber-900 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>{lang === 'am' ? 'የአድሚን መግቢያ (Admin)' : 'Admin Login'}</span>
            </button>
            <button
              type="button"
              onClick={() => setLang(lang === 'am' ? 'en' : 'am')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 border border-slate-700 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {lang === 'am' ? 'English (EN)' : 'አማርኛ (AM)'}
            </button>
          </div>
        </header>

        <main className="wb-card max-w-md w-full mx-auto my-6 sm:my-8 bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl">
          <div className="space-y-1.5 mb-5 text-center">
            <p className="text-xs text-emerald-400 font-bold">
              18+ Responsible Gaming · Provably Fair HMAC-SHA256
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
              {authMode === 'login' ? t.loginTitle : t.registerTitle}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {authMode === 'login' ? t.loginSub : t.registerSub}
            </p>
          </div>

          <div className="mb-5 p-3 rounded-xl bg-emerald-950/50 border border-emerald-700/60 flex items-center justify-between gap-3">
            <div className="text-xs text-emerald-200 leading-snug">
              <span className="font-bold text-emerald-400 block">
                {lang === 'am'
                  ? '🎁 ለአዲስ ተመዝጋቢ 20.00 ብር ቦነስ!'
                  : '🎁 20.00 ETB New Player Welcome Bonus!'}
              </span>
              <span>
                {lang === 'am'
                  ? 'አዲስ አካውንት ሲከፍቱ ወዲያውኑ 20.00 ብር ወደ ዋናው ዋሌትዎ ይገባል!'
                  : 'Sign up today and get 20.00 ETB credited instantly to your wallet!'}
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-mono font-extrabold text-xs shrink-0">
              +20 ETB
            </span>
          </div>

          {authError && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Primary Google Sign-In Button at Top for 1-Tap Access */}
          <button
            type="button"
            disabled={googleSubmitting || authSubmitting}
            onClick={handleGoogleLogin}
            className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-950 font-extrabold text-xs transition-colors flex items-center justify-center gap-2.5 shadow-md mb-3 cursor-pointer"
          >
            {googleSubmitting ? (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>
              {googleSubmitting
                ? lang === 'am'
                  ? 'በ Google በመግባት ላይ...'
                  : 'Signing in with Google...'
                : t.googleSignIn}
            </span>
          </button>

          {/* Direct Google Email + Password Sign-In Box (Opens immediately when clicking Continue with Google) */}
          {showGoogleEmailBox && (
            <div className="mb-5 p-4 rounded-xl bg-slate-950 border-2 border-emerald-500/70 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-300">
                  {lang === 'am'
                    ? '📧 በ Google (Gmail) እና የይለፍ ቃል (Password) ይግቡ'
                    : '📧 Sign in with Google (Gmail) & Password'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowGoogleEmailBox(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {lang === 'am'
                  ? 'የ Google (Gmail) አድራሻዎን እና የይለፍ ቃልዎን (Password) ያስገቡ፤ ከዚህ በፊት የነበረዎት አካውንት ወይም አዲስ ከሆኑ የ 20 ብር ቦነስ ወዲያውኑ ይከፈትልዎታል!'
                  : 'Enter your Google (Gmail) address and Password below to securely sign in or receive your 20 ETB welcome bonus.'}
              </p>

              {savedGoogleEmails.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {lang === 'am'
                      ? 'የተመዘገቡ የ Google አካውንቶች (ይምረጡና Password ያስገቡ)፦'
                      : 'Saved Google Accounts (Select & enter password):'}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {savedGoogleEmails.map((savedEmail) => (
                      <button
                        key={savedEmail}
                        type="button"
                        disabled={googleSubmitting}
                        onClick={() => {
                          setGoogleEmailInput(savedEmail);
                          setAuthError(null);
                          setTimeout(() => googlePasswordInputRef.current?.focus(), 50);
                        }}
                        className={`w-full px-3 py-2 rounded-lg border text-left text-xs font-mono flex items-center justify-between transition-colors cursor-pointer ${
                          googleEmailInput.toLowerCase() === savedEmail.toLowerCase()
                            ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                            : 'bg-slate-900 hover:bg-emerald-950/40 border-slate-700 text-slate-200'
                        }`}
                      >
                        <span className="truncate">{savedEmail}</span>
                        <span className="text-[10px] font-sans font-bold text-emerald-400 shrink-0 ml-2">
                          {lang === 'am' ? 'ምረጥ ↓' : 'Select ↓'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    {lang === 'am' ? '1. የ Google (Gmail) አድራሻ፦' : '1. Google (Gmail) Address:'}
                  </label>
                  <input
                    ref={googleEmailInputRef}
                    type="email"
                    value={googleEmailInput}
                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        googlePasswordInputRef.current?.focus();
                      }
                    }}
                    placeholder="yourname@gmail.com"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-400 focus:outline-none text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    {lang === 'am' ? '2. የይለፍ ቃል (Password)፦' : '2. Password:'}
                  </label>
                  <div className="relative">
                    <input
                      ref={googlePasswordInputRef}
                      type={showGooglePassword ? 'text' : 'password'}
                      value={googlePasswordInput}
                      onChange={(e) => setGooglePasswordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submitDirectGoogleEmailLogin(
                            googleEmailInput,
                            googleDisplayNameInput,
                            googlePasswordInput
                          );
                        }
                      }}
                      placeholder={
                        lang === 'am' ? 'የይለፍ ቃልዎን (Password) ያስገቡ' : 'Enter your password'
                      }
                      className="w-full h-10 pl-3 pr-10 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-400 focus:outline-none text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGooglePassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showGooglePassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={googleSubmitting}
                  onClick={() =>
                    submitDirectGoogleEmailLogin(
                      googleEmailInput,
                      googleDisplayNameInput,
                      googlePasswordInput
                    )
                  }
                  className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow cursor-pointer"
                >
                  {googleSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {googleSubmitting
                      ? lang === 'am'
                        ? 'በመግባት ላይ...'
                        : 'Signing in...'
                      : lang === 'am'
                      ? 'በ Google እና Password ግባ (Sign In)'
                      : 'Sign In with Google & Password'}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px bg-slate-800 flex-1" />
            <span className="text-[11px] text-slate-500">
              {lang === 'am'
                ? 'ወይም በሙሉ ስም / ስልክ ቁጥር (09...) / Gmail እና የይለፍ ቃል'
                : 'OR WITH FULL NAME / PHONE NUMBER / GMAIL & PASSWORD'}
            </span>
            <div className="h-px bg-slate-800 flex-1" />
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {authMode === 'register'
                  ? lang === 'am'
                    ? 'ሙሉ ስም (እስከ አባት ስም) ወይም Google Email'
                    : 'Full Name (with Father Name) or Google Email'
                  : lang === 'am'
                  ? 'ሙሉ ስም / ስልክ ቁጥር (09...) / የተጫዋች ስም ወይም Google Email'
                  : 'Full Name / Phone Number (09...) / Username or Google Email'}
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={100}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder={
                  authMode === 'register'
                    ? lang === 'am'
                      ? 'ለምሳሌ፦ Tigabu Adane ወይም ጥጋቡ አዳነ ወይም name@gmail.com'
                      : 'e.g. Tigabu Adane or name@gmail.com'
                    : lang === 'am'
                    ? 'ለምሳሌ፦ 0911223344 ወይም Tigabu Adane ወይም name@gmail.com'
                    : 'e.g. 0911223344 or Tigabu Adane or name@gmail.com'
                }
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">{t.password}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  autoComplete="off"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={lang === 'am' ? 'የይለፍ ቃልዎን ያስገቡ (ቢያንስ 4 ፊደላት/ቁጥሮች)' : 'Enter your password (min 4 characters)'}
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1 h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {authMode === 'login' && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotErrorMsg(null);
                      setForgotSuccessMsg(null);
                      setForgotUsername(usernameInput || '');
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium hover:underline flex items-center gap-1 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{lang === 'am' ? 'የይለፍ ቃል ረሱ? (Forgot Password?)' : 'Forgot Password?'}</span>
                  </button>
                </div>
              )}
            </div>

            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.confirmPassword}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder={lang === 'am' ? 'የይለፍ ቃልዎን በድጋሚ ያስገቡ' : 'Re-enter password'}
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">{t.dob}</label>
                    <input
                      type="date"
                      required
                      value={dobInput}
                      onChange={(e) => setDobInput(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">{t.phone}</label>
                    <input
                      type="tel"
                      required
                      minLength={9}
                      maxLength={16}
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder={lang === 'am' ? '09... ወይም +251 9...' : '09... or +251 9...'}
                      className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-300 leading-relaxed">
                    {t.termsCheck}{' '}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-emerald-400 underline hover:text-emerald-300"
                    >
                      {lang === 'am' ? '(ደንቦችን ያንብቡ)' : '(Read Terms & 18+ Policy)'}
                    </button>
                  </span>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={authSubmitting || googleSubmitting}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {authSubmitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              <span>
                {authSubmitting
                  ? lang === 'am'
                    ? 'በመግባት ላይ... እባክዎ ይጠብቁ'
                    : 'Signing in... Please wait'
                  : authMode === 'login'
                  ? t.signInBtn
                  : t.createAccountBtn}
              </span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center space-y-3">
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setAuthMode(authMode === 'login' ? 'register' : 'login');
              }}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 underline block w-full"
            >
              {authMode === 'login' ? t.switchToRegister : t.switchToLogin}
            </button>

            <div className="pt-2 border-t border-slate-800/60">
              <button
                type="button"
                onClick={handleOpenAdminGate}
                className="w-full h-10 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>
                  {lang === 'am'
                    ? 'ወደ አድሚን መቆጣጠሪያ ፓነል ይግቡ (Admin Login)'
                    : 'Open Admin Control Panel (Admin Login)'}
                </span>
              </button>
            </div>
          </div>
        </main>

        {showTermsModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">
                  Terms of Service & 18+ Responsible Gaming Policy
                </h2>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1"
                >
                  Close
                </button>
              </div>
              <div className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
                <p>
                  1. <strong>Strict 18+ Age Requirement:</strong> Only individuals aged 18 years or older may register or participate. Under-18 registration is strictly blocked.
                </p>
                <p>
                  2. <strong>Server-Authoritative & Provably Fair Draws:</strong> Every round publishes SHA256(serverSeed) before start and derives the 75-ball draw sequence via HMAC_SHA256(serverSeed, roundId). After the round settles, serverSeed is revealed for independent verification.
                </p>
                <p>
                  3. <strong>Prize Math & Tie-Splitting:</strong> Pot = Tickets × Ticket Price. House Fee is deducted in integer minor units (santim). Net Prize = Pot − Fee. Simultaneous valid BINGO winners split the net prize equally; any integer santim remainder goes to the house.
                </p>
                <p>
                  4. <strong>Admin-Verified Deposits & Withdrawals:</strong> Every deposit and withdrawal request starts as PENDING and requires explicit verification before wallet credit or payout completion.
                </p>
                <p>
                  5. <strong>Self-Exclusion & Deposit Limits:</strong> Players may lower daily deposit limits immediately (increases require a 24-hour cooling-off delay) or activate self-exclusion at any time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTermsAccepted(true);
                  setShowTermsModal(false);
                }}
                className="w-full h-10 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs"
              >
                I Confirm I am 18+ & Accept Terms
              </button>
            </div>
          </div>
        )}

        {/* ====================================================================
            FORGOT PASSWORD MODAL (የይለፍ ቃል መቀየሪያ ማመልከቻ)
            Provides Instant Telegram/Phone Support and Direct Admin Request
           ==================================================================== */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-white">
                      {lang === 'am' ? 'የይለፍ ቃል መቀየሪያ' : 'Reset Password'}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {lang === 'am'
                        ? 'የይለፍ ቃልዎን ከረሱ ከታች ያሉትን አማራጮች ይጠቀሙ'
                        : 'Choose an option below to reset your forgotten password'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="text-xs text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              {/* Option 1: Fast Telegram / Direct Phone Support */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-sky-950/70 via-slate-900 to-slate-950 border border-sky-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <span className="text-xs font-bold text-sky-300">
                      {lang === 'am' ? 'ፈጣን የቴሌግራም ድጋፍ (ፈጣኑ መንገድ)' : 'Instant Telegram Support (Fastest)'}
                    </span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                    24/7 Live
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {lang === 'am'
                    ? 'የይለፍ ቃልዎን በ 1 ደቂቃ ውስጥ በአድሚን ለማስቀየር በቀጥታ በቴሌግራም ያናግሩን።'
                    : 'Chat directly with our support admin on Telegram to reset your password within 1 minute.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <a
                    href="https://t.me/WinnerBingoSupport"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Manager = @WinnerBingoSupport</span>
                  </a>
                  <a
                    href="tel:0962838885"
                    className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Finance = 0962838885</span>
                  </a>
                  <a
                    href="tel:0962948280"
                    className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-amber-400" />
                    <span>Customer service = 0962948280</span>
                  </a>
                  <a
                    href="tel:0918183607"
                    className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-sky-400" />
                    <span>Communication = 0918183607</span>
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px bg-slate-800 flex-1" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {lang === 'am' ? 'ወይም ጥያቄዎን ለአድሚን ይላኩ' : 'OR SUBMIT REQUEST TO ADMIN'}
                </span>
                <div className="h-px bg-slate-800 flex-1" />
              </div>

              {/* Option 2: Submit Reset Request Directly into Admin Queue */}
              {forgotSuccessMsg ? (
                <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/60 space-y-2 text-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-emerald-300">
                    {lang === 'am' ? 'ጥያቄዎ ለአድሚን ደርሷል!' : 'Request Submitted Successfully!'}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{forgotSuccessMsg}</p>
                  <p className="text-[11px] text-slate-400 pt-1">
                    {lang === 'am'
                      ? 'አድሚኑ ሲያጸድቀው በአጭር መልዕክት ወይም በቴሌግራም አዲስ የይለፍ ቃል ይደርስዎታል።'
                      : 'Once approved, your temporary password will be sent via Telegram or SMS.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false);
                      setForgotSuccessMsg(null);
                    }}
                    className="w-full h-9 mt-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    {lang === 'am' ? 'ተረድቻለሁ (ዝጋ)' : 'Got it (Close)'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                  {forgotErrorMsg && (
                    <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{forgotErrorMsg}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {lang === 'am' ? 'የተጠቃሚ ስም (Username)' : 'Username'}
                    </label>
                    <input
                      type="text"
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      placeholder="e.g. dawit_addis"
                      className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {lang === 'am' ? 'የተመዘገቡበት ስልክ ቁጥር (Phone Number)' : 'Registered Phone Number'}
                    </label>
                    <input
                      type="tel"
                      value={forgotPhone}
                      onChange={(e) => setForgotPhone(e.target.value)}
                      placeholder="+251 9..."
                      className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {lang === 'am'
                        ? 'ተጨማሪ ዝርዝር / ማስታወሻ (አማራጭ)'
                        : 'Verification Note (Optional)'}
                    </label>
                    <textarea
                      rows={2}
                      value={forgotNotes}
                      onChange={(e) => setForgotNotes(e.target.value)}
                      placeholder={
                        lang === 'am'
                          ? 'ለምሳሌ፦ የይለፍ ቃሌን ረሳሁት፤ አዲሱን በቴሌግራም ወይም በስልክ ላኩልኝ...'
                          : 'e.g. Forgot my password, please send temp password to my Telegram...'
                      }
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="flex-1 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                    >
                      {lang === 'am' ? 'ይቅር (Cancel)' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={forgotSubmitting || (!forgotUsername.trim() && !forgotPhone.trim())}
                      className="flex-[2] h-10 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                    >
                      {forgotSubmitting ? (
                        <span>{lang === 'am' ? 'በመላክ ላይ...' : 'Submitting...'}</span>
                      ) : (
                        <>
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>{lang === 'am' ? 'ጥያቄውን ላክ (Submit)' : 'Submit Request'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-500 py-3 border-t border-slate-900">
          18+ Play Responsibly · All amounts stored in integer santim · Timezone: Africa/Addis_Ababa
        </footer>
      </div>
    );
  }

  // Compute session duration for Phase 8 Session-Time Reminder
  const sessionMinutes = Math.floor((nowTick - sessionStartMs) / 60000);
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  const activeRd = roomState?.activeRound;
  const activeRm = roomState?.room;
  const calledSet = new Set<number>(activeRd?.calledNumbers || []);

  // Check if any held ticket currently satisfies the room pattern so we can highlight ready BINGO state
  const hasValidBingoOnMyCards =
    activeRd?.status === 'DRAWING' &&
    activeRd?.myTickets?.some(
      (tk: any) =>
        validateClaim(tk.cardGrid, activeRd.calledNumbers || [], (activeRm?.pattern || 'ANY_LINE') as BingoPattern)
          .valid
    );

  const isPreGamePhase = activeRd?.status === 'OPEN';
  const myHeldTickets: any[] = activeRd?.myTickets || [];
  const maxCardsAllowed = Math.max(4, activeRm?.maxCardsPerPlayer || 10);
  const canBuyMoreInOpen = isPreGamePhase && myHeldTickets.length < maxCardsAllowed;
  const showCardSelectionGrid =
    Boolean(isPreGamePhase && (myHeldTickets.length === 0 || showOpenPhasePicker));

  const roundPattern = (activeRd?.winningPattern || activeRm?.pattern || 'ONE_LINE') as BingoPattern;
  const effectiveCardPool: Array<{ cardIndex: number; grid: BingoCardGrid | null }> =
    Array.isArray(roomState?.cardPool) && roomState.cardPool.length > 0
      ? roomState.cardPool
      : Array.from({ length: 120 }, (_, idx) => ({ cardIndex: idx + 1, grid: null }));
  const fallbackPreviewIdx = selectedCardIndices[0] || previewCardIndex || 1;
  const fallbackPoolCard = effectiveCardPool.find(
    (c: any) => c.cardIndex === fallbackPreviewIdx && c.grid
  );

  const effectiveTickets: any[] =
    myHeldTickets.length > 0
      ? myHeldTickets
      : fallbackPoolCard
      ? [
          {
            id: -fallbackPreviewIdx,
            cardIndex: fallbackPoolCard.cardIndex,
            cardGrid: fallbackPoolCard.grid,
            isSpectatorPreview: true,
          },
        ]
      : [];

  const ticketsToDisplay =
    showAllHeldCards && effectiveTickets.length > 1
      ? effectiveTickets
      : [effectiveTickets[activeHeldCardTab] || effectiveTickets[0]].filter(Boolean);

  const activeFocusedTicket =
    myHeldTickets[activeHeldCardTab] || myHeldTickets[0] || null;

  const scheduledCountdownInPreGame = bettingSchedule.scheduledGameTime
    ? getScheduledCountdownDetails(bettingSchedule.scheduledGameTime)
    : null;

  const isPracticeModeOpen = bettingSchedule.isPracticeModeOpen !== false;
  const isRealGameModeOpen =
    bettingSchedule.isBettingOpen && bettingSchedule.isRealGameModeOpen !== false;
  const isCurrentRoomBettingOpen = activeRm?.isPractice
    ? isPracticeModeOpen
    : isRealGameModeOpen;

  return (
    <div
      className={`wb-app-shell min-h-screen w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col items-center pb-24 md:pb-12 text-base sm:text-lg ${
        uiScale === 'xlarge'
          ? 'ui-scale-xlarge'
          : uiScale === 'large'
          ? 'ui-scale-large'
          : 'ui-scale-normal'
      }`}
    >
      {/* ========================================================================
          TOP BAR CONTRACT: Centered & Responsive (Brand & Status Row + Spacious 4-Item Navigation Row)
         ======================================================================== */}
      <header className="sticky top-0 z-30 w-full bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-3 shadow-lg">
        <div className="wb-container max-w-6xl w-full mx-auto flex flex-wrap items-center justify-center sm:justify-between gap-2.5 sm:gap-4">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('lobby')}
            className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            {t.brand}
          </button>

          {/* Zone 2: Online Players Counter, Prominent Username + Playing Balance, 18+ Limits, Font Scaler, Notifications, Language, Logout */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
            {/* Live Online Players Counter Badge */}
            <div
              title={lang === 'am' ? 'አሁን በመስመር ላይ ያሉ ተጫዋቾች ብዛት (Live Online Players)' : 'Live Online Players Count'}
              className="px-3 py-2 rounded-xl bg-emerald-950 border-2 border-emerald-500 flex items-center gap-1.5 text-emerald-300 shadow-sm whitespace-nowrap"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-mono font-extrabold text-sm sm:text-base text-white tabular-nums">
                {onlinePlayersCount}
              </span>
              <span className="text-xs font-extrabold text-emerald-300">
                {lang === 'am' ? 'ኦንላይን' : 'Online'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('wallet');
                fetchWalletDetails();
              }}
              title={lang === 'am' ? 'የተጫዋች ስም እና ቀሪ ሂሳብ (ወደ ቦርሳ ለመግባት ይጫኑ)' : 'Username & Playing Balance (Click to open Wallet)'}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-emerald-500 flex items-center gap-2 sm:gap-3 transition-colors shadow-md"
            >
              <span className="flex items-center gap-1.5 text-white font-extrabold text-sm sm:text-base whitespace-nowrap">
                <User className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                <span>{user.username}</span>
              </span>
              <span className="h-4 w-0.5 bg-slate-700 shrink-0" />
              <span className="font-mono font-extrabold text-sm sm:text-base tabular-nums text-emerald-400 whitespace-nowrap">
                {activeTab === 'game' && activeRm?.isPractice
                  ? `${formatEtb(wallet.playBalanceMinor, lang)} (${lang === 'am' ? 'ልምምድ' : 'Play'})`
                  : formatEtb(wallet.balanceMinor, lang)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('responsible')}
              title={t.navResponsible}
              className={`px-3 py-2 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'responsible'
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>18+</span>
            </button>

            {/* UI / Font Size Scaler Button (Normal -> Large -> X-Large) */}
            <button
              type="button"
              onClick={() =>
                setUiScale((prev) =>
                  prev === 'normal' ? 'large' : prev === 'large' ? 'xlarge' : 'normal'
                )
              }
              title={lang === 'am' ? 'የፅሁፍ መጠን ማሳደጊያ (Font Size)' : 'Adjust Text & UI Size'}
              className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-400 text-xs sm:text-sm font-extrabold text-amber-300 whitespace-nowrap"
            >
              {uiScale === 'xlarge' ? 'A++' : uiScale === 'large' ? 'A+' : 'A'}
            </button>

            <button
              type="button"
              onClick={() => setShowNotifDrawer(!showNotifDrawer)}
              aria-label="Notifications"
              className="relative min-h-[40px] min-w-[40px] rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-200 hover:text-white"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-amber-400 text-slate-950 rounded-md text-xs font-extrabold font-mono">
                  {unreadNotifs}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setLang(lang === 'am' ? 'en' : 'am')}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm font-extrabold text-slate-100 hover:bg-slate-800 whitespace-nowrap"
            >
              {lang === 'am' ? 'EN' : 'አማ'}
            </button>

            <button
              type="button"
              onClick={handleOpenAdminGate}
              title={lang === 'am' ? 'የአድሚን መቆጣጠሪያ ፓነል (Admin Panel)' : 'Admin Control Panel'}
              className="px-3 py-2 rounded-xl bg-amber-950/90 hover:bg-amber-900 border-2 border-amber-400 text-xs sm:text-sm font-extrabold text-amber-300 flex items-center gap-1.5 whitespace-nowrap shadow-sm cursor-pointer transition-colors"
            >
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{lang === 'am' ? 'አድሚን' : 'Admin'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleLogout(false)}
              title={t.logout}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm font-extrabold text-slate-200 hover:text-red-300 flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Spacious 4-Button Primary Navigation Bar (Visible on Mobile & Desktop) */}
        <nav className="wb-nav-bar" aria-label="Main Navigation">
          <button
            type="button"
            onClick={() => setActiveTab('lobby')}
            className={`wb-nav-btn ${activeTab === 'lobby' ? 'wb-nav-btn-active' : ''}`}
          >
            <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
            <span>{t.navLobby}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('game')}
            className={`wb-nav-btn ${activeTab === 'game' ? 'wb-nav-btn-active' : ''}`}
          >
            <Play className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            <span>{t.navLiveGame}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('wallet');
              fetchWalletDetails();
            }}
            className={`wb-nav-btn ${activeTab === 'wallet' ? 'wb-nav-btn-active' : ''}`}
          >
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <span>{t.navWallet}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              fetchHistoryAndFairness();
            }}
            className={`wb-nav-btn ${activeTab === 'history' ? 'wb-nav-btn-active' : ''}`}
          >
            <History className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 shrink-0" />
            <span>{t.navHistory}</span>
          </button>
        </nav>
      </header>

      {/* ========================================================================
          GLOBAL WINNER CELEBRATION POPUP MODAL (VISIBLE TO ALL PLAYERS IN GAME)
          Shows: Winner Username, Winning Cartela #, Winning Amount + Balance,
          Winning 5x5 Cartela Grid, and Celebratory Sound Effect Replay!
         ======================================================================== */}
      {winnerPopupData && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-3xl bg-slate-900 border-2 border-amber-400 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl my-auto">
            {/* Popup Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/30">
                  <Award className="w-9 h-9 sm:w-10 sm:h-10" />
                </div>
                <div>
                  <span className="inline-block px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs sm:text-sm font-extrabold uppercase tracking-wider mb-1">
                    {lang === 'am'
                      ? `${winnerPopupData.roomNameAm} · ዙር #${winnerPopupData.roundId} ተጠናቋል`
                      : `${winnerPopupData.roomNameEn} · Round #${winnerPopupData.roundId} Finished`}
                  </span>
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                    {winnerPopupData.didCurrentUserWin
                      ? lang === 'am'
                        ? '🎉 ቢንጎ! እንኳን ደስ አለዎት — እርስዎ አሸንፈዋል!'
                        : '🎉 BINGO! Congratulations — You Won!'
                      : lang === 'am'
                      ? '🎉 ቢንጎ! የዚህ ዙር አሸናፊ (በላተኛ) ተገኝቷል!'
                      : '🎉 BINGO! We Have a Round Winner!'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  soundFx.playBingoWin(true, {
                    usernames: winnerPopupData.winnerUsernames,
                    cardIndices: winnerPopupData.winningCardIndices,
                  });
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/60 text-amber-300 text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 shrink-0"
              >
                <Volume2 className="w-5 h-5 text-amber-400" />
                <span>{lang === 'am' ? 'የድል ድምፅ ድገም' : 'Replay Win Sound'}</span>
              </button>
            </div>

            {/* 3 Big Highlight Cards: 1) Winner Username  2) Winning Cartela #  3) Winning Amount & Balance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* 1. Winner Username */}
              <div className="bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 text-center space-y-1">
                <span className="text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wider block">
                  {lang === 'am' ? '👤 አሸናፊ ተጫዋች (Username)' : '👤 Winner Username'}
                </span>
                <div className="text-xl sm:text-2xl font-extrabold text-white break-words">
                  {(winnerPopupData.winnerUsernames || []).length > 0
                    ? winnerPopupData.winnerUsernames.join(', ')
                    : lang === 'am'
                    ? 'ተጫዋች'
                    : 'Player'}
                </div>
              </div>

              {/* 2. Winning Cartela / Ticket Number */}
              <div className="bg-amber-400/15 border-2 border-amber-400/70 rounded-2xl p-4 text-center space-y-1">
                <span className="text-xs sm:text-sm font-bold text-amber-200 uppercase tracking-wider block">
                  {lang === 'am' ? '🎯 ያሸነፈው ካርቴላ ቁጥር' : '🎯 Winning Cartela #'}
                </span>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-amber-300">
                  {(winnerPopupData.winningCardIndices || []).length > 0
                    ? winnerPopupData.winningCardIndices.map((c: number) => `#${c}`).join(', ')
                    : '-'}
                </div>
              </div>

              {/* 3. Winning Amount / Prize Paid */}
              <div className="bg-emerald-950/80 border-2 border-emerald-400/80 rounded-2xl p-4 text-center space-y-1">
                <span className="text-xs sm:text-sm font-bold text-emerald-200 uppercase tracking-wider block">
                  {lang === 'am' ? '💰 ያሸነፈበት ገንዘብ (ሽልማት)' : '💰 Winning Prize Amount'}
                </span>
                <div className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-400 tabular-nums">
                  {formatEtb(winnerPopupData.prizeMinor, lang)}
                </div>
              </div>
            </div>

            {/* Player Balance & Encouragement Strip */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm sm:text-base">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <User className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  {lang === 'am' ? `የእርስዎ ስም: ${user.username}` : `Your Account: ${user.username}`}
                </span>
              </div>
              <div className="font-mono font-extrabold text-emerald-400 text-base sm:text-lg">
                {winnerPopupData.isPractice
                  ? `${lang === 'am' ? 'የእርስዎ የልምምድ ሂሳብ' : 'Your Play Balance'}: ${formatEtb(wallet.playBalanceMinor, lang)}`
                  : `${lang === 'am' ? 'የእርስዎ ዋና ቀሪ ሂሳብ' : 'Your Real Balance'}: ${formatEtb(wallet.balanceMinor, lang)}`}
              </div>
            </div>

            {/* Winning Cartela 5x5 Visual Grid(s) inside Popup */}
            {winnerPopupData.winningTicketsDetails?.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-sm sm:text-base font-extrabold text-amber-300 text-center">
                  {lang === 'am'
                    ? `ያሸነፈው ካርቴላ 5×5 እይታ (${getPatternLabel(winnerPopupData.winningPattern as BingoPattern, lang)})`
                    : `Winning 5×5 Cartela (${getPatternLabel(winnerPopupData.winningPattern as BingoPattern, lang)})`}
                </div>
                <div
                  className={
                    winnerPopupData.winningTicketsDetails.length > 1
                      ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-80 overflow-y-auto p-1'
                      : 'max-w-sm mx-auto'
                  }
                >
                  {winnerPopupData.winningTicketsDetails.map((wt: any) => {
                    const winPattern = (winnerPopupData.winningPattern || 'ONE_LINE') as BingoPattern;
                    const popupCalledSet = new Set<number>(winnerPopupData.calledNumbers || []);
                    const winEval = validateClaim(
                      wt.cardGrid,
                      winnerPopupData.calledNumbers || [],
                      winPattern
                    );
                    const winCellSet = new Set(winEval.winningCells.map(([r, c]) => `${r}-${c}`));
                    return (
                      <div
                        key={wt.ticketId}
                        className="bg-slate-950 border-2 border-amber-400/60 rounded-2xl p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-sm sm:text-base font-mono font-extrabold">
                          <span className="text-amber-300">
                            {lang === 'am'
                              ? `ካርቴላ #${wt.cardIndex} (${wt.username})`
                              : `Cartela #${wt.cardIndex} (${wt.username})`}
                          </span>
                          <span className="text-emerald-400">
                            +{formatEtb(wt.payoutMinor || winnerPopupData.prizeMinor, lang)}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5 text-center">
                          {['B', 'I', 'N', 'G', 'O'].map((l) => (
                            <div
                              key={l}
                              className="py-1.5 rounded-lg bg-slate-800 text-amber-400 font-display font-extrabold text-sm sm:text-base"
                            >
                              {l}
                            </div>
                          ))}
                          {wt.cardGrid.map((row: number[], rIdx: number) =>
                            row.map((val: number, cIdx: number) => {
                              const isFree = rIdx === 2 && cIdx === 2;
                              const isCalled = isFree || popupCalledSet.has(val);
                              const isWinCell = winCellSet.has(`${rIdx}-${cIdx}`);
                              return (
                                <div
                                  key={`${rIdx}-${cIdx}`}
                                  className={`py-2 rounded-lg font-mono text-sm sm:text-base font-extrabold border ${
                                    isWinCell
                                      ? 'bg-amber-400 text-slate-950 border-white ring-2 ring-amber-200'
                                      : isCalled
                                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                                      : 'bg-slate-900 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {isFree ? 'FREE' : val}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Popup Footer: Next Round Countdown & Close Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="text-sm sm:text-base font-mono font-bold text-amber-300 text-center sm:text-left">
                {activeRd?.status === 'OPEN'
                  ? lang === 'am'
                    ? '✅ ቀጣዩ ዙር ተከፍቷል! አሁን ካርቴላ መምረጥ ይችላሉ።'
                    : '✅ Next round is now OPEN! You can pick your cartelas.'
                  : winnerPopupData.nextRoundOpensAt
                  ? lang === 'am'
                    ? `ቀጣዩ ዙር በራሱ በ ${formatCountdown(winnerPopupData.nextRoundOpensAt)} ይከፈታል`
                    : `Next round opens in ${formatCountdown(winnerPopupData.nextRoundOpensAt)}`
                  : ''}
              </div>
              <button
                type="button"
                onClick={() => setWinnerPopupData(null)}
                className="w-full sm:w-auto min-w-[240px] h-13 sm:h-14 px-7 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base sm:text-lg transition-colors shadow-lg shadow-emerald-500/25"
              >
                {lang === 'am' ? 'ወደ ቀጣዩ ዙር ቀጥል / ዝጋ (OK)' : 'Continue to Next Round (Close)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session-Time Reminder Strip */}
      {sessionMinutes >= 30 && (
        <div className="bg-amber-950/60 border-b border-amber-800/70 px-4 py-2.5 text-center text-sm sm:text-base font-medium text-amber-200">
          Responsible Gaming Reminder: You have been active for {sessionMinutes} minutes. Remember to take regular breaks.
        </div>
      )}

      {/* Notifications Drawer */}
      {showNotifDrawer && (
        <div className="max-w-7xl w-full mx-auto px-4 pt-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-white">
                {lang === 'am' ? 'ማሳወቂያዎች (Notifications)' : 'Account & Game Notifications'}
              </h3>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/wallet', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'mark_notifications_read' }),
                    });
                    fetchProfile();
                  }}
                  className="text-sm sm:text-base font-semibold text-emerald-400 hover:underline"
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotifDrawer(false)}
                  className="text-sm sm:text-base font-semibold text-slate-300 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm sm:text-base text-slate-400">No notifications yet.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80">
                {notifications.map((n) => (
                  <div key={n.id} className="py-3 text-sm sm:text-base space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        {lang === 'am' ? n.titleAm : n.titleEn}
                      </span>
                      <span className="text-xs sm:text-sm font-mono text-slate-400">
                        {formatAddisTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-300">{lang === 'am' ? n.bodyAm : n.bodyEn}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          MAIN CONTENT CONTAINER
         ======================================================================== */}
      <main className="wb-container max-w-6xl w-full mx-auto flex-1 px-4 sm:px-6 pt-5 sm:pt-7 pb-8">
        {/* Prominent Personalized Login Welcome Banner ("እንኳን ደህና መጣችሁ!") */}
        {loginWelcomeBanner && (
          <div className="mb-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-amber-950/80 border-2 border-emerald-400/80 p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-2xl shrink-0">
                🎉
              </div>
              <div>
                <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-300">
                  እንኳን ደህና መጣችሁ, {loginWelcomeBanner.username}!
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5">
                  እንኳን ወደ <span className="text-amber-300">ዊነር ቢንጎ (Winner Bingo)</span> በሰላም መጣችሁ — መልካም እድል ይሁንላችሁ!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => soundFx.playWelcomeGreeting(loginWelcomeBanner.username, true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-300 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition-colors"
              >
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'am' ? 'የሰላምታ ድምፅ ስማ (English)' : 'Hear Welcome Voice (English)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setLoginWelcomeBanner(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-bold transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ====================================================================
            USER NOTIFICATION & DISPLAY ON LOGIN WHEN A GAME MODE IS TURNED OFF
            (Styled with the exact same high prominence & visibility as the Prize Pool / ደራሽ display)
           ==================================================================== */}
        {(!isPracticeModeOpen || !isRealGameModeOpen) && (
          <div className="mb-4 space-y-2.5 w-full mx-auto">
            {!isRealGameModeOpen && (
              <div className="bg-gradient-to-r from-red-950/80 via-slate-900 to-amber-950/80 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl border-2 border-amber-400 shadow-md ring-1 ring-amber-300/40 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shadow shrink-0">
                    <Lock className="w-5 h-5 stroke-[2.5]" />
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-red-500/30 border border-red-400 text-red-200 text-[11px] sm:text-xs font-black uppercase">
                        {lang === 'am' ? '🔒 እውነተኛ ጨዋታ ዝግ ነው' : '🔒 Real Game Closed'}
                      </span>
                      <span className="text-amber-300 text-[11px] sm:text-xs font-bold">
                        {lang === 'am' ? 'የአድሚን ማሳወቂያ' : 'Admin Notice'}
                      </span>
                    </div>
                    <h3 className="font-display text-sm sm:text-base font-bold text-amber-200 leading-snug">
                      {bettingSchedule.realGameOffReason
                        ? lang === 'am'
                          ? `ምክንያት፦ ${bettingSchedule.realGameOffReason}`
                          : `Reason: ${bettingSchedule.realGameOffReason}`
                        : lang === 'am'
                        ? 'የእውነተኛ ገንዘብ ጨዋታ በአድሚኑ ለጊዜው ተዘግቷል'
                        : 'Real Game Mode is temporarily turned off by Admin'}
                    </h3>
                  </div>
                </div>

                <div className="bg-slate-950/90 px-3.5 py-2 rounded-xl border border-amber-400/80 flex flex-col items-center md:items-end justify-center shrink-0 shadow-sm min-w-[140px]">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>{lang === 'am' ? 'ተመልሶ የሚከፈትበት ሰዓት' : 'Resumes At'}</span>
                  </span>
                  <span className="font-mono text-base sm:text-xl font-black text-amber-300 mt-0.5">
                    {bettingSchedule.realGameResumeTime ||
                      formatScheduledGameDate(bettingSchedule.scheduledGameTime) ||
                      (lang === 'am' ? 'በቅርቡ ይከፈታል' : 'Resuming Soon')}
                  </span>
                </div>
              </div>
            )}

            {!isPracticeModeOpen && (
              <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl border-2 border-amber-400 shadow-md ring-1 ring-amber-300/40 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shadow shrink-0">
                    <Lock className="w-5 h-5 stroke-[2.5]" />
                  </span>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/30 border border-amber-400 text-amber-200 text-[11px] sm:text-xs font-black uppercase">
                        {lang === 'am' ? '🔒 የመለማመጃ ጨዋታ ዝግ ነው' : '🔒 Practice Mode Closed'}
                      </span>
                      <span className="text-amber-300 text-[11px] sm:text-xs font-bold">
                        {lang === 'am' ? 'የአድሚን ማሳወቂያ' : 'Admin Notice'}
                      </span>
                    </div>
                    <h3 className="font-display text-sm sm:text-base font-bold text-amber-200 leading-snug">
                      {bettingSchedule.practiceOffReason
                        ? lang === 'am'
                          ? `ምክንያት፦ ${bettingSchedule.practiceOffReason}`
                          : `Reason: ${bettingSchedule.practiceOffReason}`
                        : lang === 'am'
                        ? 'የመለማመጃ ጨዋታ (Practice Mode) በአድሚኑ ለጊዜው ተዘግቷል'
                        : 'Practice Mode is temporarily turned off by Admin'}
                    </h3>
                  </div>
                </div>

                <div className="bg-slate-950/90 px-3.5 py-2 rounded-xl border border-amber-400/80 flex flex-col items-center md:items-end justify-center shrink-0 shadow-sm min-w-[140px]">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>{lang === 'am' ? 'ተመልሶ የሚከፈትበት ሰዓት' : 'Resumes At'}</span>
                  </span>
                  <span className="font-mono text-base sm:text-xl font-black text-amber-300 mt-0.5">
                    {bettingSchedule.practiceResumeTime ||
                      (lang === 'am' ? 'በቅርቡ ይከፈታል' : 'Resuming Soon')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------------
            TAB 1: LOBBY (ROOMS, PRIZE MATH, ODDS, SYNCHRONIZED COUNTDOWNS)
           ---------------------------------------------------------------------- */}
        {activeTab === 'lobby' && (
          <div className="space-y-6 w-full mx-auto">
            <div className="wb-card flex flex-col items-center text-center justify-between gap-4 bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl">
              <div className="space-y-1.5">
                <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-1.5 rounded-2xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-sm sm:text-base font-extrabold shadow-sm">
                  <span>👋 እንኳን ደህና መጣችሁ፣ {user.username}!</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-amber-300">መልካም እድል!</span>
                </div>
                <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-white pt-1">
                  {lang === 'am' ? 'የቀጥታ ቢንጎ መጫወቻ ክፍሎች' : 'Live Multiplayer Bingo Rooms'}
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSoundEnabled(true);
                      soundFx.playWelcomeGreeting(user.username, true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-400/60 text-emerald-300 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition-colors"
                  >
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      {lang === 'am'
                        ? '«እንኳን ደህና መጣችሁ!» ድምፅ ስማ (English Voice)'
                        : 'Play Welcome Voice (English)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSoundEnabled(true);
                      const sampleBall = Math.floor(Math.random() * 75) + 1;
                      soundFx.playBallDraw(sampleBall, true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-amber-400/50 text-amber-300 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition-colors"
                  >
                    <Volume2 className="w-4 h-4 text-amber-400" />
                    <span>
                      {lang === 'am' ? 'የወንድ ድምፅ ቁጥር ጠሪ ሞክር' : 'Test Male Number Caller'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Prominent Centered Online Players + Player Username + Playing Balances Cards in Lobby */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full max-w-4xl mx-auto pt-1">
                <div className="wb-balance-card wb-balance-card-sky">
                  <div className="flex items-center justify-center gap-2 text-sky-300 text-xs sm:text-sm font-bold uppercase tracking-wider">
                    <Users className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>{lang === 'am' ? 'ተጫዋች እና ኦንላይን' : 'Player & Online'}</span>
                  </div>
                  <div className="font-display text-lg sm:text-xl font-extrabold text-white mt-1">
                    {user.username}
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-300 mt-1">
                    ● {onlinePlayersCount} {lang === 'am' ? 'በመስመር ላይ (Online)' : 'Players Online'}
                  </div>
                </div>

                <div className="wb-balance-card wb-balance-card-emerald">
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-300 block">
                    {t.realBalance}
                  </span>
                  <strong className="font-mono text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums mt-1 block">
                    {formatEtb(wallet.balanceMinor, lang)}
                  </strong>
                  <span className="text-xs text-slate-300 mt-1 block">
                    {lang === 'am' ? 'እውነተኛ መጫወቻ እና ወጪ የሚሆን' : 'Real Money Playing Balance'}
                  </span>
                </div>

                <div className="wb-balance-card wb-balance-card-amber">
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-300 block">
                    {t.playBalance}
                  </span>
                  <strong className="font-mono text-2xl sm:text-3xl font-black text-amber-300 tabular-nums mt-1 block">
                    {formatEtb(wallet.playBalanceMinor, lang)}
                  </strong>
                  <span className="text-xs text-slate-300 mt-1 block">
                    {lang === 'am' ? 'ነጻ የልምምድ መጫወቻ ሂሳብ' : 'Practice Mode Balance'}
                  </span>
                </div>
              </div>
            </div>

            {/* Compact Space-Saving Scheduled Game Date/Time & Live Countdown Banner */}
            {isRealGameModeOpen &&
              (bettingSchedule.scheduledGameTime ||
                bettingSchedule.customNoticeAm ||
                bettingSchedule.customNoticeEn) && (
                <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl border-2 shadow-md flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left transition-all bg-gradient-to-r from-indigo-950/80 via-slate-900 to-emerald-950/80 border-emerald-400/80 ring-1 ring-emerald-400/30">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow bg-emerald-400 text-slate-950">
                      <Calendar className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider bg-emerald-500/30 border border-emerald-400 text-emerald-200">
                          {lang === 'am' ? '✅ ውርርድ ክፍት ነው' : '✅ Betting Open'}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-amber-300 text-[11px] sm:text-xs font-bold font-sans">
                          {lang === 'am' ? 'የአድሚን መርሃ-ግብር' : 'Admin Schedule'}
                        </span>
                      </div>

                      <h2 className="font-display text-sm sm:text-base font-bold text-white">
                        {bettingSchedule.scheduledGameTime
                          ? lang === 'am'
                            ? `ቀጣይ የቀጥታ ጨዋታ፦ ${formatScheduledGameDate(bettingSchedule.scheduledGameTime)}`
                            : `Next Live Bingo: ${formatScheduledGameDate(bettingSchedule.scheduledGameTime)}`
                          : lang === 'am'
                          ? 'የቀጥታ ጨዋታ ክፍት ነው'
                          : 'Live games active'}
                      </h2>

                      <p className="text-[11px] sm:text-xs text-slate-300 font-medium line-clamp-1 sm:line-clamp-none">
                        {lang === 'am'
                          ? bettingSchedule.customNoticeAm ||
                            'አሁኑኑ ካርቴላ በመምረጥ ለቀጣዩ ደራሽ ሽልማት ይዘጋጁ!'
                          : bettingSchedule.customNoticeEn ||
                            'Pick your lucky cartela now to compete for the instant prize pool!'}
                      </p>
                    </div>
                  </div>

                  {bettingSchedule.scheduledGameTime &&
                    (() => {
                      const cd = getScheduledCountdownDetails(bettingSchedule.scheduledGameTime);
                      if (!cd) return null;
                      return (
                        <div className="bg-slate-950/90 px-3.5 py-2 rounded-xl border border-amber-400/80 flex flex-col items-center justify-center shrink-0 shadow-sm min-w-[140px]">
                          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-300">
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            <span>
                              {cd.isPast
                                ? lang === 'am'
                                  ? 'ጨዋታው ተጀምሯል'
                                  : 'Game Started'
                                : lang === 'am'
                                ? 'የቀረው ሰዓት'
                                : 'Starts In'}
                            </span>
                          </div>
                          <div className="font-mono text-xl sm:text-2xl font-black text-amber-300 tabular-nums tracking-tight">
                            {cd.isPast ? '00:00' : cd.formattedText}
                          </div>
                          <span className="text-[9px] sm:text-[10px] font-sans text-slate-400">
                            {lang === 'am' ? 'የአዲስ አበባ ሰዓት' : 'Addis Ababa Time'}
                          </span>
                        </div>
                      );
                    })()}
                </div>
              )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mx-auto">
              {roomsList.map((rm) => {
                const rd = rm.activeRound;
                const isDrawing = rd?.status === 'DRAWING';
                const currentPattern = (rd?.winningPattern || rm.pattern || 'ONE_LINE') as BingoPattern;
                return (
                  <div
                    key={rm.id}
                    className="wb-card bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-5 hover:border-emerald-500 transition-colors shadow-xl"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base font-bold text-slate-200">
                        <span className={rm.isPractice ? 'text-amber-300' : 'text-emerald-300'}>
                          {rm.isPractice
                            ? lang === 'am'
                              ? 'ነጻ የልምምድ ክፍል (Play Money)'
                              : 'Practice Mode · Play Money'
                            : lang === 'am'
                            ? 'እውነተኛ ገንዘብ (Real Money ETB)'
                            : 'Real Money Wagering · ETB'}
                        </span>
                        <span className="font-mono tabular-nums text-emerald-400 font-extrabold text-sm sm:text-lg bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-700">
                          {isDrawing
                            ? `${t.drawingLive} (${rd.drawnCount}/75)`
                            : rd
                            ? `${t.startsIn} ${formatCountdown(rd.startsAt)}`
                            : 'Paused'}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                        <div className="space-y-0.5">
                          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
                            {getDisplayRoomName(rm, lang)}
                          </h2>
                          <span className="text-[11px] sm:text-xs font-bold text-emerald-400 block">
                            {rm.isPractice
                              ? (lang === 'am' ? '🎮 ነጻ የልምምድ ክፍለ-ጨዋታ' : '🎮 Free Practice Play')
                              : (lang === 'am' ? '⭐ ዋናው የቀጥታ ቢንጎ ውድድር' : '⭐ Official Main Live Bingo')}
                          </span>
                        </div>
                        <div className="px-4 py-2 rounded-2xl bg-emerald-950 border-2 border-emerald-500 flex flex-col items-center sm:items-end shrink-0 shadow-md">
                          <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                            {lang === 'am' ? '💰 የመወራረጃ ብር (በአድሚን የተወሰነ)' : '💰 Admin Set Bet / Card'}
                          </span>
                          <span className="font-mono text-xl sm:text-2xl font-extrabold text-emerald-400 tabular-nums">
                            {formatEtb(rm.ticketPriceMinor, lang)} / {lang === 'am' ? 'ካርቴላ' : 'card'}
                          </span>
                        </div>
                      </div>

                      {/* Prominent Winning Pattern ("ዝግ") Rule Banner in Lobby */}
                      <div className="p-4 rounded-2xl bg-slate-950 border border-amber-400 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
                        <div>
                          <span className="text-xs uppercase tracking-wider text-amber-300 font-bold block">
                            {lang === 'am' ? 'የዚህ ዙር የማሸነፊያ ህግ (ዝግ)' : 'WINNING PATTERN RULE'}
                          </span>
                          <span className="text-lg sm:text-xl font-extrabold text-amber-300">
                            {getPatternLabel(currentPattern, lang)}
                          </span>
                        </div>
                        <span className="text-xs sm:text-sm text-slate-200 sm:text-right font-medium">
                          {getPatternDescription(currentPattern, lang)}
                        </span>
                      </div>

                      {/* Centered Metadata with · separators */}
                      <div className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5 font-semibold">
                        <span>
                          {lang === 'am' ? 'ሰዓት ቆጣሪ' : 'Countdown'}: {rm.cadenceSeconds}s
                        </span>
                        <span>·</span>
                        <span>
                          {lang === 'am' ? 'ካርቴላ በተጫዋች' : 'Cards/Player'}: {rm.minCardsPerPlayer}–{Math.max(4, rm.maxCardsPerPlayer || 10)}
                        </span>
                        <span>·</span>
                        <span>House Fee: {(rm.houseFeeBps / 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    {rd && (
                      <div className="pt-4 border-t border-slate-800 space-y-2.5 font-mono tabular-nums">
                        {/* Prominent Full-Width Instant Prize (ደራሽ ሽልማት) Hero Box */}
                        <div className="bg-gradient-to-r from-amber-500/40 via-amber-400/25 to-emerald-500/35 px-6 py-5 sm:px-7 sm:py-6 rounded-3xl border-4 border-amber-400 shadow-2xl shadow-amber-500/35 ring-4 ring-amber-300/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                          <div className="flex items-center justify-center sm:justify-start gap-3.5">
                            <span className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shrink-0">
                              <Award className="w-8 h-8 stroke-[2.5]" />
                            </span>
                            <div>
                              <span className="text-amber-200 text-lg sm:text-2xl uppercase tracking-wider font-sans font-black block leading-tight">
                                {lang === 'am' ? '🏆 ደራሽ ሽልማት' : '🏆 Instant Prize (ደራሽ ሽልማት)'}
                              </span>
                              <span className="text-xs sm:text-sm text-emerald-300 font-sans font-extrabold block mt-0.5">
                                {lang === 'am' ? 'ለአሸናፊው ወዲያውኑ የሚከፈል' : 'Paid Instantly to Round Winner'}
                              </span>
                            </div>
                          </div>
                          <span className="text-amber-300 font-black text-3xl sm:text-5xl tracking-tight drop-shadow-[0_4px_14px_rgba(251,191,36,0.6)]">
                            {formatEtb(rd.prizeMinor, lang)}
                          </span>
                        </div>

                        {/* Scheduled Game Time Strip within Room Card (Only when room is open and scheduled time exists) */}
                        {(() => {
                          const isThisRoomOpen = rm.isPractice ? isPracticeModeOpen : isRealGameModeOpen;
                          if (!isThisRoomOpen || !bettingSchedule.scheduledGameTime) {
                            return null;
                          }
                          const scheduledLabel = formatScheduledGameDate(bettingSchedule.scheduledGameTime);
                          return (
                            <div className="px-4 py-3 rounded-2xl border-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left bg-indigo-950/40 border-indigo-500/60">
                              <div className="flex items-center justify-center sm:justify-start gap-2.5">
                                <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500 text-slate-950">
                                  <Calendar className="w-4 h-4 stroke-[2.5]" />
                                </span>
                                <div>
                                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold font-sans flex-wrap">
                                    <span className="text-emerald-300 font-black">
                                      {lang === 'am' ? '✅ ጨዋታው ክፍት ነው' : '✅ Game Mode Open'}
                                    </span>
                                    {scheduledLabel && (
                                      <>
                                        <span className="text-slate-600">·</span>
                                        <span className="text-amber-300 font-extrabold">
                                          {lang === 'am' ? `ቀጣይ ጨዋታ፦ ${scheduledLabel}` : `Next Game: ${scheduledLabel}`}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-300 font-sans block">
                                    {lang === 'am'
                                      ? 'ካርቴላ መምረጥ ይችላሉ'
                                      : 'You can select and lock your cartela now'}
                                  </span>
                                </div>
                              </div>

                              {(() => {
                                const cd = getScheduledCountdownDetails(
                                  bettingSchedule.scheduledGameTime
                                );
                                if (!cd || cd.isPast) return null;
                                return (
                                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-400 font-mono text-xs sm:text-sm font-black text-amber-300 shrink-0 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                                    <span>{cd.formattedText}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-2 gap-2 sm:gap-3 text-center">
                          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                            <span className="text-slate-400 text-xs block font-sans font-semibold">{t.pot}</span>
                            <span className="text-white font-extrabold text-sm sm:text-lg">{formatEtb(rd.potMinor, lang)}</span>
                          </div>
                          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                            <span className="text-slate-400 text-xs block font-sans font-semibold">{t.players} / {t.tickets}</span>
                            <span className="text-white font-extrabold text-sm sm:text-lg">
                              {rd.playerCount} / {rd.ticketCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[220px]">
                        SHA256: {rd?.serverSeedHash?.slice(0, 14)}...
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoomId(rm.id);
                          setActiveTab('game');
                          fetchActiveRoom(rm.id, true);
                        }}
                        className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base sm:text-lg transition-colors whitespace-nowrap shrink-0 shadow-md text-center"
                      >
                        {isDrawing && (!rd?.myTicketCount || rd.myTicketCount === 0)
                          ? lang === 'am'
                            ? 'በተመልካችነት ተከታተል (Spectate)'
                            : 'Watch Live (Spectate)'
                          : !(rm.isPractice ? isPracticeModeOpen : isRealGameModeOpen)
                          ? lang === 'am'
                            ? 'ክፍሉን እይ (ለጊዜው ተዘግቷል)'
                            : 'Enter Room (Mode Turned OFF)'
                          : lang === 'am'
                          ? 'ካርቴላ ምረጥ እና ተጫወት'
                          : 'Select Cartela & Play'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------
            TAB 2: LIVE GAME SCREEN — COMPACT HUD + MODERN TWO-COLUMN LAYOUT
            Left Column: Dedicated 1-75 Master Board
            Right Column: Top = Active Ball Draw, Below = Pre-Game Picker OR Large 5x5 Bingo Card
           ---------------------------------------------------------------------- */}
        {activeTab === 'game' && (
          <div className="space-y-4 w-full mx-auto">
            {/* ==================================================================
                COMPACT CENTERED HEADER & GAME INFO BAR (Rooms, Rules, Pot/Prize, Audio)
               ================================================================== */}
            <div className="wb-card bg-slate-900 border-2 border-slate-800 rounded-2xl px-3.5 sm:px-5 py-3 flex flex-wrap items-center justify-center lg:justify-between gap-3 shadow-lg">
              {/* Left: Room Switcher Pills */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {roomsList.map((rm) => {
                  const displayPriceMinor =
                    selectedRoomId === rm.id && activeRm
                      ? activeRm.ticketPriceMinor
                      : rm.ticketPriceMinor;
                  const isActiveRoom = selectedRoomId === rm.id;
                  return (
                    <button
                      key={rm.id}
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(rm.id);
                        setGameActionMsg(null);
                        fetchActiveRoom(rm.id, true);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap transition-colors flex items-center gap-2 shrink-0 ${
                        isActiveRoom
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-950 text-slate-200 hover:bg-slate-800 border border-slate-700'
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-black">{getDisplayRoomName(rm, lang)}</span>
                      <span
                        className={`font-mono text-xs px-2 py-0.5 rounded-md ${
                          isActiveRoom
                            ? 'bg-slate-950 text-emerald-300'
                            : 'bg-emerald-950 text-emerald-400'
                        }`}
                      >
                        {formatEtb(displayPriceMinor, lang)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Center: Compact Game Rules, Admin Status Banner (Replaces Duplicate Prize Pool), & Players */}
              {activeRm && activeRd && (
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm font-mono tabular-nums text-slate-200">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-400 text-amber-300 font-sans font-extrabold">
                    {lang === 'am' ? 'ህግ (ዝግ): ' : 'Rule: '}
                    {getPatternLabel(
                      (activeRd.winningPattern || activeRm.pattern || 'ONE_LINE') as BingoPattern,
                      lang
                    )}
                  </span>
                  <span className="text-slate-600 hidden sm:inline">·</span>

                  {/* ADMIN SCHEDULE / ANNOUNCEMENT BANNER (Shown when mode is open; when closed, the main top Game Closed card is already displayed) */}
                  {(() => {
                    if (!isCurrentRoomBettingOpen || !isRealGameModeOpen || !isPracticeModeOpen) {
                      return null;
                    }
                    const customAnnouncement =
                      lang === 'am'
                        ? bettingSchedule.customNoticeAm || bettingSchedule.customNoticeEn
                        : bettingSchedule.customNoticeEn || bettingSchedule.customNoticeAm;

                    if (!customAnnouncement && !bettingSchedule.scheduledGameTime) {
                      return null;
                    }

                    return (
                      <>
                        <div className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl border shadow-md flex flex-wrap items-center gap-2 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-emerald-950/90 border-emerald-400/80 ring-1 ring-emerald-400/30 text-emerald-200">
                          <Calendar className="w-4 h-4 text-emerald-400 stroke-[2] shrink-0" />
                          <div className="text-left font-sans">
                            <span className="text-[10px] font-black uppercase tracking-wide text-amber-300 block">
                              {lang === 'am' ? '📢 የአድሚን መርሃ-ግብር' : '📢 Admin Schedule'}
                            </span>
                            <span className="text-[11px] sm:text-xs font-bold text-white block">
                              {customAnnouncement
                                ? customAnnouncement
                                : lang === 'am'
                                ? `ቀጣይ፦ ${formatScheduledGameDate(bettingSchedule.scheduledGameTime)}`
                                : `Next: ${formatScheduledGameDate(bettingSchedule.scheduledGameTime)}`}
                            </span>
                          </div>
                          {bettingSchedule.scheduledGameTime &&
                            (() => {
                              const cd = getScheduledCountdownDetails(
                                bettingSchedule.scheduledGameTime
                              );
                              if (!cd || cd.isPast) return null;
                              return (
                                <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-amber-400 font-mono text-xs sm:text-sm font-black text-amber-300">
                                  ⏳ {cd.formattedText}
                                </span>
                              );
                            })()}
                        </div>
                        <span className="text-slate-600">·</span>
                      </>
                    );
                  })()}
                  <span>
                    <span className="text-slate-400 font-sans">{t.players}: </span>
                    <strong className="text-white font-extrabold">
                      {activeRd.playerCount}/{activeRd.minRequiredPlayers || 2}
                    </strong>
                  </span>
                </div>
              )}

              {/* Right: Compact Phase Status, Online Count & Audio Controls */}
              <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
                <div className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 flex items-center gap-1.5 text-xs sm:text-sm font-mono font-bold text-slate-200">
                  <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-extrabold">{onlinePlayersCount}</span>
                  <span className="hidden sm:inline text-slate-400">
                    {lang === 'am' ? 'ኦንላይን' : 'Online'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    soundFx.unlockAudio();
                    const sampleBall = activeRd?.currentBall || 23;
                    soundFx.playBallDraw(sampleBall, true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-amber-400 text-xs sm:text-sm font-extrabold text-amber-300 hover:bg-slate-800 flex items-center gap-1.5 shrink-0"
                  title="Repeat / Test Voice Caller"
                >
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">
                    {activeRd?.currentBall
                      ? `${getBallLetter(activeRd.currentBall)}-${activeRd.currentBall}`
                      : lang === 'am'
                      ? 'ድምፅ'
                      : 'Voice'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    if (next) {
                      soundFx.unlockAudio();
                      if (activeRd?.currentBall) {
                        soundFx.playBallDraw(activeRd.currentBall, true);
                      }
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm font-extrabold text-slate-200 flex items-center gap-1 shrink-0"
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-500" />
                  )}
                  <span className="hidden md:inline">{soundEnabled ? t.soundOn : t.soundOff}</span>
                </button>
              </div>
            </div>

            {!activeRm || !activeRd ? (
              <div className="wb-card bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                <p className="text-lg sm:text-xl font-semibold text-slate-200">
                  {roomState?.maintenance
                    ? 'Maintenance Mode is active. New rounds are paused while current maintenance completes.'
                    : 'Synchronizing room state...'}
                </p>
              </div>
            ) : (
              <>
                {/* Compact Action Feedback Banner */}
                {gameActionMsg && (
                  <div
                    className={`px-4 py-3 rounded-xl border text-sm sm:text-base font-bold flex items-center justify-between ${
                      gameActionMsg.type === 'success'
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-100'
                        : gameActionMsg.type === 'error'
                        ? 'bg-red-950 border-red-600 text-red-100'
                        : 'bg-slate-900 border-slate-700 text-slate-100'
                    }`}
                  >
                    <span>{gameActionMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setGameActionMsg(null)}
                      className="text-sm font-extrabold underline ml-4 shrink-0"
                    >
                      OK
                    </button>
                  </div>
                )}

                {/* Compact Settled Winner Banner */}
                {activeRd.status === 'SETTLED' && (
                  <div className="bg-emerald-950 border-2 border-emerald-400 rounded-2xl px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center gap-3 min-w-0">
                      <Award className="w-7 h-7 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-display text-base sm:text-lg font-extrabold text-white">
                          {activeRd.didCurrentUserWin
                            ? lang === 'am'
                              ? '🎉 ቢንጎ! እንኳን ደስ አለዎት — እርስዎ አሸንፈዋል!'
                              : '🎉 BINGO! Congratulations — You Won!'
                            : lang === 'am'
                            ? '🎉 ቢንጎ ተገኝቷል — ጨዋታው ቆሟል!'
                            : '🎉 BINGO FOUND — ROUND FINISHED!'}
                        </div>
                        <p className="text-xs sm:text-sm text-emerald-200 font-mono font-bold">
                          {lang === 'am'
                            ? `አሸናፊ: ${(activeRd.winnerUsernames || []).join(', ') || 'ተጫዋች'} · ካርቴላ: ${
                                (activeRd.winningCardIndices || []).map((c: number) => `#${c}`).join(', ') || '-'
                              } · ሽልማት: ${formatEtb(activeRd.prizeMinor, lang)}`
                            : `Winner: ${(activeRd.winnerUsernames || []).join(', ') || 'Player'} · Card: ${
                                (activeRd.winningCardIndices || []).map((c: number) => `#${c}`).join(', ') || '-'
                              } · Prize: ${formatEtb(activeRd.prizeMinor, lang)}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setWinnerPopupData({
                            roundId: activeRd.id,
                            roomNameEn: getDisplayRoomName(activeRm, 'en'),
                            roomNameAm: getDisplayRoomName(activeRm, 'am'),
                            isPractice: Boolean(activeRm?.isPractice),
                            winnerUsernames: activeRd.winnerUsernames || [],
                            winningCardIndices: activeRd.winningCardIndices || [],
                            winningTicketsDetails: activeRd.winningTicketsDetails || [],
                            prizeMinor: activeRd.prizeMinor || 0,
                            potMinor: activeRd.potMinor || 0,
                            winningPattern: activeRd.winningPattern || activeRm?.pattern || 'ONE_LINE',
                            calledNumbers: activeRd.calledNumbers || [],
                            didCurrentUserWin: Boolean(activeRd.didCurrentUserWin),
                            nextRoundOpensAt: activeRd.nextRoundOpensAt || null,
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm whitespace-nowrap"
                      >
                        {lang === 'am' ? '🏆 አሸናፊ ካርቴላ እይ' : '🏆 Winner Card'}
                      </button>
                      {activeRd.nextRoundOpensAt && (
                        <span className="px-3 py-2 rounded-xl bg-slate-950 border border-emerald-500 text-xs sm:text-sm font-mono font-bold text-amber-300 whitespace-nowrap">
                          {lang === 'am'
                            ? `ቀጣይ ዙር: ${formatCountdown(activeRd.nextRoundOpensAt)}`
                            : `Next: ${formatCountdown(activeRd.nextRoundOpensAt)}`}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* ==============================================================
                    TOP FULL-WIDTH SECTION: ACTIVE BALL DRAW & ROUND STATUS HUD
                   ============================================================== */}
                <div className="wb-card bg-slate-900 border-2 border-slate-800 rounded-3xl p-3.5 sm:p-5 shadow-xl w-full mx-auto">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3.5 text-center sm:text-left">
                    {/* Large Current Ball Display + Voice Callout */}
                    <div className="flex flex-col sm:flex-row items-center gap-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (activeRd.currentBall) {
                            soundFx.unlockAudio();
                            soundFx.playBallDraw(activeRd.currentBall, true);
                          }
                        }}
                        title={
                          activeRd.currentBall
                            ? `${getBallLetter(activeRd.currentBall)} ${numberToAmharicWords(activeRd.currentBall)} (${activeRd.currentBall})`
                            : ''
                        }
                        className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex flex-col items-center justify-center font-mono font-black border-2 shrink-0 transition-transform active:scale-95 mx-auto sm:mx-0 ${
                          activeRd.currentBall
                            ? 'bg-amber-400 text-slate-950 border-white shadow-xl cursor-pointer'
                            : activeRd.status === 'OPEN'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-400 shadow-lg'
                            : 'bg-slate-950 text-slate-400 border-slate-700'
                        }`}
                      >
                        {activeRd.currentBall ? (
                          <>
                            <span className="text-xs sm:text-sm leading-none uppercase tracking-widest font-black">
                              {getBallLetter(activeRd.currentBall)}
                            </span>
                            <span className="text-3xl sm:text-4xl leading-none tabular-nums font-black mt-0.5">
                              {activeRd.currentBall}
                            </span>
                          </>
                        ) : activeRd.status === 'OPEN' ? (
                          <>
                            <span className="text-[10px] sm:text-xs uppercase tracking-wider text-emerald-300 font-bold">
                              {lang === 'am' ? 'ይጀምራል' : 'STARTS'}
                            </span>
                            <span className="text-lg sm:text-2xl font-black tabular-nums text-emerald-400 mt-0.5">
                              {formatCountdown(activeRd.startsAt).split(' ')[0]}
                            </span>
                          </>
                        ) : (
                          <span className="text-2xl">--</span>
                        )}
                      </button>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-mono font-extrabold uppercase tracking-wider border ${
                              activeRd.status === 'DRAWING'
                                ? 'bg-slate-950 border-amber-400 text-amber-300'
                                : activeRd.status === 'SETTLED'
                                ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
                                : 'bg-emerald-950 border-emerald-500 text-emerald-300'
                            }`}
                          >
                            {activeRd.status === 'DRAWING'
                              ? lang === 'am'
                                ? `ቀጥታ ጨዋታ · ዙር #${activeRd.id} (እኩል እይታ 50/50)`
                                : `LIVE DRAW · ROUND #${activeRd.id} (50/50 EQUAL VIEW)`
                              : activeRd.status === 'SETTLED'
                              ? lang === 'am'
                                ? `ዙር #${activeRd.id} ተጠናቋል`
                                : `ROUND #${activeRd.id} SETTLED`
                              : lang === 'am'
                              ? `ቅድመ-ጨዋታ · ካርቴላ መምረጫ`
                              : `PRE-GAME · PICK TICKETS`}
                          </span>
                        </div>

                        <div className="text-lg sm:text-2xl font-display font-black text-white">
                          {activeRd.currentBall
                            ? `${getBallLetter(activeRd.currentBall)}-${activeRd.currentBall} · ${numberToAmharicWords(activeRd.currentBall)}`
                            : activeRd.status === 'OPEN'
                            ? `${t.startsIn} ${formatCountdown(activeRd.startsAt)}`
                            : 'Waiting for Draw'}
                        </div>

                        <div className="text-xs sm:text-sm text-slate-300 font-medium">
                          {activeRd.status === 'OPEN' ? (
                            activeRd.playerCount < (activeRd.minRequiredPlayers || 2) ? (
                              <span className="text-amber-300 font-bold">
                                {lang === 'am'
                                  ? `⏳ ቢያንስ ${activeRd.minRequiredPlayers || 2} ተጫዋቾች ሲገቡ ይጀምራል (${activeRd.playerCount}/${activeRd.minRequiredPlayers || 2})`
                                  : `⏳ Waiting for min ${activeRd.minRequiredPlayers || 2} players (${activeRd.playerCount}/${activeRd.minRequiredPlayers || 2})`}
                              </span>
                            ) : (
                              <span className="text-emerald-300 font-bold">
                                {lang === 'am'
                                  ? '✅ ተጫዋቾች ተሟልተዋል! ሰዓቱ 00:00 ሲደርስ በራሱ ይጀምራል'
                                  : '✅ Minimum players ready! Starts automatically at 00:00'}
                              </span>
                            )
                          ) : (
                            <span>
                              {getPatternDescription(
                                (activeRd.winningPattern || activeRm.pattern || 'ONE_LINE') as BingoPattern,
                                lang
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Prominent Instant Prize (ደራሽ ሽልማት) + Last 5 Balls Strip */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 border-t sm:border-t-0 border-slate-800 pt-2.5 sm:pt-0 shrink-0 w-full sm:w-auto justify-center sm:justify-end">
                      <div className="px-6 py-4 sm:px-8 sm:py-5 rounded-3xl bg-gradient-to-br from-amber-500/40 via-emerald-950 to-slate-950 border-4 border-amber-400 shadow-2xl shadow-amber-500/35 ring-4 ring-amber-300/50 flex flex-col items-center sm:items-end justify-center w-full sm:w-auto">
                        <span className="text-base sm:text-xl font-sans font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                          <Award className="w-6 h-6 text-amber-400 stroke-[2.5] shrink-0" />
                          <span>{t.netPrize}</span>
                        </span>
                        <span className="font-mono text-3xl sm:text-5xl font-black text-amber-300 tabular-nums leading-tight drop-shadow-[0_4px_12px_rgba(251,191,36,0.55)]">
                          {formatEtb(activeRd.prizeMinor, lang)}
                        </span>
                      </div>

                      <div className="flex flex-col items-center sm:items-end justify-center shrink-0">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                          {t.last5Balls}
                        </span>
                        <div className="flex items-center justify-center gap-1.5">
                          {(activeRd.last5Balls?.length ? activeRd.last5Balls : [null, null, null, null, null]).map(
                            (b: number | null, idx: number) => (
                              <span
                                key={idx}
                                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl font-mono text-xs sm:text-sm font-black flex items-center justify-center tabular-nums border ${
                                  b
                                    ? idx === 0
                                      ? 'bg-slate-950 border-amber-400 text-amber-300 ring-1 ring-amber-300'
                                      : 'bg-slate-800 border-slate-700 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                              >
                                {b ? `${getBallLetter(b)}${b}` : '--'}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ==============================================================
                    EQUAL 50% / 50% SIDE-BY-SIDE MASTER BOARD (1–75) & SELECTED CARTELA
                   ============================================================== */}
                {activeRd && (
                  <div
                    className={`grid ${
                      showCardSelectionGrid
                        ? 'grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5'
                        : 'grid-cols-2 gap-2 sm:gap-5'
                    } items-start w-full mx-auto`}
                  >
                      {/* ============================================================
                          LEFT COLUMN (50% EQUAL WIDTH & HEIGHT): 1–75 MASTER BOARD
                         ============================================================ */}
                      <div
                        className={`${
                          showCardSelectionGrid ? 'order-2 lg:order-1' : 'order-1'
                        } wb-card bg-slate-900 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-2 sm:p-5 flex flex-col justify-between gap-2 sm:gap-3.5 shadow-2xl w-full h-full mx-auto`}
                      >
                        {/* Top Header & Progress Bar of Master Board */}
                        <div className="space-y-1.5 sm:space-y-2.5">
                          <div className="flex items-center justify-between gap-1 bg-slate-950 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border border-slate-800">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <LayoutGrid className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                              <h2 className="font-display text-xs sm:text-lg font-extrabold text-white truncate">
                                {t.masterBoard} (1–75)
                              </h2>
                            </div>
                            <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl bg-slate-900 border border-slate-700 font-mono text-[11px] sm:text-sm font-extrabold text-amber-400 tabular-nums shrink-0">
                              {activeRd.drawnCount}/75
                            </span>
                          </div>

                          {/* Progress bar for drawn balls */}
                          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.round((activeRd.drawnCount / 75) * 100))}%` }}
                            />
                          </div>
                        </div>

                        {/* 5-Column Vertical B-I-N-G-O Master Grid (15 numbers per column) */}
                        <div className="flex-1 flex flex-col justify-between bg-slate-950 p-1.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-800">
                          <div className="wb-bingo-grid-5 h-full">
                            {[
                              { letter: 'B', start: 1, color: 'text-amber-400 border-amber-400 bg-slate-900' },
                              { letter: 'I', start: 16, color: 'text-emerald-400 border-emerald-400 bg-slate-900' },
                              { letter: 'N', start: 31, color: 'text-amber-300 border-amber-300 bg-slate-900' },
                              { letter: 'G', start: 46, color: 'text-emerald-300 border-emerald-300 bg-slate-900' },
                              { letter: 'O', start: 61, color: 'text-amber-400 border-amber-400 bg-slate-900' },
                            ].map((col) => (
                              <div key={col.letter} className="flex flex-col justify-between gap-1 sm:gap-1.5 h-full">
                                <div
                                  className={`h-7 sm:h-11 rounded-lg sm:rounded-xl border font-display font-black text-xs sm:text-xl flex items-center justify-center text-center shrink-0 ${col.color}`}
                                >
                                  {col.letter}
                                </div>
                                <div className="flex-1 flex flex-col justify-between gap-0.5 sm:gap-1">
                                  {Array.from({ length: 15 }, (_, idx) => {
                                    const num = col.start + idx;
                                    const isCalled = calledSet.has(num);
                                    const isLatest = activeRd.currentBall === num;
                                    return (
                                      <div
                                        key={num}
                                        className={`flex-1 min-h-[20px] sm:min-h-[28px] rounded-md sm:rounded-lg font-mono text-[10px] sm:text-sm tabular-nums flex items-center justify-center text-center select-none transition-all duration-150 ${
                                          isLatest
                                            ? 'bg-amber-400 text-slate-950 font-black ring-1 sm:ring-2 ring-white shadow-lg scale-[1.03]'
                                            : isCalled
                                            ? 'bg-emerald-500 text-slate-950 font-extrabold border border-emerald-300'
                                            : 'bg-slate-900 text-slate-300 border border-slate-800 font-bold'
                                        }`}
                                      >
                                        {num}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Compact Called Numbers History Stream inside Left Master Board Panel */}
                        <div className="pt-1.5 sm:pt-2 border-t border-slate-800 space-y-1 text-center sm:text-left">
                          <div className="flex items-center justify-between text-[10px] sm:text-xs font-mono text-slate-400">
                            <span className="font-bold uppercase tracking-wider truncate">{t.calledSoFar}</span>
                            <span className="shrink-0">{activeRd.drawnCount}/75</span>
                          </div>
                          <div className="flex items-center justify-start gap-1 sm:gap-1.5 overflow-x-auto py-1 min-h-[30px] sm:min-h-[36px]">
                            {activeRd.calledNumbers?.length === 0 ? (
                              <span className="text-[10px] sm:text-xs text-slate-400 font-medium truncate">
                                {lang === 'am'
                                  ? 'ገና ኳስ አልወጣም (00:00 ሲደርስ ይጀምራል)'
                                  : 'Waiting for round start (00:00)...'}
                              </span>
                            ) : (
                              [...activeRd.calledNumbers].reverse().map((num: number, i: number) => (
                                <span
                                  key={`${num}-${i}`}
                                  className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg font-mono text-[10px] sm:text-xs tabular-nums shrink-0 ${
                                    i === 0
                                      ? 'bg-amber-400 text-slate-950 font-black ring-1 ring-white'
                                      : 'bg-slate-800 text-slate-100 font-bold'
                                  }`}
                                >
                                  {getBallLetter(num)}
                                  {num}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ============================================================
                          RIGHT COLUMN (50% EQUAL WIDTH & HEIGHT):
                          - PRE-GAME PHASE: Centered Card Selection Grid (#1 to #120)
                          - ACTIVE GAME PHASE: Equal-Sized 5x5 Selected Cartela(s)
                         ============================================================ */}
                      <div
                        className={`${
                          showCardSelectionGrid ? 'order-1 lg:order-2' : 'order-2'
                        } w-full h-auto self-start mx-auto flex flex-col`}
                      >
                        {showCardSelectionGrid ? (
                          <div className="wb-card bg-slate-900 border-2 border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl w-full h-auto self-start flex flex-col justify-between mx-auto">

                                {/* Pre-Game Card Selection Header (Centered on Mobile) */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                                  <div>
                                    <h3 className="font-display text-lg sm:text-xl font-extrabold text-white">
                                      {replacingCardIndex !== null
                                        ? lang === 'am'
                                          ? `🔄 ካርቴላ #${replacingCardIndex}ን ወደ ሌላ ቁጥር ይቀይሩ (#1–#120)`
                                          : `🔄 Change Cartela #${replacingCardIndex} to Another Number (#1–#120)`
                                        : myHeldTickets.length > 0
                                        ? lang === 'am'
                                          ? `➕ ተጨማሪ ካርቴላ ይምረጡ ወይም የያዙትን ይቀይሩ (#1–#120)`
                                          : `➕ Select Additional Cartela or Change Held Card (#1–#120)`
                                        : lang === 'am'
                                        ? `ካርቴላ ይምረጡ (#1 እስከ #120)`
                                        : `Select Your Bingo Card (#1 to #120)`}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                                      {replacingCardIndex !== null
                                        ? lang === 'am'
                                          ? `ከታች ካሉት ክፍት ቁጥሮች አዲሱን ካርቴላ ይምረጡና «ወደ አዲሱ ካርቴላ ቀይር» የሚለውን ይጫኑ።`
                                          : `Pick any available card number below and tap Confirm Swap to replace Card #${replacingCardIndex}.`
                                        : lang === 'am'
                                        ? 'ጨዋታው እስካልተጀመረ ድረስ የመረጡትን ካርቴላ በማንኛውም ሰዓት መቀየር ይችላሉ።'
                                        : 'You can freely change or swap your selected cartela anytime before the round starts.'}
                                    </p>
                                  </div>

                                  {myHeldTickets.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReplacingCardIndex(null);
                                        setShowOpenPhasePicker(false);
                                      }}
                                      className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm hover:bg-emerald-400 transition-colors"
                                    >
                                      {lang === 'am'
                                        ? `👁 የያዝኩትን 5×5 ካርቴላ አሳይ (${myHeldTickets.length})`
                                        : `👁 View My 5×5 Card (${myHeldTickets.length})`}
                                    </button>
                                  )}
                                </div>

                                {/* Held Cartelas Quick-Change / Cancel Strip (when player already locked 1+ cartelas in OPEN phase) */}
                                {myHeldTickets.length > 0 && (
                                  <div className="bg-slate-950 border border-amber-400/60 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                      <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                                        {lang === 'am' ? 'የያዙት ካርቴላ:' : 'Your Held Card(s):'}
                                      </span>
                                      {myHeldTickets.map((tk: any) => {
                                        const isBeingReplaced = replacingCardIndex === tk.cardIndex;
                                        return (
                                          <div
                                            key={tk.id}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-mono font-extrabold ${
                                              isBeingReplaced
                                                ? 'bg-amber-400 text-slate-950 border-white ring-2 ring-amber-300'
                                                : 'bg-slate-900 text-amber-300 border-amber-400/50'
                                            }`}
                                          >
                                            <span>#{tk.cardIndex}</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setReplacingCardIndex(
                                                  isBeingReplaced ? null : tk.cardIndex
                                                );
                                                clearSelection();
                                              }}
                                              className={`px-2 py-0.5 rounded-lg text-[10px] font-sans font-black transition-colors ${
                                                isBeingReplaced
                                                  ? 'bg-slate-950 text-amber-300'
                                                  : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                                              }`}
                                            >
                                              {isBeingReplaced
                                                ? lang === 'am'
                                                  ? 'በመቀየር ላይ...'
                                                  : 'Swapping...'
                                                : lang === 'am'
                                                ? '🔄 ቀይር'
                                                : '🔄 Change'}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={buyingTickets}
                                              onClick={() => handleCancelHeldTicket(tk.cardIndex)}
                                              title={lang === 'am' ? 'ይህን ካርቴላ ሰርዝ እና ብሩን መልስ' : 'Cancel this card & refund'}
                                              className="px-1.5 py-0.5 rounded-lg bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 text-[10px] font-sans font-black"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {replacingCardIndex !== null && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReplacingCardIndex(null);
                                          clearSelection();
                                        }}
                                        className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                                      >
                                        {lang === 'am' ? '➕ በምትኩ ተጨማሪ ካርቴላ ግዛ' : '➕ Buy Additional Card Instead'}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Quick Multi-Cartela Selection Controls + Legend (Centered) */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                                  <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <span className="text-xs sm:text-sm text-slate-300 font-extrabold">
                                      {lang === 'am' ? 'ፈጣን ምርጫ:' : 'Quick Pick:'}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!isCurrentRoomBettingOpen}
                                      onClick={() => {
                                        if (replacingCardIndex !== null) {
                                          handleQuickSelectCards(1, activeRm.maxCardsPerPlayer, false);
                                        } else {
                                          handleQuickSelectCards(1, activeRm.maxCardsPerPlayer, true);
                                        }
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 border border-emerald-500 text-xs sm:text-sm font-extrabold transition-colors"
                                    >
                                      {lang === 'am' ? '+1 በዘፈቀደ' : '+1 Random'}
                                    </button>
                                    {replacingCardIndex === null && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={!isCurrentRoomBettingOpen}
                                          onClick={() =>
                                            handleQuickSelectCards(2, activeRm.maxCardsPerPlayer, false)
                                          }
                                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-slate-700 text-xs sm:text-sm font-extrabold transition-colors"
                                        >
                                          {lang === 'am' ? '2 ካርቴላ' : '2 Cards'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!isCurrentRoomBettingOpen}
                                          onClick={() =>
                                            handleQuickSelectCards(3, activeRm.maxCardsPerPlayer, false)
                                          }
                                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-slate-700 text-xs sm:text-sm font-extrabold transition-colors"
                                        >
                                          {lang === 'am' ? '3 ካርቴላ' : '3 Cards'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!isCurrentRoomBettingOpen}
                                          onClick={() =>
                                            handleQuickSelectCards(4, activeRm.maxCardsPerPlayer, false)
                                          }
                                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-slate-700 text-xs sm:text-sm font-extrabold transition-colors"
                                        >
                                          {lang === 'am' ? '4 ካርቴላ' : '4 Cards'}
                                        </button>
                                      </>
                                    )}
                                    {selectedCardIndices.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleQuickSelectCards(0, activeRm.maxCardsPerPlayer, false)
                                        }
                                        className="px-3 py-1.5 rounded-xl bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 text-xs sm:text-sm font-extrabold transition-colors"
                                      >
                                        {lang === 'am' ? '✕ አጽዳ' : '✕ Clear'}
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-center gap-3 text-xs font-mono text-slate-300 flex-wrap font-semibold">
                                    <span className="flex items-center gap-1">
                                      <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                                      {lang === 'am' ? 'የተመረጠ' : 'Selected'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
                                      {lang === 'am' ? 'የእርስዎ (ለመቀየር ይንኩ)' : 'Yours (Tap to Change)'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <span className="w-3 h-3 rounded bg-red-600 inline-block" />
                                      {lang === 'am' ? 'ተይዟል' : 'Taken'}
                                    </span>
                                  </div>
                                </div>

                                {/* Centered Card Selection Grid (#1 to #120) */}
                                <div className="wb-card-grid-120 max-h-72 overflow-y-auto p-3 sm:p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                  {effectiveCardPool.map((c: any) => {
                                    const isMine =
                                      activeRd.myPurchasedCardIndices?.includes(c.cardIndex) ||
                                      myHeldTickets.some((t: any) => t.cardIndex === c.cardIndex);
                                    const isBeingReplaced = replacingCardIndex === c.cardIndex;
                                    const isTakenByOther =
                                      !isMine && activeRd.takenCardIndices?.includes(c.cardIndex);
                                    const isSelected = selectedCardIndices.includes(c.cardIndex);

                                    return (
                                      <button
                                        key={c.cardIndex}
                                        type="button"
                                        disabled={isTakenByOther || (!isMine && !isCurrentRoomBettingOpen)}
                                        onClick={() =>
                                          handleSelectCard(c.cardIndex, activeRm.maxCardsPerPlayer)
                                        }
                                        className={`w-full h-11 sm:h-12 rounded-xl font-mono text-xs sm:text-sm font-extrabold transition-all flex flex-col items-center justify-center text-center leading-tight ${
                                          isBeingReplaced
                                            ? 'bg-amber-400 text-slate-950 border-2 border-white ring-2 ring-amber-300 shadow-lg scale-[1.03]'
                                            : isMine
                                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-200 cursor-pointer shadow-sm'
                                            : isTakenByOther
                                            ? 'bg-red-950 border border-red-800 text-red-300 line-through cursor-not-allowed opacity-70'
                                            : !isCurrentRoomBettingOpen
                                            ? 'bg-slate-950/60 border border-slate-800 text-slate-600 cursor-not-allowed opacity-40'
                                            : isSelected
                                            ? 'bg-emerald-500 text-slate-950 border-2 border-white shadow-lg scale-[1.03]'
                                            : 'bg-slate-900 text-slate-100 hover:bg-slate-800 border border-slate-700'
                                        }`}
                                      >
                                        <span>#{c.cardIndex}</span>
                                        {isBeingReplaced ? (
                                          <span className="text-[8px] leading-none mt-0.5 font-black">
                                            {lang === 'am' ? 'ይቀየራል' : 'SWAP'}
                                          </span>
                                        ) : isMine ? (
                                          <span className="text-[8px] leading-none mt-0.5 font-black">
                                            {lang === 'am' ? 'ቀይር ↻' : 'CHANGE'}
                                          </span>
                                        ) : isTakenByOther ? (
                                          <span className="text-[9px] no-underline leading-none mt-0.5">
                                            {lang === 'am' ? 'ተይዟል' : 'TAKEN'}
                                          </span>
                                        ) : isSelected ? (
                                          <span className="text-[10px] leading-none mt-0.5 font-black">✓</span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Live Centered 5x5 Preview of Selected Card(s) + Confirm Purchase / Swap Button */}
                                {selectedCardIndices.length > 0 && (
                                  <div className="space-y-3 pt-1">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-950 px-4 py-3 rounded-xl border border-emerald-500 text-center sm:text-left">
                                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                        <span className="text-xs sm:text-sm font-mono text-emerald-400 font-extrabold">
                                          {replacingCardIndex !== null
                                            ? lang === 'am'
                                              ? `🔄 ካርቴላ #${replacingCardIndex} → ወደ #${selectedCardIndices[0]}:`
                                              : `🔄 Swap #${replacingCardIndex} → #${selectedCardIndices[0]}:`
                                            : lang === 'am'
                                            ? `የተመረጡ (${selectedCardIndices.length}):`
                                            : `Selected (${selectedCardIndices.length}):`}
                                        </span>
                                        {selectedCardIndices.map((idx) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() =>
                                              handleSelectCard(idx, activeRm.maxCardsPerPlayer)
                                            }
                                            className="px-2.5 py-0.5 rounded-lg bg-emerald-950 hover:bg-red-950 border border-emerald-500 text-emerald-100 text-xs sm:text-sm font-mono font-extrabold flex items-center gap-1"
                                          >
                                            <span>#{idx}</span>
                                            <span className="text-red-300">✕</span>
                                          </button>
                                        ))}
                                      </div>
                                      <span className="text-xs sm:text-sm font-mono text-amber-300 font-extrabold">
                                        {replacingCardIndex !== null
                                          ? lang === 'am'
                                            ? 'ነፃ ቅያሪ (ክፍያው ተከፍሏል)'
                                            : 'Free Swap (Already Paid)'
                                          : `${selectedCardIndices.length} × ${formatEtb(activeRm.ticketPriceMinor, lang)} = ${formatEtb(selectedCardIndices.length * activeRm.ticketPriceMinor, lang)}`}
                                      </span>
                                    </div>

                                    <div
                                      className={
                                        selectedCardIndices.length > 1
                                          ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto mx-auto w-full'
                                          : 'max-w-[340px] mx-auto w-full'
                                      }
                                    >
                                      {selectedCardIndices.map((cardIdx) => {
                                        const previewObj = effectiveCardPool.find(
                                          (c: any) => c.cardIndex === cardIdx
                                        );
                                        const grid: BingoCardGrid | null = previewObj?.grid || null;
                                        if (!grid) return null;
                                        return (
                                          <div
                                            key={cardIdx}
                                            className="bg-slate-950 p-3 rounded-2xl border border-slate-700 space-y-2 mx-auto w-full"
                                          >
                                            <div className="flex items-center justify-between text-xs sm:text-sm font-mono text-emerald-300 font-extrabold">
                                              <span>Cartela #{cardIdx}</span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleSelectCard(cardIdx, activeRm.maxCardsPerPlayer)
                                                }
                                                className="text-red-400 hover:text-red-300 font-bold"
                                              >
                                                {lang === 'am' ? '✕ ቀይር / አውጣ' : '✕ Change / Remove'}
                                              </button>
                                            </div>
                                            <div className="wb-cartela-5x5-grid">
                                              {['B', 'I', 'N', 'G', 'O'].map((l) => (
                                                <div
                                                  key={l}
                                                  className="h-7 sm:h-8 rounded-lg bg-slate-900 border border-amber-400 text-amber-400 font-display font-black text-xs sm:text-sm flex items-center justify-center text-center"
                                                >
                                                  {l}
                                                </div>
                                              ))}
                                              {grid.map((row, rIdx) =>
                                                row.map((val, cIdx) => (
                                                  <div
                                                    key={`${rIdx}-${cIdx}`}
                                                    className={`wb-cartela-cell rounded-lg font-mono text-xs sm:text-base font-black border text-center ${
                                                      rIdx === 2 && cIdx === 2
                                                        ? 'bg-slate-900 border-amber-400 text-amber-300'
                                                        : 'bg-slate-900 border-slate-800 text-white'
                                                    }`}
                                                  >
                                                    {rIdx === 2 && cIdx === 2 ? 'FREE' : val}
                                                  </div>
                                                ))
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  disabled={
                                    buyingTickets ||
                                    selectedCardIndices.length === 0 ||
                                    (replacingCardIndex === null && !isCurrentRoomBettingOpen)
                                  }
                                  onClick={() => {
                                    if (replacingCardIndex !== null && selectedCardIndices.length > 0) {
                                      void handleChangeHeldTicket(replacingCardIndex, selectedCardIndices[0]);
                                    } else {
                                      void handleBuyTickets();
                                    }
                                  }}
                                  className={`w-full min-h-[54px] px-4 py-3 rounded-2xl disabled:opacity-50 text-slate-950 font-extrabold text-sm sm:text-lg transition-all flex items-center justify-center text-center gap-2 shadow-lg ${
                                    !isCurrentRoomBettingOpen && replacingCardIndex === null
                                      ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                                      : replacingCardIndex !== null
                                      ? 'bg-amber-400 hover:bg-amber-300'
                                      : 'bg-emerald-500 hover:bg-emerald-400'
                                  }`}
                                >
                                  <span>
                                    {buyingTickets
                                      ? lang === 'am'
                                        ? 'ካርቴላዎ በመመዝገብ ላይ...'
                                        : 'Updating Your Bingo Card...'
                                      : !isCurrentRoomBettingOpen && replacingCardIndex === null
                                      ? activeRm.isPractice
                                        ? lang === 'am'
                                          ? `🔒 የመለማመጃ ጨዋታ ዝግ ነው (${bettingSchedule.practiceOffReason || 'በአድሚን የተዘጋ'}${bettingSchedule.practiceResumeTime ? ` · ይከፈታል፦ ${bettingSchedule.practiceResumeTime}` : ''})`
                                          : `🔒 Practice Mode is OFF (${bettingSchedule.practiceOffReason || 'Closed by Admin'}${bettingSchedule.practiceResumeTime ? ` · Resumes: ${bettingSchedule.practiceResumeTime}` : ''})`
                                        : lang === 'am'
                                        ? `🔒 የእውነተኛ ጨዋታ ዝግ ነው (${bettingSchedule.realGameOffReason || 'ውርርድ ተዘግቷል'} · ይከፈታል፦ ${bettingSchedule.realGameResumeTime || formatScheduledGameDate(bettingSchedule.scheduledGameTime) || 'በተያዘው ሰዓት'})`
                                        : `🔒 Real Game Mode is OFF (${bettingSchedule.realGameOffReason || 'Betting Closed'} · Resumes: ${bettingSchedule.realGameResumeTime || formatScheduledGameDate(bettingSchedule.scheduledGameTime) || 'at scheduled time'})`
                                      : replacingCardIndex !== null && selectedCardIndices.length > 0
                                      ? lang === 'am'
                                        ? `🔄 ካርቴላ #${replacingCardIndex}ን ወደ ካርቴላ #${selectedCardIndices[0]} ቀይር`
                                        : `🔄 Confirm Swap: Change Card #${replacingCardIndex} → #${selectedCardIndices[0]}`
                                      : selectedCardIndices.length > 0
                                      ? lang === 'am'
                                        ? `✅ የተመረጠውን ካርቴላ አረጋግጥ እና ተጫወት (${selectedCardIndices.length} × ${formatEtb(activeRm.ticketPriceMinor, lang)} = ${formatEtb(selectedCardIndices.length * activeRm.ticketPriceMinor, lang)})`
                                        : `✅ Confirm & Lock Selected Card(s) (${selectedCardIndices.length} × ${formatEtb(activeRm.ticketPriceMinor, lang)} = ${formatEtb(selectedCardIndices.length * activeRm.ticketPriceMinor, lang)})`
                                      : replacingCardIndex !== null
                                      ? lang === 'am'
                                        ? `ካርቴላ #${replacingCardIndex}ን ለመቀየር ከላይ አዲስ ቁጥር ይምረጡ`
                                        : `Select a New Card Number Above to Replace #${replacingCardIndex}`
                                      : lang === 'am'
                                      ? 'ከላይ ከ #1–#120 ውስጥ ካርቴላ ይምረጡ'
                                      : 'Select a Card Number (#1–#120) Above to Play'}
                                  </span>
                                </button>
                              </div>
                            ) : (
                            /* ========================================================
                               ACTIVE GAME PHASE (OR LOCKED TICKET VIEW):
                               Renders the Selected 5x5 Cartela Equally (50% Width)
                               Next to the 1–75 Master Board
                               ======================================================== */
                            <div className="wb-card wb-cartela-panel bg-slate-900 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-2 sm:p-4 gap-2 sm:gap-3 shadow-2xl w-full h-auto self-start mx-auto">
                              {/* Top Control Bar of the Active 5x5 Bingo Card Panel */}
                              <div className="w-full flex flex-wrap items-center justify-between gap-1.5 bg-slate-950 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border border-slate-800">
                                <div className="flex items-center gap-1 sm:gap-2 flex-wrap min-w-0">
                                  {myHeldTickets.length > 0 ? (
                                    <>
                                      <span className="text-xs sm:text-base font-extrabold text-emerald-400 truncate">
                                        {lang === 'am'
                                          ? `ካርቴላ (${myHeldTickets.length}):`
                                          : `${t.myCartelas} (${myHeldTickets.length}):`}
                                      </span>
                                      {myHeldTickets.map((tk: any, idx: number) => (
                                        <button
                                          key={tk.id}
                                          type="button"
                                          onClick={() => {
                                            setActiveHeldCardTab(idx);
                                            setShowAllHeldCards(false);
                                          }}
                                          className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-mono font-black transition-all ${
                                            !showAllHeldCards && activeHeldCardTab === idx
                                              ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                                              : 'bg-slate-900 border border-slate-700 text-slate-200 hover:border-amber-400'
                                          }`}
                                        >
                                          #{tk.cardIndex}
                                        </button>
                                      ))}
                                    </>
                                  ) : (
                                    <span className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg bg-slate-900 border border-amber-400 text-amber-300 text-[10px] sm:text-xs font-extrabold truncate">
                                      {lang === 'am'
                                        ? `👁 ተመልካች · ካርቴላ #${fallbackPreviewIdx}`
                                        : `👁 Spectator · Card #${fallbackPreviewIdx}`}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                  {myHeldTickets.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setShowAllHeldCards((prev) => !prev)}
                                      className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] sm:text-xs font-extrabold text-slate-100 border border-slate-700"
                                    >
                                      {showAllHeldCards
                                        ? lang === 'am'
                                          ? '1x ትልቅ'
                                          : '1x Large'
                                        : lang === 'am'
                                        ? `ሁሉንም (${myHeldTickets.length})`
                                        : `All (${myHeldTickets.length})`}
                                    </button>
                                  )}

                                  {/* Allow players to change or add cartelas anytime while round is OPEN (before game starts) */}
                                  {isPreGamePhase && activeFocusedTicket && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReplacingCardIndex(activeFocusedTicket.cardIndex);
                                        clearSelection();
                                        setShowOpenPhasePicker(true);
                                      }}
                                      className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] sm:text-xs font-extrabold shadow-sm transition-colors"
                                    >
                                      {lang === 'am'
                                        ? `🔄 ካርቴላ #${activeFocusedTicket.cardIndex} ቀይር`
                                        : `🔄 Change Card #${activeFocusedTicket.cardIndex}`}
                                    </button>
                                  )}

                                  {canBuyMoreInOpen && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReplacingCardIndex(null);
                                        setShowOpenPhasePicker(true);
                                      }}
                                      className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-400 text-emerald-300 text-[10px] sm:text-xs font-extrabold"
                                    >
                                      {lang === 'am' ? '➕ ጨምር' : '➕ Add'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* COMPACT SQUARE 5x5 BINGO CARD(S) (height: auto, align-self: flex-start) */}
                              <div
                                className={`h-auto self-start mx-auto ${
                                  ticketsToDisplay.length > 1
                                    ? 'grid grid-cols-1 xl:grid-cols-2 gap-2.5 sm:gap-3.5 w-full'
                                    : 'w-full max-w-[360px]'
                                }`}
                              >
                                {ticketsToDisplay.map((currentTicket: any) => {
                                  const grid: BingoCardGrid = currentTicket.cardGrid;
                                  const claimInfo = validateClaim(
                                    grid,
                                    activeRd.calledNumbers || [],
                                    roundPattern
                                  );
                                  const winningCoordSet = new Set(
                                    claimInfo.winningCells.map(([r, c]) => `${r}-${c}`)
                                  );
                                  const isSingleLarge = ticketsToDisplay.length === 1;

                                  // Count total matched numbers on this 5x5 card
                                  let matchedNumbersCount = 0;
                                  grid.forEach((row, rIdx) =>
                                    row.forEach((val, cIdx) => {
                                      if ((rIdx === 2 && cIdx === 2) || calledSet.has(val)) {
                                        matchedNumbersCount += 1;
                                      }
                                    })
                                  );

                                  return (
                                    <div
                                      key={currentTicket.id}
                                      className="bg-slate-950 border border-slate-800 rounded-xl sm:rounded-2xl p-2 sm:p-3 space-y-2 sm:space-y-2.5 w-full h-auto self-start mx-auto"
                                    >
                                      {/* Card Title & Match Counter Bar */}
                                      <div className="flex flex-wrap items-center justify-between gap-1 bg-slate-900 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl border border-slate-800">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-display text-xs sm:text-base font-black text-amber-400 tracking-tight">
                                            {lang === 'am'
                                              ? `ካርቴላ #${currentTicket.cardIndex}`
                                              : `CARD #${currentTicket.cardIndex}`}
                                          </span>
                                          {claimInfo.fourCornersCompleted && (
                                            <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-sans text-[9px] sm:text-xs font-black">
                                              {lang === 'am' ? '★ 4 ማዕዘን!' : '★ 4 CORNERS!'}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-xs font-extrabold flex-wrap">
                                          <span className="text-emerald-400">
                                            {lang === 'am'
                                              ? `የወጡ: ${matchedNumbersCount}/25`
                                              : `${matchedNumbersCount}/25`}
                                          </span>
                                          <span className="text-slate-600">·</span>
                                          <span
                                            className={
                                              claimInfo.valid ? 'text-amber-300 font-black' : 'text-slate-300'
                                            }
                                          >
                                            {lang === 'am'
                                              ? `ዝግ: ${claimInfo.completedLinesCount}/${claimInfo.requiredLinesCount}`
                                              : `Lines: ${claimInfo.completedLinesCount}/${claimInfo.requiredLinesCount}`}
                                          </span>
                                        </div>
                                      </div>

                                      {/* B - I - N - G - O Column Headers + 25 Perfect 1:1 Square Cells */}
                                      <div className="space-y-1.5 sm:space-y-2 h-auto self-start w-full">
                                        <div className="wb-cartela-5x5-grid">
                                          {[
                                            { letter: 'B', cls: 'text-amber-400 border-amber-400 bg-slate-900' },
                                            { letter: 'I', cls: 'text-emerald-400 border-emerald-400 bg-slate-900' },
                                            { letter: 'N', cls: 'text-amber-300 border-amber-300 bg-slate-900' },
                                            { letter: 'G', cls: 'text-emerald-300 border-emerald-300 bg-slate-900' },
                                            { letter: 'O', cls: 'text-amber-400 border-amber-400 bg-slate-900' },
                                          ].map((col) => (
                                            <div
                                              key={col.letter}
                                              className={`h-7 sm:h-9 rounded-lg sm:rounded-xl border font-display font-black tracking-wider flex items-center justify-center text-center text-xs sm:text-lg ${col.cls}`}
                                            >
                                              {col.letter}
                                            </div>
                                          ))}
                                        </div>

                                        {/* 25 Perfect 1:1 Square Cells (aspect-ratio: 1 / 1, height: auto) */}
                                        <div className="wb-cartela-5x5-grid">
                                          {grid.map((row, rIdx) =>
                                            row.map((cellVal, cIdx) => {
                                              const isFree = rIdx === 2 && cIdx === 2;
                                              const isCornerCell =
                                                (rIdx === 0 || rIdx === 4) && (cIdx === 0 || cIdx === 4);
                                              const isCalled = isFree || calledSet.has(cellVal);
                                              const isLatest = activeRd.currentBall === cellVal;
                                              const isWinningCell = winningCoordSet.has(`${rIdx}-${cIdx}`);
                                              const isCompletedCorner =
                                                isCornerCell && claimInfo.fourCornersCompleted;

                                              return (
                                                <div
                                                  key={`${rIdx}-${cIdx}`}
                                                  className={`wb-cartela-cell relative rounded-lg sm:rounded-xl font-mono tabular-nums select-none border sm:border-2 transition-all duration-150 ${
                                                    isLatest
                                                      ? 'bg-amber-400 text-slate-950 border-white font-black ring-2 sm:ring-4 ring-amber-300 shadow-xl scale-[1.03]'
                                                      : isCompletedCorner
                                                      ? 'bg-amber-400 text-slate-950 border-white font-black ring-2 sm:ring-4 ring-amber-300 shadow-xl scale-[1.02]'
                                                      : isWinningCell
                                                      ? 'bg-amber-400 text-slate-950 border-white font-black ring-1 sm:ring-2 ring-amber-200 shadow-lg'
                                                      : isCalled
                                                      ? 'bg-emerald-500 text-slate-950 border-emerald-200 font-black shadow-md'
                                                      : isCornerCell
                                                      ? 'bg-slate-900 text-white border-amber-500 font-black'
                                                      : 'bg-slate-900 text-white border-slate-700 font-black'
                                                  }`}
                                                >
                                                  <span
                                                    className={`leading-none tracking-tight ${
                                                      isFree
                                                        ? isSingleLarge
                                                          ? 'text-[10px] sm:text-sm font-black'
                                                          : 'text-[9px] sm:text-xs font-black'
                                                        : isSingleLarge
                                                        ? 'text-xs sm:text-xl font-black'
                                                        : 'text-[11px] sm:text-lg font-black'
                                                    }`}
                                                  >
                                                    {isFree ? 'FREE' : cellVal}
                                                  </span>
                                                  {isCalled ? (
                                                    <span className="text-[7px] sm:text-[10px] leading-none mt-0.5 font-black">
                                                      {isLatest
                                                        ? '★'
                                                        : isCompletedCorner
                                                        ? '★'
                                                        : isCornerCell
                                                        ? '◆✓'
                                                        : '✓'}
                                                    </span>
                                                  ) : isCornerCell ? (
                                                    <span className="text-[6px] sm:text-[9px] leading-none mt-0.5 text-amber-400 font-bold">
                                                      {lang === 'am' ? 'ማዕዘን' : 'CORNER'}
                                                    </span>
                                                  ) : null}
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Prominent Centered BINGO Claim Bar Directly Below the Compact Square 5x5 Card */}
                              <div className="w-full pt-1.5 sm:pt-2 flex flex-col items-center justify-center gap-1.5 border-t border-slate-800 text-center">
                                <button
                                  type="button"
                                  disabled={
                                    claimingBingo ||
                                    activeRd.status !== 'DRAWING' ||
                                    activeRd.isSpectator ||
                                    !myHeldTickets.length
                                  }
                                  onClick={handleClaimBingo}
                                  className={`w-full max-w-[360px] h-10 sm:h-12 px-4 sm:px-6 rounded-xl sm:rounded-2xl font-display font-black text-xs sm:text-lg tracking-wide transition-transform active:scale-[0.98] flex items-center justify-center gap-1.5 sm:gap-2 mx-auto ${
                                    hasValidBingoOnMyCards
                                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-xl ring-2 ring-white'
                                      : 'bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 shadow-lg'
                                  }`}
                                >
                                  <Award className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                                  <span className="truncate">{t.claimBingo}</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                {/* Recent Settled Rounds in this Room (with Revealed Server Seed & Winner Popup Button) */}
                {roomState.recentRounds?.length > 0 && (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                    <h4 className="text-base sm:text-lg font-extrabold text-slate-100">
                      {lang === 'am'
                        ? 'የቅርብ ጊዜ የተጠናቀቁ ዙሮች (ከተገለጠ Server Seed እና የአሸናፊ ዝርዝር ጋር)'
                        : 'Recent Completed Rounds in This Room (Winners & Provably Fair Seeds)'}
                    </h4>
                    <div className="divide-y divide-slate-800/80 text-sm sm:text-base">
                      {roomState.recentRounds.slice(0, 3).map((r: any) => (
                        <div
                          key={r.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono"
                        >
                          <div>
                            <span className="text-white font-extrabold">Round #{r.id}</span> ·{' '}
                            <span className={r.status === 'SETTLED' ? 'text-emerald-400 font-extrabold' : 'text-amber-400 font-bold'}>
                              {r.status}
                            </span>{' '}
                            · {lang === 'am' ? 'ሽልማት' : 'Prize'}:{' '}
                            <strong className="text-emerald-400">{formatEtb(r.prizeMinor, lang)}</strong> ·{' '}
                            {r.winnerUsernames?.length > 0
                              ? `${lang === 'am' ? 'አሸናፊ' : 'Winner'}: ${r.winnerUsernames.join(', ')} (${
                                  (r.winningCardIndices || []).map((c: number) => `#${c}`).join(', ') || '-'
                                })`
                              : r.cancelReason || 'No winner'}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {r.status === 'SETTLED' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setWinnerPopupData({
                                    roundId: r.id,
                                    roomNameEn: getDisplayRoomName(activeRm, 'en'),
                                    roomNameAm: getDisplayRoomName(activeRm, 'am'),
                                    isPractice: Boolean(activeRm?.isPractice),
                                    winnerUsernames: r.winnerUsernames || [],
                                    winningCardIndices: r.winningCardIndices || [],
                                    winningTicketsDetails: r.winningTicketsDetails || [],
                                    prizeMinor: r.prizeMinor || 0,
                                    potMinor: r.potMinor || 0,
                                    winningPattern: r.winningPattern || activeRm?.pattern || 'ONE_LINE',
                                    calledNumbers: r.drawnNumbers || [],
                                    didCurrentUserWin: Boolean(r.didCurrentUserWin),
                                    nextRoundOpensAt: null,
                                  })
                                }
                                className="px-3 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-300 font-bold text-xs sm:text-sm"
                              >
                                {lang === 'am' ? '🏆 አሸናፊ እይ' : '🏆 Winner Info'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setVerifySeedInput(r.serverSeed || '');
                                setVerifyHashInput(r.serverSeedHash || '');
                                setVerifyRoundIdInput(String(r.id));
                                setActiveTab('history');
                              }}
                              className="text-emerald-400 hover:underline font-extrabold text-left sm:text-right"
                            >
                              Verify Seed →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------------
            TAB 3: WALLET (DEPOSIT / WITHDRAWAL / APPEND-ONLY LEDGER)
           ---------------------------------------------------------------------- */}
        {activeTab === 'wallet' && (
          <div className="space-y-6 w-full max-w-5xl mx-auto">
            {/* High-Contrast Centered Balance Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 w-full mx-auto">
              <div className="wb-balance-card wb-balance-card-emerald">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-emerald-300 block">
                  {t.realBalance}
                </span>
                <span className="font-mono text-3xl sm:text-4xl font-black text-emerald-400 tabular-nums mt-1.5 block">
                  {formatEtb(wallet.balanceMinor, lang)}
                </span>
                <span className="text-xs sm:text-sm text-slate-300 mt-1.5 block">
                  {lang === 'am'
                    ? 'ለእውነተኛ ጨዋታ እና ወጪ የሚሆን ሂሳብ'
                    : 'Available for real-money tickets & withdrawals'}
                </span>
              </div>

              <div className="wb-balance-card wb-balance-card-amber">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-300 block">
                  {t.lockedBalance}
                </span>
                <span className="font-mono text-3xl sm:text-4xl font-black text-amber-400 tabular-nums mt-1.5 block">
                  {formatEtb(wallet.lockedMinor, lang)}
                </span>
                <span className="text-xs sm:text-sm text-slate-300 mt-1.5 block">
                  {lang === 'am'
                    ? 'የአድሚን ወጪ ማጽደቂያ በመጠበቅ ላይ ያለ'
                    : 'Held in escrow awaiting Admin withdrawal approval'}
                </span>
              </div>

              <div className="wb-balance-card wb-balance-card-sky">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-sky-300 block">
                  {t.playBalance}
                </span>
                <span className="font-mono text-3xl sm:text-4xl font-black text-white tabular-nums mt-1.5 block">
                  {formatEtb(wallet.playBalanceMinor, lang)}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/wallet', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'topup_practice' }),
                    });
                    fetchWalletDetails();
                    fetchProfile();
                  }}
                  className="mt-3 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm text-emerald-400 font-extrabold mx-auto border border-emerald-500/50 transition-colors"
                >
                  +1,000.00 Free Play Birr
                </button>
              </div>
            </div>

            {walletMsg && (
              <>
                {/* Fixed Floating Notification Banner visible on both Mobile & Desktop regardless of scroll position */}
                <div
                  role="status"
                  aria-live="polite"
                  className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[94vw] max-w-lg p-4 rounded-2xl border-2 shadow-2xl flex items-start justify-between gap-3 ${
                    walletMsg.type === 'success'
                      ? 'bg-emerald-950 border-emerald-400 text-emerald-100'
                      : 'bg-red-950 border-red-500 text-red-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {walletMsg.type === 'success' ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 text-left">
                      <div className="font-extrabold text-sm sm:text-base">
                        {walletMsg.type === 'success'
                          ? lang === 'am'
                            ? '✅ ወደ አድሚን ተልኳል! (Sent to Admin)'
                            : '✅ Sent to Admin!'
                          : lang === 'am'
                            ? '⚠️ ማሳሰቢያ (Notice)'
                            : '⚠️ Notice'}
                      </div>
                      <p className="text-xs sm:text-sm font-semibold leading-relaxed">
                        {walletMsg.text}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalletMsg(null)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-extrabold text-white shrink-0"
                  >
                    {lang === 'am' ? 'እሺ (OK)' : 'OK'}
                  </button>
                </div>

                {/* Standard Top Banner */}
                <div
                  className={`p-4 rounded-2xl border-2 text-sm sm:text-base font-bold text-center max-w-3xl mx-auto ${
                    walletMsg.type === 'success'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                      : 'bg-red-950 border-red-600 text-red-200'
                  }`}
                >
                  {walletMsg.text}
                </div>
              </>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full mx-auto">
              {/* Centered Deposit Request Form with Official Telebirr & CBE Accounts + Centered Screenshot Upload */}
              <form
                onSubmit={handleRequestDeposit}
                className="wb-deposit-form bg-slate-900 border-2 border-emerald-500 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl"
              >
                <div className="text-center space-y-1.5">
                  <h2 className="font-display text-xl sm:text-2xl font-extrabold text-white">
                    {lang === 'am' ? 'ብር ገቢ ማድረጊያ (Deposit with Screenshot)' : t.depositTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg mx-auto">
                    {lang === 'am'
                      ? 'ከታች በተቀመጡት የቴሌብር ወይም የኢትዮጵያ ንግድ ባንክ (CBE) አካውንቶች ብር ገቢ ካደረጉ በኋላ፣ ደረሰኙን (Screenshot) መርጠው ወደ አድሚን ይላኩ።'
                      : 'Transfer funds to our official Telebirr or CBE account below, then attach your payment screenshot and send it to the Admin for approval.'}
                  </p>
                </div>

                {/* Official Deposit Accounts Banner (Telebirr: 0915306343 | CBE: 1000389879928) */}
                <div className="rounded-2xl bg-slate-950 border border-emerald-500 p-4 space-y-3">
                  <div className="text-xs sm:text-sm font-extrabold text-emerald-400 uppercase tracking-wider text-center">
                    {lang === 'am'
                      ? 'ብር ገቢ የሚደረግባቸው አካውንቶች (Official Deposit Accounts)'
                      : 'Official Deposit Accounts'}
                  </div>

                  {/* Telebirr Account */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center sm:text-left">
                    <div>
                      <span className="text-xs sm:text-sm text-slate-300 block font-semibold">
                        {lang === 'am' ? 'የቴሌብር አካውንት (Telebirr)' : 'Telebirr Account'}
                      </span>
                      <span className="font-mono text-lg sm:text-xl font-extrabold text-amber-300 tracking-wide">
                        0915306343
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('0915306343');
                        setDepProvider('TELEBIRR');
                        setWalletMsg({
                          type: 'success',
                          text:
                            lang === 'am'
                              ? 'የቴሌብር ቁጥር (0915306343) ተቀድቷል (Copied)!'
                              : 'Telebirr number (0915306343) copied!',
                        });
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 text-xs sm:text-sm font-extrabold shrink-0"
                    >
                      {lang === 'am' ? 'ቁጥሩን ቅዳ (Copy)' : 'Copy'}
                    </button>
                  </div>

                  {/* CBE Account */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center sm:text-left">
                    <div>
                      <span className="text-xs sm:text-sm text-slate-300 block font-semibold">
                        {lang === 'am'
                          ? 'የኢትዮጵያ ንግድ ባንክ (CBE Account)'
                          : 'Commercial Bank of Ethiopia (CBE)'}
                      </span>
                      <span className="font-mono text-lg sm:text-xl font-extrabold text-amber-300 tracking-wide">
                        1000389879928
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('1000389879928');
                        setDepProvider('CBE_BIRR');
                        setWalletMsg({
                          type: 'success',
                          text:
                            lang === 'am'
                              ? 'የንግድ ባንክ (CBE) አካውንት ቁጥር (1000389879928) ተቀድቷል (Copied)!'
                              : 'CBE account (1000389879928) copied!',
                        });
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-300 text-xs sm:text-sm font-extrabold shrink-0"
                    >
                      {lang === 'am' ? 'ቁጥሩን ቅዳ (Copy)' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="text-center sm:text-left">
                    <label className="block text-sm font-bold text-slate-200 mb-1.5">
                      {lang === 'am' ? 'ገቢ ያደረጉበት መንገድ (Method)' : 'Payment Method'}
                    </label>
                    <select
                      value={depProvider}
                      onChange={(e) => setDepProvider(e.target.value as any)}
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white text-center sm:text-left font-semibold"
                    >
                      <option value="TELEBIRR">ቴሌብር (Telebirr — 0915306343)</option>
                      <option value="CBE_BIRR">ንግድ ባንክ (CBE — 1000389879928)</option>
                      <option value="CHAPA">Chapa (ቻፓ)</option>
                    </select>
                  </div>
                  <div className="text-center sm:text-left">
                    <label className="block text-sm font-bold text-slate-200 mb-1.5">
                      {lang === 'am' ? 'የገቢ መጠን በብር (Amount in Birr)' : 'Amount (Birr)'}
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="100000"
                      step="1"
                      required
                      value={depAmountBirr}
                      onChange={(e) => setDepAmountBirr(e.target.value)}
                      className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-base text-white font-mono font-bold text-center sm:text-left"
                    />
                  </div>
                </div>

                {/* Centered & Spacious Screenshot Upload Box */}
                <div className="wb-upload-box">
                  <label className="block text-sm sm:text-base font-extrabold text-amber-300 text-center">
                    {lang === 'am'
                      ? '📸 ብር ገቢ ያደረጉበትን ደረሰኝ (Screenshot) እዚህ ያያይዙ፦'
                      : '📸 Attach Payment Receipt Screenshot:'}
                  </label>
                  <p className="text-xs text-slate-400 text-center max-w-md mx-auto">
                    {lang === 'am'
                      ? 'የከፈሉበትን የቴሌብር ወይም የባንክ ደረሰኝ ምስል ይምረጡ (Choose file)'
                      : 'Select your Telebirr or bank transfer receipt screenshot image below'}
                  </p>
                  <input
                    ref={proofFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProofFileChange}
                    className="wb-file-input"
                  />
                  {processingProofImage && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-amber-400/60 text-amber-300 text-xs sm:text-sm font-bold text-center">
                      {lang === 'am'
                        ? '⏳ የScreenshot ምስሉ በመዘጋጀት ላይ ነው...'
                        : '⏳ Processing screenshot image...'}
                    </div>
                  )}
                  {depProofDataUrl && (
                    <div className="pt-2 space-y-2.5 w-full flex flex-col items-center">
                      <div className="flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-emerald-400 font-bold">
                        <span>
                          {lang === 'am'
                            ? '✓ Screenshot ተመርጧል — አሁን ከታች "ወደ አድሚን ላክ" የሚለውን ይጫኑ'
                            : '✓ Screenshot attached — now tap "Send to Admin" below'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setDepProofDataUrl(null);
                            if (proofFileInputRef.current) {
                              proofFileInputRef.current.value = '';
                            }
                          }}
                          className="text-red-400 hover:underline font-extrabold"
                        >
                          {lang === 'am' ? 'አጥፋ (Remove)' : 'Remove'}
                        </button>
                      </div>
                      <img
                        src={depProofDataUrl}
                        alt="Deposit Screenshot Preview"
                        className="max-h-52 mx-auto rounded-xl border-2 border-slate-700 object-contain bg-slate-900 p-1.5 shadow-md"
                      />
                    </div>
                  )}
                  {depositSentNotice && !depProofDataUrl && (
                    <div className="w-full p-3.5 rounded-2xl bg-emerald-950 border-2 border-emerald-400 text-emerald-200 text-xs sm:text-sm font-extrabold text-center space-y-1 shadow-lg">
                      <div className="flex items-center justify-center gap-1.5 text-emerald-300 text-sm sm:text-base">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>
                          {lang === 'am'
                            ? '✅ ወደ አድሚን ተልኳል! (Sent to Admin)'
                            : '✅ Sent to Admin!'}
                        </span>
                      </div>
                      <p>{depositSentNotice}</p>
                    </div>
                  )}
                </div>

                <div className="text-center sm:text-left">
                  <label className="block text-sm font-bold text-slate-200 mb-1.5">
                    {lang === 'am'
                      ? 'የደረሰኝ ቁጥር / Transaction Ref (ካለዎት ያስገቡ — አማራጭ)'
                      : 'Transaction Reference / FT Number (Optional if Screenshot attached)'}
                  </label>
                  <input
                    type="text"
                    value={depRef}
                    onChange={(e) => setDepRef(e.target.value)}
                    placeholder={
                      lang === 'am'
                        ? 'ለምሳሌ፦ FT2610... ወይም ባዶ ይተዉት'
                        : 'e.g. FT2610... (or leave blank with screenshot)'
                    }
                    className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-sm sm:text-base text-white font-mono text-center sm:text-left"
                  />
                </div>

                {/* Inline Confirmation / Error Message Directly Above Submit Button for Mobile & Desktop */}
                {walletMsg && (
                  <div
                    role="alert"
                    className={`p-4 rounded-2xl border-2 text-xs sm:text-sm font-extrabold text-center shadow-lg ${
                      walletMsg.type === 'success'
                        ? 'bg-emerald-950 border-emerald-400 text-emerald-200'
                        : 'bg-red-950 border-red-500 text-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1 text-sm sm:text-base">
                      {walletMsg.type === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                      <span>
                        {walletMsg.type === 'success'
                          ? lang === 'am'
                            ? 'ወደ አድሚን ተልኳል! (Sent to Admin)'
                            : 'Sent to Admin!'
                          : lang === 'am'
                            ? 'ማሳሰቢያ (Notice)'
                            : 'Notice'}
                      </span>
                    </div>
                    <div>{walletMsg.text}</div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingDeposit || processingProofImage}
                  className="w-full h-13 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm sm:text-base transition-colors shadow-lg text-center"
                >
                  {submittingDeposit
                    ? lang === 'am'
                      ? 'ወደ አድሚን በመላክ ላይ... (Sending to Admin...)'
                      : 'Sending Deposit & Screenshot to Admin...'
                    : lang === 'am'
                      ? 'የገቢ ጥያቄ እና Screenshot ወደ አድሚን ላክ (Send to Admin)'
                      : 'Send Deposit Request & Screenshot to Admin'}
                </button>
              </form>

              {/* Centered Withdrawal Request Form */}
              <form
                onSubmit={handleRequestWithdrawal}
                className="wb-deposit-form bg-slate-900 border-2 border-amber-400 rounded-3xl p-5 sm:p-7 space-y-5 flex flex-col justify-between shadow-2xl"
              >
                <div className="space-y-4">
                  <div className="text-center space-y-1.5">
                    <h2 className="font-display text-xl sm:text-2xl font-extrabold text-white">
                      {lang === 'am' ? 'ብር ወጪ መጠየቂያ (Request Withdrawal)' : t.withdrawTitle}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-lg mx-auto">
                      {lang === 'am'
                        ? 'የወጪ ጥያቄ ሲልኩ በቀጥታ ወደ አድሚን ይሄዳል። አድሚኑ ሲያጸድቀው በመረጡት የቴሌብር ወይም የንግድ ባንክ (CBE) አካውንት ይላክልዎታል።'
                        : 'Withdrawal requests are sent directly to the Admin for approval or rejection. If rejected, held funds are immediately returned to your balance.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="text-center sm:text-left">
                      <label className="block text-sm font-bold text-slate-200 mb-1.5">
                        {lang === 'am' ? 'ገንዘብ መቀበያ መንገድ (Payout Method)' : 'Payout Method'}
                      </label>
                      <select
                        value={wdProvider}
                        onChange={(e) => setWdProvider(e.target.value as any)}
                        className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white text-center sm:text-left font-semibold"
                      >
                        <option value="TELEBIRR">ቴሌብር (Telebirr)</option>
                        <option value="CBE_BIRR">የኢትዮጵያ ንግድ ባንክ (CBE)</option>
                        <option value="CHAPA">Chapa Bank Transfer</option>
                      </select>
                    </div>
                    <div className="text-center sm:text-left">
                      <label className="block text-sm font-bold text-slate-200 mb-1.5">
                        {lang === 'am'
                          ? 'የወጪ መጠን በብር (ዝቅተኛ 100 ብር)'
                          : 'Amount in Birr (Min 100 Birr)'}
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="50000"
                        step="1"
                        required
                        value={wdAmountBirr}
                        onChange={(e) => setWdAmountBirr(e.target.value)}
                        className="w-full h-12 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-base text-white font-mono font-bold text-center sm:text-left"
                      />
                    </div>
                  </div>

                  <div className="text-center sm:text-left">
                    <label className="block text-sm font-bold text-slate-200 mb-1.5">
                      {lang === 'am'
                        ? 'የእርስዎ የቴሌብር ስልክ ቁጥር ወይም የንግድ ባንክ (CBE) አካውንት ቁጥር'
                        : 'Your Telebirr Phone or CBE Account Number'}
                    </label>
                    <input
                      type="text"
                      required
                      value={wdAccount}
                      onChange={(e) => setWdAccount(e.target.value)}
                      placeholder={
                        lang === 'am'
                          ? 'ለምሳሌ፦ 0911223344 ወይም 1000... (ከነ ስምዎ)'
                          : 'e.g. 0911223344 or 1000... (with account holder name)'
                      }
                      className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-sm sm:text-base text-white font-mono text-center sm:text-left"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingWithdrawal}
                  className="w-full h-13 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-extrabold text-sm sm:text-base transition-colors shadow-lg text-center"
                >
                  {submittingWithdrawal
                    ? lang === 'am'
                      ? 'ወደ አድሚን በመላክ ላይ... (Sending...)'
                      : 'Sending Withdrawal Request...'
                    : lang === 'am'
                      ? 'የወጪ ጥያቄ ወደ አድሚን ላክ (Send Withdrawal Request)'
                      : 'Send Withdrawal Request to Admin'}
                </button>
              </form>
            </div>

            {/* =================================================================
                DEPOSIT & WITHDRAWAL ADMIN SUPPORT BANNER
               ================================================================= */}
            <div className="wb-card bg-slate-900 border-2 border-sky-500 rounded-3xl p-5 sm:p-7 space-y-5 shadow-xl">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-4 text-center sm:text-left">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-sky-950 border border-sky-400 text-sky-300 text-xs font-extrabold">
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {lang === 'am'
                        ? 'የወጪ እና ገቢ (Deposit & Withdrawal) የአድሚን ድጋፍ'
                        : 'Deposit & Withdrawal Admin Support'}
                    </span>
                  </div>
                  <h3 className="font-display text-lg sm:text-xl font-black text-white pt-1">
                    {lang === 'am'
                      ? 'ወጪ እና ገቢ ላይ ችግር ገጥሞዎታል? ያጋጠመወትን ችግር ይግለፁልን'
                      : 'Having an issue with Deposit or Withdrawal? Describe your issue to us'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {lang === 'am'
                      ? 'በገቢ (Deposit) ወይም በወጪ (Withdrawal) ላይ ማንኛውም ችግር ወይም መዘግየት ካጋጠመዎት ከታች በተዘረዘሩት የአድሚን አድራሻዎች ወዲያውኑ ያናግሩን፦'
                      : 'If you experience any issue with your deposit or withdrawal, contact our Admin team immediately using the channels below:'}
                  </p>
                </div>

                <a
                  href="https://t.me/WinnerBingoSupport"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shrink-0 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>@WinnerBingoSupport</span>
                </a>
              </div>

              {/* 4 Official Admin Contact Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Manager */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-sky-500/40 flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-400 block">
                      Manager (ማናጀር)
                    </span>
                    <span className="font-mono text-base sm:text-lg font-black text-white mt-1 block break-all">
                      @WinnerBingoSupport
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="https://t.me/WinnerBingoSupport"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-9 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{lang === 'am' ? 'ቴሌግራም ክፈት' : 'Open Telegram'}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('@WinnerBingoSupport');
                        setWalletMsg({
                          type: 'success',
                          text:
                            lang === 'am'
                              ? 'Manager Telegram (@WinnerBingoSupport) ተቀድቷል!'
                              : 'Manager Telegram (@WinnerBingoSupport) copied!',
                        });
                      }}
                      className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      {lang === 'am' ? 'ቅዳ' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* 2. Finance */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/40 flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block">
                      Finance (ፋይናንስ)
                    </span>
                    <span className="font-mono text-base sm:text-lg font-black text-white mt-1 block">
                      0962838885
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="tel:0962838885"
                      className="flex-1 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{lang === 'am' ? 'ደውል' : 'Call'}</span>
                    </a>
                    <a
                      href="https://t.me/+251962838885"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>TG</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('0962838885');
                        setWalletMsg({
                          type: 'success',
                          text:
                            lang === 'am'
                              ? 'Finance ስልክ ቁጥር (0962838885) ተቀድቷል!'
                              : 'Finance number (0962838885) copied!',
                        });
                      }}
                      className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      {lang === 'am' ? 'ቅዳ' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* 3. Customer service */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-amber-400/40 flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-300 block">
                      Customer service (ደንበኞች አገልግሎት)
                    </span>
                    <span className="font-mono text-base sm:text-lg font-black text-white mt-1 block">
                      0962948280
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="tel:0962948280"
                      className="flex-1 h-9 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{lang === 'am' ? 'ደውል' : 'Call'}</span>
                    </a>
                    <a
                      href="https://t.me/+251962948280"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>TG</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('0962948280');
                        setWalletMsg({
                          type: 'success',
                          text:
                            lang === 'am'
                              ? 'Customer service ስልክ ቁጥር (0962948280) ተቀድቷል!'
                              : 'Customer service number (0962948280) copied!',
                        });
                      }}
                      className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      {lang === 'am' ? 'ቅዳ' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* 4. Communication */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-purple-500/40 flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300 block">
                      Communication (ኮሙኒኬሽን)
                    </span>
                    <span className="font-mono text-base sm:text-lg font-black text-white mt-1 block">
                      0918183607
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="tel:0918183607"
                      className="flex-1 h-9 rounded-lg bg-purple-400 hover:bg-purple-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{lang === 'am' ? 'ደውል' : 'Call'}</span>
                    </a>
                    <a
                      href="https://t.me/+251918183607"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>TG</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('0918183607');
                        setWalletMsg({
                          type: 'success',
                          text:
                            lang === 'am'
                              ? 'Communication ስልክ ቁጥር (0918183607) ተቀድቷል!'
                              : 'Communication number (0918183607) copied!',
                        });
                      }}
                      className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      {lang === 'am' ? 'ቅዳ' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive "ያጋጠመወትን ችግር ይግለፁልን" Direct Message Composer */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <label className="block text-sm font-extrabold text-amber-300">
                  {lang === 'am'
                    ? '✍️ ያጋጠመወትን ችግር ይግለፁልን (Describe the issue you encountered):'
                    : '✍️ Describe the deposit or withdrawal issue you encountered:'}
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={walletSupportIssue}
                    onChange={(e) => setWalletSupportIssue(e.target.value)}
                    placeholder={
                      lang === 'am'
                        ? 'ለምሳሌ፦ 100 ብር በቴሌብር ልኬ ገና አልገባልኝም / ወጪ ጠይቄ ነበር...'
                        : 'e.g., I sent 100 ETB via Telebirr and my balance is not updated yet...'
                    }
                    className="flex-1 h-11 px-3.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-sky-400 focus:outline-none text-sm text-white"
                  />
                  <a
                    href={`https://t.me/WinnerBingoSupport?text=${encodeURIComponent(
                      `ሰላም አድሚን (@WinnerBingoSupport)፣ ተጫዋች: @${user?.username || ''} — ያጋጠመኝ ችግር: ${
                        walletSupportIssue.trim() || 'በገቢ/ወጪ ላይ እገዛ እፈልጋለሁ'
                      }`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0 shadow-md transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {lang === 'am'
                        ? 'በቴሌግራም ለአድሚን ላክ (@WinnerBingoSupport)'
                        : 'Send Issue to Admin on Telegram'}
                    </span>
                  </a>
                </div>
              </div>
            </div>

            {/* Deposit & Withdrawal Status Queues */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                  {lang === 'am' ? 'የእኔ የገቢ ጥያቄዎች (My Deposit Requests)' : 'My Deposit Requests'}
                </h3>
                {walletHistory.deposits.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    {lang === 'am' ? 'እስካሁን ምንም የገቢ ጥያቄ አልተላከም።' : 'No deposit requests yet.'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800 text-sm font-mono">
                    {walletHistory.deposits.map((d: any) => (
                      <div key={d.id} className="py-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {d.proofDataUrl && (
                            <img
                              src={d.proofDataUrl}
                              alt="Proof"
                              className="w-12 h-12 rounded-lg border border-slate-700 object-cover shrink-0"
                            />
                          )}
                          <div>
                            <span className="text-white font-bold">{formatEtb(d.amountMinor, lang)}</span> ·{' '}
                            <span>{d.provider === 'CBE_BIRR' ? 'CBE' : d.provider}</span> ·{' '}
                            <span className="text-slate-400">{d.transactionRef}</span>
                            {d.decisionReason && (
                              <span className="block text-xs text-slate-300 font-sans mt-0.5">
                                {lang === 'am' ? 'የአድሚን መልእክት፦ ' : 'Admin Note: '}
                                {d.decisionReason}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 ${
                            d.status === 'APPROVED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : d.status === 'REJECTED'
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {d.status === 'APPROVED'
                            ? lang === 'am'
                              ? 'ጸድቋል (APPROVED)'
                              : 'APPROVED'
                            : d.status === 'REJECTED'
                            ? lang === 'am'
                              ? 'ውድቅ ተደርጓል (REJECTED)'
                              : 'REJECTED'
                            : lang === 'am'
                            ? 'አድሚን በመጠበቅ ላይ (PENDING)'
                            : 'PENDING'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
                  {lang === 'am' ? 'የእኔ የወጪ ጥያቄዎች (My Withdrawal Requests)' : 'My Withdrawal Requests'}
                </h3>
                {walletHistory.withdrawals.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    {lang === 'am' ? 'እስካሁን ምንም የወጪ ጥያቄ አልተላከም።' : 'No withdrawal requests yet.'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800 text-sm font-mono">
                    {walletHistory.withdrawals.map((w: any) => (
                      <div key={w.id} className="py-3 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-white font-bold">{formatEtb(w.amountMinor, lang)}</span> ·{' '}
                          <span>{w.provider === 'CBE_BIRR' ? 'CBE' : w.provider}</span> ·{' '}
                          <span className="text-amber-300">{w.payoutAccount}</span>
                          {w.decisionReason && (
                            <span className="block text-xs text-slate-300 font-sans mt-0.5">
                              {lang === 'am' ? 'የአድሚን መልእክት፦ ' : 'Admin Note: '}
                              {w.decisionReason}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 ${
                            w.status === 'APPROVED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : w.status === 'REJECTED'
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {w.status === 'APPROVED'
                            ? lang === 'am'
                              ? 'ጸድቋል (APPROVED)'
                              : 'APPROVED'
                            : w.status === 'REJECTED'
                            ? lang === 'am'
                              ? 'ውድቅ ተደርጓል (REJECTED)'
                              : 'REJECTED'
                            : lang === 'am'
                            ? 'አድሚን በመጠበቅ ላይ (PENDING)'
                            : 'PENDING'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Append-Only Ledger Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-display text-lg font-extrabold text-white">{t.ledgerTitle}</h3>
              {walletHistory.ledger.length === 0 ? (
                <p className="text-sm text-slate-400">No ledger transactions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm font-mono tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-300">
                        <th className="py-2.5 pr-3">ID</th>
                        <th className="py-2.5 pr-3">Type</th>
                        <th className="py-2.5 pr-3">Delta</th>
                        <th className="py-2.5 pr-3">Locked Delta</th>
                        <th className="py-2.5 pr-3">Balance After</th>
                        <th className="py-2.5 pr-3">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {walletHistory.ledger.map((entry: any) => (
                        <tr key={entry.id}>
                          <td className="py-2.5 pr-3 text-slate-400">#{entry.id}</td>
                          <td className="py-2.5 pr-3 text-slate-100 font-semibold">{entry.type}</td>
                          <td
                            className={`py-2.5 pr-3 font-bold ${
                              entry.amountMinor > 0
                                ? 'text-emerald-400'
                                : entry.amountMinor < 0
                                ? 'text-red-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {entry.amountMinor > 0 ? '+' : ''}
                            {formatEtb(entry.amountMinor, lang)}
                          </td>
                          <td className="py-2.5 pr-3 text-amber-300">
                            {entry.lockedDeltaMinor > 0 ? '+' : ''}
                            {formatEtb(entry.lockedDeltaMinor, lang)}
                          </td>
                          <td className="py-2.5 pr-3 text-white font-bold">
                            {formatEtb(entry.balanceAfterMinor, lang)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-300 font-sans">{entry.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------
            TAB 4: PROVABLY FAIR VERIFIER & ROUND HISTORY (PHASE 2, 7, 9.5)
           ---------------------------------------------------------------------- */}
        {activeTab === 'history' && (
          <div className="w-full max-w-6xl mx-auto space-y-6">
            {/* =================================================================
                CONTROL BAR:
                1. Practice Mode vs. Live Mode Strict Isolation Switch
                2. Updated Up To Current Timestamp Badge
                3. Date-Range Filter & Pagination Summary
               ================================================================= */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg sm:text-xl font-black text-white">
                      {lang === 'am'
                        ? 'የጨዋታ ታሪክ እና ፍትሃዊነት ማረጋገጫ (Game History & Provably Fair)'
                        : 'Player Game History & Provably Fair Records'}
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold border ${
                        historyMode === 'LIVE'
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                          : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      }`}
                    >
                      {historyMode === 'LIVE'
                        ? lang === 'am'
                          ? '● ቀጥታ በብር (REAL / LIVE MODE)'
                          : '● REAL / LIVE MODE'
                        : lang === 'am'
                        ? '● የልምምድ ጨዋታ (PRACTICE / DEMO MODE)'
                        : '● PRACTICE / DEMO MODE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {lang === 'am'
                      ? 'የቀጥታ (Real ETB) እና የልምምድ (Practice/Demo) ጨዋታ ታሪኮች፣ ቀሪ ሂሳቦች እና የፍትሃዊነት መዝገቦች ሙሉ በሙሉ የተለያዩ ናቸው።'
                      : 'Live Mode and Practice/Demo Mode gameplay, balances, and fairness records are strictly isolated and never mix.'}
                  </p>
                </div>

                {/* Strict Mode Isolation Toggle: Live Mode vs Practice Mode */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start lg:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryMode('LIVE');
                      setHistoryPage(1);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                      historyMode === 'LIVE'
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>{lang === 'am' ? 'ቀጥታ ጨዋታ (Live Mode)' : 'Live Mode (Real ETB)'}</span>
                    {liveHistorySummary && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          historyMode === 'LIVE'
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-slate-800 text-emerald-400'
                        }`}
                      >
                        {liveHistorySummary.totalRounds} {lang === 'am' ? 'ዙር' : 'Rds'}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHistoryMode('PRACTICE');
                      setHistoryPage(1);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                      historyMode === 'PRACTICE'
                        ? 'bg-amber-400 text-slate-950 shadow-md'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>{lang === 'am' ? 'የልምምድ ጨዋታ (Practice Mode)' : 'Practice / Demo Mode'}</span>
                    {practiceHistorySummary && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          historyMode === 'PRACTICE'
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-slate-800 text-amber-300'
                        }`}
                      >
                        {practiceHistorySummary.totalRounds} {lang === 'am' ? 'ዙር' : 'Rds'}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Date-Range Filtering & Current Timestamp Status */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400 font-semibold">
                    {lang === 'am' ? 'በቀን አጣራ (Date Filter):' : 'Filter by Date:'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">{lang === 'am' ? 'ከ:' : 'From:'}</span>
                    <input
                      type="date"
                      value={historyDateFrom}
                      onChange={(e) => {
                        setHistoryDateFrom(e.target.value);
                        setHistoryPage(1);
                      }}
                      className="h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">{lang === 'am' ? 'እስከ:' : 'To:'}</span>
                    <input
                      type="date"
                      value={historyDateTo}
                      onChange={(e) => {
                        setHistoryDateTo(e.target.value);
                        setHistoryPage(1);
                      }}
                      className="h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-xs"
                    />
                  </div>
                  {(historyDateFrom || historyDateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryDateFrom('');
                        setHistoryDateTo('');
                        setHistoryPage(1);
                      }}
                      className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs cursor-pointer"
                    >
                      {lang === 'am' ? 'ሁሉንም አሳይ (Clear)' : 'Clear Filter'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {lang === 'am' ? 'እስከ አሁኑ ሰዓት የዘመነ:' : 'Updated up to:'}{' '}
                    <strong className="text-slate-200">
                      {historyAsOfUtc
                        ? new Date(historyAsOfUtc).toLocaleString()
                        : new Date(Date.now() + serverOffsetMs).toLocaleString()}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* =================================================================
                TOP SUMMARY BANNER:
                LEFT SIDE = Won Amount (+ Green)
                RIGHT SIDE = Lost Amount (- Red)
               ================================================================= */}
            {(() => {
              const wonGames = myGames.filter((g: any) => g.won);
              const lostGames = myGames.filter(
                (g: any) => g.lost || (g.roundStatus === 'SETTLED' && !g.won)
              );
              const activeSummary =
                historyMode === 'PRACTICE' ? practiceHistorySummary : liveHistorySummary;
              const totalWonMinor =
                activeSummary && !historyDateFrom && !historyDateTo
                  ? Number(activeSummary.totalWonMinor || 0)
                  : wonGames.reduce(
                      (acc: number, g: any) => acc + (Number(g.payoutMinor) || 0),
                      0
                    );
              const totalLostMinor =
                activeSummary && !historyDateFrom && !historyDateTo
                  ? Number(activeSummary.totalLostMinor || 0)
                  : lostGames.reduce(
                      (acc: number, g: any) => acc + (Number(g.pricePaidMinor) || 0),
                      0
                    );

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LEFT SIDE: Won Amount & Won Cartelas (+ Green) */}
                  <div className="bg-emerald-950/40 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-3 shadow-lg shadow-emerald-950/20">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 font-black text-xl flex items-center justify-center shadow">
                          +
                        </span>
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                            {lang === 'am' ? 'ግራ ጎን · ያሸነፉት (LEFT: WON)' : 'LEFT SIDE · WON AMOUNT'}
                          </span>
                          <h3 className="font-display text-base sm:text-lg font-black text-emerald-300 mt-1">
                            {lang === 'am' ? 'ያሸነፉት ገንዘብ እና ካርቴላዎች (+)' : 'Total Won Amount & Cartelas (+)'}
                          </h3>
                          <p className="text-xs text-emerald-200/80 font-semibold">
                            {lang === 'am'
                              ? `ጠቅላላ ያሸነፉት: ${wonGames.length} ካርቴላዎች`
                              : `Total Won: ${wonGames.length} Cartelas`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold uppercase text-emerald-300/80 block">
                          {lang === 'am' ? 'ጠቅላላ ያሸነፉት (Won)' : 'Total Won'}
                        </span>
                        <span className="font-mono text-lg sm:text-2xl font-black text-emerald-400">
                          +{formatEtb(totalWonMinor, lang)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-500/20">
                      <span className="text-xs font-bold text-emerald-300 block mb-2">
                        {lang === 'am' ? 'የበሉት የካርቴላ ቁጥሮች (+):' : 'Won Cartela Numbers (+):'}
                      </span>
                      {wonGames.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          {lang === 'am' ? 'ገና ያሸነፉት ካርቴላ የለም' : 'No won cartelas in this view'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {wonGames.slice(0, 20).map((g: any) => (
                            <span
                              key={`won-badge-${g.ticketId}`}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 font-mono text-sm font-black shadow-sm"
                              title={`${lang === 'am' ? 'ዙር' : 'Round'} #${g.roundId}`}
                            >
                              +{lang === 'am' ? 'ካርቴላ' : 'Card'} #{g.cardIndex}
                              <span className="text-[11px] text-emerald-200/80 font-normal">
                                (R#{g.roundId})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT SIDE: Lost Amount & Lost Cartelas (- Red) */}
                  <div className="bg-red-950/40 border-2 border-red-500/40 rounded-2xl p-5 space-y-3 shadow-lg shadow-red-950/20">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-red-500 text-white font-black text-xl flex items-center justify-center shadow">
                          -
                        </span>
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                            {lang === 'am' ? 'ቀኝ ጎን · የተሸነፉት (RIGHT: LOST)' : 'RIGHT SIDE · LOST AMOUNT'}
                          </span>
                          <h3 className="font-display text-base sm:text-lg font-black text-red-300 mt-1">
                            {lang === 'am' ? 'የተሸነፉት ገንዘብ እና ካርቴላዎች (-)' : 'Total Lost Amount & Cartelas (-)'}
                          </h3>
                          <p className="text-xs text-red-200/80 font-semibold">
                            {lang === 'am'
                              ? `ጠቅላላ የተበሉት: ${lostGames.length} ካርቴላዎች`
                              : `Total Lost: ${lostGames.length} Cartelas`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold uppercase text-red-300/80 block">
                          {lang === 'am' ? 'ጠቅላላ የተሸነፉት (Lost)' : 'Total Lost'}
                        </span>
                        <span className="font-mono text-lg sm:text-2xl font-black text-red-400">
                          -{formatEtb(totalLostMinor, lang)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-red-500/20">
                      <span className="text-xs font-bold text-red-300 block mb-2">
                        {lang === 'am' ? 'የተበሉት የካርቴላ ቁጥሮች (-):' : 'Lost Cartela Numbers (-):'}
                      </span>
                      {lostGames.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          {lang === 'am' ? 'የተበላ ካርቴላ የለም' : 'No lost cartelas in this view'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {lostGames.slice(0, 20).map((g: any) => (
                            <span
                              key={`lost-badge-${g.ticketId}`}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-red-500/20 border border-red-400/60 text-red-300 font-mono text-sm font-black shadow-sm"
                              title={`${lang === 'am' ? 'ዙር' : 'Round'} #${g.roundId}`}
                            >
                              -{lang === 'am' ? 'ካርቴላ' : 'Card'} #{g.cardIndex}
                              <span className="text-[11px] text-red-200/80 font-normal">
                                (R#{g.roundId})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* =================================================================
                PER-ROUND PLAYER GAME HISTORY & PAST COMPLETED ROUNDS
                Requirement 1: For each player's game round, display the WON amount
                on the LEFT side and the LOST amount on the RIGHT side, updated up
                to the current timestamp, with Provably Fair hash/seed per round.
               ================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Player's Per-Round History (7 cols on desktop) */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="font-display text-lg font-extrabold text-white">
                      {lang === 'am'
                        ? 'የእኔ የዙር ታሪክ (ግራ = ያሸነፉት + | ቀኝ = የተሸነፉት -)'
                        : 'My Game Rounds (Left = Won Amount + | Right = Lost Amount -)'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {lang === 'am'
                        ? 'በእያንዳንዱ ዙር ያሸነፉት መጠን በግራ በኩል (+)፣ የተሸነፉት መጠን በቀኝ በኩል (-) ከነ ፍትሃዊነት ማረጋገጫ ኮድ (Provably Fair Hash/Seed) ይታያል።'
                        : 'Each game round shows your Won amount on the LEFT and Lost amount on the RIGHT with Provably Fair seed verification.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold shrink-0">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                      ← {lang === 'am' ? 'ግራ: ያሸነፉት (+)' : 'Left: Won (+)'}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300">
                      {lang === 'am' ? 'ቀኝ: የተሸነፉት (-)' : 'Right: Lost (-)'} →
                    </span>
                  </div>
                </div>

                {myRounds.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                    <p className="text-sm font-bold text-slate-300">
                      {historyMode === 'LIVE'
                        ? lang === 'am'
                          ? 'በቀጥታ (Live Mode) የተጫወቱት ዙር አልተገኘም።'
                          : 'No Live Mode game rounds found for the selected filter.'
                        : lang === 'am'
                        ? 'በልምምድ (Practice Mode) የተጫወቱት ዙር አልተገኘም።'
                        : 'No Practice Mode game rounds found for the selected filter.'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {lang === 'am'
                        ? 'ካርቴላ ገዝተው ሲጫወቱ የእያንዳንዱ ዙር ውጤት እዚህ ወዲያውኑ ይመዘገባል።'
                        : 'Once you join a round, your real-time per-round win/loss breakdown and fairness seeds appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 font-mono">
                    {myRounds.map((rd: any) => {
                      const wonMinor = Number(rd.wonAmountMinor || 0);
                      const lostMinor = Number(rd.lostAmountMinor || 0);
                      const wonCardsRaw: any[] = Array.isArray(rd.wonCards) ? rd.wonCards : [];
                      const lostCardsRaw: any[] = Array.isArray(rd.lostCards) ? rd.lostCards : [];
                      const wonCards = wonCardsRaw.map((c: any) =>
                        typeof c === 'object' && c !== null ? Number(c.cardIndex) : Number(c)
                      );
                      const lostCards = lostCardsRaw.map((c: any) =>
                        typeof c === 'object' && c !== null ? Number(c.cardIndex) : Number(c)
                      );
                      const roundWinningCards: any[] = Array.isArray(rd.roundWinningCards)
                        ? rd.roundWinningCards
                        : Array.isArray(rd.winningCards)
                        ? rd.winningCards
                        : [];
                      const roundTimestamp = rd.timestampUtc || rd.settledAt || rd.createdAt;

                      return (
                        <div
                          key={`my-round-${rd.roundId}`}
                          className="rounded-2xl bg-slate-950/90 border border-slate-800 p-4 space-y-3 shadow-md"
                        >
                          {/* Round Top Metadata Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 pb-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-white font-black text-xs sm:text-sm">
                                {lang === 'am' ? `ዙር #${rd.roundId}` : `Round #${rd.roundId}`}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-200 font-sans">
                                {lang === 'am' ? rd.roomNameAm : rd.roomNameEn}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  rd.isPractice
                                    ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                                    : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                                }`}
                              >
                                {rd.isPractice ? 'PRACTICE_DEMO' : 'REAL_LIVE'}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300">
                                {rd.roundStatus}
                              </span>
                            </div>

                            <span className="text-[11px] text-slate-400">
                              {roundTimestamp
                                ? new Date(roundTimestamp).toLocaleString()
                                : ''}
                            </span>
                          </div>

                          {/* =========================================================
                              REQUIREMENT 1:
                              LEFT SIDE = Won Amount (+ Green)
                              RIGHT SIDE = Lost Amount (- Red)
                             ========================================================= */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* LEFT COLUMN: WON AMOUNT */}
                            <div
                              className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                                wonMinor > 0
                                  ? 'bg-emerald-950/45 border-emerald-500/60 shadow-inner'
                                  : 'bg-slate-900/50 border-slate-800/80'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-sans font-extrabold uppercase tracking-wide text-emerald-300">
                                  {lang === 'am' ? '← ያሸነፉት መጠን (WON)' : '← WON AMOUNT (LEFT)'}
                                </span>
                                {wonCards.length > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black">
                                    ✓ {wonCards.length} {lang === 'am' ? 'ካርቴላ' : 'Won'}
                                  </span>
                                )}
                              </div>

                              <div className="text-xl sm:text-2xl font-black text-emerald-400">
                                +{formatEtb(wonMinor, lang)}
                              </div>

                              <div className="text-[11px] text-slate-300 flex flex-wrap gap-1.5">
                                {wonCards.length > 0 ? (
                                  wonCards.map((cIdx, idx) => (
                                    <span
                                      key={`wc-${rd.roundId}-${cIdx}-${idx}`}
                                      className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold"
                                    >
                                      +{lang === 'am' ? 'ካርቴላ' : 'Card'} #{cIdx}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-500 font-sans">
                                    {lang === 'am' ? 'በዚህ ዙር ያሸነፈ ካርቴላ የለም' : 'No winning ticket in this round'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* RIGHT COLUMN: LOST AMOUNT */}
                            <div
                              className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 sm:text-right ${
                                lostMinor > 0
                                  ? 'bg-red-950/40 border-red-500/60 shadow-inner'
                                  : 'bg-slate-900/50 border-slate-800/80'
                              }`}
                            >
                              <div className="flex items-center sm:flex-row-reverse justify-between gap-2">
                                <span className="text-[11px] font-sans font-extrabold uppercase tracking-wide text-red-300">
                                  {lang === 'am' ? 'የተሸነፉት መጠን (LOST) →' : 'LOST AMOUNT (RIGHT) →'}
                                </span>
                                {lostCards.length > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-black">
                                    ✗ {lostCards.length} {lang === 'am' ? 'ካርቴላ' : 'Lost'}
                                  </span>
                                )}
                              </div>

                              <div className="text-xl sm:text-2xl font-black text-red-400">
                                -{formatEtb(lostMinor, lang)}
                              </div>

                              <div className="text-[11px] text-slate-300 flex flex-wrap sm:justify-end gap-1.5">
                                {lostCards.length > 0 ? (
                                  lostCards.map((cIdx, idx) => (
                                    <span
                                      key={`lc-${rd.roundId}-${cIdx}-${idx}`}
                                      className="px-2 py-0.5 rounded bg-red-500/20 border border-red-400/50 text-red-300 font-bold"
                                    >
                                      -{lang === 'am' ? 'ካርቴላ' : 'Card'} #{cIdx}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-500 font-sans">
                                    {lang === 'am' ? 'በዚህ ዙር የተበላ ካርቴላ የለም' : 'No losing ticket in this round'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Winning Cartela Info for the Round */}
                          {roundWinningCards.length > 0 && (
                            <div className="text-xs text-emerald-300/90 flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span className="font-sans text-slate-400">
                                {lang === 'am' ? 'የዙሩ አሸናፊ ካርቴላ:' : 'Round Winner:'}
                              </span>
                              {roundWinningCards.map((wc: any, idx: number) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold"
                                >
                                  +{lang === 'am' ? 'ካርቴላ' : 'Card'} #{wc.cardIndex} (@{wc.username})
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Provably Fair Seed & Hash for this Round */}
                          <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="truncate">
                                <span className="text-slate-500">SHA-256 Hash:</span>{' '}
                                <span className="text-emerald-300">{rd.serverSeedHash}</span>
                              </div>
                              <div className="truncate">
                                <span className="text-slate-500">Server Seed:</span>{' '}
                                <span className="text-amber-300">
                                  {rd.serverSeed ||
                                    (lang === 'am'
                                      ? 'ዙሩ ሲጠናቀቅ ይገለጻል (Revealed after round settles)'
                                      : 'Revealed when round settles')}
                                </span>
                              </div>
                            </div>

                            {rd.serverSeed && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVerifyRoundIdInput(String(rd.roundId));
                                  setVerifySeedInput(rd.serverSeed || '');
                                  setVerifyHashInput(rd.serverSeedHash || '');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold shrink-0 cursor-pointer"
                              >
                                {lang === 'am' ? 'ፍትሃዊነት አረጋግጥ ↓' : 'Verify Fairness ↓'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination Controls */}
                {historyPagination && historyPagination.totalPages > 1 && (
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      disabled={!historyPagination.hasPrevPage}
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-40 font-bold cursor-pointer"
                    >
                      ← {lang === 'am' ? 'ቀዳሚ (Prev)' : 'Previous'}
                    </button>
                    <span className="font-mono text-slate-400">
                      {lang === 'am'
                        ? `ገጽ ${historyPagination.page} ከ ${historyPagination.totalPages} (ጠቅላላ ${historyPagination.totalItems} ዙሮች)`
                        : `Page ${historyPagination.page} of ${historyPagination.totalPages} (${historyPagination.totalItems} rounds)`}
                    </span>
                    <button
                      type="button"
                      disabled={!historyPagination.hasNextPage}
                      onClick={() => setHistoryPage((p) => p + 1)}
                      className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-40 font-bold cursor-pointer"
                    >
                      {lang === 'am' ? 'ቀጣይ (Next)' : 'Next'} →
                    </button>
                  </div>
                )}
              </div>

              {/* All Completed Rounds in Current Mode (5 cols on desktop) */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-display text-lg font-extrabold text-white">
                    {lang === 'am'
                      ? 'ያለፉ ዙሮች — የበሉ (+) እና የተበሉ (-) ካርቴላዎች'
                      : 'Past Completed Rounds — Won (+) & Lost (-) Cartelas'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {lang === 'am'
                      ? 'በእያንዳንዱ ዙር የበሉት በአረንጓዴ (+) እና የተበሉት በቀይ (-) ተዘርዝረዋል'
                      : 'Every round lists winning cartelas in green (+) and losing cartelas in red (-)'}
                  </p>
                </div>

                {pastRounds.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    {lang === 'am' ? 'ገና የተጠናቀቀ ዙር የለም።' : 'No completed rounds yet in this mode.'}
                  </p>
                ) : (
                  <div className="space-y-3 text-sm font-mono max-h-[680px] overflow-y-auto pr-1">
                    {pastRounds.map((r: any) => {
                      const winningCards: any[] = Array.isArray(r.winningCards) ? r.winningCards : [];
                      const losingCards: any[] = Array.isArray(r.losingCards) ? r.losingCards : [];

                      return (
                        <div
                          key={r.roundId}
                          className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white font-bold text-sm sm:text-base">
                              {lang === 'am' ? `ዙር #${r.roundId}` : `Round #${r.roundId}`} ·{' '}
                              {lang === 'am' ? r.roomNameAm : r.roomNameEn}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setVerifyRoundIdInput(String(r.roundId));
                                setVerifySeedInput(r.serverSeed || '');
                                setVerifyHashInput(r.serverSeedHash || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold cursor-pointer"
                            >
                              {lang === 'am' ? 'ፍትሃዊነት አረጋግጥ ↓' : 'Verify Fairness ↓'}
                            </button>
                          </div>

                          {/* Won Cartelas (+ Green) in this round */}
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-emerald-400 block">
                              {lang === 'am' ? 'የበሉ ካርቴላዎች (+ አሸናፊ):' : 'Won Cartelas (+):'}
                            </span>
                            {winningCards.length === 0 ? (
                              <span className="text-xs text-slate-500">
                                {lang === 'am' ? 'አሸናፊ የለም (ተሰርዟል)' : 'No winner (Cancelled)'}
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {winningCards.map((wc: any, idx: number) => (
                                  <span
                                    key={`rw-${r.roundId}-${idx}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-black"
                                  >
                                    +{lang === 'am' ? 'ካርቴላ' : 'Card'} #{wc.cardIndex}
                                    <span className="text-emerald-200/90 font-semibold">
                                      (@{wc.username})
                                    </span>
                                    {wc.payoutMinor > 0 && (
                                      <span className="text-emerald-400 font-extrabold">
                                        +{formatEtb(wc.payoutMinor, lang)}
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Lost Cartelas (- Red) in this round */}
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-red-400 block">
                              {lang === 'am' ? 'የተበሉ ካርቴላዎች (- ተሸናፊ):' : 'Lost Cartelas (-):'}
                            </span>
                            {losingCards.length === 0 ? (
                              <span className="text-xs text-slate-500">
                                {lang === 'am' ? 'የተበላ ካርቴላ የለም' : 'No losing cartelas'}
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {losingCards.map((lc: any, idx: number) => (
                                  <span
                                    key={`rl-${r.roundId}-${idx}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-black"
                                  >
                                    -{lang === 'am' ? 'ካርቴላ' : 'Card'} #{lc.cardIndex}
                                    <span className="text-red-200/90 font-semibold">
                                      (@{lc.username})
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-1 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                            <div className="truncate">Seed: {r.serverSeed}</div>
                            <div className="truncate">Hash: {r.serverSeedHash}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Provably Fair Verifier Tool */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-xl font-extrabold text-white">{t.verifyTitle}</h2>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                  Before every round, the server publishes <code className="text-emerald-400">SHA256(serverSeed)</code>. When the round finishes, <code className="text-amber-300">serverSeed</code> is revealed so anyone can verify that the 75-ball draw order was deterministically derived from <code className="text-slate-200">HMAC_SHA256(serverSeed, roundId)</code>.
                </p>
              </div>

              <form onSubmit={handleVerifyFairness} className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1.5">Round ID</label>
                  <input
                    type="text"
                    required
                    value={verifyRoundIdInput}
                    onChange={(e) => setVerifyRoundIdInput(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1.5">Revealed Server Seed</label>
                  <input
                    type="text"
                    required
                    value={verifySeedInput}
                    onChange={(e) => setVerifySeedInput(e.target.value)}
                    placeholder="64-char hex serverSeed"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200 mb-1.5">Published SHA256 Hash</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={verifyHashInput}
                      onChange={(e) => setVerifyHashInput(e.target.value)}
                      placeholder="64-char hex SHA256 commitment"
                      className="flex-1 h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                    />
                    <button
                      type="submit"
                      className="px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm whitespace-nowrap cursor-pointer"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              </form>

              {verifyResult && (
                <div
                  className={`p-4 rounded-xl border text-sm space-y-2 font-mono ${
                    verifyResult.valid
                      ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
                      : 'bg-red-950/60 border-red-800 text-red-200'
                  }`}
                >
                  <div className="font-bold text-base">
                    {verifyResult.valid
                      ? '✓ PROVABLY FAIR VERIFIED: SHA256 commitment & HMAC-SHA256 draw order match 100%!'
                      : `✗ VERIFICATION FAILED: ${verifyResult.reason}`}
                  </div>
                  <div>Computed SHA256: {verifyResult.computedHash}</div>
                  {verifyResult.derivedSequence?.length > 0 && (
                    <div className="pt-1">
                      <span className="text-slate-300 block mb-1.5">
                        Derived 75-Ball Sequence (First 25 shown):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {verifyResult.derivedSequence.slice(0, 25).map((n: number, i: number) => (
                          <span key={i} className="px-2 py-1 rounded bg-slate-900 text-slate-100 font-bold">
                            #{i + 1}: {getBallLetter(n)}
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------
            TAB 5: RESPONSIBLE GAMING & ACCOUNT SECURITY (PHASE 8)
           ---------------------------------------------------------------------- */}
        {activeTab === 'responsible' && (
          <div className="w-full max-w-6xl mx-auto space-y-6">
            {rgMsg && (
              <div
                className={`p-4 rounded-xl border text-sm sm:text-base font-semibold ${
                  rgMsg.type === 'success'
                    ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                    : 'bg-red-950/70 border-red-800 text-red-200'
                }`}
              >
                {rgMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Deposit Limit */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-white">Daily Deposit Limit</h2>
                  <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                    Decreasing your daily deposit limit takes effect immediately. Increasing your limit requires a mandatory 24-hour cooling-off delay.
                  </p>
                </div>

                <div className="text-sm font-mono text-slate-200 space-y-1">
                  <div>
                    Current Active Limit:{' '}
                    <strong className="text-emerald-400">
                      {formatEtb(user.dailyDepositLimitMinor, lang)} / 24h
                    </strong>
                  </div>
                  {user.pendingLimitMinor && (
                    <div className="text-amber-300">
                      Pending Limit Increase: {formatEtb(user.pendingLimitMinor, lang)} (Effective at{' '}
                      {user.pendingLimitEffectiveAt?.slice(0, 16).replace('T', ' ')})
                    </div>
                  )}
                </div>

                <div className="flex gap-2.5">
                  <input
                    type="number"
                    min="50"
                    max="50000"
                    value={limitBirrInput}
                    onChange={(e) => setLimitBirrInput(e.target.value)}
                    className="flex-1 h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setRgMsg(null);
                      const birr = parseFloat(limitBirrInput);
                      if (Number.isNaN(birr) || birr < 50) return;
                      const res = await apiFetch('/api/wallet', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'set_deposit_limit',
                          dailyDepositLimitMinor: Math.round(birr * 100),
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setRgMsg({ type: 'error', text: data.error });
                      } else {
                        setRgMsg({ type: 'success', text: data.message });
                        fetchProfile();
                      }
                    }}
                    className="px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm whitespace-nowrap"
                  >
                    Update Limit
                  </button>
                </div>
              </div>

              {/* Change Password & Session Management */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
                <h2 className="font-display text-xl font-extrabold text-white">Password & Active Sessions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <input
                    type="password"
                    value={currentPwdInput}
                    onChange={(e) => setCurrentPwdInput(e.target.value)}
                    placeholder="Current password"
                    className="h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                  <input
                    type="password"
                    value={newPwdInput}
                    onChange={(e) => setNewPwdInput(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      setRgMsg(null);
                      const res = await apiFetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'change_password',
                          currentPassword: currentPwdInput,
                          newPassword: newPwdInput,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setRgMsg({ type: 'error', text: data.error });
                      } else {
                        if (data.sessionToken) setSessionToken(data.sessionToken);
                        setCurrentPwdInput('');
                        setNewPwdInput('');
                        setRgMsg({ type: 'success', text: 'Password updated successfully.' });
                      }
                    }}
                    className="px-5 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
                  >
                    Change Password
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLogout(true)}
                    className="px-5 h-11 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 font-bold text-sm"
                  >
                    {t.logoutAll}
                  </button>
                </div>
              </div>

              {/* Help Resources & Official Admin Support Contacts */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3 text-sm text-slate-300 leading-relaxed">
                <h2 className="font-display text-xl font-extrabold text-white">
                  {lang === 'am'
                    ? 'የአድሚን ድጋፍ እና እገዛ (Admin Support — ያጋጠመወትን ችግር ይግለፁልን)'
                    : 'Admin Support & Help Resources'}
                </h2>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-sky-500/40 space-y-1.5 font-mono text-xs sm:text-sm">
                  <div className="text-sky-300 font-bold">
                    Manager = <a href="https://t.me/WinnerBingoSupport" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">@WinnerBingoSupport</a>
                  </div>
                  <div className="text-emerald-300 font-bold">
                    Finance = <a href="tel:0962838885" className="underline hover:text-white">0962838885</a>
                  </div>
                  <div className="text-amber-300 font-bold">
                    Customer service = <a href="tel:0962948280" className="underline hover:text-white">0962948280</a>
                  </div>
                  <div className="text-purple-300 font-bold">
                    Communication = <a href="tel:0918183607" className="underline hover:text-white">0918183607</a>
                  </div>
                  <div className="text-slate-200 font-sans font-semibold pt-1">
                    ያጋጠመወትን ችግር ይግለፁልን
                  </div>
                </div>
                <p>
                  • Gambling should be entertaining and never viewed as a source of income. Never wager more than you can afford to lose.
                </p>
                <p>
                  • Support Resources: International Responsible Gambling Helpline & Counseling (<span className="text-emerald-400">www.begambleaware.org</span> / <span className="text-emerald-400">www.gamblingtherapy.org</span>).
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================
          MOBILE FIXED BOTTOM NAVIGATION BAR (Spacious 4-Button Layout)
         ======================================================================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 wb-bottom-nav">
        <button
          type="button"
          onClick={() => setActiveTab('lobby')}
          className={`wb-bottom-nav-btn ${
            activeTab === 'lobby' ? 'wb-bottom-nav-btn-active' : ''
          }`}
        >
          <LayoutGrid className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="truncate w-full px-0.5">{t.navLobby}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('game')}
          className={`wb-bottom-nav-btn ${
            activeTab === 'game' ? 'wb-bottom-nav-btn-active' : ''
          }`}
        >
          <Play className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="truncate w-full px-0.5">{t.navLiveGame}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('wallet');
            fetchWalletDetails();
          }}
          className={`wb-bottom-nav-btn ${
            activeTab === 'wallet' ? 'wb-bottom-nav-btn-active' : ''
          }`}
        >
          <Wallet className="w-5 h-5 text-sky-400 shrink-0" />
          <span className="truncate w-full px-0.5">{t.navWallet}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            fetchHistoryAndFairness();
          }}
          className={`wb-bottom-nav-btn ${
            activeTab === 'history' ? 'wb-bottom-nav-btn-active' : ''
          }`}
        >
          <History className="w-5 h-5 text-purple-400 shrink-0" />
          <span className="truncate w-full px-0.5">{t.navHistory}</span>
        </button>
      </nav>
    </div>
  );
}
