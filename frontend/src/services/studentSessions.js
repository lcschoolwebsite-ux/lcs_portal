const PROFILES_KEY = "lcs.student.profiles";
const ACTIVE_PROFILE_KEY = "lcs.student.active-profile";

const getPreferences = async () => {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
};

const normalizeId = (value) => String(value || "").trim();

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const getProfileId = (user) => normalizeId(user?.id || user?._id || user?.satCode || user?.mobile);

const formatClassLabel = (user) => {
  const className = user?.class?.name || user?.className || "";
  const classSection = user?.class?.section || user?.section || "";
  return [className, classSection].filter(Boolean).join(" ").trim();
};

const toProfile = (user, token) => {
  const profileId = getProfileId(user);
  if (!profileId || !token) return null;

  return {
    profileId,
    token: String(token),
    savedAt: new Date().toISOString(),
    user: {
      ...user,
      id: profileId,
      classLabel: formatClassLabel(user)
    }
  };
};

export const loadStudentProfiles = async () => {
  const Preferences = await getPreferences();
  const { value } = await Preferences.get({ key: PROFILES_KEY });
  const profiles = safeParse(value, []);
  return Array.isArray(profiles) ? profiles.filter((item) => item && item.profileId && item.user) : [];
};

export const saveStudentProfile = async (user, token) => {
  const profile = toProfile(user, token);
  if (!profile) return null;

  const profiles = await loadStudentProfiles();
  const nextProfiles = [profile, ...profiles.filter((item) => item.profileId !== profile.profileId)];
  const Preferences = await getPreferences();

  await Preferences.set({
    key: PROFILES_KEY,
    value: JSON.stringify(nextProfiles)
  });
  await Preferences.set({
    key: ACTIVE_PROFILE_KEY,
    value: profile.profileId
  });

  return profile;
};

export const setActiveStudentProfile = async (profileId) => {
  if (!profileId) return;
  const Preferences = await getPreferences();
  await Preferences.set({
    key: ACTIVE_PROFILE_KEY,
    value: normalizeId(profileId)
  });
};

export const getActiveStudentProfile = async () => {
  const Preferences = await getPreferences();
  const [profiles, active] = await Promise.all([
    loadStudentProfiles(),
    Preferences.get({ key: ACTIVE_PROFILE_KEY })
  ]);

  if (!profiles.length) return null;

  const activeProfileId = normalizeId(active.value);
  return profiles.find((item) => item.profileId === activeProfileId) || profiles[0];
};

export const removeStudentProfile = async (profileId) => {
  const nextProfiles = (await loadStudentProfiles()).filter((item) => item.profileId !== normalizeId(profileId));
  const Preferences = await getPreferences();
  await Preferences.set({
    key: PROFILES_KEY,
    value: JSON.stringify(nextProfiles)
  });

  const active = await Preferences.get({ key: ACTIVE_PROFILE_KEY });
  if (normalizeId(active.value) === normalizeId(profileId)) {
    await Preferences.remove({ key: ACTIVE_PROFILE_KEY });
  }

  return nextProfiles;
};

export const clearStudentSessionMarker = async () => {
  const Preferences = await getPreferences();
  await Promise.all([
    Preferences.remove({ key: ACTIVE_PROFILE_KEY }),
    Preferences.remove({ key: "lcs.student.session" })
  ]);
};

export const studentProfileSummary = (profile) => {
  const name = String(profile?.user?.name || "Student").trim();
  const classLabel = String(profile?.user?.classLabel || formatClassLabel(profile?.user) || "LCS Portal").trim();
  return { name, classLabel };
};

export const getStudentProfilePhoto = (profile) => String(profile?.user?.photoUrl || "");
