import { ImageResponse } from "next/og";

const SIZE = 512;

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#12161a",
      }}
    >
      <div
        style={{
          width: "84%",
          height: "84%",
          borderRadius: "50%",
          border: "16px solid #C9B071",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: SIZE * 0.38,
            fontWeight: 700,
            color: "#C9B071",
            letterSpacing: "-6px",
          }}
        >
          KB
        </span>
      </div>
    </div>,
    { width: SIZE, height: SIZE },
  );
}
