const { EmbedBuilder } = require('discord.js');
const { KICK_HOURS, KICK_TIME } = require('./constants');
const { loadPendingMembers, savePendingMembers } = require('./dataManager');
const logger = require('./logManager');

// 닉네임에 @가 포함되어 있는지 확인
function hasAtSymbol(displayName) {
    return displayName.includes('@');
}

// 멤버 킥 함수
async function kickMemberIfNeeded(client, guildId, memberId, config) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const member = await guild.members.fetch(memberId).catch(() => null);
        if (!member) {
            logger.warn(`멤버를 찾을 수 없음: ${memberId}`);
            return;
        }

        // 현재 닉네임 확인
        const currentDisplayName = member.displayName;

        if (!hasAtSymbol(currentDisplayName)) {
            // @가 없으면 킥
            try {
                // 킥하기 전에 DM 발송 시도
                try {
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('🚫 서버에서 제거됨')
                        .setDescription(`**${guild.name}** 서버에서 제거되었습니다.`)
                        .addFields(
                            { name: '이유', value: '닉네임을 (인게임명@서버) 로 변경하지 않음' },
                            { name: '규칙', value: `서버 가입 후 ${KICK_HOURS}시간 내에 닉네임을 \`인게임명@서버\`로 변경해야 합니다.` }
                        )
                        .setTimestamp();

                    await member.send({ embeds: [embed] });
                } catch (dmError) {
                    logger.warn(`DM 발송 실패 (${member.user.tag}):`, dmError.message);
                }

                await member.kick(`${KICK_HOURS}시간 닉네임 규칙 위반`);

                logger.success(`🦵 킥됨: ${member.user.tag} (${currentDisplayName})`);

                // 로그 채널에 알림 (선택사항)
                const logChannelId = config.logChannelId; // config에 로그 채널 ID 추가 가능
                if (logChannelId) {
                    const logChannel = guild.channels.cache.get(logChannelId);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('멤버 자동 킥')
                            .addFields(
                                { name: '멤버', value: `${member.user.tag}`, inline: true },
                                { name: '닉네임', value: currentDisplayName, inline: true },
                                { name: '이유', value: `닉네임 규칙 위반 (${KICK_HOURS}시간 경과)`, inline: true }
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

            } catch (kickError) {
                logger.error(`킥 실패 (${member.user.tag}):`, kickError);
            }
        } else {
            logger.info(`✅ 통과: ${member.user.tag} (${currentDisplayName}) - @ 기호 있음`);
        }

    } catch (error) {
        logger.error('멤버 킥 처리 중 오류:', error);
    }
}

// 기존 멤버에게 타이머 적용 함수 (DM 발송 포함)
async function applyTimerToExistingMemberWithoutCheck(client, member, botLoginTime, key, config) {
    const kickTime = botLoginTime + KICK_TIME;
    const memberId = member.id;
    const guildId = member.guild.id;

    logger.info(`📋 기존 멤버 타이머 적용: ${member.user.tag}`);

    // 대기 목록에 추가
    const pendingMembers = await loadPendingMembers(guildId);
    pendingMembers[key] = {
        memberId: memberId,
        guildId: guildId,
        joinTime: botLoginTime,
        kickTime: kickTime,
        username: member.user.tag
    };
    await savePendingMembers(guildId, pendingMembers);

    // 타이머 설정
    setTimeout(async () => {
        await kickMemberIfNeeded(client, guildId, memberId, config);

        // 완료 후 목록에서 제거
        const updated = await loadPendingMembers(guildId);
        delete updated[key];
        await savePendingMembers(guildId, updated);
    }, KICK_TIME);

    // 기존 멤버에게 DM 발송
    try {
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('⚠️ 닉네임 규칙 안내')
            .setDescription(`**${member.guild.name}** 서버의 닉네임 규칙을 준수해주세요.`)
            .addFields(
                {
                    name: '⚠️ 필수 규칙',
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
        logger.info(`📤 기존 멤버에게 DM 발송: ${member.user.tag}`);
    } catch (error) {
        logger.warn(`DM 발송 실패 (기존 멤버 ${member.user.tag}):`, error.message);
    }
}

module.exports = {
    hasAtSymbol,
    kickMemberIfNeeded,
    applyTimerToExistingMemberWithoutCheck
};