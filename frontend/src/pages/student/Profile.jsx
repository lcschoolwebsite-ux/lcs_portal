import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import useActiveAcademicYear from "../../hooks/useActiveAcademicYear";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const classLabel = useMemo(() => [user?.class?.name, user?.class?.section].filter(Boolean).join(""), [user]);
  const { academicYearLabel } = useActiveAcademicYear(user?.academicYear?.year);
  const fileInputRef = useRef(null);
  const studentId = String(user?.id || user?._id || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    email: user?.email || "",
    address: user?.address || "",
    dob: user?.dob || "",
    penCode: user?.penCode || ""
  });
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState("");

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    setInfoForm({
      email: user?.email || "",
      address: user?.address || "",
      dob: user?.dob || "",
      penCode: user?.penCode || ""
    });
  }, [user?.email, user?.address, user?.dob, user?.penCode]);

  useEffect(() => {
    if (!studentId) return;

    const fetchTeachers = async () => {
      setTeachersLoading(true);
      setTeachersError("");
      try {
        const { data } = await api.get(`/students/${studentId}/teachers`);
        setTeachers(data?.teachers || []);
      } catch (e) {
        setTeachersError(e.response?.data?.message || "Unable to load class teachers.");
      } finally {
        setTeachersLoading(false);
      }
    };

    fetchTeachers();
  }, [studentId]);

  const refreshCurrentUser = async (fallbackUser) => {
    try {
      const { data } = await api.get("/auth/me");
      updateUser(data);
      return data;
    } catch (_) {
      if (fallbackUser) updateUser(fallbackUser);
      return fallbackUser;
    }
  };

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setError("");
    setMessage("");
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setSelectedFile(null);
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setSelectedFile(null);
      setError("Photo must be 2 MB or smaller.");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !studentId) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("photo", selectedFile);

      const { data } = await api.post(`/students/${studentId}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const nextUser = data?.student || data;
      await refreshCurrentUser(nextUser);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Profile photo updated successfully.");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to upload photo.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!studentId || !user?.photoUrl) return;

    setRemoving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.delete(`/students/${studentId}/photo`);
      const nextUser = data?.student || data;
      await refreshCurrentUser(nextUser);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Profile photo removed.");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to remove photo.");
    } finally {
      setRemoving(false);
    }
  };

  const handleInfoChange = (field, value) => {
    setInfoForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCancelInfoEdit = () => {
    setEditingInfo(false);
    setInfoForm({
      email: user?.email || "",
      address: user?.address || "",
      dob: user?.dob || "",
      penCode: user?.penCode || ""
    });
    setError("");
    setMessage("");
  };

  const handleSaveInfo = async () => {
    if (!studentId) return;

    setSavingInfo(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put(`/students/${studentId}/profile`, infoForm);
      const nextUser = data?.student || data;
      await refreshCurrentUser(nextUser);
      setEditingInfo(false);
      setMessage("Profile information updated successfully.");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to update profile information.");
    } finally {
      setSavingInfo(false);
    }
  };

  return (
    <div style={s.container} className="student-profile-page">
      <h1 style={s.title}>My Profile</h1>

      {message && <div style={s.successBox}>{message}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.card} className="student-profile-card">
        <div style={s.header} className="student-profile-header">
          <div style={s.photoWrap}>
            {previewUrl || user?.photoUrl ? (
              <img src={previewUrl || user.photoUrl} alt={user?.name || "Student"} style={s.photo} />
            ) : (
              <div style={s.avatar}>{user?.name?.[0] || "S"}</div>
            )}
          </div>

          <div style={s.headerCopy}>
            <h2 style={s.name}>{user?.name || "Student"}</h2>
            <p style={s.role}>{classLabel ? `Class ${classLabel}` : "LCS Portal"}</p>
            <div style={s.photoActions}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={s.hiddenInput}
              />
              <button type="button" onClick={handlePickPhoto} style={s.secondaryBtn}>
                <i className="fa-solid fa-image"></i>
                Choose Photo
              </button>
              <button
                type="button"
                onClick={handleUpload}
                style={s.primaryBtn}
                disabled={!selectedFile || saving}
              >
                <i className="fa-solid fa-cloud-arrow-up"></i>
                {saving ? "Uploading..." : "Save Photo"}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                style={s.ghostBtn}
                disabled={!user?.photoUrl || removing}
              >
                <i className="fa-solid fa-trash-can"></i>
                {removing ? "Removing..." : "Delete Photo"}
              </button>
            </div>
            <div style={s.helper}>
              JPG, PNG, or WebP up to 2 MB. The photo updates everywhere your profile appears.
            </div>
            {selectedFile && <div style={s.fileName}>Selected: {selectedFile.name}</div>}
          </div>
        </div>

        <div style={s.grid} className="student-profile-grid">
          <div style={s.section}>
            <div style={s.sectionHead}>
              <h3 style={s.sectionTitle}>Personal Information</h3>
              {!editingInfo ? (
                <button type="button" style={s.editBtn} onClick={() => setEditingInfo(true)}>
                  <i className="fa-solid fa-pen-to-square"></i>
                  Edit
                </button>
              ) : (
                <div style={s.editActions}>
                  <button type="button" style={s.cancelBtn} onClick={handleCancelInfoEdit} disabled={savingInfo}>
                    Cancel
                  </button>
                  <button type="button" style={s.saveInfoBtn} onClick={handleSaveInfo} disabled={savingInfo}>
                    <i className="fa-solid fa-floppy-disk"></i>
                    {savingInfo ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>
            <DetailItem label="Full Name" value={user?.name} />
            {editingInfo ? (
              <EditableItem label="Date of Birth" value={infoForm.dob} onChange={value => handleInfoChange("dob", value)} placeholder="DD/MM/YYYY" />
            ) : (
              <DetailItem label="Date of Birth" value={user?.dob} />
            )}
            <DetailItem label="Mobile No." value={user?.mobile || "N/A"} />
            <DetailItem label="Mobile No. 2" value={user?.alternateMobile || "N/A"} />
            {editingInfo ? (
              <>
                <EditableItem label="Email" value={infoForm.email} onChange={value => handleInfoChange("email", value)} placeholder="student@email.com" type="email" />
                <EditableItem label="Permanent Address" value={infoForm.address} onChange={value => handleInfoChange("address", value)} placeholder="Enter permanent address" multiline />
              </>
            ) : (
              <>
                <DetailItem label="Email" value={user?.email || "N/A"} />
                <DetailItem label="Permanent Address" value={user?.address || "N/A"} />
              </>
            )}
          </div>

          <div style={s.section}>
            <h3 style={s.sectionTitle}>Academic Details</h3>
            <DetailItem label="SATS No." value={user?.satCode} />
            {editingInfo ? (
              <EditableItem label="PEN Code" value={infoForm.penCode} onChange={value => handleInfoChange("penCode", value)} placeholder="Enter PEN code" />
            ) : (
              <DetailItem label="PEN Code" value={user?.penCode} />
            )}
            <DetailItem label="Class" value={classLabel} />
            <DetailItem label="Academic Year" value={academicYearLabel} />
          </div>

          <div style={s.section}>
            <h3 style={s.sectionTitle}>Parental Details</h3>
            <DetailItem label="Father's Name" value={user?.fatherName} />
            <DetailItem label="Mother's Name" value={user?.motherName} />
          </div>
        </div>

        <div style={s.teachersSection}>
          <div style={s.teachersHeader}>
            <div>
              <h3 style={s.teachersTitle}>Class Teachers & Subjects</h3>
              <p style={s.teachersSubtitle}>Teachers assigned to your class and the subjects they teach.</p>
            </div>
          </div>

          {teachersError && <div style={s.inlineError}>{teachersError}</div>}
          {teachersLoading ? (
            <div style={s.teachersEmpty}><i className="fa-solid fa-circle-notch fa-spin"></i> Loading teachers...</div>
          ) : teachers.length ? (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Teacher</th>
                    <th style={s.th}>Subject</th>
                    <th style={s.th}>Role</th>
                    <th style={s.th}>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher, index) => (
                    <tr key={`${teacher.teacherId || "teacher"}-${teacher.subjectId || index}`}>
                      <td style={s.td}>
                        <div style={s.teacherCell}>
                          <TeacherPhoto teacher={teacher} />
                          <span style={s.teacherName}>{teacher.teacherName || "Not assigned"}</span>
                        </div>
                      </td>
                      <td style={s.td}>{teacher.subjectName || "N/A"}</td>
                      <td style={s.td}>
                        <span style={teacher.role === "Class Teacher" ? s.classTeacherPill : s.subjectTeacherPill}>
                          {teacher.role || "Subject Teacher"}
                        </span>
                      </td>
                      <td style={s.td}>
                        <div style={s.contactStack}>
                          <span>{teacher.teacherPhone || "N/A"}</span>
                          {teacher.teacherEmail && <span style={s.contactEmail}>{teacher.teacherEmail}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={s.teachersEmpty}>No teachers are assigned to your class yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div style={s.item}>
      <span style={s.label}>{label}</span>
      <span style={s.value}>{value || "N/A"}</span>
    </div>
  );
}

function EditableItem({ label, value, onChange, placeholder, type = "text", multiline = false }) {
  return (
    <label style={s.item}>
      <span style={s.label}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          style={{ ...s.input, ...s.textarea }}
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          style={s.input}
        />
      )}
    </label>
  );
}

function TeacherPhoto({ teacher }) {
  return (
    <div style={s.teacherAvatar}>
      {teacher?.photoUrl ? (
        <img src={teacher.photoUrl} alt={teacher.teacherName || "Teacher"} style={s.teacherPhoto} />
      ) : (
        teacher?.teacherName?.[0] || "T"
      )}
    </div>
  );
}

const s = {
  container: { width: "100%" },
  title: { fontSize: "1.75rem", fontWeight: "800", color: "#2d3748", marginBottom: "1.25rem" },
  successBox: { marginBottom: "1rem", background: "rgba(16,185,129,0.1)", color: "#065f46", border: "1px solid rgba(16,185,129,0.18)", padding: "12px 14px", borderRadius: "12px", fontWeight: "700" },
  errorBox: { marginBottom: "1rem", background: "rgba(239,68,68,0.08)", color: "#991b1b", border: "1px solid rgba(239,68,68,0.18)", padding: "12px 14px", borderRadius: "12px", fontWeight: "700" },
  card: { background: "#fff", padding: "2rem", borderRadius: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)", border: "1px solid #edf2f7" },
  header: { display: "flex", alignItems: "flex-start", gap: "1.25rem", marginBottom: "2rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "1.5rem" },
  headerCopy: { flex: 1, minWidth: 0 },
  photoWrap: { position: "relative", width: "104px", height: "104px", flex: "0 0 auto" },
  avatar: { width: "96px", height: "96px", borderRadius: "50%", background: "linear-gradient(135deg, #d69e2e, #f6e05e)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: "800" },
  photo: { width: "96px", height: "96px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--gold)" },
  name: { fontSize: "1.5rem", fontWeight: "800", color: "#1a202c", margin: 0 },
  role: { fontSize: "0.85rem", color: "#d69e2e", fontWeight: "700", marginTop: "0.25rem", letterSpacing: "0.05em", marginBottom: "0.75rem" },
  photoActions: { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "0.5rem" },
  hiddenInput: { display: "none" },
  primaryBtn: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "#fff", border: "none", borderRadius: "999px", padding: "10px 16px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  secondaryBtn: { background: "rgba(14,107,107,0.08)", color: "var(--navy-dark)", border: "1px solid rgba(14,107,107,0.14)", borderRadius: "999px", padding: "10px 16px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  ghostBtn: { background: "transparent", color: "#991b1b", border: "1px solid rgba(153,27,27,0.2)", borderRadius: "999px", padding: "10px 16px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  helper: { fontSize: "0.82rem", color: "#64748b", fontWeight: "600", lineHeight: 1.45 },
  fileName: { marginTop: "8px", fontSize: "0.84rem", color: "#0f766e", fontWeight: "700" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem" },
  section: { marginBottom: "1rem" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "1rem", borderBottom: "1px solid #f7fafc", paddingBottom: "0.5rem" },
  sectionTitle: { fontSize: "1rem", fontWeight: "800", color: "#2d3748", margin: 0 },
  editActions: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  editBtn: { background: "rgba(14,107,107,0.08)", color: "var(--navy-dark)", border: "1px solid rgba(14,107,107,0.14)", borderRadius: "999px", padding: "8px 13px", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "7px", cursor: "pointer" },
  saveInfoBtn: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "#fff", border: "none", borderRadius: "999px", padding: "8px 13px", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "7px", cursor: "pointer" },
  cancelBtn: { background: "transparent", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: "999px", padding: "8px 13px", fontWeight: "800", cursor: "pointer" },
  item: { marginBottom: "0.75rem", display: "flex", flexDirection: "column" },
  label: { fontSize: "0.75rem", color: "#718096", fontWeight: "600", textTransform: "uppercase" },
  value: { fontSize: "0.95rem", color: "#2d3748", fontWeight: "500", marginTop: "0.1rem" },
  input: { marginTop: "6px", width: "100%", border: "1.5px solid #dbe3ea", borderRadius: "12px", padding: "11px 12px", color: "#1e293b", fontWeight: "700", fontSize: "0.92rem", outline: "none", boxSizing: "border-box", background: "#fff" },
  textarea: { resize: "vertical", minHeight: "82px", fontFamily: "inherit", lineHeight: 1.45 },
  teachersSection: { marginTop: "2rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.5rem" },
  teachersHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "1rem" },
  teachersTitle: { fontSize: "1.1rem", fontWeight: "900", color: "#2d3748", margin: 0 },
  teachersSubtitle: { margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.86rem", fontWeight: "600" },
  inlineError: { marginBottom: "1rem", background: "rgba(239,68,68,0.08)", color: "#991b1b", border: "1px solid rgba(239,68,68,0.18)", padding: "10px 12px", borderRadius: "10px", fontWeight: "700" },
  teachersEmpty: { padding: "22px", textAlign: "center", color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", fontWeight: "700" },
  tableWrap: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "14px" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "680px", background: "#fff" },
  th: { textAlign: "left", background: "#f8fafc", color: "#475569", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", padding: "12px 14px", borderBottom: "1px solid #e2e8f0", fontWeight: "900" },
  td: { padding: "12px 14px", borderBottom: "1px solid #eef2f7", color: "#1e293b", fontSize: "0.9rem", fontWeight: "700", verticalAlign: "middle" },
  teacherCell: { display: "flex", alignItems: "center", gap: "10px" },
  teacherAvatar: { width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", flex: "0 0 auto", overflow: "hidden", boxShadow: "0 0 0 2px rgba(200,150,12,0.18)" },
  teacherPhoto: { width: "100%", height: "100%", objectFit: "cover" },
  teacherName: { minWidth: 0 },
  classTeacherPill: { display: "inline-flex", padding: "6px 10px", borderRadius: "999px", background: "rgba(200,150,12,0.16)", color: "var(--navy-dark)", fontSize: "0.74rem", fontWeight: "900", whiteSpace: "nowrap" },
  subjectTeacherPill: { display: "inline-flex", padding: "6px 10px", borderRadius: "999px", background: "rgba(14,107,107,0.08)", color: "var(--navy)", fontSize: "0.74rem", fontWeight: "900", whiteSpace: "nowrap" },
  contactStack: { display: "flex", flexDirection: "column", gap: "3px" },
  contactEmail: { color: "#64748b", fontSize: "0.78rem", fontWeight: "700" }
};
