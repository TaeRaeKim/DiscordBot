const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../utils/logManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('메시지')
        .setDescription('봇이 메시지를 대신 전송합니다.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('멘션')
                .setDescription('멘션할 대상 (@사용자, @역할, @everyone, @here) (선택사항)')
                .setRequired(false)),

    async execute(interaction) {
        // 슬래시 명령어에서 멘션 가져오기
        const mentionTarget = interaction.options.getString('멘션');

        // 멘션이 입력된 경우에만 유효성 검사 (null이 아니고 빈 문자열도 아닌 경우)
        if (mentionTarget && mentionTarget.trim() !== '') {
            // 허용되는 멘션 형식 체크
            const isValidMention =
                mentionTarget === '@everyone' ||
                mentionTarget === 'everyone' ||
                mentionTarget === '@here' ||
                mentionTarget === 'here' ||
                mentionTarget.match(/^<@!?(\d+)>$/) ||  // 사용자 멘션
                mentionTarget.match(/^<@&(\d+)>$/);     // 역할 멘션

            if (!isValidMention) {
                return interaction.reply({
                    content: '❌ 잘못된 멘션 형식입니다.\n\n' +
                            '**지원하는 멘션 형식:**\n' +
                            '• Discord 자동완성을 사용한 사용자/역할 선택\n' +
                            '• `@everyone` 또는 `everyone`\n' +
                            '• `@here` 또는 `here`\n\n' +
                            '💡 슬래시 명령어 입력 시 Discord 자동완성을 사용해주세요.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // 모달 생성 시 멘션 타겟 정보를 customId에 포함 (Base64로 인코딩하여 특수문자 처리)
        const customId = (mentionTarget && mentionTarget.trim() !== '')
            ? `message_modal_${Buffer.from(mentionTarget).toString('base64')}`
            : 'message_modal';
        const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle('메시지 작성');

        // 텍스트 입력 필드 생성 (여러 줄 가능)
        const messageInput = new TextInputBuilder()
            .setCustomId('message_content')
            .setLabel('메시지 내용')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('여기에 전송할 메시지를 입력하세요...')
            .setRequired(true)
            .setMaxLength(2000);

        // ActionRow에 텍스트 입력 추가
        const actionRow = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(actionRow);

        // 모달 표시
        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        // customId에서 멘션 타겟 추출
        if (!interaction.customId.startsWith('message_modal')) return;

        let mentionTarget = null;
        if (interaction.customId !== 'message_modal' && interaction.customId.includes('_')) {
            const parts = interaction.customId.split('_');
            if (parts.length > 2 && parts[2]) {
                try {
                    const base64Target = parts[2];
                    mentionTarget = Buffer.from(base64Target, 'base64').toString();
                } catch (error) {
                    logger.warn('Base64 디코딩 오류:', error);
                }
            }
        }

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

            // 최종 메시지 생성
            let finalMessage = messageContent;

            // 멘션 타겟이 있는 경우 메시지 앞에 멘션 추가
            if (mentionTarget) {
                // @everyone 또는 @here 처리 (특별한 경우)
                if (mentionTarget === '@everyone' || mentionTarget === 'everyone') {
                    finalMessage = `@everyone\n${messageContent}`;
                } else if (mentionTarget === '@here' || mentionTarget === 'here') {
                    finalMessage = `@here\n${messageContent}`;
                }
                // Discord 멘션 형식은 그대로 사용 (이미 유효성 검사를 통과했음)
                else {
                    finalMessage = `${mentionTarget}\n${messageContent}`;
                }
            }

            // 먼저 응답
            await interaction.reply({
                content: '✅ 메시지를 전송했습니다.',
                flags: MessageFlags.Ephemeral
            });

            // 봇이 메시지 전송
            await interaction.channel.send(finalMessage);
        } catch (error) {
            logger.error('메시지 전송 실패:', error);
            await interaction.reply({
                content: '❌ 메시지 전송에 실패했습니다. 봇의 권한을 확인해주세요.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};