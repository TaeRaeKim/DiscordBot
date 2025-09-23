require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 5948;

const TOKEN_PATH = path.join(__dirname, 'tokens.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials_oauth2.json');

const authStates = new Map();

function createOAuth2Client() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web;
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

// 관리자용 OAuth (전체 권한)
app.get('/auth/google', (req, res) => {
    const { state } = req.query;

    if (!state || !authStates.has(state)) {
        return res.status(400).send('유효하지 않은 인증 요청입니다.');
    }

    const oAuth2Client = createOAuth2Client();

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/userinfo.email'
        ],
        prompt: 'consent',
        state: state
    });

    res.redirect(authUrl);
});

// 사용자용 OAuth (이메일만)
app.get('/auth/google/user', (req, res) => {
    const { state } = req.query;

    if (!state || !authStates.has(state)) {
        return res.status(400).send('유효하지 않은 인증 요청입니다.');
    }

    const oAuth2Client = createOAuth2Client();

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/userinfo.email'
        ],
        prompt: 'consent',
        state: state
    });

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('인증 코드가 없습니다.');
    }

    if (!state || !authStates.has(state)) {
        return res.status(400).send('유효하지 않은 상태값입니다.');
    }

    const authData = authStates.get(state);
    const oAuth2Client = createOAuth2Client();

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // 사용자 이메일 정보 가져오기
        const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        let resultMessage = '';
        let success = true;

        // 사용자용 OAuth인 경우 자동으로 시트 권한 부여
        if (authData.type === 'user') {
            try {
                const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
                const googleOAuth = require('./src/services/googleOAuth');
                const userGoogleAccounts = require('./src/services/userGoogleAccounts');

                // 시트에 편집자 권한 추가
                await googleOAuth.shareSheetWithUser(
                    config.sheetOwnerEmail,
                    config.googleSheetId,
                    email
                );

                // 사용자 정보 로컬 저장
                const userAccountsPath = path.join(__dirname, 'user_google_accounts.json');
                let userAccounts = {};
                if (fs.existsSync(userAccountsPath)) {
                    userAccounts = JSON.parse(fs.readFileSync(userAccountsPath, 'utf8'));
                }
                userAccounts[authData.discordUserId] = {
                    googleEmail: email,
                    registeredAt: new Date().toISOString()
                };
                fs.writeFileSync(userAccountsPath, JSON.stringify(userAccounts, null, 2));

                resultMessage = '구글 시트 편집 권한이 자동으로 부여되었습니다.';
                console.log(`사용자 계정 등록 완료: ${authData.discordUserId} -> ${email}`);
            } catch (error) {
                console.error('시트 권한 부여 오류:', error);
                resultMessage = '이메일 인증은 성공했지만 시트 권한 부여에 실패했습니다.';
                success = false;
            }
        } else {
            // 관리자용 OAuth - 자동 처리
            try {
                const googleOAuth = require('./src/services/googleOAuth');

                // 관리자 토큰 저장
                await googleOAuth.saveTokens(email, tokens, authData.discordUserId);

                resultMessage = '관리자 계정 인증이 완료되었습니다. 이제 소유자 권한으로 시트를 관리할 수 있습니다.';
                console.log(`관리자 계정 등록 완료: ${authData.discordUserId} -> ${email}`);
            } catch (error) {
                console.error('관리자 계정 저장 오류:', error);
                resultMessage = '이메일 인증은 성공했지만 관리자 계정 저장에 실패했습니다.';
                success = false;
            }
        }

        authStates.delete(state);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>인증 완료</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 2rem 3rem;
                        border-radius: 12px;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                        text-align: center;
                        max-width: 400px;
                    }
                    .success-icon {
                        font-size: 4rem;
                        margin-bottom: 1rem;
                    }
                    h1 {
                        color: #333;
                        margin-bottom: 0.5rem;
                    }
                    p {
                        color: #666;
                        line-height: 1.6;
                    }
                    .close-note {
                        margin-top: 2rem;
                        padding: 1rem;
                        background: #f8f9fa;
                        border-radius: 8px;
                        color: #495057;
                        font-size: 0.9rem;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-icon">${success ? '✅' : '⚠️'}</div>
                    <h1>${success ? '인증 완료!' : '인증 완료 (부분 오류)'}</h1>
                    <p><strong>${email}</strong> 계정 인증이 완료되었습니다.</p>
                    <div class="result-message" style="margin: 1rem 0; padding: 1rem; background: ${success ? '#d4edda' : '#f8d7da'}; border-radius: 8px; color: ${success ? '#155724' : '#721c24'}; border: 1px solid ${success ? '#c3e6cb' : '#f5c6cb'};">
                        ${resultMessage}
                    </div>
                    <div class="close-note">
                        Discord로 돌아가서 ${success ? '시트를 확인해보세요' : '관리자에게 문의해주세요'}.<br>
                        이 창은 안전하게 닫으셔도 됩니다.
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('토큰 교환 중 오류:', error);
        res.status(500).send('인증 처리 중 오류가 발생했습니다.');
    }
});

// 관리자용 OAuth 초기화
app.post('/api/auth/initiate', express.json(), (req, res) => {
    const { discordUserId, apiKey } = req.body;

    const expectedApiKey = process.env.OAUTH_API_KEY || 'your-secret-api-key';
    if (apiKey !== expectedApiKey) {
        return res.status(401).json({ error: '유효하지 않은 API 키입니다.' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    authStates.set(state, { discordUserId, type: 'admin' });

    setTimeout(() => {
        authStates.delete(state);
    }, 600000);

    const authUrl = `http://localhost:${PORT}/auth/google?state=${state}`;
    res.json({ authUrl });
});

// 사용자용 OAuth 초기화 (이메일만)
app.post('/api/auth/initiate/user', express.json(), (req, res) => {
    const { discordUserId, apiKey } = req.body;

    const expectedApiKey = process.env.OAUTH_API_KEY || 'your-secret-api-key';
    if (apiKey !== expectedApiKey) {
        return res.status(401).json({ error: '유효하지 않은 API 키입니다.' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    authStates.set(state, { discordUserId, type: 'user' });

    setTimeout(() => {
        authStates.delete(state);
    }, 600000);

    const authUrl = `http://localhost:${PORT}/auth/google/user?state=${state}`;
    res.json({ authUrl });
});

app.listen(PORT, () => {
    console.log(`OAuth 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`콜백 URL: http://localhost:${PORT}/callback`);
    console.log('\n⚠️  프로덕션 환경에서는 다음 설정이 필요합니다:');
    console.log('1. Google Cloud Console에서 리다이렉트 URI 설정');
    console.log('2. 공개 도메인 설정 (예: https://yourdomain.com/callback)');
    console.log('3. HTTPS 적용');
});