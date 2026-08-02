import { lazy, Suspense, useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import useActiveAcademicYear from "../hooks/useActiveAcademicYear";
import AppFooter from "../components/AppFooter";
import MobileBottomBar from "../components/MobileBottomBar";
import MobileMenuDrawer from "../components/MobileMenuDrawer";
import { isNativeAndroidApp } from "../services/nativeBridge";

// Lazy pages
const Dashboard = lazy(() => import("../pages/admin/Dashboard"));
const Classes = lazy(() => import("../pages/admin/Classes"));
const AcademicYears = lazy(() => import("../pages/admin/AcademicYears"));
const StudentLogins = lazy(() => import("../pages/admin/StudentLogins"));
const Holidays = lazy(() => import("../pages/admin/Holidays"));
const Students = lazy(() => import("../pages/admin/Students"));
const Teachers = lazy(() => import("../pages/admin/Teachers"));
const Subjects = lazy(() => import("../pages/admin/Subjects"));
const ClassManagement = lazy(() => import("../pages/admin/ClassManagement"));
const Exams = lazy(() => import("../pages/admin/Exams"));
const Attendance = lazy(() => import("../pages/admin/Attendance"));
const FeeStructure = lazy(() => import("../pages/admin/FeeStructure"));
const Fees = lazy(() => import("../pages/admin/Fees"));
const PendingUpiVerifications = lazy(() => import("../pages/admin/PendingUpiVerifications"));
const Announcements = lazy(() => import("../pages/admin/Announcements"));
const Analytics = lazy(() => import("../pages/admin/Analytics"));
const MarksOverview = lazy(() => import("../pages/admin/MarksOverview"));
const StudentNotices = lazy(() => import("../pages/admin/StudentNotices"));
const Homework = lazy(() => import("../pages/admin/Homework"));

const menuGroups = [
  {
    title: "System",
    items: [
      { label: "Dashboard", path: "/admin", icon: "fa-solid fa-gauge-high" },
      { label: "Analytics", path: "/admin/analytics", icon: "fa-solid fa-chart-simple" },
      { label: "Attendance", path: "/admin/attendance", icon: "fa-solid fa-calendar-check" },
      { label: "Holidays", path: "/admin/holidays", icon: "fa-solid fa-umbrella-beach" },
      { label: "Academic Years", path: "/admin/academic-years", icon: "fa-solid fa-calendar-days" },
      { label: "Student Logins", path: "/admin/student-logins", icon: "fa-solid fa-right-to-bracket" },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Classes", path: "/admin/classes", icon: "fa-solid fa-chalkboard" },
      { label: "Subjects", path: "/admin/subjects", icon: "fa-solid fa-book" },
    ],
  },
  {
    title: "Users",
    items: [
      { label: "Teachers", path: "/admin/teachers", icon: "fa-solid fa-chalkboard-user" },
      { label: "Students", path: "/admin/students", icon: "fa-solid fa-user-graduate" },
    ],
  },
    {
      title: "Evaluation",
      items: [
        { label: "Exams", path: "/admin/exams", icon: "fa-solid fa-file-invoice" },
        { label: "Marks Overview", path: "/admin/marks-overview", icon: "fa-solid fa-chart-column" },
        { label: "Announcements", path: "/admin/announcements", icon: "fa-solid fa-bullhorn" },
        { label: "Student Notices", path: "/admin/student-notices", icon: "fa-solid fa-paper-plane" },
        { label: "Homework", path: "/admin/homework", icon: "fa-solid fa-book-open" },
      ],
    },
    {
      title: "Accounts",
      items: [
        { label: "Fee Structure", path: "/admin/fee-structure", icon: "fa-solid fa-money-check-dollar" },
        { label: "Fee Management", path: "/admin/fees", icon: "fa-solid fa-receipt" },
        { label: "Pending Verifications", path: "/admin/pending-upi-verifications", icon: "fa-solid fa-circle-check" },
      ],
    },
  ];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { academicYearLabel } = useActiveAcademicYear();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(() =>
    location.pathname.startsWith("/admin/fee-structure") ||
    location.pathname.startsWith("/admin/fees") ||
    location.pathname.startsWith("/admin/pending-upi-verifications")
  );

  const handleLogout = () => {
    logout();
    navigate("/");
  };
  const accountsRouteActive =
    location.pathname.startsWith("/admin/fee-structure") ||
    location.pathname.startsWith("/admin/fees") ||
    location.pathname.startsWith("/admin/pending-upi-verifications");
  const accountsExpanded = accountsOpen || accountsRouteActive;

  const currentPathLabel = menuGroups
    .flatMap(g => g.items)
    .find(i => location.pathname === i.path || location.pathname.startsWith(`${i.path}/`))?.label || "Dashboard";
  const bottomBarItems = [
    { label: "Dashboard", shortLabel: "Home", path: "/admin", icon: "fa-solid fa-gauge-high" },
    { label: "Notices", shortLabel: "Notices", path: "/admin/announcements", icon: "fa-solid fa-bullhorn" },
    { label: "Attendance", shortLabel: "Attend", path: "/admin/attendance", icon: "fa-solid fa-calendar-check" },
    { label: "Marks", shortLabel: "Marks", path: "/admin/marks-overview", icon: "fa-solid fa-chart-column" },
    { label: "Fees", shortLabel: "Fees", path: "/admin/fees", icon: "fa-solid fa-receipt" },
  ];

  return (
    <div style={s.layout} className="admin-shell">
      <MobileMenuDrawer
        open={menuOpen}
        title="LCS Portal"
        subtitle={user?.name || "Administrator"}
        items={menuGroups.flatMap(group => group.items)}
        currentPath={location.pathname}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
        logoutLabel="Logout"
      />

      <div style={s.mobileTopbar} className="admin-mobile-topbar" aria-hidden="true" />

      <MobileBottomBar
        className="mobile-bottom-bar"
        items={bottomBarItems}
        currentPath={location.pathname}
        onMenuClick={() => setMenuOpen(true)}
        forceVisible={isNativeAndroidApp()}
      />

      <aside style={s.sidebar} className="admin-sidebar">
        <div style={s.logoArea}>
          <img src="/logo.png" alt="Logo" style={s.logoImg} />
          <div>
            <h1 style={s.schoolName}>LCS Portal</h1>
            <p style={s.tagline}>System Management</p>
          </div>
        </div>

        <nav style={s.nav}>
          {menuGroups.map((group, idx) => (
            <div key={idx} style={s.navGroup}>
              {group.title === "Accounts" ? (
                <button
                  type="button"
                  style={s.groupToggle}
                  onClick={() => setAccountsOpen(prev => !prev)}
                  aria-expanded={accountsExpanded}
                  aria-controls="admin-accounts-menu"
                >
                  <span style={s.groupLabel}>Accounts</span>
                  <i
                    className={`fa-solid fa-chevron-${accountsExpanded ? "up" : "down"}`}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <div style={s.groupLabel}>{group.title}</div>
              )}
              {group.title !== "Accounts" || accountsExpanded ? (
                <div id={group.title === "Accounts" ? "admin-accounts-menu" : undefined}>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        style={{ ...s.navItem, ...(isActive ? s.activeNavItem : {}) }}
                      >
                        <i className={item.icon} style={s.navIcon}></i>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div style={s.sidebarBottom}>
          <button onClick={handleLogout} style={s.logoutBtn}>
            <i className="fa-solid fa-right-from-bracket" style={{ marginRight: "10px" }}></i>
            Logout
          </button>
        </div>
      </aside>

      <main style={s.main} className="admin-main">
        <header style={s.header} className="admin-header">
          <div style={s.headerBrand}>
            <img src="/logo.png" alt="LCS Portal" style={s.headerLogo} />
            <div style={s.headerLeft}>
              <h2 style={s.pageTitle}>{currentPathLabel}</h2>
              <div style={s.breadcrumb}>Loretto Central School</div>
            </div>
          </div>
          <div style={s.headerRight} className="admin-header-right">
            <div style={s.badge}>AY {academicYearLabel}</div>
            <button onClick={handleLogout} style={s.logoutBtn} className="admin-logout-btn">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
            <div style={s.adminAvatar}>{user?.name?.[0] || "A"}</div>
          </div>
        </header>

        <div style={s.content} className="admin-content">
          <Suspense fallback={<div style={s.loading}><i className="fa-solid fa-circle-notch fa-spin"></i> Loading Page...</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/academic-years" element={<AcademicYears />} />
              <Route path="/student-logins" element={<StudentLogins />} />
              <Route path="/students" element={<Students />} />
              <Route path="/teachers" element={<Teachers />} />
              <Route path="/subjects" element={<Subjects />} />
              <Route path="/subjects/:classId" element={<ClassManagement />} />
              <Route path="/exams" element={<Exams />} />
              <Route path="/marks-overview" element={<MarksOverview />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/holidays" element={<Holidays />} />
              <Route path="/fee-structure" element={<FeeStructure />} />
              <Route path="/fees" element={<Fees />} />
              <Route path="/pending-upi-verifications" element={<PendingUpiVerifications />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/student-notices" element={<StudentNotices />} />
              <Route path="/homework" element={<Homework />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="*" element={<div style={s.loading}>Page Under Construction</div>} />
            </Routes>
          </Suspense>
        </div>
        <AppFooter />
      </main>
    </div>
  );
}

const s = {
  layout: { display: "flex", minHeight: "100vh", background: "var(--light-bg)" },
  mobileTopbar: { display: "none" },
  mobileBrand: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  mobileMenuBtn: { width: "44px", height: "44px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  mobileLogo: { width: "42px", height: "42px", objectFit: "contain", flex: "0 0 auto" },
  mobileSchoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "1rem", lineHeight: 1.1, margin: 0 },
  mobileUserLine: { color: "var(--gold-light)", fontSize: "0.72rem", fontWeight: "800", margin: "3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "240px" },
  mobileLogout: { width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  sidebar: {
    width: "240px",
    background: "linear-gradient(180deg, #051a1a 0%, #094f4f 100%)",
    borderRight: "1px solid rgba(200,150,12,0.2)",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 100
  },
  logoArea: { padding: "24px 20px", display: "flex", alignItems: "center", gap: "12px" },
  logoImg: { width: "45px", height: "45px", objectFit: "contain" },
  schoolName: { color: "var(--white)", fontSize: "1rem", margin: 0, fontFamily: "var(--font-heading)" },
  tagline: { color: "var(--gold-light)", fontSize: "0.65rem", margin: 0, textTransform: "uppercase" },
  nav: { flex: 1, padding: "0 16px", overflowY: "auto" },
  navGroup: { marginBottom: "24px" },
  groupLabel: { color: "var(--gold)", fontSize: "0.65rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", paddingLeft: "12px", opacity: 0.7 },
  groupToggle: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--gold)" },
  navItem: { display: "flex", alignItems: "center", padding: "12px", borderRadius: "10px", color: "rgba(255,255,255,0.7)", fontSize: "0.9rem", fontWeight: "600", transition: "var(--transition)", marginBottom: "4px" },
  activeNavItem: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "var(--white)", borderLeft: "3px solid var(--gold)" },
  navIcon: { width: "24px", fontSize: "1rem" },
  sidebarBottom: { padding: "20px", borderTop: "1px solid rgba(255,255,255,0.05)" },
  logoutBtn: { width: "100%", padding: "12px", background: "transparent", border: "none", color: "var(--white)", opacity: 0.7, cursor: "pointer", textAlign: "left", fontWeight: "600" },

  main: { flex: 1, marginLeft: "240px", display: "flex", flexDirection: "column", minWidth: 0 },
  header: { height: "72px", background: "var(--white)", borderBottom: "3px solid var(--gold)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 32px", position: "sticky", top: 0, zIndex: 90 },
  headerBrand: { display: "flex", alignItems: "center", gap: "16px" },
  headerLogo: { width: "42px", height: "42px", objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" },
  headerLeft: { display: "flex", flexDirection: "column" },
  pageTitle: { margin: 0, fontSize: "1.25rem", color: "var(--navy)", fontFamily: "var(--font-heading)" },
  breadcrumb: { fontSize: "0.75rem", color: "var(--text-muted)" },
  headerRight: { display: "flex", alignItems: "center", gap: "16px" },
  badge: { background: "var(--gold-pale)", color: "var(--navy-dark)", padding: "4px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "800" },
  logoutBtn: { display: "none", background: "none", border: "none", fontSize: "1.2rem", color: "var(--navy)", cursor: "pointer" },
  adminAvatar: { width: "40px", height: "40px", borderRadius: "50%", background: "var(--gold)", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800" },
  content: { padding: "32px", flex: 1 },
  loading: { padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "1.1rem" }
};
