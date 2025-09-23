const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../services/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('소유계정제거')
        .setDescription('등록된 관리자 계정을 제거합니다 (관리자 전용)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // 데이터베이스에서 현재 사용자의 관리자 계정 확인
            const adminTokens = await database.getAllAdminTokens();
            let adminAccount = null;
            let adminEmail = null;

            for (const [email, tokenData] of Object.entries(adminTokens)) {
                if (tokenData.discordUserId === interaction.user.id) {
                    adminAccount = tokenData;
                    adminEmail = email;
                    break;
                }
            }

            if (!adminAccount) {
                const noAccountEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ 등록된 관리자 계정 없음')
                    .setDescription('제거할 관리자 계정이 없습니다.')
                    .addFields({
                        name: '💡 안내',
                        value: '관리자 계정을 등록하려면 `/소유계정등록` 명령어를 사용해주세요.'
                    })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [noAccountEmbed] });
            }

            // 확인 메시지 및 버튼
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFF4444)
                .setTitle('⚠️ 관리자 계정 제거 확인')
                .setDescription('정말로 등록된 관리자 계정을 제거하시겠습니까?')
                .addFields(
                    {
                        name: '🗑️ 제거될 계정',
                        value: `📧 **${adminEmail}**`
                    },
                    {
                        name: '📋 제거 작업 내용',
                        value: '• 관리자 OAuth 토큰 완전 삭제\n• 시트 관리 권한 해제\n• 더 이상 다른 사용자에게 권한 부여 불가'
                    },
                    {
                        name: '⚠️ 주의사항',
                        value: '이 작업은 되돌릴 수 없습니다. 다시 관리자 권한을 얻으려면 `/소유계정등록`을 새로 실행해야 합니다.'
                    }
                )
                .setTimestamp();

            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_remove_admin_${interaction.user.id}`)
                        .setLabel('🗑️ 관리자 계정 제거')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`cancel_remove_admin_${interaction.user.id}`)
                        .setLabel('❌ 취소')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [confirmRow]
            });

            // 버튼 클릭 대기
            const filter = i =>
                (i.customId === `confirm_remove_admin_${interaction.user.id}` || i.customId === `cancel_remove_admin_${interaction.user.id}`) &&
                i.user.id === interaction.user.id;

            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 30000,
                max: 1
            });

            collector.on('collect', async i => {
                if (i.customId === `confirm_remove_admin_${interaction.user.id}`) {
                    try {
                        await i.deferReply({ ephemeral: true });

                        // 진행 상태 메시지 표시
                        await i.editReply({ content: '⏳ 관리자 계정을 제거하고 있습니다...' });

                        // 데이터베이스에서 관리자 계정 제거
                        await database.deleteAdminToken(adminEmail);

                        // 성공 메시지
                        const successEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ 관리자 계정 제거 완료')
                            .setDescription(`**${adminEmail}** 관리자 계정이 성공적으로 제거되었습니다.`)
                            .addFields(
                                {
                                    name: '🎯 완료된 작업',
                                    value: '• 관리자 OAuth 토큰 삭제\n• 시트 관리 권한 해제\n• 계정 연결 정보 삭제'
                                },
                                {
                                    name: '📌 안내사항',
                                    value: '새로운 관리자 계정을 등록하려면 `/소유계정등록` 명령어를 사용해주세요.'
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

                        console.log(`관리자 계정 제거: ${interaction.user.tag} (${interaction.user.id}) -> ${adminEmail}`);

                    } catch (error) {
                        console.error('관리자 계정 제거 오류:', error);

                        // 원본 메시지를 오류 메시지로 바로 바꿈
                        const errorEmbed = new EmbedBuilder()
                            .setColor(0xFF4444)
                            .setTitle('❌ 관리자 계정 제거 실패')
                            .setDescription(error.message)
                            .addFields({
                                name: '💡 해결 방법',
                                value: '• 잠시 후 다시 시도해주세요\n• 문제가 지속되면 시스템 관리자에게 문의해주세요'
                            })
                            .setTimestamp();

                        await interaction.editReply({
                            embeds: [errorEmbed],
                            components: []
                        });

                        await i.deleteReply();
                    }
                } else {
                    // 취소 버튼
                    await i.deferReply({ ephemeral: true });

                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x888888)
                        .setTitle('❌ 작업 취소')
                        .setDescription('관리자 계정 제거가 취소되었습니다.')
                        .addFields({
                            name: '📌 안내',
                            value: `관리자 계정 **${adminEmail}**이 그대로 유지됩니다.`
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
            console.error('소유계정제거 명령어 오류:', error);

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