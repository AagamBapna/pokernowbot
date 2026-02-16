// @ts-ignore
import { rankBoard } from "phe";
import { Game } from "../models/game.ts";
import { PlayerAction } from "../models/player-action.ts";
import { Table } from "../models/table.ts";
import { RangeTracker } from "./range-tracker.ts";

export function constructQuery(game: Game, rangeTracker?: RangeTracker): string{
    const table = game.getTable();

    const street = table.getStreet();
    const runout = table.getRunout();

    const hero_id = game.getHero()!.getPlayerId();
    const hero_name = table.getNameFromId(hero_id);
    const hero_stack = game.getHero()!.getStackSize();
    const hero_position = table.getPlayerPositionFromId(hero_id);
    const hero_cards = game.getHero()!.getHand();

    const players_in_pot = table.getPlayersInPot();
    const player_stacks = table.getPlayerInitialStacks();
    const pot_size = table.getPot();
    const player_actions = table.getPlayerActions();
    const player_positions = table.getPlayerPositions();

    let query = "";

    query = query.concat(defineObjective(hero_position, hero_stack), '\n');
    query = query.concat(defineGameState(street, players_in_pot, table.getNumPlayers()), '\n');
    query = query.concat(defineCommunityCards(street, runout), '\n');
    if (street && runout) {
        query = query.concat(defineBoardTexture(runout), '\n');
    }
    query = query.concat(defineHand(hero_cards), '\n');
    const rank_query = defineRank(street, runout, hero_cards);
    query = query.concat(rank_query ? rank_query + '\n' : '');
    const draw_query = defineDraws(street, runout, hero_cards);
    query = query.concat(draw_query ? draw_query + '\n' : '');
    query = query.concat(defineStacks(player_stacks, player_positions, hero_id, hero_stack), '\n');
    query = query.concat(defineSPR(pot_size, hero_stack), '\n');
    query = query.concat(definePotSize(pot_size), '\n');
    query = query.concat(defineActions(player_actions, table), '\n');
    query = query.concat(definePotOdds(player_actions, pot_size), '\n');
    query = query.concat(definePositionContext(hero_position, player_actions, player_positions, table, hero_id), '\n');
    query = query.concat(defineStats(player_positions, table, hero_name), '\n');
    if (rangeTracker) {
        query = query.concat(defineOpponentRanges(player_positions, table, hero_id, rangeTracker), '\n');
    }
    query = query.concat(defineOutput());

    return query;
}

function defineObjective(position: string, stack_size: number): string {
    return `Decide my optimal action in No Limit Hold'em. I'm in the ${position} position with ${stack_size.toFixed(1)} BB effective stack.`;
}

function defineGameState(street: string, players_in_pot: number, total_players: number): string {
    const current_street = street ? street : "preflop";
    return `Table is ${total_players}-max. ${players_in_pot} player(s) remain in the pot. Current street: ${current_street}.`;
}

function defineCommunityCards(street: string, runout: string): string {
    if (street && runout) {
        return `Community cards: ${runout}`;
    }
    return "Street: Preflop (no community cards).";
}

function defineHand(hero_cards: string[]): string {
    const card1 = hero_cards[0];
    const card2 = hero_cards[1];
    // Provide both raw cards and a human-readable summary
    const suited = card1 && card2 && card1.slice(-1) === card2.slice(-1) ? "suited" : "offsuit";
    return `My hole cards: ${hero_cards.join(", ")} (${suited})`;
}

export function defineRank(street: string, runout: string, hero_cards: string[]): string {
    if (!street) {
        return '';
    }
    let query = "Current hand strength: ";
    const cards = replaceTenWithLetter(hero_cards.concat(convertRunoutToCards(runout)));
    const rank_num = rankBoard(cards.join(" "));
    switch (rank_num) {
        case 0: query = query.concat("STRAIGHT FLUSH (monster - near nuts)"); break;
        case 1: query = query.concat("FOUR OF A KIND (monster - near nuts)"); break;
        case 2: query = query.concat("FULL HOUSE (very strong - typically betting/raising for value)"); break;
        case 3: query = query.concat("FLUSH (strong - bet for value, be cautious of board pairing)"); break;
        case 4: query = query.concat("STRAIGHT (strong - bet for value, watch for flush draws)"); break;
        case 5: query = query.concat("THREE OF A KIND (strong - usually betting for value and protection)"); break;
        case 6: query = query.concat("TWO PAIR (medium-strong - bet for value, vulnerable to draws)"); break;
        case 7: query = query.concat("ONE PAIR (medium - consider kicker strength and board texture)"); break;
        case 8: query = query.concat("HIGH CARD (weak - consider bluffing or giving up)"); break;
    }
    return query;
}

function defineDraws(street: string, runout: string, hero_cards: string[]): string {
    if (!street || !runout) {
        return '';
    }
    const all_cards = hero_cards.concat(convertRunoutToCards(runout));
    const draws: string[] = [];

    // Check for flush draws
    const suits: Map<string, number> = new Map();
    for (const card of all_cards) {
        const suit = card.slice(-1);
        suits.set(suit, (suits.get(suit) || 0) + 1);
    }
    for (const [suit, count] of suits.entries()) {
        // Only flag flush draw if hero holds at least one card of that suit
        const hero_has_suit = hero_cards.some(c => c.slice(-1) === suit);
        if (count === 4 && hero_has_suit) {
            draws.push("flush draw (4 to a flush)");
        }
        if (count === 3 && hero_has_suit) {
            draws.push("backdoor flush draw (3 to a flush)");
        }
    }

    // Check for straight draws (simplified)
    const valueOrder = "23456789TJQKA";
    const card_values = all_cards.map(c => {
        let v = c.slice(0, -1);
        if (v === "10") v = "T";
        return v;
    });
    const unique_values = [...new Set(card_values)];
    const indices = unique_values.map(v => valueOrder.indexOf(v)).filter(i => i >= 0).sort((a, b) => a - b);
    
    // Check for open-ended straight draw (4 consecutive) and gutshot (4 out of 5 consecutive)
    if (indices.length >= 4) {
        let has_oesd = false;
        let has_gutshot = false;
        for (let i = 0; i <= indices.length - 4; i++) {
            if (indices[i + 3] - indices[i] === 3) {
                // 4 consecutive - check if hero cards contribute
                has_oesd = true;
            }
            if (indices[i + 3] - indices[i] === 4) {
                // Gap of 4 with one missing - gutshot
                has_gutshot = true;
            }
        }
        if (has_oesd) draws.push("open-ended straight draw (8 outs)");
        else if (has_gutshot) draws.push("gutshot straight draw (4 outs)");
    }

    if (draws.length > 0) {
        return `Draw potential: ${draws.join(", ")}`;
    }
    return "Draw potential: No significant draws.";
}

function convertRunoutToCards(runout: string): string[] {
    const re = RegExp(/([JQKA]|10|[1-9])([shdc])/, 'g');
    const res = new Array<string>;
    const matches = [...runout.matchAll(re)];
    matches.forEach((element) => {
        const value = element[1];
        const suit = element[2];
        res.push(value + suit);
    });
    return res;
}

function replaceTenWithLetter(cards: string[]): string[] {
    return cards.map((card) => {
        if (card.length === 3) {
            return 'T' + card[2];
        }
        return card;
    });
}

function defineStacks(player_stacks: Map<string, number>, player_positions: Map<string, string>, hero_id: string, hero_stack: number): string {
    let query = "Stack sizes (position: stack in BBs):\n";
    let min_opponent_stack = Infinity;
    const player_ids = Array.from(player_positions.keys());
    for (var i = 0; i < player_ids.length; i++) {
        const player_id = player_ids[i];
        if (player_id === hero_id) {
            continue;
        }
        const player_pos = player_positions.get(player_id);
        const stack_size = player_stacks.get(player_id);
        if (stack_size !== undefined && stack_size < min_opponent_stack) {
            min_opponent_stack = stack_size;
        }
        query = query.concat(`  ${player_pos}: ${stack_size?.toFixed(1)} BB`);
        if (i != player_ids.length - 1) {
            query = query.concat("\n");
        }
    }
    // Calculate effective stack (min of hero's stack and smallest opponent stack)
    const effective_stack = Math.min(hero_stack, min_opponent_stack === Infinity ? hero_stack : min_opponent_stack);
    query = query.concat(`\nEffective stack depth: ${effective_stack.toFixed(1)} BB`);
    if (effective_stack <= 25) {
        query = query.concat(" (SHORT STACK - consider push/fold strategy)");
    } else if (effective_stack <= 50) {
        query = query.concat(" (MEDIUM STACK - play a tighter, more committed strategy)");
    } else {
        query = query.concat(" (DEEP STACK - more room to maneuver postflop)");
    }
    return query;
}

function defineSPR(pot_size_in_BBs: number, hero_stack: number): string {
    if (pot_size_in_BBs <= 0) {
        return "";
    }
    const spr = hero_stack / pot_size_in_BBs;
    let context = "";
    if (spr < 2) {
        context = "Very low SPR - commit with top pair or better, shove with any equity.";
    } else if (spr < 4) {
        context = "Low SPR - willing to get stacks in with top pair good kicker+.";
    } else if (spr < 8) {
        context = "Medium SPR - standard play, need strong hands to stack off.";
    } else {
        context = "High SPR - proceed cautiously, need very strong hands or strong draws to commit.";
    }
    return `Stack-to-Pot Ratio (SPR): ${spr.toFixed(1)} - ${context}`;
}

function definePotSize(pot_size_in_BBs: number): string {
    return `Current pot: ${pot_size_in_BBs.toFixed(1)} BB.`;
}

function defineActions(player_actions: Array<PlayerAction>, table: Table): string {
    if (player_actions.length === 0) {
        return "Action on this street: No actions yet (you are first to act).";
    }
    let query = "Actions this street (in order):\n";
    for (var i = 0; i < player_actions.length; i++) {
        let player_pos = table.getPlayerPositionFromId(player_actions[i].getPlayerId());
        let player_action_string = player_actions[i].toString();
        query = query.concat(`  ${i + 1}. ${player_pos} ${player_action_string}`);
        if (i != player_actions.length - 1) {
            query = query.concat("\n");
        }
    }
    return query;
}

function definePotOdds(player_actions: Array<PlayerAction>, pot_size: number): string {
    // Find the last bet/raise to calculate pot odds
    let last_bet = 0;
    for (let i = player_actions.length - 1; i >= 0; i--) {
        const action = player_actions[i].getAction();
        if (action === "bets" || action === "raises" || action === "calls") {
            last_bet = player_actions[i].getBetAmount();
            break;
        }
    }

    if (last_bet > 0 && pot_size > 0) {
        const total_pot = pot_size + last_bet;
        const pot_odds = (last_bet / (total_pot + last_bet)) * 100;
        return `Pot odds to call: ${pot_odds.toFixed(1)}% (need ${pot_odds.toFixed(1)}%+ equity to call profitably). You must call ${last_bet.toFixed(1)} BB into a pot of ${total_pot.toFixed(1)} BB.`;
    }
    return "No bet to call—you can check or bet.";
}

function definePositionContext(hero_position: string, player_actions: Array<PlayerAction>, player_positions: Map<string, string>, table: Table, hero_id: string): string {
    // Determine if hero is in position or out of position relative to remaining opponents
    const position_order = ["SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BU"];
    const hero_idx = position_order.indexOf(hero_position);
    
    let opponents_behind = 0;
    let opponents_ahead = 0;
    
    for (const [player_id, position] of player_positions.entries()) {
        if (player_id === hero_id) continue;
        const opp_idx = position_order.indexOf(position);
        if (opp_idx > hero_idx) {
            opponents_behind++;
        } else {
            opponents_ahead++;
        }
    }
    
    if (opponents_behind === 0) {
        return "Position: You are IN POSITION (IP) - last to act. This is advantageous; use it to control pot size and extract value.";
    } else if (opponents_ahead === 0) {
        return `Position: You are OUT OF POSITION (OOP) - first to act with ${opponents_behind} opponent(s) behind you. Play more cautiously; prefer check-raising with strong hands.`;
    }
    return `Position: You have ${opponents_ahead} opponent(s) who acted before you and ${opponents_behind} opponent(s) still to act after you.`;
}

function defineStats(player_positions: Map<string, string>, table: Table, hero_name: string): string {
    let query = "Opponent stats & reads:\n";
    let has_stats = false;
    let player_ids = Array.from(player_positions.keys());

    for (var i = 0; i < player_ids.length; i++) {
        const player_id = player_ids[i];
        const player_name = table.getNameFromId(player_id);
        if (player_name === hero_name) {
            continue;
        }
        const player_stats = table.getPlayerStatsFromName(player_name);
        const player_pos = table.getPlayerPositionFromId(player_id);
        const total_hands = player_stats.getTotalHands();
        const vpip = player_stats.computeVPIPStat();
        const pfr = player_stats.computePFRStat();
        const af = player_stats.computeAggressionFactor();
        const three_bet = player_stats.compute3BetStat();
        
        let profile = "";
        if (total_hands >= 10) {
            // Classify opponent based on stats
            if (vpip > 40 && pfr < 12) {
                profile = " [CALLING STATION - value bet relentlessly, avoid bluffing]";
            } else if (vpip > 35 && pfr > 25) {
                profile = " [LAG (Loose-Aggressive) - 3-bet for value, trap with monsters]";
            } else if (vpip < 18 && pfr < 12) {
                profile = " [NIT - steal blinds aggressively, fold to their big bets]";
            } else if (vpip < 22 && pfr > 16) {
                profile = " [TAG (Tight-Aggressive) - respect their raises, look for spots to 3-bet light]";
            } else if (vpip > 30) {
                profile = " [LOOSE - plays too many hands, isolate with value hands]";
            } else {
                profile = " [REGULAR - balanced player, stick to GTO strategy]";
            }
        } else if (total_hands > 0) {
            profile = " [Small sample - stats unreliable, assume competent]";
        } else {
            profile = " [Unknown - no data, play standard]";
        }

        let stat_line = `  ${player_pos} (${total_hands} hands): VPIP=${vpip.toFixed(0)}%, PFR=${pfr.toFixed(0)}%`;
        if (total_hands >= 5) {
            stat_line += `, AF=${af.toFixed(1)}, 3Bet=${three_bet.toFixed(0)}%`;
        }
        stat_line += profile;
        
        query = query.concat(stat_line);
        if (i != player_ids.length - 1) {
            query = query.concat("\n");
        }
        has_stats = true;
    }
    
    if (!has_stats) {
        query = query.concat("  No opponent data available.");
    }
    return query;
}

function defineBoardTexture(runout: string): string {
    const cards = convertRunoutToCards(runout);
    if (cards.length === 0) return "";

    const descriptors: string[] = [];

    // Check for paired board
    const values = cards.map(c => {
        let v = c.slice(0, -1);
        if (v === "10") v = "T";
        return v;
    });
    const valueCounts = new Map<string, number>();
    for (const v of values) {
        valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
    }
    const hasPair = [...valueCounts.values()].some(c => c >= 2);
    if (hasPair) descriptors.push("paired");

    // Check for flush draws / monotone
    const suits = cards.map(c => c.slice(-1));
    const suitCounts = new Map<string, number>();
    for (const s of suits) {
        suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
    }
    const maxSuitCount = Math.max(...suitCounts.values());
    if (maxSuitCount >= 3) {
        descriptors.push("monotone (flush possible)");
    } else if (maxSuitCount === 2 && cards.length <= 3) {
        descriptors.push("two-tone (flush draw possible)");
    } else if (cards.length <= 3) {
        descriptors.push("rainbow (no flush draw)");
    }

    // Check for connectedness (straight draws)
    const valueOrder = "23456789TJQKA";
    const indices = [...new Set(values.map(v => valueOrder.indexOf(v)))].filter(i => i >= 0).sort((a, b) => a - b);
    if (indices.length >= 3) {
        const range = indices[indices.length - 1] - indices[0];
        if (range <= 4) {
            descriptors.push("connected (straight draws likely)");
        } else if (range <= 6) {
            descriptors.push("semi-connected");
        } else {
            descriptors.push("disconnected");
        }
    }

    // High card check
    const highCards = values.filter(v => "TJQKA".includes(v));
    if (highCards.length >= 2) {
        descriptors.push("high-card heavy");
    } else if (highCards.length === 0) {
        descriptors.push("low board");
    }

    const texture = descriptors.length > 0 ? descriptors.join(", ") : "neutral";
    const dynamicStatic = (maxSuitCount >= 2 && indices.length >= 3 && (indices[indices.length - 1] - indices[0]) <= 5)
        ? "wet/dynamic (many draws possible - bet larger to deny equity)"
        : "dry/static (few draws - can bet smaller for value)";

    return `Board texture: ${texture}. Overall: ${dynamicStatic}.`;
}

function defineOpponentRanges(
    player_positions: Map<string, string>,
    table: Table,
    hero_id: string,
    rangeTracker: RangeTracker
): string {
    let query = "Opponent range estimates (based on actions this hand):\n";
    let hasRanges = false;

    for (const [playerId, _pos] of player_positions.entries()) {
        if (playerId === hero_id) continue;
        const rangeDesc = rangeTracker.describeRange(playerId);
        if (rangeDesc && !rangeDesc.includes("no tracking data")) {
            const pos = table.getPlayerPositionFromId(playerId);
            query += `  ${pos}: ${rangeDesc}\n`;
            hasRanges = true;
        }
    }

    if (!hasRanges) {
        return "";
    }
    return query;
}

function defineOutput(): string {
    return `\nDecide your action. Think step-by-step:
1. Assess hand strength relative to the board
2. Consider position (IP vs OOP)
3. Evaluate opponent tendencies from stats
4. Calculate pot odds if facing a bet
5. Consider stack depth and SPR

Then respond ONLY in this exact format (no other text):
{action, bet_size_in_BBs BB}

Valid actions: fold, check, call, bet, raise, all-in
Examples: {raise, 7.5 BB} or {call, 3 BB} or {fold, 0 BB} or {check, 0 BB} or {all-in, 0 BB}`;
}