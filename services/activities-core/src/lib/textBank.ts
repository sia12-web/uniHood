export const TEXT_BANK: readonly string[] = [
  "Sphinx of black quartz, judge my vow.",
  "Five quacking zephyrs jolt my wax bed.",
  "Pack my box with five dozen liquor jugs.",
  "The five boxing wizards jump quickly.",
  "Grumpy wizards make toxic brew for the evil queen and jack.",
  "Heavy boxes perform quick waltzes and jigs.",
  "Crazy Fredrick bought many very exquisite opal jewels.",
  "Joaquin Phoenix was gazed by MTV for luck.",
  "Bumpy wizard jars vex a quick fox.",
  "How vexingly quick daft zebras jump!",
  "Bright vixens jump; dozy fowl quack.",
  "Quick zephyrs blow, vexing daft Jim.",
  "Watch Jeopardy!, Alex Trebek's fun TV quiz game.",
  "Just poets wax boldly as they fix quills.",
  "Jackdaws love my big sphinx of quartz.",
  "Woven silk pyjamas exchanged for blue quartz.",
  "The quick brown fox jumps over the lazy dog.",
  "My faxed joke won a pager in the cable TV quiz show.",
  "Public junk dwarves quiz mighty fox.",
  "Twelve ziggurats quickly jumped a finch box.",
  "Foxy diva Jennifer Lopez wasn't baking my quiche.",
  "Vamp fox held quartz glow job." // intentionally short stub; extend later
];

export function getRandomTextSample(): string {
  // TODO: Replace with weighted selection or database-driven source
  const index = Math.floor(Math.random() * TEXT_BANK.length);
  return TEXT_BANK[index];
}
