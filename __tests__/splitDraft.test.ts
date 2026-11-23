import { resolveSplitDraft } from '@/lib/split-draft';
import type { ParseResponse } from '@/lib/parse';
import type { SplitFriend, SplitGroup } from '@/lib/splits';

const baseParse = (overrides: Partial<ParseResponse>): ParseResponse => ({
  type: 'expense',
  title: 'Dinner',
  time: null,
  amount: 1200,
  currency: 'INR',
  mode: 'UPI',
  card_network: null,
  account_hint: null,
  category: 'Food',
  merchant: null,
  tag: null,
  note: null,
  date: '2026-07-21',
  source_text: 'dinner split',
  ...overrides,
});

describe('resolveSplitDraft', () => {
  it('matches existing friends without creating inline duplicates', () => {
    const friends = [{ id: 7, name: 'Riya', user_id: 1, archived: false }] as SplitFriend[];

    const draft = resolveSplitDraft(
      baseParse({
        split_candidate: true,
        split_candidate_details: {
          participants: [{ friend_name: 'riya', direction: 'friend_owes_user' }],
        },
      }),
      friends,
      []
    );

    expect(draft).toEqual(
      expect.objectContaining({
        splitEnabled: true,
        splitGroupId: null,
        splitParticipants: [
          {
            friendId: 7,
            friendName: '',
            shareAmount: '600.00',
            direction: 'friend_owes_user',
          },
        ],
      })
    );
  });

  it('counts you in when two friends come back without shares (2026-11-23)', () => {
    // The API now clears the ₹1,200 + ₹1,200 the model gave "Dinner 2400 split
    // with Aarav and Priya"; the app divides by the two of them and you.
    const friends = [
      { id: 3, name: 'Aarav', user_id: 1, archived: false },
      { id: 4, name: 'Priya', user_id: 1, archived: false },
    ] as SplitFriend[];
    const draft = resolveSplitDraft(
      baseParse({
        amount: 2400,
        split_candidate: true,
        split_candidate_details: {
          participants: [
            { friend_name: 'Aarav', share_amount: null, direction: 'friend_owes_user' },
            { friend_name: 'Priya', share_amount: null, direction: 'friend_owes_user' },
          ],
        },
      }),
      friends,
      []
    );
    expect(draft.splitParticipants.map((participant) => participant.shareAmount)).toEqual([
      '800.00',
      '800.00',
    ]);
  });

  it('matches an existing group and prefills equal member shares', () => {
    const groups = [
      {
        id: 4,
        name: 'Goa Trip',
        user_id: 1,
        archived: false,
        members: [
          { id: 1, user_id: 1, group_id: 4, friend_id: 11, friend: { id: 11, name: 'Aarav' } },
          { id: 2, user_id: 1, group_id: 4, friend_id: 12, friend: { id: 12, name: 'Meera' } },
        ],
      },
    ] as unknown as SplitGroup[];

    const draft = resolveSplitDraft(
      baseParse({
        amount: 1500,
        split_candidate: true,
        split_candidate_details: { group_name: 'goa trip', participants: [] },
      }),
      [],
      groups
    );

    expect(draft.splitGroupId).toBe(4);
    expect(draft.splitGroupName).toBe('');
    expect(draft.splitParticipants).toEqual([
      {
        friendId: 11,
        friendName: '',
        shareAmount: '500.00',
        sharePercent: '33.33',
        direction: 'friend_owes_user',
      },
      {
        friendId: 12,
        friendName: '',
        shareAmount: '500.00',
        sharePercent: '33.33',
        direction: 'friend_owes_user',
      },
    ]);
  });

  it('applies a member-visible 60/40 group default in the capture composer', () => {
    const groups = [
      {
        id: 4,
        name: 'Home',
        user_id: 1,
        archived: false,
        viewer_role: 'member',
        viewer_friend_id: 11,
        viewer_slot_friends: { owner: 21 },
        default_split: {
          payer: 'owner',
          tab: 'percentages',
          participants: [
            { slot: 'owner', weight: '60' },
            { slot: '11', weight: '40' },
          ],
        },
        members: [
          { id: 1, user_id: 1, group_id: 4, friend_id: 11, friend: { id: 11, name: 'Me' } },
        ],
      },
    ] as unknown as SplitGroup[];

    const draft = resolveSplitDraft(
      baseParse({
        amount: 1000,
        split_candidate: true,
        split_candidate_details: { group_name: 'Home', participants: [] },
      }),
      [],
      groups
    );

    // The ratio survives the translation — the member carries her 40%, the
    // owner 60% through her local row for him. The payer does not: an expense
    // is entered by whoever laid the money out, so the composer opens on "you
    // paid" and the owner's 60% is what he owes her.
    expect(draft.splitParticipants).toEqual([
      {
        friendId: 21,
        friendName: '',
        shareAmount: '600.00',
        sharePercent: '60',
        direction: 'friend_owes_user',
      },
    ]);
    expect(draft.splitDefaultWarning).toBeUndefined();
  });

  it('keeps the group ratio when the group is resolved before the amount', () => {
    const groups = [
      {
        id: 4,
        name: 'Home',
        user_id: 1,
        archived: false,
        viewer_role: 'member',
        viewer_friend_id: 11,
        viewer_slot_friends: { owner: 21 },
        default_split: {
          payer: 'owner',
          tab: 'percentages',
          participants: [
            { slot: 'owner', weight: '60' },
            { slot: '11', weight: '40' },
          ],
        },
        members: [
          { id: 1, user_id: 1, group_id: 4, friend_id: 11, friend: { id: 11, name: 'Me' } },
        ],
      },
    ] as unknown as SplitGroup[];

    const draft = resolveSplitDraft(
      baseParse({
        amount: null,
        split_candidate: true,
        split_candidate_details: { group_name: 'Home', participants: [] },
      }),
      [],
      groups
    );

    expect(draft.splitParticipants[0]).toEqual(
      expect.objectContaining({ friendId: 21, shareAmount: '', sharePercent: '60' })
    );
    expect(draft.splitDefaultWarning).toBeUndefined();
  });

  it('warns before falling back when a saved group default cannot be translated', () => {
    const groups = [
      {
        id: 4,
        name: 'Home',
        user_id: 1,
        archived: false,
        viewer_role: 'member',
        viewer_friend_id: 11,
        viewer_slot_friends: { owner: 21 },
        default_split: {
          payer: 'owner',
          tab: 'equally',
          participants: [{ slot: 'owner' }, { slot: '99' }],
        },
        members: [
          { id: 1, user_id: 1, group_id: 4, friend_id: 11, friend: { id: 11, name: 'Me' } },
          { id: 2, user_id: 1, group_id: 4, friend_id: 99, friend: { id: 99, name: 'Left' } },
        ],
      },
    ] as unknown as SplitGroup[];

    const draft = resolveSplitDraft(
      baseParse({
        amount: 1000,
        split_candidate: true,
        split_candidate_details: { group_name: 'Home', participants: [] },
      }),
      [],
      groups
    );

    expect(draft.splitParticipants).toEqual([
      {
        friendId: 21,
        friendName: '',
        shareAmount: '500.00',
        sharePercent: '50',
        direction: 'friend_owes_user',
      },
    ]);
    expect(draft.splitDefaultWarning).toMatch(/couldn't be applied/i);
  });

  it('matches a spoken group name without creating a duplicate group', () => {
    const groups = [
      {
        id: 9,
        name: 'Bubu dudu',
        user_id: 1,
        archived: false,
        members: [
          { id: 1, user_id: 1, group_id: 9, friend_id: 21, friend: { id: 21, name: 'Wife' } },
        ],
      },
    ] as SplitGroup[];

    const draft = resolveSplitDraft(
      baseParse({
        amount: 2000,
        mode: 'credit_card',
        split_candidate: true,
        split_candidate_details: { group_name: 'Bubudoo', participants: [] },
      }),
      [],
      groups
    );

    expect(draft.splitGroupId).toBe(9);
    expect(draft.splitGroupName).toBe('');
    expect(draft.splitParticipants).toEqual([
      {
        friendId: 21,
        friendName: '',
        shareAmount: '1000.00',
        sharePercent: '50',
        direction: 'friend_owes_user',
      },
    ]);
  });

  it('keeps the parsed group name when speech matching is ambiguous', () => {
    const groups = [
      { id: 9, name: 'Bubu dudu', user_id: 1, archived: false },
      { id: 10, name: 'Bubu dudu dinner', user_id: 1, archived: false },
    ] as SplitGroup[];

    const draft = resolveSplitDraft(
      baseParse({
        split_candidate: true,
        split_candidate_details: { group_name: 'Bubudoo', participants: [] },
      }),
      [],
      groups
    );

    expect(draft.splitGroupId).toBeNull();
    expect(draft.splitGroupName).toBe('Bubudoo');
  });

  it('rebalances multiple parsed shares when AI assigns too much to each friend', () => {
    const friends = [
      { id: 1, name: 'Anshul', user_id: 1, archived: false },
      { id: 2, name: 'Riya', user_id: 1, archived: false },
      { id: 3, name: 'Nishant', user_id: 1, archived: false },
    ] as SplitFriend[];

    const draft = resolveSplitDraft(
      baseParse({
        amount: 2000,
        split_candidate: true,
        split_candidate_details: {
          participants: [
            { friend_name: 'Anshul', share_amount: 1000, direction: 'friend_owes_user' },
            { friend_name: 'Riya', share_amount: 1000, direction: 'friend_owes_user' },
            { friend_name: 'Nishant', share_amount: 1000, direction: 'friend_owes_user' },
          ],
        },
      }),
      friends,
      []
    );

    expect(draft.splitParticipants.map((participant) => participant.shareAmount)).toEqual([
      '500.00',
      '500.00',
      '500.00',
    ]);
  });
  describe('a group heard as people (2026-11-11)', () => {
    const groups = [
      {
        id: 9,
        name: 'Bubu Dudu Daily',
        user_id: 1,
        archived: false,
        members: [
          { id: 1, user_id: 1, group_id: 9, friend_id: 21, friend: { id: 21, name: 'Biwi' } },
        ],
      },
      { id: 10, name: 'Dyninno Diwali lunch', user_id: 1, archived: false, members: [] },
    ] as unknown as SplitGroup[];
    const friends = [{ id: 21, name: 'Biwi', user_id: 1, archived: false }] as SplitFriend[];

    it('reads "Bubu, Dudu, daily group" as the Bubu Dudu Daily group', () => {
      const draft = resolveSplitDraft(
        baseParse({
          amount: 140,
          split_candidate: true,
          split_candidate_details: {
            group_name: 'daily group',
            participants: [
              { friend_name: 'Bubu', share_amount: 70, direction: 'friend_owes_user' },
              { friend_name: 'Dudu', share_amount: 70, direction: 'friend_owes_user' },
            ],
          },
        }),
        friends,
        groups
      );
      expect(draft.splitGroupId).toBe(9);
      expect(draft.splitGroupName).toBe('');
      expect(draft.splitParticipants.map((p) => p.friendId)).toEqual([21]);
    });

    it('reads a run-together "Bobududu" as the group, not a new friend', () => {
      const draft = resolveSplitDraft(
        baseParse({
          amount: 100,
          split_candidate: true,
          split_candidate_details: {
            participants: [
              { friend_name: 'Bobududu', share_amount: 50, direction: 'friend_owes_user' },
            ],
          },
        }),
        friends,
        groups
      );
      expect(draft.splitGroupId).toBe(9);
      expect(draft.splitParticipants.map((p) => p.friendId)).toEqual([21]);
      expect(draft.splitParticipants.some((p) => p.friendName === 'Bobududu')).toBe(false);
    });

    it('still adds a real new friend who is not part of any group', () => {
      const draft = resolveSplitDraft(
        baseParse({
          amount: 100,
          split_candidate: true,
          split_candidate_details: {
            participants: [
              { friend_name: 'Rohan', share_amount: 50, direction: 'friend_owes_user' },
            ],
          },
        }),
        friends,
        groups
      );
      expect(draft.splitGroupId).toBeNull();
      expect(draft.splitParticipants).toEqual([
        expect.objectContaining({ friendId: null, friendName: 'Rohan', shareAmount: '50.00' }),
      ]);
    });

    it('keeps a known friend named alongside the group', () => {
      const draft = resolveSplitDraft(
        baseParse({
          amount: 300,
          split_candidate: true,
          split_candidate_details: {
            group_name: 'Bubu Dudu Daily',
            participants: [
              { friend_name: 'Biwi', share_amount: 150, direction: 'friend_owes_user' },
            ],
          },
        }),
        friends,
        groups
      );
      expect(draft.splitGroupId).toBe(9);
      expect(draft.splitParticipants).toEqual([
        expect.objectContaining({ friendId: 21, shareAmount: '150.00' }),
      ]);
    });
  });
});
