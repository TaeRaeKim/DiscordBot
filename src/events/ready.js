const { REST, Routes } = require('discord.js');
const { KICK_HOURS } = require('../utils/constants');
const { loadPendingMembers, savePendingMembers } = require('../utils/dataManager');
const { hasAtSymbol, kickMemberIfNeeded, applyTimerToExistingMemberWithoutCheck } = require('../utils/memberUtils');
const logger = require('../utils/logManager');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client, commands, config) {
        logger.success(`🤖 ${client.user.tag} 봇이 준비되었습니다!`);
        logger.info(`📋 새 멤버 가입 시 ${KICK_HOURS}시간 타이머가 시작됩니다.`);

        // 슬래시 커맨드 등록
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
        const pendingMembers = loadPendingMembers();
        const now = Date.now();

        Object.entries(pendingMembers).forEach(([key, data]) => {
            const timeLeft = data.kickTime - now;

            if (timeLeft <= 0) {
                // 이미 시간이 지난 경우 즉시 처리
                kickMemberIfNeeded(client, data.guildId, data.memberId, config);
                delete pendingMembers[key];
            } else {
                // 남은 시간만큼 타이머 설정
                setTimeout(() => {
                    kickMemberIfNeeded(client, data.guildId, data.memberId, config);

                    // 완료 후 목록에서 제거
                    const updated = loadPendingMembers();
                    delete updated[key];
                    savePendingMembers(updated);
                }, timeLeft);

                logger.info(`⏰ 타이머 복구: ${data.memberId} (${Math.round(timeLeft / 1000 / 60)} 분 남음)`);
            }
        });

        savePendingMembers(pendingMembers);

        // 모든 서버의 기존 멤버들에게 규칙 적용
        logger.info('🔄 기존 멤버들에게 규칙 적용 시작...');

        const botLoginTime = Date.now(); // 봇 로그인 시점
        logger.info(`🕐 봇 로그인 시점: ${new Date(botLoginTime).toISOString()} (${botLoginTime})`);

        const guilds = Array.from(client.guilds.cache.values());
        logger.info(`📊 총 ${guilds.length}개 서버 처리 예정`);

        for (let guildIndex = 0; guildIndex < guilds.length; guildIndex++) {
            const guild = guilds[guildIndex];

            try {
                logger.info(`📊 [${guildIndex + 1}/${guilds.length}] ${guild.name} 서버 멤버 확인 중...`);

                // 서버별로 멤버 정보 가져오기 (API 제한 방지를 위해 딜레이)
                await guild.members.fetch();

                let processedCount = 0;
                let targetCount = 0;
                let dmQueue = []; // DM 발송 대기열

                // 1단계: 빠른 멤버 확인 (딜레이 없음)
                for (const member of guild.members.cache.values()) {
                    // 봇은 제외
                    if (member.user.bot) continue;

                    // 서버 관리자는 제외
                    if (member.permissions.has('ManageGuild')) {
                        logger.info(`🛡️ 관리자 제외: ${member.user.tag}`);
                        continue;
                    }

                    targetCount++;

                    const memberId = member.id;
                    const guildId = member.guild.id;
                    const key = `${guildId}_${memberId}`;

                    // 이미 대기 목록에 있는지 확인
                    const pendingMembers = loadPendingMembers();
                    if (pendingMembers[key]) {
                        logger.info(`이미 대기 목록에 있음: ${member.user.tag}`);
                        processedCount++;
                        continue;
                    }

                    // 닉네임에 @가 있는지 확인
                    if (hasAtSymbol(member.displayName)) {
                        logger.info(`✅ 기존 멤버 통과: ${member.user.tag} (${member.displayName}) - @ 기호 있음`);
                        processedCount++;
                        continue;
                    }

                    // DM 발송 대상으로 추가
                    dmQueue.push({
                        member: member,
                        botLoginTime: botLoginTime,
                        key: key
                    });

                    processedCount++;
                }

                logger.info(`📋 ${guild.name}: ${dmQueue.length}명에게 DM 발송 예정`);

                // 2단계: DM 발송 (100ms 딜레이)
                for (let i = 0; i < dmQueue.length; i++) {
                    const { member, botLoginTime, key } = dmQueue[i];

                    try {
                        await applyTimerToExistingMemberWithoutCheck(client, member, botLoginTime, key, config);
                    } catch (error) {
                        logger.error(`기존 멤버 처리 실패 (${member.user.tag}):`, error);
                    }

                    // DM 발송 후에만 딜레이 적용
                    if (i < dmQueue.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                logger.success(`✅ ${guild.name} 완료: ${processedCount}/${targetCount} 멤버 처리, ${dmQueue.length}개 DM 발송`);

                // 다음 서버 처리 전 딜레이 (API 제한 방지)
                if (guildIndex < guilds.length - 1) {
                    logger.info(`⏳ 다음 서버 처리 전 대기 중... (${guildIndex + 2}/${guilds.length})`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
                }

            } catch (error) {
                logger.error(`서버 ${guild.name} 처리 중 오류:`, error);

                // 에러 발생 시 더 긴 딜레이
                if (guildIndex < guilds.length - 1) {
                    logger.warn(`❌ 에러 발생, 3초 대기 후 다음 서버 처리...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }

        logger.success('🎉 기존 멤버 규칙 적용 완료!');
    }
};