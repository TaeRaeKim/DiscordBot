require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email'
];
const TOKEN_PATH = path.join(__dirname, '../../tokens.json');

class GoogleOAuthService {
    constructor() {
        this.oAuth2Clients = new Map();
        this.loadTokens();
    }

    loadTokens() {
        if (fs.existsSync(TOKEN_PATH)) {
            const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            Object.entries(tokens).forEach(([email, tokenData]) => {
                const oAuth2Client = this.createOAuth2Client();
                oAuth2Client.setCredentials(tokenData.tokens);
                this.oAuth2Clients.set(email, {
                    client: oAuth2Client,
                    discordUserId: tokenData.discordUserId
                });
            });
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

    saveTokens(email, tokens, discordUserId) {
        let allTokens = {};
        if (fs.existsSync(TOKEN_PATH)) {
            allTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        }
        allTokens[email] = { tokens, discordUserId };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(allTokens, null, 2));
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
            throw new Error('시트 공유에 실패했습니다.');
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
            throw new Error('권한 제거에 실패했습니다.');
        }
    }

}

module.exports = new GoogleOAuthService();