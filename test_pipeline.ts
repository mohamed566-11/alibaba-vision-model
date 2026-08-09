import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.example' });

import { GarmentExtractionPipeline } from './server/services/GarmentExtractionPipeline';

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
  console.error('DASHSCOPE_API_KEY missing');
  process.exit(1);
}

const generatedDir = path.join(process.cwd(), 'uploads', 'generated');

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING AUTOMATED PIPELINE VERIFICATION TESTS');
  console.log('==================================================\n');

  // Test Case 1: Woman in Red Dress + Red Shoes
  const womanImgPath = 'C:/Users/Dell/.gemini/antigravity-ide/brain/d576acf6-df73-43a2-8dc3-88f6710f04cb/test_woman_red_dress_1786208348941.png';
  console.log('--> TEST CASE 1: Woman wearing red dress and red shoes');
  const result1 = await GarmentExtractionPipeline.processExtraction(
    womanImgPath,
    'image/png',
    null,
    apiKey,
    generatedDir
  );

  console.log('Test Case 1 Result:');
  console.log('  Success:', result1.success);
  console.log('  Verified:', result1.verified);
  console.log('  Reason:', result1.verification_reason);
  console.log('  Attempts:', result1.attempts);
  console.log('  Detected Gender:', result1.inventory.gender_presentation);
  console.log('  Detected Items:', result1.inventory.items.map(i => `${i.color} ${i.category}`).join(', '));
  console.log('  Output Image:', result1.image_url);

  if (!result1.success) {
    throw new Error('Test Case 1 failed extraction!');
  }

  console.log('\n--------------------------------------------------\n');

  // Test Case 2: Man in White Shirt + Black Trousers + Black Shoes
  const manImgPath = 'C:/Users/Dell/.gemini/antigravity-ide/brain/d576acf6-df73-43a2-8dc3-88f6710f04cb/test_man_shirt_trousers_1786208337424.png';
  console.log('--> TEST CASE 2: Man wearing white shirt, black trousers, and black shoes');
  const result2 = await GarmentExtractionPipeline.processExtraction(
    manImgPath,
    'image/png',
    null,
    apiKey,
    generatedDir
  );

  console.log('Test Case 2 Result:');
  console.log('  Success:', result2.success);
  console.log('  Verified:', result2.verified);
  console.log('  Reason:', result2.verification_reason);
  console.log('  Attempts:', result2.attempts);
  console.log('  Detected Gender:', result2.inventory.gender_presentation);
  console.log('  Detected Items:', result2.inventory.items.map(i => `${i.color} ${i.category}`).join(', '));
  console.log('  Output Image:', result2.image_url);

  // Assert Test Case 2 did NOT detect or extract a dress/skirt
  const hasDressInInventory = result2.inventory.items.some(i => i.category.includes('dress') || i.category.includes('gown') || i.category.includes('skirt'));
  if (hasDressInInventory) {
    throw new Error('FAILED: Test Case 2 detected a dress/skirt for a male shirt+trousers outfit!');
  }

  console.log('\n==================================================');
  console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('\nPipeline Verification Failed:', err);
  process.exit(1);
});
