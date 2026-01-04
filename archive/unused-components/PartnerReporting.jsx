import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './PartnerReporting.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';
import DataImport from './DataImport';
import { getAccountSummary, getImportMetadata, hasData } from '../services/partnerDatabase';

// Tier NPCU requirements (same as partner-facing dashboard)
const TIER_REQUIREMENTS = {
  'Premier Plus': 20,
  'Premier': 20,
  'Certified': 10,
  'Registered': 5,
  'Aggregator': 5
};

// Certification categories for gap analysis - using keywords for flexible matching
const CERTIFICATION_CATEGORIES = {
  'Nintex Automation Cloud': {
    keywords: ['automation cloud', 'workflow cloud', 'nac'],
    levels: ['Foundations', 'Advanced', 'Administrator']
  },
  'Nintex Process Manager': {
    keywords: ['process manager', 'promapp', 'npm'],
    levels: ['Foundations', 'Advanced']
  },
  'Nintex RPA': {
    keywords: ['rpa', 'robotic process', 'foxtrot'],
    levels: ['Foundations', 'Advanced']
  },
  'Nintex for SharePoint': {
    keywords: ['sharepoint', 'on-premise', 'on-prem'],
    levels: ['Foundations', 'Advanced']
  },
  'Nintex AssureSign': {
    keywords: ['assuresign', 'esign', 'signature'],
    levels: ['Foundations']
  },
  'Nintex DocGen': {
    keywords: ['docgen', 'document generation', 'drawloop'],
    levels: ['Foundations', 'Advanced']
  },
  'Nintex K2': {
    keywords: ['k2'],
    levels: ['Foundations', 'Advanced']
  }
};

// Helper function to calculate NPCU from course name
// MUST match the logic in northpassApi.calculateNPCUPoints() exactly
const calculateNPCUFromCourse = (courseName) => {
  const name = (courseName || '').toLowerCase();
  
  // Only assign NPCU points if this is actually a certification course
  // Look for certification-specific keywords - MUST have "certification" or "certified"
  if (name.includes('certification') || name.includes('certified')) {
    // Advanced certifications get 2 NPCU
    if (name.includes('advanced') || name.includes('expert') || name.includes('master') || name.includes('professional')) {
      return 2;
    }
    // Basic certifications get 1 NPCU
    return 1;
  }
  
  // Regular courses (not certifications) get 0 NPCU
  return 0;
};

const PartnerReporting = () => {
  // Database state
  const [dbAvailable, setDbAvailable] = useState(false);
  const [dbMetadata, setDbMetadata] = useState(null);
  const [dataSource, setDataSource] = useState('database'); // 'database' or 'file'
  
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
  const [loading, setLoading] = useState(false);
  const [_loadingNorthpass, setLoadingNorthpass] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  
  // Report state
  const [reportGenerated, setReportGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Pagination and sorting state
  const [partnerPage, setPartnerPage] = useState(1);
  const [partnerSort, setPartnerSort] = useState({ field: 'totalNPCU', direction: 'desc' });
  const [regionSort, setRegionSort] = useState({ field: 'total', direction: 'desc' });
  const [tierSort, setTierSort] = useState({ field: 'total', direction: 'desc' });
  const ITEMS_PER_PAGE = 25;
  
  // Report data
  const [reportData, setReportData] = useState({
    byRegion: {},
    byTier: {},
    byPartner: {},
    certificationGaps: {},
    overallStats: {},
    allCourseNames: [] // For debugging
  });

  // Check for database data on mount
  useEffect(() => {
    checkDatabaseStatus();
  }, []);

  const checkDatabaseStatus = async () => {
    try {
      const dataAvailable = await hasData();
      setDbAvailable(dataAvailable);
      if (dataAvailable) {
        const metadata = await getImportMetadata();
        setDbMetadata(metadata);
      }
    } catch (err) {
      console.error('Error checking database:', err);
    }
  };

  // Load contacts from database
  const loadFromDatabase = async () => {
    const accounts = await getAccountSummary();
    const contacts = [];
    
    accounts.forEach(account => {
      account.contacts.forEach(contact => {
        contacts.push({
          id: contacts.length,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: (contact.email || '').toLowerCase(),
          partner: account.accountName,
          region: account.accountRegion || 'Unknown',
          tier: account.partnerTier || 'Unknown'
        });
      });
    });
    
    return contacts;
  };

  // Sorting helper - Memoized for performance
  const sortData = useCallback((data, sortConfig) => {
    const entries = Object.entries(data);
    return entries.sort((a, b) => {
      let aVal = a[1][sortConfig.field];
      let bVal = b[1][sortConfig.field];
      
      // Handle string comparison for name fields
      if (sortConfig.field === 'name') {
        aVal = a[0];
        bVal = b[0];
      }
      
      // Handle undefined/null
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;
      
      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      // Numeric comparison
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, []);

  // Toggle sort direction - Memoized
  const toggleSort = useCallback((currentSort, setSort, field) => {
    if (currentSort.field === field) {
      setSort({ field, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ field, direction: 'desc' });
    }
  }, []);

  // Render sort indicator - Memoized component
  const SortIcon = React.memo(({ field, currentSort }) => {
    if (currentSort.field !== field) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{currentSort.direction === 'asc' ? '↑' : '↓'}</span>;
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

  const generateReport = async (useDatabase = false) => {
    setLoading(true);
    setProgressPercent(0);
    setProcessedCount(0);
    
    try {
      // Get contacts from either database or file
      let parsedContacts;
      if (useDatabase) {
        setProgressMessage('Loading contacts from database...');
        parsedContacts = await loadFromDatabase();
        setDataSource('database');
      } else {
        parsedContacts = parseContacts();
        setDataSource('file');
      }
      setTotalToProcess(parsedContacts.length);
      
      // Fetch Northpass user data for certification info
      setLoadingNorthpass(true);
      setProgressMessage('Fetching all Northpass users...');
      setProgressPercent(5);
      const allUsers = await northpassApi.getAllUsers();
      setProgressPercent(15);
      
      // Create email lookup for Northpass users
      setProgressMessage('Building user index...');
      const northpassByEmail = new Map();
      allUsers.forEach(user => {
        const email = user.attributes?.email?.toLowerCase();
        if (email) {
          northpassByEmail.set(email, user);
        }
      });
      setProgressPercent(20);
      
      // Fetch transcript data for users in our contact list
      const certData = {};
      const allCourseNames = new Set(); // Collect all course names for debugging
      let currentProcessed = 0;
      
      for (const contact of parsedContacts) {
        const northpassUser = northpassByEmail.get(contact.email);
        if (northpassUser) {
          try {
            const transcript = await northpassApi.getUserTranscript(northpassUser.id);
            const completedCourses = transcript
              .filter(t => t.attributes?.progress_status === 'completed' || t.attributes?.completed_at)
              .map(t => {
                const courseName = t.attributes?.name || t.attributes?.course_name || '';
                if (courseName) allCourseNames.add(courseName);
                return courseName;
              })
              .filter(Boolean);
            
            // Calculate NPCU for this user
            const npcu = completedCourses.reduce((total, course) => total + calculateNPCUFromCourse(course), 0);
            
            certData[contact.email] = {
              userId: northpassUser.id,
              completedCourses,
              npcu,
              inNorthpass: true
            };
          } catch {
            certData[contact.email] = { userId: northpassUser.id, completedCourses: [], npcu: 0, inNorthpass: true };
          }
        } else {
          certData[contact.email] = { userId: null, completedCourses: [], npcu: 0, inNorthpass: false };
        }
        
        currentProcessed++;
        setProcessedCount(currentProcessed);
        
        // Update progress (20% to 90% for transcript fetching)
        const progressInPhase = (currentProcessed / parsedContacts.length) * 70;
        setProgressPercent(Math.round(20 + progressInPhase));
        setProgressMessage(`Analyzing ${contact.name || contact.email}`);
        
        if (currentProcessed % 10 === 0) {
          console.log(`Processed ${currentProcessed}/${parsedContacts.length} contacts`);
        }
      }
      
      setLoadingNorthpass(false);
      setProgressMessage('Generating reports...');
      setProgressPercent(95);
      
      // Log all unique course names for debugging
      console.log('📚 All unique course names found:', Array.from(allCourseNames).sort());
      
      // Generate reports
      const reports = generateReportData(parsedContacts, certData, Array.from(allCourseNames));
      setReportData(reports);
      setProgressPercent(100);
      setReportGenerated(true);
      
      // Reset pagination when new report is generated
      setPartnerPage(1);
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report: ' + error.message);
    } finally {
      setLoading(false);
      setLoadingNorthpass(false);
      setProgressMessage('');
      setProgressPercent(0);
    }
  };

  const generateReportData = (contacts, certData, allCourseNames) => {
    // Overall stats
    const totalContacts = contacts.length;
    const inNorthpass = Object.values(certData).filter(c => c.inNorthpass).length;
    const withCertifications = Object.values(certData).filter(c => c.completedCourses.length > 0).length;
    const totalNPCU = Object.values(certData).reduce((sum, c) => sum + (c.npcu || 0), 0);
    
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
          totalNPCU: 0,
          certificationCounts: {}
        };
      }
      byRegion[region].total++;
      byRegion[region].partners.add(contact.partner);
      
      const cert = certData[contact.email];
      if (cert?.inNorthpass) byRegion[region].inNorthpass++;
      if (cert?.completedCourses?.length > 0) {
        byRegion[region].certified++;
        byRegion[region].totalNPCU += cert.npcu || 0;
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
    
    // By Tier - with compliance tracking
    const byTier = {};
    contacts.forEach(contact => {
      const tier = contact.tier || 'Unknown';
      if (!byTier[tier]) {
        byTier[tier] = {
          total: 0,
          inNorthpass: 0,
          certified: 0,
          partners: new Set(),
          totalNPCU: 0,
          requirement: TIER_REQUIREMENTS[tier] || 0
        };
      }
      byTier[tier].total++;
      byTier[tier].partners.add(contact.partner);
      
      const cert = certData[contact.email];
      if (cert?.inNorthpass) byTier[tier].inNorthpass++;
      if (cert?.completedCourses?.length > 0) {
        byTier[tier].certified++;
        byTier[tier].totalNPCU += cert.npcu || 0;
      }
    });
    
    Object.keys(byTier).forEach(t => {
      byTier[t].partnerCount = byTier[t].partners.size;
      delete byTier[t].partners;
    });
    
    // By Partner - with NPCU and compliance
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
          requirement: TIER_REQUIREMENTS[contact.tier] || 0,
          totalNPCU: 0,
          certifications: [],
          contacts: []
        };
      }
      byPartner[partner].total++;
      
      const cert = certData[contact.email];
      if (cert?.inNorthpass) byPartner[partner].inNorthpass++;
      if (cert?.completedCourses?.length > 0) {
        byPartner[partner].certified++;
        byPartner[partner].totalNPCU += cert.npcu || 0;
        byPartner[partner].certifications.push(...cert.completedCourses);
      }
      byPartner[partner].contacts.push({
        name: contact.name,
        email: contact.email,
        npcu: cert?.npcu || 0,
        certCount: cert?.completedCourses?.length || 0,
        inNorthpass: cert?.inNorthpass || false
      });
    });
    
    // Calculate compliance for each partner
    Object.keys(byPartner).forEach(p => {
      const partner = byPartner[p];
      partner.isCompliant = partner.totalNPCU >= partner.requirement;
      partner.npcuGap = Math.max(0, partner.requirement - partner.totalNPCU);
    });
    
    // Certification Gaps Analysis - using keyword matching
    const certificationGaps = {};
    Object.entries(CERTIFICATION_CATEGORIES).forEach(([category, config]) => {
      certificationGaps[category] = {
        total: 0,
        byCertification: {}
      };
      
      config.levels.forEach(level => {
        // Count how many contacts have this certification using flexible matching
        const count = Object.values(certData).filter(c => 
          c.completedCourses.some(course => {
            const courseLower = course.toLowerCase();
            const matchesCategory = config.keywords.some(kw => courseLower.includes(kw.toLowerCase()));
            const matchesLevel = courseLower.includes(level.toLowerCase());
            return matchesCategory && matchesLevel;
          })
        ).length;
        
        certificationGaps[category].byCertification[level] = count;
        certificationGaps[category].total += count;
      });
    });
    
    // Count compliant vs non-compliant partners
    const partnerList = Object.values(byPartner);
    const compliantPartners = partnerList.filter(p => p.isCompliant).length;
    const nonCompliantPartners = partnerList.filter(p => !p.isCompliant && p.requirement > 0).length;
    
    return {
      overallStats: {
        totalContacts,
        inNorthpass,
        notInNorthpass: totalContacts - inNorthpass,
        withCertifications,
        withoutCertifications: inNorthpass - withCertifications,
        uniquePartners: new Set(contacts.map(c => c.partner)).size,
        uniqueRegions: new Set(contacts.map(c => c.region)).size,
        totalNPCU,
        compliantPartners,
        nonCompliantPartners
      },
      byRegion,
      byTier,
      byPartner,
      certificationGaps,
      allCourseNames
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
      ['Total NPCU', reportData.overallStats.totalNPCU],
      ['Unique Partners', reportData.overallStats.uniquePartners],
      ['Compliant Partners', reportData.overallStats.compliantPartners],
      ['Non-Compliant Partners', reportData.overallStats.nonCompliantPartners],
      ['Unique Regions', reportData.overallStats.uniqueRegions]
    ];
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');
    
    // By Region sheet
    const regionData = [['Region', 'Total Contacts', 'In Northpass', 'Certified', 'Partner Count', 'Total NPCU', '% Certified']];
    Object.entries(reportData.byRegion).forEach(([region, data]) => {
      regionData.push([
        region,
        data.total,
        data.inNorthpass,
        data.certified,
        data.partnerCount,
        data.totalNPCU || 0,
        data.inNorthpass > 0 ? `${Math.round(data.certified / data.inNorthpass * 100)}%` : '0%'
      ]);
    });
    const wsRegion = XLSX.utils.aoa_to_sheet(regionData);
    XLSX.utils.book_append_sheet(wb, wsRegion, 'By Region');
    
    // By Tier sheet
    const tierData = [['Tier', 'NPCU Required', 'Total Contacts', 'In Northpass', 'Certified', 'Partner Count', 'Total NPCU', '% Certified']];
    Object.entries(reportData.byTier).forEach(([tier, data]) => {
      tierData.push([
        tier,
        data.requirement || 'N/A',
        data.total,
        data.inNorthpass,
        data.certified,
        data.partnerCount,
        data.totalNPCU || 0,
        data.inNorthpass > 0 ? `${Math.round(data.certified / data.inNorthpass * 100)}%` : '0%'
      ]);
    });
    const wsTier = XLSX.utils.aoa_to_sheet(tierData);
    XLSX.utils.book_append_sheet(wb, wsTier, 'By Tier');
    
    // By Partner sheet - with compliance
    const partnerData = [['Partner', 'Region', 'Tier', 'NPCU Required', 'Total NPCU', 'Compliant', 'NPCU Gap', 'Total Contacts', 'In Northpass', 'Certified', '% Certified']];
    Object.entries(reportData.byPartner)
      .sort((a, b) => b[1].totalNPCU - a[1].totalNPCU)
      .forEach(([partner, data]) => {
        partnerData.push([
          partner,
          data.region,
          data.tier,
          data.requirement || 0,
          data.totalNPCU || 0,
          data.isCompliant ? 'Yes' : 'No',
          data.npcuGap || 0,
          data.total,
          data.inNorthpass,
          data.certified,
          data.inNorthpass > 0 ? `${Math.round(data.certified / data.inNorthpass * 100)}%` : '0%'
        ]);
      });
    const wsPartner = XLSX.utils.aoa_to_sheet(partnerData);
    XLSX.utils.book_append_sheet(wb, wsPartner, 'By Partner');
    
    // Certification Gaps sheet
    const gapData = [['Category', 'Certification Level', 'Count']];
    Object.entries(reportData.certificationGaps).forEach(([category, data]) => {
      Object.entries(data.byCertification).forEach(([level, count]) => {
        gapData.push([category, level, count]);
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
        <div className="stat-card npcu">
          <span className="stat-value">{reportData.overallStats.totalNPCU}</span>
          <span className="stat-label">Total NPCU</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{reportData.overallStats.uniquePartners}</span>
          <span className="stat-label">Unique Partners</span>
        </div>
      </div>
      
      {/* Partner Compliance Summary */}
      <h3>✅ Partner Tier Compliance</h3>
      <div className="stats-grid">
        <div className="stat-card success">
          <span className="stat-value">{reportData.overallStats.compliantPartners}</span>
          <span className="stat-label">Compliant Partners</span>
          <span className="stat-desc">Meeting NPCU requirements</span>
        </div>
        <div className="stat-card danger">
          <span className="stat-value">{reportData.overallStats.nonCompliantPartners}</span>
          <span className="stat-label">Non-Compliant Partners</span>
          <span className="stat-desc">Below NPCU requirements</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{reportData.overallStats.uniqueRegions}</span>
          <span className="stat-label">Regions</span>
        </div>
      </div>
      
      {/* Tier Requirements Reference */}
      <h3>📋 Tier NPCU Requirements</h3>
      <div className="tier-requirements-grid">
        {Object.entries(TIER_REQUIREMENTS).map(([tier, requirement]) => (
          <div key={tier} className={`tier-req-card tier-${tier.toLowerCase()}`}>
            <span className="tier-name">{tier}</span>
            <span className="tier-req">{requirement} NPCU</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRegionTab = () => {
    const sortedRegions = sortData(reportData.byRegion, regionSort);
    
    return (
      <div className="report-section">
        <h3>🌍 By Region</h3>
        <table className="report-table sortable">
          <thead>
            <tr>
              <th className="sortable-header" onClick={() => toggleSort(regionSort, setRegionSort, 'name')}>
                Region <SortIcon field="name" currentSort={regionSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(regionSort, setRegionSort, 'total')}>
                Contacts <SortIcon field="total" currentSort={regionSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(regionSort, setRegionSort, 'inNorthpass')}>
                In Northpass <SortIcon field="inNorthpass" currentSort={regionSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(regionSort, setRegionSort, 'certified')}>
                Certified <SortIcon field="certified" currentSort={regionSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(regionSort, setRegionSort, 'totalNPCU')}>
                Total NPCU <SortIcon field="totalNPCU" currentSort={regionSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(regionSort, setRegionSort, 'partnerCount')}>
                Partners <SortIcon field="partnerCount" currentSort={regionSort} />
              </th>
              <th>% Certified</th>
            </tr>
          </thead>
          <tbody>
            {sortedRegions.map(([region, data]) => (
                <tr key={region}>
                  <td className="region-name">{region}</td>
                  <td>{data.total}</td>
                  <td>{data.inNorthpass}</td>
                  <td>{data.certified}</td>
                  <td className="npcu-value">{data.totalNPCU || 0}</td>
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
  };

  const renderTierTab = () => {
    const sortedTiers = sortData(reportData.byTier, tierSort);
    
    return (
      <div className="report-section">
        <h3>🏆 By Partner Tier</h3>
        <table className="report-table sortable">
          <thead>
            <tr>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'name')}>
                Tier <SortIcon field="name" currentSort={tierSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'requirement')}>
                NPCU Req. <SortIcon field="requirement" currentSort={tierSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'total')}>
                Contacts <SortIcon field="total" currentSort={tierSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'inNorthpass')}>
                In Northpass <SortIcon field="inNorthpass" currentSort={tierSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'certified')}>
                Certified <SortIcon field="certified" currentSort={tierSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'totalNPCU')}>
                Total NPCU <SortIcon field="totalNPCU" currentSort={tierSort} />
              </th>
              <th className="sortable-header" onClick={() => toggleSort(tierSort, setTierSort, 'partnerCount')}>
                Partners <SortIcon field="partnerCount" currentSort={tierSort} />
              </th>
              <th>% Certified</th>
            </tr>
          </thead>
          <tbody>
            {sortedTiers.map(([tier, data]) => (
                <tr key={tier} className={`tier-${tier.toLowerCase()}`}>
                  <td className="tier-name">
                    <span className={`tier-badge tier-${tier.toLowerCase()}`}>{tier}</span>
                  </td>
                  <td className="npcu-req">{data.requirement || 'N/A'}</td>
                  <td>{data.total}</td>
                  <td>{data.inNorthpass}</td>
                  <td>{data.certified}</td>
                  <td className="npcu-value">{data.totalNPCU || 0}</td>
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
  };

  const renderCertificationsTab = () => (
    <div className="report-section">
      <h3>📜 Certification Gap Analysis</h3>
      <p className="section-desc">See which certifications have the most/least coverage across your partner contacts.</p>
      
      <div className="cert-categories">
        {Object.entries(reportData.certificationGaps).map(([category, data]) => (
          <div key={category} className="cert-category-card">
            <h4>{category}</h4>
            <div className="cert-list">
              {Object.entries(data.byCertification).map(([level, count]) => (
                <div key={level} className="cert-item">
                  <span className="cert-name">{level}</span>
                  <div className="cert-bar-container">
                    <div 
                      className="cert-bar" 
                      style={{ 
                        width: `${Math.min(count / Math.max(reportData.overallStats.inNorthpass, 1) * 100 * 5, 100)}%`,
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
      
      {/* Show discovered course names for debugging */}
      {reportData.allCourseNames && reportData.allCourseNames.length > 0 && (
        <details className="course-names-debug">
          <summary>📚 Discovered Course Names ({reportData.allCourseNames.length})</summary>
          <ul className="course-list">
            {reportData.allCourseNames.sort().map((name, idx) => (
              <li key={idx}>{name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );

  const renderComplianceTab = () => {
    const partners = Object.entries(reportData.byPartner);
    const compliantPartners = partners.filter(([, data]) => data.isCompliant);
    const nonCompliantPartners = partners.filter(([, data]) => !data.isCompliant && data.requirement > 0);
    const unknownTierPartners = partners.filter(([, data]) => !data.requirement || data.requirement === 0);
    
    return (
      <div className="report-section">
        <h3>✅ Partner Tier Compliance Summary</h3>
        
        <div className="compliance-summary">
          <div className="compliance-stat compliant">
            <span className="stat-value">{compliantPartners.length}</span>
            <span className="stat-label">Compliant Partners</span>
          </div>
          <div className="compliance-stat non-compliant">
            <span className="stat-value">{nonCompliantPartners.length}</span>
            <span className="stat-label">Non-Compliant Partners</span>
          </div>
          <div className="compliance-stat unknown">
            <span className="stat-value">{unknownTierPartners.length}</span>
            <span className="stat-label">Unknown Tier</span>
          </div>
        </div>
        
        {/* Non-Compliant Partners (Priority) */}
        {nonCompliantPartners.length > 0 && (
          <>
            <h4>❌ Non-Compliant Partners ({nonCompliantPartners.length})</h4>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Tier</th>
                  <th>Current NPCU</th>
                  <th>Required</th>
                  <th>Gap</th>
                  <th>Contacts</th>
                </tr>
              </thead>
              <tbody>
                {nonCompliantPartners
                  .sort((a, b) => (b[1].npcuGap || 0) - (a[1].npcuGap || 0))
                  .map(([partner, data]) => (
                    <tr key={partner} className="non-compliant-row">
                      <td className="partner-name">{partner}</td>
                      <td>
                        <span className={`tier-badge tier-${(data.tier || '').toLowerCase()}`}>
                          {data.tier}
                        </span>
                      </td>
                      <td className="npcu-value">{data.totalNPCU || 0}</td>
                      <td className="npcu-req">{data.requirement}</td>
                      <td className="npcu-gap">-{data.npcuGap}</td>
                      <td>{data.total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
        
        {/* Compliant Partners */}
        {compliantPartners.length > 0 && (
          <>
            <h4>✅ Compliant Partners ({compliantPartners.length})</h4>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Tier</th>
                  <th>Current NPCU</th>
                  <th>Required</th>
                  <th>Surplus</th>
                  <th>Contacts</th>
                </tr>
              </thead>
              <tbody>
                {compliantPartners
                  .sort((a, b) => (b[1].totalNPCU || 0) - (a[1].totalNPCU || 0))
                  .slice(0, 50)
                  .map(([partner, data]) => (
                    <tr key={partner} className="compliant-row">
                      <td className="partner-name">{partner}</td>
                      <td>
                        <span className={`tier-badge tier-${(data.tier || '').toLowerCase()}`}>
                          {data.tier}
                        </span>
                      </td>
                      <td className="npcu-value">{data.totalNPCU || 0}</td>
                      <td className="npcu-req">{data.requirement}</td>
                      <td className="npcu-surplus">+{(data.totalNPCU || 0) - data.requirement}</td>
                      <td>{data.total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {compliantPartners.length > 50 && (
              <p className="table-note">Showing top 50 compliant partners. Export to Excel for full list.</p>
            )}
          </>
        )}
      </div>
    );
  };

  const renderPartnersTab = () => {
    const sortedPartners = sortData(reportData.byPartner, partnerSort);
    const totalPages = Math.ceil(sortedPartners.length / ITEMS_PER_PAGE);
    const startIdx = (partnerPage - 1) * ITEMS_PER_PAGE;
    const paginatedPartners = sortedPartners.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    
    return (
      <div className="report-section">
        <h3>🏢 By Partner ({sortedPartners.length} total)</h3>
        
        <div className="partners-table-container">
          <table className="report-table sortable">
            <thead>
              <tr>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'name')}>
                  Partner <SortIcon field="name" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'region')}>
                  Region <SortIcon field="region" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'tier')}>
                  Tier <SortIcon field="tier" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'totalNPCU')}>
                  NPCU <SortIcon field="totalNPCU" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'requirement')}>
                  Required <SortIcon field="requirement" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'isCompliant')}>
                  Status <SortIcon field="isCompliant" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'total')}>
                  Contacts <SortIcon field="total" currentSort={partnerSort} />
                </th>
                <th className="sortable-header" onClick={() => toggleSort(partnerSort, setPartnerSort, 'certified')}>
                  Certified <SortIcon field="certified" currentSort={partnerSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedPartners.map(([partner, data]) => (
                  <tr key={partner} className={data.isCompliant ? 'compliant' : 'non-compliant'}>
                    <td className="partner-name">{partner}</td>
                    <td>{data.region}</td>
                    <td>
                      <span className={`tier-badge tier-${(data.tier || '').toLowerCase()}`}>
                        {data.tier || 'N/A'}
                      </span>
                    </td>
                    <td className="npcu-value">{data.totalNPCU || 0}</td>
                    <td className="npcu-req">{data.requirement || 0}</td>
                    <td>
                      {data.requirement > 0 ? (
                        <span className={`compliance-badge ${data.isCompliant ? 'compliant' : 'non-compliant'}`}>
                          {data.isCompliant ? '✅ Compliant' : `❌ Need ${data.npcuGap} more`}
                        </span>
                      ) : (
                        <span className="compliance-badge neutral">N/A</span>
                      )}
                    </td>
                    <td>{data.total}</td>
                    <td>
                      <div className="progress-cell">
                        <div 
                          className="progress-bar-mini" 
                          style={{ width: `${data.total > 0 ? (data.certified / data.total * 100) : 0}%` }}
                        />
                        <span>{data.certified}/{data.total}</span>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button 
              className="page-btn" 
              onClick={() => setPartnerPage(1)} 
              disabled={partnerPage === 1}
            >
              ⏮ First
            </button>
            <button 
              className="page-btn" 
              onClick={() => setPartnerPage(p => Math.max(1, p - 1))} 
              disabled={partnerPage === 1}
            >
              ◀ Prev
            </button>
            <span className="page-info">
              Page {partnerPage} of {totalPages} ({sortedPartners.length} partners)
            </span>
            <button 
              className="page-btn" 
              onClick={() => setPartnerPage(p => Math.min(totalPages, p + 1))} 
              disabled={partnerPage === totalPages}
            >
              Next ▶
            </button>
            <button 
              className="page-btn" 
              onClick={() => setPartnerPage(totalPages)} 
              disabled={partnerPage === totalPages}
            >
              Last ⏭
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="partner-reporting-content">
      <div className="reporting-header">
        <div className="header-content">
          <h1>📊 Partner Reporting & Analytics</h1>
          <p>Generate comprehensive reports by Region, Tier, and Certification coverage.</p>
        </div>
      </div>

      {/* Data Source Selection */}
      <div className="report-section data-source-section">
        <h2>Step 1: Select Data Source</h2>
        
        {/* Database Option */}
        <div className={`source-option ${dbAvailable ? 'available' : 'unavailable'}`}>
          <div className="source-header">
            <span className="source-icon">💾</span>
            <div className="source-info">
              <h3>Use Imported Database</h3>
              {dbAvailable && dbMetadata ? (
                <p className="source-status success">
                  ✅ {dbMetadata.totalContacts?.toLocaleString()} contacts loaded from "{dbMetadata.fileName}"
                  <span className="import-date">
                    (imported {new Date(dbMetadata.importDate).toLocaleDateString()})
                  </span>
                </p>
              ) : (
                <p className="source-status warning">
                  ⚠️ No data imported. <a href="/admin/data">Import data first</a>
                </p>
              )}
            </div>
          </div>
          {dbAvailable && (
            <NintexButton 
              variant="primary"
              onClick={() => generateReport(true)}
              disabled={loading}
            >
              {loading && dataSource === 'database' ? `🔄 ${progressMessage || 'Generating...'}` : '📊 Generate Report from Database'}
            </NintexButton>
          )}
        </div>

        {/* Divider */}
        <div className="source-divider">
          <span>OR</span>
        </div>

        {/* File Upload Option */}
        <div className="source-option">
          <div className="source-header">
            <span className="source-icon">📁</span>
            <div className="source-info">
              <h3>Upload Excel File</h3>
              <p className="source-desc">Upload a new file for one-time report generation</p>
            </div>
          </div>
          
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
      </div>

      {/* Column Mapping - only show for file upload */}
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
            onClick={() => generateReport(false)}
            disabled={!columnMapping.email || !columnMapping.partner || loading}
          >
            {loading && dataSource === 'file' ? `🔄 ${progressMessage || 'Generating...'}` : '📊 Generate Report from File'}
          </NintexButton>
          
          {/* Progress Indicator */}
          {loading && progressPercent > 0 && (
            <div className="analysis-progress">
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="progress-text">
                <span className="progress-spinner"></span>
                Processing {processedCount} of {totalToProcess} contacts ({Math.round(progressPercent)}%)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report Results */}
      {reportGenerated && (
        <>
          <div className="report-tabs">
            {[
              { id: 'overview', label: '📊 Overview' },
              { id: 'compliance', label: '✅ Compliance' },
              { id: 'region', label: '🌍 By Region' },
              { id: 'tier', label: '🏆 By Tier' },
              { id: 'certifications', label: '📜 Certifications' },
              { id: 'partners', label: '🏢 Partners' }
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
            {activeTab === 'compliance' && renderComplianceTab()}
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
