# Quick Start Guide - PokerNow GPT Bot

## ✅ Setup Complete!

Your bot has been optimized with advanced poker strategy and your Gemini API key is configured.

## 🚀 How to Run

### 1. Install Dependencies (if not already done)
```bash
npm install
```

### 2. Start the Bot
```bash
npx tsx app/index.ts
```

### 3. Follow the Prompts
The bot will ask you:
- **Game ID**: Get this from your PokerNow game URL
  - Example: If URL is `https://www.pokernow.club/games/abc123xyz`, the ID is `abc123xyz`
- **Player Name**: Choose a unique name (2-14 characters)
- **Stack Size**: Your starting chip stack (e.g., 1000)

### 4. Wait for Host Approval
- The bot will send a request to join the table
- The game host must approve your entry
- Once approved, the bot will start playing automatically!

## 🎮 How to Play

1. **Create or join a PokerNow game** at https://www.pokernow.club/start-game
2. **Share the game link** with friends (or use an existing game)
3. **Run the bot** and let it join as a player
4. **The bot will play automatically** - it will:
   - Wait for its turn
   - Analyze the game state (cards, positions, pot, opponent stats)
   - Make optimal decisions using advanced GTO strategy
   - Execute actions (bet, raise, call, check, fold)
   - Track opponent stats (VPIP, PFR, 3-bet %, aggression factor)

## ⚙️ Configuration

### Current Settings (in `app/configs/ai-config.json`):
- **Provider**: Google Gemini
- **Model**: gemini-1.5-pro (high-quality decision making)
- **Playstyle**: neutral (balanced GTO-inspired strategy)

### Available Playstyles:
- `"pro"` - GTO-based, strong ranges, aggressive postflop
- `"aggressive"` - Very aggressive, applies maximum pressure
- `"passive"` - Tight, patient, waits for strong hands
- `"neutral"` - Balanced, makes exploitative adjustments based on opponent stats

To change playstyle, edit `app/configs/ai-config.json` and change the `"playstyle"` field.

## 🎯 What Makes This Bot Strong

### Advanced Strategy Features:
1. **GTO-Inspired Core Strategy**
   - Position-based preflop ranges (UTG: 15%, BU: 45%)
   - Optimal bet sizing (c-bets, value bets, overbets)
   - Proper bluff-to-value ratios

2. **Deep Game Analysis**
   - Pot odds calculation
   - Stack-to-Pot Ratio (SPR) awareness
   - Effective stack depth evaluation
   - In Position (IP) vs Out of Position (OOP) detection
   - Draw detection (flush draws, straight draws)

3. **Exploitative Adjustments**
   - Tracks VPIP (how loose opponents play)
   - Tracks PFR (how aggressive opponents are preflop)
   - Tracks 3-bet % (how often opponents re-raise)
   - Tracks Aggression Factor (bet/raise frequency postflop)
   - Auto-classifies opponents: CALLING STATION, LAG, NIT, TAG, etc.
   - Adjusts strategy based on opponent tendencies

4. **Persistent Learning**
   - Stores opponent stats in SQLite database
   - Remembers opponents across sessions
   - Gets stronger the more you play against the same opponents

## 🛠️ Troubleshooting

### Bot won't start?
- Make sure you ran `npm install`
- Check that Node.js is installed: `node --version`

### Can't join game?
- Ensure the game ID is correct
- Make sure the host has room for players
- Try a different player name (must be unique)

### Bot making weird decisions?
- It learns from opponent stats over time - give it a few hands
- Check that the AI config is using gemini-1.5-pro (not flash)
- The bot plays a balanced strategy - some plays may seem unconventional but are GTO-inspired

### Database issues?
- The database will be created automatically at `app/pokernow-gpt.db`
- If you get errors, delete the old database file and restart

## 📊 Monitoring

Watch the terminal output to see:
- Hand-by-hand game state
- Opponent stats (VPIP, PFR, 3-bet %, AF)
- Pot odds and SPR calculations
- The bot's decisions and reasoning

## 🎲 Strategy Tips

The bot is configured to:
- **Play tighter from early position** (UTG, MP)
- **Open wider from late position** (CO, BU)
- **Apply pressure** with bets and raises
- **Value bet thinly** against calling stations
- **Bluff less** against loose passive players
- **Steal blinds** aggressively from tight players

All of these adjustments happen automatically based on opponent stats!

---

**Good luck crushing the tables! 🃏💰**
