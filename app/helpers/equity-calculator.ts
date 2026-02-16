/**
 * Monte Carlo Equity Calculator
 * 
 * Estimates hand equity by simulating thousands of random runouts.
 * Uses the `phe` library for hand evaluation.
 */

// @ts-ignore
import { rankBoard } from "phe";
import { WeightedHand, normalizeRange, expandHandToCombos } from "./range-tracker.ts";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"];

/**
 * Build a full 52-card deck in phe-compatible format (e.g., "As", "Kh", "Td")
 */
function buildDeck(): string[] {
    const deck: string[] = [];
    for (const r of RANKS) {
        for (const s of SUITS) {
            deck.push(r + s);
        }
    }
    return deck;
}

/**
 * Normalize a card to phe format: "10h" -> "Th", "As" -> "As"
 */
function normalizeCard(card: string): string {
    if (card.startsWith("10")) {
        return "T" + card.slice(2);
    }
    return card;
}

/**
 * Shuffle array in-place (Fisher-Yates)
 */
function shuffle(arr: string[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/**
 * Evaluate a hand (5-7 cards) and return rank (lower = better)
 */
function evaluateHand(cards: string[]): number {
    try {
        return rankBoard(cards.join(" "));
    } catch {
        return 9999; // Invalid hand
    }
}

/**
 * Convert runout string (e.g., "Ah 5s 3d") to array of cards
 */
export function parseRunout(runout: string): string[] {
    if (!runout || runout.trim() === "") return [];
    const re = /([JQKA]|10|[2-9T])([shdc])/g;
    const cards: string[] = [];
    let match;
    while ((match = re.exec(runout)) !== null) {
        let rank = match[1];
        if (rank === "10") rank = "T";
        cards.push(rank + match[2]);
    }
    return cards;
}

/**
 * Monte Carlo equity calculation.
 * 
 * @param heroCards - Hero's hole cards (2 cards, e.g., ["As", "Kh"])
 * @param boardCards - Community cards shown so far (0-5 cards)
 * @param numOpponents - Number of opponents still in the hand
 * @param numSimulations - Number of random simulations to run
 * @returns Equity as a percentage (0-100)
 */
export function calculateEquity(
    heroCards: string[],
    boardCards: string[],
    numOpponents: number = 1,
    numSimulations: number = 2000
): number {
    // Normalize cards
    const heroNorm = heroCards.map(normalizeCard);
    const boardNorm = boardCards.map(normalizeCard);

    // Build remaining deck (remove known cards)
    const usedCards = new Set([...heroNorm, ...boardNorm]);
    const remainingDeck = buildDeck().filter(c => !usedCards.has(c));

    const cardsNeededForBoard = 5 - boardNorm.length;
    const cardsNeededPerOpponent = 2;
    const totalCardsNeeded = cardsNeededForBoard + (numOpponents * cardsNeededPerOpponent);

    if (remainingDeck.length < totalCardsNeeded) {
        return 50; // Not enough cards, return default
    }

    let wins = 0;
    let ties = 0;

    for (let sim = 0; sim < numSimulations; sim++) {
        // Shuffle remaining deck
        shuffle(remainingDeck);

        let idx = 0;

        // Complete the board
        const fullBoard = [...boardNorm];
        for (let i = 0; i < cardsNeededForBoard; i++) {
            fullBoard.push(remainingDeck[idx++]);
        }

        // Hero's full hand (7 cards)
        const heroFull = [...heroNorm, ...fullBoard];
        const heroRank = evaluateHand(heroFull);

        // Evaluate each opponent
        let heroBeat = true;
        let heroTied = true;

        for (let opp = 0; opp < numOpponents; opp++) {
            const oppCards = [remainingDeck[idx++], remainingDeck[idx++]];
            const oppFull = [...oppCards, ...fullBoard];
            const oppRank = evaluateHand(oppFull);

            if (oppRank < heroRank) {
                // Opponent has better hand (lower rank = better in phe)
                heroBeat = false;
                heroTied = false;
                break;
            } else if (oppRank === heroRank) {
                heroBeat = false;
                // Could still be a tie
            } else {
                heroTied = false;
            }
        }

        if (heroBeat) {
            wins++;
        } else if (heroTied) {
            ties++;
        }
    }

    const equity = ((wins + ties * 0.5) / numSimulations) * 100;
    return equity;
}

/**
 * Monte Carlo equity calculation against a weighted opponent range.
 *
 * Instead of dealing random opponent cards, samples opponent hands
 * from the weighted range distribution for more accurate equity.
 *
 * @param heroCards - Hero's hole cards (2 cards)
 * @param boardCards - Community cards shown so far (0-5 cards)
 * @param opponentRange - Weighted range of opponent's possible holdings
 * @param numSimulations - Number of random simulations to run
 * @returns Equity as a percentage (0-100)
 */
export function calculateEquityVsRange(
    heroCards: string[],
    boardCards: string[],
    opponentRange: WeightedHand[],
    numSimulations: number = 2000
): number {
    const heroNorm = heroCards.map(normalizeCard);
    const boardNorm = boardCards.map(normalizeCard);
    const usedCards = new Set([...heroNorm, ...boardNorm]);

    // Build weighted combo list from opponent range
    const normalized = normalizeRange(opponentRange);
    const weightedCombos: { cards: [string, string]; weight: number }[] = [];

    for (const wh of normalized) {
        if (wh.weight < 0.001) continue;
        const combos = expandHandToCombos(wh.hand);
        for (const combo of combos) {
            // Skip combos that conflict with known cards
            if (usedCards.has(combo[0]) || usedCards.has(combo[1])) continue;
            weightedCombos.push({ cards: combo, weight: wh.weight });
        }
    }

    if (weightedCombos.length === 0) {
        // Fallback to random equity if range produces no valid combos
        return calculateEquity(heroCards, boardCards, 1, numSimulations);
    }

    // Build cumulative weight array for weighted sampling
    const totalWeight = weightedCombos.reduce((sum, c) => sum + c.weight, 0);
    const cumulativeWeights: number[] = [];
    let cumSum = 0;
    for (const combo of weightedCombos) {
        cumSum += combo.weight / totalWeight;
        cumulativeWeights.push(cumSum);
    }

    const cardsNeededForBoard = 5 - boardNorm.length;
    const fullDeck = buildDeck();

    let wins = 0;
    let ties = 0;

    for (let sim = 0; sim < numSimulations; sim++) {
        // Sample opponent hand from weighted range
        const r = Math.random();
        let comboIdx = 0;
        for (let i = 0; i < cumulativeWeights.length; i++) {
            if (r <= cumulativeWeights[i]) {
                comboIdx = i;
                break;
            }
            comboIdx = i;
        }
        const oppCards = weightedCombos[comboIdx].cards;

        // Build remaining deck excluding hero, board, and opponent cards
        const excluded = new Set([...heroNorm, ...boardNorm, oppCards[0], oppCards[1]]);
        const remainingDeck = fullDeck.filter(c => !excluded.has(c));

        if (remainingDeck.length < cardsNeededForBoard) continue;

        // Shuffle and complete board
        shuffle(remainingDeck);
        const fullBoard = [...boardNorm];
        for (let i = 0; i < cardsNeededForBoard; i++) {
            fullBoard.push(remainingDeck[i]);
        }

        const heroRank = evaluateHand([...heroNorm, ...fullBoard]);
        const oppRank = evaluateHand([oppCards[0], oppCards[1], ...fullBoard]);

        if (heroRank < oppRank) {
            wins++;
        } else if (heroRank === oppRank) {
            ties++;
        }
    }

    return ((wins + ties * 0.5) / numSimulations) * 100;
}

/**
 * Determine hand category and outs for draw assessment
 */
export function getHandCategory(equity: number): string {
    if (equity >= 85) return "VERY STRONG (85%+ equity - bet/raise for max value)";
    if (equity >= 70) return "STRONG (70-85% equity - bet for value, consider raising)";
    if (equity >= 55) return "GOOD (55-70% equity - bet for thin value or call)";
    if (equity >= 40) return "MARGINAL (40-55% equity - check/call or small bet)";
    if (equity >= 25) return "WEAK (25-40% equity - check or bluff if in position)";
    return "VERY WEAK (<25% equity - fold or bluff only with a credible story)";
}

/**
 * Determine if we should be betting for value or as a bluff,
 * given our equity and the pot size.
 */
export function getPostflopGTOGuidance(
    equity: number,
    potSizeBBs: number,
    stackBBs: number,
    isInPosition: boolean,
    numOpponents: number
): string {
    const spr = stackBBs / Math.max(potSizeBBs, 0.1);
    let guidance = "";

    // Value betting range
    if (equity >= 70) {
        if (spr < 3) {
            guidance = "GTO: Commit your stack - you have strong equity and low SPR. Bet/raise all-in if possible.";
        } else {
            const betSize = isInPosition ? "60-75% pot" : "50-66% pot";
            guidance = `GTO: Bet ${betSize} for value. You have strong equity.`;
            if (numOpponents > 1) {
                guidance += " Multiway - bet larger to deny equity.";
            }
        }
    }
    // Marginal made hands
    else if (equity >= 50) {
        if (isInPosition) {
            guidance = "GTO: You have a marginal hand in position. Bet 33-50% pot for thin value/protection, or check to control pot size.";
        } else {
            guidance = "GTO: Marginal hand OOP. Prefer checking - consider check-calling if opponent bets. Check-raise occasionally as a bluff-catcher.";
        }
    }
    // Drawing hands
    else if (equity >= 30) {
        if (isInPosition) {
            guidance = "GTO: Drawing hand in position. Semi-bluff with 50-66% pot bet. If checked to, take free card.";
        } else {
            guidance = "GTO: Drawing hand OOP. Check-raise as semi-bluff ~20% of the time. Otherwise check-call if getting right price.";
        }
    }
    // Weak hands / bluff candidates
    else {
        if (isInPosition) {
            const potOddsNeeded = (1 / (1 + potSizeBBs)) * 100;
            guidance = `GTO: Weak hand. Bluff ~30% of the time with 50-66% pot. Need opponent to fold ${potOddsNeeded.toFixed(0)}%+ for bluff to be profitable.`;
        } else {
            guidance = "GTO: Weak hand OOP. Mostly check-fold. Occasionally bluff if board favors your perceived range.";
        }
    }

    return guidance;
}
