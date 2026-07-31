import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

const blankStudent = {
  studentId: "",
  name: "",
  satCode: "",
  penCode: "",
  className: "",
  passes: 0,
  fails: 0,
  absent: 0,
  totalMarks: 0,
  examsTaken: 0,
  average: 0,
  results: []
};

export default function MarksOverview() {
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ classId: "", examType: "", search: "", teacherId: "" });
  const [classes, setClasses] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [overview, setOverview] = useState({
    summary: {
      totalStudents: 0,
      totalExams: 0,
      totalMarks: 0,
      passedCount: 0,
      failedCount: 0,
      absentCount: 0,
      teacherCount: 0
    },
    teachers: [],
    marks: [],
    students: [],
    failedBreakdown: [],
    exams: []
  });
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const selectedClass = useMemo(
    () => classes.find(cls => cls._id === filters.classId) || null,
    [classes, filters.classId]
  );
  const selectedClassLabel = selectedClass
    ? [selectedClass.name, selectedClass.section].filter(Boolean).join(" ")
    : "All Classes";
  const selectedClassMarks = useMemo(
    () => (selectedClass ? overview.marks : []),
    [overview.marks, selectedClass]
  );
  const [selectedClassGroupKey, setSelectedClassGroupKey] = useState("");
  const selectedClassOverview = useMemo(() => {
    const grouped = new Map();
    const teacherSet = new Set();
    const subjectSet = new Set();
    let passCount = 0;
    let failCount = 0;
    let absentCount = 0;

    selectedClassMarks.forEach(mark => {
      if (mark.teacherName) teacherSet.add(mark.teacherName);
      if (mark.subjectName) subjectSet.add(mark.subjectName);
      if (mark.status === "Pass") passCount += 1;
      else if (mark.status === "Absent") absentCount += 1;
      else failCount += 1;

      const key = [
        mark.teacherId || mark.teacherName,
        mark.subjectName,
        mark.examId || mark.examTitle
      ].join("::");
      const current = grouped.get(key) || {
        id: key,
        teacherId: mark.teacherId || "",
        teacherName: mark.teacherName || "Teacher",
        subjectName: mark.subjectName || "Subject",
        examTitle: mark.examTitle || "Exam",
        examType: mark.examType || "Exam",
        date: mark.date || "",
        examId: mark.examId || "",
        maxMarks: Number(mark.maxMarks || 0),
        minMarks: Number(mark.passMark || 0),
        passCount: 0,
        failCount: 0,
        absentCount: 0,
        marksCount: 0
      };

      current.marksCount += 1;
      current.maxMarks = Math.max(current.maxMarks, Number(mark.maxMarks || 0));
      current.minMarks = Math.max(current.minMarks, Number(mark.passMark || 0));
      if (mark.date && !current.date) current.date = mark.date;
      if (mark.status === "Pass") current.passCount += 1;
      else if (mark.status === "Absent") current.absentCount += 1;
      else current.failCount += 1;
      grouped.set(key, current);
    });

    return {
      rows: [...grouped.values()].sort((a, b) => {
        if (a.teacherName !== b.teacherName) return a.teacherName.localeCompare(b.teacherName);
        if (a.subjectName !== b.subjectName) return a.subjectName.localeCompare(b.subjectName);
        if (a.date !== b.date) return String(b.date || "").localeCompare(String(a.date || ""));
        return a.examTitle.localeCompare(b.examTitle);
      }),
      teacherCount: teacherSet.size,
      subjectCount: subjectSet.size,
      passCount,
      failCount,
      absentCount,
      totalMarks: selectedClassMarks.length
    };
  }, [selectedClassMarks]);

  useEffect(() => {
    if (!selectedClass) {
      setSelectedClassGroupKey("");
      return;
    }

    setSelectedClassGroupKey(prev => {
      if (selectedClassOverview.rows.some(row => row.id === prev)) return prev;
      return selectedClassOverview.rows[0]?.id || "";
    });
  }, [selectedClass, selectedClassOverview.rows]);

  const selectedClassGroup = useMemo(
    () => selectedClassOverview.rows.find(row => row.id === selectedClassGroupKey) || selectedClassOverview.rows[0] || null,
    [selectedClassOverview.rows, selectedClassGroupKey]
  );

  const selectedClassGroupMarks = useMemo(() => {
    if (!selectedClass || !selectedClassGroup) return [];
    return selectedClassMarks.filter(mark => {
      const teacherMatch = (mark.teacherId || "") === (selectedClassGroup.teacherId || "");
      const subjectMatch = mark.subjectName === selectedClassGroup.subjectName;
      const examMatch = (mark.examId || mark.examTitle) === (selectedClassGroup.examId || selectedClassGroup.examTitle);
      return teacherMatch && subjectMatch && examMatch;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedClass, selectedClassGroup, selectedClassMarks]);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [classesRes, examTypesRes] = await Promise.all([
          api.get("/classes"),
          api.get("/exam-types")
        ]);
        setClasses(classesRes.data || []);
        setExamTypes(examTypesRes.data || []);
      } catch (error) {
        console.error("Unable to load marks filters", error);
      }
    };
    fetchFilters();
  }, []);

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      try {
        const params = {
          ...(filters.classId ? { classId: filters.classId } : {}),
          ...(filters.examType ? { examType: filters.examType } : {}),
          ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
          ...(filters.teacherId ? { teacherId: filters.teacherId } : {})
        };
        const { data } = await api.get("/marks/admin/overview", { params });
        setOverview(data);
        setSelectedStudentId(prev => {
          if (data?.students?.some(student => student.studentId === prev)) return prev;
          return data?.students?.[0]?.studentId || "";
        });
      } catch (error) {
        console.error("Unable to load marks overview", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, [filters.classId, filters.examType, filters.search, filters.teacherId]);

  const selectedStudent = useMemo(
    () => overview.students.find(student => student.studentId === selectedStudentId) || overview.students[0] || blankStudent,
    [overview.students, selectedStudentId]
  );

  const summaryCards = [
    { title: "Students", value: overview.summary.totalStudents, icon: "fa-solid fa-user-graduate", color: "#0e6b6b" },
    { title: "Exams", value: overview.summary.totalExams, icon: "fa-solid fa-file-invoice", color: "#c8960c" },
    { title: "Failed", value: overview.summary.failedCount, icon: "fa-solid fa-triangle-exclamation", color: "#b91c1c" },
    { title: "Teachers Uploaded", value: overview.summary.teacherCount, icon: "fa-solid fa-chalkboard-user", color: "#0369a1" }
  ];

  const selectedStudentPassRate = selectedStudent.examsTaken
    ? Math.round((selectedStudent.passes / selectedStudent.examsTaken) * 100)
    : 0;

  if (loading) {
    return <div style={s.loading}>Loading Marks Overview...</div>;
  }

  return (
    <div style={s.page} className="marks-overview-page">
      <div style={s.hero} className="marks-overview-hero">
        <div>
          <p style={{ ...s.eyebrow, color: "var(--white)" }}>Evaluation</p>
          <h1 style={{ ...s.title, color: "var(--white)" }}>Marks Overview</h1>
          <p style={{ ...s.sub, color: "rgba(255,255,255,0.82)" }}>
            View teacher uploads, student-wise marks, failed subjects, and exam performance across classes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilters({ classId: "", examType: "", search: "", teacherId: "" })}
          style={s.resetBtn}
        >
          <i className="fa-solid fa-rotate-right" style={{ marginRight: 8 }} />
          Reset Filters
        </button>
      </div>

      <div style={s.filterBar} className="marks-overview-filters">
        <label style={s.field}>
          <span style={s.label}>Exam Type</span>
          <select
            value={filters.examType}
            onChange={e => setFilters(prev => ({ ...prev, examType: e.target.value }))}
            style={s.input}
          >
            <option value="">All Exam Types</option>
            {examTypes.map(type => (
              <option key={type._id} value={type.name}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ ...s.field, flex: 1 }}>
          <span style={s.label}>Search student</span>
          <div style={s.searchWrap}>
            <i className="fa-solid fa-magnifying-glass" style={s.searchIcon} />
            <input
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search by name, SAT code, or PEN code"
              style={s.searchInput}
            />
          </div>
        </label>
      </div>

      <section style={s.classShelf} className="marks-overview-class-shelf">
        <div style={s.classShelfHeader}>
          <div>
            <h2 style={s.classShelfTitle}>Classes</h2>
            <p style={s.classShelfNote}>All classes are visible here. Click one to open its marks overview on the left.</p>
          </div>
          <span style={s.panelBadge}>{classes.length} classes</span>
        </div>

        <div style={s.classGrid} className="marks-overview-class-grid">
          <button
            type="button"
            onClick={() => setFilters(prev => ({ ...prev, classId: "", teacherId: "" }))}
            style={{ ...s.classCard, ...(filters.classId === "" ? s.classCardActive : {}) }}
          >
            <div style={s.classCardTitle}>All Classes</div>
            <div style={s.classCardMeta}>View every uploaded mark</div>
          </button>
          {classes.map(cls => {
            const className = [cls.name, cls.section].filter(Boolean).join(" ");
            const isActive = filters.classId === cls._id;
            return (
              <button
                key={cls._id}
                type="button"
                onClick={() => setFilters(prev => ({ ...prev, classId: cls._id, teacherId: "" }))}
                style={{ ...s.classCard, ...(isActive ? s.classCardActive : {}) }}
              >
                <div style={s.classCardTitle}>{className}</div>
                <div style={s.classCardMeta}>Tap to open the class overview</div>
              </button>
            );
          })}
        </div>
      </section>

      <div style={s.statsGrid} className="marks-overview-stats">
        {summaryCards.map(card => (
          <div key={card.title} style={s.statCard}>
            <div style={{ ...s.statIcon, color: card.color, background: `${card.color}14` }}>
              <i className={card.icon} />
            </div>
            <div>
              <div style={s.statValue}>{card.value}</div>
              <div style={s.statLabel}>{card.title}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={s.panelGrid} className="marks-overview-panels">
        <section style={s.panel} className="marks-overview-panel">
          <div style={s.panelHeader}>
            <h2 style={s.panelTitle}>{selectedClass ? `${selectedClassLabel} Overview` : "Class Marks Overview"}</h2>
            <span style={s.panelBadge}>{selectedClass ? `${selectedClassOverview.rows.length} groups` : "Select a class"}</span>
          </div>
          {selectedClass ? (
            <>
              <div style={s.classOverviewStats} className="marks-overview-class-overview-stats">
                <div style={s.classOverviewStat}>
                  <div style={s.classOverviewValue}>{selectedClassOverview.totalMarks}</div>
                  <div style={s.classOverviewLabel}>Marks</div>
                </div>
                <div style={s.classOverviewStat}>
                  <div style={s.classOverviewValue}>{selectedClassOverview.teacherCount}</div>
                  <div style={s.classOverviewLabel}>Teachers</div>
                </div>
                <div style={s.classOverviewStat}>
                  <div style={s.classOverviewValue}>{selectedClassOverview.subjectCount}</div>
                  <div style={s.classOverviewLabel}>Subjects</div>
                </div>
                <div style={s.classOverviewStat}>
                  <div style={s.classOverviewValue}>{selectedClassOverview.passCount}</div>
                  <div style={s.classOverviewLabel}>Pass</div>
                </div>
                <div style={s.classOverviewStat}>
                  <div style={s.classOverviewValue}>{selectedClassOverview.failCount}</div>
                  <div style={s.classOverviewLabel}>Fail</div>
                </div>
              </div>

              <div style={s.tableWrap} className="marks-overview-table-wrap">
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.classTableHead}>Teacher</th>
                      <th style={s.classTableHead}>Subject</th>
                      <th style={s.classTableHead}>Date</th>
                      <th style={s.classTableHead}>Max Mark</th>
                      <th style={s.classTableHead}>Min Mark</th>
                      <th style={s.classTableHead}>Pass</th>
                      <th style={s.classTableHead}>Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedClassOverview.rows.length ? selectedClassOverview.rows.map(row => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedClassGroupKey(row.id)}
                        style={{ ...s.classTableRow, ...(selectedClassGroup?.id === row.id ? s.classTableRowActive : {}) }}
                      >
                        <td style={s.classTableCell}>{row.teacherName}</td>
                        <td style={s.classTableCell}>
                          <div style={s.cellTitle}>{row.subjectName}</div>
                          <div style={s.cellSub}>{row.examTitle}</div>
                        </td>
                        <td style={s.classTableCell}>{row.date || "-"}</td>
                        <td style={s.classTableCell}>{row.maxMarks}</td>
                        <td style={s.classTableCell}>{row.minMarks}</td>
                        <td><span style={s.goodPill}>{row.passCount}</span></td>
                        <td style={s.classTableCell}>
                          <span style={row.failCount > 0 ? s.failPill : s.absentPill}>
                            {row.failCount}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} style={s.emptyCell}>No marks found for this class.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={s.emptyPanel}>Select a class above to see the teacher and subject breakdown for that class.</div>
          )}
        </section>

        <section style={s.panel} className="marks-overview-panel">
          <div style={s.panelHeader}>
            <h2 style={s.panelTitle}>
              {selectedClassGroup ? `${selectedClassGroup.subjectName} Marks` : "Class Marks"}
            </h2>
            <div style={s.panelBadgeRow}>
              {selectedClassGroup ? (
                <span style={s.panelBadge}>{selectedClassGroup.examTitle}</span>
              ) : (
                <span style={s.panelBadge}>{selectedClassOverview.totalMarks} records</span>
              )}
            </div>
          </div>
          <div style={s.panelNote}>
            {selectedClassGroup
              ? `${selectedClassGroup.teacherName} uploaded this subject on ${selectedClassGroup.date || "N/A"}. Max mark ${selectedClassGroup.maxMarks}, min mark ${selectedClassGroup.minMarks}.`
              : "Choose a class above, then click a subject row on the left to see its student marks."}
          </div>

          <div style={s.tableWrap} className="marks-overview-table-wrap">
            <table style={{ ...s.table, minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Marks</th>
                </tr>
              </thead>
              <tbody>
                {selectedClassGroupMarks.length ? selectedClassGroupMarks.map((row, idx) => (
                  <tr key={`${row.studentId}-${row.examId || row.examTitle}-${idx}`}>
                    <td>
                      <div style={s.cellTitle}>{row.name}</div>
                      <div style={s.cellSub}>{row.satCode || "SAT code not set"}</div>
                    </td>
                    <td>
                      <span style={row.status === "Pass" ? s.goodPill : row.status === "Absent" ? s.absentPill : s.failPill}>
                        {row.marksObtained === "AB" ? "Absent" : `${row.marksObtained}/${row.maxMarks}`}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={2} style={s.emptyCell}>
                      {selectedClassGroup
                        ? "No student marks found for the selected subject."
                        : "Select a class and subject to view student marks."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div style={s.bottomGrid} className="marks-overview-bottom-grid">
        <section style={s.panel} className="marks-overview-panel">
          <div style={s.panelHeader}>
            <h2 style={s.panelTitle}>Students</h2>
            <span style={s.panelBadge}>{overview.students.length} students</span>
          </div>

          <div style={s.studentList} className="marks-overview-student-list">
            {overview.students.length ? overview.students.map(student => {
              const isSelected = student.studentId === selectedStudent.studentId;
              return (
                <button
                  key={student.studentId}
                  type="button"
                  onClick={() => setSelectedStudentId(student.studentId)}
                  style={{ ...s.studentCard, ...(isSelected ? s.studentCardActive : {}) }}
                >
                  <div style={s.studentCardTop}>
                    <div>
                      <div style={s.studentName}>{student.name}</div>
                      <div style={s.studentMeta}>{student.satCode} {student.className ? `• ${student.className}` : ""}</div>
                    </div>
                    <span style={student.fails > 0 || student.absent > 0 ? s.warnPill : s.goodPill}>
                      {student.fails > 0 || student.absent > 0 ? "Needs Review" : "Stable"}
                    </span>
                  </div>
                  <div style={s.studentMetrics}>
                    <span>Pass {student.passes}</span>
                    <span>Fail {student.fails}</span>
                    <span>Absent {student.absent}</span>
                    <span>Avg {student.average}</span>
                  </div>
                </button>
              );
            }) : <div style={s.empty}>No students match the selected filters.</div>}
          </div>
        </section>

        <section style={s.panel} className="marks-overview-panel">
          <div style={s.panelHeader}>
            <h2 style={s.panelTitle}>Individual Student Marks</h2>
            <span style={s.panelBadge}>{selectedStudent.name || "Select a student"}</span>
          </div>

          {selectedStudent.studentId ? (
            <>
              <div style={s.studentDetailHeader} className="marks-overview-student-header">
                <div>
                  <div style={s.detailName}>{selectedStudent.name}</div>
                  <div style={s.detailMeta}>
                    {selectedStudent.satCode || "SAT code not set"}
                    {selectedStudent.className ? ` • ${selectedStudent.className}` : ""}
                  </div>
                  {selectedClass && (
                    <div style={s.detailTeacherNote}>
                      Filtered by {selectedClassLabel}
                    </div>
                  )}
                </div>
                <div style={s.detailStat}>
                  <div style={s.detailStatValue}>{selectedStudent.average}</div>
                  <div style={s.detailStatLabel}>Average</div>
                </div>
                <div style={s.detailStat}>
                  <div style={s.detailStatValue}>{selectedStudentPassRate}%</div>
                  <div style={s.detailStatLabel}>Pass Rate</div>
                </div>
              </div>

              <div style={s.resultTableWrap} className="marks-overview-result-wrap">
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Subject</th>
                      <th>Type</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Teacher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStudent.results.length ? selectedStudent.results.map((result, idx) => (
                      <tr key={`${result.examId || idx}-${idx}`}>
                        <td>{result.examTitle}</td>
                        <td>{result.subjectName}</td>
                        <td>{result.examType}</td>
                        <td>{result.marksObtained === "AB" ? "Absent" : `${result.marksObtained}/${result.maxMarks}`}</td>
                        <td>
                          <span style={result.status === "Pass" ? s.goodPill : result.status === "Absent" ? s.absentPill : s.failPill}>
                            {result.status}
                          </span>
                        </td>
                        <td>{result.teacherName}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} style={s.emptyCell}>No marks available for this student.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={s.emptyPanel}>Choose a student on the left to see the complete marks record.</div>
          )}
        </section>
      </div>
    </div>
  );
}

const s = {
  page: { display: "flex", flexDirection: "column", gap: "20px" },
  loading: { padding: "60px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: "1rem" },
  hero: {
    background: "linear-gradient(135deg, rgba(9,79,79,0.95), rgba(14,107,107,0.95))",
    color: "var(--white)",
    borderRadius: "20px",
    padding: "28px 30px",
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    alignItems: "flex-start",
    boxShadow: "var(--shadow-md)"
  },
  eyebrow: { margin: 0, textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.72rem", color: "var(--gold-pale)" },
  title: { margin: "8px 0 10px", fontFamily: "var(--font-heading)", fontSize: "2rem" },
  sub: { margin: 0, maxWidth: "760px", color: "rgba(255,255,255,0.78)", lineHeight: 1.6 },
  resetBtn: {
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "var(--white)",
    borderRadius: "999px",
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 700,
    whiteSpace: "nowrap"
  },
  filterBar: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    gap: "16px",
    alignItems: "end"
  },
  field: { display: "flex", flexDirection: "column", gap: "8px" },
  label: { fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 700 },
  input: {
    height: "46px",
    borderRadius: "12px",
    border: "1px solid #dbe4ea",
    background: "var(--white)",
    padding: "0 14px",
    fontSize: "0.92rem",
    color: "var(--navy)"
  },
  searchWrap: {
    height: "46px",
    borderRadius: "12px",
    border: "1px solid #dbe4ea",
    background: "var(--white)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0 14px"
  },
  searchIcon: { color: "var(--text-muted)" },
  searchInput: {
    border: "none",
    outline: "none",
    width: "100%",
    fontSize: "0.92rem",
    color: "var(--navy)",
    background: "transparent"
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "16px"
  },
  classShelf: {
    background: "rgba(255,255,255,0.72)",
    border: "1px solid #e7eef2",
    borderRadius: "18px",
    boxShadow: "var(--shadow-sm)",
    padding: "18px"
  },
  classShelfHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "14px"
  },
  classShelfTitle: {
    margin: 0,
    fontSize: "1.05rem",
    color: "var(--navy)",
    fontFamily: "var(--font-heading)"
  },
  classShelfNote: {
    margin: "6px 0 0",
    color: "var(--text-muted)",
    fontSize: "0.84rem"
  },
  classGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px"
  },
  classCard: {
    minWidth: "180px",
    flex: "1 1 180px",
    textAlign: "left",
    border: "1px solid #e7eef2",
    background: "#f9fbfb",
    borderRadius: "14px",
    padding: "14px 16px",
    cursor: "pointer"
  },
  classCardActive: {
    borderColor: "var(--gold)",
    background: "#fffdf5",
    boxShadow: "0 8px 20px rgba(200,150,12,0.12)"
  },
  classCardTitle: { fontWeight: 800, color: "var(--navy)" },
  classCardMeta: { marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" },
  statCard: {
    background: "var(--white)",
    borderRadius: "18px",
    border: "1px solid #e7eef2",
    boxShadow: "var(--shadow-sm)",
    padding: "18px",
    display: "flex",
    alignItems: "center",
    gap: "14px"
  },
  statIcon: {
    width: "50px",
    height: "50px",
    borderRadius: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.1rem",
    flexShrink: 0
  },
  statValue: { fontSize: "1.7rem", fontWeight: 800, color: "var(--navy)", lineHeight: 1 },
  statLabel: { fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "4px", fontWeight: 700 },
  panelGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "16px"
  },
  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
    gap: "16px"
  },
  panel: {
    background: "var(--white)",
    borderRadius: "18px",
    border: "1px solid #e7eef2",
    boxShadow: "var(--shadow-sm)",
    padding: "18px",
    minWidth: 0
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px"
  },
  panelBadgeRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" },
  panelTitle: { margin: 0, fontSize: "1.05rem", color: "var(--navy)", fontFamily: "var(--font-heading)" },
  panelBadge: {
    fontSize: "0.72rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--navy-dark)",
    background: "var(--gold-pale)",
    padding: "7px 10px",
    borderRadius: "999px"
  },
  panelNote: {
    margin: "-6px 0 14px",
    fontSize: "0.84rem",
    color: "var(--text-muted)",
    lineHeight: 1.5
  },
  clearFilterBtn: {
    border: "1px solid var(--border)",
    background: "var(--white)",
    color: "var(--navy)",
    fontSize: "0.72rem",
    fontWeight: 800,
    padding: "7px 10px",
    borderRadius: "999px"
  },
  tableWrap: { overflow: "auto" },
  resultTableWrap: { overflow: "auto", marginTop: "8px" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "860px",
    color: "var(--text)"
  },
  emptyCell: {
    textAlign: "center",
    padding: "18px",
    color: "var(--text-muted)"
  },
  tableHead: {},
  cellTitle: { fontWeight: 800, color: "var(--navy)" },
  cellSub: { fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "3px" },
  classTableHead: {
    color: "var(--teal-dark)",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: "0.72rem"
  },
  classTableRow: {
    cursor: "pointer",
    transition: "background 0.2s ease"
  },
  classTableRowActive: {
    background: "#fff8e7"
  },
  classTableCell: {
    color: "var(--navy-dark)",
    fontWeight: 700
  },
  failPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: "0.78rem",
    fontWeight: 800
  },
  absentPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#f3f4f6",
    color: "#4b5563",
    fontSize: "0.78rem",
    fontWeight: 800
  },
  goodPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "0.78rem",
    fontWeight: 800
  },
  warnPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#fef3c7",
    color: "#92400e",
    fontSize: "0.78rem",
    fontWeight: 800
  },
  studentList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "420px",
    overflow: "auto"
  },
  studentCard: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e7eef2",
    background: "#f9fbfb",
    borderRadius: "16px",
    padding: "14px 16px",
    cursor: "pointer",
    transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease"
  },
  studentCardActive: {
    borderColor: "var(--gold)",
    boxShadow: "0 8px 20px rgba(200,150,12,0.12)",
    background: "#fffdf5"
  },
  studentCardTop: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" },
  studentName: { fontSize: "0.98rem", fontWeight: 800, color: "var(--navy)" },
  studentMeta: { marginTop: "4px", fontSize: "0.8rem", color: "var(--text-muted)" },
  studentMetrics: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "12px",
    fontSize: "0.8rem",
    color: "var(--navy-dark)",
    fontWeight: 700
  },
  studentDetailHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 120px 120px",
    gap: "12px",
    alignItems: "stretch",
    padding: "16px",
    background: "#f8fbfb",
    borderRadius: "16px",
    border: "1px solid #edf3f5"
  },
  detailName: { fontSize: "1.05rem", fontWeight: 800, color: "var(--navy)" },
  detailMeta: { marginTop: "6px", color: "var(--text-muted)", fontSize: "0.86rem" },
  detailTeacherNote: { marginTop: "8px", fontSize: "0.78rem", fontWeight: 800, color: "var(--gold)" },
  detailStat: {
    background: "var(--white)",
    borderRadius: "14px",
    border: "1px solid #e7eef2",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center"
  },
  detailStatValue: { fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)" },
  detailStatLabel: { marginTop: "4px", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 700 },
  empty: {
    padding: "20px",
    textAlign: "center",
    color: "var(--text-muted)",
    border: "1px dashed #d5dee6",
    borderRadius: "14px",
    background: "#fbfcfd"
  },
  emptyPanel: {
    minHeight: "320px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: "var(--text-muted)",
    border: "1px dashed #d5dee6",
    borderRadius: "14px",
    background: "#fbfcfd",
    padding: "24px"
  },
  classOverviewStats: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px"
  },
  classOverviewStat: {
    background: "#f8fbfb",
    border: "1px solid #edf3f5",
    borderRadius: "14px",
    padding: "12px",
    textAlign: "center"
  },
  classOverviewValue: { fontSize: "1.2rem", fontWeight: 800, color: "var(--navy)", lineHeight: 1.1 },
  classOverviewLabel: {
    marginTop: "4px",
    fontSize: "0.74rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    fontWeight: 700
  }
};
