const { google } = require('googleapis');
const path = require('path');

class GoogleGroupsManager {
    constructor() {
        // Admin SDK Directory API for Groups
        this.adminService = google.admin('directory_v1');

        // JWT 토큰 캐싱 변수
        this.jwtClientCache = null;
        this.tokenExpiry = null;
        this.TOKEN_LIFETIME = 55 * 60 * 1000; // 55분 (실제 만료 1시간 전에 갱신)
    }

    /**
     * 서비스 계정 인증 객체 생성 (캐싱 적용)
     * @returns {Promise<Object>} 인증된 auth 객체
     */
    async getServiceAccountAuth() {
        try {
            // 캐시된 토큰이 있고 아직 유효한 경우
            if (this.jwtClientCache && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                console.log('✅ 캐시된 JWT 토큰 사용');
                return this.jwtClientCache;
            }

            console.log('🔄 새 JWT 토큰 생성 중...');

            const credentialsPath = path.join(__dirname, '../../credentials.json');
            const config = require('../../config.json');

            const serviceAccountKey = require(credentialsPath);

            // JWT 인증 사용 (Domain-wide delegation 지원)
            const jwtClient = new google.auth.JWT(
                serviceAccountKey.client_email,
                null,
                serviceAccountKey.private_key,
                [
                    'https://www.googleapis.com/auth/admin.directory.group',
                    'https://www.googleapis.com/auth/admin.directory.group.member'
                ],
                config.domainAdminEmail // Domain-wide delegation을 위한 관리자 이메일
            );

            await jwtClient.authorize();

            // 토큰 캐싱
            this.jwtClientCache = jwtClient;
            this.tokenExpiry = Date.now() + this.TOKEN_LIFETIME;

            console.log(`✅ JWT 토큰 생성 완료 (만료: ${new Date(this.tokenExpiry).toLocaleString('ko-KR')})`);

            return jwtClient;
        } catch (error) {
            console.error('서비스 계정 인증 오류:', error);

            // 캐시 초기화
            this.jwtClientCache = null;
            this.tokenExpiry = null;

            throw new Error('서비스 계정 인증에 실패했습니다. Domain-wide delegation 설정을 확인해주세요.');
        }
    }

    /**
     * 토큰 강제 갱신 (필요시 수동으로 호출)
     */
    async refreshToken() {
        console.log('🔄 JWT 토큰 강제 갱신...');
        this.jwtClientCache = null;
        this.tokenExpiry = null;
        return await this.getServiceAccountAuth();
    }

    /**
     * API 호출을 자동 재시도와 함께 실행
     * @param {Function} apiCall - 실행할 API 호출 함수
     * @param {string} operationName - 작업 이름 (로깅용)
     * @returns {Promise<any>} API 호출 결과
     */
    async executeWithRetry(apiCall, operationName) {
        try {
            // 첫 번째 시도
            return await apiCall();
        } catch (error) {
            const errorCode = error.response?.status || error.code;

            // 401 Unauthorized - 토큰 만료 가능성
            if (errorCode === 401) {
                console.log(`⚠️ ${operationName}: 토큰 만료 감지, 자동 갱신 후 재시도...`);

                try {
                    // 토큰 갱신
                    await this.refreshToken();

                    // 재시도
                    return await apiCall();
                } catch (retryError) {
                    console.error(`❌ ${operationName}: 토큰 갱신 후 재시도 실패`);
                    throw retryError;
                }
            }

            // 다른 에러는 그대로 전달
            throw error;
        }
    }

    /**
     * 사용자를 Google Group에 추가
     * @param {string} userEmail - 추가할 사용자 이메일
     * @param {string} groupEmail - Google Group 이메일 주소
     * @returns {Promise<Object>} 결과 객체
     */
    async addMemberToGroup(userEmail, groupEmail) {
        try {
            // 자동 재시도 로직과 함께 실행
            const response = await this.executeWithRetry(async () => {
                const auth = await this.getServiceAccountAuth();

                // Admin SDK를 사용한 멤버 추가
                const member = {
                    email: userEmail,
                    role: 'MEMBER',
                    type: 'USER'
                };

                return await this.adminService.members.insert({
                    auth: auth,
                    groupKey: groupEmail,
                    requestBody: member
                });
            }, `그룹 멤버 추가 (${userEmail})`);

            console.log(`사용자 ${userEmail}을(를) 그룹 ${groupEmail}에 추가했습니다.`);

            return {
                success: true,
                member: response.data
            };
        } catch (error) {
            // 에러 타입에 따른 간결한 로깅
            const errorCode = error.response?.status || error.code;
            const errorType = this.getErrorType(errorCode);

            console.error(`❌ Google Groups API 오류 [${errorCode}]: ${userEmail} - ${errorType}`);

            // 특정 에러 코드 처리
            if (errorCode === 409) {
                console.log(`⚠️ ${userEmail}은(는) 이미 그룹의 멤버입니다.`);
                return {
                    success: true,
                    alreadyMember: true
                };
            } else if (errorCode === 404) {
                throw new Error('그룹을 찾을 수 없습니다. 그룹 이메일을 확인해주세요.');
            } else if (errorCode === 403) {
                throw new Error('그룹 관리 권한이 없습니다. Domain-wide delegation 설정을 확인해주세요.');
            } else if (errorCode === 502) {
                throw new Error('Google 서버 일시 오류 (502). 잠시 후 다시 시도해주세요.');
            } else if (errorCode === 503) {
                throw new Error('Google 서비스 일시 불가 (503). 잠시 후 다시 시도해주세요.');
            }

            // 일반 에러 - HTML 응답 정리
            const cleanErrorMessage = this.cleanErrorMessage(error.message);
            throw new Error(`그룹 멤버 추가 실패: ${cleanErrorMessage}`);
        }
    }

    /**
     * 사용자를 Google Group에서 제거
     * @param {string} userEmail - 제거할 사용자 이메일
     * @param {string} groupEmail - Google Group 이메일 주소
     * @returns {Promise<Object>} 결과 객체
     */
    async removeMemberFromGroup(userEmail, groupEmail) {
        try {
            // 자동 재시도 로직과 함께 실행
            await this.executeWithRetry(async () => {
                const auth = await this.getServiceAccountAuth();

                return await this.adminService.members.delete({
                    auth: auth,
                    groupKey: groupEmail,
                    memberKey: userEmail
                });
            }, `그룹 멤버 제거 (${userEmail})`);

            console.log(`사용자 ${userEmail}을(를) 그룹 ${groupEmail}에서 제거했습니다.`);

            return {
                success: true,
                removedEmail: userEmail
            };
        } catch (error) {
            console.error('Google Group 멤버 제거 오류:', error);

            if (error.code === 404) {
                // 멤버가 아닌 경우도 성공으로 처리
                console.log(`${userEmail}은(는) ${groupEmail} 그룹의 멤버가 아닙니다.`);
                return {
                    success: true,
                    notMember: true
                };
            } else if (error.code === 403) {
                throw new Error('그룹 관리 권한이 없습니다. 서비스 계정이 그룹 관리자인지 확인해주세요.');
            }

            throw new Error(`그룹 멤버 제거 실패: ${error.message}`);
        }
    }

    /**
     * 에러 타입 분류
     */
    getErrorType(errorCode) {
        switch (errorCode) {
            case 400: return 'Bad Request';
            case 401: return 'Unauthorized';
            case 403: return 'Forbidden';
            case 404: return 'Not Found';
            case 409: return 'Already Member';
            case 429: return 'Rate Limited';
            case 500: return 'Server Error';
            case 502: return 'Bad Gateway';
            case 503: return 'Service Unavailable';
            default: return 'Unknown Error';
        }
    }

    /**
     * 에러 메시지 정리 (HTML 제거)
     */
    cleanErrorMessage(message) {
        if (!message) return 'Unknown error';

        // HTML 태그가 포함된 경우 (502, 503 에러 등)
        if (message.includes('<!DOCTYPE html>')) {
            if (message.includes('502')) return 'Google 서버 일시 오류 (502)';
            if (message.includes('503')) return 'Google 서비스 일시 불가 (503)';
            if (message.includes('500')) return 'Google 서버 내부 오류 (500)';
            return 'Google 서버 오류';
        }

        // 일반 에러 메시지는 앞 100자만 유지
        return message.length > 100 ? message.substring(0, 100) + '...' : message;
    }
}

module.exports = new GoogleGroupsManager();