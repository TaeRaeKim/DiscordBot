const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const googleOAuth = require('../services/googleOAuth');
const database = require('../services/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('소유계정등록')
        .setDescription('구글 시트 소유자 계정을 등록합니다 (관리자 전용)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // 이미 등록된 관리자 계정이 있는지 확인
            const adminTokens = await database.getAllAdminTokens();
            const existingAdmin = Object.values(adminTokens).find(token => token.discordUserId === interaction.user.id);

            if (existingAdmin) {
                const existingAdminEmail = Object.keys(adminTokens).find(email =>
                    adminTokens[email].discordUserId === interaction.user.id
                );

                const alreadyRegisteredEmbed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('⚠️ 이미 등록된 관리자 계정')
                    .setDescription(`이미 관리자 계정이 등록되어 있습니다.`)
                    .addFields(
                        {
                            name: '📧 등록된 계정',
                            value: existingAdminEmail
                        },
                        {
                            name: '📌 안내사항',
                            value: '• 하나의 Discord 계정당 하나의 관리자 구글 계정만 등록 가능합니다.\n• 계정을 변경하려면 기존 계정을 먼저 제거해야 합니다.'
                        },
                        {
                            name: '🔄 계정 변경 방법',
                            value: '1. 시스템 관리자에게 기존 계정 제거 요청\n2. 기존 계정 제거 후 새 계정으로 재등록'
                        }
                    )
                    .setFooter({ text: '계정 변경이 필요하면 시스템 관리자에게 문의하세요.' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [alreadyRegisteredEmbed] });
            }

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
3. 인증이 완료되면 아래 **인증 완료** 버튼을 클릭하세요.`
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
                        name: '✨ 다음 단계',
                        value: '브라우저에서 인증을 완료한 후 아래 **인증 완료** 버튼을 클릭해주세요!'
                    }
                )
                .setFooter({ text: '인증 완료 후 인증 완료 버튼을 클릭하세요.' })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`auth_check_admin_${interaction.user.id}`)
                        .setLabel('인증 완료')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅')
                );

            await interaction.editReply({ embeds: [embed], components: [row] });

            // 버튼 클릭 대기
            const filter = i => i.customId === `auth_check_admin_${interaction.user.id}` && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 600000, // 10분
                max: 10 // 최대 10번까지 확인 가능
            });

            collector.on('collect', async i => {
                await i.deferReply({ ephemeral: true });

                // 진행 상태 메시지 표시
                await i.editReply({ content: '⏳ 관리자 계정을 등록하고 있습니다...' });

                try {
                    // 데이터베이스에서 인증 확인
                    const pendingAccount = await database.getPendingAuth(interaction.user.id);

                    if (pendingAccount && pendingAccount.type === 'admin') {
                        // 인증 대기 중인 관리자 계정이 있음 - 실제 등록 진행
                        try {
                            // 관리자 토큰을 데이터베이스에 저장
                            await googleOAuth.saveTokens(
                                pendingAccount.google_email,
                                pendingAccount.tokens,
                                interaction.user.id
                            );

                            // pending_auth에서 제거
                            await database.deletePendingAuth(interaction.user.id);

                            // 성공 메시지
                            const successEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle('✅ 관리자 계정 등록 완료')
                                .setDescription(`**${pendingAccount.google_email}** 계정이 성공적으로 등록되었습니다.`)
                                .addFields(
                                    {
                                        name: '🎉 완료된 작업',
                                        value: '• 구글 시트 소유자 계정 인증 완료\n• Drive 및 Sheets 전체 권한 획득\n• 관리자 계정 정보 저장'
                                    },
                                    {
                                        name: '📌 다음 단계',
                                        value: '이제 이 계정이 소유한 구글 시트에 다른 사용자들을 편집자로 추가할 수 있습니다.'
                                    }
                                )
                                .setTimestamp();

                            // 원본 메시지를 성공 메시지로 바로 바꿈
                            await interaction.editReply({
                                embeds: [successEmbed],
                                components: []
                            });

                            // 버튼 응답은 삭제
                            await i.deleteReply();

                            collector.stop('completed');

                            console.log(`관리자 계정 등록 완료: ${interaction.user.id} -> ${pendingAccount.google_email}`);

                        } catch (error) {
                            console.error('관리자 계정 저장 오류:', error);

                            // 원본 메시지를 오류 상태로 바꿈
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xFF4444)
                                .setTitle('❌ 계정 저장 실패')
                                .setDescription(`관리자 계정 저장에 실패했습니다: ${error.message}`)
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
                        // 아직 인증 미완료
                        const pendingEmbed = new EmbedBuilder()
                            .setColor(0xFFAA00)
                            .setTitle('⏳ 인증 대기 중')
                            .setDescription('아직 브라우저에서 관리자 인증이 완료되지 않았습니다.')
                            .addFields({
                                name: '💡 안내',
                                value: `1. 브라우저에서 구글 인증을 완료했는지 확인해주세요.
2. 인증 페이지에서 "인증 완료!" 메시지를 확인하세요.
3. 잠시 후 다시 **인증 완료** 버튼을 클릭해주세요.`
                            })
                            .setFooter({ text: '인증이 완료될 때까지 버튼을 다시 클릭할 수 있습니다.' })
                            .setTimestamp();

                        await i.editReply({
                            embeds: [pendingEmbed]
                        });
                    }
                } catch (error) {
                    console.error('관리자 인증 완료 처리 중 오류:', error);

                    // 원본 메시지를 오류 상태로 바꿈
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF4444)
                        .setTitle('❌ 인증 오류')
                        .setDescription(`인증 완료 처리 중 오류가 발생했습니다: ${error.message}`)
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
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({
                        embeds: [embed],
                        components: []
                    }).catch(() => {});
                }
            });

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