const { REST, Routes } = require('discord.js');
const { KICK_HOURS } = require('../utils/constants');
const { loadPendingMembers, savePendingMembers } = require('../utils/dataManager');
const { kickMemberIfNeeded } = require('../utils/memberUtils');
const logger = require('../utils/logManager');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client, commands, config) {
        logger.success(`🤖 ${client.user.tag} 봇이 준비되었습니다!`);
        logger.info(`📋 새 멤버 가입 시 ${KICK_HOURS}시간 타이머가 시작됩니다.`);

        // 슬래시 커맨드 등록
        if (!config || !config.token) {
            logger.error('토큰이 설정되지 않았습니다. config.json을 확인하세요.');
            return;
        }

        const rest = new REST({ version: '10' }).setToken(config.token);
        try {
            logger.info('슬래시 커맨드를 등록하는 중...');
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands }
            );
            logger.success('슬래시 커맨드 등록 완료!');
        } catch (error) {
            logger.error('슬래시 커맨드 등록 실패:', error);
        }

        // 기존 대기 중인 멤버들의 타이머 복구
        const now = Date.now();

        // 모든 길드에 대해 대기 멤버 복구
        for (const guild of client.guilds.cache.values()) {
            const pendingMembers = await loadPendingMembers(guild.id);
            const guildUpdated = {};

            for (const [key, data] of Object.entries(pendingMembers)) {
                const timeLeft = data.kickTime - now;

                if (timeLeft <= 0) {
                    // 이미 시간이 지난 경우 즉시 처리
                    await kickMemberIfNeeded(client, data.guildId, data.memberId, config);
                    // 업데이트된 목록에서 제외
                } else {
                    // 남은 시간만큼 타이머 설정
                    setTimeout(async () => {
                        await kickMemberIfNeeded(client, data.guildId, data.memberId, config);

                        // 완료 후 목록에서 제거
                        const updated = await loadPendingMembers(guild.id);
                        delete updated[key];
                        await savePendingMembers(guild.id, updated);
                    }, timeLeft);

                    logger.info(`⏰ 타이머 복구: ${data.memberId} (${Math.round(timeLeft / 1000 / 60)} 분 남음)`);
                    guildUpdated[key] = data;
                }
            }

            // 길드별로 업데이트된 데이터 저장
            await savePendingMembers(guild.id, guildUpdated);
        }

        // 봇 시작 시 자동 닉네임 검사 제거
        logger.info('✅ 봇이 준비되었습니다.');
    }
};