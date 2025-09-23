const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const userGoogleAccounts = require('../services/userGoogleAccounts');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('구글계정등록')
        .setDescription('Google OAuth 인증을 통해 구글 시트 편집 권한을 받습니다'),

    async execute(interaction) {
        const discordUserId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            // 이미 등록된 사용자인지 확인
            const existingAccount = userGoogleAccounts.getUserAccount(discordUserId);
            if (existingAccount) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle('❌ 계정 등록 실패')
                    .setDescription('이미 등록된 구글 계정이 있습니다.')
                    .addFields(
                        {
                            name: '현재 등록된 계정',
                            value: `📧 **${existingAccount.googleEmail}**`
                        },
                        {
                            name: '📌 안내사항',
                            value: '새 계정을 등록하려면 먼저 `/구글계정제거` 명령어로 기존 계정을 제거한 후 다시 시도해주세요.'
                        }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // config.json에서 시트 정보 가져오기
            if (!config.googleSheetId) {
                return await interaction.editReply({
                    content: '❌ 서버 설정에 구글 시트 ID가 없습니다. 관리자에게 문의해주세요.',
                });
            }

            if (!config.sheetOwnerEmail) {
                return await interaction.editReply({
                    content: '❌ 서버 설정에 시트 소유자 이메일이 없습니다. 관리자에게 문의해주세요.',
                });
            }

            // OAuth 인증 시작
            const authUrl = await userGoogleAccounts.initiateUserAuth(discordUserId);

            const embed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle('🔐 구글 계정 인증')
                .setDescription('구글 시트 편집 권한을 위해 구글 계정 인증이 필요합니다.')
                .addFields(
                    {
                        name: '📌 안내사항',
                        value: `1. 아래 링크를 클릭하여 구글 계정에 로그인합니다.
2. 시트 편집 권한을 원하는 계정으로 로그인해주세요.
3. 이메일 권한 요청을 승인합니다.
4. 인증이 완료되면 자동으로 시트 편집 권한이 부여됩니다.`
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
                        value: '브라우저에서 인증을 완료하면 자동으로 구글 시트 편집 권한이 부여됩니다!'
                    }
                )
                .setFooter({ text: '인증 완료 후 구글 시트에서 공유 알림 이메일을 확인하세요.' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('구글계정등록 명령어 오류:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('❌ 인증 링크 생성 실패')
                .setDescription(error.message)
                .addFields({
                    name: '💡 해결 방법',
                    value: `• 잠시 후 다시 시도해주세요
• 문제가 지속되면 관리자에게 문의해주세요`
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