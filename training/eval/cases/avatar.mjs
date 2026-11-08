// ui.avatar (tab robot): the robot, person and emoji avatar. Defaults: robot eyes=round mouth=smile top=antenna chest=buttons body=74c0fc.
export default function avatar({ add }) {
  const W = 'ui.avatar', T = { tab: 'robot' };
  const o = (extra = {}) => ({ ...T, ...extra });
  const A = (m, state, opts) => add(W, m, { state }, o(opts));
  const Q = (m, answer, opts) => add(W, m, { answer }, o(opts));

  // robot parts
  A('Give yourself visor eyes.', ['robot.eyes=visor']);
  A('make ur eyes square pls', ['robot.eyes=square'], { fam: ['messy', 'abbrev'] });
  A('Use the cyclops eye.', ['robot.eyes=cyclops']);
  A('I would like sleepy eyes', ['robot.eyes=sleepy']);
  A('happy eyes please', ['robot.eyes=happy']);
  A('give me plus shaped eyes', ['robot.eyes=plus']);
  A('your mouth should be a grill', ['robot.mouth=grill']);
  A('change the mouth to a zigzag', ['robot.mouth=zigzag']);
  A('speaker mouth', ['robot.mouth=speaker']);
  A('Set your mouth to a line.', ['robot.mouth=line'], { fam: [] });
  A('put a dish on your head', ['robot.top=dish'], { fam: ['paraphrase'] });
  A('Siren on top', ['robot.top=siren']);
  A('take off your antenna', ['robot.top=none']);
  A('Dish on top pls.', ['robot.top=dish'], { fam: ['messy'] });
  A('Would like a dish on the top', ['robot.top=dish'], { fam: ['messy'] });
  A('twin antennas', ['robot.top=twin']);
  A('put a heart on your chest', ['robot.chest=heart']);
  A('remove the thing on your chest', ['robot.chest=none']);
  A('add vents to your chest', ['robot.chest=vents']);
  A('chest screen', ['robot.chest=screen']);
  A('give urself a dial on ur chest', ['robot.chest=dial'], { fam: ['typo', 'abbrev'] });
  A('make your eyes squre', ['robot.eyes=square'], { fam: ['typo'] });
  A('mke your mouth a grill', ['robot.mouth=grill'], { fam: ['typo'] });
  A('Make your eyes round', ['robot.eyes=round'], { setup: ['Give yourself visor eyes.'] });
  A('go back to round eyes', ['robot.eyes=round'], { setup: ['Give yourself visor eyes.'], fam: ['paraphrase'] });

  // colours
  A('make your body green', ['robot.colors.body=69db7c']);
  A('Make my body colour blue please.', ['robot.colors.body=74c0fc'], { setup: ['make your body green'], fam: ['messy'] });
  A('paint yourself yellow', ['robot.colors.body=ffd43b']);
  A('make your body purple', ['robot.colors.body=b6a6f5']);
  A('body color should be red', ['robot.colors.body=ff9d9d'], { fam: ['user-example'] });
  A('red body colour', ['robot.colors.body=ff9d9d'], { fam: ['user-example'] });
  A('turn your body red', ['robot.colors.body=ff9d9d']);
  A('i want a green body', ['robot.colors.body=69db7c']);
  A('your body should be a bit darker', ['robot.colors.body!=74c0fc'], { note: 'a darker shade of the current colour' });
  A('make your glow red', ['robot.colors.glow!=3bc9db']);
  A('make the screen green', ['robot.colors.screen!=161a21']);
  A('make the background orange', ['robot.colors.background!=b6e3f4']);
  A('make your body blue', ['robot.colors.body=74c0fc'], { setup: ['make your body red'] });
  A('colour your body yellow, ok?', ['robot.colors.body=ffd43b'], { fam: ['messy'] });

  // character switches
  A('become a human', ['character=person'], { fam: ['user-example'] });
  A('be a person', ['character=person']);
  A('make a human', ['character=person']);
  A('can you be a girl', ['character=person'], { fam: ['paraphrase'] });
  A('I want to be an emoji', ['character=emoji']);
  A('turn into an emoji', ['character=emoji']);
  A('become a robot again', ['character=robot'], { setup: ['be a person'] });
  A('Show me a robot.', ['character=robot'], { setup: ['be an emoji'] });

  // person / emoji details
  A('wear a hat', ['person.head=hatBeanie'], { setup: ['be a person'] });
  A('Wear a medical mask.', ['person.mask=medicalMask'], { setup: ['be a person'] });
  A('Take off your mask.', ['person.mask=none'], { setup: ['be a person', 'Wear a medical mask.'] });
  A('put on glasses', ['person.accessories!=none'], { setup: ['be a person'] });
  A('Give yourself a moustache', ['person.facialHair!=none'], { setup: ['be a person'] });
  A('give yourself sparkle eyes', ['emoji.eyes=sparkle'], { setup: ['become an emoji'] });
  A('wear a hat and glasses', ['person.head=hatBeanie', 'person.accessories!=none'], { setup: ['be a person'], fam: ['multi'] });

  // name, seed, reset, undo
  A('Call yourself Pixel.', ['name=Pixel']);
  A('rename yourself to Bolt', ['name=Bolt']);
  A('your name is Zed from now on', ['name=Zed'], { fam: ['messy'] });
  A('Reset yourself.', ['robot.eyes=round', 'robot.top=antenna', 'character=robot'], { setup: ['Give yourself visor eyes.', 'Siren on top'] });
  A('undo', ['robot.eyes=round'], { setup: ['Give yourself visor eyes.'], fam: ['repeat-undo'] });
  A('go back one', ['robot.mouth=smile'], { setup: ['your mouth should be a grill'], fam: ['repeat-undo', 'paraphrase'] });

  // questions
  Q('what eyes do you have', ['visor'], { setup: ['Give yourself visor eyes.'] });
  Q('what is your name', ['PSys2']);
  Q('Who are you?', ['Pixel'], { setup: ['Call yourself Pixel.'] });
  Q('Are you angry?', ['No']);
  Q('what are you wearing', ['beanie'], { setup: ['be a person', 'wear a hat'] });
  Q('what color is your body', ['blue'], { fam: ['paraphrase'] });
  Q('what mouths are there', ['grill', 'speaker', 'zigzag'], { fam: ['probe'] });
  Q('what tops can you have', ['antenna', 'dish', 'siren'], { fam: ['probe'] });
  Q('hey whats ur name', ['PSys2'], { fam: ['messy', 'abbrev'] });

  // F4 families
  A('Make your eyes and body blue', ['robot.colors.body=74c0fc'], { setup: ['make your body green'], fam: ['shared-arg', 'probe'], note: 'eyes have no colour; the body part must still be done' });
  A('make your body and glow red', ['robot.colors.body=ff9d9d', 'robot.colors.glow!=3bc9db'], { fam: ['shared-arg'] });
  A('make yes bigger and red lips', ['emoji.eyes!=pupils'], { setup: ['become an emoji'], fam: ['user-example', 'typo'], gap: true, note: 'yes = eyes (spellcheck); red lips is not supported by the emoji style' });
  A('give yourself visor eyes and a grill mouth', ['robot.eyes=visor', 'robot.mouth=grill'], { fam: ['multi'] });
  A('round eyes and a siren on top', ['robot.eyes=round', 'robot.top=siren'], { setup: ['Give yourself visor eyes.'], fam: ['multi'] });
  A('make the body green and the eyes square', ['robot.colors.body=69db7c', 'robot.eyes=square'], { fam: ['multi'] });
  A('eyes square and mouth grill', ['robot.eyes=square', 'robot.mouth=grill'], { fam: ['ellipsis', 'multi'] });
  A('body red and glow coral', ['robot.colors.body=ff9d9d'], { fam: ['ellipsis'] });
  A('make your body green, no, yellow', ['robot.colors.body=ffd43b'], { fam: ['self-correction'] });
  A('eyes visor, no, cyclops', ['robot.eyes=cyclops'], { fam: ['self-correction'] });
  A('make your body blue, no wait, red', ['robot.colors.body=ff9d9d'], { setup: ['make your body green'], fam: ['self-correction'] });
  A('give yourself a heart on your chest and then undo that', ['robot.chest=buttons'], { fam: ['repeat-undo', 'multi'] });
  A('change your eyes to visor then change them back', ['robot.eyes=round'], { fam: ['repeat-undo', 'multi'] });
  A('become a person and wear a hat', ['character=person', 'person.head=hatBeanie'], { fam: ['multi'] });
  A('be a human then call yourself Anna', ['character=person', 'name=Anna'], { fam: ['multi'] });
  A('hey could u make ur eyes visor and ur body green', ['robot.eyes=visor', 'robot.colors.body=69db7c'], { fam: ['multi', 'messy'] });
  A('make it cyclops', ['robot.eyes=cyclops'], { setup: ['Give yourself visor eyes.'], fam: ['reference'], note: 'it = the eyes mentioned just before' });
  A('and make them square', ['robot.eyes=square'], { setup: ['Give yourself visor eyes.'], fam: ['reference'] });
  A('make the mouth a grill then the top a dish', ['robot.mouth=grill', 'robot.top=dish'], { fam: ['multi', 'ellipsis'] });
  add(W, 'the purple elephant dances at midnight', { none: true }, o({ fam: ['negative'] }));
  add(W, 'asdf qwer zxcv', { none: true }, o({ fam: ['negative'] }));
}
