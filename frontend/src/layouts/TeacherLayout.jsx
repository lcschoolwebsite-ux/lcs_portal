import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import api from "../api/axios";
import useActiveAcademicYear from "../hooks/useActiveAcademicYear";
import AppFooter from "../components/AppFooter";
import MobileBottomBar from "../components/MobileBottomBar";
import MobileMenuDrawer from "../components/MobileMenuDrawer";
import { isNativeAndroidApp } from "../services/nativeBridge";

// Lazy pages
const Dashboard = lazy(() => import("../pages/teacher/Dashboard"));
const Classes = lazy(() => import("../pages/teacher/Classes"));
const ClassWorkspace = lazy(() => import("../pages/teacher/ClassWorkspace"));
const Students = lazy(() => import("../pages/teacher/Students"));
const AddStudent = lazy(() => import("../pages/teacher/AddStudent"));
const Attendance = lazy(() => import("../pages/teacher/Attendance"));
const Fees = lazy(() => import("../pages/teacher/Fees"));
const Marks = lazy(() => import("../pages/teacher/Marks"));
const Homework = lazy(() => import("../pages/teacher/Homework"));
const Exams = lazy(() => import("../pages/teacher/Exams"));
const Announcements = lazy(() => import("../pages/teacher/Announcements"));
const Profile = lazy(() => import("../pages/teacher/Profile"));

const MENU_GROUPS = [
  {
    label: "HOME",
    items: [
      { label: "Dashboard", path: "/teacher", icon: "fa-solid fa-chart-line" },
      { label: "My Profile", path: "/teacher/profile", icon: "fa-solid fa-id-badge" },
      { label: "Announcements", path: "/teacher/announcements", icon: "fa-solid fa-bullhorn" },
    ]
  },
  {
    label: "MY CLASSES",
    items: [
      { label: "My Classes", path: "/teacher/classes", icon: "fa-solid fa-school" },
      { label: "My Students", path: "/teacher/students", icon: "fa-solid fa-users" },
      { label: "Add Student", path: "/teacher/students/add", icon: "fa-solid fa-user-plus" },
      { label: "Attendance", path: "/teacher/attendance", icon: "fa-solid fa-clipboard-user" },
      { label: "Homework", path: "/teacher/homework", icon: "fa-solid fa-book-open" },
      { label: "Fee Management", path: "/teacher/fees", icon: "fa-solid fa-wallet" },
    ]
  },
  {
    label: "EVALUATION",
    items: [
      { label: "All Exams", path: "/teacher/exams", icon: "fa-solid fa-file-lines" },
      { label: "Marks Entry", path: "/teacher/marks", icon: "fa-solid fa-pen-to-square" },
    ]
  }
];

const SIDEBAR_WIDTH = "200px";

export default function TeacherLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [allowTeacherStudentCreation, setAllowTeacherStudentCreation] = useState(true);
  const [canTakeAttendance, setCanTakeAttendance] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { academicYearLabel } = useActiveAcademicYear();

  useEffect(() => {
    const fetchStudentRegistrationSettings = async () => {
      try {
        const [settingsRes, classesRes] = await Promise.all([
          api.get("/settings/student-registration"),
          api.get("/classes")
        ]);
        setAllowTeacherStudentCreation(Boolean(settingsRes.data.allowTeacherStudentCreation));
        const hasClassTeacherAccess = (classesRes.data || []).some(
          cls => String(cls.classTeacher?._id || cls.classTeacher) === String(user?.id || "")
        );
        setCanTakeAttendance(hasClassTeacherAccess);
      } catch (e) {
        console.error("Unable to load teacher permissions", e);
      }
    };

    fetchStudentRegistrationSettings();
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const allMenuItems = MENU_GROUPS.flatMap(g => g.items);
  const currentPathLabel =
    allMenuItems.find(i => i.path === location.pathname)?.label ||
    [...allMenuItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find(i => location.pathname.startsWith(i.path))?.label ||
    "Dashboard";
  const bottomBarItems = [
    { label: "Dashboard", shortLabel: "Home", path: "/teacher", icon: "fa-solid fa-chart-line" },
    { label: "Notices", shortLabel: "Notices", path: "/teacher/announcements", icon: "fa-solid fa-bullhorn" },
    { label: "Attendance", shortLabel: "Attend", path: "/teacher/attendance", icon: "fa-solid fa-clipboard-user" },
    { label: "Fees", shortLabel: "Fees", path: "/teacher/fees", icon: "fa-solid fa-wallet" },
    { label: "Marks", shortLabel: "Marks", path: "/teacher/marks", icon: "fa-solid fa-pen-to-square" },
  ];

  return (
    <div style={s.container} className="teacher-shell">
      <MobileMenuDrawer
        open={menuOpen}
        title="LCS Portal"
        subtitle={user?.name || "Teacher"}
        items={MENU_GROUPS.flatMap(group => group.items).filter(item => {
          if (!allowTeacherStudentCreation && item.path === "/teacher/students/add") return false;
          if (!canTakeAttendance && item.path === "/teacher/attendance") return false;
          return true;
        })}
        currentPath={location.pathname}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
        logoutLabel="Logout"
      />

      <div style={s.mobileTopbar} className="teacher-mobile-topbar" aria-hidden="true" />

      <MobileBottomBar
        className="mobile-bottom-bar teacher-mobile-bottom-bar"
        items={bottomBarItems}
        currentPath={location.pathname}
        onMenuClick={() => setMenuOpen(true)}
        forceVisible={isNativeAndroidApp()}
      />

      {/* Sidebar */}
      <aside style={s.sidebar} className="teacher-sidebar">
        <div style={s.logoArea}>
          <img src="/logo.png" alt="Logo" style={s.logoImg} />
          <div>
            <h1 style={s.schoolName}>LCS Portal</h1>
            <p style={s.tagline}>love through service</p>
          </div>
        </div>

        <div style={s.userInfoCard}>
          <div style={s.avatar}>{user?.name?.[0] || 'T'}</div>
          <div>
            <div style={s.userName}>{user?.name || 'Teacher'}</div>
            <div style={s.userRole}>TEACHER PORTAL</div>
          </div>
        </div>

        <nav style={s.nav} className="teacher-nav">
          {MENU_GROUPS.map((group, gIdx) => (
            <div key={gIdx} style={s.navGroup}>
              <div style={s.groupLabel}>{group.label}</div>
              {group.items.filter(item => {
                if (!allowTeacherStudentCreation && item.path === "/teacher/students/add") return false;
                if (!canTakeAttendance && item.path === "/teacher/attendance") return false;
                return true;
              }).map(item => {
                const isActive = item.path === "/teacher" ? location.pathname === item.path : location.pathname.startsWith(item.path);
                return (
                  <Link key={item.path} to={item.path} style={{...s.navItem, ...(isActive ? s.activeNav : {})}}>
                    <i className={item.icon} style={s.icon}></i>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={s.sidebarBottom}>
          <div style={s.yearBadge}>AY {academicYearLabel}</div>
          <button onClick={handleLogout} style={s.logoutBtn}>
            <i className="fa-solid fa-arrow-right-from-bracket" style={{marginRight: '8px'}}></i> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={s.main} className="teacher-main">
        {/* Top Header */}
        <header style={s.header} className="teacher-header">
          <div style={s.headerBrand} className="teacher-header-brand">
            <img src="/logo.png" alt="LCS Portal" style={s.headerLogo} className="teacher-header-logo" />
            <div>
              <h2 style={s.pageTitle} className="teacher-page-title">{currentPathLabel}</h2>
              <div style={s.breadcrumb} className="teacher-breadcrumb">Loretto Central School</div>
            </div>
          </div>
          
          <div style={s.headerRight} className="teacher-header-right">
            <button style={s.bellBtn}>
              <i className="fa-regular fa-bell"></i>
            </button>
            <div style={s.headerYearPill} className="teacher-header-year-pill">{academicYearLabel}</div>
            <button onClick={handleLogout} style={s.logoutBtn} className="teacher-logout-btn">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
            <div style={s.headerAvatar} className="teacher-header-avatar">{user?.name?.[0] || 'T'}</div>
          </div>
        </header>

        <section style={s.content} className="teacher-content">
          <Suspense fallback={<div style={s.loading}><i className="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/classes/:classId" element={<ClassWorkspace />} />
              <Route path="/students" element={<Students />} />
              <Route path="/students/add" element={<AddStudent />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/homework" element={<Homework />} />
              <Route path="/fees" element={<Fees />} />
              <Route path="/marks" element={<Marks />} />
              <Route path="/exams" element={<Exams />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<div style={s.loading}>Page coming soon...</div>} />
            </Routes>
          </Suspense>
        </section>
        <AppFooter />
      </main>
    </div>
  );
}

const s = {
  container: { display: "flex", width: "100%", minHeight: "100vh", background: "var(--light-bg)" },
  
  /* Sidebar Styles */
  sidebar: { width: SIDEBAR_WIDTH, background: "linear-gradient(180deg, #051a1a 0%, #094f4f 100%)", borderRight: "1px solid rgba(200,150,12,0.2)", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, zIndex: 100 },
  logoArea: { display: "flex", alignItems: "center", gap: "10px", padding: "16px 16px 14px" },
  logoImg: { width: "42px", height: "42px", objectFit: "contain" },
  schoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "1.1rem", margin: 0, lineHeight: 1.2 },
  tagline: { color: "var(--gold-light)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "4px 0 0 0" },

  mobileTopbar: { display: "none" },
  mobileBrand: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  mobileMenuBtn: { width: "44px", height: "44px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  mobileLogo: { width: "42px", height: "42px", objectFit: "contain", flex: "0 0 auto" },
  mobileSchoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "1rem", lineHeight: 1.1, margin: 0 },
  mobileUserLine: { color: "var(--gold-light)", fontSize: "0.72rem", fontWeight: "800", margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "240px" },
  mobileLogout: { width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  userInfoCard: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(200,150,12,0.2)", borderRadius: "12px", padding: "10px", margin: "0 16px 16px 16px", display: "flex", alignItems: "center", gap: "10px" },
  avatar: { width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "1rem" },
  userName: { color: "var(--white)", fontSize: "0.85rem", fontFamily: "var(--font-body)", fontWeight: "700" },
  userRole: { color: "var(--gold-pale)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "2px", fontWeight: "600" },
  
  nav: { flex: 1, overflowY: "auto", padding: "0 12px" },
  navGroup: { marginBottom: "14px" },
  groupLabel: { color: "var(--gold)", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.7, marginBottom: "6px", paddingLeft: "8px", fontWeight: "700" },
  navItem: { display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: "9px", color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: "0.82rem", fontWeight: "600", transition: "var(--transition)", marginBottom: "4px" },
  activeNav: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "var(--white)", boxShadow: "0 4px 14px rgba(14,107,107,0.4)", borderLeft: "3px solid var(--gold-light)" },
  icon: { width: "18px", textAlign: "center", marginRight: "8px", fontSize: "0.95rem" },
  
  sidebarBottom: { padding: "16px", borderTop: "1px solid rgba(255,255,255,0.05)" },
  yearBadge: { border: "1px solid var(--gold)", color: "var(--gold)", borderRadius: "20px", padding: "4px 12px", fontSize: "0.7rem", fontWeight: "700", textAlign: "center", marginBottom: "16px", background: "rgba(200,150,12,0.1)" },
  logoutBtn: { width: "100%", padding: "10px", background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.6)", borderRadius: "8px", fontWeight: "600", cursor: "pointer", transition: "var(--transition)", fontSize: "0.85rem" },

  /* Header Styles */
  main: { flex: 1, marginLeft: SIDEBAR_WIDTH, display: "flex", flexDirection: "column", minWidth: 0 },
  header: { height: "56px", background: "var(--white)", borderBottom: "2px solid var(--gold)", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 90 },
  headerBrand: { display: "flex", alignItems: "center", gap: "12px" },
  headerLogo: { width: "34px", height: "34px", objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" },
  pageTitle: { fontFamily: "var(--font-heading)", color: "var(--navy)", fontSize: "1.15rem", margin: 0, fontWeight: "700" },
  breadcrumb: { color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "2px" },
  
  headerRight: { display: "flex", alignItems: "center", gap: "14px" },
  bellBtn: { background: "none", border: "none", fontSize: "1.05rem", color: "var(--navy)", position: "relative", cursor: "pointer" },
  logoutBtn: { display: "none", background: "none", border: "none", fontSize: "1.05rem", color: "var(--navy)", cursor: "pointer" },
  headerYearPill: { background: "var(--navy)", color: "var(--gold)", padding: "3px 10px", borderRadius: "20px", fontSize: "0.7rem", fontWeight: "800" },
  headerAvatar: { width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", cursor: "pointer", fontSize: "0.85rem" },

  content: { padding: "24px 28px", flex: 1 },
  loading: { padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "1.2rem" }
};
