/* Server-side GIF frame decoder used before profile media moderation.
 * It generates contact sheets from the original bytes, never from client-supplied previews.
 */
const MAX_FRAMES = 128;
const MAX_DECODED_PIXELS = 24000000;
const CELL = 128;
const COLS = 3;
const SHEET = CELL * COLS;
function u16(b,o){if(o+1>=b.length)throw Error("GIF is truncated.");return b[o]|b[o+1]<<8;}
function table(b,o,n){const len=n*3;if(o+len>b.length)throw Error("GIF color table is incomplete.");return{data:b.subarray(o,o+len),next:o+len};}
function skipBlocks(b,o){while(o<b.length){const n=b[o++];if(!n)return o;if(o+n>b.length)throw Error("GIF data block is incomplete.");o+=n;}throw Error("GIF data blocks are incomplete.");}
function readBlocks(b,o){const list=[];let len=0;while(o<b.length){const n=b[o++];if(!n)break;if(o+n>b.length)throw Error("GIF image data is incomplete.");list.push(b.subarray(o,o+n));len+=n;o+=n;}const data=new Uint8Array(len);let p=0;for(const x of list){data.set(x,p);p+=x.length;}return{data,next:o};}
function lzw(data,min,expected){
 if(min<2||min>8)throw Error("GIF uses unsupported LZW data.");
 const clear=1<<min,end=clear+1,prefix=new Int16Array(4096),suffix=new Uint8Array(4096),stack=new Uint8Array(4097),out=new Uint8Array(expected);
 let size=min+1,next=clear+2,bit=0,old=-1,first=0,pos=0;
 for(let i=0;i<clear;i++)suffix[i]=i;
 function code(n){if(bit+n>data.length*8)return-1;const p=bit>>3,s=bit&7,w=(data[p]||0)|((data[p+1]||0)<<8)|((data[p+2]||0)<<16);bit+=n;return(w>>s)&((1<<n)-1);}
 while(pos<expected){let c=code(size);if(c<0||c===end)break;if(c===clear){size=min+1;next=clear+2;old=-1;continue;}if(c>next||c>=4096)throw Error("GIF has an invalid LZW sequence.");const orig=c;let sp=0;
  if(old<0){if(c>=clear)throw Error("GIF frame could not be decoded.");out[pos++]=suffix[c];first=suffix[c];old=c;continue;}
  if(c===next){stack[sp++]=first;c=old;}let guard=0;while(c>=clear+2){if(c>=next||++guard>4096||sp>=stack.length-1)throw Error("GIF LZW dictionary is invalid.");stack[sp++]=suffix[c];c=prefix[c];}
  if(c>=clear||sp>=stack.length)throw Error("GIF frame could not be decoded.");first=suffix[c];stack[sp++]=first;while(sp&&pos<expected)out[pos++]=stack[--sp];
  if(next<4096){prefix[next]=old;suffix[next]=first;next++;if(next===(1<<size)&&size<12)size++;}old=orig;
 }
 if(pos!==expected)throw Error("GIF frame could not be fully decoded.");return out;
}
function blankSheet(){const p=new Uint8Array(SHEET*SHEET*4);p.fill(255);return p;}
function tile(sheet,canvas,w,h,n){const x0=(n%COLS)*CELL,y0=Math.floor(n/COLS)*CELL,scale=Math.min((CELL-8)/w,(CELL-20)/h,1),dw=Math.max(1,Math.floor(w*scale)),dh=Math.max(1,Math.floor(h*scale)),sx=x0+Math.floor((CELL-dw)/2),sy=y0+2+Math.floor((CELL-20-dh)/2);
 for(let y=0;y<dh;y++){const yy=Math.min(h-1,Math.floor(y/scale));for(let x=0;x<dw;x++){const xx=Math.min(w-1,Math.floor(x/scale)),si=(yy*w+xx)*4,a=canvas[si+3]/255;if(!a)continue;const di=((sy+y)*SHEET+sx+x)*4;sheet[di]=Math.round(canvas[si]*a+255*(1-a));sheet[di+1]=Math.round(canvas[si+1]*a+255*(1-a));sheet[di+2]=Math.round(canvas[si+2]*a+255*(1-a));sheet[di+3]=255;}}
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=v&1?0xedb88320^(v>>>1):v>>>1;t[n]=v>>>0;}return t;})();
function crc(b){let v=0xffffffff;for(const x of b)v=CRC[(v^x)&255]^(v>>>8);return(v^0xffffffff)>>>0;}
function join(list){const n=list.reduce((a,b)=>a+b.length,0),out=new Uint8Array(n);let p=0;for(const b of list){out.set(b,p);p+=b.length;}return out;}
function chunk(name,data){const type=new Uint8Array(Array.from(name,c=>c.charCodeAt(0))),crcData=join([type,data]),out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(type,4);out.set(data,8);v.setUint32(data.length+8,crc(crcData),false);return out;}
function adler32(data){let a=1,b=0;for(let i=0;i<data.length;i++){a=(a+data[i])%65521;b=(b+a)%65521;}return((b<<16)|a)>>>0;}
async function zlibDeflate(data){
 if(typeof CompressionStream==="function")return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
 const parts=[new Uint8Array([0x78,0x01])];let offset=0;
 while(offset<data.length){const length=Math.min(65535,data.length-offset),final=offset+length>=data.length?1:0,header=new Uint8Array([final,length&255,(length>>>8)&255,(~length)&255,((~length)>>>8)&255]);parts.push(header,data.subarray(offset,offset+length));offset+=length;}
 const checksum=adler32(data);parts.push(new Uint8Array([(checksum>>>24)&255,(checksum>>>16)&255,(checksum>>>8)&255,checksum&255]));return join(parts);
}
async function toPng(rgba){const row=SHEET*4+1,raw=new Uint8Array(row*SHEET);for(let y=0;y<SHEET;y++){raw[y*row]=0;raw.set(rgba.subarray(y*SHEET*4,(y+1)*SHEET*4),y*row+1);}const compressed=await zlibDeflate(raw),ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);v.setUint32(0,SHEET,false);v.setUint32(4,SHEET,false);ihdr[8]=8;ihdr[9]=6;return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",compressed),chunk("IEND",new Uint8Array())]);}
export async function decodeGifFramesToPngSheets(bytes){
 if(bytes.length<13||!["GIF87a","GIF89a"].includes(String.fromCharCode(...bytes.subarray(0,6))))throw Error("The uploaded file isn't a valid GIF.");
 const w=u16(bytes,6),h=u16(bytes,8),packed=bytes[10];if(!w||!h||w>2048||h>2048||w*h>600000)throw Error("GIF dimensions are too large for a safe profile upload. Resize it and try again.");
 let o=13,global=null;if(packed&128){const t=table(bytes,o,1<<((packed&7)+1));global=t.data;o=t.next;}
 const canvas=new Uint8Array(w*h*4);let ctl={disposal:0,transparent:false,index:-1},prev={disposal:0,left:0,top:0,w:0,h:0,snapshot:null},count=0,work=0,sheet=null,slot=0;const sheets=[];
 function dispose(){if(prev.disposal===3&&prev.snapshot)canvas.set(prev.snapshot);else if(prev.disposal===2)for(let y=0;y<prev.h;y++){const p=((prev.top+y)*w+prev.left)*4;canvas.fill(0,p,p+prev.w*4);}}
 while(o<bytes.length){const marker=bytes[o++];if(marker===0x3b)break;
  if(marker===0x21){if(o>=bytes.length)throw Error("GIF extension is incomplete.");const label=bytes[o++];if(label===0xf9){if(o>=bytes.length)throw Error("GIF frame control is incomplete.");const n=bytes[o++];if(n!==4||o+5>bytes.length)throw Error("GIF frame control is invalid.");const flags=bytes[o++];o+=2;const index=bytes[o++];if(bytes[o++]!==0)throw Error("GIF frame control is invalid.");ctl={disposal:(flags>>2)&7,transparent:!!(flags&1),index};}else o=skipBlocks(bytes,o);continue;}
  if(marker!==0x2c)throw Error("GIF contains an unsupported block.");if(o+9>bytes.length)throw Error("GIF frame descriptor is incomplete.");
  const left=u16(bytes,o),top=u16(bytes,o+2),fw=u16(bytes,o+4),fh=u16(bytes,o+6),flags=bytes[o+8];o+=9;if(!fw||!fh||left+fw>w||top+fh>h)throw Error("GIF frame dimensions are invalid.");
  work+=fw*fh;if(work>MAX_DECODED_PIXELS)throw Error("GIF animation is too large to inspect safely. Use a smaller or shorter GIF.");
  let colors=global;if(flags&128){const t=table(bytes,o,1<<((flags&7)+1));colors=t.data;o=t.next;}if(!colors)throw Error("GIF frame is missing its palette.");if(o>=bytes.length)throw Error("GIF image data is missing.");
  const min=bytes[o++],compressed=readBlocks(bytes,o);o=compressed.next;const idx=lzw(compressed.data,min,fw*fh);dispose();const snapshot=ctl.disposal===3?new Uint8Array(canvas):null;
  const rows=[];if(flags&64){for(let y=0;y<fh;y+=8)rows.push(y);for(let y=4;y<fh;y+=8)rows.push(y);for(let y=2;y<fh;y+=4)rows.push(y);for(let y=1;y<fh;y+=2)rows.push(y);}else for(let y=0;y<fh;y++)rows.push(y);
  for(let ri=0;ri<rows.length;ri++){const row=rows[ri],src=ri*fw,dst=((top+row)*w+left)*4;for(let x=0;x<fw;x++){const ci=idx[src+x];if(ctl.transparent&&ci===ctl.index)continue;const pi=ci*3;if(pi+2>=colors.length)throw Error("GIF references an invalid color.");const di=dst+x*4;canvas[di]=colors[pi];canvas[di+1]=colors[pi+1];canvas[di+2]=colors[pi+2];canvas[di+3]=255;}}
  count++;if(count>MAX_FRAMES)throw Error("GIF animations must contain 128 frames or fewer.");if(!sheet||slot===0){sheet=blankSheet();slot=0;}tile(sheet,canvas,w,h,slot);slot++;prev={disposal:ctl.disposal,left,top,w:fw,h:fh,snapshot};ctl={disposal:0,transparent:false,index:-1};
  if(slot===COLS*COLS){sheets.push(await toPng(sheet));sheet=null;slot=0;}
 }
 if(!count)throw Error("No decodable frames were found in this GIF.");if(sheet&&slot)sheets.push(await toPng(sheet));if(sheets.length>Math.ceil(MAX_FRAMES/(COLS*COLS)))throw Error("GIF contains too many frames to inspect safely.");return sheets;
}
