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
    title: "System Settings",
    items: [
      { label: "Dashboard", path: "/admin", icon: "fa-solid fa-gauge-high" },
      { label: "Analytics", path: "/admin/analytics", icon: "fa-solid fa-chart-simple" },
      { label: "Academic Years", path: "/admin/academic-years", icon: "fa-solid fa-calendar-days" },
      { label: "Student Logins", path: "/admin/student-logins", icon: "fa-solid fa-right-to-bracket" },
    ],
  },
  {
    title: "Attendance",
    items: [
      { label: "Attendance", path: "/admin/attendance", icon: "fa-solid fa-calendar-check" },
      { label: "Holidays", path: "/admin/holidays", icon: "fa-solid fa-umbrella-beach" },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Classes", path: "/admin/classes", icon: "fa-solid fa-chalkboard" },
      { label: "Subjects", path: "/admin/subjects", icon: "fa-solid fa-book" },
      { label: "Homework", path: "/admin/homework", icon: "fa-solid fa-book-open" },
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
    ],
  },
  {
    title: "Notices",
    items: [
      { label: "Announcements", path: "/admin/announcements", icon: "fa-solid fa-bullhorn" },
      { label: "Student Notices", path: "/admin/student-notices", icon: "fa-solid fa-paper-plane" },
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

// Helper: check if group has an active route
function isGroupActive(group, pathname) {
  return group.items.some(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { academicYearLabel } = useActiveAcademicYear();
  const [menuOpen, setMenuOpen] = useState(false);

  // Collapse state per group — open if a child route is active
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    menuGroups.forEach((g) => {
      initial[g.title] = isGroupActive(g, location.pathname);
    });
    return initial;
  });

  const toggleGroup = (title) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const currentPathLabel =
    menuGroups
      .flatMap((g) => g.items)
      .find(
        (i) =>
          location.pathname === i.path ||
          location.pathname.startsWith(`${i.path}/`)
      )?.label || "Dashboard";

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
        items={menuGroups.flatMap((group) => group.items)}
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

      {/* ── SIDEBAR ── */}
      <aside style={s.sidebar} className="admin-sidebar">
        {/* Logo area */}
        <div style={s.logoArea}>
          <div style={s.logoImgWrap}>
            <img src="/logo.png" alt="LCS Logo" style={s.logoImg} />
          </div>
          <div>
            <h1 style={s.schoolName}>LCS Portal</h1>
            <p style={s.tagline}>System Management</p>
          </div>
        </div>

        <div style={s.sidebarDividerTop} />

        {/* Nav */}
        <nav style={s.nav}>
          {menuGroups.map((group) => {
            const isExpanded = openGroups[group.title] || isGroupActive(group, location.pathname);
            // Approximate max-height based on item count for smooth CSS transition
            const maxHeight = isExpanded ? `${group.items.length * 52 + 8}px` : "0px";

            return (
              <div key={group.title} style={s.navGroup}>
                {/* Group toggle */}
                <button
                  type="button"
                  className="portal-group-btn"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={isExpanded}
                  aria-controls={`admin-group-${group.title}`}
                >
                  <span className="portal-group-label">{group.title}</span>
                  <i
                    className={`fa-solid fa-chevron-down portal-group-chevron${isExpanded ? " open" : ""}`}
                    aria-hidden="true"
                  />
                </button>

                {/* Group items — animated slide */}
                <div
                  id={`admin-group-${group.title}`}
                  className={`portal-group-items${isExpanded ? " expanded" : ""}`}
                  style={{ maxHeight }}
                >
                  {group.items.map((item) => {
                    const isActive =
                      location.pathname === item.path ||
                      (item.path !== "/admin" && location.pathname.startsWith(`${item.path}/`));
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`portal-nav-link${isActive ? " active" : ""}`}
                      >
                        <i className={`${item.icon} portal-nav-icon`} aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom profile card */}
        <div style={s.sidebarBottom}>
          <div className="portal-sidebar-divider" />
          <div className="portal-sidebar-profile">
            <div className="portal-sidebar-avatar">
              {user?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="portal-sidebar-info">
              <div className="portal-sidebar-name">{user?.name || "Administrator"}</div>
              <div className="portal-sidebar-role">Admin</div>
            </div>
            <button
              className="portal-sidebar-logout-btn"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={s.main} className="admin-main">
        {/* Header */}
        <header style={s.header} className="admin-header portal-header-glass">
          <div style={s.headerBrand}>
            <img src="/logo.png" alt="LCS Portal" style={s.headerLogo} />
            <div style={s.headerLeft}>
              <h2 style={s.pageTitle} className="portal-page-title-accent">
                {currentPathLabel}
              </h2>
              <div style={s.breadcrumb}>
                <i className="fa-solid fa-school" style={{ marginRight: "5px", opacity: 0.6 }} aria-hidden="true" />
                Loretto Central School
              </div>
            </div>
          </div>

          <div style={s.headerRight} className="admin-header-right">
            <span className="portal-ay-badge">
              <i className="fa-solid fa-calendar-check" style={{ marginRight: "6px" }} aria-hidden="true" />
              AY {academicYearLabel}
            </span>

            <button
              onClick={handleLogout}
              style={s.logoutIconBtn}
              className="admin-logout-btn"
              title="Logout"
              aria-label="Logout"
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            </button>

            <div className="portal-header-avatar-wrap">
              <div style={s.adminAvatar}>
                {user?.name?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="portal-avatar-ring" />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={s.content} className="admin-content">
          <Suspense
            fallback={
              <div style={s.loading}>
                <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: "10px" }} />
                Loading Page…
              </div>
            }
          >
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
  layout: {
    display: "flex",
    minHeight: "100vh",
    background: "var(--light-bg)",
  },
  mobileTopbar: { display: "none" },

  /* ── SIDEBAR ── */
  sidebar: {
    width: "260px",
    background: "linear-gradient(175deg, #051a1a 0%, #0a3b3b 55%, #083434 100%)",
    borderRight: "1px solid rgba(200,150,12,0.15)",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    zIndex: 100,
    boxShadow: "4px 0 30px rgba(0,0,0,0.25)",
  },
  logoArea: {
    padding: "22px 20px 18px",
    display: "flex",
    alignItems: "center",
    gap: "13px",
  },
  logoImgWrap: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(200,150,12,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px",
    flexShrink: 0,
    boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
  },
  logoImg: {
    width: "36px",
    height: "36px",
    objectFit: "contain",
  },
  schoolName: {
    color: "#fff",
    fontSize: "1rem",
    margin: 0,
    fontFamily: "var(--font-heading)",
    letterSpacing: "0.01em",
    fontWeight: 700,
  },
  tagline: {
    color: "rgba(200,150,12,0.7)",
    fontSize: "0.64rem",
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 700,
    marginTop: "2px",
  },
  sidebarDividerTop: {
    height: "1px",
    background: "linear-gradient(90deg, transparent, rgba(200,150,12,0.2), transparent)",
    margin: "0 16px 10px",
  },
  nav: {
    flex: 1,
    padding: "0 12px",
    overflowY: "auto",
    overflowX: "hidden",
  },
  navGroup: {
    marginBottom: "6px",
  },
  sidebarBottom: {
    padding: "12px 12px 16px",
  },

  /* ── HEADER ── */
  main: {
    flex: 1,
    marginLeft: "260px",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  header: {
    height: "68px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 28px",
    position: "sticky",
    top: 0,
    zIndex: 90,
  },
  headerBrand: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  headerLogo: {
    width: "40px",
    height: "40px",
    objectFit: "contain",
    filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.12))",
    borderRadius: "10px",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  },
  pageTitle: {
    margin: 0,
    fontSize: "1.15rem",
    color: "var(--navy-dark)",
    fontFamily: "var(--font-heading)",
    fontWeight: 700,
  },
  breadcrumb: {
    fontSize: "0.72rem",
    color: "var(--text-muted)",
    fontWeight: 600,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  logoutIconBtn: {
    display: "none",
    background: "rgba(14,107,107,0.08)",
    border: "1px solid rgba(14,107,107,0.15)",
    borderRadius: "10px",
    width: "38px",
    height: "38px",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1rem",
    color: "var(--navy)",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  adminAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, var(--gold), var(--gold-light))",
    color: "var(--navy-dark)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "800",
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: "0 2px 12px rgba(200,150,12,0.3)",
  },

  /* ── CONTENT ── */
  content: {
    padding: "28px 28px 16px",
    flex: 1,
  },
  loading: {
    padding: "56px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "1.05rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
