import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import api from "../../api/axios";
import StatCard from "../../components/StatCard";
import SectionTitle from "../../components/SectionTitle";
import useActiveAcademicYear from "../../hooks/useActiveAcademicYear";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

// ── Donut center label ──────────────────────────────────────────────────────
function AttendanceCenterLabel({ present = 0, absent = 0 }) {
  const total = present + absent;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  return (
    <div style={{ textAlign: "center", lineHeight: 1, pointerEvents: "none" }}>
      <div style={{ fontSize: "1.55rem", fontWeight: 800, color: "var(--navy-dark)", fontFamily: "var(--font-counter)" }}>
        {pct}%
      </div>
      <div style={{ marginTop: "5px", fontSize: "0.62rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-body)" }}>
        Present
      </div>
    </div>
  );
}

// ── Custom Bar Tooltip ──────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--navy-dark)", color: "#fff", borderRadius: "10px", padding: "8px 14px", fontSize: "0.82rem", fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
      <div style={{ color: "var(--gold-light)", marginBottom: "2px" }}>{label}</div>
      <div>{payload[0].value} students</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { academicYearLabel } = useActiveAcademicYear();
  const [stats, setStats] = useState({
    students: 0, teachers: 0, classes: 0, fees: 0, pendingFees: 0,
    studentsByClass: [],
    todayAttendance: { present: 0, absent: 0, unmarked: 0, unmarkedClasses: [], unmarkedClassDetails: [], isHoliday: false },
    recentActivity: [],
    upcomingExams: [],
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get("/dashboard/admin-stats");
        setStats(data);
      } catch (e) {
        console.error("Dashboard fetch error:", e);
      }
    };
    fetchStats();
  }, []);

  const COLORS = ["#10b981", "#ef4444"];
  const todayDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const actIconClass = (type) => {
    if (type === "fee") return "portal-activity-icon fee";
    if (type === "attendance") return "portal-activity-icon attendance";
    return "portal-activity-icon other";
  };

  const actEmoji = (type) => {
    if (type === "fee") return "💰";
    if (type === "attendance") return "📋";
    return "📝";
  };

  return (
    <div style={s.page} className="portal-dashboard-page">

      {/* ── HERO BANNER ──────────────────────────────────────────── */}
      <div style={s.heroBanner} className="portal-hero-banner">
        {/* Decorative orbs */}
        <div className="portal-hero-orb-1" />
        <div className="portal-hero-orb-2" />

        <div style={s.heroLeft}>
          {/* Date pill */}
          <div style={s.heroPill}>
            <i className="fa-solid fa-circle-dot" style={{ color: "#10b981", fontSize: "0.55rem" }} aria-hidden="true" />
            {todayDate}
          </div>
          <h1 style={s.heroTitle}>
            Welcome back, <span style={s.heroName}>{user?.name?.split(" ")[0] || "Administrator"}</span> 👋
          </h1>
          <p style={s.heroSub}>AY {academicYearLabel} &nbsp;·&nbsp; Loretto Central School</p>
        </div>

        <div style={s.heroActions} className="portal-hero-actions">
          {[
            { icon: "fa-user-plus", label: "Add Student", path: "/admin/students?action=add", color: "rgba(200,150,12,0.2)" },
            { icon: "fa-clipboard-user", label: "Attendance", path: "/admin/attendance", color: "rgba(16,185,129,0.2)" },
            { icon: "fa-file-pen", label: "New Exam", path: "/admin/exams?action=create", color: "rgba(99,102,241,0.2)" },
          ].map((btn) => (
            <button
              key={btn.path}
              style={{ ...s.heroBtn, background: btn.color }}
              onClick={() => navigate(btn.path)}
            >
              <i className={`fa-solid ${btn.icon}`} style={{ fontSize: "0.9rem" }} aria-hidden="true" />
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── STAT CARDS ───────────────────────────────────────────── */}
      <div style={s.grid4} className="portal-dashboard-grid">
        {[
          { title: "Total Students", value: stats.students, icon: <i className="fa-solid fa-user-graduate" />, color: "navy", trend: "+12%" },
          { title: "Total Teachers", value: stats.teachers, icon: <i className="fa-solid fa-chalkboard-user" />, color: "gold", trend: "+2%" },
          { title: "Fees Collected", value: `₹${(stats.fees / 100000).toFixed(1)}L`, icon: <i className="fa-solid fa-sack-dollar" />, color: "teal", trend: "+5%" },
          { title: "Fees Pending", value: `₹${(stats.pendingFees / 100000).toFixed(1)}L`, icon: <i className="fa-solid fa-hourglass-half" />, color: "red", trend: "-2%" },
        ].map((card, i) => (
          <div
            key={card.title}
            className="portal-stat-in"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
            <StatCard {...card} />
          </div>
        ))}
      </div>

      {/* ── CHARTS ROW ───────────────────────────────────────────── */}
      <div style={s.grid2} className="portal-dashboard-split">

        {/* Students by Class — Bar Chart */}
        <div style={s.card}>
          <SectionTitle title="Students by Class" />
          <div style={{ height: "300px", width: "100%", marginTop: "8px" }}>
            <ResponsiveContainer>
              <BarChart
                data={stats.studentsByClass}
                margin={{ top: 10, right: 8, left: -24, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontFamily: "var(--font-body)", fontSize: 11, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontFamily: "var(--font-body)", fontSize: 11, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: "rgba(200,150,12,0.07)", radius: 8 }} />
                <Bar
                  dataKey="count"
                  fill="var(--navy)"
                  radius={[6, 6, 0, 0]}
                  activeBar={{ fill: "var(--gold)", radius: [6, 6, 0, 0] }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attendance Donut */}
        <div style={s.card}>
          <SectionTitle title="Today's Attendance" />

          {stats.todayAttendance.isHoliday && (
            <div style={s.holidayBanner}>
              <i className="fa-solid fa-umbrella-beach" style={{ color: "var(--gold)", fontSize: "1.1rem" }} />
              <div>
                <strong>{stats.todayAttendance.holiday || "Holiday"}</strong>
                <div style={s.holidayMeta}>
                  Attendance is disabled for {stats.todayAttendance.holidayDate || "today"}.
                </div>
              </div>
            </div>
          )}

          <div style={{ height: "210px", width: "100%", marginTop: "4px", position: "relative" }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={[
                    { name: "Present", value: stats.todayAttendance.present },
                    { name: "Absent", value: stats.todayAttendance.absent },
                  ]}
                  cx="50%" cy="50%"
                  innerRadius={58}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  labelLine={false}
                  label={false}
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(val) => (
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)" }}>{val}</span>
                  )}
                />
                <RechartsTooltip
                  contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "var(--shadow-md)", fontSize: "0.82rem" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
              <AttendanceCenterLabel
                present={stats.todayAttendance.present}
                absent={stats.todayAttendance.absent}
              />
            </div>
          </div>

          {/* Summary */}
          <div style={s.attnSummary}>
            <p style={s.markedSummary}>
              <strong style={{ color: "var(--navy-dark)" }}>
                {stats.classes - (stats.todayAttendance.unmarkedClasses?.length || 0)}
              </strong>
              {" "}of {stats.classes} classes marked today
            </p>

            {stats.todayAttendance.unmarkedClassDetails?.length > 0 && (
              <div style={s.unmarkedBox}>
                <div style={s.unmarkedHeader}>
                  <div style={s.unmarkedTitle}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: "6px" }} />
                    Not yet marked
                  </div>
                  <div style={s.unmarkedCount}>
                    {stats.todayAttendance.unmarkedClassDetails.length} class{stats.todayAttendance.unmarkedClassDetails.length === 1 ? "" : "es"}
                  </div>
                </div>
                <div style={s.unmarkedList}>
                  {stats.todayAttendance.unmarkedClassDetails.map((item) => (
                    <div key={item.classId} style={s.unmarkedItem}>
                      <div style={s.unmarkedClass}>
                        <i className="fa-solid fa-clipboard-question" />
                        <span>{item.classLabel}</span>
                      </div>
                      <div style={s.unmarkedTeacher}>
                        <i className="fa-solid fa-chalkboard-user" />
                        <span>{item.teacherName}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button style={s.smallGoldBtn} onClick={() => navigate("/admin/attendance")}>
                  <i className="fa-solid fa-pen-to-square" style={{ marginRight: "6px" }} />
                  Mark Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ACTIVITY + EXAMS ─────────────────────────────────────── */}
      <div style={s.grid2} className="portal-dashboard-split">

        {/* Recent Activity — Timeline */}
        <div style={s.card}>
          <SectionTitle title="Recent Activity" />
          {stats.recentActivity.length === 0 ? (
            <div style={s.emptyState}>
              <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: "1.6rem", opacity: 0.3, marginBottom: "8px" }} />
              <p style={{ margin: 0, fontSize: "0.85rem" }}>No recent activity</p>
            </div>
          ) : (
            <div className="portal-activity-timeline" style={{ marginTop: "16px" }}>
              {stats.recentActivity.map((act) => (
                <div key={act.id} className="portal-activity-item">
                  <div className="portal-activity-dot" />
                  <div className={actIconClass(act.type)}>{actEmoji(act.type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={s.actMsg}>{act.msg}</p>
                    <p style={s.actTime}>{act.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Exams */}
        <div style={s.card}>
          <SectionTitle title="Upcoming Exams" />
          {stats.upcomingExams.length === 0 ? (
            <div style={s.emptyState}>
              <i className="fa-solid fa-file-circle-check" style={{ fontSize: "1.6rem", opacity: 0.3, marginBottom: "8px" }} />
              <p style={{ margin: 0, fontSize: "0.85rem" }}>No upcoming exams</p>
            </div>
          ) : (
            <div style={s.examScroll}>
              {stats.upcomingExams.map((exam) => (
                <div key={exam.id} style={s.examCard}>
                  <div className="portal-exam-card-accent" />
                  <h4 style={s.examTitle}>{exam.title}</h4>
                  <div style={s.examTags}>
                    <span style={{ ...s.examTag, background: "rgba(14,107,107,0.1)", color: "var(--navy)" }}>
                      <i className="fa-solid fa-chalkboard" style={{ marginRight: "4px", fontSize: "0.65rem" }} />
                      {exam.class}
                    </span>
                    <span style={{ ...s.examTag, background: "rgba(200,150,12,0.12)", color: "var(--gold)" }}>
                      <i className="fa-solid fa-calendar" style={{ marginRight: "4px", fontSize: "0.65rem" }} />
                      {exam.date}
                    </span>
                  </div>
                  <button style={s.examBtn} onClick={() => navigate("/admin/exams")}>
                    View Details
                    <i className="fa-solid fa-arrow-right" style={{ marginLeft: "6px", fontSize: "0.72rem" }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { width: "100%" },

  /* Hero */
  heroBanner: {
    background: "linear-gradient(135deg, #051a1a 0%, #0a3b3b 50%, #094040 100%)",
    padding: "32px 36px",
    borderRadius: "20px",
    marginBottom: "24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
    position: "relative",
    overflow: "hidden",
    border: "1px solid rgba(200,150,12,0.15)",
  },
  heroLeft: { position: "relative", zIndex: 1 },
  heroPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.7)",
    fontSize: "0.72rem",
    fontWeight: 700,
    padding: "4px 12px",
    borderRadius: "20px",
    marginBottom: "12px",
    letterSpacing: "0.04em",
  },
  heroTitle: {
    fontFamily: "var(--font-heading)",
    color: "#fff",
    fontSize: "1.65rem",
    margin: "0 0 8px 0",
    lineHeight: 1.25,
  },
  heroName: { color: "var(--gold-light)" },
  heroSub: {
    color: "rgba(200,150,12,0.75)",
    fontSize: "0.82rem",
    margin: 0,
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  heroActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    position: "relative",
    zIndex: 1,
  },
  heroBtn: {
    color: "#fff",
    borderRadius: "12px",
    padding: "10px 18px",
    minHeight: "44px",
    fontWeight: 700,
    fontSize: "0.82rem",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid rgba(255,255,255,0.15)",
    backdropFilter: "blur(8px)",
    transition: "all 0.2s ease",
    cursor: "pointer",
  },

  /* Grid layouts */
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
    marginBottom: "24px",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "20px",
    marginBottom: "24px",
  },

  /* Card */
  card: {
    background: "var(--white)",
    borderRadius: "18px",
    padding: "24px 26px",
    boxShadow: "0 2px 20px rgba(14,107,107,0.07)",
    border: "1px solid rgba(200,150,12,0.1)",
    transition: "box-shadow 0.2s ease",
  },

  /* Holiday banner */
  holidayBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    background: "rgba(200,150,12,0.08)",
    border: "1px solid rgba(200,150,12,0.2)",
    color: "var(--navy)",
    borderRadius: "12px",
    padding: "12px 14px",
    marginBottom: "12px",
    marginTop: "12px",
  },
  holidayMeta: { marginTop: "3px", fontSize: "0.78rem", color: "var(--text-muted)" },

  /* Attendance summary */
  attnSummary: { textAlign: "center", marginTop: "12px" },
  markedSummary: { color: "var(--text)", margin: "0 0 10px", fontSize: "0.88rem" },
  unmarkedBox: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    background: "var(--danger-bg)",
    padding: "12px 14px",
    borderRadius: "12px",
    textAlign: "left",
    border: "1px solid rgba(197,34,31,0.12)",
  },
  unmarkedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },
  unmarkedTitle: {
    fontSize: "0.8rem",
    fontWeight: 800,
    color: "var(--danger-text)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  unmarkedCount: {
    fontSize: "0.75rem",
    fontWeight: 800,
    color: "var(--text-muted)",
    background: "rgba(255,255,255,0.75)",
    padding: "3px 9px",
    borderRadius: "999px",
  },
  unmarkedList: { display: "grid", gap: "8px" },
  unmarkedItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "8px 10px",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(197,48,48,0.1)",
  },
  unmarkedClass: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "#b91c1c",
    fontWeight: 800,
    fontSize: "0.85rem",
  },
  unmarkedTeacher: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "var(--navy)",
    fontWeight: 700,
    fontSize: "0.82rem",
  },
  smallGoldBtn: {
    background: "var(--gold)",
    color: "var(--navy-dark)",
    padding: "7px 14px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "0.78rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    cursor: "pointer",
  },

  /* Activity */
  actMsg: { margin: 0, fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" },
  actTime: { margin: "3px 0 0 0", fontSize: "0.72rem", color: "var(--text-muted)" },

  /* Empty state */
  emptyState: {
    border: "2px dashed var(--border)",
    borderRadius: "14px",
    padding: "32px",
    textAlign: "center",
    color: "var(--text-muted)",
    marginTop: "16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  /* Exam cards */
  examScroll: {
    display: "flex",
    gap: "14px",
    overflowX: "auto",
    paddingBottom: "8px",
    marginTop: "16px",
  },
  examCard: {
    minWidth: "210px",
    background: "var(--light-bg)",
    borderRadius: "14px",
    padding: "20px 18px 16px",
    position: "relative",
    overflow: "hidden",
    border: "1px solid var(--border)",
    flexShrink: 0,
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
  },
  examTitle: {
    fontFamily: "var(--font-heading)",
    color: "var(--navy)",
    fontSize: "1.05rem",
    margin: "10px 0 10px",
    lineHeight: 1.3,
  },
  examTags: { display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" },
  examTag: {
    padding: "4px 9px",
    borderRadius: "6px",
    fontSize: "0.68rem",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
  },
  examBtn: {
    width: "100%",
    background: "var(--white)",
    border: "1px solid rgba(14,107,107,0.25)",
    color: "var(--navy)",
    padding: "8px 12px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "0.78rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
