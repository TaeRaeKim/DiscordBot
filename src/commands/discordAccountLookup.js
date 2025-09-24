const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('디코계정조회')
        .setDescription('구글 계정으로 등록된 디스코드 멤버를 조회합니다')
        .addStringOption(option =>
            option.setName('이메일')
                .setDescription('조회할 구글 이메일 주소')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

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

            // user_google_accounts 테이블에서 해당 이메일로 등록된 계정 조회
            const sql = `SELECT * FROM user_google_accounts WHERE LOWER(google_email) = ?`;
            const googleAccount = await database.get(sql, [email]);

            if (!googleAccount) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ 계정 정보 없음')
                    .setDescription('해당 구글 계정으로 등록된 디스코드 멤버가 없습니다.')
                    .addFields(
                        {
                            name: '🔍 조회된 이메일',
                            value: `\`${email}\``,
                            inline: false
                        },
                        {
                            name: '💡 안내',
                            value: '해당 구글 계정이 `/구글계정등록` 명령어로 등록되지 않았거나, 계정이 제거되었을 수 있습니다.',
                            inline: false
                        }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [notFoundEmbed] });
            }

            // Discord 사용자 정보 가져오기
            let discordUser;
            let memberInfo = '정보 없음';

            try {
                discordUser = await interaction.client.users.fetch(googleAccount.discord_user_id);
                const member = interaction.guild.members.cache.get(googleAccount.discord_user_id);

                if (member) {
                    memberInfo = `${member.displayName} (${discordUser.username})`;
                } else {
                    memberInfo = `${discordUser.username} (서버에 없음)`;
                }
            } catch (error) {
                console.error('Discord 사용자 정보 조회 실패:', error);
                memberInfo = `<@${googleAccount.discord_user_id}> (사용자 정보 조회 실패)`;
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle('✅ 디스코드 계정 조회 결과')
                .addFields(
                    {
                        name: '📧 구글 계정',
                        value: `\`${googleAccount.google_email}\``,
                        inline: false
                    },
                    {
                        name: '👤 등록된 디스코드 멤버',
                        value: memberInfo,
                        inline: false
                    },
                    {
                        name: '🆔 Discord User ID',
                        value: `\`${googleAccount.discord_user_id}\``,
                        inline: false
                    },
                    {
                        name: '📅 등록일',
                        value: new Date(googleAccount.registered_at).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        }),
                        inline: false
                    }
                );

            if (discordUser) {
                successEmbed.setThumbnail(discordUser.displayAvatarURL());
            }

            successEmbed.setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('디코계정조회 명령어 오류:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('❌ 조회 중 오류 발생')
                .setDescription('디스코드 계정 조회 중 오류가 발생했습니다.')
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