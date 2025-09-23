const { loadPendingMembers, savePendingMembers } = require('../utils/dataManager');
const logger = require('../utils/logManager');

module.exports = {
    name: 'guildMemberRemove',
    async execute(client, member) {
        const key = `${member.guild.id}_${member.id}`;
        const pendingMembers = await loadPendingMembers(member.guild.id);

        if (pendingMembers[key]) {
            delete pendingMembers[key];
            await savePendingMembers(member.guild.id, pendingMembers);
            logger.info(`📤 대기 목록에서 제거: ${member.user.tag}`);
        }
    }
};