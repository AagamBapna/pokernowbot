/**
 * Opponent Range Tracking System
 *
 * Narrows opponent hand ranges as actions occur each street.
 * Uses position, player type, and action-based factors to maintain
 * weighted hand combos that represent an opponent's likely holdings.
 */

import { PlayerStats } from "../models/player-stats.ts";
import { getHandStrength } from "./gto-preflop.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface WeightedHand {
    hand: string;       // e.g., "AKs", "QQ", "76o"
    weight: number;     // 0-1, probability of being in range
}

export interface OpponentRange {
    playerId: string;
    hands: WeightedHand[];
}

// ============================================================================
// ALL POSSIBLE HANDS (169 canonical combos)
// ============================================================================

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

function generateAllHands(): string[] {
    const hands: string[] = [];
    for (let i = 0; i < RANKS.length; i++) {
        for (let j = i; j < RANKS.length; j++) {
            if (i === j) {
                hands.push(`${RANKS[i]}${RANKS[j]}`); // Pair
            } else {
                hands.push(`${RANKS[i]}${RANKS[j]}s`); // Suited
                hands.push(`${RANKS[i]}${RANKS[j]}o`); // Offsuit
            }
        }
    }
    return hands;
}

const ALL_HANDS = generateAllHands();

// ============================================================================
// POSITION-BASED OPENING RANGES (% of hands that open from each position)
// ============================================================================

const POSITION_OPEN_CUTOFFS: Record<string, number> = {
    "UTG":   82,
    "UTG+1": 80,
    "MP":    78,
    "LJ":    75,
    "HJ":    73,
    "CO":    68,
    "BU":    52,
    "SB":    55,
    "BB":    40,  // BB defends wide
};

// 3-bet range cutoffs by position
const THREE_BET_CUTOFFS: Record<string, number> = {
    "UTG":   96,
    "UTG+1": 95,
    "MP":    94,
    "LJ":    93,
    "HJ":    92,
    "CO":    90,
    "BU":    88,
    "SB":    85,
    "BB":    85,
};

// Flatting range: hands strong enough to call but not 3-bet
// (between call threshold and 3-bet threshold)
const FLAT_CALL_CUTOFFS: Record<string, number> = {
    "IP":  65,
    "OOP": 72,
    "BB":  55,
};

// ============================================================================
// PLAYER TYPE ADJUSTMENTS
// ============================================================================

interface RangeAdjustment {
    openWidenPercent: number;    // How much wider they open (negative = tighter)
    threeBetWidenPercent: number;
    callWidenPercent: number;
}

function getPlayerTypeAdjustment(stats: PlayerStats | null): RangeAdjustment {
    const defaults: RangeAdjustment = { openWidenPercent: 0, threeBetWidenPercent: 0, callWidenPercent: 0 };
    if (!stats || stats.getTotalHands() < 8) return defaults;

    const vpip = stats.computeVPIPStat();
    const pfr = stats.computePFRStat();

    // Nit: tighter ranges
    if (vpip < 18) {
        return { openWidenPercent: 8, threeBetWidenPercent: 3, callWidenPercent: 5 };
    }
    // Calling station: wide calls, tight raises
    if (vpip > 35 && pfr < 12) {
        return { openWidenPercent: -5, threeBetWidenPercent: 5, callWidenPercent: -20 };
    }
    // LAG: wide opens and 3-bets
    if (vpip > 30 && pfr > 22) {
        return { openWidenPercent: -15, threeBetWidenPercent: -10, callWidenPercent: -8 };
    }
    // Loose passive
    if (vpip > 30) {
        return { openWidenPercent: -10, threeBetWidenPercent: 3, callWidenPercent: -15 };
    }

    return defaults;
}

// ============================================================================
// RANGE CONSTRUCTION
// ============================================================================

/**
 * Create a starting range for an opponent based on position and player type.
 * All hands start with weight 1.0 if in range, 0.0 if out of range.
 */
export function createStartingRange(
    position: string,
    stats: PlayerStats | null
): WeightedHand[] {
    const adj = getPlayerTypeAdjustment(stats);
    const cutoff = (POSITION_OPEN_CUTOFFS[position] ?? 70) + adj.openWidenPercent;

    return ALL_HANDS.map(hand => {
        const strength = getHandStrength(hand);
        return {
            hand,
            weight: strength >= cutoff ? 1.0 : 0.0
        };
    });
}

/**
 * Create a full (100%) starting range - used when no position info is available.
 */
export function createFullRange(): WeightedHand[] {
    return ALL_HANDS.map(hand => ({ hand, weight: 1.0 }));
}

// ============================================================================
// RANGE NARROWING PER ACTION
// ============================================================================

/**
 * Narrow range based on a preflop open raise.
 * Keeps hands within the position's opening range.
 */
export function narrowByOpenRaise(
    range: WeightedHand[],
    position: string,
    stats: PlayerStats | null
): WeightedHand[] {
    const adj = getPlayerTypeAdjustment(stats);
    const cutoff = (POSITION_OPEN_CUTOFFS[position] ?? 70) + adj.openWidenPercent;

    return range.map(wh => {
        const strength = getHandStrength(wh.hand);
        if (strength < cutoff) {
            return { ...wh, weight: wh.weight * 0.05 }; // Almost zero out hands below open range
        }
        return wh;
    });
}

/**
 * Narrow range based on a 3-bet.
 * Heavily weight toward 3-bet value hands + some bluffs.
 */
export function narrowBy3Bet(
    range: WeightedHand[],
    position: string,
    stats: PlayerStats | null
): WeightedHand[] {
    const adj = getPlayerTypeAdjustment(stats);
    const cutoff = (THREE_BET_CUTOFFS[position] ?? 90) + adj.threeBetWidenPercent;

    // 3-bet bluff hands get partial weight
    const bluffHands = new Set(["A5s", "A4s", "A3s", "A2s", "76s", "65s", "54s", "K5s", "K4s", "J9s", "T9s"]);

    return range.map(wh => {
        const strength = getHandStrength(wh.hand);
        if (strength >= cutoff) {
            return wh; // Value 3-bet hands keep full weight
        }
        if (bluffHands.has(wh.hand)) {
            return { ...wh, weight: wh.weight * 0.35 }; // Bluff 3-bets partial weight
        }
        return { ...wh, weight: wh.weight * 0.02 }; // Most hands very unlikely
    });
}

/**
 * Narrow range for a preflop flat call.
 * Remove 3-bet hands (would have 3-bet) and fold hands (would have folded).
 * Keep medium-strength hands.
 */
export function narrowByPreflopCall(
    range: WeightedHand[],
    position: string,
    isInPosition: boolean,
    stats: PlayerStats | null
): WeightedHand[] {
    const adj = getPlayerTypeAdjustment(stats);
    const threeBetCutoff = (THREE_BET_CUTOFFS[position] ?? 90) + adj.threeBetWidenPercent;

    let callPosition: string;
    if (position === "BB") callPosition = "BB";
    else if (isInPosition) callPosition = "IP";
    else callPosition = "OOP";
    const callCutoff = (FLAT_CALL_CUTOFFS[callPosition] ?? 65) + adj.callWidenPercent;

    return range.map(wh => {
        const strength = getHandStrength(wh.hand);
        // Would have 3-bet these (reduce weight significantly)
        if (strength >= threeBetCutoff) {
            return { ...wh, weight: wh.weight * 0.15 }; // Slowplay some premium hands
        }
        // Would have folded these
        if (strength < callCutoff) {
            return { ...wh, weight: wh.weight * 0.05 };
        }
        // Calling range
        return wh;
    });
}

/**
 * Narrow range based on a postflop bet or raise.
 * Weight toward value hands and strong draws.
 */
export function narrowByPostflopBet(
    range: WeightedHand[],
    betSizePotFraction: number
): WeightedHand[] {
    // Larger bets = more polarized (very strong or bluff)
    // Smaller bets = more merged (wider value range)
    const polarizationFactor = Math.min(betSizePotFraction / 0.75, 1.5);

    return range.map(wh => {
        const strength = getHandStrength(wh.hand);
        if (strength >= 85) {
            // Strong hands: likely betting for value
            return { ...wh, weight: wh.weight * (0.9 + polarizationFactor * 0.1) };
        }
        if (strength >= 70) {
            // Good hands: bet more at smaller sizes
            return { ...wh, weight: wh.weight * (1.0 - polarizationFactor * 0.2) };
        }
        if (strength >= 55) {
            // Medium hands: less likely to bet, especially large
            return { ...wh, weight: wh.weight * (0.6 - polarizationFactor * 0.15) };
        }
        // Weak hands: could be bluffing
        return { ...wh, weight: wh.weight * (0.2 + polarizationFactor * 0.1) };
    });
}

/**
 * Narrow range based on a postflop check.
 * Weight away from very strong hands (would have bet for value).
 */
export function narrowByPostflopCheck(
    range: WeightedHand[]
): WeightedHand[] {
    return range.map(wh => {
        const strength = getHandStrength(wh.hand);
        if (strength >= 90) {
            // Very strong hands rarely check (some trapping)
            return { ...wh, weight: wh.weight * 0.25 };
        }
        if (strength >= 75) {
            // Strong hands sometimes check for pot control
            return { ...wh, weight: wh.weight * 0.5 };
        }
        // Medium and weak hands check frequently
        return { ...wh, weight: wh.weight * 0.9 };
    });
}

/**
 * Narrow range based on a postflop call.
 * Medium strength hands + draws. Not the nuts (would raise), not air (would fold).
 */
export function narrowByPostflopCall(
    range: WeightedHand[]
): WeightedHand[] {
    return range.map(wh => {
        const strength = getHandStrength(wh.hand);
        if (strength >= 95) {
            // Monster hands would usually raise (some slowplay)
            return { ...wh, weight: wh.weight * 0.3 };
        }
        if (strength >= 70) {
            // Strong hands: calling or raising
            return { ...wh, weight: wh.weight * 0.85 };
        }
        if (strength >= 50) {
            // Medium hands + draws: core calling range
            return wh;
        }
        if (strength >= 35) {
            // Draws and marginal hands
            return { ...wh, weight: wh.weight * 0.6 };
        }
        // Weak hands would mostly fold
        return { ...wh, weight: wh.weight * 0.1 };
    });
}

// ============================================================================
// RANGE UTILITIES
// ============================================================================

/**
 * Normalize range weights to sum to 1.0 (probability distribution).
 */
export function normalizeRange(range: WeightedHand[]): WeightedHand[] {
    const totalWeight = range.reduce((sum, wh) => sum + wh.weight, 0);
    if (totalWeight === 0) return range;
    return range.map(wh => ({ ...wh, weight: wh.weight / totalWeight }));
}

/**
 * Get the hands in the range that have non-zero weight.
 */
export function getActiveHands(range: WeightedHand[]): WeightedHand[] {
    return range.filter(wh => wh.weight > 0.01);
}

/**
 * Get a human-readable description of the range for LLM prompts.
 */
export function describeRange(range: WeightedHand[]): string {
    const normalized = normalizeRange(range);
    const active = getActiveHands(normalized);

    if (active.length === 0) return "Unknown range";
    if (active.length >= ALL_HANDS.length * 0.9) return "Very wide range (nearly any two cards)";

    // Sort by weight descending
    const sorted = [...active].sort((a, b) => b.weight - a.weight);

    // Get top hands
    const topHands = sorted.slice(0, 15).map(wh => wh.hand);
    const rangePercent = ((active.length / ALL_HANDS.length) * 100).toFixed(0);

    // Classify the range
    let description = "";
    if (active.length <= 20) {
        description = `Very tight range (~${rangePercent}% of hands): ${topHands.join(", ")}`;
    } else if (active.length <= 50) {
        description = `Tight range (~${rangePercent}% of hands). Top holdings: ${topHands.slice(0, 10).join(", ")}`;
    } else if (active.length <= 100) {
        description = `Medium range (~${rangePercent}% of hands). Likely holdings: ${topHands.slice(0, 8).join(", ")}...`;
    } else {
        description = `Wide range (~${rangePercent}% of hands). Could hold many hands.`;
    }

    return description;
}

/**
 * Convert weighted range to an array of hands suitable for equity calculation.
 * Returns hands with repetition proportional to weight for sampling.
 */
export function rangeToSampleArray(range: WeightedHand[]): string[] {
    const normalized = normalizeRange(range);
    const sampleArray: string[] = [];
    const RESOLUTION = 100; // Granularity of sampling

    for (const wh of normalized) {
        const count = Math.round(wh.weight * RESOLUTION);
        for (let i = 0; i < count; i++) {
            sampleArray.push(wh.hand);
        }
    }

    return sampleArray.length > 0 ? sampleArray : ALL_HANDS;
}

// ============================================================================
// HAND COMBO EXPANSION (for equity calculation)
// ============================================================================

const ALL_SUITS = ["s", "h", "d", "c"];

/**
 * Expand a canonical hand notation (e.g., "AKs") into all specific card combos.
 * Returns arrays of [card1, card2] pairs.
 */
export function expandHandToCombos(hand: string): [string, string][] {
    const combos: [string, string][] = [];

    if (hand.length === 2) {
        // Pair (e.g., "AA")
        const rank = hand[0];
        for (let i = 0; i < ALL_SUITS.length; i++) {
            for (let j = i + 1; j < ALL_SUITS.length; j++) {
                combos.push([rank + ALL_SUITS[i], rank + ALL_SUITS[j]]);
            }
        }
    } else if (hand[2] === "s") {
        // Suited
        const r1 = hand[0], r2 = hand[1];
        for (const suit of ALL_SUITS) {
            combos.push([r1 + suit, r2 + suit]);
        }
    } else {
        // Offsuit
        const r1 = hand[0], r2 = hand[1];
        for (let i = 0; i < ALL_SUITS.length; i++) {
            for (let j = 0; j < ALL_SUITS.length; j++) {
                if (i !== j) {
                    combos.push([r1 + ALL_SUITS[i], r2 + ALL_SUITS[j]]);
                }
            }
        }
    }

    return combos;
}

/**
 * Build a complete range tracker for a hand.
 * Tracks opponent range across multiple streets and actions.
 */
export class RangeTracker {
    private ranges: Map<string, WeightedHand[]> = new Map();

    /**
     * Initialize a range for an opponent.
     */
    initRange(playerId: string, position: string, stats: PlayerStats | null): void {
        this.ranges.set(playerId, createStartingRange(position, stats));
    }

    /**
     * Initialize with a full range (no position info available).
     */
    initFullRange(playerId: string): void {
        this.ranges.set(playerId, createFullRange());
    }

    /**
     * Get the current range for an opponent.
     */
    getRange(playerId: string): WeightedHand[] | undefined {
        return this.ranges.get(playerId);
    }

    /**
     * Apply an action to narrow an opponent's range.
     */
    applyAction(
        playerId: string,
        action: string,
        position: string,
        stats: PlayerStats | null,
        street: string,
        betSizePotFraction: number = 0.5,
        isInPosition: boolean = true
    ): void {
        let range = this.ranges.get(playerId);
        if (!range) {
            range = createFullRange();
        }

        if (street === "preflop" || street === "") {
            switch (action) {
                case "raises":
                case "bets":
                    // Check if this is an open raise or 3-bet based on context
                    range = narrowByOpenRaise(range, position, stats);
                    break;
                case "calls":
                    range = narrowByPreflopCall(range, position, isInPosition, stats);
                    break;
            }
        } else {
            // Postflop
            switch (action) {
                case "bets":
                case "raises":
                    range = narrowByPostflopBet(range, betSizePotFraction);
                    break;
                case "checks":
                    range = narrowByPostflopCheck(range);
                    break;
                case "calls":
                    range = narrowByPostflopCall(range);
                    break;
            }
        }

        this.ranges.set(playerId, range);
    }

    /**
     * Get a human-readable description of an opponent's estimated range.
     */
    describeRange(playerId: string): string {
        const range = this.ranges.get(playerId);
        if (!range) return "Unknown range (no tracking data)";
        return describeRange(range);
    }

    /**
     * Reset all ranges for a new hand.
     */
    reset(): void {
        this.ranges.clear();
    }
}
