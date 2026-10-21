import type { LoadExtensionsResult } from "@earendil-works/pi-coding-agent";
import { sep } from "node:path";

/**
 * Web sessions never load the global profile extension (enc-7c2d78ac §4).
 *
 * pi-profile applies the saved `~/.pi/profiles/.active` profile at every
 * session_start: a routine that ran with `PI_PROFILE=health-eval` left it
 * active, and the next work session opened in the browser was renamed
 * ("Salud"), switched to the profile's model and got a `profile_switch` entry
 * appended to its file — foreign writes into a work session's history.
 *
 * The web composer manages model and tools per session; a terminal-global
 * profile has no business hijacking browser sessions. Interactive `pi` runs
 * keep the extension untouched.
 */
export function excludeProfileExtension(base: LoadExtensionsResult): LoadExtensionsResult {
  const isProfileExtension = (path: string) => path.includes(`${sep}pi-profile${sep}`) || path.endsWith("/pi-profile");
  const extensions = base.extensions.filter(
    (extension) => !isProfileExtension(extension.path) && !isProfileExtension(extension.resolvedPath),
  );
  if (extensions.length === base.extensions.length) return base;
  return {
    ...base,
    extensions,
    errors: base.errors.filter((error) => !isProfileExtension(error.path)),
  };
}
