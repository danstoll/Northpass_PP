/**
 * Import Progress Tracker
 * Tracks progress of Excel import operations
 */

// In-memory storage for import progress
const importProgress = {
  active: false,
  stage: '',
  message: '',
  percent: 0,
  current: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
  error: null
};

/**
 * Reset progress to initial state
 */
function resetProgress() {
  importProgress.active = false;
  importProgress.stage = '';
  importProgress.message = '';
  importProgress.percent = 0;
  importProgress.current = 0;
  importProgress.total = 0;
  importProgress.startedAt = null;
  importProgress.completedAt = null;
  importProgress.error = null;
}

/**
 * Start a new import operation
 */
function startImport(totalRows) {
  resetProgress();
  importProgress.active = true;
  importProgress.total = totalRows;
  importProgress.startedAt = new Date();
  importProgress.stage = 'parsing';
  importProgress.message = 'Parsing Excel file...';
  importProgress.percent = 5;
}

/**
 * Update progress
 */
function updateProgress(stage, message, percent, current = null) {
  importProgress.stage = stage;
  importProgress.message = message;
  importProgress.percent = Math.min(percent, 99); // Cap at 99 until complete
  if (current !== null) {
    importProgress.current = current;
  }
}

/**
 * Complete the import
 */
function completeImport(success = true, error = null) {
  importProgress.active = false;
  importProgress.completedAt = new Date();
  importProgress.percent = success ? 100 : importProgress.percent;
  importProgress.stage = success ? 'complete' : 'error';
  importProgress.message = success ? 'Import complete!' : (error || 'Import failed');
  importProgress.error = error;
}

/**
 * Get current progress
 */
function getProgress() {
  return { ...importProgress };
}

module.exports = {
  resetProgress,
  startImport,
  updateProgress,
  completeImport,
  getProgress
};
