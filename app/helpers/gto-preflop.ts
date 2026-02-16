/**
 * GTO Preflop Engine
 * 
 * Solver-derived preflop strategy for No Limit Hold'em.
 * Handles: RFI (open raise), facing open, facing 3-bet, facing 4-bet.
 * Includes exploitation adjustments based on opponent stats.
 */

import { BotAction } from "../interfaces/ai-client-interfaces.ts";
import { PlayerStats } from "../models/player-stats.ts";

// ============================================================================
// HAND NOTATION & STRENGTH
// ============================================================================

const RANK_ORDER = "23456789TJQKA";

/**
 * Convert two cards (e.g. "As", "Kh") to canonical notation (e.g. "AKs" or "AKo")
 */
export function normalizeHand(card1: string, card2: string): string {
    let r1 = card1.slice(0, -1);
    let r2 = card2.slice(0, -1);
    const s1 = card1.slice(-1);
    const s2 = card2.slice(-1);

    // Normalize "10" to "T"
    if (r1 === "10") r1 = "T";
    if (r2 === "10") r2 = "T";

    const i1 = RANK_ORDER.indexOf(r1);
    const i2 = RANK_ORDER.indexOf(r2);

    // Higher rank first
    const high = i1 >= i2 ? r1 : r2;
    const low = i1 >= i2 ? r2 : r1;

    if (r1 === r2) {
        return `${high}${low}`;  // Pair: "AA", "KK"
    }
    const suited = s1 === s2 ? "s" : "o";
    return `${high}${low}${suited}`;
}

/**
 * Preflop hand strength percentile (0 = weakest, 100 = strongest).
 * Based on solver equity rankings for 6-max cash games.
 */
const HAND_STRENGTH: Record<string, number> = {
    // === PAIRS ===
    "AA": 100, "KK": 99, "QQ": 98, "JJ": 96, "TT": 93,
    "99": 88, "88": 83, "77": 78, "66": 72, "55": 66,
    "44": 60, "33": 54, "22": 48,

    // === SUITED HANDS ===
    // Ace-suited
    "AKs": 97, "AQs": 94, "AJs": 91, "ATs": 87, "A9s": 79,
    "A8s": 75, "A7s": 73, "A6s": 70, "A5s": 74, "A4s": 71,
    "A3s": 68, "A2s": 65,
    // King-suited
    "KQs": 92, "KJs": 89, "KTs": 85, "K9s": 77, "K8s": 69,
    "K7s": 64, "K6s": 62, "K5s": 58, "K4s": 55, "K3s": 52,
    "K2s": 49,
    // Queen-suited
    "QJs": 90, "QTs": 86, "Q9s": 76, "Q8s": 67, "Q7s": 59,
    "Q6s": 57, "Q5s": 53, "Q4s": 50, "Q3s": 47, "Q2s": 44,
    // Jack-suited
    "JTs": 88, "J9s": 80, "J8s": 71, "J7s": 61, "J6s": 56,
    "J5s": 51, "J4s": 46, "J3s": 42, "J2s": 38,
    // Ten-suited
    "T9s": 82, "T8s": 74, "T7s": 63, "T6s": 55, "T5s": 47,
    "T4s": 43, "T3s": 39, "T2s": 35,
    // Nine-suited
    "98s": 81, "97s": 72, "96s": 60, "95s": 52, "94s": 44,
    "93s": 40, "92s": 36,
    // Eight-suited
    "87s": 78, "86s": 68, "85s": 57, "84s": 48, "83s": 41,
    "82s": 37,
    // Seven-suited
    "76s": 75, "75s": 64, "74s": 53, "73s": 45, "72s": 38,
    // Six-suited
    "65s": 73, "64s": 61, "63s": 50, "62s": 43,
    // Five-suited
    "54s": 70, "53s": 58, "52s": 49,
    // Four-suited
    "43s": 56, "42s": 46,
    // Three-suited
    "32s": 51,

    // === OFFSUIT HANDS ===
    // Ace-offsuit
    "AKo": 95, "AQo": 90, "AJo": 86, "ATo": 82, "A9o": 73,
    "A8o": 69, "A7o": 66, "A6o": 63, "A5o": 67, "A4o": 62,
    "A3o": 59, "A2o": 56,
    // King-offsuit
    "KQo": 87, "KJo": 83, "KTo": 79, "K9o": 70, "K8o": 61,
    "K7o": 55, "K6o": 52, "K5o": 48, "K4o": 44, "K3o": 40,
    "K2o": 37,
    // Queen-offsuit
    "QJo": 84, "QTo": 80, "Q9o": 68, "Q8o": 58, "Q7o": 50,
    "Q6o": 46, "Q5o": 42, "Q4o": 38, "Q3o": 34, "Q2o": 30,
    // Jack-offsuit
    "JTo": 81, "J9o": 71, "J8o": 60, "J7o": 51, "J6o": 45,
    "J5o": 41, "J4o": 36, "J3o": 32, "J2o": 28,
    // Ten-offsuit
    "T9o": 76, "T8o": 65, "T7o": 54, "T6o": 47, "T5o": 39,
    "T4o": 35, "T3o": 31, "T2o": 27,
    // Nine-offsuit
    "98o": 74, "97o": 63, "96o": 53, "95o": 43, "94o": 36,
    "93o": 33, "92o": 29,
    // Eight-offsuit
    "87o": 70, "86o": 59, "85o": 49, "84o": 40, "83o": 34,
    "82o": 31,
    // Seven-offsuit
    "76o": 67, "75o": 57, "74o": 46, "73o": 38, "72o": 32,
    // Six-offsuit
    "65o": 64, "64o": 52, "63o": 44, "62o": 37,
    // Five-offsuit
    "54o": 61, "53o": 50, "52o": 42,
    // Four-offsuit
    "43o": 48, "42o": 41,
    // Three-offsuit
    "32o": 45,
};

export function getHandStrength(hand: string): number {
    return HAND_STRENGTH[hand] ?? 30;
}

// ============================================================================
// GTO RANGES (Percentile Thresholds)
// ============================================================================

// RFI (Raise First In) - minimum hand strength percentile to open from each position
const RFI_THRESHOLDS: Record<string, number> = {
    "UTG":   82,  // ~15% of hands
    "UTG+1": 80,  // ~17%
    "MP":    78,  // ~20%
    "LJ":    75,  // ~23%
    "HJ":    73,  // ~25%
    "CO":    68,  // ~30%
    "BU":    52,  // ~45%
    "SB":    55,  // ~42% (open or 3-bet vs limps)
};

// 3-bet range thresholds (minimum strength to 3-bet for VALUE)
const THREE_BET_VALUE_THRESHOLDS: Record<string, number> = {
    "vs_UTG":  96,  // Only premiums: QQ+, AKs
    "vs_MP":   94,  // JJ+, AKs, AQs
    "vs_CO":   92,  // TT+, AQs+, AKo
    "vs_BU":   88,  // 99+, AJs+, KQs, AQo+
    "vs_SB":   85,  // Wider 3-bet from BB
};

// 3-bet BLUFF hands (suited wheel aces and suited connectors - specific hands, not threshold-based)
const THREE_BET_BLUFFS: string[] = [
    "A5s", "A4s", "A3s", "A2s",  // Suited wheel aces (block AA, nut flush draw potential)
    "76s", "65s", "54s",          // Suited connectors
    "K5s", "K4s",                 // Suited king blockers
    "J9s", "T9s",                 // Suited connectors
];

// Call vs open thresholds (minimum strength to flat call an open)
const CALL_VS_OPEN_THRESHOLDS: Record<string, number> = {
    "IP":  65,   // Call wider when in position
    "OOP": 72,   // Call tighter when out of position (BB defense is special)
    "BB":  55,   // BB defends wide due to pot odds
};

// Facing 3-bet thresholds
const FACING_3BET_4BET_THRESHOLD = 96;  // 4-bet with: AA, KK, QQ, AKs
const FACING_3BET_CALL_IP = 85;         // Call 3-bet IP: JJ+, AQs+, AKo, some suited connectors
const FACING_3BET_CALL_OOP = 90;        // Call 3-bet OOP: QQ+, AKs, AQs

// Short stack thresholds (< 25 BB) - replaced by Nash push/fold ranges below
const SHORT_STACK_SHOVE_THRESHOLD = 65; // Legacy fallback

// ============================================================================
// NASH PUSH/FOLD RANGES
// ============================================================================

// Maps (stack_bucket, position) -> minimum hand strength to shove
const NASH_SHOVE_RANGES: Record<string, Record<string, number>> = {
    "10": { // 10 BB
        "UTG": 78, "UTG+1": 76, "MP": 74, "LJ": 72, "HJ": 70,
        "CO": 62, "BU": 50, "SB": 48, "BB": 55,
    },
    "15": { // 15 BB
        "UTG": 82, "UTG+1": 80, "MP": 78, "LJ": 76, "HJ": 74,
        "CO": 68, "BU": 58, "SB": 55, "BB": 62,
    },
    "20": { // 20 BB
        "UTG": 85, "UTG+1": 83, "MP": 82, "LJ": 80, "HJ": 78,
        "CO": 72, "BU": 65, "SB": 62, "BB": 68,
    },
};

// Call-vs-shove ranges (tighter than shove ranges)
const NASH_CALL_VS_SHOVE: Record<string, Record<string, number>> = {
    "10": {
        "UTG": 88, "UTG+1": 87, "MP": 86, "LJ": 85, "HJ": 84,
        "CO": 80, "BU": 75, "SB": 72, "BB": 68,
    },
    "15": {
        "UTG": 90, "UTG+1": 89, "MP": 88, "LJ": 87, "HJ": 86,
        "CO": 83, "BU": 78, "SB": 75, "BB": 72,
    },
    "20": {
        "UTG": 92, "UTG+1": 91, "MP": 90, "LJ": 89, "HJ": 88,
        "CO": 85, "BU": 82, "SB": 80, "BB": 76,
    },
};

// ============================================================================
// BB DEFENSE RANGES
// ============================================================================

// BB defense frequency depends on opener position
const BB_DEFENSE_THRESHOLDS: Record<string, number> = {
    "vs_UTG":   70, // Defend ~30% vs UTG (tight opener)
    "vs_UTG+1": 68,
    "vs_MP":    65,
    "vs_LJ":    62,
    "vs_HJ":    60,
    "vs_CO":    55, // Defend ~45% vs CO
    "vs_BU":    48, // Defend ~50%+ vs BU steal
    "vs_SB":    45, // Defend widest vs SB
};

// BB check-raise range (subset of strong hands from BB)
const BB_CHECK_RAISE_THRESHOLD = 88; // Top ~12% of hands for check-raise

// ============================================================================
// ACTION CONTEXT DETECTION
// ============================================================================

export interface PreflopContext {
    isRFI: boolean;           // First in (no one has raised yet)
    facingOpen: boolean;      // Someone opened (raised)
    facing3Bet: boolean;      // We opened, someone 3-bet
    facing4Bet: boolean;      // We 3-bet, someone 4-bet
    facingLimp: boolean;      // Someone limped
    numRaises: number;        // Total raises preflop
    openRaiserPosition: string;  // Position of the first raiser
    lastRaiseSize: number;    // Size of last raise in BBs
    potSize: number;          // Current pot in BBs
    isInPosition: boolean;    // Are we IP relative to the aggressor
    playersInPot: number;     // Number of players already in the pot
}

// ============================================================================
// MULTIWAY POT ADJUSTMENTS
// ============================================================================

/**
 * Tighten ranges when multiple players are in the pot.
 * Each extra player adds +5 to the threshold (requires stronger hand).
 */
export function getMultiwayAdjustment(playersInPot: number): number {
    if (playersInPot <= 2) return 0;
    return (playersInPot - 2) * 5;
}

export function analyzePreflopContext(
    playerActions: Array<{playerId: string, action: string, betAmount: number}>,
    heroId: string,
    heroPosition: string,
    positionMap: Map<string, string>
): PreflopContext {
    let numRaises = 0;
    let openRaiserPosition = "";
    let lastRaiseSize = 0;
    let potSize = 1.5; // SB + BB
    let heroActed = false;
    let facingLimp = false;
    let playersInPot = 2; // SB + BB always in pot

    for (const action of playerActions) {
        if (action.playerId === heroId) {
            heroActed = true;
            continue;
        }
        if (action.action === "raises" || action.action === "bets") {
            numRaises++;
            if (numRaises === 1) {
                openRaiserPosition = positionMap.get(action.playerId) || "";
            }
            lastRaiseSize = action.betAmount;
            potSize += action.betAmount;
        } else if (action.action === "calls") {
            potSize += action.betAmount;
            playersInPot++;
            if (numRaises === 0) facingLimp = true;
        } else if (action.action === "posts") {
            // Blinds already counted
        }
    }

    // Determine if hero is IP relative to aggressor
    const posOrder = ["SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BU"];
    const heroIdx = posOrder.indexOf(heroPosition);
    const aggressorIdx = posOrder.indexOf(openRaiserPosition);
    const isIP = heroIdx > aggressorIdx;

    return {
        isRFI: numRaises === 0 && !facingLimp,
        facingOpen: numRaises === 1 && !heroActed,
        facing3Bet: numRaises === 2 && heroActed,
        facing4Bet: numRaises >= 3 && heroActed,
        facingLimp: facingLimp && numRaises === 0,
        numRaises,
        openRaiserPosition,
        lastRaiseSize,
        potSize,
        isInPosition: isIP,
        playersInPot,
    };
}

// ============================================================================
// EXPLOITATION ADJUSTMENTS
// ============================================================================

interface ExploitAdjustment {
    rfiAdjust: number;       // Widen (negative) or tighten (positive) RFI range
    threeBetAdjust: number;  // Adjust 3-bet threshold
    callAdjust: number;      // Adjust calling range
    bluffMore: boolean;      // Should we bluff more vs this player?
    valueWider: boolean;     // Should we value bet wider?
}

/**
 * Get exploitation adjustment based on opponent's positional stats.
 * If we have enough data from their specific position, use that instead of overall stats.
 */
export function getPositionalExploitAdjustment(
    stats: PlayerStats | null,
    opponentPosition: string
): ExploitAdjustment {
    const defaults: ExploitAdjustment = {
        rfiAdjust: 0, threeBetAdjust: 0, callAdjust: 0,
        bluffMore: false, valueWider: false
    };

    if (!stats || stats.getTotalHands() < 8) return defaults;

    // Check if we have positional stats with enough sample
    const posVpip = stats.getPositionalVPIP(opponentPosition);
    if (posVpip && posVpip.hands >= 5) {
        const positionalVpipPct = (posVpip.vpip / posVpip.hands) * 100;
        let adj = { ...defaults };

        // If opponent opens much wider from this position than average
        const overallVpip = stats.computeVPIPStat();
        const deviation = positionalVpipPct - overallVpip;

        if (deviation > 10) {
            // They're much looser from this position
            adj.threeBetAdjust = -5; // 3-bet wider for value
            adj.callAdjust = -3;     // Call wider
            adj.valueWider = true;
        } else if (deviation < -10) {
            // They're much tighter from this position
            adj.rfiAdjust = -5;       // Steal wider
            adj.threeBetAdjust = 5;   // Don't 3-bet light
            adj.bluffMore = true;
        }

        return adj;
    }

    // Fall back to overall stats
    return getExploitAdjustment(stats);
}

function getExploitAdjustment(stats: PlayerStats | null): ExploitAdjustment {
    const defaults: ExploitAdjustment = {
        rfiAdjust: 0, threeBetAdjust: 0, callAdjust: 0,
        bluffMore: false, valueWider: false
    };

    if (!stats || stats.getTotalHands() < 8) return defaults;

    const vpip = stats.computeVPIPStat();
    const pfr = stats.computePFRStat();
    const af = stats.computeAggressionFactor();
    const threeBet = stats.compute3BetStat();

    let adj = { ...defaults };

    // vs Nit (VPIP < 18%): Steal wider, fold to their aggression
    if (vpip < 18) {
        adj.rfiAdjust = -8;     // Open wider to steal their blinds
        adj.bluffMore = true;    // They fold too much
        adj.threeBetAdjust = 5;  // Don't 3-bet light - they only play premium
    }
    // vs Calling Station (VPIP > 35%, PFR < 12%): Value bet relentlessly, never bluff
    else if (vpip > 35 && pfr < 12) {
        adj.valueWider = true;
        adj.bluffMore = false;
        adj.callAdjust = -5;     // Call wider (they have wide range)
        adj.threeBetAdjust = -5; // 3-bet wider for value
    }
    // vs LAG (VPIP > 30%, PFR > 22%): Tighten up, trap, 3-bet for value
    else if (vpip > 30 && pfr > 22) {
        adj.threeBetAdjust = -8; // 3-bet wider for value
        adj.callAdjust = -5;     // Call wider - they're raising junk
    }
    // vs TAG (VPIP 18-25%, PFR 15-22%): Play standard, slight adjustments
    else if (vpip >= 18 && vpip <= 25 && pfr >= 15 && pfr <= 22) {
        // Near-GTO opponent, play standard
    }
    // vs Loose Passive (VPIP > 30%, low aggression)
    else if (vpip > 30 && af < 1.5) {
        adj.valueWider = true;
        adj.bluffMore = false;
    }

    // High 3-bet frequency: widen 4-bet range
    if (threeBet > 10 && stats.get3BetOpportunities() >= 5) {
        adj.threeBetAdjust = 5;   // Don't 3-bet into them (they'll 4-bet)
        // Instead flat more or 4-bet wider
    }

    // Very aggressive postflop: call down lighter
    if (af > 3) {
        adj.callAdjust = -8;  // Call wider - they're bluffing a lot
    }

    return adj;
}

// ============================================================================
// MAIN GTO DECISION ENGINE
// ============================================================================

export interface GTODecision {
    action: string;        // "raise", "call", "fold", "all-in"
    sizingBBs: number;     // Bet/raise size in BBs
    confidence: number;    // 0-1, how confident we are (low = defer to LLM)
    reasoning: string;     // Short explanation
}

export function getGTOPreflopAction(
    card1: string,
    card2: string,
    heroPosition: string,
    stackSizeBBs: number,
    context: PreflopContext,
    opponentStats: PlayerStats | null = null
): GTODecision {
    const hand = normalizeHand(card1, card2);
    const strength = getHandStrength(hand);
    const exploit = getExploitAdjustment(opponentStats);

    // ============================
    // SHORT STACK MODE (< 25 BB)
    // ============================
    if (stackSizeBBs < 25) {
        return getShortStackAction(hand, strength, heroPosition, stackSizeBBs, context);
    }

    // ============================
    // RAISE FIRST IN (RFI)
    // ============================
    if (context.isRFI || context.facingLimp) {
        return getRFIAction(hand, strength, heroPosition, stackSizeBBs, context, exploit);
    }

    // ============================
    // FACING OPEN RAISE
    // ============================
    if (context.facingOpen) {
        return getFacingOpenAction(hand, strength, heroPosition, stackSizeBBs, context, exploit);
    }

    // ============================
    // FACING 3-BET
    // ============================
    if (context.facing3Bet) {
        return getFacing3BetAction(hand, strength, heroPosition, stackSizeBBs, context, exploit);
    }

    // ============================
    // FACING 4-BET
    // ============================
    if (context.facing4Bet) {
        return getFacing4BetAction(hand, strength, stackSizeBBs);
    }

    // Fallback: defer to LLM
    return { action: "", sizingBBs: 0, confidence: 0, reasoning: "Unknown preflop context, deferring to AI." };
}

// ============================================================================
// SHORT STACK STRATEGY (< 25 BB)
// ============================================================================

function getShortStackAction(
    hand: string, strength: number, position: string,
    stackBBs: number, context: PreflopContext
): GTODecision {
    // Determine stack bucket for Nash ranges
    let stackBucket: string;
    if (stackBBs <= 12) stackBucket = "10";
    else if (stackBBs <= 17) stackBucket = "15";
    else stackBucket = "20";

    // Push/fold strategy using Nash equilibrium ranges
    if (context.isRFI) {
        const nashRanges = NASH_SHOVE_RANGES[stackBucket];
        const threshold = nashRanges?.[position] ?? SHORT_STACK_SHOVE_THRESHOLD;

        // For 20 BB, can open-raise instead of shove with premium hands
        if (stackBucket === "20" && strength >= threshold + 10) {
            return {
                action: "raise", sizingBBs: 2.5, confidence: 0.9,
                reasoning: `Short stack open-raise (20 BB): ${hand} (${strength}%) from ${position}, strong enough to raise/fold`
            };
        }

        if (strength >= threshold) {
            return {
                action: "all-in", sizingBBs: stackBBs, confidence: 0.95,
                reasoning: `Nash shove: ${hand} (${strength}%) from ${position} with ${stackBBs.toFixed(0)} BB (threshold: ${threshold}%)`
            };
        }
        return { action: "fold", sizingBBs: 0, confidence: 0.9, reasoning: `Nash fold: ${hand} (${strength}%) below ${position} shove threshold (${threshold}%)` };
    }

    if (context.facingOpen) {
        // 3-bet shove or fold using Nash call-vs-shove ranges
        const nashCallRanges = NASH_CALL_VS_SHOVE[stackBucket];
        let threshold = nashCallRanges?.[position] ?? 75;

        // Adjust for position relative to opener
        if (context.isInPosition) threshold -= 3;

        // Multiway adjustment: tighter with more players in pot
        threshold += getMultiwayAdjustment(context.playersInPot);

        if (strength >= threshold) {
            return {
                action: "all-in", sizingBBs: stackBBs, confidence: 0.9,
                reasoning: `Nash reshove: ${hand} (${strength}%) vs ${context.openRaiserPosition} open (threshold: ${threshold}%)`
            };
        }
        return { action: "fold", sizingBBs: 0, confidence: 0.85, reasoning: `Nash fold vs open: ${hand} (${strength}%) below reshove threshold` };
    }

    return { action: "fold", sizingBBs: 0, confidence: 0.7, reasoning: "Short stack default fold" };
}

// ============================================================================
// RAISE FIRST IN (RFI)
// ============================================================================

function getRFIAction(
    hand: string, strength: number, position: string,
    stackBBs: number, context: PreflopContext, exploit: ExploitAdjustment
): GTODecision {
    let threshold = RFI_THRESHOLDS[position] ?? 75;
    threshold += exploit.rfiAdjust;

    // Multiway: tighten ranges when limpers are in the pot
    threshold += getMultiwayAdjustment(context.playersInPot);

    // Limp pot: raise wider to isolate (but still adjusted for multiway)
    if (context.facingLimp && context.playersInPot <= 3) {
        threshold -= 5;
    }

    if (strength >= threshold) {
        // Standard open size: 2.5 BB (add 1 per limper)
        let sizing = 2.5;
        if (context.facingLimp) {
            sizing = 3.5 + (context.playersInPot - 2) * 1.0; // Add 1 BB per limper
        }
        // SB opens slightly larger (OOP postflop)
        if (position === "SB") sizing = 3.0;

        return {
            action: "raise", sizingBBs: sizing, confidence: 0.9,
            reasoning: `GTO open: ${hand} (${strength}%) from ${position}, threshold ${threshold}%${context.playersInPot > 2 ? ` (multiway +${getMultiwayAdjustment(context.playersInPot)})` : ""}`
        };
    }

    // SB can complete with some suited hands
    if (position === "SB" && strength >= 45 && hand.endsWith("s")) {
        return {
            action: "call", sizingBBs: 0.5, confidence: 0.6,
            reasoning: `SB complete with suited hand: ${hand}`
        };
    }

    return { action: "fold", sizingBBs: 0, confidence: 0.85, reasoning: `GTO fold: ${hand} (${strength}%) too weak for ${position} open` };
}

// ============================================================================
// FACING OPEN RAISE
// ============================================================================

function getFacingOpenAction(
    hand: string, strength: number, position: string,
    stackBBs: number, context: PreflopContext, exploit: ExploitAdjustment
): GTODecision {
    const openerPos = context.openRaiserPosition;
    const vsKey = `vs_${openerPos}` as keyof typeof THREE_BET_VALUE_THRESHOLDS;

    // Multiway adjustment: tighten 3-bet and call ranges with more players
    const mwAdj = getMultiwayAdjustment(context.playersInPot);

    // 3-bet for VALUE
    let threeBetThreshold = THREE_BET_VALUE_THRESHOLDS[vsKey] ?? 92;
    threeBetThreshold += exploit.threeBetAdjust;
    threeBetThreshold += mwAdj; // Tighter 3-bets in multiway

    if (strength >= threeBetThreshold) {
        let sizing = context.isInPosition
            ? context.lastRaiseSize * 3        // 3x IP
            : context.lastRaiseSize * 3.5;     // 3.5x OOP
        // Increase 3-bet sizing in multiway pots
        if (context.playersInPot > 2) {
            sizing += (context.playersInPot - 2) * 1.5;
        }
        return {
            action: "raise", sizingBBs: Math.max(sizing, 7), confidence: 0.9,
            reasoning: `GTO 3-bet value: ${hand} (${strength}%) vs ${openerPos} open${mwAdj > 0 ? " (multiway tightened)" : ""}`
        };
    }

    // 3-bet as BLUFF (only in heads-up pots, not multiway)
    if (THREE_BET_BLUFFS.includes(hand) && !exploit.valueWider && context.playersInPot <= 3) {
        if (Math.random() < 0.4) {
            const sizing = context.isInPosition
                ? context.lastRaiseSize * 3
                : context.lastRaiseSize * 3.5;
            return {
                action: "raise", sizingBBs: Math.max(sizing, 7), confidence: 0.75,
                reasoning: `GTO 3-bet bluff: ${hand} vs ${openerPos} open`
            };
        }
    }

    // BB DEFENSE: special handling for Big Blind
    if (position === "BB") {
        return getBBDefenseAction(hand, strength, context, exploit);
    }

    // CALL (flat)
    let callThreshold: number;
    if (context.isInPosition) {
        callThreshold = CALL_VS_OPEN_THRESHOLDS["IP"];
    } else {
        callThreshold = CALL_VS_OPEN_THRESHOLDS["OOP"];
    }
    callThreshold += exploit.callAdjust;
    callThreshold += mwAdj; // Tighter calls in multiway

    if (strength >= callThreshold) {
        return {
            action: "call", sizingBBs: context.lastRaiseSize, confidence: 0.85,
            reasoning: `GTO flat call: ${hand} (${strength}%) vs ${openerPos} open, ${context.isInPosition ? "IP" : "OOP"}${mwAdj > 0 ? " (multiway)" : ""}`
        };
    }

    return {
        action: "fold", sizingBBs: 0, confidence: 0.85,
        reasoning: `GTO fold vs open: ${hand} (${strength}%) too weak vs ${openerPos}`
    };
}

// ============================================================================
// BB DEFENSE
// ============================================================================

function getBBDefenseAction(
    hand: string, strength: number,
    context: PreflopContext, exploit: ExploitAdjustment
): GTODecision {
    const openerPos = context.openRaiserPosition;
    const vsKey = `vs_${openerPos}`;

    // BB-specific defense threshold based on opener position
    let defenseThreshold = BB_DEFENSE_THRESHOLDS[vsKey] ?? 60;
    defenseThreshold += exploit.callAdjust;

    // Check-raise range from BB (strong hands that benefit from building the pot OOP)
    const checkRaiseThreshold = BB_CHECK_RAISE_THRESHOLD + exploit.threeBetAdjust;
    if (strength >= checkRaiseThreshold) {
        const sizing = context.lastRaiseSize * 3.5;
        return {
            action: "raise", sizingBBs: Math.max(sizing, 7), confidence: 0.85,
            reasoning: `BB 3-bet for value: ${hand} (${strength}%) vs ${openerPos} open (defense range)`
        };
    }

    // 3-bet bluff from BB with suited hands that play well postflop
    if (THREE_BET_BLUFFS.includes(hand) && context.playersInPot <= 3) {
        if (Math.random() < 0.35) {
            const sizing = context.lastRaiseSize * 3.5;
            return {
                action: "raise", sizingBBs: Math.max(sizing, 7), confidence: 0.7,
                reasoning: `BB 3-bet bluff: ${hand} vs ${openerPos} open`
            };
        }
    }

    // Defend by calling with a wide range (already getting good pot odds)
    if (strength >= defenseThreshold) {
        return {
            action: "call", sizingBBs: context.lastRaiseSize - 1, confidence: 0.8,
            reasoning: `BB defense call: ${hand} (${strength}%) vs ${openerPos} open (threshold: ${defenseThreshold}%)`
        };
    }

    return {
        action: "fold", sizingBBs: 0, confidence: 0.8,
        reasoning: `BB fold: ${hand} (${strength}%) too weak to defend vs ${openerPos}`
    };
}

// ============================================================================
// FACING 3-BET
// ============================================================================

function getFacing3BetAction(
    hand: string, strength: number, position: string,
    stackBBs: number, context: PreflopContext, exploit: ExploitAdjustment
): GTODecision {
    // 4-bet with premium hands
    if (strength >= FACING_3BET_4BET_THRESHOLD) {
        const sizing = context.lastRaiseSize * 2.5;
        return {
            action: "raise", sizingBBs: Math.min(sizing, stackBBs), confidence: 0.95,
            reasoning: `GTO 4-bet: ${hand} (${strength}%) - premium hand`
        };
    }

    // 4-bet bluff occasionally with suited aces
    if ((hand === "A5s" || hand === "A4s") && Math.random() < 0.3) {
        const sizing = context.lastRaiseSize * 2.5;
        return {
            action: "raise", sizingBBs: Math.min(sizing, stackBBs), confidence: 0.65,
            reasoning: `GTO 4-bet bluff: ${hand} - blocker to AA/AK`
        };
    }

    // Call with strong hands
    const callThreshold = context.isInPosition ? FACING_3BET_CALL_IP : FACING_3BET_CALL_OOP;
    if (strength >= callThreshold) {
        return {
            action: "call", sizingBBs: context.lastRaiseSize, confidence: 0.85,
            reasoning: `GTO call 3-bet: ${hand} (${strength}%) ${context.isInPosition ? "IP" : "OOP"}`
        };
    }

    return {
        action: "fold", sizingBBs: 0, confidence: 0.9,
        reasoning: `GTO fold to 3-bet: ${hand} (${strength}%) not strong enough`
    };
}

// ============================================================================
// FACING 4-BET
// ============================================================================

function getFacing4BetAction(
    hand: string, strength: number, stackBBs: number
): GTODecision {
    // 5-bet shove with AA, KK
    if (strength >= 99) {
        return {
            action: "all-in", sizingBBs: stackBBs, confidence: 0.98,
            reasoning: `GTO 5-bet shove: ${hand} - nuts`
        };
    }

    // Call with QQ, AKs
    if (strength >= 96) {
        return {
            action: "call", sizingBBs: 0, confidence: 0.8,
            reasoning: `GTO call 4-bet: ${hand} - strong but not shove territory`
        };
    }

    return {
        action: "fold", sizingBBs: 0, confidence: 0.92,
        reasoning: `GTO fold to 4-bet: ${hand} (${strength}%) - ranges are narrow here`
    };
}
