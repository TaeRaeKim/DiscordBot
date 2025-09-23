const googleOAuth = require('./googleOAuth');
const axios = require('axios');
const database = require('./database');

class UserGoogleAccountsManager {
    constructor() {
        // DB 사용으로 변경, 별도 초기화 불필요
    }

    /**
     * 사용자 OAuth 인증 시작
     * @param {string} discordUserId - Discord 사용자 ID
     * @returns {Promise<string>} 인증 URL
     */
    async initiateUserAuth(discordUserId) {
        // 이미 등록된 사용자인지 확인
        const existingAccount = await database.getUserGoogleAccount(discordUserId);
        if (existingAccount) {
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
        const userAccount = await database.getUserGoogleAccount(discordUserId);

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
                userAccount.google_email
            );

            // 데이터베이스에서 제거 (외래키 제약조건 때문에 user_tokens 먼저 삭제)
            await database.deleteUserToken(userAccount.google_email);
            await database.deleteUserGoogleAccount(discordUserId);

            return {
                success: true,
                removedEmail: userAccount.google_email
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
    async getUserAccount(discordUserId) {
        return await database.getUserGoogleAccount(discordUserId);
    }

    /**
     * 전체 등록된 사용자 수 조회
     * @returns {Promise<number>} 등록된 사용자 수
     */
    async getTotalRegisteredUsers() {
        const accounts = await database.all('SELECT COUNT(*) as count FROM user_google_accounts');
        return accounts[0].count;
    }

    /**
     * 특정 이메일이 이미 등록되어 있는지 확인
     * @param {string} googleEmail - 확인할 구글 이메일
     * @returns {Promise<boolean>} 등록 여부
     */
    async isEmailAlreadyRegistered(googleEmail) {
        const account = await database.get(
            'SELECT discord_user_id FROM user_google_accounts WHERE google_email = ?',
            [googleEmail]
        );
        return !!account;
    }
}

module.exports = new UserGoogleAccountsManager();