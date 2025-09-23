const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { loadPendingMembers, savePendingMembers } = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('타이머취소')
        .setDescription('특정 멤버의 타이머를 취소합니다')
        .addUserOption(option =>
            option.setName('사용자')
                .setDescription('타이머를 취소할 사용자')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('사용자');

        const key = `${interaction.guild.id}_${targetUser.id}`;
        const pendingMembers = await loadPendingMembers(interaction.guild.id);

        if (pendingMembers[key]) {
            delete pendingMembers[key];
            await savePendingMembers(interaction.guild.id, pendingMembers);
            return interaction.reply(`✅ ${targetUser.tag}의 타이머를 취소했습니다.`);
        } else {
            return interaction.reply({
                content: `❌ ${targetUser.tag}은 대기 목록에 없습니다.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};