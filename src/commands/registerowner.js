const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const googleOAuth = require('../services/googleOAuth');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('소유계정등록')
        .setDescription('구글 시트 소유자 계정을 등록합니다 (관리자 전용)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const authUrl = await googleOAuth.initiateAuth(null, interaction.user.id);

            const embed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle('🔐 관리자 계정 인증')
                .setDescription('구글 시트 소유자 계정 인증을 진행합니다.')
                .addFields(
                    {
                        name: '📌 안내사항',
                        value: `1. 아래 링크를 클릭하여 구글 시트 소유자 계정으로 로그인합니다.
2. Drive 및 Sheets 권한 요청을 승인합니다.
3. 인증이 완료되면 자동으로 소유자 권한이 등록됩니다.`
                    },
                    {
                        name: '🔗 인증 링크',
                        value: `[여기를 클릭하여 인증 진행](${authUrl})`
                    },
                    {
                        name: '⏱️ 유효 시간',
                        value: '인증 링크는 10분간 유효합니다.'
                    },
                    {
                        name: '✨ 자동 처리',
                        value: '브라우저에서 인증을 완료하면 자동으로 소유자 계정이 등록됩니다!'
                    }
                )
                .setFooter({ text: '인증 완료 후 다른 사용자들에게 시트 편집 권한을 부여할 수 있습니다.' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('소유계정등록 명령어 오류:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('❌ 인증 링크 생성 실패')
                .setDescription(error.message)
                .addFields({
                    name: '💡 해결 방법',
                    value: `• 잠시 후 다시 시도해주세요
• 문제가 지속되면 시스템 관리자에게 문의해주세요`
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