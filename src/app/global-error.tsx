"use client";

/**
 * The last safety net: it replaces the whole root layout, so it brings its own html and body and
 * cannot rely on the app's stylesheet or components. Plain inline styles on purpose.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fffdf7",
          color: "#3a2f1d",
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong.</h1>
        <p style={{ maxWidth: 420, margin: 0 }}>
          UseHourly hit a problem and could not show this page. Your data is safe. Try again in a moment.
        </p>
        {error.digest && <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>Reference: {error.digest}</p>}
        <button
          type="button"
          onClick={reset}
          style={{
            height: 44,
            padding: "0 20px",
            borderRadius: 8,
            border: "1px solid #d9a21b",
            background: "#fdeeb8",
            color: "#3a2f1d",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
