import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import ytdlp from 'yt-dlp-exec';
import ffprobeStatic from 'ffprobe-static';

const execFileAsync = promisify(execFile);

function sanitizeFileName(input) {
  return String(input)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function isSpotifyLink(query) {
  return /(spotify\.com|open\.spotify\.com|spotify:)/i.test(query);
}

function isUrl(query) {
  return /^(https?:)?\/\//i.test(query) || /^(spotify|youtube|youtu)[:]/i.test(query);
}

async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(ffprobeStatic.path, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

function resolveSpotdlBinary() {
  const local = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'spotdl.cmd' : 'spotdl');
  return local;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function downloadWithSpotDL(query, cachePath) {
  const fileMask = '%(title)s.%(ext)s';
  const outputTemplate = path.join(cachePath, fileMask);
  const spotdlPath = resolveSpotdlBinary();
  const command = spotdlPath;
  const args = ['--output', outputTemplate, '--no-metadata', '--format', 'mp3', query];

  await runProcess(command, args);

  const files = await fs.readdir(cachePath);
  const candidates = files.filter((file) => file.toLowerCase().endsWith('.mp3'));
  if (candidates.length === 0) {
    throw new Error('SpotDL dosya indirimi başarısız oldu.');
  }

  let latest = candidates[0];
  let latestMtime = 0;
  for (const file of candidates) {
    const stats = await fs.stat(path.join(cachePath, file));
    if (stats.mtimeMs > latestMtime) {
      latestMtime = stats.mtimeMs;
      latest = file;
    }
  }

  const filePath = path.join(cachePath, latest);
  const title = path.basename(filePath, path.extname(filePath));
  const duration = await probeDuration(filePath);
  const size = (await fs.stat(filePath)).size;
  return {
    filePath,
    title,
    artist: 'Spotify kaynağı',
    duration,
    thumbnail: 'https://i.imgur.com/HNbO0yn.png',
    size
  };
}

async function downloadWithYtDlp(query, cachePath, cookiesPath) {
  const metadataQuery = isUrl(query) ? query : `ytsearch1:${query}`;
  const infoResult = await ytdlp(metadataQuery, {
    dumpSingleJson: true,
    cookie: cookiesPath || undefined,
    noWarnings: true,
    quiet: true,
    noCallHome: true
  });
  const metadata = typeof infoResult === 'string' ? JSON.parse(infoResult) : infoResult;
  const title = sanitizeFileName(metadata.title || query);
  const filePath = path.join(cachePath, `${title}.mp3`);

  await ytdlp(metadataQuery, {
    output: filePath,
    extractAudio: true,
    audioFormat: 'mp3',
    format: 'bestaudio',
    cookie: cookiesPath || undefined,
    restrictFilenames: true,
    noWarnings: true,
    quiet: true,
    noCallHome: true
  });

  const duration = Number(metadata.duration) || (await probeDuration(filePath));
  const size = (await fs.stat(filePath)).size;

  return {
    filePath,
    title: metadata.title || title,
    artist: metadata.uploader || 'Bilinmeyen sanatçı',
    duration,
    thumbnail: metadata.thumbnail || 'https://i.imgur.com/HNbO0yn.png',
    size
  };
}

export async function downloadAudio(query, cachePath, cookiesPath) {
  if (isSpotifyLink(query)) {
    return downloadWithSpotDL(query, cachePath);
  }
  return downloadWithYtDlp(query, cachePath, cookiesPath);
}
