const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('메세지')
        .setDescription('봇이 메시지를 대신 전송합니다 (모달 창에서 여러 줄 입력 가능)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // 모달 생성
        const modal = new ModalBuilder()
            .setCustomId('message_modal')
            .setTitle('메시지 작성');

        // 텍스트 입력 필드 생성 (여러 줄 가능)
        const messageInput = new TextInputBuilder()
            .setCustomId('message_content')
            .setLabel('메시지 내용')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('여기에 전송할 메시지를 입력하세요...\n여러 줄 입력이 가능합니다.')
            .setRequired(true)
            .setMaxLength(2000);

        // ActionRow에 텍스트 입력 추가
        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        // 모달 표시
        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'message_modal') return;

        const messageContent = interaction.fields.getTextInputValue('message_content');

        // 메시지 내용 검증
        if (!messageContent || messageContent.trim().length === 0) {
            return interaction.reply({
                content: '❌ 메시지 내용을 입력해주세요.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // 봇이 해당 채널에 메시지를 보낼 권한이 있는지 확인
            const botPermissions = interaction.channel.permissionsFor(interaction.guild.members.me);
            if (!botPermissions.has('SendMessages')) {
                return interaction.reply({
                    content: '❌ 봇이 이 채널에 메시지를 보낼 권한이 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // 먼저 응답
            await interaction.reply({
                content: '✅ 메시지를 전송했습니다.',
                flags: MessageFlags.Ephemeral
            });

            // 봇이 메시지 전송
            await interaction.channel.send(messageContent);

            logger.info(`메시지 전송 완료 - 사용자: ${interaction.user.tag}, 채널: ${interaction.channel.name}`);
        } catch (error) {
            logger.error('메시지 전송 실패:', error);
            await interaction.reply({
                content: '❌ 메시지 전송에 실패했습니다. 봇의 권한을 확인해주세요.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};