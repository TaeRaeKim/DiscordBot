const fs = require('fs');
const { PENDING_FILE } = require('./constants');
const logger = require('./logManager');

// 대기 중인 멤버 데이터 로드
function loadPendingMembers() {
    try {
        if (fs.existsSync(PENDING_FILE)) {
            const data = fs.readFileSync(PENDING_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('대기 멤버 데이터 로드 실패:', error);
    }
    return {};
}

// 대기 중인 멤버 데이터 저장
function savePendingMembers(data) {
    try {
        fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('대기 멤버 데이터 저장 실패:', error);
    }
}

module.exports = {
    loadPendingMembers,
    savePendingMembers
};