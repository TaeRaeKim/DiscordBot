const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');
const googleSheets = require('../utils/googleSheets');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('멤버표검사')
        .setDescription('구글 시트에는 있지만 Discord 서버에는 없는 멤버를 검사합니다'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            if (!config.googleSheetId || !config.googleSheetGid) {
                return await interaction.editReply({
                    content: '❌ 구글 시트 설정이 config.json에 없습니다.\n`googleSheetId`와 `googleSheetGid`를 설정해주세요.',
                    ephemeral: true
                });
            }

            const sheetNicknames = await googleSheets.getMemberNicknames(
                config.googleSheetId,
                config.googleSheetGid,
                config.nicknameColumn || 0,
                config.googleSheetCellRange || 'A:A',
                config.startRow || 1
            );

            if (sheetNicknames.length === 0) {
                return await interaction.editReply({
                    content: '⚠️ 구글 시트에서 닉네임을 찾을 수 없습니다.',
                    ephemeral: true
                });
            }

            const guild = interaction.guild;
            await guild.members.fetch();

            const discordMembers = guild.members.cache;
            const discordNicknames = new Set();

            discordMembers.forEach(member => {
                const displayName = member.displayName;
                const username = member.user.username;

                discordNicknames.add(displayName);
                discordNicknames.add(username);

                const nicknameMatch = displayName.match(/(.+?)(?:\s*\[.+?\])?$/);
                if (nicknameMatch && nicknameMatch[1]) {
                    discordNicknames.add(nicknameMatch[1].trim());
                }
            });

            const missingMembers = sheetNicknames.filter(sheetNickname => {
                const trimmedNickname = sheetNickname.trim();

                const exists = Array.from(discordNicknames).some(discordNickname => {
                    return discordNickname.toLowerCase() === trimmedNickname.toLowerCase() ||
                           discordNickname.includes(trimmedNickname) ||
                           trimmedNickname.includes(discordNickname);
                });

                return !exists;
            });

            const embed = new EmbedBuilder()
                .setTitle('📊 멤버표 검사 결과')
                .setColor(missingMembers.length > 0 ? 0xFF6B6B : 0x4ECDC4)
                .setTimestamp();

            if (missingMembers.length === 0) {
                embed.setDescription('✅ 모든 구글 시트 멤버가 Discord 서버에 존재합니다.')
                    .addFields({
                        name: '📈 통계',
                        value: `• 구글 시트 멤버: ${sheetNicknames.length}명\n• Discord 서버 멤버: ${discordMembers.size}명`,
                        inline: false
                    });
            } else {
                embed.setDescription(`⚠️ 구글 시트에는 있지만 Discord 서버에 없는 멤버가 **${missingMembers.length}명** 발견되었습니다.`)
                    .addFields(
                        {
                            name: '📈 통계',
                            value: `• 구글 시트 멤버: ${sheetNicknames.length}명\n• Discord 서버 멤버: ${discordMembers.size}명\n• 누락된 멤버: ${missingMembers.length}명`,
                            inline: false
                        },
                        {
                            name: '👥 누락된 멤버 목록',
                            value: missingMembers.length > 10
                                ? missingMembers.slice(0, 10).map((name, index) => `${index + 1}. ${name}`).join('\n') + `\n... 외 ${missingMembers.length - 10}명`
                                : missingMembers.map((name, index) => `${index + 1}. ${name}`).join('\n'),
                            inline: false
                        }
                    );

                if (missingMembers.length > 10) {
                    const fullList = missingMembers.join('\n');
                    const buffer = Buffer.from(fullList, 'utf-8');

                    await interaction.editReply({
                        embeds: [embed],
                        files: [{
                            attachment: buffer,
                            name: 'missing_members.txt',
                            description: '누락된 멤버 전체 목록'
                        }],
                        ephemeral: true
                    });
                    return;
                }
            }

            await interaction.editReply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('[멤버표검사] 오류:', error);

            let errorMessage = '❌ 멤버표 검사 중 오류가 발생했습니다.';

            if (error.message.includes('credentials.json')) {
                errorMessage = '❌ Google 서비스 계정 인증 파일(credentials.json)을 설정해주세요.';
            } else if (error.message.includes('권한이 없습니다')) {
                errorMessage = '❌ 구글 시트에 접근 권한이 없습니다. 시트를 서비스 계정과 공유했는지 확인해주세요.';
            } else if (error.message.includes('시트를 찾을 수 없습니다')) {
                errorMessage = '❌ 지정된 구글 시트를 찾을 수 없습니다. ID와 GID를 확인해주세요.';
            }

            await interaction.editReply({
                content: `${errorMessage}\n\`\`\`${error.message}\`\`\``,
                ephemeral: true
            });
        }
    },
};