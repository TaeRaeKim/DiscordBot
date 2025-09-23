require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const database = require('./database');

const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email'
];

class GoogleOAuthService {
    constructor() {
        this.oAuth2Clients = new Map();
        this.loadTokens();
    }

    async loadTokens() {
        try {
            const tokens = await database.getAllAdminTokens();
            Object.entries(tokens).forEach(([email, tokenData]) => {
                const oAuth2Client = this.createOAuth2Client();
                oAuth2Client.setCredentials(tokenData.tokens);
                this.oAuth2Clients.set(email, {
                    client: oAuth2Client,
                    discordUserId: tokenData.discordUserId
                });
            });
        } catch (error) {
            console.error('토큰 로드 오류:', error);
        }
    }


    createOAuth2Client() {
        const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../../credentials_oauth2.json'), 'utf8'));
        const { client_secret, client_id, redirect_uris } = credentials.web;
        return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    }

    async initiateAuth(email, discordUserId) {
        try {
            const apiKey = process.env.OAUTH_API_KEY || 'your-secret-api-key';
            const oauthServerUrl = process.env.OAUTH_SERVER_URL || 'http://localhost:5948';

            const response = await axios.post(`${oauthServerUrl}/api/auth/initiate`, {
                discordUserId,
                apiKey
            }, {
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });

            return response.data.authUrl;
        } catch (error) {
            console.error('OAuth 서버 연결 오류:', error);
            throw new Error('인증 URL 생성에 실패했습니다.');
        }
    }

    async completeAuth(discordUserId, authCode) {
        // 더 이상 사용되지 않는 메서드 - 자동 처리로 변경됨
        throw new Error('이 메서드는 더 이상 사용되지 않습니다. OAuth 인증이 자동으로 처리됩니다.');
    }

    async saveTokens(email, tokens, discordUserId) {
        try {
            await database.setAdminToken(email, discordUserId, tokens);

            // 메모리에도 업데이트
            const oAuth2Client = this.createOAuth2Client();
            oAuth2Client.setCredentials(tokens);
            this.oAuth2Clients.set(email, {
                client: oAuth2Client,
                discordUserId: discordUserId
            });
        } catch (error) {
            console.error('토큰 저장 오류:', error);
            throw error;
        }
    }

    async refreshTokenForUser(email) {
        const authData = this.oAuth2Clients.get(email);
        if (!authData) {
            throw new Error('사용자 인증 정보를 찾을 수 없습니다.');
        }

        const authClient = authData.client;

        try {
            // 현재 토큰 정보 가져오기
            const credentials = authClient.credentials;
            if (!credentials.refresh_token) {
                throw new Error('리프레시 토큰이 없습니다. 재인증이 필요합니다.');
            }

            // 토큰 갱신
            const { credentials: newCredentials } = await authClient.refreshAccessToken();

            // 새 토큰으로 클라이언트 업데이트
            authClient.setCredentials(newCredentials);

            // 메모리의 클라이언트 맵 업데이트
            this.oAuth2Clients.set(email, {
                client: authClient,
                discordUserId: authData.discordUserId
            });

            // 데이터베이스에 새 토큰 저장
            await this.saveTokens(email, newCredentials, authData.discordUserId);

            console.log(`토큰 갱신 성공: ${email}`);
            return true;
        } catch (error) {
            console.error(`토큰 갱신 실패 (${email}):`, error);
            throw new Error('토큰 갱신에 실패했습니다. 재인증이 필요합니다.');
        }
    }

    getAuthClient(email) {
        const authData = this.oAuth2Clients.get(email);
        return authData ? authData.client : null;
    }

    async shareSheetWithUser(ownerEmail, sheetId, targetEmail) {
        const authClient = this.getAuthClient(ownerEmail);
        if (!authClient) {
            throw new Error('소유자 계정이 인증되지 않았습니다.');
        }

        const drive = google.drive({ version: 'v3', auth: authClient });

        try {
            await drive.permissions.create({
                fileId: sheetId,
                requestBody: {
                    type: 'user',
                    role: 'writer',
                    emailAddress: targetEmail
                },
                sendNotificationEmail: true
            });
            return true;
        } catch (error) {
            console.error('시트 공유 중 오류:', error);

            // 토큰 만료 오류인지 확인 (401 Unauthorized)
            if (error.code === 401 || error.status === 401) {
                console.log('토큰 만료 감지, 자동 갱신 시도...');

                try {
                    // 토큰 자동 갱신
                    await this.refreshTokenForUser(ownerEmail);

                    // 갱신된 토큰으로 재시도
                    const refreshedAuthClient = this.getAuthClient(ownerEmail);
                    const refreshedDrive = google.drive({ version: 'v3', auth: refreshedAuthClient });

                    await refreshedDrive.permissions.create({
                        fileId: sheetId,
                        requestBody: {
                            type: 'user',
                            role: 'writer',
                            emailAddress: targetEmail
                        },
                        sendNotificationEmail: true
                    });

                    console.log('토큰 갱신 후 시트 공유 성공');
                    return true;
                } catch (refreshError) {
                    console.error('토큰 갱신 후 재시도 실패:', refreshError);
                    throw new Error('관리자 토큰이 만료되었습니다. 관리자에게 재인증을 요청해주세요.');
                }
            } else {
                throw new Error('시트 공유에 실패했습니다.');
            }
        }
    }

    async removeSheetPermission(ownerEmail, sheetId, targetEmail) {
        const authClient = this.getAuthClient(ownerEmail);
        if (!authClient) {
            throw new Error('소유자 계정이 인증되지 않았습니다.');
        }

        const drive = google.drive({ version: 'v3', auth: authClient });

        try {
            const response = await drive.permissions.list({
                fileId: sheetId,
                fields: 'permissions(id,emailAddress)'
            });

            const permission = response.data.permissions.find(p => p.emailAddress === targetEmail);
            if (permission) {
                await drive.permissions.delete({
                    fileId: sheetId,
                    permissionId: permission.id
                });
            }
            return true;
        } catch (error) {
            console.error('권한 제거 중 오류:', error);

            // 토큰 만료 오류인지 확인 (401 Unauthorized)
            if (error.code === 401 || error.status === 401) {
                console.log('토큰 만료 감지, 자동 갱신 시도...');

                try {
                    // 토큰 자동 갱신
                    await this.refreshTokenForUser(ownerEmail);

                    // 갱신된 토큰으로 재시도
                    const refreshedAuthClient = this.getAuthClient(ownerEmail);
                    const refreshedDrive = google.drive({ version: 'v3', auth: refreshedAuthClient });

                    const refreshedResponse = await refreshedDrive.permissions.list({
                        fileId: sheetId,
                        fields: 'permissions(id,emailAddress)'
                    });

                    const refreshedPermission = refreshedResponse.data.permissions.find(p => p.emailAddress === targetEmail);
                    if (refreshedPermission) {
                        await refreshedDrive.permissions.delete({
                            fileId: sheetId,
                            permissionId: refreshedPermission.id
                        });
                    }

                    console.log('토큰 갱신 후 권한 제거 성공');
                    return true;
                } catch (refreshError) {
                    console.error('토큰 갱신 후 재시도 실패:', refreshError);
                    throw new Error('관리자 토큰이 만료되었습니다. 관리자에게 재인증을 요청해주세요.');
                }
            } else {
                throw new Error('권한 제거에 실패했습니다.');
            }
        }
    }

    async shareMultipleSheetsWithUser(ownerEmail, targetEmail, config) {
        const results = [];
        const errors = [];

        for (const sheet of config.googleSheets) {
            try {
                await this.shareSheetWithUser(ownerEmail, sheet.sheetId, targetEmail);
                results.push({
                    name: sheet.name,
                    sheetId: sheet.sheetId,
                    success: true,
                    description: sheet.description
                });
                console.log(`✅ 시트 권한 부여 성공: ${sheet.name} (${targetEmail})`);
            } catch (error) {
                console.error(`❌ 시트 권한 부여 실패: ${sheet.name}`, error);
                errors.push({
                    name: sheet.name,
                    sheetId: sheet.sheetId,
                    success: false,
                    error: error.message,
                    description: sheet.description
                });
            }
        }

        return {
            results,
            errors,
            totalSheets: config.googleSheets.length,
            successCount: results.length,
            errorCount: errors.length
        };
    }

    async removeMultipleSheetsPermission(ownerEmail, targetEmail, config) {
        const results = [];
        const errors = [];

        for (const sheet of config.googleSheets) {
            try {
                await this.removeSheetPermission(ownerEmail, sheet.sheetId, targetEmail);
                results.push({
                    name: sheet.name,
                    sheetId: sheet.sheetId,
                    success: true,
                    description: sheet.description
                });
                console.log(`✅ 시트 권한 제거 성공: ${sheet.name} (${targetEmail})`);
            } catch (error) {
                console.error(`❌ 시트 권한 제거 실패: ${sheet.name}`, error);
                errors.push({
                    name: sheet.name,
                    sheetId: sheet.sheetId,
                    success: false,
                    error: error.message,
                    description: sheet.description
                });
            }
        }

        return {
            results,
            errors,
            totalSheets: config.googleSheets.length,
            successCount: results.length,
            errorCount: errors.length
        };
    }

}

module.exports = new GoogleOAuthService();