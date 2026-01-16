/**
 * Export Service - Excel and PDF exports for partner certification data
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Nintex brand colors
const NINTEX_ORANGE = '#FF6B35';
const NINTEX_PURPLE = '#6B4C9A';
const NINTEX_DARK = '#333333';

// Signature image path (PNG with transparent background)
const SIGNATURE_IMAGE_PATH = '/dan-stoll-signature-transparent.png';

// Helper to load image as base64 for PDF embedding
const loadImageAsBase64 = async (imagePath) => {
  try {
    const response = await fetch(imagePath);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Could not load signature image:', error);
    return null;
  }
};

/**
 * Export certified users to Excel (XLSX)
 */
export function exportToExcel(data, filename = 'certification-report') {
  const { groupName, tier, users, inProgressUsers = [], totals, certificationBreakdown, categoryLabels } = data;
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // === Sheet 1: Summary ===
  const summaryData = [
    ['Partner Certification Report'],
    [''],
    ['Partner Name:', groupName],
    ['Partner Tier:', tier],
    ['Report Generated:', new Date().toLocaleString()],
    [''],
    ['Summary Statistics'],
    ['Total Certified Users:', totals?.certifiedUsers || users.length],
    ['Total NPCU Points:', totals?.totalNPCU || 0],
    ['Total Certifications:', totals?.totalCertifications || 0],
    [''],
    ['Certification Breakdown by Category'],
  ];
  
  // Add category breakdown
  if (certificationBreakdown) {
    Object.entries(certificationBreakdown).forEach(([key, stats]) => {
      if (stats.count > 0) {
        const label = categoryLabels?.[key] || stats.label || key;
        summaryData.push([label, `${stats.count} certs, ${stats.npcu} NPCU`]);
      }
    });
  }
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  
  // === Sheet 2: Certified Users ===
  const userHeaders = [
    'Name',
    'Email',
    'Total NPCU',
    'Certifications',
    'Last Login',
    'Certification Details'
  ];
  
  const userData = users.map(user => [
    user.name,
    user.email,
    user.totalNPCU,
    user.certificationCount,
    user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never',
    user.certifications?.map(c => c.name).join('; ') || ''
  ]);
  
  const usersSheet = XLSX.utils.aoa_to_sheet([userHeaders, ...userData]);
  usersSheet['!cols'] = [
    { wch: 25 }, // Name
    { wch: 35 }, // Email
    { wch: 12 }, // NPCU
    { wch: 15 }, // Certifications
    { wch: 15 }, // Last Login
    { wch: 60 }  // Details
  ];
  XLSX.utils.book_append_sheet(wb, usersSheet, 'Certified Users');
  
  // === Sheet 3: All Certifications (detailed) ===
  const certHeaders = [
    'User Name',
    'User Email',
    'Certification Name',
    'Category',
    'NPCU Value',
    'Completed Date',
    'Expiry Date',
    'Status'
  ];
  
  const certData = [];
  users.forEach(user => {
    user.certifications?.forEach(cert => {
      const isExpired = cert.expiresAt && new Date(cert.expiresAt) < new Date();
      certData.push([
        user.name,
        user.email,
        cert.name,
        cert.categoryLabel || cert.category || 'Nintex CE',
        cert.npcu,
        cert.completedAt ? new Date(cert.completedAt).toLocaleDateString() : '',
        cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString() : 'No Expiry',
        isExpired ? 'EXPIRED' : 'Active'
      ]);
    });
  });
  
  const certsSheet = XLSX.utils.aoa_to_sheet([certHeaders, ...certData]);
  certsSheet['!cols'] = [
    { wch: 25 }, // User Name
    { wch: 35 }, // User Email
    { wch: 50 }, // Cert Name
    { wch: 20 }, // Category
    { wch: 10 }, // NPCU
    { wch: 15 }, // Completed
    { wch: 15 }, // Expiry
    { wch: 10 }  // Status
  ];
  XLSX.utils.book_append_sheet(wb, certsSheet, 'All Certifications');
  
  // === Sheet 4: In-Progress Learners ===
  if (inProgressUsers && inProgressUsers.length > 0) {
    const inProgressHeaders = [
      'Name',
      'Email',
      'Courses In Progress',
      'Certification Courses',
      'Potential NPCU',
      'Last Login',
      'Course Details'
    ];
    
    const inProgressData = inProgressUsers.map(user => {
      const courses = user.inProgressList || [];
      const certCourses = courses.filter(c => c.isCertification);
      const potentialNPCU = certCourses.reduce((sum, c) => sum + (c.npcu || 0), 0);
      
      return [
        user.name,
        user.email,
        user.inProgressCourses || courses.length,
        certCourses.length,
        potentialNPCU,
        user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never',
        courses.map(c => c.name).join('; ') || ''
      ];
    });
    
    const inProgressSheet = XLSX.utils.aoa_to_sheet([inProgressHeaders, ...inProgressData]);
    inProgressSheet['!cols'] = [
      { wch: 25 }, // Name
      { wch: 35 }, // Email
      { wch: 18 }, // Courses In Progress
      { wch: 18 }, // Cert Courses
      { wch: 15 }, // Potential NPCU
      { wch: 15 }, // Last Login
      { wch: 60 }  // Details
    ];
    XLSX.utils.book_append_sheet(wb, inProgressSheet, 'In Progress');
  }
  
  // Generate file
  const timestamp = new Date().toISOString().split('T')[0];
  const safeGroupName = groupName.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `${filename}_${safeGroupName}_${timestamp}.xlsx`);
}

/**
 * Generate official PDF certification report
 */
export async function exportToPDF(data, filename = 'certification-letter') {
  const { groupName, tier, users, inProgressUsers = [], totals, certificationBreakdown, categoryLabels } = data;
  
  // Load signature image
  const signatureImage = await loadImageAsBase64(SIGNATURE_IMAGE_PATH);
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;
  
  // Helper function to add new page if needed
  const checkPageBreak = (neededSpace = 30) => {
    if (yPos + neededSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      addHeader();
      return true;
    }
    return false;
  };
  
  // Helper to draw header on each page
  const addHeader = () => {
    // Nintex purple bar at top
    doc.setFillColor(107, 76, 154); // Nintex Purple
    doc.rect(0, 0, pageWidth, 8, 'F');
    
    // Orange accent line
    doc.setFillColor(255, 107, 53); // Nintex Orange
    doc.rect(0, 8, pageWidth, 2, 'F');
  };
  
  // Add header to first page
  addHeader();
  yPos = 20;
  
  // === NINTEX LOGO / TITLE SECTION ===
  doc.setFontSize(24);
  doc.setTextColor(107, 76, 154);
  doc.setFont('helvetica', 'bold');
  doc.text('NINTEX', margin, yPos);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('Partner Network', margin + 38, yPos);
  
  yPos += 15;
  
  // === OFFICIAL LETTER HEADER ===
  doc.setFontSize(18);
  doc.setTextColor(51, 51, 51);
  doc.setFont('helvetica', 'bold');
  doc.text('Partner Certification Report', margin, yPos);
  
  yPos += 8;
  
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`, margin, yPos);
  
  yPos += 15;
  
  // === TO / FROM SECTION ===
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.setFont('helvetica', 'bold');
  doc.text('To Whom It May Concern,', margin, yPos);
  
  yPos += 10;
  
  // === LETTER BODY ===
  doc.setFont('helvetica', 'normal');
  const letterText = `This letter certifies the Nintex product certifications held by employees of ${groupName}. As a ${tier} Partner in the Nintex Partner Network, ${groupName} has demonstrated commitment to excellence through their certified team members.`;
  
  const splitLetter = doc.splitTextToSize(letterText, pageWidth - (margin * 2));
  doc.text(splitLetter, margin, yPos);
  yPos += splitLetter.length * 6 + 5;
  
  // === SUMMARY BOX ===
  doc.setFillColor(245, 245, 250);
  doc.setDrawColor(107, 76, 154);
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 28, 3, 3, 'FD');
  
  yPos += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 76, 154);
  doc.text('Certification Summary', margin + 5, yPos);
  
  yPos += 7;
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.setFont('helvetica', 'normal');
  
  const summaryItems = [
    `Partner: ${groupName}`,
    `Tier: ${tier}`,
    `Certified Employees: ${users.length}`,
    `Total NPCU Points: ${totals?.totalNPCU || 0}`
  ];
  doc.text(summaryItems.join('   |   '), margin + 5, yPos);
  
  yPos += 18;
  
  // === CATEGORY BREAKDOWN ===
  if (certificationBreakdown) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 51, 51);
    doc.text('Certifications by Product Category:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    Object.entries(certificationBreakdown).forEach(([key, stats]) => {
      if (stats.count > 0) {
        const label = categoryLabels?.[key] || stats.label || key;
        doc.setTextColor(107, 76, 154);
        doc.text('•', margin + 2, yPos);
        doc.setTextColor(51, 51, 51);
        doc.text(`${label}: ${stats.count} certifications (${stats.npcu} NPCU)`, margin + 7, yPos);
        yPos += 5;
      }
    });
    
    yPos += 8;
  }
  
  // === CERTIFIED EMPLOYEES TABLE ===
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 51, 51);
  doc.text('Certified Team Members:', margin, yPos);
  yPos += 5;
  
  // Build table data
  const tableData = [];
  users.forEach(user => {
    user.certifications?.forEach((cert, idx) => {
      const completedDate = cert.completedAt 
        ? new Date(cert.completedAt).toLocaleDateString() 
        : 'N/A';
      const expiryDate = cert.expiresAt 
        ? new Date(cert.expiresAt).toLocaleDateString() 
        : 'No Expiry';
      const isExpired = cert.expiresAt && new Date(cert.expiresAt) < new Date();
      
      tableData.push([
        idx === 0 ? user.name : '',
        cert.name,
        cert.categoryLabel || cert.category || 'Nintex CE',
        cert.npcu,
        completedDate,
        isExpired ? 'EXPIRED' : expiryDate
      ]);
    });
  });
  
  // Add table using autoTable
  autoTable(doc, {
    startY: yPos,
    head: [['Employee', 'Certification', 'Category', 'NPCU', 'Date Obtained', 'Expiry']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [107, 76, 154],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 51, 51]
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 55 },
      2: { cellWidth: 28 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' }
    },
    alternateRowStyles: {
      fillColor: [250, 250, 255]
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Add header on new pages
      if (data.pageNumber > 1) {
        addHeader();
      }
    }
  });
  
  yPos = doc.lastAutoTable.finalY + 15;
  checkPageBreak(50);
  
  // === IN-PROGRESS LEARNERS SECTION ===
  if (inProgressUsers && inProgressUsers.length > 0) {
    checkPageBreak(40);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(107, 76, 154);
    doc.text(`Learning In Progress (${inProgressUsers.length} team members):`, margin, yPos);
    yPos += 5;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Team members actively enrolled in courses who have not yet earned certifications.', margin, yPos);
    yPos += 6;
    
    // Build in-progress table data
    const inProgressTableData = [];
    inProgressUsers.forEach(user => {
      const courses = user.inProgressList || [];
      const certCourses = courses.filter(c => c.isCertification);
      const potentialNPCU = certCourses.reduce((sum, c) => sum + (c.npcu || 0), 0);
      
      if (courses.length > 0) {
        courses.forEach((course, idx) => {
          inProgressTableData.push([
            idx === 0 ? user.name : '',
            course.name,
            course.isCertification ? 'Yes' : 'No',
            course.isCertification ? course.npcu : '-',
            idx === 0 && potentialNPCU > 0 ? `+${potentialNPCU}` : ''
          ]);
        });
      } else {
        inProgressTableData.push([user.name, '(Enrolled courses)', '-', '-', '']);
      }
    });
    
    // Add in-progress table
    autoTable(doc, {
      startY: yPos,
      head: [['Team Member', 'Course In Progress', 'Cert?', 'NPCU', 'Potential']],
      body: inProgressTableData,
      theme: 'striped',
      headStyles: {
        fillColor: [107, 76, 154],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [51, 51, 51]
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 80 },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 20, halign: 'center', textColor: [255, 107, 53], fontStyle: 'bold' }
      },
      alternateRowStyles: {
        fillColor: [248, 245, 255]
      },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          addHeader();
        }
      }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
  }
  
  checkPageBreak(50);
  
  // === SIGNATURE SECTION ===
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  
  const closingText = `This certification report is provided as official documentation of the professional qualifications held by ${groupName}'s team members. For verification or additional information, please contact the Nintex Partner Network team.`;
  
  const splitClosing = doc.splitTextToSize(closingText, pageWidth - (margin * 2));
  doc.text(splitClosing, margin, yPos);
  yPos += splitClosing.length * 6 + 15;
  
  checkPageBreak(45);
  
  // Signature
  doc.setFont('helvetica', 'normal');
  doc.text('Sincerely,', margin, yPos);
  yPos += 8;
  
  // Add signature image if available
  if (signatureImage) {
    try {
      doc.addImage(signatureImage, 'PNG', margin, yPos, 40, 26);
      yPos += 30;
    } catch (e) {
      console.warn('Could not add signature image to PDF:', e);
      // Fallback to signature line
      doc.setDrawColor(51, 51, 51);
      doc.line(margin, yPos + 5, margin + 50, yPos + 5);
      yPos += 10;
    }
  } else {
    // Fallback to signature line if image not loaded
    doc.setDrawColor(51, 51, 51);
    doc.line(margin, yPos + 5, margin + 50, yPos + 5);
    yPos += 10;
  }
  
  doc.setFont('helvetica', 'bold');
  doc.text('Dan Stoll', margin, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Director of Channel Enablement', margin, yPos);
  yPos += 4;
  doc.text('Nintex Partner Network', margin, yPos);
  
  // === FOOTER ===
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Footer line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    
    // Footer text
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text('Nintex Partner Network | www.nintex.com/partners', margin, pageHeight - 10);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 10);
    
    // Confidential notice
    doc.setFontSize(7);
    doc.text('This document is provided for tender/RFP purposes. Certification data is current as of the report generation date.', 
      pageWidth / 2, pageHeight - 5, { align: 'center' });
  }
  
  // Save the PDF
  const timestamp = new Date().toISOString().split('T')[0];
  const safeGroupName = groupName.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${filename}_${safeGroupName}_${timestamp}.pdf`);
}

export default {
  exportToExcel,
  exportToPDF
};
