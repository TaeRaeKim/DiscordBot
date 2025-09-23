const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userGoogleAccounts = require('../services/userGoogleAccounts');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('구글계정제거')
        .setDescription('등록된 구글 계정을 제거하고 시트 편집 권한을 해제합니다'),

    async execute(interaction) {
        const discordUserId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            // 등록된 계정이 있는지 확인
            const existingAccount = await userGoogleAccounts.getUserAccount(discordUserId);
            if (!existingAccount) {
                const noAccountEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ 등록된 계정 없음')
                    .setDescription('제거할 구글 계정이 없습니다.')
                    .addFields({
                        name: '💡 안내',
                        value: '구글 계정을 등록하려면 `/구글계정등록` 명령어를 사용해주세요.'
                    })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [noAccountEmbed] });
            }

            // 확인 메시지 및 버튼
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('⚠️ 구글 계정 제거 확인')
                .setDescription('정말로 등록된 구글 계정을 제거하시겠습니까?')
                .addFields(
                    {
                        name: '🗑️ 제거될 계정',
                        value: `📧 **${existingAccount.google_email}**`
                    },
                    {
                        name: '📋 제거 작업 내용',
                        value: `• 구글 시트에서 편집 권한 완전 제거
• 디스코드 계정 연결 정보 삭제
• 더 이상 해당 시트에 접근할 수 없음`
                    },
                    {
                        name: '⚠️ 주의사항',
                        value: '이 작업은 되돌릴 수 없습니다. 다시 접근하려면 `/구글계정등록`을 새로 실행해야 합니다.'
                    }
                )
                .setTimestamp();

            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_remove_${discordUserId}`)
                        .setLabel('🗑️ 계정 제거')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`cancel_remove_${discordUserId}`)
                        .setLabel('❌ 취소')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [confirmRow]
            });

            // 버튼 클릭 대기
            const filter = i =>
                (i.customId === `confirm_remove_${discordUserId}` || i.customId === `cancel_remove_${discordUserId}`) &&
                i.user.id === discordUserId;

            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 30000,
                max: 1
            });

            collector.on('collect', async i => {
                if (i.customId === `confirm_remove_${discordUserId}`) {
                    try {
                        await i.deferReply({ ephemeral: true });

                        // 진행 상태 메시지 표시
                        await i.editReply({ content: '⏳ 계정을 제거하고 있습니다...' });

                        // 구글 계정 제거 실행
                        const result = await userGoogleAccounts.removeUserAccount(discordUserId);

                        const successEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ 구글 계정 제거 완료')
                            .setDescription(`**${result.removedEmail}** 계정이 성공적으로 제거되었습니다.`)
                            .addFields(
                                {
                                    name: '🎯 완료된 작업',
                                    value: `• 구글 시트에서 편집 권한 제거
• 계정 연결 정보 삭제
• 시트 접근 권한 해제`
                                },
                                {
                                    name: '📌 안내사항',
                                    value: '새로운 구글 계정을 등록하려면 `/구글계정등록` 명령어를 사용해주세요.'
                                }
                            )
                            .setFooter({
                                text: `제거자: ${interaction.user.tag}`,
                                iconURL: interaction.user.displayAvatarURL()
                            })
                            .setTimestamp();

                        // 원본 메시지를 성공 메시지로 바로 바꿈
                        await interaction.editReply({
                            embeds: [successEmbed],
                            components: []
                        });

                        // 버튼 응답은 삭제
                        await i.deleteReply();

                        console.log(`구글 계정 제거: ${interaction.user.tag} (${discordUserId}) -> ${result.removedEmail}`);

                    } catch (error) {
                        console.error('구글 계정 제거 오류:', error);

                        const errorEmbed = new EmbedBuilder()
                            .setColor(0xFF4444)
                            .setTitle('❌ 계정 제거 실패')
                            .setDescription(error.message)
                            .addFields({
                                name: '💡 해결 방법',
                                value: `• 잠시 후 다시 시도해주세요
• 문제가 지속되면 관리자에게 문의해주세요`
                            })
                            .setTimestamp();

                        // 원본 메시지를 오류 메시지로 바로 바꿈
                        await interaction.editReply({
                            embeds: [errorEmbed],
                            components: []
                        });

                        // 버튼 응답은 삭제
                        await i.deleteReply();
                    }
                } else {
                    // 취소 버튼
                    await i.deferReply({ ephemeral: true });

                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x888888)
                        .setTitle('❌ 작업 취소')
                        .setDescription('구글 계정 제거가 취소되었습니다.')
                        .addFields({
                            name: '📌 안내',
                            value: `계정 **${existingAccount.google_email}**이 그대로 유지됩니다.`
                        })
                        .setTimestamp();

                    // 원본 메시지를 취소 메시지로 바로 바꿈
                    await interaction.editReply({
                        embeds: [cancelEmbed],
                        components: []
                    });

                    // 버튼 응답은 삭제
                    await i.deleteReply();
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor(0x888888)
                        .setTitle('⏱️ 시간 초과')
                        .setDescription('30초 내에 응답하지 않아 작업이 취소되었습니다.')
                        .setTimestamp();

                    interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: []
                    }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('구글계정제거 명령어 오류:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('❌ 오류 발생')
                .setDescription('명령어 실행 중 오류가 발생했습니다.')
                .setTimestamp();

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};