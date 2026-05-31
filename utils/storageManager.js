import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export default class StorageManager {
  constructor({ cachePath, dbPath, cacheLimitGB }) {
    this.cachePath = cachePath;
    this.dbPath = dbPath;
    this.cacheLimitBytes = cacheLimitGB * 1024 ** 3;

    if (!fs.existsSync(this.cachePath)) fs.mkdirSync(this.cachePath, { recursive: true });
    this.db = new Database(this.dbPath);
    this.initDb();
  }

  initDb() {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS tracks (
          source TEXT PRIMARY KEY,
          title TEXT,
          artist TEXT,
          path TEXT,
          size INTEGER,
          duration REAL,
          thumbnail TEXT,
          play_count INTEGER DEFAULT 0,
          last_played TEXT,
          created_at TEXT,
          updated_at TEXT
        )`
      )
      .run();
  }

  sanitizeFileName(input) {
    return String(input)
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
  }

  async findLocalTrackBySource(source) {
    const track = this.db.prepare('SELECT * FROM tracks WHERE source = ?').get(source);
    if (!track) return null;
    if (!fs.existsSync(track.path)) {
      this.db.prepare('DELETE FROM tracks WHERE source = ?').run(source);
      return null;
    }
    return track;
  }

  async addOrUpdateTrack(metadata) {
    const timestamp = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tracks (source, title, artist, path, size, duration, thumbnail, play_count, last_played, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
            title = excluded.title,
            artist = excluded.artist,
            path = excluded.path,
            size = excluded.size,
            duration = excluded.duration,
            thumbnail = excluded.thumbnail,
            updated_at = excluded.updated_at`
      )
      .run(
        metadata.source,
        metadata.title,
        metadata.artist,
        metadata.path,
        metadata.size,
        metadata.duration,
        metadata.thumbnail,
        metadata.play_count || 0,
        timestamp,
        timestamp,
        timestamp
      );
  }

  incrementPlays(source) {
    this.db
      .prepare(
        `UPDATE tracks SET play_count = play_count + 1, last_played = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE source = ?`
      )
      .run(source);
  }

  async getCacheSizeBytes() {
    const files = await fs.promises.readdir(this.cachePath);
    let total = 0;
    for (const file of files) {
      try {
        const stats = await fs.promises.stat(path.join(this.cachePath, file));
        if (stats.isFile()) total += stats.size;
      } catch {
        continue;
      }
    }
    return total;
  }

  async cleanupIfNeeded() {
    let size = await this.getCacheSizeBytes();
    if (size <= this.cacheLimitBytes) return;

    const rows = this.db
      .prepare(
        `SELECT source, path, size FROM tracks ORDER BY play_count ASC, COALESCE(last_played, created_at) ASC`
      )
      .all();

    for (const row of rows) {
      if (size <= this.cacheLimitBytes) break;
      if (!fs.existsSync(row.path)) {
        this.db.prepare('DELETE FROM tracks WHERE source = ?').run(row.source);
        continue;
      }

      try {
        fs.unlinkSync(row.path);
        this.db.prepare('DELETE FROM tracks WHERE source = ?').run(row.source);
        size -= row.size;
        console.log(`🗑️ Cache temizlendi: ${row.path}`);
      } catch (error) {
        console.warn('Temizlik sırasında dosya silinemedi:', row.path, error.message);
      }
    }
  }

  startGarbageCollector() {
    setInterval(() => {
      this.cleanupIfNeeded().catch((error) => console.error('GC hata:', error));
    }, 1000 * 60 * 10);
  }

  prepareLocalPath(source, title) {
    const fileName = this.sanitizeFileName(title || source).slice(0, 220);
    return path.join(this.cachePath, `${fileName}.mp3`);
  }
}
