import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import SectionTitle from "../../components/SectionTitle";
import Table from "../../components/Table";
import Badge from "../../components/Badge";

const formatDateTime = value => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatAmount = value => `₹${Number(value || 0).toLocaleString()}`;

export default function PendingUpiVerifications() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/student-fees/pending-upi-verifications");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load pending payment verifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const handleVerify = async (row, action) => {
    const key = `${row.studentId}-${row.termId}-${action}`;
    if (action === "confirm") {
      const ok = window.confirm(
        `Confirm UPI payment for ${row.studentName || "this student"} (${row.termName || "term"})?`
      );
      if (!ok) return;
    } else {
      const rejectionReason = window.prompt(
        `Enter rejection reason for ${row.studentName || "this student"} (${row.termName || "term"}).`,
        ""
      );
      if (rejectionReason === null) return;
      return executeVerify(row, action, key, rejectionReason.trim());
    }

    return executeVerify(row, action, key, "");
  };

  const executeVerify = async (row, action, key, rejectionReason) => {
    setBusyKey(key);
    try {
      await api.post(`/student-fees/${row.studentId}/terms/${row.termId}/verify-payment`, {
        action,
        rejectionReason
      });
      await fetchRows();
    } catch (e) {
      alert(e.response?.data?.message || "Verification update failed.");
    } finally {
      setBusyKey("");
    }
  };

  const columns = useMemo(() => [
    {
      label: "Student Name",
      key: "studentName",
      render: row => (
        <div>
          <div style={s.studentName}>{row.studentName || "Unknown student"}</div>
          <div style={s.studentSub}>{row.satCode || "No code"}</div>
        </div>
      )
    },
    {
      label: "Class",
      key: "className",
      render: row => (
        <div>
          <div style={s.className}>
            {row.className || "No class"}{row.section ? ` - ${row.section}` : ""}
          </div>
          <div style={s.studentSub}>{row.academicYear || "Academic year unavailable"}</div>
        </div>
      )
    },
    {
      label: "Term",
      key: "termName",
      render: row => (
        <div>
          <div style={s.termTitle}>{row.termName || `Term ${row.termNumber || ""}`}</div>
          <Badge type="pending">Pending Verification</Badge>
        </div>
      )
    },
    {
      label: "Amount",
      key: "amount",
      render: row => <span style={s.amount}>{formatAmount(row.amount)}</span>
    },
    {
      label: "UTR Entered",
      key: "utrNumber",
      render: row => (
        <div style={s.utrWrap}>
          <div style={s.utrValue}>{row.utrNumber || "Not entered"}</div>
          <div style={s.utrRef}>{row.upiTrReference || "No reference"}</div>
        </div>
      )
    },
    {
      label: "Claimed At",
      key: "claimedAt",
      render: row => <span style={s.claimedAt}>{formatDateTime(row.claimedAt)}</span>
    },
    {
      label: "Actions",
      key: "actions",
      render: row => {
        const confirmKey = `${row.studentId}-${row.termId}-confirm`;
        const rejectKey = `${row.studentId}-${row.termId}-reject`;
        const busy = busyKey === confirmKey || busyKey === rejectKey;

        return (
          <div style={s.actions}>
            <button
              type="button"
              style={{ ...s.actionBtn, ...s.confirmBtn, ...(busy ? s.disabledBtn : {}) }}
              onClick={() => handleVerify(row, "confirm")}
              disabled={busy}
            >
              <i className="fa-solid fa-circle-check" style={s.btnIcon}></i>
              Confirm
            </button>
            <button
              type="button"
              style={{ ...s.actionBtn, ...s.rejectBtn, ...(busy ? s.disabledBtn : {}) }}
              onClick={() => handleVerify(row, "reject")}
              disabled={busy}
            >
              <i className="fa-solid fa-circle-xmark" style={s.btnIcon}></i>
              Reject
            </button>
          </div>
        );
      }
    }
  ], [busyKey]);

  return (
    <div>
      <SectionTitle
        title="Pending UPI Verifications"
        subtitle="Review student payment claims and confirm or reject them from the admin panel."
      />

      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.summaryRow}>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Pending Claims</div>
          <div style={s.summaryValue}>{rows.length}</div>
        </div>
        <button type="button" style={s.refreshBtn} onClick={fetchRows} disabled={loading}>
          <i className={`fa-solid ${loading ? "fa-circle-notch fa-spin" : "fa-rotate"}`}></i>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <Table
        loading={loading}
        columns={columns}
        data={rows}
        emptyMessage="No UPI payments are waiting for verification."
      />
    </div>
  );
}

const s = {
  errorBox: {
    background: "var(--danger-bg)",
    color: "var(--danger-text)",
    border: "1px solid rgba(220, 38, 38, 0.18)",
    padding: "14px 16px",
    borderRadius: "14px",
    fontWeight: "700",
    marginBottom: "20px"
  },
  summaryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "20px",
    flexWrap: "wrap"
  },
  summaryCard: {
    background: "var(--white)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    boxShadow: "var(--shadow-sm)",
    padding: "14px 18px",
    minWidth: "180px"
  },
  summaryLabel: {
    fontSize: "0.72rem",
    fontWeight: "900",
    color: "var(--gold)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "6px"
  },
  summaryValue: {
    fontSize: "1.7rem",
    fontWeight: "900",
    color: "var(--navy)"
  },
  refreshBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "var(--white)",
    color: "var(--navy)",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "var(--shadow-sm)"
  },
  studentName: { fontWeight: "800", color: "var(--navy)" },
  className: { fontWeight: "800", color: "var(--text)" },
  studentSub: { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", fontWeight: "600" },
  termTitle: { fontWeight: "800", color: "var(--text)", marginBottom: "8px" },
  amount: { fontWeight: "900", color: "var(--navy)" },
  utrWrap: { display: "flex", flexDirection: "column", gap: "4px" },
  utrValue: { fontWeight: "800", color: "var(--text)" },
  utrRef: { fontSize: "0.76rem", color: "var(--text-muted)", fontWeight: "600" },
  claimedAt: { fontWeight: "700", color: "var(--text)" },
  actions: { display: "flex", gap: "10px", flexWrap: "wrap" },
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    borderRadius: "12px",
    border: "1px solid transparent",
    fontWeight: "800",
    cursor: "pointer",
    minHeight: "42px"
  },
  confirmBtn: {
    background: "rgba(16, 185, 129, 0.12)",
    color: "rgb(4, 120, 87)",
    borderColor: "rgba(16, 185, 129, 0.25)"
  },
  rejectBtn: {
    background: "rgba(239, 68, 68, 0.10)",
    color: "rgb(185, 28, 28)",
    borderColor: "rgba(239, 68, 68, 0.20)"
  },
  disabledBtn: {
    opacity: 0.6,
    cursor: "not-allowed"
  },
  btnIcon: { fontSize: "0.9rem" }
};
