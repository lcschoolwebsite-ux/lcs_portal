import { useEffect, useState } from "react";
import api from "../../api/axios";
import Table from "../../components/Table";

export default function StudentLogins() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ totalLogins: 0, uniqueStudents: 0 });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async (date = selectedDate) => {
    setLoading(true);
    try {
      const { data } = await api.get("/student-logins", {
        params: date ? { date } : {}
      });
      const nextLogs = Array.isArray(data) ? data : (data.logs || []);
      setLogs(nextLogs);
      setSummary({
        totalLogins: data?.summary?.totalLogins ?? nextLogs.length,
        uniqueStudents: data?.summary?.uniqueStudents ?? new Set(nextLogs.map(log => String(log.studentId || ""))).size
      });
    } catch (e) {
      alert(e.response?.data?.message || "Failed to load student login history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(selectedDate);
  }, [selectedDate]);

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Student Login History</h1>
          <p style={s.sub}>Pick a date to see who logged in and how many login entries were recorded. Records expire automatically after 7 days.</p>
        </div>
        <div style={s.controls}>
          <label style={s.dateGroup}>
            <span style={s.dateLabel}>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={s.dateInput}
            />
          </label>
          <button style={s.btnPrimary} onClick={() => fetchLogs(selectedDate)}>
            <i className="fa-solid fa-rotate-right" style={{ marginRight: "8px" }}></i>
            Refresh
          </button>
        </div>
      </div>

      <div style={s.statsBar}>
        <div style={s.statBox}>
          <div style={s.statLabel}>Login Entries</div>
          <div style={s.statValue}>{summary.totalLogins}</div>
        </div>
        <div style={s.statBox}>
          <div style={s.statLabel}>Unique Students</div>
          <div style={s.statValue}>{summary.uniqueStudents}</div>
        </div>
      </div>

      <Table
        loading={loading}
        headers={["Student", "SAT Code", "Class", "Academic Year", "Login Time"]}
        data={logs}
        emptyMessage={selectedDate ? `No student logins recorded on ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN")}.` : "No student logins recorded in the last 7 days."}
        renderRow={(log) => (
          <>
            <td style={s.td}>
              <strong>{log.studentName}</strong>
              <div style={s.meta}>ID: {log.studentId}</div>
            </td>
            <td style={s.td}>{log.satCode}</td>
            <td style={s.td}>{log.className || "-"}</td>
            <td style={s.td}>{log.academicYear || "-"}</td>
            <td style={s.td}>
              <div style={s.time}>{new Date(log.createdAt).toLocaleString()}</div>
            </td>
          </>
        )}
      />
    </div>
  );
}

const s = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "2.5rem", flexWrap: "wrap" },
  controls: { display: "flex", alignItems: "end", gap: "12px", flexWrap: "wrap" },
  title: { fontSize: "1.75rem", fontWeight: "800", color: "var(--navy)", margin: 0, fontFamily: "var(--font-heading)" },
  sub: { fontSize: "0.9rem", color: "var(--text-muted)", marginTop: "0.4rem", maxWidth: "720px" },
  btnPrimary: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "var(--white)", border: "none", padding: "12px 22px", borderRadius: "30px", fontWeight: "700", cursor: "pointer", boxShadow: "var(--shadow-md)" },
  dateGroup: { display: "flex", flexDirection: "column", gap: "6px" },
  dateLabel: { fontSize: "0.78rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" },
  dateInput: { minHeight: "48px", padding: "0 14px", borderRadius: "14px", border: "1px solid var(--border)", background: "white", color: "var(--text)", fontWeight: "600" },
  statsBar: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" },
  statBox: { background: "white", border: "1px solid var(--border)", borderRadius: "18px", padding: "18px 20px", boxShadow: "var(--shadow-sm)" },
  statLabel: { fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: "700" },
  statValue: { marginTop: "8px", fontSize: "1.8rem", fontWeight: "800", color: "var(--navy)", fontFamily: "var(--font-heading)" },
  td: { padding: "16px 20px", fontSize: "0.95rem", color: "var(--text)", borderBottom: "1px solid var(--border)", verticalAlign: "top" },
  meta: { marginTop: "4px", fontSize: "0.72rem", color: "var(--text-muted)" },
  time: { fontWeight: "700", color: "var(--navy)" }
};
