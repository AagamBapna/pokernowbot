export class PlayerStats {
    private player_name: string;
    private total_hands: number;
    private walks: number;
    private vpip_hands: number;
    private pfr_hands: number;
    private three_bet_hands: number;
    private three_bet_opportunities: number;
    private total_bets_raises: number;
    private total_calls: number;

    //TODO: player stats should use name not id
    //should have separate table mapping name to id in db that updates everytime new id is detected for particular name
    constructor(player_name: string, player_JSON?: any) {
        this.player_name = player_name;
        if (player_JSON) {
            this.total_hands = player_JSON.total_hands;
            this.walks = player_JSON.walks;
            this.vpip_hands = player_JSON.vpip_hands;
            this.pfr_hands = player_JSON.pfr_hands;
            this.three_bet_hands = player_JSON.three_bet_hands || 0;
            this.three_bet_opportunities = player_JSON.three_bet_opportunities || 0;
            this.total_bets_raises = player_JSON.total_bets_raises || 0;
            this.total_calls = player_JSON.total_calls || 0;
        } else {
            this.total_hands = 0;
            this.walks = 0;
            this.vpip_hands = 0;
            this.pfr_hands = 0;
            this.three_bet_hands = 0;
            this.three_bet_opportunities = 0;
            this.total_bets_raises = 0;
            this.total_calls = 0;
        }
    }

    public getName(): string {
        return this.player_name;
    }
    
    public getTotalHands(): number {
        return this.total_hands;
    }

    public setTotalHands(total_hands: number): void {
        this.total_hands = total_hands;
    }

    public getWalk(): number {
        return this.walks;
    }

    public incrementWalks(): void {
        this.walks += 1;
    }

    public getVPIPHands(): number {
        return this.vpip_hands;
    }

    public setVPIPHands(vpip: number): void {
        this.vpip_hands = vpip;
    }

    public computeVPIPStat(): number {
        if (this.total_hands - this.walks == 0) {
            return 0;
        }
        return this.vpip_hands / (this.total_hands - this.walks) * 100;
    }

    public getPFRHands(): number {
        return this.pfr_hands;
    }

    public setPFRHands(pfr: number): void {
        this.pfr_hands = pfr;
    }

    public computePFRStat(): number {
        if (this.total_hands - this.walks == 0) {
            return 0;
        }
        return this.pfr_hands / (this.total_hands - this.walks) * 100;
    }

    // 3-bet stats
    public get3BetHands(): number {
        return this.three_bet_hands;
    }

    public set3BetHands(three_bet: number): void {
        this.three_bet_hands = three_bet;
    }

    public get3BetOpportunities(): number {
        return this.three_bet_opportunities;
    }

    public set3BetOpportunities(opportunities: number): void {
        this.three_bet_opportunities = opportunities;
    }

    public compute3BetStat(): number {
        if (this.three_bet_opportunities === 0) {
            return 0;
        }
        return (this.three_bet_hands / this.three_bet_opportunities) * 100;
    }

    // Aggression Factor: (bets + raises) / calls
    public getTotalBetsRaises(): number {
        return this.total_bets_raises;
    }

    public incrementBetsRaises(): void {
        this.total_bets_raises += 1;
    }

    public getTotalCalls(): number {
        return this.total_calls;
    }

    public incrementCalls(): void {
        this.total_calls += 1;
    }

    public computeAggressionFactor(): number {
        if (this.total_calls === 0) {
            return this.total_bets_raises > 0 ? 99.0 : 0;
        }
        return this.total_bets_raises / this.total_calls;
    }

    public toJSON(): any {
        return {
            "name": this.player_name,
            "total_hands": this.total_hands,
            "walks": this.walks,
            "vpip_hands": this.vpip_hands,
            "pfr_hands": this.pfr_hands,
            "three_bet_hands": this.three_bet_hands,
            "three_bet_opportunities": this.three_bet_opportunities,
            "total_bets_raises": this.total_bets_raises,
            "total_calls": this.total_calls,
        }
    }
}