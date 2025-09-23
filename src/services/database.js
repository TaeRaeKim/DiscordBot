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
                discord_user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                joined_at DATETIME NOT NULL,
                timer_expires_at DATETIME NOT NULL
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
            )`
        ];

        tables.forEach((createTableSQL, index) => {
            this.db.run(createTableSQL, (err) => {
                if (err) {
                    console.error(`테이블 생성 실패 (${index + 1}):`, err.message);
                } else {
                    console.log(`테이블 생성 성공 (${index + 1}/5)`);
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
    async setPendingMember(discordUserId, username, joinedAt, timerExpiresAt) {
        const sql = `INSERT OR REPLACE INTO pending_members
                     (discord_user_id, username, joined_at, timer_expires_at)
                     VALUES (?, ?, ?, ?)`;
        return this.run(sql, [discordUserId, username, joinedAt, timerExpiresAt]);
    }

    async getPendingMember(discordUserId) {
        const sql = `SELECT * FROM pending_members WHERE discord_user_id = ?`;
        return this.get(sql, [discordUserId]);
    }

    async getAllPendingMembers() {
        const sql = `SELECT * FROM pending_members`;
        return this.all(sql);
    }

    async deletePendingMember(discordUserId) {
        const sql = `DELETE FROM pending_members WHERE discord_user_id = ?`;
        return this.run(sql, [discordUserId]);
    }

    async getPendingMembersCount() {
        const sql = `SELECT COUNT(*) as count FROM pending_members`;
        const result = await this.get(sql);
        return result.count;
    }
}

module.exports = new DatabaseService();