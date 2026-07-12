// Storage-agnostic file adapter.
// Cloudinary remains the default provider, but Google Drive can be enabled with
// STORAGE_PROVIDER=drive. The Drive path uses OAuth2 + refresh token because our
// Google Cloud org blocks service account key creation.

const https = require("https");
const { PassThrough, Readable } = require("stream");
const { google } = require("googleapis");
const { cloudinary, configureCloudinary } = require("./cloudinary");

const STORAGE_PROVIDERS = {
  CLOUDINARY: "cloudinary",
  DRIVE: "drive"
};

const DEFAULT_PROVIDER = STORAGE_PROVIDERS.CLOUDINARY;
const HOMEWORK_FOLDER = "homework-files";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

const getStorageProvider = () => {
  const provider = String(process.env.STORAGE_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  return Object.values(STORAGE_PROVIDERS).includes(provider) ? provider : DEFAULT_PROVIDER;
};

const getDriveConfig = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_HOMEWORK_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error(
      "Google Drive storage is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, " +
        "GOOGLE_OAUTH_REFRESH_TOKEN, and GOOGLE_HOMEWORK_FOLDER_ID."
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    folderId
  };
};

const getDriveClient = () => {
  const { clientId, clientSecret, refreshToken } = getDriveConfig();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({
    version: "v3",
    auth: oauth2Client
  });
};

const ensureCloudinary = () => {
  if (!configureCloudinary()) {
    throw new Error("File storage is not configured on the server");
  }
};

const uploadToCloudinary = async (buffer, fileName, mimeType) => {
  ensureCloudinary();

  const options = {
    resource_type: "raw",
    folder: HOMEWORK_FOLDER,
    use_filename: true,
    unique_filename: true,
    filename_override: fileName,
    content_type: mimeType || "application/octet-stream",
    overwrite: false
  };

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve({
        storageId: result.public_id,
        url: result.secure_url || result.url || null
      });
    });

    stream.end(buffer);
  });
};

const uploadToDrive = async (buffer, fileName, mimeType) => {
  const drive = getDriveClient();
  const { folderId } = getDriveConfig();
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: mimeType || "application/octet-stream",
      parents: [folderId]
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: Readable.from(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer))
    },
    fields: "id"
  });

  return {
    storageId: created.data.id,
    url: null
  };
};

const uploadFile = async (buffer, fileName, mimeType) => {
  if (getStorageProvider() === STORAGE_PROVIDERS.DRIVE) {
    return uploadToDrive(buffer, fileName, mimeType);
  }

  return uploadToCloudinary(buffer, fileName, mimeType);
};

const getFileStreamFromCloudinary = (storageId) => {
  ensureCloudinary();

  const output = new PassThrough();

  process.nextTick(async () => {
    try {
      const resource = await cloudinary.api.resource(storageId, { resource_type: "raw" });
      const fileUrl = resource?.secure_url || resource?.url;

      if (!fileUrl) {
        output.destroy(new Error("Stored file URL not available"));
        return;
      }

      https.get(fileUrl, response => {
        if (response.statusCode && response.statusCode >= 400) {
          output.destroy(new Error(`Failed to load file stream (${response.statusCode})`));
          response.resume();
          return;
        }

        response.pipe(output);
      }).on("error", error => output.destroy(error));
    } catch (error) {
      output.destroy(error);
    }
  });

  return output;
};

const getFileStreamFromDrive = (storageId) => {
  const drive = getDriveClient();
  const output = new PassThrough();

  process.nextTick(async () => {
    try {
      const response = await drive.files.get(
        {
          fileId: storageId,
          alt: "media"
        },
        { responseType: "stream" }
      );

      response.data.on("error", error => output.destroy(error));
      response.data.pipe(output);
    } catch (error) {
      output.destroy(error);
    }
  });

  return output;
};

const getFileStream = (storageId) => {
  if (getStorageProvider() === STORAGE_PROVIDERS.DRIVE) {
    return getFileStreamFromDrive(storageId);
  }

  return getFileStreamFromCloudinary(storageId);
};

const deleteFromCloudinary = async (storageId) => {
  ensureCloudinary();
  await cloudinary.uploader.destroy(storageId, { resource_type: "raw" });
};

const deleteFromDrive = async (storageId) => {
  const drive = getDriveClient();
  await drive.files.delete({
    fileId: storageId
  });
};

const deleteFile = async (storageId) => {
  if (getStorageProvider() === STORAGE_PROVIDERS.DRIVE) {
    return deleteFromDrive(storageId);
  }

  return deleteFromCloudinary(storageId);
};

module.exports = {
  uploadFile,
  getFileStream,
  deleteFile
};
