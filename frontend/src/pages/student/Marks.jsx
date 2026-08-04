import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import SectionTitle from "../../components/SectionTitle";
import useActiveAcademicYear from "../../hooks/useActiveAcademicYear";

const formatPercent = value => `${Number(value || 0).toFixed(1)}%`;
const SCHOOL_NAME = "LORETTO CENTRAL SCHOOL";
const SCHOOL_ADDRESS = "Amtady Village, Loretto Post Bantwal 574211";
const SCHOOL_PHONE = "+919480663011";
const SCHOOL_EMAIL = "Lorettocentralschool@gmail.com";
const SOFTWARE_CREDIT = "Software developed by Appvertex";

const cleanFileName = value => String(value || "report-card").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "");
const formatDate = value => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const loadLogo = async () => {
  try {
    const response = await fetch("/logo.png");
    const blob = await response.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const fitText = (doc, text, maxWidth) => {
  const value = String(text ?? "N/A");
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let output = value;
  while (output.length > 3 && doc.getTextWidth(`${output}...`) > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}...`;
};

const getStudentId = (user) => {
  const rawId = user?.id || user?._id || user?.studentId || user?.profileId;
  return rawId ? String(rawId) : "";
};

export default function Marks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { examType } = useParams();
  const [report, setReport] = useState({ subjects: {} });
  const [examTypes, setExamTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { academicYearLabel } = useActiveAcademicYear(user?.academicYear?.year);

  const studentId = getStudentId(user);
  const activeType = examType ? decodeURIComponent(examType) : "";

  useEffect(() => {
    const loadReport = async () => {
      if (!studentId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const [marksResult, typesResult] = await Promise.allSettled([
        api.get(`/marks/report-card?studentId=${studentId}`),
        api.get("/exam-types")
      ]);

      if (marksResult.status === "fulfilled") {
        setReport(marksResult.value.data || { subjects: {} });
      } else {
        setReport({ subjects: {} });
        setError(marksResult.reason?.response?.data?.message || "Unable to load marks.");
      }

      if (typesResult.status === "fulfilled") {
        setExamTypes(typesResult.value.data || []);
      } else {
        setExamTypes([]);
      }

      setLoading(false);
    };

    loadReport();
  }, [studentId]);

  const rows = useMemo(() => {
    const subjects = report?.subjects || {};
    return Object.entries(subjects).flatMap(([subjectName, entries]) =>
      entries.map((entry, index) => ({
        id: `${subjectName}-${entry.examTitle}-${index}`,
        subjectName,
        examType: entry.examType || "Exam",
        ...entry
      }))
    );
  }, [report]);

  const typeNames = useMemo(() => {
    return examTypes.map(type => type.name).filter(Boolean);
  }, [examTypes]);

  const typeDetails = useMemo(() => {
    return examTypes.reduce((acc, type) => {
      if (type?.name) acc[type.name] = type;
      return acc;
    }, {});
  }, [examTypes]);

  const rowsByType = useMemo(() => (
    rows.reduce((acc, row) => {
      const type = row.examType || "Exam";
      if (!acc[type]) acc[type] = [];
      acc[type].push(row);
      return acc;
    }, {})
  ), [rows]);

  const isCategoryLaunched = !activeType || typeNames.includes(activeType);
  const activeRows = useMemo(() => (
    isCategoryLaunched ? (rowsByType[activeType] || []) : []
  ), [isCategoryLaunched, rowsByType, activeType]);
  const activeTypeInfo = activeType ? typeDetails[activeType] : null;
  const selectedTypeValue = activeType || "";

  const summary = useMemo(() => {
    const totalScored = activeRows.reduce((sum, row) => sum + Number(row.marksObtained || 0), 0);
    const totalMax = activeRows.reduce((sum, row) => sum + Number(row.maxMarks || 0), 0);
    const percentage = totalMax > 0 ? (totalScored / totalMax) * 100 : null;

    return {
      totalScored,
      totalMax,
      percentage,
      grade: percentage === null
        ? "N/A"
        : percentage >= 90 ? "A+"
          : percentage >= 80 ? "A"
            : percentage >= 70 ? "B+"
              : percentage >= 60 ? "B"
                : percentage >= 50 ? "C"
                  : percentage >= 35 ? "D"
                    : "F"
    };
  }, [activeRows]);

  const classLabel = [user?.class?.name, user?.class?.section].filter(Boolean).join("");

  const handleDownload = async () => {
    if (!activeRows.length) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const logo = await loadLogo();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 30;
    const contentWidth = pageWidth - margin * 2;
    const green = "#315a25";
    const red = "#d00000";
    const line = "#777777";
    const text = "#5f6368";
    const black = "#1f2933";

    const cell = (x, y, w, h, value, opts = {}) => {
      doc.setDrawColor(opts.border || line);
      doc.setLineWidth(opts.lineWidth || 0.8);
      if (opts.fill) {
        doc.setFillColor(opts.fill);
        doc.rect(x, y, w, h, "FD");
      } else {
        doc.rect(x, y, w, h);
      }
      doc.setTextColor(opts.color || black);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.size || 9);
      const safeText = fitText(doc, value, w - 10);
      const textX = opts.align === "center"
        ? x + w / 2
        : opts.align === "right"
          ? x + w - 5
          : x + 5;
      doc.text(safeText, textX, y + h / 2 + (opts.size || 9) / 3, { align: opts.align || "left" });
    };

    doc.setFillColor(red);
    doc.triangle(0, 0, 124, 0, 0, 34, "F");

    doc.setTextColor(green);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(22);
    doc.text("STUDENT REPORT CARD", pageWidth / 2, 72, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(SCHOOL_NAME, margin, 124);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(text);
    doc.text(`Address: ${SCHOOL_ADDRESS}`, margin, 144);
    doc.text(`Phone: ${SCHOOL_PHONE}`, margin, 162);
    doc.text(`Email: ${SCHOOL_EMAIL}`, margin, 180);

    doc.setDrawColor(line);
    doc.rect(pageWidth - margin - 74, 105, 74, 74);
    if (logo) doc.addImage(logo, "PNG", pageWidth - margin - 64, 113, 54, 54);

    const infoY = 210;
    cell(margin, infoY, contentWidth, 30, `Name of the Student: ${user?.name || "N/A"}`, { size: 12, color: text });
    cell(margin, infoY + 30, contentWidth / 4, 34, `Date of Birth: ${user?.dob || "N/A"}`, { size: 9, color: text });
    cell(margin + contentWidth / 4, infoY + 30, contentWidth / 4, 34, `Class: ${classLabel || "N/A"}`, { size: 9, color: text });
    cell(margin + (contentWidth / 4) * 2, infoY + 30, contentWidth / 4, 34, `SATS No.: ${user?.satCode || "N/A"}`, { size: 9, color: text });
    cell(margin + (contentWidth / 4) * 3, infoY + 30, contentWidth / 4, 34, `Academic Year: ${academicYearLabel || "N/A"}`, { size: 9, color: text });

    const sectionY = infoY + 64;
    cell(margin, sectionY, contentWidth, 30, "MARKS OF EACH SUBJECT", {
      size: 13,
      bold: true,
      align: "center",
      color: green,
      border: line
    });

    const tableY = sectionY + 30;
    const headerH = 34;
    const footerSpace = 110;
    const rowH = Math.min(24, Math.max(5.5, (pageHeight - tableY - footerSpace - headerH) / (activeRows.length + 1)));
    const cols = [
      { label: "SUBJECTS", width: 138, key: "subjectName", align: "left" },
      { label: "EXAM", width: 138, key: "examTitle", align: "left" },
      { label: "MAX", width: 58, key: "maxMarks", align: "center" },
      { label: "MARKS", width: 66, key: "marksObtained", align: "center" },
      { label: "GRADE", width: 55, key: "grade", align: "center" },
      { label: "AVERAGE", width: contentWidth - 455, key: "percentage", align: "center" }
    ];

    let x = margin;
    cols.forEach(col => {
      cell(x, tableY, col.width, headerH, col.label, { fill: green, color: "#ffffff", bold: true, align: col.align, size: 10, border: green });
      x += col.width;
    });

    activeRows.forEach((row, index) => {
      x = margin;
      cols.forEach(col => {
        const rawValue = col.key === "percentage" ? formatPercent(row.percentage) : row[col.key];
        cell(x, tableY + headerH + rowH * index, col.width, rowH, rawValue, {
          size: rowH < 8 ? 4.8 : rowH < 11 ? 6 : rowH < 17 ? 7 : 8.5,
          align: col.align,
          color: text
        });
        x += col.width;
      });
    });

    // Add overall row
    let y = tableY + headerH + rowH * activeRows.length;
    x = margin;
    const overallLabelWidth = cols[0].width + cols[1].width;
    cell(x, y, overallLabelWidth, rowH, "OVERALL", { fill: "#f4f7f6", bold: true, align: "right", border: line, color: black });
    x += overallLabelWidth;
    cell(x, y, cols[2].width, rowH, String(summary.totalMax), { fill: "#f4f7f6", bold: true, align: "center", border: line, color: black });
    x += cols[2].width;
    cell(x, y, cols[3].width, rowH, String(summary.totalScored), { fill: "#f4f7f6", bold: true, align: "center", border: line, color: black });
    x += cols[3].width;
    cell(x, y, cols[4].width, rowH, String(summary.grade), { fill: "#f4f7f6", bold: true, align: "center", border: line, color: black });
    x += cols[4].width;
    cell(x, y, cols[5].width, rowH, summary.percentage === null ? "N/A" : formatPercent(summary.percentage), { fill: "#f4f7f6", bold: true, align: "center", border: line, color: black });

    y += rowH + 24;

    doc.setFont("helvetica", "bold");
    doc.setTextColor("#111111");
    doc.setFontSize(11);
    doc.text("GRADE SCALE:", margin, y);
    
    y += 12;
    const grades = [
      { grade: "A+", range: "90% - 100%" },
      { grade: "A", range: "80% - 89%" },
      { grade: "B+", range: "70% - 79%" },
      { grade: "B", range: "60% - 69%" },
      { grade: "C", range: "50% - 59%" },
      { grade: "D", range: "35% - 49%" },
      { grade: "F", range: "Fail" }
    ];
    
    const gradeColW = contentWidth / grades.length;
    let gradeX = margin;
    
    // Top row (Grades)
    grades.forEach((g) => {
      cell(gradeX, y, gradeColW, 20, g.grade, { fill: "#f4f7f6", bold: true, align: "center", border: line, color: black });
      gradeX += gradeColW;
    });
    
    // Bottom row (Ranges)
    gradeX = margin;
    grades.forEach((g) => {
      cell(gradeX, y + 20, gradeColW, 20, g.range, { align: "center", border: line, color: text });
      gradeX += gradeColW;
    });

    const sigY = pageHeight - margin - 30;
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#111111");
    doc.setFontSize(10);
    doc.text("Class Teacher Sign", margin + 20, sigY);
    doc.text("Principal Sign with Stamp", pageWidth - margin - 150, sigY);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(text);
    doc.setFontSize(8);
    doc.text(SOFTWARE_CREDIT, pageWidth / 2, pageHeight - 14, { align: "center" });

    doc.save(`${cleanFileName(activeType)}-${cleanFileName(user?.name)}-marks-card.pdf`);
  };

  const openMarksCard = (type) => {
    navigate(`/student/marks/${encodeURIComponent(type)}`);
  };

  const goBackToCategories = () => {
    navigate("/student/marks");
  };

  const handleExamTypeChange = (nextType) => {
    if (!nextType) {
      navigate("/student/marks");
      return;
    }
    navigate(`/student/marks/${encodeURIComponent(nextType)}`);
  };

  if (loading) return <div style={s.loading}>Loading report card...</div>;

  return (
    <div style={s.page} className="student-marks-page">
      <SectionTitle title="Marks & Reports" subtitle="Review marks entered by your teachers." />

      <div style={s.selectorShell} className="student-marks-selector-shell">
        <div style={s.selectorHeader}>
          <div>
            <h2 style={s.selectorTitle}>Select Exam Type</h2>
            <p style={s.selectorSub}>Choose an exam type to view the report card.</p>
          </div>
          <span style={s.categoryCount}>{typeNames.length} categories</span>
        </div>

        <select
          value={selectedTypeValue}
          onChange={e => handleExamTypeChange(e.target.value)}
          style={s.examTypeSelect}
          className="student-marks-exam-type-select"
          aria-label="Select exam type"
        >
          <option value="">Choose an exam type</option>
          {typeNames.map(type => {
            const count = rowsByType[type]?.length || 0;
            const typeInfo = typeDetails[type];
            const publishedAt = typeInfo?.isPublished
              ? formatDate(typeInfo?.publishedAt || typeInfo?.updatedAt || typeInfo?.createdAt)
              : "Not launched";
            return (
              <option key={type} value={type}>
                {type} {count ? `(${count} marks)` : ""} - {publishedAt}
              </option>
            );
          })}
        </select>
      </div>

      {activeType && (
        <div style={s.printActions} className="student-print-actions">
          <button style={s.backBtn} onClick={goBackToCategories}>
            <i className="fa-solid fa-arrow-left"></i> Categories
          </button>
          <button style={s.printBtn} onClick={handleDownload} disabled={!activeRows.length}>
            <i className="fa-solid fa-download"></i> Download {activeType} Marks
          </button>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {!activeType ? (
        typeNames.length ? (
          <div style={s.promptCard}>
            <i className="fa-solid fa-arrow-up" style={s.promptIcon}></i>
            <div style={s.promptTitle}>Choose an exam type</div>
            <div style={s.promptText}>Your marks card will open here after you select an exam type.</div>
          </div>
        ) : (
          <div style={s.promptCard}>
            <i className="fa-solid fa-circle-info" style={s.promptIcon}></i>
            <div style={s.promptTitle}>No exam categories available</div>
            <div style={s.promptText}>Marks will appear here once a published exam category has student results.</div>
          </div>
        )
      ) : !isCategoryLaunched ? (
        <div style={s.promptCard}>
          <i className="fa-solid fa-lock" style={s.promptIcon}></i>
          <div style={s.promptTitle}>Marks not launched</div>
          <div style={s.promptText}>This exam category is not available to students yet.</div>
        </div>
      ) : (
        <div style={s.marksPanel} className="student-marks-panel">
          <div style={s.marksHeader} className="student-marks-header">
            <div>
              <h2 style={s.marksTitle}>{activeType || "Marks"}</h2>
              <p style={s.marksSub}>Marks launched: {activeTypeInfo?.isPublished ? formatDate(activeTypeInfo?.publishedAt || activeTypeInfo?.updatedAt || activeTypeInfo?.createdAt) : "Not launched"}</p>
            </div>
            <div style={s.marksBadge} className="student-marks-badge">{activeRows.length} subject rows</div>
          </div>

          {activeRows.length ? (
            <div className="student-table-wrap" style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Subject</th>
                    <th style={s.th}>Exam</th>
                    <th style={{...s.th, textAlign: 'center'}}>Max Marks</th>
                    <th style={{...s.th, textAlign: 'center'}}>Marks Scored</th>
                    <th style={{...s.th, textAlign: 'center'}}>Grade</th>
                    <th style={{...s.th, textAlign: 'center'}}>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map(row => (
                    <tr key={row.id} style={s.tr}>
                      <td style={s.td}><strong>{row.subjectName}</strong></td>
                      <td style={s.td}>{row.examTitle}</td>
                      <td style={{...s.td, textAlign: 'center'}}>{row.maxMarks}</td>
                      <td style={{...s.td, textAlign: 'center', fontWeight: '800'}}>{row.marksObtained}</td>
                      <td style={{...s.td, textAlign: 'center'}}>
                        <span style={row.grade === "F" ? s.gradeBadgeFail : s.gradeBadge}>{row.grade || "N/A"}</span>
                      </td>
                      <td style={{...s.td, textAlign: 'center'}}>{formatPercent(row.percentage)}</td>
                    </tr>
                  ))}
                  {/* Overall Row */}
                  <tr style={{...s.tr, background: "#f7faf5", fontWeight: "bold"}}>
                    <td colSpan={2} style={{...s.td, textAlign: 'right'}}><strong>OVERALL</strong></td>
                    <td style={{...s.td, textAlign: 'center'}}>{summary.totalMax}</td>
                    <td style={{...s.td, textAlign: 'center', fontWeight: '800'}}>{summary.totalScored}</td>
                    <td style={{...s.td, textAlign: 'center'}}>
                      <span style={summary.grade === "Needs Support" || summary.grade === "F" ? s.gradeBadgeFail : s.gradeBadge}>{summary.grade}</span>
                    </td>
                    <td style={{...s.td, textAlign: 'center'}}>{summary.percentage === null ? "N/A" : formatPercent(summary.percentage)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={s.empty}>
              {activeType ? `No marks have been published under ${activeType} yet.` : "No marks have been published for this student yet."}
            </div>
          )}

          <div style={s.summaryBar} className="student-report-summary">
            <div style={s.summaryItem}>
              <div style={s.summaryVal}>{summary.totalScored} <span style={{fontSize:'1rem', color:'#65706a'}}>/{summary.totalMax}</span></div>
              <div style={s.summaryLabel}>Total Marks</div>
            </div>
            <div style={s.summaryItem}>
              <div style={s.summaryVal}>{summary.percentage === null ? "N/A" : formatPercent(summary.percentage)}</div>
              <div style={s.summaryLabel}>Percentage</div>
            </div>
            <div style={s.summaryItem}>
              <div style={s.summaryVal}>{summary.grade}</div>
              <div style={s.summaryLabel}>Overall Grade</div>
            </div>
          </div>

          {/* Grade Scale Table in UI */}
          <div style={{ marginTop: "28px" }}>
            <h3 style={{ ...s.selectorTitle, marginBottom: "12px" }}>Grade Scale</h3>
            <div className="student-table-wrap" style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, textAlign: 'center' }}>Grade</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>A+</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>A</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>B+</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>B</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>C</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>D</th>
                    <th style={{ ...s.th, textAlign: 'center' }}>F</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={s.tr}>
                    <td style={{ ...s.td, fontWeight: "bold", textAlign: 'center' }}>Range</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>90% - 100%</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>80% - 89%</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>70% - 79%</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>60% - 69%</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>50% - 59%</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>35% - 49%</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>Fail</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: none !important; }
            ::-webkit-scrollbar { display: none; }
          }
        `}
      </style>
    </div>
  );
}

const s = {
  page: { width: "100%", maxWidth: "980px", margin: "0 auto" },
  loading: { textAlign: "center", padding: "40px", color: "var(--text-muted)" },
  error: { background: "var(--danger-bg)", color: "var(--danger-text)", padding: "14px 18px", borderRadius: "12px", fontWeight: "800", marginBottom: "16px" },
  empty: { padding: "40px", textAlign: "center", color: "var(--text-muted)", background: "var(--light-bg)", borderRadius: "12px", border: "1px dashed var(--border)", marginBottom: "36px" },
  emptyMini: { padding: "14px", color: "var(--text-muted)", fontWeight: "800" },
  selectorShell: { background: "var(--white)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px", boxShadow: "var(--shadow-sm)", marginBottom: "18px" },
  selectorHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "14px" },
  selectorTitle: { margin: 0, color: "var(--navy)", fontFamily: "var(--font-heading)", fontSize: "1.08rem", fontWeight: "900" },
  selectorSub: { margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.86rem", fontWeight: "700" },
  categoryCount: { borderRadius: "999px", background: "var(--gold-pale)", color: "var(--navy-dark)", padding: "6px 10px", fontSize: "0.75rem", fontWeight: "900", whiteSpace: "nowrap" },
  examTypeSelect: { width: "100%", minHeight: "46px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--light-bg)", color: "var(--navy-dark)", fontWeight: "800", padding: "10px 14px", fontSize: "0.95rem" },
  promptCard: { background: "var(--white)", border: "1px dashed var(--border)", borderRadius: "14px", padding: "38px 22px", textAlign: "center", color: "var(--text-muted)", boxShadow: "var(--shadow-sm)" },
  promptIcon: { width: "42px", height: "42px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--gold-pale)", color: "var(--navy)", marginBottom: "12px" },
  promptTitle: { color: "var(--navy)", fontWeight: "900", fontSize: "1.05rem", marginBottom: "4px" },
  promptText: { fontWeight: "700", fontSize: "0.9rem" },
  printActions: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" },
  backBtn: { background: "var(--white)", color: "var(--navy)", border: "1px solid var(--border)", padding: "10px 16px", borderRadius: "8px", fontWeight: "800", cursor: "pointer", boxShadow: "var(--shadow-sm)" },
  printBtn: { background: "var(--navy)", color: "var(--white)", padding: "10px 20px", borderRadius: "8px", fontWeight: "700", cursor: "pointer", transition: "var(--transition)", boxShadow: "var(--shadow-sm)" },
  marksPanel: { background: "var(--white)", borderRadius: "14px", padding: "20px", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)", color: "#555" },
  marksHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "16px", flexWrap: "wrap" },
  marksTitle: { fontFamily: "var(--font-heading)", fontSize: "1.6rem", margin: 0, color: "var(--navy)", fontWeight: "900" },
  marksSub: { margin: "6px 0 0", color: "var(--text-muted)", fontWeight: "700", fontSize: "0.88rem" },
  marksBadge: { borderRadius: "999px", background: "var(--gold-pale)", color: "var(--navy-dark)", padding: "8px 12px", fontSize: "0.78rem", fontWeight: "900", whiteSpace: "nowrap" },
  tableWrap: { overflowX: "auto", marginBottom: "20px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { background: "#315a25", color: "var(--white)", padding: "12px", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em", border: "1px solid #315a25" },
  tr: { borderBottom: "1px solid var(--border)" },
  td: { padding: "12px 16px", fontSize: "0.9rem", border: "1px solid var(--border)", color: "#4a5568" },
  gradeBadge: { padding: "4px 11px", borderRadius: "3px", fontWeight: "800", color: "#315a25", background: "#eef5e9", border: "1px solid rgba(49,90,37,0.28)" },
  gradeBadgeFail: { padding: "4px 11px", borderRadius: "3px", fontWeight: "800", color: "#d00000", background: "#fdecec", border: "1px solid rgba(208,0,0,0.28)" },
  summaryBar: { display: "flex", background: "#f7faf5", borderRadius: "4px", padding: "16px", color: "#315a25", justifyContent: "space-around", marginBottom: "16px", border: "1px solid #9aa294", gap: "16px", flexWrap: "wrap" },
  summaryItem: { textAlign: "center", minWidth: "120px" },
  summaryVal: { fontFamily: "var(--font-stats)", fontSize: "1.6rem", color: "#315a25", lineHeight: 1, marginBottom: "4px" },
  summaryLabel: { fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#65706a", fontWeight: "900" },
  gradeScale: { fontSize: "0.9rem", color: "#111", margin: "18px 0 20px", lineHeight: 1.7 },
  signatures: { display: "flex", justifyContent: "space-between", marginTop: "52px", padding: "0 34px", gap: "18px" },
  sigBox: { textAlign: "center", width: "230px", color: "#111", fontWeight: "700" },
  sigLine: { height: "1px", background: "#111", marginBottom: "8px" },
  softwareCredit: { textAlign: "center", marginTop: "22px", color: "#777", fontSize: "0.76rem", fontWeight: "700" }
};
