import { useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import Table from "../../components/Table";
import Modal from "../../components/Modal";
import { useAuth } from "../../context/useAuth";
import SectionTitle from "../../components/SectionTitle";
import { getTeacherAssignedClasses } from "../../utils/teacherClasses";

export default function Students() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [classFilter, setClassFilter] = useState(searchParams.get("classId") || "");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allowTeacherStudentCreation, setAllowTeacherStudentCreation] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);

  const [form, setForm] = useState({
    name: "", dob: "", fatherName: "", motherName: "", mobile: "", alternateMobile: "", email: "", address: "",
    satCode: "", penCode: "", class: ""
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, settingsRes, classesRes] = await Promise.all([
        api.get("/students", { params: { search, classId: classFilter, page, limit: 25 } }),
        api.get("/settings/student-registration"),
        api.get("/classes")
      ]);
      setStudents(studentsRes.data.data || studentsRes.data);
      setPagination(studentsRes.data.pagination || { page: 1, limit: studentsRes.data.length, total: studentsRes.data.length, totalPages: 1 });
      setAllowTeacherStudentCreation(Boolean(settingsRes.data.allowTeacherStudentCreation));
      setClasses(classesRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setClassFilter(searchParams.get("classId") || "");
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

  useEffect(() => { fetchData(); }, [search, classFilter, page]);

  useEffect(() => { setPage(1); }, [search, classFilter]);

  const handleClassFilterChange = (value) => {
    setClassFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("classId", value);
    else next.delete("classId");
    setSearchParams(next, { replace: true });
  };

  const myClasses = getTeacherAssignedClasses(user, classes);

  const handleOpenEdit = (s) => {
    setSelectedStudent(s);
    setPhotoMessage("");
    setPhotoError("");
    setForm({
      name: s.name || "",
      dob: s.dob || "",
      fatherName: s.fatherName || "",
      motherName: s.motherName || "",
      mobile: s.mobile || "",
      alternateMobile: s.alternateMobile || "",
      email: s.email || "",
      address: s.address || "",
      satCode: s.satCode || "",
      penCode: s.penCode || "",
      class: s.class?._id || ""
    });
    setIsModalOpen(true);
  };

  const updateStudentInList = (updatedStudent) => {
    setSelectedStudent(updatedStudent);
    setStudents(prev => prev.map(student => student._id === updatedStudent._id ? updatedStudent : student));
  };

  const handleSave = async () => {
    try {
      await api.put(`/students/${selectedStudent._id}`, form);
      alert("Student updated successfully!");
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      alert(e.response?.data?.message || "Update failed");
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedStudent) return;

    setPhotoMessage("");
    setPhotoError("");

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Photo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    const payload = new FormData();
    payload.append("photo", file);

    setPhotoUploading(true);
    try {
      const { data } = await api.post(`/students/${selectedStudent._id}/photo`, payload, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (data.student) updateStudentInList(data.student);
      setPhotoMessage("Student photo updated.");
    } catch (e) {
      setPhotoError(e.response?.data?.message || "Unable to upload photo.");
    } finally {
      setPhotoUploading(false);
      event.target.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    if (!selectedStudent?.photoUrl) return;
    if (!confirm("Remove this student's photo?")) return;

    setPhotoMessage("");
    setPhotoError("");
    setPhotoUploading(true);
    try {
      const { data } = await api.delete(`/students/${selectedStudent._id}/photo`);
      if (data.student) updateStudentInList(data.student);
      setPhotoMessage("Student photo removed.");
    } catch (e) {
      setPhotoError(e.response?.data?.message || "Unable to remove photo.");
    } finally {
      setPhotoUploading(false);
    }
  };

  return (
    <div>
      <div style={s.header}>
        <SectionTitle 
          title="My Students" 
          subtitle="View and manage students in your assigned classes." 
        />
        {allowTeacherStudentCreation ? (
          <button style={s.addBtn} onClick={() => navigate(`/teacher/students/add${classFilter ? `?classId=${classFilter}` : ""}`)}>
            <i className="fa-solid fa-plus-circle"></i> Register Student
          </button>
        ) : (
          <div style={s.disabledNotice}>
            <i className="fa-solid fa-lock"></i> Student registration disabled by admin
          </div>
        )}
      </div>

      <div style={s.filterRow}>
        <div style={s.searchWrap}>
          <i className="fa-solid fa-search"></i>
          <input style={s.searchInput} placeholder="Search by name, SATS no. or mobile..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={s.select} value={classFilter} onChange={e => handleClassFilterChange(e.target.value)}>
          <option value="">All My Classes</option>
          {myClasses.map(c => <option key={c._id} value={c._id}>{c.name}{c.section}</option>)}
        </select>
      </div>

      <Table
        loading={loading}
        pagination={pagination}
        onPageChange={setPage}
        headers={["Name", "SATS No.", "Class", "Parent Name", "Mobile", "Actions"]}
        data={students}
        renderRow={(stRow) => (
          <>
            <td style={st.td}>
              <div style={st.profileFlex}>
                <div style={st.avatar}>
                  {stRow.photoUrl ? (
                    <img src={stRow.photoUrl} alt={stRow.name || "Student"} style={st.avatarImg} />
                  ) : (
                    stRow.name?.[0] || "S"
                  )}
                </div>
                <div>
                  <strong>{stRow.name}</strong>
                  {stRow.photoUrl && <div style={st.subText}>Photo on file</div>}
                </div>
              </div>
            </td>
            <td style={st.td}>{stRow.satCode}</td>
            <td style={st.td}>{stRow.class?.name}{stRow.class?.section}</td>
            <td style={st.td}>{stRow.fatherName}</td>
            <td style={st.td}>
              <div>{stRow.mobile}</div>
              {stRow.alternateMobile && <div style={st.subText}>{stRow.alternateMobile}</div>}
            </td>
            <td style={st.td}>
              <button style={st.actionBtn} onClick={() => handleOpenEdit(stRow)}>
                <i className="fa-solid fa-pen-to-square"></i> Edit
              </button>
            </td>
          </>
        )}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Student Profile"
        subtitle="Update academic and personal information"
        maxWidth="800px"
        footer={(
          <div style={{display: 'flex', gap: '12px', width: '100%'}}>
            <button style={st.cancelBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button style={st.saveBtn} onClick={handleSave}>
              <i className="fa-solid fa-floppy-disk"></i> Save & Update Student
            </button>
          </div>
        )}
      >
        <div style={st.formGrid}>
          <div style={st.photoPanel}>
            <div style={st.photoPreview}>
              {selectedStudent?.photoUrl ? (
                <img src={selectedStudent.photoUrl} alt={selectedStudent.name || "Student"} style={st.photoImg} />
              ) : (
                <div style={st.photoAvatar}>{selectedStudent?.name?.[0] || "S"}</div>
              )}
            </div>
            <div style={st.photoMeta}>
              <div style={st.photoTitle}>Student Photo</div>
              <div style={st.photoHint}>Upload JPG, PNG, or WebP up to 2 MB.</div>
              <div style={st.photoActions}>
                <button type="button" style={st.photoBtn} onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
                  <i className={`fa-solid ${photoUploading ? "fa-circle-notch fa-spin" : "fa-camera"}`}></i>
                  {selectedStudent?.photoUrl ? "Change Photo" : "Add Photo"}
                </button>
                {selectedStudent?.photoUrl && (
                  <button type="button" style={st.removePhotoBtn} onClick={handleRemovePhoto} disabled={photoUploading}>
                    <i className="fa-solid fa-xmark"></i> Remove Photo
                  </button>
                )}
              </div>
              {photoMessage && <div style={st.photoSuccess}>{photoMessage}</div>}
              {photoError && <div style={st.photoError}>{photoError}</div>}
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={st.fileInput} />
            </div>
          </div>

          <div style={st.sectionTitle}>1. Personal Information</div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Student Name *</label>
              <input style={st.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Date of Birth (Optional)</label>
              <input style={st.input} value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} />
            </div>
          </div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Email Address</label>
              <input style={st.input} value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Mobile Number *</label>
              <input style={st.input} value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Second Mobile Number (Optional)</label>
              <input style={st.input} value={form.alternateMobile} onChange={e => setForm({...form, alternateMobile: e.target.value})} />
            </div>
          </div>

          <div style={st.sectionTitle}>2. Academic Details</div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Class</label>
              <select style={st.input} value={form.class} onChange={e => setForm({...form, class: e.target.value})}>
                <option value="">Select Class</option>
                {myClasses.map(c => <option key={c._id} value={c._id}>{c.name}{c.section}</option>)}
              </select>
            </div>
          </div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>SATS No. *</label>
              <input style={st.input} value={form.satCode} onChange={e => setForm({...form, satCode: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>PEN Code (Optional)</label>
              <input style={st.input} value={form.penCode} onChange={e => setForm({...form, penCode: e.target.value})} />
            </div>
          </div>

          <div style={st.sectionTitle}>3. Guardian & Address</div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Father's Name *</label>
              <input style={st.input} value={form.fatherName} onChange={e => setForm({...form, fatherName: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Mother's Name *</label>
              <input style={st.input} value={form.motherName} onChange={e => setForm({...form, motherName: e.target.value})} />
            </div>
          </div>
          <div style={st.formItem}>
            <label style={st.label}>Residential Address (Optional)</label>
            <textarea style={{...st.input, minHeight: '80px'}} value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

const s = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" },
  addBtn: { background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", padding: "10px 24px", borderRadius: "30px", border: "none", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 12px rgba(200,150,12,0.3)", display: "flex", alignItems: "center", gap: "8px" },
  disabledNotice: { background: "var(--danger-bg)", color: "var(--danger-text)", padding: "10px 18px", borderRadius: "30px", border: "1px solid var(--danger-text)", fontWeight: "800", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "8px" },
  filterRow: { display: "flex", gap: "16px", marginBottom: "24px" },
  searchWrap: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  searchInput: { width: "100%", padding: "12px 14px 12px 40px", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "0.9rem" },
  select: { padding: "0 16px", borderRadius: "10px", border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }
};

const st = {
  td: { padding: "1rem", fontSize: "0.9rem", color: "var(--text)" },
  profileFlex: { display: "flex", alignItems: "center", gap: "0.75rem" },
  avatar: { width: "34px", height: "34px", borderRadius: "50%", background: "var(--gold-pale)", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.8rem", overflow: "hidden", flex: "0 0 auto" },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  subText: { fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "3px" },
  actionBtn: { background: "var(--light-bg)", border: "1px solid var(--border)", padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", color: "var(--navy)", fontWeight: "700", display: 'flex', alignItems: 'center', gap: '6px' },
  cancelBtn: { padding: "12px 20px", background: "var(--light-bg)", border: "none", color: "var(--text-muted)", fontWeight: "700", cursor: "pointer", borderRadius: "10px" },
  saveBtn: { flex: 1, padding: "12px 24px", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", borderRadius: "10px", border: "none", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 15px rgba(200,150,12,0.2)", animation: 'shimmer 3s linear infinite', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' },
  formGrid: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  photoPanel: { display: "flex", alignItems: "center", gap: "18px", background: "var(--light-bg)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" },
  photoPreview: { width: "92px", height: "92px", borderRadius: "50%", background: "var(--white)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", border: "3px solid var(--gold)", overflow: "hidden" },
  photoImg: { width: "100%", height: "100%", objectFit: "cover" },
  photoAvatar: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", fontSize: "2rem", fontWeight: "900" },
  photoMeta: { flex: 1, minWidth: 0 },
  photoTitle: { color: "var(--navy)", fontWeight: "900", fontSize: "1rem", marginBottom: "4px" },
  photoHint: { color: "var(--text-muted)", fontWeight: "700", fontSize: "0.78rem", marginBottom: "12px" },
  photoActions: { display: "flex", flexWrap: "wrap", gap: "10px" },
  photoBtn: { padding: "9px 14px", borderRadius: "9px", border: "none", background: "var(--navy)", color: "var(--white)", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px" },
  removePhotoBtn: { padding: "9px 14px", borderRadius: "9px", border: "1px solid var(--danger-text)", background: "var(--danger-bg)", color: "var(--danger-text)", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px" },
  fileInput: { display: "none" },
  photoSuccess: { display: "inline-block", marginTop: "10px", background: "var(--success-bg)", color: "var(--success-text)", padding: "6px 10px", borderRadius: "8px", fontSize: "0.76rem", fontWeight: "800" },
  photoError: { display: "inline-block", marginTop: "10px", background: "var(--danger-bg)", color: "var(--danger-text)", padding: "6px 10px", borderRadius: "8px", fontSize: "0.76rem", fontWeight: "800" },
  sectionTitle: { fontSize: "0.8rem", fontWeight: "800", color: "var(--navy)", borderBottom: "1px solid var(--border)", paddingBottom: "4px", marginTop: "8px", textTransform: "uppercase" },
  formItem: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  label: { fontSize: "0.7rem", color: "var(--gold)", fontWeight: "800", textTransform: "uppercase" },
  input: { padding: "0.75rem", borderRadius: "8px", border: "1.5px solid var(--border)", fontSize: "0.95rem", width: '100%', boxSizing: 'border-box', background: 'var(--white)', fontFamily: 'var(--font-body)' }
};
