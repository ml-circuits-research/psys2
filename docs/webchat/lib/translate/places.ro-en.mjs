// Place names (countries, continents, cities) for the geography world (browser-safe, data only).
// Rows are "Romanian forms|English". Forms are the nominative and the genitive/dative of a feminine name ("Japonia,Japoniei");
// a trailing "+" on a masculine name adds the definite article forms (-ul, -ului): "Egipt+" = Egipt, Egiptul, Egiptului.
// Indefinite names that Romanian leaves unchanged (Tokyo, Oslo) are a single form.

const PLACE_ROWS = `
Japonia,Japoniei|Japan
Italia,Italiei|Italy
România,României|Romania
Franța,Franței|France
Spania,Spaniei|Spain
Germania,Germaniei|Germany
Anglia,Angliei|England
Rusia,Rusiei|Russia
China,Chinei|China
India,Indiei|India
Grecia,Greciei|Greece
Turcia,Turciei|Turkey
Polonia,Poloniei|Poland
Ungaria,Ungariei|Hungary
Bulgaria,Bulgariei|Bulgaria
Moldova,Moldovei|Moldova
Ucraina,Ucrainei|Ukraine
Austria,Austriei|Austria
Elveția,Elveției|Switzerland
Portugalia,Portugaliei|Portugal
Norvegia,Norvegiei|Norway
Suedia,Suediei|Sweden
Finlanda,Finlandei|Finland
Danemarca,Danemarcei|Denmark
Olanda,Olandei|Netherlands
Belgia,Belgiei|Belgium
Irlanda,Irlandei|Ireland
Canada,Canadei|Canada
Mexic+|Mexico
Brazilia,Braziliei|Brazil
Argentina,Argentinei|Argentina
Australia,Australiei|Australia
Kenya,Kenyei|Kenya
Africa,Africii|Africa
Europa,Europei|Europe
Asia,Asiei|Asia
Antarctica,Antarcticii|Antarctica
Egipt+|Egypt
Maroc+|Morocco
Iran+|Iran
Irak+|Iraq
Israel+|Israel
Peru+|Peru
Chile+|Chile
Cuba|Cuba
Paris+|Paris
Berlin+|Berlin
Madrid+|Madrid
Londra,Londrei|London
Roma,Romei|Rome
Viena,Vienei|Vienna
Atena,Atenei|Athens
Lisabona,Lisabonei|Lisbon
Moscova,Moscovei|Moscow
Varșovia,Varșoviei|Warsaw
Budapesta,Budapestei|Budapest
București+|Bucharest
Cluj+|Cluj
Oslo|Oslo
Tokyo|Tokyo
Kyoto|Kyoto
Osaka|Osaka
Cairo|Cairo
Beijing|Beijing
Pekin+|Beijing
Washington+|Washington
Praga,Pragăi|Prague
Bruxelles|Brussels
Amsterdam+|Amsterdam
Stockholm+|Stockholm
Copenhaga,Copenhagăi|Copenhagen
Dublin+|Dublin
Ankara|Ankara
Istanbul+|Istanbul
Chișinău+|Chisinau
Kiev+|Kyiv
Nairobi+|Nairobi
Sydney+|Sydney
Atlantida,Atlantidei|Atlantis
America de Sud|South America
America de Nord|North America
Africa de Sud|South Africa
Statele Unite|United States
Noua Zeelandă|New Zealand
Arabia Saudită|Saudi Arabia
Marea Britanie|Great Britain
Oceanul Atlantic|Atlantic Ocean
Oceanul Pacific|Pacific Ocean
Marea Neagră|Black Sea
`;

/** [{ en, nom: [forms], gen: [forms] }] */
export const places = PLACE_ROWS.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [ro, en] = l.split('|');
  if (ro.endsWith('+')) { const b = ro.slice(0, -1); return { en, nom: [b, `${b}ul`], gen: [`${b}ului`] }; }
  const f = ro.split(',');
  return { en, nom: f.slice(0, 1), gen: f.slice(1) };
});

const ENRO = new Map(places.map((p) => [p.en, p.nom[0]]));
/** Romanian nominative of an English place name, or null. */
export function placeRo(en) { return ENRO.get(en) ?? null; }
/** English place names of more than one word ("South America"), longest first: the English side merges them into one name token. */
export const MULTIWORD_EN = places.map((p) => p.en).filter((e) => e.includes(' ')).sort((a, b) => b.length - a.length);

export default places;
