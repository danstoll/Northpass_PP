/**
 * Partner Dashboard Database Service
 * Fetches partner certification data from local MariaDB instead of Northpass API
 */

const API_BASE = '/api/db';

/**
 * Find a partner by name or ID
 */
export async function findPartner(identifier, isId = false) {
  try {
    let url;
    if (isId) {
      url = `${API_BASE}/partners?search=${encodeURIComponent(identifier)}`;
    } else {
      url = `${API_BASE}/partners?search=${encodeURIComponent(identifier)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch partners');
    
    const partners = await response.json();
    
    // Find exact match first, then partial
    const exactMatch = partners.find(p => 
      p.account_name.toLowerCase() === identifier.toLowerCase()
    );
    
    if (exactMatch) return exactMatch;
    
    // Return first partial match
    return partners.length > 0 ? partners[0] : null;
  } catch (error) {
    console.error('Error finding partner:', error);
    throw error;
  }
}

/**
 * Get partner dashboard data using the consolidated endpoint
 * This is the recommended method - single API call for all data
 */
export async function getPartnerDashboard(partnerName, tier = null) {
  try {
    let url = `${API_BASE}/dashboard/partner?name=${encodeURIComponent(partnerName)}`;
    if (tier) {
      url += `&tier=${encodeURIComponent(tier)}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error(`Partner "${partnerName}" not found in database`);
      }
      throw new Error(errorData.error || 'Failed to fetch partner dashboard');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching partner dashboard:', error);
    throw error;
  }
}

/**
 * Get partner certification summary
 */
export async function getPartnerCertifications(partnerId) {
  try {
    const response = await fetch(`${API_BASE}/partners/${partnerId}/certifications`);
    if (!response.ok) throw new Error('Failed to fetch partner certifications');
    return await response.json();
  } catch (error) {
    console.error('Error fetching partner certifications:', error);
    throw error;
  }
}

/**
 * Get contacts for a partner with their LMS data
 */
export async function getPartnerContacts(partnerId) {
  try {
    const response = await fetch(`${API_BASE}/partners/${partnerId}/contacts`);
    if (!response.ok) throw new Error('Failed to fetch partner contacts');
    return await response.json();
  } catch (error) {
    console.error('Error fetching partner contacts:', error);
    throw error;
  }
}

/**
 * Get user details with enrollments
 */
export async function getUserDetails(userId) {
  try {
    const response = await fetch(`${API_BASE}/lms/users/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch user details');
    return await response.json();
  } catch (error) {
    console.error('Error fetching user details:', error);
    throw error;
  }
}

/**
 * Get all partner data for dashboard - combines multiple queries
 */
export async function getPartnerDashboardData(partnerNameOrId) {
  try {
    // Step 1: Find the partner
    const partner = await findPartner(partnerNameOrId);
    if (!partner) {
      throw new Error(`Partner "${partnerNameOrId}" not found`);
    }
    
    console.log(`✅ Found partner: ${partner.account_name} (ID: ${partner.id})`);
    
    // Step 2: Get certification summary
    let certSummary = null;
    try {
      certSummary = await getPartnerCertifications(partner.id);
    } catch (e) {
      console.warn('Could not fetch certification summary:', e.message);
    }
    
    // Step 3: Get contacts with LMS links
    const contacts = await getPartnerContacts(partner.id);
    console.log(`📊 Found ${contacts.length} contacts`);
    
    // Step 4: Get detailed enrollment data for users with LMS accounts
    const usersWithLms = contacts.filter(c => c.lms_user_id);
    console.log(`👥 ${usersWithLms.length} contacts have LMS accounts`);
    
    const userDetails = [];
    for (const contact of usersWithLms) {
      try {
        const details = await getUserDetails(contact.lms_user_id);
        userDetails.push({
          contact,
          ...details
        });
      } catch (err) {
        console.warn(`Could not fetch details for user ${contact.lms_user_id}:`, err.message);
        userDetails.push({
          contact,
          user: null,
          enrollments: [],
          groups: []
        });
      }
    }
    
    // Step 5: Calculate dashboard statistics
    const stats = calculateDashboardStats(userDetails, contacts.length);
    
    return {
      partner,
      certSummary,
      contacts,
      users: userDetails,
      stats
    };
  } catch (error) {
    console.error('Error loading partner dashboard data:', error);
    throw error;
  }
}

/**
 * Calculate dashboard statistics from user data
 */
function calculateDashboardStats(userDetails, totalContacts) {
  let totalEnrollments = 0;
  let totalCompleted = 0;
  let totalInProgress = 0;
  let totalNpcu = 0;
  let activeNpcu = 0;
  
  const categoryStats = {};
  const courseStats = {};
  
  for (const userData of userDetails) {
    const enrollments = userData.enrollments || [];
    
    for (const enrollment of enrollments) {
      totalEnrollments++;
      
      if (enrollment.status === 'completed') {
        totalCompleted++;
        
        // Check if still active (not expired)
        const isExpired = enrollment.expires_at && new Date(enrollment.expires_at) < new Date();
        const npcuValue = enrollment.npcu_value || 0;
        
        totalNpcu += npcuValue;
        if (!isExpired) {
          activeNpcu += npcuValue;
        }
        
        // Track by course
        const courseName = enrollment.course_name || 'Unknown';
        if (!courseStats[courseName]) {
          courseStats[courseName] = { completed: 0, inProgress: 0, npcu: npcuValue };
        }
        courseStats[courseName].completed++;
        
        // Track by category
        const category = enrollment.product_category || 'Other';
        if (!categoryStats[category]) {
          categoryStats[category] = { completed: 0, inProgress: 0, enrolled: 0 };
        }
        categoryStats[category].completed++;
        
      } else if (enrollment.status === 'in_progress' || (enrollment.progress_percent > 0 && enrollment.progress_percent < 100)) {
        totalInProgress++;
        
        const category = enrollment.product_category || 'Other';
        if (!categoryStats[category]) {
          categoryStats[category] = { completed: 0, inProgress: 0, enrolled: 0 };
        }
        categoryStats[category].inProgress++;
      } else {
        const category = enrollment.product_category || 'Other';
        if (!categoryStats[category]) {
          categoryStats[category] = { completed: 0, inProgress: 0, enrolled: 0 };
        }
        categoryStats[category].enrolled++;
      }
    }
  }
  
  return {
    totalContacts,
    usersWithLms: userDetails.length,
    totalEnrollments,
    totalCompleted,
    totalInProgress,
    totalNotStarted: totalEnrollments - totalCompleted - totalInProgress,
    totalNpcu,
    activeNpcu,
    completionRate: totalEnrollments > 0 ? Math.round((totalCompleted / totalEnrollments) * 100) : 0,
    categoryStats,
    courseStats
  };
}

/**
 * Get tier requirement
 */
export function getTierRequirement(tier) {
  const requirements = {
    'Premier': 20,
    'Select': 10,
    'Registered': 5,
    'Certified': 2
  };
  return requirements[tier] || 0;
}

/**
 * Calculate compliance status
 */
export function getComplianceStatus(activeNpcu, tier) {
  const requirement = getTierRequirement(tier);
  const gap = requirement - activeNpcu;
  
  return {
    requirement,
    activeNpcu,
    gap: Math.max(0, gap),
    isCompliant: activeNpcu >= requirement,
    compliancePercent: requirement > 0 ? Math.min(100, Math.round((activeNpcu / requirement) * 100)) : 100
  };
}

export default {
  findPartner,
  getPartnerCertifications,
  getPartnerContacts,
  getUserDetails,
  getPartnerDashboardData,
  getTierRequirement,
  getComplianceStatus
};
