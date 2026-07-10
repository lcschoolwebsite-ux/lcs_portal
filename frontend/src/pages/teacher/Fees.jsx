import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import SectionTitle from "../../components/SectionTitle";
import Modal from "../../components/Modal";
import MonthDatePicker from "../../components/MonthDatePicker";
import { isClassTeacher } from "../../utils/teacherClasses";

export default function Fees() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [fees, setFees] = useState([]);
  const [selectedFee, setSelectedFee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [academicYears, setAcademicYears] = useState([]);
  const [activeAY, setActiveAY] = useState("");
  const [classes, setClasses] = useState([]);
  const [filters, setFilters] = useState({ classId: "", search: "", status: "" });
  const [error, setError] = useState("");
  const [allowTeacherFeeManagement, setAllowTeacherFeeManagement] = useState(true);
  const [savingPermission, setSavingPermission] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isFeeDetailModalOpen, setIsFeeDetailModalOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "Cash",
    paidDate: new Date().toISOString().split("T")[0]
  });

  const teacherClasses = useMemo(
    () => (Array.isArray(classes) ? classes.filter(cls => isClassTeacher(user, cls)) : []),
    [classes, user]
  );

  const formatClass = cls => {
    if (!cls) return "No class";
    return `${cls.name || ""}${cls.section || ""}`.trim() || "No class";
  };

  const fetchSettings = async () => {
    try {
      const { data } = await api.get("/settings/teacher-fees");
      setAllowTeacherFeeManagement(Boolean(data.allowTeacherFeeManagement));
    } catch (e) {
      console.error("Failed to load teacher fee settings", e);
    }
  };

  const fetchSetupData = async () => {
    setLoading(true);
    try {
      const [ayRes, clRes] = await Promise.all([
        api.get("/academic-years"),
        api.get("/classes")
      ]);
      setAcademicYears(ayRes.data || []);
      setClasses(clRes.data || []);
      const active = (ayRes.data || []).find(y => y.isActive);
      if (!activeAY) setActiveAY(active?._id || ayRes.data?.[0]?._id || "");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load fee setup data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFeeData = async () => {
    if (!activeAY) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        academicYear: activeAY,
        classId: filters.classId,
        search: filters.search,
        status: filters.status
      });

      const [feeRes, statsRes] = await Promise.all([
        api.get(`/student-fees?${params.toString()}`),
        api.get(`/student-fees/stats?academicYear=${activeAY}&classId=${filters.classId}`)
      ]);

      setFees(feeRes.data || []);
      setStats(statsRes.data || null);
      setSelectedFee(current => {
        if (!current) return feeRes.data?.[0] || null;
        return feeRes.data.find(fee => fee._id === current._id) || feeRes.data?.[0] || null;
      });
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load fee records.");
      setFees([]);
      setStats(null);
      setSelectedFee(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchSetupData();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileView(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (teacherClasses.length > 0 && !filters.classId) {
      setFilters(prev => ({ ...prev, classId: teacherClasses[0]._id }));
    }
    if (teacherClasses.length === 0 && filters.classId) {
      setFilters(prev => ({ ...prev, classId: "" }));
    }
  }, [teacherClasses, filters.classId]);

  useEffect(() => {
    if (!activeAY) return;
    fetchFeeData();
  }, [activeAY, filters.classId, filters.status, filters.search]);

  useEffect(() => {
    if (!isMobileView) {
      setIsFeeDetailModalOpen(false);
    }
  }, [isMobileView]);

  const handleRecordPayment = async () => {
    if (!allowTeacherFeeManagement) return alert("Fee recording is blocked by the administrator.");
    if (!selectedFee) return;
    if (!paymentForm.amount || paymentForm.amount <= 0) return alert("Enter valid amount");
    if (Number(paymentForm.amount) > Number(selectedFee?.totalDue || 0)) return alert("Payment cannot be more than total due");

    try {
      await api.post("/student-fees/record-flexible-payment", {
        studentFeeId: selectedFee._id,
        amount: paymentForm.amount,
        method: paymentForm.method,
        paidDate: paymentForm.paidDate,
        note: "Recorded by teacher"
      });
      alert("Payment recorded successfully!");
      setIsPaymentModalOpen(false);
      const { data } = await api.get(`/student-fees/student/${selectedFee.student?._id}?academicYear=${activeAY}`);
      setSelectedFee(data);
      fetchFeeData();
      setPaymentForm({
        amount: "",
        method: "Cash",
        paidDate: new Date().toISOString().split("T")[0]
      });
    } catch (e) {
      alert(e.response?.data?.message || "Failed to record payment");
    }
  };

  const handleSelectFee = fee => {
    setSelectedFee(fee);
    if (isMobileView) {
      setIsFeeDetailModalOpen(true);
    }
  };

  const closeFeeDetailModal = () => setIsFeeDetailModalOpen(false);

  const feeDetailContent = selectedFee ? (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={s.detailHeader} className="teacher-fees-detail-header">
        <div style={s.largeAvatar}>{selectedFee.student?.name?.[0]}</div>
        <div style={{ flex: 1 }}>
          <h2 style={s.detailName}>{selectedFee.student?.name}</h2>
          <p style={s.detailSub}>{selectedFee.student?.satCode} • {formatClass(selectedFee.student?.class)}</p>
          <div style={{ ...s.statusBadge, ...(selectedFee.overallStatus === "Paid" ? s.bgPaid : selectedFee.overallStatus === "Partial" ? s.bgPartial : s.bgUnpaid) }}>
            Overall Status: {selectedFee.overallStatus}
          </div>
        </div>
        <button
          onClick={() => setIsPaymentModalOpen(true)}
          style={{ ...s.btnMainRecord, ...(allowTeacherFeeManagement ? {} : s.btnDisabled) }}
          disabled={selectedFee.totalDue <= 0 || !allowTeacherFeeManagement}
        >
          <i className="fa-solid fa-plus-circle"></i> Record Payment
        </button>
      </div>

      <div style={s.detailMetrics} className="teacher-fees-metrics">
        <div style={s.metricBox}>
          <div style={s.metricLabel}>Annual Total</div>
          <div style={s.metricValue}>₹{Number(selectedFee.totalAnnualFee || 0).toLocaleString()}</div>
        </div>
        <div style={s.metricBox}>
          <div style={s.metricLabel}>Total Paid</div>
          <div style={{ ...s.metricValue, color: "#10b981" }}>₹{Number(selectedFee.totalPaid || 0).toLocaleString()}</div>
        </div>
        <div style={s.metricBox}>
          <div style={s.metricLabel}>Total Due</div>
          <div style={{ ...s.metricValue, color: "#ef4444" }}>₹{Number(selectedFee.totalDue || 0).toLocaleString()}</div>
        </div>
      </div>

      <div style={s.sectionTitle}>Transaction History</div>
      {selectedFee.terms.filter(t => t.status === "Paid").length > 0 ? (
        <div className="teacher-fees-table-shell">
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Description</th>
                <th style={s.th}>Amount</th>
                <th style={s.th}>Method</th>
                <th style={s.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {selectedFee.terms.filter(t => t.status === "Paid").reverse().map((term, idx) => (
                <tr key={idx}>
                  <td style={s.td}>{term.termName}</td>
                  <td style={s.td}>₹{Number(term.paidAmount || 0).toLocaleString()}</td>
                  <td style={s.td}>{term.method}</td>
                  <td style={s.td}>{term.paidDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={s.noPlanBox}>
          <i className="fa-solid fa-receipt" style={{ fontSize: "2rem", marginBottom: "10px" }}></i>
          <p>No payments recorded yet.</p>
        </div>
      )}
    </div>
  ) : (
    <div style={s.placeholder}>Select a student to manage fees</div>
  );

  const selectedClass = teacherClasses.find(c => c._id === filters.classId);

  return (
    <div>
      <SectionTitle title="Fee Management" subtitle="View your class fee records and record offline payments." />

      {!allowTeacherFeeManagement && (
        <div style={s.warnBox}>
          <i className="fa-solid fa-lock"></i>
          <div>
            <strong>Fee recording is blocked by the administrator.</strong>
            <div style={s.warnSub}>You can still view fee records for your class, but payment entry is disabled.</div>
          </div>
        </div>
      )}

      {error && <div style={s.errorBox}>{error}</div>}

      {stats && (
        <div style={s.statsBar} className="teacher-fees-stats">
          <div style={s.statBox}>
            <div style={s.statLabel}>Expected</div>
            <div style={s.statValue}>₹{Number(stats.totalFeeExpected || 0).toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Collected</div>
            <div style={s.statValue}>₹{Number(stats.totalCollected || 0).toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Due</div>
            <div style={{ ...s.statValue, color: "#fca5a5" }}>₹{Number(stats.totalDue || 0).toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Paid</div>
            <div style={s.statValue}>{stats.paidCount}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Partial</div>
            <div style={s.statValue}>{stats.partialCount}</div>
          </div>
          <div style={s.statBox} className="teacher-fees-stat-last">
            <div style={s.statLabel}>Unpaid</div>
            <div style={s.statValue}>{stats.unpaidCount}</div>
          </div>
        </div>
      )}

      <div style={s.filterArea} className="teacher-fees-filters">
        <div style={s.filterRow} className="teacher-fees-filter-row">
          <select style={s.filterSelect} value={activeAY} onChange={e => setActiveAY(e.target.value)}>
            {academicYears.map(y => <option key={y._id} value={y._id}>{y.year}</option>)}
          </select>
          <select style={s.filterSelect} value={filters.classId} onChange={e => setFilters(prev => ({ ...prev, classId: e.target.value }))}>
            <option value="">My Classes</option>
            {teacherClasses.map(c => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
          </select>
          <select style={s.filterSelect} value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}>
            <option value="">All Status</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
        <div style={s.searchRow} className="teacher-fees-search-row">
          <input
            style={s.searchInput}
            placeholder="Search by name or SATS no..."
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>
      </div>

      <div style={s.contextBar} className="teacher-fees-context">
        <div>
          <div style={s.contextTitle}>{selectedClass ? formatClass(selectedClass) : "Select a class"}</div>
          <div style={s.contextSub}>Showing student fee records assigned to you as class teacher.</div>
        </div>
        <div style={s.contextBadge}>{fees.length} record{fees.length === 1 ? "" : "s"}</div>
      </div>

      <div style={s.mainGrid} className="teacher-fees-grid">
        <div style={s.listPanel} className="teacher-fees-list">
          {loading && <div style={s.emptyBox}>Loading fee records...</div>}
          {!loading && !teacherClasses.length && (
            <div style={s.emptyBox}>You are not assigned as class teacher for any class yet.</div>
          )}
          {!loading && teacherClasses.length > 0 && fees.length === 0 && (
            <div style={s.emptyBox}>No fee records found for the selected filters.</div>
          )}
          {!loading && fees.map(fee => (
            <div
              key={fee._id}
              onClick={() => handleSelectFee(fee)}
              style={{
                ...s.studentCard,
                borderLeft: `5px solid ${fee.overallStatus === "Paid" ? "#10b981" : fee.overallStatus === "Partial" ? "#f59e0b" : "#ef4444"}`,
                background: selectedFee?._id === fee._id ? "var(--gold-pale)" : "white"
              }}
              className="teacher-fees-card"
            >
              <div style={s.studentInfo}>
                <div style={s.avatar}>{fee.student?.name?.[0]}</div>
                <div>
                  <div style={s.studentName}>{fee.student?.name}</div>
                  <div style={s.studentSub}>{fee.student?.satCode} • {formatClass(fee.student?.class)}</div>
                </div>
              </div>
              <div style={s.feeShortInfo} className="teacher-fees-card-meta">
                <div style={{ ...s.statusBadge, ...(fee.overallStatus === "Paid" ? s.bgPaid : fee.overallStatus === "Partial" ? s.bgPartial : s.bgUnpaid) }}>
                  {fee.overallStatus}
                </div>
                <div style={s.dueText}>Due: ₹{Number(fee.totalDue || 0).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={s.detailPanel} className="teacher-fees-detail">
          {feeDetailContent}
        </div>
      </div>

      <Modal
        isOpen={isFeeDetailModalOpen && Boolean(selectedFee)}
        onClose={closeFeeDetailModal}
        title={selectedFee?.student?.name || "Fee details"}
        subtitle={`${selectedFee?.student?.satCode || ""} ${selectedFee?.student?.class ? `• ${formatClass(selectedFee.student.class)}` : ""}`}
        maxWidth="760px"
      >
        <div className="teacher-fees-mobile-sheet">
          {feeDetailContent}
        </div>
      </Modal>

      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment — ${selectedFee?.student?.name || ""}`}
        footer={
          <div style={{ display: "flex", gap: "12px", width: "100%" }} className="teacher-fees-modal-actions">
            <button onClick={() => setIsPaymentModalOpen(false)} style={s.btnCancel}>Cancel</button>
            <button onClick={handleRecordPayment} style={s.btnConfirm} disabled={!allowTeacherFeeManagement}>
              Confirm & Save
            </button>
          </div>
        }
      >
        <div style={s.modalForm}>
          <div style={s.formGroup}>
            <label style={s.fLabel}>Amount to Pay (₹)</label>
            <input
              type="number"
              style={s.input}
              placeholder={`Max: ₹${selectedFee?.totalDue || 0}`}
              value={paymentForm.amount}
              onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
            />
          </div>
          <div style={s.formGroup}>
            <label style={s.fLabel}>Payment Method</label>
            <select style={s.input} value={paymentForm.method} onChange={e => setPaymentForm(prev => ({ ...prev, method: e.target.value }))}>
              <option>Cash</option>
              <option>Cheque</option>
              <option>DD</option>
              <option>Bank Transfer</option>
            </select>
          </div>
          <div style={s.formGroup}>
            <label style={s.fLabel}>Date of Payment</label>
            <MonthDatePicker
              value={paymentForm.paidDate}
              onChange={paidDate => setPaymentForm(prev => ({ ...prev, paidDate }))}
              inputStyle={s.input}
              labelStyle={{ display: "none" }}
              helperText="Pick the month first, then the payment day."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

const s = {
  warnBox: { display: "flex", gap: "12px", alignItems: "flex-start", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "var(--navy)", padding: "14px 16px", borderRadius: "12px", marginBottom: "16px" },
  warnSub: { marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" },
  errorBox: { background: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-text)", padding: "12px 16px", borderRadius: "10px", fontWeight: "800", marginBottom: "1rem" },
  statsBar: { background: "var(--navy)", borderTop: "4px solid var(--gold)", padding: "24px", borderRadius: "16px", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "10px", marginBottom: "2rem", boxShadow: "var(--shadow-md)" },
  statBox: { textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.1)" },
  statLabel: { fontSize: "0.7rem", color: "var(--gold-light)", textTransform: "uppercase", fontWeight: "700", marginBottom: "4px" },
  statValue: { fontSize: "1.2rem", color: "var(--white)", fontWeight: "800" },
  filterArea: { marginBottom: "2rem" },
  filterRow: { display: "flex", gap: "16px", marginBottom: "14px", flexWrap: "nowrap" },
  searchRow: { display: "flex", justifyContent: "center" },
  searchInput: { padding: "12px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "white", color: "var(--navy)", fontWeight: "600", width: "min(560px, 100%)" },
  filterSelect: { flex: 1, minWidth: 0, padding: "12px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "white", color: "var(--navy)", fontWeight: "600", width: "100%" },
  contextBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "18px", padding: "16px 18px", background: "rgba(14,107,107,0.05)", border: "1px solid rgba(14,107,107,0.1)", borderRadius: "14px" },
  contextTitle: { fontSize: "1rem", fontWeight: "900", color: "var(--navy)" },
  contextSub: { marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" },
  contextBadge: { background: "var(--gold-pale)", color: "var(--navy-dark)", padding: "6px 12px", borderRadius: "999px", fontWeight: "800", fontSize: "0.82rem" },
  mainGrid: { display: "grid", gridTemplateColumns: "380px 1fr", gap: "24px", height: "calc(100vh - 390px)" },
  listPanel: { background: "var(--white)", borderRadius: "16px", overflowY: "auto", border: "1px solid var(--border)", padding: "10px" },
  emptyBox: { padding: "28px", textAlign: "center", color: "var(--text-muted)", fontWeight: "700", lineHeight: 1.5 },
  studentCard: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", borderRadius: "12px", borderTop: "1px solid var(--border)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginBottom: "10px", cursor: "pointer", transition: "0.2s" },
  avatar: { width: "40px", height: "40px", borderRadius: "50%", background: "var(--gold-pale)", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800" },
  studentInfo: { display: "flex", gap: "12px", alignItems: "center" },
  studentName: { fontSize: "0.95rem", fontWeight: "700", color: "var(--navy)" },
  studentSub: { fontSize: "0.75rem", color: "var(--text-muted)" },
  feeShortInfo: { textAlign: "right" },
  statusBadge: { fontSize: "0.65rem", padding: "4px 10px", borderRadius: "20px", fontWeight: "800", textTransform: "uppercase", display: "inline-block" },
  bgPaid: { background: "#dcfce7", color: "#166534" },
  bgPartial: { background: "#fef3c7", color: "#92400e" },
  bgUnpaid: { background: "#fee2e2", color: "#991b1b" },
  dueText: { fontSize: "0.8rem", color: "#ef4444", fontWeight: "700", marginTop: "4px" },
  detailPanel: { background: "var(--white)", borderRadius: "16px", border: "1px solid var(--border)", overflowY: "auto", padding: "32px" },
  detailHeader: { display: "flex", gap: "24px", alignItems: "center", paddingBottom: "24px", borderBottom: "1px solid var(--border)", marginBottom: "24px" },
  largeAvatar: { width: "80px", height: "80px", borderRadius: "50%", background: "var(--navy)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", fontWeight: "800", border: "4px solid var(--gold-pale)" },
  detailName: { fontSize: "1.8rem", color: "var(--navy)", margin: 0, fontFamily: "var(--font-heading)" },
  detailSub: { color: "var(--text-muted)", marginBottom: "12px" },
  btnMainRecord: { background: "var(--navy)", color: "var(--gold-light)", border: "none", padding: "12px 20px", borderRadius: "30px", fontWeight: "800", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed" },
  detailMetrics: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "32px" },
  metricBox: { padding: "20px", borderRadius: "16px", background: "var(--light-bg)", textAlign: "center", border: "1px solid var(--border)" },
  metricLabel: { fontSize: "0.75rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" },
  metricValue: { fontSize: "1.5rem", fontWeight: "900", color: "var(--navy)" },
  sectionTitle: { fontSize: "1rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase", marginBottom: "16px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "12px", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "2px solid var(--border)" },
  td: { padding: "16px 12px", borderBottom: "1px solid var(--border)", fontSize: "0.95rem" },
  noPlanBox: { padding: "40px", textAlign: "center", background: "var(--gold-pale)", borderRadius: "16px", border: "1px solid var(--gold)", color: "var(--navy-dark)", marginTop: "20px" },
  placeholder: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "1.2rem", fontStyle: "italic" },
  modalForm: { display: "flex", flexDirection: "column", gap: "20px" },
  formGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  fLabel: { fontSize: "0.75rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase" },
  input: { padding: "12px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "white", color: "var(--navy)", fontWeight: "600", width: "100%" },
  btnCancel: { padding: "12px 24px", borderRadius: "30px", border: "none", background: "var(--light-bg)", color: "var(--text-muted)", fontWeight: "700", cursor: "pointer" },
  btnConfirm: { flex: 1, padding: "12px 24px", borderRadius: "30px", border: "none", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", fontWeight: "800", cursor: "pointer" }
};
