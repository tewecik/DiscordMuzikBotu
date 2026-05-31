import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('resume').setDescription('Duraklatılmış şarkıyı devam ettir'),
  async execute(interaction, audioManager) {
    await interaction.deferReply();
    await audioManager.resume(interaction);
  }
};
