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

      {/* Sidebar */}
      <aside style={s.sidebar} className="student-sidebar">
        <div style={s.logoArea}>
          <img src="/logo.png" alt="Logo" style={s.logoImg} />
          <div>
            <h1 style={s.schoolName}>LCS Portal</h1>
            <p style={s.tagline}>love through service</p>
          </div>
        </div>

        <div style={s.userInfoCard}>
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user?.name || "Student"} style={s.avatarImg} />
          ) : (
            <div style={s.avatar}>{user?.name?.[0] || 'S'}</div>
          )}
          <div>
            <div style={s.userName}>{user?.name || 'Student'}</div>
            <div style={s.userRole}>{classLabel ? `Class ${classLabel}` : "LCS Portal"}</div>
          </div>
        </div>

        <nav style={s.nav} className="student-nav">
          {MENU_GROUPS.map((group, gIdx) => (
            <div key={gIdx} style={s.navGroup}>
              <div style={s.groupLabel}>{group.label}</div>
              {group.items.map(item => {
                const isActive = location.pathname === item.path;
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
      <main style={s.main} className="student-main">
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

        {/* Top Header */}
        <header style={s.header} className="student-header">
          <div style={s.headerBrand}>
            <img src="/logo.png" alt="LCS Portal" style={s.headerLogo} />
            <div>
              <h2 style={s.pageTitle}>{currentPathLabel}</h2>
              <div style={s.breadcrumb} className="student-breadcrumb">Loretto Central School</div>
            </div>
          </div>
          
          <div style={s.headerRight} className="student-header-right">
            <InstallAppButton />
            <button style={s.bellBtn}>
              <i className="fa-regular fa-bell"></i>
            </button>
            <div style={s.headerYearPill}>{academicYearLabel}</div>
            <button onClick={handleLogout} style={s.logoutBtn} className="student-logout-btn">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
            <div style={s.headerAvatar}>{user?.name?.[0] || 'S'}</div>
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
  sidebar: { width: "240px", background: "linear-gradient(180deg, #051a1a 0%, #094f4f 100%)", borderRight: "1px solid rgba(200,150,12,0.2)", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, zIndex: 100 },
  logoArea: { display: "flex", alignItems: "center", gap: "12px", padding: "20px" },
  logoImg: { width: "50px", height: "50px", objectFit: "contain" },
  schoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "1.1rem", margin: 0, lineHeight: 1.2 },
  tagline: { color: "var(--gold-light)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "4px 0 0 0" },
  
  userInfoCard: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(200,150,12,0.2)", borderRadius: "12px", padding: "12px", margin: "0 20px 20px 20px", display: "flex", alignItems: "center", gap: "12px" },
  avatar: { width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "1.1rem" },
  avatarImg: { width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold-light)", flex: "0 0 auto" },
  userName: { color: "var(--white)", fontSize: "0.85rem", fontFamily: "var(--font-body)", fontWeight: "700" },
  userRole: { color: "var(--gold-pale)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "2px", fontWeight: "600" },
  
  nav: { flex: 1, overflowY: "auto", padding: "0 16px" },
  navGroup: { marginBottom: "20px" },
  groupLabel: { color: "var(--gold)", fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.7, marginBottom: "8px", paddingLeft: "12px", fontWeight: "700" },
  navItem: { display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: "10px", color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: "0.88rem", fontWeight: "600", transition: "var(--transition)", marginBottom: "4px" },
  activeNav: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "var(--white)", boxShadow: "0 4px 14px rgba(14,107,107,0.4)", borderLeft: "3px solid var(--gold-light)" },
  icon: { width: "20px", textAlign: "center", marginRight: "10px", fontSize: "1rem" },
  
  sidebarBottom: { padding: "20px", borderTop: "1px solid rgba(255,255,255,0.05)" },
  yearBadge: { border: "1px solid var(--gold)", color: "var(--gold)", borderRadius: "20px", padding: "4px 12px", fontSize: "0.7rem", fontWeight: "700", textAlign: "center", marginBottom: "16px", background: "rgba(200,150,12,0.1)" },
  logoutBtn: { width: "100%", padding: "10px", background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.6)", borderRadius: "8px", fontWeight: "600", cursor: "pointer", transition: "var(--transition)", fontSize: "0.85rem" },

  /* Header Styles */
  main: { flex: 1, marginLeft: "240px", display: "flex", flexDirection: "column", minWidth: 0 },
  mobileTopbar: { display: "none" },
  mobileBrand: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  mobileBrandCopy: { minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" },
  mobileLogo: { width: "42px", height: "42px", objectFit: "contain", flex: "0 0 auto" },
  mobileSchoolName: { fontFamily: "var(--font-heading)", color: "var(--white)", fontSize: "0.92rem", lineHeight: 1.1, margin: 0 },
  mobileUserLine: { color: "var(--gold-light)", fontSize: "0.66rem", fontWeight: "800", margin: 0, whiteSpace: "normal", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" },
  mobileActions: { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" },
  mobileYearPill: { background: "rgba(200,150,12,0.16)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.28)", borderRadius: "999px", padding: "6px 10px", fontSize: "0.68rem", fontWeight: "800", whiteSpace: "nowrap" },
  mobileLogout: { width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: "var(--gold-light)", border: "1px solid rgba(200,150,12,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" },
  header: { height: "64px", background: "var(--white)", borderBottom: "3px solid var(--gold)", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 90 },
  headerBrand: { display: "flex", alignItems: "center", gap: "16px" },
  headerLogo: { width: "42px", height: "42px", objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" },
  pageTitle: { fontFamily: "var(--font-heading)", color: "var(--navy)", fontSize: "1.3rem", margin: 0, fontWeight: "700" },
  breadcrumb: { color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "2px" },
  
  headerRight: { display: "flex", alignItems: "center", gap: "20px" },
  bellBtn: { background: "none", border: "none", fontSize: "1.2rem", color: "var(--navy)", position: "relative", cursor: "pointer" },
  logoutBtn: { display: "none", background: "none", border: "none", fontSize: "1.2rem", color: "var(--navy)", cursor: "pointer" },
  headerYearPill: { background: "var(--navy)", color: "var(--gold)", padding: "4px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "800" },
  headerAvatar: { width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", cursor: "pointer", fontSize: "0.9rem" },

  content: { padding: "32px", flex: 1, minWidth: 0 },
  loading: { padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "1.2rem" }
};
