import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import SectionTitle from "../../components/SectionTitle";
import { getTeacherAssignedClasses, getTeacherSubjectForClass } from "../../utils/teacherClasses";

const formatClassLabel = cls => [cls?.name, cls?.section].filter(Boolean).join(" ") || "Class";

const formatDate = value => {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

export default function Homework() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [form, setForm] = useState({
    classId: "",
    subjectId: "",
    title: "",
    description: "",
    file: null
  });

  const accessibleClasses = useMemo(
    () => getTeacherAssignedClasses(user, classes),
    [user, classes]
  );

  const subjectsForClass = subjects.filter(subject => String(subject.class?._id || subject.class || "") === String(form.classId));

  const fetchData = async () => {
    setLoading(true);
    try {
      const [classRes, subjectRes] = await Promise.all([
        api.get("/classes"),
        api.get("/subjects")
      ]);
      const myClasses = getTeacherAssignedClasses(user, classRes.data || []);
      setClasses(myClasses);
      setSubjects(subjectRes.data || []);

      const defaultClassId = selectedClassId || myClasses[0]?._id || "";
      setSelectedClassId(defaultClassId);
      setForm(prev => {
        const nextClassId = prev.classId || defaultClassId;
        const teacherSubject = getTeacherSubjectForClass(user, nextClassId, subjectRes.data || [], myClasses);
        const nextSubjectId = prev.subjectId || teacherSubject?._id || (subjectRes.data || []).find(subject => String(subject.class?._id || subject.class || "") === String(nextClassId))?._id || "";
        return {
          ...prev,
          classId: nextClassId,
          subjectId: nextSubjectId
        };
      });
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load homework setup data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchHomework = async () => {
    if (!accessibleClasses.length) {
      setHomework([]);
      return;
    }

    try {
      const responses = await Promise.all(
        accessibleClasses.map(async cls => {
          const { data } = await api.get(`/homework/class/${cls._id}`);
          return (Array.isArray(data) ? data : []).map(item => ({
            ...item,
            classId: item.classId?._id || item.classId || cls._id,
            classLabel: formatClassLabel(item.classId || cls)
          }));
        })
      );

      const merged = responses.flat().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setHomework(merged);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load homework records.");
      setHomework([]);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (classes.length && !form.classId) {
      const nextClassId = selectedClassId || classes[0]?._id || "";
      if (nextClassId) {
        const teacherSubject = getTeacherSubjectForClass(user, nextClassId, subjects, classes);
        setForm(prev => ({
          ...prev,
          classId: nextClassId,
          subjectId: teacherSubject?._id || prev.subjectId || ""
        }));
      }
    }
  }, [classes, form.classId, selectedClassId, subjects, user]);

  useEffect(() => {
    fetchHomework();
  }, [accessibleClasses, user]);

  const handleClassChange = value => {
    const teacherSubject = getTeacherSubjectForClass(user, value, subjects, classes);
    setSelectedClassId(value);
    setForm(prev => ({
      ...prev,
      classId: value,
      subjectId: teacherSubject?._id || "",
      file: prev.file
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.classId || !form.subjectId || !form.title.trim() || !form.file) {
      setUploadError("Please choose a class, subject, title, and PDF file.");
      return;
    }

    setSaving(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("classId", form.classId);
      formData.append("subjectId", form.subjectId);
      formData.append("title", form.title.trim());
      formData.append("description", form.description.trim());
      formData.append("file", form.file);

      await api.post("/homework", formData);
      alert("Homework uploaded successfully.");
      setForm(prev => ({
        ...prev,
        title: "",
        description: "",
        file: null
      }));
      await fetchHomework();
    } catch (error) {
      setUploadError(error.response?.data?.message || "Failed to upload homework.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async homeworkId => {
    const confirmDelete = window.confirm("Delete this homework post? This will remove the file too.");
    if (!confirmDelete) return;

    try {
      await api.delete(`/homework/${homeworkId}`);
      await fetchHomework();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete homework.");
    }
  };

  if (loading) {
    return <div style={s.loading}>Loading homework tools...</div>;
  }

  return (
    <div>
      <SectionTitle title="Homework Upload" subtitle="Post class homework PDFs for your students." />

      <div style={s.pageIntro}>
        Upload a PDF for one of your assigned classes. Subjects are filtered to the selected class, and homework posts appear below for quick review or deletion.
      </div>

      {uploadError && <div style={s.errorBox}>{uploadError}</div>}

      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.row}>
          <div style={s.field}>
            <label style={s.label}>Class</label>
            <select
              style={s.input}
              value={form.classId}
              onChange={e => handleClassChange(e.target.value)}
            >
              <option value="">Select Class</option>
              {accessibleClasses.map(cls => (
                <option key={cls._id} value={cls._id}>
                  {formatClassLabel(cls)}
                </option>
              ))}
            </select>
          </div>

          <div style={s.field}>
            <label style={s.label}>Subject</label>
            <select
              style={s.input}
              value={form.subjectId}
              onChange={e => setForm(prev => ({ ...prev, subjectId: e.target.value }))}
              disabled={!form.classId}
            >
              <option value="">Select Subject</option>
              {subjectsForClass.map(subject => (
                <option key={subject._id} value={subject._id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>Title</label>
          <input
            style={s.input}
            type="text"
            placeholder="e.g. Algebra worksheet"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>

        <div style={s.field}>
          <label style={s.label}>Description</label>
          <textarea
            style={{ ...s.input, minHeight: "110px", resize: "vertical" }}
            placeholder="Optional instructions or notes"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          />
        </div>

        <div style={s.field}>
          <label style={s.label}>PDF File</label>
          <input
            style={s.fileInput}
            type="file"
            accept="application/pdf"
            onChange={e => setForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
          />
          <div style={s.helperText}>
            PDF only, up to 15 MB.
            {form.file ? ` Selected: ${form.file.name}` : " No file selected."}
          </div>
        </div>

        <button type="submit" style={s.submitBtn} disabled={saving}>
          {saving ? "Uploading..." : "Upload Homework"}
        </button>
      </form>

      <div style={s.listHeader}>
        <h3 style={s.sectionTitle}>Posted Homework</h3>
        <div style={s.countPill}>{homework.length} item{homework.length === 1 ? "" : "s"}</div>
      </div>

      <div style={s.list}>
        {homework.length === 0 ? (
          <div style={s.empty}>No homework has been posted yet.</div>
        ) : (
          homework.map(item => (
            <article key={item._id} style={s.item}>
              <div style={s.itemTop}>
                <div>
                  <div style={s.itemTitle}>{item.title}</div>
                  <div style={s.itemMeta}>
                    {item.subjectId?.name || "Subject"} • {item.classId?.name || item.classLabel || "Class"} • {formatDate(item.createdAt)}
                  </div>
                </div>
                <div style={s.itemActions}>
                  <button type="button" style={s.deleteBtn} onClick={() => handleDelete(item._id)}>
                    Delete
                  </button>
                </div>
              </div>

              {item.description && <div style={s.itemDescription}>{item.description}</div>}
              <div style={s.itemFooter}>
                <span>Uploaded by {item.uploadedBy?.name || "Teacher"}</span>
                <span>{item.fileName || "homework.pdf"}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

const s = {
  loading: { padding: "48px", textAlign: "center", color: "var(--navy)", fontWeight: 800 },
  pageIntro: { marginBottom: "18px", color: "var(--text-muted)", fontWeight: 600, maxWidth: "900px" },
  errorBox: { marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-text)", fontWeight: 700 },
  card: { background: "white", borderRadius: "22px", padding: "22px", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", marginBottom: "26px" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" },
  label: { fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 900, letterSpacing: "0.08em", color: "var(--gold)" },
  input: { width: "100%", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "12px 14px", background: "var(--white)", color: "var(--navy)", fontWeight: 600, boxSizing: "border-box" },
  fileInput: { width: "100%", border: "1.5px dashed var(--border)", borderRadius: "14px", padding: "12px 14px", background: "var(--light-bg)", color: "var(--navy)", fontWeight: 600, boxSizing: "border-box" },
  helperText: { fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, lineHeight: 1.5 },
  submitBtn: { padding: "14px 18px", borderRadius: "16px", border: "none", background: "var(--navy)", color: "var(--gold-light)", fontWeight: 900, cursor: "pointer", alignSelf: "flex-start" },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px" },
  sectionTitle: { margin: 0, fontSize: "1.1rem", fontWeight: 900, color: "var(--navy)" },
  countPill: { padding: "8px 12px", borderRadius: "999px", background: "var(--light-bg)", color: "var(--navy)", fontWeight: 800, fontSize: "0.82rem" },
  list: { display: "grid", gap: "14px" },
  empty: { padding: "28px", borderRadius: "18px", border: "1px dashed var(--border)", background: "white", color: "var(--text-muted)", textAlign: "center", fontWeight: 700 },
  item: { background: "white", borderRadius: "20px", border: "1px solid var(--border)", padding: "18px 20px", boxShadow: "var(--shadow-sm)" },
  itemTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" },
  itemTitle: { fontSize: "1.02rem", fontWeight: 900, color: "var(--navy)", marginBottom: "6px" },
  itemMeta: { fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 700 },
  itemActions: { display: "flex", gap: "10px", flexWrap: "wrap" },
  deleteBtn: { padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--danger-text)", background: "white", color: "var(--danger-text)", fontWeight: 900, cursor: "pointer" },
  itemDescription: { marginTop: "12px", color: "var(--navy)", fontWeight: 600, lineHeight: 1.6, whiteSpace: "pre-wrap" },
  itemFooter: { marginTop: "14px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700 }
};
