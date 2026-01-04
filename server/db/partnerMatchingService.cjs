/**
 * Partner-Group Matching Service
 * Improved matching logic to link LMS groups to partners
 */

const { query } = require('./connection.cjs');

/**
 * Normalize a name for comparison
 * Handles: ptr_ prefix, case, special chars, common suffixes
 */
function normalizeName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/^ptr_/i, '')                    // Remove ptr_ prefix
    .replace(/\s*\(.*?\)\s*/g, '')           // Remove parenthetical notes
    .replace(/[^\w\s]/g, ' ')                 // Remove special chars
    .replace(/\s+/g, ' ')                     // Normalize whitespace
    .replace(/\b(inc|llc|ltd|pty|gmbh|sa|ag|co|corp|corporation|company|limited|incorporated)\b/gi, '')  // Remove legal suffixes
    .trim();
}

/**
 * Calculate similarity score between two strings
 * Uses Levenshtein distance normalized by length
 */
function similarity(str1, str2) {
  const s1 = normalizeName(str1);
  const s2 = normalizeName(str2);
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer;
  }
  
  // Levenshtein distance
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - (distance / maxLen);
}

/**
 * Find the best matching partner for a group name
 * Returns { partner_id, partner_name, score, match_type }
 */
async function findBestPartnerMatch(groupName, partners = null) {
  // Load partners if not provided
  if (!partners) {
    partners = await query('SELECT id, account_name FROM partners');
  }
  
  const normalizedGroup = normalizeName(groupName);
  let bestMatch = null;
  let bestScore = 0;
  let matchType = 'none';
  
  for (const partner of partners) {
    const normalizedPartner = normalizeName(partner.account_name);
    
    // Exact match (after normalization)
    if (normalizedGroup === normalizedPartner) {
      return {
        partner_id: partner.id,
        partner_name: partner.account_name,
        score: 1.0,
        match_type: 'exact'
      };
    }
    
    // Check for ptr_ prefix match
    const ptrName = groupName.replace(/^ptr_/i, '').toLowerCase().trim();
    if (ptrName === partner.account_name.toLowerCase().trim()) {
      return {
        partner_id: partner.id,
        partner_name: partner.account_name,
        score: 0.99,
        match_type: 'ptr_prefix'
      };
    }
    
    // Similarity check
    const score = similarity(groupName, partner.account_name);
    if (score > bestScore && score >= 0.85) {  // 85% threshold
      bestScore = score;
      bestMatch = partner;
      matchType = 'fuzzy';
    }
  }
  
  if (bestMatch) {
    return {
      partner_id: bestMatch.id,
      partner_name: bestMatch.account_name,
      score: bestScore,
      match_type: matchType
    };
  }
  
  return null;
}

/**
 * Run automatic matching for all unlinked groups
 * Returns stats on matches made
 */
async function autoMatchGroups(minScore = 0.85, dryRun = false) {
  console.log(`🔗 Auto-matching groups to partners (minScore: ${minScore}, dryRun: ${dryRun})...`);
  
  const stats = {
    total: 0,
    matched: 0,
    skipped: 0,
    failed: 0,
    matches: []
  };
  
  // Get all unlinked groups
  const unlinkedGroups = await query('SELECT id, name FROM lms_groups WHERE partner_id IS NULL');
  stats.total = unlinkedGroups.length;
  console.log(`📋 Found ${unlinkedGroups.length} unlinked groups`);
  
  // Load all partners once
  const partners = await query('SELECT id, account_name FROM partners');
  console.log(`📋 Loaded ${partners.length} partners for matching`);
  
  for (const group of unlinkedGroups) {
    // Skip system groups
    const lowerName = group.name.toLowerCase();
    if (lowerName.includes('all partner') || 
        lowerName.includes('all user') ||
        lowerName.includes('admin') ||
        lowerName.includes('internal') ||
        lowerName === 'test') {
      stats.skipped++;
      continue;
    }
    
    const match = await findBestPartnerMatch(group.name, partners);
    
    if (match && match.score >= minScore) {
      stats.matches.push({
        group_id: group.id,
        group_name: group.name,
        partner_id: match.partner_id,
        partner_name: match.partner_name,
        score: match.score,
        match_type: match.match_type
      });
      
      if (!dryRun) {
        try {
          await query('UPDATE lms_groups SET partner_id = ? WHERE id = ?', [match.partner_id, group.id]);
          stats.matched++;
          console.log(`  ✓ ${group.name} → ${match.partner_name} (${(match.score * 100).toFixed(1)}%)`);
        } catch (err) {
          stats.failed++;
          console.error(`  ✗ Failed to link ${group.name}: ${err.message}`);
        }
      } else {
        stats.matched++;
        console.log(`  [DRY RUN] ${group.name} → ${match.partner_name} (${(match.score * 100).toFixed(1)}%)`);
      }
    }
  }
  
  console.log(`\n✅ Matching complete: ${stats.matched} matched, ${stats.skipped} skipped (system), ${stats.failed} failed`);
  return stats;
}

/**
 * Get matching suggestions for unlinked groups
 * Returns potential matches for manual review
 */
async function getMatchingSuggestions(minScore = 0.5) {
  const suggestions = [];
  
  const unlinkedGroups = await query('SELECT id, name, user_count FROM lms_groups WHERE partner_id IS NULL ORDER BY user_count DESC');
  const partners = await query('SELECT id, account_name FROM partners');
  
  for (const group of unlinkedGroups) {
    const lowerName = group.name.toLowerCase();
    // Skip system groups
    if (lowerName.includes('all partner') || 
        lowerName.includes('all user') ||
        lowerName.includes('admin') ||
        lowerName === 'test') {
      continue;
    }
    
    const match = await findBestPartnerMatch(group.name, partners);
    
    suggestions.push({
      group_id: group.id,
      group_name: group.name,
      user_count: group.user_count,
      best_match: match ? {
        partner_id: match.partner_id,
        partner_name: match.partner_name,
        score: match.score,
        match_type: match.match_type
      } : null
    });
  }
  
  return suggestions;
}

/**
 * Manually link a group to a partner
 */
async function linkGroupToPartner(groupId, partnerId) {
  const result = await query('UPDATE lms_groups SET partner_id = ? WHERE id = ?', [partnerId, groupId]);
  return result.affectedRows > 0;
}

/**
 * Unlink a group from its partner
 */
async function unlinkGroup(groupId) {
  const result = await query('UPDATE lms_groups SET partner_id = NULL WHERE id = ?', [groupId]);
  return result.affectedRows > 0;
}

/**
 * Get matching statistics
 */
async function getMatchingStats() {
  const [linked] = await query('SELECT COUNT(*) as count FROM lms_groups WHERE partner_id IS NOT NULL');
  const [unlinked] = await query('SELECT COUNT(*) as count FROM lms_groups WHERE partner_id IS NULL');
  const [partnersWithGroups] = await query('SELECT COUNT(DISTINCT partner_id) as count FROM lms_groups WHERE partner_id IS NOT NULL');
  const [partnersWithoutGroups] = await query(`
    SELECT COUNT(*) as count FROM partners p 
    WHERE NOT EXISTS (SELECT 1 FROM lms_groups g WHERE g.partner_id = p.id)
  `);
  
  return {
    groups_linked: linked.count,
    groups_unlinked: unlinked.count,
    partners_with_groups: partnersWithGroups.count,
    partners_without_groups: partnersWithoutGroups.count
  };
}

module.exports = {
  normalizeName,
  similarity,
  findBestPartnerMatch,
  autoMatchGroups,
  getMatchingSuggestions,
  linkGroupToPartner,
  unlinkGroup,
  getMatchingStats
};
