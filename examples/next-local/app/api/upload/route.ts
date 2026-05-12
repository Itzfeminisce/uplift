import { createNextHandler } from "@uplift-io/next";
import { uploads } from "../../../src/uploads";

export const { GET, POST } = createNextHandler(uploads);
