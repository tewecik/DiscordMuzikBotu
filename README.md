# 🎛️ Discord Müzik Botu

> **Tek sunuculuk, yüksek performans, akıllı önbellek ve modern bir kontrol paneli** sunar.

## ✨ Özellikler

- **Discord.js v14+** ile profesyonel ses oynatma mimarisi
- **dotenv** ile tüm gizli veriler yönetilir: `DISCORD_TOKEN`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `COOKIES_PATH`
- **SpotDL entegrasyonu** ile Spotify linklerinden otomatik indirme ve önbellekleme
- **YouTube 403 koruması** için `yt-dlp` kullanımı
- **Yerel önbellek**: `/music_cache`
- **80 GB LRU Garbage Collector** ile otomatik temizlik
- **Etkileşimli oynatma paneli**: Embed, ilerleme çubuğu ve düğmeler
- **Button kontrol paneli**: Durdur/Oynat, Atla, Ses Artır, Ses Azalt
- **Modüler tasarım**: `index.js`, `/commands`, `/utils`

## 🛠️ Sistem Gereksinimleri

- Node.js `>=18`
- `npm install` ile paketler
- **FFmpeg** (sistem PATH'inde veya `ffmpeg-static` paketi)
- **Python 3.x** ve `spotdl` CLI
- **80 GB boş disk alanı** / yerel önbellek için
- Geçerli `cookies.txt` dosyası (YouTube 403 için)

## 🚀 Kurulum

1. Proje klasörünü açın.
2. `npm install` çalıştırın.
3. `.env.example` dosyasını kopyalayın ve `.env` olarak yeniden adlandırın.
4. `.env` içindeki değerleri doldurun.
5. `cookies.txt` dosyasını aynı dizine koyun veya `COOKIES_PATH` içinde yolunu güncelleyin.
6. `spotdl` CLI ile Spotify indirmeye izin verin. Örnek:

```bash
python -m pip install spotdl
```

7. Slash komutlarını kayıt etmek için:

```bash
npm run deploy
```

7. Botu başlatmak için:

```bash
npm start
```

## 🎮 Slash Komutları

- `/play query:<Spotify veya YouTube linki veya arama>`
- `/skip`
- `/pause`
- `/resume`
- `/volume level:<1-200>`

## 🧠 Mimari Şema

```text
index.js
  ├─ /commands
  │    ├─ play.js
  │    ├─ skip.js
  │    ├─ pause.js
  │    ├─ resume.js
  │    └─ volume.js
  ├─ /utils
  │    ├─ storageManager.js
  │    ├─ audioManager.js
  │    └─ ytDownloader.js
  └─ /music_cache
```

## 🔧 Nasıl Çalışır

1. **Bot açılışta** `.env` ve `cookies.txt` kontrolü yapar.
2. **Slash komut** geldiğinde, önce yerelde var mı diye bakar.
3. Yoksa `spotdl` veya `yt-dlp` ile indirir.
4. **80 GB limiti** aşıldığında en az kullanılan şarkıları otomatik siler.
5. Oynatma paneli her **15 saniyede** güncellenir.

## 🧩 Sorun Giderme

- **Bot başlamıyor?** `.env` içindeki değerlerin doğru ve `cookies.txt` yolunun geçerli olduğundan emin olun.
- **403 hataları?** `cookies.txt` dosyası YouTube için gereklidir.
- **Ses yok?** Sunucuda botun ses kanalına girme ve `CONNECT`, `SPEAK` izinlerini kontrol et.
- **Cache dolu mu?** `CACHE_LIMIT_GB` değerini `.env` üzerinden ayarlayabilir veya `music_cache` klasörünü silebilirsiniz.

## 💡 Notlar

- Kod tamamen **gizli veri saklamadan** çalışır.
- `data/bot.db` çalışma zamanında yaratılır.
- `music_cache` içinde indirilen şarkılar yönetilir.

---

> Bu proje, **iyi yapılandırılmış, modüler ve genişletilebilir bir Discord müzik botu temelidir.**

## Lisans

- Bu proje MIT Lisansı ile lisanslanmıştır — detaylar için `LICENSE` dosyasına bakın.
- Not: Kullanıcının isteği üzerine README'de belirtilmiştir: "Tüm hakları saklıdır." (Bu ifade MIT lisansı ile çelişebilir; lisans metni `LICENSE` dosyasında hüküm sahibidir.)
