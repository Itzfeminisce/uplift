"use client";

import { useUploads } from "@uplift-io/uplift/react";
import type { UploadedFile } from "@uplift-io/uplift";
import type { CSSProperties, ChangeEvent, ReactNode } from "react";
import { useState } from "react";
import type { Uploads } from "../src/uploads";

type ClipResult = UploadedFile & { output(name: "thumb"): UploadedFile };

export default function Page() {
  const uploads = useUploads<Uploads>("/api/upload");
  const [clipResult, setClipResult] = useState<ClipResult | null>(null);

  return (
    <main style={styles.shell}>
      <section style={styles.header}>
        <p style={styles.kicker}>Next local example</p>
        <h1 style={styles.title}>Typed uploads with local storage, transforms, and outputs.</h1>
        <p style={styles.copy}>
          This example writes to <code style={styles.code}>public/uploads</code> by default so returned local URLs
          render immediately. Set <code style={styles.code}>UPLIFT_STORAGE</code> to <code style={styles.code}>s3</code>{" "}
          or <code style={styles.code}>r2</code> to test the same routes against cloud storage.
        </p>
      </section>

      <section style={styles.grid}>
        <UploadPanel
          title="Avatar"
          description="Single image upload with auth-derived key generation."
          accept="image/*"
          multiple={false}
          isUploading={uploads.avatar.isUploading}
          progress={uploads.avatar.progress}
          error={uploads.avatar.error?.message}
          onFiles={(files) => {
            const file = files[0];
            if (file) void uploads.avatar(file).catch(() => undefined);
          }}
        >
          {uploads.avatar.data ? <ImageResult file={uploads.avatar.data} label="Avatar" /> : null}
        </UploadPanel>

        <UploadPanel
          title="Gallery"
          description="Multiple image upload with typed FileList input and array result."
          accept="image/*"
          multiple
          isUploading={uploads.gallery.isUploading}
          progress={uploads.gallery.progress}
          error={uploads.gallery.error?.message}
          onFiles={(files) => {
            if (files.length > 0) void uploads.gallery(files).catch(() => undefined);
          }}
        >
          {uploads.gallery.data?.length ? (
            <div style={styles.gallery}>
              {uploads.gallery.data.map((file) => (
                <ImageResult key={file.key} file={file} label={file.name} compact />
              ))}
            </div>
          ) : null}
        </UploadPanel>

        <UploadPanel
          title="Image Media Pipeline"
          description="Image transform route with typed thumbnail and preview outputs."
          accept="image/*"
          multiple={false}
          isUploading={uploads.mediaPreview.isUploading}
          progress={uploads.mediaPreview.progress}
          error={uploads.mediaPreview.error?.message}
          onFiles={(files) => {
            const file = files[0];
            if (file) void uploads.mediaPreview(file).catch(() => undefined);
          }}
        >
          {uploads.mediaPreview.data ? (
            <div style={styles.stack}>
              <ImageResult file={uploads.mediaPreview.data} label="Primary webp" />
              <div style={styles.outputGrid}>
                <ImageResult file={uploads.mediaPreview.data.output("thumb")} label="thumb output" compact />
                <ImageResult file={uploads.mediaPreview.data.output("preview")} label="preview output" compact />
              </div>
            </div>
          ) : null}
        </UploadPanel>

        <UploadPanel
          title="Video Pipeline"
          description="Video transform route with typed thumbnail output."
          accept="video/*"
          multiple={false}
          isUploading={uploads.clip.isUploading}
          progress={uploads.clip.progress}
          error={uploads.clip.error?.message}
          onFiles={(files) => {
            const file = files[0];
            if (file) void uploads.clip(file)
              .then((transform) => transform.done())
              .then((completed) => setClipResult(completed as ClipResult))
              .catch(() => undefined);
          }}
        >
          {clipResult ? (
            <div style={styles.stack}>
              <VideoResult file={clipResult} />
              <ImageResult file={clipResult.output("thumb")} label="thumbnail output" compact />
            </div>
          ) : null}
        </UploadPanel>
      </section>
    </main>
  );
}

function UploadPanel(props: {
  title: string;
  description: string;
  accept: string;
  multiple: boolean;
  isUploading: boolean;
  progress: number | null;
  error?: string | undefined;
  onFiles(files: File[]): void;
  children: ReactNode;
}) {
  return (
    <article style={styles.panel}>
      <div>
        <h2 style={styles.panelTitle}>{props.title}</h2>
        <p style={styles.panelCopy}>{props.description}</p>
      </div>
      <label style={styles.dropzone}>
        <span style={styles.dropzoneTitle}>{props.multiple ? "Choose files" : "Choose a file"}</span>
        <span style={styles.dropzoneCopy}>{props.accept}</span>
        <input
          style={styles.fileInput}
          type="file"
          accept={props.accept}
          multiple={props.multiple}
          onChange={(event) => {
            props.onFiles(filesFromEvent(event));
            event.currentTarget.value = "";
          }}
        />
      </label>
      <Progress uploading={props.isUploading} progress={props.progress} />
      {props.error ? <p style={styles.error}>{props.error}</p> : null}
      {props.children}
    </article>
  );
}

function ImageResult(props: { file: UploadedFile; label: string; compact?: boolean }) {
  return (
    <div style={props.compact ? styles.compactResult : styles.result}>
      <img src={props.file.url} alt={props.label} style={props.compact ? styles.compactImage : styles.image} />
      <FileDetails file={props.file} label={props.label} />
    </div>
  );
}

function VideoResult(props: { file: UploadedFile }) {
  return (
    <div style={styles.result}>
      <video src={props.file.url} controls style={styles.video} />
      <FileDetails file={props.file} label="Primary mp4" />
    </div>
  );
}

function FileDetails(props: { file: UploadedFile; label: string }) {
  return (
    <dl style={styles.details}>
      <div>
        <dt style={styles.detailLabel}>{props.label}</dt>
        <dd style={styles.detailValue}>{props.file.name}</dd>
      </div>
      <div>
        <dt style={styles.detailLabel}>Key</dt>
        <dd style={styles.detailValue}>{props.file.key}</dd>
      </div>
      <div>
        <dt style={styles.detailLabel}>Type</dt>
        <dd style={styles.detailValue}>{props.file.type || "unknown"}</dd>
      </div>
      <div>
        <dt style={styles.detailLabel}>Size</dt>
        <dd style={styles.detailValue}>{formatBytes(props.file.size)}</dd>
      </div>
    </dl>
  );
}

function Progress(props: { uploading: boolean; progress: number | null }) {
  if (!props.uploading && props.progress === 0) return null;
  if (props.progress === null) {
    return (
      <div style={styles.progressTrack} aria-label="Upload progress">
        <div style={{ ...styles.progressBar, width: "100%" }} />
      </div>
    );
  }
  return (
    <div style={styles.progressTrack} aria-label="Upload progress">
      <div style={{ ...styles.progressBar, width: `${props.progress}%` }} />
    </div>
  );
}

function filesFromEvent(event: ChangeEvent<HTMLInputElement>): File[] {
  return Array.from(event.currentTarget.files ?? []);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = {
  shell: {
    minHeight: "100vh",
    padding: "48px",
    color: "#172033",
    background: "linear-gradient(180deg, #f7fafc 0%, #eef4f6 100%)",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    maxWidth: "900px",
    margin: "0 auto 32px",
  },
  kicker: {
    margin: "0 0 8px",
    color: "#047857",
    fontSize: "13px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  title: {
    margin: 0,
    maxWidth: "760px",
    color: "#0f172a",
    fontSize: "42px",
    lineHeight: 1.08,
  },
  copy: {
    maxWidth: "720px",
    margin: "18px 0 0",
    color: "#475569",
    fontSize: "16px",
    lineHeight: 1.7,
  },
  code: {
    border: "1px solid #d8e2e7",
    borderRadius: "5px",
    padding: "1px 5px",
    color: "#0f766e",
    background: "#ffffff",
    fontSize: "0.92em",
  },
  grid: {
    maxWidth: "1180px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "18px",
  },
  panel: {
    display: "grid",
    alignContent: "start",
    gap: "16px",
    minHeight: "360px",
    border: "1px solid #d9e5ea",
    borderRadius: "8px",
    padding: "20px",
    background: "#ffffff",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
  },
  panelTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: "19px",
  },
  panelCopy: {
    margin: "7px 0 0",
    color: "#64748b",
    fontSize: "14px",
    lineHeight: 1.55,
  },
  dropzone: {
    display: "grid",
    gap: "4px",
    border: "1px dashed #9bb3bd",
    borderRadius: "8px",
    padding: "18px",
    color: "#0f766e",
    background: "#f7fbfb",
    cursor: "pointer",
  },
  dropzoneTitle: {
    fontSize: "14px",
    fontWeight: 700,
  },
  dropzoneCopy: {
    color: "#64748b",
    fontSize: "12px",
  },
  fileInput: {
    marginTop: "8px",
    color: "#475569",
  },
  progressTrack: {
    height: "8px",
    overflow: "hidden",
    borderRadius: "999px",
    background: "#e2e8f0",
  },
  progressBar: {
    height: "100%",
    borderRadius: "999px",
    background: "#0f766e",
    transition: "width 150ms ease",
  },
  error: {
    margin: 0,
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#991b1b",
    background: "#fef2f2",
    fontSize: "13px",
  },
  stack: {
    display: "grid",
    gap: "14px",
  },
  result: {
    display: "grid",
    gap: "12px",
  },
  compactResult: {
    display: "grid",
    gap: "10px",
    minWidth: 0,
  },
  image: {
    width: "100%",
    maxHeight: "280px",
    objectFit: "contain",
    border: "1px solid #dce7eb",
    borderRadius: "8px",
    background: "#f8fafc",
  },
  compactImage: {
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
    border: "1px solid #dce7eb",
    borderRadius: "8px",
    background: "#f8fafc",
  },
  video: {
    width: "100%",
    maxHeight: "280px",
    border: "1px solid #dce7eb",
    borderRadius: "8px",
    background: "#0f172a",
  },
  gallery: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "12px",
  },
  outputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
  },
  details: {
    display: "grid",
    gap: "7px",
    minWidth: 0,
    margin: 0,
    border: "1px solid #edf2f5",
    borderRadius: "8px",
    padding: "10px",
    background: "#fbfdfe",
  },
  detailLabel: {
    margin: 0,
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  detailValue: {
    margin: "2px 0 0",
    overflowWrap: "anywhere",
    color: "#172033",
    fontSize: "12px",
    lineHeight: 1.45,
  },
} satisfies Record<string, CSSProperties>;
