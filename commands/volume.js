import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ses seviyesini ayarla')
    .addIntegerOption((option) =>
      option.setName('level').setDescription('Ses seviyesi (%). 1-200 arası.').setRequired(true)
    ),
  async execute(interaction, audioManager) {
    await interaction.deferReply();
    const level = interaction.options.getInteger('level', true);
    await audioManager.setVolume(interaction, level);
  }
};
