const mongoose = require("mongoose");
const { calculateGrade } = require("../utils/grade");

const markSchema = new mongoose.Schema({
  student:      { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  exam:         { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  subject:      { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
  marksObtained:{ type: Number, default: 0 },
  isAbsent:     { type: Boolean, default: false },
  grade:        { type: String, default: "" },
  enteredBy:    { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
}, { timestamps: true });

markSchema.index({ student: 1, exam: 1, subject: 1 }, { unique: true });
markSchema.index({ exam: 1, student: 1 });
markSchema.index({ academicYear: 1, subject: 1 });

markSchema.pre("save", async function (next) {
  try {
    if (this.isAbsent) {
      this.grade = "AB";
      return next();
    }

    const exam = await this.model("Exam").findById(this.exam).select("maxMarks").lean();
    this.grade = calculateGrade(this.marksObtained, exam?.maxMarks, this.isAbsent);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Mark", markSchema);
