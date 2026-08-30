const API_URL = 'http://127.0.0.1:5050/api/v1';

async function runTest() {
  console.log('🚀 Starting CCMS End-to-End Automated Integration Verification...\n');

  try {
    // 1. Log in as Student
    console.log('1. Logging in as Student...');
    const studLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@college.edu', password: 'password123' }),
    });
    const studLoginData = (await studLoginRes.json()) as any;
    if (!studLoginData.success) throw new Error('Student login failed: ' + studLoginData.message);
    const studToken = studLoginData.data.token;
    console.log('   ✅ Student logged in successfully.');

    // 2. Student Submits Complaint
    console.log('\n2. Submitting a new complaint...');
    const compRes = await fetch(`${API_URL}/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studToken}`,
      },
      body: JSON.stringify({
        title: 'Wi-Fi not working in Block A',
        category_id: 4, // Wi-Fi / Internet
        location: 'Block A - 2nd Floor',
        description: 'The Wi-Fi connection keeps disconnecting in Lab 3. We cannot perform our lab practicals.',
      }),
    });
    const compData = (await compRes.json()) as any;
    if (!compData.success) throw new Error('Complaint submission failed: ' + compData.message);
    const complaint = compData.data;
    console.log(`   ✅ Complaint submitted successfully. ID: ${complaint.id}, Number: ${complaint.complaint_number}`);

    // 3. Log in as Admin
    console.log('\n3. Logging in as Admin...');
    const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@college.edu', password: 'password123' }),
    });
    const adminLoginData = (await adminLoginRes.json()) as any;
    if (!adminLoginData.success) throw new Error('Admin login failed: ' + adminLoginData.message);
    const adminToken = adminLoginData.data.token;
    console.log('   ✅ Admin logged in successfully.');

    // 4. Admin marks complaint as Under Review
    console.log('\n4. Admin marking complaint as Under Review...');
    const reviewRes = await fetch(`${API_URL}/complaints/${complaint.id}/review`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    const reviewData = (await reviewRes.json()) as any;
    if (!reviewData.success) throw new Error('Review failed: ' + reviewData.message);
    console.log('   ✅ Complaint status updated to UNDER_REVIEW.');

    // 5. Admin queries staff to find Arun Kumar's ID
    console.log('\n5. Querying staff list to find Arun Kumar...');
    const staffListRes = await fetch(`${API_URL}/admin/staff`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    const staffListData = (await staffListRes.json()) as any;
    if (!staffListData.success) throw new Error('Staff lookup failed: ' + staffListData.message);
    const arun = staffListData.data.find((s: any) => s.email === 'arun@college.edu');
    if (!arun) throw new Error('Staff member Arun Kumar not found in database');
    console.log(`   ✅ Found staff member Arun Kumar. ID: ${arun.id}`);

    // 6. Admin assigns complaint to IT Department and Staff Arun
    console.log('\n6. Admin assigning complaint to IT Department & Staff Arun...');
    const assignRes = await fetch(`${API_URL}/complaints/${complaint.id}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        department_id: 1, // IT Department
        assigned_staff_id: arun.id,
      }),
    });
    const assignData = (await assignRes.json()) as any;
    if (!assignData.success) throw new Error('Assignment failed: ' + assignData.message);
    console.log('   ✅ Complaint successfully assigned to IT Dept & Arun Kumar.');

    // 7. Log in as Staff (Arun Kumar)
    console.log('\n7. Logging in as Staff (Arun Kumar)...');
    const staffLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'arun@college.edu', password: 'password123' }),
    });
    const staffLoginData = (await staffLoginRes.json()) as any;
    if (!staffLoginData.success) throw new Error('Staff login failed: ' + staffLoginData.message);
    const staffToken = staffLoginData.data.token;
    console.log('   ✅ Staff logged in successfully.');

    // 8. Staff starts work (In Progress)
    console.log('\n8. Staff marking complaint as In Progress...');
    const startRes = await fetch(`${API_URL}/complaints/${complaint.id}/start`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`,
      },
    });
    const startData = (await startRes.json()) as any;
    if (!startData.success) throw new Error('Start progress failed: ' + startData.message);
    console.log('   ✅ Complaint status updated to IN_PROGRESS.');

    // 9. Staff leaves a progress comment
    console.log('\n9. Staff leaving progress comment...');
    const commentRes = await fetch(`${API_URL}/comments/${complaint.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`,
      },
      body: JSON.stringify({ comment: 'Technician will inspect the router.' }),
    });
    const commentData = (await commentRes.json()) as any;
    if (!commentData.success) throw new Error('Comment addition failed: ' + commentData.message);
    console.log('   ✅ Comment posted successfully.');

    // 10. Staff resolves complaint
    console.log('\n10. Staff submitting resolution...');
    const resolveRes = await fetch(`${API_URL}/complaints/${complaint.id}/resolve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`,
      },
      body: JSON.stringify({ resolution_description: 'Router configuration restored.' }),
    });
    const resolveData = (await resolveRes.json()) as any;
    if (!resolveData.success) throw new Error('Resolution failed: ' + resolveData.message);
    console.log('   ✅ Complaint resolved successfully.');

    // 11. Student accepts resolution & closes complaint
    console.log('\n11. Student accepting resolution & closing complaint...');
    const closeRes = await fetch(`${API_URL}/complaints/${complaint.id}/close`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studToken}`,
      },
      body: JSON.stringify({ accept: true }),
    });
    const closeData = (await closeRes.json()) as any;
    if (!closeData.success) throw new Error('Closure failed: ' + closeData.message);
    console.log('   ✅ Complaint closed successfully.');

    // 12. Student submits feedback rating
    console.log('\n12. Student submitting 5-star feedback rating...');
    const fbRes = await fetch(`${API_URL}/feedback/${complaint.id}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studToken}`,
      },
      body: JSON.stringify({ rating: 5, comment: 'Quick turnaround, thank you!' }),
    });
    const fbData = (await fbRes.json()) as any;
    if (!fbData.success) throw new Error('Feedback submission failed: ' + fbData.message);
    console.log('   ✅ Feedback submitted successfully.');

    // 13. Verify Admin Dashboard updates
    console.log('\n13. Verifying Admin Dashboard analytics...');
    const adminDashRes = await fetch(`${API_URL}/dashboard/admin`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
    });
    const adminDashData = (await adminDashRes.json()) as any;
    if (!adminDashData.success) throw new Error('Admin dashboard failed: ' + adminDashData.message);
    const stats = adminDashData.data.stats;
    console.log(`   📈 Total closed: ${stats.closed}, Avg Resolution time: ${stats.averageResolutionTimeHours} hrs, Resolution Rate: ${stats.resolutionRate}%`);

    console.log('\n🌟 CCMS E2E INTEGRATION TESTS COMPLETED SUCCESSFULLY! 🌟');
  } catch (error: any) {
    console.error('\n❌ Integration verification failed:', error.message);
    process.exit(1);
  }
}

runTest();
