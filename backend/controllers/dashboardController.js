const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Class = require("../models/Class");
const StudentFee = require("../models/StudentFee");
const Attendance = require("../models/Attendance");
const AcademicYear = require("../models/AcademicYear");
const { getHolidayCalendar, toLocalDateString } = require("../utils/holidayUtils");

exports.getAdminStats = async (req, res) => {
  try {
    const activeYear = await AcademicYear.findOne({ isActive: true }).select("_id startDate endDate").lean();
    const yearId = activeYear ? activeYear._id : null;

    const [studentCount, teacherCount, classCount, feeStats, studentsByClass] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      Teacher.countDocuments({ isActive: true }),
      Class.countDocuments({}),
      StudentFee.aggregate([
        { $match: yearId ? { academicYear: yearId } : {} },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: "$totalPaid" },
            totalDue: { $sum: "$totalDue" },
            totalExpected: { $sum: "$totalAnnualFee" }
          }
        }
      ]),
      Student.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$class", count: { $sum: 1 } } },
        { $lookup: { from: "classes", localField: "_id", foreignField: "_id", as: "classInfo" } },
        { $unwind: "$classInfo" },
        { $project: { name: { $concat: ["$classInfo.name", "$classInfo.section"] }, count: 1 } }
      ])
    ]);

    const fees = feeStats[0] || { totalCollected: 0, totalDue: 0, totalExpected: 0 };
    const today = toLocalDateString(new Date());
    const { holidays } = await getHolidayCalendar(yearId);
    const todayHoliday = holidays.find(h => h.date === today);

    if (todayHoliday) {
      return res.json({
        students: studentCount,
        teachers: teacherCount,
        classes: classCount,
        fees: fees.totalCollected,
        pendingFees: fees.totalDue,
        studentsByClass,
        todayAttendance: {
          present: 0,
          absent: 0,
          unmarkedClasses: [],
          unmarkedClassDetails: [],
          isHoliday: true,
          holiday: todayHoliday.eventName,
          holidayDate: todayHoliday.date
        },
        recentActivity: [],
        upcomingExams: []
      });
    }

    const [attendanceRecords, allClasses] = await Promise.all([
      Attendance.find({ date: today })
        .select("class absentees")
        .lean(),
      Class.find({})
        .select("name section classTeacher")
        .populate("classTeacher", "name username")
        .lean()
    ]);

    const markedClassIds = attendanceRecords
      .map(a => a.class?.toString())
      .filter(Boolean);
    
    const totalStudentsInMarkedClasses = markedClassIds.length
      ? await Student.countDocuments({
          class: { $in: markedClassIds },
          isActive: true
        })
      : 0;
    
    const totalAbsentees = attendanceRecords.reduce((sum, rec) => sum + rec.absentees.length, 0);

    const todayAttendance = {
      present: totalStudentsInMarkedClasses - totalAbsentees,
      absent: totalAbsentees,
      unmarkedClasses: [],
      unmarkedClassDetails: [],
      isHoliday: false
    };

    const markedClassIdSet = new Set(markedClassIds);
    todayAttendance.unmarkedClassDetails = allClasses
      .filter(c => !markedClassIdSet.has(c._id.toString()))
      .map(c => ({
        classId: c._id,
        className: `${c.name}${c.section}`,
        classLabel: [c.name, c.section].filter(Boolean).join(" "),
        teacherId: c.classTeacher?._id || null,
        teacherName: c.classTeacher?.name || "Not assigned"
      }));
    todayAttendance.unmarkedClasses = todayAttendance.unmarkedClassDetails.map(item => item.className);

    res.json({
      students: studentCount,
      teachers: teacherCount,
      classes: classCount,
      fees: fees.totalCollected,
      pendingFees: fees.totalDue,
      studentsByClass,
      todayAttendance,
      recentActivity: [], // Optional: Could fetch recent logs
      upcomingExams: []    // Optional: Could fetch from Exam model
    });

  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
