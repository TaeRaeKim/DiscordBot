const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { hasAtSymbol, applyTimerToExistingMemberWithoutCheck } = require('../utils/memberUtils');
const { loadPendingMembers } = require('../utils/dataManager');
const logger = require('../utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('닉네임검사')
        .setDescription('서버의 모든 멤버 닉네임을 검사하고 타이머를 적용합니다 (관리자 전용)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction, config) {
        await interaction.deferReply();

        const guild = interaction.guild;
        const checkStartTime = Date.now();

        try {
            logger.info(`📊 ${guild.name} 서버 닉네임 검사 시작...`);

            // 서버 멤버 정보 가져오기
            await guild.members.fetch();

            let processedCount = 0;
            let targetCount = 0;
            let dmQueue = [];
            let skippedCount = 0;
            let alreadyCompliantCount = 0;

            // 1단계: 빠른 멤버 확인
            for (const member of guild.members.cache.values()) {
                // 봇은 제외
                if (member.user.bot) continue;

                // 서버 관리자는 제외
                if (member.permissions.has('ManageGuild')) {
                    logger.info(`🛡️ 관리자 제외: ${member.user.tag}`);
                    skippedCount++;
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
                    logger.info(`✅ 닉네임 규칙 준수: ${member.user.tag} (${member.displayName})`);
                    alreadyCompliantCount++;
                    processedCount++;
                    continue;
                }

                // DM 발송 대상으로 추가
                dmQueue.push({
                    member: member,
                    checkTime: checkStartTime,
                    key: key
                });

                processedCount++;
            }

            // 진행 상황 업데이트
            await interaction.editReply({
                content: `🔄 닉네임 검사 진행 중...\n검사 대상: ${targetCount}명\n규칙 준수: ${alreadyCompliantCount}명\nDM 발송 대기: ${dmQueue.length}명`
            });

            logger.info(`📋 ${guild.name}: ${dmQueue.length}명에게 DM 발송 예정`);

            // 2단계: DM 발송 (100ms 딜레이)
            let dmSentCount = 0;
            let dmFailedCount = 0;

            for (let i = 0; i < dmQueue.length; i++) {
                const { member, checkTime, key } = dmQueue[i];

                try {
                    await applyTimerToExistingMemberWithoutCheck(interaction.client, member, checkTime, key, config);
                    dmSentCount++;
                } catch (error) {
                    logger.error(`멤버 처리 실패 (${member.user.tag}):`, error);
                    dmFailedCount++;
                }

                // DM 발송 후 딜레이 적용
                if (i < dmQueue.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // 5명마다 진행 상황 업데이트
                if ((i + 1) % 5 === 0 || i === dmQueue.length - 1) {
                    await interaction.editReply({
                        content: `🔄 닉네임 검사 진행 중...\nDM 발송: ${i + 1}/${dmQueue.length}`
                    });
                }
            }

            // 최종 결과 임베드 생성
            const resultEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ 닉네임 검사 완료')
                .setDescription(`**${guild.name}** 서버의 닉네임 검사가 완료되었습니다.`)
                .addFields(
                    { name: '📊 전체 대상', value: `${targetCount}명`, inline: true },
                    { name: '✅ 규칙 준수', value: `${alreadyCompliantCount}명`, inline: true },
                    { name: '⏰ 타이머 적용', value: `${dmSentCount}명`, inline: true }
                )
                .setTimestamp();

            if (skippedCount > 0) {
                resultEmbed.addFields({ name: '🛡️ 관리자 제외', value: `${skippedCount}명`, inline: true });
            }

            if (dmFailedCount > 0) {
                resultEmbed.addFields({ name: '❌ DM 실패', value: `${dmFailedCount}명`, inline: true });
            }

            await interaction.editReply({
                content: null,
                embeds: [resultEmbed]
            });

            logger.success(`✅ ${guild.name} 닉네임 검사 완료: ${processedCount}/${targetCount} 멤버 처리, ${dmSentCount}개 DM 발송`);

        } catch (error) {
            logger.error(`닉네임 검사 중 오류:`, error);
            await interaction.editReply({
                content: `❌ 닉네임 검사 중 오류가 발생했습니다: ${error.message}`
            });
        }
    }
};