# Provably Fair Cryptographic Specification (`FAIRNESS.md`)

## 1. Commit-Reveal Protocol
Every Bingo round follows a strict cryptographic commit-reveal protocol:
1. **Seed Generation**: Before a round opens (`OPEN`), the server generates a 256-bit cryptographically secure random seed (`serverSeed = crypto.randomBytes(32).toString('hex')`).
2. **Pre-Round Commitment**: The server computes and publishes `serverSeedHash = SHA256(serverSeed)` in the lobby and live game screen before any balls are drawn.
3. **Unbiased Deterministic Shuffle (`deriveDrawOrder`)**:
   - The 75-ball draw order (`1..75`) is derived deterministically from `HMAC_SHA256(serverSeed, "round:<roundId>:<counter>")`.
   - Using Fisher-Yates shuffle with 32-bit rejection sampling (`limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive`), modulo bias is completely eliminated.
4. **Post-Round Reveal & Verification (`verifyRound`)**:
   - While a round is `OPEN`, `LOCKED`, or `DRAWING`, `serverSeed` is never transmitted to any client.
   - Once the round transitions to `SETTLED` or `CANCELLED`, `serverSeed` is revealed in the round history and verifier tab so any player can independently verify:
     - `SHA256(serverSeed) === publishedSeedHash`
     - `deriveDrawOrder(serverSeed, roundId)` matches the exact sequence of balls drawn.

## 2. Deterministic Prize Math & Tie-Splitting Rules
All monetary calculations use integer minor units (`1 Birr = 100 santim`):
- `potMinor = ticketCount * ticketPriceMinor`
- `baseHouseFeeMinor = Math.floor((potMinor * houseFeeBps) / 10000)`
- `netPrizeMinor = potMinor - baseHouseFeeMinor`
- If $k \ge 1$ winning tickets claim BINGO on the same draw:
  - `perWinnerMinor = Math.floor(netPrizeMinor / k)`
  - `remainderMinor = netPrizeMinor - (perWinnerMinor * k)`
  - Any indivisible integer santim remainder goes to the house (`effectiveHouseFeeMinor = baseHouseFeeMinor + remainderMinor`), ensuring `k * perWinnerMinor + effectiveHouseFeeMinor === potMinor` with zero ledger drift.
