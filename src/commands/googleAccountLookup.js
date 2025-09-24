const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('구글계정조회')
        .setDescription('디스코드 멤버의 등록된 구글 계정을 조회합니다')
        .addUserOption(option =>
            option.setName('멤버')
                .setDescription('조회할 디스코드 멤버')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

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

            const googleAccount = await database.getUserGoogleAccount(targetUser.id);

            if (!googleAccount) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ 계정 정보 없음')
                    .setDescription('해당 멤버의 등록된 구글 계정 정보가 없습니다.')
                    .addFields(
                        {
                            name: '🔍 조회된 멤버',
                            value: `${targetMember.displayName} (${targetUser.username})`,
                            inline: false
                        },
                        {
                            name: '💡 안내',
                            value: '해당 멤버가 `/구글계정등록` 명령어를 사용하지 않았거나, 계정이 제거되었을 수 있습니다.',
                            inline: false
                        }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [notFoundEmbed] });
            }

            const successEmbed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle('✅ 구글 계정 조회 결과')
                .addFields(
                    {
                        name: '👤 디스코드 멤버',
                        value: `${targetMember.displayName} (${targetUser.username})`,
                        inline: false
                    },
                    {
                        name: '📧 등록된 구글 계정',
                        value: `\`${googleAccount.google_email}\``,
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
                )
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('구글계정조회 명령어 오류:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('❌ 조회 중 오류 발생')
                .setDescription('구글 계정 조회 중 오류가 발생했습니다.')
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