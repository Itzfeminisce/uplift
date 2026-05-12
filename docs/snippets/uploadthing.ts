import { image, uplift } from "@uplift-io/uplift";
import { uploadthing } from "@uplift-io/uploadthing";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

export const uploads = uplift({
  storage: uploadthing({
    uploader: async (file) => utapi.uploadFiles(file)
  }),
  routes: {
    avatar: image().max("2mb")
  }
});
