import fs from 'node:fs';
import { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, joinVoiceChannel, StreamType } from '@discordjs/voice';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { downloadAudio } from './ytDownloader.js';

const CONTROL_IDS = {
  PLAY_PAUSE: 'music_play_pause',
  SKIP: 'music_skip',
  VOLUME_UP: 'music_volume_up',
  VOLUME_DOWN: 'music_volume_down'
};

export default class AudioManager {
  constructor(client, storageManager) {
    this.client = client;
    this.storage = storageManager;
    this.queues = new Map();
  }

  getQueue(guildId) {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, {
        tracks: [],
        volume: 0.8,
        player: null,
        connection: null,
        currentTrack: null,
        startTime: 0,
        message: null,
        progressLoop: null,
        textChannel: null
      });
    }
    return this.queues.get(guildId);
  }

  async play(interaction, query) {
    const guildId = interaction.guildId;
    const member = interaction.member;
    if (!member || !member.voice.channel) {
      return interaction.editReply({ content: '🎧 Lütfen önce bir ses kanalına katıl.', ephemeral: true });
    }

    const queue = this.getQueue(guildId);
    queue.textChannel = interaction.channel;

    const source = query.trim();
    let track = await this.storage.findLocalTrackBySource(source);

    if (!track) {
      const downloadPath = this.storage.prepareLocalPath(source, query);
      const metadata = await downloadAudio(source, this.storage.cachePath, process.env.COOKIES_PATH);
      track = {
        source,
        title: metadata.title,
        artist: metadata.artist || 'Bilinmeyen sanatçı',
        path: metadata.filePath,
        size: metadata.size,
        duration: metadata.duration,
        thumbnail: metadata.thumbnail,
        play_count: 0
      };
      await this.storage.addOrUpdateTrack(track);
      await this.storage.cleanupIfNeeded();
    } else {
      this.storage.incrementPlays(source);
    }

    queue.tracks.push(track);

    if (!queue.player || queue.player.state.status === AudioPlayerStatus.Idle) {
      await this.createPlayer(interaction, queue);
    } else {
      await interaction.editReply({ content: `✅ Sıraya eklendi: **${track.title}**`, ephemeral: false });
    }
  }

  async createPlayer(interaction, queue) {
    const voiceChannel = interaction.member.voice.channel;
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator
    });

    connection.subscribe(player);
    queue.connection = connection;
    queue.player = player;

    player.on('stateChange', async (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        queue.tracks.shift();
        if (queue.tracks.length > 0) {
          await this._playTrack(queue, queue.tracks[0]);
        } else {
          this.stopPlayback(queue);
        }
      }
    });

    player.on('error', (error) => {
      console.error('🔊 Oynatıcı hatası:', error.message);
      if (queue.textChannel) {
        queue.textChannel.send('❌ Ses oynatılırken hata oluştu. Lütfen tekrar deneyin.');
      }
    });

    await this._playTrack(queue, queue.tracks[0], interaction);
  }

  async _playTrack(queue, track, interaction = null) {
    if (!fs.existsSync(track.path)) {
      return queue.textChannel?.send('📁 Şarkı dosyası bulunamadı, tekrar indiriliyor...');
    }

    const resource = createAudioResource(fs.createReadStream(track.path), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true
    });
    resource.volume.setVolume(queue.volume);

    queue.player.play(resource);
    queue.currentTrack = track;
    queue.startTime = Date.now();

    const embed = this.buildEmbed(track, 0, queue.volume, queue.player.state.status === AudioPlayerStatus.Playing);
    const row = this.controlRow();

    if (interaction) {
      queue.message = await interaction.editReply({ embeds: [embed], components: [row] });
    } else if (queue.message) {
      await queue.message.edit({ embeds: [embed], components: [row] });
    }

    this.startProgressLoop(queue);
  }

  buildEmbed(track, elapsed, volume, isPlaying) {
    const duration = track.duration || 0;
    const progress = this.getProgressBar(elapsed, duration);

    return new EmbedBuilder()
      .setTitle(track.title)
      .setDescription(`**Sanatçı:** ${track.artist}\n**Ses:** ${Math.round(volume * 100)}%\n**Durum:** ${isPlaying ? 'Çalıyor ▶️' : 'Duraklatıldı ⏸️'}`)
      .setThumbnail(track.thumbnail || 'https://i.imgur.com/HNbO0yn.png')
      .addFields(
        { name: 'Süre', value: `${this.formatTime(elapsed)} / ${duration ? this.formatTime(duration) : '??:??'}`, inline: true },
        { name: 'Çubuk', value: progress, inline: false }
      )
      .setColor('#00ffff')
      .setFooter({ text: 'Müzik paneli her 15 saniyede yenilenir' });
  }

  controlRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CONTROL_IDS.PLAY_PAUSE).setLabel('Durdur/Oynat').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(CONTROL_IDS.SKIP).setLabel('Atla').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(CONTROL_IDS.VOLUME_UP).setLabel('Ses +10%').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(CONTROL_IDS.VOLUME_DOWN).setLabel('Ses -10%').setStyle(ButtonStyle.Danger)
    );
  }

  getProgressBar(elapsed, duration) {
    if (!duration || duration <= 0) return '⏳ Süre bilgisi yok';
    const length = 20;
    const progress = Math.min(1, elapsed / duration);
    const filled = Math.round(progress * length);
    const empty = length - filled;
    return `${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  async setVolume(interaction, level) {
    const queue = this.getQueue(interaction.guildId);
    if (!queue.currentTrack) {
      return interaction.editReply({ content: '🔇 Şu anda çalan bir parça yok.', ephemeral: true });
    }
    const clamped = Math.min(2.0, Math.max(0.01, level / 100));
    queue.volume = clamped;
    if (queue.player && queue.player.state.status === AudioPlayerStatus.Playing) {
      const resource = queue.player.state.resource;
      if (resource?.volume) resource.volume.setVolume(queue.volume);
    }
    await interaction.editReply({ content: `🔊 Ses seviyesi **${Math.round(clamped * 100)}%** olarak ayarlandı.`, ephemeral: false });
    await this.updateControlMessage(queue);
  }

  async skip(interaction) {
    const queue = this.getQueue(interaction.guildId);
    if (!queue.currentTrack) {
      return interaction.editReply({ content: '⏭️ Atlayacak bir parça yok.', ephemeral: true });
    }
    queue.player.stop(true);
    await interaction.editReply({ content: '⏭️ Şarkı atlandı.', ephemeral: false });
  }

  async pause(interaction) {
    const queue = this.getQueue(interaction.guildId);
    if (!queue.currentTrack || !queue.player) {
      return interaction.editReply({ content: '⏸️ Duraklatılacak bir parça yok.', ephemeral: true });
    }
    queue.player.pause();
    await interaction.editReply({ content: '⏸️ Şarkı duraklatıldı.', ephemeral: false });
    await this.updateControlMessage(queue);
  }

  async resume(interaction) {
    const queue = this.getQueue(interaction.guildId);
    if (!queue.currentTrack || !queue.player) {
      return interaction.editReply({ content: '▶️ Devam ettirilecek bir parça yok.', ephemeral: true });
    }
    queue.player.unpause();
    await interaction.editReply({ content: '▶️ Şarkı çalmaya devam ediyor.', ephemeral: false });
    await this.updateControlMessage(queue);
  }

  async handleButton(interaction) {
    const guildId = interaction.guildId;
    const queue = this.getQueue(guildId);
    if (!queue.currentTrack) {
      return interaction.reply({ content: 'Şu anda oynatılan bir şey yok.', ephemeral: true });
    }
    await interaction.deferUpdate();
    switch (interaction.customId) {
      case CONTROL_IDS.PLAY_PAUSE:
        if (queue.player.state.status === AudioPlayerStatus.Playing) {
          queue.player.pause();
        } else {
          queue.player.unpause();
        }
        break;
      case CONTROL_IDS.SKIP:
        queue.player.stop(true);
        break;
      case CONTROL_IDS.VOLUME_UP:
        queue.volume = Math.min(2.0, queue.volume + 0.1);
        queue.player.state.resource?.volume?.setVolume(queue.volume);
        break;
      case CONTROL_IDS.VOLUME_DOWN:
        queue.volume = Math.max(0.01, queue.volume - 0.1);
        queue.player.state.resource?.volume?.setVolume(queue.volume);
        break;
      default:
        break;
    }
    await this.updateControlMessage(queue);
  }

  async updateControlMessage(queue) {
    if (!queue.message || !queue.currentTrack) return;
    const elapsed = Math.floor((Date.now() - queue.startTime) / 1000);
    const embed = this.buildEmbed(queue.currentTrack, elapsed, queue.volume, queue.player.state.status === AudioPlayerStatus.Playing);
    try {
      await queue.message.edit({ embeds: [embed], components: [this.controlRow()] });
    } catch (error) {
      console.warn('Kontrol mesajı güncellenemedi:', error.message);
    }
  }

  startProgressLoop(queue) {
    if (queue.progressLoop) clearInterval(queue.progressLoop);
    queue.progressLoop = setInterval(() => {
      if (!queue.currentTrack || !queue.message) return;
      if (queue.player.state.status !== AudioPlayerStatus.Playing) return;
      this.updateControlMessage(queue).catch(console.error);
    }, 15000);
  }

  stopPlayback(queue) {
    if (queue.progressLoop) {
      clearInterval(queue.progressLoop);
      queue.progressLoop = null;
    }
    if (queue.connection) {
      queue.connection.destroy();
      queue.connection = null;
    }
    queue.currentTrack = null;
    queue.tracks = [];
    if (queue.message) {
      const stoppedEmbed = new EmbedBuilder().setTitle('🎵 Oynatma tamamlandı').setDescription('Sıradaki parça bulunamadı.').setColor('#ff0000');
      queue.message.edit({ embeds: [stoppedEmbed], components: [] }).catch(() => null);
      queue.message = null;
    }
  }
}
