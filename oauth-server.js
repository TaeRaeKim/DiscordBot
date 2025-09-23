require('dotenv').config();
const express = require('express');
const https = require('https');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const database = require('./src/services/database');

const app = express();

const PORT = process.env.OAUTH_PORT || 5948;
const URL = process.env.OAUTH_SERVER_URL || `https://localhost:${PORT}`;

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

        // 데이터베이스에 임시 저장
        if (authData.type === 'user') {
            // 사용자용 OAuth - pending에 저장 (토큰 포함)
            await database.setPendingAuth(
                authData.discordUserId,
                'user',
                email,
                tokens
            );

            resultMessage = '구글 계정 인증이 완료되었습니다. Discord에서 "인증 완료" 버튼을 클릭하여 시트 권한을 받으세요.';
            console.log(`사용자 인증 완료 (대기 중): ${authData.discordUserId} -> ${email}`);
        } else {
            // 관리자용 OAuth - pending에 저장 (토큰 포함)
            await database.setPendingAuth(
                authData.discordUserId,
                'admin',
                email,
                tokens
            );

            resultMessage = '관리자 계정 인증이 완료되었습니다. Discord에서 "인증 완료" 버튼을 클릭하여 관리자 권한을 활성화하세요.';
            console.log(`관리자 인증 완료 (대기 중): ${authData.discordUserId} -> ${email}`);
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
                        Discord로 돌아가서 ${success ? '"인증 완료" 버튼을 클릭하세요' : '관리자에게 문의해주세요'}.<br>
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

    const authUrl = `${URL}/auth/google?state=${state}`;
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

    const authUrl = `${URL}/auth/google/user?state=${state}`;
    res.json({ authUrl });
});

// SSL 인증서 설정
const keyPath = path.join(__dirname, 'ssl', 'private.key');
const certPath = path.join(__dirname, 'ssl', 'certificate.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('❌ SSL 인증서를 찾을 수 없습니다.');
    console.log('다음 명령어로 SSL 인증서를 생성하세요: node generate-ssl.js');
    process.exit(1);
}

const serverOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
};

// HTTPS 서버 시작
https.createServer(serverOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🔒 HTTPS OAuth 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`콜백 URL: ${URL}/callback`);
    console.log('🌐 모든 IP 주소에서 접속 가능합니다.');
    console.log('\n⚠️ 개발용 자체 서명 인증서를 사용 중입니다.');
    console.log('브라우저에서 SSL 경고가 나타날 수 있습니다. "고급" → "안전하지 않음(proceed)" 클릭');
    console.log('\n프로덕션 환경에서는 신뢰할 수 있는 SSL 인증서를 사용하세요.');
});