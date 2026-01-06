import CompanyWidget from './components/CompanyWidget'
import CustomerDashboard from './components/CustomerDashboard'
import PartnerDashboardDB from './components/PartnerDashboardDB'
import AdminHub from './components/AdminHub'
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

  // Show analytics dashboard for admin route (default admin page)
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
