// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  developerSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      items: ['developer/overview', 'developer/architecture', 'developer/local-setup'],
    },
    {
      type: 'category',
      label: 'Database',
      items: ['developer/database-schema', 'developer/database-connection'],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['developer/api-northpass', 'developer/api-impartner', 'developer/api-internal'],
    },
    {
      type: 'category',
      label: 'Sync System',
      items: ['developer/sync-architecture', 'developer/sync-tasks', 'developer/sync-impartner'],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: ['developer/deployment', 'developer/server-config', 'developer/troubleshooting'],
    },
  ],
  userSidebar: [
    'user-guide/getting-started',
    {
      type: 'category',
      label: 'Admin Dashboard',
      items: [
        'user-guide/admin-login',
        'user-guide/sync-dashboard',
        'user-guide/reports',
        'user-guide/user-management',
        'user-guide/data-management',
      ],
    },
    {
      type: 'category',
      label: 'Partner Views',
      items: ['user-guide/partner-dashboard', 'user-guide/certification-tracking'],
    },
    'user-guide/faq',
  ],
};

export default sidebars;
