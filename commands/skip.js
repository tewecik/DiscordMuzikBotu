import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('skip').setDescription('Şu anki şarkıyı atla'),
  async execute(interaction, audioManager) {
    await interaction.deferReply();
    await audioManager.skip(interaction);
  }
};
