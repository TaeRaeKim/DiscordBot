const { google } = require('googleapis');
const path = require('path');

class GoogleGroupsManager {
    constructor() {
        // Admin SDK Directory API for Groups
        this.adminService = google.admin('directory_v1');
    }

    /**
     * 서비스 계정 인증 객체 생성
     * @returns {Promise<Object>} 인증된 auth 객체
     */
    async getServiceAccountAuth() {
        try {
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
            return jwtClient;
        } catch (error) {
            console.error('서비스 계정 인증 오류:', error);
            throw new Error('서비스 계정 인증에 실패했습니다. Domain-wide delegation 설정을 확인해주세요.');
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
            const auth = await this.getServiceAccountAuth();

            // Admin SDK를 사용한 멤버 추가
            const member = {
                email: userEmail,
                role: 'MEMBER',
                type: 'USER'
            };

            const response = await this.adminService.members.insert({
                auth: auth,
                groupKey: groupEmail,
                requestBody: member
            });

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
            const auth = await this.getServiceAccountAuth();

            await this.adminService.members.delete({
                auth: auth,
                groupKey: groupEmail,
                memberKey: userEmail
            });

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