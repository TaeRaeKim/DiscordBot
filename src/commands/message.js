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

        // 모달 생성 시 멘션 타겟 정보를 customId에 포함 (Base64로 인코딩하여 특수문자 처리)
        const customId = mentionTarget ? `message_modal_${Buffer.from(mentionTarget).toString('base64')}` : 'message_modal';
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
        if (interaction.customId.includes('_')) {
            const base64Target = interaction.customId.split('_')[2];
            mentionTarget = Buffer.from(base64Target, 'base64').toString();
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
                // @everyone 또는 @here 처리
                if (mentionTarget === '@everyone' || mentionTarget === 'everyone') {
                    finalMessage = `@everyone\n${messageContent}`;
                } else if (mentionTarget === '@here' || mentionTarget === 'here') {
                    finalMessage = `@here\n${messageContent}`;
                }
                // 역할 멘션 처리 (@역할이름 또는 역할ID)
                else if (mentionTarget.startsWith('@')) {
                    const roleName = mentionTarget.substring(1);
                    const role = interaction.guild.roles.cache.find(r => r.name === roleName);
                    if (role) {
                        finalMessage = `<@&${role.id}>\n${messageContent}`;
                    } else {
                        // 역할을 찾을 수 없으면 원본 메시지만 전송
                        logger.warn(`역할을 찾을 수 없음: ${roleName}`);
                    }
                }
                // 사용자 멘션 처리 (사용자ID 또는 사용자태그)
                else {
                    try {
                        // 숫자로만 이루어진 경우 사용자 ID로 처리
                        if (/^\d+$/.test(mentionTarget)) {
                            const user = await interaction.client.users.fetch(mentionTarget);
                            if (user) {
                                finalMessage = `<@${user.id}>\n${messageContent}`;
                            }
                        }
                        // 사용자 태그 형식 (예: username#0000)인 경우
                        else if (mentionTarget.includes('#')) {
                            const [username, discriminator] = mentionTarget.split('#');
                            const member = interaction.guild.members.cache.find(m =>
                                m.user.username === username && m.user.discriminator === discriminator
                            );
                            if (member) {
                                finalMessage = `<@${member.user.id}>\n${messageContent}`;
                            }
                        }
                        // 사용자 이름으로 검색
                        else {
                            const member = interaction.guild.members.cache.find(m =>
                                m.user.username === mentionTarget || m.displayName === mentionTarget
                            );
                            if (member) {
                                finalMessage = `<@${member.user.id}>\n${messageContent}`;
                            }
                        }
                    } catch (error) {
                        // 사용자를 찾을 수 없는 경우 무시하고 원본 메시지만 전송
                        logger.warn(`사용자를 찾을 수 없음: ${mentionTarget}`);
                    }
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