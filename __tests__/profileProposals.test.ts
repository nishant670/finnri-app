import { creditsInWords, monthlyEquivalentMinor, type BillingPlan, type PlanOffer } from '@/lib/billing';
import { describeFeedbackDetails } from '@/lib/feedback';

const plan = (billing_interval: string, price_minor: number) =>
  ({ code: billing_interval, billing_interval, price_minor, currency: 'INR' }) as unknown as BillingPlan;

describe('Plans in plain words (P55, P56)', () => {
  it('says credits as typed entries and bill scans at today’s prices', () => {
    expect(creditsInWords(813, 5, 25)).toBe('About 162 typed entries or 32 bill scans');
    expect(creditsInWords(20, 5, 25)).toBe('About 4 typed entries');
    expect(creditsInWords(0, 5, 25)).toBeNull();
  });

  it('puts every pass in a month, at the offer price when it is yours', () => {
    // Board R8-Plans-Proposals: weekly ₹19 is about ₹82 a month.
    const offer = { price_minor: 1900, original_price_minor: 7900 } as PlanOffer;
    expect(Math.round(monthlyEquivalentMinor(plan('weekly', 7900), offer)! / 100)).toBe(82);
    expect(monthlyEquivalentMinor(plan('yearly', 79900), null)).toBe(6658);
    expect(monthlyEquivalentMinor(plan('monthly', 14900), null)).toBeNull();
  });
});

describe('Bug reports carry details (P59)', () => {
  it('reads as one line on the form', () => {
    expect(
      describeFeedbackDetails({
        app_version: '1.0.0 (8)',
        device: 'OnePlus CPH2487',
        os_version: 'Android 16',
        screen: 'Profile',
      })
    ).toBe('Finnri 1.0.0 (8) · OnePlus CPH2487 · Android 16 · Profile');
  });
});
