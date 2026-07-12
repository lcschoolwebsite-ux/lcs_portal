// Storage-agnostic file adapter.
// Cloudinary is the current backend, but Google Drive or another provider can replace
// the internals of these functions later without changing callers.

const https = require("https");
const { PassThrough } = require("stream");
const { cloudinary, configureCloudinary } = require("./cloudinary");

const HOMEWORK_FOLDER = "homework-files";

const ensureCloudinary = () => {
  if (!configureCloudinary()) {
    throw new Error("File storage is not configured on the server");
  }
};

const uploadFile = async (buffer, fileName, mimeType) => {
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

const getFileStream = (storageId) => {
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

const deleteFile = async (storageId) => {
  ensureCloudinary();
  await cloudinary.uploader.destroy(storageId, { resource_type: "raw" });
};

module.exports = {
  uploadFile,
  getFileStream,
  deleteFile
};
