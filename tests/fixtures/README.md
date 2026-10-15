# Media fixtures

`local-video.webm` is an original synthetic one-second, silent, blue 64 × 48 VP8 clip generated with FFmpeg:

```sh
ffmpeg -f lavfi -i color=c=0x2589e8:s=64x48:r=10:d=1 -c:v libvpx -an local-video.webm
```

Media browser tests generate a one-second silent PCM WAV and small WebVTT caption files in memory. No external recordings or licensed material are used.
