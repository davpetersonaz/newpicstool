// test-r2.js
import fs from 'fs/promises';
import path from 'path';

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();   // ← This is the important line

console.log('🔍 Testing Cloudflare R2 Configuration...\n');
console.log('R2_BUCKET_NAME =', process.env.R2_BUCKET_NAME);

async function testR2() {
	if (!process.env.R2_BUCKET_NAME) {
		console.error('❌ R2_BUCKET_NAME is not set in .env');
		process.exit(1);
	}
	try {
		const client = new S3Client({
			region: 'auto',
			endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: process.env.R2_ACCESS_KEY_ID,
				secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
			},
		});

		console.log('✅ Connected to R2 successfully');

		// Create a small test image
		const sharp = (await import('sharp')).default;
		const testBuffer = await sharp({
			create: { width: 400, height: 300, channels: 4, background: { r: 100, g: 200, b: 255, alpha: 1 } }
		}).jpeg().toBuffer();

		const testKey = `test/test-upload-${Date.now()}.jpg`;

		// 2. Upload test file
		console.log(`📤 Uploading test file: ${testKey}`);
		await client.send(new PutObjectCommand({
			Bucket: process.env.R2_BUCKET_NAME,
			Key: testKey,
			Body: testBuffer,
			ContentType: 'image/jpeg',
		}));
		console.log('✅ Upload successful!');

		// 3. Generate public URL
		const publicUrl = `${process.env.R2_PUBLIC_DOMAIN}/${testKey}`;
		console.log(`🌐 Public URL: ${publicUrl}`);

		// 4. Delete test file
		console.log('🗑️  Cleaning up test file...');
		await client.send(new DeleteObjectCommand({
			Bucket: process.env.R2_BUCKET_NAME,
			Key: testKey,
		}));
		console.log('✅ Cleanup successful');

		console.log('\n🎉 All tests passed! R2 is working correctly.');

	} catch (error) {
		console.error('\n❌ Test failed:');
		console.error(error);
	}
}

testR2();