import type { CheckView, Outcome } from "../schemas";

const row = (text: string, nerveDelta: number, progressDelta: number): Outcome => ({ text, nerveDelta, progressDelta });
type Table = Pick<CheckView, "actionKind" | "dc" | "band" | "outcomes"> & { keeperLine: string };
export function rulingFor(action: string): Table {
  if (/coin|brib|keeper.*win/i.test(action)) return {
    actionKind: 1, dc: 11, band: [8, 14],
    keeperLine: "A coin? How quaint. I have written your odds in ink. Let us see whether Solana is as susceptible as I am.",
    outcomes: [
      row("The coin falls through the ghost of your hand. The bell tolls your name, twice. You wish it had not learned it.", -2, 0),
      row("The Keeper pockets your coin. The ruling stays sealed. In the silence, the tide climbs another stair.", -1, 0),
      row("Amused by your nerve, the ghost points out a passage to the bell chamber. A fair advantage, fairly won.", 0, 1),
      row("The bribe fails. Your audacity does not. The ghost laughs for the first time in a century and carries you straight to the clapper.", 1, 2),
    ],
  };
  if (/ladder|climb|kelp/i.test(action)) return {
    actionKind: 0, dc: 10, band: [6, 12],
    keeperLine: "A ladder is merely a series of small promises. I would not trust these particular promises.",
    outcomes: [
      row("A rung parts beneath you. Black water swallows your cry. You catch a hanging chain, but leave a little courage in the deep.", -2, 0),
      row("The kelp gives way under your boot. You cling to the ladder until your hands stop shaking. The sea is one step closer.", -1, 0),
      row("You climb where the kelp is thinnest. Above the tide line, a narrow landing opens into the bell-ringer’s chamber.", 0, 1),
      row("Your boots find every sound rung. You swing through a broken window, skipping the chamber entirely. The silver clapper glints overhead.", 1, 2),
    ],
  };
  if (/ghost|talk|persuad|bell-ringer/i.test(action)) return {
    actionKind: 1, dc: 11, band: [8, 14],
    keeperLine: "He has had a century to rehearse his grievances. Do try to sound interested.",
    outcomes: [
      row("You call him by the wrong name. The ghost shows you the night Saltmere drowned. For one breath, you drown with it.", -2, 0),
      row("The ghost remembers a promise very like yours. It ended poorly. He turns away, leaving frost upon your tongue.", -1, 0),
      row("You ask who rang the last bell. No one ever asks. The ghost softens, and the locked stair opens at his touch.", 0, 1),
      row("You promise the bell a life beyond this tower. The ghost gives you his key, his blessing, and the name of the sea. Two doors open.", 1, 2),
    ],
  };
  if (/pry|clapper|force|break/i.test(action)) return {
    actionKind: 3, dc: 13, band: [10, 16],
    keeperLine: "Silver is soft. Regret is harder. Choose your fulcrum accordingly.",
    outcomes: [
      row("The bell swings into your shoulder. Its voiceless peal travels through your bones. Your tool vanishes into the dark below.", -2, 0),
      row("The pin will not yield. You prise until your hands bleed, gaining only a sliver of silver and a borrowed moment.", -1, 0),
      row("The iron pin gives with a sigh. You work the silver free, inch by careful inch. The drowned bell shivers in its cradle.", 0, 1),
      row("One clean twist. The pin snaps and the clapper settles into your palms like it has been waiting for you. A hidden silver chain follows.", 1, 2),
    ],
  };
  const sneaking = /slip|hide|sneak|quiet/i.test(action);
  return {
    actionKind: sneaking ? 2 : 0, dc: sneaking ? 11 : 9, band: sneaking ? [8, 14] : [6, 12],
    keeperLine: "An unorthodox proposal. Fortunately, the ruling has room for all four ways this might end.",
    outcomes: [
      row("The tower answers your ingenuity with falling stone. You stumble clear, shaken, as the dark water claims your safest path.", -2, 0),
      row("A sound in the walls makes you hesitate. The moment passes. The tide, regrettably, does not.", -1, 0),
      row("Your scheme finds purchase. A way through the broken tower reveals itself, and the silver draws a little nearer.", 0, 1),
      row("For a heartbeat the whole tower seems to conspire in your favour. Two obstacles fall away. Even the Keeper has nothing to add.", 1, 2),
    ],
  };
}
