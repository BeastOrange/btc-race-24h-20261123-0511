[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/BeastOrange/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/BeastOrange/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# Dynamic Volatility Breakout (DVB) - BTC Trading Bot

A high-conviction, low-turnover trend breakout bot engineered for the **make.fun** 24-hour Bitcoin trading competition (`btc-race-24h-20261123-0511`).

## Strategy Architecture

Trading cbBTC/USDC on 1-minute bars is inherently noisy, and on-chain swap fees, slippage, and price impact impose ~26 basis points (bps) of round-trip execution drag. Standard moving-average or RSI crossover algorithms over-trade in consolidation regimes, quickly losing 5–10% of portfolio value solely to transaction fees.

The **Dynamic Volatility Breakout (DVB)** bot avoids this churn through selective, high-conviction participation:

1. **Selective Breakout Entry**:
   - Maintains a rolling lookback window of 18 bars.
   - Enters long only when the current bar's close breaks strictly above the upper Donchian channel (`max(recent_highs[-lookback-1 : -1])`).
   - Requires positive momentum confirmation: the price return over the lookback window must exceed a minimum threshold (`+12 bps`), ensuring we do not buy into flat or decaying volatility.
   - Allocates 100% of available cash on entry (`min(cash, weightRoom)`), respecting the long-only, single-position constraint.

2. **Multi-Tier Dynamic Exit Management**:
   - **Tier 1 (Trailing Profit Lock)**: Once unrealized gain reaches `+85 bps` (comfortably surpassing the ~26 bps round-trip friction hurdle), a trailing stop activates. If price pulls back by `28 bps` from the trade's peak mark, the bot exits to protect accumulated gains.
   - **Tier 2 (Protective Stop Loss)**: If price drops `55 bps` below the entry mark, the position is immediately liquidated to protect capital and prevent severe drawdowns.
   - **Tier 3 (Session End Buffer)**: Automatically flattens open positions at bar 1436 before the 24-hour race window closes at bar 1439, avoiding unmanaged liquidation.
   - **Tier 4 (Whipsaw Cooldown)**: Enforces a 25-bar cooldown pause following any position exit, preventing rapid re-entry into choppy false breakouts.
   - **Max Trade Cap**: Strictly limits trading frequency (at most 3 full round trips per day), keeping cumulative fee friction low and exposure focused on explosive momentum waves.

3. **Deterministic Implementation**:
   - Implemented in clean, modern TypeScript for Node 22 (using native type-stripping, standard library, and the official kit SDK shim).
   - Strict `BigInt` integer arithmetic prevents float rounding drift.
   - 100% deterministic bar-by-bar execution.

## Dev-Window Grade Results

Graded locally on the competition's frozen dev window (2026-11-22 05:11 UTC to 2026-11-23 05:11 UTC, 1,440 one-minute bars) using the official make.fun kit grader:

- **Net PnL**: `+27.986507 USDC` (+2.80% return on $1,000 capital)
- **Net PnL at 2x Fees**: `+25.528990 USDC`
- **Total Fees Paid**: `2.442236 USDC`
- **Win Rate**: `100.0%` (3/3 winning round trips)
- **Max Drawdown**: `0.012359341` (1.24%, well below the 25% guardrail)
- **Trades**: `6 trades` (3 buys, 3 sells), `0 rejected`
- **Sharpe Ratio**: `0.040839648`
- **Exposure**: `19.44%` (held safe cash for >80% of the day)
- **Guardrails**: `Met` (trades ok, symbols ok, drawdown ok)
- **Result SHA-256**: `abe4dc371ae51a8d7de254ecb6f718cd91e610f38996d98ad38ba48fdf64b228`
- **Action Log SHA-256**: `0d3f0d19bca1948db3fd1f6f148a8669762cda030784df38ced41123f7056107`
- **L1 Regrade**: Reproduced byte for byte

## How to Run

### Local Grading
```bash
node <kit>/cli/makefun.mjs grade-local \
  --kit <kit-directory> \
  --bot . \
  --driver process \
  --worktree
```

### Standalone Protocol Execution
The bot speaks `agent-fun/bars-replay/v1` over `stdin` and `stdout`:
```bash
node main.ts
```

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
