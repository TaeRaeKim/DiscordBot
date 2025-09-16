const logger = require('../utils/logManager');
const config = require('../../config.json');
const { ChannelType } = require('discord.js');

module.exports = {
    name: 'threadCreate',
    async execute(thread) {
        try {
            // 포럼 채널에서 생성된 스레드(포스트)인지 확인
            if (thread.parent?.type === ChannelType.GuildForum) { // ChannelType.GuildForum = 15
                // 설정에서 소스 포럼 채널 ID와 대상 채널 ID 확인
                const sourceForumId = config.sourceForumChannelId;
                const targetChannelId = config.targetChannelId;

                if (!sourceForumId || !targetChannelId) {
                    logger.warn('포럼 채널 또는 대상 채널 ID가 설정되지 않았습니다.');
                    return;
                }

                // 해당 포럼 채널에서 생성된 포스트인지 확인
                if (thread.parentId === sourceForumId) {
                    // 대상 채널 가져오기
                    const targetChannel = thread.guild.channels.cache.get(targetChannelId);

                    if (!targetChannel) {
                        logger.error(`대상 채널을 찾을 수 없습니다: ${targetChannelId}`);
                        return;
                    }

                    // 포스트 링크 생성
                    const postLink = `https://discord.com/channels/${thread.guild.id}/${thread.id}`;

                    // 제목만 링크로 전송
                    await targetChannel.send(postLink);
                    logger.info(`새 포스트 링크 전송: ${thread.name}`);
                }
            }
        } catch (error) {
            logger.error('threadCreate 이벤트 처리 중 오류:', error);
        }
    }
};