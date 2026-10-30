import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getMoodColors, ThemeMoods } from '@/constants/theme';

function featureSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return featureSourceFiles(path);
    return /\.[tj]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe('split theme compliance', () => {
  it('provides semantic money tones for every mood and mode', () => {
    for (const mood of Object.keys(ThemeMoods) as (keyof typeof ThemeMoods)[]) {
      const colors = getMoodColors(mood);
      for (const mode of ['light', 'dark'] as const) {
        expect(colors[mode]).toEqual(
          expect.objectContaining({
            positive: expect.stringMatching(/^#[0-9A-F]{6}$/i),
            negative: expect.stringMatching(/^#[0-9A-F]{6}$/i),
            neutral: expect.stringMatching(/^#[0-9A-F]{6}$/i),
          })
        );
      }
    }
  });

  it('keeps literal colors out of the split feature', () => {
    const files = [
      ...featureSourceFiles(join(process.cwd(), 'components', 'split')),
      join(process.cwd(), 'app', '(tabs)', 'split.tsx'),
    ];
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const matches = source.match(/#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)/g) ?? [];
      return matches.map((color) => `${file.replace(`${process.cwd()}/`, '')}: ${color}`);
    });

    expect(violations).toEqual([]);
  });

  /**
   * The hex sweep above misses the other half of the problem. A caption written
   * as `text-black/55 dark:text-white/55` carries no hex and no `rgba(`, so it
   * reads as compliant while being exactly as mood-blind as the literals were:
   * Mint's ink is `#182C24`, and a pure-black caption under a Mint title is the
   * drift the semantic tokens exist to remove. `colors.muted` /
   * `colors.mutedStrong` are the replacements.
   */
  it('keeps literal Tailwind color classes out of the split feature', () => {
    const files = [
      ...featureSourceFiles(join(process.cwd(), 'components', 'split')),
      join(process.cwd(), 'app', '(tabs)', 'split.tsx'),
    ];
    const literal =
      /\b(?:dark:)?(?:text|bg|border)-(?:black|white|gray|slate|zinc|neutral|red|green|emerald)(?:\/\d+)?\b/g;
    const violations = files.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(literal) ?? [];
      return matches.map((cls) => `${file.replace(`${process.cwd()}/`, '')}: ${cls}`);
    });

    expect(violations).toEqual([]);
  });

  /**
   * And the third syntax for the same mistake. `` `${theme.text}B8` `` is
   * mood-aware, so it survives both sweeps above, but the alpha is still being
   * invented at the call site — the feature had eight of them (`8C`, `99`,
   * `B3`, `B8`, `BF`, `CC`, `E6`, `40`) for what is really two ranks of text.
   */
  it('keeps ad-hoc text alphas out of the split feature', () => {
    const files = [
      ...featureSourceFiles(join(process.cwd(), 'components', 'split')),
      join(process.cwd(), 'app', '(tabs)', 'split.tsx'),
    ];
    const adHoc = /\$\{(?:theme|colors)\.text\}[0-9A-Fa-f]{2}/g;
    const violations = files.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(adHoc) ?? [];
      return matches.map((hit) => `${file.replace(`${process.cwd()}/`, '')}: ${hit}`);
    });

    expect(violations).toEqual([]);
  });

  it('uses shared motion and navigation chrome throughout split', () => {
    const splitDirectory = join(process.cwd(), 'components', 'split');
    const files = featureSourceFiles(splitDirectory);
    const combinedSource = files.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(combinedSource).not.toContain('animationType="slide"');
    expect(combinedSource).not.toContain('ExpenseTopBar');
    expect(combinedSource).not.toContain('SplitTopBar');

    for (const modal of [
      'FriendDetailModal.tsx',
      'GroupActionModal.tsx',
      'BillDetailModal.tsx',
      'GroupDefaultSplitModal.tsx',
      'CreateGroupModal.tsx',
    ]) {
      const source = readFileSync(join(splitDirectory, 'modals', modal), 'utf8');
      expect(source).toContain('<AnimatedBottomSheet');
    }

    for (const modal of [
      join('expense', 'AddExpenseModal.tsx'),
      join('modals', 'GroupDetailModal.tsx'),
      join('modals', 'PeoplePickerModal.tsx'),
      join('modals', 'GroupSettingsModal.tsx'),
    ]) {
      const source = readFileSync(join(splitDirectory, modal), 'utf8');
      expect(source).toContain('<AppHeader');
    }
  });

  /**
   * Dropping `animationType="slide"` is only half the move. The three
   * full-screen screens went out with nothing in its place for a while, which
   * meant a group detail *appeared* rather than pushed — so this pins the
   * replacement, not just the absence.
   */
  it('gives every full-screen split modal a motion-driven push', () => {
    const splitDirectory = join(process.cwd(), 'components', 'split');

    for (const modal of [
      'GroupDetailModal.tsx',
      'PeoplePickerModal.tsx',
      'GroupSettingsModal.tsx',
    ]) {
      const source = readFileSync(join(splitDirectory, 'modals', modal), 'utf8');
      expect(source).toContain('<SplitFullScreenModal');
      expect(source).not.toContain('<Modal');
    }

    const wrapper = readFileSync(
      join(splitDirectory, 'primitives', 'SplitFullScreenModal.tsx'),
      'utf8'
    );
    expect(wrapper).toContain("motion.duration('sheet')");
    expect(wrapper).toContain("motion.exitDuration('sheet')");
  });
});
