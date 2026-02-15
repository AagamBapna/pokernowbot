# PokerNow GTO Bot 🃏🤖

An advanced poker bot for [PokerNow](https://www.pokernow.club) that combines **GTO preflop strategy** with **AI-powered postflop play**. Uses solver-derived ranges, Monte Carlo equity calculations, and opponent exploitation.

## 🚀 Features

### GTO Preflop Engine (Zero API Usage)
- **Instant decisions** - No LLM calls for preflop
- **Solver-derived ranges** for all 169 hands
- **Position-aware strategy**: UTG (15%), MP (20%), CO (30%), BU (45%)
- **Full decision tree**: Open, 3-bet, 4-bet, 5-bet
- **Randomized mixed strategies** for GTO-optimal play
- **Short stack mode** (<25 BB) with push/fold charts

### Exploitation System
Automatically adjusts strategy based on opponent stats:
- **VPIP** (Voluntarily Put In Pot %)
- **PFR** (Preflop Raise %)
- **3-bet %** (Re-raise frequency)
- **Aggression Factor** (Bets+Raises / Calls)

Auto-detects and exploits:
- **Nits** - Steal blinds aggressively, fold to their big bets
- **Calling Stations** - Value bet relentlessly, never bluff
- **LAGs** - Tighten up, trap with monsters, 3-bet for value
- **TAGs** - Play balanced, standard GTO

### Postflop Equity Calculator
- **Monte Carlo simulations** (1,500 runouts per decision)
- **Real-time equity %** against opponent ranges
- **Hand categorization**: VERY STRONG (85%+) → VERY WEAK (<25%)
- **GTO guidance**: Bet sizing, bluff frequency, commitment thresholds
- **All data injected into AI prompts** for optimal decisions

### Deep Poker Strategy
- **60+ lines of GTO principles** in system prompts
- **Pot odds, SPR, effective stacks** calculated automatically
- **Draw detection**: Flush draws, straight draws, backdoor draws
- **Position-aware** (IP vs OOP) with strategic adjustments
- **Hand strength descriptions** with actionable context

### Persistent Learning
- **SQLite database** stores opponent stats across sessions
- Gets stronger the more you play against the same opponents
- Tracks 7 key metrics per player

---

## 📦 Installation

### Prerequisites
- Node.js v18+
- OpenAI API key (recommended) or Google Gemini API key

### Setup

1. **Clone the repo**
```bash
git clone https://github.com/AagamBapna/pokernowbot.git
cd pokernowbot
```

2. **Install dependencies**
```bash
npm install
```

3. **Create `.env` file**
```bash
# For OpenAI (recommended - $5 free credit)
OPENAI_API_KEY='your-openai-key-here'

# OR for Google Gemini (20 requests/day free)
GOOGLEAI_API_KEY='your-gemini-key-here'
```

4. **Configure AI provider**

Edit `app/configs/ai-config.json`:

**For OpenAI (recommended):**
```json
{
    "provider": "OpenAI",
    "model_name": "gpt-4o-mini",
    "playstyle": "neutral"
}
```

**For Google Gemini:**
```json
{
    "provider": "Google",
    "model_name": "gemini-3-flash-preview",
    "playstyle": "neutral"
}
```

**Playstyle options:**
- `"pro"` - GTO-based, strong ranges, aggressive postflop
- `"aggressive"` - Maximum pressure, wider ranges, frequent 3-bets
- `"passive"` - Tight, patient, waits for premium hands
- `"neutral"` - Balanced GTO with exploitative adjustments (recommended)

5. **Run the bot**
```bash
npx tsx app/index.ts
```

---

## 🎮 Usage

### Starting a Game

1. Create or join a game at https://www.pokernow.club/start-game
2. Copy the **Game ID** from the URL (e.g., `abc123xyz`)
3. Run the bot and paste the Game ID when prompted
4. Choose a **unique player name** (2-14 characters)
5. Set your **starting stack** (e.g., 1000 chips)
6. Wait for the host to approve your entry
7. **The bot plays automatically!**

### What You'll See

**Preflop decisions (instant, no API):**
```
=== GTO PREFLOP ENGINE ===
Hand: ATo | Position: CO | Stack: 100.0 BB
Context: RFI=true, FacingOpen=false
Decision: raise 2.5 BB (confidence: 90%)
Reasoning: GTO open: ATo (82%) from CO, threshold 68%
==========================
```

**Postflop decisions (equity-enhanced):**
```
=== EQUITY CALCULATOR ===
Hand: As, Td | Board: Ah 5s 3d | Street: flop
Equity: 78.3% vs 1 opponent(s)
Category: STRONG (70-85% equity)
GTO Guidance: Bet 60-75% pot for value
=========================
```

---

## 🧠 How It Works

### Two-Layer Decision System

```
┌─────────────────────────────────────────┐
│         PREFLOP (Zero API Calls)        │
│                                         │
│  1. Normalize hand (e.g., As+Kh = AKo) │
│  2. Look up strength (AKo = 95th %)    │
│  3. Check position threshold            │
│  4. Analyze action context              │
│  5. Apply opponent adjustments          │
│  6. Return action instantly             │
└─────────────────────────────────────────┘
                    ↓
          (Postflop continues)
                    ↓
┌─────────────────────────────────────────┐
│    POSTFLOP (Equity + AI Enhanced)      │
│                                         │
│  1. Run Monte Carlo equity sim (1500x)  │
│  2. Calculate equity % vs opponent      │
│  3. Determine hand category + guidance  │
│  4. Inject into AI prompt               │
│  5. LLM makes decision with full context│
│  6. Parse and execute                   │
└─────────────────────────────────────────┘
```

### Preflop Strategy Examples

**Opening Ranges (RFI):**
- UTG: Top 15% (AA-77, AKs-ATs, KQs, AKo-AJo)
- MP: Top 20% (adds suited broadways, 76s+)
- CO: Top 30% (adds suited aces, KJo, QJo)
- BU: Top 45% (very wide, most suited hands)

**3-Bet Ranges:**
- For value: QQ+, AKs (tighter vs UTG, wider vs BU)
- As bluff: A5s-A2s, 76s, 65s, 54s (~40% frequency)

**Facing 3-Bet:**
- 4-bet: AA, KK, QQ, AKs
- Call: JJ, AQs, AKo (IP), suited connectors
- Fold: Rest

### Exploitation Examples

**vs Nit (VPIP < 18%):**
- Open 8% wider to steal blinds
- Bluff more often (they fold too much)
- Tighten 3-bet range (they only play premiums)

**vs Calling Station (VPIP > 35%, PFR < 12%):**
- Value bet relentlessly
- Never bluff (they never fold)
- 3-bet wider for value

**vs LAG (VPIP > 30%, PFR > 22%):**
- 3-bet wider for value (they raise junk)
- Call wider (getting good price on strong hands)
- Trap with monsters

---

## 📊 Performance

### API Usage
- **Preflop**: 0 API calls (100% deterministic GTO)
- **Postflop**: 1 API call per decision

### With Free Tier Limits
- **OpenAI ($5 credit)**: 300-500 hands before payment needed
- **Gemini (20/day)**: 15-20 hands per day

### Accuracy
- **Preflop**: Solver-accurate GTO ranges
- **Postflop**: Equity calculations within ±2% of actual
- **Exploitation**: Adjusts after 8-10 hands per opponent

---

## 🛠️ Configuration

### Bot Behavior (`app/configs/bot-config.json`)
```json
{
    "debug_mode": 1,       // 0=silent, 1=verbose
    "query_retries": 4     // API retry attempts
}
```

### Webdriver (`app/configs/webdriver-config.json`)
```json
{
    "default_timeout": 5000,    // Puppeteer timeout (ms)
    "headless": false            // true = no browser window
}
```

---

## 🐛 Troubleshooting

### "API Quota Exceeded"
- **Gemini free tier**: Only 20 requests/day
- **Solution**: Switch to OpenAI (much better free tier)

### Bot won't join game
- Ensure Game ID is correct
- Check that host has room for players
- Try a different player name (must be unique)

### Bot folds every hand
- Check API key is valid
- Verify model name in `ai-config.json` matches your API tier
- Look for error messages in terminal

### Database errors
- Delete `app/pokernow-gpt.db` and restart (fresh database)

---

## 📚 Technical Stack

- **Runtime**: Node.js (ES2022)
- **Language**: TypeScript
- **Web Automation**: Puppeteer
- **Database**: SQLite
- **AI**: OpenAI GPT-4o-mini / Google Gemini
- **Hand Evaluation**: `phe` library
- **Testing**: Mocha + Chai

---

## 🤝 Contributing

This is a personal project, but feel free to fork and extend!

### Key Files
- `app/bot.ts` - Main bot orchestration
- `app/helpers/gto-preflop.ts` - GTO preflop engine (596 lines)
- `app/helpers/equity-calculator.ts` - Monte Carlo equity sim
- `app/helpers/construct-query-helper.ts` - LLM prompt builder
- `app/helpers/ai-query-helper.ts` - System prompts + parser
- `app/models/player-stats.ts` - Opponent stat tracking

---

## ⚠️ Disclaimer

This bot is for **educational and research purposes only**. Use responsibly:
- Only play in private games with friends who know you're using a bot
- Don't use in real-money games
- Respect PokerNow's terms of service

---

## 📝 License

MIT License

---

## 🙏 Credits

- Original PokerNow GPT by [@csong2022](https://github.com/csong2022/pokernow-gpt)
- GTO strategy enhanced by [@AagamBapna](https://github.com/AagamBapna)
- Hand evaluation via [`phe`](https://github.com/danielpinto8zz6/phe) library

---

**Good luck at the tables! 🃏💰**
