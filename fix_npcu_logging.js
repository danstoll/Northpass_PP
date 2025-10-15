// This is a temporary script to add NPCU logging to the validateSingleCourse function
// Run this in the browser console to patch the function on-the-fly

const originalValidate = northpassApi.validateSingleCourse;

northpassApi.validateSingleCourse = async function(certification) {
  try {
    if (!certification.resourceId) {
      console.log(`⚠️ No resource ID for ${certification.name}`);
      return false;
    }
    
    // Use correct endpoints based on resource type
    const endpoint = certification.resourceType === 'learning_path' 
      ? `/v2/learning_paths/${certification.resourceId}`
      : `/v2/courses/${certification.resourceId}`;
    
    console.log(`🔍 Checking catalog for: ${certification.name} (${endpoint})`);
    
    const response = await apiClient.get(endpoint);
    
    if (response.data?.data?.attributes) {
      const courseData = response.data.data.attributes;
      
      // Log all course properties to find NPCU information
      console.log(`📋 Course properties for ${certification.name}:`, {
        id: response.data.data.id,
        title: courseData.title || courseData.name,
        published: courseData.published,
        status: courseData.status,
        npcu_points: courseData.npcu_points,
        npcu_credit: courseData.npcu_credit,
        npcu: courseData.npcu,
        credits: courseData.credits,
        credit_hours: courseData.credit_hours,
        continuing_education_credits: courseData.continuing_education_credits,
        ce_credits: courseData.ce_credits,
        certification_credits: courseData.certification_credits,
        allKeys: Object.keys(courseData).sort()
      });
      
      // Extract NPCU points from various possible fields
      const npcuPoints = courseData.npcu_points || 
                        courseData.npcu_credit || 
                        courseData.npcu || 
                        courseData.credits || 
                        courseData.credit_hours || 0;
      
      // Update the certification object with NPCU information
      if (npcuPoints > 0) {
        certification.npcu = npcuPoints;
        console.log(`🎓 Found NPCU points: ${certification.name} = ${npcuPoints} NPCU`);
      }
      
      // Continue with original validation logic
      return originalValidate.call(this, certification);
    }
    
    return originalValidate.call(this, certification);
  } catch (error) {
    return originalValidate.call(this, certification);
  }
};

console.log('🔧 NPCU logging patch applied to validateSingleCourse function');