const mongoose = require("mongoose");

const examSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  subject:      { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  class:        { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
  maxMarks:     { type: Number, required: true },
  passMark:     { type: Number, required: true },
  examType:     { type: String, required: true, trim: true, default: "Periodic Test" },
  date:         { type: String, required: true },
}, { timestamps: true });

examSchema.index({ academicYear: 1, class: 1, date: -1 });
examSchema.index({ class: 1, subject: 1, date: -1 });
examSchema.index({ examType: 1, date: -1 });

module.exports = mongoose.model("Exam", examSchema);
