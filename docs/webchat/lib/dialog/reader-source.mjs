import {parse,quote,str} from '../vendor/sopworld/sopworld.mjs?v=4a094fcca4';

const maxUnits=65536;
const sourceType='std.request.source';
const validText=text=>typeof text==='string'&&text.length<=maxUnits&&!/[\uD800-\uDFFF]/u.test(text);

export function writeReaderSource(text){
 if(!validText(text))throw Error('invalid-source-text');
 return '@reader.source '+sourceType+' text='+quote(text);
}

export function readReaderSource(sop){
 if(typeof sop!=='string'||sop.length>maxUnits*6+1024)throw Error('invalid-reader-source');
 let wires;
 try{wires=parse(sop);}catch{throw Error('invalid-reader-source');}
 const [wire]=wires;
 if(wires.length!==1||wire.type!==sourceType||wire.pattern||wire.legacy||
    Object.keys(wire.attrs).length!==1||wire.attrs.text?.length!==1||!wire.attrs.text[0].startsWith('"'))throw Error('invalid-reader-source');
 const text=str(wire.attrs.text[0]);
 if(!validText(text))throw Error('invalid-source-text');
 return text;
}
