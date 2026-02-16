/**
 * Postflop Decision Engine (EV-Based)
 *
 * Replaces pure LLM dependency with mathematical EV calculations.
 * LLM is only used as a tiebreaker when top two actions have similar EV.
 */

import { PlayerStats } from "../models/player-stats.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface PostflopDecision {
    action: string;         // "check", "bet", "call", "raise", "fold"
    sizingBBs: number;      // Bet/raise size in BBs
    evBBs: number;          // Expected value in BBs
    confidence: number;     // 0-1, how confident (large gap = high confidence)
    reasoning: string;
}

interface ActionEV {
    action: string;
    sizingBBs: number;
    ev: number;
    reasoning: string;
}

// ============================================================================
// FOLD EQUITY ESTIMATION
// ============================================================================

/**
 * Estimate how often an opponent will fold to a bet, based on player type.
 */
export function estimateFoldEquity(
    stats: PlayerStats | null,
    betSizePotFraction: number,
    street: string
): number {
    let baseFoldFreq = 0.45; // Default fold frequency

    if (stats && stats.getTotalHands() >= 8) {
        const vpip = stats.computeVPIPStat();
        const pfr = stats.computePFRStat();
        const af = stats.computeAggressionFactor();

        // Nit: folds a lot
        if (vpip < 18) {
            baseFoldFreq = 0.65;
        }
        // Calling station: rarely folds
        else if (vpip > 35 && pfr < 12) {
            baseFoldFreq = 0.25;
        }
        // TAG: moderate fold frequency
        else if (vpip >= 18 && vpip <= 25 && pfr >= 15 && pfr <= 22) {
            baseFoldFreq = 0.50;
        }
        // LAG: folds less than average
        else if (vpip > 30 && pfr > 22) {
            baseFoldFreq = 0.40;
        }
        // Loose passive
        else if (vpip > 30 && af < 1.5) {
            baseFoldFreq = 0.30;
        }
    }

    // Larger bets get more folds
    const sizingMultiplier = 0.8 + betSizePotFraction * 0.4;
    // Later streets get more folds (ranges are narrower, but pots are bigger)
    const streetMultiplier = street === "river" ? 1.1 : street === "turn" ? 1.05 : 1.0;

    return Math.min(Math.max(baseFoldFreq * sizingMultiplier * streetMultiplier, 0.05), 0.85);
}

// ============================================================================
// EV CALCULATIONS
// ============================================================================

/**
 * Calculate EV of betting.
 * EV(bet) = (fold_equity * pot) + ((1 - fold_equity) * equity * (pot + bet)) - ((1 - fold_equity) * (1 - equity) * bet)
 */
function calculateBetEV(
    potBBs: number,
    betBBs: number,
    equity: number,       // 0-1
    foldEquity: number    // 0-1
): number {
    const eqFrac = equity;
    const feFrac = foldEquity;

    // When opponent folds, we win the current pot
    const foldEV = feFrac * potBBs;

    // When opponent calls, we play for pot + bet + their call
    const callPot = potBBs + betBBs * 2; // pot + our bet + their call
    const callEV = (1 - feFrac) * (eqFrac * callPot - (1 - eqFrac) * betBBs);

    return foldEV + callEV;
}

/**
 * Calculate EV of calling.
 * EV(call) = (equity * (pot + call_amount)) - ((1 - equity) * call_amount)
 */
function calculateCallEV(
    potBBs: number,
    callBBs: number,
    equity: number        // 0-1
): number {
    const totalPot = potBBs + callBBs;
    return equity * totalPot - (1 - equity) * callBBs;
}

/**
 * Calculate EV of checking.
 * EV(check) = equity * pot (simplified - we realize our equity in the pot)
 */
function calculateCheckEV(
    potBBs: number,
    equity: number        // 0-1
): number {
    return equity * potBBs;
}

/**
 * Calculate EV of raising.
 * Similar to betting but accounts for the call amount already committed.
 */
function calculateRaiseEV(
    potBBs: number,
    raiseBBs: number,
    callBBs: number,
    equity: number,
    foldEquity: number
): number {
    const additionalCost = raiseBBs - callBBs;
    const foldEV = foldEquity * potBBs;
    const callPot = potBBs + raiseBBs + raiseBBs; // pot + our raise + their call
    const callEV = (1 - foldEquity) * (equity * callPot - (1 - equity) * raiseBBs);
    return foldEV + callEV;
}

// ============================================================================
// BET SIZING OPTIONS
// ============================================================================

const BET_SIZE_FRACTIONS = [0.33, 0.50, 0.75, 1.0, 1.5];

// ============================================================================
// MAIN POSTFLOP ENGINE
// ============================================================================

/**
 * Calculate the optimal postflop action based on EV.
 *
 * @param equity - Hero's equity vs opponent range (0-100)
 * @param potBBs - Current pot size in BBs
 * @param stackBBs - Hero's remaining stack in BBs
 * @param street - Current street ("flop", "turn", "river")
 * @param facingBet - Whether hero is facing a bet
 * @param betToCallBBs - Amount to call if facing a bet
 * @param opponentStats - Opponent's tracked stats
 * @param canCheck - Whether check is available
 * @param canBet - Whether bet/raise is available
 * @returns PostflopDecision with best action and reasoning
 */
export function getPostflopEVDecision(
    equity: number,
    potBBs: number,
    stackBBs: number,
    street: string,
    facingBet: boolean,
    betToCallBBs: number,
    opponentStats: PlayerStats | null,
    canCheck: boolean = true,
    canBet: boolean = true
): PostflopDecision {
    const equityFrac = equity / 100;
    const allEVs: ActionEV[] = [];

    // EV(fold) = 0 (always an option when facing a bet)
    if (facingBet) {
        allEVs.push({
            action: "fold",
            sizingBBs: 0,
            ev: 0,
            reasoning: "Fold: EV = 0 BB (baseline)"
        });
    }

    // EV(check) - only if not facing a bet
    if (canCheck && !facingBet) {
        const checkEV = calculateCheckEV(potBBs, equityFrac);
        allEVs.push({
            action: "check",
            sizingBBs: 0,
            ev: checkEV,
            reasoning: `Check: EV = ${checkEV.toFixed(2)} BB (equity ${equity.toFixed(1)}% * pot ${potBBs.toFixed(1)} BB)`
        });
    }

    // EV(call) - only if facing a bet
    if (facingBet && betToCallBBs > 0) {
        const callEV = calculateCallEV(potBBs, betToCallBBs, equityFrac);
        allEVs.push({
            action: "call",
            sizingBBs: betToCallBBs,
            ev: callEV,
            reasoning: `Call ${betToCallBBs.toFixed(1)} BB: EV = ${callEV.toFixed(2)} BB (pot odds ${((betToCallBBs / (potBBs + betToCallBBs)) * 100).toFixed(1)}%, equity ${equity.toFixed(1)}%)`
        });
    }

    // EV(bet) at various sizes - only if can bet
    if (canBet) {
        for (const fraction of BET_SIZE_FRACTIONS) {
            const betBBs = Math.min(potBBs * fraction, stackBBs);
            if (betBBs <= 0) continue;
            // Don't bet more than stack
            if (betBBs > stackBBs) continue;

            const foldEq = estimateFoldEquity(opponentStats, fraction, street);

            if (facingBet) {
                // This is a raise
                const raiseSize = betToCallBBs + betBBs;
                if (raiseSize > stackBBs) continue;
                const raiseEV = calculateRaiseEV(potBBs, raiseSize, betToCallBBs, equityFrac, foldEq);
                allEVs.push({
                    action: "raise",
                    sizingBBs: raiseSize,
                    ev: raiseEV,
                    reasoning: `Raise to ${raiseSize.toFixed(1)} BB: EV = ${raiseEV.toFixed(2)} BB (fold eq ${(foldEq * 100).toFixed(0)}%, equity ${equity.toFixed(1)}%)`
                });
            } else {
                const betEV = calculateBetEV(potBBs, betBBs, equityFrac, foldEq);
                allEVs.push({
                    action: "bet",
                    sizingBBs: betBBs,
                    ev: betEV,
                    reasoning: `Bet ${betBBs.toFixed(1)} BB (${(fraction * 100).toFixed(0)}% pot): EV = ${betEV.toFixed(2)} BB (fold eq ${(foldEq * 100).toFixed(0)}%, equity ${equity.toFixed(1)}%)`
                });
            }
        }

        // All-in option
        if (stackBBs <= potBBs * 2) {
            const foldEq = estimateFoldEquity(opponentStats, stackBBs / Math.max(potBBs, 0.1), street);
            if (facingBet) {
                const allInEV = calculateRaiseEV(potBBs, stackBBs, betToCallBBs, equityFrac, foldEq);
                allEVs.push({
                    action: "all-in",
                    sizingBBs: stackBBs,
                    ev: allInEV,
                    reasoning: `All-in ${stackBBs.toFixed(1)} BB: EV = ${allInEV.toFixed(2)} BB`
                });
            } else {
                const allInEV = calculateBetEV(potBBs, stackBBs, equityFrac, foldEq);
                allEVs.push({
                    action: "all-in",
                    sizingBBs: stackBBs,
                    ev: allInEV,
                    reasoning: `All-in ${stackBBs.toFixed(1)} BB: EV = ${allInEV.toFixed(2)} BB`
                });
            }
        }
    }

    if (allEVs.length === 0) {
        return {
            action: "check",
            sizingBBs: 0,
            evBBs: 0,
            confidence: 0,
            reasoning: "No valid actions available, defaulting to check"
        };
    }

    // Sort by EV descending
    allEVs.sort((a, b) => b.ev - a.ev);

    const best = allEVs[0];
    const secondBest = allEVs.length > 1 ? allEVs[1] : null;

    // Confidence is based on EV gap between top two options
    // Gap > 2 BB = high confidence, gap < 0.5 BB = low confidence
    const evGap = secondBest ? best.ev - secondBest.ev : 5;
    const confidence = Math.min(Math.max(evGap / 3, 0.1), 0.95);

    // Build reasoning string
    let reasoning = `EV Analysis (${street}):\n`;
    reasoning += `  Best: ${best.reasoning}\n`;
    if (secondBest) {
        reasoning += `  2nd: ${secondBest.reasoning}\n`;
        reasoning += `  EV gap: ${evGap.toFixed(2)} BB`;
    }

    return {
        action: best.action,
        sizingBBs: best.sizingBBs,
        evBBs: best.ev,
        confidence,
        reasoning
    };
}

/**
 * Check if a bluff is profitable based on pot odds math.
 * Bluff is profitable when: bet / (pot + bet) < opponent_fold_frequency
 */
export function isBluffProfitable(
    betBBs: number,
    potBBs: number,
    opponentFoldFreq: number
): boolean {
    const bluffBreakeven = betBBs / (potBBs + betBBs);
    return bluffBreakeven < opponentFoldFreq;
}
