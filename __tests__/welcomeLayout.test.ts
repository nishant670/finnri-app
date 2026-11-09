import {
  HERO_BASE_SIZE,
  HERO_MAX_SIZE,
  welcomeHeroExamples,
  welcomeHeroSize,
} from '@/components/auth/welcome-layout';

/**
 * Welcome's three sign-in paths have to be reachable without scrolling, which
 * on a handset means the illustration cannot keep its design size. These pin
 * the arithmetic that decides how much of it survives.
 */
describe('welcome hero sizing', () => {
  it("lets the illustration take a tall phone's spare height instead of a gap", () => {
    // A tall handset: 900dp usable. The panel used to stop at 210 and leave
    // the rest empty above the buttons.
    const size = welcomeHeroSize(900);
    expect(size).toBeGreaterThan(HERO_BASE_SIZE);
    expect(size).toBeLessThanOrEqual(HERO_MAX_SIZE);
    expect(welcomeHeroExamples(size)).toBeGreaterThan(1);
  });

  it('stops growing at its cap, so a tablet keeps a sensible panel', () => {
    expect(welcomeHeroSize(2000)).toBe(HERO_MAX_SIZE);
    expect(welcomeHeroExamples(HERO_MAX_SIZE)).toBe(3);
  });

  it('shows one example on a short panel', () => {
    expect(welcomeHeroExamples(HERO_BASE_SIZE)).toBe(1);
  });

  it('shrinks the illustration rather than pushing the sign-in options off screen', () => {
    // The handset this was reported on: ~760dp usable, where a fixed 260 hero
    // left Google and the email/mobile link below the fold.
    const size = welcomeHeroSize(650);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(HERO_BASE_SIZE);
  });

  it('never asks for more height than the screen has', () => {
    for (const available of [560, 620, 700, 760, 820, 900]) {
      // Whatever is left after the illustration is the chrome's, and the two
      // together are what the screen has to hold.
      expect(welcomeHeroSize(available)).toBeLessThanOrEqual(available);
    }
  });

  it('drops the illustration entirely once it would only be a smudge', () => {
    expect(welcomeHeroSize(560)).toBe(0);
    expect(welcomeHeroSize(0)).toBe(0);
  });
});
