const { MessageFlags } = require('discord.js');
const logger = require('../utils/logManager');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction, commands, commandHandlers, config) {
        // 첫 번째 인자가 interaction인 경우 처리 (Discord.js 기본 동작)
        if (!interaction && client.isChatInputCommand) {
            interaction = client;
        }

        if (!interaction || !interaction.isChatInputCommand || !interaction.isChatInputCommand()) {
            return;
        }

        logger.info(`명령어 실행 시도: ${interaction.commandName} by ${interaction.user.tag}`);

        // 권한 확인 (서버 관리 권한 필요)
        if (!interaction.member.permissions.has('ManageGuild')) {
            logger.warn(`권한 부족: ${interaction.user.tag}가 ${interaction.commandName} 실행 시도`);
            return interaction.reply({
                content: '❌ 이 명령어를 사용할 권한이 없습니다.',
                flags: MessageFlags.Ephemeral
            });
        }

        const { commandName } = interaction;

        // 해당 명령어의 핸들러 실행
        if (commandHandlers && commandHandlers[commandName]) {
            try {
                await commandHandlers[commandName].execute(interaction, config);
            } catch (error) {
                logger.error(`명령어 ${commandName} 실행 오류:`, error);

                const errorMessage = {
                    content: '❌ 명령어 실행 중 오류가 발생했습니다.',
                    flags: MessageFlags.Ephemeral
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else {
            logger.error(`명령어 핸들러를 찾을 수 없음: ${commandName}`);

            await interaction.reply({
                content: '❌ 명령어를 찾을 수 없습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};