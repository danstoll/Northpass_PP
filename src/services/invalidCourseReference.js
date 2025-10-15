// Invalid Course Reference List
// This file maintains a list of course IDs that return 404 from the Northpass API
// These courses are deleted, archived, or otherwise inaccessible
// Last updated: October 14, 2025

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
    validationMethod: "PowerShell API testing + Live session discovery",
    validationDate: "2025-10-15",
    keyFindings: [
      "Most invalid courses have working COPY versions", 
      "Original versions appear to be archived/deleted",
      "Properties API 403 errors occur for ALL courses (expected behavior)",
      "11 new 404 courses discovered in live session",
      "Pattern: Original certification courses archived, COPY versions are active"
    ]
  }
};

// Helper function to check if a course ID is invalid
export const isInvalidCourseId = (courseId) => {
  return INVALID_COURSE_REFERENCE.deletedOrArchivedCourses.some(
    course => course.courseId === courseId
  );
};

// Helper function to get invalid course IDs as array
export const getInvalidCourseIds = () => {
  return INVALID_COURSE_REFERENCE.deletedOrArchivedCourses.map(course => course.courseId);
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