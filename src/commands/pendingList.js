const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { loadPendingMembers } = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('대기목록')
        .setDescription('현재 대기 중인 멤버 목록을 보여줍니다'),

    async execute(interaction) {
        // 먼저 defer로 응답 (3초 시간 초과 방지)
        await interaction.deferReply();

        const pendingMembers = loadPendingMembers();
        const guildPending = Object.values(pendingMembers).filter(data => data.guildId === interaction.guild.id);

        if (guildPending.length === 0) {
            return interaction.editReply({
                content: '현재 대기 중인 멤버가 없습니다.'
            });
        }

        const maxFieldsPerPage = 25;
        const totalPages = Math.ceil(guildPending.length / maxFieldsPerPage);
        let currentPage = 1;

        // 첫 페이지 생성
        const createEmbed = async (page) => {
            const start = (page - 1) * maxFieldsPerPage;
            const end = Math.min(start + maxFieldsPerPage, guildPending.length);
            const pageData = guildPending.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor('#ffff00')
                .setTitle('📋 대기 중인 멤버 목록')
                .setDescription(`총 **${guildPending.length}**명이 대기 중입니다.`)
                .setFooter({ text: `페이지 ${page}/${totalPages}` });

            // 현재 페이지 멤버들 처리
            for (let i = 0; i < pageData.length; i++) {
                const data = pageData[i];
                const timeLeft = data.kickTime - Date.now();
                const totalMinutes = Math.max(0, Math.floor(timeLeft / 1000 / 60));
                const hoursLeft = Math.floor(totalMinutes / 60);
                const minutesLeft = totalMinutes % 60;

                // 현재 멤버 정보 가져오기
                try {
                    const member = await interaction.guild.members.fetch(data.memberId).catch(() => null);
                    const currentNickname = member ? member.displayName : '멤버를 찾을 수 없음';

                    embed.addFields({
                        name: `${start + i + 1}. ${data.username}`,
                        value: `현재 닉네임: **${currentNickname}**\n남은 시간: **${hoursLeft}시간 ${minutesLeft}분**`,
                        inline: true
                    });
                } catch (error) {
                    embed.addFields({
                        name: `${start + i + 1}. ${data.username}`,
                        value: `현재 닉네임: **알 수 없음**\n남은 시간: **${hoursLeft}시간 ${minutesLeft}분**`,
                        inline: true
                    });
                }
            }

            return embed;
        };

        const embed = await createEmbed(currentPage);

        // 페이지가 1개면 버튼 없이 전송
        if (totalPages <= 1) {
            return interaction.editReply({ embeds: [embed] });
        }

        // 버튼 생성
        const createButtons = (page) => {
            const row = new ActionRowBuilder();

            // 이전 페이지 버튼
            const prevButton = new ButtonBuilder()
                .setCustomId('prev_page')
                .setLabel('◀ 이전')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 1);

            // 페이지 정보 버튼
            const pageButton = new ButtonBuilder()
                .setCustomId('page_info')
                .setLabel(`${page}/${totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);

            // 다음 페이지 버튼
            const nextButton = new ButtonBuilder()
                .setCustomId('next_page')
                .setLabel('다음 ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages);

            row.addComponents(prevButton, pageButton, nextButton);
            return row;
        };

        const row = createButtons(currentPage);
        const response = await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // 버튼 클릭 이벤트 처리
        const collector = response.createMessageComponentCollector({
            time: 300000 // 5분 타임아웃
        });

        collector.on('collect', async (buttonInteraction) => {
            // 권한 확인
            if (!buttonInteraction.member.permissions.has('ManageGuild')) {
                return buttonInteraction.reply({
                    content: '❌ 이 버튼을 사용할 권한이 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (buttonInteraction.customId === 'prev_page' && currentPage > 1) {
                currentPage--;
            } else if (buttonInteraction.customId === 'next_page' && currentPage < totalPages) {
                currentPage++;
            } else {
                return buttonInteraction.deferUpdate();
            }

            const newEmbed = await createEmbed(currentPage);
            const newRow = createButtons(currentPage);

            await buttonInteraction.update({
                embeds: [newEmbed],
                components: [newRow]
            });
        });

        collector.on('end', async () => {
            // 타임아웃 시 버튼 비활성화
            try {
                const disabledRow = createButtons(currentPage);
                disabledRow.components.forEach(button => button.setDisabled(true));
                await response.edit({ components: [disabledRow] });
            } catch (error) {
                // 메시지가 삭제되었을 경우 무시
            }
        });
    }
};