import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

      // Invalid course IDs that return 404 - block these requests at proxy level
      const INVALID_COURSE_IDS = new Set([
        // Original batch (PowerShell validated)
        '87823010-6818-4e96-bf81-6034e1432a07', // Process Editor Certification for Process Manager
        '61e143f6-7de3-4df1-94a2-0b2cf5369bec', // Certification: Nintex Document Generation Expert - Nintex DocGen for Salesforce
        'a280c323-bb62-4d31-b874-0b2b7268058b', // Nintex DocGen for Salesforce Basics Certification
        '1fce19b1-574d-465e-91d3-c5c39b07dcf0', // Certification: Nintex Process Automation Expert - Nintex for Office 365
        '25b7fbde-d95b-4059-bcd3-d403e393c3fc', // Certification: Nintex Process Automation Practitioner - Nintex for Office 365
        // New discoveries from October 15, 2025
        'f25b666f-1688-4607-9a91-e6585da7d7c7', // Nintex Automation for IT Developers (learning path)
        'f1c86637-b3fc-4868-b7ff-58e1131d4af1', // Certification: Nintex K2 Five for SharePoint Practitioner
        '2f8d8387-8584-47ba-af03-725011d1fc45', // Certification: Nintex Automation K2 Power User
        'e6298aca-b081-4187-9f69-3e06bede96c3', // Certification: Nintex Automation K2 Citizen Developer
        '72f430e6-2cc1-4fad-abc9-f3e442714a8a', // Certification: K2 Cloud for SharePoint - Practitioner
        '64441f15-9c11-4dee-a8dc-e234eb5345d9', // Automation Specialist II Certification for Nintex Automation Cloud
        'bcc421e8-915e-4b92-b9ab-fab22a536055', // Automation Specialist I Certification for Nintex Automation Cloud
        '04fb41ca-9ddb-4d58-8097-e3af83380a19', // Certification: Nintex Automation K2 Server Administrator
        '83aeb601-18aa-4b72-8d44-79ba19b42956', // Certification: Nintex Automation K2 IT Developer
        'dee0c7f6-0fd1-42e3-8416-458a1c206983', // Certification: Nintex Automation K2 Business Analyst
        'dbfb9150-03b6-4a8f-a069-006f91e1c64b'  // Certification: K2 Connect Five - Expert
      ]);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/northpass': {
        target: 'https://api.northpass.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/northpass/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
            
            // Check if request is for a known invalid course
            const courseIdMatch = req.url.match(/\/(?:courses|properties\/courses)\/([a-f0-9-]{36})/);
            if (courseIdMatch) {
              const courseId = courseIdMatch[1];
              if (INVALID_COURSE_IDS.has(courseId)) {
                console.log(`🚫 Blocking request to known invalid course: ${courseId}`);
                
                // Return 404 immediately without making the request
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Course not found',
                  message: 'Known invalid course ID - skipped by proxy',
                  courseId: courseId,
                  skippedByProxy: true
                }));
                
                // Prevent the actual request
                proxyReq.destroy();
                return;
              }
            }
          });
          
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            
            // Log new 404s for courses not in our skip list
            if (proxyRes.statusCode === 404) {
              const courseIdMatch = req.url.match(/\/(?:courses|properties\/courses)\/([a-f0-9-]{36})/);
              if (courseIdMatch) {
                const courseId = courseIdMatch[1];
                if (!INVALID_COURSE_IDS.has(courseId)) {
                  console.log(`📝 New 404 course discovered: ${courseId} - consider adding to skip list`);
                }
              }
            }
          });
        },
      }
    }
  }
})
