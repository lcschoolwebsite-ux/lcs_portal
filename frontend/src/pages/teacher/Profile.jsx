import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/useAuth";

const formatList = (items, fallback = "N/A") => {
  if (!items || items.length === 0) return fallback;
  return items.join(", ");
};

const formatClass = cls => [cls?.name, cls?.section].filter(Boolean).join(" ") || "N/A";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(user);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const teacherId = String(profile?.id || profile?._id || user?.id || user?._id || "");

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const fetchProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/auth/me");
      setProfile(data);
      updateUser(data);
    } catch (e) {
      setError(e.response?.data?.message || "Failed to load profile");
      setProfile(user);
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentUser = async (fallbackUser) => {
    try {
      const { data } = await api.get("/auth/me");
      setProfile(data);
      updateUser(data);
      return data;
    } catch (_) {
      if (fallbackUser) {
        setProfile(fallbackUser);
        updateUser(fallbackUser);
      }
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
    if (!selectedFile || !teacherId) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("photo", selectedFile);

      const { data } = await api.post(`/teachers/${teacherId}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const nextUser = data?.teacher || data;
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
    if (!teacherId || !profile?.photoUrl) return;

    setRemoving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.delete(`/teachers/${teacherId}/photo`);
      const nextUser = data?.teacher || data;
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

  useEffect(() => {
    fetchProfile();
    // We intentionally load the latest teacher profile from the API so the page
    // reflects the current backend state even after assignments change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assignedClasses = useMemo(
    () => (profile?.assignedClasses || []).map(formatClass),
    [profile?.assignedClasses]
  );

  const assignedSubjects = useMemo(
    () => (profile?.assignedSubjects || []).map(subject => subject?.name).filter(Boolean),
    [profile?.assignedSubjects]
  );

  return (
    <div style={s.container}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>My Profile</h1>
          <p style={s.subtitle}>View your account, contact details, and assigned classes.</p>
        </div>
        <button style={s.refreshBtn} onClick={fetchProfile} disabled={loading}>
          <i className={`fa-solid ${loading ? "fa-circle-notch fa-spin" : "fa-rotate-right"}`} style={{ marginRight: "8px" }}></i>
          Refresh
        </button>
      </div>

      {message && <div style={s.successBox}>{message}</div>}
      {error && <div style={s.errorBox}>{error}</div>}

      {loading ? (
        <div style={s.loading}><i className="fa-solid fa-circle-notch fa-spin"></i> Loading profile...</div>
      ) : (
        <div style={s.card}>
          <div style={s.profileHeader}>
            <div style={s.photoWrap}>
              {previewUrl || profile?.photoUrl ? (
                <img src={previewUrl || profile.photoUrl} alt={profile?.name || "Teacher"} style={s.photo} />
              ) : (
                <div style={s.avatar}>{profile?.name?.[0] || "T"}</div>
              )}
            </div>
            <div style={s.headerCopy}>
              <h2 style={s.name}>{profile?.name || "Teacher"}</h2>
              <p style={s.role}>Staff / Educator</p>
              <p style={s.meta}>Username: <strong>{profile?.username || "N/A"}</strong></p>
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
                  disabled={!profile?.photoUrl || removing}
                >
                  <i className="fa-solid fa-trash-can"></i>
                  {removing ? "Removing..." : "Delete Photo"}
                </button>
              </div>
              <div style={s.helper}>
                JPG, PNG, or WebP up to 2 MB. Photos are saved in Cloudinary under the teachers folder.
              </div>
              {selectedFile && <div style={s.fileName}>Selected: {selectedFile.name}</div>}
            </div>
          </div>

          <div style={s.grid}>
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Contact Information</h3>
              <DetailItem label="Email Address" value={profile?.email} />
              <DetailItem label="Phone Number" value={profile?.phone} />
            </div>

            <div style={s.section}>
              <h3 style={s.sectionTitle}>Work Details</h3>
              <DetailItem label="Assigned Classes" value={formatList(assignedClasses)} />
              <DetailItem label="Assigned Subjects" value={formatList(assignedSubjects)} />
            </div>
          </div>
        </div>
      )}
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

const s = {
  container: { width: "100%" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "1.5rem", flexWrap: "wrap" },
  title: { fontSize: "1.75rem", fontWeight: "800", color: "var(--navy)", margin: 0 },
  subtitle: { marginTop: "0.35rem", color: "var(--text-muted)", fontSize: "0.9rem" },
  refreshBtn: { background: "var(--white)", color: "var(--navy)", border: "2px solid var(--navy)", padding: "10px 20px", borderRadius: "30px", fontWeight: "700", cursor: "pointer", transition: "var(--transition)" },
  successBox: { marginBottom: "1rem", background: "rgba(16,185,129,0.1)", color: "#065f46", border: "1px solid rgba(16,185,129,0.18)", padding: "12px 14px", borderRadius: "12px", fontWeight: "700" },
  errorBox: { background: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-text)", padding: "12px 16px", borderRadius: "10px", fontWeight: "800", marginBottom: "1rem" },
  loading: { padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "1.05rem", background: "var(--white)", borderRadius: "16px", border: "1px solid var(--border)" },
  card: { background: "#fff", padding: "2.25rem", borderRadius: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" },
  profileHeader: { display: "flex", alignItems: "flex-start", gap: "1.25rem", marginBottom: "2rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "1.5rem" },
  headerCopy: { flex: 1, minWidth: 0 },
  photoWrap: { position: "relative", width: "92px", height: "92px", flex: "0 0 auto" },
  avatar: { width: "84px", height: "84px", borderRadius: "50%", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", fontWeight: "900", border: "4px solid rgba(14,107,107,0.08)" },
  photo: { width: "84px", height: "84px", borderRadius: "50%", objectFit: "cover", border: "4px solid rgba(200,150,12,0.45)" },
  name: { fontSize: "1.5rem", fontWeight: "800", color: "#1e293b", margin: 0 },
  role: { fontSize: "0.85rem", color: "var(--gold)", fontWeight: "700", marginTop: "0.25rem", letterSpacing: "0.05em", textTransform: "uppercase" },
  meta: { fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.4rem" },
  photoActions: { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginTop: "0.85rem", marginBottom: "0.5rem" },
  hiddenInput: { display: "none" },
  primaryBtn: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "#fff", border: "none", borderRadius: "999px", padding: "10px 16px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  secondaryBtn: { background: "rgba(14,107,107,0.08)", color: "var(--navy-dark)", border: "1px solid rgba(14,107,107,0.14)", borderRadius: "999px", padding: "10px 16px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  ghostBtn: { background: "transparent", color: "#991b1b", border: "1px solid rgba(153,27,27,0.2)", borderRadius: "999px", padding: "10px 16px", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  helper: { fontSize: "0.82rem", color: "#64748b", fontWeight: "600", lineHeight: 1.45 },
  fileName: { marginTop: "8px", fontSize: "0.84rem", color: "#0f766e", fontWeight: "700" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" },
  section: { marginBottom: "1rem" },
  sectionTitle: { fontSize: "0.75rem", fontWeight: "800", color: "var(--navy)", marginBottom: "1.25rem", borderBottom: "2px solid var(--gold-pale)", paddingBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" },
  item: { marginBottom: "1.1rem", display: "flex", flexDirection: "column" },
  label: { fontSize: "0.7rem", color: "#64748b", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" },
  value: { fontSize: "1rem", color: "#1e293b", fontWeight: "600", lineHeight: 1.5 }
};
