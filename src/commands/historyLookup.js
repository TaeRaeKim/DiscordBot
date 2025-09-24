const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('히스토리조회')
        .setDescription('구글 계정 등록/삭제 이력을 조회합니다')
        .addSubcommand(subcommand =>
            subcommand
                .setName('멤버')
                .setDescription('디스코드 멤버의 구글 계정 이력을 조회합니다')
                .addUserOption(option =>
                    option.setName('멤버')
                        .setDescription('조회할 디스코드 멤버')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('이메일')
                .setDescription('구글 이메일의 등록/삭제 이력을 조회합니다')
                .addStringOption(option =>
                    option.setName('이메일')
                        .setDescription('조회할 구글 이메일 주소')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const subcommand = interaction.options.getSubcommand();
            let historyData = [];
            let searchInfo = '';

            if (subcommand === '멤버') {
                const targetUser = interaction.options.getUser('멤버');
                const targetMember = interaction.guild.members.cache.get(targetUser.id);

                if (!targetMember) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF4444)
                        .setTitle('❌ 조회 실패')
                        .setDescription('해당 사용자를 서버에서 찾을 수 없습니다.')
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [errorEmbed] });
                }

                historyData = await database.getAccountHistoryByDiscordUser(targetUser.id);
                searchInfo = `👤 **${targetMember.displayName}** (${targetUser.username})`;

            } else if (subcommand === '이메일') {
                const email = interaction.options.getString('이메일').trim().toLowerCase();

                // 이메일 형식 간단 검증
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF4444)
                        .setTitle('❌ 입력 오류')
                        .setDescription('올바른 이메일 형식을 입력해주세요.')
                        .addFields({
                            name: '💡 예시',
                            value: 'example@gmail.com',
                            inline: false
                        })
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [errorEmbed] });
                }

                historyData = await database.getAccountHistoryByEmail(email);
                searchInfo = `📧 **${email}**`;
            }

            if (historyData.length === 0) {
                const noHistoryEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ 이력 정보 없음')
                    .setDescription('해당 조건의 구글 계정 이력이 없습니다.')
                    .addFields(
                        {
                            name: '🔍 조회 대상',
                            value: searchInfo,
                            inline: false
                        },
                        {
                            name: '💡 안내',
                            value: '구글 계정 등록/삭제 작업이 이루어진 적이 없거나, 이력이 기록되기 이전의 작업일 수 있습니다.',
                            inline: false
                        }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [noHistoryEmbed] });
            }

            // 이력 데이터를 임베드로 구성
            const historyEmbed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle('📋 구글 계정 이력 조회 결과')
                .addFields({
                    name: '🔍 조회 대상',
                    value: searchInfo,
                    inline: false
                })
                .setTimestamp();

            // 이력 항목들을 처리
            let historyText = '';
            const maxItemsInEmbed = 10; // 임베드에 표시할 최대 항목 수

            for (let i = 0; i < Math.min(historyData.length, maxItemsInEmbed); i++) {
                const item = historyData[i];
                const actionIcon = item.action === 'REGISTER' ? '✅' : '🗑️';
                const actionText = item.action === 'REGISTER' ? '등록' : '삭제';

                // SQLite CURRENT_TIMESTAMP는 UTC로 저장되므로 Z를 붙여 UTC임을 명시
                const utcTimestamp = item.timestamp.includes('Z') ? item.timestamp : item.timestamp + 'Z';
                const timestamp = new Date(utcTimestamp).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let userInfo = '';
                if (subcommand === '이메일') {
                    // 이메일 조회시에는 Discord 사용자 정보 표시
                    try {
                        const discordUser = await interaction.client.users.fetch(item.discord_user_id);
                        const member = interaction.guild.members.cache.get(item.discord_user_id);

                        if (member) {
                            userInfo = `👤 ${member.displayName} (${discordUser.username})`;
                        } else {
                            userInfo = `👤 ${discordUser.username} (서버에 없음)`;
                        }
                    } catch (error) {
                        userInfo = `👤 <@${item.discord_user_id}> (사용자 정보 조회 실패)`;
                    }
                    historyText += `${actionIcon} **${actionText}** - ${timestamp}\n📧 \`${item.google_email}\`\n${userInfo}\n\n`;
                } else {
                    // 멤버 조회시에는 이메일 정보 표시
                    historyText += `${actionIcon} **${actionText}** - ${timestamp}\n📧 \`${item.google_email}\`\n\n`;
                }
            }

            historyEmbed.addFields({
                name: `📜 이력 목록 (${historyData.length}건)`,
                value: historyText.trim(),
                inline: false
            });

            // 10개 이상인 경우 파일로 전체 목록 제공
            if (historyData.length > maxItemsInEmbed) {
                let fullHistoryText = `=== 구글 계정 이력 전체 목록 ===\n조회 대상: ${searchInfo}\n총 ${historyData.length}건\n\n`;

                for (const item of historyData) {
                    const actionText = item.action === 'REGISTER' ? '등록' : '삭제';
                    // SQLite CURRENT_TIMESTAMP는 UTC로 저장되므로 Z를 붙여 UTC임을 명시
                    const utcTimestamp = item.timestamp.includes('Z') ? item.timestamp : item.timestamp + 'Z';
                    const timestamp = new Date(utcTimestamp).toLocaleString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    fullHistoryText += `[${timestamp}] ${actionText}\n`;
                    fullHistoryText += `  구글계정: ${item.google_email}\n`;
                    fullHistoryText += `  Discord ID: ${item.discord_user_id}\n`;
                    if (item.notes) {
                        fullHistoryText += `  메모: ${item.notes}\n`;
                    }
                    fullHistoryText += '\n';
                }

                const buffer = Buffer.from(fullHistoryText, 'utf-8');

                historyEmbed.addFields({
                    name: '📎 전체 목록',
                    value: `처음 ${maxItemsInEmbed}개 항목만 표시됩니다. 전체 목록은 첨부파일을 확인해주세요.`,
                    inline: false
                });

                await interaction.editReply({
                    embeds: [historyEmbed],
                    files: [{
                        attachment: buffer,
                        name: 'account_history.txt',
                        description: '구글 계정 이력 전체 목록'
                    }]
                });
            } else {
                await interaction.editReply({
                    embeds: [historyEmbed]
                });
            }

        } catch (error) {
            console.error('히스토리조회 명령어 오류:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('❌ 조회 중 오류 발생')
                .setDescription('이력 조회 중 오류가 발생했습니다.')
                .addFields({
                    name: '💡 해결 방법',
                    value: '• 잠시 후 다시 시도해주세요\n• 문제가 지속되면 관리자에게 문의해주세요'
                })
                .setTimestamp();

            const errorMessage = interaction.deferred || interaction.replied
                ? { embeds: [errorEmbed] }
                : { embeds: [errorEmbed], ephemeral: true };

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    },
};