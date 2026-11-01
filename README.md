# Habesha Bingo — Real-Time 75-Ball Multiplayer Bingo Platform

## Overview
A secure, provably fair, real-time 75-ball Bingo platform built with Next.js, TypeScript, Drizzle ORM, and PostgreSQL (Cloud SQL).

## Key Capabilities across Phases 1–10
- **Phase 1 (Setup & Health)**: `/api/health` endpoint reporting UTC server clock, `Africa/Addis_Ababa` timezone, maintenance state, and zero-drift wallet reconciliation.
- **Phase 2 (Pure TypeScript Game Engine)**: 75-ball card generator (`B 1-15`, `I 16-30`, `N 31-45`, `G 46-60`, `O 61-75`, center `FREE`), deterministic 1–400 card pool, unbiased Fisher-Yates CSPRNG + `HMAC_SHA256(serverSeed, roundId)` commit-reveal draw derivation, and integer tie-splitting (`src/lib/bingo-engine.ts`).
- **Phase 3 (Database & Auth)**: Mandatory login screen, 18+ age verification, `scrypt` password hashing, rate-limiting & 5-attempt 15-minute brute-force lockout, single active session per account, and a single hidden admin account (`src/db/schema.ts`, `src/db/users.ts`, `src/lib/auth.ts`).
- **Phase 4 (Wallet & Append-Only Integer Ledger)**: Atomic PostgreSQL transactions using `SELECT ... FOR UPDATE`, idempotency keys (`idempotency_key UNIQUE`), and automated wallet-to-ledger reconciliation (`src/lib/ledger.ts`).
- **Phase 5 (Payments & Mandatory Admin Approval)**: `PaymentProvider` interface with Mock, Telebirr, CBE Birr, and Chapa adapters. Every deposit and withdrawal starts as `PENDING` and requires explicit Admin approval or rejection (with mandatory reason). Duplicate deposit transaction references are rejected.
- **Phase 6 (Synchronized Live Rounds & Spectator Mode)**: Shared room rounds on a synchronized UTC schedule, automatic refund if `minPlayers` is not reached, mid-round Spectator Mode for late joiners, and rate-limited BINGO claim validation (`src/lib/game-coordinator.ts`).
- **Phase 7 & 8 (Mobile-First Amharic + English UI & Responsible Gaming)**: Side-by-side Cartela (~58% width) and 1–75 Master Board (~42% width) plus permanent "Called so far" strip, WCAG AA checkmarks on called cells, daily deposit limits, and self-exclusion (`app/page.tsx`).
- **Phase 9 (Hidden Single Admin Console)**: Isolated at `/admin` (`app/admin/page.tsx`), protected by 2FA (`123456`) and returning HTTP `404` to non-admins on `/api/admin`. Includes Deposit/Withdrawal Approval Queues, Player Kick/Block/Unblock, Manual Wallet Adjustments, Room Management, Maintenance Mode, and Audit Log Viewer.

## Running Unit Tests
```bash
npx vitest run
```
