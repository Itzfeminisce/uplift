import { createNextHandler } from "uplift/next";
import { uploads } from "../../../src/uploads";

export const { GET, POST } = createNextHandler(uploads);
