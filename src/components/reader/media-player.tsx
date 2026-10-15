"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import type { Element } from "hast";
import { Maximize2, PictureInPicture2 } from "lucide-react";
import { describeResource, type LocalResource } from "@/lib/local-resources";
import { downloadLocalAsset } from "@/lib/documents";
import { describeImage } from "@/lib/images";
const Resources = createContext<{
  path: string;
  assets: Record<string, string>;
}>({ path: "", assets: {} });
export function MediaResources({
  path,
  assets,
  children,
}: {
  path: string;
  assets: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <Resources.Provider value={{ path, assets }}>{children}</Resources.Provider>
  );
}
const property = (node: Element, name: string) =>
  typeof node.properties[name] === "string"
    ? String(node.properties[name])
    : "";
function MediaPlayer({
  node,
  kind,
}: {
  node: Element;
  kind: "audio" | "video";
}) {
  const context = useContext(Resources);
  const references = [
    property(node, "src"),
    ...node.children.flatMap((child) =>
      child.type === "element" && child.tagName === "source"
        ? [property(child, "src")]
        : [],
    ),
  ].filter(Boolean);
  const sources = [...new Set(references)].map((reference) =>
    describeResource(reference, context.path, context.assets),
  );
  const [choice, setChoice] = useState("");
  const selected =
    sources.find((source) => source.reference === choice) || sources[0];
  const key = selected?.url || selected?.reference || "missing";
  const poster =
    kind === "video" && property(node, "poster")
      ? describeImage(
          property(node, "poster"),
          "",
          context.path,
          context.assets,
        )
      : undefined;
  const tracks = node.children.flatMap((child, index) => {
    if (
      child.type !== "element" ||
      child.tagName !== "track" ||
      !["captions", "subtitles", "descriptions"].includes(
        property(child, "kind") || "captions",
      )
    )
      return [];
    return [
      {
        resource: describeResource(
          property(child, "src"),
          context.path,
          context.assets,
        ),
        label: property(child, "label") || `Captions ${index + 1}`,
        language: property(child, "srcLang"),
        kind: property(child, "kind") || "captions",
        default: child.properties.default === true,
      },
    ];
  });
  const [allowed, setAllowed] = useState<Set<string>>(() => new Set());
  const permitted = (resource?: LocalResource) =>
    !!resource?.url &&
    (resource.source !== "remote" || allowed.has(resource.reference));
  const allow = (resource: LocalResource) =>
    setAllowed((previous) => new Set([...previous, resource.reference]));
  const usable = permitted(selected);
  const player = useRef<HTMLMediaElement | null>(null);
  const [details, setDetails] = useState<{
    key: string;
    duration: number;
    width: number;
    height: number;
    error?: string;
  } | null>(null);
  const current = details?.key === key ? details : null;
  const [rate, setRate] = useState(1);
  const [caption, setCaption] = useState(
    () =>
      tracks.find((track) => track.default && permitted(track.resource))
        ?.resource.reference || "",
  );
  const [captionURLs, setCaptionURLs] = useState<Record<string, string>>({});
  const ownedCaptions = useRef(new Map<string, string>());
  const captionRequests = useRef(new Set<AbortController>());
  useEffect(() => {
    const owned = ownedCaptions.current;
    const requests = captionRequests.current;
    return () => {
      for (const request of requests) request.abort();
      for (const url of owned.values()) URL.revokeObjectURL(url);
    };
  }, []);
  const [captionText, setCaptionText] = useState("");
  const [status, setStatus] = useState("");
  const [capabilities, setCapabilities] = useState({
    fullscreen: false,
    pip: false,
  });
  const activeTracks = tracks.filter(
    (track) =>
      permitted(track.resource) &&
      (track.resource.source !== "remote" ||
        !!captionURLs[track.resource.reference]),
  );
  const trackVersion = activeTracks
    .map((track) => track.resource.url)
    .join("\n");
  const selectedTrack = activeTracks.findIndex(
    (track) => track.resource.reference === caption,
  );
  useEffect(() => {
    const element = player.current;
    if (!element) return;
    const refresh = () => {
      const cues = Array.from(element.textTracks).flatMap((track) =>
        track.mode === "showing"
          ? Array.from(track.activeCues || []).map((cue) =>
              "text" in cue ? String(cue.text).replace(/<[^>]*>/g, "") : "",
            )
          : [],
      );
      setCaptionText(cues.join("\n"));
    };
    const listeners = new Set<TextTrack>();
    const attach = () => {
      for (const [index, track] of Array.from(element.textTracks).entries()) {
        track.mode = index === selectedTrack ? "showing" : "disabled";
        if (!listeners.has(track)) {
          listeners.add(track);
          track.addEventListener("cuechange", refresh);
        }
      }
    };
    attach();
    element.textTracks.addEventListener("addtrack", attach);
    return () => {
      for (const track of listeners)
        track.removeEventListener("cuechange", refresh);
      element.textTracks.removeEventListener("addtrack", attach);
    };
  }, [key, usable, trackVersion, selectedTrack]);
  const loadMetadata = () => {
    const element = player.current;
    if (!element) return;
    setDetails({
      key,
      duration: element.duration,
      width: element instanceof HTMLVideoElement ? element.videoWidth : 0,
      height: element instanceof HTMLVideoElement ? element.videoHeight : 0,
    });
    setRate(element.playbackRate);
    setCapabilities({
      fullscreen:
        kind === "video" &&
        !!document.fullscreenEnabled &&
        typeof element.requestFullscreen === "function",
      pip:
        element instanceof HTMLVideoElement &&
        !!document.pictureInPictureEnabled &&
        typeof element.requestPictureInPicture === "function",
    });
  };
  const captions = () => {
    const element = player.current;
    if (!element) return;
    for (const [index, track] of Array.from(element.textTracks).entries())
      track.mode =
        activeTracks[index]?.resource.reference === caption
          ? "showing"
          : "disabled";
  };
  const playerProps = {
    src: usable ? selected.url : undefined,
    controls: true,
    preload: "metadata",
    "aria-label":
      property(node, "title") ||
      `${kind === "video" ? "Video" : "Audio"} player`,
    onLoadedMetadata: loadMetadata,
    onRateChange: () => {
      if (player.current) setRate(player.current.playbackRate);
    },
    onError: () =>
      setDetails({
        key,
        duration: NaN,
        width: 0,
        height: 0,
        error:
          "This file could not be played. Check the import and this browser's codec support.",
      }),
  } as const;
  const loadCaption = async (resource: LocalResource) => {
    const controller = new AbortController();
    captionRequests.current.add(controller);
    try {
      if (!resource.url) return;
      const response = await fetch(resource.url, {
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok || !response.body)
        throw new Error("Caption bytes are unavailable.");
      const reader = response.body.getReader(),
        chunks: BlobPart[] = [];
      let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 10 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Captions exceed the 10 MiB read limit.");
        }
        chunks.push(part.value as BlobPart);
      }
      const value = new Blob(chunks, { type: "text/vtt" });
      if (
        !(await value.slice(0, 16).text())
          .replace(/^\uFEFF/, "")
          .startsWith("WEBVTT")
      )
        throw new Error("This caption file is not WebVTT.");
      if (controller.signal.aborted) return;
      const previous = ownedCaptions.current.get(resource.reference);
      if (previous) URL.revokeObjectURL(previous);
      const url = URL.createObjectURL(value);
      ownedCaptions.current.set(resource.reference, url);
      setCaptionURLs((old) => ({ ...old, [resource.reference]: url }));
      allow(resource);
      setCaption(resource.reference);
      setStatus("Captions loaded for this document session.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(
        error instanceof Error
          ? `Could not load captions: ${error.message}`
          : "The browser or server restricted caption access.",
      );
    } finally {
      captionRequests.current.delete(controller);
    }
  };
  const trackElements = activeTracks.map((track) => (
    <track
      key={track.resource.reference}
      src={captionURLs[track.resource.reference] || track.resource.url}
      kind={track.kind}
      srcLang={track.language || undefined}
      label={track.label}
      default={track.default}
      onLoad={captions}
      onError={() =>
        setStatus(
          "Captions could not be loaded. Check WebVTT format and browser access policy.",
        )
      }
    />
  ));
  return (
    <section
      className="media-player"
      aria-label={kind === "video" ? "Video playback" : "Audio playback"}
    >
      {sources.length > 1 && (
        <label className="media-source-select">
          Source
          <select
            aria-label="Media source"
            value={selected.reference}
            onChange={(event) => {
              player.current?.pause();
              setChoice(event.target.value);
              setCaption("");
              setCaptionText("");
            }}
          >
            {sources.map((source) => (
              <option key={source.reference} value={source.reference}>
                {source.reference}
              </option>
            ))}
          </select>
        </label>
      )}
      {!selected ? (
        <p className="media-resource-block">
          No supported media source was supplied.
        </p>
      ) : !usable ? (
        <ResourceNotice
          resource={selected}
          label={kind === "video" ? "Video" : "Audio"}
          allowed={permitted(selected)}
          onLoad={() => allow(selected)}
        />
      ) : (
        <>
          {kind === "video" ? (
            <video
              key={key}
              ref={(element) => {
                player.current = element;
              }}
              {...playerProps}
              poster={poster && permitted(poster) ? poster.url : undefined}
              playsInline
            >
              {trackElements}
            </video>
          ) : (
            <audio
              key={key}
              ref={(element) => {
                player.current = element;
              }}
              {...playerProps}
            >
              {trackElements}
            </audio>
          )}
          {current?.error && (
            <p role="alert" className="media-resource-block">
              {current.error}
            </p>
          )}
          <div className="media-player-tools">
            <label>
              Speed
              <select
                aria-label="Playback speed"
                value={rate}
                onChange={(event) => {
                  const element = player.current;
                  if (!element) return;
                  try {
                    element.playbackRate = Number(event.target.value);
                    setRate(element.playbackRate);
                  } catch {
                    setStatus("This browser could not change playback speed.");
                  }
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}×
                  </option>
                ))}
              </select>
            </label>
            {!!activeTracks.length && (
              <label>
                Captions
                <select
                  aria-label="Captions"
                  value={caption}
                  onChange={(event) => {
                    setCaption(event.target.value);
                    setCaptionText("");
                    const element = player.current;
                    if (element)
                      for (const [index, track] of Array.from(
                        element.textTracks,
                      ).entries())
                        track.mode =
                          activeTracks[index]?.resource.reference ===
                          event.target.value
                            ? "showing"
                            : "disabled";
                  }}
                >
                  <option value="">Off</option>
                  {activeTracks.map((track) => (
                    <option
                      key={track.resource.reference}
                      value={track.resource.reference}
                    >
                      {track.label}
                      {track.language ? ` (${track.language})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {capabilities.fullscreen && (
              <button
                onClick={async () => {
                  try {
                    if (document.fullscreenElement === player.current)
                      await document.exitFullscreen();
                    else await player.current?.requestFullscreen();
                  } catch {
                    setStatus("Fullscreen was not available for this request.");
                  }
                }}
              >
                <Maximize2 size={14} />
                Fullscreen video
              </button>
            )}
            {capabilities.pip && (
              <button
                onClick={async () => {
                  const element = player.current;
                  if (!(element instanceof HTMLVideoElement)) return;
                  try {
                    if (document.pictureInPictureElement === element)
                      await document.exitPictureInPicture();
                    else await element.requestPictureInPicture();
                  } catch {
                    setStatus(
                      "Picture-in-picture was not available for this request.",
                    );
                  }
                }}
              >
                <PictureInPicture2 size={14} />
                Picture-in-picture
              </button>
            )}
          </div>
          {kind === "audio" && captionText && (
            <p className="audio-captions" role="status">
              {captionText}
            </p>
          )}
          {selected.source === "imported" && selected.url && (
            <button
              className="media-download"
              onClick={() => {
                downloadLocalAsset(selected.path || "media", selected.url!);
                setStatus("Imported media download requested.");
              }}
            >
              Download imported media
            </button>
          )}
          <dl className="media-metadata">
            <div>
              <dt>Duration</dt>
              <dd>
                {current && Number.isFinite(current.duration)
                  ? `${current.duration.toLocaleString(undefined, { maximumFractionDigits: 2 })} seconds`
                  : "Unavailable"}
              </dd>
            </div>
            {kind === "video" && (
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {current?.width && current.height
                    ? `${current.width} × ${current.height} pixels`
                    : "Unavailable"}
                </dd>
              </div>
            )}
            <div>
              <dt>Source</dt>
              <dd>{selected.reference}</dd>
            </div>
          </dl>
        </>
      )}
      {poster && (
        <ResourceNotice
          resource={poster}
          label="Poster"
          allowed={permitted(poster)}
          onLoad={() => allow(poster)}
        />
      )}
      {tracks.map((track) => (
        <ResourceNotice
          key={track.resource.reference}
          resource={track.resource}
          label={`Captions: ${track.label}`}
          allowed={permitted(track.resource)}
          onLoad={() => void loadCaption(track.resource)}
        />
      ))}
      <p className="media-player-status" role="status">
        {status}
      </p>
    </section>
  );
}
export const VideoRenderer: Components["video"] = ({ node }) =>
  node ? <MediaPlayer node={node} kind="video" /> : null;
export const AudioRenderer: Components["audio"] = ({ node }) =>
  node ? <MediaPlayer node={node} kind="audio" /> : null;

function ResourceNotice({
  resource,
  label,
  allowed,
  onLoad,
}: {
  resource: LocalResource;
  label: string;
  allowed: boolean;
  onLoad: () => void;
}) {
  if (resource.source === "remote" && !allowed)
    return (
      <div className="media-resource-block">
        <span>
          {label} blocked · {resource.host}
        </span>
        <button onClick={onLoad}>Load {label.toLowerCase()}</button>
      </div>
    );
  if (resource.source === "unavailable")
    return (
      <p className="media-resource-block">
        {label} not imported: {resource.reference}
      </p>
    );
  return null;
}
