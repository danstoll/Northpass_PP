const { query } = require('./server/db/connection.cjs');

const orphanIds = [
  'f8cc9428-64b3-491e-a260-15e9968e60a6',
  '58b31191-eb97-4827-93c5-a6bfece86eff',
  '0b23651a-750e-4057-83d9-477d74dec2b9',
  '2d3813b5-e2f0-4b2f-a6e7-d9d1615d2bc9',
  '9fdbde2f-fb80-4cae-8548-970ae442f298',
  '22ffc55f-68bc-4279-a285-75c699ab7095',
  '428c7868-0a7e-406c-9afa-2a5077ffe6a8',
  'c9b02de8-02ed-4f66-a032-eddd69844c36',
  'd35ad2ed-9e38-492f-87df-3e9ec78c4bc6',
  '40d0a626-0973-4740-bc9f-50c8bb5b845a',
  'a34ec39b-bfc1-4d0b-8a5a-88972e0faa6d',
  '1e849f58-0a34-467b-aac2-b5641818f81c',
  'd4448561-fdbf-4a34-abdc-eb649bb0fe8b',
  '78be447c-ffa9-4def-a86e-05ab450a1947',
  '16af6e23-74b9-42a0-b769-27e7f8c7d178',
  '6a9d3702-7878-4ba1-bfe9-adeacc870e7b',
  '6e7bf26d-90f1-4696-be22-74bfcab22dea',
  '20c1a834-6480-4df6-a563-25ef3587a154',
  '6a1eb39a-d519-46d4-aced-517bbe5bfd96',
  '9d2ba58b-5a4f-40a2-99c9-16fd8dc746c8',
  'b69e3506-76d1-43bf-8af7-5363886fb036'
];

(async () => {
  const placeholders = orphanIds.map(() => '?').join(',');
  
  // Delete from course_properties first (FK)
  await query('DELETE FROM course_properties WHERE course_id IN (' + placeholders + ')', orphanIds);
  console.log('Deleted from course_properties');
  
  // Delete from lms_courses
  const result = await query('DELETE FROM lms_courses WHERE id IN (' + placeholders + ')', orphanIds);
  console.log('Deleted', result.affectedRows, 'orphan courses');
  
  process.exit(0);
})();
