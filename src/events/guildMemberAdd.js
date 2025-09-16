const { EmbedBuilder } = require('discord.js');
const { KICK_HOURS, KICK_TIME } = require('../utils/constants');
const { loadPendingMembers, savePendingMembers } = require('../utils/dataManager');
const { kickMemberIfNeeded } = require('../utils/memberUtils');
const logger = require('../utils/logManager');

module.exports = {
    name: 'guildMemberAdd',
    async execute(client, member, config) {
        logger.info(`👋 새 멤버 가입: ${member.user.tag}`);

        // Discord의 가입 시간을 기준으로 킥 시간 계산
        const joinedTimestamp = member.joinedTimestamp;
        const kickTime = joinedTimestamp + KICK_TIME;
        const memberId = member.id;
        const guildId = member.guild.id;
        const key = `${guildId}_${memberId}`;

        // 시간 로그는 필요시만 활성화

        // 대기 목록에 추가
        const pendingMembers = loadPendingMembers();
        pendingMembers[key] = {
            memberId: memberId,
            guildId: guildId,
            joinTime: joinedTimestamp,
            kickTime: kickTime,
            username: member.user.tag
        };
        savePendingMembers(pendingMembers);

        // 킥 시간 타이머 설정
        const timeUntilKick = kickTime - Date.now();
        setTimeout(() => {
            kickMemberIfNeeded(client, guildId, memberId, config);

            // 완료 후 목록에서 제거
            const updated = loadPendingMembers();
            delete updated[key];
            savePendingMembers(updated);
        }, timeUntilKick);

        logger.info(`⏰ ${KICK_HOURS}시간 타이머 시작: ${member.user.tag}`);

        // 환영 메시지 및 규칙 안내 (선택사항)
        try {
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎉 서버에 오신 것을 환영합니다!')
                .setDescription(`**${member.guild.name}**에 오신 것을 환영합니다!`)
                .addFields(
                    {
                        name: '⚠️ 중요 규칙',
                        value: `**${KICK_HOURS}시간 내에 닉네임을 인게임명@서버로 변경**해 주세요.\n예: \`로미니@모그리\``
                    },
                    {
                        name: '📅 시간 제한',
                        value: `**<t:${Math.floor(kickTime / 1000)}:F> 까지**`
                    }
                )
                .setFooter({ text: '규칙을 준수하지 않을 경우 자동으로 서버에서 제거됩니다.' })
                .setTimestamp();

            await member.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            logger.warn(`환영 메시지 발송 실패 (${member.user.tag}):`, error.message);
        }
    }
};