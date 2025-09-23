const database = require('../services/database');
const logger = require('./logManager');

// 대기 중인 멤버 데이터 로드 (데이터베이스에서)
async function loadPendingMembers() {
    try {
        const members = await database.getAllPendingMembers();
        const result = {};

        // 기존 JSON 형식과 호환되도록 변환
        members.forEach(member => {
            const key = `${member.discord_user_id}_${member.joined_at}`;
            result[key] = {
                memberId: member.discord_user_id,
                guildId: null, // 기존 코드에서 사용하지 않으므로 null
                joinTime: new Date(member.joined_at).getTime(),
                kickTime: new Date(member.timer_expires_at).getTime(),
                username: member.username
            };
        });

        return result;
    } catch (error) {
        logger.error('대기 멤버 데이터 로드 실패:', error);
        return {};
    }
}

// 대기 중인 멤버 데이터 저장 (데이터베이스에)
async function savePendingMembers(data) {
    try {
        // 기존 모든 pending members 삭제 후 새로 추가
        const existingMembers = await database.getAllPendingMembers();

        // 삭제할 멤버들 찾기 (data에 없는 멤버들)
        const currentKeys = Object.keys(data);
        const currentMemberIds = currentKeys.map(key => data[key].memberId);

        for (const existingMember of existingMembers) {
            if (!currentMemberIds.includes(existingMember.discord_user_id)) {
                await database.deletePendingMember(existingMember.discord_user_id);
            }
        }

        // 새로운 데이터 추가/업데이트
        for (const [key, memberData] of Object.entries(data)) {
            await database.setPendingMember(
                memberData.memberId,
                memberData.username,
                new Date(memberData.joinTime).toISOString(),
                new Date(memberData.kickTime).toISOString()
            );
        }
    } catch (error) {
        logger.error('대기 멤버 데이터 저장 실패:', error);
    }
}

module.exports = {
    loadPendingMembers,
    savePendingMembers
};