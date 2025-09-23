const database = require('../services/database');
const logger = require('./logManager');

// 대기 중인 멤버 데이터 로드 (데이터베이스에서)
async function loadPendingMembers(guildId) {
    try {
        const members = await database.getAllPendingMembersForGuild(guildId);
        const result = {};

        // 기존 JSON 형식과 호환되도록 변환
        members.forEach(member => {
            const key = `${member.guild_id}_${member.discord_user_id}`;
            result[key] = {
                memberId: member.discord_user_id,
                guildId: member.guild_id,
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
async function savePendingMembers(guildId, data) {
    try {
        // 해당 길드의 기존 pending members 가져오기
        const existingMembers = await database.getAllPendingMembersForGuild(guildId);

        // 삭제할 멤버들 찾기 (data에 없는 멤버들)
        const currentKeys = Object.keys(data);
        const currentMembers = currentKeys.map(key => {
            const memberData = data[key];
            return `${memberData.guildId}_${memberData.memberId}`;
        });

        for (const existingMember of existingMembers) {
            const existingKey = `${existingMember.guild_id}_${existingMember.discord_user_id}`;
            if (!currentMembers.includes(existingKey)) {
                await database.deletePendingMember(existingMember.guild_id, existingMember.discord_user_id);
            }
        }

        // 새로운 데이터 추가/업데이트
        for (const [key, memberData] of Object.entries(data)) {
            await database.setPendingMember(
                memberData.guildId,
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