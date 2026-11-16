// Verified component trace for the pinned, untruncated BERT tokenizer profile.
// This module does not parse language or infer semantic anchors.
const stable=(x,depth=0)=>{if(depth>32)throw Error('bert-offsets:profile-depth');return Array.isArray(x)?x.map(v=>stable(v,depth+1)):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k],depth+1)])):x;};
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const reject=reason=>{throw Error(`bert-offsets:${reason}`);};
const digest=async text=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const template=pair=>[{SpecialToken:{id:'[CLS]',type_id:0}},{Sequence:{id:'A',type_id:0}},{SpecialToken:{id:'[SEP]',type_id:0}},...(pair?[{Sequence:{id:'B',type_id:1}},{SpecialToken:{id:'[SEP]',type_id:1}}]:[])];
export async function createBertSourceOffsetAuthority({tokenizer,tokenizerJSON,tokenizerSha256,maxScalars=32768,budget=1000000}={}){
 if(typeof tokenizer!=='function'||typeof tokenizerJSON!=='string'||tokenizerJSON.length>4000000||!Number.isSafeInteger(maxScalars)||maxScalars<1||!Number.isSafeInteger(budget)||budget<1)reject('invalid-options');
 if(await digest(tokenizerJSON)!==tokenizerSha256)reject('tokenizer-hash-mismatch');
 const profile=JSON.parse(tokenizerJSON),normalizer=profile.normalizer,model=profile.model,post=profile.post_processor;
 if(normalizer?.type!=='BertNormalizer'||normalizer.clean_text!==true||normalizer.handle_chinese_chars!==true||normalizer.lowercase!==true||normalizer.strip_accents!==null||profile.pre_tokenizer?.type!=='BertPreTokenizer'||model?.type!=='WordPiece'||model.unk_token!=='[UNK]'||model.continuing_subword_prefix!=='##'||model.max_input_chars_per_word!==100||post?.type!=='TemplateProcessing'||!same(post.single,template(false))||!same(post.pair,template(true)))reject('unsupported-profile');
 if(profile.truncation!==null&&(profile.truncation?.direction!=='Right'||profile.truncation?.strategy!=='LongestFirst'||profile.truncation?.stride!==0)||profile.padding!==null&&(profile.padding?.direction!=='Right'||profile.padding?.pad_token!=='[PAD]'||profile.padding?.pad_id!==model.vocab['[PAD]' ]||profile.padding?.pad_to_multiple_of!==null))reject('unsupported-padding-truncation-profile');
 const expectedAdded=['[PAD]','[UNK]','[CLS]','[SEP]','[MASK]'];
 if(!Array.isArray(profile.added_tokens)||!same(profile.added_tokens.map(t=>t.content),expectedAdded)||profile.added_tokens.some(t=>t.special!==true||t.normalized!==false||t.single_word!==false||t.lstrip!==false||t.rstrip!==false||model.vocab[t.content]!==t.id))reject('unsupported-added-tokens');
 const assertComponents=()=>{
  if(tokenizer.normalizer?.constructor?.name!=='BertNormalizer'||tokenizer.pre_tokenizer?.constructor?.name!=='BertPreTokenizer'||tokenizer.model?.constructor?.name!=='WordPieceTokenizer'||tokenizer.post_processor?.constructor?.name!=='TemplateProcessing'||!same(tokenizer.normalizer?.config,normalizer)||!same(tokenizer.model?.config,model)||!same(tokenizer.post_processor?.config,post)||tokenizer.padding_side!=='right'||typeof tokenizer.normalizer?.normalize!=='function'||typeof tokenizer.pre_tokenizer?.pre_tokenize_text!=='function'||typeof tokenizer.model?.encode!=='function'||!same(tokenizer.added_tokens?.map(t=>({id:t.id,content:t.content,single_word:t.single_word,lstrip:t.lstrip,rstrip:t.rstrip,normalized:t.normalized,special:t.special})),profile.added_tokens))reject('component-profile-mismatch');
 };
 assertComponents();
 const provenance={id:'bert-component-trace',version:1,profileSha256:await digest(JSON.stringify({normalizer,pre_tokenizer:profile.pre_tokenizer,model:{type:model.type,continuing_subword_prefix:model.continuing_subword_prefix,max_input_chars_per_word:model.max_input_chars_per_word},post_processor:post,policy:'untruncated-right-padding;no-added-token-input;no-supplementary-cjk'})),tokenizerSha256};
 return async function authority({text,contextJson,tokenIds,attentionMask,fullTokenIds,fullAttentionMask,maxLength}={}){
  assertComponents();let work=0;const tick=n=>{work+=n;if(work>budget)reject('budget');};
  if(typeof text!=='string'||typeof contextJson!=='string'||!Number.isSafeInteger(maxLength)||maxLength<1||maxLength>512)reject('invalid-input');
  const trace=(original,sequence)=>{
   const input=Array.from(original);tick(input.length);if(input.length>maxScalars)reject('source-size');
   // JS and Rust BERT CJK handling differ for supplementary characters.
   if(input.some(c=>{const n=c.codePointAt(0);return n>=0x20000&&n<=0x3ffff||n>=0xd800&&n<=0xdfff;}))reject('unsupported-unicode-profile');
   if(expectedAdded.some(t=>original.includes(t)))reject('added-token-interception');
   const normalized=[],mapping=[];
   for(let i=0;i<input.length;i++){const chars=Array.from(tokenizer.normalizer.normalize(input[i]));tick(chars.length+1);for(const c of chars){normalized.push(c);mapping.push([i,i+1]);}}
   const joined=normalized.join(''),whole=tokenizer.normalizer.normalize(original);tick(whole.length);if(joined!==whole)reject('context-sensitive-normalization');
   const words=tokenizer.pre_tokenizer.pre_tokenize_text(joined);if(!Array.isArray(words))reject('invalid-pretokens');let cursor=0;const output=[];
   for(const word of words){if(typeof word!=='string'||!word.length)reject('invalid-pretoken');const chars=Array.from(word);tick(chars.length+Math.min(chars.length,model.max_input_chars_per_word)**2);
    for(let scan=0;scan<normalized.length;scan++){if(cursor>=normalized.length||!/\s/u.test(normalized[cursor]))break;cursor++;tick(1);}
    if(normalized.slice(cursor,cursor+chars.length).join('')!==word)reject('unmatched-pretoken');
    const pieces=tokenizer.model.encode([word]);if(!Array.isArray(pieces)||!pieces.length)reject('invalid-wordpieces');tick(pieces.length);
    const unknown=pieces.length===1&&pieces[0]===model.unk_token;
    const segments=unknown?[word]:pieces.map((p,i)=>{if(typeof p!=='string'||i>0&&!p.startsWith(model.continuing_subword_prefix))reject('invalid-continuation');return i?p.slice(model.continuing_subword_prefix.length):p;});
    if(segments.some(p=>!p.length)||segments.join('')!==word)reject('lossy-wordpieces');let position=cursor;
    for(let i=0;i<pieces.length;i++){const width=Array.from(segments[i]).length;tick(width);const id=model.vocab[pieces[i]],start=mapping[position]?.[0],end=mapping[position+width-1]?.[1];if(!Number.isSafeInteger(id)||start===undefined||end===undefined)reject('invalid-piece-mapping');output.push({id,sequence,offset:sequence===0?[start,end]:null,special:0});position+=width;}
    cursor+=chars.length;
   }
   for(let scan=0;scan<normalized.length;scan++){if(cursor>=normalized.length||!/\s/u.test(normalized[cursor]))break;cursor++;tick(1);}if(cursor!==normalized.length)reject('unconsumed-normalization');return output;
  };
  const sequences={A:trace(text,0),B:trace(contextJson,1)},composed=[];
  for(const item of post.pair){tick(1);if(item.Sequence)composed.push(...sequences[item.Sequence.id]);else{const special=post.special_tokens[item.SpecialToken.id];if(!special||special.ids.length!==1||special.tokens.length!==1||model.vocab[special.tokens[0]]!==special.ids[0])reject('invalid-special');composed.push({id:special.ids[0],sequence:null,offset:null,special:1});}}
  const ids=composed.map(t=>t.id),ones=ids.map(()=>1);if(ids.length>maxLength)reject('truncation-unsupported');
  // Independently invoke the actual complete tokenizer, including interception and processor.
  const actual=await tokenizer([text],{text_pair:[contextJson],padding:false,truncation:false,return_tensor:false});
  if(!same(actual.input_ids?.[0],ids)||!same(actual.attention_mask?.[0],ones)||!same(fullTokenIds,ids)||!same(fullAttentionMask,ones))reject('full-token-parity');
  if(!Array.isArray(tokenIds)||tokenIds.length!==maxLength||!Array.isArray(attentionMask)||attentionMask.length!==maxLength)reject('padding-shape');
  for(let i=composed.length;i<maxLength;i++){tick(1);composed.push({id:model.vocab['[PAD]'],sequence:null,offset:null,special:1});}
  const expectedIds=composed.map(t=>t.id),mask=composed.map((_,i)=>i<ids.length?1:0);if(!same(tokenIds,expectedIds)||!same(attentionMask,mask))reject('padded-token-parity');
  let end=0;for(const t of composed){tick(1);if(t.offset){if(t.offset[0]<end)reject('overlapping-source-mapping');end=t.offset[1];}}
  assertComponents();return {unit:'unicode-scalar',tokenIds:[...tokenIds],attentionMask:[...attentionMask],sequenceIds:composed.map(t=>t.sequence),specialTokensMask:composed.map(t=>t.special),offsets:composed.map(t=>t.offset),provenance:{...provenance}};
 };
}
