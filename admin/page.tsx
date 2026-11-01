'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Users,
  Wallet,
  LayoutGrid,
  FileText,
  LogOut,
  Power,
  AlertTriangle,
  Search,
  UserX,
  Ban,
  Unlock,
  PlusCircle,
  Clock,
  Calendar,
  Award,
  Eye,
  EyeOff,
  Lock,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  Send,
  Download,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import {
  formatEtb,
  BingoPattern,
  WINNING_PATTERN_OPTIONS,
  getPatternLabel,
} from '@/src/lib/bingo-engine';
import { soundFx } from '@/src/lib/i18n-sound';
import dynamic from 'next/dynamic';

const AdminRevenueDashboard = dynamic(() => import('@/components/AdminRevenueDashboard'), {
  ssr: false,
  loading: () => (
    <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
      የፋይናንስ ሪፖርት በመጫን ላይ... (Loading Financial Report...)
    </div>
  ),
});

type AdminTab = 'revenue' | 'players' | 'history' | 'rooms' | 'queues' | 'resets' | 'audit';

const ADMIN_TOKEN_KEY = 'habesha_admin_auth_token';

function readStoredAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ||
      window.localStorage.getItem(ADMIN_TOKEN_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

function writeStoredAdminToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.sessionStorage.removeItem('habesha_admin_token');
      window.localStorage.removeItem('habesha_admin_token');
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export default function HiddenAdminPanel(props?: any) {
  const onBackToPlayer =
    typeof props?.onBackToPlayer === 'function' ? props.onBackToPlayer : undefined;
  return <AdminControlPanel onBackToPlayer={onBackToPlayer} />;
}

function AdminControlPanel(props?: { onBackToPlayer?: () => void }) {
  const onBackToPlayer = props?.onBackToPlayer;
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('players');

  // Admin Login Form State (Strictly requires Admin Password immediately on every visit)
  const [username, setUsername] = useState('0918223401@eic');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Quick Bet Amount ("የመወራረጃ ብር"), House Commission ("የቤት ኮሚሽን %"), Winning Pattern ("ዝግ"), Countdown Timer & Predetermined Winner State
  const [quickTargetRoomId, setQuickTargetRoomId] = useState<string>('ALL');
  const [quickCustomBetBirr, setQuickCustomBetBirr] = useState<string>('');
  const [quickCustomCommissionPct, setQuickCustomCommissionPct] = useState<string>('');
  const [predTargetCardId, setPredTargetCardId] = useState<string>('1');
  const [predTargetUserId, setPredTargetUserId] = useState<string>('');
  const [predAutoClear, setPredAutoClear] = useState<boolean>(true);

  // Admin Game Scheduling & Betting Control State
  const [scheduledGameDateInput, setScheduledGameDateInput] = useState<string>('');
  const [scheduleNoticeInput, setScheduleNoticeInput] = useState<string>('');
  const [practiceOffReasonInput, setPracticeOffReasonInput] = useState<string>('');
  const [practiceResumeTimeInput, setPracticeResumeTimeInput] = useState<string>('');
  const [realGameOffReasonInput, setRealGameOffReasonInput] = useState<string>('');
  const [realGameResumeTimeInput, setRealGameResumeTimeInput] = useState<string>('');
  const initializedModeInputsRef = useRef<boolean>(false);
  const [nowTicker, setNowTicker] = useState<number>(Date.now());

  // Transaction & Game Audit Logs Filter State
  const [auditSubTab, setAuditSubTab] = useState<'ALL' | 'COMMISSION' | 'DEPOSITS' | 'WITHDRAWALS' | 'SECURITY'>('ALL');
  const [auditTxStatusFilter, setAuditTxStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');

  // Queue Rejection Reason Inputs & Auto-Archived Deposit/Withdrawal Reports Filter State
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [processingQueueRequests, setProcessingQueueRequests] = useState<Record<string, boolean>>({});
  const processingQueueRef = useRef<Set<string>>(new Set());
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [dwReportDateFrom, setDwReportDateFrom] = useState<string>('');
  const [dwReportDateTo, setDwReportDateTo] = useState<string>('');
  const [dwReportTypeFilter, setDwReportTypeFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL'>('ALL');
  const [dwReportStatusFilter, setDwReportStatusFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');

  // Player Search & Action State
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerStatusFilter, setPlayerStatusFilter] = useState<
    'ALL' | 'IN_ROUND' | 'ONLINE' | 'ACTIVE' | 'BLOCKED'
  >('ALL');
  const [playerReasons, setPlayerReasons] = useState<Record<number, string>>({});
  const [adjUserId, setAdjUserId] = useState<number | null>(null);
  const [adjAmountBirr, setAdjAmountBirr] = useState('50');
  const [adjDirection, setAdjDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjReason, setAdjReason] = useState('');

  // Admin Player Game History Search State (Isolated Live vs Practice, Date Filter & Pagination)
  const [adminHistoryUsername, setAdminHistoryUsername] = useState('');
  const [adminHistoryMode, setAdminHistoryMode] = useState<'LIVE' | 'PRACTICE'>('LIVE');
  const [adminHistoryDateFrom, setAdminHistoryDateFrom] = useState('');
  const [adminHistoryDateTo, setAdminHistoryDateTo] = useState('');
  const [adminHistoryPage, setAdminHistoryPage] = useState(1);
  const [adminHistoryLoading, setAdminHistoryLoading] = useState(false);
  const [adminHistoryError, setAdminHistoryError] = useState<string | null>(null);
  const [adminHistoryData, setAdminHistoryData] = useState<any | null>(null);

  // Room Form State
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [rmNameEn, setRmNameEn] = useState('');
  const [rmNameAm, setRmNameAm] = useState('');
  const [rmPriceBirr, setRmPriceBirr] = useState('20');
  const [rmPattern, setRmPattern] = useState<BingoPattern>('ONE_LINE');
  const [rmMinPlayers, setRmMinPlayers] = useState('1');
  const [rmMinCards, setRmMinCards] = useState('1');
  const [rmMaxCards, setRmMaxCards] = useState('4');
  const [rmFeeBps, setRmFeeBps] = useState('2300');
  const [rmDrawInterval, setRmDrawInterval] = useState('3');
  const [rmCadence, setRmCadence] = useState('90');
  const [rmIsPractice, setRmIsPractice] = useState(false);

  // Password Reset Modal & Management State
  const [resetModalPlayer, setResetModalPlayer] = useState<{
    userId?: number;
    username: string;
    phone?: string;
    requestId?: number;
    notes?: string;
  } | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetCopied, setResetCopied] = useState(false);
  const [resetSuccessData, setResetSuccessData] = useState<{
    username: string;
    tempPassword: string;
  } | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetRejectReasons, setResetRejectReasons] = useState<Record<number, string>>({});

  const generateTempPassword = () => {
    const prefixes = ['Winner', 'Bingo', 'Habesha', 'Lucky'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const symbols = ['#', '!', '$', '@'];
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    return `${prefix}${sym}${num}`;
  };

  const openResetModal = (player: {
    userId?: number;
    username: string;
    phone?: string;
    requestId?: number;
    notes?: string;
  }) => {
    setResetModalPlayer(player);
    setResetPasswordInput(generateTempPassword());
    setResetSuccessData(null);
    setResetCopied(false);
  };

  const prevPendingCountRef = useRef<number>(0);
  const adminTokenRef = useRef<string | null>(null);
  const isFetchingAdminRef = useRef<boolean>(false);
  const adminRateLimitedUntilRef = useRef<number>(0);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const createEmptyDashboardFallback = useCallback((adminUsername = 'habesha_admin') => {
    return {
      serverTimeUtc: new Date().toISOString(),
      adminUsername,
      maintenanceMode: false,
      houseCommissionBps: 2000,
      houseCommissionPercent: 20,
      metrics: {
        totalApprovedDepositsMinor: 0,
        totalApprovedWithdrawalsMinor: 0,
        totalGgrHouseFeeMinor: 0,
        totalPayoutsMinor: 0,
        totalPlayerBalancesMinor: 0,
        totalGamesPlayed: 0,
        houseCommissionBps: 2000,
        houseCommissionPercent: 20,
        activeOnlinePlayers: 0,
        activeRoundPlayersCount: 0,
        activeRoundTicketsCount: 0,
        totalPlayers: 0,
        totalRegisteredUsers: 0,
        activeAccountsCount: 0,
        newRegistrationsTodayCount: 0,
        blockedPlayersCount: 0,
        pendingDepositsCount: 0,
        pendingWithdrawalsCount: 0,
        pendingResetsCount: 0,
        ledgerReconciliation: { reconciledCount: 0, driftCount: 0, discrepancies: [] },
      },
      revenueTimeline30d: [],
      revenueSummary30d: {
        approvedDepositsMinor: 0,
        approvedWithdrawalsMinor: 0,
        netDepositsMinor: 0,
        roundPayoutsMinor: 0,
        totalPayoutsMinor: 0,
        houseFeeMinor: 0,
        gamesPlayedCount: 0,
        totalPotMinor: 0,
        ticketsCount: 0,
        playersWonMinor: 0,
        playersLostMinor: 0,
        peakDailyActivePlayers: 0,
      },
      playerDailyWinLossLogs: [],
      playerGameHistoryLogs: [],
      pendingDeposits: [],
      pendingWithdrawals: [],
      pastDeposits: [],
      pastWithdrawals: [],
      allDepositsLog: [],
      allWithdrawalsLog: [],
      gameCommissionLogs: [],
      pendingResets: [],
      pastResets: [],
      players: [],
      customersList: [],
      rooms: [],
      predeterminedTargets: [],
      bettingSchedule: {
        isBettingOpen: true,
        isPracticeModeOpen: true,
        practiceOffReason: '',
        practiceResumeTime: '',
        isRealGameModeOpen: true,
        realGameOffReason: '',
        realGameResumeTime: '',
        scheduledGameTime: null,
        customNoticeEn: '',
        customNoticeAm: '',
      },
      auditLogs: [],
    };
  }, []);

  const adminFetch = useCallback(async (url: string, init?: RequestInit) => {
    const isGetRequest = !init?.method || init.method.toUpperCase() === 'GET';
    if (isGetRequest && Date.now() < adminRateLimitedUntilRef.current) {
      return new Response(JSON.stringify({ rateLimited: true }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const token = adminTokenRef.current || readStoredAdminToken();
    if (token && !adminTokenRef.current) {
      adminTokenRef.current = token;
    }
    const headers = new Headers(init?.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(url, { ...init, headers, credentials: 'include' });
    if (res.status === 429) {
      adminRateLimitedUntilRef.current = Date.now() + 10000;
    }
    return res;
  }, []);

  const fetchAdminDashboard = useCallback(
    async (force = false): Promise<boolean> => {
      if (force) {
        adminRateLimitedUntilRef.current = 0;
      } else {
        if (isFetchingAdminRef.current) return false;
        if (Date.now() < adminRateLimitedUntilRef.current) return false;
      }
      isFetchingAdminRef.current = true;
      try {
        const token = adminTokenRef.current || readStoredAdminToken();
        if (!token) {
          setAuthenticated(false);
          setLoading(false);
          return false;
        }
        adminTokenRef.current = token;

        const res = await adminFetch('/api/admin', { cache: 'no-store' });
        if (res.status === 401) {
          adminTokenRef.current = null;
          writeStoredAdminToken(null);
          setAuthenticated(false);
          setLoading(false);
          if (force) {
            setLoginError(
              'የአድሚን ሴሽን ጊዜው አልፏል፤ እባክዎ በድጋሚ ይግቡ (Admin session expired, please sign in again)'
            );
          }
          return false;
        }
        if (!res.ok) {
          setLoading(false);
          return false;
        }
        const rawText = await res.text();
        let data: any = null;
        try {
          data = rawText ? JSON.parse(rawText) : null;
        } catch {
          data = null;
        }
        if (!data || typeof data !== 'object') {
          setLoading(false);
          return false;
        }
        setAuthenticated(true);
        setDashboard(data);
        if (data.bettingSchedule && !initializedModeInputsRef.current) {
          initializedModeInputsRef.current = true;
          setPracticeOffReasonInput(data.bettingSchedule.practiceOffReason || '');
          setPracticeResumeTimeInput(data.bettingSchedule.practiceResumeTime || '');
          setRealGameOffReasonInput(data.bettingSchedule.realGameOffReason || '');
          setRealGameResumeTimeInput(data.bettingSchedule.realGameResumeTime || '');
          setScheduleNoticeInput(
            data.bettingSchedule.customNoticeAm || data.bettingSchedule.customNoticeEn || ''
          );
        }
        setLoading(false);

        const totalPending =
          (data.metrics?.pendingDepositsCount || 0) + (data.metrics?.pendingWithdrawalsCount || 0);
        if (totalPending > prevPendingCountRef.current) {
          soundFx.playBallDraw(55, true);
        }
        prevPendingCountRef.current = totalPending;
        return true;
      } catch {
        setLoading(false);
        return false;
      } finally {
        isFetchingAdminRef.current = false;
      }
    },
    [adminFetch]
  );

  useEffect(() => {
    // Always require Admin password immediately when opening the Admin Panel
    adminTokenRef.current = null;
    writeStoredAdminToken(null);
    setAuthenticated(false);
    setLoading(false);
    const focusTimer = setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 30);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchAdminDashboard(false);
    }, 8000);
    const ticker = setInterval(() => setNowTicker(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(ticker);
    };
  }, [authenticated, fetchAdminDashboard]);

  const performAdminLoginRequest = async (loginUser: string, loginPass: string) => {
    if (submittingLogin) return;
    setLoginError(null);

    if (!loginPass) {
      setLoginError(
        'እባክዎ የአድሚን የይለፍ ቃል (Password) ያስገቡ (Please enter the Admin Password)'
      );
      passwordInputRef.current?.focus();
      return;
    }

    const normalizedLoginUser = (loginUser || '0918223401@eic').trim();

    setSubmittingLogin(true);
    adminRateLimitedUntilRef.current = 0;
    isFetchingAdminRef.current = false;

    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'admin_login',
          username: normalizedLoginUser,
          password: loginPass,
        }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (!res.ok || !data?.sessionToken) {
        const fallbackErr =
          res.status === 429
            ? 'ለጥቂት ሰከንዶች ይጠብቁ እና እንደገና ይሞክሩ (Too many requests, please wait a few seconds and try again)'
            : 'የአድሚን የይለፍ ቃል ተሳስቷል (Invalid admin password)';
        setLoginError(data?.error || fallbackErr);
        setSubmittingLogin(false);
        passwordInputRef.current?.focus();
        return;
      }

      adminTokenRef.current = data.sessionToken;
      setPassword('');
      setDashboard((prev: any) =>
        prev || createEmptyDashboardFallback(data.adminUsername || normalizedLoginUser)
      );
      setAuthenticated(true);
      setSubmittingLogin(false);
      void fetchAdminDashboard(true);
    } catch {
      setLoginError(
        'የኢንተርኔት ግንኙነት ችግር አጋጥሟል፤ እባክዎ እንደገና ይሞክሩ (Network error — please try again)'
      );
      setSubmittingLogin(false);
    }
  };

  const handleAdminLogin = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const effectiveUsername = (username || usernameInputRef.current?.value || '0918223401@eic').trim();
    const effectivePassword = (password || passwordInputRef.current?.value || '').trim();
    await performAdminLoginRequest(effectiveUsername, effectivePassword);
  };

  const runAdminAction = async (payload: Record<string, unknown>, successMsg: string) => {
    setActionBanner(null);
    const act = String(payload.action || '');
    const nowIso = new Date().toISOString();

    const isDepositAction = act === 'approve_deposit' || act === 'reject_deposit';
    const isWithdrawalAction = act === 'approve_withdrawal' || act === 'reject_withdrawal';
    const queueLockKey = isDepositAction
      ? `dep_${Number(payload.depositId)}`
      : isWithdrawalAction
      ? `wd_${Number(payload.withdrawalId)}`
      : null;

    if (queueLockKey) {
      if (processingQueueRef.current.has(queueLockKey)) {
        return false;
      }
      processingQueueRef.current.add(queueLockKey);
      setProcessingQueueRequests((prev) => ({ ...prev, [queueLockKey]: true }));
    }

    // Optimistic Auto-Archive: Immediately remove Approved/Rejected Deposit or Withdrawal from Pending Queue
    // and move it to the dedicated Reports / History section
    if (dashboard && (isDepositAction || isWithdrawalAction)) {
      setDashboard((prev: any) => {
        if (!prev) return prev;
        if (isDepositAction) {
          const depId = Number(payload.depositId);
          const targetDep = (prev.pendingDeposits || []).find((d: any) => d.id === depId);
          if (!targetDep) return prev;
          const nextStatus = act === 'approve_deposit' ? 'APPROVED' : 'REJECTED';
          const nextReason =
            act === 'approve_deposit'
              ? 'Verified and approved by Admin'
              : String(payload.reason || 'Rejected by Admin');
          const archivedDep = {
            ...targetDep,
            status: nextStatus,
            decidedAt: nowIso,
            decisionReason: nextReason,
            dateKey: nowIso.slice(0, 10),
          };
          const nextPendingDeposits = (prev.pendingDeposits || []).filter((d: any) => d.id !== depId);
          const nextPastDeposits = [
            archivedDep,
            ...(prev.pastDeposits || []).filter((d: any) => d.id !== depId),
          ];
          const nextAllDepositsLog = [
            archivedDep,
            ...(prev.allDepositsLog || []).filter((d: any) => d.id !== depId),
          ];
          return {
            ...prev,
            pendingDeposits: nextPendingDeposits,
            pastDeposits: nextPastDeposits,
            allDepositsLog: nextAllDepositsLog,
            metrics: {
              ...prev.metrics,
              pendingDepositsCount: nextPendingDeposits.length,
            },
          };
        } else {
          const wdId = Number(payload.withdrawalId);
          const targetWd = (prev.pendingWithdrawals || []).find((w: any) => w.id === wdId);
          if (!targetWd) return prev;
          const nextStatus = act === 'approve_withdrawal' ? 'APPROVED' : 'REJECTED';
          const nextReason =
            act === 'approve_withdrawal'
              ? `Paid via ${targetWd.provider}`
              : String(payload.reason || 'Rejected by Admin');
          const archivedWd = {
            ...targetWd,
            status: nextStatus,
            decidedAt: nowIso,
            decisionReason: nextReason,
            dateKey: nowIso.slice(0, 10),
          };
          const nextPendingWithdrawals = (prev.pendingWithdrawals || []).filter(
            (w: any) => w.id !== wdId
          );
          const nextPastWithdrawals = [
            archivedWd,
            ...(prev.pastWithdrawals || []).filter((w: any) => w.id !== wdId),
          ];
          const nextAllWithdrawalsLog = [
            archivedWd,
            ...(prev.allWithdrawalsLog || []).filter((w: any) => w.id !== wdId),
          ];
          return {
            ...prev,
            pendingWithdrawals: nextPendingWithdrawals,
            pastWithdrawals: nextPastWithdrawals,
            allWithdrawalsLog: nextAllWithdrawalsLog,
            metrics: {
              ...prev.metrics,
              pendingWithdrawalsCount: nextPendingWithdrawals.length,
            },
          };
        }
      });
    }

    try {
      const res = await adminFetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({ type: 'error', text: data.error || 'Operation failed' });
        await fetchAdminDashboard();
        return false;
      }
      setActionBanner({ type: 'success', text: successMsg });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            'winner_bingo_live_config_sync',
            JSON.stringify({ payload, ts: Date.now() })
          );
        } catch {
          // Ignore storage error
        }
      }
      await fetchAdminDashboard();
      return true;
    } catch {
      setActionBanner({ type: 'error', text: 'Network error executing admin action' });
      await fetchAdminDashboard();
      return false;
    } finally {
      if (queueLockKey) {
        processingQueueRef.current.delete(queueLockKey);
        setProcessingQueueRequests((prev) => {
          const next = { ...prev };
          delete next[queueLockKey];
          return next;
        });
      }
    }
  };

  const fetchAdminPlayerHistory = useCallback(
    async (opts?: {
      username?: string;
      mode?: 'LIVE' | 'PRACTICE';
      dateFrom?: string;
      dateTo?: string;
      page?: number;
    }) => {
      const targetUsername = (opts?.username ?? adminHistoryUsername).trim();
      const targetMode = opts?.mode ?? adminHistoryMode;
      const targetDateFrom = opts?.dateFrom ?? adminHistoryDateFrom;
      const targetDateTo = opts?.dateTo ?? adminHistoryDateTo;
      const targetPage = opts?.page ?? adminHistoryPage;

      if (!targetUsername) {
        setAdminHistoryError(
          'እባክዎ የተጫዋች ስም ያስገቡ (Please enter a player username to search).'
        );
        setAdminHistoryData(null);
        return;
      }

      setAdminHistoryLoading(true);
      setAdminHistoryError(null);
      try {
        const res = await adminFetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'search_player_history',
            username: targetUsername,
            mode: targetMode,
            dateFrom: targetDateFrom,
            dateTo: targetDateTo,
            page: targetPage,
            pageSize: 10,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAdminHistoryData(null);
          setAdminHistoryError(
            data.error || `User not found: "${targetUsername}" — ተጫዋቹ አልተገኘም!`
          );
          setAdminHistoryLoading(false);
          return;
        }
        setAdminHistoryData(data);
        setAdminHistoryLoading(false);
      } catch {
        setAdminHistoryError('Network error while searching player game history.');
        setAdminHistoryLoading(false);
      }
    },
    [
      adminFetch,
      adminHistoryUsername,
      adminHistoryMode,
      adminHistoryDateFrom,
      adminHistoryDateTo,
      adminHistoryPage,
    ]
  );

  // Sanitize exported text fields to prevent CSV/Formula injection (escape fields starting with =, +, -, @, \t, \r)
  const sanitizeSpreadsheetField = useCallback((val: unknown): string => {
    const raw = String(val ?? '').replace(/[\r\n\t]+/g, ' ');
    if (!raw || raw === '-') return raw;
    // Prefix with a single quote if the field starts with formula trigger characters (=, +, -, @, \t, \r)
    if (/^\s*[=+\-@]/.test(raw)) {
      return `'${raw}`;
    }
    return raw;
  }, []);

  const escapeCsvCellSafe = useCallback(
    (val: unknown): string => {
      const sanitized = sanitizeSpreadsheetField(val);
      return `"${sanitized.replace(/"/g, '""')}"`;
    },
    [sanitizeSpreadsheetField]
  );

  // Admin Data Export (Download Feature): Export all registered players' Daily Balances, Phone Numbers, Game History & Timestamps in CSV or Excel format
  const handleExportAllPlayersReport = useCallback(
    (format: 'csv' | 'excel' = 'csv') => {
      // Strictly restricted to authenticated Admins only
      if (!authenticated || !adminTokenRef.current || !dashboard) return;
      const playersList: any[] = Array.isArray(dashboard.players) ? dashboard.players : [];
      const dailyLogs: any[] = Array.isArray(dashboard.playerDailyWinLossLogs)
        ? dashboard.playerDailyWinLossLogs
        : [];
      const historyLogs: any[] = Array.isArray(dashboard.playerGameHistoryLogs)
        ? dashboard.playerGameHistoryLogs
        : [];

      const formatTs = (iso?: string | null) => {
        if (!iso) return '-';
        try {
          return new Date(iso).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' });
        } catch {
          return String(iso);
        }
      };

      // Aggregate per-player game totals so every registered player row has complete game history totals + daily balance
      const perPlayerTotals = new Map<
        number,
        {
          gamesPlayed: number;
          ticketsCount: number;
          winsCount: number;
          lossesCount: number;
          wonMinor: number;
          lostMinor: number;
          stakedMinor: number;
          depositsMinor: number;
          withdrawalsMinor: number;
        }
      >();
      for (const row of dailyLogs) {
        const cur = perPlayerTotals.get(row.userId) || {
          gamesPlayed: 0,
          ticketsCount: 0,
          winsCount: 0,
          lossesCount: 0,
          wonMinor: 0,
          lostMinor: 0,
          stakedMinor: 0,
          depositsMinor: 0,
          withdrawalsMinor: 0,
        };
        cur.gamesPlayed += Number(row.gamesPlayedCount || 0);
        cur.ticketsCount += Number(row.ticketsCount || 0);
        cur.winsCount += Number(row.winsCount || 0);
        cur.lossesCount += Number(row.lossesCount || 0);
        cur.wonMinor += Number(row.wonMinor || 0);
        cur.lostMinor += Number(row.lostMinor || 0);
        cur.stakedMinor += Number(row.totalStakedMinor || 0);
        cur.depositsMinor += Number(row.approvedDepositsMinor || 0);
        cur.withdrawalsMinor += Number(row.approvedWithdrawalsMinor || 0);
        perPlayerTotals.set(row.userId, cur);
      }

      const section1Headers = [
        'Player ID',
        'Player Name / Username (የተጫዋች ስም)',
        'Phone Number (ስልክ ቁጥር)',
        'Account Status',
        'Daily / Real Balance (ETB)',
        'Locked Balance (ETB)',
        'Practice Balance (ETB)',
        'Total Games Played',
        'Total Cartelas Bought',
        'Total Wins Count',
        'Total Won Amount (ETB)',
        'Total Losses Count',
        'Total Lost Amount (ETB)',
        'Net Win/Loss (ETB)',
        'Approved Deposits (ETB)',
        'Approved Withdrawals (ETB)',
        'Registration Timestamp (Date/Time)',
        'Last Active Timestamp (Date/Time)',
      ];

      const section1Rows = playersList.map((p) => {
        const t = perPlayerTotals.get(p.id) || {
          gamesPlayed: 0,
          ticketsCount: 0,
          winsCount: 0,
          lossesCount: 0,
          wonMinor: 0,
          lostMinor: 0,
          stakedMinor: 0,
          depositsMinor: 0,
          withdrawalsMinor: 0,
        };
        const netMinor = t.wonMinor - t.stakedMinor;
        return [
          `#${p.id}`,
          sanitizeSpreadsheetField(p.username || `Player #${p.id}`),
          sanitizeSpreadsheetField(p.phone || '-'),
          sanitizeSpreadsheetField(p.status || 'ACTIVE'),
          ((p.balanceMinor || 0) / 100).toFixed(2),
          ((p.lockedMinor || 0) / 100).toFixed(2),
          ((p.playBalanceMinor || 0) / 100).toFixed(2),
          String(t.gamesPlayed),
          String(t.ticketsCount),
          String(t.winsCount),
          (t.wonMinor / 100).toFixed(2),
          String(t.lossesCount),
          (t.lostMinor / 100).toFixed(2),
          (netMinor / 100).toFixed(2),
          (t.depositsMinor / 100).toFixed(2),
          (t.withdrawalsMinor / 100).toFixed(2),
          formatTs(p.createdAt),
          formatTs(p.lastActiveAt),
        ];
      });

      const section2Headers = [
        'Date (YYYY-MM-DD)',
        'Player ID',
        'Player Name / Username (የተጫዋች ስም)',
        'Phone Number (ስልክ ቁጥር)',
        'Daily / Current Balance (ETB)',
        'Daily Games Played',
        'Daily Cartelas Bought',
        'Daily Wins Count',
        'Daily Won Amount (ETB)',
        'Daily Losses Count',
        'Daily Lost Amount (ETB)',
        'Daily Total Staked (ETB)',
        'Daily Net Win/Loss (ETB)',
        'Daily Approved Deposits (ETB)',
        'Daily Approved Withdrawals (ETB)',
      ];

      const section2Rows = dailyLogs.map((r) => [
        r.date || '-',
        `#${r.userId}`,
        sanitizeSpreadsheetField(r.username || `Player #${r.userId}`),
        sanitizeSpreadsheetField(r.phone || '-'),
        ((r.currentBalanceMinor || 0) / 100).toFixed(2),
        String(r.gamesPlayedCount || 0),
        String(r.ticketsCount || 0),
        String(r.winsCount || 0),
        ((r.wonMinor || 0) / 100).toFixed(2),
        String(r.lossesCount || 0),
        ((r.lostMinor || 0) / 100).toFixed(2),
        ((r.totalStakedMinor || 0) / 100).toFixed(2),
        ((r.netWinLossMinor || 0) / 100).toFixed(2),
        ((r.approvedDepositsMinor || 0) / 100).toFixed(2),
        ((r.approvedWithdrawalsMinor || 0) / 100).toFixed(2),
      ]);

      const section3Headers = [
        'Timestamp (Date/Time)',
        'Date (YYYY-MM-DD)',
        'Player ID',
        'Player Name / Username (የተጫዋች ስም)',
        'Phone Number (ስልክ ቁጥር)',
        'Player Daily Balance (ETB)',
        'Round ID',
        'Room Name',
        'Game Mode',
        'Winning Pattern',
        'Cartela Number',
        'Stake / Bet Paid (ETB)',
        'Game Result',
        'Won Amount (ETB)',
        'Lost Amount (ETB)',
        'Net Profit/Loss (ETB)',
        'Balls Drawn',
      ];

      const section3Rows = historyLogs.map((gh) => [
        formatTs(gh.timestampUtc),
        gh.dateKey || '-',
        `#${gh.userId}`,
        sanitizeSpreadsheetField(gh.username || `Player #${gh.userId}`),
        sanitizeSpreadsheetField(gh.phone || '-'),
        ((gh.currentBalanceMinor || 0) / 100).toFixed(2),
        `Round #${gh.roundId}`,
        sanitizeSpreadsheetField(`${gh.roomNameAm || ''} (${gh.roomNameEn || 'Bingo Room'})`),
        sanitizeSpreadsheetField(gh.modeTag || 'LIVE'),
        sanitizeSpreadsheetField(gh.winningPattern || 'ONE_LINE'),
        `Cartela #${gh.cardIndex}`,
        ((gh.pricePaidMinor || 0) / 100).toFixed(2),
        sanitizeSpreadsheetField(gh.result || gh.roundStatus || '-'),
        ((gh.wonAmountMinor || 0) / 100).toFixed(2),
        ((gh.lostAmountMinor || 0) / 100).toFixed(2),
        ((gh.netProfitLossMinor || 0) / 100).toFixed(2),
        `${gh.drawnCount || 0}/75`,
      ]);

      const exportedAtStr = formatTs(dashboard.serverTimeUtc || new Date().toISOString());
      const dateStamp = new Date().toISOString().slice(0, 10);

      if (format === 'excel') {
        const tsvLines = [
          `'# WINNER BINGO ADMIN EXPORT REPORT (Generated: ${exportedAtStr})`,
          `'# 1. ALL REGISTERED PLAYERS DAILY BALANCES & SUMMARY (${playersList.length} Players)`,
          section1Headers.map(sanitizeSpreadsheetField).join('\t'),
          ...section1Rows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
          '',
          `'# 2. PLAYER DAILY BALANCES & WIN/LOSS LOGS BY DATE (${dailyLogs.length} Records)`,
          section2Headers.map(sanitizeSpreadsheetField).join('\t'),
          ...section2Rows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
          '',
          `'# 3. ALL PLAYERS DETAILED GAME HISTORY & TIMESTAMPS (${historyLogs.length} Game Entries)`,
          section3Headers.map(sanitizeSpreadsheetField).join('\t'),
          ...section3Rows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
        ];
        const excelContent = '\uFEFF' + tsvLines.join('\r\n');
        const blob = new Blob([excelContent], {
          type: 'application/vnd.ms-excel;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `winner-bingo-admin-players-balances-and-game-history-${dateStamp}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const csvLines = [
        escapeCsvCellSafe(`# WINNER BINGO ADMIN EXPORT REPORT (Generated: ${exportedAtStr})`),
        escapeCsvCellSafe(
          `# 1. ALL REGISTERED PLAYERS DAILY BALANCES & SUMMARY (${playersList.length} Players)`
        ),
        section1Headers.map(escapeCsvCellSafe).join(','),
        ...section1Rows.map((r) => r.map(escapeCsvCellSafe).join(',')),
        '',
        escapeCsvCellSafe(
          `# 2. PLAYER DAILY BALANCES & WIN/LOSS LOGS BY DATE (${dailyLogs.length} Records)`
        ),
        section2Headers.map(escapeCsvCellSafe).join(','),
        ...section2Rows.map((r) => r.map(escapeCsvCellSafe).join(',')),
        '',
        escapeCsvCellSafe(
          `# 3. ALL PLAYERS DETAILED GAME HISTORY & TIMESTAMPS (${historyLogs.length} Game Entries)`
        ),
        section3Headers.map(escapeCsvCellSafe).join(','),
        ...section3Rows.map((r) => r.map(escapeCsvCellSafe).join(',')),
      ];
      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `winner-bingo-admin-players-balances-and-game-history-${dateStamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [authenticated, dashboard, sanitizeSpreadsheetField, escapeCsvCellSafe]
  );

  // Export Customer Registration Data (Excluding Passwords, Hashes, Tokens, or Sensitive Auth Data)
  const handleExportCustomersList = useCallback(
    (format: 'csv' | 'excel' = 'csv') => {
      // Strictly restricted to authenticated Admins only
      if (!authenticated || !adminTokenRef.current || !dashboard) return;
      const rawCustomers: any[] = Array.isArray(dashboard.customersList)
        ? dashboard.customersList
        : Array.isArray(dashboard.players)
        ? dashboard.players
        : [];

      const formatTs = (iso?: string | null) => {
        if (!iso) return '-';
        try {
          return new Date(iso).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' });
        } catch {
          return String(iso);
        }
      };

      // STRICT SECURITY REQUIREMENT: Explicitly sanitize and pick ONLY safe customer registration fields
      // (Never include password, passwordHash, token, sessionToken, activeSessionId, sessionVersion, or auth secrets)
      const safeCustomers = rawCustomers.map((c) => {
        const sanitized = { ...c };
        delete sanitized.password;
        delete sanitized.passwordHash;
        delete sanitized.password_hash;
        delete sanitized.token;
        delete sanitized.sessionToken;
        delete sanitized.activeSessionId;
        delete sanitized.sessionVersion;
        delete sanitized.deviceFingerprint;

        const userId = sanitized.userId ?? sanitized.id;
        return {
          userId: `#${userId}`,
          customerUid: sanitizeSpreadsheetField(sanitized.customerUid || sanitized.uid || `u_${userId}`),
          fullNameOrUsername: sanitizeSpreadsheetField(
            sanitized.fullNameOrUsername || sanitized.username || `Player #${userId}`
          ),
          loginUsername: sanitizeSpreadsheetField(
            sanitized.loginUsername || sanitized.username || `player_${userId}`
          ),
          phone: sanitizeSpreadsheetField(sanitized.phone || '-'),
          email: sanitizeSpreadsheetField(sanitized.email || '-'),
          dob: sanitizeSpreadsheetField(sanitized.dob || '-'),
          accountStatus: sanitizeSpreadsheetField(sanitized.accountStatus || sanitized.status || 'ACTIVE'),
          registrationDate: formatTs(sanitized.registrationDate || sanitized.createdAt),
          lastActiveAt: formatTs(sanitized.lastActiveAt),
          termsVersion: sanitizeSpreadsheetField(sanitized.termsVersion || '1.0'),
          walletBalanceEtb: (((sanitized.balanceMinor || 0) as number) / 100).toFixed(2),
          blockedReason: sanitizeSpreadsheetField(sanitized.blockedReason || '-'),
        };
      });

      const headers = [
        'User ID',
        'Customer UID',
        'Full Name / Username (ሙሉ ስም / የተጫዋች ስም)',
        'Login Identifier (የመግቢያ መለያ)',
        'Phone Number (ስልክ ቁጥር)',
        'Email Address (ኢሜይል)',
        'Date of Birth / 18+ (የትውልድ ቀን)',
        'Account Status (የአካውንት ሁኔታ)',
        'Registration Date & Time (የተመዘገበበት ቀን እና ሰዓት)',
        'Last Active Date & Time (መጨረሻ የገባበት ጊዜ)',
        'Terms Version Accepted',
        'Current Real Balance (ETB)',
        'Blocked Reason (ካለ)',
      ];

      const rows = safeCustomers.map((c) => [
        c.userId,
        c.customerUid,
        c.fullNameOrUsername,
        c.loginUsername,
        c.phone,
        c.email,
        c.dob,
        c.accountStatus,
        c.registrationDate,
        c.lastActiveAt,
        c.termsVersion,
        c.walletBalanceEtb,
        c.blockedReason,
      ]);

      const exportedAtStr = formatTs(dashboard.serverTimeUtc || new Date().toISOString());
      const dateStamp = new Date().toISOString().slice(0, 10);

      if (format === 'excel') {
        const tsvLines = [
          `'# WINNER BINGO REGISTERED CUSTOMERS LIST (Total Registered Users: ${safeCustomers.length} · Generated: ${exportedAtStr})`,
          `'# SECURITY NOTICE: Passwords, Password Hashes, and Authentication Tokens are strictly excluded`,
          headers.map(sanitizeSpreadsheetField).join('\t'),
          ...rows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
        ];
        const excelContent = '\uFEFF' + tsvLines.join('\r\n');
        const blob = new Blob([excelContent], {
          type: 'application/vnd.ms-excel;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `winner-bingo-customers-registration-list-${dateStamp}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const csvLines = [
        escapeCsvCellSafe(
          `# WINNER BINGO REGISTERED CUSTOMERS LIST (Total Registered Users: ${safeCustomers.length} · Generated: ${exportedAtStr})`
        ),
        escapeCsvCellSafe(
          `# SECURITY NOTICE: Passwords, Password Hashes, and Authentication Tokens are strictly excluded`
        ),
        headers.map(escapeCsvCellSafe).join(','),
        ...rows.map((r) => r.map(escapeCsvCellSafe).join(',')),
      ];
      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `winner-bingo-customers-registration-list-${dateStamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [authenticated, dashboard, sanitizeSpreadsheetField, escapeCsvCellSafe]
  );

  // Format exact timestamp showing Date, Hour, Minute, and Second clearly (Africa/Addis_Ababa UTC+3)
  const formatExactTimestamp = useCallback((iso?: string | Date | null): string => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      const addisMs = d.getTime() + 3 * 60 * 60 * 1000;
      const addisIso = new Date(addisMs).toISOString();
      const datePart = addisIso.slice(0, 10); // YYYY-MM-DD
      const timePart = addisIso.slice(11, 19); // HH:MM:SS (24h with exact seconds)
      const readableTime = d.toLocaleTimeString('en-US', {
        timeZone: 'Africa/Addis_Ababa',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      return `${datePart} ${timePart} (${readableTime})`;
    } catch {
      return String(iso);
    }
  }, []);

  const toAddisDateOnly = useCallback((iso?: string | Date | null): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const addisMs = d.getTime() + 3 * 60 * 60 * 1000;
      return new Date(addisMs).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }, []);

  // Export Auto-Archived Deposit & Withdrawal Reports (Approved & Rejected) with Date-Range Filter in CSV or Excel format
  const handleExportArchivedRequestsReport = useCallback(
    (format: 'csv' | 'excel' = 'csv') => {
      // Strictly restricted to authenticated Admins only
      if (!authenticated || !adminTokenRef.current || !dashboard) return;
      const rawDeposits: any[] = (dashboard.allDepositsLog || dashboard.pastDeposits || []).filter(
        (d: any) => d.status === 'APPROVED' || d.status === 'REJECTED'
      );
      const rawWithdrawals: any[] = (
        dashboard.allWithdrawalsLog ||
        dashboard.pastWithdrawals ||
        []
      ).filter((w: any) => w.status === 'APPROVED' || w.status === 'REJECTED');

      const combinedArchived = [
        ...rawDeposits.map((d: any) => ({
          id: d.id,
          requestType: 'DEPOSIT (ገቢ)',
          typeCode: 'DEPOSIT',
          userId: d.userId,
          username: d.username || `Player #${d.userId}`,
          phone: d.phone || '-',
          amountMinor: d.amountMinor || 0,
          provider: d.provider || 'TELEBIRR',
          referenceOrAccount: d.transactionRef || '-',
          status: d.status,
          requestedAt: d.createdAt,
          decidedAt: d.decidedAt || d.createdAt,
          decisionReason: d.decisionReason || '-',
          filterDateKey:
            d.dateKey || toAddisDateOnly(d.decidedAt || d.createdAt),
        })),
        ...rawWithdrawals.map((w: any) => ({
          id: w.id,
          requestType: 'WITHDRAWAL (ወጪ)',
          typeCode: 'WITHDRAWAL',
          userId: w.userId,
          username: w.username || `Player #${w.userId}`,
          phone: w.phone || '-',
          amountMinor: w.amountMinor || 0,
          provider: w.provider || 'TELEBIRR',
          referenceOrAccount: w.payoutAccount || '-',
          status: w.status,
          requestedAt: w.createdAt,
          decidedAt: w.decidedAt || w.createdAt,
          decisionReason: w.decisionReason || '-',
          filterDateKey:
            w.dateKey || toAddisDateOnly(w.decidedAt || w.createdAt),
        })),
      ]
        .filter((item) => {
          if (dwReportTypeFilter !== 'ALL' && item.typeCode !== dwReportTypeFilter) return false;
          if (dwReportStatusFilter !== 'ALL' && item.status !== dwReportStatusFilter) return false;
          if (dwReportDateFrom && item.filterDateKey && item.filterDateKey < dwReportDateFrom) {
            return false;
          }
          if (dwReportDateTo && item.filterDateKey && item.filterDateKey > dwReportDateTo) {
            return false;
          }
          return true;
        })
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.requestedAt || 0).getTime() -
            new Date(a.decidedAt || a.requestedAt || 0).getTime()
        );

      const headers = [
        'Request ID',
        'Request Type (የጥያቄ አይነት)',
        'Final Status (ውሳኔ / Status)',
        'Request Timestamp — Date, Hour, Min, Sec (የተጠየቀበት ቀን እና ሰዓት)',
        'Action / Decision Timestamp — Date, Hour, Min, Sec (የጸደቀበት/ውድቅ የተደረገበት ሰዓት)',
        'Player ID',
        'Player Username (የተጫዋች ስም)',
        'Phone Number (ስልክ ቁጥር)',
        'Amount (ETB)',
        'Payment Provider (ክፍያ አማራጭ)',
        'Transaction Ref / Payout Account (ደረሰኝ / አካውንት)',
        'Admin Decision Note / Reason (ምክንያት / ማብራሪያ)',
      ];

      const rows = combinedArchived.map((r) => [
        `#${r.id}`,
        r.requestType,
        r.status === 'APPROVED' ? 'APPROVED (ጸድቋል)' : 'REJECTED (ውድቅ)',
        formatExactTimestamp(r.requestedAt),
        formatExactTimestamp(r.decidedAt),
        `#${r.userId}`,
        sanitizeSpreadsheetField(r.username),
        sanitizeSpreadsheetField(r.phone),
        (r.amountMinor / 100).toFixed(2),
        sanitizeSpreadsheetField(r.provider),
        sanitizeSpreadsheetField(r.referenceOrAccount),
        sanitizeSpreadsheetField(r.decisionReason),
      ]);

      const exportedAtStr = formatExactTimestamp(
        dashboard.serverTimeUtc || new Date().toISOString()
      );
      const dateRangeLabel =
        dwReportDateFrom || dwReportDateTo
          ? `${dwReportDateFrom || 'start'}_to_${dwReportDateTo || 'today'}`
          : new Date().toISOString().slice(0, 10);

      if (format === 'excel') {
        const tsvLines = [
          `'# WINNER BINGO ARCHIVED DEPOSIT & WITHDRAWAL REPORTS (${combinedArchived.length} Records · Generated: ${exportedAtStr})`,
          `'# Filter: Type=${dwReportTypeFilter} | Status=${dwReportStatusFilter} | Date Range=${dwReportDateFrom || 'ALL'} to ${dwReportDateTo || 'ALL'}`,
          headers.map(sanitizeSpreadsheetField).join('\t'),
          ...rows.map((r) => r.map(sanitizeSpreadsheetField).join('\t')),
        ];
        const excelContent = '\uFEFF' + tsvLines.join('\r\n');
        const blob = new Blob([excelContent], {
          type: 'application/vnd.ms-excel;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `winner-bingo-deposit-withdrawal-reports-${dateRangeLabel}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const csvLines = [
        escapeCsvCellSafe(
          `# WINNER BINGO ARCHIVED DEPOSIT & WITHDRAWAL REPORTS (${combinedArchived.length} Records · Generated: ${exportedAtStr})`
        ),
        escapeCsvCellSafe(
          `# Filter: Type=${dwReportTypeFilter} | Status=${dwReportStatusFilter} | Date Range=${dwReportDateFrom || 'ALL'} to ${dwReportDateTo || 'ALL'}`
        ),
        headers.map(escapeCsvCellSafe).join(','),
        ...rows.map((r) => r.map(escapeCsvCellSafe).join(',')),
      ];
      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `winner-bingo-deposit-withdrawal-reports-${dateRangeLabel}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [
      authenticated,
      dashboard,
      dwReportDateFrom,
      dwReportDateTo,
      dwReportTypeFilter,
      dwReportStatusFilter,
      formatExactTimestamp,
      toAddisDateOnly,
      sanitizeSpreadsheetField,
      escapeCsvCellSafe,
    ]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p className="text-xs font-mono">Loading Admin Console...</p>
      </div>
    );
  }

  if (!authenticated || !dashboard) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400">
              <Lock className="w-3.5 h-3.5" />
              የአድሚን መግቢያ · Admin Security Gate
            </span>
            {onBackToPlayer ? (
              <button
                type="button"
                onClick={onBackToPlayer}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors cursor-pointer"
              >
                ← ወደ ጨዋታው ተመለስ
              </button>
            ) : (
              <Link
                href="/"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
              >
                ← ወደ ጨዋታው ተመለስ
              </Link>
            )}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              Winner Bingo · የአድሚን የይለፍ ቃል መጠየቂያ
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              ወደ አድሚን ዳሽቦርድ ለመግባት እባክዎ የአድሚን የይለፍ ቃልዎን (Admin Password) ያስገቡ።
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-xl bg-red-950/90 border-2 border-red-500 text-xs sm:text-sm font-bold text-red-200 flex items-start gap-2.5 shadow-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} noValidate autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-xs font-extrabold text-amber-300 mb-1.5">
                🔑 የይለፍ ቃል (Admin Password) *
              </label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  required
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="የአድሚን የይለፍ ቃል ያስገቡ (Enter Admin Password)"
                  className="w-full h-12 pl-3.5 pr-10 rounded-xl bg-slate-950 border-2 border-amber-400/80 focus:border-emerald-400 focus:outline-none text-sm text-white font-mono shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                የአድሚን ስም (Admin Username)
              </label>
              <input
                ref={usernameInputRef}
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="0918223401@eic ወይም habesha_admin"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-xs sm:text-sm text-white font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={submittingLogin}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs sm:text-sm cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {submittingLogin && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              <span>
                {submittingLogin
                  ? 'ወደ አድሚን ዳሽቦርድ በመግባት ላይ... (Signing in...)'
                  : 'ወደ አድሚን መቆጣጠሪያ ዳሽቦርድ ግባ (Sign In)'}
              </span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const m = dashboard.metrics;
  const totalPendingCount = (m.pendingDepositsCount || 0) + (m.pendingWithdrawalsCount || 0);

  const filteredPlayers = (dashboard.players || []).filter((p: any) => {
    const matchesSearch =
      !playerSearch ||
      p.username.toLowerCase().includes(playerSearch.toLowerCase()) ||
      (p.email && p.email.toLowerCase().includes(playerSearch.toLowerCase()));
    if (!matchesSearch) return false;
    if (playerStatusFilter === 'IN_ROUND') return p.inActiveRound;
    if (playerStatusFilter === 'ONLINE') return p.isOnline;
    if (playerStatusFilter === 'ACTIVE') return p.status === 'ACTIVE';
    if (playerStatusFilter === 'BLOCKED') return p.status === 'BLOCKED';
    return true;
  });

  const currentTargetRoom =
    quickTargetRoomId === 'ALL'
      ? (dashboard.rooms || []).find((r: any) => !r.isPractice) || dashboard.rooms?.[0]
      : (dashboard.rooms || []).find((r: any) => String(r.id) === quickTargetRoomId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      {/* Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 sm:gap-8">
          <span className="font-display text-base sm:text-lg font-bold text-white whitespace-nowrap shrink-0">
            Winner Bingo · የአድሚን መቆጣጠሪያ (Admin Panel)
          </span>

          <nav className="flex items-center gap-5 text-xs font-medium text-slate-300 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('revenue')}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'revenue' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              የዕለታዊ ፋይናንስ ሪፖርት / Daily Financial Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('players')}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'players' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              ተጫዋቾች እና ሂሳብ / Players ({m.totalPlayers})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`whitespace-nowrap shrink-0 py-1 flex items-center gap-1.5 ${
                activeTab === 'history' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              <span>የተጫዋች ታሪክ ፍለጋ / Player History Search</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'rooms' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              የጨዋታ ህግ (ዝግ) እና ክፍሎች / Rooms
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('queues')}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'queues' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              ገቢ እና ወጪ / Queues ({totalPendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('resets')}
              className={`whitespace-nowrap shrink-0 py-1 flex items-center gap-1.5 ${
                activeTab === 'resets' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>የይለፍ ቃል ጥያቄዎች / Password Resets</span>
              {(dashboard?.metrics?.pendingResetsCount || dashboard?.pendingResets?.length || 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-bold text-[10px]">
                  {dashboard?.metrics?.pendingResetsCount || dashboard?.pendingResets?.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'audit' ? 'text-emerald-400 font-bold underline underline-offset-8' : ''
              }`}
            >
              የግብይት እና ኮሚሽን ኦዲት / Transaction & Game Audit Logs
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportCustomersList('csv')}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
              title="Download all registered customers' registration profile details in CSV format (Strictly excludes passwords)"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Export Customers List (CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportAllPlayersReport('csv')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
              title="Download all registered players' Daily Balances, Phone Numbers, Game History & Timestamps in CSV format"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download / Export Report (CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportAllPlayersReport('excel')}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
              title="Download all registered players' Daily Balances, Phone Numbers, Game History & Timestamps in Excel format"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel (.xls)</span>
            </button>

            {onBackToPlayer ? (
              <button
                type="button"
                onClick={() => {
                  adminTokenRef.current = null;
                  writeStoredAdminToken(null);
                  setAuthenticated(false);
                  onBackToPlayer();
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-emerald-400 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                ← ወደ መጫወቻ ገጽ (Player View)
              </button>
            ) : (
              <Link
                href="/"
                onClick={() => {
                  adminTokenRef.current = null;
                  writeStoredAdminToken(null);
                  setAuthenticated(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-emerald-400 hover:bg-slate-800 whitespace-nowrap"
              >
                ወደ መጫወቻ ገጽ (Player View)
              </Link>
            )}

            <button
              type="button"
              onClick={() =>
                runAdminAction(
                  { action: 'toggle_maintenance', enabled: !dashboard.maintenanceMode },
                  `Maintenance mode ${!dashboard.maintenanceMode ? 'ENABLED' : 'DISABLED'}`
                )
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                dashboard.maintenanceMode
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {dashboard.maintenanceMode ? 'Maintenance ON' : 'Maintenance OFF'}
            </button>

            <button
              type="button"
              onClick={async () => {
                await adminFetch('/api/admin', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'admin_logout' }),
                });
                adminTokenRef.current = null;
                writeStoredAdminToken(null);
                setAuthenticated(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-red-300 whitespace-nowrap"
            >
              ውጣ (Sign Out)
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* ====================================================================
            TOTAL REGISTERED USERS COUNTER & CUSTOMER REGISTRATION EXPORT CARD
            (Dynamic live counter + Export Customers List in CSV & Excel, excluding passwords)
           ==================================================================== */}
        <div className="bg-slate-900 border-2 border-sky-500/40 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 text-sky-400" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                  ጠቅላላ የተመዘገቡ ደንበኞች / Total Registered Users Counter
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-mono font-bold text-emerald-300">
                  ● LIVE AUTO-SYNC
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-3 font-mono tabular-nums">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {m.totalRegisteredUsers ?? m.totalPlayers ?? 0}
                </span>
                <span className="text-xs sm:text-sm font-sans font-bold text-slate-300">
                  Registered Customers / Players (የተመዘገቡ ተጫዋቾች)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5 font-mono">
                <span className="text-emerald-400 font-semibold">
                  ንቁ (Active): {m.activeAccountsCount ?? (m.totalPlayers - (m.blockedPlayersCount || 0))}
                </span>
                <span>·</span>
                <span className="text-sky-300 font-semibold">
                  ዛሬ የተመዘገቡ (Registered Today): +{m.newRegistrationsTodayCount ?? 0}
                </span>
                <span>·</span>
                <span className="text-amber-300 font-semibold">
                  በመስመር ላይ (Online Now): {m.activeOnlinePlayers || 0}
                </span>
                <span>·</span>
                <span className="text-red-300">
                  የታገዱ (Blocked): {m.blockedPlayersCount || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleExportCustomersList('csv')}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export Customers List (CSV)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportCustomersList('excel')}
              className="px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-sky-400/50 text-sky-300 text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-sky-400" />
              <span>Export Customers List (.xls)</span>
            </button>
          </div>
        </div>

        {/* ====================================================================
            TOP SUMMARY KPI STRIP:
            1. የተመዝጋቢዎች ብዛት (Total Registrations)
            2. የዙር ተጫዋቾች ብዛት (Active Round Players & Tickets)
            3. የተጫዋቾች ጠቅላላ ቀሪ ሂሳብ (Total Player Balances)
            4. የጸደቀ ገቢ / ወጪ (Approved Deposits & Withdrawals)
            5. የቤት ኮሚሽን እና ሌጀር (GGR & Zero-Drift Reconciliation)
           ==================================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono tabular-nums">
          <div className="bg-slate-900 border border-sky-500/40 rounded-xl p-4">
            <span className="text-[11px] font-sans text-sky-300 font-semibold block">
              ጠቅላላ ተመዝጋቢዎች (Total Registered Users)
            </span>
            <span className="text-xl font-bold text-white mt-1 block">
              {m.totalRegisteredUsers ?? m.totalPlayers} ደንበኞች
            </span>
            <span className="text-[11px] font-sans text-emerald-400 mt-0.5 block">
              በመስመር ላይ (Online): {m.activeOnlinePlayers} · ዛሬ: +{m.newRegistrationsTodayCount ?? 0}
            </span>
          </div>

          <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-4">
            <span className="text-[11px] font-sans text-emerald-300 font-semibold block">
              የዙር ተጫዋቾች ብዛት (Active Round Players)
            </span>
            <span className="text-xl font-bold text-emerald-400 mt-1 block">
              {m.activeRoundPlayersCount || 0} ተጫዋቾች
            </span>
            <span className="text-[11px] font-sans text-slate-400 mt-0.5 block">
              በአሁኑ ዙር የተገዙ ካርቴላዎች: {m.activeRoundTicketsCount || 0}
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-[11px] font-sans text-slate-400 block">
              የተጫዋቾች ጠቅላላ ቀሪ ሂሳብ (Player Balances)
            </span>
            <span className="text-xl font-bold text-amber-300 mt-1 block">
              {formatEtb(m.totalPlayerBalancesMinor || 0, 'en')}
            </span>
            <span className="text-[11px] font-sans text-slate-400 mt-0.5 block">
              የጸደቀ ገቢ: {formatEtb(m.totalApprovedDepositsMinor, 'en')}
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-[11px] font-sans text-slate-400 block">
              የቤት ኮሚሽን (GGR / House Fee)
            </span>
            <span className="text-xl font-bold text-white mt-1 block">
              {formatEtb(m.totalGgrHouseFeeMinor, 'en')}
            </span>
            <span className="text-[11px] font-sans text-slate-400 mt-0.5 block">
              የተከፈለ ወጪ: {formatEtb(m.totalApprovedWithdrawalsMinor, 'en')}
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <span className="text-[11px] font-sans text-slate-400 block">
              የሂሳብ መዝገብ ትክክለኛነት (Ledger Check)
            </span>
            <span
              className={`text-sm font-bold mt-1.5 block ${
                m.ledgerReconciliation?.driftCount === 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {m.ledgerReconciliation?.driftCount === 0
                ? `ZERO DRIFT (${m.ledgerReconciliation.reconciledCount} Wallets)`
                : `DRIFT ALERT (${m.ledgerReconciliation?.driftCount})`}
            </span>
            <span className="text-[11px] font-sans text-slate-500 mt-0.5 block">
              100% Append-Only Verified
            </span>
          </div>
        </div>

        {/* ====================================================================
            DAILY FINANCIAL TRACKING & REPORTING DASHBOARD
            (Daily Deposits, Withdrawals, House Commission, Games Played & Net Revenue)
           ==================================================================== */}
        {(activeTab === 'revenue' || activeTab === 'players') && (
          <AdminRevenueDashboard
            timeline={dashboard.revenueTimeline30d || []}
            summary={dashboard.revenueSummary30d}
            serverTimeUtc={dashboard.serverTimeUtc}
            houseCommissionPercent={dashboard.houseCommissionPercent}
            playerDailyWinLossLogs={dashboard.playerDailyWinLossLogs || []}
            playerGameHistoryLogs={dashboard.playerGameHistoryLogs || []}
            allPlayers={dashboard.players || []}
          />
        )}

        {/* ====================================================================
            FEATURE 1: ADMIN GAME SCHEDULING & BETTING CONTROL
            1. Toggle Button: "Open Betting" / "Close Betting" (Manually Open/Close Betting Window at Any Time)
            2. Set Next Live Game Start Date & Time (Especially for Evening Games when Users are off work)
            3. Live Countdown Timer & Status Synchronized Real-Time with All Players
           ==================================================================== */}
        {(() => {
          const bs = dashboard?.bettingSchedule || {
            isBettingOpen: true,
            isPracticeModeOpen: true,
            isRealGameModeOpen: true,
            scheduledGameTime: null,
          };
          const isCurrentlyOpen = Boolean(bs.isBettingOpen);
          const isPracticeOpen = bs.isPracticeModeOpen !== undefined ? Boolean(bs.isPracticeModeOpen) : true;
          const isRealGameOpen =
            bs.isRealGameModeOpen !== undefined ? Boolean(bs.isRealGameModeOpen) : isCurrentlyOpen;

          return (
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 border-2 border-indigo-500/50 rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl">
              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/50 flex items-center justify-center shrink-0">
                    <Power className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base sm:text-lg font-black text-white">
                        የጨዋታ ሁነታዎች መቆጣጠሪያ (Practice & Real Game Mode Control)
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-[10px] font-mono font-bold text-indigo-300">
                        ● REAL-TIME SYNC
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      አድሚኑ በማንኛውም ሰዓት የመለማመጃ ጨዋታ (Practice Mode) እና የእውነተኛ ጨዋታ (Real Game Mode) ለብቻ መክፈትና መዝጋት እንዲሁም ሲዘጋ ምክንያት እና የሚከፈትበትን ሰዓት መወሰን ይችላል።
                    </p>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border flex items-center gap-1.5 shadow-md ${
                      isPracticeOpen
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/60'
                        : 'bg-red-500/20 text-red-300 border-red-400/60'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isPracticeOpen ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
                    {isPracticeOpen ? 'የመለማመጃ ጨዋታ: ON' : 'የመለማመጃ ጨዋታ: OFF'}
                  </span>

                  <span
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border flex items-center gap-1.5 shadow-md ${
                      isRealGameOpen && isCurrentlyOpen
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60'
                        : 'bg-red-500/20 text-red-300 border-red-400/60'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isRealGameOpen && isCurrentlyOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    {isRealGameOpen && isCurrentlyOpen ? 'የእውነተኛ ጨዋታ: ON (OPEN)' : 'የእውነተኛ ጨዋታ: OFF (CLOSED)'}
                  </span>
                </div>
              </div>

              {/* ================================================================
                  INDEPENDENT GAME MODE TOGGLES (PRACTICE MODE vs REAL GAME MODE)
                  With Custom Reason & Estimated Resume Time Inputs when OFF
                 ================================================================ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* TOGGLE A: PRACTICE MODE (የመለማመጃ ጨዋታ) ON / OFF SWITCH */}
                <div
                  className={`rounded-2xl p-4 sm:p-5 border-2 flex flex-col justify-between gap-4 transition-all ${
                    isPracticeOpen
                      ? 'bg-slate-950/90 border-amber-500/50'
                      : 'bg-red-950/35 border-red-500/70 ring-2 ring-red-500/30'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Power
                          className={`w-5 h-5 shrink-0 ${
                            isPracticeOpen ? 'text-amber-400' : 'text-red-400'
                          }`}
                        />
                        <div>
                          <h3 className="font-display text-sm sm:text-base font-extrabold text-white">
                            የመለማመጃ ጨዋታ መቆጣጠሪያ (Practice Mode Toggle)
                          </h3>
                          <span className="text-[11px] font-bold text-slate-400 block">
                            ነጻ የልምምድ ጨዋታ ክፍልን ለብቻው ለመክፈት ወይም ለመዝጋት (ON / OFF)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          runAdminAction(
                            {
                              action: 'update_game_modes',
                              isPracticeModeOpen: !isPracticeOpen,
                              practiceOffReason: practiceOffReasonInput.trim() || bs.practiceOffReason || '',
                              practiceResumeTime: practiceResumeTimeInput.trim() || bs.practiceResumeTime || '',
                            },
                            !isPracticeOpen
                              ? 'የመለማመጃ ጨዋታ (Practice Mode) ተከፍቷል (ON)!'
                              : 'የመለማመጃ ጨዋታ (Practice Mode) ተዘግቷል (OFF)!'
                          )
                        }
                        className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all shrink-0 shadow-lg border-2 ${
                          isPracticeOpen
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-white'
                            : 'bg-red-600 hover:bg-red-500 text-white border-red-300'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                        <span>{isPracticeOpen ? 'ON (ክፍት ነው — ለመዝጋት ይጫኑ)' : 'OFF (ተዘግቷል — ለመክፈት ይጫኑ)'}</span>
                      </button>
                    </div>

                    {/* When Practice Mode is OFF, display custom Reason & Resume Time inputs */}
                    {!isPracticeOpen && (
                      <div className="bg-slate-950/95 border border-red-500/50 rounded-xl p-3.5 space-y-3 mt-2">
                        <div className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            የመለማመጃ ጨዋታ ስለተዘጋ ለተጫዋቾች የሚታይ ምክንያት እና የሚከፈትበት ሰዓት ያስገቡ፦
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            a) የተዘጋበት ምክንያት / የጥገና መልእክት (Reason for turning off / Maintenance message):
                          </label>
                          <input
                            type="text"
                            value={practiceOffReasonInput}
                            onChange={(e) => setPracticeOffReasonInput(e.target.value)}
                            placeholder="ለምሳሌ፦ የመለማመጃ ክፍል በጥገና ላይ ነው / Practice mode under maintenance..."
                            className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 focus:outline-none text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            b) ተመልሶ የሚከፈትበት ሰዓት (Estimated Resume Time / When it will be back ON):
                          </label>
                          <input
                            type="text"
                            value={practiceResumeTimeInput}
                            onChange={(e) => setPracticeResumeTimeInput(e.target.value)}
                            placeholder="ለምሳሌ፦ ማታ 2:00 ሰዓት (8:00 PM) / ከ 1 ሰዓት በኋላ..."
                            className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 focus:outline-none text-xs text-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            runAdminAction(
                              {
                                action: 'update_game_modes',
                                isPracticeModeOpen: false,
                                practiceOffReason: practiceOffReasonInput.trim(),
                                practiceResumeTime: practiceResumeTimeInput.trim(),
                              },
                              'የመለማመጃ ጨዋታ የተዘጋበት ምክንያት እና የሚከፈትበት ሰዓት ተመዝግቧል!'
                            )
                          }
                          className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md cursor-pointer transition-colors"
                        >
                          የመለማመጃ ጨዋታ ማሳወቂያ መዝግብ (Save Practice Mode Notice & Resume Time)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* TOGGLE B: REAL GAME MODE (የእውነተኛ ጨዋታ) ON / OFF SWITCH */}
                <div
                  className={`rounded-2xl p-4 sm:p-5 border-2 flex flex-col justify-between gap-4 transition-all ${
                    isRealGameOpen && isCurrentlyOpen
                      ? 'bg-slate-950/90 border-emerald-500/50'
                      : 'bg-red-950/35 border-red-500/70 ring-2 ring-red-500/30'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Power
                          className={`w-5 h-5 shrink-0 ${
                            isRealGameOpen && isCurrentlyOpen ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        />
                        <div>
                          <h3 className="font-display text-sm sm:text-base font-extrabold text-white">
                            የእውነተኛ ጨዋታ መቆጣጠሪያ (Real Game Mode Toggle)
                          </h3>
                          <span className="text-[11px] font-bold text-slate-400 block">
                            በእውነተኛ ብር የሚደረገውን ጨዋታ ለብቻው ለመክፈት ወይም ለመዝጋት (ON / OFF)
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const nextState = !(isRealGameOpen && isCurrentlyOpen);
                          runAdminAction(
                            {
                              action: 'update_game_modes',
                              isRealGameModeOpen: nextState,
                              realGameOffReason: realGameOffReasonInput.trim() || bs.realGameOffReason || '',
                              realGameResumeTime: realGameResumeTimeInput.trim() || bs.realGameResumeTime || '',
                            },
                            nextState
                              ? 'የእውነተኛ ጨዋታ (Real Game Mode) ተከፍቷል (ON)!'
                              : 'የእውነተኛ ጨዋታ (Real Game Mode) ተዘግቷል (OFF)!'
                          );
                        }}
                        className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-all shrink-0 shadow-lg border-2 ${
                          isRealGameOpen && isCurrentlyOpen
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-white'
                            : 'bg-red-600 hover:bg-red-500 text-white border-red-300'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                        <span>
                          {isRealGameOpen && isCurrentlyOpen
                            ? 'ON (ክፍት ነው — ለመዝጋት ይጫኑ)'
                            : 'OFF (ተዘግቷል — ለመክፈት ይጫኑ)'}
                        </span>
                      </button>
                    </div>

                    {/* When Real Game Mode is OFF, display custom Reason & Resume Time inputs */}
                    {!(isRealGameOpen && isCurrentlyOpen) && (
                      <div className="bg-slate-950/95 border border-red-500/50 rounded-xl p-3.5 space-y-3 mt-2">
                        <div className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            የእውነተኛ ጨዋታ ስለተዘጋ ለተጫዋቾች የሚታይ ምክንያት እና የሚከፈትበት ሰዓት ያስገቡ፦
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            a) የተዘጋበት ምክንያት / የጥገና መልእክት (Reason for turning off / Maintenance message):
                          </label>
                          <input
                            type="text"
                            value={realGameOffReasonInput}
                            onChange={(e) => setRealGameOffReasonInput(e.target.value)}
                            placeholder="ለምሳሌ፦ የምሽት ጨዋታ እስኪጀምር ለጊዜው ተዘግቷል / Real game paused until evening session..."
                            className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 focus:outline-none text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            b) ተመልሶ የሚከፈትበት ሰዓት (Estimated Resume Time / When it will be back ON):
                          </label>
                          <input
                            type="text"
                            value={realGameResumeTimeInput}
                            onChange={(e) => setRealGameResumeTimeInput(e.target.value)}
                            placeholder="ለምሳሌ፦ ዛሬ ማታ 2:00 ሰዓት (Tonight at 8:00 PM)..."
                            className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 focus:outline-none text-xs text-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            runAdminAction(
                              {
                                action: 'update_game_modes',
                                isRealGameModeOpen: false,
                                realGameOffReason: realGameOffReasonInput.trim(),
                                realGameResumeTime: realGameResumeTimeInput.trim(),
                              },
                              'የእውነተኛ ጨዋታ የተዘጋበት ምክንያት እና የሚከፈትበት ሰዓት ተመዝግቧል!'
                            )
                          }
                          className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md cursor-pointer transition-colors"
                        >
                          የእውነተኛ ጨዋታ ማሳወቂያ መዝግብ (Save Real Game Notice & Resume Time)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ====================================================================
            QUICK ADMIN CONTROL PANEL:
            1) የተጫዋቾች የመወራረጃ ብር መጠን መወሰኛ (Player Bet / Stake Amount in Birr)
            2) የካርቴላ መሸነፊያ (ዝግ) ህግ መወሰኛ (Winning Pattern: 1-4 Lines, 4 Corners, Full House)
            3) የሰዓት ቆጣሪ መቆጣጠሪያ (Countdown Timer)
           ==================================================================== */}
        <div className="bg-slate-900/95 border border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-white">
                  የመወራረጃ ብር መጠን፣ የማሸነፊያ ህግ (ዝግ) እና ሰዓት ቆጣሪ መወሰኛ (Live Bet Amount, Pattern & Timer Control)
                </h2>
                <p className="text-xs text-slate-400">
                  አድሚኑ የሚወስነው የመወራረጃ ብር መጠን እና የማሸነፊያ ህግ ወዲያውኑ በሁሉም ተጫዋቾች ስክሪን ላይ ይታያል።
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs text-slate-300 font-medium whitespace-nowrap">
                ክፍል ይምረጡ (Target Room):
              </label>
              <select
                value={quickTargetRoomId}
                onChange={(e) => setQuickTargetRoomId(e.target.value)}
                className="h-9 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-semibold"
              >
                <option value="ALL">ሁሉም የጨዋታ ክፍሎች (All Rooms)</option>
                {(dashboard.rooms || []).map((rm: any) => (
                  <option key={rm.id} value={String(rm.id)}>
                    {(rm.nameAm === 'መርካቶ' ? 'ዋናው ጭዋታ' : rm.nameAm)} ({(rm.nameEn === 'Merkato' ? 'Main Game' : rm.nameEn)}) — {formatEtb(rm.ticketPriceMinor, 'am')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 1. BET / STAKE AMOUNT IN BIRR ("የመወራረጃ ብር መጠን መወሰኛ") */}
          <div className="bg-slate-950/90 border border-emerald-500/40 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-emerald-300">
                  1. ተጫዋቾች የሚጫወቱበት የመወራረጃ ብር መጠን ይወስኑ (Set Player Bet / Cartela Price in Birr):
                </span>
              </div>
              <div className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-xs font-mono font-extrabold text-emerald-300 shrink-0">
                የአሁኑ የመወራረጃ ብር (Current Bet):{' '}
                <span className="text-white text-sm">
                  {currentTargetRoom ? formatEtb(currentTargetRoom.ticketPriceMinor, 'am') : '50.00 ብር'}
                </span>{' '}
                / በካርቴላ
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              {/* Quick Preset Bet Buttons */}
              <div className="lg:col-span-8 grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[10, 20, 30, 50, 100, 200, 300, 500].map((birr) => {
                  const isCurrentBet = currentTargetRoom?.ticketPriceMinor === birr * 100;
                  return (
                    <button
                      key={birr}
                      type="button"
                      onClick={() =>
                        runAdminAction(
                          {
                            action: 'set_bet_amount',
                            roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                            ticketPriceMinor: birr * 100,
                          },
                          `የመወራረጃ ብር መጠን ወደ ${birr} ብር ተቀይሯል! በተጫዋቾች ስክሪን ላይ ወዲያውኑ ታይቷል።`
                        )
                      }
                      className={`py-2.5 px-2 rounded-xl font-mono text-xs font-extrabold border transition-all cursor-pointer ${
                        isCurrentBet
                          ? 'bg-emerald-500 text-slate-950 border-white shadow-md scale-[1.03]'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700'
                      }`}
                    >
                      {birr} ብር
                    </button>
                  );
                })}
              </div>

              {/* Custom Bet Amount Input + Apply Button */}
              <div className="lg:col-span-4 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quickCustomBetBirr}
                  onChange={(e) => setQuickCustomBetBirr(e.target.value)}
                  placeholder="ሌላ የብር መጠን (ለምሳሌ 25, 75, 150)..."
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-400 focus:outline-none text-xs text-white font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const parsedBirr = parseFloat(quickCustomBetBirr);
                    if (Number.isNaN(parsedBirr) || parsedBirr < 1) {
                      setActionBanner({
                        type: 'error',
                        text: 'እባክዎ ትክክለኛ የብር መጠን ያስገቡ (ቢያንስ 1 ብር)።',
                      });
                      return;
                    }
                    const ok = await runAdminAction(
                      {
                        action: 'set_bet_amount',
                        roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                        ticketPriceMinor: Math.round(parsedBirr * 100),
                      },
                      `የመወራረጃ ብር መጠን ወደ ${parsedBirr.toFixed(2)} ብር ተቀይሯል! በተጫዋቾች ስክሪን ላይ ወዲያውኑ ታይቷል።`
                    );
                    if (ok) {
                      setQuickCustomBetBirr('');
                    }
                  }}
                  className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs whitespace-nowrap shrink-0 cursor-pointer shadow-md"
                >
                  ብሩን ወዲያውኑ ቀይር
                </button>
              </div>
            </div>
          </div>

          {/* 1B. DYNAMIC HOUSE COMMISSION SETTINGS ("የቤት ኮሚሽን መቶኛ መወሰኛ / Dynamic House Commission %") */}
          {(() => {
            const currentCommBps = currentTargetRoom && !currentTargetRoom.isPractice
              ? Number(currentTargetRoom.houseFeeBps ?? 2300)
              : Number(dashboard.houseCommissionBps ?? 2300);
            const currentCommPct = Number((currentCommBps / 100).toFixed(2));
            const samplePotBirr =
              currentTargetRoom?.activeRoundPotMinor && currentTargetRoom.activeRoundPotMinor > 0
                ? currentTargetRoom.activeRoundPotMinor / 100
                : ((currentTargetRoom?.ticketPriceMinor || 5000) / 100) * 10;
            const sampleFeeBirr = Number(((samplePotBirr * currentCommPct) / 100).toFixed(2));
            const sampleWinnerBirr = Number((samplePotBirr - sampleFeeBirr).toFixed(2));

            return (
              <div className="bg-slate-950/90 border border-amber-500/40 rounded-xl p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-amber-300 block">
                        የቤት ኮሚሽን መቶኛ መወሰኛ (Dynamic House Commission Settings — Auto-Deducted from Prize Pool):
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        ከእያንዳንዱ የቢንጎ ጨዋታ ጠቅላላ የውርርድ ገንዘብ (Pot) ላይ የተመረጠው የቤት ኮሚሽን መቶኛ በራስ-ሰር ተቀንሶ ቀሪው ሽልማት ለአሸናፊው(ዎቹ) ይሰጣል።
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-xs font-mono font-extrabold text-amber-300 shrink-0">
                    የአሁኑ ኮሚሽን (Current Commission):{' '}
                    <span className="text-white text-sm">{currentCommPct}%</span>{' '}
                    <span className="text-emerald-300 text-[11px]">
                      (ለአሸናፊ: {Number((100 - currentCommPct).toFixed(2))}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  {/* Preset Commission Percentage Buttons */}
                  <div className="lg:col-span-7 grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {[5, 10, 15, 20, 23, 25, 30].map((pct) => {
                      const isCurrentPct = Math.abs(currentCommPct - pct) < 0.01;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() =>
                            runAdminAction(
                              {
                                action: 'set_house_commission',
                                roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                                commissionPercent: pct,
                              },
                              `የቤት ኮሚሽን ወደ ${pct}% ተቀይሯል! ከጠቅላላ የውርርድ ገንዘብ (Pot) ላይ ${pct}% ተቀንሶ ${100 - pct}% ለአሸናፊው ይሰጣል።`
                            )
                          }
                          className={`py-2.5 px-2 rounded-xl font-mono text-xs font-extrabold border transition-all cursor-pointer ${
                            isCurrentPct
                              ? 'bg-amber-400 text-slate-950 border-white shadow-md scale-[1.03]'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700'
                          }`}
                        >
                          {pct}%
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Commission % Input + Apply Button */}
                  <div className="lg:col-span-5 flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={quickCustomCommissionPct}
                        onChange={(e) => setQuickCustomCommissionPct(e.target.value)}
                        placeholder="ሌላ ኮሚሽን % (0% - 50%, ለምሳሌ 12.5)..."
                        className="w-full h-10 pl-3 pr-8 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 focus:outline-none text-xs text-white font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                        %
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const parsedPct = parseFloat(quickCustomCommissionPct);
                        if (Number.isNaN(parsedPct) || parsedPct < 0 || parsedPct > 50) {
                          setActionBanner({
                            type: 'error',
                            text: 'እባክዎ ከ 0% እስከ 50% ያለ ትክክለኛ የኮሚሽን መቶኛ ያስገቡ።',
                          });
                          return;
                        }
                        const ok = await runAdminAction(
                          {
                            action: 'set_house_commission',
                            roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                            commissionPercent: parsedPct,
                          },
                          `የቤት ኮሚሽን ወደ ${parsedPct}% ተቀይሯል! ቀሪው ${Number((100 - parsedPct).toFixed(2))}% ለአሸናፊው(ዎቹ) ይከፈላል።`
                        );
                        if (ok) {
                          setQuickCustomCommissionPct('');
                        }
                      }}
                      className="h-10 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs whitespace-nowrap shrink-0 cursor-pointer shadow-md"
                    >
                      ኮሚሽኑን ቀይር (Apply %)
                    </button>
                  </div>
                </div>

                {/* Live Pot Calculation Preview */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                  <span className="text-slate-400 font-sans">
                    የቀጥታ ስሌት ምሳሌ (Live Prize Pool Split Preview):
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-slate-300">
                      ጠቅላላ ውርርድ (Total Pot): <strong className="text-white">{samplePotBirr.toFixed(2)} ETB</strong>
                    </span>
                    <span className="text-amber-300">
                      − የቤት ኮሚሽን ({currentCommPct}%): <strong>{sampleFeeBirr.toFixed(2)} ETB</strong>
                    </span>
                    <span className="text-emerald-400 font-bold">
                      = ለአሸናፊ የሚደርስ (Winner Payout): <strong>{sampleWinnerBirr.toFixed(2)} ETB</strong>
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Winning Pattern ("ዝግ") Buttons */}
            <div className="lg:col-span-8 space-y-1.5">
              <span className="text-xs font-semibold text-amber-300 block">
                2. የማሸነፊያ አይነት / ዝግ ይምረጡ (Select Winning Pattern — Click to Apply Immediately):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {WINNING_PATTERN_OPTIONS.map((opt) => {
                  const isCurrent = currentTargetRoom?.pattern === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        runAdminAction(
                          {
                            action: 'set_winning_pattern',
                            roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                            pattern: opt.value,
                          },
                          `የማሸነፊያ ህግ ወደ «${opt.labelAm} (${opt.labelEn})» ተቀይሯል! በተጫዋቾች ስክሪን ላይ ተዘምኗል።`
                        )
                      }
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isCurrent
                          ? 'bg-amber-400 text-slate-950 border-amber-200 font-extrabold shadow-md'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.labelAm}</div>
                      <div
                        className={`text-[10px] ${
                          isCurrent ? 'text-slate-900 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {opt.labelEn}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Countdown Timer & Ball Draw Interval (3-5s) Buttons */}
            <div className="lg:col-span-4 space-y-2.5 border-t lg:border-t-0 lg:border-l border-slate-800 pt-3 lg:pt-0 lg:pl-4">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>3. የጨዋታ መጀመሪያ ሰዓት ቆጣሪ (Countdown Timer):</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[30, 45, 60, 90].map((sec) => {
                  const isCurrentSec = currentTargetRoom?.cadenceSeconds === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() =>
                        runAdminAction(
                          {
                            action: 'set_winning_pattern',
                            roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                            countdownSeconds: sec,
                          },
                          `የጨዋታ መጀመሪያ ሰዓት ቆጣሪ ወደ ${sec} ሰከንድ ተቀይሯል!`
                        )
                      }
                      className={`py-2 px-3 rounded-xl font-mono text-xs font-bold border transition-colors ${
                        isCurrentSec
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-800'
                      }`}
                    >
                      {sec} ሰከንድ ({sec}s)
                    </button>
                  );
                })}
              </div>
              <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-amber-300 block">
                  የቁጥር አጠራር ፍጥነት (Ball Call Speed: 3–5s):
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[3, 4, 5].map((drawSec) => {
                    const isCurrentDrawSec = (currentTargetRoom?.drawIntervalSeconds || 3) === drawSec;
                    return (
                      <button
                        key={drawSec}
                        type="button"
                        onClick={() =>
                          runAdminAction(
                            {
                              action: 'set_winning_pattern',
                              roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                              drawIntervalSeconds: drawSec,
                            },
                            `የቁጥር አጠራር ፍጥነት በየ ${drawSec} ሰከንድ እንዲጠራ ተደርጓል!`
                          )
                        }
                        className={`py-1.5 px-2 rounded-lg font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
                          isCurrentDrawSec
                            ? 'bg-amber-400 text-slate-950 border-amber-200'
                            : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        በየ {drawSec}s
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 4. PREDETERMINED WINNER SELECTION ("የዙሩን አሸናፊ ካርቴላ ወይም ተጫዋች አስቀድሞ መወሰኛ") */}
          {(() => {
            const predTargets = dashboard.predeterminedTargets || {};
            const activePredTarget =
              (quickTargetRoomId !== 'ALL' && predTargets[quickTargetRoomId]?.enabled
                ? predTargets[quickTargetRoomId]
                : null) ||
              (predTargets['ALL']?.enabled ? predTargets['ALL'] : null) ||
              Object.values(predTargets).find((t: any) => t?.enabled) ||
              null;

            const activeRoundTicketsAll = (dashboard.rooms || []).flatMap((rm: any) =>
              (rm.activeRoundTickets || []).map((tk: any) => ({
                ...tk,
                roomId: rm.id,
                roomNameAm: rm.nameAm,
                roundStatus: rm.activeRoundStatus,
                isReservedOnly: false,
              }))
            );
            const activeRoundLocksAll = (dashboard.rooms || []).flatMap((rm: any) =>
              (rm.activeRoundLocks || []).map((lk: any) => ({
                ...lk,
                roomId: rm.id,
                roomNameAm: rm.nameAm,
                roundStatus: rm.activeRoundStatus,
                isReservedOnly: true,
              }))
            );
            const combinedLiveSelections = [
              ...activeRoundTicketsAll,
              ...activeRoundLocksAll.filter(
                (lk: any) =>
                  !activeRoundTicketsAll.some(
                    (tk: any) => tk.roomId === lk.roomId && tk.cardIndex === lk.cardIndex
                  )
              ),
            ];

            return (
              <div className="bg-slate-950/95 border-2 border-amber-400/50 rounded-2xl p-4 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Award className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                        4. የዙሩን አሸናፊ አስቀድሞ መወሰኛ (Predetermined Winner — Select Card ID or Player to WIN):
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      ከጨዋታው በፊት የሚመርጡት ካርቴላ ቁጥር (#1–#120) ወይም ተጫዋች ቁጥሮቹ በየ 3–5 ሰከንድ በተፈጥሯዊ ሁኔታ እየተጠሩ ከሌሎች ካርቴላዎች ቀድሞ እንዲያሸንፍ ይደረጋል።
                    </p>
                  </div>

                  {/* Current Predetermined Winner Status Badge */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {activePredTarget ? (
                      <>
                        <div className="px-3 py-1.5 rounded-xl bg-amber-400/20 border-2 border-amber-400 text-amber-200 text-xs font-extrabold flex items-center gap-2 shadow-md">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span>
                            🎯 የተወሰነ አሸናፊ፦{' '}
                            {activePredTarget.targetType === 'CARD'
                              ? `ካርቴላ #${activePredTarget.targetCardIndex} (Card #${activePredTarget.targetCardIndex})`
                              : `ተጫዋች ${activePredTarget.targetUsername} (#${activePredTarget.targetUserId})`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            runAdminAction(
                              {
                                action: 'set_predetermined_winner',
                                roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                                enabled: false,
                              },
                              'የተወሰነው አሸናፊ ተነስቷል — ጨዋታው ወደ መደበኛ የዕድል ጨዋታ (Fair Random Mode) ተመልሷል!'
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-bold cursor-pointer"
                        >
                          ✕ አጽዳ (Reset to Random)
                        </button>
                      </>
                    ) : (
                      <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-semibold">
                        🎲 የአሁኑ ሁኔታ፦ መደበኛ የዕድል ጨዋታ (Normal Random Draw)
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Active Round Purchased / Selected Cards (1-Click Target) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-300">
                      በአሁኑ ዙር የተያዙ ካርቴላዎች እና ተጫዋቾች — በአንድ ንኪኪ አሸናፊ ያድርጉ (Live Round Cards — Click to Set Winner):
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        runAdminAction(
                          {
                            action: 'force_start_round',
                            roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                          },
                          'ዙሩ ወዲያውኑ እንዲጀምር ተደርጓል! (Round started immediately!)'
                        )
                      }
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-[11px] font-bold cursor-pointer"
                    >
                      ⚡ ዙሩን አሁኑኑ አስጀምር (Start Round Now)
                    </button>
                  </div>

                  {combinedLiveSelections.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      በአሁኑ ሰዓት በዙሩ ውስጥ የተገዛ ካርቴላ የለም — ከታች በካርቴላ ቁጥር (#1–#120) ወይም በተጫዋች ስም አስቀድመው መምረጥ ይችላሉ።
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {combinedLiveSelections.map((item: any, idx: number) => {
                        const isTargetedCard =
                          activePredTarget?.enabled &&
                          ((activePredTarget.targetType === 'CARD' &&
                            activePredTarget.targetCardIndex === item.cardIndex) ||
                            (activePredTarget.targetType === 'PLAYER' &&
                              activePredTarget.targetUserId === item.userId));
                        return (
                          <button
                            key={`${item.roomId}_${item.cardIndex}_${idx}`}
                            type="button"
                            onClick={() => {
                              setPredTargetCardId(String(item.cardIndex));
                              runAdminAction(
                                {
                                  action: 'set_predetermined_winner',
                                  roomId: item.roomId,
                                  enabled: true,
                                  targetType: 'CARD',
                                  targetCardIndex: item.cardIndex,
                                  autoClearAfterWin: predAutoClear,
                                },
                                `🎯 ካርቴላ #${item.cardIndex} (${item.username}) የዚህ ዙር አሸናፊ እንዲሆን ተወስኗል!`
                              );
                            }}
                            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-extrabold border transition-all cursor-pointer flex items-center gap-2 ${
                              isTargetedCard
                                ? 'bg-amber-400 text-slate-950 border-white shadow-lg scale-[1.03]'
                                : item.isReservedOnly
                                ? 'bg-slate-950 hover:bg-slate-800 text-amber-300 border-amber-500/40'
                                : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border-emerald-500/50'
                            }`}
                          >
                            <span>🎯 ካርቴላ #{item.cardIndex}</span>
                            <span className="font-sans font-bold">({item.username})</span>
                            {item.isReservedOnly && (
                              <span className="text-[10px] font-sans opacity-80">[መርጧል]</span>
                            )}
                            {isTargetedCard && <span>★ አሸናፊ</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Manual Selection: Card ID (#1 - #120) OR Player Dropdown */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                  {/* Option A: By Card ID (#1 to #120) */}
                  <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                    <label className="block text-xs font-bold text-amber-300">
                      ሀ) በካርቴላ ቁጥር አሸናፊ ምረጥ (Select Target Card ID #1 – #120):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={predTargetCardId}
                        onChange={(e) => setPredTargetCardId(e.target.value)}
                        placeholder="Card # (1-120)"
                        className="w-28 h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-400 focus:outline-none text-sm font-mono font-bold text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cId = parseInt(predTargetCardId, 10);
                          if (Number.isNaN(cId) || cId < 1 || cId > 120) {
                            setActionBanner({
                              type: 'error',
                              text: 'እባክዎ ከ #1 እስከ #120 ያለ የካርቴላ ቁጥር ያስገቡ።',
                            });
                            return;
                          }
                          runAdminAction(
                            {
                              action: 'set_predetermined_winner',
                              roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                              enabled: true,
                              targetType: 'CARD',
                              targetCardIndex: cId,
                              autoClearAfterWin: predAutoClear,
                            },
                            `🎯 ካርቴላ #${cId} የዙሩ አሸናፊ እንዲሆን ተወስኗል! ጨዋታው ሲጀምር የካርቴላ #${cId} ቁጥሮች በተፈጥሯዊ ቅደም ተከተል ቀድመው ይወጣሉ።`
                          );
                        }}
                        className="flex-1 h-10 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer shadow-md"
                      >
                        🎯 ካርቴላ #{predTargetCardId || '?'} አሸናፊ አድርግ
                      </button>
                    </div>
                  </div>

                  {/* Option B: By Player */}
                  <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
                    <label className="block text-xs font-bold text-emerald-300">
                      ለ) በተጫዋች ስም አሸናፊ ምረጥ (Select Target Player to WIN):
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={predTargetUserId}
                        onChange={(e) => setPredTargetUserId(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 focus:border-emerald-400 focus:outline-none text-xs text-white font-semibold"
                      >
                        <option value="">-- ተጫዋች ይምረጡ (Select Player) --</option>
                        {(dashboard.players || []).map((p: any) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.username} {p.inActiveRound ? `🔥 (በዙር ላይ - ${p.activeRoundTicketsCount} ካርቴላ)` : p.isOnline ? '● (Online)' : ''} — {formatEtb(p.balanceMinor, 'en')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const uId = parseInt(predTargetUserId, 10);
                          if (Number.isNaN(uId) || uId <= 0) {
                            setActionBanner({
                              type: 'error',
                              text: 'እባክዎ መጀመሪያ ከዝርዝሩ ውስጥ ተጫዋች ይምረጡ።',
                            });
                            return;
                          }
                          const chosenPlayer = (dashboard.players || []).find(
                            (pl: any) => pl.id === uId
                          );
                          runAdminAction(
                            {
                              action: 'set_predetermined_winner',
                              roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                              enabled: true,
                              targetType: 'PLAYER',
                              targetUserId: uId,
                              autoClearAfterWin: predAutoClear,
                            },
                            `🏆 ተጫዋች ${chosenPlayer?.username || `#${uId}`} የዙሩ አሸናፊ እንዲሆን ተወስኗል! የመረጠው ካርቴላ ከሌሎች ቀድሞ ይዘጋል።`
                          );
                        }}
                        className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs whitespace-nowrap shrink-0 cursor-pointer shadow-md"
                      >
                        🏆 ተጫዋቹን አሸናፊ አድርግ
                      </button>
                    </div>
                  </div>

                  {/* Option C: Auto-Clear Toggle */}
                  <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center">
                    <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-300 leading-tight">
                      <input
                        type="checkbox"
                        checked={predAutoClear}
                        onChange={(e) => setPredAutoClear(e.target.checked)}
                        className="mt-0.5 accent-amber-400"
                      />
                      <span>
                        <strong>ለአንድ ዙር ብቻ</strong> (ዙሩን እንዳሸነፈ ወደ መደበኛ ጨዋታ ይመለስ)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {actionBanner && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              actionBanner.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                : 'bg-red-950/70 border-red-800 text-red-200'
            }`}
          >
            <span>{actionBanner.text}</span>
            <button type="button" onClick={() => setActionBanner(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {/* ====================================================================
            1. SIDE-BY-SIDE LIVE DEPOSIT & WITHDRAWAL REQUESTS (ADMIN PANEL)
            & 2. AUTO-ARCHIVE TO REPORTS / HISTORY WITH DATE-RANGE FILTER & EXPORT
           ==================================================================== */}
        {(activeTab === 'queues' ||
          activeTab === 'players' ||
          dashboard.pendingDeposits.length > 0 ||
          dashboard.pendingWithdrawals.length > 0) && (
          <div className="space-y-6">
            {/* Side-by-Side Columns: Left = Pending Deposits, Right = Pending Withdrawals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* LEFT COLUMN: Pending Deposits Queue (ገቢ ጥያቄዎች ከነ Screenshot እና ትክክለኛ ሰዓት) */}
              <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                      <span>
                        የገቢ ጥያቄዎች / Deposit Requests ({dashboard.pendingDeposits.length})
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ተጫዋቾች በቴሌብር (0915306343) ወይም በንግድ ባንክ CBE (1000389879928) የላኩት የገቢ ጥያቄዎች
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold shrink-0">
                    {dashboard.pendingDeposits.length} በመጠባበቅ ላይ
                  </span>
                </div>

                {dashboard.pendingDeposits.length === 0 ? (
                  <div className="py-6 text-center space-y-1 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400">
                      በአሁኑ ሰዓት በመጠባበቅ ላይ ያለ አዲስ የገቢ ጥያቄ የለም (No pending deposit requests).
                    </p>
                    <p className="text-[11px] text-slate-500">
                      የጸደቁ ወይም ውድቅ የተደረጉ ጥያቄዎች ወዲያውኑ ወደ ታችኛው የሪፖርት ክፍል ይዛወራሉ።
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 space-y-4">
                    {dashboard.pendingDeposits.map((dep: any) => (
                      <div key={dep.id} className="pt-4 first:pt-0 space-y-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                              #{dep.id}
                            </span>
                            <strong className="text-sm text-white">{dep.username}</strong>
                            {dep.phone && dep.phone !== '-' && (
                              <span className="text-[11px] text-slate-400">({dep.phone})</span>
                            )}
                            <span className="text-base text-emerald-400 font-extrabold">
                              {formatEtb(dep.amountMinor, 'en')}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 font-sans font-semibold">
                              {dep.provider === 'TELEBIRR'
                                ? 'ቴሌብር (0915306343)'
                                : dep.provider === 'CBE_BIRR'
                                ? 'ንግድ ባንክ CBE (1000389879928)'
                                : dep.provider}
                            </span>
                          </div>
                          <span className="text-slate-400">Ref: {dep.transactionRef}</span>
                        </div>

                        {/* Exact Request Timestamp (Date, Hour, Minute, and Second) */}
                        <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>የተጠየቀበት ሰዓት (Requested Timestamp — Date, Hr:Min:Sec):</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-300">
                            {formatExactTimestamp(dep.createdAt)}
                          </span>
                        </div>

                        {/* Player Uploaded Payment Screenshot (Thumbnail + Full Screen Button) */}
                        {dep.proofDataUrl ? (
                          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={dep.proofDataUrl}
                                alt="Deposit Screenshot"
                                onClick={() => setProofPreviewUrl(dep.proofDataUrl)}
                                className="w-20 h-20 rounded-lg border border-slate-700 object-cover cursor-pointer hover:opacity-90 shrink-0"
                              />
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-emerald-300 block">
                                  📸 የተጫዋች የክፍያ ደረሰኝ (Payment Screenshot)
                                </span>
                                <span className="text-[11px] text-slate-400 block">
                                  ምስሉን በትልቁ ለማየት ከታች ያለውን ቁልፍ ወይም ምስሉን ይጫኑ።
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setProofPreviewUrl(dep.proofDataUrl)}
                              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              🔍 ደረሰኝ / Screenshot በትልቁ እይ
                            </button>
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                            Screenshot አልተያያዘም (Transaction Ref ብቻ፦ {dep.transactionRef})
                          </div>
                        )}

                        {/* Approve or Reject Controls (Disabled while processing to prevent double-spend) */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={Boolean(processingQueueRequests[`dep_${dep.id}`])}
                            onClick={() =>
                              runAdminAction(
                                { action: 'approve_deposit', depositId: dep.id },
                                `የገቢ ጥያቄ #${dep.id} (${dep.username}) ጸድቆ ወደ ሪፖርት ማህደር ተዛውሯል!`
                              )
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-extrabold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                          >
                            {processingQueueRequests[`dep_${dep.id}`] ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>በማጽደቅ ላይ...</span>
                              </>
                            ) : (
                              <span>✅ አጽድቅ እና ሂሳብ ጨምር (Approve)</span>
                            )}
                          </button>

                          <input
                            type="text"
                            disabled={Boolean(processingQueueRequests[`dep_${dep.id}`])}
                            placeholder="ውድቅ የሚደረግበት ምክንያት (Rejection reason)..."
                            value={rejectReasons[`dep_${dep.id}`] || ''}
                            onChange={(e) =>
                              setRejectReasons({
                                ...rejectReasons,
                                [`dep_${dep.id}`]: e.target.value,
                              })
                            }
                            className="flex-1 min-w-[170px] h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white disabled:opacity-50"
                          />

                          <button
                            type="button"
                            disabled={Boolean(processingQueueRequests[`dep_${dep.id}`])}
                            onClick={() =>
                              runAdminAction(
                                {
                                  action: 'reject_deposit',
                                  depositId: dep.id,
                                  reason:
                                    rejectReasons[`dep_${dep.id}`] ||
                                    'ትክክለኛ ደረሰኝ አይደለም (Invalid payment proof)',
                                },
                                `የገቢ ጥያቄ #${dep.id} ውድቅ ተደርጎ ወደ ሪፖርት ማህደር ተዛውሯል (Rejected & Archived).`
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-red-950 hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed border border-red-800 text-red-200 font-bold text-xs cursor-pointer"
                          >
                            ❌ ውድቅ አድርግ (Reject)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Pending Withdrawals Queue (የወጪ ጥያቄዎች ከነ ትክክለኛ ሰዓት) */}
              <div className="bg-slate-900 border-2 border-amber-400/40 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                      <span>
                        የወጪ ጥያቄዎች / Withdrawal Requests ({dashboard.pendingWithdrawals.length})
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ተጫዋቾች ብር ወጪ እንዲደረግላቸው የጠየቁት ዝርዝር (Funds Held in Escrow)
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 font-mono text-xs font-bold shrink-0">
                    {dashboard.pendingWithdrawals.length} በመጠባበቅ ላይ
                  </span>
                </div>

                {dashboard.pendingWithdrawals.length === 0 ? (
                  <div className="py-6 text-center space-y-1 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400">
                      በአሁኑ ሰዓት በመጠባበቅ ላይ ያለ አዲስ የወጪ ጥያቄ የለም (No pending withdrawal requests).
                    </p>
                    <p className="text-[11px] text-slate-500">
                      የጸደቁ ወይም ውድቅ የተደረጉ ጥያቄዎች ወዲያውኑ ወደ ታችኛው የሪፖርት ክፍል ይዛወራሉ።
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 space-y-4">
                    {dashboard.pendingWithdrawals.map((wd: any) => (
                      <div key={wd.id} className="pt-4 first:pt-0 space-y-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                              #{wd.id}
                            </span>
                            <strong className="text-sm text-white">{wd.username}</strong>
                            {wd.phone && wd.phone !== '-' && (
                              <span className="text-[11px] text-slate-400">({wd.phone})</span>
                            )}
                            <span className="text-base text-amber-300 font-extrabold">
                              {formatEtb(wd.amountMinor, 'en')}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-sans font-semibold">
                              {wd.provider === 'TELEBIRR'
                                ? 'ቴሌብር (Telebirr)'
                                : wd.provider === 'CBE_BIRR'
                                ? 'ንግድ ባንክ (CBE)'
                                : wd.provider}
                            </span>
                          </div>
                        </div>

                        {/* Exact Request Timestamp (Date, Hour, Minute, and Second) */}
                        <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>የተጠየቀበት ሰዓት (Requested Timestamp — Date, Hr:Min:Sec):</span>
                          </span>
                          <span className="font-mono font-bold text-amber-300">
                            {formatExactTimestamp(wd.createdAt)}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[11px] text-slate-400 block">
                              ገንዘብ የሚላክበት የተጫዋች አካውንት (Destination Account):
                            </span>
                            <span className="font-mono text-sm font-bold text-amber-300">
                              {wd.payoutAccount}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(wd.payoutAccount)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-emerald-300 font-semibold shrink-0 cursor-pointer"
                          >
                            ቅዳ (Copy)
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={Boolean(processingQueueRequests[`wd_${wd.id}`])}
                            onClick={() =>
                              runAdminAction(
                                { action: 'approve_withdrawal', withdrawalId: wd.id },
                                `የወጪ ጥያቄ #${wd.id} (${wd.username}) ጸድቆ ወደ ሪፖርት ማህደር ተዛውሯል (Approved & Archived)!`
                              )
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-extrabold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                          >
                            {processingQueueRequests[`wd_${wd.id}`] ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>በማጽደቅ ላይ...</span>
                              </>
                            ) : (
                              <span>✅ ወጪ አጽድቅ (Approve Payout)</span>
                            )}
                          </button>

                          <input
                            type="text"
                            disabled={Boolean(processingQueueRequests[`wd_${wd.id}`])}
                            placeholder="ውድቅ የሚደረግበት ምክንያት (Rejection reason)..."
                            value={rejectReasons[`wd_${wd.id}`] || ''}
                            onChange={(e) =>
                              setRejectReasons({
                                ...rejectReasons,
                                [`wd_${wd.id}`]: e.target.value,
                              })
                            }
                            className="flex-1 min-w-[170px] h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white disabled:opacity-50"
                          />

                          <button
                            type="button"
                            disabled={Boolean(processingQueueRequests[`wd_${wd.id}`])}
                            onClick={() =>
                              runAdminAction(
                                {
                                  action: 'reject_withdrawal',
                                  withdrawalId: wd.id,
                                  reason:
                                    rejectReasons[`wd_${wd.id}`] ||
                                    'የአካውንት ቁጥር አልተረጋገጠም (Account verification failed)',
                                },
                                `የወጪ ጥያቄ #${wd.id} ውድቅ ተደርጎ ወደ ሪፖርት ማህደር ተዛውሯል!`
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-red-950 hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed border border-red-800 text-red-200 font-bold text-xs cursor-pointer"
                          >
                            ❌ ውድቅ አድርግ እና ብሩን መልስ (Reject)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ====================================================================
                AUTO-ARCHIVED DEPOSIT & WITHDRAWAL REPORTS / HISTORY SECTION
                (Shows Approved/Rejected status, Action Timestamp, Date-Range Filter & CSV/Excel Export)
               ==================================================================== */}
            {(() => {
              const allArchivedDeps: any[] = (
                dashboard.allDepositsLog ||
                dashboard.pastDeposits ||
                []
              ).filter((d: any) => d.status === 'APPROVED' || d.status === 'REJECTED');

              const allArchivedWds: any[] = (
                dashboard.allWithdrawalsLog ||
                dashboard.pastWithdrawals ||
                []
              ).filter((w: any) => w.status === 'APPROVED' || w.status === 'REJECTED');

              const filterByDateAndStatus = (item: any) => {
                if (dwReportStatusFilter !== 'ALL' && item.status !== dwReportStatusFilter) {
                  return false;
                }
                const itemDate =
                  item.dateKey || toAddisDateOnly(item.decidedAt || item.createdAt);
                if (dwReportDateFrom && itemDate && itemDate < dwReportDateFrom) return false;
                if (dwReportDateTo && itemDate && itemDate > dwReportDateTo) return false;
                return true;
              };

              const filteredArchivedDeps =
                dwReportTypeFilter === 'WITHDRAWAL'
                  ? []
                  : allArchivedDeps.filter(filterByDateAndStatus);

              const filteredArchivedWds =
                dwReportTypeFilter === 'DEPOSIT'
                  ? []
                  : allArchivedWds.filter(filterByDateAndStatus);

              const totalFilteredCount =
                filteredArchivedDeps.length + filteredArchivedWds.length;

              return (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <h3 className="font-display text-sm sm:text-base font-extrabold text-white">
                          የገቢ እና ወጪ ሪፖርት እና ታሪክ ማህደር / Archived Deposit & Withdrawal Reports ({totalFilteredCount})
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                          Auto-Archived on Approve / Reject
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        የጸደቁ (Approved) ወይም ውድቅ የተደረጉ (Rejected) የገቢ እና የወጪ ጥያቄዎች ከነ ተጠየቁበት እና ውሳኔ ከተሰጠበት ትክክለኛ ሰዓት ጋር እዚህ ይቀመጣሉ።
                      </p>
                    </div>

                    {/* Export / Download Buttons (CSV & Excel) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportArchivedRequestsReport('csv')}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export / Download Report (CSV)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportArchivedRequestsReport('excel')}
                        className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Export / Download Report (Excel .xls)</span>
                      </button>
                    </div>
                  </div>

                  {/* Date-Range Filter & Status / Type Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 items-end">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        ከቀን (From Date):
                      </label>
                      <input
                        type="date"
                        value={dwReportDateFrom}
                        onChange={(e) => setDwReportDateFrom(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:border-emerald-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        እስከ ቀን (To Date):
                      </label>
                      <input
                        type="date"
                        value={dwReportDateTo}
                        onChange={(e) => setDwReportDateTo(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:border-emerald-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        የጥያቄ አይነት (Request Type):
                      </label>
                      <select
                        value={dwReportTypeFilter}
                        onChange={(e) =>
                          setDwReportTypeFilter(
                            e.target.value as 'ALL' | 'DEPOSIT' | 'WITHDRAWAL'
                          )
                        }
                        className="w-full h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold focus:border-emerald-400 focus:outline-none"
                      >
                        <option value="ALL">ሁሉም (All Deposits & Withdrawals)</option>
                        <option value="DEPOSIT">የገቢ ብቻ (Deposits Only)</option>
                        <option value="WITHDRAWAL">የወጪ ብቻ (Withdrawals Only)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        ውሳኔ / ሁኔታ (Final Status):
                      </label>
                      <select
                        value={dwReportStatusFilter}
                        onChange={(e) =>
                          setDwReportStatusFilter(
                            e.target.value as 'ALL' | 'APPROVED' | 'REJECTED'
                          )
                        }
                        className="w-full h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold focus:border-emerald-400 focus:outline-none"
                      >
                        <option value="ALL">ሁሉም (Approved & Rejected)</option>
                        <option value="APPROVED">✅ የጸደቁ ብቻ (Approved Only)</option>
                        <option value="REJECTED">❌ ውድቅ የተደረጉ ብቻ (Rejected Only)</option>
                      </select>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setDwReportDateFrom('');
                          setDwReportDateTo('');
                          setDwReportTypeFilter('ALL');
                          setDwReportStatusFilter('ALL');
                        }}
                        className="w-full h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer transition-colors"
                      >
                        ማጣሪያ አጽዳ (Reset Filter)
                      </button>
                    </div>
                  </div>

                  {/* Side-by-Side Archived Deposit Decisions & Archived Withdrawal Decisions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Archived Deposit Reports */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <h4 className="font-display text-xs sm:text-sm font-bold text-emerald-300">
                          የገቢ ሪፖርት ታሪክ / Archived Deposit Decisions ({filteredArchivedDeps.length})
                        </h4>
                        <span className="text-[11px] font-mono text-slate-400">
                          Approved / Rejected
                        </span>
                      </div>
                      {filteredArchivedDeps.length === 0 ? (
                        <p className="text-xs text-slate-500 py-4 text-center">
                          በተመረጠው ቀን ውስጥ የተጠናቀቀ የገቢ ሪፖርት የለም (No archived deposit records found).
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-800/80 text-xs font-mono max-h-80 overflow-y-auto pr-1">
                          {filteredArchivedDeps.map((d: any) => (
                            <div key={d.id} className="py-3 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  {d.proofDataUrl && (
                                    <img
                                      src={d.proofDataUrl}
                                      alt="Proof"
                                      onClick={() => setProofPreviewUrl(d.proofDataUrl)}
                                      className="w-9 h-9 rounded border border-slate-700 object-cover cursor-pointer shrink-0"
                                    />
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-slate-400">#{d.id}</span>
                                      <span className="text-white font-bold">{d.username}</span>
                                      <span className="text-emerald-400 font-extrabold">
                                        {formatEtb(d.amountMinor, 'en')}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-400 block">
                                      {d.provider} · Ref: {d.transactionRef}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                                    d.status === 'APPROVED'
                                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                                      : 'bg-red-500/20 border border-red-500/40 text-red-300'
                                  }`}
                                >
                                  {d.status === 'APPROVED' ? '✅ APPROVED (ጸድቋል)' : '❌ REJECTED (ውድቅ)'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 space-y-0.5 pl-1">
                                <div>
                                  <span className="text-slate-500">የተጠየቀበት (Requested): </span>
                                  <span className="text-slate-300">
                                    {formatExactTimestamp(d.createdAt)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">ውሳኔ የተሰጠበት (Action Timestamp): </span>
                                  <span className="text-amber-300 font-semibold">
                                    {formatExactTimestamp(d.decidedAt || d.createdAt)}
                                  </span>
                                </div>
                                {d.decisionReason && (
                                  <div className="text-slate-400 font-sans">
                                    ማብራሪያ (Note): {d.decisionReason}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Archived Withdrawal Reports */}
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <h4 className="font-display text-xs sm:text-sm font-bold text-amber-300">
                          የወጪ ሪፖርት ታሪክ / Archived Withdrawal Decisions ({filteredArchivedWds.length})
                        </h4>
                        <span className="text-[11px] font-mono text-slate-400">
                          Approved / Rejected
                        </span>
                      </div>
                      {filteredArchivedWds.length === 0 ? (
                        <p className="text-xs text-slate-500 py-4 text-center">
                          በተመረጠው ቀን ውስጥ የተጠናቀቀ የወጪ ሪፖርት የለም (No archived withdrawal records found).
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-800/80 text-xs font-mono max-h-80 overflow-y-auto pr-1">
                          {filteredArchivedWds.map((w: any) => (
                            <div key={w.id} className="py-3 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-slate-400">#{w.id}</span>
                                    <span className="text-white font-bold">{w.username}</span>
                                    <span className="text-amber-300 font-extrabold">
                                      {formatEtb(w.amountMinor, 'en')}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-400 block">
                                    {w.provider} · Acct: {w.payoutAccount}
                                  </span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${
                                    w.status === 'APPROVED'
                                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                                      : 'bg-red-500/20 border border-red-500/40 text-red-300'
                                  }`}
                                >
                                  {w.status === 'APPROVED' ? '✅ APPROVED (ጸድቋል)' : '❌ REJECTED (ውድቅ)'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 space-y-0.5 pl-1">
                                <div>
                                  <span className="text-slate-500">የተጠየቀበት (Requested): </span>
                                  <span className="text-slate-300">
                                    {formatExactTimestamp(w.createdAt)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">ውሳኔ የተሰጠበት (Action Timestamp): </span>
                                  <span className="text-amber-300 font-semibold">
                                    {formatExactTimestamp(w.decidedAt || w.createdAt)}
                                  </span>
                                </div>
                                {w.decisionReason && (
                                  <div className="text-slate-400 font-sans">
                                    ማብራሪያ (Note): {w.decisionReason}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ====================================================================
            ADMIN PLAYER GAME HISTORY SEARCH & FULL AUTHORIZATION INSPECTOR
            (Accessible on 'history' tab and at top of 'players' tab)
           ==================================================================== */}
        {(activeTab === 'history' || activeTab === 'players') && (
          <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Search className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-display text-base sm:text-lg font-extrabold text-white">
                    የተጫዋች የጨዋታ ታሪክ መፈለጊያ እና መቆጣጠሪያ (Admin Player Game History Search)
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-mono text-[11px] font-bold">
                    Admin Full Authorization
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  በተጫዋች ስም (Username) በመፈለግ ያሸነፈውን መጠን በግራ (+)፣ የተሸነፈውን መጠን በቀኝ (-)፣ የቀጥታ (Live) እና የልምምድ (Practice) ታሪኮችን ለይተው ይመልከቱ።
                </p>
              </div>

              {/* Strict Live vs Practice Mode Isolation Switch */}
              <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start lg:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = 'LIVE';
                    setAdminHistoryMode(nextMode);
                    setAdminHistoryPage(1);
                    if (adminHistoryUsername.trim()) {
                      fetchAdminPlayerHistory({
                        username: adminHistoryUsername,
                        mode: nextMode,
                        page: 1,
                      });
                    }
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                    adminHistoryMode === 'LIVE'
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>● ቀጥታ በብር (Live Mode)</span>
                  {adminHistoryData?.liveSummary && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        adminHistoryMode === 'LIVE'
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-slate-800 text-emerald-400'
                      }`}
                    >
                      {adminHistoryData.liveSummary.totalRounds} Rds
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = 'PRACTICE';
                    setAdminHistoryMode(nextMode);
                    setAdminHistoryPage(1);
                    if (adminHistoryUsername.trim()) {
                      fetchAdminPlayerHistory({
                        username: adminHistoryUsername,
                        mode: nextMode,
                        page: 1,
                      });
                    }
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                    adminHistoryMode === 'PRACTICE'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>● የልምምድ ጨዋታ (Practice Mode)</span>
                  {adminHistoryData?.practiceSummary && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        adminHistoryMode === 'PRACTICE'
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-slate-800 text-amber-300'
                      }`}
                    >
                      {adminHistoryData.practiceSummary.totalRounds} Rds
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Search Form + Date Range Filters */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAdminHistoryPage(1);
                fetchAdminPlayerHistory({ page: 1 });
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
            >
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  የተጫዋች ስም ያስገቡ (Search by Player Username):
                </label>
                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 focus-within:border-emerald-400 rounded-xl px-3 h-10">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={adminHistoryUsername}
                    onChange={(e) => setAdminHistoryUsername(e.target.value)}
                    placeholder="ምሳሌ: abebe_b ወይም dawit_t..."
                    className="bg-transparent text-xs sm:text-sm text-white font-mono focus:outline-none w-full"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  ከቀን (From Date):
                </label>
                <input
                  type="date"
                  value={adminHistoryDateFrom}
                  onChange={(e) => setAdminHistoryDateFrom(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  እስከ ቀን (To Date):
                </label>
                <input
                  type="date"
                  value={adminHistoryDateTo}
                  onChange={(e) => setAdminHistoryDateTo(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                />
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={adminHistoryLoading}
                  className="flex-1 h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{adminHistoryLoading ? 'በመፈለግ ላይ...' : 'ታሪክ ፈልግ (Search)'}</span>
                </button>
                {(adminHistoryDateFrom || adminHistoryDateTo || adminHistoryData || adminHistoryError) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdminHistoryUsername('');
                      setAdminHistoryDateFrom('');
                      setAdminHistoryDateTo('');
                      setAdminHistoryPage(1);
                      setAdminHistoryData(null);
                      setAdminHistoryError(null);
                    }}
                    className="h-10 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    አጽዳ (Clear)
                  </button>
                )}
              </div>
            </form>

            {/* Quick Select Player Chips */}
            {(dashboard.players || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                <span className="text-slate-400 font-semibold">ፈጣን ምርጫ (Quick Select Player):</span>
                {(dashboard.players || []).slice(0, 12).map((pl: any) => (
                  <button
                    key={`quick-hist-${pl.id}`}
                    type="button"
                    onClick={() => {
                      setAdminHistoryUsername(pl.username);
                      setAdminHistoryPage(1);
                      fetchAdminPlayerHistory({
                        username: pl.username,
                        mode: adminHistoryMode,
                        page: 1,
                      });
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs border transition-all cursor-pointer ${
                      adminHistoryData?.player?.username === pl.username
                        ? 'bg-emerald-500 text-slate-950 font-extrabold border-white'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    @{pl.username}
                  </button>
                ))}
              </div>
            )}

            {/* =================================================================
                REQUIREMENT 4: CLEAR "USER NOT FOUND" ERROR ALERT
               ================================================================= */}
            {adminHistoryError && (
              <div className="p-4 rounded-xl bg-red-950/80 border-2 border-red-500/70 text-red-100 flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
                  <div>
                    <h4 className="font-display text-sm font-black text-red-300">
                      User not found — ተጫዋቹ አልተገኘም!
                    </h4>
                    <p className="text-xs text-red-200 mt-0.5 font-mono">{adminHistoryError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminHistoryError(null)}
                  className="px-3 py-1 rounded-lg bg-red-900/70 hover:bg-red-800 text-xs font-bold text-red-200 cursor-pointer"
                >
                  ዝጋ (Dismiss)
                </button>
              </div>
            )}

            {/* =================================================================
                SEARCHED PLAYER COMPLETE FINANCIAL & ROUND HISTORY RESULTS
               ================================================================= */}
            {adminHistoryData && adminHistoryData.player && (
              <div className="space-y-4 pt-2 border-t border-slate-800">
                {/* Player Identity & Isolated Wallet Summary */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-mono text-xs font-black">
                        Player ID #{adminHistoryData.player.id}
                      </span>
                      <strong className="text-base sm:text-lg text-white font-mono">
                        @{adminHistoryData.player.username}
                      </strong>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          adminHistoryData.player.status === 'ACTIVE'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-red-950 text-red-300 border border-red-800'
                        }`}
                      >
                        {adminHistoryData.player.status}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded text-[11px] font-extrabold ${
                          adminHistoryMode === 'LIVE'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-amber-400 text-slate-950'
                        }`}
                      >
                        {adminHistoryMode === 'LIVE'
                          ? 'MODE: REAL_LIVE (ቀጥታ በብር)'
                          : 'MODE: PRACTICE_DEMO (የልምምድ)'}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400">
                      እስከ አሁኑ ሰዓት (Updated up to):{' '}
                      <strong className="text-slate-200">
                        {new Date(adminHistoryData.asOfTimestamp).toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Isolated Balances & Mode Summary */}
                  {(() => {
                    const activeSum =
                      adminHistoryMode === 'PRACTICE'
                        ? adminHistoryData.practiceSummary
                        : adminHistoryData.liveSummary;
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] font-sans text-slate-400 block">
                            ዋና ቀሪ ሂሳብ (Real Balance)
                          </span>
                          <strong className="text-sm text-emerald-400">
                            {formatEtb(adminHistoryData.player.balanceMinor, 'en')}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] font-sans text-slate-400 block">
                            የልምምድ ሂሳብ (Practice Bal)
                          </span>
                          <strong className="text-sm text-amber-300">
                            {formatEtb(adminHistoryData.player.playBalanceMinor, 'en')}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] font-sans text-slate-400 block">
                            ጠቅላላ ዙሮች ({adminHistoryMode})
                          </span>
                          <strong className="text-sm text-white">
                            {activeSum?.totalRounds || 0} ዙሮች ({activeSum?.totalTickets || 0} ካርቴላ)
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40">
                          <span className="text-[10px] font-sans text-emerald-300 font-bold block">
                            ← ግራ: ጠቅላላ ያሸነፈው (Total Won)
                          </span>
                          <strong className="text-sm text-emerald-400">
                            +{formatEtb(activeSum?.totalWonMinor || 0, 'en')}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40">
                          <span className="text-[10px] font-sans text-red-300 font-bold block">
                            ቀኝ: ጠቅላላ የተሸነፈው (Total Lost) →
                          </span>
                          <strong className="text-sm text-red-400">
                            -{formatEtb(activeSum?.totalLostMinor || 0, 'en')}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <span className="text-[10px] font-sans text-slate-400 block">
                            የተጣራ ውጤት (Net P&L)
                          </span>
                          <strong
                            className={`text-sm ${
                              (activeSum?.netProfitLossMinor || 0) >= 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
                            }`}
                          >
                            {(activeSum?.netProfitLossMinor || 0) >= 0 ? '+' : ''}
                            {formatEtb(activeSum?.netProfitLossMinor || 0, 'en')}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Searched Player's Per-Round List (Left = Won Amount, Right = Lost Amount) */}
                {(adminHistoryData.rounds || []).length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                    ለተጫዋች <strong>@{adminHistoryData.player.username}</strong> በተመረጠው ሁኔታ ({adminHistoryMode}) ምንም የጨዋታ ዙር አልተገኘም።
                  </div>
                ) : (
                  <div className="space-y-3 font-mono">
                    {(adminHistoryData.rounds || []).map((rd: any) => {
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
                      const roundTimestamp = rd.timestampUtc || rd.settledAt || rd.createdAt;
                      const ballsCount = rd.ballsDrawnCount ?? rd.drawnCount ?? 0;

                      return (
                        <div
                          key={`adm-hist-rd-${rd.roundId}`}
                          className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded bg-slate-800 text-white font-black">
                                ዙር / Round #{rd.roundId}
                              </span>
                              <span className="font-sans font-bold text-slate-200">
                                {rd.roomNameAm} ({rd.roomNameEn})
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  rd.isPractice
                                    ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                                    : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                                }`}
                              >
                                {rd.modeTag}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300">
                                {rd.roundStatus} ({ballsCount}/75 balls)
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {roundTimestamp ? new Date(roundTimestamp).toLocaleString() : ''}
                            </span>
                          </div>

                          {/* TWO-COLUMN FINANCIAL SPLIT: LEFT = WON AMOUNT, RIGHT = LOST AMOUNT */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* LEFT SIDE: WON AMOUNT */}
                            <div
                              className={`p-3 rounded-xl border ${
                                wonMinor > 0
                                  ? 'bg-emerald-950/45 border-emerald-500/60'
                                  : 'bg-slate-900/50 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-sans font-bold text-emerald-300">
                                <span>← ግራ: ያሸነፈው መጠን (WON AMOUNT - LEFT)</span>
                                <span>{wonCards.length} አሸናፊ ካርቴላ</span>
                              </div>
                              <div className="text-lg sm:text-xl font-black text-emerald-400 mt-1">
                                +{formatEtb(wonMinor, 'en')}
                              </div>
                              {wonCards.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px]">
                                  {wonCards.map((cIdx, idx) => (
                                    <span
                                      key={`adm-wc-${rd.roundId}-${cIdx}-${idx}`}
                                      className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold"
                                    >
                                      +ካርቴላ #{cIdx}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* RIGHT SIDE: LOST AMOUNT */}
                            <div
                              className={`p-3 rounded-xl border sm:text-right ${
                                lostMinor > 0
                                  ? 'bg-red-950/40 border-red-500/60'
                                  : 'bg-slate-900/50 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center sm:flex-row-reverse justify-between text-[11px] font-sans font-bold text-red-300">
                                <span>ቀኝ: የተሸነፈው መጠን (LOST AMOUNT - RIGHT) →</span>
                                <span>{lostCards.length} የተበላ ካርቴላ</span>
                              </div>
                              <div className="text-lg sm:text-xl font-black text-red-400 mt-1">
                                -{formatEtb(lostMinor, 'en')}
                              </div>
                              {lostCards.length > 0 && (
                                <div className="flex flex-wrap sm:justify-end gap-1.5 mt-1.5 text-[11px]">
                                  {lostCards.map((cIdx, idx) => (
                                    <span
                                      key={`adm-lc-${rd.roundId}-${cIdx}-${idx}`}
                                      className="px-2 py-0.5 rounded bg-red-500/20 border border-red-400/50 text-red-300 font-bold"
                                    >
                                      -ካርቴላ #{cIdx}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Provably Fair Hash & Seed */}
                          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="truncate">
                              <span className="text-slate-500">Provably Fair SHA-256 Hash:</span>{' '}
                              <span className="text-emerald-300">{rd.serverSeedHash}</span>
                            </div>
                            <div className="truncate">
                              <span className="text-slate-500">Server Seed:</span>{' '}
                              <span className="text-amber-300">
                                {rd.serverSeed || 'Active round (revealed on settlement)'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination Controls for Admin Player History */}
                {adminHistoryData.pagination && adminHistoryData.pagination.totalPages > 1 && (
                  <div className="pt-2 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      disabled={!adminHistoryData.pagination.hasPrevPage || adminHistoryLoading}
                      onClick={() => {
                        const prev = Math.max(1, adminHistoryPage - 1);
                        setAdminHistoryPage(prev);
                        fetchAdminPlayerHistory({ page: prev });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-40 font-bold cursor-pointer"
                    >
                      ← ቀዳሚ (Previous)
                    </button>
                    <span className="font-mono text-slate-400">
                      ገጽ {adminHistoryData.pagination.page} ከ {adminHistoryData.pagination.totalPages} (ጠቅላላ{' '}
                      {adminHistoryData.pagination.totalItems} ዙሮች)
                    </span>
                    <button
                      type="button"
                      disabled={!adminHistoryData.pagination.hasNextPage || adminHistoryLoading}
                      onClick={() => {
                        const next = adminHistoryPage + 1;
                        setAdminHistoryPage(next);
                        fetchAdminPlayerHistory({ page: next });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 disabled:opacity-40 font-bold cursor-pointer"
                    >
                      ቀጣይ (Next) →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 2: የተጫዋቾች ክትትል፣ የሂሳብ ሁኔታ እና ማገጃ (Block & Unblock + Ban Reason)
           ==================================================================== */}
        {activeTab === 'players' && (
          <div className="space-y-6">
            {/* Manual Wallet Adjustment Modal/Box */}
            {adjUserId && (
              <div className="bg-slate-900 border border-emerald-500 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-white">
                    የተጫዋች ሂሳብ ማስተካከያ / Manual Wallet Adjustment (Player ID #{adjUserId})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAdjUserId(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    ዝጋ (Cancel)
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <select
                    value={adjDirection}
                    onChange={(e) => setAdjDirection(e.target.value as any)}
                    className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    <option value="CREDIT">CREDIT (+ ሂሳብ ጨምር / Add Funds)</option>
                    <option value="DEBIT">DEBIT (- ሂሳብ ቀንስ / Deduct Funds)</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={adjAmountBirr}
                    onChange={(e) => setAdjAmountBirr(e.target.value)}
                    placeholder="Amount in Birr"
                    className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  />
                  <input
                    type="text"
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    placeholder="ምክንያት (Mandatory audit reason)..."
                    className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await runAdminAction(
                        {
                          action: 'manual_adjustment',
                          userId: adjUserId,
                          direction: adjDirection,
                          amountMinor: Math.round(parseFloat(adjAmountBirr) * 100),
                          reason: adjReason || 'Admin balance adjustment',
                        },
                        'የተጫዋች ቀሪ ሂሳብ በተሳካ ሁኔታ ተስተካክሏል (Wallet adjusted).'
                      );
                      if (ok) {
                        setAdjUserId(null);
                        setAdjReason('');
                      }
                    }}
                    className="h-9 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                  >
                    ሂሳብ አጽድቅ (Apply Adjustment)
                  </button>
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="font-display text-base font-bold text-white">
                    የተጫዋቾች ክትትል፣ ቀሪ ሂሳብ እና ማገጃ (Player Monitoring, Balance View & Block/Unblock)
                  </h2>
                  <p className="text-xs text-slate-400">
                    ጠቅላላ ተመዝጋቢዎች: <strong>{m.totalPlayers}</strong> · በአሁኑ ዙር እየተጫወቱ ያሉ: <strong>{m.activeRoundPlayersCount || 0}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportCustomersList('csv')}
                    className="h-9 px-3.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
                    title="Export all registered customers' profile details in CSV format (Excludes passwords)"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Export Customers List (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCustomersList('excel')}
                    className="h-9 px-3.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-sky-400/50 text-sky-300 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
                    title="Export all registered customers' profile details in Excel format (Excludes passwords)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
                    <span>Export Customers List (.xls)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportAllPlayersReport('csv')}
                    className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download / Export Report (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportAllPlayersReport('excel')}
                    className="h-9 px-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shadow-md cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Export Excel (.xls)</span>
                  </button>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 h-9">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ተጫዋች ፈልግ (Search username)..."
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      className="bg-transparent text-xs text-white focus:outline-none w-44"
                    />
                  </div>
                  {(
                    [
                      { id: 'ALL', label: `ሁሉም (${m.totalPlayers})` },
                      { id: 'IN_ROUND', label: `በዙር ላይ (${m.activeRoundPlayersCount || 0})` },
                      { id: 'ONLINE', label: `Online (${m.activeOnlinePlayers})` },
                      { id: 'ACTIVE', label: 'ንቁ (Active)' },
                      { id: 'BLOCKED', label: `የታገዱ (${m.blockedPlayersCount || 0})` },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setPlayerStatusFilter(st.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                        playerStatusFilter === st.id
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-950 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-800">
                {filteredPlayers.map((p: any) => (
                  <div
                    key={p.id}
                    className="py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs"
                  >
                    {/* Player Identity + Balance View */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-500">#{p.id}</span>
                        <strong className="text-sm text-white font-mono">{p.username}</strong>
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            p.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {p.status === 'ACTIVE' ? 'ንቁ (ACTIVE)' : 'ታግዷል (BLOCKED)'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            p.isOnline
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {p.isOnline ? '● Online' : 'Offline'}
                        </span>
                        {p.inActiveRound && (
                          <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/40 text-amber-300 font-bold text-[11px]">
                            በዙር ላይ እየተጫወተ ({p.activeRoundTicketsCount} ካርቴላ)
                          </span>
                        )}
                        {p.sharedFlag && (
                          <span className="text-amber-300 font-mono text-[11px]">
                            · [ማስጠንቀቂያ: {p.sharedReason}]
                          </span>
                        )}
                      </div>

                      {/* Clear Balance View for Every Player */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono tabular-nums bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90">
                        <div>
                          <span className="text-[10px] font-sans text-slate-400 block">
                            ዋና ቀሪ ሂሳብ (Real Balance)
                          </span>
                          <strong className="text-sm text-emerald-400">
                            {formatEtb(p.balanceMinor, 'en')}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-sans text-slate-400 block">
                            የተያዘ ሂሳብ (Locked Hold)
                          </span>
                          <strong className="text-sm text-amber-300">
                            {formatEtb(p.lockedMinor, 'en')}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-sans text-slate-400 block">
                            የልምምድ ሂሳብ (Play Balance)
                          </span>
                          <strong className="text-sm text-slate-200">
                            {formatEtb(p.playBalanceMinor, 'en')}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-sans text-slate-400 block">
                            የተመዘገበበት / ስልክ
                          </span>
                          <span className="text-[11px] text-slate-300">
                            {p.phone || p.email || p.dob}
                          </span>
                        </div>
                      </div>

                      {p.blockedReason && (
                        <div className="p-2 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center gap-2">
                          <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>
                            <strong>የታገደበት ምክንያት (Ban Reason):</strong> {p.blockedReason}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Administrative Controls: Ban Reason Input + Block / Unblock / Kick / Adjust Wallet */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          placeholder="የማገጃ ምክንያት ይጻፉ (Ban / Unblock reason)..."
                          value={playerReasons[p.id] || ''}
                          onChange={(e) =>
                            setPlayerReasons({ ...playerReasons, [p.id]: e.target.value })
                          }
                          className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white min-w-[230px]"
                        />
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-slate-500">ፈጣን ምክንያት:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPlayerReasons({
                                ...playerReasons,
                                [p.id]: 'ህግ በመጣስ / በማጭበርበር (Cheating / Rule Violation)',
                              })
                            }
                            className="text-amber-400 hover:underline"
                          >
                            ማጭበርበር
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPlayerReasons({
                                ...playerReasons,
                                [p.id]: 'ተደጋጋሚ አካውንት መክፈት (Multi-account abuse)',
                              })
                            }
                            className="text-amber-400 hover:underline"
                          >
                            ተደጋጋሚ አካውንት
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {p.status === 'BLOCKED' ? (
                          <button
                            type="button"
                            onClick={() =>
                              runAdminAction(
                                {
                                  action: 'unblock_player',
                                  userId: p.id,
                                  reason:
                                    (playerReasons[p.id] || '').trim() ||
                                    'እገዳው በአድሚን ተነስቷል (Unblocked by Admin)',
                                },
                                `ተጫዋች ${p.username} እገዳው ተነስቷል (Unblocked).`
                              )
                            }
                            className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>እገዳ አንሳ (Unblock)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              runAdminAction(
                                {
                                  action: 'block_player',
                                  userId: p.id,
                                  reason:
                                    (playerReasons[p.id] || '').trim() ||
                                    'ህግ በመጣስ / በአድሚን ውሳኔ የታገደ (Blocked by Admin for rule violation)',
                                },
                                `ተጫዋች ${p.username} ታግዷል (Blocked) እና መልእክት ተልኮለታል።`
                              )
                            }
                            className="h-9 px-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>አግድ (Block)</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            runAdminAction(
                              {
                                action: 'kick_player',
                                userId: p.id,
                                reason: playerReasons[p.id] || 'Session kicked by Admin',
                              },
                              `Kicked player ${p.username} (session revoked).`
                            )
                          }
                          className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium text-xs"
                        >
                          Kick
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAdminHistoryUsername(p.username);
                            setAdminHistoryPage(1);
                            fetchAdminPlayerHistory({
                              username: p.username,
                              mode: adminHistoryMode,
                              page: 1,
                            });
                            if (typeof window !== 'undefined') {
                              window.scrollTo({ top: 280, behavior: 'smooth' });
                            }
                          }}
                          className="h-9 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>የጨዋታ ታሪክ (History)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAdjUserId(p.id)}
                          className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium text-xs"
                        >
                          ሂሳብ አስተካክል (Balance)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPredTargetUserId(String(p.id));
                            runAdminAction(
                              {
                                action: 'set_predetermined_winner',
                                roomId: quickTargetRoomId === 'ALL' ? 'ALL' : Number(quickTargetRoomId),
                                enabled: true,
                                targetType: 'PLAYER',
                                targetUserId: p.id,
                                autoClearAfterWin: predAutoClear,
                              },
                              `🏆 ተጫዋች ${p.username} የቀጣይ ዙር አሸናፊ እንዲሆን ተወስኗል!`
                            );
                          }}
                          className="h-9 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>🏆 አሸናፊ አድርግ (Set to Win)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openResetModal({
                              userId: p.id,
                              username: p.username,
                              phone: p.phone || undefined,
                            })
                          }
                          className="h-9 px-3 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 font-bold text-xs flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                          <span>የይለፍ ቃል ቀይር (Reset)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 3: ROOMS & ROUND MANAGEMENT (Create/Edit Room, Winning Pattern, Cancel Round)
           ==================================================================== */}
        {activeTab === 'rooms' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-white">
                የጨዋታ ክፍሎች እና የአሁኑ ዙር ተጫዋቾች (Configured Bingo Rooms & Active Rounds)
              </h2>
              <div className="divide-y divide-slate-800 text-xs">
                {(dashboard.rooms || []).map((rm: any) => (
                  <div key={rm.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-sm text-white">
                          {rm.nameAm === 'መርካቶ' ? 'ዋናው ጭዋታ' : rm.nameAm}
                        </strong>
                        <span className="text-slate-400">
                          ({rm.nameEn === 'Merkato' ? 'Main Game' : rm.nameEn})
                        </span>
                        <span>·</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {formatEtb(rm.ticketPriceMinor, 'en')} / ካርቴላ
                        </span>
                      </div>
                      <div className="text-amber-300 font-semibold">
                        የማሸነፊያ ህግ (ዝግ): {getPatternLabel(rm.pattern as BingoPattern, 'am')} ({getPatternLabel(rm.pattern as BingoPattern, 'en')}) · ሰዓት ቆጣሪ: {rm.cadenceSeconds} ሰከንድ
                      </div>
                      <div className="text-slate-400 font-mono">
                        Active Round #{rm.activeRoundId || '-'} ({rm.activeRoundStatus || 'IDLE'}) ·{' '}
                        <strong className="text-emerald-400">
                          የዙር ተጫዋቾች: {rm.activePlayerCount || 0} (ካርቴላዎች: {rm.activeTicketCount || 0})
                        </strong>{' '}
                        · Fee: {(rm.houseFeeBps / 100).toFixed(1)}%
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[11px] text-slate-400 font-semibold">ፈጣን የመወራረጃ ብር:</span>
                        {[10, 20, 30, 50, 100, 200].map((birr) => (
                          <button
                            key={birr}
                            type="button"
                            onClick={() =>
                              runAdminAction(
                                {
                                  action: 'set_bet_amount',
                                  roomId: rm.id,
                                  ticketPriceMinor: birr * 100,
                                },
                                `የ ${rm.nameAm} የመወራረጃ ብር ወደ ${birr} ብር ተቀይሯል!`
                              )
                            }
                            className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border ${
                              rm.ticketPriceMinor === birr * 100
                                ? 'bg-emerald-500 text-slate-950 border-white'
                                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                            }`}
                          >
                            {birr} ብር
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoomId(rm.id);
                          setRmNameEn(rm.nameEn);
                          setRmNameAm(rm.nameAm);
                          setRmPriceBirr(String(rm.ticketPriceMinor / 100));
                          setRmPattern(rm.pattern as BingoPattern);
                          setRmMinPlayers(String(rm.minPlayers));
                          setRmMinCards(String(rm.minCardsPerPlayer));
                          setRmMaxCards(String(rm.maxCardsPerPlayer));
                          setRmFeeBps(String(rm.houseFeeBps));
                          setRmDrawInterval(String(rm.drawIntervalSeconds));
                          setRmCadence(String(rm.cadenceSeconds));
                          setRmIsPractice(rm.isPractice);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                      >
                        አስተካክል (Edit)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAdminAction(
                            {
                              action: 'cancel_round',
                              roomId: rm.id,
                              reason: 'Admin cancelled round & refunded all tickets',
                            },
                            `Cancelled active round in ${rm.nameEn} and refunded all tickets.`
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-red-950 border border-red-800 text-red-200"
                      >
                        ዙሩን ሰርዝ እና ብር መልስ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await runAdminAction(
                  {
                    action: 'save_room',
                    roomId: editingRoomId,
                    nameEn: rmNameEn,
                    nameAm: rmNameAm,
                    ticketPriceMinor: Math.round(parseFloat(rmPriceBirr) * 100),
                    pattern: rmPattern,
                    minPlayers: Number(rmMinPlayers),
                    minCardsPerPlayer: Number(rmMinCards),
                    maxCardsPerPlayer: Number(rmMaxCards),
                    houseFeeBps: Number(rmFeeBps),
                    drawIntervalSeconds: Number(rmDrawInterval),
                    cadenceSeconds: Number(rmCadence),
                    isPractice: rmIsPractice,
                  },
                  editingRoomId ? 'Updated room settings & winning pattern.' : 'Created new Bingo room.'
                );
                if (ok) {
                  setEditingRoomId(null);
                  setRmNameEn('');
                  setRmNameAm('');
                }
              }}
              className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-white">
                  {editingRoomId ? `ክፍል ማስተካከያ (Edit Room #${editingRoomId})` : 'አዲስ ክፍል መፍጠሪያ (Create Room)'}
                </h3>
                {editingRoomId && (
                  <button
                    type="button"
                    onClick={() => setEditingRoomId(null)}
                    className="text-slate-400 underline"
                  >
                    New Room
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Room Name (English)</label>
                  <input
                    type="text"
                    required
                    value={rmNameEn}
                    onChange={(e) => setRmNameEn(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">የክፍል ስም (Amharic)</label>
                  <input
                    type="text"
                    value={rmNameAm}
                    onChange={(e) => setRmNameAm(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">የካርቴላ ዋጋ / Ticket Price (Birr)</label>
                  <input
                    type="number"
                    required
                    value={rmPriceBirr}
                    onChange={(e) => setRmPriceBirr(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-amber-300 font-semibold mb-1">
                    የማሸነፊያ ህግ (Winning Pattern / ዝግ)
                  </label>
                  <select
                    value={rmPattern}
                    onChange={(e) => setRmPattern(e.target.value as BingoPattern)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-amber-500/50 text-white font-semibold"
                  >
                    {WINNING_PATTERN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelAm} — {opt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-emerald-400 font-semibold mb-1">
                    የሰዓት ቆጣሪ / Countdown Timer (Sec)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={rmCadence}
                    onChange={(e) => setRmCadence(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-emerald-500/50 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Cards / Player</label>
                  <input
                    type="number"
                    value={rmMaxCards}
                    onChange={(e) => setRmMaxCards(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">የቤቱ ኮሚሽን / House Fee (Basis Points, 2300=23%)</label>
                  <input
                    type="number"
                    value={rmFeeBps}
                    onChange={(e) => setRmFeeBps(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Ball Draw Speed (Seconds)</label>
                  <input
                    type="number"
                    value={rmDrawInterval}
                    onChange={(e) => setRmDrawInterval(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={rmIsPractice}
                  onChange={(e) => setRmIsPractice(e.target.checked)}
                />
                <span className="text-slate-300">Practice Mode Room (Uses Play-Money Balance)</span>
              </label>

              <button
                type="submit"
                className="w-full h-10 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
              >
                {editingRoomId ? 'ለውጦችን መዝግብ (Save Room Changes)' : 'አዲስ ክፍል ፍጠር (Create Room)'}
              </button>
            </form>
          </div>
        )}

        {/* ====================================================================
            TAB: PASSWORD RESET REQUESTS (የይለፍ ቃል ጥያቄዎች)
           ==================================================================== */}
        {activeTab === 'resets' && (
          <div className="space-y-6">
            {/* Pending Requests Queue */}
            <div className="bg-slate-900 border border-amber-400/40 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <h2 className="font-display text-base font-bold text-white">
                    ያልተመለሱ የይለፍ ቃል መቀየሪያ ጥያቄዎች / Pending Password Resets
                  </h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 font-bold font-mono text-xs">
                  {dashboard.pendingResets?.length || 0} ጥያቄዎች (Pending)
                </span>
              </div>

              {(!dashboard.pendingResets || dashboard.pendingResets.length === 0) ? (
                <div className="py-10 text-center space-y-2 text-slate-400">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
                  <p className="text-sm font-semibold text-white">ምንም ያልተመለሰ የይለፍ ቃል ጥያቄ የለም</p>
                  <p className="text-xs text-slate-500">
                    ተጫዋቾች ከመግቢያ ገጹ ላይ «የይለፍ ቃል ረሱ?» የሚለውን ሲጫኑ ጥያቄያቸው እዚህ ዝርዝር ላይ ይታያል።
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.pendingResets.map((req: any) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-400/50 space-y-3 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-bold">
                            ጥያቄ #{req.id}
                          </span>
                          <strong className="text-sm text-white font-mono">{req.username}</strong>
                          {req.phone && (
                            <span className="text-xs text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              📞 {req.phone}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500">
                            {new Date(req.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                          PENDING
                        </span>
                      </div>

                      {req.notes && (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs text-slate-300">
                          <span className="text-slate-500 font-semibold block text-[11px] mb-0.5">
                            የተጫዋች ማስታወሻ (Player Note):
                          </span>
                          {req.notes}
                        </div>
                      )}

                      {/* Controls: Reset Button, Rejection Input, Reject Button */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            openResetModal({
                              userId: req.userId || undefined,
                              username: req.username,
                              phone: req.phone || undefined,
                              requestId: req.id,
                              notes: req.notes || undefined,
                            })
                          }
                          className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>አጽድቅ እና የይለፍ ቃል ቀይር (Approve & Reset)</span>
                        </button>

                        <input
                          type="text"
                          placeholder="የውድቅ ምክንያት (Rejection reason)..."
                          value={resetRejectReasons[req.id] || ''}
                          onChange={(e) =>
                            setResetRejectReasons({
                              ...resetRejectReasons,
                              [req.id]: e.target.value,
                            })
                          }
                          className="flex-1 min-w-[170px] h-9 px-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            runAdminAction(
                              {
                                action: 'reject_password_reset',
                                requestId: req.id,
                                reason:
                                  resetRejectReasons[req.id] ||
                                  'የቀረበው መረጃ ትክክለኛ አይደለም (Verification details invalid)',
                              },
                              `የይለፍ ቃል ጥያቄ #${req.id} ውድቅ ተደርጓል።`
                            )
                          }
                          className="px-3.5 py-2 rounded-xl bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-bold text-xs transition-colors"
                        >
                          ❌ ውድቅ አድርግ (Reject)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Past Resolved / Rejected Requests */}
            {dashboard.pastResets && dashboard.pastResets.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="font-display text-sm font-bold text-white">
                  ያለፉ የይለፍ ቃል ጥያቄዎች ታሪክ / Past Reset History ({dashboard.pastResets.length})
                </h3>
                <div className="divide-y divide-slate-800 text-xs">
                  {dashboard.pastResets.map((r: any) => (
                    <div key={r.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-slate-500">#{r.id}</span>
                        <strong className="text-white font-mono">{r.username}</strong>
                        {r.phone && <span className="text-slate-400 font-mono">({r.phone})</span>}
                        {r.status === 'RESOLVED' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px]">
                            ተቀይሯል (RESOLVED)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-bold text-[10px]">
                            ውድቅ ተደርጓል (REJECTED)
                          </span>
                        )}
                        {r.rejectionReason && (
                          <span className="text-slate-400 text-[11px]">
                            ምክንያት፦ {r.rejectionReason}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {r.decidedAt ? new Date(r.decidedAt).toLocaleString() : new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 4: TRANSACTION & GAME AUDIT LOGS
            (Individual Deposits, Withdrawals with Pending/Approved/Rejected Status,
             Per-Game Commission Deductions, and System Security Audit Logs)
           ==================================================================== */}
        {activeTab === 'audit' && (() => {
          const allDepositsLog: any[] = dashboard.allDepositsLog || [];
          const allWithdrawalsLog: any[] = dashboard.allWithdrawalsLog || [];
          const gameCommissionLogs: any[] = dashboard.gameCommissionLogs || [];
          const securityAuditLogs: any[] = dashboard.auditLogs || [];

          const q = auditSearchQuery.trim().toLowerCase();

          const filteredDeposits = allDepositsLog.filter((d) => {
            if (auditTxStatusFilter !== 'ALL' && d.status !== auditTxStatusFilter) return false;
            if (!q) return true;
            return (
              String(d.username || '').toLowerCase().includes(q) ||
              String(d.transactionRef || '').toLowerCase().includes(q) ||
              String(d.provider || '').toLowerCase().includes(q) ||
              String(d.id).includes(q)
            );
          });

          const filteredWithdrawals = allWithdrawalsLog.filter((w) => {
            if (auditTxStatusFilter !== 'ALL' && w.status !== auditTxStatusFilter) return false;
            if (!q) return true;
            return (
              String(w.username || '').toLowerCase().includes(q) ||
              String(w.destinationAccount || '').toLowerCase().includes(q) ||
              String(w.provider || '').toLowerCase().includes(q) ||
              String(w.id).includes(q)
            );
          });

          const filteredCommissions = gameCommissionLogs.filter((g) => {
            if (!q) return true;
            return (
              String(g.roomNameEn || '').toLowerCase().includes(q) ||
              String(g.roomNameAm || '').toLowerCase().includes(q) ||
              String(g.roundId).includes(q)
            );
          });

          const exportAuditLogsCsv = () => {
            if (typeof window === 'undefined' || !authenticated || !adminTokenRef.current || !dashboard) return;
            const lines: string[] = [];
            lines.push(escapeCsvCellSafe('# PER-GAME COMMISSION DEDUCTIONS LOG'));
            lines.push(
              'Round ID,Settled At,Room,Tickets Sold,Ticket Price (ETB),Total Pot (ETB),Commission %,Commission Deducted (ETB),Net Winner Prize (ETB),Winners Count,Per Winner Payout (ETB)'
            );
            for (const g of filteredCommissions) {
              lines.push(
                [
                  `#${g.roundId}`,
                  g.settledAt ? new Date(g.settledAt).toISOString() : '',
                  escapeCsvCellSafe(g.roomNameEn || ''),
                  g.ticketsSold,
                  (g.ticketPriceMinor / 100).toFixed(2),
                  (g.potMinor / 100).toFixed(2),
                  `${g.commissionPercent}%`,
                  (g.houseFeeMinor / 100).toFixed(2),
                  (g.netPrizeMinor / 100).toFixed(2),
                  g.winnersCount,
                  (g.perWinnerMinor / 100).toFixed(2),
                ].join(',')
              );
            }
            lines.push('');
            lines.push(escapeCsvCellSafe('# INDIVIDUAL DEPOSITS AUDIT LOG'));
            lines.push('ID,Created At,Decided At,Username,Provider,Reference,Amount (ETB),Status,Reviewed By,Rejection Reason');
            for (const d of filteredDeposits) {
              lines.push(
                [
                  `#${d.id}`,
                  d.createdAt ? new Date(d.createdAt).toISOString() : '',
                  d.decidedAt ? new Date(d.decidedAt).toISOString() : '',
                  escapeCsvCellSafe(d.username || ''),
                  escapeCsvCellSafe(d.provider || ''),
                  escapeCsvCellSafe(d.transactionRef || ''),
                  (d.amountMinor / 100).toFixed(2),
                  escapeCsvCellSafe(d.status || ''),
                  escapeCsvCellSafe(d.decidedByUsername || ''),
                  escapeCsvCellSafe(d.rejectionReason || ''),
                ].join(',')
              );
            }
            lines.push('');
            lines.push(escapeCsvCellSafe('# INDIVIDUAL WITHDRAWALS AUDIT LOG'));
            lines.push('ID,Created At,Decided At,Username,Method,Destination Account,Amount (ETB),Status,Reviewed By,Rejection Reason');
            for (const w of filteredWithdrawals) {
              lines.push(
                [
                  `#${w.id}`,
                  w.createdAt ? new Date(w.createdAt).toISOString() : '',
                  w.decidedAt ? new Date(w.decidedAt).toISOString() : '',
                  escapeCsvCellSafe(w.username || ''),
                  escapeCsvCellSafe(w.provider || ''),
                  escapeCsvCellSafe(w.destinationAccount || ''),
                  (w.amountMinor / 100).toFixed(2),
                  escapeCsvCellSafe(w.status || ''),
                  escapeCsvCellSafe(w.decidedByUsername || ''),
                  escapeCsvCellSafe(w.rejectionReason || ''),
                ].join(',')
              );
            }

            const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `winner-bingo-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          };

          const renderStatusBadge = (status: string) => {
            if (status === 'APPROVED') {
              return (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">
                  APPROVED (ጸድቋል)
                </span>
              );
            }
            if (status === 'REJECTED') {
              return (
                <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-[10px]">
                  REJECTED (ውድቅ ተደርጓል)
                </span>
              );
            }
            return (
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold text-[10px]">
                PENDING (በመጠባበቅ ላይ)
              </span>
            );
          };

          return (
            <div className="space-y-5">
              {/* Top Filter & Sub-Tab Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base sm:text-lg font-bold text-white">
                      የግብይት፣ የወጪ/ገቢ እና የጨዋታ ኮሚሽን ኦዲት መዝገብ (Transaction & Game Audit Logs)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      ዝርዝር የገቢ፣ የወጪ (Pending, Approved, Rejected) እና በእያንዳንዱ ጨዋታ የተቆረጠ የቤት ኮሚሽን ታሪክ።
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportAuditLogsCsv}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs whitespace-nowrap self-start lg:self-auto cursor-pointer shadow-sm"
                  >
                    Export Audit Logs to CSV
                  </button>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                  {/* Category Sub-Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'ALL', label: 'ሁሉም (All Audit Logs)' },
                      { id: 'COMMISSION', label: `የጨዋታ ኮሚሽን (${gameCommissionLogs.length})` },
                      { id: 'DEPOSITS', label: `የገቢ መዝገብ / Deposits (${allDepositsLog.length})` },
                      { id: 'WITHDRAWALS', label: `የወጪ መዝገብ / Withdrawals (${allWithdrawalsLog.length})` },
                      { id: 'SECURITY', label: `የሲስተም ኦዲት (${securityAuditLogs.length})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAuditSubTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          auditSubTab === tab.id
                            ? 'bg-amber-400 text-slate-950 border-amber-200'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Status Filter + Search Input */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setAuditTxStatusFilter(st)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                            auditTxStatusFilter === st
                              ? 'bg-emerald-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={auditSearchQuery}
                      onChange={(e) => setAuditSearchQuery(e.target.value)}
                      placeholder="ፈልግ (Username, Ref, Room, #ID)..."
                      className="h-8 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 1. PER-GAME COMMISSION DEDUCTIONS LOG */}
              {(auditSubTab === 'ALL' || auditSubTab === 'COMMISSION') && (
                <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-sm sm:text-base font-bold text-amber-300">
                        1. በእያንዳንዱ ጨዋታ የተቆረጠ የቤት ኮሚሽን መዝገብ (Per-Game Commission Deductions Log)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        እያንዳንዱ ዙር ሲጠናቀቅ ከጠቅላላ ውርርድ (Pot) ላይ የተቀነሰው የቤት ኮሚሽን እና ለአሸናፊዎች የተከፈለው የተጣራ ሽልማት።
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-400/15 text-amber-300 font-mono text-xs font-bold">
                      {filteredCommissions.length} ዙሮች (Rounds)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 pr-3">ዙር (Round)</th>
                          <th className="py-2.5 px-3">ቀን/ሰዓት (Settled At)</th>
                          <th className="py-2.5 px-3">ክፍል (Room)</th>
                          <th className="py-2.5 px-3 text-right">ካርቴላዎች (Cards)</th>
                          <th className="py-2.5 px-3 text-right">ጠቅላላ ፖት (Total Pot)</th>
                          <th className="py-2.5 px-3 text-right">ኮሚሽን %</th>
                          <th className="py-2.5 px-3 text-right text-amber-300">የተቆረጠ ኮሚሽን (Commission)</th>
                          <th className="py-2.5 px-3 text-right text-emerald-400">ለአሸናፊ የተከፈለ (Winner Prize)</th>
                          <th className="py-2.5 pl-3 text-right">አሸናፊዎች (Winners)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredCommissions.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-6 text-center text-slate-500 font-sans">
                              ምንም የተጠናቀቀ የጨዋታ ኮሚሽን መዝገብ አልተገኘም (No settled game commission logs found).
                            </td>
                          </tr>
                        ) : (
                          filteredCommissions.map((g: any) => (
                            <tr key={g.roundId} className="hover:bg-slate-800/40">
                              <td className="py-2.5 pr-3 font-bold text-white">#{g.roundId}</td>
                              <td className="py-2.5 px-3 text-slate-400">
                                {g.settledAt ? new Date(g.settledAt).toLocaleString() : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-200 font-sans">
                                {g.roomNameAm} ({g.roomNameEn})
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                {g.ticketsSold} × {formatEtb(g.ticketPriceMinor, 'en')}
                              </td>
                              <td className="py-2.5 px-3 text-right text-white font-semibold">
                                {formatEtb(g.potMinor, 'en')}
                              </td>
                              <td className="py-2.5 px-3 text-right text-amber-200">
                                {g.commissionPercent}%
                              </td>
                              <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                                -{formatEtb(g.houseFeeMinor, 'en')}
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                                {formatEtb(g.netPrizeMinor, 'en')}
                              </td>
                              <td className="py-2.5 pl-3 text-right text-slate-300">
                                {g.winnersCount} ({formatEtb(g.perWinnerMinor, 'en')})
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. INDIVIDUAL DEPOSITS AUDIT LOG */}
              {(auditSubTab === 'ALL' || auditSubTab === 'DEPOSITS') && (
                <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-sm sm:text-base font-bold text-emerald-300">
                        2. የገቢ ክፍያዎች ዝርዝር ኦዲት መዝገብ (Individual Deposits Audit Log — Pending / Approved / Rejected)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        ሁሉም የተጫዋቾች የገቢ ጥያቄዎች ከነሁኔታቸው (Pending, Approved, Rejected) እና ያጸደቀው አድሚን።
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 font-mono text-xs font-bold">
                      {filteredDeposits.length} መዝገቦች (Records)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 pr-3">ID</th>
                          <th className="py-2.5 px-3">ቀን/ሰዓት (Created)</th>
                          <th className="py-2.5 px-3">ተጫዋች (Player)</th>
                          <th className="py-2.5 px-3">መንገድ (Method)</th>
                          <th className="py-2.5 px-3">Ref / መለያ</th>
                          <th className="py-2.5 px-3 text-right">የብር መጠን (Amount)</th>
                          <th className="py-2.5 px-3">ሁኔታ (Status)</th>
                          <th className="py-2.5 pl-3">ውሳኔ / ምክንያት (Reviewed By / Notes)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredDeposits.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                              ምንም የገቢ መዝገብ አልተገኘም (No deposit records match filter).
                            </td>
                          </tr>
                        ) : (
                          filteredDeposits.map((d: any) => (
                            <tr key={d.id} className="hover:bg-slate-800/40">
                              <td className="py-2.5 pr-3 text-slate-400">#{d.id}</td>
                              <td className="py-2.5 px-3 text-slate-400">
                                {d.createdAt ? new Date(d.createdAt).toLocaleString() : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-white font-bold">{d.username}</td>
                              <td className="py-2.5 px-3 text-slate-300">{d.provider}</td>
                              <td className="py-2.5 px-3 text-slate-300">{d.transactionRef}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                                +{formatEtb(d.amountMinor, 'en')}
                              </td>
                              <td className="py-2.5 px-3">{renderStatusBadge(d.status)}</td>
                              <td className="py-2.5 pl-3 text-slate-300 font-sans">
                                {d.decidedByUsername ? `By ${d.decidedByUsername}` : '-'}
                                {d.rejectionReason ? ` — ${d.rejectionReason}` : ''}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. INDIVIDUAL WITHDRAWALS AUDIT LOG */}
              {(auditSubTab === 'ALL' || auditSubTab === 'WITHDRAWALS') && (
                <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-sm sm:text-base font-bold text-sky-300">
                        3. የወጪ ክፍያዎች ዝርዝር ኦዲት መዝገብ (Individual Withdrawals Audit Log — Pending / Approved / Rejected)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        ሁሉም የተጫዋቾች የወጪ ጥያቄዎች ከነሁኔታቸው (Pending, Approved, Rejected) እና የባንክ/ቴሌብር አካውንት መረጃ።
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 font-mono text-xs font-bold">
                      {filteredWithdrawals.length} መዝገቦች (Records)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 pr-3">ID</th>
                          <th className="py-2.5 px-3">ቀን/ሰዓት (Created)</th>
                          <th className="py-2.5 px-3">ተጫዋች (Player)</th>
                          <th className="py-2.5 px-3">መንገድ (Method)</th>
                          <th className="py-2.5 px-3">መቀበያ አካውንት (Account)</th>
                          <th className="py-2.5 px-3 text-right">የብር መጠን (Amount)</th>
                          <th className="py-2.5 px-3">ሁኔታ (Status)</th>
                          <th className="py-2.5 pl-3">ውሳኔ / ምክንያት (Reviewed By / Notes)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredWithdrawals.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                              ምንም የወጪ መዝገብ አልተገኘም (No withdrawal records match filter).
                            </td>
                          </tr>
                        ) : (
                          filteredWithdrawals.map((w: any) => (
                            <tr key={w.id} className="hover:bg-slate-800/40">
                              <td className="py-2.5 pr-3 text-slate-400">#{w.id}</td>
                              <td className="py-2.5 px-3 text-slate-400">
                                {w.createdAt ? new Date(w.createdAt).toLocaleString() : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-white font-bold">{w.username}</td>
                              <td className="py-2.5 px-3 text-slate-300">{w.provider}</td>
                              <td className="py-2.5 px-3 text-amber-200">{w.destinationAccount}</td>
                              <td className="py-2.5 px-3 text-right text-sky-300 font-bold">
                                -{formatEtb(w.amountMinor, 'en')}
                              </td>
                              <td className="py-2.5 px-3">{renderStatusBadge(w.status)}</td>
                              <td className="py-2.5 pl-3 text-slate-300 font-sans">
                                {w.decidedByUsername ? `By ${w.decidedByUsername}` : '-'}
                                {w.rejectionReason ? ` — ${w.rejectionReason}` : ''}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. SYSTEM & SECURITY AUDIT LOG */}
              {(auditSubTab === 'ALL' || auditSubTab === 'SECURITY') && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="font-display text-sm sm:text-base font-bold text-white">
                    4. የሲስተም እና የደህንነት ኦዲት መዝገብ (Immutable System & Security Audit Log)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 pr-3">ID</th>
                          <th className="py-2 pr-3">Time</th>
                          <th className="py-2 pr-3">Actor</th>
                          <th className="py-2 pr-3">Target</th>
                          <th className="py-2 pr-3">Action</th>
                          <th className="py-2 pr-3">Reason / Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {securityAuditLogs.map((log: any) => (
                          <tr key={log.id} className="hover:bg-slate-800/40">
                            <td className="py-2 pr-3 text-slate-500">#{log.id}</td>
                            <td className="py-2 pr-3 text-slate-400">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2 pr-3 text-emerald-400">{log.actorUsername || 'SYSTEM'}</td>
                            <td className="py-2 pr-3 text-amber-300">{log.targetUsername || '-'}</td>
                            <td className="py-2 pr-3 text-white font-semibold">{log.action}</td>
                            <td className="py-2 pr-3 text-slate-300 font-sans">
                              {log.reason || log.metadataJson || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </main>

      {/* ====================================================================
          ADMIN PASSWORD RESET MODAL
         ==================================================================== */}
      {resetModalPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white">
                    የይለፍ ቃል መቀየሪያ (Reset Password)
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    ተጫዋች: <strong className="text-amber-300">{resetModalPlayer.username}</strong>
                    {resetModalPlayer.userId ? ` (#${resetModalPlayer.userId})` : ''}
                    {resetModalPlayer.phone ? ` · ${resetModalPlayer.phone}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalPlayer(null)}
                className="text-xs text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {resetSuccessData ? (
              <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/60 space-y-3 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-emerald-300">
                  የይለፍ ቃሉ በተሳካ ሁኔታ ተቀይሯል!
                </h4>
                <p className="text-xs text-slate-300">
                  አዲሱ ጊዜያዊ የይለፍ ቃል ለተጫዋቹ ተመዝግቧል። አሁኑኑ ኮፒ አድርገው ለተጫዋቹ በቴሌግራም ወይም በስልክ ይላኩለት፦
                </p>
                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/40 flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-extrabold text-amber-300 tracking-wider">
                    {resetSuccessData.tempPassword}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(resetSuccessData.tempPassword);
                      setResetCopied(true);
                      setTimeout(() => setResetCopied(false), 2500);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    {resetCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{resetCopied ? 'ተቀድቷል!' : 'ኮፒ'}</span>
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `ሰላም ${resetSuccessData.username}፣ የ Winner Bingo ጊዜያዊ የይለፍ ቃልዎ፦ ${resetSuccessData.tempPassword} ነው። ገብተው መቀየር ይችላሉ።`;
                      navigator.clipboard.writeText(msg);
                      setResetCopied(true);
                      setTimeout(() => setResetCopied(false), 2500);
                    }}
                    className="flex-1 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>መልዕክት ኮፒ አድርግ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetModalPlayer(null)}
                    className="flex-1 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    ጨርስ (Done)
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    አዲስ ጊዜያዊ የይለፍ ቃል (New Temporary Password)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={resetPasswordInput}
                      onChange={(e) => setResetPasswordInput(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="flex-1 h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 font-mono text-sm text-amber-300 font-bold focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setResetPasswordInput(generateTempPassword())}
                      title="አዲስ አመንጭ (Generate Random)"
                      className="h-10 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>አመንጭ</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    ሲስተሙ በአውቶማቲክ ያመነጨውን መጠቀም ወይም የፈለጉትን የይለፍ ቃል እዚህ መጻፍ ይችላሉ።
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <span>💡 ማስታወሻ:</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    የይለፍ ቃሉ ሲቀየር የተጫዋቹ የነበሩ ክፍለ-ጊዜዎች (Sessions) በሙሉ ይሰረዛሉ፤ የተቆለፉ ሙከራዎች ይለቀቃሉ፤ አዲሱ የይለፍ ቃል ወዲያውኑ ስራ ላይ ይውላል።
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalPlayer(null)}
                    className="flex-1 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    ይቅር (Cancel)
                  </button>
                  <button
                    type="button"
                    disabled={resetSubmitting || resetPasswordInput.trim().length < 6}
                    onClick={async () => {
                      setResetSubmitting(true);
                      const res = await adminFetch('/api/admin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'admin_reset_player_password',
                          userId: resetModalPlayer.userId,
                          requestId: resetModalPlayer.requestId,
                          newPassword: resetPasswordInput.trim(),
                        }),
                      });
                      const data = await res.json();
                      setResetSubmitting(false);
                      if (!res.ok) {
                        setActionBanner({ type: 'error', text: data.error || 'Password reset failed' });
                      } else {
                        setResetSuccessData({
                          username: resetModalPlayer.username,
                          tempPassword: resetPasswordInput.trim(),
                        });
                        await fetchAdminDashboard();
                      }
                    }}
                    className="flex-[2] h-10 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md"
                  >
                    {resetSubmitting ? (
                      <span>በመቀየር ላይ...</span>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>አጽድቅ እና ቀይር (Confirm & Reset)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proof Image Modal */}
      {proofPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 max-w-lg w-full space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white">Deposit Proof Screenshot</h3>
              <button
                type="button"
                onClick={() => setProofPreviewUrl(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofPreviewUrl}
              alt="Deposit Receipt Proof"
              referrerPolicy="no-referrer"
              className="w-full max-h-[65vh] object-contain rounded-lg border border-slate-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
