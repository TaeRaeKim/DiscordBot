const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleSheetsManager {
    constructor() {
        this.sheets = null;
        this.auth = null;
    }

    async initialize() {
        try {
            const credentialsPath = path.join(process.cwd(), 'credentials.json');

            if (!fs.existsSync(credentialsPath)) {
                throw new Error('credentials.json 파일이 존재하지 않습니다. Google 서비스 계정 인증 정보를 설정해주세요.');
            }

            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            this.sheets = google.sheets({ version: 'v4', auth: this.auth });

            console.log('[GoogleSheets] 구글 시트 API 초기화 완료');
        } catch (error) {
            console.error('[GoogleSheets] 초기화 실패:', error.message);
            throw error;
        }
    }

    async getSheetNameByGid(spreadsheetId, gid) {
        try {
            if (!this.sheets) {
                await this.initialize();
            }

            const response = await this.sheets.spreadsheets.get({
                spreadsheetId
            });

            const sheet = response.data.sheets.find(s => s.properties.sheetId === parseInt(gid));

            if (!sheet) {
                throw new Error(`GID ${gid}에 해당하는 시트를 찾을 수 없습니다.`);
            }

            return sheet.properties.title;
        } catch (error) {
            console.error('[GoogleSheets] 시트 이름 조회 실패:', error.message);
            throw error;
        }
    }

    async getSheetData(spreadsheetId, range) {
        try {
            if (!this.sheets) {
                await this.initialize();
            }

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });

            return response.data.values || [];
        } catch (error) {
            console.error('[GoogleSheets] 데이터 읽기 실패:', error.message);

            if (error.code === 403) {
                throw new Error('권한이 없습니다. 구글 시트를 서비스 계정 이메일과 공유했는지 확인해주세요.');
            } else if (error.code === 404) {
                throw new Error('시트를 찾을 수 없습니다. 스프레드시트 ID와 GID를 확인해주세요.');
            }

            throw error;
        }
    }

    async getMemberNicknames(spreadsheetId, gid, column = 'A', startRow = 1) {
        try {
            const sheetName = await this.getSheetNameByGid(spreadsheetId, gid);
            const range = `'${sheetName}'!${column}:${column}`;

            const data = await this.getSheetData(spreadsheetId, range);

            if (data.length === 0) {
                return [];
            }

            const nicknames = data
                .slice(startRow - 1)
                .map(row => row[0])
                .filter(nickname => nickname && nickname.trim() !== '');

            return nicknames;
        } catch (error) {
            console.error('[GoogleSheets] 멤버 닉네임 추출 실패:', error.message);
            throw error;
        }
    }

    async removeEmptyRows(spreadsheetId, gid, column = 'A', startRow = 1) {
        try {
            const sheetName = await this.getSheetNameByGid(spreadsheetId, gid);
            const range = `'${sheetName}'!${column}:${column}`;

            const data = await this.getSheetData(spreadsheetId, range);

            if (data.length === 0) {
                return { removed: 0, remaining: 0 };
            }

            const validData = [];
            const headerData = data.slice(0, startRow - 1);
            const contentData = data.slice(startRow - 1);

            validData.push(...headerData);

            const filteredContent = contentData.filter(row => row[0] && row[0].trim() !== '');
            validData.push(...filteredContent);

            const removedCount = data.length - validData.length;

            const updateRange = `'${sheetName}'!${column}1:${column}${data.length}`;

            const clearResponse = await this.sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: updateRange
            });

            if (validData.length > 0) {
                const updateResponse = await this.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!${column}1`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: validData
                    }
                });
            }

            return {
                removed: removedCount,
                remaining: filteredContent.length,
                totalRows: validData.length
            };
        } catch (error) {
            console.error('[GoogleSheets] 빈 행 제거 실패:', error.message);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsManager();