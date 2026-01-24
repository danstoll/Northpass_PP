---
sidebar_position: 5
title: User Management
---

# User Management

The User Management section helps you manage LMS users, find missing users, and link users to partners.

## Accessing

Navigate to: **Admin → User Management**

## Tabs Overview

### Missing CRM Users

Find CRM contacts who don't have LMS accounts.

**Use this to:**

- Identify contacts who need LMS invitations
- Track onboarding progress for new partners
- Ensure all partner contacts have training access

**Actions:**

- View contact details
- Send invitation reminders
- Bulk invite contacts to LMS

### Domain Analysis

Match LMS users to partners based on email domain.

**Example:** If a partner's contacts use `@acme.com`, this finds LMS users with that domain who aren't yet linked.

**Use this to:**

- Discover partner users who registered independently
- Link freelancers or consultants to their partner
- Clean up user-to-partner associations

### Partners Without Groups

Find partners who don't have a corresponding LMS group.

**Use this to:**

- Identify setup issues
- Create missing groups
- Ensure proper tracking for all partners

### Contact Group Audit

Verify that CRM contacts are properly added to their partner's LMS group.

**Common issues found:**

- Contact exists in LMS but not in partner group
- Contact in wrong partner group
- Duplicate group memberships

### All Partners Sync

Ensure all partner users are members of the "All Partners" group in the LMS.

This master group is used for:

- Partner-wide communications
- Access to partner-only content
- Aggregate reporting

### Orphan Discovery

Find LMS users who registered directly (bypassed CRM automation) and need to be linked to a partner.

**How orphans occur:**

- User self-registered on LMS
- CRM record was added after LMS registration
- Email mismatch between systems

## Common Workflows

### Adding Missing Users to LMS

1. Go to **Missing CRM Users** tab
2. Filter by partner if needed
3. Select contacts to invite
4. Click **Add to LMS**
5. Choose the appropriate group
6. Confirm the operation

### Linking Orphan Users

1. Go to **Orphan Discovery** tab
2. Find user by email or name
3. Click **Link to Partner**
4. Select the correct partner
5. User is added to partner's group

### Creating Missing Groups

1. Go to **Partners Without Groups** tab
2. Click **Create Group** for the partner
3. Group is created with `ptr_` prefix
4. Existing users are automatically added

## Best Practices

- Run **Contact Group Audit** monthly to catch issues early
- Check **Orphan Discovery** after major partner events
- Use **Domain Analysis** when onboarding new partners
- Run **All Partners Sync** weekly to ensure consistency
