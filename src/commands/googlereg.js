const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const userGoogleAccounts = require('../services/userGoogleAccounts');
const database = require('../services/database');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('구글계정등록')
        .setDescription('Google OAuth 인증을 통해 구글 시트 편집 권한을 받습니다'),

    async execute(interaction) {
        const discordUserId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            // 소유계정등록이 완료되었는지 먼저 확인
            const adminTokens = await database.getAllAdminTokens();
            if (Object.keys(adminTokens).length === 0) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle('❌ 구글계정등록 실패')
                    .setDescription('소유계정등록이 완료되지 않았습니다.')
                    .addFields(
                        {
                            name: '🔐 필수 조건',
                            value: '구글 계정을 등록하기 전에 관리자가 구글 시트 소유자 계정을 등록해야 합니다.'
                        },
                        {
                            name: '📌 해결 방법',
                            value: '관리자의 소유자 계정 등록이 완료된 후 다시 시도해주세요.'
                        }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // 이미 등록된 사용자인지 확인
            const existingAccount = await userGoogleAccounts.getUserAccount(discordUserId);
            if (existingAccount) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle('❌ 계정 등록 실패')
                    .setDescription('이미 등록된 구글 계정이 있습니다.')
                    .addFields(
                        {
                            name: '현재 등록된 계정',
                            value: `📧 **${existingAccount.google_email}**`
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
            if (!config.googleSheets || config.googleSheets.length === 0) {
                return await interaction.editReply({
                    content: '❌ 서버 설정에 구글 시트 정보가 없습니다. 관리자에게 문의해주세요.',
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
4. 인증이 완료되면 아래 **인증 완료** 버튼을 클릭하세요.`
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
                        .setCustomId(`auth_check_user_${interaction.user.id}`)
                        .setLabel('인증 완료')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅')
                );

            await interaction.editReply({ embeds: [embed], components: [row] });

            // 버튼 클릭 대기
            const filter = i => i.customId === `auth_check_user_${interaction.user.id}` && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 600000, // 10분
                max: 10 // 최대 10번까지 확인 가능
            });

            collector.on('collect', async i => {
                await i.deferReply({ ephemeral: true });

                // 진행 상태 메시지 표시
                await i.editReply({ content: '⏳ 계정을 등록하고 있습니다...' });

                try {
                    // 데이터베이스에서 인증 확인
                    const pendingAccount = await database.getPendingAuth(discordUserId);

                    if (pendingAccount && pendingAccount.type === 'user') {
                        // 인증 대기 중인 계정이 있음 - 실제 등록 진행
                        try {
                            const config = require('../../config.json');
                            const googleOAuth = require('../services/googleOAuth');

                            // 시트들에 편집자 권한 추가
                            const sheetResults = await googleOAuth.shareMultipleSheetsWithUser(
                                config.sheetOwnerEmail,
                                pendingAccount.google_email,
                                config
                            );

                            // 데이터베이스에 사용자 계정 저장
                            await database.setUserGoogleAccount(
                                discordUserId,
                                pendingAccount.google_email
                            );

                            // 데이터베이스에 사용자 토큰 저장
                            await database.setUserToken(
                                pendingAccount.google_email,
                                discordUserId,
                                pendingAccount.tokens
                            );

                            // pending_auth에서 제거
                            await database.deletePendingAuth(discordUserId);

                            // 히스토리에 등록 기록 추가
                            await database.addAccountHistory(
                                discordUserId,
                                pendingAccount.google_email,
                                'REGISTER',
                                '구글계정등록 명령어를 통한 계정 등록'
                            );

                            // 시트 결과를 포함한 성공 메시지 생성
                            let sheetStatusText = '';
                            if (sheetResults.totalSheets > 1) {
                                sheetStatusText = `\n• ${sheetResults.successCount}/${sheetResults.totalSheets}개 시트 권한 부여`;
                                if (sheetResults.errorCount > 0) {
                                    sheetStatusText += ` (${sheetResults.errorCount}개 실패)`;
                                }
                            } else {
                                sheetStatusText = '\n• 구글 시트 편집 권한 부여';
                            }

                            const successEmbed = new EmbedBuilder()
                                .setColor(0x00FF00)
                                .setTitle('✅ 계정 등록 완료')
                                .setDescription(`**${pendingAccount.google_email}** 계정이 성공적으로 등록되었습니다.`)
                                .addFields(
                                    {
                                        name: '🎉 완료된 작업',
                                        value: `• 구글 계정 인증 완료${sheetStatusText}\n• 계정 연결 정보 저장`
                                    },
                                    {
                                        name: '📌 다음 단계',
                                        value: '이제 구글 시트를 편집할 수 있습니다!\n시트에서 공유 알림 이메일을 확인해주세요.'
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

                            console.log(`사용자 계정 등록 완료: ${discordUserId} -> ${pendingAccount.google_email}`);

                        } catch (error) {
                            console.error('시트 권한 부여 오류:', error);

                            // 원본 메시지를 오류 상태로 바꿈
                            const errorEmbed = new EmbedBuilder()
                                .setColor(0xFF4444)
                                .setTitle('❌ 권한 부여 실패')
                                .setDescription(`시트 권한 부여에 실패했습니다: ${error.message}`)
                                .addFields({
                                    name: '💡 해결 방법',
                                    value: '• 잠시 후 다시 시도해주세요\n• 문제가 지속되면 관리자에게 문의해주세요'
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
                            .setDescription('아직 브라우저에서 인증이 완료되지 않았습니다.')
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
                    console.error('인증 완료 처리 중 오류:', error);

                    // 원본 메시지를 오류 상태로 바꿈
                    const errorEmbed = new EmbedBuilder()
                        .setColor(0xFF4444)
                        .setTitle('❌ 인증 오류')
                        .setDescription(`인증 완료 처리 중 오류가 발생했습니다: ${error.message}`)
                        .addFields({
                            name: '💡 해결 방법',
                            value: '• 잠시 후 다시 시도해주세요\n• 문제가 지속되면 관리자에게 문의해주세요'
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