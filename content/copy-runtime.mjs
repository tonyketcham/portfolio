// The content resolver ships with the experience; the editing tools do not.
import savedCopy from './copy.json';

export function copy(key, fallback) {
  return Object.hasOwn(savedCopy, key) ? savedCopy[key].value : fallback;
}
