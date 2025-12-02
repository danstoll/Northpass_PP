import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './PartnerReporting.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';

// Certification categories for gap analysis
const CERTIFICATION_CATEGORIES = {
  'Nintex Automation Cloud': [
    'Nintex Automation Cloud Foundations',
    'Nintex Automation Cloud Advanced',
    'Nintex Automation Cloud Administrator'
  ],
  'Nintex Process Manager': [
    'Nintex Process Manager Foundations',
    'Nintex Process Manager Advanced'
  ],
  'Nintex RPA': [
    'Nintex RPA Foundations',
    'Nintex RPA Advanced'
  ],
  'Nintex for SharePoint': [
    'Nintex for SharePoint Foundations',
    'Nintex for SharePoint Advanced'
  ],
  'Nintex AssureSign': [
    'Nintex AssureSign Foundations'
  ]
};

const PartnerReporting = () => {
  // File upload state
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({
    email: '',
    firstName: '',
    lastName: '',
    partner: '',
    region: '',
    tier: ''
  });
  
  // Data state
  const [contacts, setContacts] = useState([]);
  const [northpassUsers, setNorthpassUsers] = useState([]);
  const [certificationData, setCertificationData] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingNorthpass, setLoadingNorthpass] = useState(false);
  
  // Report state
  const [reportGenerated, setReportGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Report data
  const [reportData, setReportData] = useState({
    byRegion: {},
    byTier: {},
    byPartner: {},
    certificationGaps: {},
    overallStats: {}
  });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setReportGenerated(false);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const binaryStr = evt.target.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length > 0) {
          const headers = jsonData[0].map(h => String(h || '').trim());
          setColumns(headers);
          
          const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell));
          setFileData(dataRows);
          
          // Auto-detect columns
          const emailCol = headers.find(h => /^email$/i.test(h));
          const firstNameCol = headers.find(h => /first\s*name/i.test(h));
          const lastNameCol = headers.find(h => /last\s*name/i.test(h));
          const partnerCol = headers.find(h => /account\s*name|partner|company/i.test(h));
          const regionCol = headers.find(h => /region/i.test(h));
          const tierCol = headers.find(h => /tier|partner\s*tier/i.test(h));
          
          setColumnMapping({
            email: emailCol || '',
            firstName: firstNameCol || '',
            lastName: lastNameCol || '',
            partner: partnerCol || '',
            region: regionCol || '',
            tier: tierCol || ''
          });
          
          console.log(`✅ Loaded ${dataRows.length} rows from ${file.name}`);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please make sure it\'s a valid Excel file.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const parseContacts = useCallback(() => {
    if (!fileData || !columns.length) return [];
    
    const emailIdx = columns.indexOf(columnMapping.email);
    const firstNameIdx = columns.indexOf(columnMapping.firstName);
    const lastNameIdx = columns.indexOf(columnMapping.lastName);
    const partnerIdx = columns.indexOf(columnMapping.partner);
    const regionIdx = columns.indexOf(columnMapping.region);
    const tierIdx = columns.indexOf(columnMapping.tier);
    
    return fileData.map((row, idx) => {
      const firstName = firstNameIdx >= 0 ? String(row[firstNameIdx] || '').trim() : '';
      const lastName = lastNameIdx >= 0 ? String(row[lastNameIdx] || '').trim() : '';
      
      return {
        id: idx,
        name: [firstName, lastName].filter(Boolean).join(' '),
        email: emailIdx >= 0 ? String(row[emailIdx] || '').trim().toLowerCase() : '',
        partner: partnerIdx >= 0 ? String(row[partnerIdx] || '').trim() : '',
        region: regionIdx >= 0 ? String(row[regionIdx] || '').trim() : 'Unknown',
        tier: tierIdx >= 0 ? String(row[tierIdx] || '').trim() : 'Unknown'
      };
    }).filter(c => c.email);
  }, [fileData, columns, columnMapping]);

  const generateReport = async () => {
    setLoading(true);
    
    try {
      const parsedContacts = parseContacts();
      setContacts(parsedContacts);
      
      // Fetch Northpass user data for certification info
      setLoadingNorthpass(true);
      const allUsers = await northpassApi.getAllUsers();
      setNorthpassUsers(allUsers);
      
      // Create email lookup for Northpass users
      const northpassByEmail = new Map();
      allUsers.forEach(user => {
        const email = user.attributes?.email?.toLowerCase();
        if (email) {
          northpassByEmail.set(email, user);
        }
      });
      
      // Fetch transcript data for users in our contact list
      const certData = {};
      let processedCount = 0;
      
      for (const contact of parsedContacts) {
        const northpassUser = northpassByEmail.get(contact.email);
        if (northpassUser) {
          try {
            const transcript = await northpassApi.getUserTranscript(northpassUser.id);
            const completedCourses = transcript
              .filter(t => t.attributes?.status === 'passed' || t.attributes?.completed_at)
              .map(t => t.attributes?.course_name || '');
            
            certData[contact.email] = {
              userId: northpassUser.id,
              completedCourses,
              inNorthpass: true
            };
          } catch {
            certData[contact.email] = { userId: northpassUser.id, completedCourses: [], inNorthpass: true };
          }
        } else {
          certData[contact.email] = { userId: null, completedCourses: [], inNorthpass: false };
        }
        
        processedCount++;
        if (processedCount % 10 === 0) {
          console.log(`Processed ${processedCount}/${parsedContacts.length} contacts`);
        }
      }
      
      setCertificationData(certData);
      setLoadingNorthpass(false);
      
      // Generate reports
      const reports = generateReportData(parsedContacts, certData);
      setReportData(reports);
      setReportGenerated(true);
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report: ' + error.message);
    } finally {
      setLoading(false);
      setLoadingNorthpass(false);
    }
  };

  const generateReportData = (contacts, certData) => {
    // Overall stats
    const totalContacts = contacts.length;
    const inNorthpass = Object.values(certData).filter(c => c.inNorthpass).length;
    const withCertifications = Object.values(certData).filter(c => c.completedCourses.length > 0).length;
    
    // By Region
    const byRegion = {};
    contacts.forEach(contact => {
      const region = contact.region || 'Unknown';
      if (!byRegion[region]) {
        byRegion[region] = {
          total: 0,
          inNorthpass: 0,
          certified: 0,
          partners: new Set(),
          certificationCounts: {}
        };
      }
      byRegion[region].total++;
      byRegion[region].partners.add(contact.partner);
      
      const cert = certData[contact.email];
      if (cert?.inNorthpass) byRegion[region].inNorthpass++;
      if (cert?.completedCourses?.length > 0) {
        byRegion[region].certified++;
        cert.completedCourses.forEach(course => {
          byRegion[region].certificationCounts[course] = (byRegion[region].certificationCounts[course] || 0) + 1;
        });
      }
    });
    
    // Convert Sets to counts
    Object.keys(byRegion).forEach(r => {
      byRegion[r].partnerCount = byRegion[r].partners.size;
      delete byRegion[r].partners;
    });
    
    // By Tier
    const byTier = {};
    contacts.forEach(contact => {
      const tier = contact.tier || 'Unknown';
      if (!byTier[tier]) {
        byTier[tier] = {
          total: 0,
          inNorthpass: 0,
          certified: 0,
          partners: new Set(),
          totalNPCU: 0
        };
      }
      byTier[tier].total++;
      byTier[tier].partners.add(contact.partner);
      
      const cert = certData[contact.email];
      if (cert?.inNorthpass) byTier[tier].inNorthpass++;
      if (cert?.completedCourses?.length > 0) {
        byTier[tier].certified++;
      }
    });
    
    Object.keys(byTier).forEach(t => {
      byTier[t].partnerCount = byTier[t].partners.size;
      delete byTier[t].partners;
    });
    
    // By Partner
    const byPartner = {};
    contacts.forEach(contact => {
      const partner = contact.partner || 'Unknown';
      if (!byPartner[partner]) {
        byPartner[partner] = {
          total: 0,
          inNorthpass: 0,
          certified: 0,
          region: contact.region,
          tier: contact.tier,
          certifications: []
        };
      }
      byPartner[partner].total++;
      
      const cert = certData[contact.email];
      if (cert?.inNorthpass) byPartner[partner].inNorthpass++;
      if (cert?.completedCourses?.length > 0) {
        byPartner[partner].certified++;
        byPartner[partner].certifications.push(...cert.completedCourses);
      }
    });
    
    // Certification Gaps Analysis
    const certificationGaps = {};
    Object.entries(CERTIFICATION_CATEGORIES).forEach(([category, certs]) => {
      certificationGaps[category] = {
        total: 0,
        byCertification: {}
      };
      
      certs.forEach(certName => {
        const count = Object.values(certData).filter(c => 
          c.completedCourses.some(course => course.toLowerCase().includes(certName.toLowerCase()))
        ).length;
        
        certificationGaps[category].byCertification[certName] = count;
        certificationGaps[category].total += count;
      });
    });
    
    return {
      overallStats: {
        totalContacts,
        inNorthpass,
        notInNorthpass: totalContacts - inNorthpass,
        withCertifications,
        withoutCertifications: inNorthpass - withCertifications,
        uniquePartners: new Set(contacts.map(c => c.partner)).size,
        uniqueRegions: new Set(contacts.map(c => c.region)).size
      },
      byRegion,
      byTier,
      byPartner,
      certificationGaps
    };
  };

  const exportReport = () => {
    const wb = XLSX.utils.book_new();
    
    // Overview sheet
    const overviewData = [
      ['Metric', 'Value'],
      ['Total Contacts', reportData.overallStats.totalContacts],
      ['In Northpass', reportData.overallStats.inNorthpass],
      ['Not in Northpass', reportData.overallStats.notInNorthpass],
      ['With Certifications', reportData.overallStats.withCertifications],
      ['Without Certifications', reportData.overallStats.withoutCertifications],
      ['Unique Partners', reportData.overallStats.uniquePartners],
      ['Unique Regions', reportData.overallStats.uniqueRegions]
    ];
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');
    
    // By Region sheet
    const regionData = [['Region', 'Total Contacts', 'In Northpass', 'Certified', 'Partner Count', '% Certified']];
    Object.entries(reportData.byRegion).forEach(([region, data]) => {
      regionData.push([
        region,
        data.total,
        data.inNorthpass,
        data.certified,
        data.partnerCount,
        data.inNorthpass > 0 ? `${Math.round(data.certified / data.inNorthpass * 100)}%` : '0%'
      ]);
    });
    const wsRegion = XLSX.utils.aoa_to_sheet(regionData);
    XLSX.utils.book_append_sheet(wb, wsRegion, 'By Region');
    
    // By Tier sheet
    const tierData = [['Tier', 'Total Contacts', 'In Northpass', 'Certified', 'Partner Count', '% Certified']];
    Object.entries(reportData.byTier).forEach(([tier, data]) => {
      tierData.push([
        tier,
        data.total,
        data.inNorthpass,
        data.certified,
        data.partnerCount,
        data.inNorthpass > 0 ? `${Math.round(data.certified / data.inNorthpass * 100)}%` : '0%'
      ]);
    });
    const wsTier = XLSX.utils.aoa_to_sheet(tierData);
    XLSX.utils.book_append_sheet(wb, wsTier, 'By Tier');
    
    // By Partner sheet
    const partnerData = [['Partner', 'Region', 'Tier', 'Total Contacts', 'In Northpass', 'Certified', '% Certified']];
    Object.entries(reportData.byPartner)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([partner, data]) => {
        partnerData.push([
          partner,
          data.region,
          data.tier,
          data.total,
          data.inNorthpass,
          data.certified,
          data.inNorthpass > 0 ? `${Math.round(data.certified / data.inNorthpass * 100)}%` : '0%'
        ]);
      });
    const wsPartner = XLSX.utils.aoa_to_sheet(partnerData);
    XLSX.utils.book_append_sheet(wb, wsPartner, 'By Partner');
    
    // Certification Gaps sheet
    const gapData = [['Category', 'Certification', 'Count']];
    Object.entries(reportData.certificationGaps).forEach(([category, data]) => {
      Object.entries(data.byCertification).forEach(([cert, count]) => {
        gapData.push([category, cert, count]);
      });
    });
    const wsGaps = XLSX.utils.aoa_to_sheet(gapData);
    XLSX.utils.book_append_sheet(wb, wsGaps, 'Certification Gaps');
    
    // Download
    XLSX.writeFile(wb, `partner-report-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const renderOverviewTab = () => (
    <div className="report-section">
      <h3>📊 Overall Statistics</h3>
      <div className="stats-grid">
        <div className="stat-card large">
          <span className="stat-value">{reportData.overallStats.totalContacts}</span>
          <span className="stat-label">Total Contacts</span>
        </div>
        <div className="stat-card success">
          <span className="stat-value">{reportData.overallStats.inNorthpass}</span>
          <span className="stat-label">In Northpass</span>
          <span className="stat-percent">
            {Math.round(reportData.overallStats.inNorthpass / reportData.overallStats.totalContacts * 100)}%
          </span>
        </div>
        <div className="stat-card warning">
          <span className="stat-value">{reportData.overallStats.notInNorthpass}</span>
          <span className="stat-label">Not in Northpass</span>
        </div>
        <div className="stat-card info">
          <span className="stat-value">{reportData.overallStats.withCertifications}</span>
          <span className="stat-label">With Certifications</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{reportData.overallStats.uniquePartners}</span>
          <span className="stat-label">Unique Partners</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{reportData.overallStats.uniqueRegions}</span>
          <span className="stat-label">Regions</span>
        </div>
      </div>
    </div>
  );

  const renderRegionTab = () => (
    <div className="report-section">
      <h3>🌍 By Region</h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Contacts</th>
            <th>In Northpass</th>
            <th>Certified</th>
            <th>Partners</th>
            <th>% Certified</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(reportData.byRegion)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([region, data]) => (
              <tr key={region}>
                <td className="region-name">{region}</td>
                <td>{data.total}</td>
                <td>{data.inNorthpass}</td>
                <td>{data.certified}</td>
                <td>{data.partnerCount}</td>
                <td>
                  <div className="progress-cell">
                    <div 
                      className="progress-bar-mini" 
                      style={{ width: `${data.inNorthpass > 0 ? (data.certified / data.inNorthpass * 100) : 0}%` }}
                    />
                    <span>{data.inNorthpass > 0 ? Math.round(data.certified / data.inNorthpass * 100) : 0}%</span>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderTierTab = () => (
    <div className="report-section">
      <h3>🏆 By Partner Tier</h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Contacts</th>
            <th>In Northpass</th>
            <th>Certified</th>
            <th>Partners</th>
            <th>% Certified</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(reportData.byTier)
            .sort((a, b) => {
              const tierOrder = ['Premier', 'Select', 'Registered', 'Certified'];
              return tierOrder.indexOf(a[0]) - tierOrder.indexOf(b[0]);
            })
            .map(([tier, data]) => (
              <tr key={tier} className={`tier-${tier.toLowerCase()}`}>
                <td className="tier-name">
                  <span className={`tier-badge tier-${tier.toLowerCase()}`}>{tier}</span>
                </td>
                <td>{data.total}</td>
                <td>{data.inNorthpass}</td>
                <td>{data.certified}</td>
                <td>{data.partnerCount}</td>
                <td>
                  <div className="progress-cell">
                    <div 
                      className="progress-bar-mini" 
                      style={{ width: `${data.inNorthpass > 0 ? (data.certified / data.inNorthpass * 100) : 0}%` }}
                    />
                    <span>{data.inNorthpass > 0 ? Math.round(data.certified / data.inNorthpass * 100) : 0}%</span>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderCertificationsTab = () => (
    <div className="report-section">
      <h3>📜 Certification Gap Analysis</h3>
      <p className="section-desc">See which certifications have the most/least coverage across your partner contacts.</p>
      
      <div className="cert-categories">
        {Object.entries(reportData.certificationGaps).map(([category, data]) => (
          <div key={category} className="cert-category-card">
            <h4>{category}</h4>
            <div className="cert-list">
              {Object.entries(data.byCertification).map(([cert, count]) => (
                <div key={cert} className="cert-item">
                  <span className="cert-name">{cert.replace(category, '').trim() || 'Foundations'}</span>
                  <div className="cert-bar-container">
                    <div 
                      className="cert-bar" 
                      style={{ 
                        width: `${Math.min(count / reportData.overallStats.inNorthpass * 100 * 5, 100)}%`,
                        backgroundColor: count > 10 ? '#43e97b' : count > 5 ? '#ffc107' : '#ff6b6b'
                      }}
                    />
                  </div>
                  <span className="cert-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPartnersTab = () => (
    <div className="report-section">
      <h3>🏢 By Partner</h3>
      <div className="partners-table-container">
        <table className="report-table">
          <thead>
            <tr>
              <th>Partner</th>
              <th>Region</th>
              <th>Tier</th>
              <th>Contacts</th>
              <th>In Northpass</th>
              <th>Certified</th>
              <th>% Certified</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(reportData.byPartner)
              .sort((a, b) => b[1].total - a[1].total)
              .slice(0, 50)
              .map(([partner, data]) => (
                <tr key={partner}>
                  <td className="partner-name">{partner}</td>
                  <td>{data.region}</td>
                  <td>
                    <span className={`tier-badge tier-${(data.tier || '').toLowerCase()}`}>
                      {data.tier || 'N/A'}
                    </span>
                  </td>
                  <td>{data.total}</td>
                  <td>{data.inNorthpass}</td>
                  <td>{data.certified}</td>
                  <td>
                    <div className="progress-cell">
                      <div 
                        className="progress-bar-mini" 
                        style={{ width: `${data.inNorthpass > 0 ? (data.certified / data.inNorthpass * 100) : 0}%` }}
                      />
                      <span>{data.inNorthpass > 0 ? Math.round(data.certified / data.inNorthpass * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {Object.keys(reportData.byPartner).length > 50 && (
          <p className="table-note">Showing top 50 partners. Export to Excel for full list.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="partner-reporting-content">
      <div className="reporting-header">
        <div className="header-content">
          <h1>📊 Partner Reporting & Analytics</h1>
          <p>Upload your partner contact export to generate comprehensive reports by Region, Tier, and Certification coverage.</p>
        </div>
      </div>

      {/* File Upload Section */}
      <div className="report-section upload-section">
        <h2>Step 1: Upload Partner Data</h2>
        <div className="file-upload-area">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            id="report-file-upload"
            className="file-input"
          />
          <label htmlFor="report-file-upload" className="file-label">
            {fileName ? `📄 ${fileName}` : '📁 Click to select your partner contact export file'}
          </label>
          {fileData && (
            <p className="file-info">
              ✅ Loaded {fileData.length} rows with {columns.length} columns
            </p>
          )}
        </div>
      </div>

      {/* Column Mapping */}
      {columns.length > 0 && (
        <div className="report-section">
          <h2>Step 2: Map Columns</h2>
          <div className="column-mapping-grid">
            {[
              { key: 'email', label: 'Email Address', required: true },
              { key: 'firstName', label: 'First Name' },
              { key: 'lastName', label: 'Last Name' },
              { key: 'partner', label: 'Partner/Account Name', required: true },
              { key: 'region', label: 'Region' },
              { key: 'tier', label: 'Partner Tier' }
            ].map(({ key, label, required }) => (
              <div key={key} className="mapping-row">
                <label>{label}:{required && <span className="required">*</span>}</label>
                <select 
                  value={columnMapping[key]}
                  onChange={(e) => setColumnMapping(prev => ({ ...prev, [key]: e.target.value }))}
                >
                  <option value="">-- Select Column --</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          
          <NintexButton 
            variant="primary"
            onClick={generateReport}
            disabled={!columnMapping.email || !columnMapping.partner || loading}
          >
            {loading ? (loadingNorthpass ? '🔄 Fetching Northpass data...' : '🔄 Generating Report...') : '📊 Generate Report'}
          </NintexButton>
        </div>
      )}

      {/* Report Results */}
      {reportGenerated && (
        <>
          <div className="report-tabs">
            {[
              { id: 'overview', label: '📊 Overview', icon: '📊' },
              { id: 'region', label: '🌍 By Region', icon: '🌍' },
              { id: 'tier', label: '🏆 By Tier', icon: '🏆' },
              { id: 'certifications', label: '📜 Certifications', icon: '📜' },
              { id: 'partners', label: '🏢 Partners', icon: '🏢' }
            ].map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            
            <NintexButton variant="secondary" onClick={exportReport} className="export-btn">
              📥 Export to Excel
            </NintexButton>
          </div>

          <div className="report-content">
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'region' && renderRegionTab()}
            {activeTab === 'tier' && renderTierTab()}
            {activeTab === 'certifications' && renderCertificationsTab()}
            {activeTab === 'partners' && renderPartnersTab()}
          </div>
        </>
      )}
    </div>
  );
};

export default PartnerReporting;
