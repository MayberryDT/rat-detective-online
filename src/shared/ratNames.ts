export const NAME_MAX_LENGTH = 20;

export const RAT_TITLES = [
  'Detective', 'Inspector', 'Gumshoe', 'Sleuth',
  'Shamus', 'Flatfoot', 'Constable', 'Sergeant',
  'Lieutenant', 'Captain', 'Chief', 'Operative',
] as const;

export const RAT_SURNAMES = [
  'Whisker', 'Rind', 'Crumb', 'Burrow',
  'Squeak', 'Nibbs', 'Gnawson', 'Crooktail',
  'Clawson', 'Scurry', 'Gnaw', 'Gnash',
  'Nibbles', 'Niblock', 'Niblett', 'Nib',
  'Pawley', 'Pawson', 'Claw', 'Tail',
  'Longtooth', 'Docktail', 'Ragtail', 'Whiskett',
  'Whiskrow', 'Gnawley', 'Gnawcroft', 'Snout',
  'Twitch', 'Chitter', 'Skitter', 'Scuttle',
  'Skulk', 'Scratch', 'Scruff', 'Scraggs',
  'Bristle', 'Tuft', 'Fuzz', 'Vermin',
  'Ratter', 'Rattenby', 'Ratwick', 'Mousley',
  'Mousewell', 'Squealer', 'Snitch', 'Fink',
  'Stoolie', 'Trapp', 'Slink', 'Nipper',
  'Chisel', 'Chew', 'Chewett', 'Crumbwell',
  'Crumbrook', 'Rindell', 'Brie', 'Gouda',
  'Cheddar', 'Stilton', 'Curd', 'Curdle',
  'Morsel', 'Rusk', 'Crust', 'Scraps',
  'Nosh', 'Rasher', 'Skim', 'Bolthole',
  'Culvert', 'Gutter', 'Gutterby', 'Gutterell',
  'Drainley', 'Drainwick', 'Ditchley', 'Sewerby',
  'Grate', 'Sump', 'Crawley', 'Crustwick',
  'Gnawmark', 'Toothmark', 'Fleabite', 'Trapnell',
] as const;

export function generateRandomName(random = Math.random): string {
  const title = RAT_TITLES[Math.floor(random() * RAT_TITLES.length)];
  const surname = RAT_SURNAMES[Math.floor(random() * RAT_SURNAMES.length)];
  return `${title} ${surname}`;
}
