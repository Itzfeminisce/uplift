# @uplift-io/video

Optional ffmpeg-backed synchronous video transforms and derived outputs for Uplift routes.

```ts
import { video } from "@uplift-io/uplift";
import { trim, transcode, thumbnail } from "@uplift-io/video";

export const clip = video()
  .transform(trim({ start: "00:00:01", end: "00:00:10" }), transcode({ format: "mp4", codec: "h264" }))
  .outputs(thumbnail("thumb", { at: "25%" }));
```

Video work runs during the upload request in v1. Production deployments should provide ffmpeg/ffprobe-capable hosts or set `UPLIFT_FFMPEG_PATH` and `UPLIFT_FFPROBE_PATH`.

The default processor shells out to the host binaries and creates real media artifacts for trim, transcode, compression, resize, crop, watermark, mute, frame-rate changes, thumbnails, posters, storyboards, and extracted audio. Tests or advanced deployments can inject a custom processor with `setVideoProcessor()` and restore the default with `resetVideoProcessor()`.

Transcode defaults are chosen for the requested container instead of copying streams blindly:

| Container | Default video codec | Default audio codec |
| --- | --- | --- |
| MP4 | H.264 (`libx264`) | AAC |
| MOV | H.264 (`libx264`) | AAC |
| WebM | VP9 (`libvpx-vp9`) | Opus (`libopus`) |

If you pass an explicit codec that is not compatible with the output container, `transcode()` throws before starting ffmpeg. For example, WebM rejects H.264 video and AAC audio.

Compression keeps the current output container and selects compatible codecs for it. MP4 and MOV outputs use H.264/AAC, WebM outputs use VP9/Opus, and unknown video extensions fail fast instead of producing ffmpeg arguments that cannot be muxed safely.
