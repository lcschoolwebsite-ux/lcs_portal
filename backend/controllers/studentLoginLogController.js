const StudentLoginLog = require("../models/StudentLoginLog");

exports.getAll = async (req, res) => {
  try {
    const { date } = req.query;
    const query = {};

    if (date) {
      const selectedDate = new Date(`${date}T00:00:00`);
      if (Number.isNaN(selectedDate.getTime())) {
        return res.status(400).json({ message: "Invalid date" });
      }

      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
      query.createdAt = { $gte: selectedDate, $lt: nextDate };
    } else {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: cutoff };
    }

    const logs = await StudentLoginLog.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const uniqueStudentCount = new Set(logs.map(log => String(log.studentId || ""))).size;

    res.json({
      logs,
      summary: {
        totalLogins: logs.length,
        uniqueStudents: uniqueStudentCount,
        date: date || null
      }
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
