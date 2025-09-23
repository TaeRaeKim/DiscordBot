const fs = require('fs');
const path = require('path');
const googleOAuth = require('./googleOAuth');
const axios = require('axios');

const USER_ACCOUNTS_PATH = path.join(__dirname, '../../user_google_accounts.json');

class UserGoogleAccountsManager {
    constructor() {
        this.loadUserAccounts();
    }

    loadUserAccounts() {
        if (fs.existsSync(USER_ACCOUNTS_PATH)) {
            try {
                const data = fs.readFileSync(USER_ACCOUNTS_PATH, 'utf8');
                this.userAccounts = JSON.parse(data);
            } catch (error) {
                console.error('사용자 계정 파일 로드 오류:', error);
                this.userAccounts = {};
            }
        } else {
            this.userAccounts = {};
        }
    }

    saveUserAccounts() {
        try {
            fs.writeFileSync(USER_ACCOUNTS_PATH, JSON.stringify(this.userAccounts, null, 2));
        } catch (error) {
            console.error('사용자 계정 파일 저장 오류:', error);
            throw new Error('사용자 계정 정보 저장에 실패했습니다.');
        }
    }

    /**
     * 사용자 OAuth 인증 시작
     * @param {string} discordUserId - Discord 사용자 ID
     * @returns {Promise<string>} 인증 URL
     */
    async initiateUserAuth(discordUserId) {
        // 최신 데이터를 다시 로드
        this.loadUserAccounts();

        // 이미 등록된 사용자인지 확인
        if (this.userAccounts[discordUserId]) {
            throw new Error('이미 등록된 사용자입니다. 먼저 기존 계정을 제거해주세요.');
        }

        try {
            // 사용자용 OAuth API 사용 (이메일만)
            const apiKey = process.env.OAUTH_API_KEY || 'your-secret-api-key';
            const oauthServerUrl = process.env.OAUTH_SERVER_URL || 'http://localhost:5948';

            const response = await axios.post(`${oauthServerUrl}/api/auth/initiate/user`, {
                discordUserId,
                apiKey
            });

            return response.data.authUrl;
        } catch (error) {
            console.error('사용자 인증 시작 오류:', error);
            throw new Error('인증 URL 생성에 실패했습니다.');
        }
    }

    /**
     * 사용자의 구글 계정 제거
     * @param {string} discordUserId - Discord 사용자 ID
     * @returns {Promise<boolean>} 성공 여부
     */
    async removeUserAccount(discordUserId) {
        const userAccount = this.userAccounts[discordUserId];

        if (!userAccount) {
            throw new Error('등록된 구글 계정이 없습니다.');
        }

        try {
            // config.json에서 시트 정보 가져오기
            const config = require('../../config.json');

            // 구글 시트에서 권한 제거
            await googleOAuth.removeSheetPermission(
                config.sheetOwnerEmail,
                config.googleSheetId,
                userAccount.googleEmail
            );

            // 로컬 데이터에서 제거
            delete this.userAccounts[discordUserId];
            this.saveUserAccounts();

            return {
                success: true,
                removedEmail: userAccount.googleEmail
            };
        } catch (error) {
            console.error('구글 계정 제거 오류:', error);
            throw new Error(`구글 계정 제거에 실패했습니다: ${error.message}`);
        }
    }

    /**
     * 사용자의 등록된 구글 계정 정보 조회
     * @param {string} discordUserId - Discord 사용자 ID
     * @returns {Object|null} 사용자 계정 정보
     */
    getUserAccount(discordUserId) {
        // 최신 데이터를 다시 로드
        this.loadUserAccounts();
        return this.userAccounts[discordUserId] || null;
    }

    /**
     * 전체 등록된 사용자 수 조회
     * @returns {number} 등록된 사용자 수
     */
    getTotalRegisteredUsers() {
        return Object.keys(this.userAccounts).length;
    }

    /**
     * 특정 이메일이 이미 등록되어 있는지 확인
     * @param {string} googleEmail - 확인할 구글 이메일
     * @returns {boolean} 등록 여부
     */
    isEmailAlreadyRegistered(googleEmail) {
        return Object.values(this.userAccounts).some(
            account => account.googleEmail === googleEmail
        );
    }
}

module.exports = new UserGoogleAccountsManager();