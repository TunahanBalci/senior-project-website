import { isAbsolute, relative, resolve, sep } from "node:path";

// The build empties its output first, so only dist/ or a folder outside the project may be used.
export function safeOutput(output, root) {
  const target = resolve(output), project = resolve(root), inside = relative(project, target), outside = relative(target, project);
  const containsProject = !outside.startsWith("..") && !isAbsolute(outside);
  const withinProject = !inside.startsWith("..") && !isAbsolute(inside);
  if (containsProject || (withinProject && inside.split(sep)[0] !== "dist")) {
    throw new Error(`Refusing to clear ${target}: use dist/ or a folder outside the project.`);
  }
  return target;
}
