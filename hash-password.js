// hash-password.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hashPassword() {
	const username = 'dino';
	const plainPassword = 'punishu';

	const hashed = await bcrypt.hash(plainPassword, 12);

	await prisma.admin.update({
		where: { username },
		data: { password: hashed }
	});

	console.warn('✅ Password hashed successfully for user:', username);
	console.warn('New hashed password:', hashed);
}

hashPassword()
	.catch(console.error)
	.finally(() => prisma.$disconnect());