import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import SectionTitle from "../../components/SectionTitle";
import { getTeacherAssignedClassIds, isClassTeacher, formatClassLabel } from "../../utils/teacherClasses";
const getLocalDate = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().split("T")[0];
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [stats, setStats] = useState({
    myStudents: 0, attendanceMarked: false, pendingMarks: 0, announcements: 0, assignedSubjects: 0,
    classes: [], quickAttendance: [], selectedClassId: ""
  });

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [classesRes, subjectsRes, examsRes, announcementsRes] = await Promise.all([
          api.get("/classes", { params: { includeStats: true } }),
          api.get("/subjects"),
          api.get("/exams"),
          api.get("/announcements")
        ]);

        const userId = String(user?.id || user?._id || "");
        const directClassIds = new Set(getTeacherAssignedClassIds(user).map(String));
        const teacherSubjectIds = new Set(
          (Array.isArray(user?.assignedSubjects) ? user.assignedSubjects : [])
            .map(subject => subject?._id || subject?.id || subject)
            .filter(Boolean)
            .map(String)
        );
        const teacherSubjects = (subjectsRes.data || []).filter(subject => {
          const subjectTeacherId = String(subject.teacher?._id || subject.teacher || "");
          return subjectTeacherId === userId || teacherSubjectIds.has(String(subject._id));
        });

        teacherSubjects.forEach(subject => {
          const classId = String(subject.class?._id || subject.class || "");
          if (classId) directClassIds.add(classId);
        });

        const classList = (classesRes.data || []).filter(cls => directClassIds.has(String(cls._id)));
        const classTeacherClasses = classList.filter(cls => isClassTeacher(user, cls));
        const firstAttendanceClassId = classTeacherClasses[0]?._id || "";
        const attendanceRes = firstAttendanceClassId
          ? await api.get(`/attendance?classId=${firstAttendanceClassId}&date=${getLocalDate()}`)
          : { data: { students: [], alreadyMarked: false } };

        const exams = examsRes.data || [];
        const subjectsByClassId = teacherSubjects.reduce((map, subject) => {
          const classId = String(subject.class?._id || subject.class || "");
          if (!classId) return map;
          const next = map.get(classId) || [];
          next.push(subject);
          map.set(classId, next);
          return map;
        }, new Map());

        const classCards = classList.map((cls) => {
          const classExams = exams.filter(exam =>
            String(exam.class?._id || exam.class || "") === String(cls._id)
          );
          const assignedSubjects = subjectsByClassId.get(String(cls._id)) || [];
          const classTeacher = isClassTeacher(user, cls);
          return {
            id: cls._id,
            name: formatClassLabel(cls),
            students: cls.studentCount || 0,
            examCount: cls.examCount ?? classExams.length,
            firstExamId: classExams[0]?._id || "",
            canTakeAttendance: classTeacher,
            classTeacher,
            assignedSubjects: assignedSubjects.map(subject => subject.name).filter(Boolean)
          };
        });

        const quickAttendance = (attendanceRes.data.students || []).map(student => ({
          id: student._id,
          name: student.name,
          code: student.satCode,
          status: student.absent ? "absent" : "present"
        }));

        setStats({
          myStudents: classList.reduce((sum, cls) => sum + (cls.studentCount || 0), 0),
          attendanceMarked: Boolean(attendanceRes.data.alreadyMarked),
          pendingMarks: exams.length,
          announcements: announcementsRes.data?.length || 0,
          assignedSubjects: teacherSubjects.length,
          classes: classCards,
          quickAttendance,
          selectedClassId: firstAttendanceClassId
        });
      } catch (e) {
        console.error("Failed to load teacher dashboard", e);
      } finally {
        setLoading(false);
      }
    };

    if (user) loadDashboard();
    else {
      setStats(prev => ({ ...prev, classes: [], quickAttendance: [], selectedClassId: "" }));
      setLoading(false);
    }
  }, [user]);

  const toggleStatus = (id) => {
    setStats(prev => ({
      ...prev,
      quickAttendance: prev.quickAttendance.map(s => 
        s.id === id ? { ...s, status: s.status === "present" ? "absent" : "present" } : s
      )
    }));
  };

  const absentCount = stats.quickAttendance.filter(s => s.status === 'absent').length;
  const presentCount = stats.quickAttendance.filter(s => s.status === 'present').length;
  const selectedClass = stats.classes.find(cls => cls.id === stats.selectedClassId);
  const attendanceClasses = stats.classes.filter(cls => cls.canTakeAttendance);

  const goToStudents = classId => navigate(`/teacher/students${classId ? `?classId=${classId}` : ""}`);
  const goToAttendance = classId => navigate(`/teacher/attendance${classId ? `?classId=${classId}` : ""}`);
  const goToMarks = examId => navigate(`/teacher/marks${examId ? `?examId=${examId}` : ""}`);
  const goToExams = classId => navigate(`/teacher/exams${classId ? `?classId=${classId}` : ""}`);
  const goToClass = classId => navigate(`/teacher/classes/${classId}`);

  const handleQuickClassChange = async (classId) => {
    setAttendanceMessage("");
    setAttendanceLoading(true);
    setStats(prev => ({ ...prev, selectedClassId: classId, quickAttendance: [] }));
    if (!classId) {
      setAttendanceLoading(false);
      return;
    }

    try {
      const { data } = await api.get(`/attendance?classId=${classId}&date=${getLocalDate()}`);
      setStats(prev => ({
        ...prev,
        attendanceMarked: Boolean(data.alreadyMarked),
        quickAttendance: (data.students || []).map(student => ({
          id: student._id,
          name: student.name,
          code: student.satCode,
          status: student.absent ? "absent" : "present"
        }))
      }));
    } catch (e) {
      console.error("Failed to load quick attendance", e);
      setAttendanceMessage(e.response?.data?.message || "Could not load attendance for this class.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const saveQuickAttendance = async () => {
    if (!stats.selectedClassId) return;

    setAttendanceSaving(true);
    setAttendanceMessage("");
    try {
      await api.post("/attendance", {
        classId: stats.selectedClassId,
        date: getLocalDate(),
        absentIds: stats.quickAttendance.filter(student => student.status === "absent").map(student => student.id)
      });
      setStats(prev => ({ ...prev, attendanceMarked: true }));
      setAttendanceMessage("Attendance saved for today.");
    } catch (e) {
      console.error("Failed to save quick attendance", e);
      setAttendanceMessage(e.response?.data?.message || "Could not save attendance.");
    } finally {
      setAttendanceSaving(false);
    }
  };

  return (
    <div style={s.page} className="portal-dashboard-page">
      {/* Welcome Hero Banner */}
        <div style={s.heroBanner} className="portal-hero-banner">
        <div className="portal-hero-orb-1" />
        <div className="portal-hero-orb-2" />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={s.heroTitle}>Welcome back, Teacher {user?.name?.split(' ')[0] || ""} 👋</h1>
          <p style={s.heroSub}>Manage your classes and student progress.</p>
        </div>
      </div>

      {loading && <div style={s.loading}>Loading your teacher dashboard...</div>}

      {/* 4 Stat Cards */}
      <div style={s.grid4} className="portal-dashboard-grid">
        <div className="portal-stat-in" style={{ animationDelay: "0s" }}>
          <StatCard title="My Students" value={stats.myStudents} icon={<i className="fa-solid fa-users"></i>} color="navy" />
        </div>
        <div className="portal-stat-in" style={{ animationDelay: "0.07s" }}>
          <StatCard title="Assigned Subjects" value={stats.assignedSubjects} icon={<i className="fa-solid fa-book-open"></i>} color="gold" />
        </div>
        <div className="portal-stat-in" style={{ animationDelay: "0.14s" }}>
          <StatCard
            title="Today's Attendance"
            value={!attendanceClasses.length ? "Restricted" : stats.attendanceMarked ? "Marked" : "Pending"}
            icon={<i className="fa-solid fa-clipboard-user"></i>}
            color={!attendanceClasses.length ? "navy" : stats.attendanceMarked ? "teal" : "gold"}
            trend={!attendanceClasses.length ? "Class Teacher Only" : stats.attendanceMarked ? "Done" : "Action Required"}
            trendLabel=""
          />
        </div>
        <div className="portal-stat-in" style={{ animationDelay: "0.21s" }}>
          <StatCard title="Active Exams" value={stats.pendingMarks} icon={<i className="fa-solid fa-pen-to-square"></i>} color="red" />
        </div>
        <div className="portal-stat-in" style={{ animationDelay: "0.28s" }}>
          <StatCard title="Announcements" value={stats.announcements} icon={<i className="fa-solid fa-bullhorn"></i>} color="navy" />
        </div>
      </div>

      <div style={s.grid2} className="portal-dashboard-split">
        {/* My Classes Panel */}
        <div style={s.card}>
          <SectionTitle title="My Classes" />
          <div style={s.classList} className="teacher-class-list">
            {stats.classes.length === 0 && (
              <div style={s.empty}>No classes are assigned yet. Ask the admin to assign classes to your teacher profile.</div>
            )}
            {stats.classes.map(cls => (
              <div
                key={cls.id}
                role="button"
                tabIndex={0}
                style={{ ...s.classCard, ...(cls.classTeacher ? s.classTeacherCard : s.subjectTeacherCard) }}
                className="teacher-class-card"
                onClick={() => goToClass(cls.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goToClass(cls.id); }}
              >
                <div style={{ ...s.classGradientTop, ...(cls.classTeacher ? s.classTeacherGradientTop : {}) }}></div>
                <div style={s.classCardHeader}>
                  <div>
                    <h3 style={{ ...s.className, ...(cls.classTeacher ? s.classNameLight : {}) }}>{cls.name}</h3>
                    <p style={{ ...s.classSub, ...(cls.classTeacher ? s.classSubLight : {}) }}>{cls.students} Students</p>
                  </div>
                  <span style={{ ...s.rolePill, ...(cls.classTeacher ? s.rolePillDark : s.rolePillLight) }}>
                    {cls.classTeacher ? "Class Teacher" : "Subject Teacher"}
                  </span>
                </div>
                
                <div style={s.progressWrap}>
                  <div style={s.progressLabels}>
                    <span style={cls.classTeacher ? s.lightText : undefined}>Scheduled Exams</span>
                    <span style={cls.classTeacher ? s.lightText : undefined}>{cls.examCount}</span>
                  </div>
                  <div style={s.progressBar}>
                    <div style={{...s.progressFill, width: `${Math.min(cls.examCount * 20, 100)}%`, background: cls.examCount ? 'var(--gold)' : 'var(--border)'}}></div>
                  </div>
                </div>

                {cls.assignedSubjects.length > 0 && (
                  <div style={s.subjectWrap}>
                    <div style={{ ...s.subjectLabel, ...(cls.classTeacher ? s.lightText : {}) }}>Assigned subjects</div>
                    <div style={s.subjectChips}>
                      {cls.assignedSubjects.map(subject => (
                        <span key={`${cls.id}-${subject}`} style={{ ...s.subjectChip, ...(cls.classTeacher ? s.subjectChipDark : {}) }}>
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={s.classActions} className="teacher-class-actions">
                  <button
                    style={{ ...s.btnGold, opacity: cls.canTakeAttendance ? 1 : 0.55, cursor: cls.canTakeAttendance ? "pointer" : "not-allowed" }}
                    onClick={(e) => { e.stopPropagation(); cls.canTakeAttendance && goToAttendance(cls.id); }}
                    disabled={!cls.canTakeAttendance}
                  >
                    {cls.canTakeAttendance ? "Mark Attendance" : "Attendance Locked"}
                  </button>
                  <button style={s.btnOutline} onClick={(e) => { e.stopPropagation(); cls.firstExamId ? goToMarks(cls.firstExamId) : goToExams(cls.id); }}>
                    {cls.firstExamId ? "Enter Marks" : "Schedule Exam"}
                  </button>
                  <button style={s.btnOutline} onClick={(e) => { e.stopPropagation(); goToStudents(cls.id); }}>View Students</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Attendance Panel */}
        <div style={s.card} className="teacher-attendance-card">
          <SectionTitle title="Quick Attendance" subtitle={stats.attendanceMarked ? "Today's record already exists. Saving will update it." : "Mark absentees for today and save directly."} />
          {attendanceClasses.length === 0 ? (
            <div style={s.empty}>Attendance is only available for classes where you are the class teacher.</div>
          ) : (
            <>
              <div style={s.attendanceHeader} className="teacher-attendance-header">
                <select style={s.select} value={stats.selectedClassId} onChange={e => handleQuickClassChange(e.target.value)}>
                  {attendanceClasses.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
                <div style={s.datePill}>{new Date().toLocaleDateString('en-GB')}</div>
              </div>

              <div style={s.studentList} className="teacher-attendance-list">
                {attendanceLoading && (
                  <div style={s.empty}>Loading students...</div>
                )}
                {stats.quickAttendance.length === 0 && (
                  <div style={s.empty}>{selectedClass ? "No students found in this class." : "Select a class-teacher assignment to start attendance."}</div>
                )}
                {stats.quickAttendance.map(student => (
                  <div key={student.id} style={s.studentRow}>
                    <div style={s.studentInfo}>
                      <div style={s.studentAvatar}>{student.name.charAt(0)}</div>
                      <div>
                        <p style={s.studentName}>{student.name}</p>
                        <p style={s.studentCode}>{student.code}</p>
                      </div>
                    </div>
                    <button 
                      style={student.status === "present" ? s.btnPresent : s.btnAbsent}
                      onClick={() => toggleStatus(student.id)}
                    >
                      {student.status === "present" ? <><i className="fa-solid fa-check"></i> Present</> : <><i className="fa-solid fa-xmark"></i> Absent</>}
                    </button>
                  </div>
                ))}
              </div>

              <div style={s.attendanceFooter} className="teacher-attendance-footer">
                <div style={s.attnSummary}>
                  <span style={{color: 'var(--danger-text)'}}><strong>{absentCount}</strong> Absent</span> • <span style={{color: 'var(--success-text)'}}><strong>{presentCount}</strong> Present</span>
                </div>
                <div style={s.attendanceActions} className="teacher-attendance-actions">
                  <button style={s.btnGhost} onClick={() => goToAttendance(stats.selectedClassId)}>Open Full Page</button>
                  <button style={s.btnSave} onClick={saveQuickAttendance} disabled={attendanceSaving || !stats.selectedClassId || stats.quickAttendance.length === 0}>
                    {attendanceSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              {attendanceMessage && <div style={s.inlineMessage}>{attendanceMessage}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { width: "100%" },
  loading: { background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.97))", border: "1px solid rgba(200,150,12,0.15)", borderRadius: "16px", padding: "32px 36px", marginBottom: "28px", color: "var(--navy)", fontWeight: "800", fontSize: "1.1rem", textAlign: "center", backdropFilter: "blur(10px)", boxShadow: "0 8px 32px rgba(14,107,107,0.08)" },
  heroBanner: { background: "linear-gradient(135deg, #051a1a 0%, #094f4f 100%)", padding: "40px 36px", borderRadius: "20px", marginBottom: "36px", color: "white", boxShadow: "0 12px 48px rgba(9, 79, 79, 0.35)", position: "relative", overflow: "hidden", border: "1px solid rgba(200,150,12,0.2)" },
  heroTitle: { fontFamily: "var(--font-heading)", fontSize: "2rem", margin: "0 0 12px 0", color: "var(--white)", fontWeight: "700", lineHeight: 1.1, letterSpacing: "-0.02em" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: "1rem", margin: 0, fontWeight: "500", maxWidth: "600px" },
  
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "28px", marginBottom: "36px" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "32px", marginBottom: "36px" },
  card: { background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,255,255,0.99))", borderRadius: "22px", padding: "32px", boxShadow: "0 12px 36px rgba(14,107,107,0.12)", border: "1px solid rgba(200,150,12,0.12)", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", backdropFilter: "blur(10px)" },
  empty: { padding: "28px 24px", background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.95))", border: "1.5px dashed rgba(200,150,12,0.35)", borderRadius: "16px", color: "var(--navy)", fontWeight: "700", textAlign: "center", fontSize: "0.95rem", lineHeight: 1.5, boxShadow: "inset 0 0 24px rgba(200,150,12,0.08)" },
  
  classList: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" },
  classCard: { borderRadius: "20px", padding: "28px", position: "relative", overflow: "hidden", border: "1px solid rgba(200,150,12,0.15)", boxShadow: "0 8px 28px rgba(14,107,107,0.1)", transition: "transform 0.3s ease, box-shadow 0.3s ease", cursor: "pointer" },
  classTeacherCard: { background: "linear-gradient(135deg, #2b0202 0%, #7a1010 52%, #4d0909 100%)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 12px 32px rgba(93, 15, 15, 0.35)" },
  subjectTeacherCard: { background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.98))" },
  classGradientTop: { position: "absolute", top: 0, left: 0, right: 0, height: "8px", background: "linear-gradient(90deg, var(--gold), var(--gold-light))", borderRadius: "20px 20px 0 0" },
  classTeacherGradientTop: { background: "linear-gradient(90deg, #ffcf63, #ffd98c)" },
  classCardHeader: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" },
  className: { fontFamily: "var(--font-heading)", color: "var(--navy-dark)", fontSize: "1.5rem", margin: "0 0 6px 0", fontWeight: "700", letterSpacing: "-0.01em" },
  classNameLight: { color: "var(--white)" },
  classSub: { color: "var(--text-muted)", fontSize: "0.95rem", margin: "0 0 24px 0", fontWeight: "600" },
  classSubLight: { color: "rgba(255,255,255,0.82)" },
  rolePill: { display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "5px 10px", fontSize: "0.68rem", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" },
  rolePillDark: { background: "rgba(255,255,255,0.12)", color: "var(--gold-light)", border: "1px solid rgba(255,255,255,0.16)" },
  rolePillLight: { background: "rgba(200,150,12,0.12)", color: "var(--navy)", border: "1px solid rgba(200,150,12,0.2)" },
  subjectWrap: { marginBottom: "20px" },
  subjectLabel: { fontSize: "0.72rem", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" },
  subjectChips: { display: "flex", gap: "8px", flexWrap: "wrap" },
  subjectChip: { background: "rgba(14,107,107,0.08)", color: "var(--navy-dark)", border: "1px solid rgba(14,107,107,0.12)", borderRadius: "999px", padding: "6px 10px", fontSize: "0.74rem", fontWeight: "700" },
  subjectChipDark: { background: "rgba(255,255,255,0.1)", color: "var(--white)", border: "1px solid rgba(255,255,255,0.14)" },
  lightText: { color: "rgba(255,255,255,0.86)" },
  
  progressWrap: { marginBottom: "28px", background: "rgba(9,79,79,0.03)", padding: "18px", borderRadius: "14px", border: "1px solid rgba(200,150,12,0.1)" },
  progressLabels: { display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: "800", color: "var(--navy-dark)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" },
  progressBar: { width: "100%", height: "10px", background: "rgba(14,107,107,0.1)", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(200,150,12,0.1)" },
  progressFill: { height: "100%", borderRadius: "8px", transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)", boxShadow: "0 2px 8px rgba(200,150,12,0.3)" },

  classActions: { display: "flex", flexDirection: "column", gap: "12px" },
  btnGold: { background: "linear-gradient(135deg, var(--gold), var(--gold-light), #f5c842)", color: "var(--navy-dark)", padding: "14px 16px", borderRadius: "12px", fontWeight: "800", fontSize: "0.9rem", width: "100%", border: "none", boxShadow: "0 6px 18px rgba(200,150,12,0.25)", transition: "all 0.3s ease", cursor: "pointer", position: "relative", overflow: "hidden", animation: "shimmer 3s linear infinite", backgroundSize: "200% auto" },
  btnOutline: { background: "transparent", border: "2px solid var(--navy)", color: "var(--navy)", padding: "14px 16px", borderRadius: "12px", fontWeight: "800", fontSize: "0.9rem", width: "100%", transition: "all 0.3s ease", cursor: "pointer" },

  attendanceHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px", padding: "18px 20px", background: "rgba(14,107,107,0.03)", borderRadius: "16px", border: "1px solid rgba(200,150,12,0.1)" },
  select: { padding: "12px 20px", borderRadius: "12px", border: "2px solid rgba(14,107,107,0.2)", fontFamily: "var(--font-body)", fontWeight: "700", color: "var(--navy-dark)", background: "white", fontSize: "0.95rem", minWidth: "200px", transition: "all 0.3s ease" },
  datePill: { background: "var(--navy)", color: "var(--gold)", padding: "10px 20px", borderRadius: "30px", fontWeight: "800", fontSize: "0.95rem", boxShadow: "0 4px 16px rgba(14,107,107,0.25)", border: "2px solid rgba(200,150,12,0.3)" },

  studentList: { display: "flex", flexDirection: "column", gap: "16px", flex: 1, overflowY: "auto", maxHeight: "400px", paddingRight: "12px" },
  studentRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.98))", border: "1.5px solid rgba(200,150,12,0.15)", borderRadius: "16px", transition: "all 0.3s ease", boxShadow: "0 4px 12px rgba(14,107,107,0.05)", cursor: "pointer" },
  studentInfo: { display: "flex", alignItems: "center", gap: "16px" },
  studentAvatar: { width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "1.2rem", boxShadow: "0 4px 12px rgba(14,107,107,0.3)", border: "2px solid rgba(255,255,255,0.3)" },
  studentName: { margin: 0, fontWeight: "800", color: "var(--navy-dark)", fontSize: "1.05rem", letterSpacing: "-0.01em" },
  studentCode: { margin: 0, color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: "600", opacity: 0.8 },
  
  btnPresent: { background: "linear-gradient(135deg, #137333, #34a853)", color: "white", border: "none", padding: "10px 24px", borderRadius: "30px", fontWeight: "800", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 6px 18px rgba(19,115,51,0.25)", transition: "all 0.3s ease", cursor: "pointer", minWidth: "120px", justifyContent: "center" },
  btnAbsent: { background: "linear-gradient(135deg, #c5221f, #ea4335)", color: "white", border: "none", padding: "10px 24px", borderRadius: "30px", fontWeight: "800", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 6px 18px rgba(197,34,31,0.25)", transition: "all 0.3s ease", cursor: "pointer", minWidth: "120px", justifyContent: "center" },

  attendanceFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "36px", paddingTop: "28px", borderTop: "2px solid rgba(200,150,12,0.12)" },
  attnSummary: { fontSize: "1rem", background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.95))", padding: "12px 28px", borderRadius: "30px", fontWeight: "800", color: "var(--navy-dark)", border: "2px solid rgba(200,150,12,0.15)", boxShadow: "0 4px 16px rgba(14,107,107,0.1)" },
  attendanceActions: { display: "flex", alignItems: "center", gap: "16px" },
  btnGhost: { background: "transparent", color: "var(--navy)", border: "2px solid var(--navy)", padding: "12px 24px", borderRadius: "30px", fontWeight: "800", fontSize: "0.9rem", transition: "all 0.3s ease", cursor: "pointer", minWidth: "140px", textAlign: "center" },
  btnSave: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "white", padding: "14px 32px", borderRadius: "30px", fontWeight: "800", fontSize: "1rem", boxShadow: "0 8px 24px rgba(14,107,107,0.35)", border: "none", transition: "all 0.3s ease", cursor: "pointer", minWidth: "140px", textAlign: "center" },
  inlineMessage: { marginTop: "20px", background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.98))", border: "2px solid rgba(200,150,12,0.2)", color: "var(--navy)", padding: "16px 20px", borderRadius: "16px", fontSize: "0.95rem", fontWeight: "800", textAlign: "center", boxShadow: "0 4px 16px rgba(14,107,107,0.1)" }
};
