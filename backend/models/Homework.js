const mongoose = require("mongoose");

const homeworkSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: "" },
  storageId: { type: String, required: true, trim: true },
  fileName: { type: String, trim: true, default: "" },
  fileUrl: { type: String, trim: true, default: "" },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true }
}, { timestamps: true });

homeworkSchema.index({ classId: 1, subjectId: 1, academicYear: 1, createdAt: -1 });

module.exports = mongoose.model("Homework", homeworkSchema);
