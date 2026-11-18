// tests/unit/riderChoiceGroupsPerAbility.test.js
//
// Issue #344 A04 — two abilities that each have a "choose one" whose group id
// the extractor gave as "1" were one radio set: `groupPromptedRiders` grouped
// by `choiceGroup` alone, so the outcome prompt offered four alternatives
// under the first asset's name and only one ability's effect could be taken.
// A group id is local to its ability; the grouping keys on the ability as
// well. The extractor's parser, validation, condition matching, partitioning,
// grouping and the dialog's selection all run; the extraction reply and the
// dialog's clicks are fixtures.

import { describe, it, expect } from 'vitest';
import { extractRiders, collectFiringRiders, partitionRiders } from '../../src/moves/consequenceRiders.js';
import { groupPromptedRiders, promptRiders } from '../../src/moves/riderDialog.js';

const rider = (resource, choiceGroup) => ({ resource, amount: 1, condition: 'hit', choiceGroup, label: `+1 ${resource}` });

async function promptedFor(aGroup, bGroup) {
  const abilities = [
    { key: 'a:0', assetName: 'Asset A', text: 'On a hit, choose +1 health or +1 momentum.' },
    { key: 'b:0', assetName: 'Asset B', text: 'On a hit, choose +1 spirit or +1 supply.' },
  ];
  const extracted = await extractRiders({
    abilities, moveName: 'Face Danger', apiKey: 'test-key',
    _call: async () => JSON.stringify({ abilities: [
      { key: 'a:0', riders: [rider('health', aGroup), rider('momentum', aGroup)] },
      { key: 'b:0', riders: [rider('spirit', bGroup), rider('supply', bGroup)] },
    ] }),
  });
  return partitionRiders(collectFiringRiders(extracted, 'strong_hit', false)).prompted;
}

/** promptRiders with a dialog that takes each radio set's first option. */
async function chooseFirstOfEach(prompted) {
  const saved = foundry.applications.api.DialogV2;
  foundry.applications.api.DialogV2 = {
    wait: async (opts) => {
      const form = { querySelector: (selector) => (selector.includes(':checked') ? { value: '0' } : null) };
      return opts.buttons.find(b => b.action === 'apply').callback(null, { form });
    },
  };
  try { return await promptRiders(prompted); } finally { foundry.applications.api.DialogV2 = saved; }
}

describe('issue #344 A04 — each ability keeps its own "choose one"', () => {
  it('control: different group ids are two choices', async () => {
    const { choices } = groupPromptedRiders(await promptedFor('a', 'b'));
    expect(choices).toHaveLength(2);
  });

  it('two abilities that both call their choice "1" are two choices, each with its own two options', async () => {
    const { choices } = groupPromptedRiders(await promptedFor('1', '1'));
    expect(choices).toHaveLength(2);
    expect(choices.map(c => c.options.map(o => o.key))).toEqual([['a:0', 'a:0'], ['b:0', 'b:0']]);
    expect(choices.map(c => c.options[0].assetName)).toEqual(['Asset A', 'Asset B']);
  });

  it('…and the prompt applies one effect from each ability', async () => {
    const chosen = await chooseFirstOfEach(await promptedFor('1', '1'));
    expect(chosen.apply.map(r => ({ resource: r.resource, key: r.key }))).toEqual([
      { resource: 'health', key: 'a:0' },
      { resource: 'spirit', key: 'b:0' },
    ]);
  });

  it('control: two groups inside one ability stay two, and one group stays one', () => {
    const { choices } = groupPromptedRiders([
      { resource: 'health',   amount: 1, choiceGroup: 'x', key: 'a:0' },
      { resource: 'momentum', amount: 1, choiceGroup: 'x', key: 'a:0' },
      { resource: 'spirit',   amount: 1, choiceGroup: 'y', key: 'a:0' },
      { resource: 'supply',   amount: 1, choiceGroup: 'y', key: 'a:0' },
    ]);
    expect(choices.map(c => [c.group, c.options.length])).toEqual([['x', 2], ['y', 2]]);
  });
});
