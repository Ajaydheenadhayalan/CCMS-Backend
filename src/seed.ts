import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Seed Departments
  const departmentsData = [
    { name: 'IT Department', description: 'Information Technology and Networking support' },
    { name: 'Electrical Department', description: 'Power grid, wiring, lights, and fans maintenance' },
    { name: 'Civil Maintenance', description: 'Building structures, classrooms, woodwork, and paint' },
    { name: 'Hostel Administration', description: 'Hostel mess, rooms, water, and warden support' },
    { name: 'Transport Department', description: 'College buses and vans logistics' },
    { name: 'Housekeeping', description: 'Campus cleanliness, waste disposal, and washrooms' },
    { name: 'Security', description: 'Main gate, ID checks, and safety patrols' },
    { name: 'Library', description: 'Book lending, study space, and digital catalog issues' },
  ];

  console.log('Creating departments...');
  const departmentsMap: Record<string, any> = {};
  for (const dept of departmentsData) {
    const createdDept = await prisma.departments.upsert({
      where: { name: dept.name },
      update: {},
      create: {
        name: dept.name,
        description: dept.description,
        status: 'ACTIVE',
      },
    });
    departmentsMap[dept.name] = createdDept;
  }
  console.log('✅ Departments seeded successfully.');

  // 2. Seed Categories
  const categoriesData = [
    { name: 'Laboratory', description: 'Lab computers, equipment, or air conditioning issues' },
    { name: 'Hostel', description: 'Hostel room issues, keys, washrooms, or warden updates' },
    { name: 'Wi-Fi / Internet', description: 'Campus network connectivity and access credentials' },
    { name: 'Infrastructure', description: 'Furniture, doors, windows, paint, and general building issues' },
    { name: 'Electrical', description: 'Lights, fans, sockets, and switchboard malfunctions' },
    { name: 'Plumbing', description: 'Water leakage, taps, pipes, and washroom fittings' },
    { name: 'Cleanliness', description: 'Littering, waste disposal, or unclean corridors' },
    { name: 'Transportation', description: 'Bus route timings, driver behavior, or vehicle comfort' },
    { name: 'Library', description: 'Library card, book return, reading light, or catalog search' },
    { name: 'Canteen', description: 'Canteen food hygiene, seating, or billing issues' },
    { name: 'Security', description: 'Parking issues, ID theft, or security guard behavior' },
    { name: 'Sports Facilities', description: 'Gym equipment, playground condition, or sports gear issues' },
    { name: 'Classroom', description: 'Classroom projector, blackboard, benches, or AC issues' },
    { name: 'Other', description: 'Miscellaneous complaints not covered by other categories' },
  ];

  console.log('Creating categories...');
  for (const cat of categoriesData) {
    await prisma.categories.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        description: cat.description,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✅ Categories seeded successfully.');

  // 3. Seed Users
  console.log('Creating default users...');
  const passwordHash = await bcrypt.hash('password123', 10);

  // Admin User
  await prisma.users.upsert({
    where: { email: 'admin@college.edu' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@college.edu',
      password_hash: passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  // Student User
  await prisma.users.upsert({
    where: { email: 'student@college.edu' },
    update: {},
    create: {
      name: 'Test Student',
      email: 'student@college.edu',
      password_hash: passwordHash,
      role: 'STUDENT',
      student_id: 'STUDENT001',
      phone: '9876543210',
      status: 'ACTIVE',
    },
  });

  // Staff Users
  const staffData = [
    { name: 'Arun Kumar', email: 'arun@college.edu', employeeId: 'EMP001', departmentName: 'IT Department' },
    { name: 'Vigneshwaran', email: 'vignesh@college.edu', employeeId: 'EMP002', departmentName: 'Electrical Department' },
    { name: 'Ravi Shankar', email: 'ravi@college.edu', employeeId: 'EMP003', departmentName: 'Hostel Administration' },
  ];

  for (const staff of staffData) {
    const dept = departmentsMap[staff.departmentName];
    await prisma.users.upsert({
      where: { email: staff.email },
      update: {},
      create: {
        name: staff.name,
        email: staff.email,
        password_hash: passwordHash,
        role: 'STAFF',
        employee_id: staff.employeeId,
        department_id: dept?.id || null,
        status: 'ACTIVE',
      },
    });
  }

  console.log('✅ Default users seeded successfully.');
  console.log('🌱 Seeding process complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
