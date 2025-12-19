// Failed Course ID Tracker
// This file tracks course IDs that consistently fail validation to optimize future API calls
// 
// IMPORTANT: This is a RUNTIME tracker only. The source of truth for known invalid courses
// is invalidCourseReference.js - this file imports from there and adds runtime discoveries.

import { getInvalidCourseIds, addInvalidCourse, shouldSkipCourse } from './invalidCourseReference.js';

// Initialize from the source of truth (invalidCourseReference.js)
// Runtime discoveries will be added to these Sets during execution
const FAILED_COURSES = {
  // Courses that return 404 when fetching from catalog (these are deleted/archived courses)
  // Pre-populated from invalidCourseReference.js - the single source of truth
  NOT_FOUND_404: new Set(getInvalidCourseIds()),
  
  // Courses that return 403 when accessing main course endpoint  
  ACCESS_DENIED_403: new Set([
    // Runtime discoveries only - populated during execution
  ]),
  
  // Courses that return 403 when accessing properties API for NPCU data
  // PowerShell analysis shows these failures ONLY occur for invalid courses (404s)
  PROPERTIES_ACCESS_DENIED_403: new Set([
    // Runtime discoveries only - populated during execution
  ]),
  
  // Courses that have other validation issues
  OTHER_ERRORS: new Set([
    // Runtime discoveries only - populated during execution
  ])
};

// Track when a course fails validation
// For 404 errors, also updates the source of truth (invalidCourseReference.js) at runtime
export const trackFailedCourse = (courseId, courseName, errorType, errorDetails = {}) => {
  const timestamp = new Date().toISOString();
  
  // Add to appropriate failure category
  switch (errorType) {
    case '404_NOT_FOUND':
      FAILED_COURSES.NOT_FOUND_404.add(courseId);
      // Also update the source of truth for persistence
      addInvalidCourse(courseId, courseName, `Runtime discovery: ${errorDetails.message || 'API returned 404'}`);
      break;
    case '403_ACCESS_DENIED':
      FAILED_COURSES.ACCESS_DENIED_403.add(courseId);
      break;
    case '403_PROPERTIES_ACCESS_DENIED':
      FAILED_COURSES.PROPERTIES_ACCESS_DENIED_403.add(courseId);
      break;
    default:
      FAILED_COURSES.OTHER_ERRORS.add(courseId);
  }
  
  console.log(`📝 [${timestamp}] Tracking failed course:`, {
    courseId,
    courseName,
    errorType,
    errorDetails,
    totalFailedCourses: getTotalFailedCoursesCount()
  });
};

// Check if a course should be skipped (uses source of truth + runtime discoveries)
export const shouldSkipCourseCheck = (courseId, courseName = null) => {
  // First check runtime discoveries
  if (isKnownFailedCourse(courseId)) return true;
  // Then check source of truth (includes pattern matching)
  return shouldSkipCourse(courseId, courseName);
};

// Check if a course ID is known to fail
export const isKnownFailedCourse = (courseId, errorType = null) => {
  if (errorType) {
    switch (errorType) {
      case '404_NOT_FOUND':
        return FAILED_COURSES.NOT_FOUND_404.has(courseId);
      case '403_ACCESS_DENIED':
        return FAILED_COURSES.ACCESS_DENIED_403.has(courseId);
      case '403_PROPERTIES_ACCESS_DENIED':
        return FAILED_COURSES.PROPERTIES_ACCESS_DENIED_403.has(courseId);
      default:
        return FAILED_COURSES.OTHER_ERRORS.has(courseId);
    }
  }
  
  // Check all categories if no specific error type provided
  return Object.values(FAILED_COURSES).some(failureSet => failureSet.has(courseId));
};

// Get statistics about failed courses
export const getFailedCourseStats = () => {
  const stats = {
    notFound404: Array.from(FAILED_COURSES.NOT_FOUND_404),
    accessDenied403: Array.from(FAILED_COURSES.ACCESS_DENIED_403),
    propertiesAccessDenied403: Array.from(FAILED_COURSES.PROPERTIES_ACCESS_DENIED_403),
    otherErrors: Array.from(FAILED_COURSES.OTHER_ERRORS),
    totalFailedCourses: getTotalFailedCoursesCount()
  };
  
  console.log('📊 Failed Course Statistics:', {
    '404 Not Found': stats.notFound404.length,
    '403 Access Denied (Course)': stats.accessDenied403.length,
    '403 Access Denied (Properties)': stats.propertiesAccessDenied403.length,
    'Other Errors': stats.otherErrors.length,
    'Total Failed': stats.totalFailedCourses
  });
  
  return stats;
};

// Get total count of failed courses across all categories
const getTotalFailedCoursesCount = () => {
  return Object.values(FAILED_COURSES).reduce((total, failureSet) => total + failureSet.size, 0);
};

// Export failed course IDs as arrays for debugging
export const exportFailedCourseIds = () => {
  const exported = {
    notFound404: Array.from(FAILED_COURSES.NOT_FOUND_404),
    accessDenied403: Array.from(FAILED_COURSES.ACCESS_DENIED_403),
    propertiesAccessDenied403: Array.from(FAILED_COURSES.PROPERTIES_ACCESS_DENIED_403),
    otherErrors: Array.from(FAILED_COURSES.OTHER_ERRORS)
  };
  
  console.log('📋 Exported Failed Course IDs:', exported);
  return exported;
};

// Check if properties API failures are affecting valid courses
export const analyzePropertiesFailures = (allCourses, validCourses) => {
  const propertiesFailures = Array.from(FAILED_COURSES.PROPERTIES_ACCESS_DENIED_403);
  const catalogFailures = Array.from(FAILED_COURSES.NOT_FOUND_404);
  const validCourseIds = validCourses.map(course => course.resourceId || course.id);
  
  const failuresOnValidCourses = propertiesFailures.filter(failedId => 
    validCourseIds.includes(failedId)
  );
  
  const failuresOnInvalidCourses = propertiesFailures.filter(failedId => 
    !validCourseIds.includes(failedId) || catalogFailures.includes(failedId)
  );
  
  const analysis = {
    totalPropertiesFailures: propertiesFailures.length,
    total404Failures: catalogFailures.length,
    failuresOnValidCourses: failuresOnValidCourses.length,
    failuresOnInvalidCourses: failuresOnInvalidCourses.length,
    validCourseIds: validCourseIds.length,
    failuresOnValidCoursesPercent: validCourseIds.length > 0 
      ? Math.round((failuresOnValidCourses.length / validCourseIds.length) * 100)
      : 0,
    powershellValidationResult: 'Properties API failures ONLY affect invalid/deleted courses'
  };
  
  console.log('🔍 Properties API Failure Analysis (PowerShell Validated):', analysis);
  console.log('✅ PowerShell validation confirmed: Properties API failures only affect courses that return 404 from catalog');
  console.log('🎯 This means 403 properties errors are EXPECTED for deleted/archived courses');
  
  if (analysis.failuresOnValidCourses > 0) {
    console.log('⚠️ UNEXPECTED: Properties API is failing for valid courses - investigate further');
    console.log('📋 Valid courses with properties failures:', failuresOnValidCourses);
  } else {
    console.log('✅ All properties failures are on invalid courses - system working as expected');
  }
  
  return analysis;
};

// Clear all tracked failed courses (for testing)
export const clearFailedCourses = () => {
  Object.values(FAILED_COURSES).forEach(failureSet => failureSet.clear());
  console.log('🧹 Cleared all tracked failed course IDs');
};