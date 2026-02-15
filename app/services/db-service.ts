import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3';

export class DBService {
    private file_name: string;
    private db!: Database<sqlite3.Database, sqlite3.Statement>;

    constructor(file_name: string) {
        this.file_name = file_name;
    }

    async init(): Promise<void> {
        this.db = await open<sqlite3.Database, sqlite3.Statement>({
            filename: this.file_name,
            driver: sqlite3.Database
        })
    }
    
    async createTables(): Promise<void> {
        await this.createPlayerTable();
    }
    
    async createPlayerTable(): Promise<void> {
        try {
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS PlayerStats (
                    name TEXT PRIMARY KEY NOT NULL,
                    total_hands INT NOT NULL,
                    walks INT NOT NULL,
                    vpip_hands INT NOT NULL,
                    vpip_stat REAL AS (vpip_hands / CAST((total_hands - walks) AS REAL)),
                    pfr_hands INT NOT NULL,
                    pfr_stat REAL AS (pfr_hands / CAST((total_hands - walks) AS REAL)),
                    three_bet_hands INT NOT NULL DEFAULT 0,
                    three_bet_opportunities INT NOT NULL DEFAULT 0,
                    total_bets_raises INT NOT NULL DEFAULT 0,
                    total_calls INT NOT NULL DEFAULT 0
                );
            `);
            // Migrate existing tables that don't have the new columns
            await this.migratePlayerTable();
        } catch (err) {
            console.log("Failed to create player table", err.message);
        }
    }

    async migratePlayerTable(): Promise<void> {
        const columns_to_add = [
            { name: 'three_bet_hands', type: 'INT NOT NULL DEFAULT 0' },
            { name: 'three_bet_opportunities', type: 'INT NOT NULL DEFAULT 0' },
            { name: 'total_bets_raises', type: 'INT NOT NULL DEFAULT 0' },
            { name: 'total_calls', type: 'INT NOT NULL DEFAULT 0' },
        ];
        for (const col of columns_to_add) {
            try {
                await this.db.exec(`ALTER TABLE PlayerStats ADD COLUMN ${col.name} ${col.type}`);
            } catch (err) {
                // Column already exists, ignore
            }
        }
    }
    
    async close(): Promise<void> {
        await this.db.close();
    }
    

    async query(sql: string, params: Array<any>): Promise<Array<string>> {
        var rows : string[] = [];
        await this.db.each(sql, params, (err: any, row: string) => {
            if (err) {
                throw new Error(err.message);
            }
            rows.push(row);
        });
        return rows;
    }
}

const db_service = new DBService("./app/pokernow-gpt.db");

export default db_service;