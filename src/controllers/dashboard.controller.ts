import { Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth';

export const getStudentDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const userId = req.user.id;

    // Get status counts
    const complaints = await prisma.complaints.findMany({
      where: { student_id: userId },
      select: { status: true },
    });

    const stats = {
      total: complaints.length,
      submitted: complaints.filter((c) => c.status === 'SUBMITTED').length,
      under_review: complaints.filter((c) => c.status === 'UNDER_REVIEW').length,
      in_progress: complaints.filter((c) => c.status === 'IN_PROGRESS').length,
      resolved: complaints.filter((c) => c.status === 'RESOLVED').length,
      closed: complaints.filter((c) => c.status === 'CLOSED').length,
    };

    // Get 5 recent complaints
    const recentComplaints = await prisma.complaints.findMany({
      where: { student_id: userId },
      orderBy: { created_at: 'desc' },
      take: 5,
      include: {
        categories: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        stats,
        recent: recentComplaints,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'STAFF') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const staffId = req.user.id;

    // Find complaints assigned to this staff member
    const complaints = await prisma.complaints.findMany({
      where: { assigned_staff_id: staffId },
      select: { status: true },
    });

    const stats = {
      total: complaints.length,
      assigned: complaints.filter((c) => c.status === 'ASSIGNED').length,
      in_progress: complaints.filter((c) => c.status === 'IN_PROGRESS').length,
      resolved: complaints.filter((c) => c.status === 'RESOLVED').length,
      closed: complaints.filter((c) => c.status === 'CLOSED').length,
    };

    const recentComplaints = await prisma.complaints.findMany({
      where: { assigned_staff_id: staffId },
      orderBy: { updated_at: 'desc' },
      take: 5,
      include: {
        categories: true,
        users_complaints_student_idTousers: {
          select: { name: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        stats,
        recent: recentComplaints,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [
      complaints,
      categories,
      departments,
      users,
    ] = await Promise.all([
      prisma.complaints.findMany({
        include: {
          categories: true,
          departments: true,
        },
      }),
      prisma.categories.findMany({ where: { status: 'ACTIVE' } }),
      prisma.departments.findMany({ where: { status: 'ACTIVE' } }),
      prisma.users.findMany({ select: { role: true } }),
    ]);

    const total = complaints.length;
    const submitted = complaints.filter((c) => c.status === 'SUBMITTED').length;
    const underReview = complaints.filter((c) => c.status === 'UNDER_REVIEW').length;
    const assigned = complaints.filter((c) => c.status === 'ASSIGNED').length;
    const inProgress = complaints.filter((c) => c.status === 'IN_PROGRESS').length;
    const resolved = complaints.filter((c) => c.status === 'RESOLVED').length;
    const closed = complaints.filter((c) => c.status === 'CLOSED').length;
    const critical = complaints.filter((c) => c.priority === 'CRITICAL' && c.status !== 'CLOSED').length;

    // Calculate Resolution Rate: (Resolved + Closed) / Total * 100
    const resolvedOrClosedCount = resolved + closed;
    const resolutionRate = total > 0 ? Math.round((resolvedOrClosedCount / total) * 100) : 0;

    // SLA Target Durations (in Milliseconds)
    // CRITICAL: 4 hours, HIGH: 24 hours, MEDIUM: 3 days, LOW: 7 days
    const slaTargetsMs: Record<string, number> = {
      CRITICAL: 4 * 60 * 60 * 1000,
      HIGH: 24 * 60 * 60 * 1000,
      MEDIUM: 3 * 24 * 60 * 60 * 1000,
      LOW: 7 * 24 * 60 * 60 * 1000,
    };

    // Calculate Overdue Complaints & Resolution Times
    let totalResolutionTimeMs = 0;
    let resolvedCountForAvg = 0;
    let overdueCount = 0;

    const now = new Date().getTime();

    complaints.forEach((c) => {
      const createdTime = c.created_at ? new Date(c.created_at).getTime() : now;
      const targetDuration = slaTargetsMs[c.priority] || slaTargetsMs.MEDIUM;

      if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
        const endTime = c.resolved_at ? new Date(c.resolved_at).getTime() : (c.closed_at ? new Date(c.closed_at).getTime() : now);
        totalResolutionTimeMs += (endTime - createdTime);
        resolvedCountForAvg++;
      } else {
        // Open complaint - check if it exceeded SLA
        const elapsed = now - createdTime;
        if (elapsed > targetDuration) {
          overdueCount++;
        }
      }
    });

    // Average Resolution Time in Hours
    const averageResolutionTimeHours =
      resolvedCountForAvg > 0
        ? Math.round((totalResolutionTimeMs / resolvedCountForAvg / (60 * 60 * 1000)) * 10) / 10
        : 0;

    // Category Distribution (Total complaints count per category)
    const categoryDistributionMap: Record<string, number> = {};
    categories.forEach((cat) => {
      categoryDistributionMap[cat.name] = 0;
    });

    complaints.forEach((c) => {
      const catName = c.categories?.name || 'Other';
      categoryDistributionMap[catName] = (categoryDistributionMap[catName] || 0) + 1;
    });

    const categoryDistribution = Object.keys(categoryDistributionMap).map((name) => ({
      name,
      value: categoryDistributionMap[name],
      percentage: total > 0 ? Math.round((categoryDistributionMap[name] / total) * 100) : 0,
    }));

    // Department Performance
    const departmentPerformanceMap: Record<string, { total: number; resolved: number; totalTimeMs: number }> = {};
    departments.forEach((dept) => {
      departmentPerformanceMap[dept.name] = { total: 0, resolved: 0, totalTimeMs: 0 };
    });

    complaints.forEach((c) => {
      if (c.departments) {
        const deptName = c.departments.name;
        if (!departmentPerformanceMap[deptName]) {
          departmentPerformanceMap[deptName] = { total: 0, resolved: 0, totalTimeMs: 0 };
        }
        departmentPerformanceMap[deptName].total++;
        if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
          departmentPerformanceMap[deptName].resolved++;
          const createdTime = c.created_at ? new Date(c.created_at).getTime() : now;
          const endTime = c.resolved_at ? new Date(c.resolved_at).getTime() : now;
          departmentPerformanceMap[deptName].totalTimeMs += (endTime - createdTime);
        }
      }
    });

    const departmentPerformance = Object.keys(departmentPerformanceMap).map((name) => {
      const data = departmentPerformanceMap[name];
      const avgTimeHours =
        data.resolved > 0 ? Math.round((data.totalTimeMs / data.resolved / (60 * 60 * 1000)) * 10) / 10 : 0;
      return {
        name,
        total: data.total,
        resolved: data.resolved,
        pending: data.total - data.resolved,
        avgResolutionTimeHours: avgTimeHours,
      };
    });

    // Complaints volume over last 7 days
    const dailyVolumeMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyVolumeMap[dateString] = 0;
    }

    complaints.forEach((c) => {
      if (c.created_at) {
        const dateString = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dailyVolumeMap[dateString] !== undefined) {
          dailyVolumeMap[dateString]++;
        }
      }
    });

    const complaintsVolume = Object.keys(dailyVolumeMap).map((date) => ({
      date,
      count: dailyVolumeMap[date],
    }));

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          total,
          submitted,
          under_review: underReview,
          assigned,
          in_progress: inProgress,
          resolved,
          closed,
          critical,
          overdue: overdueCount,
          averageResolutionTimeHours,
          resolutionRate,
        },
        categoryDistribution,
        departmentPerformance,
        complaintsVolume,
        usersCount: {
          students: users.filter((u) => u.role === 'STUDENT').length,
          staff: users.filter((u) => u.role === 'STAFF').length,
          admins: users.filter((u) => u.role === 'ADMIN').length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
