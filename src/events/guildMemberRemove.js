const { loadPendingMembers, savePendingMembers } = require('../utils/dataManager');
const userGoogleAccounts = require('../services/userGoogleAccounts');
const logger = require('../utils/logManager');

module.exports = {
    name: 'guildMemberRemove',
    async execute(client, member) {
        const discordUserId = member.id;
        const userTag = member.user.tag;

        // 1. 대기 목록에서 제거
        const key = `${member.guild.id}_${discordUserId}`;
        const pendingMembers = await loadPendingMembers(member.guild.id);

        if (pendingMembers[key]) {
            delete pendingMembers[key];
            await savePendingMembers(member.guild.id, pendingMembers);
            logger.info(`📤 대기 목록에서 제거: ${userTag}`);
        }

        // 2. 구글 계정 자동 정리
        try {
            const existingAccount = await userGoogleAccounts.getUserAccount(discordUserId);

            if (existingAccount) {
                logger.info(`🔄 서버 탈퇴로 인한 구글 계정 자동 정리 시작: ${userTag} (${existingAccount.google_email})`);

                const removeResult = await userGoogleAccounts.removeUserAccount(
                    discordUserId,
                    `서버 탈퇴로 인한 자동 정리 - ${userTag}`
                );

                if (removeResult.success) {
                    logger.info(`✅ 구글 계정 자동 정리 완료: ${existingAccount.google_email}`);
                } else {
                    logger.error(`❌ 구글 계정 자동 정리 실패: ${existingAccount.google_email} - ${removeResult.error || '알 수 없는 오류'}`);
                }
            }
        } catch (error) {
            logger.error(`❌ 구글 계정 정리 중 오류 발생: ${userTag}`, error);
        }
    }
};