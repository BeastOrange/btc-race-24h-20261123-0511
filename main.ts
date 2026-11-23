/**
 * Dynamic Volatility Breakout (DVB) Trading Bot for make.fun CBBTC/USDC 24h race.
 *
 * Strategy Architecture:
 * - Market Context: Long-only trading on cbBTC/USDC with 1-minute bars. High-friction environment
 *   where round-trip execution costs (~26 bps total: 4 bps fee + 2 bps slippage + market impact each way)
 *   severely punish high-frequency turnover.
 * - Selective Breakout Entry:
 *   Tracks a rolling lookback window of bars. Enters long when the current close breaks above
 *   the upper Donchian channel (highest high of the prior lookback bars) with confirmed positive
 *   momentum velocity (minimum momentum hurdle in bps).
 * - Multi-Tier Risk Management & Exit:
 *   1. Trailing Profit Lock: Once unrealized gain from entry reaches the profit activation hurdle,
 *      a dynamic trailing stop locks in gains if price retraces by the trailing threshold from peak.
 *   2. Protective Stop Loss: Strictly bounds downside by cutting positions if price drops by the stop threshold.
 *   3. Session End Buffer: Flattens open positions cleanly before the 24-hour race window closes.
 *   4. Inter-Trade Cooldown: Enforces a pause after each exit to prevent whipsaw re-entry during choppy ranges.
 * - Execution & Determinism:
 *   Standard library and kit SDK shim only. 100% deterministic bar-by-bar execution.
 */

import { runBars, BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

// Strategy Parameters - Variant: Responsive Dynamic Breakout
const LOOKBACK_BARS = 18;
const MIN_MOMENTUM_BPS = 12n;
const PROFIT_TARGET_BPS = 85n;
const TRAILING_STOP_BPS = 28n;
const STOP_LOSS_BPS = 55n;
const COOLDOWN_BARS = 25;
const MAX_TRADES_TOTAL = 3;
const MAX_SLIPPAGE_BPS = 100;
const BPS_DIVISOR = 10_000n;
const MIN_NOTIONAL_RAW = 1_000_000n; // 1 USDC

class DVBStrategy {
  private readonly symbol = 'CBBTC';
  private entryPrice: bigint | null = null;
  private peakPrice: bigint | null = null;
  private tradesCount = 0;
  private lastExitSeq = -999;
  private readonly recentHighs: bigint[] = [];
  private readonly recentCloses: bigint[] = [];

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = state.latest.get(this.symbol);
    if (!bar) {
      return [];
    }

    const c = BigInt(bar.c);
    const h = BigInt(bar.h);
    const seq = batch.seq;

    // Track rolling history
    this.recentHighs.push(h);
    this.recentCloses.push(c);
    if (this.recentHighs.length > LOOKBACK_BARS + 5) {
      this.recentHighs.shift();
      this.recentCloses.shift();
    }

    const held = state.positions.get(this.symbol);
    const isHolding = held !== undefined && held.qty > 0n;

    // Position Management (Exit Logic)
    if (isHolding) {
      if (this.entryPrice === null) {
        this.entryPrice = c;
        this.peakPrice = c;
      } else {
        if (c > (this.peakPrice ?? 0n)) {
          this.peakPrice = c;
        }
      }

      const entry = this.entryPrice;
      const peak = this.peakPrice ?? c;
      const gainFromEntryBps = ((peak - entry) * BPS_DIVISOR) / entry;
      const pullbackFromPeakBps = ((peak - c) * BPS_DIVISOR) / peak;
      const currentLossBps = ((c - entry) * BPS_DIVISOR) / entry;

      let shouldExit = false;

      // Tier 1: Trailing Profit Lock
      if (gainFromEntryBps >= PROFIT_TARGET_BPS && pullbackFromPeakBps >= TRAILING_STOP_BPS) {
        shouldExit = true;
      }
      // Tier 2: Protective Stop Loss
      else if (currentLossBps <= -STOP_LOSS_BPS) {
        shouldExit = true;
      }
      // Tier 3: Flatten cleanly before final window close
      else if (seq >= 1436) {
        shouldExit = true;
      }

      if (shouldExit) {
        this.entryPrice = null;
        this.peakPrice = null;
        this.lastExitSeq = seq;
        return [
          {
            side: 'sell',
            symbol: this.symbol,
            qty: held.qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          },
        ];
      }

      return [];
    }

    // Cash Management (Entry Logic)
    else {
      this.entryPrice = null;
      this.peakPrice = null;

      // Guardrails & filters
      if (this.tradesCount >= MAX_TRADES_TOTAL) {
        return [];
      }
      if (this.recentHighs.length < LOOKBACK_BARS + 1) {
        return [];
      }
      if (seq >= 1425) {
        return [];
      }
      if (seq - this.lastExitSeq < COOLDOWN_BARS) {
        return [];
      }

      // Donchian channel: prior highest high over LOOKBACK_BARS (excluding current bar)
      const lookbackSlice = this.recentHighs.slice(-LOOKBACK_BARS - 1, -1);
      let priorHigh = 0n;
      for (const val of lookbackSlice) {
        if (val > priorHigh) {
          priorHigh = val;
        }
      }

      // Momentum velocity over lookback window
      const pastClose = this.recentCloses[this.recentCloses.length - LOOKBACK_BARS - 1];
      const momBps = ((c - pastClose) * BPS_DIVISOR) / pastClose;

      if (c >= priorHigh && momBps >= MIN_MOMENTUM_BPS) {
        const room = state.weightRoom(this.symbol);
        const cashToSpend = state.cash < room ? state.cash : room;
        if (cashToSpend >= MIN_NOTIONAL_RAW) {
          this.tradesCount++;
          this.entryPrice = c;
          this.peakPrice = c;
          return [
            {
              side: 'buy',
              symbol: this.symbol,
              notional_quote_units: cashToSpend,
              max_slippage_bps: MAX_SLIPPAGE_BPS,
            },
          ];
        }
      }
    }

    return [];
  }
}

const strategy = new DVBStrategy();
await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    return strategy.onBatch(state, batch);
  },
});
