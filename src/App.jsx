import CompanyWidget from './components/CompanyWidget'
import CustomerDashboard from './components/CustomerDashboard'
import PartnerDashboardDB from './components/PartnerDashboardDB'
import AdminHub from './components/AdminHub'
import AdminHome from './components/AdminHome'
import UserManagement from './components/UserManagement'
import AccountOwnerReport from './components/AccountOwnerReport'
import DataManagement from './components/DataManagement'
import SyncDashboard from './components/SyncDashboard'
import DatabaseReports from './components/DatabaseReports'
import AdminUsers from './components/AdminUsers'
import Settings from './components/Settings'
import AnalyticsDashboard from './components/AnalyticsDashboard'
import PamManagement from './components/PamManagement'
import GroupManagement from './components/GroupManagement'
import CertificationCategories from './components/CertificationCategories'
import LeadReports from './components/LeadReports'
import ResetPassword from './components/ResetPassword'
import MagicLogin from './components/MagicLogin'
import EmailSchedules from './components/EmailSchedules'
import { extractUrlParams } from './utils/urlEncoder'
import { extractCustomerParams } from './utils/customerUrlEncoder'
import './App.css'

function App() {
  // Check route types
  const currentPath = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const useDatabase = searchParams.get('source') === 'db';
  
  const isAdminRoute = currentPath.startsWith('/admin');
  const isUserManagementRoute = currentPath === '/admin/users' || currentPath === '/admin/users/';
  const isAdminUsersRoute = currentPath === '/admin/admin-users' || currentPath === '/admin/admin-users/';
  const isAccountOwnerRoute = currentPath === '/admin/owners' || currentPath === '/admin/owners/';
  const isDataRoute = currentPath === '/admin/data' || currentPath === '/admin/data/';
  const isSyncDashboardRoute = currentPath === '/admin/sync-dashboard' || currentPath === '/admin/sync-dashboard/' || currentPath === '/admin/sync' || currentPath === '/admin/sync/';
  const isDbReportsRoute = currentPath === '/admin/dbreports' || currentPath === '/admin/dbreports/';
  const isSettingsRoute = currentPath === '/admin/settings' || currentPath === '/admin/settings/';
  const isAnalyticsRoute = currentPath === '/admin/analytics' || currentPath === '/admin/analytics/';
  const isPamRoute = currentPath === '/admin/pam' || currentPath === '/admin/pam/';
  const isGroupsRoute = currentPath === '/admin/groups' || currentPath === '/admin/groups/';
  const isCertificationsRoute = currentPath === '/admin/certifications' || currentPath === '/admin/certifications/';
  const isLeadReportsRoute = currentPath === '/admin/leads' || currentPath === '/admin/leads/';
  const isResetPasswordRoute = currentPath === '/admin/reset-password' || currentPath === '/admin/reset-password/';
  const isMagicLoginRoute = currentPath === '/admin/magic-login' || currentPath === '/admin/magic-login/';
  const isEmailSchedulesRoute = currentPath === '/admin/emails' || currentPath === '/admin/emails/' || currentPath === '/admin/email-schedules' || currentPath === '/admin/email-schedules/';
  const isAdminHomeRoute = currentPath === '/admin' || currentPath === '/admin/';
  const isCustomerRoute = currentPath === '/customer' || currentPath === '/customer/';
  const isPartnerDbRoute = currentPath === '/partner' || currentPath === '/partner/';
  
  // Extract parameters based on route type
  let routeParams = {};
  
  if (isCustomerRoute) {
    // Extract customer parameters (company/companyId only)
    const customerParams = extractCustomerParams();
    routeParams = {
      type: 'customer',
      company: customerParams.company,
      companyId: customerParams.companyId,
      isEncoded: customerParams.isEncoded
    };
  } else {
    // Extract partner parameters (company + tier)
    const partnerParams = extractUrlParams();
    routeParams = {
      type: 'partner',
      groupName: partnerParams.groupName,
      tier: partnerParams.tier,
      isEncoded: partnerParams.isEncoded
    };
  }
  
  // Log parameter extraction for debugging (in development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('Route Info:', { 
      currentPath, 
      isAdminRoute,
      isUserManagementRoute,
      isAccountOwnerRoute,
      isDataRoute,
      isSyncDashboardRoute,
      isDbReportsRoute,
      isCustomerRoute,
      isPartnerDbRoute,
      useDatabase,
      routeParams 
    });
  }

  // Show data management for /admin/data route
  if (isDataRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="data">
          <DataManagement />
        </AdminHub>
      </div>
    );
  }

  // Show reset password page (no auth required)
  if (isResetPasswordRoute) {
    return (
      <div className="app">
        <ResetPassword />
      </div>
    );
  }

  // Show magic login page (no auth required)
  if (isMagicLoginRoute) {
    return (
      <div className="app">
        <MagicLogin />
      </div>
    );
  }

  // Show admin users for /admin/admin-users route
  if (isAdminUsersRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="admin-users">
          <AdminUsers />
        </AdminHub>
      </div>
    );
  }

  // Show sync dashboard for /admin/sync or /admin/sync-dashboard route
  if (isSyncDashboardRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="sync-dashboard">
          <SyncDashboard />
        </AdminHub>
      </div>
    );
  }

  // Show analytics dashboard for /admin/analytics route
  if (isAnalyticsRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="analytics">
          <AnalyticsDashboard />
        </AdminHub>
      </div>
    );
  }

  // Show PAM management for /admin/pam route
  if (isPamRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="pam">
          <PamManagement />
        </AdminHub>
      </div>
    );
  }

  // Show group management for /admin/groups route
  if (isGroupsRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="groups">
          <GroupManagement />
        </AdminHub>
      </div>
    );
  }

  // Show certification categories for /admin/certifications route
  if (isCertificationsRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="certifications">
          <CertificationCategories />
        </AdminHub>
      </div>
    );
  }

  // Show lead reports for /admin/leads route
  if (isLeadReportsRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="leads">
          <LeadReports />
        </AdminHub>
      </div>
    );
  }

  // Show email schedules for /admin/emails route
  if (isEmailSchedulesRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="emails">
          <EmailSchedules />
        </AdminHub>
      </div>
    );
  }

  // Show database reports for /admin/dbreports route
  if (isDbReportsRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="dbreports">
          <DatabaseReports />
        </AdminHub>
      </div>
    );
  }

  // Show settings for /admin/settings route
  if (isSettingsRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="settings">
          <Settings />
        </AdminHub>
      </div>
    );
  }

  // Show user management for /admin/users route
  if (isUserManagementRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="users">
          <UserManagement />
        </AdminHub>
      </div>
    );
  }

  // Show account owner report for /admin/owners route
  if (isAccountOwnerRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="owners">
          <AccountOwnerReport />
        </AdminHub>
      </div>
    );
  }

  // Show home dashboard for /admin route (landing page)
  if (isAdminHomeRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="home">
          <AdminHome />
        </AdminHub>
      </div>
    );
  }

  // Show analytics dashboard for other admin routes (fallback)
  if (isAdminRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="analytics">
          <AnalyticsDashboard />
        </AdminHub>
      </div>
    );
  }

  // Show customer dashboard for customer route
  if (isCustomerRoute) {
    return (
      <div className="app">
        <div className="app-container">
          <CustomerDashboard 
            company={routeParams.company}
            companyId={routeParams.companyId}
          />
        </div>
      </div>
    );
  }

  // Show DB-backed partner dashboard for /partner route or when source=db
  if (isPartnerDbRoute || useDatabase) {
    return (
      <div className="app">
        <div className="app-container">
          <PartnerDashboardDB 
            company={routeParams.groupName}
            tier={routeParams.tier}
          />
        </div>
      </div>
    );
  }

  // Show partner widget for all other routes (default)
  return (
    <div className="app">
      <div className="app-container">
        <CompanyWidget 
          groupName={routeParams.groupName}
          tier={routeParams.tier}
        />
      </div>
    </div>
  )
}

export default App
