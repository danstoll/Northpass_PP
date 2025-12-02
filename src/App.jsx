import CompanyWidget from './components/CompanyWidget'
import CustomerDashboard from './components/CustomerDashboard'
import AdminHub from './components/AdminHub'
import AdminPanel from './components/AdminPanel'
import GroupAnalysis from './components/GroupAnalysis'
import PartnerImport from './components/PartnerImport'
import PartnerReporting from './components/PartnerReporting'
import { extractUrlParams } from './utils/urlEncoder'
import { extractCustomerParams } from './utils/customerUrlEncoder'
import './App.css'

function App() {
  // Check route types
  const currentPath = window.location.pathname;
  const isAdminRoute = currentPath.startsWith('/admin');
  const isReportingRoute = currentPath === '/admin/reports' || currentPath === '/admin/reports/';
  const isGroupAnalysisRoute = currentPath === '/admin/groups' || currentPath === '/admin/groups/';
  const isPartnerImportRoute = currentPath === '/admin/import' || currentPath === '/admin/import/';
  const isCustomerRoute = currentPath === '/customer' || currentPath === '/customer/';
  
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
      isReportingRoute,
      isGroupAnalysisRoute,
      isPartnerImportRoute,
      isCustomerRoute,
      routeParams 
    });
  }

  // Show reporting for /admin/reports route
  if (isReportingRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="reports">
          <PartnerReporting />
        </AdminHub>
      </div>
    );
  }

  // Show partner import for /admin/import route
  if (isPartnerImportRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="import">
          <PartnerImport />
        </AdminHub>
      </div>
    );
  }

  // Show group analysis for /admin/groups route
  if (isGroupAnalysisRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="groups">
          <GroupAnalysis />
        </AdminHub>
      </div>
    );
  }

  // Show admin panel for admin route (default admin page)
  if (isAdminRoute) {
    return (
      <div className="app">
        <AdminHub currentPage="urls">
          <AdminPanel />
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
