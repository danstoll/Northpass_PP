// ============================================================================
// INVALID COURSE REFERENCE - SINGLE SOURCE OF TRUTH
// ============================================================================
// This file is the authoritative reference for all invalid, archived, test,
// and problematic courses. All other files (failedCourseTracker.js, etc.)
// should IMPORT from this file rather than maintaining duplicate lists.
//
// Last updated: December 19, 2025
// ============================================================================

// ============================================================================
// PATTERN-BASED EXCLUSIONS (Preferred method - catches future courses too)
// ============================================================================

// Patterns to exclude from course names (case-insensitive)
export const EXCLUDED_NAME_PATTERNS = [
  'archived',
  'archive ',
  '- copy',
  '-copy',
  'samtest',
  'sam-test',
  'test course',
  'test end',
  'tester version',
  'testers version',
];

/**
 * Check if a course should be excluded based on its name pattern
 * @param {string} courseName - The name of the course
 * @returns {boolean} - True if the course should be excluded
 */
export function shouldExcludeCourseByName(courseName) {
  if (!courseName) return false;
  const name = courseName.toLowerCase();
  return EXCLUDED_NAME_PATTERNS.some(pattern => name.includes(pattern));
}

// Archived course IDs discovered on December 5, 2025 (30 courses with "Archived" in name)
export const ARCHIVED_COURSE_IDS = new Set([
  '99236fe4-2771-418c-a2a1-5ba54f495e2b', // Archived - Alexa's test course
  'b9bf48fa-4d50-43ca-b903-2a328bd2a7b7', // Archived - Alexa test of survey
  '3fdec8f5-5436-4431-8eaa-130816b40380', // Archived - Badge 1
  'a5083a77-5afd-4a42-91a7-c787069ff632', // Archived - Badge 1
  '2514a844-cfbc-4cf4-a9b0-f2a3bd51cd7a', // Archived - Badge 3Archived -
  'b689a715-0c17-4b1d-bf17-e21ed88661d1', // Archived - Badge 4
  '70929ccb-07e5-4f54-a363-c1c30d97f4b0', // Archived - Badge 5
  '91937527-6d64-4864-8c5b-b16371a597a3', // Archived - Badge 6
  '2b2cfcd6-99eb-456c-8725-4271a20a25af', // Archived - Badge 7
  '65e15f10-9739-4bd0-bf33-7672be7ac4f0', // Archived - Badge 8
  '3272c1d4-f016-41cb-ab74-c0ee6c5d7564', // Archived - Data
  'f53e9f18-dd78-46cb-b9d4-60b2ffe35ac3', // Archived - Data - COPY
  'c1e71a55-f351-45b3-95d6-4945a3623be3', // Archived - Fans First with Jesse Cole
  'bf44ed23-05c5-495a-9f70-af790ccde537', // Archived - Get Started with Models
  'd23e5b4d-2c88-412d-8265-bc5d6fa5da45', // Archived - Infrastructure
  'c2d02e28-6f35-488a-bb2b-5f7ca57de67f', // Archived - Interactions
  '4a58263a-256d-41aa-aba6-b1eba2a1eb4f', // Archived - Leadership Essentials with Matt Houston
  '9fb82cee-c405-4f5c-8ba1-0d4557a2cd50', // Archived - Low Code App Basics
  '6bf95917-46b2-4e45-90eb-37bea19e7906', // Archived - Manage like an Executive Chef with Andre Natera
  'd7cadbe4-5d69-49ba-8a5e-aa29e4fe4d8b', // Archived --- Overview of Skuid Central
  '11c0590c-8580-4809-bfc6-6e58a2c2993b', // Archived - Paul Test - Free-form
  '41fcac02-1a59-4014-96ce-cb1073061370', // Archived - Paul Test - Linear
  '864f5b0d-0f41-411e-a21d-fbcbb12c51bb', // Archived - Paul Test - Linear
  '2ea9b403-30d2-472a-a214-653b88087352', // Archived - Skuid Ethos
  '058d3061-1abe-4da6-9b97-08c144aa0b4a', // Archived - Skuid Resources
  '78115a07-8980-421e-95da-e02bb85c7f2b', // Archived - Skuid tip
  '89751310-fd6f-4eaa-9eb6-66a0da57810f', // Archived - survey test
  '6b8dc316-7834-4236-a639-889bc4afc429', // Archived - User Interface (UI)
  '6f12de10-9842-43fe-a9d1-c7ef74c34033', // Archived - Workspaces
  '3ca06ad2-7a9d-4b32-8591-4978d945a02b', // ARCHIVE - use to test... this was display logic
]);

// Test/Internal course IDs that should be excluded
export const TEST_COURSE_IDS = new Set([
  '96ad1471-66f3-4198-82a6-0414bee29741', // Test course
  '2a1534f4-e21d-4228-8816-fd02c277a6c4', // Test course for social redirections
  '22b4a88c-5164-4536-bacd-7416c3b0b1f2', // Test End Screen
  'e80303f5-65d8-4dbe-9be8-0b99261bebd8', // SamTest
  '9ede7685-57d6-4638-958b-17054d7c0042', // Sam-Test
  'fdedc13b-ec0f-445c-93f3-c196139bfa6b', // Sam-Test
]);

/**
 * Check if a course ID is in the known excluded list (archived or test)
 * @param {string} courseId - The course UUID
 * @returns {boolean} - True if the course should be excluded
 */
export function isExcludedCourseId(courseId) {
  return ARCHIVED_COURSE_IDS.has(courseId) || TEST_COURSE_IDS.has(courseId);
}

// ============================================================================
// LEARNING PATH COMPONENT COURSES (Valid courses only accessible via Learning Path)
// ============================================================================

// These courses return 404 from the catalog because they're components of Learning Paths,
// not standalone enrollable courses. They ARE valid certifications with NPCU values.
// When users complete the Learning Path, they get credit for these component courses.
export const LEARNING_PATH_COMPONENTS = {
  '4b39e4d2-2987-455e-9a61-a28979ffef83': {
    courseName: 'Nintex Certified Sales Professional for Partners',
    npcu: 1,
    parentLearningPath: 'f08bdffa-f6f0-4f66-ab75-c755440c7673',
    validationDate: '2025-12-05',
    notes: 'Component of Sales Professional Learning Path - not enrollable standalone, but HAS the NPCU value'
  }
};

/**
 * Check if a course is a known Learning Path component
 * @param {string} courseId - The course UUID
 * @returns {object|null} - Course info with NPCU if found, null otherwise
 */
export function getLearningPathComponentInfo(courseId) {
  return LEARNING_PATH_COMPONENTS[courseId] || null;
}

/**
 * Check if a course is a Learning Path component (valid but not in catalog)
 * @param {string} courseId - The course UUID
 * @returns {boolean} - True if it's a known LP component
 */
export function isLearningPathComponent(courseId) {
  return courseId in LEARNING_PATH_COMPONENTS;
}

// ============================================================================
// KNOWN NPCU OVERRIDES (Properties API returns 403 but NPCU is known)
// ============================================================================

// These courses exist in the catalog but Properties API returns 403 Forbidden.
// We manually specify their NPCU values based on known business requirements.
// NOTE: Most Learning Paths have NPCU=0 themselves - the NPCU is on component courses
export const KNOWN_NPCU_OVERRIDES = {
  // Add courses here where Properties API returns 403 but we know the NPCU value
  // Example: 'course-uuid': { courseName: 'Name', npcu: 1, ... }
};

/**
 * Get known NPCU override for a course (for when Properties API returns 403)
 * @param {string} courseId - The course UUID
 * @returns {object|null} - Course info with NPCU if found, null otherwise
 */
export function getKnownNpcuOverride(courseId) {
  return KNOWN_NPCU_OVERRIDES[courseId] || null;
}

// ============================================================================
// 404 ERROR COURSES (Courses that return 404 from API calls)
// ============================================================================

export const INVALID_COURSE_REFERENCE = {
  // These course IDs return 404 from both /v2/courses/{id} and /v2/properties/courses/{id}
  // They should be skipped by the proxy and validation logic to improve performance
  
  deletedOrArchivedCourses: [
    {
      courseId: "87823010-6818-4e96-bf81-6034e1432a07",
      courseName: "Process Editor Certification for Process Manager",
      validationDate: "2025-10-14",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "61e143f6-7de3-4df1-94a2-0b2cf5369bec", 
      courseName: "Certification: Nintex Document Generation Expert - Nintex DocGen for Salesforce",
      validationDate: "2025-10-14",
      errorType: "404_NOT_FOUND", 
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "a280c323-bb62-4d31-b874-0b2b7268058b",
      courseName: "Nintex DocGen for Salesforce Basics Certification", 
      validationDate: "2025-10-14",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "1fce19b1-574d-465e-91d3-c5c39b07dcf0",
      courseName: "Certification: Nintex Process Automation Expert - Nintex for Office 365",
      validationDate: "2025-10-14", 
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "25b7fbde-d95b-4059-bcd3-d403e393c3fc",
      courseName: "Certification: Nintex Process Automation Practitioner - Nintex for Office 365",
      validationDate: "2025-10-14",
      errorType: "404_NOT_FOUND", 
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    // Newly discovered 404 courses from October 15, 2025
    {
      courseId: "f25b666f-1688-4607-9a91-e6585da7d7c7",
      courseName: "Nintex Automation for IT Developers",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Learning path not found in catalog",
      copyVersionExists: false
    },
    {
      courseId: "f1c86637-b3fc-4868-b7ff-58e1131d4af1",
      courseName: "Certification: Nintex K2 Five for SharePoint Practitioner",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "2f8d8387-8584-47ba-af03-725011d1fc45",
      courseName: "Certification: Nintex Automation K2 Power User",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "e6298aca-b081-4187-9f69-3e06bede96c3",
      courseName: "Certification: Nintex Automation K2 Citizen Developer",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "72f430e6-2cc1-4fad-abc9-f3e442714a8a",
      courseName: "Certification: K2 Cloud for SharePoint - Practitioner",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "64441f15-9c11-4dee-a8dc-e234eb5345d9",
      courseName: "Automation Specialist II Certification for Nintex Automation Cloud",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "bcc421e8-915e-4b92-b9ab-fab22a536055",
      courseName: "Automation Specialist I Certification for Nintex Automation Cloud",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "04fb41ca-9ddb-4d58-8097-e3af83380a19",
      courseName: "Certification: Nintex Automation K2 Server Administrator",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "83aeb601-18aa-4b72-8d44-79ba19b42956",
      courseName: "Certification: Nintex Automation K2 IT Developer",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - no COPY version found",
      copyVersionExists: false
    },
    {
      courseId: "dee0c7f6-0fd1-42e3-8416-458a1c206983",
      courseName: "Certification: Nintex Automation K2 Business Analyst",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    },
    {
      courseId: "dbfb9150-03b6-4a8f-a069-006f91e1c64b",
      courseName: "Certification: K2 Connect Five - Expert",
      validationDate: "2025-10-15",
      errorType: "404_NOT_FOUND",
      notes: "Original version - COPY version exists and works",
      copyVersionExists: true
    }
  ],

  // Courses that are known to have working COPY versions
  workingCopyVersions: [
    {
      originalCourseId: "87823010-6818-4e96-bf81-6034e1432a07",
      copyCourseId: "16af6e23-74b9-42a0-b769-27e7f8c7d178",
      courseName: "Process Editor Certification for Process Manager - COPY",
      status: "working",
      hasCertificate: true
    },
    {
      originalCourseId: "61e143f6-7de3-4df1-94a2-0b2cf5369bec", 
      copyCourseId: "c9b02de8-02ed-4f66-a032-eddd69844c36",
      courseName: "Certification: Nintex Document Generation Expert - Nintex DocGen for Salesforce - COPY",
      status: "working",
      hasCertificate: true
    }
  ],

  // Pattern analysis results
  validationSummary: {
    totalInvalidCourses: 16,
    totalArchivedCourses: 30,
    totalDraftCourses: 127,
    totalTestCourses: 6,
    validationMethod: "PowerShell API testing + Live session discovery + December 2025 bulk scan",
    validationDate: "2025-12-05",
    keyFindings: [
      "Most invalid courses have working COPY versions", 
      "Original versions appear to be archived/deleted",
      "Use filter[status][eq]=live to get only published courses (not filter[published][eq]=true)",
      "30 archived courses identified by name pattern",
      "127 draft courses filtered by API status parameter",
      "Pattern-based exclusion preferred over ID-based for future-proofing"
    ]
  }
};

// Helper function to check if a course ID is invalid (404 error)
export const isInvalidCourseId = (courseId) => {
  return INVALID_COURSE_REFERENCE.deletedOrArchivedCourses.some(
    course => course.courseId === courseId
  );
};

// Helper function to get invalid course IDs as array
export const getInvalidCourseIds = () => {
  return INVALID_COURSE_REFERENCE.deletedOrArchivedCourses.map(course => course.courseId);
};

// Combined check: should this course be skipped entirely?
export const shouldSkipCourse = (courseId, courseName) => {
  // Check by ID first (fastest)
  if (isExcludedCourseId(courseId)) return true;
  if (isInvalidCourseId(courseId)) return true;
  
  // Check by name pattern (catches new courses)
  if (shouldExcludeCourseByName(courseName)) return true;
  
  return false;
};

// Helper function to add new invalid course (for future discoveries)
export const addInvalidCourse = (courseId, courseName, notes = "") => {
  const newInvalidCourse = {
    courseId,
    courseName,
    validationDate: new Date().toISOString().split('T')[0],
    errorType: "404_NOT_FOUND",
    notes,
    copyVersionExists: false // Will be updated manually if copy version is found
  };
  
  INVALID_COURSE_REFERENCE.deletedOrArchivedCourses.push(newInvalidCourse);
  console.log(`📝 Added new invalid course to reference: ${courseId} - ${courseName}`);
};