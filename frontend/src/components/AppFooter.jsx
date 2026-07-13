export default function AppFooter({ variant = "light" }) {
  const isDark = variant === "dark";

  return (
    <footer style={{ ...s.footer, ...(isDark ? s.darkFooter : {}) }}>
      <span>Developed by </span>
      <a
        href="https://appvertex.in"
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...s.link, ...(isDark ? s.darkLink : {}) }}
      >
        AppVertex
      </a>
    </footer>
  );
}

const s = {
  footer: {
    padding: "18px 24px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "0.82rem",
    fontWeight: "700",
    borderTop: "1px solid var(--border)",
    background: "rgba(255,255,255,0.72)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px"
  },
  darkFooter: {
    position: "relative",
    zIndex: 10,
    color: "rgba(255,255,255,0.76)",
    background: "rgba(5,26,26,0.42)",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)"
  },
  link: {
    color: "var(--navy)",
    fontWeight: "900",
    textDecoration: "none"
  },
  darkLink: {
    color: "var(--gold-light)"
  }
};
