import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

const code = `clip: video()
  .max("100mb")
  .transformAsync(
    trim({ start: "00:00:02" }),
    transcode({ format: "mp4" }),
    { timeout: "10m" }
  )
  .outputs(thumbnail("poster"))`;

const clientCode = `const job = await upload.clip(file);

job.status; // "queued"

const video = await job.done();

video.url;
video.output("poster").url;`;

export function UpliftAsyncTransforms() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const workerProgress = interpolate(frame, [150, 235], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const finalScale = spring({ frame: frame - 250, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={styles.stage}>
      <div style={styles.gridGlow} />
      <header style={{ ...styles.header, transform: `translateY(${(1 - intro) * -32}px)`, opacity: intro }}>
        <span style={styles.kicker}>Uplift 1.4</span>
        <h1 style={styles.title}>Ship uploads that keep working after the request ends.</h1>
      </header>

      <Sequence from={30} durationInFrames={110}>
        <CodeCard title="Route definition" code={code} accent="#2dd4bf" />
      </Sequence>

      <Sequence from={120} durationInFrames={120}>
        <Flow progress={workerProgress} />
      </Sequence>

      <Sequence from={220} durationInFrames={110}>
        <CodeCard title="Client result" code={clientCode} accent="#f59e0b" align="right" />
      </Sequence>

      <Sequence from={270} durationInFrames={90}>
        <div style={{ ...styles.finalCard, transform: `scale(${0.86 + finalScale * 0.14})`, opacity: finalScale }}>
          <span style={styles.finalEyebrow}>Ready for production</span>
          <strong style={styles.finalTitle}>Async transforms. Preflight checks. Typed clients.</strong>
          <span style={styles.finalMeta}>Next.js, Hono, Express, Remix, SvelteKit, Nuxt, Fastify, Elysia</span>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
}

function CodeCard(props: { title: string; code: string; accent: string; align?: "left" | "right" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 } });
  const x = props.align === "right" ? (1 - enter) * 80 : (1 - enter) * -80;

  return (
    <div
      style={{
        ...styles.codeCard,
        marginLeft: props.align === "right" ? "auto" : 64,
        marginRight: props.align === "right" ? 64 : "auto",
        borderColor: props.accent,
        transform: `translateX(${x}px)`,
        opacity: enter
      }}
    >
      <div style={styles.cardChrome}>
        <span style={{ ...styles.dot, background: props.accent }} />
        <span style={styles.cardTitle}>{props.title}</span>
      </div>
      <pre style={styles.pre}>{props.code}</pre>
    </div>
  );
}

function Flow({ progress }: { progress: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ ...styles.flow, opacity }}>
      <Step label="Upload accepted" active={progress >= 0} />
      <Connector active={progress > 25} />
      <Step label="Job queued" active={progress > 25} />
      <Connector active={progress > 55} />
      <Step label="Worker transforms" active={progress > 55} pulse />
      <Connector active={progress > 86} />
      <Step label="Video ready" active={progress > 86} />
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressBar, width: `${progress}%` }} />
      </div>
    </div>
  );
}

function Step(props: { label: string; active: boolean; pulse?: boolean }) {
  const frame = useCurrentFrame();
  const pulse = props.pulse ? 1 + Math.sin(frame / 6) * 0.04 : 1;

  return (
    <div style={{ ...styles.step, opacity: props.active ? 1 : 0.45, transform: `scale(${pulse})` }}>
      <span style={styles.stepIcon}>{props.active ? "✓" : ""}</span>
      <span>{props.label}</span>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return <div style={{ ...styles.connector, background: active ? "#2dd4bf" : "#334155" }} />;
}

const styles: Record<string, React.CSSProperties> = {
  stage: {
    overflow: "hidden",
    background: "#07111f",
    color: "#ecfeff",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  gridGlow: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(120deg, rgba(45,212,191,0.18), transparent 34%), linear-gradient(300deg, rgba(245,158,11,0.14), transparent 38%), repeating-linear-gradient(90deg, rgba(148,163,184,0.07) 0 1px, transparent 1px 80px), repeating-linear-gradient(0deg, rgba(148,163,184,0.06) 0 1px, transparent 1px 80px)"
  },
  header: {
    position: "absolute",
    top: 72,
    left: 64,
    right: 64
  },
  kicker: {
    display: "inline-block",
    border: "1px solid rgba(45,212,191,0.65)",
    borderRadius: 999,
    padding: "8px 14px",
    color: "#99f6e4",
    fontSize: 26,
    fontWeight: 800
  },
  title: {
    maxWidth: 900,
    margin: "24px 0 0",
    fontSize: 66,
    lineHeight: 1.02,
    letterSpacing: 0
  },
  codeCard: {
    position: "relative",
    top: 310,
    width: 820,
    border: "2px solid",
    borderRadius: 8,
    background: "rgba(2, 6, 23, 0.92)",
    boxShadow: "0 28px 70px rgba(0,0,0,0.35)"
  },
  cardChrome: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderBottom: "1px solid rgba(148,163,184,0.2)",
    padding: "18px 22px",
    color: "#cbd5e1",
    fontSize: 22,
    fontWeight: 700
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 999
  },
  cardTitle: {
    color: "#e2e8f0"
  },
  pre: {
    margin: 0,
    padding: "26px 30px 32px",
    color: "#dbeafe",
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
    fontSize: 29,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap"
  },
  flow: {
    position: "absolute",
    top: 650,
    left: 64,
    right: 64,
    display: "grid",
    gridTemplateColumns: "1fr 48px 1fr 48px 1fr 48px 1fr",
    alignItems: "center",
    gap: 0
  },
  step: {
    minHeight: 112,
    display: "grid",
    placeItems: "center",
    gap: 10,
    border: "1px solid rgba(148,163,184,0.24)",
    borderRadius: 8,
    background: "rgba(15,23,42,0.88)",
    color: "#ecfeff",
    fontSize: 23,
    fontWeight: 800,
    textAlign: "center"
  },
  stepIcon: {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    background: "#2dd4bf",
    color: "#042f2e",
    fontSize: 22,
    fontWeight: 900
  },
  connector: {
    height: 4
  },
  progressTrack: {
    gridColumn: "1 / -1",
    height: 14,
    marginTop: 30,
    overflow: "hidden",
    borderRadius: 999,
    background: "rgba(51,65,85,0.9)"
  },
  progressBar: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #2dd4bf, #f59e0b)"
  },
  finalCard: {
    position: "absolute",
    left: 64,
    right: 64,
    bottom: 96,
    display: "grid",
    gap: 20,
    border: "1px solid rgba(226,232,240,0.24)",
    borderRadius: 8,
    padding: 38,
    background: "rgba(15, 23, 42, 0.94)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.35)"
  },
  finalEyebrow: {
    color: "#fcd34d",
    fontSize: 24,
    fontWeight: 900,
    textTransform: "uppercase"
  },
  finalTitle: {
    color: "#ffffff",
    fontSize: 54,
    lineHeight: 1.05
  },
  finalMeta: {
    color: "#a7f3d0",
    fontSize: 25,
    lineHeight: 1.35
  }
};
