import React, { useState, useEffect } from "react";
import api from "../../api/axios";
import SectionTitle from "../../components/SectionTitle";
import Modal from "../../components/Modal";
import MonthDatePicker from "../../components/MonthDatePicker";
import { jsPDF } from "jspdf";

const formatReceiptDate = date => {
  if (!date) return new Date().toLocaleDateString("en-IN");
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleDateString("en-IN");
  return parsed.toLocaleDateString("en-IN");
};

const loadReceiptLogo = () => new Promise(resolve => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = `${window.location.origin}/logo.png`;
});

const numberToIndianWords = amount => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const underHundred = n => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  };

  const underThousand = n => {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ""}${hundred && rest ? " " : ""}${rest ? underHundred(rest) : ""}`;
  };

  const rupees = Math.round(Number(amount || 0));
  if (rupees === 0) return "Zero Rupees Only";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  const parts = [];
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));

  return `${parts.join(" ")} Rupees Only`;
};

export default function Fees() {
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedFee, setSelectedFee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [academicYears, setAcademicYears] = useState([]);
  const [activeAY, setActiveAY] = useState("");
  const [classes, setClasses] = useState([]);
  const [filters, setFilters] = useState({ classId: "", search: "", status: "" });
  const [error, setError] = useState("");
  const [allowTeacherFeeManagement, setAllowTeacherFeeManagement] = useState(true);
  const [savingTeacherFeePermission, setSavingTeacherFeePermission] = useState(false);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "", method: "Cash", paidDate: new Date().toISOString().split('T')[0]
  });

  const formatClass = cls => {
    if (!cls) return "No class";
    return `${cls.name || ""}${cls.section || ""}`.trim() || "No class";
  };

  const fetchSetupData = async () => {
    setLoading(true);
    try {
      const [ayRes, clRes, settingsRes] = await Promise.all([
        api.get("/academic-years"),
        api.get("/classes"),
        api.get("/settings/teacher-fees")
      ]);
      setAcademicYears(ayRes.data);
      setClasses(clRes.data);
      setAllowTeacherFeeManagement(Boolean(settingsRes.data.allowTeacherFeeManagement));
      const active = ayRes.data.find(y => y.isActive);
      if (!activeAY) setActiveAY(active?._id || ayRes.data[0]?._id || "");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load fee setup data.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTeacherFeeManagement = async () => {
    const nextValue = !allowTeacherFeeManagement;
    setAllowTeacherFeeManagement(nextValue);
    setSavingTeacherFeePermission(true);
    try {
      const { data } = await api.put("/settings/teacher-fees", {
        allowTeacherFeeManagement: nextValue
      });
      setAllowTeacherFeeManagement(Boolean(data.allowTeacherFeeManagement));
    } catch (e) {
      setAllowTeacherFeeManagement(!nextValue);
      alert(e.response?.data?.message || "Permission update failed");
    } finally {
      setSavingTeacherFeePermission(false);
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

      setStudents(feeRes.data);
      setStats(statsRes.data);
      setSelectedFee(current => {
        if (!current) return null;
        return feeRes.data.find(fee => fee._id === current._id) || null;
      });
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load fee records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetupData();
  }, []);

  useEffect(() => {
    fetchFeeData();
  }, [activeAY, filters.classId, filters.status, filters.search]);

  const handleRecordPayment = async () => {
    if (!paymentForm.amount || paymentForm.amount <= 0) return alert("Enter valid amount");
    if (Number(paymentForm.amount) > Number(selectedFee?.totalDue || 0)) return alert("Payment cannot be more than total due");
    try {
      await api.post("/student-fees/record-flexible-payment", {
        studentFeeId: selectedFee._id,
        amount: paymentForm.amount,
        method: paymentForm.method,
        paidDate: paymentForm.paidDate
      });
      alert("Payment recorded successfully!");
      setIsPaymentModalOpen(false);
      // Refresh
      const { data } = await api.get(`/student-fees/student/${selectedFee.student?._id}?academicYear=${activeAY}`);
      setSelectedFee(data);
      fetchFeeData();
      setPaymentForm({
        amount: "", method: "Cash", paidDate: new Date().toISOString().split('T')[0]
      });
    } catch (e) { alert(e.response?.data?.message || "Failed to record payment"); }
  };

  const handleDeleteSelectedFee = async () => {
    if (!selectedFee) return;
    const confirmDelete = window.confirm(
      `This will permanently delete the fee record for ${selectedFee.student?.name || "this student"}. Continue?`
    );
    if (!confirmDelete) return;

    try {
      await api.delete(`/student-fees/${selectedFee._id}`);
      alert("Fee record deleted permanently.");
      setSelectedFee(null);
      fetchFeeData();
    } catch (e) {
      alert(e.response?.data?.message || "Failed to delete fee record");
    }
  };

  const handleViewReceipt = async term => {
    if (!selectedFee?.student || !term) return;
    const logo = await loadReceiptLogo();
    const student = selectedFee.student || {};
    const classLabel = [student?.class?.name, student?.class?.section].filter(Boolean).join("");
    const totalPaid = Number(term.paidAmount || 0);
    const receiptNo = term.receiptNumber || term.razorpayPaymentId || term.razorpayOrderId || `${term.termName || "PAYMENT"}-${term.termNumber || "NA"}`;
    const receiptDate = term.receiptGeneratedAt || term.paidDate || term.updatedAt || term.claimedAt;
    const session = selectedFee?.academicYear?.year || "Current Session";
    const transactionNo = term.razorpayPaymentId || term.razorpayOrderId || term.utrNumber || term.upiTrReference || receiptNo;
    const concession = Math.max(0, Number(term.amount || 0) - totalPaid);

    const doc = new jsPDF();
    const left = 12;
    const top = 10;
    const width = 186;
    const right = left + width;
    const line = y => doc.line(left, y, right, y);
    const labelValue = (label, value, x, y) => {
      doc.setFont("times", "bold");
      doc.text(label, x, y);
      doc.setFont("times", "normal");
      doc.text(":", x + 30, y);
      doc.text(String(value || "N/A"), x + 34, y);
    };

    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.25);
    doc.rect(left, top, width, 246);

    if (logo) doc.addImage(logo, "PNG", 18, 15, 25, 25);

    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text("Loretto Central School", 105, 21, { align: "center" });
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.text("Love through service", 105, 30, { align: "center" });
    doc.setFontSize(10);
    doc.text("Official Fee Payment Receipt", 105, 37, { align: "center" });

    doc.setFillColor(218, 218, 218);
    doc.rect(left, 46, width, 8, "F");
    line(46);
    line(54);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("FEE RECEIPT", 105, 51.8, { align: "center" });

    doc.setFontSize(11);
    labelValue("Receipt No", receiptNo, 17, 64);
    labelValue("Adm No", student.satCode, 17, 72);
    labelValue("Name", student.name, 17, 80);
    labelValue("Installment", term.termName, 17, 88);
    labelValue("Date", formatReceiptDate(receiptDate), 132, 64);
    labelValue("Session", session, 132, 72);
    labelValue("Class", classLabel || "N/A", 132, 80);
    labelValue("CounterNo", "LCS-RECEIPT", 132, 88);

    const tableTop = 94;
    const rowHeight = 9;
    const columns = [left, 30, 132, 154, 176, right];
    doc.setFillColor(218, 218, 218);
    doc.rect(left, tableTop, width, rowHeight, "F");
    doc.setFont("times", "bold");
    doc.text("Sl.No", 17, 100);
    doc.text("Description", 33, 100);
    doc.text("Due", 147, 100, { align: "right" });
    doc.text("Con", 169, 100, { align: "right" });
    doc.text("Paid", 193, 100, { align: "right" });

    const rowY = tableTop + rowHeight;
    doc.setFont("times", "normal");
    doc.text("1", 26, rowY + 6, { align: "right" });
    doc.text(term.termName || "School Fee Payment", 33, rowY + 6);
    doc.text(String(Number(term.amount || totalPaid).toLocaleString("en-IN")), 147, rowY + 6, { align: "right" });
    doc.text(String(concession.toLocaleString("en-IN")), 169, rowY + 6, { align: "right" });
    doc.text(String(totalPaid.toLocaleString("en-IN")), 193, rowY + 6, { align: "right" });

    for (const x of columns) doc.line(x, tableTop, x, rowY + rowHeight);
    line(tableTop);
    line(rowY);
    line(rowY + rowHeight);
    doc.line(left, rowY + rowHeight, left, 162);
    doc.line(right, rowY + rowHeight, right, 162);

    doc.setFillColor(218, 218, 218);
    doc.rect(left, 162, width, 8, "F");
    line(162);
    line(170);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("PAY MODE INFORMATION", 105, 167.8, { align: "center" });

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text("Pay Mode", 14, 181);
    doc.text(term.method || "Manual", 44, 181);
    doc.text("Date", 123, 181);
    doc.text(formatReceiptDate(term.paidDate || receiptDate), 196, 181, { align: "right" });
    doc.text("Transaction No", 14, 190);
    doc.text(String(transactionNo).slice(0, 32), 44, 190);
    doc.text("Number", 123, 190);
    doc.text(receiptNo, 196, 190, { align: "right" });
    doc.setFillColor(190, 190, 190);
    doc.rect(left, 193, width, 8, "F");
    doc.text("Total", 14, 198.5);
    doc.text(String(totalPaid.toLocaleString("en-IN")), 196, 198.5, { align: "right" });

    line(211);
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text("Total :", 47, 220);
    doc.text(String(totalPaid.toLocaleString("en-IN")), 194, 220, { align: "right" });
    line(224);
    doc.text("Total in Words:", 15, 233);
    doc.setFont("times", "normal");
    doc.text(numberToIndianWords(totalPaid), 50, 233, { maxWidth: 140 });
    line(239);

    doc.setDrawColor(0, 0, 0);
    doc.rect(15, 241, 24, 12);
    doc.setFontSize(8);
    doc.text("Receipt ID", 27, 246, { align: "center" });
    doc.text(receiptNo.slice(-10), 27, 250, { align: "center" });
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.text("This is a computer generated Receipt. Does not require signature.", 105, 251, { align: "center" });
    doc.setFont("times", "bold");
    doc.setTextColor(110, 110, 110);
    doc.text("PARENT COPY", 105, 261, { align: "center" });

    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
  };

  return (
    <div>
      <SectionTitle title="Fee Management" subtitle="Track collections and record offline payments." />

      <div style={s.permissionBar}>
        <div>
          <div style={s.permissionTitle}>Teacher Fee Access</div>
          <div style={s.permissionSub}>Allow class teachers to view student fees and record payments from their portal.</div>
        </div>
        <button
          type="button"
          style={{ ...s.permissionBtn, ...(allowTeacherFeeManagement ? s.permissionOn : s.permissionOff) }}
          onClick={handleToggleTeacherFeeManagement}
          disabled={savingTeacherFeePermission}
        >
          <i className={`fa-solid ${allowTeacherFeeManagement ? "fa-user-check" : "fa-user-lock"}`}></i>
          {savingTeacherFeePermission ? "Saving..." : allowTeacherFeeManagement ? "Teachers Can Record" : "Teachers Blocked"}
        </button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* Stats Bar */}
      {stats && (
        <div style={s.statsBar}>
          <div style={s.statBox}>
            <div style={s.statLabel}>Expected</div>
            <div style={s.statValue}>₹{Number(stats.totalFeeExpected || 0).toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Collected</div>
            <div style={s.statValue}>₹{Number(stats.totalCollected || 0).toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Total Due</div>
            <div style={{...s.statValue, color: '#ef4444'}}>₹{Number(stats.totalDue || 0).toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Paid Students</div>
            <div style={s.statValue}>{stats.paidCount}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Partial</div>
            <div style={s.statValue}>{stats.partialCount}</div>
          </div>
          <div style={s.statBox}>
            <div style={s.statLabel}>Unpaid</div>
            <div style={s.statValue}>{stats.unpaidCount}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={s.filterArea}>
        <div style={s.filterRow}>
          <select style={s.filterSelect} value={activeAY} onChange={e => setActiveAY(e.target.value)}>
            {academicYears.map(y => <option key={y._id} value={y._id}>{y.year}</option>)}
          </select>
          <select style={s.filterSelect} value={filters.classId} onChange={e => setFilters({...filters, classId: e.target.value})}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c._id} value={c._id}>{formatClass(c)}</option>)}
          </select>
          <select style={s.filterSelect} value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
            <option value="">All Status</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
        <div style={s.searchRow}>
          <input 
            style={s.searchInput} 
            placeholder="Search by name, SATS no. or mobile..." 
            value={filters.search} 
            onChange={e => setFilters({...filters, search: e.target.value})}
          />
        </div>
      </div>

      <div style={s.mainGrid}>
        {/* Left List */}
        <div style={s.listPanel}>
          {loading && <div style={s.emptyBox}>Loading fee records...</div>}
          {!loading && students.length === 0 && (
            <div style={s.emptyBox}>
              No fee records found. Set up fee structure for a class, then make sure students are assigned to that academic year.
            </div>
          )}
          {!loading && students.map(fee => (
            <div 
              key={fee._id} 
              onClick={() => setSelectedFee(fee)}
              style={{
                ...s.studentCard, 
                borderLeft: `5px solid ${fee.overallStatus === "Paid" ? "#10b981" : fee.overallStatus === "Partial" ? "#f59e0b" : "#ef4444"}`,
                background: selectedFee?._id === fee._id ? "var(--gold-pale)" : "white"
              }}
            >
              <div style={s.studentInfo}>
                <div style={s.avatar}>{fee.student?.name?.[0]}</div>
                <div>
                  <div style={s.studentName}>{fee.student?.name}</div>
                  <div style={s.studentSub}>{fee.student?.satCode} • {formatClass(fee.student?.class)}</div>
                </div>
              </div>
              <div style={s.feeShortInfo}>
                <div style={{...s.statusBadge, ...(fee.overallStatus === "Paid" ? s.bgPaid : fee.overallStatus === "Partial" ? s.bgPartial : s.bgUnpaid)}}>
                  {fee.overallStatus}
                </div>
                <div style={s.dueText}>Due: ₹{Number(fee.totalDue || 0).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Detail */}
        <div style={s.detailPanel}>
          {selectedFee ? (
            <div style={{animation: 'fadeIn 0.3s ease'}}>
               <div style={s.detailHeader}>
                  <div style={s.largeAvatar}>{selectedFee.student?.name?.[0]}</div>
                  <div style={{flex: 1}}>
                    <h2 style={s.detailName}>{selectedFee.student?.name}</h2>
                    <p style={s.detailSub}>{selectedFee.student?.satCode} • {formatClass(selectedFee.student?.class)}</p>
                    <div style={{...s.statusBadge, ...(selectedFee.overallStatus === "Paid" ? s.bgPaid : selectedFee.overallStatus === "Partial" ? s.bgPartial : s.bgUnpaid)}}>
                      Overall Status: {selectedFee.overallStatus}
                    </div>
                  </div>
                  <button onClick={() => setIsPaymentModalOpen(true)} style={s.btnMainRecord} disabled={selectedFee.totalDue <= 0}>
                    <i className="fa-solid fa-plus-circle"></i> Record Payment
                  </button>
                  <button onClick={handleDeleteSelectedFee} style={s.btnDeleteRecord}>
                    <i className="fa-solid fa-trash-can"></i> Permanent Delete
                  </button>
               </div>

               <div style={s.detailMetrics}>
                  <div style={s.metricBox}>
                    <div style={s.metricLabel}>Annual Total</div>
                    <div style={s.metricValue}>₹{Number(selectedFee.totalAnnualFee || 0).toLocaleString()}</div>
                  </div>
                  <div style={s.metricBox}>
                    <div style={s.metricLabel}>Total Paid</div>
                    <div style={{...s.metricValue, color: '#10b981'}}>₹{Number(selectedFee.totalPaid || 0).toLocaleString()}</div>
                  </div>
                  <div style={s.metricBox}>
                    <div style={s.metricLabel}>Total Due</div>
                    <div style={{...s.metricValue, color: '#ef4444'}}>₹{Number(selectedFee.totalDue || 0).toLocaleString()}</div>
                  </div>
               </div>

               <div style={s.sectionTitle}>Transaction History</div>
               {selectedFee.terms.filter(t => Number(t.paidAmount || 0) > 0).length > 0 ? (
                 <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Description</th>
                        <th style={s.th}>Status</th>
                        <th style={s.th}>Amount</th>
                        <th style={s.th}>Method</th>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFee.terms.filter(t => Number(t.paidAmount || 0) > 0).reverse().map((term, idx) => (
                        <tr key={idx}>
                          <td style={s.td}>{term.termName}</td>
                          <td style={s.td}>
                            <span style={{ ...s.statusBadge, ...(term.paymentStatus === "PARTIALLY_PAID" || term.status === "Partial" ? s.bgPartial : s.bgPaid) }}>
                              {term.paymentStatus === "PARTIALLY_PAID" || term.status === "Partial" ? "Partial" : "Paid"}
                            </span>
                          </td>
                          <td style={s.td}>₹{Number(term.paidAmount || 0).toLocaleString()}</td>
                          <td style={s.td}>{term.method}</td>
                          <td style={s.td}>{term.paidDate}</td>
                          <td style={s.td}>
                            <button style={s.btnReceipt} onClick={() => handleViewReceipt(term)}>
                              <i className="fa-solid fa-file-invoice"></i> Receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               ) : (
                 <div style={s.noPlanBox}>
                    <i className="fa-solid fa-receipt" style={{fontSize: '2rem', marginBottom: '10px'}}></i>
                    <p>No payments recorded yet.</p>
                 </div>
               )}
            </div>
          ) : (
            <div style={s.placeholder}>Select a student to manage fees</div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment — ${selectedFee?.student?.name}`}
        footer={
          <div style={{display: 'flex', gap: '12px', width: '100%'}}>
            <button onClick={() => setIsPaymentModalOpen(false)} style={s.btnCancel}>Cancel</button>
            <button onClick={handleRecordPayment} style={s.btnConfirm}>Confirm & Save</button>
          </div>
        }
      >
        <div style={s.modalForm}>
          <div style={s.formGroup}>
            <label style={s.fLabel}>Amount to Pay (₹)</label>
            <input 
              type="number" 
              style={s.input} 
              placeholder={`Max: ₹${selectedFee?.totalDue}`}
              value={paymentForm.amount} 
              onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} 
            />
          </div>
          <div style={s.formGroup}>
            <label style={s.fLabel}>Payment Method</label>
            <select style={s.input} value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}>
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
  permissionBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "18px", padding: "16px 18px", background: "rgba(14,107,107,0.05)", border: "1px solid rgba(14,107,107,0.12)", borderRadius: "14px", flexWrap: "wrap" },
  permissionTitle: { fontSize: "1rem", fontWeight: "900", color: "var(--navy)" },
  permissionSub: { marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" },
  permissionBtn: { border: "none", padding: "12px 18px", borderRadius: "999px", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", transition: "0.2s" },
  permissionOn: { background: "var(--navy)", color: "var(--gold-light)" },
  permissionOff: { background: "#fee2e2", color: "#991b1b" },
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
  input: { padding: "12px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "white", color: "var(--navy)", fontWeight: "600", width: '100%' },
  mainGrid: { display: "grid", gridTemplateColumns: "380px 1fr", gap: "24px", height: "calc(100vh - 350px)" },
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
  btnDeleteRecord: { background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "var(--white)", border: "none", padding: "12px 20px", borderRadius: "30px", fontWeight: "800", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 8px 18px rgba(220,38,38,0.22)" },
  detailMetrics: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "32px" },
  metricBox: { padding: "20px", borderRadius: "16px", background: "var(--light-bg)", textAlign: "center", border: "1px solid var(--border)" },
  metricLabel: { fontSize: "0.75rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" },
  metricValue: { fontSize: "1.5rem", fontWeight: "900", color: "var(--navy)" },
  sectionTitle: { fontSize: "1rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase", marginBottom: "16px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "12px", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "2px solid var(--border)" },
  td: { padding: "16px 12px", borderBottom: "1px solid var(--border)", fontSize: "0.95rem" },
  btnReceipt: { background: "var(--light-bg)", color: "var(--navy)", border: "1px solid var(--navy)", padding: "8px 16px", borderRadius: "20px", fontWeight: "700", fontSize: "0.8rem", cursor: "pointer" },
  noPlanBox: { padding: '40px', textAlign: 'center', background: 'var(--gold-pale)', borderRadius: '16px', border: '1px solid var(--gold)', color: 'var(--navy-dark)', marginTop: '20px' },
  placeholder: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "1.2rem", fontStyle: "italic" },
  modalForm: { display: "flex", flexDirection: "column", gap: "20px" },
  formGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  fLabel: { fontSize: "0.75rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase" },
  btnCancel: { padding: "12px 24px", borderRadius: "30px", border: "none", background: "var(--light-bg)", color: "var(--text-muted)", fontWeight: "700", cursor: "pointer" },
  btnConfirm: { flex: 1, padding: "12px 24px", borderRadius: "30px", border: "none", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", fontWeight: "800", cursor: "pointer" }
};
