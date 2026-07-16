import React, { useState, useEffect, useMemo } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import SectionTitle from "../../components/SectionTitle";
import useActiveAcademicYear from "../../hooks/useActiveAcademicYear";
import Modal from "../../components/Modal";
import { jsPDF } from "jspdf";

const formatReceiptDate = (date) => {
  if (!date) return new Date().toLocaleDateString("en-IN");
  return new Date(date).toLocaleDateString("en-IN");
};

const loadReceiptLogo = () => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${window.location.origin}/logo.png`;
  });
};

const numberToIndianWords = (amount) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const underHundred = (n) => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
  };

  const underThousand = (n) => {
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

const getStudentId = (user) => {
  const rawId = user?.id || user?._id || user?.studentId || user?.profileId;
  return rawId ? String(rawId) : "";
};

const normalizeInstallmentMode = (value) => {
  const mode = String(value || "").trim().toUpperCase();
  if (["THIRD", "1/3", "TERM WISE", "TERM-WISE", "TERMWISE"].includes(mode)) return "TERMWISE";
  if (["HALF", "CUSTOM", "FULL"].includes(mode)) return mode;
  return "";
};

const SCHOOL_UPI_ID = import.meta.env.VITE_SCHOOL_UPI_ID || "lemhs@kbl";

export default function StudentFees() {
  const { user } = useAuth();
  const { academicYearLabel } = useActiveAcademicYear(user?.academicYear?.year);
  const [fee, setFee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [upiState, setUpiState] = useState({
    open: false,
    loading: false,
    phase: "select",
    term: null,
    selectedAmount: 0,
    customAmountInput: "",
    showCustomAmount: false,
    upiLink: "",
    qrCodeDataUrl: "",
    upiTrReference: "",
    payeeVpa: "",
    screenshotFile: null,
    screenshotName: "",
    selectedInstallmentMode: "",
    error: "",
  });

  const getTermConfirmedAmount = term => {
    const paidAmount = Number(term?.paidAmount || 0);
    if (paidAmount > 0) return paidAmount;
    if (term?.status === "Paid" || term?.paymentStatus === "PAID") {
      return Number(term?.amount || 0);
    }
    return 0;
  };

  const getTermRemainingAmount = term => {
    const amount = Number(term?.amount || 0);
    const remaining = amount - getTermConfirmedAmount(term);
    return Math.max(0, Math.round(remaining));
  };

  const getPaymentStatusLabel = (term) => {
    if (term.paymentStatus === "PENDING_VERIFICATION") return "Pending Verification";
    if (term.paymentStatus === "PAID" || term.status === "Paid") return "Paid";
    if (term.paymentStatus === "PARTIALLY_PAID" || term.status === "Partial") return "Partially Paid";
    if (term.paymentStatus === "REJECTED") return "Rejected";
    return "Unpaid";
  };

  const getPaymentStatusStyle = (term) => {
    if (term.paymentStatus === "PENDING_VERIFICATION") return s.badgePending;
    if (term.paymentStatus === "PAID" || term.status === "Paid") return s.badgePaid;
    if (term.paymentStatus === "PARTIALLY_PAID" || term.status === "Partial") return s.badgePartial;
    if (term.paymentStatus === "REJECTED") return s.badgeRejected;
    return s.badgeUnpaid;
  };

  const fetchFeeData = async () => {
    const studentId = getStudentId(user);
    if (!studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/student-fees/student/${studentId}`);
      setFee(data);
    } catch (e) {
      console.error(e);
      setFee(null);
      setError(e.response?.data?.message || "Fee details are not available yet.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchFeeData();
  }, [user]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const termItems = useMemo(() => (Array.isArray(fee?.terms) ? [...fee.terms].sort((a, b) => a.termNumber - b.termNumber) : []), [fee]);

  const closeUpiModal = () => {
    setUpiState(prev => ({
      ...prev,
      open: false,
      loading: false,
      phase: "select",
      error: "",
      screenshotFile: null,
      screenshotName: "",
      selectedInstallmentMode: "",
      customAmountInput: "",
      showCustomAmount: false,
      selectedAmount: 0
    }));
  };

  const openUpiPayment = (term) => {
    if (!term?._id || !fee?._id) return;
    if (term.paymentStatus === "PAID" || term.status === "Paid") return;
    if (term.paymentStatus === "PENDING_VERIFICATION") return;
    const remainingAmount = getTermRemainingAmount(term);

    setUpiState({
      open: true,
      loading: false,
      phase: "select",
      term,
      selectedAmount: remainingAmount,
      customAmountInput: String(remainingAmount || ""),
      showCustomAmount: false,
      upiLink: "",
      qrCodeDataUrl: "",
      upiTrReference: "",
      payeeVpa: "",
      screenshotFile: null,
      screenshotName: "",
      selectedInstallmentMode: "",
      error: "",
    });

  };

  const openBalanceUpiPayment = () => {
    openUpiPayment({
      _id: "overall",
      termName: "Balance Payment",
      amount: fee?.totalDue || fee?.totalAnnualFee || 0,
      paidAmount: 0,
      paymentStatus: "UNPAID",
      status: "Unpaid"
    });
  };

  const preparePaymentLink = async (amountOverride, installmentMode = "") => {
    const term = upiState.term;
    if (!term?._id) return;
    const remainingAmount = getTermRemainingAmount(term);
    const amount = Math.round(Number(amountOverride || upiState.selectedAmount || remainingAmount) || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setUpiState(prev => ({ ...prev, error: "Enter a valid amount." }));
      return;
    }
    if (amount > remainingAmount) {
      setUpiState(prev => ({ ...prev, error: "Amount cannot exceed the remaining due." }));
      return;
    }

    setUpiState(prev => ({
      ...prev,
      loading: true,
      phase: "pay",
      selectedAmount: amount,
      selectedInstallmentMode: installmentMode,
      error: "",
      upiLink: "",
      qrCodeDataUrl: "",
      upiTrReference: "",
      payeeVpa: ""
    }));

    try {
      const { data } = await api.get(`/student-fees/${getStudentId(user)}/upi-link/${term._id}`, {
        params: { amount }
      });
      setUpiState(prev => ({
        ...prev,
        loading: false,
        upiLink: data.upiLink,
        qrCodeDataUrl: data.qrCodeDataUrl,
        upiTrReference: data.transactionRef || data.upiTrReference || "",
        payeeVpa: data.payeeVpa || "",
        selectedAmount: Number(data.amount || amount)
      }));
    } catch (e) {
      setUpiState(prev => ({
        ...prev,
        loading: false,
        phase: "select",
        error: e.response?.data?.message || "Unable to load UPI payment details."
      }));
    }
  };

  const choosePresetAmount = async (mode) => {
    const term = upiState.term;
    if (!term) return;
    const remainingAmount = getTermRemainingAmount(term);
    const baseAmount = Number(term.amount || 0);
    const nextAmount = mode === "full"
      ? remainingAmount
      : mode === "half"
        ? Math.max(1, Math.round(baseAmount / 2))
        : Math.max(1, Math.round(baseAmount / 3));
    setUpiState(prev => ({
      ...prev,
      selectedAmount: nextAmount,
      selectedInstallmentMode: mode,
      error: ""
    }));
    await preparePaymentLink(nextAmount, mode);
  };

  const toggleCustomAmount = () => {
    setUpiState(prev => ({
      ...prev,
      showCustomAmount: true,
      error: "",
      customAmountInput: prev.customAmountInput || String(prev.selectedAmount || getTermRemainingAmount(prev.term) || "")
    }));
  };

  const applyCustomAmount = async () => {
    const term = upiState.term;
    if (!term) return;

    const remainingAmount = getTermRemainingAmount(term);
    const amount = Math.round(Number(upiState.customAmountInput || 0) || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setUpiState(prev => ({ ...prev, error: "Enter a valid custom amount." }));
      return;
    }
    if (amount > remainingAmount) {
      setUpiState(prev => ({ ...prev, error: "Custom amount cannot exceed the remaining due." }));
      return;
    }

    setUpiState(prev => ({
      ...prev,
      selectedAmount: amount,
      selectedInstallmentMode: "custom",
      error: ""
    }));
    await preparePaymentLink(amount, "custom");
  };

  const submitUpiClaim = async () => {
    const term = upiState.term;
    if (!term?._id) return;
    const screenshot = upiState.screenshotFile;
    const amount = Math.round(Number(upiState.selectedAmount || 0));

    if (!screenshot) {
      setUpiState(prev => ({ ...prev, error: "Please upload the payment screenshot." }));
      return;
    }

    const isValidType = ["image/jpeg", "image/png"].includes(screenshot.type);
    if (!isValidType) {
      setUpiState(prev => ({ ...prev, error: "Only JPG or PNG screenshots are allowed." }));
      return;
    }

    if (screenshot.size > 5 * 1024 * 1024) {
      setUpiState(prev => ({ ...prev, error: "Screenshot must be 5 MB or smaller." }));
      return;
    }

    try {
      const formData = new FormData();
      formData.append("screenshot", screenshot);
      formData.append("amount", String(amount));
      if (upiState.selectedInstallmentMode) {
        formData.append("installmentMode", upiState.selectedInstallmentMode);
      }
      const { data } = await api.post(`/student-fees/${getStudentId(user)}/terms/${term._id}/claim-payment`, formData);

      alert("Payment claim submitted for admin verification.");
      setFee(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          terms: (prev.terms || []).map(t => t._id === term._id ? { ...t, ...data.term } : t)
        };
      });
      closeUpiModal();
      fetchFeeData();
    } catch (e) {
      setUpiState(prev => ({ ...prev, error: e.response?.data?.message || "Failed to submit payment claim." }));
    }
  };

  const generatePDF = async (payment) => {
    const logo = await loadReceiptLogo();
    const student = fee?.student || user || {};
    const receiptClassLabel = [student?.class?.name || user?.class?.name, student?.class?.section || user?.class?.section].filter(Boolean).join("");
    const totalPaid = Number(payment.paidAmount || payment.amount || 0);
    const concession = Math.max(0, Number(payment.amount || 0) - totalPaid);
    const receiptNo = payment.receiptNumber || payment.razorpayPaymentId || payment.razorpayOrderId || `${payment.termName || "PAYMENT"}-${payment.termNumber || "NA"}`;
    const session = academicYearLabel || fee?.academicYear?.year || "Current Session";
    const transactionNo = payment.razorpayPaymentId || payment.razorpayOrderId || receiptNo;

    const doc = new jsPDF();
    const left = 12;
    const top = 10;
    const width = 186;
    const right = left + width;
    const line = (y) => doc.line(left, y, right, y);
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
    labelValue("Adm No", student.satCode || user?.satCode, 17, 72);
    labelValue("Name", student.name || user?.name, 17, 80);
    labelValue("Installment", payment.termName, 17, 88);
    labelValue("Date", formatReceiptDate(payment.paidDate), 132, 64);
    labelValue("Session", session, 132, 72);
    labelValue("Class", receiptClassLabel || "N/A", 132, 80);
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
    doc.text(payment.termName || "School Fee Payment", 33, rowY + 6);
    doc.text(String(Number(payment.amount || totalPaid).toLocaleString("en-IN")), 147, rowY + 6, { align: "right" });
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
    doc.text(payment.method || "Online", 44, 181);
    doc.text("Date", 123, 181);
    doc.text(formatReceiptDate(payment.paidDate), 196, 181, { align: "right" });
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

    doc.save(`Receipt-${receiptNo}.pdf`);
  };

  if (loading) return <div style={s.loading}>Loading fee data...</div>;
  if (!fee) return <div style={s.empty}>{error || "Fee structure not found. Contact admin."}</div>;

  const percentage = fee.totalAnnualFee > 0 ? Math.min(100, Math.round((fee.totalPaid / fee.totalAnnualFee) * 100)) : 0;
  const classLabel = [user?.class?.name, user?.class?.section].filter(Boolean).join("");
  const selectedTermRemainingAmount = getTermRemainingAmount(upiState.term);
  const selectedTermBaseAmount = Number(upiState.term?.amount || 0);
  const selectedTermConfirmedAmount = getTermConfirmedAmount(upiState.term);
  const selectedTermInstallmentMode = normalizeInstallmentMode(upiState.term?.installmentMode);
  const termWiseInstallmentAmount = Math.max(1, Math.round(selectedTermBaseAmount / 3));
  const termWiseNextRound = Math.min(3, Math.max(1, Math.floor(selectedTermConfirmedAmount / termWiseInstallmentAmount) + 1));
  const isTermWisePlan = selectedTermInstallmentMode === "TERMWISE";
  const isBelowTermWiseThreshold = selectedTermBaseAmount < 10000;
  const isAlreadyPartiallyPaid = selectedTermConfirmedAmount > 0;
  const showTermWiseOption = !isBelowTermWiseThreshold && !isAlreadyPartiallyPaid;
  const allowedPresetModes = isBelowTermWiseThreshold
    ? ["full"]
    : isAlreadyPartiallyPaid
      ? ["full", "half"]
      : ["full", "half", "termwise"];
  const fullAmountLabel = `Pay Full (remaining balance) - ₹${selectedTermRemainingAmount.toLocaleString("en-IN")}`;
  const halfInstallmentAmount = Math.max(1, Math.round(selectedTermBaseAmount / 2));
  const halfAmountLabel = `Pay Half (₹${halfInstallmentAmount.toLocaleString("en-IN")} of original term)`;
  const termWiseAmountLabel = isTermWisePlan
    ? `Pay Term Wise Round ${termWiseNextRound}/3 (₹${termWiseInstallmentAmount.toLocaleString("en-IN")})`
    : `Pay Term Wise (₹${termWiseInstallmentAmount.toLocaleString("en-IN")} each for 3 rounds)`;

  return (
    <div style={s.container} className="student-fees-page">
      <SectionTitle title="School Fee Portal" subtitle="View your annual balance and pay installments securely." />

      {/* Main Stats Card */}
      <div style={s.mainCard} className="student-fee-main-card">
        <div style={s.cardTop} className="student-fee-card-top">
          <div>
            <h2 style={s.studentName}>{user.name}</h2>
            <p style={s.studentSub}>{user.satCode} • Class {classLabel || "N/A"}</p>
          </div>
          <div style={s.annualBadge}>₹{fee.totalAnnualFee.toLocaleString()} Total Annual Fee</div>
        </div>

        <div style={s.statsGrid} className="student-fee-stats">
          <div style={s.statBox}>
            <label style={s.sLabel}>Total Paid</label>
            <div style={{...s.sValue, color: 'white'}}>₹{fee.totalPaid.toLocaleString()}</div>
          </div>
          <div style={s.statBox}>
            <label style={s.sLabel}>Current Balance Due</label>
            <div style={{...s.sValue, color: 'white'}}>₹{fee.totalDue.toLocaleString()}</div>
          </div>
        </div>

        <div style={s.progressRow} className="student-fee-progress">
          <div style={s.track}><div style={{...s.fill, width: `${percentage}%`}}></div></div>
          <span style={s.pText}>{percentage}% Paid</span>
        </div>
      </div>

      <h3 style={s.sectionTitle}>Term Payment Options</h3>
      {Number(fee.totalDue || 0) > 0 && (
        <div style={s.balancePayCard} className="student-balance-pay-card">
          <div>
            <div style={s.balancePayLabel}>Pay Remaining Balance</div>
            <div style={s.balancePayText}>
              You still owe ₹{Number(fee.totalDue || 0).toLocaleString("en-IN")}. You can pay the remaining balance via UPI.
            </div>
          </div>
          <button type="button" style={s.balancePayBtn} onClick={openBalanceUpiPayment}>
            Pay via UPI
          </button>
        </div>
      )}
      <div style={s.termGrid} className="student-term-grid">
        {termItems.length === 0 && (
          <div style={s.emptyTermBox}>Term-wise fee records are not available yet.</div>
        )}
        {termItems.map(term => {
          const statusLabel = getPaymentStatusLabel(term);
          const statusStyle = getPaymentStatusStyle(term);
          const canUseUpi = !(term.paymentStatus === "PENDING_VERIFICATION" || term.paymentStatus === "PAID" || term.status === "Paid");
          const paidAmount = getTermConfirmedAmount(term);
          const remainingAmount = getTermRemainingAmount(term);
          return (
            <div key={term._id} style={s.termCard} className="student-term-card">
              <div style={s.termHeader} className="student-term-header">
                <div>
                  <div style={s.termTitle}>{term.termName}</div>
                  <div style={s.termSub}>Amount: ₹{Number(term.amount || 0).toLocaleString("en-IN")}</div>
                  {paidAmount > 0 && (
                    <div style={s.termProgress}>
                      ₹{paidAmount.toLocaleString("en-IN")} of ₹{Number(term.amount || 0).toLocaleString("en-IN")} paid - ₹{remainingAmount.toLocaleString("en-IN")} remaining
                    </div>
                  )}
                </div>
                <span style={{ ...s.termBadge, ...statusStyle }} className="student-term-badge">{statusLabel}</span>
              </div>

              {canUseUpi ? (
                <div style={s.termActions} className="student-term-actions">
                  <button type="button" style={s.upiButton} onClick={() => openUpiPayment(term)}>
                    Pay via UPI (Direct)
                  </button>
                </div>
              ) : (
                <div style={s.termStatusLocked}>{statusLabel}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment History */}
      {fee.terms?.filter(t => Number(t.paidAmount || 0) > 0).length > 0 && (
        <div style={s.historySection} className="student-table-card">
          <h3 style={s.sectionTitle}>Payment History & Receipts</h3>
          <table style={s.table} className="student-payment-history-table">
            <thead>
              <tr>
                <th style={s.th}>Description</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Paid Date</th>
                <th style={s.th}>Amount</th>
                <th style={s.th}>Method</th>
                <th style={s.th}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {fee.terms?.filter(t => Number(t.paidAmount || 0) > 0).reverse().map((pay, idx) => (
                <tr key={idx} className="student-payment-history-row">
                  <td style={s.td} data-label="Description">{pay.termName}</td>
                  <td style={s.td} data-label="Status"><span style={{ ...s.termBadge, ...getPaymentStatusStyle(pay) }}>{getPaymentStatusLabel(pay)}</span></td>
                  <td style={s.td} data-label="Paid Date">{pay.paidDate}</td>
                  <td style={s.td} data-label="Amount">₹{pay.paidAmount.toLocaleString()}</td>
                  <td style={s.td} data-label="Method">{pay.method}</td>
                  <td style={s.td} data-label="Receipt">
                    <button onClick={() => generatePDF(pay)} style={s.btnSmall}>
                      <i className="fa-solid fa-file-pdf"></i> Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={upiState.open}
        onClose={closeUpiModal}
        title={`UPI Payment - ${upiState.term?.termName || ""}`}
        subtitle="Pay to the school UPI ID, then upload the payment success screenshot for manual verification."
        maxWidth="760px"
      >
        <div style={s.upiModalBody} className="student-upi-modal">
          {upiState.error && <div style={s.upiError}>{upiState.error}</div>}

          {upiState.phase === "select" ? (
            <>
              <div style={s.amountChooser}>
                <div style={s.amountChooserTitle}>Choose how much to pay</div>
                <div style={s.amountChooserSub}>
                  Remaining due: ₹{getTermRemainingAmount(upiState.term).toLocaleString("en-IN")}
                </div>
                <div style={s.amountButtons} className="student-upi-amount-buttons">
                  {allowedPresetModes.includes("full") && (
                    <button type="button" style={s.amountBtn} onClick={() => choosePresetAmount("full")}>
                      {fullAmountLabel}
                    </button>
                  )}
                  {allowedPresetModes.includes("half") && (
                    <button type="button" style={s.amountBtn} onClick={() => choosePresetAmount("half")}>
                      {halfAmountLabel}
                    </button>
                  )}
                  {allowedPresetModes.includes("termwise") && (
                    <button type="button" style={s.amountBtn} onClick={() => choosePresetAmount("termwise")}>
                      {termWiseAmountLabel}
                    </button>
                  )}
                  <button type="button" style={s.amountBtn} onClick={toggleCustomAmount}>
                    Custom amount
                  </button>
                </div>
                {upiState.showCustomAmount && (
                  <div style={s.customAmountBox}>
                    <div style={s.customAmountLabel}>Test a custom amount</div>
                    <div style={s.customAmountRow}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={upiState.customAmountInput}
                        onChange={e => setUpiState(prev => ({ ...prev, customAmountInput: e.target.value }))}
                        placeholder="Enter amount"
                        style={s.customAmountInput}
                      />
                      <button type="button" style={s.customAmountBtn} onClick={applyCustomAmount}>
                        Load UPI
                      </button>
                    </div>
                  </div>
                )}
                <div style={s.screenshotHint}>
                  Full uses the remaining balance. Half is based on half the original term amount and rounded to the nearest rupee.
                  {showTermWiseOption
                    ? " Term-wise splits the fee into 3 rounds and is shown only before any payment is made."
                    : isBelowTermWiseThreshold
                      ? " Since the term amount is below ₹10,000, only full payment is shown."
                      : " Since a payment has already been made, only full or half are shown."}
                </div>
                {showTermWiseOption && (
                  <div style={{ ...s.screenshotHint, marginTop: "10px", fontWeight: 700 }}>
                    Term-wise plan: round {termWiseNextRound} of 3. Next term amount: ₹{termWiseInstallmentAmount.toLocaleString("en-IN")}. Remaining after this payment: ₹{selectedTermRemainingAmount.toLocaleString("en-IN")}.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {upiState.loading ? (
                <div style={s.upiLoading}>Loading UPI payment details...</div>
              ) : (
                <>
                  <div style={s.upiInfoGrid} className="student-upi-info-grid">
                    <div style={s.upiInfoCard}>
                      <div style={s.upiInfoLabel}>UPI ID</div>
                      <div style={s.upiInfoValue}>{upiState.payeeVpa || SCHOOL_UPI_ID}</div>
                    </div>
                    <div style={s.upiInfoCard}>
                      <div style={s.upiInfoLabel}>Amount</div>
                      <div style={s.upiInfoValue}>₹{Number(upiState.selectedAmount || 0).toLocaleString("en-IN")}</div>
                    </div>
                    <div style={s.upiInfoCard}>
                      <div style={s.upiInfoLabel}>Reference</div>
                      <div style={s.upiInfoValue}>{upiState.upiTrReference || "N/A"}</div>
                    </div>
                    <div style={s.upiInfoCard}>
                      <div style={s.upiInfoLabel}>Remaining After This</div>
                      <div style={s.upiInfoValue}>
                        ₹{Math.max(0, getTermRemainingAmount(upiState.term) - Number(upiState.selectedAmount || 0)).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>

                  {isMobile ? (
                    <a href={upiState.upiLink} style={s.upiDeepLink} onClick={closeUpiModal}>
                      Open in UPI App
                    </a>
                  ) : (
                    <div style={s.qrWrap}>
                      {upiState.qrCodeDataUrl ? (
                        <img src={upiState.qrCodeDataUrl} alt="UPI QR code" style={s.qrImg} />
                      ) : (
                        <div style={s.qrPlaceholder}>QR code will appear here.</div>
                      )}
                    </div>
                  )}

                  <div style={s.claimBox} className="student-claim-box">
                    <label style={s.claimLabel}>Upload payment screenshot</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={e => setUpiState(prev => ({
                        ...prev,
                        screenshotFile: e.target.files?.[0] || null,
                        screenshotName: e.target.files?.[0]?.name || ""
                      }))}
                      style={s.claimInput}
                    />
                    <div style={s.screenshotHint}>
                      JPG or PNG only, up to 5 MB. {upiState.screenshotName ? `Selected: ${upiState.screenshotName}` : "No file selected yet."}
                    </div>
                    <button type="button" onClick={submitUpiClaim} style={s.claimBtn}>
                      Submit for Verification
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

const s = {
  container: { maxWidth: '1200px', margin: '0 auto' },
  loading: { padding: '80px', textAlign: 'center', color: 'var(--navy)', fontWeight: '800' },
  empty: { padding: '80px', textAlign: 'center', background: 'white', borderRadius: '20px', color: 'var(--text-muted)' },
  mainCard: { background: 'linear-gradient(135deg, var(--navy), var(--navy-dark))', padding: '40px', borderRadius: '24px', color: 'white', marginBottom: '40px', boxShadow: 'var(--shadow-lg)', borderTop: '4px solid var(--gold)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' },
  studentName: { margin: 0, fontSize: '2.2rem', fontFamily: 'var(--font-heading)', color: 'white' },
  studentSub: { color: 'var(--gold-light)', fontWeight: '600', marginTop: '6px' },
  annualBadge: { background: 'rgba(255,255,255,0.1)', padding: '10px 20px', borderRadius: '30px', fontWeight: '800', color: 'var(--gold-light)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.9rem' },
  statsGrid: { display: 'flex', gap: '50px', marginBottom: '40px' },
  statBox: { flex: 1 },
  sLabel: { fontSize: '0.75rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontWeight: '800', marginBottom: '10px', display: 'block' },
  sValue: { fontSize: '2.4rem', fontWeight: '900', fontFamily: 'var(--font-heading)' },
  progressRow: { display: 'flex', alignItems: 'center', gap: '20px' },
  track: { flex: 1, height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' },
  fill: { height: '100%', background: 'var(--gold)', transition: '1s ease-out' },
  pText: { fontWeight: '900', color: 'var(--gold)', fontSize: '1.2rem' },

  sectionTitle: { fontSize: '1.2rem', fontWeight: '800', color: 'var(--navy)', marginBottom: '24px', borderLeft: '5px solid var(--gold)', paddingLeft: '15px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  historySection: { background: 'white', padding: '30px', borderRadius: '24px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '16px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', borderBottom: '2px solid var(--border)', fontWeight: '800' },
  td: { padding: '16px', borderBottom: '1px solid var(--border)', color: 'var(--navy)', fontWeight: '600' },
  btnSmall: { padding: '8px 16px', borderRadius: '30px', border: '1.5px solid var(--navy)', background: 'white', color: 'var(--navy)', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' },
  termGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px", marginBottom: "40px" },
  balancePayCard: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", background: "rgba(14,107,107,0.08)", border: "1px solid rgba(14,107,107,0.18)", borderRadius: "18px", padding: "18px 20px", marginBottom: "20px", flexWrap: "wrap" },
  balancePayLabel: { fontSize: "0.78rem", textTransform: "uppercase", color: "var(--gold)", fontWeight: "900", letterSpacing: "0.08em", marginBottom: "6px" },
  balancePayText: { color: "var(--navy)", fontWeight: "700" },
  balancePayBtn: { padding: "14px 18px", borderRadius: "18px", border: "none", background: "var(--navy)", color: "var(--gold-light)", fontWeight: "800", cursor: "pointer", whiteSpace: "nowrap" },
  termCard: { background: "white", borderRadius: "18px", border: "1px solid var(--border)", padding: "20px", boxShadow: "var(--shadow-sm)" },
  termHeader: { display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "flex-start", marginBottom: "16px" },
  termTitle: { fontSize: "1.05rem", fontWeight: "900", color: "var(--navy)" },
  termSub: { marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: "600" },
  termBadge: { fontSize: "0.65rem", padding: "5px 10px", borderRadius: "999px", fontWeight: "900", textTransform: "uppercase", whiteSpace: "nowrap" },
  badgeUnpaid: { background: "#fee2e2", color: "#991b1b" },
  badgePending: { background: "#fef3c7", color: "#92400e" },
  badgePaid: { background: "#dcfce7", color: "#166534" },
  badgePartial: { background: "#fef3c7", color: "#92400e" },
  badgeRejected: { background: "#e5e7eb", color: "#374151" },
  termProgress: { marginTop: "8px", fontSize: "0.82rem", color: "var(--navy)", fontWeight: "700", lineHeight: 1.5 },
  termActions: { display: "flex", gap: "12px", flexWrap: "wrap" },
  upiButton: { flex: 1, minWidth: "180px", padding: "14px 16px", borderRadius: "18px", border: "1px solid #0e6b6b", background: "rgba(14,107,107,0.08)", color: "var(--navy)", fontWeight: "800", cursor: "pointer" },
  termStatusLocked: { padding: "14px 16px", borderRadius: "18px", background: "var(--light-bg)", color: "var(--navy)", fontWeight: "800", textAlign: "center" },
  emptyTermBox: { gridColumn: "1 / -1", padding: "24px", borderRadius: "16px", border: "1px dashed var(--border)", color: "var(--text-muted)", textAlign: "center", fontWeight: "700" },
  upiModalBody: { display: "flex", flexDirection: "column", gap: "18px" },
  amountChooser: { display: "flex", flexDirection: "column", gap: "14px", padding: "18px", borderRadius: "18px", border: "1px solid var(--border)", background: "var(--light-bg)" },
  amountChooserTitle: { fontSize: "1rem", fontWeight: "900", color: "var(--navy)" },
  amountChooserSub: { fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: "700" },
  amountButtons: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" },
  amountBtn: { padding: "14px 16px", borderRadius: "18px", border: "none", background: "var(--navy)", color: "var(--gold-light)", fontWeight: "800", cursor: "pointer" },
  customAmountBox: { display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "16px", background: "rgba(14,107,107,0.06)", border: "1px dashed rgba(14,107,107,0.24)" },
  customAmountLabel: { fontSize: "0.82rem", fontWeight: "900", color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em" },
  customAmountRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  customAmountInput: { flex: "1 1 180px", minWidth: "180px", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--border)", fontWeight: "700", color: "var(--navy)" },
  customAmountBtn: { padding: "12px 16px", borderRadius: "14px", border: "none", background: "var(--gold)", color: "var(--navy)", fontWeight: "900", cursor: "pointer" },
  upiLoading: { padding: "24px", textAlign: "center", color: "var(--navy)", fontWeight: "800" },
  upiError: { background: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-text)", padding: "12px 16px", borderRadius: "12px", fontWeight: "800" },
  upiInfoGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" },
  upiInfoCard: { background: "var(--light-bg)", borderRadius: "14px", padding: "14px 16px", border: "1px solid var(--border)" },
  upiInfoLabel: { fontSize: "0.72rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "900", marginBottom: "6px" },
  upiInfoValue: { fontWeight: "800", color: "var(--navy)", wordBreak: "break-word" },
  qrWrap: { display: "flex", justifyContent: "center", padding: "10px" },
  qrImg: { width: "280px", maxWidth: "100%", height: "auto", borderRadius: "16px", border: "1px solid var(--border)", background: "white" },
  qrPlaceholder: { padding: "40px 20px", borderRadius: "16px", border: "1px dashed var(--border)", color: "var(--text-muted)", fontWeight: "700" },
  claimBox: { display: "flex", flexDirection: "column", gap: "10px" },
  claimLabel: { fontSize: "0.75rem", textTransform: "uppercase", color: "var(--gold)", fontWeight: "900" },
  claimInput: { padding: "12px 14px", borderRadius: "12px", border: "1.5px solid var(--border)", fontWeight: "600", color: "var(--navy)", width: "100%", background: "var(--white)" },
  screenshotHint: { fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: "600", lineHeight: 1.5 },
  claimBtn: { padding: "14px 16px", borderRadius: "18px", border: "none", background: "var(--navy)", color: "var(--gold-light)", fontWeight: "800", cursor: "pointer" },
  upiDeepLink: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", borderRadius: "18px", background: "var(--navy)", color: "var(--gold-light)", fontWeight: "800", textDecoration: "none" }
};
