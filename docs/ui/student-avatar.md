# Student Avatar

Use `StudentAvatar` from `apps/whiteboard/components/students/student-avatar.tsx` wherever a Student photo or initials appear. Pass the persisted `student.id`, `student.name`, and `student.photoUrl`. Set `className` for the desired size.

The fallback color comes from `studentAvatarColor` in `apps/whiteboard/lib/student-avatar-style.ts`. It hashes the Student ID into one of seven fixed light and dark color pairs. This keeps the same Student’s color across list, profile, and edit views, including after a name change. Before a Student is saved, the form preview uses the normalized name as a temporary key; an empty name shows the neutral placeholder. After saving, the ID determines the color. A valid photo covers the fallback, but the same initials and color remain available if the photo cannot load.

Keep color selection and initials in the shared component and helper when adding another Student avatar surface. Do not derive colors from the displayed name for a persisted Student.
