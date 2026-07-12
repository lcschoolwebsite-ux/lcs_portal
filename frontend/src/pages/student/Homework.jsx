import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import SectionTitle from "../../components/SectionTitle";

const formatDate = value => {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

const formatClassLabel = cls => [cls?.name, cls?.section].filter(Boolean).join(" ") || "Class";

export default function StudentHomework() {
  const { user } = useAuth();
  const classId = String(user?.class?._id || user?.class || "");
  const classLabel = useMemo(() => formatClassLabel(user?.class), [user]);
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchHomework = async () => {
      if (!classId) {
        setHomework([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/homework/class/${classId}`);
        setHomework(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load homework.");
        setHomework([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHomework();
  }, [classId]);

  const handleDownload = async item => {
    if (!item?._id) return;
    setDownloadingId(item._id);
    try {
      const { data } = await api.get(`/homework/${item._id}/download`, {
        responseType: "blob"
      });
      const blob = new Blob([data], { type: "application/pdf" });
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      alert(err.response?.data?.message || "Unable to download homework.");
    } finally {
      setDownloadingId("");
    }
  };

  return (
    <div>
      <SectionTitle title="Homework" subtitle="View homework posted for your class." />

      <div style={s.banner}>
        <div>
          <div style={s.bannerLabel}>Your Class</div>
          <div style={s.bannerValue}>{classLabel || "N/A"}</div>
        </div>
        <div style={s.bannerHint}>Newest homework appears first.</div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.list}>
        {loading && <div style={s.empty}>Loading homework...</div>}
        {!loading && homework.length === 0 && <div style={s.empty}>No homework has been posted for your class yet.</div>}
        {!loading && homework.map(item => (
          <article key={item._id} style={s.card}>
            <div style={s.topRow}>
              <div>
                <h3 style={s.title}>{item.title}</h3>
                <div style={s.meta}>
                  <span>{item.subjectId?.name || "Subject"}</span>
                  <span>•</span>
                  <span>{item.uploadedBy?.name || "Teacher"}</span>
                  <span>•</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>
              <button type="button" style={s.downloadBtn} onClick={() => handleDownload(item)} disabled={downloadingId === item._id}>
                {downloadingId === item._id ? "Opening..." : "View / Download"}
              </button>
            </div>

            {item.description && <div style={s.description}>{item.description}</div>}
          </article>
        ))}
      </div>
    </div>
  );
}

const s = {
  banner: { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", background: "linear-gradient(135deg, rgba(14,107,107,0.08), rgba(200,150,12,0.08))", border: "1px solid rgba(14,107,107,0.12)", borderRadius: "18px", padding: "16px 18px", marginBottom: "18px", flexWrap: "wrap" },
  bannerLabel: { fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", fontWeight: 900, marginBottom: "4px" },
  bannerValue: { fontSize: "1rem", fontWeight: 900, color: "var(--navy)" },
  bannerHint: { color: "var(--text-muted)", fontWeight: 700 },
  errorBox: { marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-text)", fontWeight: 700 },
  list: { display: "grid", gap: "14px" },
  empty: { padding: "28px", borderRadius: "18px", border: "1px dashed var(--border)", background: "white", color: "var(--text-muted)", textAlign: "center", fontWeight: 700 },
  card: { background: "white", borderRadius: "20px", border: "1px solid var(--border)", padding: "18px 20px", boxShadow: "var(--shadow-sm)" },
  topRow: { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" },
  title: { margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "var(--navy)" },
  meta: { marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap", color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 700 },
  description: { marginTop: "12px", color: "var(--navy)", fontWeight: 600, lineHeight: 1.6, whiteSpace: "pre-wrap" },
  downloadBtn: { padding: "12px 16px", borderRadius: "14px", border: "none", background: "var(--navy)", color: "var(--gold-light)", fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }
};
