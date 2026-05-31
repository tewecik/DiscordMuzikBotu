import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Spotify/YouTube linkini çal veya arama yap')
    .addStringOption((option) =>
      option.setName('query').setDescription('Spotify/YouTube linki ya da arama metni').setRequired(true)
    ),
  async execute(interaction, audioManager) {
    await interaction.deferReply();
    const query = interaction.options.getString('query', true);
    await audioManager.play(interaction, query);
  }
};
