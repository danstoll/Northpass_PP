import React, { useState } from 'react';
import { batchGenerateUrls, downloadUrlCsv, validateCompanyData } from '../utils/adminUrlGenerator';
import { generateCustomerUrl, validateCustomerParams } from '../utils/customerUrlEncoder';
import './AdminPanel.css';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('partner'); // 'partner' or 'customer'
  const [companiesText, setCompaniesText] = useState('');
  const [generatedUrls, setGeneratedUrls] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleGenerateUrls = () => {
    if (!companiesText.trim()) {
      alert('Please enter company data');
      return;
    }

    setIsProcessing(true);
    setErrors([]);

    try {
      const baseUrl = window.location.origin;

      if (activeTab === 'partner') {
        // Partner URL generation (existing logic)
        const lines = companiesText.split('\n').filter(line => line.trim());
        const companies = lines.map((line, index) => {
          const parts = line.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''));
          if (parts.length < 2) {
            throw new Error(`Line ${index + 1}: Invalid format. Expected "Company Name, Tier"`);
          }
          return {
            name: parts[0],
            tier: parts[1]
          };
        });

        // Validate company data
        const validation = validateCompanyData(companies);
        
        if (validation.errors.length > 0) {
          setErrors(validation.errors);
        }

        if (validation.valid.length > 0) {
          const urlData = batchGenerateUrls(validation.valid, baseUrl);
          setGeneratedUrls(urlData);
        }
      } else {
        // Customer URL generation (new logic)
        const lines = companiesText.split('\n').filter(line => line.trim());
        const customers = lines.map((line, index) => {
          const parts = line.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''));
          if (parts.length < 1) {
            throw new Error(`Line ${index + 1}: Invalid format. Expected "Company Name" or "Company Name, Company ID"`);
          }
          
          const customer = { company: parts[0] };
          if (parts.length > 1 && parts[1].trim()) {
            customer.companyId = parts[1];
          }
          
          return customer;
        });

        // Validate customer data
        const validCustomers = [];
        const customerErrors = [];
        
        customers.forEach((customer, index) => {
          const validation = validateCustomerParams(customer);
          if (validation.isValid) {
            validCustomers.push(customer);
          } else {
            customerErrors.push({
              index: index + 1,
              company: customer.company || 'Unknown',
              issues: validation.errors
            });
          }
        });

        if (customerErrors.length > 0) {
          setErrors(customerErrors);
        }

        if (validCustomers.length > 0) {
          const urlData = validCustomers.map(customer => ({
            ...customer,
            name: customer.company, // For display compatibility
            encodedUrl: generateCustomerUrl(baseUrl, customer),
            regularUrl: `${baseUrl}/customer?${customer.companyId ? 
              `companyId=${encodeURIComponent(customer.companyId)}` : 
              `company=${encodeURIComponent(customer.company)}`}`,
            type: 'customer'
          }));
          setGeneratedUrls(urlData);
        }
      }

    } catch (error) {
      setErrors([{ 
        index: 0, 
        company: 'Parse Error', 
        issues: [error.message] 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadCsv = () => {
    if (generatedUrls.length === 0) {
      alert('No URLs to download');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    downloadUrlCsv(generatedUrls, `partner-urls-${timestamp}.csv`);
  };

  const handleClear = () => {
    setCompaniesText('');
    setGeneratedUrls([]);
    setErrors([]);
  };

  const sampleData = activeTab === 'partner' 
    ? `Acme Corporation, Premier
Widget Industries, Select
Tech Solutions LLC, Certified
Global Partners Inc, Registered`
    : `Premier Tech
Global Solutions Inc
Enterprise Corp, ent-001
Tech Partners LLC, tp-123`;

  return (
    <div className="admin-panel-content">
      <div className="admin-header">
        <h1>🔗 Bulk URL Generator</h1>
        <p>Generate secure URLs for multiple companies</p>
      </div>

      <div className="tab-selector">
        <button 
          className={`tab-button ${activeTab === 'partner' ? 'active' : ''}`}
          onClick={() => setActiveTab('partner')}
        >
          🏆 Partner URLs
        </button>
        <button 
          className={`tab-button ${activeTab === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveTab('customer')}
        >
          🎓 Customer URLs
        </button>
      </div>

      <div className="admin-content">
        <div className="input-section">
          <h3>{activeTab === 'partner' ? 'Partner Company Data' : 'Customer Company Data'}</h3>
          <p>
            {activeTab === 'partner' 
              ? 'Enter partner data in CSV format: '
              : 'Enter customer data in CSV format: '}
            <code>
              {activeTab === 'partner' 
                ? 'Company Name, Tier' 
                : 'Company Name[, Company ID]'}
            </code>
          </p>
          
          <div className="sample-data">
            <button 
              onClick={() => setCompaniesText(sampleData)}
              className="load-sample-btn"
            >
              📝 Load Sample Data
            </button>
          </div>

          <textarea
            value={companiesText}
            onChange={(e) => setCompaniesText(e.target.value)}
            placeholder={activeTab === 'partner' 
              ? `Enter partner data, one per line:
Acme Corporation, Premier
Widget Industries, Select
Tech Solutions LLC, Certified`
              : `Enter customer data, one per line:
Premier Tech
Global Solutions Inc
Enterprise Corp, ent-001`}
            className="companies-input"
            rows={10}
          />

          <div className="input-actions">
            <button 
              onClick={handleGenerateUrls}
              disabled={isProcessing}
              className="generate-urls-btn"
            >
              {isProcessing ? '⏳ Processing...' : '🚀 Generate URLs'}
            </button>
            
            {(generatedUrls.length > 0 || errors.length > 0) && (
              <button onClick={handleClear} className="clear-all-btn">
                🗑️ Clear All
              </button>
            )}
          </div>
        </div>

        {errors.length > 0 && (
          <div className="errors-section">
            <h3>❌ Validation Errors</h3>
            <div className="error-list">
              {errors.map((error, index) => (
                <div key={index} className="error-item">
                  <strong>Row {error.index}: {error.company}</strong>
                  <ul>
                    {error.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {generatedUrls.length > 0 && (
          <div className="results-section">
            <div className="results-header">
              <h3>✅ Generated URLs ({generatedUrls.length})</h3>
              <button onClick={handleDownloadCsv} className="download-csv-btn">
                📊 Download CSV
              </button>
            </div>

            <div className="results-table">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>{activeTab === 'partner' ? 'Tier' : 'Type'}</th>
                    <th>Encoded URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedUrls.map((item, index) => (
                    <tr key={index}>
                      <td className="company-name">{item.name}</td>
                      <td className={`tier-badge ${activeTab === 'partner' 
                        ? `tier-${item.tier?.toLowerCase()}` 
                        : 'tier-customer'}`}>
                        {activeTab === 'partner' ? item.tier : 'Customer'}
                      </td>
                      <td className="url-cell">
                        <code className="encoded-url">{item.encodedUrl}</code>
                      </td>
                      <td className="actions-cell">
                        <button
                          onClick={() => navigator.clipboard.writeText(item.encodedUrl)}
                          className="copy-url-btn"
                          title="Copy URL"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => window.open(item.encodedUrl, '_blank')}
                          className="test-url-btn"
                          title="Test URL"
                        >
                          🔗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="admin-info">
          <h3>ℹ️ Usage Instructions</h3>
          {activeTab === 'partner' ? (
            <ul>
              <li><strong>Input Format:</strong> Each line should contain: <code>Company Name, Partner Tier</code></li>
              <li><strong>Valid Tiers:</strong> Premier, Select, Registered, Certified</li>
              <li><strong>Dashboard Focus:</strong> NPCU tracking and partner tier qualification</li>
              <li><strong>Encoded URLs:</strong> Hide company and tier parameters from end users</li>
              <li><strong>CSV Export:</strong> Download all generated URLs for distribution</li>
              <li><strong>URL Testing:</strong> Click the 🔗 button to test each URL</li>
            </ul>
          ) : (
            <ul>
              <li><strong>Input Format:</strong> Each line should contain: <code>Company Name</code> or <code>Company Name, Company ID</code></li>
              <li><strong>Lookup Methods:</strong> By exact company name or by company ID</li>
              <li><strong>Dashboard Focus:</strong> Staff training tracking and certification management</li>
              <li><strong>Encoded URLs:</strong> Hide company information from end users</li>
              <li><strong>CSV Export:</strong> Download all generated URLs for distribution</li>
              <li><strong>URL Testing:</strong> Click the 🔗 button to test each URL</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;