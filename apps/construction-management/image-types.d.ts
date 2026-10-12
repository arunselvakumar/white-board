// Static image imports (`import photo from "./photo.webp"`) need Next's
// module declarations. `next-env.d.ts` carries them too, but it is ignored
// and only written by `next typegen`, which CI runs after lint.
/// <reference types="next/image-types/global" />
