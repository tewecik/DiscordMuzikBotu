import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import StorageManager from './utils/storageManager.js';
import AudioManager from './utils/audioManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredKeys = ['DISCORD_TOKEN', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'COOKIES_PATH'];
const missing = requiredKeys.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('🚨 Eksik .env değişkenleri:', missing.join(', '));
  process.exit(1);
}

const cookiesPath = path.resolve(__dirname, process.env.COOKIES_PATH);
if (!fs.existsSync(cookiesPath) || !fs.statSync(cookiesPath).isFile()) {
  console.error(`🚨 cookies.txt bulunamadı veya geçersiz: ${cookiesPath}`);
  console.error('Lütfen .env içindeki COOKIES_PATH değerini kontrol edin ve geçerli bir cookies.txt sağlayın.');
  process.exit(1);
}

const musicCachePath = path.resolve(__dirname, process.env.MUSIC_CACHE_PATH || './music_cache');
const dbPath = path.resolve(__dirname, './data/bot.db');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (!fs.existsSync(musicCachePath)) fs.mkdirSync(musicCachePath, { recursive: true });

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
client.commands = new Collection();

const storageManager = new StorageManager({ cachePath: musicCachePath, dbPath, cacheLimitGB: Number(process.env.CACHE_LIMIT_GB || 80) });
const audioManager = new AudioManager(client, storageManager);

async function loadCommands() {
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter((file) => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(__dirname, 'commands', file);
    const command = await import(pathToFileURL(filePath).href);
    client.commands.set(command.default.data.name, command.default);
  }
}

async function deployCommands() {
  const data = client.commands.map((command) => command.data.toJSON());
  if (process.env.GUILD_ID) {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.set(data);
    console.log('✅ Slash komutları sunucuya kaydedildi:', process.env.GUILD_ID);
  } else {
    await client.application.commands.set(data);
    console.log('✅ Slash komutları global olarak kaydedildi.');
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot hazır: ${client.user.tag}`);
  storageManager.startGarbageCollector();

  if (process.argv.includes('--deploy-commands')) {
    try {
      await deployCommands();
    } catch (error) {
      console.error('🚨 Slash komutları deploy edilirken hata oluştu:', error);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, audioManager);
      return;
    }

    if (interaction.isButton()) {
      await audioManager.handleButton(interaction);
    }
  } catch (error) {
    console.error('🚨 Interaction sırasında hata:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Bir hata oluştu. Lütfen yöneticiye bildir.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Bir hata oluştu. Lütfen yöneticiye bildir.', ephemeral: true });
    }
  }
});

await loadCommands();
await client.login(process.env.DISCORD_TOKEN);
