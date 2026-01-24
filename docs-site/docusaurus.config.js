// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Northpass Partner Portal',
  tagline: 'Documentation for Developers and Partner Account Managers',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://ptrlrndb.prod.ntxgallery.com',
  baseUrl: '/docs/',

  organizationName: 'nintex',
  projectName: 'northpass-portal',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/social-card.png',
      colorMode: {
        defaultMode: 'light',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Partner Portal Docs',
        logo: {
          alt: 'Nintex Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'developerSidebar',
            position: 'left',
            label: 'Developer Guide',
          },
          {
            type: 'docSidebar',
            sidebarId: 'userSidebar',
            position: 'left',
            label: 'User Guide',
          },
          {
            href: 'https://ptrlrndb.prod.ntxgallery.com',
            label: 'Portal',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {label: 'Developer Guide', to: '/developer/overview'},
              {label: 'User Guide', to: '/user-guide/getting-started'},
            ],
          },
          {
            title: 'Resources',
            items: [
              {label: 'Partner Portal', href: 'https://ptrlrndb.prod.ntxgallery.com'},
              {label: 'Northpass LMS', href: 'https://nintex.northpass.com'},
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Nintex. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['powershell', 'bash', 'sql', 'json'],
      },
    }),
};

export default config;
