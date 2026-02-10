/**
 * Offboarding Service
 * 
 * Handles LMS cleanup when partners or contacts are deactivated/removed from Impartner:
 * - When a contact is deactivated: Remove user from their partner group and "All Partners" group
 * - When a partner is deactivated: Remove all users from "All Partners" group and delete the partner's LMS group
 */

const { query } = require('./connection.cjs');
const https = require('https');
const config = require('../config.cjs');

// Northpass API Configuration
const NORTHPASS_CONFIG = {
  hostname: 'api.northpass.com',
  apiKey: config.northpass.apiKey
};

/**
 * Make a Northpass API request
 */
function makeNorthpassRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: NORTHPASS_CONFIG.hostname,
      path: path,
      method: method,
      headers: {
        'X-Api-Key': NORTHPASS_CONFIG.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 200, 201, 204 are all success
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ success: true, status: res.statusCode, data: data ? JSON.parse(data) : null });
          } catch {
            resolve({ success: true, status: res.statusCode, data: null });
          }
        } else {
          resolve({ success: false, status: res.statusCode, error: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Get the "All Partners" group ID from the database
 * Note: lms_groups.id IS the Northpass ID (varchar)
 */
async function getAllPartnersGroupId() {
  const [group] = await query(`
    SELECT id FROM lms_groups 
    WHERE LOWER(name) = 'all partners'
    LIMIT 1
  `);
  return group?.id;
}

/**
 * Remove a user from a specific LMS group
 * Uses DELETE /v2/groups/:groupId/relationships/people with user IDs
 */
async function removeUserFromGroup(userId, groupId) {
  if (!userId || !groupId) {
    return { success: false, error: 'Missing userId or groupId' };
  }

  try {
    const result = await makeNorthpassRequest(
      'DELETE',
      `/v2/groups/${groupId}/relationships/people`,
      { data: [{ type: 'people', id: String(userId) }] }
    );

    if (result.success) {
      // Also remove from local database
      await query(
        'DELETE FROM lms_group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      console.log(`   ✅ Removed user ${userId} from group ${groupId}`);
    } else {
      console.log(`   ⚠️ Failed to remove user ${userId} from group ${groupId}: ${result.status}`);
    }

    return result;
  } catch (err) {
    console.error(`   ❌ Error removing user ${userId} from group ${groupId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Remove multiple users from a group (batch)
 */
async function removeUsersFromGroup(userIds, groupId) {
  if (!userIds?.length || !groupId) {
    return { success: true, removed: 0 };
  }

  const results = { removed: 0, failed: 0, errors: [] };
  
  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    try {
      const payload = {
        data: batch.map(id => ({ type: 'people', id: String(id) }))
      };

      const result = await makeNorthpassRequest(
        'DELETE',
        `/v2/groups/${groupId}/relationships/people`,
        payload
      );

      if (result.success) {
        // Remove from local database
        await query(
          'DELETE FROM lms_group_members WHERE group_id = ? AND user_id IN (?)',
          [groupId, batch]
        );
        results.removed += batch.length;
      } else {
        // Try one by one if batch fails
        for (const userId of batch) {
          const singleResult = await removeUserFromGroup(userId, groupId);
          if (singleResult.success) {
            results.removed++;
          } else {
            results.failed++;
            results.errors.push({ userId, error: singleResult.error });
          }
        }
      }
    } catch (err) {
      results.failed += batch.length;
      results.errors.push({ batch: `${i}-${i + batch.length}`, error: err.message });
    }
  }

  return results;
}

/**
 * Delete an LMS group
 * Uses DELETE /v2/groups/:groupId
 */
async function deleteLmsGroup(groupId) {
  if (!groupId) {
    return { success: false, error: 'Missing groupId' };
  }

  try {
    const result = await makeNorthpassRequest('DELETE', `/v2/groups/${groupId}`);

    if (result.success) {
      // Remove group from local database
      await query('DELETE FROM lms_group_members WHERE group_id = ?', [groupId]);
      await query('DELETE FROM lms_groups WHERE id = ?', [groupId]);
      console.log(`   ✅ Deleted LMS group ${groupId}`);
    } else if (result.status === 404) {
      // Group doesn't exist - still clean up local DB
      await query('DELETE FROM lms_group_members WHERE group_id = ?', [groupId]);
      await query('DELETE FROM lms_groups WHERE id = ?', [groupId]);
      console.log(`   ⚠️ Group ${groupId} not found in LMS (cleaned up local DB)`);
      return { success: true, notFound: true };
    } else {
      console.log(`   ⚠️ Failed to delete group ${groupId}: ${result.status}`);
    }

    return result;
  } catch (err) {
    console.error(`   ❌ Error deleting group ${groupId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Offboard a single contact (user deactivated)
 * - Remove from partner group
 * - Remove from "All Partners" group
 */
async function offboardContact(contactId) {
  console.log(`\n🚪 Offboarding contact ${contactId}...`);
  
  const results = {
    success: true,
    contactId,
    removedFromPartnerGroup: false,
    removedFromAllPartners: false,
    errors: []
  };

  try {
    // Get contact details with LMS user ID and partner group
    // Note: lms_groups.id IS the Northpass ID (varchar, not auto-increment)
    const [contact] = await query(`
      SELECT c.id, c.email, c.lms_user_id, c.partner_id,
             p.account_name, g.id as partner_group_id
      FROM contacts c
      LEFT JOIN partners p ON p.id = c.partner_id
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE c.id = ?
    `, [contactId]);

    if (!contact) {
      results.success = false;
      results.errors.push('Contact not found');
      return results;
    }

    if (!contact.lms_user_id) {
      console.log(`   ℹ️ Contact ${contact.email} has no LMS user - no offboarding needed`);
      return results;
    }

    const lmsUserId = contact.lms_user_id;
    console.log(`   User: ${contact.email} (LMS ID: ${lmsUserId})`);

    // 1. Remove from partner group (lms_groups.id IS the Northpass ID)
    const partnerGroupId = contact.partner_group_id;
    if (partnerGroupId) {
      console.log(`   Removing from partner group: ${contact.account_name}...`);
      const partnerResult = await removeUserFromGroup(lmsUserId, partnerGroupId);
      results.removedFromPartnerGroup = partnerResult.success;
      if (!partnerResult.success) {
        results.errors.push(`Partner group: ${partnerResult.error}`);
      }
    } else {
      console.log(`   ℹ️ No partner group found for ${contact.account_name}`);
    }

    // 2. Remove from "All Partners" group
    const allPartnersGroupId = await getAllPartnersGroupId();
    if (allPartnersGroupId) {
      console.log(`   Removing from "All Partners" group...`);
      const allPartnersResult = await removeUserFromGroup(lmsUserId, allPartnersGroupId);
      results.removedFromAllPartners = allPartnersResult.success;
      if (!allPartnersResult.success) {
        results.errors.push(`All Partners group: ${allPartnersResult.error}`);
      }
    } else {
      console.log(`   ⚠️ "All Partners" group not found in database`);
    }

    results.success = results.errors.length === 0;
    console.log(`   ${results.success ? '✅' : '⚠️'} Offboarding complete for ${contact.email}`);

  } catch (err) {
    results.success = false;
    results.errors.push(err.message);
    console.error(`   ❌ Offboarding failed:`, err.message);
  }

  return results;
}

/**
 * Offboard a partner (partner deactivated)
 * - Remove all users from "All Partners" group
 * - Delete the partner's LMS group
 */
async function offboardPartner(partnerId) {
  console.log(`\n🏢 Offboarding partner ${partnerId}...`);
  
  const results = {
    success: true,
    partnerId,
    usersRemovedFromAllPartners: 0,
    partnerGroupDeleted: false,
    errors: []
  };

  try {
    // Get partner details with LMS group
    // Note: lms_groups.id IS the Northpass ID (varchar, not auto-increment)
    const [partner] = await query(`
      SELECT p.id, p.account_name, g.id as group_id, g.name as group_name
      FROM partners p
      LEFT JOIN lms_groups g ON g.partner_id = p.id
      WHERE p.id = ?
    `, [partnerId]);

    if (!partner) {
      results.success = false;
      results.errors.push('Partner not found');
      return results;
    }

    console.log(`   Partner: ${partner.account_name}`);

    // Get all LMS users associated with this partner
    const partnerUsers = await query(`
      SELECT DISTINCT u.id as lms_user_id, u.email
      FROM lms_users u
      WHERE u.id IN (
        -- Users in partner's group
        SELECT gm.user_id FROM lms_group_members gm
        JOIN lms_groups g ON g.id = gm.group_id
        WHERE g.partner_id = ?
        UNION
        -- Users linked via contacts
        SELECT c.lms_user_id FROM contacts c 
        WHERE c.partner_id = ? AND c.lms_user_id IS NOT NULL
      )
    `, [partnerId, partnerId]);

    console.log(`   Found ${partnerUsers.length} users associated with partner`);

    // 1. Remove all partner users from "All Partners" group
    if (partnerUsers.length > 0) {
      const allPartnersGroupId = await getAllPartnersGroupId();
      if (allPartnersGroupId) {
        console.log(`   Removing ${partnerUsers.length} users from "All Partners" group...`);
        const userIds = partnerUsers.map(u => u.lms_user_id);
        const removeResult = await removeUsersFromGroup(userIds, allPartnersGroupId);
        results.usersRemovedFromAllPartners = removeResult.removed;
        
        if (removeResult.failed > 0) {
          results.errors.push(`Failed to remove ${removeResult.failed} users from All Partners`);
        }
        console.log(`   Removed ${removeResult.removed}/${partnerUsers.length} users from "All Partners"`);
      } else {
        console.log(`   ⚠️ "All Partners" group not found`);
      }
    }

    // 2. Delete the partner's LMS group (lms_groups.id IS the Northpass ID)
    const partnerGroupId = partner.group_id;
    if (partnerGroupId) {
      console.log(`   Deleting partner LMS group: ${partner.group_name}...`);
      const deleteResult = await deleteLmsGroup(partnerGroupId);
      results.partnerGroupDeleted = deleteResult.success;
      if (!deleteResult.success && !deleteResult.notFound) {
        results.errors.push(`Failed to delete group: ${deleteResult.error}`);
      }
    } else {
      console.log(`   ℹ️ No LMS group found for partner`);
    }

    // 3. Unlink partner from any group in database
    await query('UPDATE lms_groups SET partner_id = NULL WHERE partner_id = ?', [partnerId]);

    results.success = results.errors.length === 0;
    console.log(`   ${results.success ? '✅' : '⚠️'} Partner offboarding complete`);

  } catch (err) {
    results.success = false;
    results.errors.push(err.message);
    console.error(`   ❌ Partner offboarding failed:`, err.message);
  }

  return results;
}

/**
 * Process offboarding for multiple contacts
 */
async function offboardContacts(contactIds) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚪 BATCH CONTACT OFFBOARDING: ${contactIds.length} contacts`);
  console.log(`${'='.repeat(60)}`);

  const results = {
    total: contactIds.length,
    successful: 0,
    failed: 0,
    details: []
  };

  for (const contactId of contactIds) {
    const result = await offboardContact(contactId);
    results.details.push(result);
    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ CONTACT OFFBOARDING COMPLETE`);
  console.log(`   Successful: ${results.successful}/${results.total}`);
  console.log(`   Failed: ${results.failed}/${results.total}`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

/**
 * Process offboarding for multiple partners
 */
async function offboardPartners(partnerIds) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 BATCH PARTNER OFFBOARDING: ${partnerIds.length} partners`);
  console.log(`${'='.repeat(60)}`);

  const results = {
    total: partnerIds.length,
    successful: 0,
    failed: 0,
    totalUsersRemoved: 0,
    groupsDeleted: 0,
    details: []
  };

  for (const partnerId of partnerIds) {
    const result = await offboardPartner(partnerId);
    results.details.push(result);
    
    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
    }
    
    results.totalUsersRemoved += result.usersRemovedFromAllPartners || 0;
    if (result.partnerGroupDeleted) {
      results.groupsDeleted++;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ PARTNER OFFBOARDING COMPLETE`);
  console.log(`   Partners processed: ${results.successful}/${results.total}`);
  console.log(`   Users removed from All Partners: ${results.totalUsersRemoved}`);
  console.log(`   Groups deleted: ${results.groupsDeleted}`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

module.exports = {
  removeUserFromGroup,
  removeUsersFromGroup,
  deleteLmsGroup,
  offboardContact,
  offboardPartner,
  offboardContacts,
  offboardPartners,
  getAllPartnersGroupId
};
