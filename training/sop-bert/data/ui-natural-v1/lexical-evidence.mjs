// Finite C1 annotation vocabulary, never runtime matching or an execution fallback.
// Values remain source phrases; these aliases document explicit lexical normalization.
const words={
 align:{center:['centred','centre','centrally','central'],justify:['justified','justify'],right:['right aligned','right-align']},
 mark:{italic:['italicise','italics'],bold:['bold']},
 layout:{column:['vertically','vertical'],row:['side by side','horizontally','horizontal']},
 style:{task:['checklist'],dashed:['dashes']},
 variant:{smile:['smiling']},
 size:{big:['bigger'],small:['smaller']},
 place:{up:['upward','raise','lift'],down:['downward','lower'],left:['leftward'],right:['rightward']},
 header:{true:['with a header row','with headers','with headings','a header','header Item','header row'],false:['without a header row','no header','header off','header disabled']}
};
export function lexicalEvidence(parameter,value,text,findSurface){
 if(typeof value!=='string'&&typeof value!=='boolean')return null;
 return(words[parameter]?.[String(value)]??[]).find(phrase=>findSurface(text,phrase))??null;
}
