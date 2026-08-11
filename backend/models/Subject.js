const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  class:        { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
  teacher:      { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
}, { timestamps: true });

subjectSchema.index({ academicYear: 1, class: 1, name: 1 });
subjectSchema.index({ teacher: 1, academicYear: 1 });

module.exports = mongoose.model("Subject", subjectSchema);
