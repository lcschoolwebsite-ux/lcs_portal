const calculateGrade = (marksObtained, maxMarks, isAbsent) => {
  if (isAbsent) return "AB";

  const numericMaxMarks = Number(maxMarks || 0);
  const percentage = numericMaxMarks > 0
    ? (Number(marksObtained || 0) / numericMaxMarks) * 100
    : 0;

  if      (percentage >= 90) return "A+";
  else if (percentage >= 80) return "A";
  else if (percentage >= 70) return "B+";
  else if (percentage >= 60) return "B";
  else if (percentage >= 50) return "C";
  else if (percentage >= 35) return "D";
  return "F";
};

module.exports = { calculateGrade };
