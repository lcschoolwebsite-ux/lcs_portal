const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  class:        { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
  date:         { type: String, required: true },        // "YYYY-MM-DD"
  absentees:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  markedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
  markedAt:     { type: Date, default: Date.now },
}, { timestamps: true });

attendanceSchema.index({ class: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
