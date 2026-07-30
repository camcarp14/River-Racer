/* River Racer — the shared UI design system.
   The HUD is not a "game panel": it is Chicago municipal infrastructure — street-sign blades,
   flag stars, bridge-plate typography. Squared corners, 2px rules, condensed all-caps with wide
   tracking, tabular numerals, and nothing italic anywhere.
   Injected as <style id="rr-ui"> at script-eval time so it lands AFTER index.html's <style> in
   document order and therefore wins every specificity tie without needing !important. */
(function () {
  const K = {};

  K.css = `
:root{
  /* Chicago flag, Pantone-accurate */
  --chi-blue:#7EC8E3; --chi-blue-deep:#41B6E6; --chi-blue-ink:#123B4E;
  --chi-red:#EF3340;  --chi-red-dk:#B21F2B;
  /* street furniture */
  --sign-green:#00693E; --sign-green-dk:#044C2E;
  --limestone:#D7CCAE;  --bascule:#7A3428; --gold:#FFC857;
  /* surfaces */
  --ink-900:#04121B; --ink-800:#08202F; --ink-700:#0B2A3C;
  --panel:rgba(6,22,34,.80); --panel-hi:rgba(11,42,60,.90);
  --rule:rgba(126,200,227,.42); --rule-soft:rgba(126,200,227,.18);
  --text:#EAF6FF; --text-dim:#9FC3D6; --text-mute:#6E93A8;
  /* type — web-safe stacks only, nothing downloaded, works from file:// */
  --f-display:"Haettenschweiler","Arial Narrow Bold",Impact,"Franklin Gothic Bold","Arial Black",sans-serif;
  --f-ui:"Arial Narrow","Helvetica Neue",Helvetica,Arial,sans-serif;
  --f-num:"DIN Alternate","Roboto Mono",Consolas,"SF Mono",ui-monospace,monospace;
  /* motion */
  --e-out:cubic-bezier(.16,1,.3,1); --e-pop:cubic-bezier(.2,2.2,.4,1); --e-in:cubic-bezier(.5,0,.75,0);
  --t-micro:120ms; --t-std:220ms; --t-enter:360ms; --t-cel:750ms;
  /* the phone eats its own edges: a notch at one end of a landscape screen, a home indicator
     along the bottom. Zero everywhere else, so every calc() below is a no-op on a desktop. */
  --sat:env(safe-area-inset-top,0px);  --sar:env(safe-area-inset-right,0px);
  --sab:env(safe-area-inset-bottom,0px); --sal:env(safe-area-inset-left,0px);
}

/* the single worst thing about the old UI: italics everywhere */
#hud,#hud *,#menu,#menu *,#loading,#loading *{font-style:normal}

/* the flag star is a HEXAGRAM — outer r 50%, inner r 50/sqrt(3) = 28.87%.
   Never the "u2736" character: it renders differently on every OS. */
.star6{display:inline-block;background:var(--chi-red);
  clip-path:polygon(50% 0%,64.43% 25%,93.30% 25%,78.87% 50%,93.30% 75%,64.43% 75%,
                    50% 100%,35.57% 75%,6.70% 75%,21.13% 50%,6.70% 25%,35.57% 25%)}

/* ---------------------------------------------------------------- HUD shell */
/* Width alone is the wrong question. A 1366x640 laptop window and a 844x390 phone in landscape
   both read as "wide"; what they are short of is HEIGHT, and the HUD hangs off the top and bottom
   edges. The height rules below come last and therefore win when both apply — see SHORT SCREENS
   at the foot of this file for the phone, where the layout changes and not just the type size. */
#hud{font:400 16px/1 var(--f-ui);color:var(--text);letter-spacing:0}
@media (max-width:1440px){#hud{font-size:14px}}
@media (max-width:1180px){#hud{font-size:12.4px}}
@media (max-width:900px){#hud{font-size:10.6px}}
@media (min-height:501px) and (max-height:760px){#hud{font-size:min(14px,2.02vh)}}

/* ------------------------------------------- position plate + lap blade (TL) */
#race-info{position:absolute;left:1.625em;top:1.125em;display:flex;flex-direction:column;gap:.375em;
  background:none;border:0;border-radius:0;padding:0;backdrop-filter:none;align-items:flex-start}
#pos-plate{width:5.5em;height:5.5em;background:var(--panel-hi);border:2px solid var(--chi-blue);
  border-radius:3px;display:flex;align-items:center;justify-content:center;position:relative;
  box-shadow:0 .25em 1.5em rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.06);
  transition:box-shadow 400ms var(--e-out)}
#pos-plate.up{box-shadow:0 0 0 3px var(--gold),0 .25em 1.5em rgba(0,0,0,.55)}
#pos-plate.down{box-shadow:0 0 0 3px var(--chi-red),0 .25em 1.5em rgba(0,0,0,.55)}
#pos-plate::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(126,200,227,.14) 0 6%,transparent 6%)}
#pos-big{font:400 3.9em/.82 var(--f-display);color:#fff;letter-spacing:-.01em;
  text-shadow:0 .05em .2em rgba(0,0,0,.7);display:inline-block}
#pos-suffix{font:400 1.05em/1 var(--f-display);color:var(--chi-blue);align-self:flex-start;
  margin-top:.55em;margin-left:.12em;vertical-align:baseline}
#pos-total{position:absolute;right:.57em;bottom:.40em;margin:0;
  font:700 .70em/1 var(--f-ui);letter-spacing:.14em;color:var(--text-mute)}
@keyframes posflip{0%{transform:translateY(-.35em) scale(1.25);opacity:0}
                   60%{transform:translateY(0) scale(1.06);opacity:1}
                   100%{transform:none}}
#pos-big.flip{animation:posflip 320ms var(--e-out)}
/* the white inset rule is what every Chicago street blade has; without it this is a green box */
#lap-line{background:var(--sign-green);color:#fff;font:700 .82em/1 var(--f-ui);
  letter-spacing:.17em;padding:.55em .9em;border-radius:2px;margin:0;
  box-shadow:inset 0 0 0 2px #fff,0 .18em .8em rgba(0,0,0,.5);text-align:center}

/* --------------------------------------------------- timer, delta, gaps (TC) */
#timer{position:absolute;left:50%;top:1.0em;transform:translateX(-50%);text-align:center;
  background:var(--panel);border:0;border-top:2px solid var(--chi-blue);border-radius:0 0 3px 3px;
  padding:.5em 1.4em .55em;font:400 1em/1 var(--f-ui);letter-spacing:0;backdrop-filter:none}
#timer small{display:block;font:700 .60em/1 var(--f-ui);letter-spacing:.30em;color:var(--chi-blue);margin-bottom:.25em}
#timer-num{font:400 2.1em/1 var(--f-num);font-variant-numeric:tabular-nums;color:#fff;letter-spacing:.01em}
#delta{margin-top:.3em;font:700 .95em/1 var(--f-num);font-variant-numeric:tabular-nums;
  letter-spacing:.04em;opacity:0;transition:opacity var(--t-std) var(--e-out)}
#delta.on{opacity:1} #delta.up{color:#EF3340} #delta.dn{color:#3ED17E}
/* NB: on any element that sets its own font-size, an em offset resolves against THAT size, not
   the HUD's. Every such offset below is pre-divided so it still lands where §4.3's layout says. */
/* The gap row is the one HUD element with no plate behind it, and it sits over open sky at the
   top of the frame. Dim text there is unreadable on the water — it needs its own contrast. */
#gaps{position:absolute;left:50%;top:7.56em;transform:translateX(-50%);display:flex;gap:1.1em;
  font:700 .78em/1 var(--f-ui);letter-spacing:.14em;color:var(--text);opacity:0;
  text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 .7em rgba(0,0,0,.75);
  transition:opacity var(--t-std) var(--e-out);white-space:nowrap}
#gaps.on{opacity:1}
#gaps b{color:#fff;font-family:var(--f-num);font-variant-numeric:tabular-nums;margin-left:.35em}
#gaps .ah::before{content:"\\25B2\\00a0";color:var(--chi-blue)}
#gaps .bh::before{content:"\\25BC\\00a0";color:var(--chi-red)}

/* ------------------------------------------------- speedometer + boost (BR) */
/* The boost meter used to be a 1em-wide stack of cells beside the dial. At 85 MPH over a sunlit
   river that was six pixels of information about the number the whole economy now runs on. It is
   the OUTER RING of the dial instead: same 270 deg sweep as the speed arc, ten countable
   segments, and it lands where the eye already is. */
#speedo{position:absolute;right:1.625em;bottom:1.25em;width:11.5em;height:10.5em;
  background:none;border:0;border-radius:0;padding:0;text-align:right;backdrop-filter:none}
/* the three ring layers are 11.9em and hang .7em past the box, so the dial CENTRE never moves
   and every percentage below still resolves against the same 11.5em x 10.5em it always did */
#spd-arc,#spd-ticks,#spd-boost{position:absolute;right:-.7em;bottom:-.7em;width:11.9em;height:11.9em}
#spd-arc{border-radius:50%;
  background:conic-gradient(from 225deg,
    var(--arc,#7EC8E3) 0turn calc(var(--spd,0)*.75turn),
    rgba(255,255,255,.08) calc(var(--spd,0)*.75turn) .75turn, transparent .75turn);
  -webkit-mask:radial-gradient(circle,transparent 0 4.25em,#000 4.25em 4.75em,transparent 4.75em);
          mask:radial-gradient(circle,transparent 0 4.25em,#000 4.25em 4.75em,transparent 4.75em);
  transition:filter var(--t-micro) linear}
#spd-arc.hot{filter:drop-shadow(0 0 .7em var(--arc))}
/* percentages of #speedo (11.5em x 10.5em) = §4.3's 1.55em / 2.55em, immune to the em trap */
#speed-num{position:absolute;right:13.5%;bottom:24.3%;font:400 4.75em/.85 var(--f-num);
  font-variant-numeric:tabular-nums;color:#fff;letter-spacing:-.02em;text-align:right;
  text-shadow:0 0 1.2em rgba(126,200,227,.55)}
#speed-unit{position:absolute;right:14.8%;bottom:16.2%;font:700 .72em/1 var(--f-ui);
  letter-spacing:.34em;color:var(--chi-blue)}
/* right:5.25em puts the legend's right edge on the dial axis; translateX(50%) centres it there */
#boost-legend{position:absolute;right:5.25em;bottom:.30em;transform:translateX(50%);
  text-align:center;white-space:nowrap}
#boost-label{font:700 .58em/1 var(--f-ui);letter-spacing:.28em;text-indent:.28em;color:var(--chi-blue);
  text-shadow:0 1px 3px rgba(0,0,0,.9)}
/* the full-tank bonus was a secret: above 0.90 the top two segments go gold and this says why */
#prime{margin-bottom:.34em;font:700 .62em/1 var(--f-ui);letter-spacing:.26em;text-indent:.26em;
  color:var(--gold);text-shadow:0 1px 3px rgba(0,0,0,.9);opacity:0;
  transition:opacity var(--t-micro) linear}
#prime.on{opacity:1;animation:primebeat 900ms ease-in-out infinite}
@keyframes primebeat{50%{text-shadow:0 0 .9em rgba(255,200,87,.95),0 1px 3px rgba(0,0,0,.9)}}

/* ========================================================== THE ITEM SLOT ====*/
/* Items are the answer to "so it's not just whoever gets out first", so what you are holding has
   to be readable at eighty miles an hour in the corner of the eye — the same lesson the boost
   meter taught when it was a six-pixel hairline.
   The old slot was a flat square with a glyph in it, and it failed three ways at once: an empty
   one and a full one looked identical, nothing showed the spin stopping, and it never said which
   key fires the thing it was holding. This is a SOCKET instead — header rail, recessed well with
   corner brackets, key rail across the foot — and the three states differ in frame colour, well
   glow, icon and words simultaneously, so peripheral vision gets four chances to read it.
   Same municipal parts as everything else: squared corners, 2 px rules, a street blade under it. */
#item-slot{position:absolute;left:50%;bottom:1.0em;transform:translateX(-50%);text-align:center;
  white-space:nowrap;opacity:0;transition:opacity var(--t-std) var(--e-out);
  --item:#7EC8E3;--edge:rgba(159,195,214,.28)}
#item-slot.on{opacity:1}
/* the brackets take the item's own colour the moment there is an item; empty they are grey wire */
#item-slot.held,#item-slot.roll{--edge:var(--item)}

#item-box{position:relative;width:7.2em;height:8.2em;margin:0 auto;border-radius:3px;
  background:linear-gradient(180deg,rgba(14,50,70,.94),rgba(4,18,27,.94));
  box-shadow:inset 0 0 0 2px var(--rule-soft),inset 0 1px 0 rgba(255,255,255,.13),
    0 .3em 1.5em rgba(0,0,0,.62);
  transition:box-shadow var(--t-std) var(--e-out)}
#item-slot.held #item-box{box-shadow:inset 0 0 0 2px var(--item),inset 0 1px 0 rgba(255,255,255,.16),
  0 .3em 1.5em rgba(0,0,0,.62),0 0 1.5em -.25em var(--item)}

/* Rail heights are percentages of the BOX, never ems: both rails set their own font-size, and an
   em height on those would resolve against that instead. Same trap the timer offsets document. */
#item-head{position:absolute;left:0;right:0;top:0;height:16.5%;display:flex;align-items:center;
  justify-content:center;border-radius:3px 3px 0 0;background:rgba(126,200,227,.13);
  box-shadow:inset 0 -1px 0 var(--rule-soft);
  font:700 .56em/1 var(--f-ui);letter-spacing:.36em;text-indent:.36em;color:var(--chi-blue)}
#item-well{position:absolute;left:5.3%;right:5.3%;top:18.4%;bottom:22.6%;overflow:hidden;
  border-radius:2px;box-shadow:inset 0 .14em .5em rgba(0,0,0,.78),inset 0 0 0 1px rgba(255,255,255,.05);
  background:radial-gradient(ellipse at 50% 34%,rgba(126,200,227,.06),rgba(2,10,16,.55) 72%)}
/* four corner brackets, drawn as eight one-shot gradients so the well reads as something that
   HOLDS a thing rather than a swatch of dark paint */
#item-well::before,#item-well::after{content:"";position:absolute;inset:.2em;pointer-events:none}
#item-well::before{background:
  linear-gradient(var(--edge),var(--edge)) 0 0/.62em 2px no-repeat,
  linear-gradient(var(--edge),var(--edge)) 0 0/2px .62em no-repeat,
  linear-gradient(var(--edge),var(--edge)) 100% 0/.62em 2px no-repeat,
  linear-gradient(var(--edge),var(--edge)) 100% 0/2px .62em no-repeat}
#item-well::after{background:
  linear-gradient(var(--edge),var(--edge)) 0 100%/.62em 2px no-repeat,
  linear-gradient(var(--edge),var(--edge)) 0 100%/2px .62em no-repeat,
  linear-gradient(var(--edge),var(--edge)) 100% 100%/.62em 2px no-repeat,
  linear-gradient(var(--edge),var(--edge)) 100% 100%/2px .62em no-repeat}
#item-glow{position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(circle at 50% 50%,var(--item),transparent 64%);
  transition:opacity var(--t-std) var(--e-out)}
#item-slot.held #item-glow{opacity:.24}
#item-slot.roll #item-glow{opacity:.15}
#item-icon{position:absolute;left:50%;top:50%;height:84%;width:auto;transform:translate(-50%,-50%)}
#item-slot.empty #item-icon{opacity:.62}
#item-ring{position:absolute;left:50%;top:50%;width:3.4em;height:3.4em;border-radius:50%;
  border:3px solid var(--item);pointer-events:none;opacity:0;
  transform:translate(-50%,-50%) scale(.25)}

/* the foot rail is where the fire key lives, because "how do I use this" is a question about the
   thing in the box and the answer belongs ON the box */
#item-foot{position:absolute;left:0;right:0;bottom:0;height:20.7%;display:flex;align-items:center;
  justify-content:center;gap:.5em;border-radius:0 0 3px 3px;background:rgba(0,0,0,.34);
  box-shadow:inset 0 1px 0 var(--rule-soft);
  font:700 .60em/1 var(--f-ui);letter-spacing:.26em;text-indent:.26em;color:var(--text-mute)}
#item-slot.held #item-foot{background:rgba(255,200,87,.10);color:var(--gold)}
#item-slot.roll #item-foot::after{content:"\\2022 \\2022 \\2022";letter-spacing:.14em;color:var(--chi-blue)}
#item-key{display:none;padding:.30em .48em;border-radius:2px;background:var(--gold);
  color:var(--ink-900);font:700 1em/1 var(--f-ui);letter-spacing:.06em;text-indent:0}
#item-slot.held #item-key{display:inline-block;animation:itemkey 1.05s ease-in-out infinite}
@keyframes itemkey{50%{box-shadow:0 0 .85em rgba(255,200,87,.95)}}

/* the spin: 0.85 s of a slot machine. The plate strobes, and the icon SCROLLS through the well
   with the faces changing under it — a face swap on a stationary icon reads as a glitch. */
#item-slot.roll #item-box{animation:itemroll 150ms steps(1) infinite}
@keyframes itemroll{
  0%{box-shadow:inset 0 0 0 2px var(--gold),inset 0 1px 0 rgba(255,255,255,.16),0 0 1.4em rgba(255,200,87,.55)}
  50%{box-shadow:inset 0 0 0 2px #fff,inset 0 1px 0 rgba(255,255,255,.16),0 0 1.7em rgba(255,255,255,.5)}}
#item-slot.roll #item-icon{animation:itemreel 143ms linear infinite}
@keyframes itemreel{0%{transform:translate(-50%,-80%);opacity:.5}
                    55%{transform:translate(-50%,-50%);opacity:1}
                    100%{transform:translate(-50%,-28%);opacity:.5}}
/* the LOCK — the one moment a pickup is allowed to be loud */
#item-slot.lock #item-box{animation:itemlock 620ms var(--e-out)}
@keyframes itemlock{0%{transform:scale(1.14)}42%{transform:scale(.98)}100%{transform:scale(1)}}
#item-slot.lock #item-ring{animation:itemring 520ms var(--e-out)}
@keyframes itemring{0%{transform:translate(-50%,-50%) scale(.25);opacity:1}
                    100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}
#item-slot.lock #item-name{animation:bladepop 420ms var(--e-pop)}
@keyframes bladepop{0%{transform:scale(.8)}60%{transform:scale(1.05)}100%{transform:scale(1)}}
/* and the FIRE — the well blows out white, so an emptied slot is an event and not an absence */
#item-slot.fired #item-glow{animation:itemfire 340ms var(--e-out)}
@keyframes itemfire{0%{opacity:.85}100%{opacity:0}}

/* the name rides a street blade — the same green, and the same white inset rule, as every
   Chicago corner sign and as the lap line in the opposite corner. box-sizing + min-width keeps a
   one-word item ("TURBO") exactly as wide as the socket above it instead of shrink-wrapping. */
#item-name{margin-top:.55em;display:inline-block;box-sizing:border-box;min-width:9.72em;
  padding:.42em .82em;border-radius:2px;
  font:700 .74em/1 var(--f-ui);letter-spacing:.18em;text-indent:.18em;color:#fff;
  background:var(--sign-green);box-shadow:inset 0 0 0 2px #fff,0 .18em .8em rgba(0,0,0,.5);
  transition:background var(--t-micro) linear,color var(--t-micro) linear}
#item-slot.empty #item-name{background:var(--panel-hi);color:var(--text-dim);
  box-shadow:inset 0 0 0 2px var(--rule-soft),0 .18em .8em rgba(0,0,0,.5)}
#item-slot.roll #item-name{background:var(--ink-700);color:var(--gold);
  box-shadow:inset 0 0 0 2px var(--gold),0 .18em .8em rgba(0,0,0,.5)}
/* one plain line of what the thing does, for the first few seconds after it locks — long enough
   to read once, gone before it becomes furniture. It sits over open water, so it carries its own
   plate: dim text on a sunlit river is not text. :empty drops the plate rather than leaving a
   grey tab hanging under the blade with nothing in it. */
/* display:table, not inline-block: #item-name is inline-block and #item-slot is nowrap, so an
   inline-block sub line lands on the SAME LINE as the blade. table shrink-wraps like inline-block
   but is block-level, and margin:auto centres it. */
#item-sub{display:table;margin:.45em auto 0;min-height:1.25em;padding:.3em .7em;border-radius:2px;
  background:var(--panel-hi);box-shadow:inset 0 0 0 1px var(--rule-soft);
  font:700 .62em/1.25 var(--f-ui);letter-spacing:.14em;color:var(--text);
  text-shadow:0 1px 3px rgba(0,0,0,.9)}
#item-sub:empty{background:none;box-shadow:none;padding:.3em 0}
/* what is running on you right now, and how much of it is left */
#item-pips{display:flex;justify-content:center;gap:.3em;margin-top:.38em;min-height:1.35em}
.pip{display:none;padding:.32em .5em .28em;border-radius:2px;background:var(--panel-hi);
  box-shadow:inset 0 0 0 1px currentColor;font:700 .58em/1 var(--f-ui);letter-spacing:.14em}
.pip.on{display:block}
.pip i{display:block;height:2px;margin-top:.36em;background:currentColor;width:100%}
.pip[data-k=turbo]{color:#25FF7A}          .pip[data-k=shield]{color:var(--chi-blue)}
.pip[data-k=heavy]{color:#FFB03A}          .pip[data-k=spin]{color:var(--chi-red)}
.pip[data-k=blind]{color:#2ECC71}          .pip[data-k=gulls]{color:#F2F6F8}
@media (prefers-reduced-motion:reduce){
  #item-slot.roll #item-box,#item-slot.roll #item-icon,#item-slot.held #item-key,
  #item-slot.lock #item-box,#item-slot.lock #item-ring,#item-slot.lock #item-name{animation:none}}

/* -------------------------------------------------- the incoming-torpedo call */
/* The torpedo runs up the river from astern, where the player has nothing to look at, and it is
   the one item that reaches the leader from last place. This is the only warning there is, and it
   counts down — which turns "should I spend the shield" into a decision with a clock on it.
   The offsets are pre-divided by this element's own .74em type, per the em trap noted above. */
#incoming{position:absolute;right:2.196em;bottom:23.51em;display:flex;align-items:center;gap:.6em;
  padding:.5em .85em;border-radius:2px;background:var(--chi-red);color:#fff;pointer-events:none;
  font:700 .74em/1 var(--f-ui);letter-spacing:.18em;white-space:nowrap;
  box-shadow:inset 0 0 0 2px #fff,0 .25em 1.2em rgba(239,51,64,.5);
  opacity:0;transform:translateX(1.2em);
  transition:opacity var(--t-std) var(--e-out),transform var(--t-std) var(--e-out)}
#incoming.on{opacity:1;transform:none}
#incoming .star6{width:.8em;height:.8em;background:currentColor;flex:0 0 auto}
#incoming b{font-family:var(--f-num);font-variant-numeric:tabular-nums;letter-spacing:.02em}
#incoming b::after{content:"s"}
#incoming.near{animation:incbeat .38s steps(1) infinite}
@keyframes incbeat{50%{background:#fff;color:var(--chi-red);
  box-shadow:inset 0 0 0 2px var(--chi-red),0 .25em 1.2em rgba(239,51,64,.5)}}
@media (prefers-reduced-motion:reduce){#incoming.near{animation:none}}

/* The callout. Three registers, because the player is asking three different questions: gold =
   you did that, flag red = that was done to you, flag blue = the shield ate it. Solid plate and
   ink text, never coloured text on the water — that is unreadable over sunlit limestone. */
/* 7.2em of THIS element's 2.05em type = 14.76em of the HUD's, which clears the taller socket
   below it. The em trap again: an offset on an element that sets its own font-size resolves
   against that. Slot stack, in HUD ems: 1.0 bottom + 1.73 pips + 1.06 sub + 1.85 blade + 8.2 box
   = 13.84, so the plate sits just under an em clear of the top of the socket. */
#item-call{position:absolute;left:50%;bottom:7.2em;transform:translateX(-50%);opacity:0;
  padding:.2em .64em;border-radius:2px;white-space:nowrap;
  max-width:44vw;overflow:hidden;text-overflow:ellipsis;
  font:400 2.05em/1 var(--f-display);letter-spacing:.05em;
  color:var(--ink-900);background:var(--gold);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.85),0 .3em 1.6em rgba(0,0,0,.55)}
/* .on IS the visible state — a plain class, no keyframe. A composited animation only advances on
   frames that land, and this plate has to survive the one stalled frame it is most needed on.
   The keyframe below is the pop and nothing else, and its forwards fill means a dropped one costs
   nothing. hud.js retires the plate on wall-clock timers, never on the sim clock. */
#item-call.on{opacity:1;animation:itempop 240ms var(--e-pop) forwards}
#item-call.hit{color:#fff;background:var(--chi-red)}
#item-call.save{background:var(--chi-blue)}
#item-call.out{opacity:0;transition:opacity 250ms var(--e-out)}
@keyframes itempop{0%{transform:translateX(-50%) scale(.72)}
  62%{transform:translateX(-50%) scale(1.06)}
  100%{transform:translateX(-50%) scale(1)}}

/* ------------------------------------------------------------- status chips */
#chips{position:absolute;right:1.625em;bottom:12.2em;display:flex;flex-direction:column;
  align-items:flex-end;gap:.3em}
.chip{font:700 .72em/1 var(--f-ui);letter-spacing:.2em;padding:.42em .8em;border-radius:2px;
  background:var(--panel-hi);border-left:3px solid currentColor;white-space:nowrap;
  animation:chipin 220ms var(--e-out) both}
@keyframes chipin{from{opacity:0;transform:translateX(1.2em)}to{opacity:1;transform:none}}
.chip.draft{color:var(--chi-blue)} .chip.drift{color:var(--gold)}
.chip.near{color:#3ED17E}          .chip.reset,.chip.bad{color:var(--chi-red)}
.chip.gold,.chip.item{color:var(--gold)}

/* ---------------------------------------------------------------- countdown */
#countdown{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);display:none;
  text-align:center;font:400 1em/1 var(--f-ui);color:#fff;text-shadow:none}
#countdown.on{display:block}
#cd-star{position:absolute;left:50%;top:50%;width:11em;height:11em;margin:-5.5em 0 0 -5.5em;
  background:var(--chi-red);opacity:.30;
  clip-path:polygon(50% 0%,64.43% 25%,93.30% 25%,78.87% 50%,93.30% 75%,64.43% 75%,
                    50% 100%,35.57% 75%,6.70% 75%,21.13% 50%,6.70% 25%,35.57% 25%);
  animation:cdstar 1s linear both}
@keyframes cdstar{from{transform:scale(1.9) rotate(-24deg);opacity:.42}
                  to{transform:scale(.72) rotate(0);opacity:0}}
#cd-num{position:relative;display:block;font:400 11.25em/1 var(--f-display);color:#fff;letter-spacing:-.02em;
  text-shadow:0 0 1.6em rgba(126,200,227,.9),0 .35em 0 rgba(0,0,0,.35);
  animation:cdnum 1s var(--e-out) both}
@keyframes cdnum{0%{transform:scale(1.55);opacity:0}18%{transform:scale(1);opacity:1}
                 82%{transform:scale(1);opacity:1}100%{transform:scale(.92);opacity:0}}
#cd-num.go{color:var(--chi-blue);font-size:8.75em;letter-spacing:.02em;animation:cdgo 900ms var(--e-pop) both}
@keyframes cdgo{0%{transform:scale(.3);opacity:0}45%{transform:scale(1.22);opacity:1}100%{transform:scale(1);opacity:1}}
/* the four stars of the flag, scattering to the corners on GO */
#cd-scatter{position:absolute;inset:0;pointer-events:none;z-index:11}
#cd-scatter .star6{position:absolute;left:50%;top:44%;width:2.6em;height:2.6em;margin:-1.3em 0 0 -1.3em;
  animation:cdfly 700ms var(--e-out) both}
@keyframes cdfly{from{transform:translate(0,0) rotate(0);opacity:1}
                 to{transform:translate(var(--dx),var(--dy)) rotate(180deg);opacity:0}}

/* ------------------------------------------------- landmark callout (blade) */
#landmark-tag{position:absolute;left:1.625em;bottom:7.5em;top:auto;right:auto;max-width:26em;padding:0;
  background:none;border:0;border-radius:0;opacity:0;color:inherit;letter-spacing:0;font-weight:400;
  transform:translateX(-1.5em);
  transition:opacity var(--t-std) var(--e-out),transform var(--t-enter) var(--e-out)}
#landmark-tag.on{opacity:1;transform:none}
#lt-blade{background:var(--sign-green);box-shadow:inset 0 0 0 2px #fff,0 .2em .9em rgba(0,0,0,.55);
  padding:.5em .95em;display:flex;align-items:center;gap:.55em;border-radius:2px}
#lt-blade .star6{width:.85em;height:.85em;background:#fff;flex:0 0 auto}
#lt-name{font:400 1.35em/1 var(--f-display);color:#fff;letter-spacing:.03em}
#lt-sub{margin-top:.28em;padding:.4em .95em;background:var(--panel-hi);border-left:3px solid var(--chi-blue);
  font:700 .70em/1.35 var(--f-ui);letter-spacing:.14em;color:var(--text-dim);border-radius:0 2px 2px 0}
#lt-sub.off{display:none}
/* Architecture Tour: the docent panel, where the long-form river-cruise lines live */
#docent{position:absolute;left:2.08em;bottom:1.60em;max-width:30em;padding:.9em 1.1em;
  background:var(--panel-hi);border-left:3px solid var(--gold);border-radius:0 2px 2px 0;
  font:700 .78em/1.6 var(--f-ui);letter-spacing:.10em;color:var(--text-dim);
  opacity:0;transition:opacity var(--t-std) var(--e-out);display:none}
#docent.on{display:block;opacity:1}
#docent h4{font:400 1.5em/1.1 var(--f-display);letter-spacing:.03em;color:#fff;margin-bottom:.4em}

/* ------------------------------------------------- rival ticker (bottom-left) */
#ticker{position:absolute;left:1.625em;bottom:1.25em;display:flex;flex-direction:column;gap:.22em;
  opacity:0;transition:opacity var(--t-std) var(--e-out)}
#ticker.on{opacity:1}
.tick-row{display:flex;align-items:center;gap:.6em;background:var(--panel);padding:.35em .7em;
  border-left:3px solid var(--rule-soft);border-radius:0 2px 2px 0;
  font:700 .74em/1 var(--f-ui);letter-spacing:.12em;color:var(--text-dim);min-width:11em}
.tick-row.ahead{border-left-color:var(--chi-blue)}
.tick-row.behind{border-left-color:var(--chi-red)}
.tick-row .g{margin-left:auto;font-family:var(--f-num);font-variant-numeric:tabular-nums;color:#fff}
.tick-row.close{animation:tickpulse 600ms ease-in-out 2}
@keyframes tickpulse{50%{background:rgba(239,51,64,.22)}}

/* -------------------------------------- checkpoint flash, wrong way, placement */
#checkpoint-flash{position:absolute;left:50%;top:21%;transform:translateX(-50%);
  font:400 1.9em/1 var(--f-display);letter-spacing:.06em;color:var(--gold);
  text-shadow:0 0 1.4em rgba(255,200,87,.85);opacity:0;transition:opacity var(--t-std);white-space:nowrap}
#wrongway{position:absolute;left:50%;top:31%;transform:translateX(-50%);display:none;
  font:400 2.75em/1 var(--f-display);letter-spacing:.04em;color:#fff;
  background:var(--chi-red);padding:.18em .6em;border-radius:2px;text-shadow:none;
  box-shadow:inset 0 0 0 3px #fff,0 .3em 1.6em rgba(0,0,0,.6);animation:blink .5s steps(1) infinite}
#placement-big{font:400 10.6em/1 var(--f-display);letter-spacing:.01em;
  text-shadow:0 .3em 2em rgba(0,0,0,.7);animation:placepop var(--t-cel) var(--e-pop) both}
#placement-sub{font:700 1.3em/1 var(--f-ui);letter-spacing:.5em;color:var(--chi-blue);
  text-shadow:0 .18em 1em rgba(0,0,0,.6);animation:placesub 500ms var(--e-out) 350ms both}
#placement .stars{display:flex;gap:.9em;margin-top:1.1em;letter-spacing:0;font-size:1em;color:inherit;text-shadow:none}
#placement .stars .star6{width:1.4em;height:1.4em;animation:starpop 520ms var(--e-pop) both}
@keyframes starpop{from{transform:scale(0) rotate(-90deg);opacity:0}to{transform:none;opacity:1}}

/* -------------------------------------------------------------- the minimap */
#minimap{position:absolute;right:1.625em;top:1.125em;width:13.5em;height:18em;background:var(--panel);
  border:2px solid var(--rule);border-radius:0;
  clip-path:polygon(0 0,calc(100% - .75em) 0,100% .75em,100% 100%,.75em 100%,0 calc(100% - .75em));
  box-shadow:0 .3em 1.6em rgba(0,0,0,.5)}

/* --------------------------------------------------- keyboard legend (fades) */
#boost-hint{position:absolute;left:2.39em;bottom:1.84em;font:700 .68em/1.9 var(--f-ui);
  letter-spacing:.10em;color:var(--text-dim);background:var(--panel);border-radius:2px;
  padding:.6em .9em;border:0;box-shadow:inset 0 0 0 2px var(--rule-soft);
  transition:opacity 900ms var(--e-out)}
#boost-hint b{color:#fff}
#boost-hint b.key{color:var(--gold);letter-spacing:.18em}
#boost-hint.gone{opacity:0}

/* ------------------------------------------------ cinematic / photo overlay */
#cine{position:fixed;inset:0;pointer-events:none;z-index:9;opacity:0;
  font:400 16px/1 var(--f-ui);transition:opacity 320ms var(--e-out)}
#cine.on{opacity:1}
#cine .bar{position:absolute;left:0;right:0;height:11.5vh;background:#000}
#cine .bar.t{top:0} #cine .bar.b{bottom:0}
#cine .meta{position:absolute;left:2.75em;bottom:calc(11.5vh + 1.75em);font:400 0.8em/1 var(--f-ui);
  letter-spacing:.22em;color:var(--chi-blue)}
#cine .rec{position:absolute;right:2.75em;top:calc(11.5vh + 1.75em);font:700 0.8em/1 var(--f-ui);
  letter-spacing:.2em;color:var(--chi-red)}
#cine .rec::before{content:"";display:inline-block;width:.6em;height:.6em;border-radius:50%;
  background:var(--chi-red);margin-right:.5em;vertical-align:middle;animation:recblink 1.6s steps(1) infinite}
@keyframes recblink{50%{opacity:.15}}

/* ============================================================ MENUS =========*/
#menu{font-family:var(--f-ui);color:var(--text)}
/* the two light-blue bars at the flag's TRUE proportions — the flag is a map of this course */
/* z-index:-1 keeps the pseudo-element BEHIND #menu's in-flow children. Without it an absolutely
   positioned ::before paints above them and the blur eats the menu's own text. */
/* Layer one darkens the top and bottom of the flythrough: the star captions and the key line
   land over a sunlit skyline and an orange jump ramp, and neither survived at full brightness. */
#menu.title-screen::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;
  background:linear-gradient(180deg,rgba(4,18,27,.66) 0,rgba(4,18,27,.24) 24%,rgba(4,18,27,0) 44%,
      rgba(4,18,27,0) 60%,rgba(4,18,27,.34) 80%,rgba(4,18,27,.66) 100%),
    linear-gradient(180deg,transparent 0 16.6%,rgba(126,200,227,.13) 16.6% 33.3%,
    transparent 33.3% 66.6%,rgba(126,200,227,.13) 66.6% 83.3%,transparent 83.3%)}
#menu.title-screen{padding:1.5vh 0}
/* The list grows and shrinks with what the save file has unlocked, and the whole screen has to
   survive a 1280x720 window at its longest, so the title scales off the SHORT axis too. */
#menu.title-screen{font-size:clamp(10.5px,min(1.05vw,1.82vh),16px)}
#menu.title-screen #title{font:400 clamp(40px,min(7.2vw,10.2vh),104px)/.90 var(--f-display)}
#menu.title-screen .stars{margin-bottom:1.0vh}
#menu.title-screen .menu-list{margin-top:1.5vh;gap:.42em}
#menu.title-screen .menu-item{padding:.62em 2em}
#menu.title-screen .sound-row,#menu.title-screen #switches{margin-top:1.0em}
#menu.title-screen .menu-note{margin-top:1.0em}
#title{font:400 clamp(44px,7.2vw,104px)/.90 var(--f-display);letter-spacing:.005em;
  text-align:center;color:#fff;background:none;-webkit-background-clip:border-box;background-clip:border-box;
  filter:none;text-shadow:0 .045em 0 var(--chi-blue-ink),0 .09em .3em rgba(0,0,0,.6)}
#title em{color:var(--chi-blue)}
#subtitle{font:700 clamp(11px,1.35vw,17px)/1 var(--f-ui);letter-spacing:.62em;color:var(--gold);
  margin-top:.7em;text-indent:.62em;text-shadow:0 2px 8px rgba(0,0,0,.7)}
/* star + its caption in one column, so the caption really does sit under its own star */
.stars{display:flex;gap:2.6vw;justify-content:center;align-items:flex-start;margin-bottom:1.2vh;
  letter-spacing:0;color:inherit;font-size:inherit;text-shadow:none}
/* wide enough for GREAT FIRE 1871 / FORT DEARBORN on one line at the new caption size */
.starcol{display:flex;flex-direction:column;align-items:center;gap:.75em;width:clamp(86px,9.4vw,140px)}
.starcol .star6{width:clamp(18px,2.0vw,28px);height:clamp(18px,2.0vw,28px);
  animation:starbeat 3.2s ease-in-out infinite}
.starcol:nth-child(2) .star6{animation-delay:.12s} .starcol:nth-child(3) .star6{animation-delay:.24s}
.starcol:nth-child(4) .star6{animation-delay:.36s}
/* 9px fixed was sub-legible at any resolution, and translucent red over a sunlit skyline read as
   noise. Solid flag red on a hard shadow, sized like the rest of the kit. */
.starcol span{font:700 clamp(10px,.88vw,14px)/1.25 var(--f-ui);letter-spacing:.12em;color:var(--chi-red);
  text-align:center;text-shadow:0 1px 2px #000,0 0 .6em rgba(0,0,0,.95)}
@keyframes starbeat{0%,100%{transform:scale(1);filter:none}
  50%{transform:scale(1.09);filter:drop-shadow(0 0 .5em rgba(239,51,64,.75))}}

/* max-content, so a long label ("CHAMPIONSHIP · ROUND 2/4") widens the plate instead of
   overflowing it — every item in a list stays the same width as the longest */
.menu-list{margin-top:2.2vh;gap:.5em;min-width:21em;width:max-content;max-width:92vw}
.menu-item{white-space:nowrap;font:700 1.05em/1 var(--f-ui);letter-spacing:.24em;padding:.76em 2em;border-radius:2px;
  background:var(--panel);border:0;box-shadow:inset 0 0 0 2px var(--rule-soft);
  color:var(--text);transition:all var(--t-micro) var(--e-out);text-align:center;cursor:pointer}
/* .sel is the state; :hover only ECHOES it, and only on a pointer that can hover. A touch screen
   fires a phantom hover that then sticks to whatever was tapped last. */
.menu-item.sel{background:var(--sign-green);color:#fff;
  box-shadow:inset 0 0 0 2px #fff,0 .3em 1.2em rgba(0,105,62,.4);transform:translateX(.4em)}
@media (hover:hover){.menu-item:hover{background:var(--sign-green);color:#fff;
  box-shadow:inset 0 0 0 2px #fff,0 .3em 1.2em rgba(0,105,62,.4);transform:translateX(.4em)}}
.menu-item.sel::before{content:"";display:inline-block;width:.62em;height:.62em;margin-right:.9em;
  vertical-align:-.02em;background:var(--chi-red);
  clip-path:polygon(50% 0%,64.43% 25%,93.30% 25%,78.87% 50%,93.30% 75%,64.43% 75%,
                    50% 100%,35.57% 75%,6.70% 75%,21.13% 50%,6.70% 25%,35.57% 25%)}
.menu-item.dim{opacity:.45}
.menu-note{margin-top:1.4em;font:700 .74em/1.85 var(--f-ui);letter-spacing:.14em;color:var(--text-dim);
  text-shadow:0 1px 4px rgba(0,0,0,.9)}
.menu-note b{color:var(--text)}
/* HOW TO PLAY is the one screen that is mostly words, so it carries its own measure and type size.
   These were inline styles until the key table had to be able to disappear on a touchscreen — and
   an inline display: beats any stylesheet rule that would hide it. */
.help-note{font:700 13px/1.5 var(--f-ui);max-width:760px;margin-top:10px}
.help-grid{display:grid;grid-template-columns:max-content 1fr max-content 1fr;gap:.30em 1.1em;text-align:left}
.help-row{margin-top:.85em;text-wrap:balance}

#select-title{font:400 2.3em/1 var(--f-display);letter-spacing:.03em;color:#fff;
  text-shadow:0 .1em .5em rgba(0,0,0,.8);margin-bottom:.2em}
#select-sub{font:700 .78em/1 var(--f-ui);letter-spacing:.28em;color:var(--chi-blue);
  background:var(--panel);padding:.45em 1.1em;border-radius:2px;margin-bottom:1.6em;
  box-shadow:inset 0 0 0 2px var(--rule-soft)}

.card{width:14.7em;background:var(--panel);border:0;border-radius:2px;padding:.9em;
  box-shadow:inset 0 0 0 2px var(--rule-soft);transition:all var(--t-std) var(--e-out)}
.card.sel{box-shadow:inset 0 0 0 2px var(--gold),inset .28em 0 0 var(--gold),0 .5em 1.6em rgba(0,0,0,.5);
  transform:translateY(-.4em)}
.card h3{font:400 1.15em/1.1 var(--f-display);letter-spacing:.02em;color:#fff}
.card .tag{font:700 .62em/1 var(--f-ui);letter-spacing:.24em;color:var(--gold)}
.card canvas{border-radius:2px}
.card .desc{font:400 .72em/1.55 var(--f-ui);letter-spacing:.02em;color:var(--text-dim)}
#ride-panel{background:var(--panel);border:0;border-radius:2px;box-shadow:inset 0 0 0 2px var(--rule-soft);
  width:20.5em}
#ride-panel h3{font:400 1.7em/1 var(--f-display);letter-spacing:.03em;color:#fff;margin:.2em 0 .5em}
#ride-panel .desc{min-height:0;font:400 .74em/1.55 var(--f-ui);letter-spacing:.02em;color:var(--text-dim);margin-bottom:.3em}
#radar{display:block;margin:.2em auto .4em;width:16.25em;height:16.25em}
#spec-sheet{display:grid;grid-template-columns:auto 1fr;gap:.18em .8em;
  font:400 .72em/1.5 var(--f-num);font-variant-numeric:tabular-nums;margin-top:.5em}
#spec-sheet .k{color:var(--text-mute);letter-spacing:.1em}
#spec-sheet .v{color:var(--text)}
#livery{display:flex;gap:.45em;margin-top:.9em}
#livery i{width:1.4em;height:1.4em;border-radius:2px;cursor:pointer;pointer-events:auto;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.12);transition:all var(--t-micro) var(--e-out)}
#livery i.sel{box-shadow:inset 0 0 0 2px #fff,0 0 .8em rgba(255,255,255,.35);transform:translateY(-.15em)}

/* --------------------------------------------------------------- results ---*/
/* the hull column was 7em against a two-word hull name, so every row wrapped to two lines and the
   card ran off a 720-high window the moment the banked strip arrived */
#results-list{min-width:47em;border-top:2px solid var(--chi-blue);margin-top:.8em}
.result-head,.result-row{display:grid;grid-template-columns:3.2em 1fr 9.6em 5.4em 5em;
  align-items:center;gap:.8em;padding:.55em 1em}
.result-head.cup,.result-row.cup{grid-template-columns:3.2em 1fr 9.6em 5.4em 5em 3.4em}
.result-head{font:700 .66em/1 var(--f-ui);letter-spacing:.24em;color:var(--chi-blue);
  border-bottom:1px solid var(--rule-soft)}
.result-row{background:var(--panel);border:0;border-bottom:1px solid rgba(255,255,255,.05);
  border-radius:0;margin:0;font:700 .95em/1 var(--f-ui);letter-spacing:.08em;color:var(--text-dim);
  animation:rowin 320ms var(--e-out) both}
.result-row:nth-child(2){animation-delay:60ms} .result-row:nth-child(3){animation-delay:120ms}
.result-row:nth-child(4){animation-delay:180ms} .result-row:nth-child(5){animation-delay:240ms}
.result-row:nth-child(6){animation-delay:300ms} .result-row:nth-child(7){animation-delay:360ms}
@keyframes rowin{from{opacity:0;transform:translateX(-1.2em)}to{opacity:1;transform:none}}
.result-row .p{font:400 1.5em/1 var(--f-display);color:#fff;text-align:right}
.result-row .h{font-size:.86em;letter-spacing:.06em;color:var(--text-mute);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.result-row .t,.result-row .gap,.result-row .pts{font-family:var(--f-num);font-variant-numeric:tabular-nums;color:#fff}
.result-row .gap{color:var(--text-mute)}
.result-row.you{background:rgba(255,200,87,.10);box-shadow:inset .28em 0 0 var(--gold);color:#fff;font-weight:700}
.result-row.p1 .p{color:var(--gold)} .result-row.p2 .p{color:#DDE3E8} .result-row.p3 .p{color:#C97B3C}
/* The medal strip. A results screen that cannot say what changed means the run changed nothing —
   and with the salute retired, the medal is what a run moves. It draws only when there is one. */
#medal-strip{margin:.8em 0 .1em;display:flex;justify-content:center;align-items:center;gap:.9em;
  padding:.66em 1.6em;background:var(--panel-hi);border-radius:2px;
  box-shadow:inset 0 0 0 2px var(--rule-soft);font:700 .80em/1 var(--f-ui);letter-spacing:.20em;
  color:var(--text-mute);animation:rowin 380ms var(--e-out) both}
#medal-strip .star6{width:.85em;height:.85em;background:var(--gold);flex:0 0 auto}
#medal-strip u{text-decoration:none;color:var(--gold)}
#medal-strip s{text-decoration:none;color:var(--text-dim)}
#medal-strip .up{color:var(--gold)}
#record-banner{margin:.9em 0;padding:.7em 1.4em;background:var(--gold);color:var(--ink-900);
  font:700 .95em/1 var(--f-ui);letter-spacing:.28em;text-align:center;border-radius:2px;
  animation:recordin 620ms var(--e-pop) both}
@keyframes recordin{from{transform:scale(.6) rotate(-3deg);opacity:0}to{transform:none;opacity:1}}

/* ------------------------------------------------------ THE CHICAGO CUP ----*/
/* A championship is a SEASON TABLE, not a leaderboard: one column per round, so the whole story —
   who won what, who is climbing, what is still to play for — reads in one glance. Sized off both
   viewport axes so the four-round board never runs off the bottom of a 1280x720 window. */
/* Every post-race screen sits over a still-rendering city, and light stonework behind 8pt tracking
   is unreadable. One blurred scrim buys back the whole contrast budget. */
#menu.scrim::before{content:"";position:absolute;inset:0;z-index:-1;
  backdrop-filter:blur(7px) saturate(.6);
  background:linear-gradient(180deg,rgba(4,18,27,.86),rgba(4,18,27,.66) 42%,rgba(4,18,27,.88))}
#cup-board{width:min(75em,95vw);display:flex;flex-direction:column;gap:.85em;
  font:400 clamp(11px,min(1.02vw,1.80vh),16px)/1 var(--f-ui)}
.cup-head{text-align:center}
.cup-crest{display:flex;justify-content:center;gap:1.05em;margin-bottom:.5em}
.cup-crest .star6{width:.7em;height:.7em;animation:starbeat 3.2s ease-in-out infinite}
.cup-crest .star6:nth-child(2){animation-delay:.12s}
.cup-crest .star6:nth-child(3){animation-delay:.24s}
.cup-crest .star6:nth-child(4){animation-delay:.36s}
.cup-title{font:400 3.1em/.92 var(--f-display);letter-spacing:.035em;color:#fff;
  text-shadow:0 .045em 0 var(--chi-blue-ink),0 .09em .3em rgba(0,0,0,.65)}
.cup-kicker{margin-top:.85em;font:700 .8em/1.5 var(--f-ui);letter-spacing:.26em;color:var(--chi-blue)}
.cup-kicker b{color:#fff}
.cup-kicker .nx{color:var(--gold)}

/* the bracket: four plates, left to right, with the run of play arrowed between them */
.cup-bracket{display:grid;grid-template-columns:repeat(4,1fr);gap:1.55em}
.cup-round{position:relative;min-width:0;padding:.6em .8em .7em;border-radius:2px;
  background:var(--panel);box-shadow:inset 0 0 0 2px var(--rule-soft)}
.cup-round::after{content:"";position:absolute;right:-1.08em;top:50%;width:0;height:0;
  border:.4em solid transparent;border-left-color:rgba(126,200,227,.5);transform:translateY(-50%)}
.cup-round:last-child::after{display:none}
.cup-round .rn{font:700 .66em/1 var(--f-ui);letter-spacing:.28em;color:var(--text-mute)}
/* two lines, always: LAKE MICHIGAN CIRCUIT will not fit on one at a quarter of the board */
.cup-round .rname{margin-top:.3em;font:400 1.24em/1.02 var(--f-display);letter-spacing:.02em;
  color:var(--text-dim);min-height:2.04em}
.cup-round .rline{margin-top:.42em;display:flex;align-items:center;gap:.42em;
  font:700 .68em/1.3 var(--f-ui);letter-spacing:.12em;color:var(--text-mute);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cup-round .rline .star6{width:.6em;height:.6em;flex:0 0 auto}
.cup-round .rline b{color:#fff;overflow:hidden;text-overflow:ellipsis}
.cup-round .rline.me{color:var(--gold)}
.cup-round.done{box-shadow:inset 0 0 0 2px var(--rule-soft),inset .26em 0 0 var(--sign-green)}
.cup-round.done .rn{color:var(--text-dim)}
.cup-round.done .rname{color:#fff}
.cup-round.next{background:var(--panel-hi);box-shadow:inset 0 0 0 2px var(--gold)}
.cup-round.next .rn,.cup-round.next .rline{color:var(--gold)}
.cup-round.next .rname{color:#fff}
.cup-round.next .rline b{color:var(--gold)}
.cup-round.later{opacity:.5}
/* the round you have just come off flashes gold once, then settles into the finished state */
.cup-round.fresh{animation:cupfresh 1.25s var(--e-out) both}
@keyframes cupfresh{
  0%{box-shadow:inset 0 0 0 2px var(--gold),0 0 1.6em rgba(255,200,87,.55)}
  100%{box-shadow:inset 0 0 0 2px var(--rule-soft),inset .26em 0 0 var(--sign-green)}}

/* the season table */
.cup-table{border-top:2px solid var(--chi-blue)}
.cup-row{display:grid;grid-template-columns:2.8em minmax(7em,1fr) repeat(4,5.6em) 3.4em 4.8em 3.4em;
  align-items:center;gap:.6em;padding:.28em .95em}
.cup-row.head{padding:.7em .95em .62em;font:700 .7em/1 var(--f-ui);letter-spacing:.2em;
  color:var(--chi-blue);text-align:center;border-bottom:1px solid var(--rule-soft)}
.cup-row.head .n{text-align:left}
.cup-row.head .rh i{display:block;margin-top:.42em;font:700 .84em/1 var(--f-ui);
  letter-spacing:.06em;color:var(--text-mute)}
.cup-row.head .rh.now,.cup-row.head .rh.now i{color:var(--gold)}
.cup-row.line{background:var(--panel);border-bottom:1px solid rgba(255,255,255,.05);
  font:700 .9em/1 var(--f-ui);letter-spacing:.08em;color:var(--text-dim);
  animation:rowin 320ms var(--e-out) both}
.cup-row.line:nth-child(3){animation-delay:55ms}  .cup-row.line:nth-child(4){animation-delay:110ms}
.cup-row.line:nth-child(5){animation-delay:165ms} .cup-row.line:nth-child(6){animation-delay:220ms}
.cup-row.line:nth-child(7){animation-delay:275ms} .cup-row.line:nth-child(8){animation-delay:330ms}
.cup-row .ps{font:400 1.6em/1 var(--f-display);color:#fff;text-align:right}
.cup-row.p1 .ps{color:var(--gold)} .cup-row.p2 .ps{color:#DDE3E8} .cup-row.p3 .ps{color:#C97B3C}
.cup-row .n{position:relative;display:flex;align-items:center;gap:.5em;min-width:0;color:#fff}
.cup-row .n b,.cup-row .n .star6{position:relative;z-index:1}
.cup-row .n b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cup-row .n .star6{width:.62em;height:.62em;flex:0 0 auto}
/* points as a bar behind the name: the shape of the championship, read without doing arithmetic */
.cup-row .n .bar{position:absolute;left:-.45em;top:50%;height:1.85em;margin-top:-.925em;
  background:rgba(126,200,227,.15);border-left:2px solid rgba(126,200,227,.45);border-radius:0 2px 2px 0}
.cup-row.you .n .bar{background:rgba(255,200,87,.18);border-left-color:var(--gold)}
.cup-cell{text-align:center;padding:.22em 0;border-radius:2px;background:rgba(255,255,255,.035)}
.cup-cell .pp{display:block;font:400 1.45em/1 var(--f-display);color:#fff}
.cup-cell .pv{display:block;margin-top:.2em;font:700 .68em/1 var(--f-ui);letter-spacing:.08em;color:var(--gold)}
.cup-cell.p1 .pp{color:var(--gold)} .cup-cell.p2 .pp{color:#DDE3E8} .cup-cell.p3 .pp{color:#C97B3C}
.cup-cell.none{font:700 1.1em/1.55 var(--f-ui);color:var(--text-mute)}
.cup-cell.now{background:rgba(255,200,87,.09)}
.cup-wins{text-align:center;font:700 .9em/1 var(--f-num);font-variant-numeric:tabular-nums;color:var(--text-dim)}
.cup-wins.has{color:var(--gold)}
.cup-tot{text-align:right}
.cup-tot b{font:400 1.85em/1 var(--f-num);font-variant-numeric:tabular-nums;color:#fff}
.cup-tot i{display:block;margin-top:.18em;font:700 .64em/1 var(--f-ui);letter-spacing:.1em;color:var(--text-mute)}
.cup-row.p1 .cup-tot b{color:var(--gold)}
.cup-row.p1 .cup-tot i{color:var(--chi-blue)}
.cup-mv{text-align:center;font:700 .84em/1 var(--f-num);font-variant-numeric:tabular-nums;color:var(--text-mute)}
.cup-mv.up{color:#3ED17E} .cup-mv.dn{color:var(--chi-red)}
.cup-row.you{background:rgba(255,200,87,.11);box-shadow:inset .3em 0 0 var(--gold);color:#fff}

/* champion */
.cup-champ{width:min(100%,34em);align-self:center;text-align:center;padding:.85em 1.4em .95em;border-radius:2px;
  background:linear-gradient(180deg,rgba(255,200,87,.20),rgba(255,200,87,.05)),var(--panel-hi);
  box-shadow:inset 0 0 0 2px var(--gold);animation:champin 700ms var(--e-pop) both}
@keyframes champin{from{transform:scale(.88);opacity:0}to{transform:none;opacity:1}}
.cup-champ .band{display:flex;align-items:center;justify-content:center;gap:1em;
  font:700 .76em/1 var(--f-ui);letter-spacing:.42em;color:var(--gold);text-indent:.42em}
.cup-champ .band .star6{width:.8em;height:.8em;background:var(--gold)}
.cup-champ .who{margin-top:.3em;font:400 3.3em/1 var(--f-display);letter-spacing:.03em;color:#fff;
  text-shadow:0 .04em .3em rgba(0,0,0,.6)}
.cup-champ .sub{margin-top:.35em;font:700 .72em/1 var(--f-ui);letter-spacing:.2em;color:var(--text-dim)}
.cup-champ .run{margin-top:.65em;display:flex;justify-content:center;gap:.5em}
.cup-champ .run span{font:700 .66em/1 var(--f-ui);letter-spacing:.14em;color:var(--text-dim);
  background:rgba(4,18,27,.5);padding:.55em .85em;border-radius:2px;box-shadow:inset 0 0 0 1px var(--rule-soft)}
.cup-champ .run b{color:#fff;margin-left:.35em}
.cup-champ .run span.w{color:var(--gold);box-shadow:inset 0 0 0 1px rgba(255,200,87,.55)}
.cup-champ .run span.w b{color:var(--gold)}
.cup-champ .sub2{margin-top:.5em;font:700 .72em/1 var(--f-ui);letter-spacing:.2em;color:var(--chi-blue)}
.cup-champ.mine{box-shadow:inset 0 0 0 2px var(--gold),0 0 2.4em rgba(255,200,87,.30)}

/* call to action */
.cup-cta{display:flex;flex-direction:column;align-items:center;gap:.4em;margin-top:.1em}
.cup-cta .menu-item{min-width:26em;box-sizing:border-box;font:700 .98em/1 var(--f-ui);
  letter-spacing:.22em;padding:.62em 2.2em}
.cup-cta .menu-item.primary{font:700 1.42em/1 var(--f-ui);letter-spacing:.18em;padding:.58em 2.2em;
  box-shadow:inset 0 0 0 2px var(--gold)}
.cup-cta .menu-item.primary.sel{box-shadow:inset 0 0 0 2px #fff,0 .3em 1.2em rgba(0,105,62,.45)}
@media (hover:hover){.cup-cta .menu-item.primary:hover{
  box-shadow:inset 0 0 0 2px #fff,0 .3em 1.2em rgba(0,105,62,.45)}}
.cup-note{margin-top:.4em;text-align:center;font:700 .7em/1.7 var(--f-ui);letter-spacing:.18em;
  color:var(--text-dim)}

/* ----------------------------------------------------------------- pause ---*/
#menu.paused::before{content:"";position:absolute;inset:0;z-index:-1;backdrop-filter:blur(6px) saturate(.55);
  background:rgba(4,18,27,.55)}
#menu.paused::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.045;
  background:linear-gradient(180deg,transparent 0 16.6%,var(--chi-blue) 16.6% 33.3%,
    transparent 33.3% 66.6%,var(--chi-blue) 66.6% 83.3%,transparent 83.3%)}
#pause-flag{position:absolute;inset:0;pointer-events:none;z-index:-1}
#pause-flag .star6{position:absolute;top:50%;width:6em;height:6em;margin-top:-3em;margin-left:-3em;opacity:.05}
#vol-panel{margin-top:1.6em;display:flex;flex-direction:column;gap:.5em;min-width:20em;
  font:700 .72em/1 var(--f-ui);letter-spacing:.2em;color:var(--text-dim)}
#vol-panel label{display:flex;align-items:center;gap:.9em;transition:opacity var(--t-std) var(--e-out)}
#vol-panel input[type=range]{flex:1;pointer-events:auto;accent-color:var(--chi-blue);height:2px}
/* the faders mean nothing until sound is on — say so instead of letting them look broken */
#vol-panel.muted label{opacity:.42}

/* ------------------------------------------------------------- sound control */
/* The game boots SILENT, so this is the one control a first-time player must not be able to miss:
   a fixed plate above every screen, flag red and breathing while it is off, quiet once it is on. */
#sound-chip,.sound-row,.opt-row{display:flex;align-items:center;gap:.7em;cursor:pointer;pointer-events:auto;
  font:700 .74em/1 var(--f-ui);letter-spacing:.2em;border:0;border-radius:2px;
  padding:.62em .95em;background:var(--panel-hi);color:var(--text-dim);
  box-shadow:inset 0 0 0 2px var(--rule-soft);
  transition:background var(--t-std) var(--e-out),box-shadow var(--t-std) var(--e-out),
             color var(--t-std) var(--e-out),transform var(--t-micro) var(--e-out)}
#sound-chip{position:fixed;top:1.15em;right:1.25em;z-index:30;font-size:13px}
#sound-chip.hidden{display:none}
.sound-row{margin-top:1.5em;justify-content:center}
@media (hover:hover){#sound-chip:hover,.sound-row:hover,.opt-row:hover{
  transform:translateY(-.1em);box-shadow:inset 0 0 0 2px var(--rule)}}
#sound-chip b,.sound-row b,.opt-row b{color:var(--text);font-weight:700}
#sound-chip i,.sound-row i,.opt-row i{font-style:normal;font-size:.85em;letter-spacing:.16em;color:var(--text-mute);
  padding:.32em .5em;border-radius:2px;box-shadow:inset 0 0 0 1px var(--rule-soft)}
#sound-chip svg,.sound-row svg,.opt-row svg{width:1.35em;height:1.35em;flex:0 0 auto;fill:currentColor;
  stroke:currentColor;stroke-width:1.7;stroke-linecap:round;color:var(--chi-blue)}
#sound-chip svg .w,.sound-row svg .w,.opt-row svg .w{fill:none}
#sound-chip svg .x,.sound-row svg .x,.opt-row svg .x{display:none;fill:none}
/* muted: the whole plate goes flag red, the waves become a cross, and it breathes once a second */
#sound-chip.off,.sound-row.off{background:var(--chi-red);color:#fff;
  box-shadow:inset 0 0 0 2px #fff,0 .25em 1.2em rgba(239,51,64,.45);animation:sndbeat 1.9s ease-in-out infinite}
#sound-chip.off b,.sound-row.off b{color:#fff}
#sound-chip.off i,.sound-row.off i{color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.65)}
#sound-chip.off svg,.sound-row.off svg{color:#fff}
#sound-chip.off svg .w,.sound-row.off svg .w{display:none}
#sound-chip.off svg .x,.sound-row.off svg .x{display:inline}
@keyframes sndbeat{0%,100%{box-shadow:inset 0 0 0 2px #fff,0 .25em 1.2em rgba(239,51,64,.40)}
                   50%{box-shadow:inset 0 0 0 2px #fff,0 .25em 1.9em rgba(239,51,64,.85)}}
@media (prefers-reduced-motion:reduce){#sound-chip.off,.sound-row.off{animation:none}}

/* ------------------------------------------------------------ option switch */
/* The power-up switch sits BESIDE the sound plate, never instead of it: flag red on this screen
   means one thing only — the game is silent — so a switched-off option goes quiet and grey. */
#switches{display:flex;align-items:center;justify-content:center;gap:.6em;flex-wrap:wrap;margin-top:1.5em}
#switches .sound-row,#switches .opt-row{margin-top:0}
.opt-row svg{color:var(--gold)}
.opt-row.off{color:var(--text-mute);box-shadow:inset 0 0 0 2px rgba(126,200,227,.10)}
.opt-row.off b{color:var(--text-mute)}
.opt-row.off svg{color:var(--text-mute)}
.opt-row.off svg .x{display:inline}
#vol-panel .opt-row{margin-top:.2em;justify-content:center}

/* ------------------------------------------------- rotate to landscape (phone) */
/* The game is a landscape game: the river runs across the frame and the thumbs drive from the two
   bottom corners. A portrait phone gets this instead of a broken layout. z-index 200 clears
   #loading (100), #fade (50), #net-ui (60) and the sound chip (30). */
#rr-rotate{position:fixed;inset:0;z-index:200;display:none;flex-direction:column;align-items:center;
  justify-content:center;gap:1.1em;text-align:center;background:var(--ink-900);
  padding:calc(2em + var(--sat)) calc(1.6em + var(--sar)) calc(2em + var(--sab)) calc(1.6em + var(--sal))}
#rr-rotate .phone{width:3.2em;height:5.6em;border-radius:.5em;box-shadow:inset 0 0 0 3px var(--chi-blue);
  animation:rotturn 2.6s var(--e-out) infinite}
#rr-rotate .phone i{display:block;width:34%;height:3px;margin:.45em auto 0;border-radius:2px;
  background:var(--chi-blue);opacity:.7}
@keyframes rotturn{0%,26%{transform:rotate(0)}62%,100%{transform:rotate(-90deg)}}
#rr-rotate h2{font:400 2.3em/1 var(--f-display);letter-spacing:.03em;color:#fff}
#rr-rotate p{font:700 .8em/1.7 var(--f-ui);letter-spacing:.22em;color:var(--chi-blue)}
#rr-rotate .crest{display:flex;gap:1.1em}
#rr-rotate .crest .star6{width:.85em;height:.85em}
@media (orientation:portrait) and (max-width:620px){#rr-rotate{display:flex;font-size:16px}}

/* --------------------------------------------------------------- loading ---*/
#loading{background:var(--ink-900)}
#loading #load-title{font:400 2.4em/1 var(--f-display)!important;letter-spacing:.04em!important;color:#fff}
#loading .bar{width:22em;height:2px;border-radius:0;background:rgba(126,200,227,.18);position:relative}
#loading .fill{background:var(--chi-blue);box-shadow:3px 0 0 var(--gold)}
#loading .msg{font:700 .72em/1 var(--f-ui);letter-spacing:.34em;color:var(--chi-blue)}
#load-stars{display:flex;gap:1.1em}
#load-stars .star6{width:.7em;height:.7em;opacity:.55}

/* ======================================================== A PHONE, LANDSCAPE ==*/
/* 844x390. Every max-width breakpoint above already fired — 844 is "narrow" — and none of them
   noticed that the axis in short supply is the 390px HEIGHT. Two things change here, and the
   second matters more than the first: the type scales off the SHORT axis, and the layout moves.
   The desktop HUD hangs its heaviest furniture in the four corners; on a phone the two BOTTOM
   corners are where the thumbs live (they are steering the boat), the notch eats one end of the
   long edge and the home indicator the bottom. So everything climbs into the top third and the
   two lower corners are left empty. Nothing here is a shrink of the desktop layout. */
@media (max-height:500px){
  #hud{font-size:clamp(8.5px,2.72vh,12px)}

  /* TOP LEFT — the plate and the blade lie down side by side instead of stacking */
  #race-info{left:calc(1em + var(--sal));top:calc(.7em + var(--sat));
    flex-direction:row;align-items:center;gap:.45em}
  #pos-plate{width:3.6em;height:3.6em}
  #pos-big{font-size:2.5em}
  #pos-suffix{font-size:.75em;margin-top:.42em}
  #pos-total{right:.42em;bottom:.30em;font-size:.52em}
  #lap-line{font-size:.66em;padding:.5em .7em;letter-spacing:.14em}

  /* LEFT, under it — the dial loses its speed arc and its ticks and becomes what a phone player
     actually needs from it: the boost ring, with the number in the middle of it. Both were
     three-pixel hairlines at this size, and the bottom-right corner they used to live in is now
     somebody's thumb. */
  #speedo{left:calc(1em + var(--sal));right:auto;top:calc(4.6em + var(--sat));bottom:auto;
    width:6em;height:6em;text-align:center}
  #spd-arc,#spd-ticks{display:none}
  #spd-boost{left:0;top:0;right:auto;bottom:auto;width:100%;height:100%}
  #speed-num{left:0;right:auto;top:26%;bottom:auto;width:100%;font-size:2.05em;text-align:center}
  #speed-unit{left:0;right:auto;top:62%;bottom:auto;width:100%;font-size:.55em;
    letter-spacing:.24em;text-indent:.24em;text-align:center}
  #boost-legend{left:0;right:auto;bottom:-1.1em;width:100%;transform:none}
  #boost-label{font-size:.52em} #prime{margin-bottom:.2em;font-size:.54em}

  /* TOP CENTRE — one line of clock, the gaps tucked straight under it */
  #timer{top:calc(.6em + var(--sat));padding:.35em .95em .4em}
  #timer small{font-size:.5em;letter-spacing:.24em;margin-bottom:.14em}
  #timer-num{font-size:1.55em}
  #delta{margin-top:.18em;font-size:.8em}
  /* 6.2em of THIS element's own .66em type = 4.1em of the HUD's, which clears the timer plate.
     The em trap the timer offsets document, one more time. */
  #gaps{top:calc(6.2em + var(--sat));font-size:.66em;gap:.9em}
  /* the torpedo call comes off the right edge and onto the centre line, where the eye already is */
  #incoming{left:50%;right:auto;top:8.6em;bottom:auto;transform:translate(-50%,-.7em)}
  #incoming.on{transform:translate(-50%,0)}

  /* TOP RIGHT — the map was 143x191 here, a fifth of the screen. 85x113 is a map; that was a wall */
  #minimap{right:calc(.8em + var(--sar));top:calc(.7em + var(--sat));width:8em;height:10.67em}
  /* the chips move under it: their old home is inside the right thumb's reach */
  #chips{right:calc(.8em + var(--sar));top:calc(11.9em + var(--sat));bottom:auto;align-items:flex-end}
  .chip{font-size:.62em;padding:.4em .7em}

  /* BOTTOM CENTRE — the one strip of the bottom edge that no thumb covers. The socket keeps its
     well, its brackets and its blade; the header rail, the key rail (there is no key) and the
     blurb line go, because 390px of screen cannot afford a caption. */
  #item-slot{bottom:calc(.35em + var(--sab))}
  #item-box{width:4.6em;height:4.6em}
  #item-head,#item-foot,#item-sub{display:none}
  #item-well{left:6%;right:6%;top:6%;bottom:6%}
  #item-name{margin-top:.4em;min-width:0;font-size:.6em;padding:.42em .7em;
    letter-spacing:.14em;text-indent:.14em}
  #item-pips{margin-top:.28em;min-height:1.1em;gap:.25em}
  .pip{font-size:.52em;padding:.3em .45em .26em}
  /* 6.6em of this element's own 1.5em type = 9.9em of the HUD's: clear of the socket below it,
     and narrow enough to stay out of the right-hand button stack */
  #item-call{font-size:1.5em;bottom:6.6em;max-width:56vw}

  /* the rival ticker is the gap line's own information in longer words: the gap line stays */
  #ticker{display:none}
  /* The landmark blade, squeezed into the last free band on the left: the steering pad claims
     everything below 62% of the height, so the blade sits above it and gives up its architect
     line to do so — the NAME is the callout, the credit was always the footnote.
     font-size FIRST: index.html pins this element at 15px and nothing above resets it, so without
     that line every em offset here would resolve against 15px and the blade would land 60px low. */
  #landmark-tag{font-size:1em;left:calc(1em + var(--sal));top:calc(12.2em + var(--sat));
    bottom:auto;max-width:17em}
  #lt-name{font-size:1em} #lt-blade{padding:.4em .8em} #lt-sub{display:none}
  #docent{left:50%;right:auto;bottom:calc(.5em + var(--sab));transform:translateX(-50%);
    max-width:80vw;font-size:.68em;line-height:1.45;padding:.6em .9em}
  #docent h4{font-size:1.4em}

  /* the celebration furniture, sized to the short axis */
  #countdown{top:38%} #cd-num{font-size:8.6em} #cd-star{width:8.4em;height:8.4em;margin:-4.2em 0 0 -4.2em}
  #placement-big{font-size:7.4em} #placement-sub{font-size:1em;letter-spacing:.34em}
  #placement .stars{margin-top:.6em;gap:.7em}
  #wrongway{font-size:2em} #checkpoint-flash{font-size:1.5em}
  #cine .bar{height:8vh}

  /* ---------------------------------------------------------------- menus ---*/
  /* Nothing may be clipped by a 390px viewport, and a screen that cannot fit scrolls rather than
     hiding its own BACK button. A "safe" centre keeps a short screen centred without letting a
     tall one lose its top edge to the centring. */
  #menu{font-size:min(11.5px,3vh);overflow-y:auto;overscroll-behavior:contain;
    justify-content:center;justify-content:safe center;
    padding:calc(.5em + var(--sat)) calc(.6em + var(--sar)) calc(.5em + var(--sab)) calc(.6em + var(--sal))}
  #select-title{font-size:1.65em;margin-bottom:.15em}
  #select-sub{font-size:.66em;padding:.4em .9em;margin-bottom:.9em}
  .menu-list{margin-top:1.1em;min-width:16em;gap:.34em}
  .menu-item{font-size:1em;padding:.55em 1.4em}
  .menu-note{margin-top:.8em;font-size:.66em;line-height:1.6}
  .help-note{font-size:11px;max-width:96vw;margin-top:.3em}
  .help-row{margin-top:.6em}

  /* the title: a landscape screen is two columns, not one long one, so the list gets the height */
  #menu.title-screen{display:grid;align-content:center;align-content:safe center;justify-content:center;
    justify-items:center;grid-template-columns:auto minmax(13em,20em);gap:.3em 2.2em;font-size:11px;
    padding:calc(.5em + var(--sat)) calc(.6em + var(--sar)) calc(.5em + var(--sab)) calc(.6em + var(--sal))}
  #menu.title-screen .stars{grid-column:1;grid-row:1;margin:0;gap:1.2em}
  #menu.title-screen .starcol{width:auto;gap:0}
  #menu.title-screen .starcol span{display:none}
  #menu.title-screen .starcol .star6{width:1.3em;height:1.3em}
  #menu.title-screen #title{grid-column:1;grid-row:2;font-size:min(9.6vh,42px)}
  #menu.title-screen #subtitle{grid-column:1;grid-row:3;font-size:.82em;letter-spacing:.3em;
    text-indent:.3em;margin-top:.5em}
  #menu.title-screen #switches{grid-column:1;grid-row:4;margin-top:1em;gap:.5em}
  #menu.title-screen .menu-list{grid-column:2;grid-row:1/5;align-self:center;
    margin:0;width:100%;max-width:none;gap:.3em}
  /* eight rows once a championship is running: 44px each would not fit, and a row this wide is
     a comfortable target at 38 */
  #menu.title-screen .menu-item{padding:.5em 1em;font-size:1em;min-height:38px}
  #menu.title-screen .menu-note{display:none}

  /* the showroom: plate top-left, hulls along the foot, the boat itself in the clear middle.
     Both offsets are pre-divided by the element's OWN type, per the em trap: .52em of the title's
     1.5em and 4.63em of the sub's .62em are 9px and 33px of an 11.5px menu. The display face
     overshoots its line box by half a line, so a title parked at its own em height loses its caps
     off the top of the screen. */
  #menu.showroom #select-title{top:calc(.52em + var(--sat));font-size:1.5em}
  #menu.showroom #select-sub{top:calc(4.63em + var(--sat));font-size:.62em}
  #ride-panel{left:calc(.6em + var(--sal));top:calc(5.2em + var(--sat));transform:none;
    width:12.6em;padding:.6em .75em}
  #ride-panel h3{font-size:1.25em;margin:.1em 0 .3em}
  #ride-panel .desc{font-size:.66em;line-height:1.45}
  #radar{width:8em;height:8em;margin:.2em auto}
  #spec-sheet{display:none}
  #livery{gap:.4em;margin-top:.5em;flex-wrap:wrap}
  #cards{gap:.6em}
  .card{width:11.6em;padding:.55em}
  .card canvas{height:4.6em}
  .card .desc{min-height:0;font-size:.64em;line-height:1.4}
  #cards.dock{bottom:calc(.4em + var(--sab));gap:.5em;max-width:100vw}
  #cards.dock .card{width:6.1em;padding:.4em .45em}
  #cards.dock .card canvas{height:3.4em}
  #cards.dock .card h3{font-size:.8em;min-height:2.2em}

  /* results: the HULL column is the first thing to go — it is the one cell nobody reads twice */
  #results-list{min-width:0;width:min(96vw,42em);margin-top:.4em}
  .result-head .h,.result-row .h{display:none}
  .result-head,.result-row{grid-template-columns:3em 1fr 5em 4.4em;gap:.7em;padding:.34em .8em}
  .result-head.cup,.result-row.cup{grid-template-columns:3em 1fr 5em 4.4em 2.8em}
  .result-head{letter-spacing:.14em}
  .result-row{font-size:.8em}
  .result-row .p{font-size:1.35em}
  #medal-strip{margin:.5em 0 .1em;padding:.5em 1.1em;font-size:.7em}
  #record-banner{margin:.5em 0;padding:.5em 1em;font-size:.8em;letter-spacing:.2em}

  /* the championship board: the bracket says what the table already says, and the table is the
     one that carries the whole season */
  #cup-board{width:min(97vw,60em);gap:.5em;font-size:min(10.5px,2.8vh)}
  .cup-bracket{display:none}
  .cup-title{font-size:2.1em} .cup-crest{margin-bottom:.3em} .cup-crest .star6{width:.62em;height:.62em}
  .cup-kicker{margin-top:.5em;font-size:.72em}
  .cup-row{grid-template-columns:3em minmax(5em,1fr) repeat(4,3.6em) 3em 3.6em 2.4em;
    gap:.5em;padding:.16em .6em}
  .cup-row.head{padding:.45em .6em .4em;font-size:.62em;letter-spacing:.1em}
  .cup-row.head .rh i{margin-top:.3em}
  .cup-row.line{font-size:.78em}
  .cup-cell{padding:.16em 0}
  .cup-cell .pp{font-size:1.2em} .cup-cell .pv{font-size:.6em}
  .cup-tot b{font-size:1.5em} .cup-tot i{font-size:.58em}
  .cup-champ{padding:.6em 1em .7em} .cup-champ .who{font-size:2.4em}
  .cup-cta{gap:.28em}
  .cup-cta .menu-item{min-width:0;min-height:36px;width:min(90vw,30em);font-size:.86em;padding:.4em 1.2em}
  .cup-cta .menu-item.primary{font-size:1.05em;padding:.4em 1.2em}
  .cup-note{margin-top:.25em;font-size:.62em}

  /* pause: the volume panel stays (it is the only mixer there is), the key legend goes */
  #vol-panel{margin-top:.9em;min-width:15em;gap:.4em;font-size:.66em}
  #pause-flag .star6{width:4em;height:4em;margin-top:-2em;margin-left:-2em}
  #sound-chip{top:calc(.55em + var(--sat));right:calc(.55em + var(--sar))}
}

/* ============================================================ TOUCH INPUT ====*/
/* Not a size question — a finger question, and an iPad answers yes to it as well as a phone.
   Anything you have to hit is at least 44px on its shortest side, nothing is reachable by hover
   alone, and no legend promises a key that this device does not have.
   The two defaults come FIRST: a media query adds no specificity, so a plain rule written after
   one simply beats it. */
.t-hint{display:none}
.back-chip{position:fixed;left:calc(.7em + var(--sal));top:calc(.7em + var(--sat));z-index:31;
  display:none;align-items:center;justify-content:center;gap:.5em;min-height:44px;padding:.7em 1.1em;
  border:0;border-radius:2px;background:var(--panel-hi);box-shadow:inset 0 0 0 2px var(--rule-soft);
  color:var(--text-dim);font:700 13px/1 var(--f-ui);letter-spacing:.2em;cursor:pointer;
  pointer-events:auto}
@media (hover:none) and (pointer:coarse){
  .menu-item{display:flex;align-items:center;justify-content:center;min-height:44px;
    padding-top:.5em;padding-bottom:.5em}
  #sound-chip,.sound-row,.opt-row{min-height:44px;box-sizing:border-box;padding:.7em 1em}
  #sound-chip{font-size:15px}
  /* "PRESS M" on a device with no M */
  #sound-chip i,.sound-row i,.opt-row i{display:none}
  #livery i{width:2.2em;height:2.2em}
  #vol-panel input[type=range]{height:40px}
  /* the key wall is a keyboard legend; the controls are on the glass */
  #boost-hint{display:none}
  /* …and so is the gold E on the item box, which promises a key this device does not have. The
     word beside it stays: the foot then reads FIRE, which is what the pad on the glass says too.
     Written after the rule that shows it and at the same specificity, so this simply wins. */
  #item-slot.held #item-key{display:none}
  .k-hint{display:none}
  .t-hint{display:inline}
  .t-hint.b{display:block}
  /* BKSP is how every picker went back, and there is no BKSP. A chip in the corner instead. */
  .back-chip{display:flex}
}
`;

  K.init = function () {
    if (K._on) return;
    K._on = true;
    const s = document.createElement('style');
    s.id = 'rr-ui';
    s.textContent = K.css;
    (document.head || document.documentElement).appendChild(s);
    mountRotate();
  };

  // The rotate prompt is pure CSS state — one media query shows it — but the markup has to exist
  // before the first portrait frame, which is why it goes up with the stylesheet rather than
  // waiting for a menu. index.html is not ours to edit, so it is built here.
  const ROTATE = '<div class="phone"><i></i></div><h2>ROTATE YOUR DEVICE</h2>' +
    '<p>RIVER RACER RUNS IN LANDSCAPE</p>' +
    '<div class="crest"><i class="star6"></i><i class="star6"></i><i class="star6"></i><i class="star6"></i></div>';
  function mountRotate() {
    if (document.getElementById('rr-rotate')) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', mountRotate, { once: true }); return; }
    const d = document.createElement('div');
    d.id = 'rr-rotate';
    d.innerHTML = ROTATE;
    document.body.appendChild(d);
  }

  // hexagram path shared by the minimap and every canvas card. Same geometry as the CSS clip-path.
  K.star6 = function (ctx, cx, cy, R, rot) {
    const r = R / Math.sqrt(3);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (rot || 0) + Math.PI / 2 - i * Math.PI / 6, rad = i % 2 ? r : R;
      const x = cx + Math.cos(a) * rad, y = cy - Math.sin(a) * rad;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  };

  K.init();

  RR.UIKit = K;
})();
