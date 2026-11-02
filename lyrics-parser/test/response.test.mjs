import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLiriQoResponse, stripLrcTimestamps, parseYrc, parseMusixmatchRichsync } from '../src/index.js';
const timed = [{ id: 0, text: 'Hello world', start: 1234, end: 3456, words: [{text:'Hello ',start:1234,end:1765},{text:'world',start:1900,end:3456}], agent:'v1', isCue:false }];
const track = (provider, extra={}) => ({ provider, syncLevel:'word', tier:'Jagorawi', timed, plain:'Hello world', ...extra });

test('normalized native timing remains exact through full response orchestration',()=>{
  const result=parseLiriQoResponse({tracks:[track('netease')]},{instrumentalGapMs:0});
  assert.equal(result.richsynced.lyrics[0].startTimeMs,1234);
  assert.equal(result.richsynced.lyrics[0].parts[0].durationMs,531);
  assert.equal(result.richsynced.lyrics[0].parts[1].startTimeMs,1900);
  assert.equal(result.richsynced.lyrics[0].parts[1].durationMs,1556);
  assert.equal(result.richsynced.provider,'netease');
  assert.equal(result.provider,'netease');
  assert.equal(result.route,'words');
  assert.equal(result.synced.lyrics[0].durationMs,2222);
  assert.equal(result.synced.lyrics[0].parts,undefined);
});

test('failed raw TTML and QRC fall back to same track native words',()=>{
  const result=parseLiriQoResponse({tracks:[track('apple_music_liriqo',{ttml:'not XML',qrc:'not qrc'})]});
  assert(result.richsynced);
  assert.equal(result.route,'words');
});

test('new per-tier priorities apply to unsorted input; removed LRCLib wordsync never wins',()=>{
  const result=parseLiriQoResponse({tracks:[track('qq_portato'),track('kugou_legato'),track('lrclib_wordsync'),track('netease'),track('musixmatch'),track('unison_community'),track('apple_music_liriqo')]});
  assert.equal(result.provider,'apple_music_liriqo');
  const second=parseLiriQoResponse({tracks:[track('qq_portato'),track('kugou_legato'),track('netease'),track('musixmatch')]});
  assert.equal(second.provider,'musixmatch');
  const empty=parseLiriQoResponse({tracks:[track('lrclib_wordsync')]});
  assert.equal(empty.richsynced,null);
});

test('raw YRC and richsync parse without requiring a tier label',()=>{
  const yrc=parseLiriQoResponse({tracks:[{provider:'netease',yrc:'[1000,2000](1000,800,0)Hello (1800,1200,0)world'}]});
  assert(yrc.richsynced);assert.equal(yrc.route,'yrc');
  const rich=parseLiriQoResponse({tracks:[{provider:'musixmatch',richsync:[{ts:1,te:3,x:'Hello world',l:[{c:'Hello ',o:0},{c:'world',o:0.8}]}]}]});
  assert(rich.richsynced);assert.equal(rich.route,'richsync');
});

test('YTM timed line parsing preserves LyricFind attribution',()=>{
  const result=parseLiriQoResponse({tracks:[track('ytm_line',{syncLevel:'line',tier:'Cipali',timed:timed.map(({words,...line})=>line),upstreamProvider:'YouTube Music (LyricFind)',lyricsSource:'LyricFind'})]});
  assert.equal(result.richsynced,null);
  assert.equal(result.syncedProvider,'ytm_line');
  assert.equal(result.synced.source,'YouTube Music (LyricFind)');
  assert.equal(result.synced.lyricsSource,'LyricFind');
});

test('plain-only timed payload works and LRCLib plain ranks after Apple',()=>{
  const result=parseLiriQoResponse({tracks:[{provider:'ytm_line',syncLevel:'plain',timed:[{id:0,text:'YouTube text',start:0,end:0}]},{provider:'lrclib',syncLevel:'plain',plain:'LRCLib text'},{provider:'unison_community',syncLevel:'plain',plain:'Unison text'}]});
  assert.equal(result.plainProvider,'lrclib');assert.equal(result.provider,'lrclib');
  assert.equal(result.route,'plain');assert.equal(result.synced,null);
  assert.equal(result.richsynced,null);assert.equal(result.plain.cacheAllowed,false);
});

test('duration mismatch is rejected for rich candidates and empty payload is stable',()=>{
  const result=parseLiriQoResponse({tracks:[track('netease',{timed:[{text:'Too late',id:0,start:999000,end:1000000,words:[{text:'Too late',start:999000,end:1000000}]}],plain:''})]},{duration:60});
  assert.equal(result.richsynced,null);assert.equal(result.synced,null);
  assert.deepEqual(parseLiriQoResponse(null),{richsynced:null,synced:null,plain:null,provider:null,syncedProvider:null,plainProvider:null,route:null});
});

test('valid raw TTML and decrypted QRC remain compatible',()=>{
  const ttml='<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1s" end="3s"><span begin="1s" end="2s">Hello </span><span begin="2s" end="3s">world</span></p></div></body></tt>';
  const apple=parseLiriQoResponse({tracks:[{provider:'apple_music_liriqo',ttml}]},{duration:5});
  assert(apple.richsynced);assert.equal(apple.route,'ttml');
  const qq=parseLiriQoResponse({tracks:[{provider:'qq_portato',qrc:'[1000,2000]Hello (1000,800)world(1800,1200)'}]},{duration:5});
  assert(qq.richsynced);assert.equal(qq.route,'qrc');
});

test('plain extraction strips enhanced LRC word tags',()=>{
  assert.equal(stripLrcTimestamps('[00:01.00]<00:01.10>Hello <00:02.00>world'),'Hello world');
});
