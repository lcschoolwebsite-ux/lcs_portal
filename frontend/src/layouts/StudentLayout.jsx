import { lazy, Suspense, useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import useActiveAcademicYear from "../hooks/useActiveAcademicYear";
import { isNativeAndroidApp } from "../services/nativeBridge";
import AppFooter from "../components/AppFooter";
import InstallAppButton from "../components/InstallAppButton";
import MobileBottomBar from "../components/MobileBottomBar";
import MobileMenuDrawer from "../components/MobileMenuDrawer";

// Lazy pages
const Dashboard = lazy(() => import("../pages/student/Dashboard"));
const Profile = lazy(() => import("../pages/student/Profile"));
const Attendance = lazy(() => import("../pages/student/Attendance"));
const Marks = lazy(() => import("../pages/student/Marks"));
const Fees = lazy(() => import("../pages/student/Fees"));
const Announcements = lazy(() => import("../pages/student/Announcements"));
const Homework = lazy(() => import("../pages/student/Homework"));

const MENU_GROUPS = [
  {
    label: "HOME",
    items: [
      { label: "Dashboard", shortLabel: "Home", path: "/student", icon: "fa-solid fa-house" },
      { label: "My Profile", shortLabel: "Profile", path: "/student/profile", icon: "fa-solid fa-id-card" },
      { label: "Announcements", shortLabel: "Notices", path: "/student/announcements", icon: "fa-solid fa-bullhorn" },
      { label: "Homework", shortLabel: "Homework", path: "/student/homework", icon: "fa-solid fa-book-open" },
    ]
  },
  {
    label: "ACADEMICS",
    items: [
      { label: "Attendance", shortLabel: "Attendance", path: "/student/attendance", icon: "fa-solid fa-calendar-check" },
      { label: "Marks & Reports", shortLabel: "Marks", path: "/student/marks", icon: "fa-solid fa-ranking-star" },
    ]
  },
  {
    label: "FINANCE",
    items: [
      { label: "Fee Management", shortLabel: "Fees", path: "/student/fees", icon: "fa-solid fa-wallet" },
    ]
  }
];

const SIDEBAR_WIDTH = "260px";

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems = MENU_GROUPS.flatMap(group => group.items);
  const classLabel = [user?.class?.name, user?.class?.section].filter(Boolean).join("");
  const { academicYearLabel } = useActiveAcademicYear(user?.academicYear?.year);

  const handleLogout = () => {
    logout();
    navigate("/student-login", { replace: true });
  };

  const currentPathLabel = menuItems.find(i => i.path === location.pathname)?.label || "Dashboard";
  const bottomBarItems = [
    { label: "Dashboard", shortLabel: "Home", path: "/student", icon: "fa-solid fa-house" },
    { label: "Notices", shortLabel: "Notices", path: "/student/announcements", icon: "fa-solid fa-bullhorn" },
    { label: "Homework", shortLabel: "HW", path: "/student/homework", icon: "fa-solid fa-book-open" },
    { label: "Attendance", shortLabel: "Attend", path: "/student/attendance", icon: "fa-solid fa-calendar-check" },
    { label: "Marks", shortLabel: "Marks", path: "/student/marks", icon: "fa-solid fa-ranking-star" },
    { label: "Fees", shortLabel: "Fees", path: "/student/fees", icon: "fa-solid fa-wallet" },
  ];

  return (
    <div style={s.container} className="student-shell">
      <MobileMenuDrawer
        open={menuOpen}
        title="LCS Portal"
        subtitle={user?.name || "Student Portal"}
        items={menuItems}
        currentPath={location.pathname}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
        logoutLabel="Logout"
      />

      <div style={s.mobileTopbar} className="student-mobile-topbar">
        <div style={s.mobileBrand} className="student-mobile-brand">
          <img src="/logo.png" alt="LCS Portal" style={s.mobileLogo} className="student-mobile-logo" />
          <div style={s.mobileBrandCopy} className="student-mobile-brand-copy">
            <h2 style={s.mobileSchoolName}>LCS Portal</h2>
            <p style={s.mobileUserLine}>{user?.name || "Student Portal"}</p>
          </div>
        </div>

        <div style={s.mobileActions} className="student-mobile-actions">
          <div style={s.mobileYearPill} className="student-mobile-year-pill">AY {academicYearLabel}</div>
          <button onClick={handleLogout} style={s.mobileLogout} className="student-mobile-logout" aria-label="Logout">
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
          </button>
        </div>
      </div>

      <MobileBottomBar
        className="mobile-bottom-bar"
        items={bottomBarItems}
        currentPath={location.pathname}
        onMenuClick={() => setMenuOpen(true)}
        forceVisible={isNativeAndroidApp()}
      />

      {/* Sidebar */}
      <aside style={s.sidebar} className="student-sidebar">
        <div style={s.logoArea}>
          <div style={s.logoIconWrap}>
            <img src="/logo.png" alt="Logo" style={s.logoImg} />
          </div>
          <div>
            <h1 style={s.schoolName}>LCS Portal</h1>
            <p style={s.tagline}>love through service</p>
          </div>
        </div>

        <div className="portal-sidebar-divider" style={{ margin: '0 16px 12px' }} />

        <nav style={s.nav} className="student-nav">
          {MENU_GROUPS.map((group, gIdx) => (
            <div key={gIdx} style={s.navGroup}>
              <div style={s.groupLabel}>{group.label}</div>
              {group.items.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`portal-nav-link ${isActive ? "active" : ""}`}
                  >
                    <i className={`${item.icon} portal-nav-icon`} aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={s.sidebarBottom}>
          <div className="portal-sidebar-profile">
            <div className="portal-sidebar-avatar">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt={user?.name || "Student"} style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
              ) : (
                user?.name?.[0] || 'S'
              )}
            </div>
            <div className="portal-sidebar-info">
              <div className="portal-sidebar-name">{user?.name || "Student"}</div>
              <div className="portal-sidebar-role">{classLabel ? `Class ${classLabel}` : "STUDENT PORTAL"}</div>
            </div>
            <button className="portal-sidebar-logout-btn" onClick={handleLogout} title="Logout">
              <i className="fa-solid fa-power-off" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={s.main} className="student-main">

        {/* Top Header */}
        <header style={s.header} className="student-header portal-header-glass">
          <div style={s.headerBrand}>
            <img src="/logo.png" alt="LCS Portal" style={s.headerLogo} />
            <div>
              <h2 style={s.pageTitle}>
                <span className="portal-page-title-accent">{currentPathLabel}</span>
              </h2>
              <div style={s.breadcrumb} className="student-breadcrumb">Loretto Central School</div>
            </div>
          </div>
          
          <div style={s.headerRight} className="student-header-right">
            <InstallAppButton />
            <button style={s.bellBtn}>
              <i className="fa-regular fa-bell"></i>
            </button>
            <div className="portal-ay-badge">AY {academicYearLabel}</div>
            
            <button onClick={handleLogout} style={s.logoutBtn} className="student-logout-btn">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
            
            <div className="portal-header-avatar-wrap" onClick={() => navigate("/student/profile")}>
              <div className="portal-avatar-ring"></div>
              <div style={s.headerAvatar}>
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
                ) : (
                  user?.name?.[0] || 'S'
                )}
              </div>
            </div>
          </div>
        </header>

        <section style={s.content} className="student-content">
          <Suspense fallback={<div style={s.loading}><i className="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/marks" element={<Marks />} />
              <Route path="/marks/:examType" element={<Marks />} />
              <Route path="/fees" element={<Fees />} />
              <Route path="/announcements" element={<Announcements />} />
              <Route path="/homework" element={<Homework />} />
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
  sidebar: {
    width: SIDEBAR_WIDTH,
    background: "linear-gradient(180deg, #051a1a 0%, #0a3b3b 50%, #083434 100%)",
    borderRight: "1px solid rgba(200,150,12,0.2)",
    display: "flex",
    flexDirection: "column",
    position: "fixed",
    top: 0,
    bottom: 0,
    zIndex: 100,
    boxShadow: "1px 0 20px rgba(0,0,0,0.1)",
  },
  logoArea: { display: "flex", alignItems: "center", gap: "12px", padding: "20px 16px 14px" },
  logoIconWrap: {
    width: "42px",
    height: "42px",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(200,150,12,0.3)",
    boxShadow: "inset 0 0 10px rgba(255,255,255,0.05)",
  },
  logoImg: { width: "26px", height: "26px", objectFit: "contain" },
  schoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "1.1rem", margin: 0, lineHeight: 1.2 },
  tagline: { color: "var(--gold-light)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "4px 0 0 0" },
  
  nav: { flex: 1, overflowY: "auto", padding: "0 12px" },
  navGroup: { marginBottom: "14px" },
  groupLabel: { color: "var(--gold)", fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.7, marginBottom: "8px", paddingLeft: "14px", fontWeight: "700" },
  
  sidebarBottom: { padding: "16px" },

  /* Header Styles */
  main: { flex: 1, marginLeft: SIDEBAR_WIDTH, display: "flex", flexDirection: "column", minWidth: 0 },
  mobileTopbar: { display: "none" },
  mobileBrand: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  mobileBrandCopy: { minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" },
  mobileLogo: { width: "42px", height: "42px", objectFit: "contain", flex: "0 0 auto" },
  mobileSchoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "0.92rem", lineHeight: 1.1, margin: 0 },
  mobileUserLine: { color: "var(--gold-light)", fontSize: "0.66rem", fontWeight: "800", margin: 0, whiteSpace: "normal", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" },
  mobileActions: { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" },
  mobileYearPill: { background: "rgba(200,150,12,0.16)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.28)", borderRadius: "999px", padding: "6px 10px", fontSize: "0.68rem", fontWeight: "800", whiteSpace: "nowrap" },
  mobileLogout: { width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  header: { height: "60px", padding: "0 28px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 90 },
  headerBrand: { display: "flex", alignItems: "center", gap: "12px" },
  headerLogo: { width: "34px", height: "34px", objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))", borderRadius: "10px" },
  pageTitle: { fontFamily: "var(--font-heading)", color: "var(--navy-dark)", fontSize: "1.2rem", margin: 0, fontWeight: "800" },
  breadcrumb: { color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "4px", fontWeight: 600, letterSpacing: "0.02em" },
  
  headerRight: { display: "flex", alignItems: "center", gap: "16px" },
  bellBtn: { background: "none", border: "none", fontSize: "1.1rem", color: "var(--navy)", position: "relative", cursor: "pointer", transition: "color 0.2s" },
  logoutBtn: { display: "none", background: "none", border: "none", fontSize: "1.05rem", color: "var(--navy)", cursor: "pointer" },
  headerAvatar: { width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", cursor: "pointer", fontSize: "0.85rem", boxShadow: "0 2px 8px rgba(200,150,12,0.3)" },

  content: { padding: "32px 36px", flex: 1, minWidth: 0 },
  loading: { padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "1.2rem" }
};
