// Version 3 normalizes safe Quill DOM code blocks before published highlighting.
// Version 4 normalizes decoded non-breaking spaces (U+00A0) so published prose wraps.
// Rebuild stored snapshots with rerender --site <site> --only-stale after rollout.
export const PIPELINE_VERSION = 4;
