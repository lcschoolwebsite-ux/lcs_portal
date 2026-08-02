const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'index.css');
const adminLayoutPath = path.join(__dirname, 'src', 'layouts', 'AdminLayout.jsx');
const adminDashboardPath = path.join(__dirname, 'src', 'pages', 'admin', 'Dashboard.jsx');

// 1. Update index.css (only after line 1668)
let cssContent = fs.readFileSync(cssPath, 'utf8');
const lines = cssContent.split('\n');
for (let i = 1668; i < lines.length; i++) {
  lines[i] = lines[i].replace(/\.admin-/g, '.portal-').replace(/adminAvatarRing/g, 'portalAvatarRing').replace(/adminStatIn/g, 'portalStatIn');
}
fs.writeFileSync(cssPath, lines.join('\n'));

// 2. Update AdminLayout.jsx
let adminLayout = fs.readFileSync(adminLayoutPath, 'utf8');
adminLayout = adminLayout.replace(/admin-nav-link/g, 'portal-nav-link')
  .replace(/admin-nav-icon/g, 'portal-nav-icon')
  .replace(/admin-group-btn/g, 'portal-group-btn')
  .replace(/admin-group-label/g, 'portal-group-label')
  .replace(/admin-group-chevron/g, 'portal-group-chevron')
  .replace(/admin-group-items/g, 'portal-group-items')
  .replace(/admin-sidebar-profile/g, 'portal-sidebar-profile')
  .replace(/admin-sidebar-avatar/g, 'portal-sidebar-avatar')
  .replace(/admin-sidebar-info/g, 'portal-sidebar-info')
  .replace(/admin-sidebar-name/g, 'portal-sidebar-name')
  .replace(/admin-sidebar-role/g, 'portal-sidebar-role')
  .replace(/admin-sidebar-logout-btn/g, 'portal-sidebar-logout-btn')
  .replace(/admin-sidebar-divider/g, 'portal-sidebar-divider')
  .replace(/admin-header-glass/g, 'portal-header-glass')
  .replace(/admin-page-title-accent/g, 'portal-page-title-accent')
  .replace(/admin-ay-badge/g, 'portal-ay-badge')
  .replace(/admin-header-avatar-wrap/g, 'portal-header-avatar-wrap')
  .replace(/admin-avatar-ring/g, 'portal-avatar-ring');
fs.writeFileSync(adminLayoutPath, adminLayout);

// 3. Update admin Dashboard.jsx
let adminDashboard = fs.readFileSync(adminDashboardPath, 'utf8');
adminDashboard = adminDashboard.replace(/admin-dashboard-page/g, 'portal-dashboard-page')
  .replace(/admin-hero-banner/g, 'portal-hero-banner')
  .replace(/admin-hero-orb-1/g, 'portal-hero-orb-1')
  .replace(/admin-hero-orb-2/g, 'portal-hero-orb-2')
  .replace(/admin-hero-actions/g, 'portal-hero-actions')
  .replace(/admin-stat-in/g, 'portal-stat-in')
  .replace(/admin-dashboard-grid/g, 'portal-dashboard-grid')
  .replace(/admin-dashboard-split/g, 'portal-dashboard-split')
  .replace(/admin-activity-timeline/g, 'portal-activity-timeline')
  .replace(/admin-activity-item/g, 'portal-activity-item')
  .replace(/admin-activity-dot/g, 'portal-activity-dot')
  .replace(/admin-activity-icon/g, 'portal-activity-icon')
  .replace(/admin-exam-card-accent/g, 'portal-exam-card-accent');
fs.writeFileSync(adminDashboardPath, adminDashboard);

console.log("Renaming complete.");
