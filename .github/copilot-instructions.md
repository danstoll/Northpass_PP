# Northpass API Integration Instructions

## API Configuration
- **Base URL**: `https://api.northpass.com`
- **API Key**: `NP-jBVEcl1tKdyKPbxJQDbp`
- **Authentication**: Bearer token in Authorization header
- **Proxy**: Always use the configured proxy, never make direct API calls

## API Endpoints Reference

### Core Endpoints
- **People API**: `/v2/people`
  - List people: `GET /v2/people?limit=1`
  - Find by email: `GET /v2/people?filter[email][eq]={email}`
  - User transcript: `GET /v2/people/{userId}/transcript`

- **Courses API**: `/v2/courses`
  - List courses: `GET /v2/courses?limit=10&filter[published][eq]=true`
  - Single course: `GET /v2/courses/{courseId}`
  - Course completions: `GET /v2/courses/{courseId}/completions`

- **Properties API**: `/v2/properties/courses/{courseId}`
  - Course properties including NPCU field
  - Returns: `{ data: { attributes: { properties: { npcu: 0|1|2 } } } }`

### Test Data References
- **Known Working Course ID**: `be21b16d-e564-460a-8695-d25628d69dd4`
- **Test User Email**: `Philipp.Wissenbach@BVKontent.de`
- **Test User ID**: `f0dac60f-80ec-4b6c-bb73-9e6541de3f9e`

## Business Rules
- **NPCU Values**: Only 0 (blank), 1, or 2 are valid
- **Certifications**: Courses with NPCU > 0 are considered certifications
- **Data Source**: Always use real Northpass data, never fake/demo data

## Known Issues
- Some course IDs return 403 on properties API calls
- Transcript endpoint returns 404 for test user
- Course-specific permissions may apply to properties access
- Duplicate course names may have different access permissions

## Development Notes
- Use proxy configuration in apiClient for all requests
- Handle 403/404 errors gracefully with fallback to calculated NPCU
- Log detailed error information for debugging
- Courses with "Copy" in title may have different permissions than originals