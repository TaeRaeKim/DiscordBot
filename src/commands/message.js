const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const logger = require('../utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('메세지')
        .setDescription('봇이 메시지를 대신 전송합니다')
        .addStringOption(option =>
            option.setName('내용')
                .setDescription('봇이 전송할 메시지 내용')
                .setRequired(true)),

    async execute(interaction) {
        // 권한 확인 (서버 관리 권한 필요)
        if (!interaction.member.permissions.has('ManageGuild')) {
            return interaction.reply({
                content: '❌ 이 명령어를 사용할 권한이 없습니다.',
                flags: MessageFlags.Ephemeral
            });
        }

        const messageContent = interaction.options.getString('내용');

        // 메시지 내용 검증
        if (!messageContent || messageContent.trim().length === 0) {
            return interaction.reply({
                content: '❌ 메시지 내용을 입력해주세요.',
                flags: MessageFlags.Ephemeral
            });
        }

        // 메시지 길이 제한 (Discord 최대 2000자)
        if (messageContent.length > 2000) {
            return interaction.reply({
                content: '❌ 메시지가 너무 깁니다. (최대 2000자)',
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
                content: `✅ 메시지를 전송했습니다: "${messageContent}"`,
                flags: MessageFlags.Ephemeral
            });

            // 봇이 메시지 전송
            await interaction.channel.send(messageContent);
        } catch (error) {
            logger.error('메시지 전송 실패:', error);
            await interaction.reply({
                content: '❌ 메시지 전송에 실패했습니다. 봇의 권한을 확인해주세요.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};