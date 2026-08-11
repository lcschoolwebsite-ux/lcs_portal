const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const teacherSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  username:         { type: String, required: true, unique: true },
  password:         { type: String, required: true },
  email:            { type: String },
  phone:            { type: String },
  photoUrl:         { type: String, default: "" },
  photoPublicId:    { type: String, default: "" },
  assignedClasses:  [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
  assignedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
  pushTokens: [
    {
      token: { type: String, trim: true },
      platform: { type: String, default: "android" },
      label: { type: String, default: "" },
      lastSeenAt: { type: Date, default: Date.now }
    }
  ],
  isActive:         { type: Boolean, default: true },
}, { timestamps: true });

teacherSchema.index({ isActive: 1, name: 1 });
teacherSchema.index({ assignedClasses: 1 });

teacherSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

teacherSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("Teacher", teacherSchema);
