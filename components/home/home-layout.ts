/**
 * The FAB floats above the scroll view, so anything that scrolls under it has
 * to stop short of its footprint. Its geometry is written here once and nowhere
 * else: the button reads these, and so do the list's bottom padding and the
 * save toast that has to clear it. Change FAB_SIZE and all three follow.
 */
export const FAB_SIZE = 64;
export const FAB_BOTTOM_OFFSET = 40;
export const FAB_RIGHT_OFFSET = 24;

/** Just above the FAB, so the toast never lands on top of it. */
export const SAVE_TOAST_BOTTOM_OFFSET = FAB_BOTTOM_OFFSET + FAB_SIZE + 8;
