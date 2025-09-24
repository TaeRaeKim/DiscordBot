const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../database.sqlite');
        this.init();
    }

    init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('데이터베이스 연결 실패:', err.message);
                process.exit(1);
            } else {
                console.log('SQLite 데이터베이스 연결 성공:', this.dbPath);
                this.createTables();
            }
        });

        // 외래키 제약조건 활성화
        this.db.run("PRAGMA foreign_keys = ON");
    }

    createTables() {
        const tables = [
            // pending_auth 테이블
            `CREATE TABLE IF NOT EXISTS pending_auth (
                discord_user_id TEXT PRIMARY KEY,
                type TEXT NOT NULL CHECK(type IN ('user', 'admin')),
                google_email TEXT NOT NULL,
                tokens TEXT NOT NULL,
                authenticated_at DATETIME NOT NULL
            )`,

            // pending_members 테이블
            `CREATE TABLE IF NOT EXISTS pending_members (
                guild_id TEXT NOT NULL,
                discord_user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                joined_at DATETIME NOT NULL,
                timer_expires_at DATETIME NOT NULL,
                PRIMARY KEY (guild_id, discord_user_id)
            )`,

            // admin_tokens 테이블
            `CREATE TABLE IF NOT EXISTS admin_tokens (
                google_email TEXT PRIMARY KEY,
                discord_user_id TEXT NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                token_type TEXT NOT NULL,
                expiry_date INTEGER,
                scope TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // user_google_accounts 테이블
            `CREATE TABLE IF NOT EXISTS user_google_accounts (
                discord_user_id TEXT PRIMARY KEY,
                google_email TEXT NOT NULL UNIQUE,
                registered_at DATETIME NOT NULL
            )`,

            // user_tokens 테이블
            `CREATE TABLE IF NOT EXISTS user_tokens (
                google_email TEXT PRIMARY KEY,
                discord_user_id TEXT NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                token_type TEXT NOT NULL,
                expiry_date INTEGER,
                scope TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (discord_user_id) REFERENCES user_google_accounts(discord_user_id)
            )`,

            // account_history 테이블
            `CREATE TABLE IF NOT EXISTS account_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_user_id TEXT NOT NULL,
                google_email TEXT NOT NULL,
                action TEXT NOT NULL CHECK(action IN ('REGISTER', 'REMOVE')),
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            )`
        ];

        tables.forEach((createTableSQL, index) => {
            this.db.run(createTableSQL, (err) => {
                if (err) {
                    console.error(`테이블 생성 실패 (${index + 1}):`, err.message);
                } else {
                    console.log(`테이블 생성 성공 (${index + 1}/6)`);
                }
            });
        });

        // 성능 향상을 위한 인덱스 생성
        this.createIndexes();
    }

    createIndexes() {
        const indexes = [
            // user_google_accounts 테이블 인덱스
            'CREATE INDEX IF NOT EXISTS idx_user_google_accounts_email ON user_google_accounts(google_email)',

            // user_tokens 테이블 인덱스
            'CREATE INDEX IF NOT EXISTS idx_user_tokens_discord_id ON user_tokens(discord_user_id)',

            // admin_tokens 테이블 인덱스
            'CREATE INDEX IF NOT EXISTS idx_admin_tokens_discord_id ON admin_tokens(discord_user_id)',

            // pending_members 테이블 인덱스
            'CREATE INDEX IF NOT EXISTS idx_pending_members_guild ON pending_members(guild_id)',
            'CREATE INDEX IF NOT EXISTS idx_pending_members_expires ON pending_members(timer_expires_at)',

            // account_history 테이블 인덱스 (가장 중요 - 조회 성능)
            'CREATE INDEX IF NOT EXISTS idx_account_history_discord_user ON account_history(discord_user_id)',
            'CREATE INDEX IF NOT EXISTS idx_account_history_email ON account_history(google_email)',
            'CREATE INDEX IF NOT EXISTS idx_account_history_timestamp ON account_history(timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_account_history_action ON account_history(action)',

            // 복합 인덱스 - 히스토리 조회 최적화
            'CREATE INDEX IF NOT EXISTS idx_account_history_user_time ON account_history(discord_user_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_account_history_email_time ON account_history(google_email, timestamp DESC)'
        ];

        indexes.forEach((createIndexSQL, index) => {
            this.db.run(createIndexSQL, (err) => {
                if (err) {
                    console.error(`인덱스 생성 실패 (${index + 1}):`, err.message);
                } else {
                    console.log(`인덱스 생성 성공 (${index + 1}/${indexes.length})`);
                }
            });
        });
    }

    // Promise 기반 쿼리 실행
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // 트랜잭션 지원
    async transaction(queries) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run("BEGIN TRANSACTION");

                let completed = 0;
                let results = [];

                queries.forEach((query, index) => {
                    const { sql, params = [] } = query;

                    this.db.run(sql, params, function(err) {
                        if (err) {
                            this.db.run("ROLLBACK");
                            reject(err);
                            return;
                        }

                        results[index] = { id: this.lastID, changes: this.changes };
                        completed++;

                        if (completed === queries.length) {
                            this.db.run("COMMIT", (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(results);
                                }
                            });
                        }
                    });
                });
            });
        });
    }

    // 연결 종료
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('데이터베이스 연결 종료');
                    resolve();
                }
            });
        });
    }

    // Pending Auth 관련 메소드들
    async setPendingAuth(discordUserId, type, googleEmail, tokens) {
        const sql = `INSERT OR REPLACE INTO pending_auth
                     (discord_user_id, type, google_email, tokens, authenticated_at)
                     VALUES (?, ?, ?, ?, ?)`;
        return this.run(sql, [
            discordUserId,
            type,
            googleEmail,
            JSON.stringify(tokens),
            new Date().toISOString()
        ]);
    }

    async getPendingAuth(discordUserId) {
        const sql = `SELECT * FROM pending_auth WHERE discord_user_id = ?`;
        const row = await this.get(sql, [discordUserId]);
        if (row) {
            row.tokens = JSON.parse(row.tokens);
        }
        return row;
    }

    async deletePendingAuth(discordUserId) {
        const sql = `DELETE FROM pending_auth WHERE discord_user_id = ?`;
        return this.run(sql, [discordUserId]);
    }

    // Admin Tokens 관련 메소드들
    async setAdminToken(googleEmail, discordUserId, tokens) {
        const sql = `INSERT OR REPLACE INTO admin_tokens
                     (google_email, discord_user_id, access_token, refresh_token,
                      token_type, expiry_date, scope, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        return this.run(sql, [
            googleEmail,
            discordUserId,
            tokens.access_token,
            tokens.refresh_token,
            tokens.token_type,
            tokens.expiry_date,
            tokens.scope,
            new Date().toISOString()
        ]);
    }

    async getAllAdminTokens() {
        const sql = `SELECT * FROM admin_tokens`;
        const rows = await this.all(sql);
        const result = {};
        rows.forEach(row => {
            result[row.google_email] = {
                tokens: {
                    access_token: row.access_token,
                    refresh_token: row.refresh_token,
                    token_type: row.token_type,
                    expiry_date: row.expiry_date,
                    scope: row.scope
                },
                discordUserId: row.discord_user_id
            };
        });
        return result;
    }

    async deleteAdminToken(googleEmail) {
        const sql = `DELETE FROM admin_tokens WHERE google_email = ?`;
        return this.run(sql, [googleEmail]);
    }

    // User Google Accounts 관련 메소드들
    async setUserGoogleAccount(discordUserId, googleEmail) {
        const sql = `INSERT OR REPLACE INTO user_google_accounts
                     (discord_user_id, google_email, registered_at)
                     VALUES (?, ?, ?)`;
        return this.run(sql, [discordUserId, googleEmail, new Date().toISOString()]);
    }

    async getUserGoogleAccount(discordUserId) {
        const sql = `SELECT * FROM user_google_accounts WHERE discord_user_id = ?`;
        return this.get(sql, [discordUserId]);
    }

    async deleteUserGoogleAccount(discordUserId) {
        const sql = `DELETE FROM user_google_accounts WHERE discord_user_id = ?`;
        return this.run(sql, [discordUserId]);
    }

    // User Tokens 관련 메소드들
    async setUserToken(googleEmail, discordUserId, tokens) {
        const sql = `INSERT OR REPLACE INTO user_tokens
                     (google_email, discord_user_id, access_token, refresh_token,
                      token_type, expiry_date, scope, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        return this.run(sql, [
            googleEmail,
            discordUserId,
            tokens.access_token,
            tokens.refresh_token,
            tokens.token_type,
            tokens.expiry_date,
            tokens.scope,
            new Date().toISOString()
        ]);
    }

    async deleteUserToken(googleEmail) {
        const sql = `DELETE FROM user_tokens WHERE google_email = ?`;
        return this.run(sql, [googleEmail]);
    }

    // Pending Members 관련 메소드들
    async setPendingMember(guildId, discordUserId, username, joinedAt, timerExpiresAt) {
        const sql = `INSERT OR REPLACE INTO pending_members
                     (guild_id, discord_user_id, username, joined_at, timer_expires_at)
                     VALUES (?, ?, ?, ?, ?)`;
        return this.run(sql, [guildId, discordUserId, username, joinedAt, timerExpiresAt]);
    }

    async getPendingMember(guildId, discordUserId) {
        const sql = `SELECT * FROM pending_members WHERE guild_id = ? AND discord_user_id = ?`;
        return this.get(sql, [guildId, discordUserId]);
    }

    async getAllPendingMembers() {
        const sql = `SELECT * FROM pending_members`;
        return this.all(sql);
    }

    async deletePendingMember(guildId, discordUserId) {
        const sql = `DELETE FROM pending_members WHERE guild_id = ? AND discord_user_id = ?`;
        return this.run(sql, [guildId, discordUserId]);
    }

    async getPendingMembersCount(guildId) {
        const sql = `SELECT COUNT(*) as count FROM pending_members WHERE guild_id = ?`;
        const result = await this.get(sql, [guildId]);
        return result.count;
    }

    async getAllPendingMembersForGuild(guildId) {
        const sql = `SELECT * FROM pending_members WHERE guild_id = ?`;
        return this.all(sql, [guildId]);
    }

    // Account History 관련 메소드들
    async addAccountHistory(discordUserId, googleEmail, action, notes = null) {
        const sql = `INSERT INTO account_history
                     (discord_user_id, google_email, action, notes)
                     VALUES (?, ?, ?, ?)`;
        return this.run(sql, [discordUserId, googleEmail, action, notes]);
    }

    async getAccountHistoryByDiscordUser(discordUserId) {
        const sql = `SELECT * FROM account_history
                     WHERE discord_user_id = ?
                     ORDER BY timestamp DESC`;
        return this.all(sql, [discordUserId]);
    }

    async getAccountHistoryByEmail(googleEmail) {
        const sql = `SELECT * FROM account_history
                     WHERE LOWER(google_email) = ?
                     ORDER BY timestamp DESC`;
        return this.all(sql, [googleEmail.toLowerCase()]);
    }

    async getAllAccountHistory() {
        const sql = `SELECT * FROM account_history ORDER BY timestamp DESC`;
        return this.all(sql);
    }
}

module.exports = new DatabaseService();