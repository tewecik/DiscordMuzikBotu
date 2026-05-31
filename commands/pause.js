import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('pause').setDescription('Çalan şarkıyı duraklat'),
  async execute(interaction, audioManager) {
    await interaction.deferReply();
    await audioManager.pause(interaction);
  }
};
