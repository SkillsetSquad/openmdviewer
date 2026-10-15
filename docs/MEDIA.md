# Audio and video

Import media alongside Markdown, keeping relative paths. Playback uses the browser's native controls; documents remain in IndexedDB and imported media works offline after the application is cached.

```html
<video
  title="Product walkthrough"
  src="media/walkthrough.webm"
  poster="media/poster.png"
>
  <track
    src="media/english.vtt"
    kind="captions"
    srclang="en"
    label="English"
    default
  />
</video>

<audio title="Interview" src="media/interview.mp3">
  <track
    src="media/interview.vtt"
    kind="captions"
    srclang="en"
    label="English"
    default
  />
</audio>
```

Native controls provide playback, seeking, volume, and mute. Additional controls select playback speed and captions. Fullscreen and picture-in-picture appear when the browser reports support; a refused request produces a message. Audio captions appear beneath the controls. Duration and video dimensions come from the media element. Original imported files can be downloaded without conversion, including files the browser cannot decode.

Multiple `<source src="...">` entries provide a source selector. Only the selected source is passed to the browser; choosing another remote source requires its own consent. Source selection is manual, so a codec failure cannot silently contact another host.

## Privacy and limitations

Remote media, posters, and each caption URL are blocked separately until the reader clicks their load button. Consent lasts for the rendered document session. Autoplay, event handlers, and other imported executable attributes are removed. Arbitrary `blob:`, `data:`, and filesystem URLs in source documents are not trusted; local resources resolve through the imported asset registry.

Remote captions require a readable CORS response. They are fetched without credentials or a referrer, checked for a WebVTT header, limited to 10 MiB, and presented through a temporary local Blob URL. Pending requests abort and owned caption URLs are revoked when their player closes. Imported caption files use the browser's WebVTT parser. SubRip/SRT conversion is not implemented. Remote playback and posters use native browser requests, subject to the browser's network, origin, mixed-content, and codec restrictions. There is no proxy or transcoding server.

Imported formats include MP3, WAV, OGG, M4A, AAC, FLAC, Opus, MP4, WebM, OGV, and VTT captions. File extension support does not guarantee a browser can decode the container's actual codec. Missing or undecodable media displays a fallback. Media players are omitted from print output.

Automated Chromium coverage verifies actual local WebM and WAV playback, WebVTT cues and selection, speed, fullscreen when available, original byte downloads, offline reload/playback, mobile page width, serious/critical accessibility findings, independent remote consent, invalid caption rejection, and decode-error fallbacks. Picture-in-picture behavior and other browsers still require manual certification.
